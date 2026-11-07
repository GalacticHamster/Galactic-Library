import assert from 'node:assert/strict';
import {PROVIDERS} from '../src/lib/constants.js';
import {validateDatabase} from '../src/lib/models.js';
import {OBSERVATION_KEY as KEY,OBSERVATION_HEAD_KEY as HEAD,OBSERVATION_LIMITS,validateObservationOverlay,materializeObservations,observationHead,consolidateObservations} from '../src/lib/observation-overlays.js';
import {providerCheckDigest} from '../src/lib/provider-scan-checks.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {isCommittedSnapshot,committedCatalogSnapshot} from '../src/lib/committed-snapshot.js';
import {handleExternalApiRequestAsync} from '../src/lib/external-api.js';
import {createValidationCertificates} from '../src/lib/validation-certificate.js';
import {performanceWriter} from './provider-performance-fixture.js';
import {providerSyncLibrary as library,providerSyncValue as value,providerSyncSnapshot as snapshot,oldObservation} from './provider-sync-fixture.js';
import {observationPacket,observationEntry,observationDate,injectObservations} from './observation-fixture.js';
const first=db=>Object.values(db.providerItems)[0];
const request={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Synthetic parity record',mediaType:'game'}]};
const query=(db,stages=[])=>handleExternalApiRequestAsync(db,request,{cacheImmutableRecords:true,cacheCommittedProjection:true,beginSpan:stage=>{stages.push(stage);return()=>{};}});
export const observationOverlayTests=[
 ...PROVIDERS.map(provider=>['observations: '+provider+' complete views, mutable reads and self-contained backups retain raw evidence',async()=>{
  const db=library(provider),h=performanceWriter(db),raw=await h.writer.getQueryDatabase(),packet=await observationPacket(db,provider,{whole:provider!=='fanatical'});injectObservations(h.stored,h.writer,packet);
  const effective=await h.writer.getQueryDatabase();assert.equal(committedCatalogSnapshot(effective),raw);assert(!isCommittedSnapshot(effective));assert.equal(first(effective).observedAt,observationDate);assert.equal(first(raw).observedAt,oldObservation);assert.deepEqual(h.stored.galacticLibraryDatabase,db);
  const mutable=await h.writer.getDatabase();assert.equal(first(mutable).observedAt,observationDate);assert.equal((await h.writer.getCommittedLibraryView()).database.providers[provider].fullSyncAt,observationDate);
  const restored=parseBackup(createBackup(mutable));assert.deepEqual(restored.providerItems,mutable.providerItems);assert.equal(h.counts.databaseWrites,0);
  first(mutable).title='Caller mutation';assert.equal(first(await h.writer.getQueryDatabase()).title,first(db).title);
 }]),
 ...['xbox','nintendo','playstation'].map(provider=>['observations: '+provider+' additive subset never refreshes omitted records',async()=>{
  const one=value(provider),two={...one,providerItemId:provider==='xbox'?'9N0000000002':'synthetic-2',title:'Retained',metadata:{...one.metadata,...(provider==='xbox'?{productId:'9N0000000002'}:{})}},db=library(provider,[one,two]),h=performanceWriter(db),items=Object.values(db.providerItems);injectObservations(h.stored,h.writer,await observationPacket(db,provider,{refs:[items[0].recordRef]}));
  const v=await h.writer.getQueryDatabase();assert.equal(v.providerItems[items[0].id].observedAt,observationDate);assert.equal(v.providerItems[items[1].id].observedAt,oldObservation);
 }]),
 ['observations: Fanatical origin subsets consolidate independently and remain purchase-neutral',async()=>{
  const origins=[1,2].map(n=>({occurrenceRef:String(n).repeat(64),orderRef:'a'.repeat(64),bundleId:'bundle-'+n,bundleTitle:'Bundle '+n,purchasedAt:oldObservation,observedAt:oldObservation}));
  const raw=value('fanatical'),db=library('fanatical',[{...raw,metadata:{...raw.metadata,purchaseOrigins:origins}}]),h=performanceWriter(db);
  let packet=await observationPacket(db,'fanatical',{originRefs:[origins[0].occurrenceRef]});injectObservations(h.stored,h.writer,packet);
  let current=first(await h.writer.getQueryDatabase());assert.equal(current.metadata.purchaseOrigins[0].observedAt,observationDate);assert.equal(current.metadata.purchaseOrigins[1].observedAt,oldObservation);
  packet=await observationPacket(db,'fanatical',{originRefs:[origins[1].occurrenceRef],at:'2026-10-18T00:00:00.000Z'},packet);injectObservations(h.stored,h.writer,packet);current=first(await h.writer.getQueryDatabase());assert.equal(current.metadata.purchaseOrigins[0].observedAt,observationDate);assert.equal(current.metadata.purchaseOrigins[1].observedAt,'2026-10-18T00:00:00.000Z');assert.equal(current.metadata.purchaseOrigins.length,2);assert.equal(current.acquiredAt,first(db).acquiredAt);
 }],
 ['observations: Kobo full preserves updatedAt and sparse quick preserves both record clocks',async()=>{
  for(const mode of ['full','incremental']){const db=library('kobo'),h=performanceWriter(db);injectObservations(h.stored,h.writer,await observationPacket(db,'kobo',{mode}));const item=first(await h.writer.getQueryDatabase());assert.equal(item.updatedAt,oldObservation);assert.equal(item.observedAt,mode==='full'?observationDate:oldObservation);}
  const db=library('kobo'),h=performanceWriter(db),full=await observationPacket(db,'kobo',{whole:true}),quick=await observationPacket(db,'kobo',{mode:'incremental',at:'2026-10-18T00:00:00.000Z'},full);
  injectObservations(h.stored,h.writer,quick);const view=await h.writer.getDatabase();assert.equal(first(view).observedAt,observationDate);assert.equal(first(view).updatedAt,oldObservation);assert.equal(view.providers.kobo.fullSyncAt,observationDate);assert.equal(view.providers.kobo.quickSyncAt,'2026-10-18T00:00:00.000Z');
  const later=await observationPacket(db,'kobo',{whole:true,at:'2026-10-19T00:00:00.000Z'},quick);injectObservations(h.stored,h.writer,later);assert.equal((await h.writer.getDatabase()).providers.kobo.quickSyncAt,'2026-10-18T00:00:00.000Z');
 }],
 ...[
  ['unknown version',p=>p.format=99],['unknown field',p=>p.extra=true],['missing revision',p=>delete p.revision],['negative revision',p=>p.revision=-1],['unknown validator',p=>p.validationVersion='future'],['wrong profile',p=>p.entries[0].profileId=crypto.randomUUID()],['ownership mutation',p=>p.entries[0].observations.items[0].ownership='owned'],['invalid date',p=>p.entries[0].observations.items[0].observedAt='yesterday'],['new origin',p=>p.entries[0].observations.items[0].origins=[{occurrenceRef:'a'.repeat(64),observedAt:observationDate}]],['changed counts',p=>p.entries[0].state.recordCount=900],['non-success',p=>p.entries[0].state.syncHealth.status='failed'],['missing completeness',p=>delete p.entries[0].state.snapshotValidation]
 ].map(([name,mutate])=>['observations: '+name+' rejects the entire packet without touching library data',async()=>{
  const db=library('epic'),h=performanceWriter(db),p=await observationPacket(db,'epic');mutate(p);h.stored[HEAD]=observationHead(p);h.stored[KEY]=p;await assert.rejects(h.writer.getQueryDatabase());assert.deepEqual(h.stored.galacticLibraryDatabase,db);assert.equal(h.counts.databaseWrites,0);
 }]),
 ['observations: missing member, partial write, unreadable metadata, and removed active evidence fail closed',async()=>{
  const db=library('epic');for(const missing of [HEAD,KEY]){const h=performanceWriter(db);injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));delete h.stored[missing];await assert.rejects(h.writer.getQueryDatabase());}
  let refuse=false;const h=performanceWriter(db,{beforeGet:defaults=>{if(refuse&&Object.hasOwn(defaults,HEAD))throw Error('Synthetic read failure');}});injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));await h.writer.getQueryDatabase();refuse=true;h.writer.invalidateObservationSnapshot();await assert.rejects(h.writer.getQueryDatabase(),/read failure/);refuse=false;delete h.stored[KEY];delete h.stored[HEAD];h.writer.invalidateObservationSnapshot();await assert.rejects(h.writer.getQueryDatabase(),/missing/);
 }],
 ['observations: stale base is not attached to a replacement catalog; unknown versions still error',async()=>{
  const db=library('epic'),h=performanceWriter(db),p=await observationPacket(db,'epic');p.baseDigest='f'.repeat(64);injectObservations(h.stored,h.writer,p);assert.equal(first(await h.writer.getQueryDatabase()).observedAt,oldObservation);p.format=2;injectObservations(h.stored,h.writer,p);await assert.rejects(h.writer.getQueryDatabase());
 }],
 ['observations: consolidation is bounded across alternating scopes and origin/record limits',async()=>{
  const raw=value('xbox'),db=library('xbox',[raw,{...raw,providerItemId:'9N0000000002',title:'Second',metadata:{...raw.metadata,productId:'9N0000000002'}}]),digest=await providerCheckDigest(db),items=Object.values(db.providerItems);let p=null;
  for(let n=0;n<100;n++)p=consolidateObservations(db,digest,p,observationEntry(db,'xbox',{refs:[items[n%2].recordRef],at:new Date(Date.UTC(2026,0,n+1)).toISOString()}));
  assert.equal(p.revision,100);assert.equal(p.entries[0].observations.items.length,2);assert(JSON.stringify(p).length<5000);const invalid=structuredClone(p);invalid.entries[0].observations.items=Array.from({length:OBSERVATION_LIMITS.records+1},()=>invalid.entries[0].observations.items[0]);assert.throws(()=>validateObservationOverlay(db,digest,observationHead(invalid),invalid));
 }],
 ['observations: Exact/Possible matching keeps identity projection and returns fresh checkedAt',async()=>{
  const db=library('epic'),h=performanceWriter(db),raw=await h.writer.getQueryDatabase(),stages=[];const before=await query(raw,stages);assert(stages.includes('matching_index_build'));
  const packet=await observationPacket(db,'epic');injectObservations(h.stored,h.writer,packet);const view=await h.writer.getQueryDatabase();stages.length=0;const after=await query(view,stages);assert(stages.includes('matching_index_hit'));assert(!stages.includes('matching_index_build'));assert.equal(after.results[0].owned,before.results[0].owned);assert.equal(after.results[0].matches[0].evidence.checkedAt,observationDate);
  assert.equal(await h.writer.getQueryDatabase(),view);let writes=0;await createValidationCertificates({get:async()=>({}),set:async()=>writes++,remove:async()=>{}}).issue(view);assert.equal(writes,0);
 }],
 ['observations: real full completion folds observations before archiving history and retires packet',async()=>{
  // GOG retains omission reconciliation; Epic now preserves unseen purchases.
  const db=library('gog'),h=performanceWriter(db);injectObservations(h.stored,h.writer,await observationPacket(db,'gog'));const s=await h.writer.beginProviderScan('gog','Personal','full',false,1);await h.writer.commitProviderScan('gog',[],{syncMode:'full'},snapshot('gog',[]),s.scanToken,1);assert.equal(h.counts.databaseWrites,1);const out=await h.writer.getDatabase();assert.equal(out.providerHistory[first(db).recordRef].item.observedAt,observationDate);assert(out.providerHistory[first(db).recordRef].missingSince);assert(!h.stored[KEY]);assert(!h.stored[HEAD]);
 }],
 ['observations: reviewed Partial coverage and source context remain exact across index hits',async()=>{
  const db=library('kindle'),item=first(db),issue={series:'Benchmark Comics',run:'2000',unitType:'issue',number:'1',language:'en',completeness:'full'};item.metadata.language='en';db.contentReviews[item.id]={entries:[issue],statement:'Collects Benchmark Comics (2000) #1',verifiedAt:'2026-01-01'};
  Object.assign(db,validateDatabase(db));const h=performanceWriter(db),q={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Benchmark Collection',mediaType:'book',contents:[issue,{...issue,number:'2'}],contentsComplete:true}]},options={cacheImmutableRecords:true,cacheCommittedProjection:true};
  const before=await handleExternalApiRequestAsync(await h.writer.getQueryDatabase(),q,options);injectObservations(h.stored,h.writer,await observationPacket(db,'kindle',{whole:true}));const after=await handleExternalApiRequestAsync(await h.writer.getQueryDatabase(),q,options);
  assert.equal(after.results[0].owned,before.results[0].owned);assert.equal(after.results[0].partialMatches.length,before.results[0].partialMatches.length);assert(after.results[0].partialMatches.length);assert.equal(after.results[0].partialMatches[0].evidence.checkedAt,observationDate);assert.deepEqual((await h.writer.getDatabase()).contentReviews,db.contentReviews);
 }],
 ['observations: pending enrichment guards consume effective observations and skip stale prepared results',async()=>{
  const h=performanceWriter(library('humble'));let job=await h.writer.startGoogleBooksEnrichmentJob();job=await h.writer.acquireEnrichmentRun(job.jobId);const db=await h.writer.getDatabase(),item=first(db);injectObservations(h.stored,h.writer,await observationPacket(db,'humble'));
  const result=await h.writer.commitEnrichmentBatch(job.jobId,job.runId,0,[{canonicalId:job.queue[0],enrichment:{source:'google-books',volumeId:'synthetic',title:item.title},recordObservations:[{ref:item.recordRef,observedAt:item.observedAt,title:item.title}]}]);assert.equal(result.job.skipped,1);assert.equal(result.job.matched,0);assert.equal(first(result.database).observedAt,observationDate);
 }],
 ['observations: same revision cannot be replaced with different valid timestamp contents',async()=>{
  const db=library('epic'),h=performanceWriter(db),p=await observationPacket(db,'epic');injectObservations(h.stored,h.writer,p);await h.writer.getQueryDatabase();const changed=structuredClone(p);changed.entries[0].observations.items[0].observedAt='2026-10-18T00:00:00.000Z';changed.entries[0].observations.items[0].updatedAt='2026-10-18T00:00:00.000Z';injectObservations(h.stored,h.writer,changed);await assert.rejects(h.writer.getQueryDatabase(),/unexpectedly/);
 }],
 ['observations: a restarted writer reconstructs effective evidence and a lost-ack save fails closed',async()=>{
  const db=library('epic'),h=performanceWriter(db);injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));const restarted=performanceWriter(null,{stored:h.stored});assert.equal(first(await restarted.writer.getQueryDatabase()).observedAt,observationDate);
  let lose=true;const other=performanceWriter(null,{stored:h.stored,afterSet:updates=>{if(lose&&updates.galacticLibraryDatabase){lose=false;throw Error('Lost acknowledgement');}}});await assert.rejects(other.writer.saveOwnershipPolicy({providers:{kobo:true}}),/acknowledgement/);assert.equal(first(h.stored.galacticLibraryDatabase).observedAt,observationDate);await assert.rejects(performanceWriter(null,{stored:h.stored}).writer.getQueryDatabase());
 }],
 ['observations: concurrent matching reads the prior complete effective view during a materialized save',async()=>{
  let hold,release;const gate=new Promise(done=>{release=done;});const db=library('epic'),h=performanceWriter(db,{beforeSet:async updates=>{if(hold&&updates.galacticLibraryDatabase){hold();await gate;}}});injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));const old=await h.writer.getQueryDatabase();let entered;const waiting=new Promise(done=>{entered=done;});hold=entered;
  const pending=h.writer.saveOwnershipPolicy({providers:{kobo:true}});await waiting;try{const view=await h.writer.getQueryDatabase();assert.equal(view,old);assert.equal(first(view).observedAt,observationDate);}finally{release();}await pending;assert.equal(first(await h.writer.getQueryDatabase()).observedAt,observationDate);
 }],
 ['observations: unchanged full writes remain enabled and never produce observation receipts',async()=>{
  const db=library('epic'),h=performanceWriter(db),s=await h.writer.beginProviderScan('epic','Personal','full',false,1);await h.writer.commitProviderScan('epic',[value('epic')],{syncMode:'full'},snapshot('epic',[value('epic')]),s.scanToken,1);assert.equal(h.counts.databaseWrites,1);assert(!h.stored[KEY]);assert(!h.stored[HEAD]);
 }],
 ['observations: scan admission pins observation revision independently of raw catalog',async()=>{
  const db=library('epic'),h=performanceWriter(db),s=await h.writer.beginProviderScan('epic','Personal','full',false,1);injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));await assert.rejects(h.writer.commitProviderScan('epic',[value('epic')],{syncMode:'full'},snapshot('epic',[value('epic')]),s.scanToken,1),/Observations changed/);assert.equal(h.counts.databaseWrites,0);
 }],
 ['observations: revision changes during final validation reject without overwriting evidence',async()=>{
  const db=library('epic'),h=performanceWriter(db);let p=await observationPacket(db,'epic');injectObservations(h.stored,h.writer,p);const next=await observationPacket(db,'epic',{at:'2026-10-18T00:00:00.000Z'},p);let changed=false;
  let saving=false;const timing={begin(stage){if(stage==='persist_validation')saving=true;if(stage==='validation_records'&&saving&&!changed){changed=true;injectObservations(h.stored,h.writer,next);}return()=>{};}};
  await assert.rejects(h.writer.execute('saveOwnershipPolicy',[{providers:{kobo:true}}],timing),/Observations changed/);assert(changed);assert.equal(h.counts.databaseWrites,0);
 }],
 ['observations: restored and cleared identical bases cannot resurrect packets or old scan leases',async()=>{
  for(const method of ['restoreDatabase','clearDatabase']){const db=library('epic'),h=performanceWriter(db);injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));await h.writer.getQueryDatabase();await h.writer[method](...(method==='restoreDatabase'?[parseBackup(createBackup(db))]:[]));assert(!h.stored[KEY]);assert(!h.stored[HEAD]);const current=await h.writer.getDatabase();assert(method==='clearDatabase'?!Object.keys(current.providerItems).length:first(current).observedAt===oldObservation);}
 }],
 ['observations: interrupted materialized save retains packet and blocks ambiguous restart until explicit recovery',async()=>{
  let refuse=false;const db=library('epic'),h=performanceWriter(db,{beforeSet:updates=>{if(refuse&&updates.galacticLibraryDatabase)throw Error('Synthetic write failure');}});injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));refuse=true;await assert.rejects(h.writer.saveOwnershipPolicy({providers:{kobo:true}}),/write failure/);assert(h.stored[KEY]);assert.equal(h.stored[HEAD].status,'retiring');assert.deepEqual(h.stored.galacticLibraryDatabase,db);
  const next=performanceWriter(null,{stored:h.stored});await assert.rejects(next.writer.getQueryDatabase());await next.writer.restoreDatabase(parseBackup(createBackup(db)));assert.equal(first(await next.writer.getDatabase()).observedAt,oldObservation);
 }],
 ['observations: missing raw base and identity migration cannot discard active evidence',async()=>{
  const db=library('epic'),packet=await observationPacket(db,'epic');
  for(const queryRead of [true,false]){
   const h=performanceWriter(null,{stored:{[HEAD]:observationHead(packet),[KEY]:packet}});
   await assert.rejects(queryRead?h.writer.getQueryDatabase():h.writer.getDatabase(),/original library/);assert.equal(h.counts.databaseWrites,0);
  }
  const h=performanceWriter(db);injectObservations(h.stored,h.writer,packet);delete first(h.stored.galacticLibraryDatabase).recordRef;
  await assert.rejects(h.writer.getDatabase(),/original library/);assert.equal(h.counts.databaseWrites,0);
 }],
 ['observations: a lost acknowledgement of retirement never keeps a stale local read cache',async()=>{
  const db=library('epic');let reject=true;const h=performanceWriter(db,{afterSet:updates=>{if(reject&&updates[HEAD]?.status==='retiring'){reject=false;throw Error('Lost barrier acknowledgement');}}});injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));await h.writer.getQueryDatabase();
  await assert.rejects(h.writer.saveOwnershipPolicy({providers:{kobo:true}}),/barrier/);await assert.rejects(h.writer.getQueryDatabase());assert.equal(h.counts.databaseWrites,0);
 }],
 ['observations: failed and cancelled old leases cannot replace newer successful observations',async()=>{
  for(const cancel of [false,true]){const db=library('epic'),h=performanceWriter(db),s=await h.writer.beginProviderScan('epic','Personal','full',false,1),attempt=h.stored.galacticLibraryProviderScans.epic.attemptRef;
   injectObservations(h.stored,h.writer,await observationPacket(db,'epic'));
   if(cancel)await assert.rejects(h.writer.cancelProviderScan('epic',attempt),/Observations changed/);else assert.equal(await h.writer.failProviderScan('epic',s.scanToken,1,{code:'network'}),false);
   const state=(await h.writer.getCommittedLibraryView()).database.providers.epic;assert.equal(state.lastSync,observationDate);assert.equal(state.syncHealth.status,'succeeded');assert.equal(h.counts.databaseWrites,0);
  }
 }],
 ['observations: read invalidation during receipt loading returns the latest complete revision',async()=>{
  const db=library('epic');let change;const h=performanceWriter(db,{beforeGet:defaults=>{if(change&&Object.hasOwn(defaults,HEAD)){const action=change;change=null;action();}}}),p=await observationPacket(db,'epic'),next=await observationPacket(db,'epic',{at:'2026-10-18T00:00:00.000Z'},p);
  injectObservations(h.stored,h.writer,p);change=()=>injectObservations(h.stored,h.writer,next);assert.equal(first(await h.writer.getQueryDatabase()).observedAt,'2026-10-18T00:00:00.000Z');
 }],
 ['observations: exact cold certificates, missing proofs and mismatched proofs preserve effective values',async()=>{
  const db=library('epic'),stored={galacticLibraryDatabase:db},proofs={},area={get:async key=>({[key]:proofs[key]}),set:async value=>Object.assign(proofs,structuredClone(value)),remove:async key=>{delete proofs[key];}};
  const initial=performanceWriter(null,{stored,certificateArea:area});await initial.writer.getQueryDatabase();for(let n=0;n<100&&!Object.keys(proofs).length;n++)await new Promise(done=>setTimeout(done,1));assert(Object.keys(proofs).length);
  const certificate=structuredClone(proofs),packet=await observationPacket(db,'epic');injectObservations(stored,null,packet);
  for(const kind of ['valid','missing','mismatch']){Object.assign(proofs,structuredClone(certificate));if(kind==='missing')for(const key of Object.keys(proofs))delete proofs[key];if(kind==='mismatch')for(const key of Object.keys(proofs))proofs[key].digest='0'.repeat(64);
   const cold=performanceWriter(null,{stored,certificateArea:area}),view=await cold.writer.getQueryDatabase();assert.equal(first(view).observedAt,observationDate);assert.equal(first(stored.galacticLibraryDatabase).observedAt,oldObservation);
  }
 }],
 ['observations: explicit status lineage supersedes earlier checks without losing later failure status',async()=>{
  const db=library('epic'),h=performanceWriter(db),s=await h.writer.beginProviderScan('epic','Personal','incremental',false,1);await h.writer.commitProviderScan('epic',[],{syncMode:'incremental',quickSyncAt:'2026-01-01'},null,s.scanToken,1);
  const attempt=h.stored.galacticLibraryProviderChecks.checks.epic.patch.syncHealth.attemptRef,p=await observationPacket(db,'epic');p.entries[0].supersededStatusAttempts=[attempt];injectObservations(h.stored,h.writer,p);
  assert.equal((await h.writer.getCommittedLibraryView()).database.providers.epic.lastSync,observationDate);
  const next=await observationPacket(db,'epic',{},p);injectObservations(h.stored,h.writer,next);assert.deepEqual(next.entries[0].supersededStatusAttempts,[attempt]);assert.equal((await h.writer.getCommittedLibraryView()).database.providers.epic.lastSync,observationDate);
  const later=await h.writer.beginProviderScan('epic','Personal','incremental',false,1);await h.writer.failProviderScan('epic',later.scanToken,1,{code:'network'});
  const view=(await h.writer.getCommittedLibraryView()).database;assert.equal(view.providers.epic.syncHealth.status,'failed');assert.equal(view.providers.epic.lastSync,observationDate);assert.equal(h.counts.databaseWrites,0);
 }],
 ['observations: console fingerprint and Fanatical whole-profile observations are rejected',async()=>{
  for(const provider of ['xbox','fanatical']){const db=library(provider),p=await observationPacket(db,provider);if(provider==='xbox')p.entries[0].sourceAccountFingerprint='f'.repeat(64);else p.entries[0].observations={kind:'all',observedAt:observationDate,updatedAt:'advance'};
   assert.throws(()=>validateObservationOverlay(db,p.baseDigest,observationHead(p),p));
  }
 }]
];
