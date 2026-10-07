import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {withWorker} from './storage.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {DATABASE_STORAGE_KEY,EXTERNAL_CLIENT_IDS_STORAGE_KEY} from '../src/lib/constants.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';

const hb='a'.repeat(32),fan='b'.repeat(32);
const clients=[['HB',hb,'humble'],['FAN',fan,'fanatical']];
const book=n=>({providerItemId:'B'+String(n).padStart(9,'0'),title:`Concurrency collection ${n}`,mediaType:'book',ownership:'owned',metadata:{originType:'Purchase',detailUrl:'https://www.amazon.com/dp/B'+String(n).padStart(9,'0')}});
const request=provider=>({type:'MATCH_ITEMS',apiVersion:1,items:[{requestId:'owned',title:'Concurrency collection 1',mediaType:'book',excludeProviders:[provider]},{requestId:'possible',title:'Concurrency collection 1, 2nd Edition',mediaType:'book',excludeProviders:[provider]}]});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function gate(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

// Real message listeners and real refresh commits. The only artificial load is
// a slow atomic storage write; no Amazon, personal profile or inventory is used.
export async function measureCompanionRefreshLoad({worker=withWorker,holdMs=200,timeoutMs=100,librarySize=2}={}){
 let measured;
 await worker(async({dispatch,dispatchExternal,pageA,importItems,memory})=>{
  globalThis.chrome.runtime.sendMessage=async()=>({ok:true});
  await pageA.saveAllowedExternalClientIds([hb,fan]);await importItems('kindle',Array.from({length:librarySize},(_,n)=>book(n+1)));
  for(const [,id,provider] of clients)assert.equal((await dispatchExternal(request(provider),{id})).results[0].owned,true);
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}};
  const plan=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},sender);
  const candidate=plan.candidates[0],refresh={runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef};
  const saveRequest={type:'SAVE_KINDLE_COMIC_CONTENTS',refresh,entries:[{itemId:candidate.id,recordRef:candidate.recordRef,queuePosition:0,sourceUrl:candidate.detailUrl,statement:'Collects Synthetic #1',availability:'statement-found',extractorVersion:5}]};
  const writeStarted=gate(),set=memory.area.set;
  memory.area.set=async updates=>{
   if(updates[DATABASE_STORAGE_KEY]&&updates.galacticLibraryKindleContentsRefresh){writeStarted.resolve();await delay(holdMs);}
   return set(updates);
  };
  let saveFinished=false;
  const saving=dispatch(saveRequest,sender).then(response=>{saveFinished=true;return response;});await writeStarted.promise;
  const rows=clients.map(([client,id,provider])=>{
   const start=performance.now();let timer;
   const pending=dispatchExternal(request(provider),{id}).then(response=>({client,latencyMs:performance.now()-start,saveFinished,ok:response.ok,owned:response.results?.[0]?.owned,possible:response.results?.[1]?.possibleMatches?.length>0}));
   const deadline=Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve({client,timedOut:true,deadlineMs:timeoutMs}),timeoutMs);})]).finally(()=>clearTimeout(timer));
   return {pending,deadline};
  });
  const deadlineResults=await Promise.all(rows.map(row=>row.deadline));
  const saved=await saving;const actualResults=await Promise.all(rows.map(row=>row.pending));
  assert.equal(saved.ok,true,saved.error);assert.equal(saved.refresh.cursor,1);assert.equal(saved.refresh.status,'running');
  const db=await pageA.getDatabase();assert.equal(db.providerItems[candidate.id].metadata.enrichment.kindleProductComicContents.statement,'Collects Synthetic #1');
  assert.ok(db.kindleContentsObservations[candidate.recordRef],'Atomic save lost source history');
  measured={holdMs,timeoutMs,librarySize,deadlineResults,actualResults,cursor:saved.refresh.cursor,total:saved.refresh.total};
 },{storageEvents:true,concurrentQueries:true});
 return measured;
}

