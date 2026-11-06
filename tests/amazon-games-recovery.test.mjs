import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/providers/amazon-games-identity.js';
import {withWorker,snapshotFixture} from './storage.js';
import {performanceWriter} from './provider-performance-fixture.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateProviderSnapshot} from '../src/lib/provider-snapshot.js';

const provider='amazon-games',I=globalThis.GalacticAmazonGamesIdentity;
const raw=n=>({providerItemId:'dom-'+n,title:'Synthetic game '+n,mediaType:'game',ownership:'owned',acquiredAt:'2024-07-29T00:00:00.000Z',metadata:{source:'amazon-games-collection',acquisitionMethod:'permanent-claim',delivery:'Amazon Games library',collectedOn:'2024-07-29'}});
const rows=ns=>I.consolidate(ns.map(raw));
const receipt=items=>({version:1,provider,complete:false,itemCount:items.length,scopes:[{id:'collection',readCount:items.length,expectedCount:null,end:'partial-acquisition',pagesRead:10,complete:false,limitReached:false}],recovery:{failedClaims:1,failedWindows:0,windowsChecked:2,pendingWindows:['2024']}});
const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://luna.amazon.com/claims/my-collection',tab:{id:72}};
const begin=(w,mode='full')=>w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider,beginScan:true,confirmed:true,profileLabel:'Synthetic',mode},sender);
const commit=(w,s,items,snapshot=receipt(items),mode='full',from=sender)=>w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider,items,snapshot,mode,scanToken:s.scanToken},from);

test('Amazon Games partial saves 20 dates/identities, suppresses historical reactivation and preserves manual/unrelated evidence',()=>withWorker(async w=>{
  const seed=await rows([1,98,99]);await w.pageA.replaceProviderItems(provider,seed,{profileLabel:'Synthetic',fullSyncAt:'2026-10-01'},snapshotFixture(provider,seed));
  const current=seed.filter(i=>i.title!=='Synthetic game 98');let db=await w.pageA.replaceProviderItems(provider,current,{profileLabel:'Synthetic'},snapshotFixture(provider,current));
  const ref=Object.values(db.providerItems).find(i=>i.title==='Synthetic game 1').recordRef;await w.pageA.saveOwnershipReview(ref,{ownership:'unknown',note:'Keep review',evidenceDate:'2026-10-01'});
  await w.pageA.mergeProviderItems('steam',[{providerItemId:'7',title:'Other provider',mediaType:'game',ownership:'owned'}]);const before=await w.pageA.getDatabase();
  const items=await rows([...Array.from({length:20},(_,n)=>n+1),98]);const saved=await commit(w,await begin(w),items);assert(saved.ok,saved.error);assert.equal(saved.savedCount,20);
  db=await w.pageA.getDatabase();assert.equal(Object.values(db.providerItems).filter(i=>i.provider===provider).length,21);assert.equal(db.providers[provider].fullSyncAt,before.providers[provider].fullSyncAt);assert(db.providers[provider].syncState.listingIncomplete);
  assert.deepEqual(db.providerHistory,before.providerHistory);assert.deepEqual(db.ownershipReviews,before.ownershipReviews);assert.deepEqual(Object.values(db.providerItems).filter(i=>i.provider==='steam'),Object.values(before.providerItems).filter(i=>i.provider==='steam'));
  assert(Object.values(db.providerItems).filter(i=>i.provider===provider).every(i=>i.acquiredAt==='2024-07-29T00:00:00.000Z'));
  await w.pageA.restoreDatabase(parseBackup(createBackup(db)));assert((await w.pageA.getDatabase()).providers[provider].syncState.listingIncomplete);
  const quick=await begin(w,'incremental');assert((await commit(w,quick,await rows([1]),undefined,'incremental')).ok);
  db=await w.pageA.getDatabase();assert(db.providers[provider].syncState.listingIncomplete);assert.equal(db.providers[provider].syncHealth.status,'partial');
  const clean=await rows(Array.from({length:21},(_,n)=>n+1)),complete=snapshotFixture(provider,clean);
  assert.equal((await commit(w,await begin(w),clean,complete)).ok,false,'Full without the unfinished year cleared recovery');
  assert((await w.pageA.getDatabase()).providers[provider].syncState.listingIncomplete);
  complete.scopes[0].id='2024';assert((await commit(w,await begin(w),clean,complete)).ok);assert(!(await w.pageA.getDatabase()).providers[provider].syncState?.listingIncomplete);
}));

