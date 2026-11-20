// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Galactic Hamster
// Media corrections made in Humble Library reach GL for the same identified purchase or entitlement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import {createEmptyDatabase,providerItemKey,validateDatabase} from '../src/lib/models.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {validateOwnershipReview} from '../src/lib/ownership-review.js';
import {applyPurchaseSnapshot,purchaseAccounts} from '../src/background/purchase-handoff.js';
const S=globalThis.GalacticPurchaseSnapshot;
const at='2026-11-20T00:00:00.000Z',uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const native=(n,title,mediaType,parent=900)=>({providerItemId:'humble-library:download_drm_free:'+uuid(n),title,mediaType,purchasedAt:null,origins:[],
 metadata:{purchaseId:'humble-library:'+uuid(parent),sourceBundle:'Synthetic Bundle',entitlement:'direct-download'}});
const imported=(id,title,mediaType)=>({providerItemId:`order-${id}:product:item-${id}`,title,mediaType,purchasedAt:'2020-01-01T00:00:00.000Z',origins:[],metadata:{purchaseId:'order-'+id,sourceBundle:'Synthetic Bundle',entitlement:'direct-download'}});
const snapshot=(records,{provider='humble',accountRef='a'.repeat(64)}={})=>S.validate({protocolVersion:1,provider,snapshotId:'synthetic',accountRef,accountLabel:'Saved account',capturedAt:at,scope:'historical',completeness:'partial',limitations:[],records});
const target=async(db,provider='humble',label='Main')=>(await purchaseAccounts(db,provider)).find(a=>a.label===label);
const humble=db=>Object.values(db.providerItems).filter(i=>i.provider==='humble');
const media=(db,title)=>humble(db).filter(i=>i.title===title).map(i=>i.mediaType).sort();
async function first(records,label='Main'){const db=createEmptyDatabase();const stats=await applyPurchaseSnapshot(db,snapshot(records),{newLabel:label,expectedActiveId:null});return {db,stats};}
const sync=async(db,records,opts={})=>applyPurchaseSnapshot(db,snapshot(records,opts),await target(db,opts.provider,opts.label));

test('Humble Library media corrections converge in GL: unknown -> book -> game, with no duplicates and idempotent repeats',async()=>{
 // Drive Humble Library's own store: Library-only titles, entitlement-keyed media corrections and its companion snapshot.
 const HB=new URL('../../HB/',import.meta.url),copy=v=>JSON.parse(JSON.stringify(v));let stored={};
 const area={get:async d=>({...copy(d),...copy(stored)}),set:async p=>{stored={...stored,...copy(p)};},remove:async k=>{for(const x of [k].flat())delete stored[x];}};
 const context=vm.createContext({console,URL,TextEncoder,TextDecoder,Date,crypto:webcrypto,setTimeout,clearTimeout,structuredClone});context.globalThis=context;
 for(const file of ['purchase-snapshot.js','purchase-adapters.js','purchase-sync.js','library-entitlements.js','shared.js'])vm.runInContext(fs.readFileSync(new URL(file,HB),'utf8'),context,{filename:file});
 const H=context.HumbleComicLibrary,E=context.HumbleLibraryEntitlements,store=H.createSyncStore(area),scope={principalId:'principal-A',userId:'hub-A'},ACCOUNT='11111111-1111-4111-8111-111111111111';
 const observation=(n,title,parent)=>E.observation({scope,nativeId:uuid(n),namespace:'download_drm_free',title,parentId:uuid(parent),parentTitle:'Synthetic Mixed Bundle',source:'authenticated-humble-library',observedAt:'2026-01-01T00:00:00.000Z',
  eligibility:{expired:false,preOrdered:false,outOfStock:false,redeemable:true,directRedeem:false,parentPreOrder:false,revoked:null,temporaryAccess:null,giftStatus:'unassigned',parentType:'bundle',integration:'none',redemptionGroups:'none',unavailableBefore:{state:'none',value:null},unavailableAfter:{state:'none',value:null},redeemedAt:{state:'none',value:null}}});
 stored={humbleAccountId:ACCOUNT,humbleProfileLabel:'Main',libraryItems:[],profileArchives:[],mediaTypeOverrides:{},libraryEntitlements:{version:1,scopes:[{...scope,localAccountId:ACCOUNT,profileLabel:'Main',
  observations:[observation(1,'Synthetic Unknown Media',1001),observation(2,'Synthetic Unknown Media',1002),observation(3,'Synthetic Other Title',1003)],lastScan:null,sync:null}]}};
 const refs=[1,2].map(n=>({namespace:'download_drm_free',nativeId:uuid(n)}));
 await store.execute('setNativeMediaOverride',[[{namespace:'download_drm_free',nativeId:uuid(3)}],'game']);
 const send=async()=>{const [a]=copy(await store.execute('handoffAccounts'));return copy(await store.execute('handoffSnapshot',[a.accountRef]));};
 const db=createEmptyDatabase();
 assert.equal((await applyPurchaseSnapshot(db,await send(),{newLabel:'Main',expectedActiveId:null})).added,1,'unknown media is withheld');
 const apply=async()=>applyPurchaseSnapshot(db,await send(),await target(db));
 await store.execute('setNativeMediaOverride',[refs,'book']);
 assert.deepEqual(await apply(),{added:2,updated:0,unchanged:1,skipped:0});assert.deepEqual(media(db,'Synthetic Unknown Media'),['book','book']);
 const refsBefore=humble(db).map(i=>i.recordRef).sort();
 await store.execute('setNativeMediaOverride',[refs,'game']);
 assert.deepEqual(await apply(),{added:0,updated:2,unchanged:1,skipped:0},'the second correction updates both purchases in place');
 assert.deepEqual(media(db,'Synthetic Unknown Media'),['game','game']);assert.deepEqual(humble(db).map(i=>i.recordRef).sort(),refsBefore,'record identities are kept');
 assert.deepEqual(await apply(),{added:0,updated:0,unchanged:3,skipped:0},'repeat sync is idempotent');
 await store.execute('setNativeMediaOverride',[refs,null]);
 assert.deepEqual(await apply(),{added:0,updated:0,unchanged:1,skipped:0},'a title withheld again keeps its last GL record; absence is not deletion');
 assert.deepEqual(media(db,'Synthetic Unknown Media'),['game','game']);
 assert(Object.values(db.canonicalItems).some(c=>c.title==='Synthetic Unknown Media'&&c.mediaType==='game'));
 assert(!Object.values(db.canonicalItems).some(c=>c.title==='Synthetic Unknown Media'&&c.mediaType==='book'),'the old classification leaves no stale title');
 validateDatabase(db);
});

