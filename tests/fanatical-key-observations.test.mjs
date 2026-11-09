import test from 'node:test';import assert from 'node:assert/strict';
import '../shared/purchase-snapshot.js';import '../shared/purchase-transfer.js';
import {sanitizeImportResult,keySummary,parseLibraryBackup} from '../../Fanatical/src/library-data.mjs';
import {createEmptyDatabase} from '../src/lib/models.js';
import {purchaseAccounts,purchaseSnapshot,applyPurchaseSnapshot} from '../src/background/purchase-handoff.js';
import {libraryReminders} from '../src/lib/reminders.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
const S=globalThis.GalacticPurchaseSnapshot,T=globalThis.GalacticPurchaseTransfer;
const old='2026-11-09T10:00:00.000Z',recent='2026-11-09T11:00:00.000Z',ref='a'.repeat(64);
const fanItem=(keyStatus='unrevealed',keyCheckedAt=old)=>({source:'fanatical',sourceItemId:'key-product',title:'Synthetic Steam product',mediaType:'game',bundle:{sourceItemId:'key-product',title:'Synthetic Steam product'},purchaseDate:null,keyStatus,keyCheckedAt,purchaseOrigins:[{purchaseRef:ref,bundle:{sourceItemId:'key-product',title:'Synthetic Steam product'},purchaseDate:null,quantity:1,keyStatus,keyCheckedAt}]});
const snap=(status='unrevealed',checked=old)=>S.validate({protocolVersion:1,provider:'fanatical',snapshotId:'synthetic',accountRef:'source',accountLabel:'Personal',capturedAt:recent,scope:'historical',completeness:'partial',limitations:[],records:[{providerItemId:'key-product',title:'Synthetic Steam product',mediaType:'game',metadata:{keyStatus:status,keyCheckedAt:checked},purchasedAt:null,origins:[{orderRef:ref,bundleId:'key-product',bundleTitle:'Synthetic Steam product',quantity:1,purchasedAt:null,keyStatus:status,keyCheckedAt:checked}]}]});
test('FAN dated key observations survive normalization/backup and refresh without losing purchases or other copies',()=>{
 const first=sanitizeImportResult({items:[fanItem()]}).items[0];assert.equal(first.keyStatus,'unrevealed');assert.equal(parseLibraryBackup({schemaVersion:1,items:[first]})[0].purchaseOrigins[0].keyStatus,'unrevealed');
 const refreshed=sanitizeImportResult({items:[first,fanItem('unknown',recent)]}).items[0];assert.equal(refreshed.keyStatus,'unknown');assert.equal(refreshed.purchaseOrigins.length,1);assert.equal(refreshed.purchaseOrigins[0].keyCheckedAt,recent);
 const stale=sanitizeImportResult({items:[refreshed,first]}).items[0];assert.equal(stale.keyStatus,'unknown');
 assert.equal(keySummary([first.purchaseOrigins[0],{...refreshed.purchaseOrigins[0],purchaseRef:'b'.repeat(64)}]).keyStatus,'unrevealed');
 assert.throws(()=>sanitizeImportResult({items:[{...fanItem(),keyStatus:'activated'}]}),/observation/);
 assert.throws(()=>sanitizeImportResult({items:[{...fanItem(),purchaseOrigins:[{...first.purchaseOrigins[0],keyCheckedAt:'invalid'}]}]}),/observation/);
});
test('FAN to GL observations refresh centrally and dismissed reminders survive unchanged evidence; ownership is independent',async()=>{
 const db=createEmptyDatabase();await applyPurchaseSnapshot(db,snap(),{newLabel:'Personal',expectedActiveId:null});let item=Object.values(db.providerItems)[0];assert.equal(item.ownership,'owned');assert.equal(item.metadata.keyStatus,'unrevealed');assert.equal(item.metadata.purchaseOrigins[0].keyStatus,'unrevealed');
 let reminders=libraryReminders(db);assert.equal(reminders.length,1);const r=reminders[0];assert.equal(r.keyStatus,'unrevealed');db.reminderReviews[r.reminderRef]={action:'dismissed',basis:r.basis,until:null,updatedAt:recent};assert.equal(libraryReminders(db).length,0);
 await applyPurchaseSnapshot(db,snap('unrevealed',recent),(await purchaseAccounts(db,'fanatical'))[0]);assert.equal(libraryReminders(db).length,0);
 await applyPurchaseSnapshot(db,snap('unknown','2026-11-09T12:00:00.000Z'),(await purchaseAccounts(db,'fanatical'))[0]);reminders=libraryReminders(db);assert.equal(reminders.length,1);assert.equal(reminders[0].keyStatus,'unknown');assert.equal(Object.values(db.providerItems)[0].ownership,'owned');
 const api=handleExternalApiRequest(db,{type:'GET_REMINDERS',apiVersion:1,provider:'fanatical',offset:0,limit:50});assert.equal(api.reminders[0].keyStatus,'unknown');assert(api.reminders[0].keyCheckedAt);assert(!JSON.stringify(api).includes(ref));
 await applyPurchaseSnapshot(db,snap(),(await purchaseAccounts(db,'fanatical'))[0]);assert.equal(Object.values(db.providerItems)[0].metadata.keyStatus,'unknown');
 const round=await purchaseSnapshot(db,'fanatical',db.providers.fanatical.activeProfileId);assert.equal(round.records[0].origins[0].keyStatus,'unknown');
});
test('legacy purchase clients receive purchases without unsupported key-observation fields, upgraded clients receive dated origins',async()=>{
 const data=snap(),area={get:async d=>d,set:async()=>{}},service=T.createService({runtime:{},area,authorize:async()=>true,peer:async()=>'',accounts:async()=>[],snapshot:async()=>data,commit:async()=>{throw Error('No external commit permitted');}});
 for(const capable of [false,true]){const response=await service.external({type:'GH_PURCHASE_BEGIN',protocolVersion:1,provider:'fanatical',accountRef:'source',...(capable?{keyObservations:1}:{})},{id:'peer'});const chunk=await service.external({type:'GH_PURCHASE_CHUNK',protocolVersion:1,provider:'fanatical',token:response.manifest.token,index:0},{id:'peer'});assert.equal(chunk.records[0].origins[0].keyStatus,capable?'unrevealed':undefined);assert.equal(chunk.records[0].metadata.keyCheckedAt,capable?old:undefined);assert.equal(chunk.records[0].providerItemId,'key-product');}
 assert.equal(data.records[0].origins[0].keyStatus,'unrevealed');
});
