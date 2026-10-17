import assert from 'node:assert/strict';
import {PROVIDERS} from '../src/lib/constants.js';
import {createEmptyDatabase} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {createValidationCertificates,VALIDATION_CERTIFICATE_KEY} from '../src/lib/validation-certificate.js';
import {registerCommittedSnapshot} from '../src/lib/committed-snapshot.js';
import {performanceWriter,syntheticProviderLibrary,measuredScan} from './provider-performance-fixture.js';
import {providerSyncModes,consoleProvider,fingerprint,oldObservation,providerSyncValue as value,providerSyncSnapshot as snapshot,providerSyncLibrary as library} from './provider-sync-fixture.js';

const begin=(h,p,mode='full',tab=1)=>h.writer.beginProviderScan(p,'Personal',mode,false,tab,null,false,consoleProvider(p)?fingerprint:null);
const finish=(h,p,s,items=[value(p)],mode='full',tab=1)=>h.writer.commitProviderScan(p,items,{syncMode:mode,...(mode==='full'?{fullSyncAt:new Date().toISOString()}:{quickSyncAt:new Date().toISOString()})},mode==='full'||consoleProvider(p)?snapshot(p,items):undefined,s.scanToken,tab,false,consoleProvider(p)?fingerprint:null);
const stages=h=>h.journal.report().events;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const session=()=>{const data={};return {data,get:async key=>({[key]:structuredClone(data[key])}),set:async updates=>Object.assign(data,structuredClone(updates)),remove:async key=>{delete data[key];}};};

