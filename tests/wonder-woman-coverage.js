import assert from 'node:assert/strict';
import {proposeContentsForReview} from '../src/lib/contents.js';
import {selectManifest} from '../src/lib/kindle-manifest.js';
import {collectionContents,libraryCoverageIndex} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {comicRange} from '../src/lib/comic-coverage.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {perezStatement,wonderBook} from './wonder-woman-coverage-fixture.js';
import {createBackup,parseBackup,parseBackupPreferences} from '../src/lib/storage.js';
import {addSeriesMerge} from '../src/lib/comic-series-merges.js';
export const wonderWomanCoverageTests=[
 ['a joined collection header is not retained as part of a series identity',()=>{
   const book=wonderBook('absolute','Absolute Wonder Woman Vol. 1 (Absolute Wonder Woman (2024-))','CollectsAbsolute Wonder Woman #1-7.','Absolute Wonder Woman (2024-)'),db=coverageDatabase(book),before=JSON.stringify(db);
   const group=comicCoverageForLibrary(db).groups[0];assert.equal(group.series,'Absolute Wonder Woman');assert.equal(group.run,'2024-');assert.equal(group.covered,7);assert.equal(JSON.stringify(db),before);
   assert.equal(proposeContentsForReview('CollectsAbsolute Photography').normalizedInput,'CollectsAbsolute Photography');
 }],
 ['a continuing run collected in these tales is full issues, not excerpt material',()=>{
   const book=wonderBook('perez','Wonder Woman by George Perez Vol. 4 (Wonder Woman (1987-2006))',perezStatement);
   // Retain the actual saved selection, rather than selecting a newer child.
   const source=book.metadata.enrichment.kindleProductComicContents;source.statement=perezStatement;source.manifest.selected=0;
   const db=coverageDatabase(book),before=JSON.stringify(db),p=collectionContents(book,db);
   assert.equal(p.entries.length,11);assert(p.entries.every(e=>e.completeness==='full'));
   const groups=comicCoverageForLibrary(db).groups;assert.equal(groups.find(g=>g.unitType==='issue').covered,10);assert.equal(groups.find(g=>g.unitType==='annual').covered,1);assert(groups.every(g=>g.run==='1987-2006'));assert.equal(JSON.stringify(db),before);
   for(const text of ['Collects material from Wonder Woman #36-45','Collects the short story "Origin" from Wonder Woman #36','Find out in these tales from Wonder Woman #36-45'])assert(proposeContentsForReview(text).entries.every(e=>e.completeness==='excerpt'));
 }],
 ['publication volume is resolved from the collection run, never from its collected-volume number',()=>{
   const gods=wonderBook('gods','Wonder Woman (1987-2006) Vol. 1: Gods and Mortals','Collects Wonder Woman Vol. 2 #1-7'),perez=wonderBook('perez-one','Wonder Woman by George Perez Vol. 1 (Wonder Woman (1987-2006))','Collects Wonder Woman #1-14');
   const db=coverageDatabase(gods,perez),before=JSON.stringify(db),groups=comicCoverageForLibrary(db).groups;
   assert.equal(groups.length,1);assert.equal(groups[0].run,'1987-2006');assert.equal(groups[0].covered,14);assert.equal(groups[0].duplicates,7);assert.equal(JSON.stringify(db),before);
   gods.ownership='unknown';assert.equal(comicCoverageForLibrary(db).groups[0].duplicates,0,'Unknown ownership fabricated a duplicate');
 }],
 ['source-supported run aliases propagate to mixed editions without copying anthology context',()=>{
   const anchor=wonderBook('anchor','Wonder Woman (1987-2006) Vol. 1','Collects Wonder Woman Vol. 2 #1-7');
   const mixed=wonderBook('mixed','Wonder Woman: 80 Years (Wonder Woman (1942-1986))','Collects material from Wonder Woman (vol. 1) #5; Wonder Woman (vol. 2) #6; Wonder Woman (vol. 3) #600; Wonder Woman #750','Wonder Woman (1942-1986)');
   const db=coverageDatabase(anchor,mixed),entries=[...libraryCoverageIndex(db,{includeExcerpts:true}).index.values()].flat().filter(e=>e.item.id===mixed.id);
   assert.equal(entries.find(e=>e.entry.number==='6').entry.run,'1987-2006');
   assert(entries.find(e=>e.entry.number==='750').provisional,'Mixed-era unqualified #750 inherited the original era');
   assert.equal(entries.find(e=>e.entry.number==='600').entry.run,'volume 3','Unknown publication-volume mapping invented');
 }],
 ['an unresolved publication-volume envelope cannot overrule explicit historical collection context',()=>{
   const old=wonderBook('old','Wonder Woman in the Fifties (Wonder Woman (1942-1986))','Collects material from Wonder Woman #45-108','Wonder Woman (1942-1986)'),unknown=coverageBook('numbered','Collects material from Wonder Woman (vol. 3) #1, #600');
   const huntress=coverageBook('huntress','Collects stories from Wonder Woman #271-287, #289-290, #294-295',{title:'The Huntress: Origins'});
   huntress.metadata.enrichment.kindleProductComicContents.manifest=selectManifest([{selector:'description',text:'These are the 1970s stories that first introduced the Huntress. '+huntress.metadata.enrichment.kindleProductComicContents.statement}],huntress.title).manifest;
   const entries=[...libraryCoverageIndex(coverageDatabase(old,unknown,huntress),{includeExcerpts:true}).index.values()].flat().filter(e=>e.item.id===huntress.id);
   assert.equal(entries.length,21);assert(entries.every(e=>!e.provisional&&e.entry.run==='1942-1986'&&e.entry.completeness==='excerpt'));
 }],
 ['same-start calendar aliases combine while numbering resets, annuals and manual reviews stay distinct',()=>{
   const short=wonderBook('short','Wonder Woman (2011-2016): Blood and Guts','Collects Wonder Woman (2011) #0-12','Wonder Woman (2011-2016)'),long=wonderBook('long','Wonder Woman (2011-2016) Vol. 3: Iron','Collects Wonder Woman #0, #13-18','Wonder Woman (2011-2016)'),reset=wonderBook('reset','Wonder Woman (2016-) Book 1','Collects Wonder Woman #1-2; Wonder Woman Annual #1','Wonder Woman (2016-)');
   const db=coverageDatabase(short,long,reset),groups=comicCoverageForLibrary(db).groups,old=groups.find(g=>g.run==='2011-2016');assert.equal(old.covered,19);assert.equal(old.duplicates,1);assert.equal(groups.length,3);
   const before=JSON.stringify(db.contentReviews);db.contentReviews[short.id]=confirmed([issue('99',{series:'Wonder Woman',run:'2011'})]);const reviewed=JSON.stringify(db.contentReviews);comicCoverageForLibrary(db);assert.equal(JSON.stringify(db.contentReviews),reviewed);assert.notEqual(reviewed,before);
 }],
 ['legacy transitions skip absent labels without joining numbering resets',()=>{
   for(const [run,a,b]of [['2006-2011',44,600],['2016-2023',83,750]]){
     const book=wonderBook('legacy-'+run,'Wonder Woman ('+run+') Vol. 1','Collects Wonder Woman #'+a+', #'+b,'Wonder Woman ('+run+')'),db=coverageDatabase(book),group=comicCoverageForLibrary(db).groups[0];
     assert.equal(comicRange(group,1,[[a,b]]).missing,a-1);assert.equal(comicRange(group).missing,b-2);
   }
 }],
 ['conflicting publication aliases stay separate and confirmed merges survive backup with transitions',()=>{
   const old=wonderBook('old-alias','Wonder Woman (1987-2006) Vol. 1','Collects Wonder Woman Vol. 2 #1-7'),reset=wonderBook('reset-alias','Wonder Woman (2011-2016) Vol. 1','Collects Wonder Woman Vol. 2 #1-7','Wonder Woman (2011-2016)');
   let entries=[...libraryCoverageIndex(coverageDatabase(old,reset)).index.values()].flat();assert(entries.every(e=>e.entry.run==='volume 2'),'Conflicting aliases chose a calendar run');
   const sibling=wonderBook('sibling','Wonder Woman (1987-2006) Vol. 2','Collects Wonder Woman #1-14'),db=coverageDatabase(old,sibling);
   const target=JSON.stringify(['wonder woman','1987 2006','issue','en']),member=JSON.stringify(['wonder woman','volume 2','issue','en']);
   const merges=addSeriesMerge({},member,target,'Wonder Woman',true),prefs={comicCoverageMerges:merges,comicCoverageTransitions:{[target]:[[44,600]]}},original=JSON.stringify(db);
   const projection=comicCoverageForLibrary(db,merges);assert.equal(projection.groups[0].covered,14);assert.equal(projection.groups[0].duplicates,7);
   const backup=createBackup(db,prefs),restored=parseBackup(backup),preferences=parseBackupPreferences(backup);assert.deepEqual(preferences.comicCoverageMerges,merges);assert.deepEqual(preferences.comicCoverageTransitions,prefs.comicCoverageTransitions);
   assert.deepEqual(comicCoverageForLibrary(restored,merges).groups.map(g=>[g.id,g.covered,g.partial,g.duplicates]),projection.groups.map(g=>[g.id,g.covered,g.partial,g.duplicates]));assert.equal(JSON.stringify(db),original);
   assert.equal(comicCoverageForLibrary(restored,{}).groups.length,1,'Undo should restore automatic source-supported identity');
 }],
 ['a contextual annual following another named one-shot remains unresolved instead of inventing its series',()=>{
   const book=wonderBook('rebirth','Wonder Woman: The Rebirth Deluxe Edition - Book 3 (Wonder Woman (2016-))','Collects Wonder Woman #26-30, Wonder Woman: Steve Trevor #1, Annual #1 and the Wonder Woman 75th Anniversary Special #1.','Wonder Woman (2016-)'),proposal=collectionContents(book,coverageDatabase(book));
   assert(!proposal.entries.some(e=>e.series==='Wonder Woman: Steve Trevor'&&e.unitType==='annual'));assert(proposal.unparsed.includes('Annual #1'));
   assert.equal(proposal.entries.filter(e=>e.series==='Wonder Woman'&&e.unitType==='issue').length,5);
 }]
];
