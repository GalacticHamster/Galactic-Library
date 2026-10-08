import assert from 'node:assert/strict';
import {providerAccounts,createAccountActions,PROVIDER_SITES} from '../src/ui/provider-accounts.js';
import {memory} from './final-gl-features.js';
import {snapshotFixture} from './storage.js';
const record={providerItemId:'B000000001',title:'Synthetic Collection',mediaType:'book',ownership:'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B000000001'}};
export const providersUxTests=[
 ['Providers lists all supported sites and all remembered accounts without a second storage model',async()=>{
   const {writer}=memory();let d=await writer.replaceProviderItems('kindle',[record],{profileLabel:'A',fullSyncAt:'2026-10-01'},snapshotFixture('kindle',[record]));
   d=await writer.replaceProviderItems('kindle',[record],{profileLabel:'B',fullSyncAt:'2026-10-02'},snapshotFixture('kindle',[record]));
   const sites=providerAccounts(d),kindle=sites.find(p=>p.provider==='kindle');
   assert.equal(sites.length,11);assert.equal(kindle.accounts.length,2);assert.equal(kindle.accounts.find(a=>a.active).nickname,'B');assert.equal(kindle.accounts.reduce((n,p)=>n+p.recordCount,0),2);
   assert.equal(kindle.accounts.find(a=>a.nickname==='A').baselineComplete,true);
   assert(PROVIDER_SITES.every(p=>p.url.startsWith('https://')));
 }],
 ['Offline account-selection UI requires confirmation and stale selection protection; naming preserves evidence',async()=>{
   const {writer}=memory();let d=await writer.replaceProviderItems('kindle',[record],{profileLabel:'',fullSyncAt:'2026-10-01'},snapshotFixture('kindle',[record]));
   const a=d.providers.kindle.activeProfileId,before=structuredClone(d.providerItems),baseline=structuredClone(d.providerProfiles[a].state);
   let selected=0;const actions=createAccountActions({read:()=>d,select:async(...args)=>{selected++;d=await writer.selectProviderProfile(...args);return d;},rename:async(...args)=>{d=await writer.renameProviderProfile(...args);return d;}});
   await actions.rename(a,' Personal ');assert.equal(d.providerProfiles[a].nickname,'Personal');assert.deepEqual(d.providerItems,before);assert.equal(d.providerProfiles[a].state.fullSyncAt,baseline.fullSyncAt);
   d=await writer.replaceProviderItems('kindle',[record],{profileLabel:'B',fullSyncAt:'2026-10-02'},snapshotFixture('kindle',[record]));const b=d.providers.kindle.activeProfileId;
   await assert.rejects(actions.select(a,b,false),/Confirm/);await assert.rejects(actions.select(a,a,true),/changed/);assert.equal(selected,0);
   await actions.select(a,b,true);assert.equal(selected,1);assert.equal(d.providers.kindle.fullSyncAt,baseline.fullSyncAt);assert.equal(Object.keys(d.providerItems).length,2);
   const scan=await writer.beginProviderScan('kindle','Personal','incremental',false,1);assert.equal(scan.forceFull,false);
 }]
];
