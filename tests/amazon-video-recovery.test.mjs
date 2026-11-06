import test from 'node:test';
import assert from 'node:assert/strict';
import {withWorker,snapshotFixture} from './storage.js';
import {performanceWriter} from './provider-performance-fixture.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateProviderSnapshot} from '../src/lib/provider-snapshot.js';

const provider='amazon-video';
const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://www.amazon.com/gp/video/library',tab:{id:72}};
const item=n=>({providerItemId:'amzn1.dv.gti.synthetic-'+n,title:'Synthetic Video '+n,mediaType:n%2?'movie':'tv',ownership:'owned',metadata:{ownershipEvidence:'You purchased this',libraryView:'purchases-and-rentals'}});
const receipt=items=>({version:1,provider,complete:false,itemCount:items.length,scopes:[{id:'library',readCount:items.length,expectedCount:null,end:'partial-acquisition',pagesRead:4,complete:false,limitReached:false}],recovery:{unreadableCards:1}});
const plain=value=>JSON.parse(JSON.stringify(value));
const begin=w=>w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider,beginScan:true,confirmed:true,profileLabel:'Synthetic',mode:'full'},sender);
const commit=(w,start,items,snapshot=receipt(items),from=sender)=>w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider,mode:'full',items,snapshot,scanToken:start.scanToken},from);

test('Amazon Video partial receipt preserves 20 purchases, history, corrections and unrelated records; normal retry clears marker',()=>withWorker(async w=>{
  const old=[item(1),item(98),item(99)];await w.pageA.replaceProviderItems(provider,old,{profileLabel:'Synthetic',fullSyncAt:'2026-10-01'},snapshotFixture(provider,old));
  let d=await w.pageA.replaceProviderItems(provider,[old[0],old[2]],{profileLabel:'Synthetic'},snapshotFixture(provider,[old[0],old[2]]));
  const ref=Object.values(d.providerItems).find(i=>i.providerItemId===old[0].providerItemId).recordRef;
  await w.pageA.saveOwnershipReview(ref,{ownership:'unknown',note:'Keep review',evidenceDate:'2026-10-01'});
  await w.pageA.mergeProviderItems('steam',[{providerItemId:'1',title:'Other provider',mediaType:'game',ownership:'owned'}]);
  const before=await w.pageA.getDatabase(),items=Array.from({length:20},(_,n)=>item(n+1));
  const saved=await commit(w,await begin(w),[...items,item(98)]);assert(saved.ok,saved.error);assert.equal(saved.savedCount,20);
  d=await w.pageA.getDatabase();assert.equal(Object.values(d.providerItems).filter(i=>i.provider===provider).length,21);
  assert.deepEqual(d.providerHistory,before.providerHistory);assert.deepEqual(d.ownershipReviews,before.ownershipReviews);assert.equal(d.providers[provider].fullSyncAt,before.providers[provider].fullSyncAt);
  assert.deepEqual(Object.values(d.providerItems).filter(i=>i.provider==='steam'),Object.values(before.providerItems).filter(i=>i.provider==='steam'));
  assert(d.providers[provider].syncState.listingIncomplete);assert.equal(d.providers[provider].syncHealth.status,'partial');
  await w.pageA.restoreDatabase(parseBackup(createBackup(d)));d=await w.pageA.getDatabase();assert(d.providers[provider].syncState.listingIncomplete);
  const state=await w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider,beginScan:false},sender);assert(state.syncState.listingIncomplete);
  const bounded=await w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider,beginScan:true,confirmed:true,profileLabel:'Synthetic',mode:'incremental'},sender);
  assert((await w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider,mode:'incremental',items:[],scanToken:bounded.scanToken},sender)).ok);
  assert((await w.pageA.getDatabase()).providers[provider].syncState.listingIncomplete,'Bounded Quick cleared unresolved work');
  const recovered=[...items,item(21),item(99)];const result=await commit(w,await begin(w),recovered,snapshotFixture(provider,recovered));assert(result.ok,result.error);
  d=await w.pageA.getDatabase();assert(!d.providers[provider].syncState?.listingIncomplete);assert.equal(new Set(Object.values(d.providerItems).filter(i=>i.provider===provider).map(i=>i.providerItemId)).size,22);
}));

