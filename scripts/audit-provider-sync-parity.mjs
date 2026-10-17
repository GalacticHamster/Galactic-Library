// Offline baseline probe. All libraries/accounts/items are disposable synthetic
// data; this never contacts providers or reads browser storage/private exports.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {outputPath} from './audit-artifacts.mjs';
import {PROVIDERS} from '../src/lib/constants.js';
import {PROVIDER_SOURCES} from '../src/lib/metadata-validation.js';
import {createEmptyDatabase,validateDatabase,normalizeProviderItem} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {performanceWriter} from '../tests/provider-performance-fixture.js';
import {PROVIDER_CHECKS_KEY} from '../src/lib/provider-scan-checks.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {snapshotFixture} from '../tests/storage.js';

const modes=p=>p==='epic'||p==='nintendo'?['full']:['full','incremental'];
const consoleProvider=p=>['nintendo','playstation','xbox'].includes(p);
const fingerprint='a'.repeat(64),old='2020-01-01T00:00:00.000Z';
function raw(provider){
 const mediaType=['kindle','kobo','humble','fanatical'].includes(provider)?'book':provider==='audible'?'audiobook':['amazon-video','fandango-at-home'].includes(provider)?'movie':'game';
 return {provider,providerItemId:provider==='xbox'?'9N0000000001':'synthetic-1',title:'Synthetic parity record',mediaType,ownership:'owned',metadata:{source:PROVIDER_SOURCES[provider],
  ...(provider==='xbox'?{productId:'9N0000000001',accessBasis:'personal-owned-web-catalog',accessTypes:[1]}:{})}};
}
function snapshot(provider,items){
 if(!consoleProvider(provider))return snapshotFixture(provider,items);
 return completeProviderSnapshot(provider,items,[completedScope(provider==='nintendo'?'non-hidden-virtual-cards':provider==='playstation'?'ps4-ps5-purchased':'owned-web-library',items.length,provider==='playstation'?null:items.length,provider==='playstation'?'pagination-end':'reported-count')]);
}
function library(provider,values=[raw(provider)]){
 const database=createEmptyDatabase(),profile=newProviderProfile(provider,'Personal');
 if(consoleProvider(provider))profile.sourceAccountFingerprint=fingerprint;
 profile.state={connected:true,lastSync:old,fullSyncAt:old,syncMode:'full',recordCount:values.length,...(provider==='humble'?{syncState:{knownPurchaseIds:[]}}:provider==='fanatical'?{syncState:{knownOrderFingerprints:[]}}:{})};
 database.providerProfiles[profile.profileId]=profile;database.providers[provider]={...profile.state,activeProfileId:profile.profileId};
 for(const value of values){const item=normalizeProviderItem({...value,profileId:profile.profileId},old,{profileKeySpace:profile.keySpace});database.providerItems[item.id]=item;}
 return validateDatabase(database);
}
async function probe(provider,mode,scenario){
 const base=library(provider),h=performanceWriter(base);await h.writer.getQueryDatabase();
 const before={...h.counts},lastEvent=h.journal.report().events.at(-1)?.id??0,events=[];const clock=()=>performance.now();
 const timing={begin(stage){const at=clock();return()=>events.push({stage,durationMs:clock()-at});}};
 const values=scenario==='empty-check'?[]:[raw(provider)],at=clock();
 const scan=await h.writer.execute('beginProviderScan',[provider,'Personal',mode,false,1,null,false,consoleProvider(provider)?fingerprint:null],timing),prepared=clock();
 const lease=h.stored.galacticLibraryProviderScans[provider];
 if(scenario==='failed')await h.writer.execute('failProviderScan',[provider,scan.scanToken,1,{code:'network'}],timing);
 else if(scenario==='cancelled')await h.writer.execute('cancelProviderScan',[provider,lease.attemptRef],timing);
 else await h.writer.execute('commitProviderScan',[provider,values,{syncMode:mode,...(mode==='full'?{fullSyncAt:new Date().toISOString()}:{quickSyncAt:new Date().toISOString()}),...(provider==='humble'?{syncState:{knownPurchaseIds:[]}}:provider==='fanatical'?{syncState:{knownOrderFingerprints:[]}}:{})},mode==='full'||consoleProvider(provider)?snapshot(provider,values):undefined,scan.scanToken,1,false,consoleProvider(provider)?fingerprint:null],timing);
 const finished=clock(),counts=Object.fromEntries(Object.keys(before).map(k=>[k,h.counts[k]-before[k]]));
 const view=await h.writer.getDatabase(),prior=Object.values(base.providerItems)[0],next=view.providerItems[prior.id];
 const snapshotEvents=h.journal.report().events.filter(e=>e.id>lastEvent&&e.stage==='snapshot_change');
 const publications=snapshotEvents.filter(e=>e.reason==='published').length,invalidations=snapshotEvents.filter(e=>e.reason==='invalidated').length;
 // Start and completion validation spans overlap detailed validator slices;
 // count invocations, never sum slices as extra validation passes.
 const validations=events.filter(e=>['persist_validation','read_validation'].includes(e.stage)).length;
 assert(next&&next.title===prior.title&&next.ownership===prior.ownership);
 const restored=parseBackup(createBackup(view));assert.equal(restored.providerItems[prior.id].observedAt,next.observedAt);
 return {provider,mode,scenario,preparationMs:prepared-at,acquisitionMs:0,completionMs:finished-prepared,counts,semanticValidationPasses:validations,snapshotPublications:publications,snapshotInvalidations:invalidations,receipt:Boolean(h.stored[PROVIDER_CHECKS_KEY]),observedAtChanged:prior.observedAt!==next.observedAt,updatedAtChanged:prior.updatedAt!==next.updatedAt,retainedRecords:Object.keys(view.providerItems).length,status:view.providers[provider].syncHealth?.status};
}
const rows=[];
for(const provider of PROVIDERS){
 for(const mode of modes(provider)){
  rows.push(await probe(provider,mode,'reobserved-identical'));
  // These APIs can legitimately receive no new candidates. Console page
  // contracts require their complete supported listing; Epic has no quick UI.
  if(mode==='incremental'&&!consoleProvider(provider))rows.push(await probe(provider,mode,'empty-check'));
  for(const scenario of ['failed','cancelled'])rows.push(await probe(provider,mode,scenario));
 }
}
assert.equal(new Set(rows.map(r=>r.provider)).size,PROVIDERS.length);
assert.equal(rows.filter(r=>r.scenario==='reobserved-identical').length,26);
for(const row of rows){
 if(row.mode==='full'&&row.scenario==='reobserved-identical')assert.equal(row.counts.databaseWrites,2);
 if(row.scenario==='empty-check')assert.equal(row.counts.databaseWrites,0);
}
// Demonstrate why refreshing a provider's entire saved profile is unsafe for
// additive console imports: unobserved retained records must keep their date.
const consoleValues=[raw('xbox'),{...raw('xbox'),providerItemId:'9N0000000002',title:'Synthetic retained record',metadata:{...raw('xbox').metadata,productId:'9N0000000002'}}];
const consoleBase=library('xbox',consoleValues),consoleWriter=performanceWriter(consoleBase);
await consoleWriter.writer.getQueryDatabase();
const consoleScan=await consoleWriter.writer.beginProviderScan('xbox','Personal','full',false,1,null,false,fingerprint);
await consoleWriter.writer.commitProviderScan('xbox',[consoleValues[0]],{syncMode:'full',fullSyncAt:new Date().toISOString()},snapshot('xbox',[consoleValues[0]]),consoleScan.scanToken,1,false,fingerprint);
const consoleAfter=await consoleWriter.writer.getDatabase(),dates=Object.values(consoleAfter.providerItems).map(item=>item.observedAt);
assert.equal(dates.filter(d=>d===old).length,1);assert.equal(dates.filter(d=>d!==old).length,1);
// Fanatical reobserves only the returned purchase origins, retaining older
// origins for the same product. One provider-wide timestamp cannot express it.
const origins=['a','b'].map((c,i)=>({occurrenceRef:c.repeat(64),orderRef:(i?'d':'c').repeat(64),bundleId:'synthetic-'+i,bundleTitle:'Synthetic bundle '+i,purchasedAt:old,observedAt:old}));
const fanRaw={...raw('fanatical'),metadata:{...raw('fanatical').metadata,purchaseOrigins:origins}},fan=performanceWriter(library('fanatical',[fanRaw]));
await fan.writer.getQueryDatabase();const fanScan=await fan.writer.beginProviderScan('fanatical','Personal','full',false,1);
const observed={...fanRaw,metadata:{...fanRaw.metadata,purchaseOrigins:[origins[0]]}};
await fan.writer.commitProviderScan('fanatical',[observed],{syncMode:'full',fullSyncAt:new Date().toISOString()},snapshot('fanatical',[observed]),fanScan.scanToken,1);
const fanAfter=Object.values((await fan.writer.getDatabase()).providerItems)[0].metadata.purchaseOrigins;
assert.equal(fanAfter.filter(o=>o.observedAt===old).length,1);assert.equal(fanAfter.filter(o=>o.observedAt!==old).length,1);
const result={format:1,baseline:'b75ab51',implementation:false,environment:'Node synthetic storage adapter; source acquisition is zero; no native observer or physical disk timing',rows,counterexamples:{consoleUnobservedRecordDatePreserved:true,fanaticalUnobservedOriginDatePreserved:true}};
const path=await outputPath(process.argv[2]??'audit-artifacts/provider-performance/provider-parity-baseline.json');
await writeFile(path,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({providers:PROVIDERS.length,exposedModes:26,probes:rows.length,counterexamples:result.counterexamples,output:path}));
