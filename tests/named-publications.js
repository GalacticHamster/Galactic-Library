import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveNamedPublications,resolvePublicationRun,validatePublicationReferences} from '../src/lib/comic-publications.js';
import {PUBLICATION_REFERENCES} from '../src/lib/publication-reference-data.js';
import {manifestReviewProposal,selectManifest} from '../src/lib/kindle-manifest.js';
import {collectionContents,libraryCoverageIndex} from '../src/lib/inferred-coverage.js';
import {contentKey} from '../src/lib/contents.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {checkNamedPublication,namedBook} from './named-publications-fixture.js';
import {contentsParseState} from '../src/lib/kindle-contents.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle/named-publications.json',import.meta.url),'utf8'));
const catalog=[{id:'test-series',title:'Alpha / Beta',run:'2001',kind:'miniseries',publishers:['Example Comics','Example'],contexts:['Alpha Library'],aliases:['Alpha & Beta'],numbers:['0','1','2'],complete:true,sources:['https://example.org/publication']}];
const source={productDetailsEvidence:{observations:[{field:'publisher',value:'Example',status:'observed'},{field:'series',value:'Part of: Alpha Library',status:'observed'}]}};
const resolve=(fragment,statement='Collects '+fragment,refs=catalog)=>resolveNamedPublications({entries:[],unparsed:[fragment]},source,statement,{catalog:refs});
export const namedPublicationTests=[
 ...fixtures.cases.map((c,i)=>['named-publication captured source: '+c.title,()=>checkNamedPublication(c,i,assert)]),
 ['publication enumeration uses cited explicit boundaries, not a miniseries guess or highest local issue',()=>{
  assert.deepEqual(resolve('Alpha and Beta miniseries').entries.map(e=>e.number),['0','1','2']);
  const p=resolve('Alpha/Beta',undefined,[{...catalog[0],numbers:[],complete:false}]);assert.equal(p.entries.length,0);assert.equal(p.publicationResolutions[0].enumeration,'unresolved');assert.deepEqual(p.unparsed,['Alpha/Beta']);
  for(const fragment of ['Alpha/Beta 2','Alpha/Beta (2011)','Alpha/Beta deluxe collection','Alpha/Beta miniseries #1','Selected issues of Alpha/Beta','material from Alpha/Beta','the story Alpha/Beta','Alpha/Beta preview'])assert.equal(resolve(fragment).entries.length,0,fragment);
  assert.equal(resolve('Alpha/Beta','Collects selected material from Gamma and Alpha/Beta.').entries.length,0);
  assert.equal(resolve('Alpha/Beta','Following Alpha/Beta, a hero returns.').entries.length,0);
  const collision=[...catalog,{...catalog[0],id:'relaunch',run:'2011'}];assert.equal(resolve('Alpha/Beta',undefined,collision).entries.length,0);
  const partial=resolveNamedPublications({entries:[{series:'Parent',unitType:'component',number:'Alpha/Beta',completeness:'excerpt'}],unparsed:[]},source,'Collects Alpha/Beta',{catalog});assert.equal(partial.entries[0].unitType,'component');assert.equal(partial.publicationResolutions[0].enumeration,'unresolved');
  const mixed=resolveNamedPublications({entries:[issue('3'),issue('3',{completeness:'excerpt'})],unparsed:['Alpha/Beta']},source,'Collects Alpha/Beta',{catalog});assert.equal(mixed.entries.filter(e=>e.series==='Alpha').length,2);
  const distinct=[issue('4',{series:'Gamma/Delta'}),issue('4',{series:'Gamma and Delta'})],literal=resolveNamedPublications({entries:distinct,unparsed:['Alpha/Beta']},source,'Collects Alpha/Beta',{catalog});assert(distinct.every(e=>literal.entries.some(v=>contentKey(v)===contentKey(e))));
 }],
 ['publication data is bounded, validated and independent from ownership',()=>{
  assert.equal(validatePublicationReferences(PUBLICATION_REFERENCES),PUBLICATION_REFERENCES);
  for(const patch of [{sources:[]},{complete:true,numbers:[]},{numbers:['1','1']},{numbers:['unnumbered']},{run:''},{kind:'ongoing',complete:true}])assert.throws(()=>validatePublicationReferences([{...catalog[0],...patch}]));
  assert.throws(()=>validatePublicationReferences([catalog[0],catalog[0]]));
 }],
 ['scan status, workbench and source review use the same unchanged named-publication interpretation',()=>{
  for(const [index,c]of fixtures.cases.entries()){
   const book=namedBook(c,index),db=coverageDatabase(book),p=collectionContents(book,db),status=contentsParseState(book),rows=enrichmentWorkbenchRows(db,{includeMissing:false});
   assert.equal(status.parseOutcome,p.outcome);assert.equal(status.parseInput,p.parseInput);assert.equal(rows.length,1);assert(rows[0].reason.startsWith(p.unparsed.length?'Partially parsed proposal':'Parsed proposal; not verified'));
  }
 }],
 ['literal publication aliases require publisher and family, protect unrelated runs and cannot bind edited drafts',()=>{
  const c=fixtures.cases.find(c=>/Vol. 5$/.test(c.title)),s=structuredClone(c.source);
  assert.equal(manifestReviewProposal(s,c.title,'Collects TMNT/Ghostbusters.').publicationResolutions,undefined);
  s.productDetailsEvidence.observations=s.productDetailsEvidence.observations.filter(o=>o.field!=='series');assert.equal(manifestReviewProposal(s,c.title).entries.length,7);
  s.productDetailsEvidence.observations.push({field:'series',status:'observed',value:'Part of: Teenage Mutant Ninja Turtles Classics'});assert.equal(manifestReviewProposal(s,c.title).entries.length,7);
  const ongoing=fixtures.cases.find(c=>/Vol. 9$/.test(c.title)).source,e=issue('9',{series:'Teenage Mutant Ninja Turtles Universe',run:''});
  assert.equal(resolvePublicationRun(e,ongoing).run,'2016');assert.equal(resolvePublicationRun({...e,run:'2024'},ongoing).run,'2024');assert.equal(resolvePublicationRun({...e,number:'26'},ongoing).run,'');assert.equal(resolvePublicationRun({...e,runContextConflict:true},ongoing).run,'');
 }],
 ['resolution preserves source, reviews, exclusions, repeated imports, merges and backup round-trip',()=>{
  const c=fixtures.cases.find(c=>/Vol. 9$/.test(c.title)),book=namedBook(c),db=coverageDatabase(book),before=JSON.stringify(db),p=collectionContents(book,db);
  const groups=comicCoverageForLibrary(db).groups;assert(groups.some(g=>/Universe$/iu.test(g.series)&&g.run==='2016'&&g.covered===7));assert(groups.some(g=>g.unitType==='special'&&g.issues[0].number==='unnumbered'));
  const snapshot=parseBackup(createBackup(db));assert.deepEqual(collectionContents(snapshot.providerItems[book.id],snapshot).entries,p.entries);assert.equal(JSON.stringify(db),before);
  const scope=JSON.stringify(['teenage mutant ninja turtles universe','','issue','en']);const idx=libraryCoverageIndex(db,{runInferenceExclusions:[scope]});const protectedRows=[...idx.index.values()].flat().filter(v=>/Universe$/iu.test(v.entry.series));assert.equal(protectedRows.length,7);assert(protectedRows.every(v=>!v.entry.publicationResolution));
  db.contentReviews[book.id]=confirmed([issue('8',{completeness:'excerpt'})]);const restored=parseBackup(createBackup(db));assert.deepEqual(collectionContents(restored.providerItems[book.id],restored).entries,db.contentReviews[book.id].entries);assert.equal(comicCoverageForLibrary(db).groups[0].partial,1);
  delete db.contentReviews[book.id];for(const ownership of ['unknown','subscription','borrowed','returned','expired','revoked']){db.ownershipReviews[book.recordRef]={ownership,source:'user-correction'};assert.equal(comicCoverageForLibrary(db).groups.length,0);assert.equal(collectionContents(book,db).entries.length,14);}
 }],
 ['repeated references are one contribution per book; distinct supporting products can overlap',()=>{
  const c=fixtures.cases.find(c=>/Vol. 4$/.test(c.title)),s=structuredClone(c.source),text='Collects Utrom Empire and Utrom Empire.';
  Object.assign(s,selectManifest([{selector:'#fixture',text}],c.title));const a=coverageBook('a',text,{title:c.title}),b=coverageBook('b',text,{title:'Another Collection'});a.metadata.enrichment.kindleProductComicContents=s;b.metadata.enrichment.kindleProductComicContents=structuredClone(s);
  const db=coverageDatabase(a,b),p=collectionContents(a,db);assert.equal(p.entries.length,3);assert.equal(new Set(p.entries.map(contentKey)).size,3);
  const group=comicCoverageForLibrary(db).groups[0];assert.equal(group.covered,3);assert.equal(group.duplicates,3);delete db.providerItems[b.id];assert.equal(comicCoverageForLibrary(db).groups[0].duplicates,0);
 }],
 ['IDW bibliography does not date Mirage, Archie, an explicit relaunch or an unscoped standalone',()=>{
  const c=fixtures.cases.find(c=>/Vol. 4$/.test(c.title)),idw=namedBook(c),mirage=coverageBook('mirage','Collects Teenage Mutant Ninja Turtles (1984) #1-3'),standalone=coverageBook('bare','',{title:'Teenage Mutant Ninja Turtles #1'}),db=coverageDatabase(idw,mirage,standalone),result=comicCoverageForLibrary(db);
  assert(result.groups.some(g=>g.run==='2011'&&g.covered===9));assert(result.groups.some(g=>g.run==='1984'&&g.covered===3));assert(result.unassigned.some(g=>g.numbers.includes('1')&&g.sources.some(s=>s.id===standalone.id)));
  const e=issue('1',{series:'Teenage Mutant Ninja Turtles',run:''}),s=structuredClone(c.source);s.productDetailsEvidence.observations.find(o=>o.field==='series').value='Part of: Archie TMNT Adventures';assert.equal(resolvePublicationRun(e,s).run,'');assert.equal(resolvePublicationRun({...e,run:'2024'},c.source).run,'2024');
 }]
];
