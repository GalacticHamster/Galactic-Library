// Packaged Chrome, native storage and real worker generations; disposable only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,sep} from 'node:path';
import {createRelease,readRuntimeZip} from './release.mjs';
import {outputPath} from './audit-artifacts.mjs';
import {chromePipe} from '../tests/native-protocol.mjs';
import {observationMatchingLibrary} from '../tests/observation-matching-fixture.js';

const root=resolve(process.argv.find(a=>a.startsWith('--root='))?.slice(7)??'.'),baseline=process.argv.includes('--baseline');
const sizes=(process.argv.find(a=>a.startsWith('--sizes='))?.slice(8)??'1000,14000,20000').split(',').map(Number);
if(sizes.some(n=>!Number.isSafeInteger(n)||n<100||n>20000))throw Error('Sizes must be 100..20000.');
const output=await outputPath(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??`audit-artifacts/provider-performance/observation-browser-${baseline?'baseline':'stage1'}.json`);
const temporary=await mkdtemp(join(tmpdir(),'gl-observation-browser-'));let child,exited;
const results=[];
try{
 const stage=join(temporary,'extension'),release=await createRelease(root);
 for(const [name,data]of readRuntimeZip(release.zip)){const file=join(stage,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,data);}
 child=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--user-data-dir='+join(temporary,'profile'),'--remote-debugging-pipe','--enable-unsafe-extension-debugging','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe','pipe','pipe']});
 exited=new Promise(done=>child.once('exit',done));const driver=chromePipe(child,{timeoutMs:180000}),installed=await driver.send('Extensions.loadUnpacked',{path:stage});
 const target=await driver.send('Target.createTarget',{url:'chrome-extension://'+installed.id+'/manifest.json'}),{sessionId}=await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const evaluate=async script=>{const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},sessionId);assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
 for(const size of sizes){
  const {db,cases}=observationMatchingLibrary(size);
  await evaluate(`const S=await import('./src/lib/storage.js');await S.restoreDatabase(${JSON.stringify(db)});globalThis.observationBenchmark={cases:${JSON.stringify(cases)},packet:null};return true;`);
  const warm=await evaluate(`
   const b=globalThis.observationBenchmark;b.call=async name=>{const start=performance.now(),result=await chrome.runtime.sendMessage({type:'MATCH_ITEMS',apiVersion:1,items:b.cases[name]});if(!result.ok)throw Error(result.error);return {ms:performance.now()-start,result};};
   b.summary=values=>{const a=[...values].sort((a,b)=>a-b);return {n:a.length,medianMs:a[Math.floor(a.length/2)],p95Ms:a[Math.min(a.length-1,Math.ceil(a.length*.95)-1)],minMs:a[0],maxMs:a.at(-1)};};
   for(const name of Object.keys(b.cases))await b.call(name);
   const stats={};for(const name of Object.keys(b.cases)){const samples=[];for(let n=0;n<20;n++)samples.push((await b.call(name)).ms);stats[name]=b.summary(samples);}
   for(let n=0;n<200;n++){if((await chrome.storage.session.get('galacticLibraryValidationCertificate')).galacticLibraryValidationCertificate)break;await new Promise(done=>setTimeout(done,10));}
   if(!(await chrome.storage.session.get('galacticLibraryValidationCertificate')).galacticLibraryValidationCertificate)throw Error('Missing session proof');
   return stats;
  `);
  const revisions=await evaluate(`
   const b=globalThis.observationBenchmark,baseline=${baseline},stats={},first=[];let O,D,H,V,db,digest;
   if(!baseline){O=await import('./src/lib/observation-overlays.js');D=await import('./src/lib/provider-scan-checks.js');H=await import('./src/lib/sync-health.js');V=await import('./src/lib/provider-state.js');db=(await chrome.storage.local.get('galacticLibraryDatabase')).galacticLibraryDatabase;digest=await D.providerCheckDigest(db);}
   for(let n=0;n<12;n++){
    const at=new Date(Date.UTC(2026,9,18,8,0,n)).toISOString();
    if(!baseline){const p=db.providerProfiles[db.providers.steam.activeProfileId],attemptRef=crypto.randomUUID(),entry={provider:'steam',profileId:p.profileId,attemptRef,mode:'incremental',scope:'complete',sourceAccountFingerprint:null,supersededStatusAttempts:[],state:V.validateProviderStates({steam:{lastSync:at,quickSyncAt:at,lastError:null,syncMode:'incremental',syncHealth:H.validateSyncHealth({attemptRef,status:'succeeded',mode:'incremental',startedAt:at,finishedAt:at,retryable:false})}}).steam,observations:{kind:'all',observedAt:at,updatedAt:'advance'}};b.packet=O.consolidateObservations(db,digest,b.packet,entry);await chrome.storage.local.set({[O.OBSERVATION_HEAD_KEY]:O.observationHead(b.packet),[O.OBSERVATION_KEY]:b.packet});await new Promise(done=>setTimeout(done,20));}
    for(const name of Object.keys(b.cases)){const r=await b.call(name);(stats[name]??=[]).push(r.ms);if(name==='exact'){first.push(r.ms);if(!baseline&&r.result.results[0].matches.find(m=>m.provider==='steam').evidence.checkedAt!==at)throw Error('Stale evidence');}}
   }
   return {afterRevision:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,b.summary(v)])),firstRequestIncludingMaterialization:b.summary(first)};
  `);
  const cold=[];
  for(let n=0;n<5;n++){
   const previous=await evaluate(`return (await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'})).activity.worker;`);
   await driver.send('ServiceWorker.enable',{},sessionId);await driver.send('ServiceWorker.stopAllWorkers',{},sessionId);
   for(let attempt=0;attempt<100;attempt++){
    const all=await driver.send('Target.getTargets');if(!all.targetInfos.some(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://'+installed.id+'/')))break;
    if(attempt===99)throw Error('Worker did not stop');await new Promise(done=>setTimeout(done,20));
   }
   const result=await evaluate(`const b=globalThis.observationBenchmark,r=await b.call('bundle'),worker=(await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'})).activity.worker;return {ms:r.ms,worker};`);
   assert.notEqual(result.worker,previous,'Worker generation did not change');cold.push(result.ms);
  }
  const coldStats=await evaluate(`return globalThis.observationBenchmark.summary(${JSON.stringify(cold)});`);
  const row={size:Object.keys(db.providerItems).length,warm,...revisions,coldWorkerBundle:coldStats,workerGenerationsVerified:5};results.push(row);console.log(JSON.stringify(row));
  await writeFile(output,JSON.stringify({format:1,root,baseline,environment:'Packaged Chrome; native chrome.storage.local/session; internal worker MATCH_ITEMS route with real API/matcher; 20 warm, 12 observation revisions, five actually stopped/restarted workers. First exact request includes effective-view materialization. Other post-revision cases reuse that view. Injection, event-delivery wait and cold stop are outside request timings. Synthetic varied library, not a live provider or an HB/FAN UI measurement.',results},null,2)+'\n');
 }
 console.log('Wrote',output);
}finally{
 if(child&&child.exitCode===null){child.kill();await Promise.race([exited,new Promise(done=>setTimeout(done,3000))]);}
 if(resolve(temporary).startsWith(resolve(tmpdir())+sep))await rm(temporary,{recursive:true,force:true,maxRetries:20,retryDelay:100});
}
