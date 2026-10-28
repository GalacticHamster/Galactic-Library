import assert from 'node:assert/strict';
import {providerAccounts,createAccountActions,PROVIDER_SITES,updateEligibility,createProfileManagementActions,providerActionLabel} from '../src/ui/provider-accounts.js';
import {memory} from './final-gl-features.js';
import {snapshotFixture} from './storage.js';
const record={providerItemId:'B000000001',title:'Synthetic Collection',mediaType:'book',ownership:'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B000000001'}};
export const providersUxTests=[
 ['Providers lists all supported sites and all remembered accounts without a second storage model',async()=>{
   const {writer}=memory();let d=await writer.replaceProviderItems('kindle',[record],{profileLabel:'A',fullSyncAt:'2026-10-01'},snapshotFixture('kindle',[record]));
   d=await writer.replaceProviderItems('kindle',[record],{profileLabel:'B',fullSyncAt:'2026-10-02'},snapshotFixture('kindle',[record]));
   const sites=providerAccounts(d),kindle=sites.find(p=>p.provider==='kindle');
   assert.equal(sites.length,PROVIDER_SITES.length);assert(sites.some(s=>s.provider==='playstation'));assert.equal(kindle.accounts.length,2);assert.equal(kindle.accounts.find(a=>a.active).nickname,'B');assert.equal(kindle.accounts.reduce((n,p)=>n+p.recordCount,0),2);
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
providersUxTests.push(
 ['Provider update eligibility respects selected accounts with optional names, missing history, Epic and Amazon age restrictions',()=>{
   const p={provider:'kindle',active:true,nickname:'A'},state={fullSyncAt:'2026-10-01'};
   assert(updateEligibility(p,state).quick);assert(!updateEligibility({...p,active:false},state).full);assert(updateEligibility({...p,nickname:''},state).quick);
   assert(!updateEligibility(p,{}).quick);assert(updateEligibility(p,{}).full);
   assert(!updateEligibility({...p,provider:'epic'},state).quick);assert(updateEligibility({...p,provider:'epic'},state).full);
   const now=Date.parse('2026-10-07');assert(!updateEligibility({...p,provider:'amazon-games'},{fullSyncAt:'2026-01-01'},now).quick);
   assert(updateEligibility({...p,provider:'amazon-games'},{fullSyncAt:'2026-01-01',quickSyncAt:'2026-10-01'},now).quick);
   assert(!updateEligibility({...p,syncHealth:{status:'running'}},state).full);
 }],
 ['Management UI requires explicit confirmation and writer-checked fresh preview; reset preserves reviewed contents',async()=>{
   const {writer}=memory();let d=await writer.replaceProviderItems('kindle',[record],{profileLabel:'A',fullSyncAt:'2026-10-01'},snapshotFixture('kindle',[record]));
   const a=d.providers.kindle.activeProfileId,id=Object.keys(d.providerItems)[0];
   d=await writer.saveContentReview(id,{entries:[{series:'Synthetic',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'}],statement:'Collects Synthetic #1',source:'manual-review',sourceUrl:'',verifiedAt:'2026-10-01'});
   const review=structuredClone(d.contentReviews);d=await writer.replaceProviderItems('kindle',[record],{profileLabel:'B',fullSyncAt:'2026-10-02'},snapshotFixture('kindle',[record]));const b=d.providers.kindle.activeProfileId;
   const management=createProfileManagementActions({read:()=>d,preview:(...v)=>writer.previewProviderProfileRemoval(...v),remove:async(...v)=>{d=await writer.removeProviderProfile(...v);return d;},reset:async(...v)=>{d=await writer.resetProviderProfileBaseline(...v);return d;}});
   await assert.rejects(management.reset(a,false),/Confirm/);await management.reset(a,true);assert.deepEqual(d.contentReviews,review);assert(d.providerItems[id]);assert(!d.providerProfiles[a].state.fullSyncAt);
   const plan=await management.preview(a);assert.equal(plan.dependencies.contentReviews,1);
   await assert.rejects(management.remove(a,plan.dependencyStamp,false),/Confirm/);
   d=await writer.renameProviderProfile(a,'A renamed');await assert.rejects(management.remove(a,plan.dependencyStamp,true),/dependencies changed/);
   const fresh=await management.preview(a),bRecords=Object.values(d.providerItems).filter(i=>i.profileId===b);await management.remove(a,fresh.dependencyStamp,true);
   assert(!d.providerProfiles[a]);assert(d.providerProfiles[b]);for(const i of bRecords)assert.deepEqual(d.providerItems[i.id],i);
 }]
);

providersUxTests.push(['Provider presentation names supported operations without changing eligibility',()=>{
 assert.equal(PROVIDER_SITES.length,14);
 for(const site of PROVIDER_SITES){
   assert(!site.name.includes(' \u2014 '));
   assert.equal(providerActionLabel(site.provider,'full'),site.fullLabel);
   assert.equal(Boolean(site.quickLabel),!['epic','nintendo'].includes(site.provider));
 }
 assert.equal(providerActionLabel('epic','full'),'Sync Epic library');
 assert.equal(providerActionLabel('nintendo','full'),'Import Nintendo cards');
 assert.match(PROVIDER_SITES.find(s=>s.provider==='xbox').scope,/not.*lifetime/u);
 assert.match(PROVIDER_SITES.find(s=>s.provider==='playstation').scope,/PS4\/PS5/u);
 assert.match(PROVIDER_SITES.find(s=>s.provider==='amazon-games').scope,/three months/u);
}]);
