// Installed production acquisition and worker; synthetic DOM in disposable profiles.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';


import {videoRecoveryDocument} from './fixtures/amazon-video-recovery.mjs';
const provider='amazon-video',firefox=process.argv.includes('--firefox');
const release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(videoRecoveryDocument(new URL(req.url,'http://localhost').searchParams.get('case')||'recovered'));});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>pattern==='https://www.amazon.com/*'?'http://127.0.0.1/*':pattern);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
files.set('src/background/service-worker.js',Buffer.from(files.get('src/background/service-worker.js').toString().replaceAll('https://www.amazon.com',origin).replace('async function notifyVideoDiagnostics(){',"let testWrites=0;const nativeSet=privateArea.set.bind(privateArea);privateArea.set=async patch=>{await nativeSet(patch);if(patch.galacticLibraryDatabase)testWrites++;};chrome.runtime.onMessage.addListener((r,s,reply)=>{if(r?.type==='GL_TEST_VIDEO_WRITES'){reply(testWrites);return false;}});async function notifyVideoDiagnostics(){")));
files.set('src/providers/amazon-video.js',Buffer.from("const testTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>testTimeout(fn,[700,600].includes(ms)?1:ms,...args);\n"+files.get('src/providers/amazon-video.js').toString()));
files.set('src/providers/amazon-video-content.js',Buffer.from("const testAttach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return testAttach.call(this,{...o,mode:'open'});};\n"+files.get('src/providers/amazon-video-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');document.addEventListener('gl-test-diagnostics',()=>{document.documentElement.dataset.testDiagnostics=JSON.stringify(GalacticAmazonVideo.getDiagnostics());});"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`import {createStorageClient,createBackup,parseBackup} from './src/lib/storage.js';import {completeProviderSnapshot,completedScope} from './src/lib/provider-snapshot.js';import {matchItems} from './src/lib/matcher.js';
const client=createStorageClient(r=>chrome.runtime.sendMessage(r)),provider='amazon-video';
const item=n=>({providerItemId:'amzn1.dv.gti.fixture-'+n,title:'Synthetic Video '+n,mediaType:n%2?'movie':'tv',ownership:'owned',metadata:{ownershipEvidence:'You purchased this',libraryView:'purchases-and-rentals'}});
try{
 const mode=new URLSearchParams(location.search).get('mode');
 if(mode==='seed'){
  await client.mergeProviderItems('steam',[{providerItemId:'42',title:'Other provider',mediaType:'game',ownership:'owned'}]);
  const seed=[item(1),item(98),item(99)],scope=items=>completeProviderSnapshot(provider,items,[completedScope('library',items.length,items.length,'reported-count')]);
  let d=await client.replaceProviderItems(provider,seed,{profileLabel:'Synthetic',fullSyncAt:'2026-10-01'},scope(seed));
  const ref=Object.values(d.providerItems).find(i=>i.providerItemId===item(1).providerItemId).recordRef;
  await client.saveOwnershipReview(ref,{ownership:'unknown',note:'Keep manual correction',evidenceDate:'2026-10-01'});
  await client.replaceProviderItems(provider,[seed[0],seed[2]],{profileLabel:'Synthetic'},scope([seed[0],seed[2]]));
  await client.saveProviderDiagnosticsEnabled(true);
 }
 let d=await client.getDatabase();if(mode==='restore'){await client.restoreDatabase(parseBackup(createBackup(d)));d=await client.getDatabase();}
 const items=Object.values(d.providerItems).filter(i=>i.provider===provider);document.documentElement.dataset.result=JSON.stringify({items,other:Object.values(d.providerItems).filter(i=>i.provider!==provider),history:d.providerHistory,reviews:d.ownershipReviews,state:d.providers[provider],writes:await chrome.runtime.sendMessage({type:'GL_TEST_VIDEO_WRITES'}),roundTrip:JSON.stringify(parseBackup(createBackup(d)))===JSON.stringify(d),matches:matchItems(d.providerItems,items.map(i=>({title:i.title,mediaType:i.mediaType})),d).map(r=>[...r.matches,...r.possibleMatches].map(m=>m.itemRef))});
}catch(e){document.documentElement.dataset.result=JSON.stringify({error:e.message});}`));
const temporary=await mkdtemp(join(tmpdir(),'gl-video-recovery-native-'));let child,driver,session,exited;
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
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-amazon-video-importer")?.shadowRoot?.querySelector(".status")?.textContent};');throw Error(message+' '+JSON.stringify(state));}


  const root='document.querySelector("#galactic-library-amazon-video-importer").shadowRoot';
  const open=async scenario=>{await navigate(origin+'/gp/video/library?case='+scenario);await wait('return !!document.querySelector("#galactic-library-amazon-video-importer")?.shadowRoot?.querySelector("[data-profile-label]");','Video panel unavailable');};
  const sync=async(mode='full')=>{await evaluate(`${root}.querySelector('[data-mode="${mode}"]').click();return true;`);await wait(`return !${root}.querySelector('.status').dataset.busy;`,'Video scan incomplete');const status=await evaluate(`return ${root}.querySelector('.status').textContent;`);await evaluate("document.dispatchEvent(new Event('gl-test-diagnostics'));return true;");const diagnostics=JSON.parse(await wait('return document.documentElement.dataset.testDiagnostics;','Diagnostics unavailable'));return {status,diagnostics};};
  const read=async(mode='')=>{await navigate(reportUrl+(mode?'?mode='+mode:''));return JSON.parse(await wait('return document.documentElement?.dataset.result;','Report unavailable'));};
  await open('partial');const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');const seeded=await read('seed');assert(!seeded.error,seeded.error);
  await open('partial');let r=await sync();assert.match(r.status,/Saved 20 readable/);assert.match(r.status,/1 observed card/);assert.match(r.status,/incomplete/);assert.equal(r.diagnostics.hoverChecks.attempted,0);assert.equal(r.diagnostics.completionStatus,'partial');assert(!r.diagnostics.completionConfirmed);
  let d=await read();assert(!d.error,d.error);assert.equal(d.items.length,21);assert(d.state.syncState.listingIncomplete);assert.equal(d.state.fullSyncAt,seeded.state.fullSyncAt);assert.deepEqual(d.history,seeded.history);assert.deepEqual(d.reviews,seeded.reviews);assert.deepEqual(d.other,seeded.other);assert(d.items.every(i=>i.ownership==='owned'&&i.metadata.source==='amazon-prime-video-purchases-library'));for(let i=0;i<d.items.length;i++)assert(d.matches[i].includes(d.items[i].recordRef),JSON.stringify({item:d.items[i],matches:d.matches[i]}));
  console.log('PASS installed Video: 20 readable purchases saved, unresolved card excluded, source/identity/history/manual reviews and unrelated provider preserved; zero hovers');
  if(firefox){driver.close();child.kill();}else await driver.send('Browser.close');await exited;driver.close?.();await startBrowser();
  const prior=d;d=await read('restore');assert(d.roundTrip);assert.deepEqual(d.items,prior.items);assert(d.state.syncState.listingIncomplete);
  await open('recovered');r=await sync('incremental');assert(!r.status.includes('failed'),r.status);assert.match(r.status,/retrying the incomplete listing/);assert.notEqual(r.diagnostics.reason,'known-newest-group');assert.equal(r.diagnostics.hoverChecks.attempted,0);d=await read();assert.equal(d.items.length,22);assert(!d.state.syncState?.listingIncomplete);assert.equal(d.state.fullSyncAt,seeded.state.fullSyncAt);assert.deepEqual(d.reviews,seeded.reviews);assert.deepEqual(d.history,seeded.history);
  console.log('PASS installed Video: restart/backup restore retains retry marker; normal Quick re-enumerates and recovers product 21 without duplicates or Full timestamp');
  await open('recovered');const writes=d.writes;r=await sync('incremental');assert.equal(r.diagnostics.reason,'known-newest-group');assert.equal(r.diagnostics.passes.length,1);assert.equal(r.diagnostics.hoverChecks.attempted,0);d=await read();assert.equal(d.writes,writes,'Unchanged Quick rewrote catalog');assert.equal(d.items.length,22);
  console.log('PASS installed Video: subsequent Quick resumes known-group bound, zero hovers and zero catalog writes');
  await open('hidden-auth');r=await sync('incremental');assert(!r.status.includes('failed'),r.status);assert.equal(r.diagnostics.reason,'known-newest-group');d=await read();assert.equal(d.writes,writes);
  console.log('PASS installed Video: hidden sign-in template does not reject an authenticated-looking library');
  for(const scenario of ['history','movies-tv']){const before=d;await open(scenario);r=await sync();assert.match(r.status,/Saved 20 readable/);assert.match(r.status,/incomplete/);d=await read();assert.deepEqual(d.history,before.history);assert.deepEqual(d.reviews,before.reviews);assert.deepEqual(d.other,before.other);assert.equal(d.state.fullSyncAt,before.state.fullSyncAt);assert(d.state.syncState.listingIncomplete);assert.equal(d.items.length,22);console.log('PASS installed Video: '+scenario+' partial does not reactivate history or reconcile absent TV');}
  for(const scenario of ['auth','broken','conflicting','empty']){const before=d;await open(scenario);r=await sync();assert.match(r.status,/failed/);d=await read();assert.deepEqual(d.items,before.items);assert.deepEqual(d.history,before.history);assert.deepEqual(d.reviews,before.reviews);assert.equal(d.state.fullSyncAt,before.state.fullSyncAt);assert(d.state.syncState.listingIncomplete);console.log('PASS installed Video: fatal '+scenario+' rejects scan, preserves evidence and pending recovery');}
  await open('mixed');r=await sync();assert.match(r.status,/incomplete/);d=await read();const mixed=d.items.filter(i=>Number(i.providerItemId.split('-').at(-1))>1000).sort((a,b)=>a.providerItemId.localeCompare(b.providerItemId));assert.deepEqual(mixed.map(i=>i.ownership),['owned','rental','subscription','subscription','unknown']);assert.equal(r.diagnostics.hoverChecks.attempted,3);console.log('PASS installed Video: purchased, rental, subscription, Prime and unconfirmed stay distinct; optional hover absence grants no ownership');
  await open('mixed');r=await sync();assert.match(r.status,/incomplete/);assert.equal(r.diagnostics.hoverChecks.attempted,3,'Full recovery skipped known unconfirmed/subscription hover work');console.log('PASS installed Video: explicit Full retains ordinary hover work for known unconfirmed records during recovery');
  await open('recovered');r=await sync();assert(!r.status.includes('failed'),r.status);assert.equal(r.diagnostics.completionStatus,'confirmed');assert.equal(r.diagnostics.passes.length,3);assert.equal(r.diagnostics.hoverChecks.attempted,0);d=await read();assert.equal(d.items.length,21);assert(!d.state.syncState?.listingIncomplete);assert(d.state.fullSyncAt!==seeded.state.fullSyncAt);assert(d.roundTrip);assert.deepEqual(d.other,seeded.other);assert.deepEqual(d.reviews,seeded.reviews);console.log('PASS installed Video: later count-confirmed Full retains existing reconciliation and completes recovery');
}finally{
  child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-video-recovery-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
