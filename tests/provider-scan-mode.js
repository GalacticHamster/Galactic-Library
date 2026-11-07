import {updateEligibility} from '../src/ui/provider-accounts.js';
import assert from 'node:assert/strict';
import {PROVIDERS} from '../src/lib/constants.js';
import {providerScanMode} from '../src/lib/provider-scan-mode.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createEmptyDatabase} from '../src/lib/models.js';
import {withWorker} from './storage.js';
import {providerSyncLibrary as library,providerSyncValue as value,providerSyncSnapshot as snapshot,consoleProvider,fingerprint} from './provider-sync-fixture.js';
const fullOnly=p=>p==='epic';
const known=p=>p==='humble'?{knownPurchaseIds:['purchase-1']}:p==='fanatical'?{knownOrderFingerprints:['b'.repeat(64)]}:{};
function memory(db=createEmptyDatabase()){
 const stored={galacticLibraryDatabase:structuredClone(db)};
 const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async patch=>Object.assign(stored,structuredClone(patch))});return {writer,stored};
}
const begin=(w,p,label='Personal',mode='incremental',switching=false)=>w.beginProviderScan(p,label,mode,switching,1,null,false,consoleProvider(p)?fingerprint:null);
const commit=(w,p,s,items,mode)=>w.commitProviderScan(p,items,{syncMode:mode,...(mode==='full'?{fullSyncAt:new Date().toISOString()}:{quickSyncAt:new Date().toISOString()}),...(['humble','fanatical'].includes(p)?{syncState:known(p)}:{})},mode==='full'||consoleProvider(p)?snapshot(p,items):undefined,s.scanToken,1,false,consoleProvider(p)?fingerprint:null);
export const providerScanModeTests=PROVIDERS.flatMap(p=>[
 ['quick orchestration '+p+': first import uses the normal complete commit, then updates the established baseline',async()=>{
  const {writer}=memory(),s=await begin(writer,p);assert(s.forceFull);const items=[value(p)];let db=await commit(writer,p,s,items,'full');
  assert(db.providerProfiles[s.profileId].state.fullSyncAt);assert.equal(Object.values(db.providerItems).length,1);
  const next=await begin(writer,p);assert.equal(next.forceFull,false);await commit(writer,p,next,items,fullOnly(p)?'full':'incremental');
 }],
 ['quick orchestration '+p+': valid and empty completed baselines remain distinct from never imported',async()=>{
  const state={fullSyncAt:'2026-10-01',syncState:known(p)};
  assert.equal(providerScanMode(p,state,fullOnly(p)?'full':'incremental').mode,fullOnly(p)?'full':'incremental');
  const {writer}=memory(library(p,[])),s=await begin(writer,p);assert.equal(s.forceFull,false);assert.equal(Object.values((await writer.getDatabase()).providerItems).length,0);
 }],
 ['quick orchestration '+p+': missing library baseline selects full without trusting existing item count',async()=>{
  const db=library(p);delete db.providers[p].fullSyncAt;delete db.providerProfiles[db.providers[p].activeProfileId].state.fullSyncAt;
  const {writer}=memory(db),s=await begin(writer,p);assert(s.forceFull);assert.equal(s.scanReason,'baseline-unavailable');
  await assert.rejects(commit(writer,p,s,[value(p)],'incremental'),/requires.*full|Nintendo requires/);
 }],
 ['quick orchestration '+p+': selected new account cannot borrow another account baseline',async()=>{
  const {writer}=memory(library(p)),old=await writer.getDatabase(),active=old.providers[p].activeProfileId;
  if(consoleProvider(p)){
   await assert.rejects(begin(writer,p,'Other','incremental',true),/already saved/);
   const s=await writer.beginProviderScan(p,'Other','incremental',true,1,null,false,'c'.repeat(64));assert(s.forceFull);return;
  }
  const s=await begin(writer,p,'Other','incremental',true);assert(s.forceFull);assert.notEqual(s.profileId,active);
  const db=await commit(writer,p,s,[value(p)],'full');
  for(const [id,row] of Object.entries(old.providerItems))assert.deepEqual(db.providerItems[id],row);
  assert.equal(Object.values(db.providerItems).length,2);
 }],
 ['quick orchestration '+p+': explicit full remains full regardless of incremental state',()=>{
  assert.equal(providerScanMode(p,{fullSyncAt:'2026-10-01',syncState:known(p)},'full').mode,'full');
  assert.equal(providerScanMode(p,{},'full').mode,'full');
 }],
 ['quick orchestration '+p+': authentication and network failures preserve records and do not start a replacement scan',async()=>{
  for(const code of ['authentication','network']){
   const db=library(p),{writer,stored}=memory(db),row=Object.values(db.providerItems)[0];await writer.saveOwnershipCorrections([{recordRef:row.recordRef,provider:p,profileId:row.profileId,expectedReviewRef:null}],{ownership:'returned'});const s=await begin(writer,p);const before=await writer.getDatabase(),token=stored.galacticLibraryProviderScans[p].scanToken;
   await writer.failProviderScan(p,s.scanToken,1,{code});const after=await writer.getDatabase();
   for(const key of ['providerItems','providerHistory','contentReviews','identityDecisions','ownershipReviews'])assert.deepEqual(after[key],before[key],key);
   assert(!stored.galacticLibraryProviderScans[p]||stored.galacticLibraryProviderScans[p].scanToken===token);assert.equal(after.providers[p].syncHealth.status,'failed');
  }
 }],
 ['quick orchestration '+p+': rejected complete fallback preserves previous records and correction state',async()=>{
  const db=library(p);delete db.providers[p].fullSyncAt;delete db.providerProfiles[db.providers[p].activeProfileId].state.fullSyncAt;const {writer}=memory(db);const row=Object.values(db.providerItems)[0];await writer.saveOwnershipCorrections([{recordRef:row.recordRef,provider:p,profileId:row.profileId,expectedReviewRef:null}],{ownership:'returned'});const s=await begin(writer,p);assert(s.forceFull);const before=await writer.getDatabase();
  await assert.rejects(writer.commitProviderScan(p,[value(p)],{syncMode:'full'},null,s.scanToken,1,false,consoleProvider(p)?fingerprint:null),/snapshot|complete|coverage|scope/i);
  const after=await writer.getDatabase();for(const key of ['providerItems','providerHistory','contentReviews','ownershipReviews'])assert.deepEqual(after[key],before[key]);
 }]
]);
for(const p of ['humble','fanatical'])providerScanModeTests.push(
 ['quick orchestration '+p+': missing or incompatible order checkpoint recovers through complete acquisition',async()=>{
  for(const checkpoint of [undefined,{},p==='humble'?{knownPurchaseIds:null}:{knownOrderFingerprints:null}]){
   assert.equal(providerScanMode(p,{fullSyncAt:'2026-10-01',syncState:checkpoint}).scanReason,'baseline-unavailable');
  }
  for(const checkpoint of [undefined,{},p==='humble'?{knownPurchaseIds:null}:{knownOrderFingerprints:null},p==='humble'?{knownPurchaseIds:'legacy-id'}:{knownOrderFingerprints:'b'.repeat(64)}]){
   const db=library(p),profile=db.providerProfiles[db.providers[p].activeProfileId];
   if(checkpoint===undefined){delete profile.state.syncState;delete db.providers[p].syncState;}else{profile.state.syncState=checkpoint;db.providers[p].syncState=structuredClone(checkpoint);}
   const {writer}=memory(db),s=await begin(writer,p);assert(s.forceFull);assert.equal(s.scanReason,'baseline-unavailable');await commit(writer,p,s,[value(p)],'full');
  }
 }]
);
providerScanModeTests.push(['quick worker replies expose the full-import decision to console controllers',()=>withWorker(async({dispatch})=>{
 for(const p of ['xbox','playstation']){
  const sender={id:chrome.runtime.id,url:p==='xbox'?'https://play.xbox.com/library?catalog=owned':'https://library.playstation.com/recently-purchased',tab:{id:1}};
  const result=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:p,mode:'incremental',beginScan:true,confirmed:true,profileLabel:'Personal',sourceAccountFingerprint:fingerprint},sender);
  assert(result.ok,result.error);assert.equal(result.forceFull,true);assert.equal(result.hasFullBaseline,false);assert.equal(result.scanReason,'first-import');
 }
})]);

