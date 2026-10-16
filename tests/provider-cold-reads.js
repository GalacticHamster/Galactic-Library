import assert from 'node:assert/strict';
import {syntheticProviderLibrary,performanceWriter,measuredScan} from './provider-performance-fixture.js';
import {createValidationCertificates,VALIDATION_CERTIFICATE_KEY} from '../src/lib/validation-certificate.js';
import {registerCommittedSnapshot} from '../src/lib/committed-snapshot.js';
import {PROVIDER_CHECKS_KEY} from '../src/lib/provider-scan-checks.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {handleExternalApiRequestAsync} from '../src/lib/external-api.js';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function session(){
 const values={};return {values,get:async key=>({[key]:structuredClone(values[key])}),set:async updates=>Object.assign(values,structuredClone(updates)),remove:async key=>{delete values[key];}};
}
async function setup(){
 const database=syntheticProviderLibrary(40),area=session();
 await createValidationCertificates(area).issue(registerCommittedSnapshot(freeze(structuredClone(database))));
 const writer=options=>performanceWriter(database,{certificateArea:area,...options});
 return {database,area,writer};
}
const stages=h=>h.journal.report().events.map(e=>e.stage);
const begin=h=>h.writer.beginProviderScan('steam','Personal','incremental',false,1);
const finish=(h,scan,items=[],extra={})=>h.writer.commitProviderScan('steam',items,{syncMode:'incremental',quickSyncAt:'2026-10-16',...extra},null,scan.scanToken,1);
export const providerColdReadTests=[
 ['cold provider reads: valid session proof survives writer generations, hashes once and preserves query identity',async()=>{
  const s=await setup(),h=s.writer();const original=structuredClone(s.database),scan=await begin(h);
  assert(stages(h).includes('certificate_hit'));assert(!stages(h).includes('validation'));
  assert.equal(stages(h).filter(stage=>stage==='certificate_hash').length,1);
  const snapshot=await h.writer.getQueryDatabase();await finish(h,scan);
  assert.equal(await h.writer.getQueryDatabase(),snapshot);assert.equal(h.counts.databaseWrites,0);
  assert.deepEqual(h.stored.galacticLibraryDatabase,original);
  const next=s.writer({stored:h.stored}),result=await measuredScan(next,{scanDiagnostics:{incomplete:true}});
  assert.equal(result.counts.validationPasses,0);assert.equal(result.counts.databaseWrites,0);
  assert(stages(next).includes('certificate_hit'));assert.equal(stages(next).filter(stage=>stage==='certificate_hash').length,1);
  const view=await next.writer.getDatabase();assert.equal(view.providers.steam.syncHealth.status,'partial');
  const before=(await h.writer.getCommittedLibraryView()).database;
  for(const field of ['lastSync','quickSyncAt','fullSyncAt'])assert.equal(view.providers.steam[field],before.providers.steam[field]);
  assert.deepEqual(await handleExternalApiRequestAsync(snapshot,{type:'GET_STATUS'}),await handleExternalApiRequestAsync(view,{type:'GET_STATUS'}));
 }],
 ['cold provider reads: missing, old-version, malformed, mismatched and unavailable proof validates instead',async()=>{
  for(const kind of ['missing','version','schema','malformed','digest','unavailable','error']){
   const s=await setup(),certificate=s.area.values[VALIDATION_CERTIFICATE_KEY];
   if(kind==='missing')delete s.area.values[VALIDATION_CERTIFICATE_KEY];
   if(kind==='version')certificate.validationVersion='older-extension-validator';
   if(kind==='schema')certificate.schemaVersion=1;
   if(kind==='malformed')certificate.extra=true;
   if(kind==='digest')certificate.digest='0'.repeat(64);
   if(kind==='error')s.area.get=async()=>{throw Error('Session unavailable');};
   const h=s.writer(kind==='unavailable'?{certificateArea:null}:{}),scan=await begin(h);
   assert(stages(h).includes('validation'),kind);assert(!stages(h).includes('certificate_hit'),kind);
   await finish(h,scan);assert.equal(h.counts.databaseWrites,0);
  }
 }],
 ['cold provider reads: changed values with unchanged schema/revision revalidate and corrupted records cannot start',async()=>{
  const s=await setup(),h=s.writer(),item=Object.values(h.stored.galacticLibraryDatabase.providerItems).find(item=>item.provider==='steam');
  item.ownership='returned';const scan=await begin(h);assert(stages(h).includes('certificate_mismatch'));assert(stages(h).includes('validation'));
  await finish(h,scan);assert.equal((await h.writer.getDatabase()).providerItems[item.id].ownership,'returned');
  const corrupt=s.writer();corrupt.stored.galacticLibraryDatabase.providerItems[item.id].mediaType='invalid';
  await assert.rejects(begin(corrupt),/media type/);assert(!corrupt.stored.galacticLibraryProviderScans);assert.equal(corrupt.counts.databaseWrites,0);
 }],
 ['cold provider reads: legacy schema migrates before establishing a reusable base',async()=>{
  const s=await setup(),h=s.writer();h.stored.galacticLibraryDatabase.schemaVersion=1;
  await measuredScan(h);assert(stages(h).includes('certificate_invalid'));assert(stages(h).includes('validation'));
  assert.equal(h.stored.galacticLibraryDatabase.schemaVersion,s.database.schemaVersion);assert(h.counts.databaseWrites>0);
 }],
 ['cold provider reads: new metadata, additions and every access state retain validated data saves',async()=>{
  for(const change of [{title:'Changed title'},{ownership:'owned'},{ownership:'unknown'},{ownership:'subscription'},{ownership:'borrowed'},{ownership:'returned'},{ownership:'revoked'},{ownership:'expired'},null]){
   const s=await setup(),h=s.writer(),scan=await begin(h),saved=Object.values(s.database.providerItems).find(item=>item.provider==='steam');
   const item=change?{...saved,...change}:{providerItemId:'new',title:'New game',mediaType:'game',ownership:'owned'};
   await finish(h,scan,[item]);assert(stages(h).includes('certificate_hit'));assert(stages(h).includes('validation'));
   assert.equal(h.counts.databaseWrites,1);assert(!h.stored[PROVIDER_CHECKS_KEY]);
   const actual=Object.values(h.stored.galacticLibraryDatabase.providerItems).find(row=>row.providerItemId===item.providerItemId&&row.profileId===scan.profileId);
   assert.equal(actual.ownership,item.ownership);assert.equal(actual.title,item.title);
   assert.deepEqual(Object.values(h.stored.galacticLibraryDatabase.providerItems).filter(row=>row.provider==='steam'&&row.profileId!==scan.profileId),Object.values(s.database.providerItems).filter(row=>row.provider==='steam'&&row.profileId!==scan.profileId));
  }
 }],
 ['cold provider reads: invalid incoming records never gain validation from an old certificate',async()=>{
  const s=await setup(),h=s.writer(),scan=await begin(h);
  await assert.rejects(finish(h,scan,[{providerItemId:'bad',title:'Bad game',mediaType:'invalid',ownership:'owned'}]),/media type/);
  assert.equal(h.counts.databaseWrites,0);assert.deepEqual(h.stored.galacticLibraryDatabase,s.database);
 }],
 ['cold provider reads: restart between preparation and completion rechecks proof and stale leases still fail',async()=>{
  const s=await setup(),first=s.writer(),scan=await begin(first),next=s.writer({stored:first.stored});
  await finish(next,scan);assert(stages(next).includes('certificate_hit'));assert.equal(next.counts.databaseWrites,0);
  const newer=await begin(next);await assert.rejects(finish(next,scan),/superseded/);await finish(next,newer);
 }],
 ['cold provider reads: an observed external edit during certificate verification retries authoritative storage',async()=>{
  const s=await setup(),get=s.area.get;let h,once=true;
  s.area.get=async key=>{const result=await get(key);if(once){once=false;const item=Object.values(h.stored.galacticLibraryDatabase.providerItems).find(item=>item.provider==='steam');item.ownership='revoked';h.writer.invalidateQuerySnapshot();}return result;};
  h=s.writer();const scan=await begin(h);assert(stages(h).includes('read_certificate_retry'));assert(stages(h).includes('certificate_mismatch'));
  await finish(h,scan);assert(Object.values((await h.writer.getDatabase()).providerItems).some(item=>item.ownership==='revoked'));
 }],
 ['cold provider reads: account switching invalidates old scan scope and concurrent providers keep their own receipts',async()=>{
  const s=await setup(),h=s.writer(),old=await begin(h),other=Object.values(s.database.providerProfiles).find(p=>p.provider==='steam'&&p.profileId!==old.profileId);
  await h.writer.selectProviderProfile(other.profileId,old.profileId,true);
  await assert.rejects(finish(h,old),/changed|superseded/);
  const shared=s.writer();await Promise.all([measuredScan(shared),measuredScan(shared,{provider:'epic'})]);
  for(const provider of ['steam','epic'])assert(shared.stored[PROVIDER_CHECKS_KEY].checks[provider]);
 }],
 ['cold provider reads: failed and cancelled outcomes preserve success, recover durable receipts and backup/restore',async()=>{
  for(const status of ['failed','cancelled']){
   const s=await setup(),h=s.writer(),scan=await begin(h),attempt=h.stored.galacticLibraryProviderScans.steam.attemptRef;
   if(status==='failed')await h.writer.failProviderScan('steam',scan.scanToken,1,{code:'network'});else await h.writer.cancelProviderScan('steam',attempt);
   assert.equal(h.counts.databaseWrites,0);assert.deepEqual(h.stored.galacticLibraryDatabase,s.database);
   const next=s.writer({stored:h.stored}),view=await next.writer.getDatabase();assert.equal(view.providers.steam.syncHealth.status,status);
   assert.equal(view.providers.steam.lastSync,s.database.providers.steam.lastSync);
   await next.writer.restoreDatabase(parseBackup(createBackup(view)));assert(!next.stored[PROVIDER_CHECKS_KEY]);
   assert.equal((await next.writer.getDatabase()).providers.steam.syncHealth.status,status);
   await next.writer.clearDatabase();assert.equal(next.stored.galacticLibraryDatabase,undefined);
  }
 }],
 ['cold provider reads: interrupted receipt acknowledgement survives restart with certificate and consumes the lease',async()=>{
  const s=await setup();let armed=false;const h=s.writer({afterSet:updates=>{if(armed&&updates[PROVIDER_CHECKS_KEY])throw Error('Lost acknowledgement');}}),scan=await begin(h);armed=true;
  await assert.rejects(finish(h,scan),/Lost acknowledgement/);
  const next=s.writer({stored:h.stored});await assert.rejects(finish(next,scan),/already completed/);
  assert(stages(next).includes('certificate_hit'));assert.equal(next.counts.databaseWrites,0);
  assert.equal((await next.writer.getDatabase()).providers.steam.syncHealth.status,'succeeded');
 }],
 ['cold provider reads: certified preparation retains full-scan absence history and other accounts',async()=>{
  const s=await setup(),h=s.writer(),profile=s.database.providers.steam.activeProfileId;
  const records=Object.values(s.database.providerItems).filter(item=>item.profileId===profile),removed=records.at(-1);
  const result=await measuredScan(h,{mode:'full',items:records.slice(0,-1)});
  assert(stages(h).includes('certificate_hit'));assert.equal(result.counts.databaseWrites,2);assert.equal(result.counts.validationPasses,2);
  assert(!h.stored.galacticLibraryDatabase.providerItems[removed.id]);assert(h.stored.galacticLibraryDatabase.providerHistory[removed.recordRef]);
  assert.deepEqual(Object.values(h.stored.galacticLibraryDatabase.providerItems).filter(item=>item.profileId!==profile),Object.values(s.database.providerItems).filter(item=>item.profileId!==profile));
 }],
 ['cold provider reads: a separately committed edit after preparation is retained by the fresh commit read',async()=>{
  const s=await setup(),h=s.writer(),scan=await begin(h),editor=s.writer({stored:h.stored});
  await editor.writer.saveOwnershipPolicy({providers:{kobo:true}});h.writer.invalidateQuerySnapshot();
  await finish(h,scan);
  assert.equal((await h.writer.getDatabase()).ownershipPolicy.providers.kobo,true);
  assert.deepEqual(h.stored.galacticLibraryDatabase.providerItems,s.database.providerItems);
 }]
];
