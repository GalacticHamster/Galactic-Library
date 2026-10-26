// Installed extension, synthetic Epic responses and disposable profiles only.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
const firefox=process.argv.includes('--firefox'),release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic Epic Store</main></body></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>pattern==='https://store.epicgames.com/*'?'http://127.0.0.1/*':pattern);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
for(const path of ['src/background/service-worker.js','src/background/epic-auth-diagnostics.js'])files.set(path,Buffer.from(files.get(path).toString().replaceAll('https://store.epicgames.com',origin)));
const fixture=`
const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'});};
const create=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(text=>{document.documentElement.dataset.exportedReport=text;});return create.call(this,blob);};
globalThis.fixtureRequests=0;
globalThis.fetch=async(url,options)=>{
 if(url!=='/graphql')throw Error('Unexpected fixture request');globalThis.fixtureRequests++;document.documentElement.dataset.fixtureRequests=String(globalThis.fixtureRequests);
 const cursor=JSON.parse(options.body).variables.cursor,index=cursor?Number(cursor):0;
 const body=location.pathname.includes('achievements')?{data:{Library:{libraryItems:{records:[{catalogItemId:'fixture-'+index,namespace:'store',catalogItem:{id:'fixture-'+index,title:'Synthetic game '+index}}],responseMetadata:{nextCursor:index===5?null:String(index+1)}}}}}:{errors:[{message:'LibraryQuery/libraryItems: Request failed with status code 401 PRIVATE_TOKEN'}]};
 return {ok:true,status:200,json:async()=>body};
};
`;
files.set('src/providers/epic.js',Buffer.from(fixture+files.get('src/providers/epic.js').toString()));
files.set('src/providers/epic-content.js',Buffer.from(files.get('src/providers/epic-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`
import {createStorageClient,createBackup,parseBackup} from './src/lib/storage.js';
import {ownershipCorrectionTarget} from './src/ui/quick-access.js';
import {effectiveOwnershipRecord} from './src/lib/ownership.js';
try{
 const client=createStorageClient(request=>chrome.runtime.sendMessage(request));let d=await client.getDatabase();
 if(location.search==='?seed'){
  await client.mergeProviderItems('gog',[{providerItemId:'unrelated',title:'Unrelated synthetic game',mediaType:'game',ownership:'owned',acquiredAt:'2020-01-02'}]);d=await client.getDatabase();
  await client.saveOwnershipCorrections([ownershipCorrectionTarget(Object.values(d.providerItems).find(i=>i.provider==='epic'),d)],{ownership:'returned',note:'Synthetic correction'});d=await client.getDatabase();
 }
 const history=(await chrome.runtime.sendMessage({type:'EPIC_AUTH_DIAGNOSTICS',action:'get'})).history;
 const items=Object.values(d.providerItems),epic=items.filter(i=>i.provider==='epic');
 const cleanItems=Object.fromEntries(Object.entries(d.providerItems).map(([id,item])=>[id,item.provider==='epic'?Object.fromEntries(Object.entries(item).filter(([k])=>!['observedAt','updatedAt'].includes(k))):item]));
 const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
 const payload=JSON.stringify({providerItems:cleanItems,providerHistory:d.providerHistory,ownershipReviews:d.ownershipReviews,canonicalItems:d.canonicalItems,manualMatchDecisions:d.manualMatchDecisions,contentReviews:d.contentReviews});
 document.documentElement.dataset.result=JSON.stringify({records:items.length,epic:epic.length,returned:epic.filter(i=>effectiveOwnershipRecord(i,d).ownership==='returned').length,refs:epic.map(i=>i.recordRef).sort(),payload,roundTrip:stable(parseBackup(createBackup(d)))===stable(d),history});
}catch(error){document.documentElement.dataset.result=JSON.stringify({error:error.message});}
`));
const temporary=await mkdtemp(join(tmpdir(),'gl-epic-native-'));let child,driver,session,exited;
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  async function startBrowser(){
  const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox){await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});const archive=join(temporary,'extension.zip');await writeFile(archive,runtimeZip(files));await driver.send('Addon:Install',{path:archive,temporary:true});
    await driver.send('Marionette:SetContext',{value:'chrome'});
    const granted=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");ExtensionPermissions.add(arguments[0],{permissions:[],origins:["http://127.0.0.1/*"]},WebExtensionPolicy.getByID(arguments[0]).extension).then(()=>done(true),error=>done({error:error.message}));',args:['galactic-library@galactichamster.com'],newSandbox:true});assert.equal(granted.value??granted,true);
    await driver.send('Marionette:SetContext',{value:'content'});
  }else await driver.send('Extensions.loadUnpacked',{path:stage});
  }
  await startBrowser();
  async function evaluate(script){
    if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],newSandbox:false});const value=Object.hasOwn(r,'value')?r.value:r;assert(!value?.error,value?.error);return value;}
    const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  async function navigate(url){if(firefox)await driver.send('WebDriver:Navigate',{url});else{const t=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);}}
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-epic-importer")?.shadowRoot?.querySelector(".status")?.textContent};');throw Error(message+' '+JSON.stringify(state));}
  const root='document.querySelector("#galactic-library-epic-importer").shadowRoot';
  const ready=()=>wait('return !!document.querySelector("#galactic-library-epic-importer")?.shadowRoot?.querySelector("[data-profile-label]");','Epic panel unavailable');
  const sync=async()=>{await evaluate(`const s=${root};s.querySelector('[data-import-action]').click();return true;`);await wait(`const s=${root};return !s.querySelector('.status').dataset.busy;`,'Epic sync did not finish');};
  const read=async(url)=>{await navigate(url);return JSON.parse(await wait('return document.documentElement?.dataset.result;','Database report unavailable'));};
  await navigate(origin+'/en-US/u/Synthetic/achievements');await ready();
  await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Synthetic';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;return true;`);await sync();
  assert.equal(await evaluate(`return ${root}.querySelector('.status').textContent.includes('Sync complete');`),true);
  const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
  const baseline=await read(reportUrl+'?seed');assert.equal(baseline.error,undefined);assert.equal(baseline.epic,6);assert.equal(baseline.records,7);assert.equal(baseline.returned,1);assert.equal(baseline.history.episodes.length,0);
  await navigate(origin+'/en-US/');await ready();await sync();
  assert.equal(await evaluate(`const s=${root};return s.querySelector('.status').textContent.includes('My Achievements')&&!/401|LibraryQuery|PRIVATE/.test(s.querySelector('.status').textContent);`),true);
  assert.equal(await evaluate('return document.documentElement.dataset.fixtureRequests;'),'1','Failure retried without a readiness signal');
  const failed=await read(reportUrl);assert.equal(failed.error,undefined);assert.equal(failed.payload,baseline.payload);assert.equal(failed.history.episodes.length,1);assert.equal(failed.history.episodes[0].failure.saveState,'not-requested');assert.equal(failed.history.episodes[0].subsequentSuccess,null);
  // A clean browser/extension restart is stronger than a page reload and
  // avoids debugger-installed extensions' self-reload transport behavior.
  if(firefox)await driver.send('Marionette:Quit',{flags:['eForceQuit']});else await driver.send('Browser.close');
  await exited;driver.close?.();await startBrowser();
  await navigate(origin+'/en-US/');await ready();
  const restoredReportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
  const reloaded=await read(restoredReportUrl);assert.equal(reloaded.error,undefined);assert.deepEqual(reloaded.history,failed.history);assert.equal(reloaded.payload,baseline.payload);
  await navigate(origin+'/en-US/u/Synthetic/achievements');await ready();await sync();
  assert.equal(await evaluate('return document.documentElement.dataset.fixtureRequests;'),'6');
  await evaluate(`const s=${root};s.querySelector('[data-export-scan]').click();return true;`);
  const exported=JSON.parse(await wait('return document.documentElement.dataset.exportedReport;','Retained scan export failed'));
  assert.equal(exported.format,2);assert.equal(exported.authorizationHistory.episodes.length,1);assert.equal(exported.authorizationHistory.episodes[0].subsequentSuccess.pagesRead,6);assert.equal(exported.authorizationHistory.episodes[0].subsequentSuccess.route,'achievements');assert.equal(exported.authorizationHistory.navigationBetweenAttempts,'not-monitored');
  assert(!/PRIVATE|Synthetic|fixture-|recordRef|providerItemId/.test(JSON.stringify(exported)),'Export leaked source or account fields');
  const recovered=await read(reportUrl);assert.equal(recovered.payload,baseline.payload);assert.equal(recovered.returned,1);assert.equal(recovered.roundTrip,true);assert.deepEqual(recovered.refs,baseline.refs);
  console.log('PASS '+(firefox?'Firefox':'Chrome')+' packaged Epic: real passive failure persistence, browser/extension restart, six-page committed recovery, UI export, zero automatic retries and unchanged records/corrections/other provider/backup.');
}finally{
  if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-epic-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
