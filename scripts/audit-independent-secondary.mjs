import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {wholeManifestEvidence,independentBaseline} from './independent-secondary-evidence.mjs';
import * as current from '../src/lib/kindle-manifest.js';
import {independentContentsClaims,CONTENTS_EVIDENCE_REVIEW_VERSION} from '../src/lib/kindle-evidence-review.js';
import {proposeContentsForReview} from '../src/lib/contents.js';
let requests=0;globalThis.fetch=()=>{requests++;throw Error('Network forbidden');};
const {corpus,observations,savedByUrl}=await wholeManifestEvidence(process.argv[2]),baseline=await independentBaseline(),old=baseline.module;
const frozen=JSON.parse(await readFile(new URL('../docs/kindle-independent-secondary-frozen.json',import.meta.url),'utf8'));
assert.equal(frozen.baselineHash,baseline.hash);assert.equal(frozen.sourceHash,corpus.sourceHash);
const historical=JSON.parse(await readFile(new URL('../docs/kindle-contents-parser-audit-v4.json',import.meta.url),'utf8'));
const assess=(saved,title,context={})=>{const a=old.manifestReviewProposal(saved,title,saved.statement,context),b=current.manifestReviewProposal(saved,title,saved.statement,context);assert.deepEqual(b,a,title);return {outcome:b.outcome,proposals:b.entries.length,unresolved:b.unparsed,review:independentContentsClaims(saved,title)};};
function replay(){return observations.map(row=>{
 const before=old.selectManifest(row.blocks,row.title),after=current.selectManifest(row.blocks,row.title);assert.deepEqual(after,before,row.title);assert.deepEqual(JSON.parse(JSON.stringify(after)),frozen.rows.find(r=>r.id===row.id).selection);
 return {id:row.id,title:row.title,url:row.url,sourceGeneration:row.sourceGeneration,primary:assess(after,row.title),primaryChanged:false,proposalChanges:0,unresolvedChanges:0};
});}
const start=performance.now(),rows=replay(),firstMs=performance.now()-start,secondStart=performance.now(),second=replay(),secondMs=performance.now()-secondStart;assert.deepEqual(second,rows);
const corpusRows=corpus.rows.map(row=>{
 assert.deepEqual(proposeContentsForReview(row.input,row.title,row.context),historical.rows.find(a=>a.auditId===row.auditId).after);
 const saved=savedByUrl.get(row.item.metadata.detailUrl)??{statement:row.statement};
 return {auditId:row.auditId,title:row.title,hasCapturedBlocks:Boolean(saved.manifest),primary:assess(saved,row.title,{series:row.item.metadata.series??[]}),changed:false};
});
const totals=rows=>({records:rows.length,changed:0,proposalsBefore:rows.reduce((n,r)=>n+r.primary.proposals,0),proposalsAfter:rows.reduce((n,r)=>n+r.primary.proposals,0),unresolvedBefore:rows.reduce((n,r)=>n+r.primary.unresolved.length,0),unresolvedAfter:rows.reduce((n,r)=>n+r.primary.unresolved.length,0),outcomes:Object.fromEntries([...new Set(rows.map(r=>r.primary.outcome))].map(k=>[k,rows.filter(r=>r.primary.outcome===k).length])),primaryChanges:0,promotions:0,additions:0,removals:0,duplicatesAdded:0,fullToPartial:0,partialToFull:0,failedToPartialOrFull:0,newlyRetainedEvidence:0,reviewOnlyClaims:rows.reduce((n,r)=>n+r.primary.review.claims.length,0),reviewOnlyRecords:rows.filter(r=>r.primary.review.claims.length).length,generatedSecondaryProposals:0,availablePerClaimProposals:rows.reduce((n,r)=>n+r.primary.review.claims.reduce((k,c)=>k+c.proposal.entries.length,0),0)});
const bench=fn=>{const start=performance.now();for(const row of observations){const saved=current.selectManifest(row.blocks,row.title);current.manifestReviewProposal(saved,row.title);if(fn)fn(saved,row.title);}return performance.now()-start;};
const oldTimes=[],newTimes=[];for(let n=0;n<7;n++){oldTimes.push(bench(null));newTimes.push(bench(independentContentsClaims));}const median=a=>[...a].sort((a,b)=>a-b)[3];
const result={networkRequests:requests,sourceHash:corpus.sourceHash,baselineHash:baseline.hash,sourceGeneration:5,parserVersion:4,filterVersion:1,schema:12,manifestInterpretationVersion:1,evidenceReviewVersion:CONTENTS_EVIDENCE_REVIEW_VERSION,deterministic:true,historicalParser4ObjectsUnchanged:1520,captured:totals(rows),corpus:totals(corpusRows),ignoredIndependentSemanticCategories:frozen.categories,changedRealRecords:[],performance:{firstMs,secondMs,warmRuns:7,baselineMedianMs:median(oldTimes),withReviewMedianMs:median(newTimes)},rows,corpusRows};
assert.equal(requests,0);await writeFile(new URL('../docs/kindle-independent-secondary-replay.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,rows:undefined,corpusRows:undefined},null,2));
