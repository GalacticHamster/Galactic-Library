// Offline worker controls only. Requires a private backup; never opens a browser
// or contacts a provider. Artifacts remain ignored and may contain private data.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
const args=process.argv.slice(2),file=args.find(x=>!x.startsWith('--'));
const runtime=args.find(x=>x.startsWith('--runtime='))?.slice(10),label=args.find(x=>x.startsWith('--label='))?.slice(8)??'after';
const modulePath=path=>runtime?pathToFileURL(resolve(runtime,path)):new URL('../'+path,import.meta.url);
const {withWorker}=await import(modulePath('tests/storage.js'));
const {handleExternalApiRequest}=await import(modulePath('src/lib/external-api.js'));
const backup=JSON.parse(await readFile(requireBackup(file),'utf8')),database=backup.database??backup;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now=()=>performance.timeOrigin+performance.now(),hb='a'.repeat(32),fan='b'.repeat(32);
const originalDate=Date,originalUUID=crypto.randomUUID;let sequence=0;
// Equal acquisition dates and server-created refs make complete saved database
// comparisons reproducible. This affects only this disposable Node process.
globalThis.Date=class extends originalDate{constructor(...args){super(...(args.length?args:['2026-10-06T00:00:00.000Z']));}static now(){return originalDate.parse('2026-10-06T00:00:00.000Z');}};
crypto.randomUUID=()=> 'eeeeeeee-eeee-4eee-8eee-'+String(++sequence).padStart(12,'0');
let result,persisted;
try{await withWorker(async({memory,dispatch,dispatchExternal,pageA})=>{
 chrome.runtime.sendMessage=async()=>({ok:true});memory.values.galacticLibraryDatabase=structuredClone(database);await pageA.saveAllowedExternalClientIds([hb,fan]);
 const titles=Object.values(database.providerItems).filter(x=>x.provider==='kindle').slice(0,20).flatMap(item=>[item.title,item.title+', 2nd Edition']);
 const requests=['humble','fanatical'].map(provider=>({type:'MATCH_ITEMS',apiVersion:1,items:titles.map(title=>({title,mediaType:'book',excludeProviders:[provider]}))}));
 const expected=requests.map(request=>handleExternalApiRequest(database,request));
 const coldStart=now(),cold=await dispatchExternal(requests[0],{id:hb}),coldMs=now()-coldStart;assert.deepEqual(cold,expected[0]);
 const repeated=[];
 for(let n=0;n<6;n++){
  const index=n%2,start=now();const response=await dispatchExternal({...requests[index],diagnosticLookupId:'lookup-aaaaaaaaaaaa-'+String(n+1).padStart(3,'0'),diagnosticSentEpochMs:start},{id:[hb,fan][index]});
  const callback=now();const {performance:timing,...plain}=response;assert.deepEqual(plain,expected[index]);
  repeated.push({client:index?'FAN':'HB',totalMs:callback-start,stages:timing?.events,scheduling:timing?.scheduling,resultDigest:hash(plain)});
 }
 const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},plan=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},sender);
 const probe=new Worker(new URL('./checkpoint-query-probe.mjs',import.meta.url),{workerData:{requests}});
 await new Promise((resolve,reject)=>{probe.once('error',reject);probe.once('message',resolve);});
 let armed=false,saveFinished=false,optionsPromise,preflightPromise;const pending=[],queries=[];let complete;
 const all=new Promise(resolve=>complete=resolve);
 const before=structuredClone(memory.values.galacticLibraryDatabase);
 probe.on('message',message=>{
  if(typeof message!=='object')return;const {index,sent,request}=message;
  if(index===0){
   const optionsStart=now();optionsPromise=(pageA.getCommittedLibraryView?pageA.getCommittedLibraryView():pageA.getDatabase()).then(view=>({database:view.database??view,totalMs:now()-optionsStart,saveFinished}));
   const checkStart=now();preflightPromise=dispatch({type:'CHECK_KINDLE_CONTENTS_REFRESH_ITEM',runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef,position:14,diagnosticLookupId:'lookup-dddddddddddd-001'},sender).then(response=>({totalMs:now()-checkStart,response}));
  }
  pending.push(dispatchExternal({...request,diagnosticLookupId:'lookup-bbbbbbbbbbbb-'+String(index+1).padStart(3,'0'),diagnosticSentEpochMs:sent},{id:[hb,fan][index]}).then(response=>{
   const callback=now();const {performance:timing,...plain}=response;assert.deepEqual(plain,expected[index]);
   queries.push({client:index?'FAN':'HB',totalMs:callback-sent,saveFinished,stages:timing?.events,scheduling:timing?.scheduling,resultDigest:hash(plain)});if(queries.length===2)complete();
  }));
 });
 const get=memory.area.get;memory.area.get=async defaults=>{const value=await get(defaults);if(!armed&&Object.hasOwn(defaults,'galacticLibraryDatabase')){armed=true;probe.postMessage('arm');}return value;};
 const saveStart=now();let saved;
 try{
  saved=await dispatch({type:'SAVE_KINDLE_COMIC_CONTENTS',diagnosticLookupId:'lookup-cccccccccccc-001',refresh:{runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef},entries:plan.candidates.slice(0,14).map((item,n)=>({itemId:item.id,recordRef:item.recordRef,queuePosition:n,sourceUrl:item.detailUrl,statement:'Collects Synthetic Performance #1-4',availability:'statement-found',extractorVersion:5}))},sender);
  const checkpointMs=now()-saveStart;saveFinished=true;await all;await Promise.all(pending);const options=await optionsPromise,preflight=await preflightPromise;
  assert.equal(saved.ok,true,saved.error);assert.equal(saved.refresh.cursor,14);assert.equal(preflight.response.valid,true);persisted=memory.values.galacticLibraryDatabase;
  const optionsVersion=hash(options.database)===hash(before)?'previous':hash(options.database)===hash(persisted)?'new':null;assert.ok(optionsVersion,'Options exposed uncommitted/changed data');
  result={label,records:Object.keys(database.providerItems).length,decisions:Object.keys(database.manualMatchDecisions).length,requests:titles.length,coldMs,repeated,checkpointMs,checkpointStages:saved.performance?.events,queries,options:{totalMs:options.totalMs,saveFinished:options.saveFinished,committedVersion:optionsVersion},preflight:{totalMs:preflight.totalMs,stages:preflight.response.performance?.events},databaseDigest:hash(persisted),inputDigest:hash(database)};
 }finally{await probe.terminate();}
},{storageEvents:true,concurrentQueries:true});}
finally{globalThis.Date=originalDate;crypto.randomUUID=originalUUID;}
await writeFile(await outputPath('audit-artifacts/committed-projection/'+label+'.json'),JSON.stringify(result,null,2));
await writeFile(await outputPath('audit-artifacts/committed-projection/'+label+'-database.json'),JSON.stringify(persisted));
console.log(JSON.stringify({...result,repeated:result.repeated.map(({stages,scheduling,...row})=>row),queries:result.queries.map(({stages,scheduling,...row})=>row),checkpointStages:undefined,preflight:{totalMs:result.preflight.totalMs}}));
