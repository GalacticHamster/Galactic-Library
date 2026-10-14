import assert from 'node:assert/strict';
import {quickAccessFixture} from './quick-access-fixture.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {validateOwnershipReview} from '../src/lib/ownership-review.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';

const memory=()=>{const values={};let fail=false;return {writer:createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>{if(fail)throw Error('Fixture storage failure');Object.assign(values,structuredClone(updates));}}),fail:()=>{fail=true;}};};
export const quickOwnershipTests=[
 ['quick Miles Morales bulk corrections have no invented evidence date and retain other purchases, coverage and source records',async()=>{
   const f=quickAccessFixture(),{writer}=memory();f.otherAccount.ownership='subscription';await writer.restoreDatabase(f.database);const db=await writer.getDatabase(),before=JSON.stringify(db.providerItems),reviews=JSON.stringify(db.contentReviews),merges=JSON.stringify(db.manualMatchDecisions);
   assert.equal(comicCoverageForLibrary(db).groups.find(g=>g.series==='Ultimate Comics Spider-Man').issues[0].copies,2);
   const corrected=await writer.saveOwnershipCorrections(f.miles.map(r=>ownershipCorrectionTarget(r,db)),{ownership:'returned'});
   for(const r of f.miles){const review=corrected.ownershipReviews[r.recordRef];assert.equal(review.note,'');assert.equal(review.evidenceDate,null);assert.equal(review.expiresAt,null);assert.equal(review.sourceUrl,'');assert.equal(review.source,'user-correction');assert(Number.isFinite(Date.parse(review.confirmedAt)));assert.equal(effectiveOwnershipRecord(r,corrected).ownership,'returned');}
   assert.equal(effectiveOwnershipRecord(f.otherAccount,corrected).ownership,'subscription');assert.equal(JSON.stringify(corrected.providerItems),before);assert.equal(JSON.stringify(corrected.contentReviews),reviews);assert.equal(JSON.stringify(corrected.manualMatchDecisions),merges);
   const coverage=comicCoverageForLibrary(corrected),series=coverage.groups.find(g=>g.series==='Ultimate Comics Spider-Man');assert.equal(series.covered,10);assert.equal(series.issues[0].copies,1);assert.equal(series.duplicates,0);assert.equal(coverage.excluded.filter(r=>r.ownership==='returned').length,3);
   const one=await writer.saveOwnershipCorrections([ownershipCorrectionTarget(f.miles[1],corrected)],{ownership:'owned',note:'Purchased again'});assert.equal(effectiveOwnershipRecord(f.miles[1],one).ownership,'owned');
 }],
 ['mixed-account/provider changes are exact, clear to provider status, and survive reload, reimport and backup',async()=>{
   const f=quickAccessFixture(),{writer}=memory();await writer.restoreDatabase(f.database);let db=await writer.getDatabase();
   const selected=[f.miles[0],f.otherAccount,f.otherProvider];db=await writer.saveOwnershipCorrections(selected.map(r=>ownershipCorrectionTarget(r,db)),{ownership:'borrowed'});
   db=await writer.getDatabase();for(const r of selected)assert.equal(effectiveOwnershipRecord(r,db).ownership,'borrowed');assert.equal(effectiveOwnershipRecord(f.miles[1],db).ownership,'owned');
   await writer.mergeProviderItems('kindle',f.miles,{profileId:f.personal.profileId,profileLabel:'Personal'});db=await writer.getDatabase();assert.equal(effectiveOwnershipRecord(db.providerItems[f.miles[0].id],db).ownership,'borrowed');
   await writer.restoreDatabase(parseBackup(createBackup(db)));db=await writer.getDatabase();for(const r of selected)assert.equal(effectiveOwnershipRecord(r,db).ownership,'borrowed');
   db=await writer.saveOwnershipCorrections(selected.map(r=>ownershipCorrectionTarget(r,db)),{ownership:null});for(const r of selected)assert(!db.ownershipReviews[r.recordRef]);assert.equal(effectiveOwnershipRecord(f.miles[0],db).ownership,'owned');assert.equal(effectiveOwnershipRecord(f.otherProvider,db).ownership,'unknown');
 }],
 ['bulk access save rejects stale, wrong-account, missing or duplicate targets atomically',async()=>{
   const f=quickAccessFixture(),{writer}=memory();await writer.restoreDatabase(f.database);let db=await writer.getDatabase();const target=r=>ownershipCorrectionTarget(r,db);
   for(const bad of [{...target(f.miles[1]),profileId:f.family.profileId},{...target(f.miles[1]),provider:'kobo'},{...target(f.miles[1]),recordRef:crypto.randomUUID()},{...target(f.miles[1]),expectedReviewRef:crypto.randomUUID()}]){
     const before=JSON.stringify(await writer.getDatabase());await assert.rejects(writer.saveOwnershipCorrections([target(f.miles[0]),bad],{ownership:'returned'}));assert.equal(JSON.stringify(await writer.getDatabase()),before);
   }
   await assert.rejects(writer.saveOwnershipCorrections([target(f.miles[0]),target(f.miles[0])],{ownership:'returned'}));
   db=await writer.saveOwnershipCorrections([target(f.miles[0])],{ownership:'returned'});const before=JSON.stringify(db);await assert.rejects(writer.saveOwnershipCorrections([target(f.miles[0])],{ownership:'unrecognized'}));assert.equal(JSON.stringify(await writer.getDatabase()),before);
 }],
 ['quick choices are authoritative without removing advanced evidence requirements or ignoring key activation safeguards',async()=>{
   const f=quickAccessFixture(),{writer}=memory();f.database.ownershipPolicy={allOwned:true,providers:{}};await writer.restoreDatabase(f.database);let db=await writer.getDatabase();
   for(const ownership of ['unknown','subscription','borrowed','expired','revoked','returned','owned']){db=await writer.saveOwnershipCorrections([ownershipCorrectionTarget(f.miles[0],db)],{ownership});assert.equal(effectiveOwnershipRecord(f.miles[0],db).ownership,ownership);}
   assert.throws(()=>validateOwnershipReview({...db.ownershipReviews[f.miles[0].recordRef],source:'manual-confirmation'}),/evidence|date/);
   await assert.rejects(writer.saveOwnershipReview(f.miles[0].recordRef,{ownership:'returned',note:'',evidenceDate:null},db.ownershipReviews[f.miles[0].recordRef].reviewRef),/evidence/);
   const ref=db.ownershipReviews[f.miles[0].recordRef].reviewRef;db=await writer.saveOwnershipReview(f.miles[0].recordRef,{ownership:'returned',note:'Checked detailed evidence',evidenceDate:'2026-10-13'},ref);assert.equal(db.ownershipReviews[f.miles[0].recordRef].source,'manual-confirmation');
   const key={provider:'humble',mediaType:'game',ownership:'owned',recordRef:'key',metadata:{entitlement:'third-party-key',keyStatus:'expired'}};assert.equal(effectiveOwnershipRecord(key,{ownershipReviews:{key:{ownership:'owned',source:'user-correction'}}}).ownership,'unknown');
 }],
 ['a failed bulk persistence leaves every correction and source record unchanged',async()=>{
   const f=quickAccessFixture(),m=memory();await m.writer.restoreDatabase(f.database);const db=await m.writer.getDatabase();m.fail();await assert.rejects(m.writer.saveOwnershipCorrections(f.miles.map(r=>ownershipCorrectionTarget(r,db)),{ownership:'returned'}),/storage failure/);assert.deepEqual(await m.writer.getDatabase(),db);
 }]
];
