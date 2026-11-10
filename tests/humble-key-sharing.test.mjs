import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyDatabase} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {applyPurchaseSnapshot,purchaseSnapshot,purchaseAccounts} from '../src/background/purchase-handoff.js';
import {memory} from './final-gl-features.js';
import {snapshotFixture} from './storage.js';
const A=GalacticPurchaseAdapters,S=GalacticPurchaseSnapshot,T=GalacticPurchaseTransfer;
const item={title:'Synthetic purchased game',kind:'game',source:'humble',purchaseKey:'synthetic-order',providerItemId:'synthetic-order:key:game:0',entitlement:'third-party-key',keyStatus:'unrevealed',keyCheckedAt:'2026-10-01T12:00:00Z'};
const state=items=>({humbleAccountId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',humbleProfileLabel:'Saved account',libraryItems:items,profileArchives:[]});
async function project(items){const source=state(items),accounts=await A.accounts('hb',source);return A.snapshot('hb',source,accounts[0].accountRef);}

for(const keyStatus of ['unknown','unrevealed','revealed','expired','unavailable'])test('HB legacy '+keyStatus+' dated observation remains valid purchase evidence',async()=>{
 const source={...item,keyStatus,expiresAt:'2026-11-01T00:00:00Z'},before=structuredClone(source),data=await project([source]);
 assert.equal(data.records[0].metadata.keyStatus,keyStatus);assert.equal(data.records[0].metadata.keyCheckedAt,'2026-10-01T12:00:00.000Z');assert.deepEqual(source,before);
 const db=createEmptyDatabase(),p=newProviderProfile('humble','Existing');db.providerProfiles[p.profileId]=p;db.providers.humble={activeProfileId:p.profileId,profileLabel:p.nickname};
 await applyPurchaseSnapshot(db,data,(await purchaseAccounts(db,'humble'))[0]);assert.equal(Object.values(db.providerItems)[0].metadata.keyCheckedAt,'2026-10-01T12:00:00.000Z');
 assert.equal((await purchaseSnapshot(db,'humble',p.profileId)).records[0].metadata.keyStatus,keyStatus);
});
for(const change of [{keyCheckedAt:'bad-date'},{keyStatus:{secret:'MUST_NOT_TRANSFER'}},{keyStatus:undefined},{expiresAt:{secret:'MUST_NOT_TRANSFER'}}])test('HB invalid optional observation is isolated: '+Object.keys(change).join(','),async()=>{
 const source={...item,...change},before=structuredClone(source),data=await project([source]);
 assert.equal(data.records.length,1);assert.equal(data.records[0].metadata.purchaseId,item.purchaseKey);assert.equal(data.records[0].providerItemId,item.providerItemId);assert(data.limitations.some(v=>v.includes('optional key observations')));assert(!JSON.stringify(data).includes('MUST_NOT_TRANSFER'));assert.deepEqual(source,before);
});
test('HB missing optional observation stays missing and strict purchase/wire validation remains',async()=>{
 const data=await project([{...item,keyStatus:undefined,keyCheckedAt:null}]);assert.equal(data.records[0].metadata.keyStatus,undefined);assert.equal(data.records[0].metadata.keyCheckedAt,undefined);
 await assert.rejects(project([{...item,purchaseKey:{unsafe:true}}]));
 assert.throws(()=>S.record({...data.records[0],metadata:{...data.records[0].metadata,keyStatus:'unrevealed',keyCheckedAt:'bad-date'}},'humble'));
 assert.throws(()=>S.record({...data.records[0],metadata:{...data.records[0].metadata,key:'SECRET'}},'humble'));
});
test('HB dated observation negotiates backward compatibility without changing purchase identity',async()=>{
 const data=await project([item]),service=T.createService({runtime:{},area:{},authorize:async()=>true,peer:async()=>'',accounts:async()=>[],snapshot:async()=>data});
 for(const supported of [false,true]){
  const {manifest}=await service.external({type:'GH_PURCHASE_BEGIN',provider:'humble',protocolVersion:1,accountRef:data.accountRef,...(supported?{humbleKeyObservations:1}:{})},{id:'trusted'});
  const chunk=await service.external({type:'GH_PURCHASE_CHUNK',provider:'humble',protocolVersion:1,token:manifest.token,index:0},{id:'trusted'});
  assert.equal(chunk.records[0].metadata.keyCheckedAt,supported?'2026-10-01T12:00:00.000Z':undefined);assert.equal(chunk.records[0].metadata.keyStatus,'unrevealed');assert.equal(chunk.records[0].providerItemId,item.providerItemId);
 }
});
test('HB observation transfer preserves real GL history and the complete source dataset',async()=>{
 const f=memory();await f.writer.ensurePurchaseAccount('humble');
 await f.writer.mergeProviderItems('humble',[{providerItemId:'earlier-book',title:'Earlier synthetic purchase',mediaType:'book',ownership:'owned',metadata:{purchaseId:'earlier-order'}}]);
 await f.writer.replaceProviderItems('humble',[],{fullSyncAt:'2026-11-01'},snapshotFixture('humble',[]));
 const db=await f.writer.getDatabase(),history=structuredClone(db.providerHistory),source={...state([item]),historicalLibraryItems:[{...item,title:'Earlier HB purchase',purchaseKey:'earlier-hb-order'}]},before=structuredClone(source);
 const data=await A.snapshot('hb',source,(await A.accounts('hb',source))[0].accountRef);
 await applyPurchaseSnapshot(db,data,(await purchaseAccounts(db,'humble'))[0]);
 assert.deepEqual(db.providerHistory,history);assert.equal(Object.keys(db.providerHistory).length,1);assert.deepEqual(source,before);assert.equal(Object.keys(db.providerItems).length,1);
});