export const providerFullStartTests=[
 ...PROVIDERS.flatMap(p=>providerSyncModes(p).map(mode=>['lease admission: '+p+' '+mode+' retains catalog, durable Running, and validated completion',async()=>{
   const db=library(p),h=performanceWriter(db);const base=await h.writer.getQueryDatabase();const last=stages(h).at(-1).id;
   const s=await begin(h,p,mode),lease=h.stored.galacticLibraryProviderScans[p];
   assert.equal(h.counts.databaseWrites,0);assert.equal(h.counts.metadataWrites,1);assert.deepEqual(h.stored.galacticLibraryDatabase,db);
   assert(lease.readOnlyStart);assert.equal(lease.mode,mode);if(mode==='full')assert.match(lease.fullStartDigest,/^[a-f0-9]{64}$/);
   assert.equal(await h.writer.getQueryDatabase(),base);
   assert(!stages(h).some(e=>e.id>last&&(e.stage==='validation'||e.stage==='snapshot_change')));
   const view=(await h.writer.getCommittedLibraryView()).database;assert.equal(view.providers[p].syncHealth.status,'running');assert.equal(view.providers[p].syncHealth.mode,mode);assert.equal(view.providers[p].fullSyncAt,oldObservation);
   const eventCount=stages(h).at(-1).id;
   await finish(h,p,s,[value(p)],mode);
   assert.equal(h.counts.databaseWrites,p==='kobo'&&mode==='incremental'?0:1);
   const validations=stages(h).filter(e=>e.id>eventCount&&e.stage==='validation').length;
   assert.equal(validations,p==='kobo'&&mode==='incremental'?0:1);
   assert(!h.stored.galacticLibraryProviderScans[p]);
   const saved=await h.writer.getDatabase();assert.equal(saved.providers[p].syncHealth.status,'succeeded');
   const item=Object.values(saved.providerItems)[0];assert.equal(item.ownership,Object.values(db.providerItems)[0].ownership);
   assert.equal(item.observedAt!==oldObservation,!(p==='kobo'&&mode==='incremental'));
 }])),
 ...PROVIDERS.map(p=>['full admission: '+p+' failure, cancellation, interruption and restart preserve successful baseline',async()=>{
   for(const terminal of ['failed','cancelled']){
     const db=library(p),h=performanceWriter(db);await h.writer.getQueryDatabase();const s=await begin(h,p),lease=h.stored.galacticLibraryProviderScans[p];
     const next=performanceWriter(null,{stored:h.stored});
     assert.equal((await next.writer.getCommittedLibraryView()).database.providers[p].syncHealth.status,'running');
     assert.equal(h.counts.databaseWrites,0);
     if(terminal==='failed')await next.writer.failProviderScan(p,s.scanToken,1,{code:'network'});else await next.writer.cancelProviderScan(p,lease.attemptRef);
     assert.equal(next.counts.databaseWrites,0);assert.deepEqual(h.stored.galacticLibraryDatabase,db);
     const saved=await next.writer.getDatabase();assert.equal(saved.providers[p].syncHealth.status,terminal);assert.equal(saved.providers[p].fullSyncAt,oldObservation);assert.deepEqual(saved.providerItems,db.providerItems);
     const backup=parseBackup(createBackup(saved));assert.deepEqual(backup.providerItems,db.providerItems);
     const newer=await begin(next,p);await assert.rejects(finish(next,p,s),/superseded/);await finish(next,p,newer);
   }
 }]),
 ...PROVIDERS.map(p=>['full admission: '+p+' first import/baseline and disconnected states retain validated admission',async()=>{
   for(const kind of ['new','no-baseline','disconnected']){
     const db=kind==='new'?createEmptyDatabase():library(p);if(kind!=='new'){
       const profile=db.providerProfiles[db.providers[p].activeProfileId];
       if(kind==='no-baseline'){delete profile.state.fullSyncAt;delete db.providers[p].fullSyncAt;}
       else{profile.state.connected=false;db.providers[p].connected=false;}
     }
     const h=performanceWriter(db);await h.writer.getQueryDatabase();await begin(h,p);
     assert.equal(h.counts.databaseWrites,1);assert(!h.stored.galacticLibraryProviderScans[p].readOnlyStart);
   }
 }]),
 ...PROVIDERS.map(p=>['full admission: '+p+' changed snapshot, missing/history and reappearance still save observations',async()=>{
   const db=library(p),h=performanceWriter(db);await h.writer.getQueryDatabase();const raw=value(p);
   const added={...raw,providerItemId:p==='xbox'?'9N0000000002':'synthetic-2',title:'Added record',metadata:{...raw.metadata,...(p==='xbox'?{productId:'9N0000000002'}:{})}};
   let s=await begin(h,p);await finish(h,p,s,[raw,added]);assert.equal(h.counts.databaseWrites,1);
   const after=await h.writer.getDatabase(),prior=Object.values(after.providerItems).find(i=>i.providerItemId===raw.providerItemId);
   s=await begin(h,p);await finish(h,p,s,[added]);assert.equal(h.counts.databaseWrites,2);
   const missing=await h.writer.getDatabase();
   if(consoleProvider(p)){assert(missing.providerItems[prior.id]);assert.equal(missing.providerItems[prior.id].observedAt,prior.observedAt);}
   else{assert(!missing.providerItems[prior.id]);assert.equal(missing.providerHistory[prior.recordRef].item.observedAt,prior.observedAt);}
   s=await begin(h,p);await finish(h,p,s,[{...raw,title:'Changed metadata'},added]);
   const restored=await h.writer.getDatabase();assert.equal(restored.providerItems[prior.id].title,'Changed metadata');assert.equal(restored.providerItems[prior.id].recordRef,prior.recordRef);assert(!restored.providerHistory[prior.recordRef]);
 }]),
 ['full admission: concurrent scans, wrong tabs/mode and changed catalog reject stale full results',async()=>{
   const h=performanceWriter(library('epic'));await h.writer.getQueryDatabase();const a=await begin(h,'epic'),b=await begin(h,'epic');
   await assert.rejects(finish(h,'epic',a),/superseded/);await assert.rejects(finish(h,'epic',b,undefined,'full',2),/superseded/);await assert.rejects(finish(h,'epic',b,[],'incremental'),/requires.*full/);
   await h.writer.saveOwnershipPolicy({providers:{kobo:true}});const writes=h.counts.databaseWrites;
   await assert.rejects(finish(h,'epic',b),/changed during.*full scan/);assert.equal(h.counts.databaseWrites,writes);assert(h.stored.galacticLibraryDatabase.ownershipPolicy.providers.kobo);
 }],
 ['full admission: epoch changes during final validation reject before the save',async()=>{
   const h=performanceWriter(library('epic'));await h.writer.getQueryDatabase();const s=await begin(h,'epic');let changed=false;
   const timing={begin(stage){if(stage==='validation_records'&&!changed){changed=true;Object.values(h.stored.galacticLibraryDatabase.providerItems)[0].ownership='returned';h.writer.invalidateQuerySnapshot();}return()=>{};}};
   await assert.rejects(h.writer.execute('commitProviderScan',['epic',[value('epic')],{syncMode:'full'},snapshot('epic',[value('epic')]),s.scanToken,1],timing),/changed during.*full scan/);
   assert(changed);assert.equal(h.counts.databaseWrites,0);assert.equal(Object.values(h.stored.galacticLibraryDatabase.providerItems)[0].ownership,'returned');
 }],
 ['full admission: snapshot failure cannot turn a lease into ownership or absence',async()=>{
   const db=library('epic'),h=performanceWriter(db);await h.writer.getQueryDatabase();const s=await begin(h,'epic');
   await assert.rejects(h.writer.commitProviderScan('epic',[],{syncMode:'full'},null,s.scanToken,1),/incomplete/);
   assert.equal(h.counts.databaseWrites,0);assert.deepEqual(h.stored.galacticLibraryDatabase,db);
 }],
 ['full admission: restore and clear invalidate even a byte-identical old lease',async()=>{
   for(const operation of ['restore','clear']){const db=library('epic'),h=performanceWriter(db);await h.writer.getQueryDatabase();const s=await begin(h,'epic');
     if(operation==='restore')await h.writer.restoreDatabase(parseBackup(createBackup(db)));else await h.writer.clearDatabase();
     await assert.rejects(finish(h,'epic',s),/superseded/);
   }
 }],
 ...['nintendo','playstation','xbox'].map(p=>['full admission: '+p+' fingerprint mismatch cannot admit or commit a different account',async()=>{
   const h=performanceWriter(library(p));await h.writer.getQueryDatabase();
   await assert.rejects(h.writer.beginProviderScan(p,'Personal','full',false,1,null,false,'b'.repeat(64)),/different.*account/);assert.equal(h.counts.databaseWrites,0);
   const s=await begin(h,p);await assert.rejects(h.writer.commitProviderScan(p,[value(p)],{syncMode:'full'},snapshot(p,[value(p)]),s.scanToken,1,false,'b'.repeat(64)),/account changed/);assert.equal(h.counts.databaseWrites,0);
 }]),
 ['full admission: unbound console and account switch are genuine mutations, not eligible repeated starts',async()=>{
   const db=library('xbox',[]),id=db.providers.xbox.activeProfileId;delete db.providerProfiles[id].sourceAccountFingerprint;
   const h=performanceWriter(db);await h.writer.getQueryDatabase();await begin(h,'xbox');assert.equal(h.counts.databaseWrites,1);
   const other=library('epic'),profile=newProviderProfile('epic','Other');profile.state={connected:true,fullSyncAt:oldObservation};other.providerProfiles[profile.profileId]=profile;
   const switched=performanceWriter(other);await switched.writer.getQueryDatabase();const before=switched.counts.databaseWrites;await assert.rejects(switched.writer.beginProviderScan('epic','Other','full',false,1),/confirm switching/);
   await switched.writer.beginProviderScan('epic','Other','full',true,1);assert.equal(switched.counts.databaseWrites,before+1);
 }],
 ['full admission: missing/mismatched proof validates once; valid cold proof and restart preserve pinned admission',async()=>{
   for(const kind of ['valid','missing','mismatch']){
     const db=library('epic'),area=session();await createValidationCertificates(area).issue(registerCommittedSnapshot(freeze(structuredClone(db))));
     if(kind==='missing')delete area.data[VALIDATION_CERTIFICATE_KEY];if(kind==='mismatch')area.data[VALIDATION_CERTIFICATE_KEY].digest='0'.repeat(64);
     const h=performanceWriter(db,{certificateArea:area}),s=await begin(h,'epic');
     assert.equal(h.counts.databaseWrites,0);assert.equal(stages(h).filter(e=>e.stage==='validation').length,kind==='valid'?0:1);
     const next=performanceWriter(null,{stored:h.stored,certificateArea:area});await finish(next,'epic',s);assert.equal(next.counts.databaseWrites,1);assert.equal((await next.writer.getDatabase()).providers.epic.syncHealth.status,'succeeded');
   }
 }],
 ['full admission: failed lease write cannot announce admission or mutate catalog',async()=>{
   const db=library('epic'),h=performanceWriter(db,{beforeSet:updates=>{if(updates.galacticLibraryProviderScans)throw Error('Synthetic lease write failure');}});await h.writer.getQueryDatabase();
   await assert.rejects(begin(h,'epic'),/lease write failure/);assert(!h.stored.galacticLibraryProviderScans);assert.equal(h.counts.databaseWrites,0);assert.deepEqual(h.stored.galacticLibraryDatabase,db);
 }],
 ['full admission: independent status-only completion does not stale the catalog binding',async()=>{
   const db=syntheticProviderLibrary(40),h=performanceWriter(db);await h.writer.getQueryDatabase();const s=await begin(h,'epic');
   await measuredScan(h);assert.equal(h.counts.databaseWrites,0);
   const items=Object.values(db.providerItems).filter(i=>i.profileId===db.providers.epic.activeProfileId);await finish(h,'epic',s,items);
   assert.equal(h.counts.databaseWrites,1);assert.equal((await h.writer.getDatabase()).providers.steam.quickSyncAt,'2026-10-16T00:00:00.000Z');
 }],
 ['full admission: lost admission acknowledgement remains cancellable or supersedable after restart',async()=>{
   let fail=true;const db=library('epic'),h=performanceWriter(db,{afterSet:updates=>{if(fail&&updates.galacticLibraryProviderScans){fail=false;throw Error('Lost lease acknowledgement');}}});await h.writer.getQueryDatabase();
   await assert.rejects(begin(h,'epic'),/acknowledgement/);assert.equal(h.counts.databaseWrites,0);
   const old=h.stored.galacticLibraryProviderScans.epic,next=performanceWriter(null,{stored:h.stored});
   assert.equal((await next.writer.getCommittedLibraryView()).database.providers.epic.syncHealth.status,'running');await next.writer.cancelProviderScan('epic',old.attemptRef);
   assert.equal(next.counts.databaseWrites,0);const s=await begin(next,'epic');await finish(next,'epic',s);assert.equal(next.counts.databaseWrites,1);
 }]
];
