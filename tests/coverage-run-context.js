import assert from 'node:assert/strict';
import {coverageBook as book,coverageDatabase as database,confirmed,issue} from './inferred-coverage-fixture.js';
import {libraryCoverageIndex,collectionContents} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {comicSeriesKey,comicRange} from '../src/lib/comic-coverage.js';
import {addSeriesMerge} from '../src/lib/comic-series-merges.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {selectManifest} from '../src/lib/kindle-manifest.js';
const entries=(db,id)=>[...libraryCoverageIndex(db,{includeExcerpts:true}).index.values()].flat().filter(e=>e.item.id===id).map(e=>e.entry);
const anchors=()=>[book('original','Collects Detective Comics (1937-2011) #27-92, 784-786'),book('reset','Collects Detective Comics (2011-2016) #1-29'),book('legacy','Collects Detective Comics (2016-) #934-1027')];
const capture=(record,label,intro='')=>{
  const source=record.metadata.enrichment.kindleProductComicContents;
  source.productDetailsEvidence={version:1,asin:'B012345678',sourceUrl:'https://www.amazon.com/dp/B012345678',observations:[{field:'series',label:'Series',raw:'Part of: '+label,status:'observed',value:'Part of: '+label,selector:'#seriesBulletWidget_feature_div'}]};
  source.sourceUrl=source.productDetailsEvidence.sourceUrl;
  if(intro)source.manifest=selectManifest([{selector:'#description',text:intro+' '+source.statement}],record.title).manifest;
  return record;
};
export const coverageRunContextTests=[
 ['Detective collection context recovers historical, crossover and late-original numbering without rewriting evidence',()=>{
   const bridge=capture(book('numeric-run','Collects Detective Comics (Vol. 1) #871-881',{title:'Detective Comics: The Black Mirror'}),'Detective Comics (1937-2011)');
   const cases=[
     ['Batman in the Fifties (Batman (1940-2011))','156, 168, 185, 187, 215-216, 233, 235-236, 241, 244, 252, 267, 269'],
     ["Batman: No Man's Land",'730-741'],
     ['Batman: Tales of the Demon (Batman (1940-2011))','411, 485, 489-490'],
     ['Batman: Bruce Wayne: Murderer/Fugitive (Batman (1940-2011))','766-775'],
     ["Batman: The Resurrection of Ra's Al Ghul (Batman (1940-2011))",'838-839']
   ].map(([title,numbers],i)=>book('case-'+i,'Collects Detective Comics #'+numbers,{title}));
   const db=database(...anchors(),bridge,...cases),before=JSON.stringify(db);
   for(const record of cases){const values=entries(db,record.id);assert(values.length);assert(values.every(e=>e.run==='1937-2011'&&e.runInference));assert(collectionContents(record,db).entries.every(e=>!e.run));}
   assert(entries(db,bridge.id).every(e=>e.run==='volume 1'&&!e.runInference),'Explicit numbered run must remain unchanged');
   const group=comicCoverageForLibrary(db).groups.find(g=>g.series==='Detective Comics'&&g.run==='1937-2011');assert(group.issues.find(i=>i.number==='156').sources[0].runInference);assert.equal(JSON.stringify(db),before);
   const comparable=db=>comicCoverageForLibrary(db).groups.map(g=>({id:g.id,issues:g.issues.map(i=>({number:i.number,partial:i.partial,copies:i.copies,sources:i.sources.map(s=>({id:s.id,runInference:s.runInference}))}))}));assert.deepEqual(comparable(parseBackup(createBackup(db))),comparable(db));
 }],
 ['ambiguous low numbers use collection era while contradictory and absent context stays unresolved',()=>{
   const old=book('historical','Collects Detective Comics #27',{title:'Batman (1940-2011): Early Stories'}),recent=book('modern','Collects Detective Comics #27',{title:'Batman (2011-2016): Bloom'}),unknown=book('unknown','Collects Detective Comics #27'),contradictory=book('conflict','Collects Detective Comics #27',{title:'Batman (1940-2011)'});contradictory.metadata.series=['Batman (2011-2016)'];
   const db=database(...anchors(),old,recent,unknown,contradictory);
   assert.equal(entries(db,old.id)[0].run,'1937-2011');assert.equal(entries(db,recent.id)[0].run,'2011-2016');assert.equal(entries(db,unknown.id)[0].run,'');assert.equal(entries(db,contradictory.id)[0].run,'');
   const decade=capture(book('decade','Collects Detective Comics #27'),'Batman','The 1950s was a decade of change.');db.providerItems[decade.id]=decade;assert.equal(entries(db,decade.id)[0].run,'1937-2011');
   const low=book('low-original','Collects Detective Comics #1',{title:'Batman (1940-2011): Early Stories'}),highConflict=book('wrong-era','Collects Detective Comics #950',{title:'Batman (1940-2011): Stories'});db.providerItems[low.id]=low;db.providerItems[highConflict.id]=highConflict;assert.equal(entries(db,low.id)[0].run,'1937-2011','The observed minimum is not the original run start');assert.equal(entries(db,highConflict.id)[0].run,'','Competing high-numbered era evidence must not be copied backward');
 }],
 ['explicit mixed eras and clause boundaries prevent cross-run propagation and false duplicates',()=>{
   const mixed=book('mixed','Collects Detective Comics (1937-2011) #27; Detective Comics (2011-2016) #27; Detective Comics #27',{title:'Batman (1940-2011): Across eras'}),local=book('local','Collects Detective Comics (2011-2016) #26, Detective Comics #27'),boundary=book('boundary','Collects Detective Comics (2011-2016) #26; Detective Comics #27');
   const db=database(...anchors(),mixed,local,boundary),a=entries(db,mixed.id);
   assert.deepEqual(a.map(e=>e.run),['1937-2011','2011-2016','']);assert.equal(entries(db,local.id).find(e=>e.number==='27').run,'2011-2016');assert.equal(entries(db,boundary.id).find(e=>e.number==='27').run,'');
   const groups=comicCoverageForLibrary(database(mixed)).groups;assert.equal(groups.filter(g=>g.series==='Detective Comics').length,2);assert(groups.every(g=>g.duplicates===0));
   const twoEras=book('two-clause-eras','Collects Detective Comics (1937-2011) #27; Detective Comics (2011-2016) #1, Detective Comics #2');db.providerItems[twoEras.id]=twoEras;assert.equal(entries(db,twoEras.id).find(e=>e.number==='2').run,'2011-2016','A clearly dated clause retains its context even when another clause belongs to a different era');
 }],
 ['whole cohorts, numeric styles and publication bounds prevent attractive but unsupported recent runs',()=>{
   const old=book('1999','Collects Alpha (1999) #1-3'),recent=book('2024','Collects Beta (2024-) #1-4'),collection=book('wide','Collects Alpha #1-5'),past=book('past','Collects Beta #1-4',{metadata:{publicationDate:'2014-01-01'}}),decimal=book('decimal','Collects Alpha #1.1',{title:'Collection (1999)'});
   const db=database(old,recent,collection,past,decimal);assert(entries(db,collection.id).every(e=>!e.run));assert(entries(db,past.id).every(e=>!e.run));assert(entries(db,decimal.id).every(e=>!e.run));
   const implied=book('implied','Collects #1-3',{title:'Alpha Vol. 1'});db.providerItems[implied.id]=implied;assert(entries(db,implied.id).every(e=>!e.run),'Title-derived constituent series must not seed a numbered-run guess');
 }],
 ['reviews, annual dates, partial coverage, access gates and numbering transitions retain precedence',()=>{
   const partial=book('partial','Collects material from Detective Comics #411',{title:'Batman (1940-2011): Tales'}),borrowed=book('borrowed','Collects Detective Comics #411',{ownership:'borrowed',title:'Batman (1940-2011)'}),annual=book('annual','Collects Amazing Spider-Man (1963) #1-17 and Annual #1 and material from Amazing Fantasy (1962) #15'),db=database(...anchors(),partial,borrowed,annual);
   const before=JSON.stringify(db),groups=comicCoverageForLibrary(db).groups,dc=groups.find(g=>g.series==='Detective Comics'&&g.run==='1937-2011');const i=dc.issues.find(i=>i.number==='411');assert(i.partial);assert.equal(i.copies,0);assert(i.sources.every(s=>s.id!==borrowed.id));assert.equal(groups.find(g=>g.series==='Amazing Spider-Man'&&g.unitType==='annual').run,'1963');assert.equal(JSON.stringify(db),before);
   db.contentReviews[partial.id]=confirmed([issue('411',{series:'Detective Comics',run:'2016-',completeness:'excerpt'})]);assert.equal(entries(db,partial.id)[0].run,'2016-');assert(!entries(db,partial.id)[0].runInference);
   const range=comicRange({issues:[{number:'58'},{number:'500'},{number:'501'}]},1,[[58,500]]);assert.equal(range.missing,57);assert.deepEqual(range.sequence,[[1,58],[500,501]]);
 }],
 ['user-defined runless series merges remain stable and reversible without source changes',()=>{
   const unspecified=book('manual-member','Collects Alpha #1-3'),db=database(unspecified,book('anchor','Collects Alpha (1990) #1-3'),book('target','Collects Alternate Alpha (1990) #4'));
   const runless=comicSeriesKey({series:'Alpha',run:'',unitType:'issue',language:'en'}),target=comicSeriesKey({series:'Alternate Alpha',run:'1990',unitType:'issue',language:'en'});
   const merges=addSeriesMerge({},runless,target,'Preferred Alpha',true),before=JSON.stringify(db),group=comicCoverageForLibrary(db,merges).groups.find(g=>g.id===target);assert(group?.members.includes(runless));assert(group.issues.some(i=>i.number==='1'&&i.sources.some(s=>s.id===unspecified.id)));assert.equal(JSON.stringify(db),before);assert(comicCoverageForLibrary(db).groups.find(g=>g.series==='Alpha'&&g.run==='1990').issues.length===3);
 }]
];
