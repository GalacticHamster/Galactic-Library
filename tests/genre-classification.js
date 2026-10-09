import assert from 'node:assert/strict';
import {libraryBroadGenreValues as genres,libraryCategoryEvidence,isConfirmedComicManga} from '../src/lib/genre-hints.js';
import {normalizeProviderItem,createEmptyDatabase,rebuildCanonicalItems,validateDatabase} from '../src/lib/models.js';
import {createLibraryBrowseProjection,libraryBrowseResults} from '../src/ui/library-browse.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {matchItems} from '../src/lib/matcher.js';
export const COMICS='Comics & Graphic Novels';
export const classificationFixture=(id,title,metadata={},extra={})=>({provider:'kindle',providerItemId:id,title,mediaType:'book',ownership:'owned',metadata,...extra});
const google=categories=>({enrichment:{googleBooks:{categories}}});
const open=subjects=>({enrichment:{openLibrary:{subjects}}});
export const classificationFixtures=[
 ['stored-google','Computing',google(['Computers']),['Technology & Computing']],
 ['stored-open','Future',open(['Science fiction']),['Science Fiction & Fantasy']],
 ['multiple','A Mystery',google(['Fiction','Mystery','Horror']),['Mystery & Thriller','Horror','Fiction & Literature']],
 ['batman-provider','Batman Story',{originType:'Comixology'},[COMICS]],
 ['batman-context','Batman Story',{sourceBundle:'Humble Comics Bundle'},[COMICS],{provider:'humble'}],
 ['batman-pattern','Batman Vol. 2',{},[COMICS]],
 ['batman-uncertain','Batman: Unknown',{},[]],
 ['batman-prose','Batman: A Novel',{sourceBundle:'Comics Bundle'},[],{provider:'humble'}],
 ['batman-art','The Art of Batman',{publisher:'DC Comics',sourceBundle:'Comics Bundle'},[],{provider:'humble'}],
 ['spider-comic','Spider-Man #25',{},[COMICS]],
 ['spider-reference','Spider-Man Encyclopedia',{publisher:'Marvel'},[]],
 ['tmnt','TMNT: The Last Ronin Omnibus',{},[COMICS]],
 ['indie','An Unknown Story',google(['Comics & Graphic Novels']),[COMICS]],
 ['mystery','A Fiction Novel',open(['Mystery']),['Mystery & Thriller']],
 ['horror-comic','Something Is Killing the Children',google(['Comics & Graphic Novels / Horror']),[COMICS,'Horror']],
 ['contradictory','Batman Vol. 1',google(['Reference']),['Education & Reference']],
 ['manual','Batman Vol. 1',{publisher:'DC',enrichment:{localMetadata:{source:'epub',approved:true,categories:['Prose fiction']}}},['Fiction & Literature']],
 ['humble-programming','A Programming Book',{sourceBundle:'Programming Book Bundle'},['Technology & Computing'],{provider:'humble'}],
 ['humble-scifi','Stars',{sourceBundle:'Science Fiction Book Bundle'},['Science Fiction & Fantasy'],{provider:'humble'}],
 ['humble-mixed','Comics History: A Reference Guide',{sourceBundle:'Comics Book Bundle'},[],{provider:'humble'}],
 ['fan-comic','A Story',{bundleTitle:'Manga & Comics Bundle'},[COMICS],{provider:'fanatical'}],
 ['fiction-nonfiction','Topics',google(['Fiction','Nonfiction','History']),['History','Fiction & Literature','Nonfiction']],
 ['new-science','Physics',open(['Physics']),['Science']],
 ['unknown-source','A Book',open(['Unmapped preserved subject']),[]],
 ['game','Batman #2',{originType:'Comixology' },[],{mediaType:'game'}],
 ['software','Marvel Omnibus Software',{bundleTitle:'Comics Bundle'},[],{provider:'fanatical',mediaType:'software'}],
 ['ordinary-novel','Ordinary Novel Vol. 2',{},[]],
 ['ambiguous-myth','Thor Vol. 2',{publisher:'University Press'},[]],
 ['noncomic-subject','Batman Vol. 2',open(['Novels']),[]],
 ['comic-with-fiction','Batman Vol. 2',google(['Fiction']),[COMICS,'Fiction & Literature']],
 ['comic-history-subject','A Scholarly Book',open(['Comics history']),['History']],
 ['publisher-only','An Unknown Book',{publisher:'Image Comics'},[]],
 ['publisher-structure','A New Collection Vol. 1',{publisher:'Image Comics'},[COMICS]],
 ['catalogue-character','A Book',open(['Batman']),[]],
 ['explicit-title','An Indie Graphic Novel',{},[COMICS]],
 ['catalogue-conflict','A Book',google(['Graphic Novels','Reference']),[COMICS,'Education & Reference']]
];
export const classificationRecords=()=>classificationFixtures.map(([id,title,metadata,,extra])=>normalizeProviderItem(classificationFixture(id,title,metadata,extra),'2026-10-08'));
export const genreClassificationTests=classificationFixtures.map(([id,title,metadata,expected,extra])=>['Classification: '+id,()=>assert.deepEqual(genres(normalizeProviderItem(classificationFixture(id,title,metadata,extra))),expected)]);
genreClassificationTests.push(['Classification projection preserves exact matching, canonical, ownership and original metadata',()=>{
 const records=classificationRecords(),db=createEmptyDatabase();db.providerItems=Object.fromEntries(records.map(r=>[r.id,r]));db.canonicalItems=rebuildCanonicalItems(db.providerItems);
 const before=JSON.stringify(db),queries=records.map(r=>({mediaType:r.mediaType,title:r.title})),matches=matchItems(db.providerItems,queries),canonical=JSON.stringify(db.canonicalItems),ownership=records.map(r=>r.ownership);
 const project=createLibraryBrowseProjection(),projection=project(db);for(const genre of projection.genreOptions)libraryBrowseResults(projection,{filters:{genre}});assert.equal(project(db),projection);
 assert.equal(JSON.stringify(db),before);assert.deepEqual(matchItems(db.providerItems,queries),matches);assert.equal(JSON.stringify(db.canonicalItems),canonical);assert.deepEqual(records.map(r=>r.ownership),ownership);
 const restored=validateDatabase(JSON.parse(before));assert.deepEqual(Object.values(restored.providerItems).map(genres),records.map(genres));
 assert.deepEqual(restored.providerItems['kindle:unknown-source'].metadata.enrichment.openLibrary.subjects,['Unmapped preserved subject']);
 assert.equal(isConfirmedComicManga(records.find(r=>r.providerItemId==='batman-pattern')),false,'Classification must not expand scan priority');
}],['Genre facets cover all pages and compose with the same provider/account/access record',()=>{
 const db=createEmptyDatabase();const records=Array.from({length:65},(_,i)=>normalizeProviderItem(classificationFixture('page'+i,'Book '+i,{enrichment:{googleBooks:{categories:[i===64?'Horror':'Computers']}}})));
 db.providerItems=Object.fromEntries(records.map(r=>[r.id,r]));db.canonicalItems=rebuildCanonicalItems(db.providerItems);const project=createLibraryBrowseProjection()(db);
 assert(project.genreOptions.includes('Horror'));assert.equal(libraryBrowseResults(project,{size:50}).rows.length,50);
 assert.equal(libraryBrowseResults(project,{query:'Book 64',filters:{genre:'Horror',provider:'kindle',ownership:'owned'},page:9}).total,1);
 assert.equal(libraryBrowseResults(project,{filters:{genre:'Horror',provider:'humble'}}).total,0);
 assert.equal(libraryBrowseResults(project,{filters:{genre:'Horror',account:'other'}}).total,0);
}],['Conflicting and manual classification provenance stays inspectable without overwriting source categories',()=>{
 const records=classificationRecords();assert(libraryCategoryEvidence(records.find(r=>r.providerItemId==='catalogue-conflict')).some(e=>e.conflict));
 const manual=normalizeProviderItem(classificationFixture('m','Batman Vol. 1',{enrichment:{googleBooks:{categories:['Graphic Novels']},localMetadata:{source:'epub',approved:true,categories:['Prose fiction']}}}));
 assert(!genres(manual).includes(COMICS));assert.deepEqual(manual.metadata.enrichment.googleBooks.categories,['Graphic Novels']);assert(libraryCategoryEvidence(manual).some(e=>e.conflict));
}]);

