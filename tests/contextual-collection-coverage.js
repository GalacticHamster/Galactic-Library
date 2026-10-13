import assert from 'node:assert/strict';
import {proposeContentsForReview} from '../src/lib/contents.js';
import {selectManifest,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {collectionContents,resolveCoverageEntry} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {comicRange} from '../src/lib/comic-coverage.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
// Minimal public source phrases from the frozen October 13 backup.
const one='collects issues #20-27 of this seminal series';
const three='Continuing Alan Moore\'s award-winning run on THE SAGA OF THE SWAMP THING, this third volume is brimming with visceral horrors. Collecting issues #35-42.';
const make=(id,title,description)=>{
  const selected=selectManifest([{selector:'description',text:description}],title),book=coverageBook(id,selected.statement,{title});
  book.metadata.enrichment.kindleProductComicContents={...selected,productDetailsEvidence:{observations:[{field:'series',status:'observed',value:'Part of: Swamp Thing (1982-1996)'}]}};return book;
};
export const contextualCollectionCoverageTests=[
 ['written collection labels retain captured run context through merged coverage',()=>{
   const book=make('three','Saga of the Swamp Thing: Book Three',three),seed=coverageBook('seed','Collects Swamp Thing (1982-1996) #43-44'),db=coverageDatabase(book,seed),before=JSON.stringify(db);
   const proposal=collectionContents(book,db);assert.equal(proposal.entries.length,8);assert.equal(resolveCoverageEntry(proposal.entries[0],book).run,'1982-1996');
   const target=JSON.stringify(['swamp thing','1982 1996','issue','en']),other=JSON.stringify(['saga of the swamp thing','','issue','en']);
   const group=comicCoverageForLibrary(db,{[target]:{title:'The Saga of the Swamp Thing',members:[target,other],continuity:true}}).groups[0];
   assert.equal(group.issues.length,10);assert(group.issues.every(i=>!i.provisional&&i.copies===1));assert.equal(comicRange(group).missing,34);assert.equal(JSON.stringify(db),before);
 }],
 ['Book One contextual expressions expand bounded ranges with title context',()=>{
   for(const [statement,start,end] of [[one,20,27],['Collecting issues 20 through 27',20,27],['Collects the first eight issues of the series',1,8],['Includes issues #1-6 of this series',1,6]]){
     const title='Saga of the Swamp Thing: Book One',selected=selectManifest([{selector:'description',text:statement}],title),p=manifestReviewProposal(selected,title);
     assert.deepEqual(p.entries.map(e=>e.number),Array.from({length:end-start+1},(_,n)=>String(start+n)));
     assert(p.entries.every(e=>e.series==='Saga of the Swamp Thing'&&e.completeness==='full'));assert.notEqual(p.parseBinding,'explicit-statement');
   }
 }],
 ['contextual extraction preserves reviews and rejects ambiguous anthology references',()=>{
   const book=make('one','Saga of the Swamp Thing: Book One',one),db=coverageDatabase(book);db.contentReviews[book.id]=confirmed([issue('99',{series:'User correction',run:'1982'})]);assert.equal(collectionContents(book,db).entries[0].series,'User correction');
   for(const title of ['DC Omnibus Vol. 1','An Anthology Book One'])assert.equal(proposeContentsForReview(one,title,{allowTitleBinding:true}).entries.length,0);
   assert.equal(proposeContentsForReview(one,'Alpha Book One',{series:['Alpha','Beta'],allowTitleBinding:true}).entries.length,0);
   assert(!proposeContentsForReview('Collects issues #1-6 of Beta','Alpha Book One',{allowTitleBinding:true}).entries.some(e=>e.series==='Alpha'));
   const p=proposeContentsForReview('Collects issues #1-6 of this series; Digital Chapters 7-9','Alpha Book One',{allowTitleBinding:true});assert.equal(p.entries.length,6);assert(p.unparsed.some(s=>s.includes('Chapters')));
 }],
 ['written book context never overwrites explicit constituent runs or annual types',()=>{
   const book=make('typed','Saga of the Swamp Thing: Book Three','Collects Swamp Thing (2011-2015) #1; Swamp Thing Annual #2; Detective Comics (1937) #27');
   const entries=collectionContents(book,coverageDatabase(book)).entries.map(e=>resolveCoverageEntry(e,book));
   assert.equal(entries.find(e=>e.unitType==='issue'&&e.series==='Swamp Thing').run,'2011-2015');assert.equal(entries.find(e=>e.series==='Detective Comics').run,'1937');assert(entries.some(e=>e.unitType==='annual'));
   const numeric=make('numeric','Golden Age Human Torch Masterworks Vol. 1 (Human Torch (1940-1954))','Collects Golden Age Human Torch Masterworks #2');
   const original=collectionContents(numeric,coverageDatabase(numeric)).entries[0];assert.equal(resolveCoverageEntry(original,numeric).series,original.series,'Written-volume fix broadened numeric anthology aliases');
 }]
];
