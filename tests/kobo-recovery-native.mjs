// Installed production Kobo parser/content/worker/writer; synthetic sections only.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';

import {koboRecoveryFixture as koboSectionFixture} from './fixtures/kobo-recovery.mjs';
const provider='kobo',firefox=process.argv.includes('--firefox');
const release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic Kobo library</main></body></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));
for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>pattern==='https://www.kobo.com/*'?'http://127.0.0.1/*':pattern);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
files.set('src/background/service-worker.js',Buffer.from(files.get('src/background/service-worker.js').toString().replaceAll('https://www.kobo.com',origin).replace('async function notifyVideoDiagnostics(){',"let testCatalogWrites=0,testReject='';const testNativeSet=privateArea.set.bind(privateArea);privateArea.set=async patch=>{if(patch.galacticLibraryDatabase&&testReject)throw Error(testReject);await testNativeSet(patch);if(patch.galacticLibraryDatabase)testCatalogWrites++;};chrome.runtime.onMessage.addListener((r,s,reply)=>{if(r?.type==='GL_TEST_KOBO_WRITES'){if(r.reject!==undefined)testReject=r.reject;reply(testCatalogWrites);return false;}});async function notifyVideoDiagnostics(){")));
files.set('src/providers/kobo.js',Buffer.from("const testSection="+koboSectionFixture.toString()+";let testRequests=0,testScopes={active:0,archive:0,audiobooks:0};globalThis.fetch=async url=>{const path=new URL(url).pathname;testScopes[path.includes('archive')?'archive':path.includes('audiobooks')?'audiobooks':'active']++;document.documentElement.dataset.fixtureScopes=JSON.stringify(testScopes);document.documentElement.dataset.fixtureRequests=String(++testRequests);const r=testSection(new URLSearchParams(location.search).get('case')||'clean',url);return new Response(r.html,{status:r.status});};\n"+files.get('src/providers/kobo.js').toString()));
files.set('src/providers/kobo-content.js',Buffer.from("const testAttach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return testAttach.call(this,{...o,mode:'open'});};\n"+files.get('src/providers/kobo-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`import {createStorageClient,createBackup,parseBackup} from './src/lib/storage.js';
import {completeProviderSnapshot,completedScope} from './src/lib/provider-snapshot.js';
import {createEmptyDatabase} from './src/lib/models.js';
import {effectiveOwnershipRecord} from './src/lib/ownership.js';
import {matchItems} from './src/lib/matcher.js';
const client=createStorageClient(r=>chrome.runtime.sendMessage(r));
try{
 const mode=new URLSearchParams(location.search).get('mode');
 if(mode==='seed'){
  await client.restoreDatabase(createEmptyDatabase());
  await client.mergeProviderItems('steam',[{providerItemId:'42',title:'Unrelated saved game',mediaType:'game',ownership:'owned'}],{profileLabel:'Other'});
  const seed=['root-1','archive-1','retired'].map(id=>({providerItemId:id,title:'Synthetic '+id,mediaType:'book',ownership:'owned',acquiredAt:'2020-01-01',metadata:{source:'kobo-my-books-library',librarySection:id==='archive-1'?'archive':'my-books',ownershipBasis:'purchase-attribute',authors:['Synthetic Writer'],edition:'First'}}));
  let d=await client.replaceProviderItems('kobo',seed,{profileLabel:'Synthetic',fullSyncAt:'2026-10-01'},completeProviderSnapshot('kobo',seed,[completedScope('library',3,3,'reported-count')]));
  const audio=Object.values(d.providerItems).find(i=>i.providerItemId==='root-1');
  await client.saveOwnershipReview(audio.recordRef,{ownership:'unknown',note:'Keep manual review',evidenceDate:'2026-11-01'});
  await client.replaceProviderItems('kobo',seed.slice(0,2),{profileLabel:'Synthetic',fullSyncAt:'2026-10-01'},completeProviderSnapshot('kobo',seed.slice(0,2),[completedScope('library',2,2,'reported-count')]));
 }
 let d=await client.getDatabase();
 if(mode==='reject'||mode==='allow')await chrome.runtime.sendMessage({type:'GL_TEST_KOBO_WRITES',reject:mode==='reject'?'Synthetic quota/disk rejection':''});
 if(mode==='restore'){await client.restoreDatabase(parseBackup(createBackup(d)));d=await client.getDatabase();}
 const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
 const selected=Object.values(d.providerItems).filter(i=>i.provider==='kobo');
 document.documentElement.dataset.result=JSON.stringify({items:selected,unrelated:Object.values(d.providerItems).filter(i=>i.provider!=='kobo'),history:d.providerHistory,reviews:d.ownershipReviews,fullAt:d.providers.kobo?.fullSyncAt,state:d.providers.kobo?.syncState,roundTrip:stable(parseBackup(createBackup(d)))===stable(d),writes:await chrome.runtime.sendMessage({type:'GL_TEST_KOBO_WRITES'}),matches:matchItems(d.providerItems,selected.map(i=>({title:i.title,mediaType:i.mediaType})),d).map(r=>r.matches.map(m=>m.itemRef)),effective:selected.map(i=>[i.providerItemId,effectiveOwnershipRecord(i,d).ownership])});
}catch(e){document.documentElement.dataset.result=JSON.stringify({error:e.message});}`));
const temporary=await mkdtemp(join(tmpdir(),'gl-kobo-native-'));let child,driver,session,exited;
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  async function startBrowser(){
  const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  // Drain browser logs so pipe backpressure cannot stall shutdown on Windows.
  child.stdout?.resume();child.stderr?.resume();
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
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-kobo-importer")?.shadowRoot?.querySelector(".status")?.textContent};');throw Error(message+' '+JSON.stringify(state));}

  const root='document.querySelector("#galactic-library-kobo-importer").shadowRoot';
  const open=async scenario=>{await navigate(origin+'/library?case='+scenario);await wait('const s=document.querySelector("#galactic-library-kobo-importer")?.shadowRoot;return !!s?.querySelector("[data-profile-label]")&&!s.querySelector("[data-profile-status]").textContent.includes("Loading");','Kobo panel missing');};
  const sync=async(mode='full')=>{await evaluate(`const s=${root};s.querySelector('[data-mode="${mode}"]').click();return true;`);await wait(`return !${root}.querySelector('.status').dataset.busy;`,'Kobo import incomplete');const r=await evaluate(`return {status:${root}.querySelector('.status').textContent,requests:Number(document.documentElement.dataset.fixtureRequests),scopes:JSON.parse(document.documentElement.dataset.fixtureScopes??'{}')};`);console.log('ACQUISITION '+JSON.stringify(r));return r;};
  const read=async(mode='')=>{await navigate(reportUrl+(mode?'?mode='+mode:''));const d=JSON.parse(await wait('return document.documentElement?.dataset.result;','Kobo report missing'));assert(!d.error,d.error);console.log('CATALOG '+JSON.stringify({items:d.items.length,writes:d.writes,historical:Object.keys(d.history).length,pending:!!d.state?.listingIncomplete}));return d;};
  await open('later-library');const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
  await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Synthetic';s.querySelector('[data-profile-confirm]').checked=true;return true;`);
  let first=await sync();assert.match(first.status,/Saved/);const firstImport=await read();assert.equal(firstImport.items.length,27);assert(firstImport.state.listingIncomplete&&!firstImport.fullAt);
  const seeded=await read('seed');assert(!seeded.error,seeded.error);assert(seeded.roundTrip);
  const checks=['first-account partial Full imports validated purchases without complete authority'];const keep=(a,b)=>{assert.deepEqual(a.unrelated,b.unrelated);assert.deepEqual(a.reviews,b.reviews);};
  await open('later-library');let result=await sync(),d=await read();assert.match(result.status,/Saved readable/);assert.equal(result.requests,5);assert(d.state.listingIncomplete&&d.state.pendingKoboScopes.includes('my-books'));assert.equal(d.items.filter(i=>i.providerItemId.startsWith('root-')).length,24);assert.deepEqual(d.history,seeded.history);keep(d,seeded);checks.push('later library HTTP503 retains 24 active books plus independent Archive/audio evidence');
  const savedOne=d.items.find(i=>i.providerItemId==='root-1');assert.equal(savedOne.acquiredAt,'2020-01-01T00:00:00.000Z');assert.equal(savedOne.ownership,'owned');assert.equal(savedOne.metadata.edition,'First');const pending=structuredClone(d);
  if(firefox){driver.close();child.kill();}else await driver.send('Browser.close');await exited;driver.close?.();await startBrowser();d=await read('restore');assert(d.roundTrip&&d.state.listingIncomplete);assert.deepEqual(d.items,pending.items);keep(d,pending);checks.push('same-profile restart and actual backup/restore retain pending recovery and corrections');
  await open('clean');result=await sync('incremental');assert(!/failed/.test(result.status),result.status);assert.equal(result.requests,5);d=await read();assert.equal(d.items.length,28);assert(!d.state.listingIncomplete&&d.fullAt);for(const [key,entry]of Object.entries(pending.history))assert.deepEqual(d.history[key],entry);keep(d,pending);assert(d.matches.every((matches,i)=>matches.includes(d.items[i].recordRef)));checks.push('Quick after pending work performs complete Full, then matching and persistence expose all 28 identities');
  assert.equal(d.items.find(i=>i.providerItemId==='root-1').acquiredAt,savedOne.acquiredAt);assert.equal(d.items.find(i=>i.providerItemId==='root-1').metadata.edition,'First');const baseline=d;await open('clean');result=await sync('incremental');assert.equal(result.requests,1);d=await read();assert.equal(d.writes,baseline.writes);assert.deepEqual(d.items,baseline.items);checks.push('healthy unchanged Quick stops on one known page with zero catalog writes');
  const failedFullBefore=d;await open('root-failure');result=await sync();assert.match(result.status,/failed/);d=await read();assert(d.state.listingIncomplete);assert.deepEqual(d.items,failedFullBefore.items);assert.deepEqual(d.history,failedFullBefore.history);keep(d,failedFullBefore);assert.equal(d.writes-failedFullBefore.writes,1,'Changed recovery metadata uses one existing validated commit');
  console.log('MEASURE '+JSON.stringify({scenario:'failed-full-recovery-transition',catalogWrites:d.writes-failedFullBefore.writes,requests:result.requests,records:d.items.length}));
  if(firefox){driver.close();child.kill();}else await driver.send('Browser.close');await exited;driver.close?.();await startBrowser();
  d=await read();assert(d.state.listingIncomplete);const failedAgainBefore=d;await open('root-failure');result=await sync();d=await read();assert.match(result.status,/failed/);assert(d.state.listingIncomplete);assert.equal(d.writes,failedAgainBefore.writes,'Repeated identical failure uses only a status receipt');
  d=await read('restore');assert(d.state.listingIncomplete);await open('clean');result=await sync('incremental');assert.equal(result.requests,5,'Quick after failed Full must traverse every required section');d=await read();assert(!d.state.listingIncomplete);assert.equal(d.items.length,28);const evidence=items=>items.map(({observedAt,...item})=>item);assert.deepEqual(evidence(d.items),evidence(failedFullBefore.items));assert.deepEqual(d.history,failedFullBefore.history);keep(d,failedFullBefore);
  checks.push('zero-usable failed Full durably saves recovery; extension/browser restart, repeated failure and backup/restore retain it; Quick performs all five requests');
  console.log('MEASURE '+JSON.stringify({scenario:'failed-full-recovery-quick',requests:result.requests,repeatFailureCatalogWrites:0,records:d.items.length}));
  for(const scenario of ['archive-first','archive-later','malformed-row']){const before=d;await open(scenario);result=await sync();assert.match(result.status,/Saved readable/);d=await read();assert(d.state.listingIncomplete);assert.equal(d.fullAt,before.fullAt);assert.deepEqual(d.history,before.history);keep(d,before);assert.equal(d.items.length,28);checks.push(scenario+' retains current purchases, omitted records and historical entries additively');await open('clean');assert(!/failed/.test((await sync()).status));d=await read();}
  for(const scenario of ['auth-later','root-failure','malformed-archive','empty-root-fail']){const before=d;await open(scenario);result=await sync();assert.match(result.status,/failed/);d=await read();assert.deepEqual(d.items,before.items);assert.deepEqual(d.history,before.history);keep(d,before);assert.equal(d.fullAt,before.fullAt);assert.equal(d.writes-before.writes,before.state?.listingIncomplete&&JSON.stringify(before.state?.pendingKoboScopes??[])===JSON.stringify(d.state?.pendingKoboScopes??[])?0:1,'Only a new validated recovery transition can write the database');assert(d.state.listingIncomplete);checks.push(scenario+' cannot publish prefix or empty success');}
  const before=d;await read('reject');await open('empty-root');result=await sync();assert.match(result.status,/failed/);d=await read();assert.deepEqual(d.items,before.items);assert.deepEqual(d.history,before.history);keep(d,before);assert.equal(d.writes,before.writes);await read('allow');checks.push('storage rejection preserves durable records, history and manual corrections without success acknowledgement');
  await open('empty-root');result=await sync();assert(!/failed/.test(result.status),result.status);d=await read();assert.equal(d.items.length,1);assert.equal(d.items[0].providerItemId,'archive-1');assert.equal(d.items[0].metadata.librarySection,'archive');assert.equal(d.items[0].ownership,'owned');assert(d.fullAt);keep(d,before);checks.push('fresh retry succeeds; empty root visits Archive and complete Full alone reconciles omissions');
  await open('archive-first');result=await sync();assert.match(result.status,/Saved readable/);d=await read();const oldHistory=d.history;assert(d.state.pendingKoboScopes.includes('archive'));
  await open('missing-archive');result=await sync('incremental');assert.match(result.status,/Saved readable/);d=await read();assert(d.state.listingIncomplete);assert.deepEqual(d.history,oldHistory);checks.push('missing unfinished Archive link cannot clear pending recovery or reactivate historical-only titles');
  await open('all-empty');result=await sync();assert(!/failed/.test(result.status),result.status);d=await read();assert.equal(d.items.length,0);assert(!d.state.listingIncomplete&&d.fullAt);assert(d.roundTrip);checks.push('complete explicit-empty Full clears recovery and reconciles only after all required scopes');
  for(const check of checks)console.log('PASS installed '+(firefox?'Firefox':'Chrome')+' Kobo recovery: '+check);console.log(checks.length+' installed Kobo recovery checks passed.');

}finally{
  child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-kobo-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
