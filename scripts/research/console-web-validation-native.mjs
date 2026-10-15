// Installed research helper in disposable browsers; all provider fetches mocked.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from '../../tests/native-protocol.mjs';
import {runtimeZip} from '../release.mjs';
const firefox=process.argv.includes('--firefox');
const root=new URL('./console-web-validation/',import.meta.url),files=new Map();
for(const name of ['manifest.json','core.js','probe.js','panel.js'])files.set(name,await readFile(new URL(name,root)));
const server=createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html><body><h1>Synthetic provider library</h1><button id="fixture">Observe two pages</button><script>document.querySelector("#fixture").onclick=async()=>{await window.fixtureFetch(0);await window.fixtureFetch(2);};</script></body></html>');
});await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));
for(const entry of manifest.content_scripts)entry.matches=['http://127.0.0.1/*'];
manifest.content_scripts[0].js.unshift('fixture.js');
if(!firefox)delete manifest.browser_specific_settings;
files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
// Only the origin classifier is adapted to a synthetic loopback website. The
// installed MAIN/isolated scripts, collector, messaging and UI are otherwise real.
files.set('core.js',Buffer.from(files.get('core.js').toString().replace('function providerForLocation(location){',`function providerForLocation(location){if(location.origin===${JSON.stringify(origin)})return location.pathname==='/ps'?'playstation':'nintendo';`)));
files.set('fixture.js',Buffer.from(`
  window.fetch=(input,options)=>{
    const ps=location.pathname==='/ps',u=new URL(input),v=ps?JSON.parse(u.searchParams.get('variables')):JSON.parse(options.body).variables,offset=v.start??v.offset;
    const rows=offset===0?[{id:'private-one',productId:'private-p1',applicationId:'private-s1',name:'Private title',isLending:false},{id:'private-two',productId:'private-p2',applicationId:'private-s2'}]:[{id:'private-three',productId:'private-p3',applicationId:'private-s3'}];
    const body=ps?{data:{purchasedTitlesRetrieve:{games:rows,pageInfo:{offset,size:rows.length,isLast:offset===2}}}}:{data:{account:{vgc:{vgcViews:{views:rows,offsetInfo:{offset,total:3}}}}}};
    return Promise.resolve(new Response(JSON.stringify(body),{status:200}));
  };
  window.fixtureFetch=offset=>location.pathname==='/ps'?fetch('https://web.np.playstation.com/api/graphql/v1/op?'+new URLSearchParams({operationName:'getPurchasedGameList',variables:JSON.stringify({start:offset,size:2})})):
    fetch('https://api.ec.nintendo.com/public/graphql',{method:'POST',body:JSON.stringify({operationName:'getVgcs',query:'query getVgcs { account { vgc { vgcViews { views { id } } } } }',variables:{offset,limit:2,idToken:'private-token'}})});
`));
const temporary=await mkdtemp(join(tmpdir(),'gl-console-helper-'));let child,driver,session,exited;
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files)await writeFile(join(stage,name),bytes);
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){
    const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();
    if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));
  }
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}
  if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  const port=firefox?await freePort():0;
  if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});
  driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox){await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});const archive=join(temporary,'helper.zip');await writeFile(archive,runtimeZip(files));await driver.send('Addon:Install',{path:archive,temporary:true});}
  else await driver.send('Extensions.loadUnpacked',{path:stage});
  async function evaluate(script){
    if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],newSandbox:false});const value=r.value??r;assert(!value?.error,value?.error);return value;}
    const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  for(const route of ['/ps','/nintendo']){
    if(firefox)await driver.send('WebDriver:Navigate',{url:origin+route});
    else {const target=await driver.send('Target.createTarget',{url:origin+route});session=(await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);}
    let ready=false;for(let i=0;i<60;i++){if(await evaluate('return !!document.querySelector("#gl-console-validation")?.shadowRoot?.querySelector("textarea");')){ready=true;break;}await pause(100);}assert(ready,'Installed helper did not render.');
    await evaluate('document.querySelector("#fixture").click();return true;');
    let report;
    for(let i=0;i<60;i++){
      report=await evaluate('const s=document.querySelector("#gl-console-validation").shadowRoot;s.querySelector("[data-action=report]").click();await new Promise(r=>setTimeout(r,20));return JSON.parse(s.querySelector("textarea").value||"null");');
      if(report?.scopes[0]?.rows===3)break;await pause(100);
    }
    assert.equal(report.scopes[0].rows,3);assert.equal(report.scopes[0].distinctRowIds,3);assert.equal(report.scopes[0].observedScopeTraversal,'terminal-range-observed');assert(!JSON.stringify(report).includes('private'));
    const stopped=await evaluate('const s=document.querySelector("#gl-console-validation").shadowRoot;s.querySelector("[data-action=stop]").click();await new Promise(r=>setTimeout(r,20));return {report:JSON.parse(s.querySelector("textarea").value),text:s.querySelector("[role=status]").textContent,visible:document.querySelector("#gl-console-validation").getBoundingClientRect().width>0};');
    assert.equal(stopped.report.active,false);assert(stopped.visible);assert.match(stopped.text,/stopped/);
    console.log('PASS '+(firefox?'Firefox':'Chrome')+' installed helper '+route+': MAIN/isolated handoff, paging, redacted summary, visible controls and Stop.');
  }
}finally{
  if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}
  child?.kill();driver?.close?.();if(exited)await exited;
  await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-console-helper-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
