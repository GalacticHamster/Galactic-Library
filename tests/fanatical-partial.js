import assert from 'node:assert/strict';
import {fanaticalWorker,fanaticalOrder,fanaticalSender,fanaticalUsabilityBaseline} from './fanatical-coverage.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';

const one=n=>fanaticalOrder(n,['book']);
const details=(path,orders)=>orders.find(o=>path.endsWith(o._id));
const records=db=>Object.values(db.providerItems).filter(i=>i.provider==='fanatical');
const acquired=async h=>{const a=await h.acquire();assert(a.projection.ok,a.projection.error);const saved=await h.commit(a);assert(saved.result.ok,saved.result.error);return a;};

export const fanaticalPartialTests=[
 ['Fanatical unresolved status cannot archive an active purchase or authorize reconciliation',()=>fanaticalWorker(async h=>{
   const a=one(1),b=one(2);h.setOrders([a,b]);h.setHeaders({'x-total-count':'2'});await acquired(h);
   const before=await h.pageA.getDatabase();
   for(const status of ['REVIEW','UNKNOWN_PROVIDER_STATUS']){
     h.setOrders([a,{...b,status}]);const result=await acquired(h);
     assert.equal(result.projection.result.coverage.complete,false);
     assert.equal(result.projection.result.recovery.failedOrders,1);
     const after=await h.pageB.getDatabase();
     assert.equal(records(after).length,2);assert.deepEqual(after.providerHistory,before.providerHistory);
     assert.deepEqual(after.ownershipReviews,before.ownershipReviews);
     assert.equal(after.providers.fanatical.fullSyncAt,before.providers.fanatical.fullSyncAt);
   }
   h.setOrders([a,b]);const recovered=await acquired(h);assert.equal(recovered.projection.result.coverage.complete,true);
   assert.equal(records(await h.pageB.getDatabase()).length,2);
 })],
 ['Fanatical partial: headerless 47 and one-list zero-detail Quick remain unchanged',async()=>{const result=await fanaticalUsabilityBaseline();assert.equal(result.supported,47);}],
 ['Fanatical partial: first 499/500 persists ownership and Quick recovers exactly one detail',()=>fanaticalWorker(async h=>{
   const orders=Array.from({length:500},(_,i)=>one(i+1));let failing=true;
   h.setReply(path=>path==='/api/user/orders'?{status:200,data:orders}:failing&&path.endsWith('000500')?{status:404,data:null}:{status:200,data:details(path,orders)});
   const a=await acquired(h);assert.equal(a.projection.result.ordersScanned,499);let db=await h.pageA.getDatabase();assert.equal(records(db).length,499);assert(records(db).every(i=>i.ownership==='owned'));assert.equal(db.providers.fanatical.fullSyncAt,undefined);assert.equal(db.providers.fanatical.syncState.failedOrderFingerprints.length,1);
   assert(handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:records(db)[0].title,mediaType:'book'}]}).results[0].owned);
   await h.pageA.restoreDatabase(parseBackup(createBackup(db)));failing=false;h.paths.length=0;const q=await h.acquire('incremental');assert(!q.full);assert(q.projection.ok,q.projection.error);assert((await h.commit(q)).result.ok);assert.equal(h.paths.length,2);
   db=await h.pageB.getDatabase();assert.equal(records(db).length,500);assert.equal(db.providers.fanatical.syncState.failedOrderFingerprints,undefined);
   h.paths.length=0;assert((await h.commit(await h.acquire('incremental'))).result.ok);assert.deepEqual(h.paths,['/api/user/orders']);
 })],
 ['Fanatical partial: later page preserves earlier orders and re-enumeration skips validated details',()=>fanaticalWorker(async h=>{
   let failing=true;const a=one(1),b=one(2);
   h.setReply(path=>path==='/api/user/orders'?{status:200,data:[a],headers:{link:'</api/user/orders?page=2>; rel="next"'}}:path.includes('?')?failing?{status:404,data:null}:{status:200,data:[b]}:{status:200,data:path.endsWith(a._id)?a:b});
   const first=await acquired(h);assert(first.projection.result.recovery.listingIncomplete);assert.equal(first.projection.result.recovery.failedOrders,0);assert.equal(records(await h.pageA.getDatabase()).length,1);
   failing=false;h.paths.length=0;const q=await h.acquire('incremental');assert(!q.full);assert(q.projection.ok,q.projection.error);assert((await h.commit(q)).result.ok);
   assert.equal(h.paths.filter(p=>p.includes('?')||p==='/api/user/orders').length,2);assert.equal(h.paths.filter(p=>p.includes('/orders/')).length,1);assert.equal(records(await h.pageA.getDatabase()).length,2);
 })],
 ['Fanatical partial: established omissions, history, reviews and other providers stay intact',()=>fanaticalWorker(async h=>{
   await h.importItems('gog',[{providerItemId:'other',title:'Other provider',ownership:'owned'}]);h.setOrders([one(1),one(2)]);h.setHeaders({'x-total-count':'2'});await acquired(h);
   h.setOrders([one(1)]);h.setHeaders({'x-total-count':'1'});await acquired(h);let before=await h.pageA.getDatabase(),item=records(before)[0];
   await h.pageA.saveOwnershipCorrections([ownershipCorrectionTarget(item,before)],{ownership:'returned',note:'Synthetic correction'});before=await h.pageA.getDatabase();const other=Object.values(before.providerItems).find(i=>i.provider==='gog');
   const orders=[one(2),one(3),one(4)];h.setReply(p=>p==='/api/user/orders'?{status:200,data:orders}:p.endsWith('000004')?{status:404,data:null}:{status:200,data:details(p,orders)});
   await acquired(h);const after=await h.pageA.getDatabase();assert.equal(records(after).length,2);assert.deepEqual(after.providerHistory,before.providerHistory);assert.deepEqual(after.ownershipReviews,before.ownershipReviews);assert.deepEqual(after.providerItems[other.id],other);assert.equal(after.providers.fanatical.fullSyncAt,before.providers.fanatical.fullSyncAt);
 })],
 ['Fanatical partial: malformed details isolate one order; explicit foreign identity rejects the acquisition',()=>fanaticalWorker(async h=>{
   const orders=[one(1),one(2)];for(const bad of [{}, {...one(2),_id:'different-order'}, {...one(2),items:[]}]){
     h.setReply(p=>p==='/api/user/orders'?{status:200,data:orders}:{status:200,data:p.endsWith('000002')?bad:orders[0]});
     if(bad._id==='different-order'){
       const before=await h.pageA.getDatabase(),rejected=await h.acquire();
       assert.equal(rejected.projection.ok,false);
       const after=await h.pageA.getDatabase();
       for(const key of ['providerItems','providerHistory','ownershipReviews'])assert.deepEqual(after[key],before[key]);
       assert.equal(after.providers.fanatical.fullSyncAt,before.providers.fanatical.fullSyncAt);
       continue;
     }
     const a=await acquired(h);assert.equal(a.projection.result.recovery.failedOrders,1);assert.equal(records(await h.pageA.getDatabase()).length,1);
   }
 })],
 ['Fanatical partial: duplicates and malformed pagination never grant completeness',()=>fanaticalWorker(async h=>{
   const a=one(1),b=one(2);h.setReply(p=>p==='/api/user/orders'?{status:200,data:[a],headers:{link:'</api/user/orders?page=2>; rel="next"'}}:p.includes('?')?{status:200,data:[a,b]}:{status:200,data:p.endsWith(a._id)?a:b});
   const first=await acquired(h);assert.equal(first.projection.result.coverage.complete,false);assert.equal(records(await h.pageA.getDatabase()).length,2);assert(records(await h.pageA.getDatabase()).every(i=>i.metadata.purchaseOrigins.length===1));
   h.setReply(p=>p==='/api/user/orders'?{status:200,data:[a,b],headers:{link:'<https://foreign.invalid/api/user/orders>; rel="next"'}}:{status:200,data:details(p,[a,b])});
   assert.equal((await acquired(h)).projection.result.coverage.complete,false);
 })],
 ['Fanatical partial: malformed top-level and explicit authentication remain fatal',()=>fanaticalWorker(async h=>{
   await acquired(h);const before=await h.pageA.getDatabase();
   for(const status of [401,403]){h.setStatus(status);assert(!(await h.acquire()).projection.ok);}h.setStatus(200);h.setTransform(()=>({}));assert(!(await h.acquire()).projection.ok);
   h.setReply(p=>p==='/api/user/orders'?{status:200,data:[one(1),one(2)]}:p.endsWith('000002')?{status:401,data:null}:{status:200,data:one(1)});assert(!(await h.acquire()).projection.ok);assert.deepEqual((await h.pageA.getDatabase()).providerItems,before.providerItems);
 })],
 ['Fanatical partial: queued storage rejection, quota, stale lease and replay preserve checkpoints',()=>fanaticalWorker(async h=>{
   const orders=[one(1),one(2)];h.setReply(p=>p==='/api/user/orders'?{status:200,data:orders}:p.endsWith('000002')?{status:404,data:null}:{status:200,data:orders[0]});
   const stale=await h.acquire(),a=await h.acquire();assert(!(await h.commit(stale)).result.ok);const before=await h.pageA.getDatabase();
   const set=h.memory.area.set;h.memory.area.set=async patch=>{if(patch.galacticLibraryDatabase)throw Error('Quota exceeded');return set(patch);};assert(!(await h.commit(a)).result.ok);h.memory.area.set=set;
   let db=await h.pageB.getDatabase();assert.deepEqual(db.providerItems,before.providerItems);assert.equal(db.providers.fanatical.syncState?.acquisitionCheckedAt,undefined);
   const b=await h.acquire(),saved=await h.commit(b);assert(saved.result.ok,saved.result.error);const replay=await h.dispatch(saved.request,fanaticalSender);assert(replay.ok||/superseded/.test(replay.error));assert.equal(records(await h.pageA.getDatabase()).length,1);
 })],
 ['Fanatical partial: complete Full after recovery retains reconciliation and clean empty behavior',()=>fanaticalWorker(async h=>{
   const orders=[one(1),one(2)];h.setReply(p=>p==='/api/user/orders'?{status:200,data:orders,headers:{'x-total-count':'2'}}:p.endsWith('000002')?{status:404,data:null}:{status:200,data:orders[0]});await acquired(h);
   h.setReply(null);h.setOrders([orders[0]]);h.setHeaders({'x-total-count':'1'});await acquired(h);let db=await h.pageA.getDatabase();assert(db.providers.fanatical.fullSyncAt);
   h.setOrders([]);h.setHeaders({'x-total-count':'0'});await acquired(h);db=await h.pageA.getDatabase();assert.equal(records(db).length,0);assert.equal(Object.keys(db.providerHistory).length,1);
 })]
];
fanaticalPartialTests.push(
 ['Fanatical partial: failed refresh loses skip authority while existing ownership remains',()=>fanaticalWorker(async h=>{
   const orders=[one(1),one(2)];h.setOrders(orders);await acquired(h);
   h.setReply(p=>p==='/api/user/orders'?{status:200,data:orders}:p.endsWith('000002')?{status:404,data:null}:{status:200,data:orders[0]});await acquired(h);
   let db=await h.pageA.getDatabase();assert.equal(records(db).length,2);assert.equal(db.providers.fanatical.syncState.knownOrderFingerprints.length,1);assert.equal(db.providers.fanatical.syncState.failedOrderFingerprints.length,1);
   h.setReply(null);h.paths.length=0;const q=await h.acquire('incremental');assert(q.projection.ok,q.projection.error);assert((await h.commit(q)).result.ok);assert.equal(h.paths.length,2);db=await h.pageA.getDatabase();assert(records(db).every(i=>i.metadata.purchaseOrigins.length===1));
 })],
 ['Fanatical partial: mixed media projection stays identical to a clean acquisition',async()=>{
   const saved=[];
   for(const partial of [false,true])await fanaticalWorker(async h=>{
     const good=fanaticalOrder(1,['game','book','comic','audiobook','software','asset','elearning','audio','other']),bad=one(2);
     h.setReply(p=>p==='/api/user/orders'?{status:200,data:partial?[good,bad]:[good]}:p.endsWith(bad._id)?{status:404,data:null}:{status:200,data:good});
     const a=await acquired(h);saved.push(a.projection.result.items);const db=await h.pageA.getDatabase();assert.equal(records(db).length,6);assert(records(db).every(i=>i.ownership==='owned'));
   });assert.deepEqual(saved[0],saved[1]);
 }],
 ['Fanatical partial: mixed later-page and order failure retries two details, not the validated one',()=>fanaticalWorker(async h=>{
   const a=one(1),b=one(2),c=one(3);let failing=true;
   h.setReply(p=>p==='/api/user/orders'?{status:200,data:[a,b],headers:{link:'</api/user/orders?page=2>; rel="next"'}}:p.includes('?')?{status:failing?404:200,data:[c]}:failing&&p.endsWith(b._id)?{status:404,data:null}:{status:200,data:details(p,[a,b,c])});
   const first=await acquired(h);assert(first.projection.result.recovery.listingIncomplete);assert.equal(first.projection.result.recovery.failedOrders,1);
   failing=false;h.paths.length=0;const q=await h.acquire('incremental');assert(q.projection.ok,q.projection.error);assert((await h.commit(q)).result.ok);assert.equal(h.paths.filter(p=>p.includes('/orders/')).length,2);assert.equal(records(await h.pageA.getDatabase()).length,3);
 })],
 ['Fanatical partial: malformed recovery DTOs fail sanitization and never publish purchases',()=>fanaticalWorker(async h=>{
   h.setReply(p=>p==='/api/user/orders'?{status:200,data:[one(1),one(2)]}:p.endsWith('000002')?{status:404,data:null}:{status:200,data:one(1)});
   const execute=chrome.scripting.executeScript;
   for(const mutate of [r=>r.recovery.failedOrders++,r=>r.orderFingerprints.push(r.recovery.failedOrderFingerprints[0]),r=>r.items[0].purchaseOrigins[0].orderRef='f'.repeat(64)]){
     chrome.scripting.executeScript=async args=>{const results=await execute(args);mutate(results[0].result);return results;};
     assert(!(await h.acquire()).projection.ok);assert.equal(records(await h.pageA.getDatabase()).length,0);
   }
   chrome.scripting.executeScript=execute;assert((await h.commit(await h.acquire())).result.ok);
 })],
 ['Fanatical partial: all failed orders publish no false checkpoint; clean empty still succeeds',()=>fanaticalWorker(async h=>{
   h.setOrders([one(1)]);h.setDetailError('Unavailable detail');assert(!(await h.acquire()).projection.ok);let db=await h.pageA.getDatabase();assert.equal(records(db).length,0);assert.equal(db.providers.fanatical.syncState?.acquisitionCheckedAt,undefined);
   h.setDetailError(null);h.setOrders([]);assert((await h.commit(await h.acquire())).result.ok);db=await h.pageA.getDatabase();assert.equal(records(db).length,0);assert.equal(db.providers.fanatical.fullSyncAt,undefined);
 })]
);