test('Amazon Games partial receipts reject invalid identities, bounds and false window/coverage authority',async()=>{
  const items=await rows([1]);for(const change of [r=>r.itemCount++,r=>r.scopes[0].expectedCount=1,r=>r.scopes[0].complete=true,r=>r.recovery.failedClaims=0,r=>r.recovery.windowsChecked=0,r=>r.scopes[0].pagesRead=36001]){const r=receipt(items);change(r);assert.throws(()=>validateProviderSnapshot(provider,items,r));}
  assert.throws(()=>validateProviderSnapshot(provider,[{...items[0],providerItemId:'transient'}],receipt(items)));
  assert.throws(()=>validateProviderSnapshot(provider,[{...items[0],ownership:'subscription'}],receipt(items)));
  const window=receipt(items);window.recovery.failedClaims=0;window.recovery.failedWindows=1;window.scopes[0].limitReached=true;assert.equal(validateProviderSnapshot(provider,items,window),window);
});

test('Amazon Games rejects invalid origin, receipt, stale lease and switched profile before partial success',()=>withWorker(async w=>{
  const items=await rows([1]),s=await begin(w);
  assert.equal((await commit(w,s,items,receipt(items),'full',{...sender,url:'https://example.com/claims/my-collection'})).ok,false);
  const invalid=receipt(items);invalid.itemCount++;assert.equal((await commit(w,s,items,invalid)).ok,false);
  await begin(w);assert.equal((await commit(w,s,items)).ok,false);
  const current=await begin(w);await w.pageA.mergeProviderItems(provider,await rows([9]),{profileLabel:'Different'});assert.equal((await commit(w,current,items)).ok,false);
}));

test('Amazon Games quota/disk failure preserves old data; fresh retry and restarted/replayed completion do not duplicate claims',async()=>{
  for(const failure of ['QuotaExceededError','disk failure']){
    let reject=false;const h=performanceWriter(null,{beforeSet:patch=>{if(reject&&patch.galacticLibraryDatabase)throw Error(failure);}}),initial=await rows([99]);
    await h.writer.replaceProviderItems(provider,initial,{profileLabel:'Synthetic',fullSyncAt:'2026-10-01'},snapshotFixture(provider,initial));const items=await rows([1]),start=()=>h.writer.beginProviderScan(provider,'Synthetic','full',false,1);
    const save=s=>h.writer.commitProviderScan(provider,items,{syncMode:'full',fullSyncAt:'2026-11-06'},receipt(items),s.scanToken,1);
    let s=await start();const before=structuredClone(h.stored.galacticLibraryDatabase);reject=true;await assert.rejects(save(s),new RegExp(failure));assert.deepEqual(h.stored.galacticLibraryDatabase,before);
    reject=false;s=await start();await save(s);const db=await h.writer.getDatabase();assert.equal(db.providers[provider].fullSyncAt,before.providers[provider].fullSyncAt);
    const restarted=performanceWriter(null,{stored:h.stored});assert.equal(Object.keys((await restarted.writer.getDatabase()).providerItems).length,2);await assert.rejects(save(s),/completed|superseded/);
    const retry=await restarted.writer.beginProviderScan(provider,'Synthetic','full',false,1);await restarted.writer.commitProviderScan(provider,items,{syncMode:'full'},receipt(items),retry.scanToken,1);
    assert.equal(Object.keys((await restarted.writer.getDatabase()).providerItems).length,2);
  }
});
