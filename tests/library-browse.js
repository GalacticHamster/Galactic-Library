import assert from 'node:assert/strict';
import {createLibraryBrowseProjection,libraryBrowseResults} from '../src/ui/library-browse.js';
import {validateUiPreferences} from '../src/lib/ui-preferences.js';
const record=(id,title,metadata={},extra={})=>({id,recordRef:id,provider:'kobo',profileId:'personal',providerItemId:id,title,mediaType:'book',ownership:'owned',metadata,...extra});
const database=records=>({providerItems:Object.fromEntries(records.map(record=>[record.id,record])),canonicalItems:Object.fromEntries(records.map(record=>[record.id,{id:record.id,title:record.title,mediaType:record.mediaType,providerItemIds:[record.id]}])),providerProfiles:{personal:{nickname:'Personal'}},titleAliases:{},readingStates:{},contentReviews:{},enrichmentReviews:{}});
const results=(db,query,options={})=>libraryBrowseResults(createLibraryBrowseProjection()(db),{query,...options}).matches.map(row=>row.canonical.id);
export const libraryBrowseTests=[
 ['Library retrieval searches titles, aliases, creators, series, units and identifiers without changing identity',()=>{
   const db=database([record('one','A Hidden Book',{authors:['Jane Writer'],series:['Night Stories'],volume:'10',isbn:'9780306406157'})]);db.titleAliases.one={titles:['Secret translation']};const before=JSON.stringify(db);
   for(const query of ['hidden','secret translation','Jane Writer','Night Stories','volume 10','978-0-306-40615-7','Kobo Personal'])assert.deepEqual(results(db,query),['one'],query);
   assert.deepEqual(results(db,'unrelated'),[]);assert.equal(JSON.stringify(db),before);
 }],
 ['Exact and strong titles rank ahead of incidental provider/account metadata; search terms combine rather than broaden',()=>{
   const db=database([record('metadata','A Different Book',{authors:['Astro City']}),record('prefix','Astro City Book Two'),record('exact','Astro City')]);db.providerProfiles.personal.nickname='Astro City';
   assert.deepEqual(results(db,'Astro City'),['exact','prefix','metadata']);assert.deepEqual(results(db,'Astro City missing'),[]);
 }],
 ['Browse projection reuses an unchanged snapshot and rebuilds after changes without parsing sources',()=>{
   const db=database([record('one','Example',{enrichment:{kindleProductComicContents:{manifest:{candidates:[],get blocks(){throw Error('Source parsing during retrieval');}}}}})]),project=createLibraryBrowseProjection(),first=project(db);
   assert.equal(project(db),first);assert.deepEqual(libraryBrowseResults(first,{query:'Example'}).rows.map(row=>row.canonical.id),['one']);assert.notEqual(project({...db}),first);
 }]
];
export {record as browseRecord,database as browseDatabase};
libraryBrowseTests.push(
 ['Combined canonical filters qualify one record, never different account/access observations',()=>{
   const a=record('a','Shared',{authors:['Writer'],series:['One']},{provider:'kindle',ownership:'owned'}),b=record('b','Shared',{authors:['Writer'],series:['Two']},{provider:'kindle',profileId:'family',ownership:'borrowed'}),db=database([a,b]);db.canonicalItems={shared:{id:'shared',title:'Shared',mediaType:'book',providerItemIds:['a','b']}};
   assert.deepEqual(results(db,'',{filters:{provider:'kindle',account:'personal',ownership:'borrowed'}}),[]);assert.deepEqual(results(db,'',{filters:{provider:'kindle',account:'family',ownership:'borrowed',series:'Two'}}),['shared']);assert.deepEqual(results(db,'',{filters:{account:'family',series:'One'}}),[]);
   const match=libraryBrowseResults(createLibraryBrowseProjection()(db),{filters:{account:'family'}}).rows[0];assert.equal(match.records.length,2);assert.equal(match.qualifying.length,1);assert.equal(match.qualifying[0].record.id,'b');
 }],
 ['Reading separates explicit unread from untracked and excludes non-reading media',()=>{
   const db=database([record('unknown','Untracked'),record('unread','Unread'),record('done','Done'),record('game','Game',{}, {mediaType:'game'})]);db.readingStates={unread:{status:'unread'},done:{status:'completed'}};
   assert.deepEqual(results(db,'',{filters:{reading:'not-saved'}}),['unknown']);assert.deepEqual(results(db,'',{filters:{reading:'unread'}}),['unread']);assert.deepEqual(results(db,'',{filters:{reading:'completed'}}),['done']);
 }],
 ['Series sorting uses stored numeric units and creators/dates put absent values last with deterministic fallbacks',()=>{
   const db=database([record('ten','A Vol 10',{series:['Series'],volume:'10',unitType:'volume',authors:['Zed']}),record('two','Z Vol 2',{series:['Series'],volume:'2',unitType:'volume',authors:['Amy']},{acquiredAt:'2026-01-01',updatedAt:'2026-09-02'}),record('missing','No facts',{}, {updatedAt:'2026-09-03'})]);
   assert.deepEqual(results(db,'',{sort:'series'}),['two','ten','missing']);assert.deepEqual(results(db,'',{sort:'creator'}),['two','ten','missing']);assert.deepEqual(results(db,'',{sort:'added'}),['two','ten','missing']);assert.deepEqual(results(db,'',{sort:'updated'}),['missing','two','ten']);assert.deepEqual(results(db,'',{sort:'title-desc'}),['two','missing','ten']);
 }],
 ['Information filters use stored book gaps and reviews without interpreting source or inferring absent reading',()=>{
   const db=database([record('missing','Missing'),record('known','Known',{authors:['Writer'],isbn:'9780306406157'}),record('video','Video',{}, {mediaType:'movie'})]);db.enrichmentReviews={review:{recordRefs:['known']}};
   assert.deepEqual(results(db,'',{filters:{information:'missing'}}),['missing']);assert.deepEqual(results(db,'',{filters:{information:'review'}}),['known']);
 }],
 ['Search, filters, selected sorting and pagination operate on the same result set',()=>{
   const db=database(Array.from({length:65},(_,n)=>record(String(n),'Book '+n,{series:['Series']}))),projection=createLibraryBrowseProjection()(db);const result=libraryBrowseResults(projection,{query:'Book',filters:{series:'Series'},sort:'title-desc',page:1});assert.equal(result.total,65);assert.equal(result.rows.length,15);assert.equal(result.rows[0].canonical.id,'14');assert.equal(libraryBrowseResults(projection,{filters:{series:'Absent'},page:99}).page,0);
 }],
 ['Extended private browse preferences accept old views and reject unsupported sorts and reading states',()=>{
   assert.equal(validateUiPreferences({library:{search:'Example',page:2}}).library.sort,'title-asc');const view={sort:'series',account:'family',reading:'not-saved',series:'Long series',information:'review'};assert.deepEqual(Object.fromEntries(Object.keys(view).map(key=>[key,validateUiPreferences({library:view}).library[key]])),view);assert.throws(()=>validateUiPreferences({library:{sort:'magic'}}));assert.throws(()=>validateUiPreferences({library:{reading:'assumed-unread'}}));
 }]
);