test('game -> book -> game converges for an imported Humble purchase; comics arrive as books',async()=>{
 const {db}=await first([imported(1,'Synthetic Saga','game')]),id=humble(db)[0].id;
 for(const [mediaType,expected]of [['book','book'],['game','game']]){assert.equal((await sync(db,[imported(1,'Synthetic Saga',mediaType)])).updated,1);assert.equal(db.providerItems[id].mediaType,expected);}
 assert.equal(humble(db).length,1,'one purchase stays one record');
 assert.equal(Object.values(db.providerProfiles).find(p=>p.provider==='humble').state.recordCount,1);
 assert.equal(globalThis.GalacticPurchaseAdapters.glSnapshotMediaType('comic'),'book','a Humble comic correction is shared as a book');
 assert.equal((await sync(db,[imported(1,'Synthetic Saga',globalThis.GalacticPurchaseAdapters.glSnapshotMediaType('comic'))])).updated,1);
 assert.equal(db.providerItems[id].mediaType,'book');
});

test('a correction survives a database restart and backup restore, then later corrections still apply',async()=>{
 const {db}=await first([native(1,'Synthetic Title','book')]);await sync(db,[native(1,'Synthetic Title','game')]);
 const reloaded=validateDatabase(JSON.parse(JSON.stringify(db)));
 assert.deepEqual(await sync(reloaded,[native(1,'Synthetic Title','game')]),{added:0,updated:0,unchanged:1,skipped:0});
 const restored=parseBackup(JSON.parse(JSON.stringify(createBackup(reloaded))));
 assert.equal(media(restored,'Synthetic Title')[0],'game');
 assert.deepEqual(await sync(restored,[native(1,'Synthetic Title','game')]),{added:0,updated:0,unchanged:1,skipped:0});
 assert.equal((await sync(restored,[native(1,'Synthetic Title','book')])).updated,1);assert.deepEqual(media(restored,'Synthetic Title'),['book']);
});

