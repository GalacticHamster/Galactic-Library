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
 ['promotional numbered wrappers use subject scope without upgrading cross-title appearances or subsets',()=>{
   const title='Alpha (2001-2006) Vol. 2';
   for(const prefix of ['Find out in these tales from','Discover what happens in stories from','Discover what comes next in these tales from','The adventure continues in these tales from','Their adventures continue in stories from']){
     const p=parse(prefix+' Alpha #1-3, Annual #1, Beta #9',title);
     assert.equal(p.entries.length,5,prefix);assert.equal(p.entries.filter(e=>e.completeness==='full').length,4,prefix);assert.equal(p.entries.find(e=>e.series==='Beta').completeness,'excerpt');assert(p.unparsed.includes(prefix));
     for(const other of ['Unrelated Vol. 2','Alpha anthology Vol. 2','Aquaman: 80 Years of the King of the Seven Seas'])assert(parse(prefix+' Alpha #1-3',other).entries.every(e=>e.completeness==='excerpt'));
     for(const qualifier of ['selected stories from','backup stories from','excerpts from','selected pages from']){const limited=parse(prefix+' '+qualifier+' Alpha #1-3',title);assert(!limited.entries.some(e=>e.completeness==='full'),prefix+' '+qualifier);}
     const conflict=parse(prefix+' Alpha (2011) #1-3',title);assert(conflict.entries.every(e=>e.completeness==='excerpt'));
     assert(parse(prefix+' Alpha #1-3',title,{extentDescription:'This anthology collects individual backup stories.'}).entries.every(e=>e.completeness==='excerpt'));
   }
   const mixed=parse('Find out in these tales from Alpha #1-2, Annual #1, Beta #9, material from Alpha #4, Alpha #5',title);
   assert.equal(mixed.entries.filter(e=>e.completeness==='full').length,3);assert(mixed.entries.filter(e=>['9','4','5'].includes(e.number)).every(e=>e.completeness==='excerpt'));
   const explicit=parse('Find out in these tales from Alpha #1-2, Collects Beta #9',title);assert.equal(explicit.entries.find(e=>e.series==='Beta').completeness,'full');
   const credited=parse('Collects Jane Writer\'s story from Alpha #1','Alpha Vol. 1');assert(!credited.entries.some(e=>e.completeness==='full'));
 }],
 ['saved Outsiders wrapper preserves separate issue types, source, user review and access eligibility',()=>{
   const c=cases.find(c=>c.title.includes('Outsiders')),book=excerptBook(c),overlap=coverageBook('outsiders-overlap','Collects Batman and the Outsiders (1983-1987) #24-26'),db=coverageDatabase(book,overlap),before=JSON.stringify(db);
   const view=comicCoverageForLibrary(db),regular=view.groups.find(g=>g.series.toLowerCase()==='batman and the outsiders'&&g.unitType==='issue'),annual=view.groups.find(g=>g.series.toLowerCase()==='batman and the outsiders'&&g.unitType==='annual');
   assert.equal(regular.run,'1983-1987');assert.equal(regular.covered,9);assert.equal(regular.duplicates,3);assert.equal(annual.covered,1);assert.equal(annual.run,'1983-1987');assert.equal(JSON.stringify(db),before);
   const host=view.groups.find(g=>g.series.toLowerCase()==='dc comics presents');assert.equal(host.covered,0);assert.equal(host.partial,1);
   const source=JSON.stringify(book.metadata);db.contentReviews[book.id]=confirmed([issue('24',{series:'Batman and the Outsiders',run:'1983-1987',completeness:'excerpt'})]);
   const restored=parseBackup(createBackup(db));assert.equal(collectionContents(restored.providerItems[book.id],restored).entries.length,1);assert.equal(collectionContents(restored.providerItems[book.id],restored).entries[0].completeness,'excerpt');assert.equal(JSON.stringify(book.metadata),source);
   delete db.contentReviews[book.id];for(const ownership of ['returned','revoked','expired','borrowed','subscription','unknown']){db.ownershipReviews[book.recordRef]={ownership,source:'user-correction'};const excluded=comicCoverageForLibrary(db);assert(excluded.excluded.some(r=>r.recordRef===book.recordRef));assert.equal(excluded.groups.find(g=>g.series.toLowerCase()==='batman and the outsiders').duplicates,0);}
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
