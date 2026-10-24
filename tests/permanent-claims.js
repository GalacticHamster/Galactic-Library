import assert from 'node:assert/strict';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {OWNERSHIP_STATES} from '../src/lib/constants.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {companionMatch} from '../src/lib/companion-response.js';
import {validateUiPreferences} from '../src/lib/ui-preferences.js';
import {createLibraryBrowseProjection,libraryBrowseResults} from '../src/ui/library-browse.js';
import {acquisitionHistory} from '../src/ui/library-acquisitions.js';
import {providerSyncLibrary,providerSyncValue} from './provider-sync-fixture.js';
import {observationPacket,injectObservations,observationDate} from './observation-fixture.js';
import {OBSERVATION_KEY,OBSERVATION_HEAD_KEY} from '../src/lib/observation-overlays.js';
import {activeObservationEnvelope,OBSERVATION_REGISTRATION} from '../src/lib/observation-transactions.js';

const datedValue=await globalThis.GalacticAmazonGamesIdentity.identify({...providerSyncValue('amazon-games'),
 acquiredAt:'2025-07-29T00:00:00.000Z',metadata:{source:'amazon-games-collection',delivery:'Amazon Games library',collectedOn:'2025-07-29'}});
function legacy(state='claimed'){
 const db=providerSyncLibrary('amazon-games',[datedValue]),item=Object.values(db.providerItems)[0];
 item.ownership=state;item.acquiredAt='2025-07-29T00:00:00.000Z';
 item.metadata={...item.metadata,delivery:'Amazon Games library',collectedOn:'2025-07-29'};
 delete item.metadata.acquisitionMethod;
 return db;
}
function memory(db){
 const stored={galacticLibraryDatabase:structuredClone(db)};let writes=0;
 const area={get:async defaults=>structuredClone({...defaults,...stored}),set:async patch=>{writes++;Object.assign(stored,structuredClone(patch));},remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete stored[key];}};
 return {stored,area,writer:createStorageWriter(area),writes:()=>writes};
}
export const permanentClaimTests=[
 ['Permanent claim aliases normalize to Owned with acquisition provenance and stable source identity',()=>{
  for(const state of ['claimed','permanently_claimed']){
   const db=legacy(state),before=Object.values(db.providerItems)[0],next=Object.values(validateDatabase(db).providerItems)[0];
   assert.equal(next.ownership,'owned');assert.equal(next.metadata.acquisitionMethod,'permanent-claim');
   for(const key of ['id','providerItemId','recordRef','title','acquiredAt','observedAt','updatedAt'])assert.equal(next[key],before[key]);
   assert.equal(next.metadata.collectedOn,'2025-07-29');assert.equal(next.metadata.delivery,'Amazon Games library');
   assert.deepEqual(validateDatabase(validateDatabase(db)),validateDatabase(db));
  }
  assert(!OWNERSHIP_STATES.includes('claimed'));assert(!OWNERSHIP_STATES.includes('permanently_claimed'));
 }],
 ['Loading existing permanent claims persists once without rescan, records, history or canonical changes',async()=>{
  const db=legacy(),h=memory(db),before=Object.values(db.providerItems)[0],next=await h.writer.getDatabase();
  assert.equal(h.stored.galacticLibraryDatabase.providerItems[before.id].ownership,'owned');
  assert.deepEqual(next.canonicalItems,db.canonicalItems);assert.deepEqual(next.providerHistory,db.providerHistory);
  assert.equal(Object.keys(next.providerItems).length,1);const writes=h.writes();assert(writes>0);
  assert.deepEqual(await createStorageWriter(h.area).getDatabase(),next);assert.equal(h.writes(),writes);
  const sparse={...next.providerItems[before.id],metadata:{...next.providerItems[before.id].metadata}};
  delete sparse.metadata.acquisitionMethod;
  await h.writer.mergeProviderItems('amazon-games',[sparse],{profileId:before.profileId});
  assert.equal((await h.writer.getDatabase()).providerItems[before.id].metadata.acquisitionMethod,'permanent-claim');
  const backup=createBackup(next),restored=parseBackup(backup);assert.deepEqual(restored,next);
  await h.writer.restoreDatabase(restored);assert.equal(Object.values((await h.writer.getDatabase()).providerItems)[0].ownership,'owned');
 }],
 ['Older backup aliases restore as Owned while manual access corrections remain authoritative',async()=>{
  const db=legacy('permanently_claimed'),item=Object.values(db.providerItems)[0];
  db.ownershipReviews[item.recordRef]={reviewRef:crypto.randomUUID(),source:'user-correction',ownership:'returned',note:'',evidenceDate:null,confirmedAt:'2026-01-01T00:00:00.000Z',sourceUrl:'',expiresAt:null};
  const backup={format:'galactic-library-backup',version:1,database:db},parsed=parseBackup(backup),h=memory(db);
  await h.writer.restoreDatabase(parsed);const saved=await h.writer.getDatabase();
  assert.equal(saved.providerItems[item.id].ownership,'owned');assert.equal(effectiveOwnershipRecord(saved.providerItems[item.id],saved).ownership,'returned');
  assert.deepEqual(saved.ownershipReviews,db.ownershipReviews);assert.equal(saved.providerItems[item.id].acquiredAt,item.acquiredAt);
 }],
 ['Permanent-claim normalization retains authenticated observation overlays and rejects foreign bindings',async()=>{
  const db=legacy(),h=memory(db),packet=await observationPacket(db,'amazon-games',{whole:true});
  injectObservations(h.stored,h.writer,packet);const next=await h.writer.getDatabase();
  const item=Object.values(next.providerItems)[0];assert.equal(item.ownership,'owned');assert.equal(item.observedAt,observationDate);
  assert.deepEqual(next.canonicalItems,db.canonicalItems);assert.equal(Object.keys(next.providerHistory).length,0);
  assert.equal(Object.values((await createStorageWriter(h.area).getQueryDatabase()).providerItems)[0].ownership,'owned');
  const foreign=memory(legacy());
  foreign.stored[OBSERVATION_KEY]=activeObservationEnvelope(packet.baseDigest,packet);
  foreign.stored[OBSERVATION_HEAD_KEY]=structuredClone(OBSERVATION_REGISTRATION);
  const original=structuredClone(foreign.stored.galacticLibraryDatabase);
  await assert.rejects(foreign.writer.getDatabase(),/observation|library|damaged/i);
  assert.deepEqual(foreign.stored.galacticLibraryDatabase,original);
 }],
 ['Owned filtering and saved legacy filters include permanent claims; companion output uses canonical Owned',()=>{
  const db=validateDatabase(legacy());const results=libraryBrowseResults(createLibraryBrowseProjection()(db),{filters:{ownership:'owned'}});
  assert.equal(results.total,1);
  for(const state of ['claimed','permanently_claimed']){
   assert.equal(validateUiPreferences({browse:{ownership:state}}).browse.ownership,'owned');
   assert.equal(companionMatch({ownership:state}).ownership,'owned');
  }
 }],
 ['Permanent claims do not promote unknown access or change other ownership categories',()=>{
  for(const state of OWNERSHIP_STATES){
   const raw={...providerSyncValue('amazon-games'),ownership:state};
   const item=normalizeProviderItem(raw);assert.equal(item.ownership,state);assert(!item.metadata.acquisitionMethod);
  }
  assert.equal(normalizeProviderItem({...providerSyncValue('amazon-games'),ownership:'unknown',metadata:{acquisitionMethod:'permanent-claim'}}).ownership,'unknown');
  const db=validateDatabase(legacy()),item=Object.values(db.providerItems)[0];
  for(const state of ['unknown','subscription','borrowed','returned','revoked','expired']){
   const review={source:'user-correction',ownership:state};
   assert.equal(effectiveOwnershipRecord(item,{ownershipReviews:{[item.recordRef]:review}}).ownership,state);
  }
  const history=acquisitionHistory(Object.values(db.providerItems),db);
  assert.equal(history.entries.length,1);assert.equal(history.entries[0].records[0].metadata.acquisitionMethod,'permanent-claim');
 }]
];
