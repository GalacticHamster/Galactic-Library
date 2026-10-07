import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import '../src/lib/kindle-contents-scan.js';
import '../src/providers/kindle.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';

const tools=globalThis.GalacticContentsScan,perf=globalThis.GalacticContentsPerformance;
const id=n=>'lookup-aabbccddeeff-'+String(n).padStart(3,'0');
function pacing(late=0){
 let now=0;const starts=[],waits=[];
 const pacer=tools.requestStartPacer({clock:()=>now,wait:async ms=>{waits.push(ms);now+=ms+late;}});
 return {pacer,starts,waits,get now(){return now;},advance:ms=>{now+=ms;},async request(duration=0){return pacer.start(()=>{starts.push(now);now+=duration;return duration;});}};
}
function fixture(){
 const db=createEmptyDatabase();
 for(let n=1;n<=3;n++){
  const item=normalizeProviderItem({provider:'kindle',providerItemId:'B'+String(n).padStart(9,'0'),title:'Synthetic '+n,mediaType:'book',ownership:'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B'+String(n).padStart(9,'0'),authors:['Synthetic Writer'],originType:'Purchase'}});db.providerItems[item.id]=item;
 }
 const ids=Object.keys(db.providerItems);db.manualMatchDecisions.barrier={decision:'different',itemIds:ids.slice(0,2),updatedAt:'2026-10-01'};
 return validateDatabase(db);
}
async function seeded(cache=true){
 const values={galacticLibraryDatabase:fixture()},writes=[];
 const area={get:async defaults=>Object.fromEntries(Object.keys(defaults).map(k=>[k,structuredClone(values[k]??defaults[k])])),set:async updates=>{writes.push(structuredClone(updates));Object.assign(values,structuredClone(updates));}};
 const writer=createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:cache});
 await writer.getQueryDatabase();const plan=await writer.beginKindleContentsRefresh('start',1);
 const entries=plan.candidates.map((item,n)=>({itemId:item.id,recordRef:item.recordRef,queuePosition:n,sourceUrl:item.detailUrl,statement:'Collects Synthetic #1-2',availability:'statement-found',extractorVersion:5}));
 const commit=async(batch=entries.slice(0,1),n=1)=>{const trace=perf.trace(id(n),'checkpoint');const summary=await writer.execute('commitKindleContentsRefresh',[batch,plan.refresh.runRef,plan.refresh.leaseRef,1],trace);return {trace,summary};};
 return {writer,area,values,writes,entries,commit};
}
export const refreshWritePacingTests=[
 ['request-start pacing waits only the remaining interval, allows slow completions immediately and never overlaps acquisition',async()=>{
  const p=pacing();await p.request();p.advance(400);await p.request();p.advance(2100);await p.request();
  assert.deepEqual(p.starts,[0,1000,3100]);assert.deepEqual(p.waits,[600]);
  let finish,active=0,maxActive=0;const q=pacing();
  const fetch=()=>q.pacer.start(()=>{active++;maxActive=Math.max(maxActive,active);return new Promise(r=>finish=()=>{active--;r();});});
  const first=fetch();finish();await first;q.advance(2100);const second=fetch();finish();await second;assert.equal(maxActive,1);
 }],
 ['late hidden timers and early timer wakes are rechecked rather than allowing a burst',async()=>{
  const p=pacing(800);await p.request();p.advance(400);await p.request();await p.request();assert.deepEqual(p.starts,[0,1800,3600]);
  let now=0,early=true;const starts=[],waits=[];
  const gate=tools.requestStartPacer({clock:()=>now,wait:async ms=>{waits.push(ms);now+=early?(early=false,ms/2):ms;}});
  for(let n=0;n<3;n++)await gate.start(()=>starts.push(now));
  assert.deepEqual(starts,[0,1000,2000]);assert.deepEqual(waits,[1000,500,1000]);
 }],
 ['retry backoff, immediate errors, pause/resume and checkpoint time retain a single request-start floor',async()=>{
  const p=pacing();await assert.rejects(p.pacer.start(()=>{p.starts.push(p.now);throw Error('network');}),/network/);
  p.advance(2000);await p.request();p.advance(4000);await p.request(); // Original retry delays remain separate.
  const paused=new AbortController();paused.abort();await assert.rejects(p.pacer.start(()=>assert.fail('paused request'),{signal:paused.signal}),{name:'AbortError'});
  p.advance(100);await p.request();p.advance(6000);await p.request();
  assert.deepEqual(p.starts,[0,2000,6000,7000,13000]);assert.deepEqual(p.waits,[900]);
 }],
 ['pause while waiting admits no request and resume retains the prior actual start',async()=>{
  let now=0,resolve;const starts=[],controller=new AbortController();
  const gate=tools.requestStartPacer({clock:()=>now,wait:ms=>new Promise(r=>resolve=()=>{now+=ms;r();})});
  await gate.start(()=>starts.push(now));const waiting=gate.start(()=>assert.fail('aborted wait fetched'),{signal:controller.signal});
  controller.abort();resolve();await assert.rejects(waiting,{name:'AbortError'});
  await gate.start(()=>starts.push(now));assert.deepEqual(starts,[0,1000]);
 }],
 ['the real Kindle adapter gates actual fetch dispatch and excludes pacing from fetch-header timing',async()=>{
  const originalFetch=globalThis.fetch,originalLocation=globalThis.location;const p=pacing();const traces=[];
  try{
   globalThis.location={origin:'https://www.amazon.com'};
   globalThis.fetch=async()=>{p.starts.push(p.now);return {status:404};};
   for(let n=1;n<=3;n++){const timing=perf.trace(id(n),'network',()=>p.now);timing.attempts=1;traces.push(timing);await globalThis.GalacticKindle.fetchKindleProductComicContents('https://www.amazon.com/dp/B000000001',{requestPacer:p.pacer,timing});}
   assert.deepEqual(p.starts,[0,1000,2000]);assert.equal(traces[1].events.find(e=>e.stage==='throttle').durationMs,1000);
   assert.equal(traces[1].events.find(e=>e.stage==='fetch_headers').durationMs,0);
  }finally{globalThis.fetch=originalFetch;globalThis.location=originalLocation;}
 }],
 ['actual retry helper keeps three attempts, separate 2/4-second backoff and arms each 30-second timeout only at dispatch',async()=>{
  const source=await readFile(new URL('../src/providers/kindle-content.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('  function wait('),source.indexOf('  async function enrichComicContents('));
  assert.ok(body.includes('fetchComicContentsWithRetry'));
  const p=pacing(),starts=[],timeouts=[],cleared=[];let attempts=0,timer=0;
  await p.request();p.advance(100); // Prior request from a preceding run.
  const retry=vm.runInNewContext(`let activeContentsRequest=null,pauseComicContentsRequested=false;${body};fetchComicContentsWithRetry`,{
   contentsRequestPacer:p.pacer,AbortController,status:{textContent:''},
   setTimeout:(callback,ms)=>{const id=++timer;if(ms===30000)timeouts.push({id,at:p.now});else{p.advance(ms);callback();}return id;},clearTimeout:id=>cleared.push(id),
   globalThis:{GalacticKindle:{fetchKindleProductComicContents:async(_url,{requestPacer,signal,timing})=>requestPacer.start(()=>{starts.push(p.now);if(++attempts<3)throw Error('Network failure');return {availability:'no-statement'};},{signal,timing})}}
  });
  assert.equal((await retry({detailUrl:'fixture'},1,1,null)).availability,'no-statement');
  assert.deepEqual(starts,[1000,3000,7000]);assert.deepEqual(timeouts.map(x=>x.at),starts);assert.ok(timeouts.every(x=>cleared.includes(x.id)));assert.equal(attempts,3);
 }],
 ['trusted refresh compares fresh full storage before detached reuse, validates outgoing data and preserves matching/database results',async()=>{
  const s=await seeded(),before=structuredClone(s.values.galacticLibraryDatabase),snapshot=await s.writer.getQueryDatabase();
  const result=await s.commit();const stages=new Set(result.trace.events.map(e=>e.stage));
  for(const name of ['storage_read','read_committed_compare','read_committed_clone','persist_validation','validation_canonical','storage_set_dispatch','storage_set_wait','snapshot_clone','snapshot_freeze'])assert.ok(stages.has(name),name);
  assert.equal(stages.has('read_validation'),false);assert.equal(result.summary.cursor,1);
  assert.deepEqual(snapshot,before,'Refresh mutated the validated committed view');
  const after=s.values.galacticLibraryDatabase;assert.deepEqual(after,validateDatabase(after));assert.deepEqual(after.canonicalItems,before.canonicalItems);
  const request={type:'MATCH_ITEMS',apiVersion:1,items:Object.values(before.providerItems).map(item=>({title:item.title,mediaType:'book'}))};
  assert.deepEqual(handleExternalApiRequest(after,request),handleExternalApiRequest(before,request));
  const write=s.writes.at(-1);assert.ok(write.galacticLibraryDatabase&&write.galacticLibraryKindleContentsRefresh,'Evidence and cursor split into separate writes');
  assert.deepEqual(await s.writer.getDatabase(),after);
 }],
 ['unobserved storage edits, missing/cold snapshots and disabled snapshot caching use full incoming validation',async()=>{
  for(const mode of ['edited','invalidated','disabled']){
   const s=await seeded(mode!=='disabled');
   if(mode==='edited')s.values.galacticLibraryDatabase.providerItems[s.entries[1].itemId].metadata.authors=['Changed Author'];
   if(mode==='invalidated')s.writer.invalidateQuerySnapshot();
   const {trace}=await s.commit();assert.ok(trace.events.some(e=>e.stage==='read_validation'),mode);assert.equal(trace.events.some(e=>e.stage==='read_committed_clone'),false);
   if(mode==='edited')assert.deepEqual(s.values.galacticLibraryDatabase.providerItems[s.entries[1].itemId].metadata.authors,['Changed Author']);
  }
 }],
 ['worker restart and legacy repair retain full validation, migration and atomic checkpoint behavior',async()=>{
  for(const mode of ['restart','legacy']){
   const s=await seeded();let writer=s.writer;
   if(mode==='restart')writer=createStorageWriter(s.area,Promise.resolve(),{cacheQuerySnapshots:true});
   else{s.values.galacticLibraryDatabase.schemaVersion=11;delete s.values.galacticLibraryDatabase.ownershipPolicy;}
   const job=s.values.galacticLibraryKindleContentsRefresh,trace=perf.trace(id(2),'checkpoint');
   const summary=await writer.execute('commitKindleContentsRefresh',[s.entries.slice(0,1),job.runRef,job.leaseRef,1],trace);
   assert.equal(summary.cursor,1);assert.ok(trace.events.some(e=>e.stage==='read_validation'));assert.equal(trace.events.some(e=>e.stage==='read_committed_clone'),false);
   if(mode==='legacy'){assert.ok(trace.events.some(e=>e.stage==='migration_write'));assert.equal(s.values.galacticLibraryDatabase.schemaVersion,13);}
   if(mode==='restart'){
    const next=perf.trace(id(3),'checkpoint');await writer.execute('commitKindleContentsRefresh',[s.entries.slice(1,2),job.runRef,job.leaseRef,1],next);
    assert.ok(next.events.some(e=>e.stage==='read_committed_clone'),'A successful cold commit did not publish proof for the next batch');
   }
  }
 }],
 ['full incoming fallback still rejects corrupt unrelated history, duplicate references and review evidence',async()=>{
  for(const corrupt of [db=>{db.enrichmentHistory.bad={};},db=>{Object.values(db.providerItems)[1].recordRef=Object.values(db.providerItems)[0].recordRef;},db=>{db.contentReviews[Object.keys(db.providerItems)[1]]={entries:[{series:'Bad',unitType:'issue',number:'-1'}]};}]){
   const s=await seeded(),cursor=s.values.galacticLibraryKindleContentsRefresh.cursor;corrupt(s.values.galacticLibraryDatabase);
   await assert.rejects(s.commit());assert.equal(s.values.galacticLibraryKindleContentsRefresh.cursor,cursor);
  }
 }],
 ['corrupt external data and failed checkpoint writes cannot retain false trusted state or advance cursor',async()=>{
  const s=await seeded(),before=structuredClone(s.values);
  s.values.galacticLibraryDatabase.providerItems[s.entries[1].itemId].title='';
  await assert.rejects(s.commit(),/title/i);assert.deepEqual(s.values.galacticLibraryKindleContentsRefresh,before.galacticLibraryKindleContentsRefresh);
  s.values.galacticLibraryDatabase=structuredClone(before.galacticLibraryDatabase);
  const set=s.area.set;s.area.set=async updates=>{if(updates.galacticLibraryDatabase)throw Error('Synthetic atomic failure');return set(updates);};
  await assert.rejects(s.commit(),/atomic failure/);assert.deepEqual(s.values,before);assert.deepEqual(await s.writer.getQueryDatabase(),before.galacticLibraryDatabase);
  s.area.set=set;const {summary}=await s.commit();assert.equal(summary.cursor,1);
 }],
 ['write substage diagnostics do not double-count nested native wait and snapshot work',()=>{
  let now=0;const trace=perf.trace(id(1),'checkpoint',()=>now),outer=trace.begin('storage_write');
  for(const [stage,ms]of [['storage_set_dispatch',5],['storage_set_wait',6000],['snapshot_clone',300],['snapshot_freeze',100]]){const end=trace.begin(stage);now+=ms;end();}
  outer();const compare=trace.begin('read_committed_compare');now+=50;compare();const clone=trace.begin('read_committed_clone');now+=300;clone();
  const row=perf.breakdown(perf.clean(trace.finish('checkpointed')));assert.equal(row.persistence,6755);assert.equal(row.accountingOverlap,0);assert.equal(row.unexplained,0);
 }]
];
