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
