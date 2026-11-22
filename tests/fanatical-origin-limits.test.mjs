import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fanaticalOrder,fanaticalWorker} from './fanatical-coverage.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {applyPurchaseSnapshot,purchaseAccounts} from '../src/background/purchase-handoff.js';
import {createEmptyDatabase} from '../src/lib/models.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const product=(id,name=id)=>({_id:id,name,type:'book'});
const repeated='limit-repeated-product';
const makeOrder=(n,games)=>{
  const order=fanaticalOrder(n,['book']);
  order.items[0].bundles[0].games=games;
  return order;
};
const setOrders=(h,orders)=>{
  const byId=new Map(orders.map(order=>[order._id,order]));
  h.setReply(path=>path==='/api/user/orders'?{status:200,data:orders,headers:{'x-total-count':String(orders.length)}}:
    {status:200,data:byId.get(path.split('/').at(-1))});
};
const scan=async(h,mode)=>{
  const a=await h.acquire(mode);
  assert(a.projection.ok,a.projection.error);
  const committed=await h.commit(a);
  assert(committed.result.ok,committed.result.error);
  return a.projection.result;
};
const items=db=>Object.fromEntries(Object.values(db.providerItems).filter(i=>i.provider==='fanatical').map(i=>[i.providerItemId,i]));

test('GL acquisition and writer isolate 501 occurrences across orders and preserve a verified 500-record history',()=>fanaticalWorker(async h=>{
  const baseline=Array.from({length:500},(_,index)=>makeOrder(index+1,[product(repeated)]));
  baseline[0].items[0].bundles[0].games.unshift(product('ordinary-before'));
  setOrders(h,baseline);
  assert.equal((await scan(h)).coverage.complete,true);
  const initial=await h.pageA.getDatabase();
  assert.equal(items(initial)[repeated].metadata.purchaseOrigins.length,500);
  await h.pageA.saveOwnershipCorrections([ownershipCorrectionTarget(items(initial)[repeated],initial)],{ownership:'returned',note:'Fixture correction'});
  const preserved=await h.pageA.getDatabase();
  const over=makeOrder(501,[product(repeated),product('ordinary-after'),{name:'Unresolved product'}]);
  const ordinary=makeOrder(502,[product('last-ordinary-product')]);
  setOrders(h,[...baseline,over,ordinary]);
  const partial=await scan(h);
  assert.equal(partial.acquisitionComplete,false);
  assert.equal(partial.recovery.failedOrders,501);
  assert.deepEqual(partial.items.map(i=>i.sourceItemId).sort(),['last-ordinary-product','ordinary-after','ordinary-before']);
  let db=await h.pageB.getDatabase();
  assert.deepEqual(items(db)[repeated],items(preserved)[repeated]);
  assert.deepEqual(db.ownershipReviews,preserved.ownershipReviews);
  assert.deepEqual(db.providerHistory,preserved.providerHistory);
  assert.equal(db.providers.fanatical.fullSyncAt,preserved.providers.fanatical.fullSyncAt);
  assert.deepEqual(Object.keys(items(db)).sort(),['last-ordinary-product',repeated,'ordinary-after','ordinary-before'].sort());
  await h.pageA.restoreDatabase(parseBackup(createBackup(db)));
  await scan(h,'incremental');
  db=await h.pageB.getDatabase();
  assert.equal(items(db)[repeated].metadata.purchaseOrigins.length,500);
  assert.equal(items(db)['ordinary-after'].metadata.purchaseOrigins.length,1);
  const repaired=makeOrder(501,[product('ordinary-after'),product('now-readable-product')]);
  setOrders(h,[...baseline,repaired,ordinary]);
  await scan(h,'incremental');
  db=await h.pageB.getDatabase();
  assert.equal(db.providers.fanatical.syncState.failedOrderFingerprints,undefined);
  assert.equal(items(db)['now-readable-product'].metadata.purchaseOrigins.length,1);
  assert.equal(items(db)['ordinary-after'].metadata.purchaseOrigins.length,1);
}));

test('GL additive writer isolates overflow when a small Quick result combines with 500 saved occurrences',()=>fanaticalWorker(async h=>{
  const baseline=Array.from({length:500},(_,index)=>makeOrder(index+1,[product(repeated)]));
  const incoming=makeOrder(501,[product('ordinary-before'),product(repeated),product('ordinary-after')]);
  setOrders(h,baseline);await scan(h);
  const before=await h.pageA.getDatabase();
  setOrders(h,[...baseline,incoming]);
  assert.equal((await scan(h,'incremental')).acquisitionComplete,true,'acquisition independently finished');
  const after=await h.pageB.getDatabase(),state=after.providers.fanatical;
  assert.equal(state.syncHealth.status,'partial');
  assert.deepEqual(state.syncState.failedOrderFingerprints,[digest(incoming._id)]);
  assert.equal(state.syncState.knownOrderFingerprints.length,500);
  assert.equal(state.fullSyncAt,before.providers.fanatical.fullSyncAt);
  assert.deepEqual(items(after)[repeated],items(before)[repeated]);
  assert.deepEqual(Object.keys(items(after)).sort(),[repeated,'ordinary-after','ordinary-before'].sort());
  h.paths.length=0;await scan(h,'incremental');
  assert(h.paths.includes('/api/user/orders/'+incoming._id));
  assert.equal(items(await h.pageB.getDatabase())['ordinary-after'].metadata.purchaseOrigins.length,1);
}));

test('companion handoff retains a 500-copy history and admits surrounding products under the selected account',async()=>{
  const origin=(index,quantity)=>({orderRef:digest(String(index)),bundleId:'limit-bundle',bundleTitle:'Limit fixture',purchasedAt:null,quantity,occurrenceRefs:[]});
  const row=(id,origins)=>({providerItemId:id,title:id,mediaType:'book',metadata:{},purchasedAt:null,origins});
  const snapshot=records=>({protocolVersion:1,provider:'fanatical',snapshotId:'limit-fixture',accountRef:'fixture',accountLabel:'Source',capturedAt:'2026-11-01',scope:'historical',completeness:'partial',limitations:[],records});
  const db=createEmptyDatabase();
  await applyPurchaseSnapshot(db,snapshot([row(repeated,[origin(1,500)])]),{newLabel:'First',expectedActiveId:null});
  const firstId=db.providers.fanatical.activeProfileId;
  await applyPurchaseSnapshot(db,snapshot([row(repeated,[origin(3,1)])]),{newLabel:'Other',expectedActiveId:firstId});
  const recordUnder=(profile,id)=>Object.values(db.providerItems).find(i=>i.profileId===profile&&i.providerItemId===id);
  const other=(await purchaseAccounts(db,'fanatical')).find(a=>a.label==='Other');
  const savedOther=structuredClone(recordUnder(other.accountRef,repeated));
  for(const origins of [[origin(1,500),origin(2,1)],[origin(2,1)]]){
    const first=(await purchaseAccounts(db,'fanatical')).find(a=>a.label==='First');
    const result=await applyPurchaseSnapshot(db,snapshot([row('ordinary-first',[origin(4,1)]),row(repeated,origins),row('ordinary-last',[origin(5,1)])]),first);
    assert.equal(result.skipped,1);
    assert.equal(recordUnder(firstId,repeated).metadata.purchaseOrigins.length,500);
    assert(recordUnder(firstId,'ordinary-first'));
    assert(recordUnder(firstId,'ordinary-last'));
    assert.deepEqual(recordUnder(other.accountRef,repeated),savedOther);
  }
});
