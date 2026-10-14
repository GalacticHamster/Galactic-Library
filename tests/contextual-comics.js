import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {proposeContentsForReview as parse,validateContents,contentKey} from '../src/lib/contents.js';
import {manifestReviewProposal,selectManifest} from '../src/lib/kindle-manifest.js';
import {collectionContents,libraryCoverageIndex} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {comicRange} from '../src/lib/comic-coverage.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {excerptBook} from './excerpt-extent-fixture.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle/contextual-comics.json',import.meta.url),'utf8'));
const expected=[6,4,7,8,6,5,6],numbers=(a,b)=>Array.from({length:b-a+1},(_,n)=>String(a+n));
export const contextualComicTests=[
 ...fixtures.cases.map((c,index)=>['captured contextual TMNT: '+c.title,()=>{
   const book=excerptBook(c,index),db=coverageDatabase(book),before=JSON.stringify(db),p=collectionContents(book,db);
   assert.equal(p.entries.length,expected[index]);assert(p.entries.every(e=>e.completeness==='full'));assert.equal(JSON.stringify(db),before);
   assert.deepEqual(manifestReviewProposal(c.source,c.title,c.source.statement.replace(/\s+/gu,' ')).entries,p.entries);
   if(index===0){assert(p.entries.every(e=>e.series==='Batman/Teenage Mutant Ninja Turtles II'&&e.run==='2017-2018'));}
   if(index===1){assert.deepEqual(p.entries.filter(e=>e.unitType==='issue').map(e=>e.number),['131','132']);assert(p.entries.some(e=>e.unitType==='annual'&&e.run==='publication 2022'&&e.number==='unnumbered'));assert(p.entries.some(e=>e.unitType==='special'&&e.series.includes('Free Comic Book Day')&&e.number==='unnumbered'));assert(!p.entries.some(e=>e.number==='2022'||e.number==='1'));}
   if(index===2){assert.deepEqual(p.entries.map(e=>e.number),numbers(133,139));assert(!p.entries.some(e=>e.series.includes('Armageddon')));}
   if(index===3)assert(p.entries.every(e=>e.series.endsWith('The Armageddon Game')));
   if(index===4)assert(p.entries.every(e=>e.series.endsWith('The Alliance')));
   if(index===6){assert(p.entries.filter(e=>e.unitType==='issue').every(e=>e.series.endsWith('The Lost Years')));assert.equal(p.entries.find(e=>e.unitType==='special').series,'Teenage Mutant Ninja Turtles: Lost Day Special');}
 }]),
 ['complete counts require an entire series and preserve explicit titles, sequels and supplements',()=>{
   for(const text of ['Collects all six issues.','Collecting all 6 issues of Alpha.','Collects the complete six-issue miniseries.','Collects the six-issue series.'])assert.deepEqual(parse(text,'Alpha').entries.map(e=>e.number),numbers(1,6));
   assert.equal(parse('Collects all twenty-one issues.','Alpha').entries.length,21);
   assert.equal(parse('Collects the complete five—issue miniseries.','Alpha').entries.length,5);
   for(const text of ['Collects six issues.','Collects the six-issue volume.','Collects all six stories.','Collects all six chapters.','Collects all six issues of the first story arc.'])assert(!parse(text,'Alpha').entries.some(e=>e.unitType==='issue'));
   assert.equal(parse('Collects the complete six-issue miniseries.','Alpha Vol. 2').entries.length,0);
   assert(!parse('Collects the complete six-issue miniseries, #0-5.','Alpha').entries.some(e=>e.number==='6'));
   assert.equal(parse('Collects all six issues.','Alpha (2011)',{subjectSeries:'Alpha (1984)'}).entries.length,0);
   assert.equal(parse('Collects all six issues.','Alpha',{series:['Alpha','Beta']}).entries.length,0);
   const explicit=parse('Collects all six issues of Beta.','Alpha Vol. 2');assert(explicit.entries.every(e=>e.series==='Beta'));
   const sequel=parse('Collects all six issues.','Alpha II (2017-2018)',{subjectSeries:'Alpha'});assert(sequel.entries.every(e=>e.series==='Alpha II'));
   const mixed=parse('Collects the five-issue series and the Alpha: Lost Day Special.','Alpha: Lost Years');assert.equal(mixed.entries.length,6);assert(mixed.entries.find(e=>e.unitType==='special').number==='unnumbered');
   const numbered=parse('Collects the five-issue miniseries plus Beta Special #1.','Alpha');assert.equal(numbered.entries.length,6);assert(numbered.entries.some(e=>e.series==='Beta'&&e.unitType==='special'&&e.number==='1'));
   const prose=parse('Collects the six-issue miniseries by Jane Doe and John Roe, with two bonus essays.','Alpha');assert.equal(prose.entries.length,6);assert(prose.unparsed.some(s=>s.includes('Jane Doe')));
 }],
 ['implicit ranges and explicit postposed lists retain numbers, source series, run distinctions and tail evidence',()=>{
   for(const dash of ['-','–','—',' through '])assert.deepEqual(parse('Collects issues #1'+dash+'#6.','Alpha Vol. 1').entries.map(e=>e.number),numbers(1,6));
   const post=parse('Collects issues #131 and 132 of Beta.','Alpha Vol. 1');assert(post.entries.every(e=>e.series==='Beta'));assert.equal(post.entries.length,2);
   const uncertain=parse('Collects issues #1-6.','Alpha/Beta Omnibus');assert.equal(uncertain.entries.length,0);assert.equal(uncertain.provisionalRanges[0].last,'6');
   const promo=parse('Collects issues #133—139 which serve as a tie-in to Beta.','Alpha Vol. 2');assert.equal(promo.entries.length,7);assert(promo.entries.every(e=>e.series==='Alpha'));assert(promo.unparsed[0].includes('Beta'));
   const runs=coverageDatabase(coverageBook('old','Collects Alpha (1984) #1-6'),coverageBook('new','Collects all six issues.',{title:'Alpha (2011)'}));const groups=comicCoverageForLibrary(runs).groups;assert.equal(groups.filter(g=>g.series==='Alpha').length,2);assert(groups.every(g=>!g.duplicates));
 }],
 ['unnumbered annuals and specials remain dated publications without invented integer gaps or issue numbers',()=>{
   const p=parse('Collects the 2022 Annual, issues #131 and 132 of Alpha, and the 2022 Free Comic Book Day Alpha issue.','Alpha Vol. 6');
   assert.equal(p.entries.length,4);const db=coverageDatabase(coverageBook('mixed','',{title:'Alpha Vol. 6'}));db.contentReviews[Object.keys(db.providerItems)[0]]=confirmed(p.entries);
   const groups=comicCoverageForLibrary(parseBackup(createBackup(db))).groups;assert.equal(groups.find(g=>g.unitType==='annual').issues[0].number,'unnumbered');assert.equal(comicRange(groups.find(g=>g.unitType==='annual')).missing,0);
   assert.throws(()=>validateContents([{series:'Alpha',run:'',unitType:'issue',number:'unnumbered'}]));
   assert(!parse('Collects Alpha #1-2 and the 2022 Annual #1.','Alpha Vol. 1').entries.some(e=>e.number==='unnumbered'));
   assert(!parse('Collects Alpha #1-2; Beta #3; the 2022 Annual.','Alpha Vol. 1').entries.some(e=>e.unitType==='annual'));
   assert.equal(parse('Includes the 2022 Free Comic Book Day issue.','Alpha (2011) Vol. 1').entries[0].unitType,'special');
   const limited=parse('Collects Alpha #1-2; material from the 2022 Annual.','Alpha Vol. 1');assert(limited.entries.filter(e=>e.unitType==='annual').every(e=>e.completeness==='excerpt'));
 }],
 ['contextual proposals preserve reviews, ownership exclusions, restore and repeated imports',()=>{
   const book=excerptBook(fixtures.cases[0]),db=coverageDatabase(book),source=JSON.stringify(book.metadata),initial=collectionContents(book,db);
   const restored=parseBackup(createBackup(db));assert.deepEqual(collectionContents(restored.providerItems[book.id],restored).entries,initial.entries);
   const copy={...book,metadata:structuredClone(book.metadata)};restored.providerItems[book.id]=copy;assert.deepEqual(collectionContents(copy,restored).entries,initial.entries);
   db.contentReviews[book.id]=confirmed([issue('2',{series:'Reviewed',run:'2001',completeness:'excerpt'})]);assert.equal(collectionContents(book,db).entries[0].series,'Reviewed');assert.equal(JSON.stringify(book.metadata),source);delete db.contentReviews[book.id];
   for(const ownership of ['subscription','borrowed','unknown','returned','revoked','expired']){db.ownershipReviews[book.recordRef]={ownership,source:'user-correction'};const result=comicCoverageForLibrary(db);assert.equal(result.groups.length,0);assert.equal(result.excluded.length,1);}
 }],
 ['sibling source corroboration resolves an implicit collection label without conflating publisher runs or sequels',()=>{
   const six=excerptBook(fixtures.cases[1],1),seven=excerptBook(fixtures.cases[2],2),idw=coverageBook('idw','Collects Teenage Mutant Ninja Turtles (2011) #131-139'),mirage=coverageBook('mirage','Collects Teenage Mutant Ninja Turtles (1984) #1-12'),db=coverageDatabase(six,seven,idw,mirage),before=JSON.stringify(db);
   const result=comicCoverageForLibrary(db),group=result.groups.find(g=>g.series==='Teenage Mutant Ninja Turtles'&&g.run==='2011');assert.equal(group.covered,9);assert.equal(group.duplicates,9);assert.equal(result.groups.find(g=>g.series==='Teenage Mutant Ninja Turtles'&&g.run==='1984').duplicates,0);assert.equal(JSON.stringify(db),before);
   const protectedIndex=libraryCoverageIndex(db,{runInferenceExclusions:[JSON.stringify(['teenage mutant ninja turtles reborn','','issue','en'])]});assert([...protectedIndex.index.values()].flat().filter(v=>v.item.id===seven.id).every(v=>v.entry.series==='Teenage Mutant Ninja Turtles: Reborn'));
   db.contentReviews[seven.id]=confirmed([issue('1',{series:'Explicit reviewed child',run:'1984'})]);assert(comicCoverageForLibrary(db).groups.some(g=>g.series==='Explicit reviewed child'));
   const alone=comicCoverageForLibrary(coverageDatabase(seven));assert(!alone.groups.some(g=>g.run==='2011')); // No fabricated calendar run.
 }],
 ['existing source normalizations retain credits, internal punctuation, annuals and explicit runs',()=>{
   const counts=[4,6,10,5,7,10,12,6];
   for(const [index,c] of fixtures.controls.entries()){const p=manifestReviewProposal(c.source,c.title);assert.equal(p.entries.length,counts[index],c.title);}
   assert(manifestReviewProposal(fixtures.controls[1].source,fixtures.controls[1].title).entries.every(e=>e.series==='FRANKENSTEIN, AGENT OF S.H.A.D.E.'));
   assert(manifestReviewProposal(fixtures.controls[2].source,fixtures.controls[2].title).entries.every(e=>e.series==='TALES OF THE TEEN TITANS'));
   assert(manifestReviewProposal(fixtures.controls[3].source,fixtures.controls[3].title).entries.every(e=>e.series==='Hellboy in Hell'));
   for(const text of ['Collects selected pages from Alpha #1-3','Includes backup stories from Alpha #1-3','Collects material from Alpha #1-3'])assert(parse(text,'Alpha Vol. 1').entries.every(e=>e.completeness==='excerpt'));
   const independent=selectManifest([{selector:'#description',text:'Collects all six issues of Alpha. Contains Beta #7-9.'}],'Alpha');assert(!manifestReviewProposal(independent,'Alpha').entries.some(e=>e.series==='Beta')||!manifestReviewProposal(independent,'Alpha').entries.some(e=>e.series==='Alpha'));
 }]
];
