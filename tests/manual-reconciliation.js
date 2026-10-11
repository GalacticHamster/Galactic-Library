import assert from 'node:assert/strict';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {rebuildCanonicalItems,validateDatabase} from '../src/lib/models.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {preferredDisplayTitle} from '../src/lib/display-title.js';
import {relationshipSearchIndex,searchRelationshipRecords} from '../src/ui/relationship-picker.js';
import {createLibraryBrowseProjection} from '../src/ui/library-browse.js';
import {acquisitionHistory} from '../src/ui/library-acquisitions.js';
import {matchItems} from '../src/lib/matcher.js';
import {purchaseAccounts,purchaseSnapshot,applyPurchaseSnapshot} from '../src/background/purchase-handoff.js';

const emperor='Archer & Armstrong Vol. 2: Wrath of the Eternal Emperor';
const warrior='Archer & Armstrong Vol. 2: Wrath of the Eternal Warrior';
const raw=(id,title)=>({providerItemId:`${id}:product:volume2`,title,mediaType:'book',ownership:'owned',metadata:{purchaseId:id,sourceBundle:`Bundle ${id}`,entitlement:'direct-download'},acquiredAt:id==='one'?'2014-09-25T00:00:00Z':'2026-09-18T00:00:00Z'});
async function setup(){
  const state={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async values=>Object.assign(state,structuredClone(values))});
  const db=await writer.mergeProviderItems('humble',[raw('one',emperor),raw('two',warrior)]);
  const records=Object.values(db.providerItems),candidate={itemIds:records.map(record=>record.id)};
  return {writer,db,records,candidate,choice:{recordRef:records[1].recordRef,title:warrior}};
}
export const manualReconciliationTests=[];
const test=(name,run)=>manualReconciliationTests.push([name,run]);
test('Same Edition chooses the correct Archer title independently of initiating source and retains two purchases',async()=>{
  const {writer,records,candidate,choice}=await setup();
  const before=JSON.stringify(records),db=await writer.saveManualMatchDecision(candidate,'same-edition',choice);
  assert.equal(Object.values(db.canonicalItems).length,1);
  assert.equal(preferredDisplayTitle(Object.values(db.canonicalItems)),warrior);
  assert.equal(createLibraryBrowseProjection()(db).rows[0].canonical.title,warrior);
  assert.equal(JSON.stringify(Object.values(db.providerItems)),before);
  assert.equal(acquisitionHistory(Object.values(db.providerItems),db).ownedGroups,2);
  assert.equal(Object.values(db.canonicalItems)[0].title,records.slice().sort((a,b)=>a.id.localeCompare(b.id))[0].title);
});
test('Preferred title can change without modifying matching results, source fields or acquisition counts',async()=>{
  const {writer,candidate,choice,records}=await setup();
  let db=await writer.saveManualMatchDecision(candidate,'same-edition',choice);
  const queries=[emperor,warrior].map(title=>({title,mediaType:'book'}));
  const matching=matchItems(db.providerItems,queries,db),sources=structuredClone(db.providerItems),id=Object.keys(db.canonicalItems)[0];
  db=await writer.savePreferredDisplayTitle(id,{recordRef:records[0].recordRef,title:emperor});
  assert.equal(preferredDisplayTitle(Object.values(db.canonicalItems)),emperor);
  db=await writer.savePreferredDisplayTitle(id,choice);
  assert.equal(preferredDisplayTitle(Object.values(db.canonicalItems)),warrior);
  assert.deepEqual(matchItems(db.providerItems,queries,db),matching);
  assert.deepEqual(db.providerItems,sources);
  await assert.rejects(writer.savePreferredDisplayTitle(id,{...choice,title:'Invented title'}),/changed/);
  await assert.rejects(writer.savePreferredDisplayTitle('missing',choice),/no longer/);
});
test('Preferred canonical title survives reimport, changed source wording, sync and backup restore',async()=>{
  const {writer,candidate,choice}=await setup();
  let db=await writer.saveManualMatchDecision(candidate,'same-edition',choice);
  db=await writer.mergeProviderItems('humble',[raw('one',emperor),raw('two',warrior+' (Digital)')]);
  assert.equal(preferredDisplayTitle(Object.values(db.canonicalItems)),warrior);
  const profile=db.providers.humble.activeProfileId,snapshot=await purchaseSnapshot(db,'humble',profile);
  await applyPurchaseSnapshot(db,snapshot,(await purchaseAccounts(db,'humble'))[0]);
  assert.equal(preferredDisplayTitle(Object.values(db.canonicalItems)),warrior);
  db=await writer.restoreDatabase(parseBackup(createBackup(db)));
  assert.equal(preferredDisplayTitle(Object.values(db.canonicalItems)),warrior);
  assert.equal(createLibraryBrowseProjection()(db).rows[0].canonical.title,warrior);
});
test('Self and redundant Same Edition comparisons reject stale submissions; conflict safeguards remain',async()=>{
  const {writer,candidate,choice}=await setup();
  await assert.rejects(writer.saveManualMatchDecision({itemIds:[candidate.itemIds[0],candidate.itemIds[0]]},'same-edition'),/two different/);
  await writer.saveManualMatchDecision(candidate,'same-edition',choice);
  await assert.rejects(writer.saveManualMatchDecision(candidate,'same-edition'),/already belong/);
  await assert.rejects(writer.saveManualMatchDecision(candidate,'same-edition',choice),/already belong/);
  const {writer:other,candidate:pair}=await setup();
  await other.mergeProviderItems('humble',[{...raw('two',warrior),metadata:{...raw('two',warrior).metadata,volume:'3'}}]);
  await assert.rejects(other.saveManualMatchDecision(pair,'same-edition'),/conflicting edition/);
});
test('Same Work does not consolidate editions or apply a preferred title',async()=>{
  const {writer,candidate,choice}=await setup();
  const db=await writer.saveManualMatchDecision(candidate,'same-work',choice);
  assert.equal(Object.keys(db.canonicalItems).length,2);
  assert.equal(preferredDisplayTitle(Object.values(db.canonicalItems)),undefined);
});
test('Relationship search is bounded, searchable by source and volume, cached and excludes Same Edition members',async()=>{
  const {writer,db,records,candidate,choice}=await setup();
  let index=relationshipSearchIndex(db);
  assert.equal(relationshipSearchIndex(db),index);
  assert.deepEqual(searchRelationshipRecords(index,records[0].id,'Archer Humble volume 2').map(entry=>entry.record.id),[records[1].id]);
  assert.equal(searchRelationshipRecords(index,records[0].id,'').length,0);
  assert.equal(searchRelationshipRecords(index,records[0].id,'unrelated').length,0);
  const merged=await writer.saveManualMatchDecision(candidate,'same-edition',choice);
  index=relationshipSearchIndex(merged);
  assert.equal(searchRelationshipRecords(index,records[0].id,'Archer').length,0);
  const large={...db,providerItems:{...db.providerItems}};
  for(let n=0;n<4000;n++)large.providerItems[`synthetic:${n}`]={...records[1],id:`synthetic:${n}`,title:`Searchable catalog ${n}`};
  assert.equal(searchRelationshipRecords(relationshipSearchIndex(large),records[0].id,'searchable').length,20);
});
test('Title preferences stay with their source record through edition separation and validated rebuild',async()=>{
  const {writer,candidate,choice,records}=await setup();
  let db=await writer.saveManualMatchDecision(candidate,'same-edition',choice);
  db=await writer.separateEdition(records[1].id);
  const chosen=Object.values(db.canonicalItems).find(group=>group.providerItemIds.includes(records[1].id));
  const other=Object.values(db.canonicalItems).find(group=>group.providerItemIds.includes(records[0].id));
  assert.equal(preferredDisplayTitle([chosen]),warrior);
  assert.equal(preferredDisplayTitle([other]),undefined);
  assert.deepEqual(rebuildCanonicalItems(db.providerItems,db.manualMatchDecisions,db.canonicalItems,db.editionSeparations),db.canonicalItems);
  assert.deepEqual(validateDatabase(db).canonicalItems,db.canonicalItems);
  const bad=structuredClone(db);bad.canonicalItems[chosen.id].displayTitlePreferences[choice.recordRef].title='x'.repeat(1001);
  assert.throws(()=>validateDatabase(bad),/bounds/);
});
