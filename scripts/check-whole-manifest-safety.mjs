// Full private database, source-only overlays; zero acquisition or user writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {wholeManifestEvidence} from './whole-manifest-evidence.mjs';
import {hash} from './contents-parser-corpus.mjs';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {ownedContentIndex} from '../src/lib/contents.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
let requests=0;globalThis.fetch=()=>{requests++;throw Error('Network forbidden');};
const {corpus,savedByUrl}=await wholeManifestEvidence(process.argv[2]),db=structuredClone(corpus.db);
for(const row of corpus.rows){const saved=savedByUrl.get(row.item.metadata.detailUrl);if(saved)db.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents={...db.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents,...saved};}
const values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async update=>Object.assign(values,structuredClone(update))});
await writer.restoreDatabase(db);
const king=corpus.rows.find(r=>r.auditId===790);
await writer.saveContentReview(king.item.id,{statement:'Previously verified source',entries:[{series:'Previously Verified',run:'',unitType:'issue',number:'1',language:''}]});
const before=await writer.getDatabase(),queries=[...corpus.rows.slice(0,25).map(r=>({title:r.title,mediaType:'book'})),...['King In Black: Namor #1','Blood Charged','No Rest for the Wicked','How the Marquis Got His Coat Back'].map(title=>({title,mediaType:'book'}))];
const api=db=>queries.map(item=>handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[item]})),originalApi=api(before);
assert(originalApi.every(r=>r.ok&&r.results.length===1));
const coverage=db=>[...ownedContentIndex(db)].map(([key,records])=>[key,records.map(({item,entry,review})=>({itemId:item.id,entry,review}))]),originalIndex=coverage(before),start=performance.now();
for(let n=0;n<corpus.rows.length;n+=100){await writer.reparseKindleContents(corpus.rows.slice(n,n+100).map(r=>({itemId:r.item.id,recordRef:r.item.recordRef})));process.stderr.write(`Reparsed ${Math.min(n+100,corpus.rows.length)}/1520\n`);}
const after=await writer.getDatabase();
for(const key of ['contentReviews','ownershipReviews','canonicalItems','manualMatchDecisions','editionSeparations'])assert.deepEqual(after[key],before[key],key);
assert.deepEqual(api(after),originalApi);assert.deepEqual(coverage(after),originalIndex);
for(const id of Object.keys(before.providerItems)){
 const a=structuredClone(after.providerItems[id]),b=structuredClone(before.providerItems[id]);
 if(a.metadata.enrichment?.kindleProductComicContents){const x=a.metadata.enrichment.kindleProductComicContents,y=b.metadata.enrichment.kindleProductComicContents;
  for(const key of ['source','sourceUrl','statement','checkedAt','extractorVersion','manifest'])assert.deepEqual(x[key],y[key],id+' '+key);
  delete a.metadata.enrichment.kindleProductComicContents;delete b.metadata.enrichment.kindleProductComicContents;delete a.updatedAt;delete b.updatedAt;
 }
 assert.deepEqual(a,b,id+' identity/ownership');
}
for(const [id,history] of Object.entries(before.enrichmentHistory))assert.deepEqual(after.enrichmentHistory[id],history,'Existing history '+id);
const restored=parseBackup(createBackup(after));assert.deepEqual(restored.contentReviews,after.contentReviews);
for(const row of corpus.rows)assert.deepEqual(restored.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents,after.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents,row.title+' backup');
assert.equal(after.providerItems[king.item.id].metadata.enrichment.kindleProductComicContents.statement,'King In Black: Namor #1-5');
assert.equal(after.providerItems[king.item.id].metadata.enrichment.kindleProductComicContents.parseOutcome,'partial');
assert.equal(requests,0);assert.equal(hash(await readFile(process.argv[2])),corpus.sourceHash);
const result={sourceHash:corpus.sourceHash,networkRequests:0,providerItems:Object.keys(before.providerItems).length,reparsed:1520,ownershipChanges:0,ordinaryMetadataChanges:0,canonicalChanges:0,manualDecisionChanges:0,verifiedReviewChanges:0,ordinaryApiComparisons:29,ownedIndexChanges:0,sourceEvidenceChanges:0,oldHistoryPreserved:true,syntheticVerifiedReviewPreserved:true,gen5BackupRoundTrip:true,kingOriginalSelectedSourcePreserved:true,kingNewOutcome:'partial',elapsedMs:performance.now()-start};
await writeFile(new URL('../docs/kindle-whole-manifest-safety.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
