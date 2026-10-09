import assert from 'node:assert/strict';
import {checkKindleCategoryCapture,breadcrumbFixtures} from './kindle-category-fixture.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateEnrichment} from '../src/lib/metadata-validation.js';
import {libraryBroadGenreValues} from '../src/lib/genre-hints.js';
import {matchItems} from '../src/lib/matcher.js';
// Minimal DOM-shaped adapter for sanitized fixtures; real DOMParser runs the
// same assertions in both disposable browser importer suites.
export function categoryDocument(html){
 const container=/<div id="wayfinding-breadcrumbs_feature_div">([\s\S]*?)<\/div>/u.exec(html)?.[1];
 const lists=container?[...container.matchAll(/<ul>([\s\S]*?)<\/ul>/gu)].map(list=>({children:[...list[1].matchAll(/<li>([\s\S]*?)<\/li>/gu)].map(li=>{const a=/<a href="([^"]+)">([^<]+)<\/a>/u.exec(li[1]);return {tagName:'LI',textContent:a?.[2]??'',querySelector:()=>a?{textContent:a[2],getAttribute:()=>a[1]}:null};})})):[];
 return {querySelector:()=>null,querySelectorAll:selector=>selector==='#wayfinding-breadcrumbs_feature_div'&&container?[{querySelectorAll:()=>lists}]:[]};
}
export const kindleCategoryTests=[['Kindle structured category paths are bounded, ordered, source-labelled and exclude navigation/deep facets',()=>checkKindleCategoryCapture(categoryDocument)],
 ['Normal Kindle acquisition extracts category paths from the same response without new requests or parser/version changes',async()=>{
   const oldFetch=globalThis.fetch,oldParser=globalThis.DOMParser,oldLocation=globalThis.location;let requests=0;
   try{
     globalThis.fetch=async()=>{requests++;return {ok:true,status:200,text:async()=>breadcrumbFixtures[0].html};};globalThis.DOMParser=class{parseFromString(html){return categoryDocument(html);}};globalThis.location={origin:'https://www.amazon.com'};
     const result=await globalThis.GalacticKindle.fetchKindleProductComicContents('https://www.amazon.com/dp/B000000001');
     assert.equal(requests,1);assert.equal(result.extractorVersion,5);assert.equal(result.statement,'');assert.equal(result.availability,'no-statement');assert.equal(result.categoryPaths[0].nodes[2].nodeId,'156104011');
   }finally{globalThis.fetch=oldFetch;globalThis.DOMParser=oldParser;globalThis.location=oldLocation;}
 }],['Category capture survives atomic contents save, full backup restore and provider sync while matching and parsing stay identical',async()=>{
   const stored={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async values=>Object.assign(stored,structuredClone(values))});
   const incoming={providerItemId:'B000000001',title:'A Collection',mediaType:'book',ownership:'owned',metadata:{originType:'Purchase',detailUrl:'https://www.amazon.com/dp/B000000001'}};
   let db=await writer.mergeProviderItems('kindle',[incoming]);const record=Object.values(db.providerItems)[0],beforeCanonical=JSON.stringify(db.canonicalItems),queries=[{mediaType:'book',title:record.title}],beforeMatching=matchItems(db.providerItems,queries);
   const entry={itemId:record.id,recordRef:record.recordRef,sourceUrl:incoming.metadata.detailUrl,descriptionBlocks:[],availability:'no-statement',extractorVersion:5};
   await writer.saveKindleComicContents([entry]);const original=(await writer.getDatabase()).providerItems[record.id].metadata.enrichment.kindleProductComicContents;
   const paths=globalThis.GalacticKindle.kindleCategoryPaths(categoryDocument(breadcrumbFixtures[3].html));await writer.saveKindleComicContents([{...entry,categoryPaths:paths}]);db=await writer.getDatabase();let saved=db.providerItems[record.id].metadata.enrichment.kindleProductComicContents;
   await assert.rejects(writer.saveKindleComicContents([{...entry,descriptionBlocks:undefined,statement:'',availability:'unavailable',categoryPaths:paths}]),/successfully retrieved product page/);
   for(const key of ['statement','availability','parseStatus','parseOutcome','parseInput','parserVersion','extractorVersion','quality'])assert.deepEqual(saved[key],original[key],key);
   assert.deepEqual(saved.categoryPaths,paths);assert.equal(JSON.stringify(db.canonicalItems),beforeCanonical);assert.deepEqual(matchItems(db.providerItems,queries),beforeMatching);assert.equal(db.providerItems[record.id].ownership,'owned');
   await writer.restoreDatabase(parseBackup(createBackup(db)));db=await writer.mergeProviderItems('kindle',[incoming]);saved=db.providerItems[record.id].metadata.enrichment.kindleProductComicContents;assert.deepEqual(saved.categoryPaths,paths);assert.deepEqual(libraryBroadGenreValues(db.providerItems[record.id]),['Comics & Graphic Novels']);
   await writer.saveKindleComicContents([entry]);saved=(await writer.getDatabase()).providerItems[record.id].metadata.enrichment.kindleProductComicContents;assert.deepEqual(saved.categoryPaths,paths,'Missing later breadcrumb must not delete retained categories');
   await writer.saveKindleComicContents([{...entry,descriptionBlocks:undefined,availability:'unavailable',statement:''}]);db=await writer.getDatabase();assert.deepEqual(db.providerItems[record.id].metadata.enrichment.kindleProductComicContents.categoryPaths,paths);
   assert.deepEqual(db.kindleContentsObservations[record.recordRef].latestAttempt.categoryPaths,paths);
   assert.deepEqual(db.kindleContentsObservations[record.recordRef].baseline.categoryPaths,undefined,'Existing source history must not be rewritten');
 }],['Backup rejects malformed or oversized optional category paths without broadening metadata acceptance',()=>{
   assert.throws(()=>validateEnrichment('kindleProductComicContents',{categoryPaths:[{selector:'#recommendations',nodes:[{label:'Comics',nodeId:'1'}]}]}));
   assert.throws(()=>validateEnrichment('kindleProductComicContents',{categoryPaths:Array(9).fill({})}));
   assert.throws(()=>validateEnrichment('kindleProductComicContents',{categoryPaths:[{selector:'#wayfinding-breadcrumbs_feature_div',nodes:[{label:'Comics',nodeId:'invalid'}]}]}));
 }]];