genreClassificationTests.push(['Saved catalogue categories survive schema/profile migration, restore, quick sync and trusted separation from importer data',async()=>{
 const stored={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async values=>Object.assign(stored,structuredClone(values))});
 const incoming=classificationFixture('B000000002','Computing Book',{originType:'Purchase'});let db=await writer.mergeProviderItems('kindle',[incoming]);const record=Object.values(db.providerItems)[0];
 await writer.saveGoogleBooksEnrichments([{itemIds:[record.id],recordRefs:[record.recordRef],enrichment:{source:'google-books',volumeId:'synthetic',title:record.title,categories:['Computers','Nonfiction']}}]);
 await writer.saveOpenLibraryEnrichment([record.id],{source:'open-library',workKey:'/works/OL123W',title:record.title,subjects:['Science fiction']},[record.recordRef]);
 db=await writer.getDatabase();const legacy=structuredClone(db);legacy.schemaVersion=1;delete legacy.providerProfiles;delete legacy.legacyProfileNamespaces;
 const migrated=validateDatabase(legacy);assert.deepEqual(Object.values(migrated.providerItems)[0].metadata.enrichment.googleBooks.categories,['Computers','Nonfiction']);
 await writer.restoreDatabase(parseBackup(createBackup(db)));db=await writer.mergeProviderItems('kindle',[{...incoming,metadata:{originType:'Purchase',enrichment:{googleBooks:{source:'google-books',categories:['Horror']}}}}]);
 const saved=db.providerItems[record.id];assert.deepEqual(saved.metadata.enrichment.googleBooks.categories,['Computers','Nonfiction']);assert.deepEqual(saved.metadata.enrichment.openLibrary.subjects,['Science fiction']);
 assert(libraryBrowseResults(createLibraryBrowseProjection()(db),{filters:{genre:'Technology & Computing'}}).total===1);
}]);
