import assert from 'node:assert/strict';
import '../shared/purchase-snapshot.js';
import '../shared/purchase-adapters.js';
import '../shared/purchase-transfer.js';
import {createEmptyDatabase,normalizeProviderItem} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {humbleInventory,purchaseAccounts,previewPurchaseSnapshot} from '../src/background/purchase-handoff.js';
export const purchaseReconciliationTests=[];
const test=(name,run)=>purchaseReconciliationTests.push([name,run]);
const A=globalThis.GalacticPurchaseAdapters,S=globalThis.GalacticPurchaseSnapshot,T=globalThis.GalacticPurchaseTransfer;
const observation=(n,extra={})=>({rowRef:'current:'+n,status:'current',title:'Book '+n,mediaType:'book',purchaseId:'purchase_'+n,bundle:'Bundle',purchasedAt:null,...extra});
const inventory=(role,observations,extra={})=>A.inventory({role,accountRef:role+'-account',accountLabel:'Personal',currentCount:observations.length,historicalCount:0,observations,...extra});
function database(){const db=createEmptyDatabase(),p=newProviderProfile('humble','Personal');db.providerProfiles[p.profileId]=p;db.providers.humble={...p.state,activeProfileId:p.profileId,profileLabel:p.nickname};const i=normalizeProviderItem({provider:'humble',providerItemId:'purchase_0:product:native',title:'Book 0',mediaType:'book',ownership:'owned',profileId:p.profileId,metadata:{source:'humble-purchase-library',purchaseId:'purchase_0',entitlement:'direct-download'}},undefined,{profileKeySpace:p.keySpace});db.providerItems[i.id]=i;return db;}
const snapshot=()=>S.validate({protocolVersion:1,provider:'humble',snapshotId:'synthetic',accountRef:'hb-account',accountLabel:'Personal',capturedAt:'2026-10-09T12:00:00Z',scope:'historical',completeness:'partial',limitations:[],records:[{providerItemId:null,title:'Book 0',mediaType:'book',metadata:{purchaseId:'purchase_0'},purchasedAt:null,origins:[]}]});

