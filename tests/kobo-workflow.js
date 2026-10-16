import assert from 'node:assert/strict';
import '../src/providers/metadata.js';
import '../src/providers/kobo.js';
import {memory} from './final-gl-features.js';
import {snapshotFixture} from './storage.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {koboObservationChanged,preserveKoboObservation} from '../src/lib/kobo-observations.js';
import {normalizeProviderItem} from '../src/lib/models.js';
import {libraryCategoryEvidence} from '../src/lib/genre-hints.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {matchItems} from '../src/lib/matcher.js';
import {recoverKoboActionTitles} from '../scripts/recover-kobo-action-titles.mjs';
const item=(n,metadata={})=>({providerItemId:String(n),title:'Example Book '+n,mediaType:'book',ownership:'unknown',metadata:{authors:['Writer'],genres:['Comics & Graphic Novels'],ownershipBasis:'library-presence-only',titleEvidence:'title-attribute',...metadata}});
export const koboWorkflowTests=[
 ['Kobo unchanged leased checks do not write the database, rebuild identities or notify purchase synchronization',async()=>{
   const {writer,stored,writes}=memory({cacheQuerySnapshots:true}),items=Array.from({length:137},(_,n)=>item(n));
   let db=await writer.replaceProviderItems('kobo',items,{profileLabel:'Personal',fullSyncAt:'2026-10-01'},snapshotFixture('kobo',items));
   const original=structuredClone(db),snapshot=await writer.getQueryDatabase(),id=db.providers.kobo.activeProfileId;
   for(let pass=0;pass<2;pass++){
     writes.length=0;
     const scan=await writer.beginProviderScan('kobo','Personal','incremental',false,1,id,true);
     const result=await writer.commitProviderScan('kobo',items.slice(0,24),{syncMode:'incremental'},null,scan.scanToken,1,true);
     assert.deepEqual(result.database.providerItems,original.providerItems);assert.equal(result.database.providers.kobo.syncHealth.status,'succeeded');assert(result.database.providers.kobo.lastSync>=original.providers.kobo.lastSync);assert.equal(result.scanResult.changes.updated,0);assert.equal(result.scanResult.changes.added,0);assert.equal(result.scanResult.ownership.review,24);
     assert(writes.every(write=>!('galacticLibraryDatabase' in write)));assert.equal(await writer.getQueryDatabase(),snapshot);
     await assert.rejects(writer.commitProviderScan('kobo',items.slice(0,24),{syncMode:'incremental'},null,scan.scanToken,1),/superseded/);
   }
   assert.deepEqual(stored.galacticLibraryDatabase,original);assert.deepEqual(parseBackup(createBackup(original)),original);
 }],
 ['Kobo fast checks commit substantive title, author, genre and access changes through validated normal saves',async()=>{
   for(const change of [{title:'Changed Title'}, {metadata:{authors:['New Writer']}},{metadata:{genres:['History']}},{ownership:'subscription',metadata:{ownershipBasis:'kobo-plus-subscription'}}]){
     const {writer,writes}=memory({cacheQuerySnapshots:true}),items=[item(1),item(2)];
     let db=await writer.replaceProviderItems('kobo',items,{profileLabel:'Personal',fullSyncAt:'2026-10-01'},snapshotFixture('kobo',items));
     const untouched=Object.values(db.providerItems).find(r=>r.providerItemId==='2');await writer.getQueryDatabase();writes.length=0;
     const scan=await writer.beginProviderScan('kobo','Personal','incremental',false,1,db.providers.kobo.activeProfileId,true);
     const changed={...items[0],...change,metadata:{...items[0].metadata,...change.metadata}};
     const result=await writer.commitProviderScan('kobo',[changed],{syncMode:'incremental'},null,scan.scanToken,1,true);
     assert.equal(result.scanResult.changes.updated,1);assert(writes.some(write=>'galacticLibraryDatabase' in write));
     assert.deepEqual(result.database.providerItems[untouched.id],untouched);assert.deepEqual(parseBackup(createBackup(result.database)),result.database);
   }
 }],
 ['Kobo result separates raw uncertainty, preference-covered books and explicit conflicts without altering evidence',async()=>{
   const {writer}=memory({cacheQuerySnapshots:true}),items=[item(1),item(2,{ownershipBasis:'conflicting-evidence'}),{...item(3,{ownershipBasis:'kobo-plus-subscription'}),ownership:'subscription'}];
   let db=await writer.replaceProviderItems('kobo',items,{profileLabel:'Personal',fullSyncAt:'2026-10-01'},snapshotFixture('kobo',items));const id=db.providers.kobo.activeProfileId;
   for(const enabled of [false,true]){
     db=await writer.saveKoboOwnershipAssumption(id,enabled);const before=structuredClone(db.providerItems);
     const scan=await writer.beginProviderScan('kobo','Personal','incremental',false,1,id,true);
     const result=await writer.commitProviderScan('kobo',items,{syncMode:'incremental'},null,scan.scanToken,1,true);
     assert.deepEqual(result.scanResult.ownership,{unconfirmed:2,covered:Number(enabled),review:enabled?1:2,subscriptions:1});assert.deepEqual(result.database.providerItems,before);
   }
 }],
 ['Kobo display hints survive a worker restart but never authorize stale, switched, restored or ambiguous accounts',async()=>{
   const {writer,stored}=memory({cacheQuerySnapshots:true}),items=[item(1)];let db=await writer.replaceProviderItems('kobo',items,{profileLabel:'Personal',fullSyncAt:'2026-10-01'},snapshotFixture('kobo',items));const id=db.providers.kobo.activeProfileId;
   assert.equal((await writer.getProviderProfileHint('kobo')).nickname,'Personal');assert.equal(await writer.getProviderProfileHint('humble'),null);
   const restarted=memory();Object.assign(restarted.stored,structuredClone(stored));assert.equal((await restarted.writer.getProviderProfileHint('kobo')).nickname,'Personal');
   const scan=await writer.beginProviderScan('kobo','Personal','incremental',false,1,id,true);
   await writer.restoreDatabase(parseBackup(createBackup(db)));await assert.rejects(writer.commitProviderScan('kobo',items,{syncMode:'incremental'},null,scan.scanToken,1),/superseded/);
   await writer.mergeProviderItems('kobo',[item(2)],{profileLabel:'Other'});assert.equal(await writer.getProviderProfileHint('kobo'),null);
   await assert.rejects(writer.beginProviderScan('kobo','Personal','incremental',false,1,id,true),/Saved accounts changed/);
   await writer.clearDatabase();assert.equal(await writer.getProviderProfileHint('kobo'),null);
   assert(!stored.galacticLibraryProviderProfileHints);
 }],
 ['Kobo offline recovery requires matching stable account/record IDs and a corroborated original title',async()=>{
   const {writer}=memory();let current=await writer.mergeProviderItems('kobo',[item(1),item(2)]),reference=structuredClone(current);
   const records=Object.values(current.providerItems);records[0].title='Read Now: '+records[0].title;records[0].metadata.authors=[];records[1].title='Read Now: Uncorroborated';
   const result=recoverKoboActionTitles(current,reference);assert.equal(result.changes.length,1);assert.equal(result.database.providerItems[records[0].id].title,reference.providerItems[records[0].id].title);assert.deepEqual(result.database.providerItems[records[0].id].metadata.authors,['Writer']);assert.equal(result.database.providerItems[records[1].id].title,'Read Now: Uncorroborated');
   reference.providerItems[records[0].id].recordRef=crypto.randomUUID();assert.equal(recoverKoboActionTitles(current,reference).changes.length,0);
 }],
 ['Kobo opt-in account assumption affects only unconfirmed access and survives imports, rename and backup restore',async()=>{
   const {writer}=memory();let db=await writer.mergeProviderItems('kobo',[item(1),{...item(2,{ownershipBasis:'kobo-plus-subscription'}),ownership:'subscription'},item(3,{ownershipBasis:'conflicting-evidence'}),item(4,{ownershipBasis:'not-purchased'}),item(5,{ownershipBasis:'free-availability'}),{...item(6,{ownershipBasis:'free-claim'}),ownership:'claimed'},{...item(7,{ownershipBasis:'borrowed'}),ownership:'borrowed'},{...item(8,{ownershipBasis:'rental'}),ownership:'rental'}],{profileLabel:'Personal'});
   const original=structuredClone(db.providerItems),id=db.providers.kobo.activeProfileId;
   db=await writer.saveKoboOwnershipAssumption(id,true);assert.deepEqual(db.providerItems,original);
   for(const r of Object.values(db.providerItems))assert.equal(effectiveOwnershipRecord(r,db).ownership,r.providerItemId==='1'?'owned':r.ownership);
   const unknown=Object.values(db.providerItems)[0];assert.equal(effectiveOwnershipRecord(unknown,db,Date.now(),{ignoreOverride:true}).ownership,'unknown');
   assert.equal(matchItems(db.providerItems,[{title:unknown.title,mediaType:'book',authors:['Writer']}],db)[0].owned,true);
   const reviewed=structuredClone(db);reviewed.ownershipReviews[unknown.recordRef]={ownership:'unknown',source:'manual-confirmation',confirmedAt:'2026-10-01',expiresAt:null};assert.equal(effectiveOwnershipRecord(unknown,reviewed).ownership,'unknown');
   db=await writer.mergeProviderItems('kobo',[item(1)]);db=await writer.renameProviderProfile(id,'Renamed');db=parseBackup(createBackup(db));assert(db.providerProfiles[id].assumeUnconfirmedOwned);assert.equal(effectiveOwnershipRecord(db.providerItems[unknown.id],db).ownership,'owned');
   db=await writer.mergeProviderItems('kobo',[item(1)],{profileLabel:'Other'});const other=Object.values(db.providerItems).find(r=>r.profileId!==id);assert.equal(effectiveOwnershipRecord(other,db).ownership,'unknown');
   db=await writer.saveKoboOwnershipAssumption(id,false);assert.equal(effectiveOwnershipRecord(db.providerItems[unknown.id],db).ownership,'unknown');
   await assert.rejects(writer.saveKoboOwnershipAssumption(id,'yes'),/valid ownership preference/);
 }],
 ['Kobo 24-card quick observations preserve 137 records and two unchanged scans report zero changes',async()=>{
   const {writer}=memory(),items=Array.from({length:137},(_,n)=>item(n));
   let db=await writer.replaceProviderItems('kobo',items,{profileLabel:'Personal',fullSyncAt:'2026-10-01'},snapshotFixture('kobo',items));
   const refs=Object.values(db.providerItems).map(r=>r.recordRef).sort();
   for(let pass=0;pass<2;pass++){
     db=await writer.mergeProviderItems('kobo',items.slice(0,24),{profileLabel:'Personal'});
     assert.deepEqual(db.providers.kobo.syncHealth.differences,{added:0,missing:0,ownershipChanged:0,observed:24,updated:0});
     assert.equal(Object.keys(db.providerItems).length,137);assert.deepEqual(Object.values(db.providerItems).map(r=>r.recordRef).sort(),refs);
   }
   assert.deepEqual(parseBackup(createBackup(db)),db);
 }],
 ['Kobo repairs 24 contaminated titles only from fresh authoritative card evidence',async()=>{
   const {writer}=memory(),items=Array.from({length:137},(_,n)=>item(n));
   const bad=items.map((entry,n)=>n<24?{...entry,title:'Read Now: '+entry.title,metadata:{...entry.metadata,titleEvidence:'action-label'}}:entry);
   let db=await writer.replaceProviderItems('kobo',bad,{profileLabel:'Personal'},snapshotFixture('kobo',bad));
   const before=Object.values(db.providerItems),refs=before.map(r=>r.recordRef).sort();
   db=await writer.mergeProviderItems('kobo',items.slice(0,24));
   assert.equal(db.providers.kobo.syncHealth.differences.updated,24);
   assert.deepEqual(Object.values(db.providerItems).map(r=>r.recordRef).sort(),refs);
   assert(Object.values(db.providerItems).every(r=>!r.title.startsWith('Read Now:')));
   for(const r of before.slice(24))assert.deepEqual(db.providerItems[r.id],r);
   for(let pass=0;pass<2;pass++){db=await writer.mergeProviderItems('kobo',items.slice(0,24));assert.equal(db.providers.kobo.syncHealth.differences.updated,0);}
 }],
 ['Kobo sparse or lower-quality observations preserve saved titles, dates, author, genre and purchase evidence',async()=>{
   const {writer}=memory(),purchase={...item(1,{ownershipBasis:'purchase-label',authors:['Writer','Coauthor']}),ownership:'owned',acquiredAt:'2020-01-01'};
   let db=await writer.mergeProviderItems('kobo',[purchase]);const saved=Object.values(db.providerItems)[0];
   db=await writer.mergeProviderItems('kobo',[{...item(1,{authors:[],genres:[],titleEvidence:'action-label'}),title:'Read Now: Wrong unrelated title'}]);
   const actual=db.providerItems[saved.id];assert.equal(actual.title,purchase.title);assert.equal(actual.normalizedTitle,saved.normalizedTitle);assert.equal(actual.ownership,'owned');assert.equal(actual.acquiredAt,saved.acquiredAt);assert.deepEqual(actual.metadata.authors,saved.metadata.authors);assert.deepEqual(actual.metadata.genres,saved.metadata.genres);assert.equal(db.providers.kobo.syncHealth.differences.updated,0);
   db=await writer.mergeProviderItems('kobo',[{...purchase,metadata:{...purchase.metadata,authors:[' coauthor ','WRITER'],genres:[' comics & graphic novels ']}}]);assert.equal(db.providers.kobo.syncHealth.differences.updated,0);
   assert.deepEqual(parseBackup(createBackup(db)),db);
   assert(libraryCategoryEvidence(actual).some(e=>e.source==='kobo-library-genre'&&e.evidence==='Comics & Graphic Novels'));
 }],
 ['Kobo explicit contradictory access replaces earlier purchase evidence, while UI availability does not invent purchases',async()=>{
   const parse=globalThis.GalacticKobo.koboItemFromCardData,base={title:'Example',detailUrl:'https://www.kobo.com/ebook/example',typeText:'ebook'};
   for(const [data,ownership]of [[{},'unknown'],[{isPurchased:true},'owned'],[{isKoboPlus:true},'subscription'],[{ownershipLabels:['Borrowed until tomorrow']},'borrowed'],[{ownershipType:'rental'},'rental'],[{ownershipType:'free'},'unknown'],[{ownershipType:'free-claim'},'claimed'],[{isPurchased:false},'unknown'],[{isPurchased:true,isKoboPlus:true},'unknown']]){
     const value=parse({...base,...data});assert.equal(value.ownership,ownership);assert.equal(normalizeProviderItem({...value,provider:'kobo'}).ownership,ownership);
   }
   const {writer}=memory();let db=await writer.mergeProviderItems('kobo',[{...item(1,{ownershipBasis:'purchase-label'}),ownership:'owned'}]);
   db=await writer.mergeProviderItems('kobo',[{...item(1,{ownershipBasis:'kobo-plus-subscription'}),ownership:'subscription'}]);assert.equal(Object.values(db.providerItems)[0].ownership,'subscription');
   db=await writer.mergeProviderItems('kobo',[item(1,{ownershipBasis:'not-purchased'})]);assert.equal(Object.values(db.providerItems)[0].ownership,'unknown');
 }],
 ['Kobo comparison ignores observation timestamps and list ordering but not identifier or URL changes',()=>{
   const before=normalizeProviderItem({...item(1),provider:'kobo'}),after={...before,updatedAt:'2026-01-01',observedAt:'2026-02-01',metadata:{...before.metadata,authors:[' Writer ']}};
   assert.equal(koboObservationChanged(before,after),false);assert.equal(koboObservationChanged(before,{...after,metadata:{...after.metadata,detailUrl:'https://www.kobo.com/ebook/different'}}),true);
   assert.equal(preserveKoboObservation({...before,provider:'humble'},before).provider,'humble');
   const weaker={...before,metadata:{...before.metadata,titleEvidence:'action-label'}};
   assert.equal(preserveKoboObservation(before,weaker).metadata.titleEvidence,'title-attribute');
   assert.equal(preserveKoboObservation(weaker,before).metadata.titleEvidence,'title-attribute');
 }],
 ['Remembered scans bind a single connected profile ID and reject stale, ambiguous, unconnected and cross-provider accounts',async()=>{
   for(const provider of ['kobo','gog','audible','kindle']){
     const {writer}=memory();let db=await writer.mergeProviderItems(provider,[item(1)],{profileLabel:'Personal'});const id=db.providers[provider].activeProfileId;
     const scan=await writer.beginProviderScan(provider,'Personal','incremental',false,1,id,true);assert.equal(scan.profileId,id);
     await assert.rejects(writer.beginProviderScan(provider,'Personal','incremental',false,1,crypto.randomUUID(),true),/profile changed/);
     await writer.mergeProviderItems(provider,[item(2)],{profileLabel:'Other'});
     await assert.rejects(writer.beginProviderScan(provider,'Personal','incremental',false,1,id,true),/Saved accounts changed/);
   }
   const {writer}=memory();const scan=await writer.beginProviderScan('kobo','First','full',false,1);
   await assert.rejects(writer.beginProviderScan('kobo','First','full',false,1,scan.profileId,true),/Saved accounts changed/);
   await assert.rejects(writer.beginProviderScan('gog','First','full',false,1,scan.profileId,true),/profile changed/);
 }]
];
