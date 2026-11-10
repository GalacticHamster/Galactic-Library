import test from 'node:test';
import assert from 'node:assert/strict';
import {memory} from './final-gl-features.js';
import '../shared/purchase-sync.js';
import {purchaseAccounts} from '../src/background/purchase-handoff.js';
import {snapshotFixture} from './storage.js';

const Y=GalacticPurchaseSync,client='bjjpfofmcmiipeghcbhdfjedpldmkcii';
const entry={itemRef:'12345678-1234-1234-1234-123456789abc',title:'Synthetic reminder',mediaType:'unknown',keyStatus:'unrevealed',expiresAt:null,checkedAt:'2026-11-01',purchaseEvidence:'confirmed',activationStatus:'unknown'};
async function fixture(){
 const f=memory();await f.writer.ensurePurchaseAccount('humble');const db=await f.writer.getDatabase();
 const mapping={id:crypto.randomUUID(),peerId:client,localId:db.providers.humble.activeProfileId,remoteId:crypto.randomUUID(),confirmed:true,remoteConfirmed:true};
 f.stored[Y.KEY]={humble:mapping};f.stored[Y.PREFERENCE]={version:1,humble:true,fanatical:true};
 const begin=()=>f.writer.beginCompanionFeed(client,{profileLabel:'',count:1,coverage:'partial',sentAt:'2026-11-01',relationship:{id:mapping.id,sourceAccountId:mapping.remoteId}},true);
 return {...f,mapping,begin};
}
test('automatic HB reminders support an unnamed mapped account, preserve references and never create ownership',async()=>{
 const f=await fixture();let upload=await f.begin();await f.writer.appendCompanionFeed(client,upload.uploadToken,0,[entry],true);await f.writer.commitCompanionFeed(client,upload.uploadToken,true);
 let db=await f.writer.getDatabase();assert.equal(Object.keys(db.providerItems).length,0);assert.equal(db.companionFeeds[client].entries.length,1);const ref=db.companionFeeds[client].entries[0].localRef;
 upload=await f.begin();await f.writer.appendCompanionFeed(client,upload.uploadToken,0,[entry],true);await f.writer.commitCompanionFeed(client,upload.uploadToken,true);db=await f.writer.getDatabase();assert.equal(db.companionFeeds[client].entries[0].localRef,ref);
});
test('opt-out or a changed saved account mapping blocks a staged reminder commit without replacing prior data',async()=>{
 const f=await fixture(),before=await f.writer.getDatabase(),upload=await f.begin();await f.writer.appendCompanionFeed(client,upload.uploadToken,0,[entry],true);
 f.stored[Y.PREFERENCE].humble=false;await assert.rejects(f.writer.commitCompanionFeed(client,upload.uploadToken,true),/disabled/);assert.deepEqual(await f.writer.getDatabase(),before);
 f.stored[Y.PREFERENCE].humble=true;f.stored[Y.KEY].humble={...f.mapping,remoteId:crypto.randomUUID()};await assert.rejects(f.writer.commitCompanionFeed(client,upload.uploadToken,true),/relationship changed/);assert.deepEqual(await f.writer.getDatabase(),before);
});
test('a blank label alone or a forged account relationship cannot authorize a reminder feed',async()=>{
 const f=await fixture(),base={profileLabel:'',count:1,coverage:'partial',sentAt:'2026-11-01'};
 await assert.rejects(f.writer.beginCompanionFeed(client,base,true),/profile/);
 await assert.rejects(f.writer.beginCompanionFeed(client,{...base,relationship:{id:f.mapping.id,sourceAccountId:crypto.randomUUID()}},true),/relationship changed/);
 await assert.rejects(f.writer.beginCompanionFeed(client,{...base,relationship:{id:f.mapping.id,sourceAccountId:f.mapping.remoteId,key:'NEVER ACCEPT'}},true),/Invalid reminder/);
});
test('automatic account assignment distinguishes a new GL receiver from an empty account with saved history',async()=>{
 const f=memory();await f.writer.ensurePurchaseAccount('humble');let accounts=await purchaseAccounts(await f.writer.getDatabase(),'humble');assert.equal(accounts[0].unassigned,true);assert.equal(accounts[0].historicalCount,0);
 await f.writer.mergeProviderItems('humble',[{providerItemId:'saved-book',title:'Previously saved purchase',mediaType:'book',ownership:'owned',metadata:{purchaseId:'saved-order'}}]);
 await f.writer.replaceProviderItems('humble',[],{fullSyncAt:'2026-11-01'},snapshotFixture('humble',[]));
 accounts=await purchaseAccounts(await f.writer.getDatabase(),'humble');assert.equal(accounts[0].count,0);assert.equal(accounts[0].historicalCount,1);assert.equal(accounts[0].unassigned,false);
});
