// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Galactic Hamster
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../HB/shared.js';
import '../shared/purchase-snapshot.js';
import '../shared/purchase-adapters.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {purchaseAccounts,purchaseSnapshot} from '../src/background/purchase-handoff.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
const A=globalThis.GalacticPurchaseAdapters,S=globalThis.GalacticPurchaseSnapshot;
const key='order-one:key:game-one:0',entitlement='order-one:entitlement:game-one:0';
const meta={purchaseId:'order-one',sourceBundle:'Synthetic bundle',entitlement:'third-party-key',keyType:'Steam',keyStatus:'revealed'};
const source=id=>({providerItemId:id,title:'Synthetic game',mediaType:'game',metadata:{...meta},purchasedAt:null,origins:[]});
const snapshot=id=>S.validate({protocolVersion:1,provider:'humble',snapshotId:'synthetic',accountRef:'source',accountLabel:'Test',capturedAt:'2026-10-29',scope:'historical',completeness:'partial',limitations:[],records:[source(id)]});
const hb=()=>({title:'Synthetic game',kind:'game',source:'humble',purchaseKey:'order-one',providerItemId:key,entitlement:'third-party-key',entitlementId:'game-one:0',provenance:[{title:'Synthetic game',purchaseKey:'order-one',providerItemId:key,entitlement:'third-party-key',entitlementId:'game-one:0'}]});
function memory(){const state={};return {get:async defaults=>structuredClone({...defaults,...state}),set:async values=>Object.assign(state,structuredClone(values)),remove:async keys=>{for(const k of keys)delete state[k];}};}
test('Humble alias uses exact purchase, machine token and index; never positional or title evidence',()=>{
 assert.equal(A.humbleEntitlementAlias(key,'order-one'),entitlement);assert.equal(A.humbleEntitlementAlias(entitlement,'order-one'),key);
 for(const [id,purchase]of [[key,'another-order'],['order-one:key:position-0:0','order-one'],['order-one:key:game-one','order-one'],['order-one:product:game-one:0','order-one'],[key,null]])assert.equal(A.humbleEntitlementAlias(id,purchase),null);
});
test('HB receives either reference without adding an origin or replacing its stored native ID',()=>{
 const before=hb(),result=A.hbMerge([before],[source(entitlement)],true);
 assert.equal(result.stats.added,0);assert.equal(result.items.length,1);assert.equal(result.items[0].provenance.length,1);assert.equal(result.items[0].providerItemId,key);assert.equal(result.items[0].provenance[0].providerItemId,key);assert.deepEqual(before,hb());
 const conflict=A.hbMerge([before],[{...source(entitlement),mediaType:'software'}],true);assert.equal(conflict.stats.skipped,1);assert.deepEqual(conflict.items,[before]);
 for(const row of [{...source(entitlement),providerItemId:'order-one:entitlement:game-one:1'},{...source(entitlement),metadata:{...meta,purchaseId:'another-order'}}])assert.equal(A.hbMerge([before],[row],true).stats.added,1);
});
test('GL direct full/quick scans and purchase sync retain one scoped record and durable reference in both directions',async()=>{
 for(const stored of [key,entitlement]){
  const writer=createStorageWriter(memory());await writer.importPurchaseSnapshot(snapshot(stored),{newLabel:'Test',expectedActiveId:null});
  let db=await writer.getDatabase();const original=Object.values(db.providerItems)[0],ref=original.recordRef;
  const incoming={...source(stored===key?entitlement:key),ownership:'owned'};delete incoming.origins;delete incoming.purchasedAt;
  await writer.replaceProviderItems('humble',[incoming],{syncMode:'full'},completeProviderSnapshot('humble',[incoming],[completedScope('purchases',1,1,'index-complete',1)]));
  await writer.mergeProviderItems('humble',[incoming],{syncMode:'incremental'});
  db=await writer.getDatabase();assert.equal(Object.keys(db.providerItems).length,1);assert.equal(Object.keys(db.providerHistory).length,0);assert.equal(Object.values(db.providerItems)[0].recordRef,ref);assert.equal(Object.values(db.providerItems)[0].providerItemId,stored);
  await writer.importPurchaseSnapshot(snapshot(stored===key?entitlement:key),(await purchaseAccounts(db,'humble'))[0]);
  db=await writer.getDatabase();assert.equal(Object.keys(db.providerItems).length,1);assert.equal(Object.values(db.providerItems)[0].recordRef,ref);
  const outgoing=await purchaseSnapshot(db,'humble',db.providers.humble.activeProfileId),returned=A.hbMerge([hb()],outgoing.records,true);assert.equal(returned.stats.added,0);assert.equal(returned.items.length,1);assert.equal(returned.items[0].providerItemId,key);
  const separate=await writer.importPurchaseSnapshot(snapshot(stored),{newLabel:'Other',expectedActiveId:db.providers.humble.activeProfileId});assert.equal(separate.added,1);assert.equal(Object.keys((await writer.getDatabase()).providerItems).length,2);
 }
});
test('alias resolution preserves the existing media classification and does not absorb direct-download records',async()=>{
 const writer=createStorageWriter(memory()),data=snapshot(key);data.records[0].mediaType='software';
 await writer.importPurchaseSnapshot(data,{newLabel:'Test',expectedActiveId:null});
 const before=Object.values((await writer.getDatabase()).providerItems)[0],incoming={...source(entitlement),ownership:'owned'};
 await writer.mergeProviderItems('humble',[incoming]);const db=await writer.getDatabase(),saved=Object.values(db.providerItems);
 assert.equal(saved.length,1);assert.equal(saved[0].recordRef,before.recordRef);assert.equal(saved[0].mediaType,'software');
 const separate={...incoming,metadata:{...meta,entitlement:'direct-download'}};await writer.mergeProviderItems('humble',[separate]);assert.equal(Object.keys((await writer.getDatabase()).providerItems).length,2);
});
test('a positive Humble handoff restores a unique earlier native record without a new durable identity',async()=>{
 const writer=createStorageWriter(memory());await writer.importPurchaseSnapshot(snapshot(key),{newLabel:'Test',expectedActiveId:null});
 const original=Object.values((await writer.getDatabase()).providerItems)[0];
 await writer.replaceProviderItems('humble',[],{syncMode:'full'},completeProviderSnapshot('humble',[],[completedScope('purchases',0,0,'index-complete',1)]));
 let db=await writer.getDatabase();assert.equal(Object.keys(db.providerItems).length,0);assert.equal(Object.keys(db.providerHistory).length,1);
 const wrongPurchase=snapshot(key);wrongPurchase.records[0].metadata.purchaseId='another-order';
 await assert.rejects(writer.importPurchaseSnapshot(wrongPurchase,(await purchaseAccounts(db,'humble'))[0]),/No compatible records/);assert.deepEqual(await writer.getDatabase(),db);
 await writer.importPurchaseSnapshot(snapshot(key),(await purchaseAccounts(db,'humble'))[0]);db=await writer.getDatabase();
 assert.equal(Object.keys(db.providerHistory).length,0);assert.equal(Object.values(db.providerItems)[0].recordRef,original.recordRef);
 const result=await writer.importPurchaseSnapshot(snapshot(key),(await purchaseAccounts(db,'humble'))[0]);assert.equal(result.added,0);assert.equal(Object.keys((await writer.getDatabase()).providerItems).length,1);
});
test('ambiguous earlier observations are retained for review rather than collapsed or recreated',async()=>{
 const writer=createStorageWriter(memory());await writer.importPurchaseSnapshot(snapshot(key),{newLabel:'Test',expectedActiveId:null});
 await writer.replaceProviderItems('humble',[],{syncMode:'full'},completeProviderSnapshot('humble',[],[completedScope('purchases',0,0,'index-complete',1)]));
 let db=await writer.getDatabase();const entry=structuredClone(Object.values(db.providerHistory)[0]);entry.item.recordRef=crypto.randomUUID();db.providerHistory[entry.item.recordRef]=entry;
 await writer.restoreDatabase(db);db=await writer.getDatabase();
 await assert.rejects(writer.importPurchaseSnapshot(snapshot(key),(await purchaseAccounts(db,'humble'))[0]),/No compatible records/);
 assert.deepEqual(await writer.getDatabase(),db);assert.equal(Object.keys(db.providerHistory).length,2);
});
