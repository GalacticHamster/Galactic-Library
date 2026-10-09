// Offline end-to-end synthetic GL -> companion acceptance; no stored inventory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {bundleFixture as hb} from '../../HB/tests/matching-fixture.mjs';
import {bundleFixture as fan} from '../../Fanatical/tests/matching-fixture.mjs';
import {scenarios,centralResults,offerMappings,localFor,book,database,sequel,original,deluxe} from '../tests/fixtures/matching/cross-provider-collections.mjs';
import {outputPath} from './audit-artifacts.mjs';
const baselineFile=new URL('../audit-artifacts/cross-provider-collections/baseline.json',import.meta.url);
if(!fs.existsSync(baselineFile))throw Error('Generate the synthetic baseline trace using the documented pre-change checkout first. No network acquisition occurs.');
const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8')),results=[];
for(const s of scenarios()){
 const databaseBefore=JSON.stringify(s.db);
 for(const [provider,fixture] of [['humble',hb],['fanatical',fan]]){
  const responses=Object.fromEntries(Object.entries(centralResults(s.db,s.offers,provider)).map(([title,{requestId,...r}])=>[title,r]));
  const f=fixture(s.offers.map(item=>({...item,kind:'book',mediaType:'book'})),localFor(s,provider),responses,{emulateStorefront:true,identityContext:true,collectionMappings:offerMappings(s.offers)});
  const rows=await f.classify(),before=JSON.stringify(rows),old=baseline.find(b=>b.name===s.name).companions[provider];
  assert.deepEqual(Array.from(rows,r=>r.match.state),old.rows.map(r=>r.match.state),s.name+' classification');
  for(const [i,row]of rows.entries())if(row.match.state==='owned')assert.equal(JSON.stringify(row.match),JSON.stringify(old.rows[i].match),s.name+' local Owned result');
  const summaryInvariant=summary=>({...summary,items:summary.items.map(({relatedTitle,relatedTitles,...item})=>item)});
  assert.equal(JSON.stringify(summaryInvariant(f.P.summary(rows))),JSON.stringify(summaryInvariant(old.summary)),s.name+' counts');
  if(provider==='humble')assert.equal(JSON.stringify(f.context.summary),JSON.stringify(old.tiers),s.name+' tier pricing');
  const project=()=>f.P.reconcileBundle(rows,{complete:true});project();
  const primary=row=>Array.from(f.P.primaryCandidateViews(row.item,row.match),v=>v.title);
  if(s.name==='trees-unknown')assert.deepEqual(primary(rows[1]),[sequel+' #1',sequel+' #2']);
  if(s.name==='trees-alone')assert.deepEqual(primary(rows[0]).slice(0,2),[sequel+' #1',sequel+' #2']);
  if(s.name==='deluxe-unknown')for(const [i,row]of rows.entries()){
   const generic=f.P.primaryCandidateViews(row.item,row.match).find(v=>v.title==='30 Days of Night');assert(generic.uncertainty.includes('Book '+['One','Two','Three'][i]));
  }
  if(s.name.endsWith('reviewed-overlap')){assert.equal(rows[0].match.state,'partial');assert.equal(rows[0].match.coverage.owned,1);}
  if(s.name==='trees-explicit-contents-subscription')assert.equal(rows.at(-1).match.coverage.owned,0);
  const expected=rows.map(primary);project();assert.deepEqual(rows.map(primary),expected);
  f.P.reconcileBundle([...rows].reverse(),{complete:true});assert.deepEqual(rows.map(primary),expected);
  assert.equal(JSON.stringify(rows),before);assert.equal(JSON.stringify(s.db),databaseBefore);
  results.push({scenario:s.name,provider,unchangedStatesCountsPrices:true,primary:expected});
 }
}
// New suggestion-only case: Purchased constituent issue is not collected ownership.
const issueOnly=database([book('kindle',sequel+' #1')]);
for(const fixture of [hb,fan]){
 const responses=centralResults(issueOnly,[{title:sequel}],'humble'),f=fixture([{title:sequel,kind:'book',mediaType:'book'}],[],responses);
 const [row]=await f.classify();assert.equal(row.match.state,'possible');assert.equal(row.match.coverage?.owned||0,0);
}
// Precision: a known different numbered book is never promoted to exact ownership.
const one=database([book('kindle',deluxe(1))]);assert.equal(centralResults(one,[{title:deluxe(2)}],'humble')[deluxe(2)].owned,false);
const timings=[];
if(!process.argv.includes('--skip-large'))for(const [provider,fixture]of [['humble',hb],['fanatical',fan]]){
 // One real API result per synthetic issue pair, spread over two 500-item batches.
 const offers=Array.from({length:1000},(_,i)=>({title:'Synthetic Collection '+i+': Sequel',kind:'book',mediaType:'book'}));
 const db=database(offers.map(item=>book('kindle',item.title+' #1','subscription'))),responses={},start=performance.now();
 for(let i=0;i<offers.length;i+=500)Object.assign(responses,centralResults(db,offers.slice(i,i+500),provider));
 const apiMs=performance.now()-start,f=fixture(offers,[],responses),rows=await f.classify(),before=JSON.stringify(rows),times=[];
 assert(rows.every(row=>row.match.state==='possible'));
 for(let n=0;n<5;n++){const t=performance.now();f.P.reconcileBundle(rows,{complete:true});times.push(performance.now()-t);}
 assert.equal(JSON.stringify(rows),before);
 timings.push({provider,offers:1000,apiBatches:2,apiMs,projectionMs:times,medianMs:[...times].sort((a,b)=>a-b)[2]});
}
const report={synthetic:true,scenarios:results,largeBundle:timings};
const name=process.argv.includes('--skip-large')?'cases':'acceptance';
const path=await outputPath(new URL('../audit-artifacts/cross-provider-collections/'+name+'.json',import.meta.url),name);fs.writeFileSync(path,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:results.length,largeBundle:timings,report:path},null,2));
