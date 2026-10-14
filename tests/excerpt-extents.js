import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {proposeContentsForReview as parse,contentKey} from '../src/lib/contents.js';
import {manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {collectionContents} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {excerptBook} from './excerpt-extent-fixture.js';
import {perezStatement,wonderBook} from './wonder-woman-coverage-fixture.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const cases=JSON.parse(await readFile(new URL('./fixtures/kindle/excerpt-extents.json',import.meta.url),'utf8')).cases;
export const excerptExtentTests=[
 ...cases.map((c,index)=>['captured excerpt extent: '+c.title,()=>{
   const book=excerptBook(c,index),before=JSON.stringify(book),proposal=collectionContents(book,coverageDatabase(book));
   assert.equal(proposal.entries.filter(e=>e.completeness==='full').length,c.expectedFull);assert.equal(proposal.entries.filter(e=>e.completeness==='excerpt').length,c.expectedPartial);
   assert.equal(JSON.stringify(book),before);const source=book.metadata.enrichment.kindleProductComicContents;
   assert.deepEqual(manifestReviewProposal(source,c.title,source.statement.replace(/\s+/gu,' ')).entries,proposal.entries);
   if(c.title.includes('Endgame')){assert.equal(source.manifest.selected,1);assert.equal(source.manifest.candidates[1].start,909);const group=comicCoverageForLibrary(coverageDatabase(book)).groups.find(g=>g.series.toLowerCase()==='batman');assert.equal(group.run,'2011-2016');assert.equal(group.covered,6);assert.equal(group.partial,0);}
 }]),
 ['unqualified stories and tales require the literal collected subject; explicit subset and run conflicts stay partial',()=>{
   const title='Alpha (2001-2006) Vol. 2';
   for(const text of ['Collects Alpha #1-3','Collects stories from Alpha #1-3','Collects tales from Alpha #1-3','Reprints Alpha #1-3','Reprinting Alpha #1-3']){const p=parse(text,title);assert.equal(p.entries.length,3,text);assert(p.entries.every(e=>e.completeness==='full'&&e.series==='Alpha'),text);}
   for(const text of ['Includes excerpts from Alpha #1-3','Reprints selected pages from Alpha #1-3','Includes backup stories from Alpha #1-3','Collects selected stories from Alpha #1-3','Collects a story from Alpha #1-3','Collects stories from Alpha (2011) #1-3']){const p=parse(text,title);assert.equal(p.entries.length,3,text);assert(p.entries.every(e=>e.completeness==='excerpt'),text);}
   for(const other of ['Unrelated Vol. 2','Alpha anthology Vol. 2','Selected stories Vol. 2'])assert(parse('Collects stories from Alpha #1-3',other).entries.every(e=>e.completeness==='excerpt'));
 }],
 ['mixed clauses preserve feature subsets, named uncertainty, issue types and partial scope after an explicit limit',()=>{
   const p=parse('Collects stories from Alpha #0-2, Alpha Annual #1, material from Alpha #5; Alpha #6; Beta #9; bonus essays','Alpha Vol. 2');
   assert(p.entries.filter(e=>['0','1','2'].includes(e.number)).every(e=>e.completeness==='full'));assert(p.entries.some(e=>e.unitType==='annual'&&e.completeness==='full'));
   assert(p.entries.filter(e=>['5','6','9'].includes(e.number)).every(e=>e.completeness==='excerpt'));assert(p.unparsed.includes('bonus essays'));
   const extra=parse('Collects stories from Alpha #1-2; includes backup stories from Alpha #3','Alpha Vol. 2');assert(extra.entries.filter(e=>e.number==='3').every(e=>e.completeness==='excerpt'));
   const special=parse('Collects stories from Alpha #0, #1/2, Alpha Annual #1; Digital Chapters 1-4','Alpha Vol. 2');assert(special.entries.some(e=>e.number==='1/2'));assert(special.unparsed.some(s=>s.includes('Digital Chapters')));assert(!special.entries.some(e=>/Digital/u.test(e.series)));
 }],
 ['existing Perez full run, manual partial reviews, ownership exclusions and backup remain authoritative',()=>{
   const perez=wonderBook('perez','Wonder Woman by George Perez Vol. 4 (Wonder Woman (1987-2006))',perezStatement),endgame=excerptBook(cases.find(c=>c.title.includes('Endgame'))),overlap=coverageBook('overlap','Collects Batman (2011-2016) #35-40'),database=coverageDatabase(perez,endgame,overlap);
   assert(collectionContents(perez,database).entries.every(e=>e.completeness==='full'));
   let groups=comicCoverageForLibrary(database).groups;assert.equal(groups.find(g=>g.series.toLowerCase()==='batman').duplicates,6);
   const evidence=JSON.stringify(endgame.metadata);database.contentReviews[endgame.id]=confirmed([issue('35',{series:'Batman',run:'2011-2016',completeness:'excerpt'})]);const review=JSON.stringify(database.contentReviews);
   const restored=parseBackup(createBackup(database));assert.equal(JSON.stringify(database.contentReviews),review);assert.equal(JSON.stringify(endgame.metadata),evidence);assert.equal(restored.contentReviews[endgame.id].entries[0].completeness,'excerpt');assert.equal(comicCoverageForLibrary(restored).groups.find(g=>g.series.toLowerCase()==='batman').duplicates,0);
   delete database.contentReviews[endgame.id];for(const ownership of ['returned','revoked','expired','borrowed','subscription','unknown']){database.ownershipReviews[endgame.recordRef]={ownership,source:'user-correction'};const result=comicCoverageForLibrary(database);assert(result.excluded.some(r=>r.recordRef===endgame.recordRef));assert.equal(result.groups.find(g=>g.series.toLowerCase()==='batman').covered,6);assert.equal(result.groups.find(g=>g.series.toLowerCase()==='batman').duplicates,0);}
 }]
];
