import assert from 'node:assert/strict';
import '../src/providers/kindle-ownership.js';
import '../src/providers/kindle.js';
import {ownershipCoverageFixture} from './ownership-coverage-fixture.js';
import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {effectiveOwnershipRecord,coverageAccessExclusion} from '../src/lib/ownership.js';
import {normalizeProviderItem} from '../src/lib/models.js';
import {collectionContents,libraryCoverageIndex} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateOwnershipReview} from '../src/lib/ownership-review.js';
import {sameEditionEvidence} from '../src/lib/identity.js';
const review=(ownership,expiresAt=null)=>validateOwnershipReview({reviewRef:'00000000-0000-4000-8000-000000000001',ownership,source:'manual-confirmation',note:'Checked the provider account library',evidenceDate:'2026-10-01',confirmedAt:'2026-10-13',expiresAt});
export const ownershipCoverageTests=[
 ['legacy Comixology purchases contribute coverage without rewriting raw evidence or requiring receipts',()=>{
   const {gods,database}=ownershipCoverageFixture(),before=JSON.stringify(database),parsed=JSON.stringify(collectionContents(gods,database).entries),normalized=normalizeProviderItem(gods);
   assert.equal(normalized.ownership,'unknown');
   const effective=effectiveOwnershipRecord(gods,database);assert.equal(effective.ownership,'owned');assert.equal(effective.ownershipInference.observedOwnership,'unknown');
   const group=comicCoverageForLibrary(database).groups.find(g=>g.series.toLowerCase()==='wonder woman');assert.equal(group.covered,14);assert.equal(group.duplicates,7);
   assert(!libraryCoverageIndex(database).excluded.some(row=>row.id===gods.id));assert.equal(JSON.stringify(database),before);assert.equal(JSON.stringify(collectionContents(gods,database).entries),parsed);
   const restored=parseBackup(createBackup(database));assert.equal(restored.providerItems[gods.id].ownership,'unknown');assert.equal(effectiveOwnershipRecord(restored.providerItems[gods.id],restored).ownership,'owned');
 }],
 ['Kindle imports distinguish migrated purchases from unlimited, borrowed, rental and samples',()=>{
   const importer=globalThis.GalacticKindle;
   for(const [originType,state]of [['Purchase','owned'],['Comixology','owned'],['ComicsUnlimited','subscription'],['ComixologyUnlimited','subscription'],['KindleUnlimited','subscription'],['Prime','subscription'],['PublicLibraryLending','borrowed'],['PersonalLending','borrowed'],['Rental','rental'],['Sample','unknown']]){
     const item=importer.kindleItemFromOwnershipItem({asin:'B012345678',title:'Provider fixture',originType});assert.equal(item.ownership,state,originType);
   }
   for(const patch of [{ownershipType:'ComicsUnlimited'},{contentType:'Sample'}]){
     const item=importer.kindleItemFromOwnershipItem({asin:'B012345678',title:'Conflict',originType:'Comixology',...patch});assert.equal(item.ownership,'unknown');
     assert.equal(effectiveOwnershipRecord(normalizeProviderItem({...item,provider:'kindle'})).ownership,'unknown','Normalization or projection resurrected conflicting access');
   }
 }],
 ['explicit access, missing context, account corrections and expiry override legacy inference',()=>{
   const {gods,database}=ownershipCoverageFixture();
   for(const state of ['owned','claimed','borrowed','subscription','rental'])assert.equal(effectiveOwnershipRecord({...gods,ownership:state},database).ownership,state);
   for(const patch of [{source:'other-source'},{libraryCategory:'personal-documents'},{itemStatus:'Borrowed'},{originType:'ComixologyUnlimited'}])assert.equal(effectiveOwnershipRecord({...gods,metadata:{...gods.metadata,...patch}},database).ownership,'unknown');
   database.ownershipReviews[gods.recordRef]=review('unknown');assert.equal(effectiveOwnershipRecord(gods,database).ownership,'unknown');assert.equal(coverageAccessExclusion(gods,database).reason,'user-unconfirmed');
   database.ownershipReviews[gods.recordRef]=review('subscription','2020-01-01');assert.equal(effectiveOwnershipRecord(gods,database).ownership,'unknown');assert.equal(coverageAccessExclusion(gods,database).reason,'expired');
   const derived=effectiveOwnershipRecord(gods,{});assert.equal(effectiveOwnershipRecord(derived,database).ownership,'unknown','A reused projection bypassed the current review');
 }],
 ['coverage exclusion diagnostics retain source identities and correction immediately changes duplicates',()=>{
   const {gods,unknown,borrowed,subscription,database}=ownershipCoverageFixture(),before=JSON.stringify(collectionContents(gods,database).entries);
   let projection=comicCoverageForLibrary(database);assert.deepEqual(new Set(projection.excluded.map(r=>r.ownership)),new Set(['unknown','borrowed','subscription']));
   assert(projection.excluded.every(r=>r.recordRef&&r.explanation&&r.entries.length===3));
   database.ownershipReviews[gods.recordRef]=review('unknown');projection=comicCoverageForLibrary(database);assert.equal(projection.groups.find(g=>g.series.toLowerCase()==='wonder woman').duplicates,0);assert(projection.excluded.some(r=>r.id===gods.id));
   database.ownershipReviews[gods.recordRef]=review('owned');assert.equal(comicCoverageForLibrary(database).groups.find(g=>g.series.toLowerCase()==='wonder woman').duplicates,7);assert.equal(JSON.stringify(collectionContents(gods,database).entries),before);
   assert(sameEditionEvidence(unknown,{...unknown,ownership:'owned'}),'Unknown ownership removed bibliographic identity');
   assert.equal(effectiveOwnershipRecord(borrowed,database).ownership,'borrowed');assert.equal(effectiveOwnershipRecord(subscription,database).ownership,'subscription');
 }],
 ['owning a book does not turn a backward story reference into collected-issue ownership',()=>{
   const book=coverageBook('origin','The origin of Wonder Woman continues from ALL STAR COMICS #8!',{title:'Sensation Comics (1942-1952) #1'}),database=coverageDatabase(book),before=JSON.stringify(collectionContents(book,database).entries);
   const result=comicCoverageForLibrary(database);assert.equal(result.groups.length,1);assert.equal(result.groups[0].series,'Sensation Comics');assert(result.unassigned.some(row=>row.numbers.includes('8')));assert.equal(JSON.stringify(collectionContents(book,database).entries),before);
 }]
];
