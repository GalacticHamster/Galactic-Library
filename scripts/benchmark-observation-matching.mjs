// Offline matching distributions; synthetic data, real writer/API/index code.
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {outputPath} from './audit-artifacts.mjs';
import {observationMatchingLibrary} from '../tests/observation-matching-fixture.js';
import {observationPacket,injectObservations} from '../tests/observation-fixture.js';
const root=resolve(process.argv.find(a=>a.startsWith('--root='))?.slice(7)??'.');
const baseline=process.argv.includes('--baseline'),sizes=(process.argv.find(a=>a.startsWith('--sizes='))?.slice(8)??'1000,14000,20000').split(',').map(Number);
if(sizes.some(n=>!Number.isSafeInteger(n)||n<100||n>20000))throw Error('Sizes must be 100..20000.');
const {createStorageWriter}=await import(pathToFileURL(resolve(root,'src/background/storage-writer.js'))),{handleExternalApiRequestAsync}=await import(pathToFileURL(resolve(root,'src/lib/external-api.js')));
const output=await outputPath(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??`audit-artifacts/provider-performance/observation-matching-${baseline?'baseline':'stage1'}.json`);
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {n:values.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)],minMs:sorted[0],maxMs:sorted.at(-1)};};
const results=[];
for(const size of sizes){
 const {db,cases,exact}=observationMatchingLibrary(size);
 const stored={galacticLibraryDatabase:structuredClone(db)},certs={};
 const area={get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,stored[k]??v]))),set:async updates=>Object.assign(stored,structuredClone(updates)),remove:async keys=>{for(const key of [keys].flat())delete stored[key];}};
 const certificateArea={get:async key=>({[key]:structuredClone(certs[key])}),set:async updates=>Object.assign(certs,structuredClone(updates)),remove:async key=>{delete certs[key];}};
 const create=()=>createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true,certificateArea});let writer=create();await writer.getQueryDatabase();await writer.beginProviderScan('steam','Personal','full',false,1);
 const counts={};const call=async(w,items)=>{const start=performance.now(),view=await w.getQueryDatabase(),result=await handleExternalApiRequestAsync(view,{type:'MATCH_ITEMS',apiVersion:1,items},{cacheImmutableRecords:true,cacheCommittedProjection:true,beginSpan:stage=>{counts[stage]=(counts[stage]??0)+1;return()=>{};}});if(!result.ok)throw Error(result.error);return {ms:performance.now()-start,result};};
 for(const items of Object.values(cases))await call(writer,items);
 const warm={},post={},checks={};for(const [name,items]of Object.entries(cases)){const samples=[];for(let n=0;n<20;n++){const r=await call(writer,items);samples.push(r.ms);checks[name]={owned:r.result.results[0].owned,matches:r.result.results[0].matches.length,possible:r.result.results[0].possibleMatches.length,partial:r.result.results[0].partialMatches.length};}warm[name]=summary(samples);}
 const builds=counts.matching_index_build??0;let packet=null;const materialization=[];
 for(let n=0;n<12;n++){
  if(!baseline){packet=await observationPacket(db,'steam',{whole:true,at:new Date(Date.UTC(2026,9,17,8,0,n)).toISOString()},packet);injectObservations(stored,writer,packet);}
  const start=performance.now();await writer.getQueryDatabase();materialization.push(performance.now()-start);
  for(const [name,items]of Object.entries(cases)){const r=await call(writer,items);(post[name]??=[]).push(r.ms);if(name==='exact'&&!baseline&&r.result.results[0].matches.find(m=>m.itemRef===exact.recordRef)?.evidence.checkedAt!==new Date(Date.UTC(2026,9,17,8,0,n)).toISOString())throw Error('Stale matching evidence');}
 }
 if((counts.matching_index_build??0)!==builds)throw Error('Observation update rebuilt identity index');
 const cold=[];for(let n=0;n<5;n++){const fresh=create(),r=await call(fresh,cases.bundle);cold.push(r.ms);}
 results.push({size: Object.keys(db.providerItems).length,nominalSize:size,warm,afterRevision:Object.fromEntries(Object.entries(post).map(([k,v])=>[k,summary(v)])),effectiveRevisionPreparation:summary(materialization),freshWriterBundle:summary(cold),indexBuildsBeforeRevisions:builds,indexBuildsAfterRevisions:builds,indexHits:counts.matching_index_hit,checks});
 await writeFile(output,JSON.stringify({format:1,root,baseline,environment:'Node structured-clone adapter; real writer/external API; fresh writers with shared protected session proof, not browser process restarts. Prep is included separately; 20 warm and 12 revision samples; five fresh writers.',results},null,2)+'\n');console.log(JSON.stringify(results.at(-1)));
}
console.log('Wrote',output);