test('Reconciliation distinguishes native record evidence, historical purchases, title-only and exclusive records',async()=>{
 const hb=await inventory('hb',[observation(0,{providerItemId:'purchase_0:product:native'}),observation(1),observation(2),observation(3),observation(4,{purchaseId:null})]);
 const gl=await inventory('gl',[observation(0,{providerItemId:'purchase_0:product:native'}),observation(1,{providerItemId:'purchase_1:product:second'}),observation(2,{purchaseId:'other'}),observation(9)]);
 const result=A.reconcileInventories(hb,gl);assert.equal(result.counts.confident,2);assert.equal(result.counts.nativeRecordMatches,1);assert.equal(result.counts.historicalPurchaseMatches,1);assert.equal(result.counts.titleOnlyPossible,1);assert.equal(result.counts.hbOnly,1);assert.equal(result.counts.glOnly,2);assert.equal(result.counts.uncomparable,1);assert.equal(JSON.stringify(result).includes('purchase_0'),false);assert.deepEqual(result,A.reconcileInventories(hb,gl));
});
test('Same title across bundles/editions, conflicting native IDs and media are never asserted as same purchase',async()=>{
 const hb=await inventory('hb',[observation(0,{providerItemId:'purchase_0:product:first'}),observation(1,{mediaType:'software'}),observation(2,{purchaseId:'another_bundle'})]);
 const gl=await inventory('gl',[observation(0,{providerItemId:'purchase_0:product:second'}),observation(1,{mediaType:'game'}),observation(2)]);
 const r=A.reconcileInventories(hb,gl);assert.equal(r.counts.confident,0);assert.equal(r.counts.conflicts,2);assert.equal(r.counts.titleOnlyPossible,1);
});
test('Repeated deliveries, positions and archived history remain explicit observations',async()=>{
 const hb=await inventory('hb',[observation(0,{status:'archived-current'}),observation(1,{status:'archived-history'})],{currentCount:1,historicalCount:1});
 const gl=await inventory('gl',[observation(0,{providerItemId:'purchase_0:product:first'}),observation(0,{providerItemId:'purchase_0:product:second',rowRef:'current:1'}),observation(7,{providerItemId:'purchase_7:product:position-4'})]);
 const r=A.reconcileInventories(hb,gl);assert.equal(r.counts.ambiguous,1);assert.equal(r.counts.confident,0);assert.equal(r.repeated.gl.extraObservations,1);assert.equal(r.history.hb.length,1);assert.equal(gl.records[2].nativeProductId,null);assert.equal(r.accounts.hb.currentOrigins,1);
});
test('Inventory rejects secrets, arbitrary fields, malformed hashes and excessive inputs',async()=>{
 const i=await inventory('hb',[observation(0)]);for(const row of [{...i.records[0],key_value:'secret'},{...i.records[0],purchaseRef:'raw-order'},{...i.records[0],status:'owned'}])assert.throws(()=>A.validateInventory({...i,records:[row]}));assert.throws(()=>A.validateInventory({...i,currentCount:50001}));assert.throws(()=>A.reconcileInventories(i,i));
});
test('GL preview uses disposable state and existing legacy/unsupported/ambiguous transfer rules',async()=>{
 const db=database(),before=JSON.stringify(db),target=(await purchaseAccounts(db,'humble'))[0];const result=await previewPurchaseSnapshot(db,snapshot(),target);assert.equal(result.added,0);assert.equal(result.legacyMatchable,1);assert.equal(JSON.stringify(db),before);
 const unsupported=await previewPurchaseSnapshot(db,{...snapshot(),records:[{...snapshot().records[0],mediaType:'elearning'}]},target);assert.equal(unsupported.skipped,1);assert.equal(JSON.stringify(db),before);
 const source=await humbleInventory(db,target.accountRef);assert.equal(source.currentCount,1);assert.equal(source.records[0].nativeProductId,'native');
 const item=Object.values(db.providerItems)[0],other=normalizeProviderItem({...item,providerItemId:'purchase_0:product:second'},undefined,{profileKeySpace:db.providerProfiles[target.accountRef].keySpace});db.providerItems[other.id]=other;const ambiguous=await previewPurchaseSnapshot(db,snapshot(),target);assert.equal(ambiguous.ambiguous,1);assert.equal(ambiguous.skipped,1);
});
test('GL diagnostic inventory ordering survives equivalent native storage dictionary reordering',async()=>{
 const db=database(),p=Object.values(db.providerProfiles)[0],first=Object.values(db.providerItems)[0],second=normalizeProviderItem({...first,providerItemId:'purchase_1:product:next',metadata:{...first.metadata,purchaseId:'purchase_1'}},undefined,{profileKeySpace:p.keySpace});db.providerItems[second.id]=second;const original=await humbleInventory(db,p.profileId);db.providerItems=Object.fromEntries(Object.entries(db.providerItems).reverse());assert.deepEqual(await humbleInventory(db,p.profileId),original);
});
test('Read-only authorized pulls and both preview directions create no offer, storage write or import',async()=>{
 const services={},writes=[],commits=[];
 for(const role of ['hb','gl']){const runtime={sendMessage:async(id,message)=>({ok:true,protocolVersion:1,...await services[id].external(message,{id:role})})};services[role]=T.createService({runtime,area:{get:async d=>d,set:async v=>writes.push(v)},authorize:async id=>id!==role&&['hb','gl'].includes(id),peer:async()=>role==='hb'?'gl':'hb',accounts:async()=>[],inventory:async()=>inventory(role,[observation(0)]),snapshot:async()=>({...snapshot(),accountRef:role+'-account'}),preview:async data=>({readOnly:true,sourceRecords:data.records.length}),commit:async data=>commits.push(data)});}
 const r=await services.gl.local({action:'reconcile',provider:'humble',localAccountRef:'gl-account',remoteAccountRef:'hb-account'});assert.equal(r.reconciliation.counts.confident,1);
 for(const direction of ['import','send']){const result=await services.gl.local({action:'preview',provider:'humble',direction,accountRef:direction==='send'?'gl-account':'hb-account',target:{accountRef:'destination'}});assert.equal(result.preview.readOnly,true);}
 assert.deepEqual(writes,[]);assert.deepEqual(commits,[]);
 const m=await services.hb.prepare('humble','hb-account','gl','inventory');await assert.rejects(services.gl.external({type:'GH_PURCHASE_OFFER',provider:'humble',protocolVersion:1,manifest:m},{id:'hb'}),/cannot be offered/);await assert.rejects(services.gl.external({type:'GH_PURCHASE_PREVIEW',provider:'humble',protocolVersion:1,accountRef:'hb-account',target:{accountRef:'destination'}},{id:'intruder'}),/not authorized/);
});
test('Representative 6321/7077 and 15000-record synthetic diagnostics scale without corpus claims',async()=>{
 for(const [hn,gn]of [[6321,7077],[15000,15000]]){const start=performance.now(),h=await inventory('hb',Array.from({length:hn},(_,n)=>observation(n))),g=await inventory('gl',Array.from({length:gn},(_,n)=>observation(n,{providerItemId:'purchase_'+n+':product:native_'+n}))),r=A.reconcileInventories(h,g);assert.equal(r.counts.confident,hn);assert.equal(r.counts.glOnly,gn-hn);const elapsed=performance.now()-start;assert(elapsed<10000,'Bounded comparison should not block for tens of seconds');console.log(JSON.stringify({syntheticOnly:true,hb:hn,gl:gn,reconcileMs:elapsed}));}
});
