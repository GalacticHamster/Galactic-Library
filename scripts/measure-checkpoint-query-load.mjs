import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
const args=process.argv.slice(2),runtime=args.find(x=>x.startsWith('--runtime='))?.slice(10);
const file=args.find(x=>!x.startsWith('--')),label=args.find(x=>x.startsWith('--label='))?.slice(8)??'measurement';
const optionsLoad=args.includes('--options');
const {withWorker}=await import(runtime?pathToFileURL(resolve(runtime,'tests/storage.js')):new URL('../tests/storage.js',import.meta.url));
const input=JSON.parse(await readFile(requireBackup(file),'utf8')),database=input.database??input;
const hb='a'.repeat(32),fan='b'.repeat(32),now=()=>performance.timeOrigin+performance.now();
let measurement;
await withWorker(async({memory,dispatch,dispatchExternal,pageA})=>{
 globalThis.chrome.runtime.sendMessage=async()=>({ok:true});
 memory.values.galacticLibraryDatabase=structuredClone(database);
 await pageA.saveAllowedExternalClientIds([hb,fan]);
 const items=Object.values(database.providerItems).filter(x=>x.provider==='kindle').slice(0,40).map(item=>({title:item.title,mediaType:'book'}));
 const requests=['humble','fanatical'].map(provider=>({type:'MATCH_ITEMS',apiVersion:1,items:items.map(x=>({...x,excludeProviders:[provider]}))}));
 for(const [index,id] of [hb,fan].entries())assert.equal((await dispatchExternal(requests[index],{id})).ok,true);
 const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},plan=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},sender);
 const pending=[],rows=[];let resolveAll;const all=new Promise(resolve=>{resolveAll=resolve;});
 const probe=new Worker(new URL('./checkpoint-query-probe.mjs',import.meta.url),{workerData:{requests}});
 await new Promise((resolve,reject)=>{probe.once('error',reject);probe.once('message',resolve);});
 probe.on('message',message=>{
  if(typeof message!=='object')return;
  const entered=now(),{index,sent,request}=message;
  pending.push(dispatchExternal({...request,diagnosticLookupId:'lookup-aaaaaaaaaaaa-'+String(index+1).padStart(3,'0'),diagnosticSentEpochMs:sent},{id:[hb,fan][index]}).then(response=>{
   const row={client:['HB','FAN'][index],sendEpochMs:sent,handlerEpochMs:entered,handlerDelayMs:entered-sent,totalMs:now()-sent,saveFinished,ok:response.ok,results:response.results?.length,scheduling:response.performance?.scheduling,stages:response.performance?.events};rows.push(row);if(rows.length===2)resolveAll();
  }));
 });
 const get=memory.area.get;let armed=false,reading=false,readMs=0,writeMs=0,dbReads=0,saveFinished=false;
 memory.area.get=async defaults=>{const start=now(),result=await get(defaults);if(Object.hasOwn(defaults,'galacticLibraryDatabase')){readMs+=now()-start;dbReads++;if(!armed&&dbReads===(optionsLoad?2:1)){armed=true;reading=true;probe.postMessage('arm');}}return result;};
 const set=memory.area.set;memory.area.set=async updates=>{const start=now();await set(updates);writeMs+=now()-start;};
 const start=now();
 const saving=dispatch({type:'SAVE_KINDLE_COMIC_CONTENTS',diagnosticLookupId:'lookup-bbbbbbbbbbbb-001',refresh:{runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef},entries:plan.candidates.slice(0,14).map((candidate,n)=>({itemId:candidate.id,recordRef:candidate.recordRef,queuePosition:n,sourceUrl:candidate.detailUrl,statement:'Collects Synthetic Performance #1-4',availability:'statement-found',extractorVersion:5}))},sender);
 const result=await saving;const checkpointMs=now()-start;
 saveFinished=true;let optionsMs=null;
 if(optionsLoad){const optionsStart=now();await pageA.getDatabase();optionsMs=now()-optionsStart;}
 try{await all;await Promise.all(pending);}finally{await probe.terminate();}
 assert.equal(result.ok,true,result.error);assert.equal(result.refresh.cursor,14);assert.equal(reading,true);
 const persisted=memory.values.galacticLibraryDatabase;
 for(const candidate of plan.candidates.slice(0,14))assert.ok(persisted.kindleContentsObservations[candidate.recordRef]);
 measurement={label,recordCount:Object.keys(database.providerItems).length,checkpointMs,optionsMs,readMs,writeMs,cursor:result.refresh.cursor,queries:rows,checkpointStages:result.performance?.events};
},{storageEvents:true,concurrentQueries:true});
console.log(JSON.stringify(measurement));await writeFile(await outputPath('audit-artifacts/checkpoint-query-performance/'+label+'.json'),JSON.stringify(measurement,null,2));
