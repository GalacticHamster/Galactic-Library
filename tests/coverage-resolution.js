import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {coverageResolutionFixture} from './coverage-resolution-fixture.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {collectionContents,libraryCoverageIndex} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {resolutionCandidates,compatibleResolutionCollections,coverageResolutionRequest,previewCoverageResolutions,applyCoverageResolutions} from '../src/lib/coverage-resolution.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {contentKey,contentsReviewChanged} from '../src/lib/contents.js';
import {loadCoverageProjection,coverageProjectionKey} from '../src/ui/collection-overlap-projection.js';
import {selectManifest} from '../src/lib/kindle-manifest.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle/coverage-resolution.json',import.meta.url),'utf8'));
const make=()=>coverageResolutionFixture(fixtures.cases),find=(projection,book)=>projection.dispositions.find(r=>r.recordRef===book.recordRef);
function requestFor(row,p,db,ids=row.observations.map(o=>o.id)){
 const target=resolutionCandidates(row,p.dispositions,db,ids).find(t=>t.suggested);assert(target);return {target,request:coverageResolutionRequest(row,ids,target,db)};
}
export const coverageResolutionTests=[
 ['shared UI projection reuses only the same snapshot, merge scope and access-expiry epoch',async()=>{
  const book=coverageBook('expiry'),db=coverageDatabase(book),now=Date.now(),oldNow=Date.now;db.ownershipReviews[book.recordRef]={ownership:'owned',source:'user-correction',expiresAt:new Date(now+1000).toISOString()};
  assert.notEqual(coverageProjectionKey(db,{},now),coverageProjectionKey(db,{},now+2000));assert.notEqual(coverageProjectionKey(db,{},now),coverageProjectionKey(db,{changed:true},now));
  try{Date.now=()=>now;const first=await loadCoverageProjection(db,'comic-coverage');assert.equal(first.groups[0].covered,3);assert.equal(await loadCoverageProjection(db,'comic-coverage'),first);Date.now=()=>now+2000;const later=await loadCoverageProjection(db,'comic-coverage');assert.equal(later.groups.length,0);assert.equal(later.excluded.length,1);}finally{Date.now=oldNow;}
 }],
 ['all five captured TMNT collections have explicit provisional dispositions and cited, isolated run choices',()=>{
  const {books,db,projection}=make(),before=JSON.stringify(db);
  for(const [i,book]of books.entries()){
   const row=find(projection,book),expected=[7,4,7,13,13][i];assert.equal(row.summary.parsed,expected);assert.equal(row.summary.full,0);assert.equal(row.summary.provisional,expected);assert(row.observations.every(o=>o.reasons.some(r=>r.code==='run-ambiguous')));
   const {target,request}=requestFor(row,projection,db);assert.equal(target.run,i<3?'1984':'1996');assert(target.sources.length);
   const preview=previewCoverageResolutions(db,[request],{dispositions:projection.dispositions}),after=comicCoverageForLibrary(preview.database),changed=find(after,book);assert.equal(changed.summary.full,expected);assert.equal(changed.summary.provisional,0);
   assert.equal(changed.references.filter(r=>r.actionable).length,i<2?1:0,'Run correction hid an unresolved named work');
   const restored=parseBackup(createBackup(preview.database));assert.equal(find(comicCoverageForLibrary(restored),restored.providerItems[book.id]).summary.full,expected);assert.equal(contentsReviewChanged(restored.providerItems[book.id],restored.contentReviews[book.id]),false);
   restored.providerItems[book.id]={...restored.providerItems[book.id],metadata:structuredClone(book.metadata)};assert.equal(find(comicCoverageForLibrary(restored),restored.providerItems[book.id]).summary.full,expected);
   assert.deepEqual(preview.database.providerItems,db.providerItems);assert.deepEqual(preview.database.ownershipReviews,db.ownershipReviews);
  }
  assert.equal(JSON.stringify(db),before);
 }],
 ['individual assignment affects only selected observations, preserves other runs, source and unresolved one-shots',()=>{
  const {books,db,projection}=make(),row=find(projection,books[0]),ids=[row.observations[0].id],{request}=requestFor(row,projection,db,ids),next=applyCoverageResolutions(db,{confirmed:true,mergeStamp:'{}',targets:[request]}).database,result=comicCoverageForLibrary(next),after=find(result,books[0]);
  assert.equal(after.summary.full,1);assert.equal(after.summary.provisional,6);assert(after.references.some(r=>r.fragment.includes('Raphael')));assert.equal(find(result,books[1]).summary.full,0);assert.equal(find(result,books[3]).summary.full,0);assert.equal(Object.keys(next.contentReviews).length,1);
 }],
 ['a mixed collection cannot silently promote an unrelated provisional identity through a run-only review',()=>{
  const book=coverageBook('mixed','',{title:'Alpha (2001) Vol. 1'});book.metadata.enrichment.kindleProductComicContents={...selectManifest([{selector:'#description',text:'Collecting issues #1-2 and Beta #3.'}],book.title),approved:false,matchBasis:'source-evidence'};
  const db=coverageDatabase(book),p=comicCoverageForLibrary(db),row=find(p,book);assert.equal(row.summary.full,2);assert.equal(row.summary.provisional,1);const ids=[row.observations[0].id],target=resolutionCandidates(row,p.dispositions,db,ids)[0],before=JSON.stringify(db);const plan=previewCoverageResolutions(db,[coverageResolutionRequest(row,ids,target,db)],{dispositions:p.dispositions}),after=find(comicCoverageForLibrary(plan.database),book);assert.equal(after.summary.full,row.summary.full);assert.equal(after.summary.provisional,row.summary.provisional);assert.deepEqual(after.observations[2],row.observations[2]);assert(plan.database.contentReviews[book.id].referenceOnly);assert.equal(JSON.stringify(db),before);
 }],
 ['confirmed bulk applies only compatible exact family observations and never creates a global run alias',()=>{
  const {books,db,projection}=make(),row=find(projection,books[0]),ids=row.observations.map(o=>o.id),{target,request}=requestFor(row,projection,db),related=compatibleResolutionCollections(row,ids,target,projection.dispositions,db);
  assert.deepEqual(related.map(r=>r.collection.id).sort(),books.slice(1,3).map(r=>r.id).sort());
  const targets=[request,...related.map(r=>coverageResolutionRequest(r.collection,r.ids,r.target,db))];assert.throws(()=>applyCoverageResolutions(db,{mergeStamp:'{}',targets}),/Confirm/);
  const next=applyCoverageResolutions(db,{confirmed:true,mergeStamp:'{}',targets}).database,p=comicCoverageForLibrary(next);assert.equal(p.groups.find(g=>g.series==='Teenage Mutant Ninja Turtles'&&g.run==='1984').covered,18);assert.equal(find(p,books[3]).summary.provisional,13);assert.equal(Object.keys(db.contentReviews).length,0);
  const unrelated=coverageBook('same-numbers','Collects Teenage Mutant Ninja Turtles #1-7',{title:'Unrelated Omnibus'});next.providerItems[unrelated.id]=unrelated;const extra=comicCoverageForLibrary(next);assert(extra.dispositions.find(r=>r.id===unrelated.id).observations.every(o=>o.resolved.run!=='1984'),'Single-user correction seeded global run inference');
  assert.throws(()=>applyCoverageResolutions(db,{confirmed:true,mergeStamp:'{}',targets:[request,coverageResolutionRequest(find(projection,books[3]),find(projection,books[3]).observations.map(o=>o.id),requestFor(find(projection,books[3]),projection,db).target,db)]}),/Bulk/);
 }],
 ['bulk preview excludes different accounts, publisher families, reviews, explicit conflicts and merge members',()=>{
  for(const variant of ['account','publisher','review','merge']){
   const {books,db}=make();if(variant==='account')books[1].profileId='other';if(variant==='publisher')books[1].metadata.enrichment.kindleProductComicContents.productDetailsEvidence.observations.find(o=>o.field==='publisher').value='Other';if(variant==='review')db.contentReviews[books[1].id]=confirmed([issue('8',{series:'Teenage Mutant Ninja Turtles',run:'1996'})]);
   const key=JSON.stringify(['teenage mutant ninja turtles','','issue','en']),other=JSON.stringify(['turtles legacy','','issue','en']),merges=variant==='merge'?{[key]:{members:[key,other],title:'User combined series'}}:{},p=comicCoverageForLibrary(db,merges),row=find(p,books[0]),ids=row.observations.map(o=>o.id),target=resolutionCandidates(row,p.dispositions,db,ids).find(t=>t.suggested),others=compatibleResolutionCollections(row,ids,target,p.dispositions,db);assert(!others.some(r=>r.collection.id===books[1].id),variant);
  }
 }],
 ['bulk also reuses explicit local publication evidence within a captured non-TMNT family',()=>{
  const anchor=coverageBook('anchor','Collects Alpha (2001) #1-6'),a=coverageBook('a','Collects Alpha #1-3'),b=coverageBook('b','Collects Alpha #4-6'),reset=coverageBook('reset','Collects Alpha (2011) #1-6');
  for(const book of [anchor,a,b])book.metadata.enrichment.kindleProductComicContents.productDetailsEvidence={observations:[{field:'publisher',status:'observed',value:'Example Comics'},{field:'series',status:'observed',value:'Part of: Alpha Collected Library'}]};
  const db=coverageDatabase(anchor,a,b,reset),p=comicCoverageForLibrary(db),row=find(p,a),ids=row.observations.map(o=>o.id),target=resolutionCandidates(row,p.dispositions,db,ids).find(t=>t.suggested&&t.run==='2001');assert(target?.referenceId.startsWith('local:'));assert(target.evidence.includes(anchor.title));assert.deepEqual(compatibleResolutionCollections(row,ids,target,p.dispositions,db).map(c=>c.collection.id),[b.id]);
 }],
 ['Raphael stays separate and can be explicitly resolved to its documented numbered publication',()=>{
  const {books,db,projection}=make(),row=find(projection,books[0]),ids=['reference:0'],target=resolutionCandidates(row,projection.dispositions,db,ids).find(t=>t.suggested);assert.equal(target.number,'1');assert.equal(target.series,'Raphael, Teenage Mutant Ninja Turtle');
  const plan=previewCoverageResolutions(db,[coverageResolutionRequest(row,ids,target,db)],{dispositions:projection.dispositions}),after=find(comicCoverageForLibrary(plan.database),books[0]);assert.equal(after.summary.parsed,8);assert.equal(after.summary.full,1);assert.equal(after.summary.provisional,7);assert(!after.references.some(r=>r.actionable));
 }],
 ['counted, partial, provisional, access-excluded and no-series observations explain the actual index decision',()=>{
  const full=coverageBook('full'),partial=coverageBook('partial','Collects material from Beta (2001) #1-2'),subscription=coverageBook('subscription','Collects Gamma (2001) #1-2',{ownership:'subscription'}),unknown=coverageBook('unknown','Collects Gamma (2001) #3',{ownership:'unknown'}),missing=coverageBook('missing','Collects issues #1-3.',{title:'Mixed Omnibus'}),db=coverageDatabase(full,partial,subscription,unknown,missing),idx=libraryCoverageIndex(db,{includeExcerpts:true});
  for(const row of idx.dispositions)for(const o of row.observations.filter(o=>o.parsed))assert.equal(o.indexed,Boolean([...idx.index.values()].flat().find(v=>v.item.id===row.id&&contentKey(v.entry)===contentKey(o.resolved)&&v.entry.completeness===o.extent)));
  assert.equal(find(idx,full).summary.full,3);assert.equal(find(idx,partial).summary.partial,2);assert.equal(find(idx,partial).summary.actionable,0);assert.equal(find(idx,subscription).summary.excluded,2);assert.equal(find(idx,subscription).summary.actionable,0);assert(find(idx,unknown).observations[0].reasons.some(r=>r.code==='access-unknown'));assert(find(idx,missing).references.some(r=>r.code==='enumeration-incomplete'));
 }],
 ['stale contents, changed merge preferences and unsupported selection reject before any persistence',()=>{
  const {books,db,projection}=make(),row=find(projection,books[0]),{request}=requestFor(row,projection,db),before=JSON.stringify(db);assert.throws(()=>applyCoverageResolutions(db,{confirmed:true,mergeStamp:'wrong',targets:[request]}),/merge preferences/);assert.throws(()=>previewCoverageResolutions(db,[{...request,expected:'old'}]),/Reload/);assert.throws(()=>previewCoverageResolutions(db,[{...request,observationIds:['contents:999']}]),/unavailable/);assert.equal(JSON.stringify(db),before);
 }],
 ['writer saves confirmed multi-book reviews atomically and preserves them through import and restore',async()=>{
  const fixture=make(),books=fixture.books,state={[DATABASE_STORAGE_KEY]:structuredClone(fixture.db)};let writes=0;
  const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async values=>{writes++;Object.assign(state,structuredClone(values));}});
  const db=await writer.getDatabase(),projection=comicCoverageForLibrary(db),row=find(projection,books[3]),{target,request}=requestFor(row,projection,db),related=compatibleResolutionCollections(row,row.observations.map(o=>o.id),target,projection.dispositions,db),targets=[request,...related.map(c=>coverageResolutionRequest(c.collection,c.ids,c.target,db))],initialWrites=writes;
  const saved=await writer.saveCoverageResolutions({confirmed:true,mergeStamp:'{}',targets});assert.equal(writes-initialWrites,1);assert.equal(find(comicCoverageForLibrary(saved),books[3]).summary.full,13);assert.equal(find(comicCoverageForLibrary(saved),books[4]).summary.full,13);
  const restored=parseBackup(createBackup(saved));assert.deepEqual(restored.contentReviews,saved.contentReviews);assert.deepEqual(saved.providerItems,db.providerItems);const current=writes;
  await assert.rejects(writer.saveCoverageResolutions({confirmed:true,mergeStamp:'{}',targets}),/Reload/);assert.equal(writes,current,'Stale batch wrote partial data');
  const record=saved.providerItems[books[3].id],imported=await writer.mergeProviderItems('kindle',[{providerItemId:record.providerItemId,title:record.title,mediaType:'book',ownership:record.ownership,metadata:{}}],{profileId:record.profileId});assert.deepEqual(imported.contentReviews,saved.contentReviews);assert.equal(find(comicCoverageForLibrary(imported),record).summary.full,13);
 }]
];
