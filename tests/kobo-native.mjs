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

import {koboSectionFixture} from './fixtures/kobo-empty-root.mjs';
const provider='kobo',firefox=process.argv.includes('--firefox');
const release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic Kobo library</main></body></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));
for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>pattern==='https://www.kobo.com/*'?'http://127.0.0.1/*':pattern);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
files.set('src/background/service-worker.js',Buffer.from(files.get('src/background/service-worker.js').toString().replaceAll('https://www.kobo.com',origin).replace('async function notifyVideoDiagnostics(){',"let testCatalogWrites=0;const testNativeSet=privateArea.set.bind(privateArea);privateArea.set=async patch=>{await testNativeSet(patch);if(patch.galacticLibraryDatabase)testCatalogWrites++;};chrome.runtime.onMessage.addListener((r,s,reply)=>{if(r?.type==='GL_TEST_KOBO_WRITES'){reply(testCatalogWrites);return false;}});async function notifyVideoDiagnostics(){")));
files.set('src/providers/kobo.js',Buffer.from("const testSection="+koboSectionFixture.toString()+";let testRequests=0;globalThis.fetch=async url=>{document.documentElement.dataset.fixtureRequests=String(++testRequests);const r=testSection(new URLSearchParams(location.search).get('case')||'both',url);return new Response(r.html,{status:r.status});};\n"+files.get('src/providers/kobo.js').toString()));
files.set('src/providers/kobo-content.js',Buffer.from("const testAttach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return testAttach.call(this,{...o,mode:'open'});};\n"+files.get('src/providers/kobo-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`import {createStorageClient,createBackup,parseBackup} from './src/lib/storage.js';
import {completeProviderSnapshot,completedScope} from './src/lib/provider-snapshot.js';
import {effectiveOwnershipRecord} from './src/lib/ownership.js';
import {matchItems} from './src/lib/matcher.js';
const client=createStorageClient(r=>chrome.runtime.sendMessage(r));
try{
 const mode=new URLSearchParams(location.search).get('mode');
 if(mode==='seed'){
  await client.mergeProviderItems('steam',[{providerItemId:'42',title:'Unrelated saved game',mediaType:'game',ownership:'owned'}],{profileLabel:'Other'});
  const seed=['audio','archive','retired'].map(id=>({providerItemId:id,title:'Synthetic '+(id==='audio'?'Audio':'Book')+' '+id,mediaType:id==='audio'?'audiobook':'book',ownership:'owned'}));
  let d=await client.replaceProviderItems('kobo',seed,{profileLabel:'Synthetic'},completeProviderSnapshot('kobo',seed,[completedScope('library',3,3,'reported-count')]));
  const audio=Object.values(d.providerItems).find(i=>i.providerItemId==='audio');
  await client.saveOwnershipReview(audio.recordRef,{ownership:'unknown',note:'Keep manual review',evidenceDate:'2026-11-01'});
  await client.replaceProviderItems('kobo',seed.slice(0,2),{profileLabel:'Synthetic'},completeProviderSnapshot('kobo',seed.slice(0,2),[completedScope('library',2,2,'reported-count')]));
 }
 let d=await client.getDatabase();
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
  const open=async scenario=>{await navigate(origin+'/library?case='+scenario);await wait('return !!document.querySelector("#galactic-library-kobo-importer")?.shadowRoot?.querySelector("[data-profile-label]");','Kobo panel missing');};
  const sync=async(mode='full')=>{await evaluate(`const s=${root};s.querySelector('[data-mode="${mode}"]').click();return true;`);await wait(`return !${root}.querySelector('.status').dataset.busy;`,'Kobo import incomplete');return evaluate(`return {status:${root}.querySelector('.status').textContent,requests:Number(document.documentElement.dataset.fixtureRequests)};`);};
  const read=async(mode='')=>{await navigate(reportUrl+(mode?'?mode='+mode:''));return JSON.parse(await wait('return document.documentElement?.dataset.result;','Kobo report missing'));};
  await open('both');const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
  const seeded=await read('seed');assert(!seeded.error,seeded.error);assert(seeded.roundTrip);
  await open('both');let result=await sync();assert(!result.status.includes('failed'),result.status);assert.equal(result.requests,3);
  let d=await read();assert(!d.error,d.error);assert.equal(d.items.length,3);assert.equal(d.matches.length,3);for(let i=0;i<d.items.length;i++)assert(d.matches[i].includes(d.items[i].recordRef),'Imported item missing from exact comparison');assert(d.roundTrip&&d.fullAt);assert.deepEqual(d.unrelated,seeded.unrelated);assert.deepEqual(d.reviews,seeded.reviews);assert.deepEqual(d.history,seeded.history);
  assert(d.items.every(i=>i.ownership==='owned'&&i.metadata.ownershipBasis==='purchase-attribute'&&i.metadata.source==='kobo-my-books-library'));
  assert.deepEqual(d.items.map(i=>[i.providerItemId,i.mediaType,i.metadata.librarySection]).sort(),[['archive','book','archive'],['audio','audiobook','audiobooks'],['shared','book','audiobooks']]);assert(d.effective.some(([id,state])=>id==='audio'&&state==='unknown'));
  console.log('PASS installed Kobo: empty root visits Archive and Audiobooks, deduplicates, persists purchase/media evidence, matching visibility, manual correction and unrelated history');
  const before=structuredClone(d);
  // Firefox 159 on this host times out on Marionette:Quit even without an add-on.
  // Restart only our spawned process; this additionally checks crash durability.
  if(firefox){driver.close();child.kill();}else await driver.send('Browser.close');await exited;driver.close?.();await startBrowser();
  d=await read();assert.deepEqual(d.items,before.items);assert.deepEqual(d.reviews,before.reviews);assert.deepEqual(d.history,before.history);
  await open('both');result=await sync('incremental');assert(!result.status.includes('failed'),result.status);assert.equal(result.requests,1);d=await read();assert.equal(d.writes,0,'Unchanged empty-root Quick rewrote catalog');assert.deepEqual(d.items,before.items);
  console.log('PASS installed Kobo: browser restart retains records; unchanged empty-root Quick makes one request and zero catalog writes');
  for(const scenario of ['401','403','503','malformed','unreadable','invalid-link']){
    const prior=d;await open(scenario);result=await sync();assert.match(result.status,/failed/);d=await read();assert.deepEqual(d.items,prior.items);assert.deepEqual(d.history,prior.history);assert.deepEqual(d.reviews,prior.reviews);assert.deepEqual(d.unrelated,prior.unrelated);assert.equal(d.fullAt,prior.fullAt);assert(d.state.listingIncomplete);assert.equal(d.writes-prior.writes,prior.state?.listingIncomplete&&JSON.stringify(prior.state?.pendingKoboScopes??[])===JSON.stringify(d.state.pendingKoboScopes??[])?0:1,'Only changed recovery metadata may require a database commit');
    console.log('PASS installed Kobo: '+scenario+' leaves prior library, history, corrections, other providers and Full checkpoint unchanged');
  }
  for(const scenario of ['count-mismatch','pagination']){
    const prior=d;await open(scenario);result=await sync();assert.match(result.status,/Saved readable/);d=await read();assert.equal(d.fullAt,prior.fullAt);assert.deepEqual(d.history,prior.history);assert.deepEqual(d.reviews,prior.reviews);assert.deepEqual(d.unrelated,prior.unrelated);
    console.log('PASS installed Kobo: '+scenario+' now saves a validated additive Archive prefix without Full authority');
  }
  await open('all-empty');result=await sync();assert(!result.status.includes('failed'),result.status);d=await read();assert.equal(d.items.length,0);assert(d.fullAt);
  console.log('PASS installed Kobo: explicit empty active, Archive and Audiobooks scopes authorize empty Full reconciliation');
  for(const [scenario,count]of [['audio',1],['archive',1],['ordinary',1]]){
    // Each control starts after independently verified empty scopes; omission
    // of a previously populated scope is now deliberately additive/unverified.
    await open('all-empty');assert(!(await sync()).status.includes('failed'));
    await open(scenario);result=await sync();assert(!result.status.includes('failed'),result.status);assert.equal(result.requests,scenario==='ordinary'?1:2);d=await read();assert.equal(d.items.length,count);assert(d.roundTrip);assert.deepEqual(d.unrelated,seeded.unrelated);assert.deepEqual(d.reviews,seeded.reviews);
    console.log('PASS installed Kobo: '+scenario+' Full retains existing classification and request count');
  }
  const prior=d;await open('quick-known');result=await sync('incremental');assert(!result.status.includes('failed'),result.status);assert.equal(result.requests,1);d=await read();assert.equal(d.writes,prior.writes,'Unchanged known-item Quick rewrote catalog');assert.deepEqual(d.items,prior.items);
  const restored=await read('restore');assert(restored.roundTrip);assert.deepEqual(restored.items,d.items);assert.deepEqual(restored.history,d.history);assert.deepEqual(restored.reviews,d.reviews);assert.deepEqual(restored.unrelated,d.unrelated);
  console.log('PASS installed Kobo: ordinary known-page Quick stops without linked requests/catalog writes; backup restore preserves evidence and history');
}finally{
  child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-kobo-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
