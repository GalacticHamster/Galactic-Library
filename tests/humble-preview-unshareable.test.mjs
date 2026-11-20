// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Galactic Hamster
// Interrupted-sync recovery previews Humble Library's destination with a diagnostic inventory. Saved records
// that normal sharing withholds must not make that preview fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../shared/purchase-snapshot.js';import '../shared/purchase-adapters.js';import '../shared/purchase-sync.js';
import '../../HB/shared.js';import '../../HB/collection-mappings.js';
const S=globalThis.GalacticPurchaseSnapshot,A=globalThis.GalacticPurchaseAdapters,H=globalThis.HumbleComicLibrary;
const item=(n,extra={})=>({title:'Synthetic HB '+n,kind:'book',source:'humble',providerItemId:`synthetic_purchase_${n}:product:synthetic_${n}`,purchaseKey:'synthetic_purchase_'+n,sourceBundle:'Synthetic bundle',entitlement:'direct-download',purchasedAt:'2026-11-01T12:00:00Z',...extra});
const unshareable=[item(9001,{title:'x'.repeat(501)}),item(9002,{title:'Synthetic\u0008control'}),item(9003,{purchasedAt:'not a date'}),item(9004,{kind:'unclassified'})];
function store(items){const saved={humbleProfileLabel:'Main',humbleAccountId:'11111111-1111-4111-8111-111111111111',libraryItems:structuredClone(items),profileArchives:[]};
 const area={get:async d=>structuredClone({...d,...saved}),set:async p=>Object.assign(saved,structuredClone(p)),remove:async k=>[k].flat().forEach(x=>delete saved[x])};return {saved,store:H.createSyncStore(area)};}
const glData=records=>S.validate({protocolVersion:1,provider:'humble',snapshotId:'synthetic-gl',accountRef:'a'.repeat(64),accountLabel:'Main',capturedAt:'2026-11-20T00:00:00.000Z',scope:'historical',completeness:'partial',limitations:[],
 records:records.map(i=>({providerItemId:i.providerItemId,title:i.title,mediaType:'book',purchasedAt:i.purchasedAt,origins:[],metadata:{purchaseId:i.purchaseKey,entitlement:'direct-download',sourceBundle:i.sourceBundle}}))});

test('recovery preview of a Humble library with unshareable records succeeds, is read-only and repeatable',async()=>{
 const valid=Array.from({length:6000},(_,n)=>item(n)),{saved,store:s}=store([...valid,...unshareable]),before=structuredClone(saved);
 const [account]=await s.execute('handoffAccounts');
 const data=glData([...valid.slice(0,10),item(7000)]);
 const first=await s.execute('handoffPreview',[data,{accountRef:account.accountRef}]);
 assert.equal(first.readOnly,true);assert.equal(first.added,1,'the new GL purchase is previewed');
 const second=await s.execute('handoffPreview',[data,{accountRef:account.accountRef}]);
 assert.deepEqual(second,first,'repeated recovery preview is idempotent');
 assert.deepEqual(saved,before,'preview writes nothing; unshareable records stay saved');
 const inventory=await A.hbInventory(saved,account.accountRef);
 const titles=new Set(inventory.records.map(r=>r.title));
 // The diagnostic format can carry the control-character title and the unclassified record (it is not a
 // purchase share); it cannot carry a 501-character title or an unreadable date, so those two are left out.
 assert.equal(inventory.records.length,valid.length+2);
 assert(!titles.has('x'.repeat(501))&&titles.has('Synthetic\u0008control'));
 assert(!inventory.records.some(r=>r.title==='Synthetic HB 9003'),'the record with an unreadable date is left out');
 assert.equal(inventory.currentCount,valid.length+unshareable.length,'the saved library size is still reported');
 // The import that recovery replays, and a later preview, still work.
 const stats=await s.execute('handoffImport',[data,{accountRef:account.accountRef}]);assert.equal(stats.added,1);
 const [after]=await s.execute('handoffAccounts');assert.equal((await s.execute('handoffPreview',[data,{accountRef:after.accountRef}])).added,0);
 assert.equal(saved.libraryItems.length,valid.length+unshareable.length+1,'no record was dropped or duplicated');
});

test('inventories received from another extension are still validated strictly',async()=>{
 const inventory=await A.inventory({role:'hb',accountRef:'b'.repeat(64),accountLabel:'Main',currentCount:1,historicalCount:0,observations:[{rowRef:'current:0',status:'current',title:'Synthetic',mediaType:'book',purchaseId:'synthetic_purchase_1',providerItemId:'synthetic_purchase_1:product:synthetic_1',entitlement:'direct-download',bundle:'Synthetic bundle',purchasedAt:null}]});
 assert.equal(inventory.records.length,1);
 const tampered=structuredClone(inventory);tampered.records[0].title='x'.repeat(501);
 assert.throws(()=>A.validateInventory(tampered),/Invalid inventory field/);
 tampered.records[0].title='Synthetic';tampered.records[0].purchaseRef='not-a-hash';
 assert.throws(()=>A.validateInventory(tampered),/Invalid opaque inventory identity/);
});
