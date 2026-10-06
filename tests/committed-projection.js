import assert from 'node:assert/strict';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {registerCommittedSnapshot} from '../src/lib/committed-snapshot.js';
import {handleExternalApiRequest,handleExternalApiRequestAsync} from '../src/lib/external-api.js';
import {withWorker} from './storage.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fixture=()=>{
  const db=createEmptyDatabase();
  const titles=['4001 AD','4001 AD: Beyond New Japan','Maggie the Mechanic (Love & Rockets)','The Room','Algorithmic Thinking','Think Like a Programmer: An Introduction to Creative Problem Solving'];
  for(const [index,title]of titles.entries()){
    const item=normalizeProviderItem({provider:'kindle',providerItemId:'B'+String(index+1).padStart(9,'0'),title,mediaType:'book',ownership:'owned',metadata:{authors:['Writer Example'],originType:'Purchase',detailUrl:'https://www.amazon.com/dp/B'+String(index+1).padStart(9,'0')}});db.providerItems[item.id]=item;
  }
  const expiry=normalizeProviderItem({provider:'humble',providerItemId:'expiry',title:'Expiry Game',mediaType:'game',ownership:'owned',metadata:{entitlement:'third-party-key',keyStatus:'unrevealed',expiresAt:'2030-01-01'}});db.providerItems[expiry.id]=expiry;
  const ids=Object.keys(db.providerItems);db.manualMatchDecisions.barrier={itemIds:ids.slice(0,2),decision:'same-work',updatedAt:'2026-10-01'};
  db.titleAliases[db.providerItems[ids[0]].recordRef]={titles:['Alternate 4001 title'],updatedAt:'2026-10-01'};
  return validateDatabase(db);
};
const query={type:'MATCH_ITEMS',apiVersion:1,items:[
  ...['4001 AD','4001 AD: Beyond New Japan','Maggie the Mechanic','Room','Algorithmic Thinking, 10th Edition','Think Like a Programmer','Alternate 4001 title'].map(title=>({title,mediaType:'book'})),
  {title:'4001 AD',mediaType:'book',authors:['Different Writer']},
  {title:'Expiry Game',mediaType:'game'}
]};
const opts={cacheCommittedProjection:true,cacheImmutableRecords:true,budgetMs:0,yieldTask:async()=>{}};
const hb='a'.repeat(32),fan='b'.repeat(32);
export const committedProjectionTests=[
 ['committed identity projections build once, share concurrent builds and preserve exact/Possible/aliases/manual barriers without caching output',async()=>{
  const db=registerCommittedSnapshot(freeze(fixture())),spans=[];
  const options={...opts,beginSpan:name=>{spans.push(name);return ()=>{};}};
  const expected=handleExternalApiRequest(db,query);
  const responses=await Promise.all([handleExternalApiRequestAsync(db,query,options),handleExternalApiRequestAsync(db,query,options)]);
  for(const response of responses)assert.deepEqual(response,expected);
  assert.equal(spans.filter(x=>x==='matching_index_build').length,1);
  assert.equal(spans.filter(x=>x==='matching_canonical').length,1);
  assert.equal(spans.filter(x=>x==='matching_index_wait').length,1);
  responses[0].results[0].matches[0].title='Injected';responses[0].results[0].matches[0].evidence.authors.push('Injected');
  assert.deepEqual(await handleExternalApiRequestAsync(db,query,options),expected);
  assert.equal(spans.filter(x=>x==='matching_canonical').length,1);
  assert.ok(spans.includes('matching_index_hit'));
  const merelyFrozen=freeze(fixture()),untrusted=[];
  await handleExternalApiRequestAsync(merelyFrozen,query,{...options,beginSpan:name=>{untrusted.push(name);}});
  assert.equal(untrusted.includes('matching_index_build'),false,'Arbitrary frozen data was treated as a committed revision');
 }],
 ['committed projection preserves expiry, ownership overrides, review changes, aliases and changed revisions',async()=>{
  const original=Date.now,db=registerCommittedSnapshot(freeze(fixture()));
  try{
    for(const year of ['2029','2031']){
      Date.now=()=>Date.parse(year+'-01-01');
      assert.deepEqual(await handleExternalApiRequestAsync(db,query,opts),handleExternalApiRequest(db,query));
      assert.equal((await handleExternalApiRequestAsync(db,query,opts)).results.at(-1).owned,year==='2029');
    }
    const changed=structuredClone(db);changed.ownershipPolicy.allOwned=true;Object.values(changed.manualMatchDecisions)[0].decision='different';
    changed.titleAliases[Object.values(changed.providerItems)[0].recordRef].titles=['Changed alias'];
    const next=registerCommittedSnapshot(freeze(validateDatabase(changed)));
    const result=await handleExternalApiRequestAsync(next,query,opts);assert.deepEqual(result,handleExternalApiRequest(next,query));assert.equal(result.results.at(-1).owned,true);
    assert.deepEqual(await handleExternalApiRequestAsync(db,query,opts),handleExternalApiRequest(db,query),'A new revision contaminated the old snapshot');
  }finally{Date.now=original;}
 }],
 ['cached identity projections retain fresh reviewed contents coverage, parent-local components and historical/profile boundaries',async()=>{
  const source=fixture(),item=Object.values(source.providerItems)[0];
  const issue={series:'Synthetic',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'};
  const component={series:'Synthetic Parent',run:'',unitType:'component',number:'01',language:'en',completeness:'full'};
  source.contentReviews[item.id]={entries:[issue,component],statement:'Collects Synthetic #1; contains 01',verifiedAt:'2026-10-01'};
  const archived=normalizeProviderItem({provider:'kindle',providerItemId:'B999999999',title:'Archived Synthetic',mediaType:'book',ownership:'owned'});
  source.providerHistory[archived.recordRef]={item:archived,profileLabel:'',reason:'missing-from-complete-scan',missingSince:'2026-10-01'};
  const request={type:'MATCH_ITEMS',apiVersion:1,items:[
    {title:'Synthetic issue',mediaType:'book',contents:[issue],contentsComplete:true},
    {title:'Different Parent',mediaType:'book',contents:[component],contentsComplete:true},
    {title:'Archived Synthetic',mediaType:'book'},
    {title:item.title,mediaType:'book',excludeProviders:['kindle']}
  ]};
  for(const override of [false,true]){
    source.ownershipPolicy.allOwned=override;
    const db=registerCommittedSnapshot(freeze(validateDatabase(source)));
    for(let n=0;n<2;n++)assert.deepEqual(await handleExternalApiRequestAsync(db,request,opts),handleExternalApiRequest(db,request));
    const results=(await handleExternalApiRequestAsync(db,request,opts)).results;
    assert.equal(results[0].owned,true);assert.equal(results[1].owned,false);assert.equal(results[2].owned,false);assert.equal(results[3].owned,false);
  }
 }],
 ['Options committed view bypasses a held checkpoint, stays detached, preserves eligibility projection and cannot publish uncommitted changes',()=>withWorker(async({memory,pageA,dispatch,dispatchExternal})=>{
  chrome.runtime.sendMessage=async()=>({ok:true});memory.values.galacticLibraryDatabase=fixture();await pageA.saveAllowedExternalClientIds([hb,fan]);
  const before=await pageA.getCommittedLibraryView();
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},plan=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},sender);
  const preflight={type:'CHECK_KINDLE_CONTENTS_REFRESH_ITEM',runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef,position:0};await dispatch(preflight,sender);
  await pageA.getCommittedLibraryView();
  const hit=await dispatch({...preflight,diagnosticLookupId:'lookup-123456abcdef-001'},sender);assert.ok(hit.performance.events.some(e=>e.stage==='refresh_projection_hit'));
  const set=memory.area.set;let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  memory.area.set=async updates=>{if(updates.galacticLibraryDatabase&&updates.galacticLibraryKindleContentsRefresh){entered();await gate;}return set(updates);};
  const candidate=plan.candidates[0];const saving=dispatch({type:'SAVE_KINDLE_COMIC_CONTENTS',refresh:{runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef},entries:[{itemId:candidate.id,recordRef:candidate.recordRef,queuePosition:0,sourceUrl:candidate.detailUrl,statement:'Collects Synthetic #1-4',availability:'statement-found',extractorVersion:5}]},sender);
  await started;
  try{
    const view=await Promise.race([pageA.getCommittedLibraryView(),new Promise((_,reject)=>setTimeout(()=>reject(Error('View waited for writer')),100))]);
    assert.deepEqual(view.database,before.database);
    view.database.providerItems[candidate.id].title='Injected';
    assert.deepEqual((await pageA.getCommittedLibraryView()).database,before.database);
    for(const id of [hb,fan])assert.deepEqual(await dispatchExternal(query,{id}),handleExternalApiRequest(before.database,query));
  }finally{release();}
  assert.equal((await saving).ok,true);
  const after=await pageA.getCommittedLibraryView();assert.notDeepEqual(after.database,before.database);assert.deepEqual(after.database,await pageA.getDatabase());
  const denied=await dispatch({type:'LIBRARY_STORAGE_OPERATION',operation:'getCommittedLibraryView',args:[]},sender);assert.equal(denied.ok,false);
 },{storageEvents:true,concurrentQueries:true})],
 ['sender/callback diagnostics correlate transport and projection stages, reject foreign/repeated callbacks and remain title-free',()=>withWorker(async({memory,pageA,dispatchExternal,dispatch})=>{
  chrome.runtime.sendMessage=async()=>({ok:true});memory.values.galacticLibraryDatabase=fixture();await pageA.saveAllowedExternalClientIds([hb,fan]);
  const id='lookup-abcdef123456-007',sent=performance.timeOrigin+performance.now()-10;
  const response=await dispatchExternal({...query,diagnosticLookupId:id,diagnosticSentEpochMs:sent},{id:hb});assert.equal(response.ok,true);
  for(const stage of ['handler_delay','snapshot_read','snapshot_validation','snapshot_canonical','matching_index_build','matching_canonical'])assert.ok(response.performance.events.some(e=>e.stage===stage),stage);
  assert.ok(response.performance.scheduling.waitMs>=0);
  const callback={type:'MATCH_ITEMS_DIAGNOSTIC_CALLBACK',apiVersion:1,diagnosticLookupId:id,diagnosticCallbackEpochMs:performance.timeOrigin+performance.now()};
  assert.equal((await dispatchExternal(callback,{id:fan})).ok,false);
  assert.equal((await dispatchExternal(callback,{id:hb})).ok,true);
  assert.equal((await dispatchExternal(callback,{id:hb})).ok,false);
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},report=await dispatch({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'},sender);
  const row=report.companions.find(x=>x.id===id);for(const stage of ['client_round_trip','response_transport'])assert.ok(row.events.some(e=>e.stage===stage));
  assert.equal(JSON.stringify(row).includes('4001'),false);assert.equal(JSON.stringify(row).includes(hb),false);
 },{storageEvents:true,concurrentQueries:true})]
];
