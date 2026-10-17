import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {outputPath} from './audit-artifacts.mjs';
import {openObservationBrowser} from './observation-browser-harness.mjs';
import {instrumentColdMatching} from '../tests/observation-cold-instrumentation.mjs';
import {observationMatchingLibrary} from '../tests/observation-matching-fixture.js';
import {completionWriter} from '../tests/observation-completion-fixture.js';
import {providerSyncSnapshot} from '../tests/provider-sync-fixture.js';
const firefox=process.argv.includes('--firefox'),quietOptions=process.argv.includes('--quiet-options'),samples=Number(process.argv.find(a=>a.startsWith('--samples='))?.slice(10)??5),only=process.argv.find(a=>a.startsWith('--case='))?.slice(7),label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'before';
const stage2Root=resolve(process.argv.find(a=>a.startsWith('--stage2-root='))?.slice(14)??'.');
const baselineRoot=resolve(process.argv.find(a=>a.startsWith('--baseline-root='))?.slice(16)??'../gl-observation-stage1-baseline');
if(!/^[a-z0-9-]+$/.test(label)||!Number.isSafeInteger(samples)||samples<3||samples>20)throw Error('Use a simple label and 3..20 samples.');
const f=observationMatchingLibrary(14000),prime=completionWriter(f.db,{enabled:false}),initial=Object.values(f.db.providerItems).filter(i=>i.profileId===f.db.providers.epic.activeProfileId);
await prime.writer.replaceProviderItems('epic',initial,{profileLabel:'Personal',syncMode:'full',fullSyncAt:'2026-01-01'},providerSyncSnapshot('epic',initial));const raw=await prime.writer.getDatabase(),items=Object.values(raw.providerItems).filter(i=>i.profileId===raw.providers.epic.activeProfileId),snapshot=providerSyncSnapshot('epic',items);
// One fixed completion establishes identical effective catalog values for A-D.
const seed=completionWriter(raw),scan=await seed.writer.beginProviderScan('epic','Personal','full',false,1);await seed.writer.commitProviderScan('epic',items,{syncMode:'full'},snapshot,scan.scanToken,1);const effective=await seed.writer.getDatabase(),storage=seed.stored;
const cases=[['A',baselineRoot,'none'],['B',stage2Root,'none'],['C',stage2Root,'receipt'],['D',stage2Root,'folded']].filter(([name])=>!only||name===only),results=[];
if(!cases.length)throw Error('Case must be A, B, C or D.');
for(const [name,root,kind]of cases){
 const b=await openObservationBrowser({root,firefox,transformFiles:files=>instrumentColdMatching(files,{quietOptions})});
 try{
  await b.evaluate(`await faultClient.restoreDatabase(${JSON.stringify(effective)});return true;`);
  if(kind!=='none')await b.evaluate(`await faultArea.set(${JSON.stringify(Object.fromEntries(Object.entries(storage).filter(([k])=>['galacticLibraryDatabase','galacticLibraryObservations','galacticLibraryObservationHead'].includes(k))))});await chrome.storage.session.remove('galacticLibraryValidationCertificate');return true;`);
  if(kind==='folded')await b.evaluate(`await faultClient.saveOwnershipPolicy(${JSON.stringify(effective.ownershipPolicy)});return true;`);
  // Prime through the same query path in every case: ordinary getDatabase does
  // not guarantee issuance of a query certificate. Each subsequent worker is
  // still cold; Firefox reload deliberately drops this session proof.
  await b.evaluate(`const r=await chrome.runtime.sendMessage({type:'MATCH_ITEMS',apiVersion:1,items:${JSON.stringify(f.cases.bundle)}});if(!r.ok)throw Error(r.error);return true;`);
  assert.deepEqual(await b.evaluate(`return (await faultClient.getDatabase()).providerItems;`),effective.providerItems,'effective items differ');
  const rows=[];
  for(let n=0;n<samples;n++){
   const old=await b.evaluate(`return (await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'})).activity.worker;`),restartAt=performance.now();await b.restart();const restartMs=performance.now()-restartAt;
   const row=await b.evaluate(`const at=performance.now(),sentEpochMs=performance.timeOrigin+at,r=await chrome.runtime.sendMessage({type:'COLD_PROBE_MATCH',apiVersion:1,items:${JSON.stringify(f.cases.bundle)}}),wallMs=performance.now()-at;if(!r.ok)throw Error(r.error);const report=await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'});return {wallMs,sentEpochMs,diagnostics:r.coldDiagnostics,worker:report.activity.worker,journal:report.activity.events};`);assert.notEqual(row.worker,old);assert(row.diagnostics);rows.push({...row,restartMs});
  }
  const warm=await b.evaluate(`const out={};for(const [name,items]of Object.entries(${JSON.stringify(f.cases)})){const a=[];for(let n=0;n<20;n++){const at=performance.now(),r=await chrome.runtime.sendMessage({type:'MATCH_ITEMS',apiVersion:1,items});if(!r.ok)throw Error(r.error);a.push(performance.now()-at);}out[name]=a;}return out;`);
  const sizes=await b.evaluate(`const s=await faultArea.get(['galacticLibraryDatabase','galacticLibraryObservations','galacticLibraryObservationHead']);return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,new TextEncoder().encode(JSON.stringify(v)).length]));`);
  const writerHash=createHash('sha256').update((await readFile(resolve(root,'src/background/storage-writer.js'),'utf8')).replaceAll('\r\n','\n')).digest('hex');
  results.push({name,kind,root,writerHash,rows,warm,sizes});const output=await outputPath(`audit-artifacts/observation-stage2/cold-${firefox?'firefox':'chrome'}-${quietOptions?'quiet':'options'}-${label}${only?'-'+only:''}.json`);await writeFile(output,JSON.stringify({format:1,firefox,quietOptions,samples,notes:'Instrumented disposable packages; monotonic per-worker spans nest. Caller wall includes startup/transport. No storage values retained. Sizes are JSON bytes measured after timing, not native engine bytes. Firefox addon reload drops session certificate; Chrome worker stop retains it. A-D have identical effective item values.',results},null,2));console.log('PASS',name,rows.map(r=>r.wallMs.toFixed(1)).join(','),output);
 }finally{await b.close();}
}
