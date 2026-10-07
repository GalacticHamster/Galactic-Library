import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createWorkerLifecycleDiagnostics,WORKER_LIFECYCLE_KEY,ACTIVITY_CHECKPOINT_MS} from '../src/lib/worker-lifecycle-diagnostics.js';
import {createQueryDiagnostics} from '../src/lib/query-diagnostics.js';
import {withWorker} from './storage.js';

const store=()=>{const values={},writes=[];return {values,writes,area:{get:async key=>({[key]:structuredClone(values[key])}),set:async updates=>{writes.push(structuredClone(updates));Object.assign(values,structuredClone(updates));}}};};
const identity=n=>String(n).repeat(12);
export const workerLifecycleDiagnosticsTests=[
 ['two worker generations retain only tiny lifecycle summaries, the last completed companion and a recorded activity gap',async()=>{
  const memory=store();let time=1000;
  const first=createWorkerLifecycleDiagnostics({area:memory.area,worker:identity(1),startedEpochMs:time,clock:()=>time});await first.ready;
  time=2500;first.completed('MATCH_ITEMS');await nextTurn();assert.equal(memory.writes.length,2);
  first.observe('PRIVATE_TITLE');
  time=33000;const second=createWorkerLifecycleDiagnostics({area:memory.area,worker:identity(2),startedEpochMs:time,clock:()=>time});await second.ready;
  const report=await second.report();assert.equal(report.previous.worker,identity(1));assert.equal(report.previous.startedEpochMs,1000);assert.equal(report.previous.lastActivityEpochMs,2500);assert.equal(report.previous.lastActivityType,'external_completed:MATCH_ITEMS');
  assert.equal(report.previous.lastCompletedExternalEpochMs,2500);assert.equal(report.previous.lastCompletedExternalType,'MATCH_ITEMS');assert.equal(report.gapFromPreviousRecordedActivityMs,30500);assert.equal(report.shutdownReason,null);
  time=66000;const third=createWorkerLifecycleDiagnostics({area:memory.area,worker:identity(3),startedEpochMs:time,clock:()=>time});await third.ready;
  assert.equal((await third.report()).previous.worker,identity(2));assert.ok(!JSON.stringify(memory.values).includes(identity(1)));assert.ok(JSON.stringify(memory.values).length<1600);assert.ok(!JSON.stringify(memory.values).includes('PRIVATE_TITLE'));
 }],
 ['activity sampling writes only on existing activity after ten seconds; completions checkpoint without waiting and diagnostic callbacks do not count as requests',async()=>{
  const memory=store();let time=1000;
  const life=createWorkerLifecycleDiagnostics({area:memory.area,worker:identity(1),startedEpochMs:time,clock:()=>time});await life.ready;
  const journal=createQueryDiagnostics({clock:()=>time,worker:identity(1),onActivity:stage=>life.observe(stage)});
  for(let n=0;n<1000;n++){time=1000+n*9;journal.event('storage_get');}await nextTurn();assert.equal(memory.writes.length,1);
  time=1000+ACTIVITY_CHECKPOINT_MS;journal.event('storage_get');await nextTurn();assert.equal(memory.writes.length,2);
  time+=100;assert.equal(life.completed('MATCH_ITEMS'),undefined);await nextTurn();assert.equal(memory.writes.length,3);
  time+=10;life.observe('companion_diagnostic_callback');life.completed('MATCH_ITEMS_DIAGNOSTIC_CALLBACK');await nextTurn();assert.equal(memory.writes.length,3);
  assert.equal((await life.report()).current.lastCompletedExternalType,'MATCH_ITEMS');
  const last=memory.writes.length;time+=100000;assert.equal(memory.writes.length,last,'Idle time scheduled a write/heartbeat');
 }],
 ['pending writes coalesce critical completions into one follow-up containing the newest state',async()=>{
  const memory=store();let time=1000;const life=createWorkerLifecycleDiagnostics({area:memory.area,worker:identity(1),startedEpochMs:time,clock:()=>time});await life.ready;
  const set=memory.area.set;let release;const gate=new Promise(done=>release=done);let held=true;
  memory.area.set=async updates=>{if(held){held=false;await gate;}return set(updates);};
  time=2000;life.completed('MATCH_ITEMS');await nextTurn();
  for(let n=0;n<20;n++){time+=1;life.completed('GET_STATUS');}assert.equal(memory.writes.length,1);
  release();await nextTurn();await nextTurn();assert.equal(memory.writes.length,3);assert.equal(memory.values[WORKER_LIFECYCLE_KEY].current.lastCompletedExternalEpochMs,2020);
 }],
 ['initialization respects access readiness and failures remain diagnostic-only without fallback library writes',async()=>{
  const memory=store();let release;const gate=new Promise(done=>release=done);let time=1000;
  const life=createWorkerLifecycleDiagnostics({area:memory.area,ready:gate,worker:identity(1),startedEpochMs:time,clock:()=>time});time=2000;life.completed('MATCH_ITEMS');await nextTurn();assert.equal(memory.writes.length,0);
  release();await life.ready;assert.equal(memory.writes.length,1);assert.equal(memory.values[WORKER_LIFECYCLE_KEY].current.lastCompletedExternalEpochMs,2000);
  const failed=createWorkerLifecycleDiagnostics({area:{get:async()=>{throw Error('Unavailable');},set:()=>assert.fail('Wrote after failed read')},worker:identity(2),startedEpochMs:3000});
  await failed.ready;assert.equal((await failed.report()).status,'unavailable');assert.doesNotThrow(()=>failed.completed('MATCH_ITEMS'));
  const failedWrite=createWorkerLifecycleDiagnostics({area:{get:async()=>({}),set:async()=>{throw Error('Session write failed');}},worker:identity(2),startedEpochMs:3000});
  await failedWrite.ready;assert.equal((await failedWrite.report()).status,'write-failed');assert.equal(failedWrite.completed('MATCH_ITEMS'),undefined);await nextTurn();
  const denied=createWorkerLifecycleDiagnostics({area:memory.area,ready:Promise.reject(Error('Access denied')),worker:identity(2),startedEpochMs:3000});await denied.ready;assert.equal((await denied.report()).status,'unavailable');
 }],
 ['stored data is sanitized and platform event reasons remain observations rather than invented shutdown causes',async()=>{
  const memory=store();memory.values[WORKER_LIFECYCLE_KEY]={format:1,current:{worker:identity(1),startedEpochMs:1000,lastActivityEpochMs:2000,lastActivityType:'PRIVATE_TITLE',recordedAtEpochMs:2001,journal:['PRIVATE_INVENTORY']}};
  let time=3000;const life=createWorkerLifecycleDiagnostics({area:memory.area,worker:identity(2),startedEpochMs:time,clock:()=>time});await life.ready;assert.equal((await life.report()).previous,null);
  time=4000;life.platformEvent('onInstalled','update');await nextTurn();const report=await life.report();assert.equal(report.current.platformEventReason,'update');assert.equal(report.shutdownReason,null);
  life.platformEvent('onInstalled','guessed-idle-timeout');await nextTurn();assert.equal((await life.report()).current.platformEventReason,null);assert.ok(!JSON.stringify(memory.values).includes('PRIVATE_'));assert.ok(!JSON.stringify(memory.values).includes('guessed-idle'));
 }],
 ['the existing Options diagnostics export correlates two real worker generations using shared session storage',async()=>{
  const sessionState={};let first;
  await withWorker(async({memory,dispatchExternal,dispatch})=>{
    const hb='a'.repeat(32);memory.values.galacticLibraryAllowedExternalClientIds=[hb];
    const response=await dispatchExternal({type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Synthetic',mediaType:'book'}]},{id:hb});assert.equal(response.ok,true);await nextTurn();
    first=(await dispatch({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'},{id:chrome.runtime.id,url:chrome.runtime.getURL('options.html')})).lifecycle;
    assert.equal(first.current.lastCompletedExternalType,'MATCH_ITEMS');
  },{sessionState,concurrentQueries:true});
  await withWorker(async({dispatch})=>{
    const response=await dispatch({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'},{id:chrome.runtime.id,url:chrome.runtime.getURL('options.html')});
    assert.equal(response.ok,true);assert.equal(response.lifecycle.previous.worker,first.current.worker);assert.equal(response.lifecycle.previous.lastCompletedExternalEpochMs,first.current.lastCompletedExternalEpochMs);assert.notEqual(response.lifecycle.current.worker,first.current.worker);assert.equal(response.companions.length,0);
  },{sessionState,concurrentQueries:true});
 }],
 ['a hung breadcrumb write does not hold the external companion matching response',()=>withWorker(async({memory,dispatchExternal})=>{
  const hb='a'.repeat(32);memory.values.galacticLibraryAllowedExternalClientIds=[hb];
  chrome.storage.session.set=()=>new Promise(()=>{});
  const response=await Promise.race([dispatchExternal({type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Synthetic',mediaType:'book'}]},{id:hb}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Matching waited for the lifecycle write')),500))]);
  assert.equal(response.ok,true);
 },{concurrentQueries:true})]
];
