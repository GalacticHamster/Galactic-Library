import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {withWorker} from './storage.js';
import '../src/providers/fanatical.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {providerCheckPatch,applyProviderChecks,providerCheckDigest} from '../src/lib/provider-scan-checks.js';

// Synthetic input: the one-purchase/47-product shape, without account data.
export function fanaticalOrder(number=1,types=Array(47).fill('book')) {
  return {_id:`order-${String(number).padStart(6,'0')}`,status:'COMPLETE',date:'2026-10-01T00:00:00Z',items:[{
    _id:`bundle-${String(number).padStart(6,'0')}`,name:'Synthetic collection',bundles:[{games:types.map((type,i)=>({
      _id:`product-${number}-${String(i).padStart(6,'0')}`,name:`Verified collection ${number} Volume ${i+1}`,type
    }))}]
  }]};
}
export const fanaticalSender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://www.fanatical.com/en/orders',tab:{id:1}};
export async function fanaticalWorker(run,options={}) {
  return withWorker(async worker=>{
    let orders=[fanaticalOrder()],headers={},detailError=null,token='SYNTHETIC',status=200,responseTransform=value=>value;
    const paths=[];let reply=null;
    chrome.scripting={executeScript:async({func,args})=>{
      const ctx=vm.createContext({URL,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,
        localStorage:{getItem:()=>JSON.stringify({token})},fetch:async path=>{
          paths.push(path);const listing=path==='/api/user/orders';
          if(reply){const value=await reply(path);return {ok:value.status===200,status:value.status,headers:new Headers(value.headers??{}),json:async()=>structuredClone(value.data)};}
          if(!listing&&detailError)throw Error(detailError);
          const body=listing?orders:orders.find(order=>path.endsWith(order._id));
          return {ok:status===200,status,headers:new Headers(listing?headers:{}),json:async()=>responseTransform(structuredClone(body),listing)};
        }});
      return [{result:await vm.runInContext(`(${func.toString()})`,ctx)(...args)}];
    }};
    const acquire=async(mode='full',label='Personal')=>{
      const state=await worker.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'fanatical',mode,beginScan:true,confirmed:true,profileLabel:label},fanaticalSender);
      assert(state.ok,state.error);
      const full=mode==='full'||state.forceFull;
      const projection=await worker.dispatch({type:'FETCH_FANATICAL_ORDERS',fullScan:full,knownOrderFingerprints:full?[]:state.syncState?.knownOrderFingerprints??[]},fanaticalSender);
      return {state,full,projection};
    };
    const commit=async acquired=>{
      const p=acquired.projection;assert(p.ok,p.error);
      const request={type:'COMMIT_PROVIDER_SCAN',provider:'fanatical',mode:acquired.full?'full':'incremental',scanToken:acquired.state.scanToken,
        items:globalThis.GalacticFanatical.fanaticalItemsFromProjection(p.result),snapshot:p.result.snapshot,
        syncState:{knownOrderFingerprints:p.result.orderFingerprints,...(p.result.recovery?{failedOrderFingerprints:p.result.recovery.failedOrderFingerprints,listingIncomplete:p.result.recovery.listingIncomplete}:{})},scanDiagnostics:{incomplete:p.result.acquisitionComplete===false,failedRequestCount:(p.result.recovery?.failedOrders??0)+(p.result.recovery?.listingIncomplete?1:0),arrayOnly:p.result.coverage.paginationEvidence==='array-only',retries:p.result.coverage.retries}};
      return {request,result:await worker.dispatch(request,fanaticalSender)};
    };
    await run({...worker,paths,acquire,commit,setReply:value=>{reply=value;},setOrders:value=>{orders=structuredClone(value);},setHeaders:value=>{headers=value;},
      setDetailError:value=>{detailError=value;},setStatus:value=>{status=value;},setTransform:value=>{responseTransform=value;},setToken:value=>{token=value;}});
  },options);
}
export async function fanaticalUsabilityBaseline(){
  let evidence;
  await fanaticalWorker(async h=>{
    const full=await h.acquire(),saved=await h.commit(full);assert(saved.result.ok,saved.result.error);
    const db=await h.pageA.getDatabase(),items=Object.values(db.providerItems);
    assert.equal(items.length,47);assert(items.every(item=>item.ownership==='owned'&&item.mediaType==='book'));
    assert.equal(db.providers.fanatical.syncHealth.status,'succeeded');
    const match=handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:items[0].title,mediaType:'book'}]});
    assert.equal(match.results[0].owned,true);
    const databaseWrites=h.memory.commits.length;
    h.paths.length=0;const quick=await h.acquire('incremental'),again=await h.commit(quick);assert(again.result.ok,again.result.error);
    assert.equal(h.memory.commits.length,databaseWrites,'Unchanged Quick rewrote the catalog database.');
    assert.equal(quick.full,false);assert.equal(quick.projection.result.ordersScanned,0);assert.equal(h.paths.length,1);
    evidence={supported:items.length,ownership:'47 owned books',history:Object.keys(db.providerHistory).length,comparisonOwned:match.results[0].owned,
      fullDetails:full.projection.result.ordersScanned,quickDetails:quick.projection.result.ordersScanned,quickRequests:h.paths.length};
  },{storageEvents:true,concurrentQueries:true});
  return evidence;
}
export const fanaticalCoverageTests=[['Fanatical one-purchase/47-product usable import remains visible and incremental',fanaticalUsabilityBaseline]];

