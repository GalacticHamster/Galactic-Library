// Exact full-save oracle replay. Synthetic only; no provider or browser access.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {outputPath} from './audit-artifacts.mjs';
import {PROVIDERS} from '../src/lib/constants.js';
import {providerSyncValue as value,providerSyncModes,consoleProvider} from '../tests/provider-sync-fixture.js';
import {completionWriter,completionBaseline,admitCompletion,finishCompletion} from '../tests/observation-completion-fixture.js';
const rows=[];
async function fixed(run){
 const Native=globalThis.Date,uuid=crypto.randomUUID;let count=0;
 globalThis.Date=class extends Native{constructor(...args){super(...(args.length?args:['2026-10-18T10:00:00.000Z']));}static now(){return new Native('2026-10-18T10:00:00.000Z').getTime();}};
 crypto.randomUUID=()=>`11111111-1111-4111-8111-${(++count).toString(16).padStart(12,'0')}`;
 try{return await run();}finally{globalThis.Date=Native;crypto.randomUUID=uuid;}
}
for(const provider of PROVIDERS){
 const one=value(provider),two={...one,providerItemId:provider==='xbox'?'9N0000000002':'second',title:'Second saved product',metadata:{...one.metadata,...(provider==='xbox'?{productId:'9N0000000002'}:{})}},base=await completionBaseline(provider,[one,two]);
 for(const mode of providerSyncModes(provider))for(const scenario of ['unchanged','changed','empty','incomplete','failed','cancelled']){
  const h=completionWriter(base),oracle=completionWriter(base,{enabled:false}),a=await admitCompletion(h,provider,mode),b=await admitCompletion(oracle,provider,mode);
  const fastLease=h.stored.galacticLibraryProviderScans[provider],oldLease=oracle.stored.galacticLibraryProviderScans[provider];oldLease.attemptRef=fastLease.attemptRef;oldLease.startedAt=fastLease.startedAt;
  let items=mode==='full'?[one,two]:[one];if(scenario==='changed')items=[{...one,title:'Changed source title'},...(mode==='full'?[two]:[])];if(scenario==='empty')items=[];
  const details={...(mode==='full'?{fullSyncAt:'2026-10-18T10:00:00.000Z'}:{quickSyncAt:'2026-10-18T10:00:00.000Z'}),...(scenario==='incomplete'?{scanDiagnostics:{failedRequestCount:1,incomplete:true}}:{})};
  const execute=async(w,s)=>{try{await fixed(()=>scenario==='failed'?w.writer.failProviderScan(provider,s.scanToken,1,{code:'network'}):scenario==='cancelled'?w.writer.cancelProviderScan(provider,fastLease.attemptRef):finishCompletion(w,provider,s,items,mode,details));return null;}catch(error){return error.message;}};
  const error=await execute(h,a),oracleError=await execute(oracle,b);assert.equal(error,oracleError,provider+'/'+mode+'/'+scenario);
  assert.deepEqual(await h.writer.getDatabase(),await oracle.writer.getDatabase(),provider+'/'+mode+'/'+scenario);
  if(h.counts.receiptWrites){assert.equal(h.counts.databaseWrites,0);assert(!h.stages.includes('persist_validation'));}
  rows.push({provider,mode,scenario,error,receiptWrites:h.counts.receiptWrites,databaseWrites:h.counts.databaseWrites,oracleDatabaseWrites:oracle.counts.databaseWrites,validations:h.stages.filter(s=>s==='persist_validation').length});
 }
}
assert.equal(rows.length,156);const result={format:1,providers:14,modes:26,comparisons:rows.length,receiptComparisons:rows.filter(r=>r.receiptWrites).length,fullWritesAvoided:rows.reduce((n,r)=>n+r.oracleDatabaseWrites-r.databaseWrites,0),expectedRejections:rows.filter(r=>r.error).map(({provider,mode,scenario,error})=>({provider,mode,scenario,error})),rows};
const output=await outputPath('audit-artifacts/observation-stage2/provider-parity.json');await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,rows:undefined,output}));
