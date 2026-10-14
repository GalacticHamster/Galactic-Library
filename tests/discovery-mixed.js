import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkDiscoveryCase,checkDiscoverySafety} from './discovery-mixed-fixture.js';
import {manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {collectionContents} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {confirmed,issue} from './inferred-coverage-fixture.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle/discovery-mixed.json',import.meta.url),'utf8'));
export const discoveryMixedTests=[
 ...fixtures.cases.map((c,i)=>['discovery and mixed extent: '+c.title,()=>checkDiscoveryCase(c,i,assert)]),
 ['discovery never unions uncertain claims or promotes story completeness to full hosts',()=>checkDiscoverySafety(assert)],
 ['human selections and reviews take precedence; source/ownership survive restore',()=>{
   const c=fixtures.cases[1],s={...c.source,approved:true};assert.equal(manifestReviewProposal(s,c.title).entries.length,0);
   const {book,db,p}=checkDiscoveryCase(c,1,assert),source=JSON.stringify(book.metadata);
   assert.deepEqual(manifestReviewProposal(c.source,c.title,p.manifestEvidence).entries,p.entries);
   const restored=parseBackup(createBackup(db));assert.deepEqual(collectionContents(restored.providerItems[book.id],restored).entries,p.entries);
   db.contentReviews[book.id]=confirmed([issue('7',{series:'Human correction',completeness:'excerpt'})]);assert.deepEqual(collectionContents(book,db).entries,db.contentReviews[book.id].entries);
   const roundtrip=parseBackup(createBackup(db));assert.deepEqual(roundtrip.contentReviews,db.contentReviews);assert.equal(JSON.stringify(book.metadata),source);
   delete db.contentReviews[book.id];for(const ownership of ['subscription','borrowed','unknown','returned','expired','revoked']){db.ownershipReviews[book.recordRef]={ownership,source:'user-correction'};assert.equal(comicCoverageForLibrary(db).groups.length,0);}
 }]
];