test('Amazon Video partial receipt is bounded and cannot claim complete coverage',()=>{
  const items=[item(1)];for(const mutate of [r=>r.itemCount++,r=>r.scopes[0].complete=true,r=>r.scopes[0].expectedCount=1,r=>r.recovery.unreadableCards=0,r=>r.scopes[0].pagesRead=251]){
    const r=receipt(items);mutate(r);assert.throws(()=>validateProviderSnapshot(provider,items,r));
  }
  assert.throws(()=>validateProviderSnapshot(provider,[...items,...items],receipt([...items,...items])));
  assert.throws(()=>validateProviderSnapshot(provider,[{...items[0],mediaType:'game'}],receipt(items)));
});

test('Amazon Video inferred recovery stays additive and rejects unsupported completion authority',()=>withWorker(async w=>{
  const initial=[item(99)];await w.pageA.replaceProviderItems(provider,initial,{profileLabel:'Synthetic',fullSyncAt:'2026-10-01'},snapshotFixture(provider,initial));
  assert((await commit(w,await begin(w),[item(1)])).ok);const before=await w.pageA.getDatabase();
  const start=()=>w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider,beginScan:true,confirmed:true,profileLabel:'Synthetic',mode:'incremental'},sender);
  const items=[item(1),item(2)],snapshot=snapshotFixture(provider,items);snapshot.scopes[0].end='pagination-end';
  let s=await start();assert.equal((await w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider,mode:'incremental',items,snapshot,scanToken:s.scanToken},sender)).ok,false);
  snapshot.scopes[0].end='scroll-end';snapshot.scopes[0].expectedCount=null;
  s=await start();assert((await w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider,mode:'incremental',items,snapshot,scanToken:s.scanToken},sender)).ok);
  const d=await w.pageA.getDatabase();assert(!d.providers[provider].syncState?.listingIncomplete);assert.equal(d.providers[provider].fullSyncAt,before.providers[provider].fullSyncAt);
  assert.deepEqual(d.providerHistory,before.providerHistory);assert(Object.values(d.providerItems).some(i=>i.providerItemId===item(99).providerItemId));
}));

test('Amazon Video rejects invalid origin, profile changes, stale completion and invalid receipts without false partial success',()=>withWorker(async w=>{
  const items=[item(1)],s=await begin(w);
  assert.equal((await commit(w,s,items,receipt(items),{...sender,url:'https://example.com/gp/video/library'})).ok,false);
  const wrong=receipt(items);wrong.itemCount++;assert.equal((await commit(w,s,items,wrong)).ok,false);
  await begin(w);assert.equal((await commit(w,s,items)).ok,false);
  const active=await begin(w);await w.pageA.mergeProviderItems(provider,[item(7)],{profileLabel:'Different'});assert.equal((await commit(w,active,items)).ok,false);
  assert(!Object.values((await w.pageA.getDatabase()).providerItems).some(i=>i.providerItemId===items[0].providerItemId));
}));

test('Amazon Video quota/disk rejection preserves records; retry, restart and duplicate completion remain safe',async()=>{
  for(const failure of ['QuotaExceededError','disk failure']){
    let reject=false;const h=performanceWriter(null,{beforeSet:patch=>{if(reject&&patch.galacticLibraryDatabase)throw Error(failure);}});
    const initial=[item(99)];await h.writer.replaceProviderItems(provider,initial,{profileLabel:'Synthetic',fullSyncAt:'2026-10-01'},snapshotFixture(provider,initial));
    const start=()=>h.writer.beginProviderScan(provider,'Synthetic','full',false,1);
    const items=[item(1)],save=s=>h.writer.commitProviderScan(provider,items,{syncMode:'full',fullSyncAt:'2026-11-06'},receipt(items),s.scanToken,1);
    let s=await start();const before=plain(h.stored.galacticLibraryDatabase);reject=true;await assert.rejects(save(s),new RegExp(failure));assert.deepEqual(h.stored.galacticLibraryDatabase,before);
    reject=false;s=await start();await save(s);const after=await h.writer.getDatabase();assert.equal(after.providers[provider].fullSyncAt,before.providers[provider].fullSyncAt);
    // Model a lost response after durable save; a restarted writer must not duplicate it.
    const restarted=performanceWriter(null,{stored:h.stored});assert.equal(Object.values((await restarted.writer.getDatabase()).providerItems).length,2);
    await assert.rejects(save(s),/superseded|completed/);assert.equal(Object.values((await h.writer.getDatabase()).providerItems).length,2);
  }
});
