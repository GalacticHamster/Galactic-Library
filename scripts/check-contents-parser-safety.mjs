// Offline integration check against a private in-memory copy; never writes the
// user's export, extension storage, or source evidence.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {loadCorpus,oldParser} from './contents-parser-corpus.mjs';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {proposeContents,ownedContentIndex} from '../src/lib/contents.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {parseBackup,createBackup} from '../src/lib/storage.js';
const [path,output]=process.argv.slice(2);if(!path||!output)throw Error('Usage: node scripts/check-contents-parser-safety.mjs BACKUP_JSON OUTPUT_JSON');
let requests=0;globalThis.fetch=()=>{requests++;throw Error('Network forbidden');};
const corpus=await loadCorpus(path),old=await oldParser();
const pilot=JSON.parse(await readFile(new URL('../docs/kindle-manifest-pilot-results.json',import.meta.url),'utf8'));
const metrics=JSON.parse(await readFile(new URL('../docs/kindle-manifest-pilot-metrics.json',import.meta.url),'utf8'));
const db=structuredClone(corpus.db);
for(const row of corpus.rows.filter(r=>r.sourceGeneration===4)){
 const m=metrics.rows.find(r=>r.sourceUrl===row.item.metadata.detailUrl),p=pilot.rows.find(r=>r.sourceUrl===row.item.metadata.detailUrl);
 Object.assign(db.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents,{statement:m.statement,extractorVersion:4,manifest:{...p.manifest,candidates:m.candidates,selected:m.selected,secondary:m.secondary}});
}
const stored={};let writes=0;
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async update=>{writes++;Object.assign(stored,structuredClone(update));}});
const start=performance.now();await writer.restoreDatabase(db);
// The real export has zero reviewed contents. Add a pre-existing verification
// to the isolated copy so review preservation is not merely a vacuous check.
const reviewed=corpus.rows[0].item;
await writer.saveContentReview(reviewed.id,{statement:'Previously verified source',entries:[{series:'Verified Test Series',run:'2020',unitType:'issue',number:'1',language:'en'}]});
const before=await writer.getDatabase(),writeStart=writes;
const queries=[...corpus.rows.slice(0,20).map(r=>({title:r.title,mediaType:'book'})),...['No Rest for the Wicked','Ghost Moon','Ex Machina Special #3','Batman #491'].map(title=>({title,mediaType:'book'}))];
const api=database=>queries.map(item=>handleExternalApiRequest(database,{type:'MATCH_ITEMS',apiVersion:1,items:[item]}));
const initialApi=api(before);
assert.ok(initialApi.every(result=>result.ok===true&&result.results.length===1),'Compare successful matching responses, not errors.');
for(let n=0;n<corpus.rows.length;n+=100){
 await writer.reparseKindleContents(corpus.rows.slice(n,n+100).map(r=>({itemId:r.item.id,recordRef:r.item.recordRef})));
 process.stderr.write(`Reparsed ${Math.min(n+100,corpus.rows.length)}/${corpus.rows.length}\n`);
}
const after=await writer.getDatabase();
assert.deepEqual(after.contentReviews,before.contentReviews);
assert.deepEqual(after.canonicalItems,before.canonicalItems);
assert.deepEqual(after.manualMatchDecisions,before.manualMatchDecisions);
assert.deepEqual(after.editionSeparations,before.editionSeparations);
assert.deepEqual(api(after),initialApi);
const coverage=database=>[...ownedContentIndex(database)].map(([key,matches])=>[key,matches.map(({item,entry,review})=>({itemId:item.id,entry,review}))]);
assert.deepEqual(coverage(after),coverage(before));
for(const id of Object.keys(before.providerItems)){
 const a=structuredClone(after.providerItems[id]),b=structuredClone(before.providerItems[id]);
 if(a.metadata.enrichment?.kindleProductComicContents){
  const x=a.metadata.enrichment.kindleProductComicContents,y=b.metadata.enrichment.kindleProductComicContents;
  for(const key of ['source','sourceUrl','statement','checkedAt','extractorVersion','manifest'])assert.deepEqual(x[key],y[key],id+' '+key);
  delete a.metadata.enrichment.kindleProductComicContents;delete b.metadata.enrichment.kindleProductComicContents;
  // Selecting enrichment already updates the record's audit timestamp. It is
  // not acquisition history or identity evidence; those remain compared.
  delete a.updatedAt;delete b.updatedAt;
 }
 assert.deepEqual(a,b,id+' ordinary identity/ownership metadata');
}
for(const row of corpus.rows)assert.deepEqual(proposeContents(row.input),old.module.proposeContents(row.input));
const restored=parseBackup(createBackup(after));
assert.deepEqual(restored.contentReviews,after.contentReviews);
for(const row of corpus.rows){
 const a=after.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents,b=restored.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents;
 for(const key of ['statement','checkedAt','extractorVersion','parseInput','parseBinding','manifest'])assert.deepEqual(a[key],b[key],row.title+' backup '+key);
}
assert.equal(requests,0);
const result={sourceHash:corpus.sourceHash,statements:corpus.rows.length,providerItems:Object.keys(before.providerItems).length,generation4:77,reparseWrites:writes-writeStart,networkRequests:requests,verifiedReviewChanges:0,ownershipChanges:0,ordinaryItemChanges:0,canonicalChanges:0,sourceChanges:0,ordinaryParserComparisons:corpus.rows.length,externalApiComparisons:queries.length,backupRoundTrip:true,existingSyntheticReviewPreserved:true};
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));console.error('Integration elapsed ms:',(performance.now()-start).toFixed(1));
