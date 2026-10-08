import assert from 'node:assert/strict';
import {createLibraryBrowseProjection,libraryBrowseResults} from '../src/ui/library-browse.js';
import {validateUiPreferences} from '../src/lib/ui-preferences.js';
import {resultProviderSummary} from '../src/ui/library-result.js';
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
 ['Cached browsing reevaluates access expiry even when the committed record and projection are unchanged',()=>{
   const db=database([record('temporary','Loan',{}, {ownership:'borrowed'})]);db.ownershipReviews={temporary:{ownership:'borrowed',expiresAt:'2026-10-08'}};
   const original=Date.now,project=createLibraryBrowseProjection()(db);try{Date.now=()=>Date.parse('2026-10-07');assert.equal(libraryBrowseResults(project,{filters:{ownership:'borrowed'}}).total,1);Date.now=()=>Date.parse('2026-10-09');assert.equal(libraryBrowseResults(project,{filters:{ownership:'borrowed'}}).total,0);assert.equal(libraryBrowseResults(project,{filters:{ownership:'unknown'}}).total,1);}finally{Date.now=original;}
 }],
 ['Linked DLC searches and counts preserve account boundaries and parent metadata filtering',()=>{
   const db=database([record('parent','Base Game',{series:['Saved game series']},{provider:'steam',providerItemId:'1',mediaType:'game'}),record('dlc','Extra Story',{parentProviderItemId:'1'},{provider:'steam',mediaType:'game-addon'}),record('other','Unrelated Extra',{parentProviderItemId:'1'},{provider:'steam',profileId:'family',mediaType:'game-addon'})]);delete db.canonicalItems.dlc;delete db.canonicalItems.other;
   const project=createLibraryBrowseProjection()(db);assert.deepEqual(libraryBrowseResults(project,{query:'Extra Story',filters:{provider:'steam',account:'personal',series:'Saved game series',dlc:'with'}}).rows.map(row=>row.canonical.id),['parent']);assert.equal(project.linkedAddOnIds.has('other'),false);assert.equal(libraryBrowseResults(project,{query:'Unrelated Extra'}).total,0);
 }],
 ['All stored series editions stay distinct during retrieval rather than becoming new canonical groups',()=>{
   const db=database([record('first','Same Series Volume 2',{series:['Same Series'],volume:'2',edition:'First'}),record('second','Same Series Volume 2 Revised',{series:['Same Series'],volume:'2',edition:'Revised'})]);assert.deepEqual(results(db,'',{filters:{series:'Same Series'},sort:'series'}),['first','second']);assert.equal(Object.keys(db.canonicalItems).length,2);
 }],
 ['A 14,081-record / 13,175-canonical browse projection stays bounded, reusable and source-parser independent',()=>{
   const records=Array.from({length:14081},(_,n)=>{const group=n%13175;return record(String(n),'Catalog '+group,{authors:['Writer '+group%20],series:['Series '+group%30],volume:String(group),unitType:'volume',enrichment:{kindleProductComicContents:{statement:'Collects Example #1-2',manifest:{candidates:[],get blocks(){throw Error('Browsing interpreted source');}}}}});});const db=database(records);db.canonicalItems={};for(const value of records){const group=Number(value.id)%13175,item=db.canonicalItems[group]??{id:String(group),title:value.title,mediaType:'book',providerItemIds:[]};item.providerItemIds.push(value.id);db.canonicalItems[group]=item;}
   const project=createLibraryBrowseProjection(),view=project(db);assert.equal(view.rows.length,13175);for(const sort of ['title-asc','title-desc','creator','series','added','updated']){const result=libraryBrowseResults(view,{sort,page:1});assert.equal(result.rows.length,50);assert.equal(result.total,13175);}
   assert.equal(project(db),view);assert.equal(libraryBrowseResults(view,{query:'Catalog 13174'}).rows[0].canonical.id,'13174');
 }],
 ['Result provider summaries count accounts rather than duplicating canonical results or purchase observations',()=>{
   assert.equal(resultProviderSummary([{record:{provider:'kindle',profileId:'a'}},{record:{provider:'kindle',profileId:'a'}},{record:{provider:'kindle',profileId:'b'}},{record:{provider:'kobo',profileId:'c'}}]),'Kindle (2 accounts) · Kobo');
 }],
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
