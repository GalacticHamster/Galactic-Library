import {scenarios,centralResults,offerMappings,localFor} from '../tests/fixtures/matching/cross-provider-collections.mjs';
import {identityEvidence} from '../src/lib/identity.js';
import {bundleFixture as hb} from '../../HB/tests/matching-fixture.mjs';
import {bundleFixture as fan} from '../../Fanatical/tests/matching-fixture.mjs';
import {outputPath} from './audit-artifacts.mjs';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const baseline=process.argv[2]==='baseline';
const baselinePath=process.argv.find(arg=>arg.startsWith('--gl-baseline='))?.slice(14);
const api=baselinePath?(await import(pathToFileURL(resolve(baselinePath,'src/lib/external-api.js')))).handleExternalApiRequest:undefined;
const readBaseline=(repo,ref)=>{const cache=new Map();return file=>{if(!cache.has(file))cache.set(file,execFileSync('git',['show',ref+':'+file],{cwd:new URL('../../'+repo+'/',import.meta.url),encoding:'utf8',windowsHide:true}));return cache.get(file);};};
const output=[];
for(const scenario of scenarios()){
 const result={name:scenario.name,unknown:scenario.unknown,records:Object.values(scenario.db.providerItems).map(item=>({id:item.id,ref:item.recordRef,title:item.title,provider:item.provider,ownership:item.ownership,identity:identityEvidence(item),canonical:Object.values(scenario.db.canonicalItems).find(g=>g.providerItemIds.includes(item.id))?.id,review:scenario.db.contentReviews[item.id]||null})),companions:{}};
 for(const [provider,fixture] of [['humble',hb],['fanatical',fan]]){
  const responses=Object.fromEntries(Object.entries(centralResults(scenario.db,scenario.offers,provider,api)).map(([title,{requestId,...result}])=>[title,result])),f=fixture(scenario.offers.map(item=>({...item,kind:'book',mediaType:'book'})),localFor(scenario,provider),responses,{emulateStorefront:true,identityContext:!baseline,collectionMappings:offerMappings(scenario.offers),readSource:baseline?readBaseline(provider==='humble'?'HB':'Fanatical',provider==='humble'?'64a661d':'4ffc0ca'):undefined}),rows=await f.classify();const projection=f.P.reconcileBundle(rows,{complete:true});
  result.companions[provider]={responses,projection,summary:f.P.summary(rows),tiers:provider==='humble'?f.context.summary:null,rows:rows.map(({item,match})=>({item,match,candidates:f.P.candidateViews(item,match),primary:f.P.primaryCandidateViews(item,match),explanation:f.P.explanation(item,match),caption:f.P.relatedCaption(item,match)}))};
 }
 output.push(result);
}
const name=process.argv[2]||'baseline';const path=await outputPath(new URL('../audit-artifacts/cross-provider-collections/'+name+'.json',import.meta.url),name);fs.writeFileSync(path,JSON.stringify(output,null,2));
for(const result of output){console.log(result.name);for(const [provider,values]of Object.entries(result.companions))for(const row of values.rows)console.log(provider,row.item.title,row.match.state,'GL:',[...row.match.externalResult?.matches||[],...row.match.externalResult?.possibleMatches||[],...row.match.externalResult?.partialMatches||[]].map(r=>r.title+' ['+r.ownership+'/'+r.relationship+']').join('; '),'Primary:',row.primary.map(v=>v.title).join('; '));}
console.log('Saved synthetic evidence trace: '+path);
