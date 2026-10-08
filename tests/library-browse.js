import assert from 'node:assert/strict';
import {createLibraryBrowseProjection,libraryBrowseResults} from '../src/ui/library-browse.js';
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
   const db=database([record('one','Example',{enrichment:{kindleProductComicContents:{get manifest(){throw Error('Source parsing during retrieval');}}}})]),project=createLibraryBrowseProjection(),first=project(db);
   assert.equal(project(db),first);assert.deepEqual(libraryBrowseResults(first,{query:'Example'}).rows.map(row=>row.canonical.id),['one']);assert.notEqual(project({...db}),first);
 }]
];
export {record as browseRecord,database as browseDatabase};
