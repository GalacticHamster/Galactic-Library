import assert from 'node:assert/strict';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {memory} from './final-gl-features.js';
import {snapshotFixture} from './storage.js';
import {activeRecord} from './provider-profile-fixture.js';
import {matchItems} from '../src/lib/matcher.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';

const book=(native='B000000001')=>({provider:'kindle',providerItemId:native,title:'Synthetic Collection',mediaType:'book',ownership:'owned',metadata:{detailUrl:`https://www.amazon.com/dp/${native}`}});
const review={entries:[{series:'Synthetic',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'}],statement:'Collects Synthetic #1',source:'manual-review',sourceUrl:'',verifiedAt:'2026-10-01T00:00:00.000Z'};
const full=(writer,profile,items)=>writer.replaceProviderItems('kindle',items,{profileLabel:profile,fullSyncAt:'2026-10-01'},snapshotFixture('kindle',items));
export const providerProfileTests=[
 ['profile migration preserves current baseline, trusted decisions, refs and backup round trips',()=>{
   const d=createEmptyDatabase();d.schemaVersion=12;delete d.providerProfiles;delete d.unresolvedProfileState;
   const item=normalizeProviderItem(book());d.providerItems[item.id]=item;d.providers.kindle={profileLabel:'A',fullSyncAt:'2026-10-01'};d.contentReviews[item.id]=review;
   const before=matchItems(d.providerItems,[{title:item.title,mediaType:'book'}],d)[0];
   const after=validateDatabase(d),profile=after.providerProfiles[after.providers.kindle.activeProfileId];
   assert.equal(profile.nickname,'A');assert.equal(profile.state.fullSyncAt,'2026-10-01T00:00:00.000Z');assert.equal(after.providerItems[item.id].recordRef,item.recordRef);assert.deepEqual(after.contentReviews[item.id],review);
   assert.deepEqual(matchItems(after.providerItems,[{title:item.title,mediaType:'book'}],after)[0],before);
   assert.deepEqual(parseBackup(createBackup(after)),after);assert.deepEqual(validateDatabase(after),after);
 }],
 ['migration promotes remembered accounts but quarantines ambiguous native-keyed confirmations',()=>{
   const d=createEmptyDatabase();d.schemaVersion=12;delete d.providerProfiles;
   const a=normalizeProviderItem(book()),b=normalizeProviderItem(book()),other=normalizeProviderItem({...book('B000000002'),title:'Other'});
   d.providerItems[b.id]=b;d.providerItems[other.id]=other;d.providers.kindle={profileLabel:'B',fullSyncAt:'2026-10-01'};
   d.providerHistory[a.recordRef]={item:a,profileLabel:'A',reason:'profile-switch',missingSince:'2026-10-01'};
   d.contentReviews[a.id]=review;d.manualMatchDecisions.x={itemIds:[a.id,other.id],decision:'same-work',updatedAt:'2026-10-01'};
   const sep=crypto.randomUUID();d.editionSeparations[sep]={itemId:a.id,otherItemIds:[other.id],updatedAt:'2026-10-01'};
   const result=validateDatabase(d);
   assert.equal(Object.keys(result.providerItems).length,3);assert.equal(Object.keys(result.providerProfiles).length,2);
   assert(!Object.values(result.providerProfiles).find(p=>p.nickname==='A').state.fullSyncAt);
   assert.equal(Object.keys(result.contentReviews).length,0);assert.equal(Object.keys(result.manualMatchDecisions).length,0);assert.equal(Object.keys(result.editionSeparations).length,0);
   assert(result.unresolvedProfileState.contentReviews[a.id]);assert(result.unresolvedProfileState.manualMatchDecisions.x);assert(result.unresolvedProfileState.editionSeparations[sep]);
   assert.deepEqual(validateDatabase(result),result);
 }],
 ['missing A product cannot donate contents or relationships to the same native product in B',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book(),book('B000000002')]);const a=activeRecord(d,'kindle','B000000001'),other=activeRecord(d,'kindle','B000000002');
   await writer.saveContentReview(a.id,review);await writer.saveManualMatchDecision({itemIds:[a.id,other.id]},'same-work');
   d=await writer.getDatabase();const sep=crypto.randomUUID();d.editionSeparations[sep]={itemId:a.id,otherItemIds:[other.id],updatedAt:'2026-10-01'};await writer.restoreDatabase(d);
   await full(writer,'A',[book('B000000002')]);d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');
   assert.notEqual(a.id,b.id);assert.notEqual(a.recordRef,b.recordRef);assert.notEqual(a.profileId,b.profileId);
   assert(d.contentReviews[a.id]);assert(!d.contentReviews[b.id]);assert(!Object.values(d.manualMatchDecisions).some(r=>r.itemIds.includes(b.id)));assert.equal(d.editionSeparations[sep].itemId,a.id);
   assert.equal(d.providerHistory[a.recordRef].reason,'missing-from-complete-scan');
   d=await full(writer,'A',[book(),book('B000000002')]);assert.equal(d.providerItems[a.id].recordRef,a.recordRef);assert(d.providerItems[b.id]);assert(d.contentReviews[a.id]);
 }],
 ['same native product coexists with independent access, canonical identity and enrichment',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book()]);const a=activeRecord(d,'kindle','B000000001');
   await writer.saveTitleAliases(a.recordRef,['Synthetic Alias']);
   d=await full(writer,'B',[{...book(),ownership:'borrowed'}]);const b=activeRecord(d,'kindle','B000000001');
   assert.equal(d.providerItems[a.id].ownership,'owned');assert.equal(b.ownership,'borrowed');assert(d.titleAliases[a.recordRef]);assert(!d.titleAliases[b.recordRef]);
   assert(Object.values(d.canonicalItems).some(c=>c.providerItemIds.includes(a.id)&&c.providerItemIds.includes(b.id)));
   assert.equal(matchItems(d.providerItems,[{title:a.title,mediaType:'book'}],d)[0].owned,true);
   assert.deepEqual(parseBackup(createBackup(d)),d);
 }],
 ['profile validation rejects foreign owners, duplicate namespaces and duplicate observations',async()=>{
   const {writer}=memory();const d=await full(writer,'A',[book()]);const item=activeRecord(d,'kindle','B000000001');
   const bad=structuredClone(d);bad.providerItems[item.id].profileId=crypto.randomUUID();assert.throws(()=>validateDatabase(bad),/unknown provider profile/);
   const duplicate=structuredClone(d);duplicate.providerItems.duplicate={...item};assert.throws(()=>validateDatabase(duplicate),/duplicate provider identities/);
   const history=structuredClone(d);history.providerHistory[item.recordRef]={item,profileLabel:'A',reason:'missing-from-complete-scan',missingSince:'2026-10-01'};assert.throws(()=>validateDatabase(history),/share a reference/);
 }]
 ];

