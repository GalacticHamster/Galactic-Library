import {newProviderProfile} from '../src/lib/provider-profiles.js';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase,validateDatabaseAsync} from '../src/lib/models.js';
import {createManifestValidator,selectManifest} from '../src/lib/kindle-manifest.js';
import {handleExternalApiRequest,handleExternalApiRequestAsync} from '../src/lib/external-api.js';
import {withWorker} from './storage.js';

const blocks=[{selector:'#description',text:'This collection includes "Amber", "Blue". Collects Synthetic #1-8.'}];
const makeDatabase=(size=2)=>{
 const db=createEmptyDatabase();
 for(let n=1;n<=size;n++){
  const item=normalizeProviderItem({provider:'kindle',providerItemId:'B'+String(n).padStart(9,'0'),title:'Synthetic collection '+n,mediaType:'book',ownership:'owned',metadata:{originType:'Purchase',detailUrl:'https://www.amazon.com/dp/B'+String(n).padStart(9,'0')}});
  item.metadata.enrichment={kindleProductComicContents:{source:'amazon-product-page',sourceUrl:item.metadata.detailUrl,...selectManifest(blocks,item.title),availability:'statement-found',extractorVersion:5,parserVersion:5}};
  db.providerItems[item.id]=item;
 }
 return validateDatabase(db);
};
const hb='a'.repeat(32),fan='b'.repeat(32);
const request={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Synthetic collection 1',mediaType:'book'},{title:'Synthetic collection 1, 2nd Edition',mediaType:'book'}]};

export const checkpointResponsivenessTests=[
 ['cooperative full validation produces identical data and rejects invalid neighbors, history, references and review evidence',async()=>{
  const db=makeDatabase(5);let yields=0;
  const options={budgetMs:0,yieldTask:async()=>{yields++;}};
  assert.deepEqual(await validateDatabaseAsync(db,options),validateDatabase(db));assert.ok(yields>10);
  const malformed=[];
  const metadata=structuredClone(db);metadata.providerItems['kindle:B000000005'].metadata.authors=[{}];malformed.push(metadata);
  const refs=structuredClone(db);refs.providerItems['kindle:B000000005'].recordRef=refs.providerItems['kindle:B000000001'].recordRef;malformed.push(refs);
  const history=structuredClone(db);history.enrichmentHistory.bad={};malformed.push(history);
  const review=structuredClone(db);review.contentReviews['kindle:B000000001']={entries:[{series:'Bad',unitType:'issue',number:'-1'}]};malformed.push(review);
  for(const value of malformed){let message;try{validateDatabase(value);}catch(error){message=error.message;}assert.ok(message);await assert.rejects(validateDatabaseAsync(value,options),error=>error.message===message);}
 }],
 ['bounded manifest memoization recomputes source and preserves independent selections without trusting ranks or mutable results',()=>{
  let computed=0;const uncached=createManifestValidator({maxBytes:0});
  const validator=createManifestValidator({maxEntries:2,compute:(...args)=>{computed++;return uncached(...args);}});
  const selected=selectManifest(blocks,'Synthetic').manifest,first=validator(selected);first.blocks[0].text='Injected';first.candidates[0].raw='Injected';
  const forged=structuredClone(selected);forged.candidates[0].rank=[999];forged.secondary=[999];
  assert.deepEqual(validator(forged),uncached(forged));assert.equal(computed,1);
  const alternate=structuredClone(selected);alternate.selected=selected.selected===0?1:0;
  assert.deepEqual(validator(alternate),uncached(alternate));assert.equal(computed,2);
  assert.deepEqual(validator(selected,'Another title'),uncached(selected,'Another title'));assert.equal(computed,3);
  validator(selected);assert.equal(computed,4,'Oldest entry was not evicted');
  const changed=structuredClone(selected);changed.blocks[0].text+=' Contains "Copper".';assert.deepEqual(validator(changed),uncached(changed));assert.equal(computed,5);
  const invalid=structuredClone(selected);invalid.blocks[0].text='X'.repeat(12001);assert.throws(()=>validator(invalid),/bounds/);
  const tiny=createManifestValidator({maxBytes:1,compute:(...args)=>{computed++;return uncached(...args);}});const before=computed;tiny(selected);tiny(selected);assert.equal(computed-before,2,'Oversized entry bypassed the byte budget');
 }],
 ['cooperative companion matching retains exact, Possible, reviewed and identifier-conflict results and request rejection',async()=>{
  const db=makeDatabase(4);db.titleAliases[db.providerItems['kindle:B000000002'].recordRef]={titles:['An alternate collection']};
  db.ownershipPolicy.providers.kindle=true;
  let yields=0;const options={budgetMs:0,yieldTask:async()=>{yields++;}};
  for(const query of [request,{...request,items:[{title:'An alternate collection',mediaType:'book'}]},{...request,items:[{title:'Synthetic collection 1',mediaType:'book',identifiers:{isbn:'9780306406157'}}]},{...request,apiVersion:999},{...request,items:[]},{type:'GET_STATUS'}])assert.deepEqual(await handleExternalApiRequestAsync(db,query,options),handleExternalApiRequest(db,query));
  assert.ok(yields>10);
 }],
 ['immutable title derivation reuse never caches time-dependent ownership or key expiry',async()=>{
  const source=makeDatabase();const item=normalizeProviderItem({provider:'humble',providerItemId:'expiry-key',title:'Expiry test',mediaType:'game',ownership:'owned',metadata:{entitlement:'third-party-key',keyStatus:'unrevealed',expiresAt:'2030-01-01'}});const profile=newProviderProfile('humble','',true);source.providerProfiles[profile.profileId]=profile;source.providers.humble={activeProfileId:profile.profileId};source.providerItems[item.id]={...item,profileId:profile.profileId};
  const db=validateDatabase(source),freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}};freeze(db);
  const query={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Expiry test',mediaType:'game'}]},originalNow=Date.now;
  try{
   Date.now=()=>Date.parse('2029-01-01');assert.equal((await handleExternalApiRequestAsync(db,query,{cacheImmutableRecords:true})).results[0].owned,true);
   Date.now=()=>Date.parse('2031-01-01');const result=await handleExternalApiRequestAsync(db,query,{cacheImmutableRecords:true});assert.equal(result.results[0].owned,false);assert.deepEqual(result,handleExternalApiRequest(db,query));
  }finally{Date.now=originalNow;}
 }],
 ['HB and FAN messages arriving during CPU-heavy checkpoint validation execute before the save completes; malformed saves stay atomic',()=>withWorker(async({memory,dispatch,dispatchExternal,pageA})=>{
  chrome.runtime.sendMessage=async()=>({ok:true});memory.values.galacticLibraryDatabase=makeDatabase(800);
  await pageA.saveAllowedExternalClientIds([hb,fan]);
  for(const id of [hb,fan])assert.equal((await dispatchExternal(request,{id})).ok,true);
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},plan=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},sender);
  const candidate=plan.candidates[0],message={type:'SAVE_KINDLE_COMIC_CONTENTS',diagnosticLookupId:'lookup-cccccccccccc-001',refresh:{runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef},entries:[{itemId:candidate.id,recordRef:candidate.recordRef,queuePosition:0,sourceUrl:candidate.detailUrl,statement:'Collects Synthetic #1-4',availability:'statement-found',extractorVersion:5}]};
  const get=memory.area.get;let probes,armed=false,saveFinished=false;const starts=[];
  memory.area.get=async defaults=>{
   const result=await get(defaults);
   if(!armed&&Object.hasOwn(defaults,'galacticLibraryDatabase')){
    armed=true;const due=performance.now();
    probes=Promise.all([hb,fan].map((id,index)=>new Promise(resolve=>setTimeout(async()=>{
     const lag=performance.now()-due;starts.push(lag);
     const response=await dispatchExternal({...request,diagnosticLookupId:'lookup-dddddddddddd-'+String(index+1).padStart(3,'0'),diagnosticSentEpochMs:performance.timeOrigin+due},{id});resolve({response,finished:saveFinished});
    },0))));
   }
   return result;
  };
  const saving=dispatch(message,sender).then(result=>{saveFinished=true;return result;});
  // Wait until admission reaches the fresh DB read; probes then arrive while
  // the actual validation runs, rather than only during a delayed storage write.
  while(!armed)await new Promise(resolve=>setTimeout(resolve,0));
  const results=await probes;const saved=await saving;
  assert.equal(saved.ok,true,saved.error);assert.equal(saved.refresh.cursor,1);
  for(const row of results){assert.equal(row.response.ok,true);assert.equal(row.response.results[0].owned,true);assert.ok(row.response.results[1].possibleMatches.length);assert.equal(row.finished,false,'Matching waited for CPU-heavy checkpoint');assert.ok(row.response.performance.events.some(e=>e.stage==='matching_index'));}
  assert.ok(Math.max(...starts)<150,'Message dispatch blocked behind full validation');
  const before=structuredClone(memory.values.galacticLibraryKindleContentsRefresh);memory.values.galacticLibraryDatabase.providerItems['kindle:B000000800'].metadata.authors=[{}];
  const next=plan.candidates[1];const invalid=await dispatch({...message,entries:[{...message.entries[0],itemId:next.id,recordRef:next.recordRef,sourceUrl:next.detailUrl,queuePosition:1}]},sender);
  assert.equal(invalid.ok,false);assert.deepEqual(memory.values.galacticLibraryKindleContentsRefresh,before);
 },{storageEvents:true,concurrentQueries:true})],
 ['opt-in refresh timing exports include bounded title-free companion stages without changing normal companion responses',()=>withWorker(async({memory,dispatch,dispatchExternal,pageA})=>{
  chrome.runtime.sendMessage=async()=>({ok:true});memory.values.galacticLibraryDatabase=makeDatabase();await pageA.saveAllowedExternalClientIds([hb]);
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}};
  const initial=await dispatchExternal(request,{id:hb});assert.equal(initial.performance,undefined);
  assert.equal((await dispatch({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'},sender)).companions.length,0);
  await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan',diagnosticLookupId:'lookup-eeeeeeeeeeee-001'},sender);
  const response=await dispatchExternal(request,{id:hb});assert.equal(response.performance,undefined);
  const exported=await dispatch({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'},sender),rows=exported.companions;assert.equal(rows.length,1);assert.equal(rows[0].kind,'companion');
  for(const stage of ['query_authorization','query_snapshot','matching_index','matching_execution','response_dispatch'])assert.ok(rows[0].events.some(x=>x.stage===stage),stage);
  assert.equal(rows[0].events.some(x=>x.stage==='handler_delay'),false,'No sender timestamp must be reported as unknown, not zero dispatch delay');
  assert.equal(JSON.stringify(rows).includes('Synthetic collection'),false);assert.equal(JSON.stringify(rows).includes(hb),false);
  const report=globalThis.GalacticContentsPerformance.collector().report([],rows);assert.equal(report.companions.length,1);assert.equal(report.companionStatsMs.handler_delay.count,0);
 },{storageEvents:true,concurrentQueries:true})]
];
