import {readArtifact,writeArtifact} from './audit-artifacts.mjs';
// Entire exported database in private memory. No installed storage or network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCorpus,hash} from './contents-parser-corpus.mjs';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {ownedContentIndex} from '../src/lib/contents.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const corpus=await loadCorpus(process.argv[2]);
const ledger=JSON.parse(await readArtifact('kindle-source-capture-sample.json'));
const replay=JSON.parse(await readArtifact('kindle-source-capture-replay.json'));
const pilot=JSON.parse(await readArtifact('kindle-manifest-pilot-results.json'));
const metrics=JSON.parse(await readArtifact('kindle-manifest-pilot-metrics.json'));
let requests=0;globalThis.fetch=()=>{requests++;throw Error('Network forbidden');};
const db=structuredClone(corpus.db);
for(const row of corpus.rows.filter(r=>r.sourceGeneration===4)){
 const p=pilot.rows.find(p=>p.sourceUrl===row.item.metadata.detailUrl),m=metrics.rows.find(p=>p.sourceUrl===row.item.metadata.detailUrl);
 Object.assign(db.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents,{statement:m.statement,extractorVersion:4,manifest:{...p.manifest,candidates:m.candidates,selected:m.selected,secondary:m.secondary}});
}
const values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
await writer.restoreDatabase(db);
const reviewed=db.providerItems[ledger.rows[0].itemId];
await writer.saveContentReview(reviewed.id,{statement:'Previously verified source',entries:[{series:'Previously Verified',run:'',unitType:'issue',number:'1',language:''}]});
const before=await writer.getDatabase();
const queries=[...ledger.rows.map(r=>({title:r.title,mediaType:'book'})),...['Blood Charged','How the Marquis Got His Coat Back','No Rest for the Wicked','Namor #3'].map(title=>({title,mediaType:'book'}))];
const api=database=>queries.map(item=>handleExternalApiRequest(database,{type:'MATCH_ITEMS',apiVersion:1,items:[item]}));
const initialApi=api(before);assert(initialApi.every(r=>r.ok&&r.results.length===1));
const coverage=db=>[...ownedContentIndex(db)].map(([key,records])=>[key,records.map(({item,entry,review})=>({itemId:item.id,entry,review}))]);
const initialIndex=coverage(before);
await writer.saveKindleComicContents(ledger.rows.map(sample=>({itemId:sample.itemId,recordRef:before.providerItems[sample.itemId].recordRef,sourceUrl:sample.sourceUrl,extractorVersion:5,availability:'statement-found',descriptionBlocks:replay.rows.find(r=>r.auditId===sample.auditId).generation5Blocks})));
const after=await writer.getDatabase();
assert.deepEqual(after.canonicalItems,before.canonicalItems);assert.deepEqual(after.contentReviews,before.contentReviews);assert.deepEqual(after.ownershipReviews,before.ownershipReviews);assert.deepEqual(after.manualMatchDecisions,before.manualMatchDecisions);assert.deepEqual(after.editionSeparations,before.editionSeparations);assert.deepEqual(api(after),initialApi);assert.deepEqual(coverage(after),initialIndex);
const sampled=new Set(ledger.rows.map(r=>r.itemId));
for(const id of Object.keys(before.providerItems)){
 const a=structuredClone(after.providerItems[id]),b=structuredClone(before.providerItems[id]);
 if(sampled.has(id)){delete a.metadata.enrichment.kindleProductComicContents;delete b.metadata.enrichment.kindleProductComicContents;delete a.updatedAt;delete b.updatedAt;}
 assert.deepEqual(a,b,id+' identity/ownership/source outside authorized captures');
}
const restored=parseBackup(createBackup(after)),rows=[];
assert.deepEqual(restored.contentReviews,after.contentReviews);
for(const sample of ledger.rows){
 const prior=before.providerItems[sample.itemId].metadata.enrichment.kindleProductComicContents,saved=after.providerItems[sample.itemId].metadata.enrichment.kindleProductComicContents;
 assert.deepEqual(saved.manifest.blocks,replay.rows.find(r=>r.auditId===sample.auditId).generation5Blocks);
 assert.equal(saved.statement,saved.manifest.candidates[saved.manifest.selected].raw);
 assert.equal(saved.extractorVersion,5);assert.equal(saved.parserVersion,4);
 assert.deepEqual(restored.providerItems[sample.itemId].metadata.enrichment.kindleProductComicContents,saved);
 assert(Object.values(after.enrichmentHistory).some(h=>h.recordRef===before.providerItems[sample.itemId].recordRef&&JSON.stringify(h.previous)===JSON.stringify(prior)));
 rows.push({auditId:sample.auditId,title:sample.title,serialized:saved});
}
for(const [id,history] of Object.entries(before.enrichmentHistory))assert.deepEqual(after.enrichmentHistory[id],history);
assert.equal(requests,0);assert.equal(hash(await readFile(process.argv[2])),corpus.sourceHash);
const result={providerItems:Object.keys(before.providerItems).length,captures:25,parserVersion:4,extractorVersion:5,networkRequests:0,ownershipChanges:0,ordinaryItemChanges:0,canonicalChanges:0,verifiedReviewChanges:0,ordinaryApiComparisons:29,unverifiedOwnedIndexChanges:0,sourceChangesOutsideSample:0,priorSampleEvidenceRetainedInHistory:25,existingHistoryPreserved:true,backupRoundTrip:true,sourceFileUnchanged:true,syntheticVerifiedReviewPreserved:true,rows};
await writeArtifact('kindle-source-capture-safety.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,rows:undefined},null,2));