for(const p of ['humble','fanatical'])providerScanModeTests.push(
 ['quick orchestration '+p+': corrupt persisted identity evidence is not silently repaired or overwritten',async()=>{
  const db=library(p),state=db.providerProfiles[db.providers[p].activeProfileId].state;
  state.syncState=p==='humble'?{knownPurchaseIds:[{}]}:{knownOrderFingerprints:['invalid']};
  const {writer,stored}=memory(db),before=structuredClone(stored);
  await assert.rejects(begin(writer,p),/Purchase IDs|fingerprint/);assert.deepEqual(stored,before);
 }],
 ['quick worker '+p+': absent checkpoint returns full admission and no stale stopping IDs',()=>withWorker(async({dispatch,pageA})=>{
  const db=library(p);delete db.providers[p].syncState;delete db.providerProfiles[db.providers[p].activeProfileId].state.syncState;await pageA.restoreDatabase(db);
  const sender={id:chrome.runtime.id,url:p==='humble'?'https://www.humblebundle.com/home/purchases':'https://www.fanatical.com/en/orders',tab:{id:1}};
  const r=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:p,mode:'incremental',beginScan:true,confirmed:true,profileLabel:'Personal'},sender);
  assert(r.ok,r.error);assert(r.forceFull);assert.equal(r.hasFullBaseline,false);assert.equal(r.scanReason,'baseline-unavailable');assert.deepEqual(r.syncState,{});
 })]
);

for(const p of PROVIDERS)providerScanModeTests.push(['quick launch '+p+': missing or stale baselines do not block the selected account',()=>{for(const state of [{},{fullSyncAt:'2020-01-01'},{fullSyncAt:'2026-10-01',syncState:{}}]){const profile={provider:p,active:true};assert.equal(updateEligibility(profile,state).quick,!fullOnly(p));assert.equal(updateEligibility({...profile,active:false},state).quick,false);assert.equal(updateEligibility({...profile,syncHealth:{status:'running'}},state).quick,false);}}]);
