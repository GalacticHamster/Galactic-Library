import assert from 'node:assert/strict';
import test from 'node:test';
import {createEmptyDatabase,normalizeProviderItem} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {purchaseAccounts,purchaseSnapshot,applyPurchaseSnapshot} from '../src/background/purchase-handoff.js';

for(const first of ['manual','automatic'])test(`${first} then repeated opposite imports preserve exact purchase identities in the same account`,async()=>{
  const db=createEmptyDatabase(),profile=newProviderProfile('humble','Personal');db.providerProfiles[profile.profileId]=profile;
  for(const order of ['order-one','order-two']){
    const item=normalizeProviderItem({provider:'humble',profileId:profile.profileId,providerItemId:order+':product:same-product',title:'Same title, separate purchases',mediaType:'book',ownership:'owned',metadata:{source:'humble-purchase-library',purchaseId:order,entitlement:'direct-download'}},undefined,{profileKeySpace:profile.keySpace});db.providerItems[item.id]=item;
  }
  const snapshot=await purchaseSnapshot(db,'humble',profile.profileId),before=JSON.stringify(db.providerItems);
  for(const mode of [first,first==='manual'?'automatic':'manual',first]){
    const account=(await purchaseAccounts(db,'humble'))[0];
    const result=await applyPurchaseSnapshot(db,snapshot,{...account,...(mode==='automatic'?{autoSync:{id:'test-relationship'}}:{})});
    assert.equal(result.added,0);assert.equal(result.unchanged,2);assert.equal(JSON.stringify(db.providerItems),before);
  }
});

test('equal native tokens in separate accounts never authorize cross-account record merging',async()=>{
  const db=createEmptyDatabase();
  for(const label of ['First','Second']){
    const p=newProviderProfile('humble',label);db.providerProfiles[p.profileId]=p;
    const item=normalizeProviderItem({provider:'humble',profileId:p.profileId,providerItemId:'shared-token',title:'Same title',mediaType:'book',ownership:'owned',metadata:{source:'humble-purchase-library',purchaseId:'shared-order'}},undefined,{profileKeySpace:p.keySpace});db.providerItems[item.id]=item;
  }
  assert.equal(Object.keys(db.providerItems).length,2);
  const snapshot=await purchaseSnapshot(db,'humble',Object.keys(db.providerProfiles)[0]),before=JSON.stringify(db.providerItems);
  await applyPurchaseSnapshot(db,snapshot,(await purchaseAccounts(db,'humble'))[0]);
  assert.equal(Object.keys(db.providerItems).length,2);assert.equal(JSON.stringify(db.providerItems),before);
});