providerProfileTests.push(
 ['remembered A/B baselines select offline, quick-update independently and reject stale authority',async()=>{
   const {writer,stored}=memory(),items=[book()];
   let scan=await writer.beginProviderScan('kindle','A','full',false,1);
   let d=await writer.commitProviderScan('kindle',items,{syncMode:'full',fullSyncAt:'2026-10-01'},snapshotFixture('kindle',items),scan.scanToken,1),a=activeRecord(d,'kindle','B000000001');
   scan=await writer.beginProviderScan('kindle','B','full',true,2);
   d=await writer.commitProviderScan('kindle',items,{syncMode:'full',fullSyncAt:'2026-10-02'},snapshotFixture('kindle',items),scan.scanToken,2);const b=activeRecord(d,'kindle','B000000001');
   const evidence=structuredClone(d.providerItems);
   await assert.rejects(writer.selectProviderProfile(a.profileId,b.profileId,false),/Confirm/);
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.deepEqual(d.providerItems,evidence);assert.equal(d.providers.kindle.fullSyncAt,'2026-10-01T00:00:00.000Z');
   scan=await writer.beginProviderScan('kindle','A','incremental',false,1);assert.equal(scan.forceFull,false);assert.equal(scan.profileId,a.profileId);
   d=await writer.commitProviderScan('kindle',[],{syncMode:'incremental',quickSyncAt:'2026-10-03'},null,scan.scanToken,1);assert(d.providerItems[a.id]&&d.providerItems[b.id]);
   const stale=await writer.beginProviderScan('kindle','A','incremental',false,1);
   d=await writer.selectProviderProfile(b.profileId,a.profileId,true);
   await assert.rejects(writer.commitProviderScan('kindle',items,{syncMode:'incremental'},null,stale.scanToken,1),/superseded/);
   assert.equal(await writer.failProviderScan('kindle',stale.scanToken,1,{code:'network'}),false);
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.equal(d.providers.kindle.quickSyncAt,'2026-10-03T00:00:00.000Z');assert.deepEqual(d.providerItems,evidence);
   assert.equal(Object.keys(stored.galacticLibraryProviderScans).length,0);
 }],
 ['profile rename preserves immutable identity, baseline, history and rich evidence',async()=>{
   const {writer}=memory();let d=await full(writer,'Personal',[book()]),a=activeRecord(d,'kindle','B000000001');
   await writer.saveContentReview(a.id,review);await writer.saveTitleAliases(a.recordRef,['Alias']);d=await full(writer,'B',[book()]);
   const before=structuredClone(d),b=activeRecord(d,'kindle','B000000001');d=await writer.renameProviderProfile(a.profileId,'Sean');
   assert.deepEqual(d.providerItems,before.providerItems);assert.deepEqual(d.contentReviews,before.contentReviews);assert.deepEqual(d.titleAliases,before.titleAliases);
   assert.equal(d.providerProfiles[a.profileId].state.fullSyncAt,before.providerProfiles[a.profileId].state.fullSyncAt);assert.equal(d.providerProfiles[a.profileId].nickname,'Sean');
   await assert.rejects(writer.renameProviderProfile(a.profileId,'B'),/already used/);
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.equal(d.providers.kindle.profileLabel,'Sean');const scan=await writer.beginProviderScan('kindle','Sean','incremental',false,1);assert.equal(scan.forceFull,false);
 }],
 ['full scan missing inference and difference counts are restricted to the targeted profile',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book(),book('B000000002')]),a=activeRecord(d,'kindle','B000000001');
   d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');d=await full(writer,'B',[]);
   assert(d.providerItems[a.id]);assert(!d.providerHistory[a.recordRef]);assert(d.providerHistory[b.recordRef]);assert.equal(d.providers.kindle.syncHealth.differences.missing,1);
   assert.equal(d.providerProfiles[a.profileId].state.recordCount,2);assert.equal(d.providerProfiles[b.profileId].state.recordCount,0);
 }],
 ['purchase IDs and order fingerprints survive A/B/A without combining skip authority',async()=>{
   const {writer}=memory();const fullProvider=async(provider,label,native,syncState)=>{const items=[{providerItemId:native,title:native}];return writer.replaceProviderItems(provider,items,{profileLabel:label,fullSyncAt:'2026-10-01',syncState},snapshotFixture(provider,items));};
   for(const provider of ['humble','fanatical']){
     const state=n=>provider==='humble'?{knownPurchaseIds:[`purchase-${n}`]}:{knownOrderFingerprints:[String(n).repeat(64)]};
     let d=await fullProvider(provider,'A','x',state(1)),a=d.providers[provider].activeProfileId;d=await fullProvider(provider,'B','x',state(2));const b=d.providers[provider].activeProfileId;
     d=await writer.selectProviderProfile(a,b,true);assert.deepEqual(d.providers[provider].syncState,state(1));
     const scan=await writer.beginProviderScan(provider,'A','incremental',false,1);assert.equal(scan.forceFull,false);
     d=await writer.selectProviderProfile(b,a,true);assert.deepEqual(d.providers[provider].syncState,state(2));
   }
 }]
);