function memory(){
 const values={};let reads=0;
 const area={get:async defaults=>{reads++;return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,structuredClone(values[key]??value)]));},set:async updates=>Object.assign(values,structuredClone(updates)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}};
 const writer=createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true});
 return {values,area,writer,get reads(){return reads;}};
}
const query=database=>handleExternalApiRequest(database,request('humble'));

export const companionQueryConcurrencyTests=[
 ['HB and FAN MATCH_ITEMS complete during an active Refresh All atomic checkpoint rather than reaching the client deadline',async()=>{
  const result=await measureCompanionRefreshLoad();
  for(const row of result.deadlineResults){assert.equal(row.timedOut,undefined,`${row.client} timed out`);assert.equal(row.ok,true);assert.equal(row.owned,true);assert.equal(row.possible,true);assert.equal(row.saveFinished,false,'Query waited for the checkpoint commit');}
 }],
 ['cold companion and internal matching/status/reminder queries bypass an active refresh database read without mutating its queue',()=>withWorker(async({dispatch,dispatchExternal,pageA,importItems,memory})=>{
  globalThis.chrome.runtime.sendMessage=async()=>({ok:true});
  await pageA.saveAllowedExternalClientIds([hb,fan]);await importItems('kindle',[book(1),book(2)]);
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},plan=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},sender),candidate=plan.candidates[0];
  const held=memory.holdNextRead(),before=structuredClone(memory.values.galacticLibraryKindleContentsRefresh);
  const saving=dispatch({type:'SAVE_KINDLE_COMIC_CONTENTS',refresh:{runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef},entries:[{itemId:candidate.id,recordRef:candidate.recordRef,queuePosition:0,sourceUrl:candidate.detailUrl,statement:'Collects Synthetic #1',availability:'statement-found',extractorVersion:5}]},sender);
  await held.started.promise;let timer;
  try{
   const queries=Promise.all([
    ...clients.map(([,id,provider])=>dispatchExternal(request(provider),{id})),
    ...['PING','GET_STATUS','GET_REMINDERS'].map(type=>dispatchExternal({type,apiVersion:1},{id:hb})),
    dispatch(request('humble'),{id:chrome.runtime.id,url:chrome.runtime.getURL('options.html')})
   ]);
   const results=await Promise.race([queries,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Read-only query waited on refresh writer')),200);})]);
   for(const result of results)assert.equal(result.ok,true,result.error);
   assert.equal(results[0].results[0].owned,true);assert.equal(results[1].results[0].owned,true);
   assert.deepEqual(memory.values.galacticLibraryKindleContentsRefresh,before,'Cold query altered queue progress');
  }finally{clearTimeout(timer);held.released.resolve();await saving;}
 },{storageEvents:true,concurrentQueries:true})],
 ['committed query snapshots are detached, immutable and replaced only after successful writes, including clear/restore',async()=>{
  const store=memory(),{writer,values}=store;await writer.mergeProviderItems('kindle',[book(1)]);
  const first=await writer.getQueryDatabase(),before=store.reads;assert.equal(query(first).results[0].owned,true);assert.ok(Object.isFrozen(first.providerItems));
  assert.throws(()=>{first.providerItems['kindle:B000000001'].title='Injected';},TypeError);
  assert.equal(await writer.getQueryDatabase(),first);assert.equal(store.reads,before,'Warm query read the full database');
  const ordinary=await writer.getDatabase();ordinary.providerItems['kindle:B000000001'].title='Caller edit';
  assert.equal(query(await writer.getQueryDatabase()).results[0].owned,true,'Caller edit leaked into the snapshot');
  const returned=await writer.mergeProviderItems('kindle',[book(2)]);returned.providerItems['kindle:B000000001'].ownership='unknown';
  const committed=await writer.getQueryDatabase();assert.equal(query(committed).results[0].owned,true,'Mutable writer result leaked into committed query data');assert.equal(Object.keys(committed.providerItems).length,2);
  const set=store.area.set;store.area.set=async()=>{throw Error('Synthetic disk failure');};
  await assert.rejects(writer.saveOwnershipPolicy({allOwned:true}),/disk failure/);assert.equal(await writer.getQueryDatabase(),committed);
  store.area.set=set;await writer.restoreDatabase({...ordinary,providerItems:{},canonicalItems:{}});assert.equal(query(await writer.getQueryDatabase()).results[0].owned,false);
  await writer.clearDatabase();assert.equal(Object.keys((await writer.getQueryDatabase()).providerItems).length,0);assert.equal(values[DATABASE_STORAGE_KEY],undefined);
  await assert.rejects(writer.execute('getQueryDatabase'),/Unsupported/);
 }],
 ['snapshot publication failures cannot turn a successful authoritative commit into a reported failure',async()=>{
  const store=memory(),{writer}=store;await writer.mergeProviderItems('kindle',[book(1)]);await writer.getQueryDatabase();
  const clone=globalThis.structuredClone,set=store.area.set;let committed=false;
  store.area.set=async updates=>{await set(updates);committed=true;};
  globalThis.structuredClone=value=>{if(committed&&value?.schemaVersion)throw Error('Synthetic snapshot failure');return clone(value);};
  try{await writer.saveOwnershipPolicy({allOwned:true});}finally{globalThis.structuredClone=clone;store.area.set=set;}
  assert.equal(store.values[DATABASE_STORAGE_KEY].ownershipPolicy.allOwned,true);
  assert.equal((await writer.getQueryDatabase()).ownershipPolicy.allOwned,true,'Failed publication retained an older snapshot');
 }],
 ['snapshot queries retain identical full matching context, reviewed coverage, aliases and author conflicts',async()=>{
  const {writer}=memory();
  await writer.mergeProviderItems('kindle',[{...book(1),metadata:{...book(1).metadata,authors:['First Author'],isbn:'9780306406157'}},{...book(2),title:book(1).title,ownership:'unknown',metadata:{...book(2).metadata,authors:['Second Author']}}]);
  let db=await writer.getDatabase();const a=db.providerItems['kindle:B000000001'],b=db.providerItems['kindle:B000000002'];
  await writer.saveManualMatchDecision({itemIds:[a.id,b.id]},'different');await writer.saveTitleAliases(a.recordRef,['Approved collection alias']);
  const entry={series:'Synthetic',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'};
  await writer.saveContentReview(a.id,{statement:'Collects Synthetic #1',entries:[entry]});
  const queries=[request('humble'),{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Approved collection alias',mediaType:'book'},{title:'Offered collection',mediaType:'book',contents:[entry],contentsComplete:true},{title:a.title,mediaType:'book',authors:['First Author'],identifiers:{isbn:'9780306406157'}}]},{type:'GET_STATUS',apiVersion:1},{type:'GET_REMINDERS',apiVersion:1}];
  const compare=async()=>{db=await writer.getDatabase();const snapshot=await writer.getQueryDatabase();for(const query of queries)assert.deepEqual(handleExternalApiRequest(snapshot,query),handleExternalApiRequest(db,query));};
  await compare();await writer.saveOwnershipPolicy({allOwned:true});await compare();await writer.removeContentReview(a.id);await compare();
 }],
 ['external changes and cold reads cannot overwrite a newer commit; legacy identities migrate through the authoritative writer',async()=>{
  const store=memory(),{writer,values}=store;await writer.mergeProviderItems('kindle',[book(1)]);
  const held=gate(),started=gate(),get=store.area.get;let hold=true;
  store.area.get=async defaults=>{const result=await get(defaults);if(hold&&DATABASE_STORAGE_KEY in defaults){hold=false;started.resolve();await held.promise;}return result;};
  const reading=writer.getQueryDatabase();await started.promise;await writer.mergeProviderItems('kindle',[book(2)]);held.resolve();
  assert.equal(Object.keys((await reading).providerItems).length,2,'Late cold read replaced a committed snapshot');
  values[DATABASE_STORAGE_KEY].providerItems['kindle:B000000001'].ownership='unknown';writer.invalidateQuerySnapshot();
  assert.equal(query(await writer.getQueryDatabase()).results[0].owned,false,'Observed external edit left cached ownership');
  values[DATABASE_STORAGE_KEY].schemaVersion=999;writer.invalidateQuerySnapshot();await assert.rejects(writer.getQueryDatabase(),/Unsupported database schema/);
  values[DATABASE_STORAGE_KEY].schemaVersion=11;delete values[DATABASE_STORAGE_KEY].ownershipPolicy;
  delete values[DATABASE_STORAGE_KEY].providerItems['kindle:B000000001'].recordRef;
  const set=store.area.set;store.area.set=async()=>{throw Error('Synthetic migration write failure');};writer.invalidateQuerySnapshot();
  await assert.rejects(writer.getQueryDatabase(),/migration write failure/);assert.equal(values[DATABASE_STORAGE_KEY].schemaVersion,11,'Failed migration exposed a changed database');
  store.area.set=set;const migrated=await writer.getQueryDatabase();assert.equal(migrated.schemaVersion,13);assert.equal(values[DATABASE_STORAGE_KEY].schemaVersion,13);
  assert.equal(migrated.providerItems['kindle:B000000001'].recordRef,values[DATABASE_STORAGE_KEY].providerItems['kindle:B000000001'].recordRef,'Query exposed an uncommitted identity');
  const uncached=createStorageWriter(store.area);assert.equal(query(await uncached.getQueryDatabase()).results[0].owned,false);
  values[DATABASE_STORAGE_KEY].providerItems['kindle:B000000001'].ownership='owned';
  assert.equal(query(await uncached.getQueryDatabase()).results[0].owned,true,'Reader without change observation cached an unobserved value');
 }],
 ['query authorization stays fresh, refresh projections survive read-only queries, and real-worker invalidation covers all matching context',()=>withWorker(async({pageA,dispatch,dispatchExternal,importItems,memory,notifyStorageChange})=>{
  await pageA.saveAllowedExternalClientIds([hb]);await importItems('kindle',[book(1)]);
  const read=()=>dispatchExternal(request('humble'),{id:hb});assert.equal((await read()).results[0].owned,true);
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},plan=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},sender);
  const preflight={type:'CHECK_KINDLE_CONTENTS_REFRESH_ITEM',runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef,position:0};
  assert.equal((await dispatch(preflight,sender)).valid,true);await read();
  const afterQuery=await dispatch({...preflight,diagnosticLookupId:'lookup-abcdef123456-001'},sender);
  assert.ok(afterQuery.performance.events.some(event=>event.stage==='refresh_projection_hit'),'Read-only integration query discarded the safe refresh projection');
  memory.values[DATABASE_STORAGE_KEY].providerItems['kindle:B000000001'].ownership='unknown';notifyStorageChange({[DATABASE_STORAGE_KEY]:{newValue:memory.values[DATABASE_STORAGE_KEY]}});
  assert.equal((await read()).results[0].owned,false);
  await pageA.saveOwnershipPolicy({allOwned:true});assert.equal((await read()).results[0].owned,true);
  await pageA.saveAllowedExternalClientIds([]);assert.equal((await read()).ok,false,'Revoked client used a cached permission');
 },{storageEvents:true,concurrentQueries:true})],
 ['independent query reads do not bypass storage initialization or fail protection',async()=>{
  const held=gate(),store=memory(),writer=createStorageWriter(store.area,held.promise,{cacheQuerySnapshots:true});let settled=false;
  const result=writer.getQueryDatabase().then(()=>{settled=true;});await delay(5);assert.equal(settled,false);held.resolve();await result;
  const unavailable=Promise.reject(Error('Synthetic private storage failure'));unavailable.catch(()=>{});
  const blocked=createStorageWriter(store.area,unavailable);await assert.rejects(blocked.getQueryDatabase(),/private storage failure/);await assert.rejects(blocked.getQueryAllowedExternalClientIds(),/private storage failure/);
 }]
];
