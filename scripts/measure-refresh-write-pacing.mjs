// Offline control, supplied private backup only. Never connects to a provider,
// live extension or browser profile. Generated evidence stays ignored.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
const args=process.argv.slice(2),file=args.find(x=>!x.startsWith('--'));
const runtime=args.find(x=>x.startsWith('--runtime='))?.slice(10),label=args.find(x=>x.startsWith('--label='))?.slice(8)??'after';
const modulePath=path=>runtime?pathToFileURL(resolve(runtime,path)):new URL('../'+path,import.meta.url);
const {withWorker}=await import(modulePath('tests/storage.js'));
const {validateDatabaseAsync}=await import(modulePath('src/lib/models.js'));
const {handleExternalApiRequest}=await import(modulePath('src/lib/external-api.js'));
const backup=JSON.parse(await readFile(requireBackup(file),'utf8')),database=backup.database??backup;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now=()=>performance.timeOrigin+performance.now(),client='a'.repeat(32);
async function validationProfiles(){
 const profiles=[];
 for(let n=0;n<3;n++){
  const stages={},start=performance.now();let stage='other',since=start,cpu=0,wait=0,yields=0;
  await validateDatabaseAsync(database,{onStage:next=>{const at=performance.now();stages[stage]=(stages[stage]??0)+at-since;stage=next;since=at;},onSlice:ms=>{cpu+=ms;},onWait:ms=>{wait+=ms;yields++;}});
  const end=performance.now();stages[stage]=(stages[stage]??0)+end-since;profiles.push({totalMs:end-start,cpuMs:cpu,waitMs:wait,yields,stages});
 }
 return profiles;
}
if(args.includes('--validation-only')){
 const profiles=await validationProfiles();
 await writeFile(await outputPath('audit-artifacts/refresh-write-pacing/validation-cold.json'),JSON.stringify(profiles,null,2));
 console.log(JSON.stringify(profiles));process.exit(0);
}
const originalDate=Date,originalUUID=crypto.randomUUID;let sequence=0;
globalThis.Date=class extends originalDate{constructor(...args){super(...(args.length?args:['2026-10-06T00:00:00.000Z']));}static now(){return originalDate.parse('2026-10-06T00:00:00.000Z');}};
crypto.randomUUID=()=> 'eeeeeeee-eeee-4eee-8eee-'+String(++sequence).padStart(12,'0');
let result,persisted;
try{
 await withWorker(async({memory,dispatch,dispatchExternal,pageA})=>{
  chrome.runtime.sendMessage=async()=>({ok:true});memory.values.galacticLibraryDatabase=structuredClone(database);await pageA.saveAllowedExternalClientIds([client]);
  const items=Object.values(database.providerItems).filter(x=>x.provider==='kindle').slice(0,20).flatMap(item=>[item.title,item.title+', 2nd Edition']);
  const request={type:'MATCH_ITEMS',apiVersion:1,items:items.map(title=>({title,mediaType:'book',excludeProviders:['humble']}))};
  const coldStart=now(),cold=await dispatchExternal({...request,diagnosticLookupId:'lookup-aaaaaaaaaaaa-001',diagnosticSentEpochMs:coldStart},{id:client});
  const coldMs=now()-coldStart,{performance:timing,...plain}=cold;assert.deepEqual(plain,handleExternalApiRequest(database,request));
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},plan=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},sender);
  const start=now(),saved=await dispatch({type:'SAVE_KINDLE_COMIC_CONTENTS',diagnosticLookupId:'lookup-bbbbbbbbbbbb-001',refresh:{runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef},entries:plan.candidates.slice(0,14).map((item,n)=>({itemId:item.id,recordRef:item.recordRef,queuePosition:n,sourceUrl:item.detailUrl,statement:'Collects Synthetic Performance #1-4',availability:'statement-found',extractorVersion:5}))},sender);
  const checkpointMs=now()-start;assert.equal(saved.ok,true,saved.error);assert.equal(saved.refresh.cursor,14);persisted=memory.values.galacticLibraryDatabase;
  const after=await dispatchExternal(request,{id:client});assert.deepEqual(after,handleExternalApiRequest(persisted,request));assert.deepEqual(after,plain,'Contents acquisition altered identity matching');
  result={label,records:Object.keys(database.providerItems).length,compactBytes:Buffer.byteLength(JSON.stringify(database)),coldMs,coldStages:timing.events,coldScheduling:timing.scheduling,checkpointMs,checkpointStages:saved.performance.events,inputDigest:hash(database),databaseDigest:hash(persisted),matchingDigest:hash(plain)};
 },{storageEvents:true,concurrentQueries:true});
 result.validationProfiles=await validationProfiles();
 const byteSize=value=>Buffer.byteLength(JSON.stringify(value));
 result.dimensions={canonicalRecords:Object.keys(database.canonicalItems).length,decisions:Object.keys(database.manualMatchDecisions).length,historyEntries:Object.keys(database.enrichmentHistory??{}).length,historyBytes:byteSize(database.enrichmentHistory),observations:Object.keys(database.kindleContentsObservations??{}).length,observationBytes:byteSize(database.kindleContentsObservations),g5Records:Object.values(database.providerItems).filter(item=>item.metadata.enrichment?.kindleProductComicContents?.extractorVersion===5).length};
}finally{globalThis.Date=originalDate;crypto.randomUUID=originalUUID;}
await writeFile(await outputPath('audit-artifacts/refresh-write-pacing/'+label+'.json'),JSON.stringify(result,null,2));
await writeFile(await outputPath('audit-artifacts/refresh-write-pacing/'+label+'-database.json'),JSON.stringify(persisted));
console.log(JSON.stringify({...result,coldStages:undefined,checkpointStages:undefined}));