fanaticalCoverageTests.push(
 ['Fanatical acquisition-only baselines admit informational successful Quick receipts without weakening other providers',()=>fanaticalWorker(async h=>{
   assert((await h.commit(await h.acquire())).result.ok);const db=await h.pageA.getDatabase(),state=db.providers.fanatical;
   const details={syncMode:'incremental',lastSync:'2026-11-05T12:00:00Z',quickSyncAt:'2026-11-05T12:00:00Z',lastError:null,
     syncHealth:{...state.syncHealth,mode:'incremental',coverageLimit:'array-only-index-without-total',differences:{observed:0,added:0,missing:0,ownershipChanged:0}}};
   const patch=providerCheckPatch('fanatical',details),digest=await providerCheckDigest(db);
   const receipt={format:1,baseDigest:digest,checks:{fanatical:{profileId:state.activeProfileId,patch}}};
   const applied=applyProviderChecks(db,receipt,digest);assert.equal(applied.providers.fanatical.lastSync,patch.lastSync);assert.equal(applied.providers.fanatical.fullSyncAt,undefined);
   assert.throws(()=>providerCheckPatch('steam',details),/Invalid provider status/);
   const noBaseline=structuredClone(db);delete noBaseline.providerProfiles[state.activeProfileId].state.syncState;
   assert.equal(applyProviderChecks(noBaseline,receipt,digest),noBaseline);
 })],
 ['Fanatical headerless Full/Quick preserve absent active purchases, history, dates, reviews and unrelated providers',()=>fanaticalWorker(async h=>{
   h.setOrders([fanaticalOrder(1),fanaticalOrder(2)]);
   assert((await h.commit(await h.acquire())).result.ok);
   let db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,94);
   assert.equal(db.providers.fanatical.fullSyncAt,undefined);assert(db.providers.fanatical.syncState.acquisitionCheckedAt);
   await h.importItems('gog',[{providerItemId:'41',title:'Unrelated game',mediaType:'game',ownership:'owned'}]);
   db=await h.pageA.getDatabase();const gog=structuredClone(Object.values(db.providerItems).find(i=>i.provider==='gog'));
   const corrected=Object.values(db.providerItems).find(i=>i.provider==='fanatical');
   await h.pageA.saveOwnershipCorrections([ownershipCorrectionTarget(corrected,db)],{ownership:'returned',note:'Synthetic manual review'});
   const reviews=structuredClone((await h.pageA.getDatabase()).ownershipReviews);
   h.setOrders([fanaticalOrder(1)]);
   for(const mode of ['incremental','full','incremental']){
     const a=await h.acquire(mode);assert.equal(a.full,mode==='full');assert.equal(a.projection.result.coverage.complete,false);
     assert((await h.commit(a)).result.ok);
     db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,95);assert.equal(Object.keys(db.providerHistory).length,0);
     assert.equal(db.providers.fanatical.syncState.knownOrderFingerprints.length,2);assert.equal(db.providers.fanatical.fullSyncAt,undefined);
     assert.deepEqual(Object.values(db.providerItems).find(i=>i.provider==='gog'),gog);
     assert.deepEqual(db.ownershipReviews,reviews);assert.equal(effectiveOwnershipRecord(db.providerItems[corrected.id],db).ownership,'returned');
   }
   const restored=parseBackup(createBackup(db));await h.pageA.restoreDatabase(restored);
   const reload=await h.acquire('incremental');assert(!reload.full);assert.equal(reload.projection.result.ordersScanned,0);assert((await h.commit(reload)).result.ok);
 })],
 ['Fanatical explicit coverage retains reconciliation while subsequent unverified acquisitions cannot advance it',()=>fanaticalWorker(async h=>{
   h.setOrders([fanaticalOrder(1),fanaticalOrder(2)]);h.setHeaders({'x-total-count':'2'});
   assert((await h.commit(await h.acquire())).result.ok);let db=await h.pageA.getDatabase();const fullAt=db.providers.fanatical.fullSyncAt;assert(fullAt);
   // A genuine complete Full retires a missing purchase as before.
   h.setOrders([fanaticalOrder(1)]);h.setHeaders({'x-total-count':'1'});assert((await h.commit(await h.acquire())).result.ok);
   db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerHistory).length,47);const history=structuredClone(db.providerHistory),at=db.providers.fanatical.fullSyncAt;
   h.setHeaders({});h.setOrders([]);const a=await h.acquire();assert(a.projection.ok);assert((await h.commit(a)).result.ok);
   db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,47);assert.deepEqual(db.providerHistory,history);assert.equal(db.providers.fanatical.fullSyncAt,at);
   assert.equal(db.providers.fanatical.syncHealth.status,'succeeded');
 })],
 ['Fanatical unchanged Quick skips details; Full refreshes legitimate details without new identity or purchase occurrences',()=>fanaticalWorker(async h=>{
   const first=await h.commit(await h.acquire());assert(first.result.ok);const before=await h.pageA.getDatabase();
   const changed=fanaticalOrder();changed.items[0].bundles[0].games[0].name='Updated source title';h.setOrders([changed]);
   h.paths.length=0;const quick=await h.acquire('incremental');assert((await h.commit(quick)).result.ok);assert.equal(h.paths.length,1);
   const full=await h.commit(await h.acquire());assert(full.result.ok);const after=await h.pageA.getDatabase();assert.deepEqual(Object.keys(after.providerItems),Object.keys(before.providerItems));
   const item=Object.values(after.providerItems).find(i=>i.title==='Updated source title');assert(item);assert.equal(item.metadata.purchaseOrigins.length,1);assert.equal(item.acquiredAt,'2026-10-01T00:00:00.000Z');
 })],
 ['Fanatical supports its existing media projection and empty headerless accounts without fabricating a Full baseline',()=>fanaticalWorker(async h=>{
   h.setOrders([fanaticalOrder(1,['game','book','comic','audiobook','software','asset','audio','elearning','other'])]);
   assert((await h.commit(await h.acquire())).result.ok);const db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,6);
   assert(Object.values(db.providerItems).every(i=>i.ownership==='owned'));
   await h.pageA.clearDatabase();h.setOrders([]);assert((await h.commit(await h.acquire())).result.ok);
   const empty=await h.pageA.getDatabase();assert.equal(Object.keys(empty.providerItems).length,0);assert.equal(empty.providers.fanatical.fullSyncAt,undefined);
   const quick=await h.acquire('incremental');assert(!quick.full);assert((await h.commit(quick)).result.ok);
 })],
 ['Fanatical malformed sole orders remain fatal; contradictory counts grant additive authority only',()=>fanaticalWorker(async h=>{
   assert((await h.commit(await h.acquire())).result.ok);const before=await h.pageA.getDatabase();
   for(const transform of [()=>({}), (v,list)=>list?v:{...v,_id:'foreign-order'},(v,list)=>list?v:{...v,items:[]},(v,list)=>{if(!list)v.items[0].bundles[0].games.pop();return v;}]){
     h.setTransform(transform);const a=await h.acquire();assert.equal(a.projection.ok,false);assert.deepEqual((await h.pageA.getDatabase()).providerItems,before.providerItems);
   }
   h.setTransform(v=>v);h.setHeaders({'x-total-count':'2'});const partial=await h.acquire();assert(partial.projection.ok);assert.equal(partial.projection.result.coverage.complete,false);assert(partial.projection.result.recovery.listingIncomplete);
   h.setHeaders({});h.setOrders([fanaticalOrder(2)]);assert.equal((await h.acquire('incremental')).projection.ok,false);
 })],
 ['Fanatical queued commits reject stale leases and storage errors without losing acquisitions or skip state',()=>fanaticalWorker(async h=>{
   assert((await h.commit(await h.acquire())).result.ok);h.setOrders([fanaticalOrder(1),fanaticalOrder(2)]);
   const stale=await h.acquire();await h.acquire();assert.equal((await h.commit(stale)).result.ok,false);
   const a=await h.acquire(),before=await h.pageA.getDatabase(),set=h.memory.area.set;
   h.memory.area.set=async patch=>{if(patch.galacticLibraryDatabase)throw Error('Synthetic storage rejection');return set(patch);};
   const rejected=await h.commit(a);assert.equal(rejected.result.ok,false);h.memory.area.set=set;
   assert.deepEqual((await h.pageA.getDatabase()).providerItems,before.providerItems);
   assert.deepEqual((await h.pageA.getDatabase()).providers.fanatical.syncState,before.providers.fanatical.syncState);
   assert((await h.commit(await h.acquire())).result.ok);
   const db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,94);
   const writer=createStorageWriter(h.memory.area);assert.equal(Object.keys((await writer.getDatabase()).providerItems).length,94);
 })],
 ['Fanatical auth/session failures and malformed acquisition checkpoints cannot grant skip or save authority',()=>fanaticalWorker(async h=>{
   assert((await h.commit(await h.acquire())).result.ok);const before=await h.pageA.getDatabase();
   for(const status of [401,403]){h.setStatus(status);assert.equal((await h.acquire()).projection.ok,false);}
   h.setStatus(200);h.setTransform((value,listing)=>{if(!listing)h.setToken('CHANGED-SYNTHETIC');return value;});
   assert.equal((await h.acquire()).projection.ok,false);h.setTransform(v=>v);
   assert.deepEqual((await h.pageA.getDatabase()).providerItems,before.providerItems);
   const missing=structuredClone(before);delete missing.providers.fanatical.syncState;delete missing.providerProfiles[missing.providers.fanatical.activeProfileId].state.syncState;
   await h.pageA.restoreDatabase(missing);const planned=await h.acquire('incremental');assert(planned.full);
   const corrupt=structuredClone(before);for(const state of [corrupt.providers.fanatical,corrupt.providerProfiles[corrupt.providers.fanatical.activeProfileId].state])state.syncState.knownOrderFingerprints=['invalid'];
   await assert.rejects(h.pageA.restoreDatabase(corrupt),/fingerprint/);
 })],
 ['Fanatical an unacknowledged committed acquisition retries idempotently after reload',()=>fanaticalWorker(async h=>{
   const a=await h.acquire();const saved=await h.commit(a);assert(saved.result.ok); // caller may lose this reply
   const repeated=await h.dispatch(saved.request,fanaticalSender);
   // A legacy database without a registered completion can reject the consumed
   // lease. A fresh Quick must still be a no-op, never a duplicate acquisition.
   assert(repeated.ok||/superseded/.test(repeated.error),repeated.error);
   const before=await h.pageA.getDatabase();
   const writer=createStorageWriter(h.memory.area);assert.equal(Object.keys((await writer.getDatabase()).providerItems).length,47);
   h.paths.length=0;const retry=await h.acquire('incremental');assert(!retry.full);assert.equal(retry.projection.result.ordersScanned,0);
   assert((await h.commit(retry)).result.ok);const after=await h.pageA.getDatabase();assert.deepEqual(after.providerHistory,before.providerHistory);
   assert.equal(Object.keys(after.providerItems).length,47);assert(Object.values(after.providerItems).every(i=>i.metadata.purchaseOrigins.length===1));assert.equal(h.paths.length,1);
 })]
);
