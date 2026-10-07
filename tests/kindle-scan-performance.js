import assert from 'node:assert/strict';
import {equalDatabaseData} from '../src/lib/data-equality.js';
import '../src/lib/kindle-contents-scan.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createEmptyDatabase} from '../src/lib/models.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
import {kindleContentsPlan} from '../src/lib/kindle-contents.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {withWorker} from './storage.js';

const tools=globalThis.GalacticContentsScan;
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().reverse().map(key=>[key,ordered(value[key])])):value;
function memory(reorder=false) {
 const values={};let writes=0,fail=false;
 const area={get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>{if(fail)throw Error('Synthetic checkpoint failure');writes++;Object.assign(values,reorder?ordered(structuredClone(updates)):structuredClone(updates));}};
 return {values,area,get writes(){return writes;},set fail(value){fail=value;}};
}
async function seeded(count=21,reorder=false){
 const store=memory(reorder),writer=createStorageWriter(store.area);
 await writer.mergeProviderItems('kindle',Array.from({length:count},(_,n)=>({providerItemId:'B'+String(n+1).padStart(9,'0'),title:'Fixture collection '+n,mediaType:'book',ownership:n%2?'unknown':'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B'+String(n+1).padStart(9,'0'),originType:n%2?'Unknown':'Purchase'}})));
 const db=await writer.getDatabase();
 const entries=Object.values(db.providerItems).map(item=>({itemId:item.id,recordRef:item.recordRef,sourceUrl:item.metadata.detailUrl,statement:'Includes First Work and Second Work',availability:'statement-found',extractorVersion:2}));
 return {store,writer,db,entries};
}
const state=patch=>({runRef:'12345678-1234-1234-1234-123456789abc',phase:'running',mode:'scan',checked:3,total:20,found:1,empty:1,unavailable:1,failures:0,reparsed:0,durable:0,buffered:3,...patch});

