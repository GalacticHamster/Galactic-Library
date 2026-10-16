// Install the packaged Xbox importer with synthetic page-owned requests only.
import assert from 'node:assert/strict';
import {installXboxFixture} from './xbox-source-fixture.js';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
const firefox=process.argv.includes('--firefox'),release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><button id="load" onclick="loadPurchases()">Load synthetic purchases</button></body></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>pattern==='https://play.xbox.com/library*'?'http://127.0.0.1/*':pattern);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
for(const path of ['src/providers/xbox-capture.js','src/providers/xbox-content.js','src/background/service-worker.js'])files.set(path,Buffer.from(files.get(path).toString().replaceAll("'https://play.xbox.com'",JSON.stringify(origin))));
files.set('src/providers/xbox-capture.js',Buffer.from('('+installXboxFixture.toString()+')(globalThis);window.fixtureRequests=0;window.fetch=()=>{window.fixtureRequests++;throw Error(\"No source network allowed\");};fixtureXbox.get(\"profile\").status=\"pending\";\n'+files.get('src/providers/xbox-capture.js').toString()));
files.set('src/providers/xbox-content.js',Buffer.from(files.get('src/providers/xbox-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`
import {createBackup,parseBackup} from './src/lib/storage.js';
try {const r=await chrome.runtime.sendMessage({type:'LIBRARY_STORAGE_OPERATION',operation:'getDatabase',args:[]});if(!r.ok)throw Error(r.error);const d=r.result,items=Object.values(d.providerItems),p=d.providerProfiles[d.providers.xbox.activeProfileId];
 const restored=parseBackup(createBackup(d));document.documentElement.dataset.result=JSON.stringify({records:items.length,owned:items.filter(i=>i.ownership==='owned').length,unknown:items.filter(i=>i.ownership==='unknown').length,subscriptions:items.filter(i=>i.ownership==='subscription').length,refs:new Set(items.map(i=>i.recordRef)).size,history:Object.keys(d.providerHistory).length,source:items[0].metadata.source,binding:p.sourceAccountFingerprint.length,roundTrip:JSON.stringify(restored)===JSON.stringify(d),snapshot:d.providers.xbox.snapshotValidation.itemCount,metadata:items[0].metadata,acquiredAt:items[0].acquiredAt,platform:items[0].platform});
}catch(error){document.documentElement.dataset.result=JSON.stringify({error:error.message});}`));
const temporary=await mkdtemp(join(tmpdir(),'gl-xbox-native-'));let child,driver,session,exited;
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox){await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});const archive=join(temporary,'extension.zip');await writeFile(archive,runtimeZip(files));await driver.send('Addon:Install',{path:archive,temporary:true});
    await driver.send('Marionette:SetContext',{value:'chrome'});
    const granted=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");ExtensionPermissions.add(arguments[0],{permissions:[],origins:["http://127.0.0.1/*"]},WebExtensionPolicy.getByID(arguments[0]).extension).then(()=>done(true),error=>done({error:error.message}));',args:['galactic-library@galactichamster.com'],newSandbox:true});assert.equal(granted.value??granted,true);
    await driver.send('Marionette:SetContext',{value:'content'});
  }else await driver.send('Extensions.loadUnpacked',{path:stage});
  async function evaluate(script){
    if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],newSandbox:false});const value=Object.hasOwn(r,'value')?r.value:r;assert(!value?.error,value?.error);return value;}
    const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  async function navigate(url){if(firefox)await driver.send('WebDriver:Navigate',{url});else{const t=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);}}
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-xbox-importer")?.shadowRoot?.querySelector("[data-import-status]")?.textContent};');throw Error(message+' '+JSON.stringify(state));}
  await navigate(origin+'/library');await wait('return !!document.querySelector("#galactic-library-xbox-importer")?.shadowRoot?.querySelector("[data-profile-label]");','Xbox panel missing');
  const root='document.querySelector("#galactic-library-xbox-importer").shadowRoot';
  await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Personal';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;s.querySelector('[data-mode=full]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&/finish loading/.test(s.querySelector('[data-import-status]').textContent);`,'Unloaded purchases were not rejected');
  await evaluate('fixtureXbox.get("profile").status="success";return true;');
  for(const mode of ['full','incremental']){
    await evaluate(`const s=${root};s.querySelector('[data-mode=${mode}]').click();return true;`);
    await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&s.querySelector('[data-import-status]').textContent.includes('Saved 37 checked titles');`,'Complete import/quick update did not commit');
  }
  await evaluate('fixtureXbox.get("catalogs").value[0].totalCount=38;return true;');await evaluate(`const s=${root};s.querySelector('[data-mode=full]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&/catalog total/.test(s.querySelector('[data-import-status]').textContent);`,'Mismatched catalog was not blocked');
  await evaluate('fixtureXbox.rows.splice(36,1);fixtureXbox.get("catalogs").value[0].totalCount=36;return true;');await evaluate(`const s=${root};s.querySelector('[data-mode=full]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&s.querySelector('[data-import-status]').textContent.includes('Saved 36 checked titles');`,'Additive reimport did not finish');
  await evaluate('fixtureXbox.get("active").value="private-other";return true;');await evaluate(`const s=${root};s.querySelector('[data-mode=full]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&/finish loading/.test(s.querySelector('[data-import-status]').textContent);`,'Account switch was not blocked');
  assert.equal(await evaluate('return window.fixtureRequests;'),0);
  const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');await navigate(reportUrl);
  const result=JSON.parse(await wait('return document.documentElement?.dataset.result;','Committed database report unavailable'));
  assert.equal(result.error,undefined);assert.equal(result.records,37);assert.equal(result.refs,37);assert.equal(result.owned,37);assert.equal(result.unknown,0);assert.equal(result.subscriptions,0);assert.equal(result.history,0);assert.equal(result.binding,64);assert.equal(result.roundTrip,true);assert.equal(result.snapshot,36);assert.equal(result.source,'xbox-web-library');assert.equal(result.acquiredAt,null);assert.deepEqual(result.platform,['Windows','Xbox One','Xbox Series X|S']);assert.equal(result.metadata.edition,'Deluxe Edition');assert.deepEqual(result.metadata.accessTypes,[1]);
  console.log('PASS '+(firefox?'Firefox':'Chrome')+' packaged Xbox: 40/264/37/14 source reconciliation, zero source requests, consent, 37 committed records, idempotent full/quick/additive reimport, incomplete and switched-account rejection, real worker save and backup round trip.');

}finally{
  if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-xbox-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
