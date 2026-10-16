// Installed read-only Xbox helper on a disposable synthetic website.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from '../../tests/native-protocol.mjs';
import {runtimeZip} from '../release.mjs';
const firefox=process.argv.includes('--firefox'),root=new URL('./xbox-web-validation/',import.meta.url),files=new Map();
for(const name of ['manifest.json','core.js','probe.js','panel.js'])files.set(name,await readFile(new URL(name,root)));
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body>Synthetic Xbox Owned library</body></html>');});await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=['http://127.0.0.1/*'];manifest.content_scripts[0].js.unshift('fixture.js');if(!firefox)delete manifest.browser_specific_settings;files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
for(const name of ['core.js','probe.js','panel.js'])files.set(name,Buffer.from(files.get(name).toString().replaceAll("!=='https://play.xbox.com'",'!=='+JSON.stringify(origin))));
files.set('fixture.js',Buffer.from(`
window.fixtureRequests=0;window.fetch=()=>{window.fixtureRequests++;throw Error('No network permitted');};
const data=new Map(),queries={},actor='synthetic-local';
function add(name,value,scoped=true){const key=scoped?['user',actor,name]:[name];data.set(JSON.stringify(key),{status:'success',fetchStatus:'idle',value});const q={getOptions:()=>({queryKey:key})};queries[name]=scoped?{getUserQuery:localId=>({getOptions:()=>({queryKey:['user',localId,name]})}),getActiveUserQuery:()=>({getOptions:()=>({queryKey:['user','active',name]})})}:q;}
const rows=Array.from({length:37},(_,i)=>({productId:'X'+String(i).padStart(11,'0'),providerId:'grts-catalog-provider',basicProductInfo:{title:'Synthetic private title '+i}}));
add('activeUser',actor,false);add('profile',{xuid:'1234567890123456'});add('owned',rows.map(({productId})=>({productId})));add('assembled',rows);add('catalogs',[{id:'owned',totalCount:37,previewEntries:rows.slice(0,14)}]);add('access',new Map(rows.map(r=>[r.productId,{userAccessTypes:new Set([1])}])));
window.__SW_MANAGER__={env:{queryClient:{getQueryState:key=>data.get(JSON.stringify(key)),getQueryData:key=>data.get(JSON.stringify(key))?.value},systems:{authentication:{queries:{activeUserId:queries.activeUser,userInfo:queries.profile}},library:{queries:{resolveCatalogItems:queries.owned,assembledItems:queries.assembled,resolveCatalogs:queries.catalogs}},contentAccess:{queries:{allProductAccess:queries.access}}}}};
// Match the live website shape: overview only, 40 assembled, 264 access, 37 Owned.
const access=data.get(JSON.stringify(['user',actor,'access'])).value;
for(let i=0;i<3;i++){const id='Y'+String(i).padStart(11,'0');rows.push({productId:id,providerId:i===2?'steam':'grts-catalog-provider',basicProductInfo:{title:'Synthetic excluded '+i,...(i===0?{bundleChildren:['X00000000000']}:{})}});access.set(id,{userAccessTypes:new Set(i===1?[2]:[1])});}
for(let i=0;access.size<264;i++)access.set('Z'+String(i).padStart(11,'0'),{userAccessTypes:new Set([1])});
data.delete(JSON.stringify(['user',actor,'owned']));
window.fixtureClear=()=>{data.delete(JSON.stringify(['user',actor,'catalogs']));};
`));
const temporary=await mkdtemp(join(tmpdir(),'gl-xbox-helper-'));let child,driver,session,exited;
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
    if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],newSandbox:false});const value=Object.hasOwn(r,'value')?r.value:r;assert(!value?.error,value?.error);return value;}
    const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  const url=origin+'/library';
  if(firefox)await driver.send('WebDriver:Navigate',{url});else{const target=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);}
  let report;for(let i=0;i<60;i++){
    report=await evaluate('const s=document.querySelector("#gl-xbox-web-validation")?.shadowRoot;return s?.querySelector("textarea").value?JSON.parse(s.querySelector("textarea").value):null;');
    if(report)break;await pause(100);
  }
  assert.equal(report.state,'ready');assert.equal(report.ownedRows,37);assert.equal(report.joinedTitles,37);assert.equal(report.joinedAccess,37);assert.equal(report.flags.personalOwnedFlag,37);assert.equal(report.accountScopesMatch,true);assert.equal(report.requestsMade,0);assert.equal(report.helperVersion,'0.1.2');assert.equal(report.queries.owned.keyScope,'account');assert.equal(report.ownedCatalogTotal,37);assert.equal(report.ownedCatalogPreviewRows,14);assert.equal(report.assembledRows,40);assert.equal(report.accessProducts,264);assert.equal(report.selectionSource,'reconciled-owned-catalog');assert.equal(report.selectionReconciled,true);assert.equal(report.queries.owned.state,'absent');
  for(const secret of ['synthetic-local','Synthetic private title','1234567890123456','X00000000000'])assert(!JSON.stringify(report).includes(secret));
  await evaluate('window.fixtureClear();document.querySelector("#gl-xbox-web-validation").shadowRoot.querySelector("[data-action=report]").click();return true;');await pause(100);
  const waiting=await evaluate('const s=document.querySelector("#gl-xbox-web-validation").shadowRoot;return {report:JSON.parse(s.querySelector("textarea").value),text:s.querySelector("[role=status]").textContent,calls:window.fixtureRequests};');
  assert.equal(waiting.report.state,'waiting');assert.equal(waiting.report.waitReason,'owned-view-not-cached');assert.equal(waiting.report.accountScopesMatch,true);assert.equal(waiting.report.assembledRows,40);assert.equal(waiting.report.accessProducts,264);assert.equal(waiting.report.ownedCatalogTotal,undefined);assert.equal(waiting.report.ownedRows,undefined);assert.match(waiting.text,/not cached/);assert.equal(waiting.calls,0);
  console.log('PASS '+(firefox?'Firefox':'Chrome')+' installed Xbox read-only helper: existing website cache, 40 assembled / 264 access / 37 Owned / 14 previews, redacted MAIN/isolated report, no network, missing-cache feedback.');
}finally{
  if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}
  child?.kill();driver?.close?.();if(exited)await exited;
  await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-xbox-helper-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