test('GL relationship, edition and contents decisions keep GL\'s classification; the database stays valid',async()=>{
 for(const decide of [
  (db,a,b)=>{db.manualMatchDecisions[[a,b].sort().join('\u0000')]={decision:'same-edition',itemIds:[a,b].sort(),updatedAt:at};},
  (db,a,b)=>{db.editionSeparations['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']={itemId:a,otherItemIds:[b],updatedAt:at};},
  (db,a)=>{db.contentReviews[a]={entries:[{series:'Synthetic Pinned',unitType:'issue',number:'1'}],statement:'Collects Synthetic Pinned #1',verifiedAt:'2026-10-01'};}]){
  const {db}=await first([native(1,'Synthetic Pinned','book'),native(2,'Synthetic Pinned','book',901)]),[a,b]=humble(db).map(i=>i.id).sort();
  decide(db,a,b);const decisions=structuredClone([db.manualMatchDecisions,db.editionSeparations,db.contentReviews]);
  const stats=await sync(db,[native(1,'Synthetic Pinned','game'),native(2,'Synthetic Pinned','book',901)]);
  const pinned=humble(db).find(i=>i.providerItemId.endsWith(uuid(1)));
  assert.equal(pinned.mediaType,'book');assert.equal(stats.skipped,1);
  assert.deepEqual([db.manualMatchDecisions,db.editionSeparations,db.contentReviews],decisions,'GL decisions are kept');
  validateDatabase(db);
 }
});

test('a GL ownership correction survives Humble media changes',async()=>{
 const {db}=await first([native(1,'Synthetic Owned','book')]),record=humble(db)[0];
 db.ownershipReviews[record.recordRef]=validateOwnershipReview({ownership:'returned',source:'user-correction',note:'',evidenceDate:null,sourceUrl:'',expiresAt:null,confirmedAt:at,reviewRef:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 await sync(db,[native(1,'Synthetic Owned','game')]);
 const after=humble(db)[0];assert.equal(after.mediaType,'game');assert.equal(after.recordRef,record.recordRef);
 assert.equal(effectiveOwnershipRecord(after,db).ownership,'returned','the user correction still applies');
 assert.equal(after.ownership,record.ownership,'provider ownership evidence is unchanged');
 validateDatabase(db);
});

test('only the corrected purchase changes: same-title purchases, other accounts and other providers are untouched',async()=>{
 const {db}=await first([native(1,'Synthetic Twin','book'),native(2,'Synthetic Twin','book',901)]);
 const main=Object.values(db.providerProfiles).find(p=>p.provider==='humble');
 await applyPurchaseSnapshot(db,snapshot([native(1,'Synthetic Twin','book')],{accountRef:'b'.repeat(64)}),{newLabel:'Second',expectedActiveId:main.profileId});
 const second=Object.values(db.providerProfiles).find(p=>p.nickname==='Second');
 const steam=newProviderProfile('steam','Steam');db.providerProfiles[steam.profileId]=steam;
 const steamItem={id:providerItemKey('steam','620',steam.keySpace),provider:'steam',providerItemId:'620',title:'Synthetic Twin',normalizedTitle:'synthetic twin',mediaType:'book',ownership:'owned',profileId:steam.profileId,metadata:{},platform:[]};
 db.providerItems[steamItem.id]=steamItem;const otherAccount=structuredClone(humble(db).find(i=>i.profileId===second.profileId)),keptSteam=structuredClone(steamItem);
 assert.deepEqual(await sync(db,[native(1,'Synthetic Twin','game'),native(2,'Synthetic Twin','book',901)]),{added:0,updated:1,unchanged:1,skipped:0});
 const mine=humble(db).filter(i=>i.profileId===main.profileId);
 assert.deepEqual(mine.map(i=>[i.providerItemId.slice(-1),i.mediaType]).sort(),[['1','game'],['2','book']]);
 assert.deepEqual(humble(db).find(i=>i.profileId===second.profileId),otherAccount,'the same title in another Humble account is unchanged');
 assert.deepEqual(db.providerItems[steamItem.id],keptSteam,'Steam evidence is unchanged');
 assert.equal(humble(db).length,3,'no purchase is added or removed');
});

test('records without their own ID and Fanatical records keep the existing media rule',async()=>{
 const {db}=await first([imported(1,'Synthetic Fallback','book')]);const legacy={...imported(1,'Synthetic Fallback','game')};delete legacy.providerItemId;
 await assert.rejects(sync(db,[legacy]),/No compatible records/,'title-only evidence is not used to reclassify');
 assert.deepEqual(media(db,'Synthetic Fallback'),['book']);
 const fan=createEmptyDatabase(),row=m=>({providerItemId:'synthetic-fan-1',title:'Synthetic Fan',mediaType:m,purchasedAt:null,origins:[],metadata:{}});
 await applyPurchaseSnapshot(fan,snapshot([row('book')],{provider:'fanatical'}),{newLabel:'Main',expectedActiveId:null});
 await assert.rejects(applyPurchaseSnapshot(fan,snapshot([row('game')],{provider:'fanatical'}),await target(fan,'fanatical')),/No compatible Fanatical records/);
 assert.equal(Object.values(fan.providerItems)[0].mediaType,'book','Fanatical sharing is unchanged');
});
