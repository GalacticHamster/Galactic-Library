import assert from 'node:assert/strict';
import {PROVIDERS} from '../src/lib/constants.js';
import {OBSERVATION_KEY as KEY} from '../src/lib/observation-overlays.js';
import {completionWriter,completionBaseline,admitCompletion,finishCompletion} from './observation-completion-fixture.js';
import {providerSyncValue as value,providerSyncSnapshot,consoleProvider} from './provider-sync-fixture.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {handleExternalApiRequestAsync} from '../src/lib/external-api.js';
import {committedCatalogSnapshot,committedIdentityKey,isCommittedSnapshot} from '../src/lib/committed-snapshot.js';

async function clock(run){const Native=globalThis.Date;globalThis.Date=class extends Native{constructor(...args){super(...(args.length?args:['2026-10-18T09:00:00.000Z']));}static now(){return new Native('2026-10-18T09:00:00.000Z').getTime();}};try{return await run();}finally{globalThis.Date=Native;}}
async function oracle(provider,mode,base,values,details={}){
 return clock(async()=>{const h=completionWriter(base),old=completionWriter(base,{enabled:false}),s=await admitCompletion(h,provider,mode),o=await admitCompletion(old,provider,mode);
  old.stored.galacticLibraryProviderScans[provider].attemptRef=h.stored.galacticLibraryProviderScans[provider].attemptRef;
  await finishCompletion(h,provider,s,values,mode,details);await finishCompletion(old,provider,o,values,mode,details);
  assert.deepEqual(await h.writer.getDatabase(),await old.writer.getDatabase());return {h,old,s};
 });
}
export const observationCompletionTests=[
 ...PROVIDERS.map(provider=>['observation completion: '+provider+' full result equals validated full-save oracle',async()=>{
  const base=await completionBaseline(provider),{h}=await oracle(provider,'full',base,[value(provider)]);
  if(!consoleProvider(provider)){assert.equal(h.counts.databaseWrites,0);assert.equal(h.counts.receiptWrites,1);assert(!h.stages.includes('persist_validation'));}
  else assert.equal(h.counts.databaseWrites,1); // Existing additive full health has incremental mode: preserve it via fallback.
 }]),
 ...PROVIDERS.filter(p=>!['epic','nintendo'].includes(p)).map(provider=>['observation completion: '+provider+' subset dates and metadata equal quick oracle',async()=>{
  const a=value(provider),b={...a,providerItemId:provider==='xbox'?'9N0000000002':'second',title:'Other source record',metadata:{...a.metadata,...(provider==='xbox'?{productId:'9N0000000002'}:{})}},base=await completionBaseline(provider,[a,b]);
  const {h}=await oracle(provider,'incremental',base,[a],{quickSyncAt:'2026-10-18T09:00:00.000Z'});assert.equal(h.counts.databaseWrites,0);
 }]),
 ...['title','ownership','author','origin','removal','addition'].map(change=>['observation completion: '+change+' keeps validated catalog fallback',async()=>{
  const base=await completionBaseline('humble'),row=value('humble');let values=[row];
  if(change==='title')values=[{...row,title:'Changed title'}];if(change==='ownership')values=[{...row,ownership:'returned'}];if(change==='author')values=[{...row,metadata:{...row.metadata,authors:['Changed writer']}}];
  if(change==='origin')values=[{...row,metadata:{...row.metadata,sourceBundle:'Different bundle'}}];if(change==='removal')values=[];if(change==='addition')values.push({...row,providerItemId:'extra',title:'New edition'});
  if(change==='addition'){const h=completionWriter(base),s=await admitCompletion(h,'humble');await finishCompletion(h,'humble',s,values);assert.equal(h.counts.databaseWrites,1);assert.equal(Object.keys((await h.writer.getDatabase()).providerItems).length,2);return;}
  const {h}=await oracle('humble','full',base,values);assert.equal(h.counts.databaseWrites,1);assert(h.stages.includes('persist_validation'));
 }]),
 ['observation completion: lost receipt acknowledgement and stale lease are idempotent after restart',async()=>{
  const base=await completionBaseline('epic');let lose=true;const h=completionWriter(base,{afterSet:updates=>{if(lose&&updates[KEY]?.packet){lose=false;throw Error('Lost native acknowledgement');}},beforeSet:updates=>{if(updates.galacticLibraryProviderScans&&!Object.keys(updates.galacticLibraryProviderScans).length)throw Error('Interrupted lease cleanup');}}),s=await admitCompletion(h,'epic');
  await finishCompletion(h,'epic',s,[value('epic')]);const saved=await h.writer.getDatabase();assert(h.stored.galacticLibraryProviderScans.epic);
  const cold=completionWriter(null,{stored:h.stored});assert.deepEqual(await finishCompletion(cold,'epic',s,[value('epic')]),saved);assert.equal(cold.counts.receiptWrites,0);assert.equal(cold.counts.databaseWrites,0);assert.equal((await cold.writer.getCommittedLibraryView()).database.providers.epic.syncHealth.status,'succeeded');
  await assert.rejects(finishCompletion(cold,'epic',s,[{...value('epic'),title:'Different replay results'}]),/different results/);assert.deepEqual(await cold.writer.getDatabase(),saved);
 }],
 ['observation completion: rejected native receipt never acknowledges or advances evidence',async()=>{
  const base=await completionBaseline('epic'),h=completionWriter(base,{beforeSet:updates=>{if(updates[KEY]?.packet)throw Error('Quota exceeded');}}),s=await admitCompletion(h,'epic');await assert.rejects(finishCompletion(h,'epic',s,[value('epic')]),/Quota/);assert.deepEqual(await h.writer.getDatabase(),base);assert.equal(h.counts.databaseWrites,0);
 }],
 ['observation completion: independent provider receipts share a raw catalog and matching index',async()=>{
  const base=await completionBaseline('epic'),seed=completionWriter(base,{enabled:false});await seed.writer.replaceProviderItems('gog',[value('gog')],{profileLabel:'Personal',fullSyncAt:'2026-01-01',syncMode:'full'},providerSyncSnapshot('gog',[value('gog')]));const h=completionWriter(await seed.writer.getDatabase()),a=await admitCompletion(h,'epic'),b=await admitCompletion(h,'gog');
  const stages=[],q=async()=>handleExternalApiRequestAsync(await h.writer.getQueryDatabase(),{type:'MATCH_ITEMS',apiVersion:1,items:[{title:value('epic').title,mediaType:'game'}]},{cacheCommittedProjection:true,cacheImmutableRecords:true,beginSpan:stage=>{stages.push(stage);return ()=>{};}});await q();
  await finishCompletion(h,'epic',a,[value('epic')]);await finishCompletion(h,'gog',b,[value('gog')]);await q();assert.equal(h.counts.databaseWrites,0);assert.equal(stages.filter(s=>s==='matching_index_build').length,1);assert(stages.includes('matching_index_hit'));assert.equal(h.stored[KEY].packet.entries.length,2);
  assert.deepEqual(parseBackup(createBackup(await h.writer.getDatabase())),await h.writer.getDatabase());
 }],
 ['observation completion: Fanatical alternating origins retain exact independent dates and purchase counts',async()=>{
  const origins=[1,2].map(n=>({occurrenceRef:String(n).repeat(64),orderRef:'a'.repeat(64),bundleId:'bundle-'+n,bundleTitle:'Bundle '+n,purchasedAt:'2020-01-01',observedAt:'2020-01-01'})),row={...value('fanatical'),metadata:{...value('fanatical').metadata,purchaseOrigins:origins}},base=await completionBaseline('fanatical',[row]);
  const {h}=await oracle('fanatical','incremental',base,[{...row,metadata:{...row.metadata,purchaseOrigins:[origins[0]]}}],{quickSyncAt:'2026-10-18'});assert.equal(h.counts.databaseWrites,0);assert.equal(h.counts.receiptWrites,1);
  const first=Object.values((await h.writer.getDatabase()).providerItems)[0],s=await admitCompletion(h,'fanatical','incremental');await finishCompletion(h,'fanatical',s,[{...row,metadata:{...row.metadata,purchaseOrigins:[origins[1]]}}],'incremental',{quickSyncAt:'2026-10-19'});
  const item=Object.values((await h.writer.getDatabase()).providerItems)[0];assert.equal(item.metadata.purchaseOrigins.length,2);assert.equal(item.metadata.purchaseOrigins[0].observedAt,first.metadata.purchaseOrigins[0].observedAt);assert.equal(item.acquiredAt,first.acquiredAt);assert.equal(h.counts.databaseWrites,0);
 }],
 ['observation completion: first import after registered clear and restore remains usable',async()=>{
  const base=await completionBaseline('epic'),h=completionWriter(base),s=await admitCompletion(h,'epic');await finishCompletion(h,'epic',s,[value('epic')]);await h.writer.clearDatabase();
  const fresh=await admitCompletion(h,'epic');await finishCompletion(h,'epic',fresh,[value('epic')]);assert.equal(Object.keys((await h.writer.getDatabase()).providerItems).length,1);
  await h.writer.restoreDatabase(base);const again=await admitCompletion(h,'epic');await finishCompletion(h,'epic',again,[value('epic')]);assert.equal((await h.writer.getDatabase()).providers.epic.syncHealth.status,'succeeded');
 }],
 ['observation recovery: a changed full scan committed before a lost reply is retryable once',async()=>{
  const base=await completionBaseline('epic');let lose=true;const h=completionWriter(base,{afterSet:updates=>{if(lose&&updates.galacticLibraryDatabase){lose=false;throw Error('Lost catalog reply');}}}),s=await admitCompletion(h,'epic'),rows=[{...value('epic'),title:'Real new metadata'}];
  await assert.rejects(finishCompletion(h,'epic',s,rows),/Lost catalog/);const cold=completionWriter(null,{stored:h.stored}),saved=await cold.writer.getDatabase();assert.equal(Object.values(saved.providerItems)[0].title,'Real new metadata');assert.deepEqual(await finishCompletion(cold,'epic',s,rows),saved);assert.equal(cold.counts.databaseWrites,0);
 }],
 ['observation recovery: registered missing or malformed receipts are corruption, never empty observations',async()=>{
  for(const malformed of [null,{format:2,kind:'active'}]){const base=await completionBaseline('epic'),h=completionWriter(base),s=await admitCompletion(h,'epic');await finishCompletion(h,'epic',s,[value('epic')]);h.stored[KEY]=malformed;const next=completionWriter(null,{stored:h.stored});await assert.rejects(next.writer.getDatabase(),/damaged/);assert.equal(next.counts.databaseWrites,0);}
 }],
 ['observation completion: format-2 payload validation remains mandatory on warm and cold reads',async()=>{
  for(const cold of [false,true]){
   const h=completionWriter(await completionBaseline('epic')),s=await admitCompletion(h,'epic');await finishCompletion(h,'epic',s,[value('epic')]);await h.writer.getQueryDatabase();
   h.stored[KEY].packet.entries[0].observations.observedAt='not-a-date';
   const next=cold?completionWriter(null,{stored:h.stored}):h;if(!cold)next.writer.invalidateObservationSnapshot();
   await assert.rejects(next.writer.getQueryDatabase(),/incomplete or invalid/);assert.equal(next.counts.databaseWrites,0);
  }
 }],
 ['observation recovery: concurrent queries never undo an in-flight restore or clear journal',async()=>{
  for(const clear of [false,true]){
   let armed=false,release,entered;const gate=new Promise(done=>{release=done;}),waiting=new Promise(done=>{entered=done;}),wait=async()=>{if(armed){entered();await gate;}};
   const base=await completionBaseline('epic'),h=completionWriter(base,{beforeSet:async updates=>{if(!clear&&updates.galacticLibraryDatabase)await wait();},beforeRemove:async keys=>{if(clear&&[keys].flat().includes('galacticLibraryDatabase'))await wait();}}),s=await admitCompletion(h,'epic');await finishCompletion(h,'epic',s,[value('epic')]);const prior=await h.writer.getQueryDatabase();armed=true;
   const pending=clear?h.writer.clearDatabase():h.writer.restoreDatabase(base);await waiting;try{assert.deepEqual(await h.writer.getQueryDatabase(),prior);assert.equal(h.stored[KEY].kind,'saving');}finally{release();}await pending;
   const current=await h.writer.getDatabase();assert.equal(Object.keys(current.providerItems).length,clear?0:1);
  }
 }],
 ['observation completion: bounded compaction keeps identity indexes while replacing the raw certificate base',async()=>{
  const h=completionWriter(await completionBaseline('steam')),first=await admitCompletion(h,'steam');await finishCompletion(h,'steam',first,[value('steam')]);const stages=[];
  const query=async()=>handleExternalApiRequestAsync(await h.writer.getQueryDatabase(),{type:'MATCH_ITEMS',apiVersion:1,items:[{title:value('steam').title,mediaType:'game'}]},{cacheCommittedProjection:true,cacheImmutableRecords:true,beginSpan:stage=>{stages.push(stage);return ()=>{};}});
  await query();const original=committedCatalogSnapshot(await h.writer.getQueryDatabase()),identity=committedIdentityKey(original);
  for(let n=0;n<4;n++){const quick=await admitCompletion(h,'steam','incremental');await finishCompletion(h,'steam',quick,[],'incremental',{quickSyncAt:'2026-10-18'});const full=await admitCompletion(h,'steam');await finishCompletion(h,'steam',full,[value('steam')]);await query();}
  assert.equal(h.counts.databaseWrites,1);assert.equal(stages.filter(s=>s==='matching_index_build').length,1);const view=await h.writer.getQueryDatabase();assert(isCommittedSnapshot(view));assert.equal(committedCatalogSnapshot(view),view);assert.notEqual(view,original);assert.equal(committedIdentityKey(view),identity);assert(!isCommittedSnapshot(identity));
 }],
 ...['before-catalog','after-catalog','after-metadata'].map(point=>['observation recovery: '+point+' materialization recovers automatically',async()=>{
  const base=await completionBaseline('epic'),h=completionWriter(base),s=await admitCompletion(h,'epic');await finishCompletion(h,'epic',s,[value('epic')]);const effective=await h.writer.getDatabase();let once=true;
  const broken=completionWriter(null,{stored:h.stored,beforeSet:updates=>{if(once&&point==='before-catalog'&&updates.galacticLibraryDatabase){once=false;throw Error('Interrupted catalog');}},afterSet:updates=>{if(once&&((point==='after-catalog'&&updates.galacticLibraryDatabase)||(point==='after-metadata'&&updates[KEY]?.kind==='active'))){once=false;throw Error('Interrupted publication');}}});
  await assert.rejects(broken.writer.saveOwnershipPolicy({providers:{kobo:true}}));const next=completionWriter(null,{stored:h.stored}),db=await next.writer.getDatabase();assert.equal(Object.values(db.providerItems)[0].observedAt,Object.values(effective.providerItems)[0].observedAt);
  assert.equal(db.ownershipPolicy.providers.kobo,point==='before-catalog'?effective.ownershipPolicy.providers.kobo:true);assert.equal(h.stored[KEY].kind,'active');
 }])
];
