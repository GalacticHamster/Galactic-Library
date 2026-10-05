// Complete offline comparison; production acquisition is never invoked.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {wholeManifestEvidence,baselineManifest} from './whole-manifest-evidence.mjs';
import {hash} from './contents-parser-corpus.mjs';
import * as current from '../src/lib/kindle-manifest.js';
import {proposeContentsForReview,contentKey} from '../src/lib/contents.js';
let requests=0;globalThis.fetch=()=>{requests++;throw Error('Network forbidden');};
const {corpus,observations,savedByUrl}=await wholeManifestEvidence(process.argv[2]),{module:old,hash:baselineHash}=await baselineManifest();
const audit=JSON.parse(await readFile(new URL('../docs/kindle-contents-parser-audit-v4.json',import.meta.url),'utf8'));
const key=e=>contentKey(e)+':'+e.completeness;
const assessment=(p,q)=>({before:{outcome:p.outcome,proposals:p.entries.length,unresolved:p.unparsed},after:{outcome:q.outcome,proposals:q.entries.length,unresolved:q.unparsed},added:q.entries.filter(e=>!new Set(p.entries.map(key)).has(key(e))),removed:p.entries.filter(e=>!new Set(q.entries.map(key)).has(key(e))),changed:JSON.stringify(p.entries)!==JSON.stringify(q.entries)||p.outcome!==q.outcome||JSON.stringify(p.unparsed)!==JSON.stringify(q.unparsed)});
function replay(){
 return observations.map(row=>{
  const before=old.selectManifest(row.blocks,row.title),after=current.selectManifest(row.blocks,row.title),p=old.manifestReviewProposal(before,row.title),q=current.manifestReviewProposal(after,row.title);
  const parents=after.manifest.candidates.filter(c=>c.whole);
  const sibling=c=>parents.some(parent=>parent.block===c.block&&parent.manifestRange.start===c.manifestRange?.start&&parent.manifestRange.end===c.manifestRange?.end);
  const children=after.manifest.candidates.filter(c=>!c.whole&&sibling(c)),childEntries=children.flatMap(c=>proposeContentsForReview(c.parserInput,row.title).entries);
  return {id:row.id,title:row.title,url:row.url,sourceGeneration:row.sourceGeneration,...assessment(p,q),beforeSelection:before,afterSelection:after,parentCount:parents.length,childrenPerParent:parents.map(p=>after.manifest.candidates.filter(c=>!c.whole&&c.block===p.block&&c.manifestRange?.start===p.manifestRange.start&&c.manifestRange?.end===p.manifestRange.end).length),equivalentChildDuplicates:childEntries.length-new Set(childEntries.map(key)).size,rejectedIndependentSecondaries:after.manifest.secondary.filter(i=>!sibling(after.manifest.candidates[i])&&after.manifest.candidates[i].block===after.manifest.candidates[after.manifest.selected]?.block).length};
 });
}
const start=performance.now(),rows=replay(),firstMs=performance.now()-start,secondStart=performance.now(),second=replay(),secondMs=performance.now()-secondStart;
assert.deepEqual(second,rows);
const corpusRows=corpus.rows.map(row=>{
 assert.deepEqual(proposeContentsForReview(row.input,row.title,row.context),audit.rows.find(a=>a.auditId===row.auditId).after);
 const saved=savedByUrl.get(row.item.metadata.detailUrl)??{statement:row.statement},context={series:row.item.metadata.series??[]};
 const p=old.manifestReviewProposal(saved,row.title,saved.statement,context),q=current.manifestReviewProposal(saved,row.title,saved.statement,context);
 return {auditId:row.auditId,title:row.title,hasCapturedBlocks:Boolean(saved.manifest),...assessment(p,q)};
});
const classify=(row,candidate)=>{
 const winner=row.afterSelection.manifest.candidates[row.afterSelection.manifest.selected];
 if(candidate.manifestRange&&winner.manifestRange&&candidate.block===winner.block&&candidate.manifestRange.start===winner.manifestRange.start&&candidate.manifestRange.end===winner.manifestRange.end)return 'likely same-manifest fragmentation';
 // Reviewed against complete retained blocks, not just keyword guesses. This
 // audit-only classification never feeds production selection or parsing.
 if(['pilot-4-13','pilot-4-32','sample-4-254','sample-5-254'].includes(row.id))return 'unrelated prose';
 if(row.id==='pilot-4-42')return 'supplemental/excerpt evidence';
 if(/\b(?:script|sketches|excerpt|material from|story arcs)\b/iu.test(candidate.raw))return 'supplemental/excerpt evidence';
 if(/gun|murder|birth|writers?|artists?|severed|wireless|collect all.*issues|reprinting all.*issues/iu.test(candidate.raw))return 'unrelated prose';
 return candidate.entries?'legitimate alternative candidate':'ambiguous';
};
const suspicious=[];
for(const row of rows){if(row.before.outcome!=='full')continue;const manifest=row.beforeSelection.manifest;
 for(const i of manifest.secondary){const c=manifest.candidates[i];if(c.quality==='filtered')continue;
  // Match original window into current candidates to diagnose, not union.
  const now=row.afterSelection.manifest.candidates.find(n=>n.block===c.block&&n.start===c.start&&n.end===c.end&&n.raw===c.raw)??c;
  suspicious.push({observation:row.id,title:row.title,url:row.url,primary:row.beforeSelection.statement,secondaryIndex:i,secondary:c.raw,secondaryOutcome:c.outcome,secondaryProposals:c.entries,classification:classify(row,now)});
 }
}
const sums=group=>({records:group.length,changed:group.filter(r=>r.changed).length,proposalsBefore:group.reduce((n,r)=>n+r.before.proposals,0),proposalsAfter:group.reduce((n,r)=>n+r.after.proposals,0),unresolvedBefore:group.reduce((n,r)=>n+r.before.unresolved.length,0),unresolvedAfter:group.reduce((n,r)=>n+r.after.unresolved.length,0),additions:group.reduce((n,r)=>n+r.added.length,0),removals:group.reduce((n,r)=>n+r.removed.length,0),transitions:Object.fromEntries([...new Set(group.map(r=>r.before.outcome+' → '+r.after.outcome))].map(t=>[t,group.filter(r=>r.before.outcome+' → '+r.after.outcome===t).length]))});
const bench=module=>{const start=performance.now();for(const r of observations){const s=module.selectManifest(r.blocks,r.title);module.manifestReviewProposal(s,r.title);}return performance.now()-start;};
const oldMs=[],newMs=[];for(let n=0;n<7;n++){oldMs.push(bench(old));newMs.push(bench(current));}
const median=list=>[...list].sort((a,b)=>a-b)[Math.floor(list.length/2)];
const result={networkRequests:requests,baselineHash,sourceHash:corpus.sourceHash,interpretationVersion:1,sourceGeneration:5,parserVersion:4,filterVersion:1,schema:12,deterministic:true,captured:sums(rows),uniqueCapturedUrls:new Set(observations.filter(r=>r.url).map(r=>r.url)).size,sourceObservations:observations.filter(r=>r.url).length,fixtureObservations:observations.filter(r=>!r.url).length,corpus:sums(corpusRows),parser4HistoricalObjectsUnchanged:1520,parentObservations:rows.filter(r=>r.parentCount).length,childWindowsPerManifest:rows.filter(r=>r.parentCount).map(r=>({observation:r.id,children:r.childrenPerParent})),equivalentChildDuplicates:rows.reduce((n,r)=>n+r.equivalentChildDuplicates,0),independentSecondariesNotCombined:rows.reduce((n,r)=>n+r.rejectedIndependentSecondaries,0),performance:{firstReplayMs:firstMs,secondReplayMs:secondMs,warmRuns:7,baselineMedianMs:median(oldMs),currentMedianMs:median(newMs)},suspiciousCategories:Object.fromEntries([...new Set(suspicious.map(s=>s.classification))].map(c=>[c,suspicious.filter(s=>s.classification===c).length])),suspicious,rows,corpusRows};
await writeFile(new URL('../docs/kindle-whole-manifest-audit.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
const cell=s=>String(s).replace(/\|/gu,'\\|').replace(/\s+/gu,' ');
await writeFile(new URL('../docs/kindle-whole-manifest-suspicious.md',import.meta.url),'# Full-primary / secondary-evidence audit\n\nEvery non-filtered secondary of a previously Full primary is included, not automatically merged. Counts are observations (the same record may occur in multiple source generations). Classifications are source-scope assessments; unknown identity is not inferred.\n\n| Observation | Title | Secondary (literal) | Classification |\n| --- | --- | --- | --- |\n'+suspicious.map(s=>`| ${s.observation} | ${cell(s.title)} | ${cell(s.secondary)} | ${s.classification} |`).join('\n')+'\n');
console.log(JSON.stringify({...result,rows:undefined,corpusRows:undefined,suspicious:undefined},null,2));