export const kindleScanPerformanceTests=[
 ['refresh controls stay gated through delayed state loading and reject a click begun during resolution',()=>{
  const controls=tools.refreshControlsState(),token=controls.begin();
  assert.equal(controls.ready,false);assert.equal(controls.allowGesture(),false);
  controls.captureGesture();controls.resolve(token,{ok:true,checkpoint:{status:'paused',cursor:37,total:100}});
  assert.equal(controls.ready,true);assert.equal(controls.allowGesture(),false);
  controls.captureGesture();assert.equal(controls.allowGesture(),true);
 }],
 ['refresh controls ignore stale checkpoint responses and fail closed after an unavailable read',()=>{
  const controls=tools.refreshControlsState(),old=controls.begin(),current=controls.begin();
  assert.equal(controls.resolve(old,{ok:true}),false);assert.equal(controls.ready,false);
  controls.resolve(current,{ok:false});assert.equal(controls.ready,false);assert.equal(controls.result,null);
  const next=controls.begin();controls.resolve(next,{ok:true});controls.captureGesture();controls.invalidate();
  assert.equal(controls.resolve(next,{ok:true}),false);assert.equal(controls.allowGesture(),false);
 }],
 ['only unfinished refreshes resume; restarting names completed/total progress and preserves source evidence',()=>{
  for(const status of ['running','paused','interrupted','blocked']){
   const job={status,cursor:37,total:100};assert.equal(tools.resumableRefresh(job),true);
   assert.match(tools.refreshRestartConfirmation(job),/completed\/total progress \(37\/100\) will be abandoned/);
   assert.match(tools.refreshRestartConfirmation(job),/contents and source history will be kept/);
  }
  for(const status of ['completed','aborted','stale',undefined])assert.equal(tools.resumableRefresh({status}),false);
  assert.match(tools.refreshRestartConfirmation({status:'completed',cursor:100,total:100}),/completed\/total progress \(100\/100\) will be abandoned/);
  assert.match(tools.refreshRestartConfirmation({status:'stale'}),/cannot be resumed/);
 }],
 ['migration comparison ignores object order, preserves array order and detects real changes',()=>{
  assert.equal(equalDatabaseData({a:1,b:{x:[1,2],y:null}},{b:{y:null,x:[1,2]},a:1}),true);
  assert.equal(equalDatabaseData({a:[1,2]},{a:[2,1]}),false);
  assert.equal(equalDatabaseData({a:1},{a:2}),false);assert.equal(equalDatabaseData({a:null},{a:undefined}),false);
  assert.equal(equalDatabaseData({a:1,b:2},{a:1}),false);assert.equal(equalDatabaseData({},[]),false);
 }],
 ['stable database reads never migrate, including a storage backend that reorders every object',async()=>{
  for(const reorder of [false,true]){
   const {store,writer}=await seeded(3,reorder),before=store.writes;
   for(let n=0;n<5;n++)await writer.getDatabase();
   assert.equal(store.writes,before,'A semantically unchanged read wrote the database.');
  }
 }],
 ['schema/metadata migrations still persist once and legacy backups remain compatible',async()=>{
  const store=memory(true);store.values[DATABASE_STORAGE_KEY]={...createEmptyDatabase(),schemaVersion:11};delete store.values[DATABASE_STORAGE_KEY].ownershipPolicy;
  const writer=createStorageWriter(store.area);const db=await writer.getDatabase();assert.equal(db.schemaVersion,13);assert.equal(store.writes,1);assert.equal(db.ownershipPolicy.allOwned,false);
  await writer.getDatabase();assert.equal(store.writes,1);assert.deepEqual(parseBackup(createBackup(db)),db);
  store.values[DATABASE_STORAGE_KEY].schemaVersion=999;await assert.rejects(writer.getDatabase(),/Unsupported database schema/);assert.equal(store.writes,1);
 }],
 ['contents batches commit at 20 results or an elapsed minute, removing only acknowledged results',async()=>{
  let clock=0;const buffer=tools.checkpointBuffer(()=>clock),batches=[];
  for(let n=0;n<19;n++)buffer.add({n});assert.equal(buffer.due(),false);buffer.add({n:19});assert.equal(buffer.due(),true);
  await assert.rejects(buffer.flush(async()=>{throw Error('failed');}),/failed/);assert.equal(buffer.size,20);
  assert.equal(await buffer.flush(async entries=>batches.push(entries)),20);assert.equal(buffer.size,0);
  buffer.add({n:20});clock=60000;assert.equal(buffer.due(),true);await buffer.flush(async entries=>batches.push(entries));assert.deepEqual(batches.map(batch=>batch.length),[20,1]);
 }],
 ['pause/tail checkpoints persist all results; restart repeats only the interrupted unflushed tail',async()=>{
  const {store,writer,entries}=await seeded(),buffer=tools.checkpointBuffer(),before=store.writes;
  const save=batch=>writer.saveKindleComicContents(batch);
  for(const entry of entries.slice(0,20))buffer.add(entry);await buffer.flush(save);
  buffer.add(entries[20]);assert.equal(store.writes-before,1);
  const restarted=createStorageWriter(store.area);assert.equal(kindleContentsPlan(await restarted.getDatabase()).candidates.length,1);
  await buffer.flush(save);assert.equal(store.writes-before,2);
  assert.equal(kindleContentsPlan(await restarted.getDatabase()).candidates.length,0);
 }],
 ['failed or stale batched checkpoints are atomic and keep prior library data intact',async()=>{
  const {store,writer,entries}=await seeded(3),before=structuredClone(store.values[DATABASE_STORAGE_KEY]);
  await assert.rejects(writer.saveKindleComicContents([entries[0],{...entries[1],recordRef:'stale'}]),/Invalid/);assert.deepEqual(store.values[DATABASE_STORAGE_KEY],before);
  const buffer=tools.checkpointBuffer();entries.forEach(entry=>buffer.add(entry));store.fail=true;
  await assert.rejects(buffer.flush(batch=>writer.saveKindleComicContents(batch)),/checkpoint failure/);assert.equal(buffer.size,3);assert.deepEqual(store.values[DATABASE_STORAGE_KEY],before);
  store.fail=false;await buffer.flush(batch=>writer.saveKindleComicContents(batch));assert.equal(buffer.size,0);assert.equal(kindleContentsPlan(await writer.getDatabase()).candidates.length,0);
 }],
 ['batched discovery preserves original ownership, grouping, reviews and proposal interpretation',async()=>{
  const {writer,db,entries}=await seeded(3);
  await writer.saveContentReview(entries[0].itemId,{statement:'Collects Fixture #1',entries:[{series:'Fixture',run:'',unitType:'issue',number:'1',language:'',completeness:'full'}]});
  const before=await writer.getDatabase();await writer.saveKindleComicContents(entries);const after=await writer.getDatabase();
  assert.deepEqual(after.contentReviews,before.contentReviews);assert.deepEqual(after.ownershipPolicy,before.ownershipPolicy);assert.deepEqual(after.manualMatchDecisions,before.manualMatchDecisions);
  assert.deepEqual(after.canonicalItems,before.canonicalItems);
  for(const [id,item] of Object.entries(db.providerItems)){
   const next=after.providerItems[id];for(const key of ['recordRef','provider','providerItemId','title','mediaType','ownership','observedAt'])assert.deepEqual(next[key],item[key]);
   assert.equal(next.metadata.originType,item.metadata.originType);assert.equal(next.metadata.enrichment.kindleProductComicContents.parseOutcome,'full');
  }
 }],
 ['lightweight progress is bounded, strips library fields, and interrupted workers/tabs cannot remain active forever',()=>{
  let clock=0;const hub=tools.progressHub(()=>clock);
  const runs=hub.accept(1,{...state(),title:'PRIVATE_TITLE',account:'PRIVATE_ACCOUNT',statement:'PRIVATE_STATEMENT'});assert.ok(!JSON.stringify(runs).includes('PRIVATE'));
  assert.throws(()=>hub.accept(1,state({checked:2,unavailable:0,buffered:2})),/backwards/);assert.throws(()=>hub.accept(1,state({buffered:21})),/Inconsistent/);
  hub.interrupt(1);assert.equal(hub.list()[0].phase,'interrupted');
  hub.accept(2,state());clock=600001;assert.equal(hub.list()[1].phase,'interrupted');
  for(let n=3;n<15;n++)hub.accept(n,state());assert.equal(hub.list().length,8);assert.equal(tools.progressHub().list().length,0);
 }],
 ['worker progress messages require the Kindle sender and expose counts only to GL pages',async()=>withWorker(async({dispatch})=>{
  const runtime=globalThis.chrome.runtime;runtime.sendMessage=async()=>({ok:true});
  const sender={id:runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}};
  const response=await dispatch({type:'KINDLE_CONTENTS_SCAN_PROGRESS',progress:{...state(),title:'PRIVATE_TITLE'}},sender);assert.equal(response.ok,true);
  const read=await dispatch({type:'GET_KINDLE_CONTENTS_SCAN_PROGRESS'},{id:runtime.id,url:runtime.getURL('options.html')});assert.equal(read.ok,true);assert.equal(read.runs[0].checked,3);assert.ok(!JSON.stringify(read).includes('PRIVATE'));
  assert.equal((await dispatch({type:'GET_KINDLE_CONTENTS_SCAN_PROGRESS'},sender)).ok,false);
  assert.equal((await dispatch({type:'KINDLE_CONTENTS_SCAN_PROGRESS',progress:state()},{...sender,url:'https://example.com'})).ok,false);
 })],
];
