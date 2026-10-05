// Offline parser comparison against a separately supplied frozen source ledger.
// No acquisition, private input fallback, reference answers or storage writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {outputPath} from './audit-artifacts.mjs';
import {manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {CONTENTS_PARSER_VERSION,contentKey} from '../src/lib/contents.js';

const [input,output]=process.argv.slice(2);
if(!input)throw Error('Usage: node scripts/replay-contents-proposals.mjs FROZEN_SOURCE_LEDGER [audit-artifacts/output.json]. No source is acquired.');
let requests=0;globalThis.fetch=()=>{requests++;throw Error('Network forbidden');};
const bytes=await readFile(input),baseline=JSON.parse(bytes);
assert.equal(baseline.referenceValuesUsed,false,'Parser input must be source-only');
const records=baseline.records.filter(r=>r.inSavedCorpus);
const hash=value=>createHash('sha256').update(value).digest('hex');
const modules=source=>source.replace(/from '\.\/([^']+)'/gu,(_,path)=>`from '${new URL('../src/lib/'+path,import.meta.url).href}'`);
const asModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const frozenParser=asModule(modules(await readFile(new URL('../tests/fixtures/kindle/contents-parser-v4.snapshot.txt',import.meta.url),'utf8')));
// Manifest interpretation is unchanged. Substitute only the historical parser.
const manifestSource=await readFile(new URL('../src/lib/kindle-manifest.js',import.meta.url),'utf8');
const historical=await import(asModule(manifestSource.replace(/from '\.\/([^']+)'/gu,(_,path)=>`from '${path==='contents.js'?frozenParser:new URL('../src/lib/'+path,import.meta.url).href}'`)));
const replay=parser=>records.map(r=>parser(r.auditSource,r.title,r.auditSource.statement,{series:r.metadata.series??[]}));
const old=replay(historical.manifestReviewProposal),current=replay(manifestReviewProposal);
assert.deepEqual(old,records.map(r=>r.proposal),'Frozen complete parser-4 baseline differs');
assert.deepEqual(current,replay(manifestReviewProposal),'Replay must be deterministic');
const rows=records.map((r,n)=>{
 const before=old[n],after=current[n],a=new Map(before.entries.map(e=>[contentKey(e),e])),b=new Map(after.entries.map(e=>[contentKey(e),e]));
 return {providerItemId:r.providerItemId,title:r.title,sourceGeneration:r.sourceGeneration,source:r.auditSource,changed:JSON.stringify(before)!==JSON.stringify(after),before,after,
  added:after.entries.filter(e=>!a.has(contentKey(e))),removed:before.entries.filter(e=>!b.has(contentKey(e))),modified:after.entries.filter(e=>a.has(contentKey(e))&&JSON.stringify(a.get(contentKey(e)))!==JSON.stringify(e))};
});
const changed=rows.filter(r=>r.changed),transitions={};
for(const r of changed){const k=r.before.outcome+' -> '+r.after.outcome;transitions[k]=(transitions[k]??0)+1;}
const times={before:[],after:[]};
for(let n=0;n<9;n++)for(const mode of n%2?['after','before']:['before','after']){const start=performance.now();replay(mode==='before'?historical.manifestReviewProposal:manifestReviewProposal);times[mode].push(performance.now()-start);}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
assert.equal(requests,0);assert.equal(hash(await readFile(input)),hash(bytes));
const summary={baselineHash:hash(bytes),records:records.length,parserBefore:4,parserAfter:CONTENTS_PARSER_VERSION,networkRequests:requests,deterministic:true,recordsChanged:changed.length,
 proposalsAdded:changed.reduce((n,r)=>n+r.added.length,0),proposalsRemoved:changed.reduce((n,r)=>n+r.removed.length,0),proposalsModified:changed.reduce((n,r)=>n+r.modified.length,0),
 transitions,unresolvedBefore:old.reduce((n,p)=>n+p.unparsed.length,0),unresolvedAfter:current.reduce((n,p)=>n+p.unparsed.length,0),
 unresolvedChanged:changed.filter(r=>JSON.stringify(r.before.unparsed)!==JSON.stringify(r.after.unparsed)).length,
 sourceSelectionsChanged:0,sourceSelectionPolicy:'Replay only frozen selections; no selectManifest calls or candidate aggregation.',
 largeDeltas:changed.filter(r=>Math.abs(r.after.entries.length-r.before.entries.length)>100).map(r=>({id:r.providerItemId,delta:r.after.entries.length-r.before.entries.length})),
 performance:{warmAlternatingRuns:9,beforeMedianMs:median(times.before),afterMedianMs:median(times.after)}};
await writeFile(await outputPath(output,'numbered-precision-replay.json'),JSON.stringify({summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
