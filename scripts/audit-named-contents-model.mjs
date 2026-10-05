import {checkParentScopedComponents} from '../tests/parent-scoped-components-fixture.js';
import {frozenIndependentEvidence} from './freeze-independent-secondary.mjs';
import {historicalParser4} from './contents-parser-corpus.mjs';
import {writeArtifact} from './audit-artifacts.mjs';
// Offline representation audit, deliberately NOT a new parser or production test.
// The former unsafe counterexamples now assert the parent-scoped contract.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {wholeManifestEvidence} from './whole-manifest-evidence.mjs';
import {hash} from './contents-parser-corpus.mjs';
import {proposeContentsForReview, validateContents, validateContentReview, contentKey, contentCoverage, parentContentCoverage, ownedContentIndex, seriesCoverage} from '../src/lib/contents.js';
import {selectManifest, manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {independentContentsClaims} from '../src/lib/kindle-evidence-review.js';
import {createEmptyDatabase, normalizeProviderItem, validateDatabase} from '../src/lib/models.js';
import {createBackup, parseBackup} from '../src/lib/storage.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
let requests=0;
globalThis.fetch=()=>{requests++;throw Error('Network acquisition forbidden in named-model audit');};
const {corpus,observations,savedByUrl}=await wholeManifestEvidence(process.argv[2]);
const frozenPrior=await frozenIndependentEvidence(process.argv[2]);
const historical=await historicalParser4(corpus);
const totals=rows=>({records:rows.length,proposals:rows.reduce((n,r)=>n+r.proposal.entries.length,0),unresolved:rows.reduce((n,r)=>n+r.proposal.unparsed.length,0),outcomes:Object.fromEntries(['full','partial','failed','filtered','uncertain'].map(k=>[k,rows.filter(r=>r.proposal.outcome===k).length]))});
function replay(){
 const saved=corpus.rows.map(row=>{
  assert.deepEqual(proposeContentsForReview(row.input,row.title,row.context),historical.rows.find(r=>r.auditId===row.auditId).after,'historical parser 4: '+row.title);
  const source=savedByUrl.get(row.item.metadata.detailUrl)??{statement:row.statement};
  return {auditId:row.auditId,title:row.title,providerId:row.item.id,url:row.item.metadata.detailUrl,statement:source.statement,hasCapturedBlocks:Boolean(source.manifest),proposal:manifestReviewProposal(source,row.title,source.statement,{series:row.item.metadata.series??[]}),independent:independentContentsClaims(source,row.title)};
 });
 const captured=observations.map(row=>{
  const source=selectManifest(row.blocks,row.title);
  assert.deepEqual(JSON.parse(JSON.stringify(source)),frozenPrior.rows.find(r=>r.id===row.id).selection,row.id+' selection');
  return {...row,saved:undefined,source,proposal:manifestReviewProposal(source,row.title),independent:independentContentsClaims(source,row.title)};
 });
 return {saved,captured};
}
const start=performance.now(),first=replay(),firstMs=performance.now()-start,secondStart=performance.now(),second=replay(),secondMs=performance.now()-secondStart;
assert.deepEqual(second,first,'Complete proposal and source objects, twice');
assert.deepEqual(totals(first.saved),{records:1520,proposals:12172,unresolved:928,outcomes:{full:769,partial:191,failed:217,filtered:245,uncertain:98}});
// Broad audit tags are intentionally inclusive. No tag is production eligibility.
function tags(text){
 const out=[];
 if(/\b(?:contains?|containing|collects?|collecting|includes?|including|reprints?|reprinting|comprises?|comprising)\b/iu.test(text))out.push('semantic-trigger');
 if(/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:full[- ]length|complete|classic|short)\s+)*(?:novels?|stories|tales|works|books)\b/iu.test(text))out.push('count-type');
 if(/[,;]|\band\b/iu.test(text)&&!/#\s*\d/iu.test(text))out.push('non-hash-list-or-conjunction');
 if(/["“][^"”]+["”]/u.test(text))out.push('quoted');
 if(/\bfrom\b/iu.test(text))out.push('attribution-or-extent');
 if(/#\s*\d/iu.test(text)&&/[,;]|\band\b/iu.test(text))out.push('mixed-numbered-review');
 if(/\b(?:original script|sketchbook|sketches|cover gallery|essays?|introductions?|forewords?|afterwords?|appendix|bibliography)\b/iu.test(text))out.push('apparatus-review');
 if(/\b(?:special offer|download today|free|subscribers|fans|bestselling)\b/iu.test(text))out.push('promotion-review');
 if(/Read more\s*$/iu.test(text))out.push('terminal-read-more');
 if(/\n/u.test(text))out.push('preserved-lines');
 if(/\bclassic tales\b/iu.test(text))out.push('unmapped-named-numbered-overlap');
 return out;
}
const population=first.saved.flatMap(row=>{
 const labels=tags(row.statement);
 if(!labels.some(t=>['count-type','non-hash-list-or-conjunction','quoted','apparatus-review','unmapped-named-numbered-overlap'].includes(t))&&!row.proposal.entries.some(e=>e.unitType==='component')&&!row.independent.claims.length)return [];
 return [{...row,tags:labels,identityDecision:'Current component contract lacks enforceable parent scope; no new grammar.'}];
});
const capturedPopulation=first.captured.flatMap(row=>{
 const candidates=row.source.manifest.candidates.map((c,index)=>({...c,index,tags:tags(c.raw)})).filter(c=>c.tags.some(t=>['count-type','non-hash-list-or-conjunction','quoted','apparatus-review','unmapped-named-numbered-overlap'].includes(t)));
 return candidates.length?[{id:row.id,title:row.title,url:row.url,sourceGeneration:row.sourceGeneration,blocks:row.blocks,candidates,selected:row.source.manifest.selected,proposal:row.proposal,independent:row.independent}]:[];
});
const entry=(series='Collection A',number='Alpha',patch={})=>({series,run:'',unitType:'component',number,language:'',completeness:'full',...patch});
const a=normalizeProviderItem({provider:'kindle',providerItemId:'B000000001',recordRef:'00000000-0000-4000-8000-000000000001',title:'Collection A',mediaType:'book',ownership:'owned'},'2026-10-05T00:00:00.000Z');
const b=normalizeProviderItem({provider:'kindle',providerItemId:'B000000002',recordRef:'00000000-0000-4000-8000-000000000002',title:'Collection A',mediaType:'book',ownership:'unknown'},'2026-10-05T00:00:00.000Z');
const c=normalizeProviderItem({provider:'humble',providerItemId:'different-title',recordRef:'00000000-0000-4000-8000-000000000003',title:'Collection B',mediaType:'book',ownership:'unknown'},'2026-10-05T00:00:00.000Z');
const review=entries=>validateContentReview({entries,statement:'Contains Alpha.',sourceUrl:'https://example.test/collection-a',source:'manual-review',verifiedAt:'2026-10-05T00:00:00.000Z'});
const db=createEmptyDatabase();db.providerItems=Object.fromEntries([a,b,c].map(i=>[i.id,i]));
const api=(database,items)=>handleExternalApiRequest(database,{type:'MATCH_ITEMS',apiVersion:1,items});
const withoutReview=api(db,[{title:'Alpha',mediaType:'book'}]);
assert.equal(ownedContentIndex(db).size,0);
db.contentReviews[a.id]=review([entry()]);
const bareApi=api(db,[{title:'Alpha',mediaType:'book'}]);
assert.deepEqual(bareApi,withoutReview);
const differentCollection=contentCoverage(db,[entry('Collection B')]);
assert.equal(differentCollection.owned,0);
const sameDisplay=parentContentCoverage(db,a.id,[entry()]);
assert.equal(sameDisplay.owned,1);assert.equal(sameDisplay.complete,false);
const incompleteApi=api(db,[{title:'Unrelated offered collection',mediaType:'book',contents:[entry()],contentsComplete:true}]);
assert.equal(incompleteApi.results[0].owned,false);assert.equal(incompleteApi.results[0].partialMatches.length,0);assert.equal(incompleteApi.results[0].possibleMatches.length,1);
db.contentReviews[b.id]=review([entry()]);
const merged=[...ownedContentIndex(db).values()][0];
// b is unknown, so it is excluded until owned; no access-state loophole.
assert.equal(merged.length,1);
db.providerItems[b.id]={...b,ownership:'owned'};
const index=[...ownedContentIndex(db).values()][0];assert.equal(index.length,1);assert.equal(ownedContentIndex(db).size,2);
assert.equal(seriesCoverage(db)[0].overlap.length,0);
const scoped=entry('Collection A','Alpha',{run:'2020',language:'en'});
db.contentReviews[a.id]=review([scoped]);delete db.contentReviews[b.id];
const completeApi=api(db,[{title:'Unrelated offered collection',mediaType:'book',contents:[scoped],contentsComplete:true}]);
assert.equal(completeApi.ok,true);assert.equal(completeApi.results[0].owned,false);assert.equal(parentContentCoverage(db,a.id,[scoped]).complete,true);
const crossMedia=createEmptyDatabase(),game=normalizeProviderItem({provider:'gog',providerItemId:'named-game-control',recordRef:'00000000-0000-4000-8000-000000000004',title:'Collection A',mediaType:'game',ownership:'owned'},'2026-10-05T00:00:00.000Z');
crossMedia.providerItems[game.id]=game;crossMedia.contentReviews[game.id]=review([scoped]);
const crossMediaApi=api(validateDatabase(crossMedia),[{title:'Unrelated offered book',mediaType:'book',contents:[scoped],contentsComplete:true}]);
assert.equal(crossMediaApi.results[0].owned,false,'Block cross-media named coverage');assert.equal(crossMediaApi.results[0].coverage.possibleCovered.length,0);
assert.equal(contentCoverage(db,[entry('Collection A','Alpha: Special Edition',{run:'2020',language:'en'})]).owned,0);
assert.notEqual(contentKey(entry('Collection A','Alpha')),contentKey(entry('Collection A','alpha')));
assert.notEqual(contentKey(entry('Collection A','01')),contentKey(entry('Collection A','1')));
assert.equal(contentKey(entry('Collection: A')),contentKey(entry('Collection A')));
assert.equal(validateContents([entry('Collection A','01'),entry('Collection A','1')]).length,2);
assert.equal(validateContents([entry(),entry()]).length,1);
assert.equal(validateContents([entry(),entry('Collection A','Alpha: Special Edition')]).length,2);
const extra=validateContents([entry('Collection A','Alpha',{parentItemId:a.id,workType:'novel',sourceClaim:'candidate-1',qualifiers:['full-length']})])[0];
assert.equal(Object.hasOwn(extra,'parentItemId'),false);assert.equal(Object.hasOwn(extra,'workType'),false);assert.equal(Object.hasOwn(extra,'qualifiers'),false);
assert.throws(()=>validateContents([entry('Collection A','A'.repeat(81))]));
const restored=parseBackup(createBackup(validateDatabase(db)));
assert.deepEqual(restored.contentReviews,db.contentReviews);
assert.equal(api(restored,[{title:'Unrelated offered collection',mediaType:'book',contents:[scoped],contentsComplete:true}]).results[0].owned,false);assert.equal(parentContentCoverage(restored,a.id,[scoped]).complete,true);
const proof={ordinaryBareTitleBefore:withoutReview,ordinaryBareTitleAfterVerification:bareApi,differentCollectionCoverage:differentCollection,sameDisplayCoverage:sameDisplay,explicitIncompleteRequest:incompleteApi,explicitCompleteRequest:completeApi,crossMediaExplicitRequest:crossMediaApi,sameTitleParentItems:[a.id,b.id],sameKeyIndexEvidenceCount:index.length,scopeFieldsDiscarded:extra,numericComponentTitleCollision:false,parentPunctuationCollision:true,casePreserved:true,editionTitlePreserved:true,backupPreservesReviews:true,unscopedOwnedBlockedAfterBackup:true};
const syntheticAcceptance=await checkParentScopedComponents();
const grammarControls=[
 ['finite-count','Contains four novels: Alpha, Beta, Gamma, and Delta.'],
 ['count-mismatch','Contains four novels: Alpha, Beta, and Gamma.'],
 ['comma-title','Contains "Batman, Incorporated" and "Other Work".'],
 ['conjunction-title','Contains "The Lion, the Witch and the Wardrobe" and "Other Work".'],
 ['ambiguous-punctuation','Contains Something, Something and Something Else.'],
 ['mixed-quotes','Contains Alpha, "Beta", and Gamma.'],
 ['attribution','Reprinting Alpha, Beta, and Gamma from Collection X and Collection Y.'],
 ['quoted-attribution','Reprints "Story A" and "Story B" from Volume Y.'],
 ['numbered-excerpt','Collects Series X #1-5 and stories from Annual #1.'],
 ['promotion','Contains four novels: Alpha, Beta, Gamma, and Delta with a special offer included inside.'],
 ['read-more','Contains four novels: Alpha, Beta, Gamma, and Delta. Read more'],
 ['apparatus','Includes the original script for "The Mimic" from issue #20.'],
 ['structural-negative','Novels\nAlpha\nBeta\nGamma'],
 ['existing-name-list','Includes Wool, Shift and Dust']
].map(([id,statement])=>({id,statement,proposal:proposeContentsForReview(statement,'Synthetic Collection'),decision:'Characterization only; no parser-5 acceptance claim.'}));
const times=[];for(let n=0;n<7;n++){const t=performance.now();for(const row of corpus.rows)proposeContentsForReview(row.input,row.title,row.context);times.push(performance.now()-t);}
assert.equal(requests,0);assert.equal(hash(await readFile(process.argv[2])),corpus.sourceHash);
const implementationHashes=Object.fromEntries(await Promise.all(['contents.js','contents-quality.js','kindle-manifest.js','kindle-evidence-review.js','models.js','matcher.js','external-api.js','companion-response.js'].map(async file=>[file,hash(await readFile(new URL('../src/lib/'+file,import.meta.url)))])));
const frozen={baselineCommit:'4ac1bfd',sourceHash:corpus.sourceHash,implementationHashes,versions:{source:5,parser:4,filter:1,schema:12,manifestInterpretation:1,evidenceReview:1},networkRequests:requests,decision:'Parent-scoped named identity enforced; no parser-5 grammar implemented.',populationDefinition:'Inclusive, reproducible audit queue, not an accepted finite-work population or production classifier.',savedQueueCount:population.length,capturedQueueCount:capturedPopulation.length,tagCounts:Object.fromEntries([...new Set(population.flatMap(r=>r.tags))].sort().map(tag=>[tag,population.filter(r=>r.tags.includes(tag)).length])),saved:population,captured:capturedPopulation,syntheticControls:grammarControls,modelProof:proof,syntheticAcceptance};
const replayResult={sourceHash:corpus.sourceHash,networkRequests:requests,versions:frozen.versions,decision:frozen.decision,deterministic:true,historicalParser4ObjectsUnchanged:1520,saved:totals(first.saved),captured:totals(first.captured),recordsChanged:0,added:[],removed:[],modelProof:proof,performance:{firstMs,secondMs,warmRuns:7,parser4MedianMs:[...times].sort((a,b)=>a-b)[3],parser5Impact:'Not applicable; no implementation.'},rows:first.saved,capturedRows:first.captured};
await writeArtifact('kindle-named-contained-works-frozen.json',JSON.stringify(frozen,null,2)+'\n');
await writeArtifact('kindle-named-contained-works-replay.json',JSON.stringify(replayResult,null,2)+'\n');
console.log(JSON.stringify({decision:frozen.decision,savedQueue:frozen.savedQueueCount,capturedQueue:frozen.capturedQueueCount,tagCounts:frozen.tagCounts,saved:replayResult.saved,captured:replayResult.captured,unsafeExplicitCoverageOwned:completeApi.results[0].owned,numericTitleCollision:false,deterministic:true,networkRequests:requests,performance:replayResult.performance},null,2));
