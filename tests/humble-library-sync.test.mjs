import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyDatabase,normalizeProviderItem,providerItemKey,rebuildCanonicalItems} from '../src/lib/models.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {entitlementEvidence,effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {applyPurchaseSnapshot,purchaseSnapshot,purchaseAccounts} from '../src/background/purchase-handoff.js';
const S=GalacticPurchaseSnapshot;
// Records Humble Library 1.1 sends for purchases read from the redesigned Humble Library:
// stable "humble-library:" entitlement and parent identities, no purchase date, Steam keys
// with unknown key status, DRM-free files with their listed formats.
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const native=(n,title,mediaType,extra={})=>({providerItemId:`humble-library:${extra.namespace??'download_drm_free'}:${uuid(n)}`,title,mediaType,
 metadata:{purchaseId:'humble-library:'+uuid(extra.parent??900),sourceBundle:extra.bundle??'Synthetic Comics Bundle',...(extra.namespace==='steam'?{entitlement:'third-party-key',keyStatus:'unknown',keyType:'Steam'}:{entitlement:'direct-download',formats:extra.formats??['cbz','pdf']})},purchasedAt:null,origins:[]});
const snapshot=records=>S.validate({protocolVersion:1,provider:'humble',snapshotId:'synthetic',accountRef:'a'.repeat(64),accountLabel:'Saved account',capturedAt:'2026-11-13T00:00:00.000Z',scope:'historical',completeness:'partial',limitations:[],records});
function database(){
 const db=createEmptyDatabase(),p=newProviderProfile('humble','Existing');db.providerProfiles[p.profileId]=p;db.providers.humble={activeProfileId:p.profileId,profileLabel:p.nickname};
 const steam=newProviderProfile('steam','Steam');db.providerProfiles[steam.profileId]=steam;db.providers.steam={activeProfileId:steam.profileId,profileLabel:steam.nickname};
 return {db,p,steam};
}

test('GL stores synced Humble Library purchases beside imported ones and keeps other providers',async()=>{
 const {db,p}=database();
 const imported={providerItemId:'old-order:product:saga',title:'Saga Volume 1',mediaType:'book',metadata:{purchaseId:'old-order',sourceBundle:'Image Comics Bundle',entitlement:'direct-download'},purchasedAt:'2020-01-01T00:00:00.000Z',origins:[]};
 let stats=await applyPurchaseSnapshot(db,snapshot([imported]),(await purchaseAccounts(db,'humble'))[0]);assert.equal(stats.added,1);
 const steamItem={id:'steam:620',provider:'steam',providerItemId:'620',title:'Portal 2',normalizedTitle:'portal 2',mediaType:'game',ownership:'owned',profileId:Object.values(db.providerProfiles).find(x=>x.provider==='steam').profileId,metadata:{},platform:[]};
 const records=[imported,native(1,'Monstress Volume 1','book'),native(2,'Monstress Volume 1','book',{parent:901}),native(3,'Celeste','game',{namespace:'steam',parent:902,bundle:'Indie Bundle'}),native(4,'Synthetic Guide','book',{formats:['epub','pdf'],bundle:'Synthetic Book Bundle'})];
 const before=structuredClone(db.providerItems);
 stats=await applyPurchaseSnapshot(db,snapshot(records),(await purchaseAccounts(db,'humble'))[0]);
 assert.deepEqual([stats.added,stats.unchanged,stats.skipped],[4,1,0],'native records are added; the imported record is unchanged');
 for(const [id,item]of Object.entries(before))assert.deepEqual(db.providerItems[id],item,'earlier GL records are kept as they were');
 const copies=Object.values(db.providerItems).filter(i=>i.title==='Monstress Volume 1');
 assert.equal(copies.length,2,'two purchases of one title stay two provider records');
 const celeste=db.providerItems[providerItemKey('humble','humble-library:steam:'+uuid(3),p.keySpace)];
 assert.equal(celeste.metadata.entitlement,'third-party-key');assert.equal(celeste.metadata.keyStatus,'unknown');
 assert.deepEqual(entitlementEvidence(celeste),{purchaseEvidence:'confirmed',activationStatus:'unknown',keyStatus:'unknown',expiresAt:null},'a Humble Steam key is a purchase, not a Steam activation');
 assert.equal(effectiveOwnershipRecord(celeste,db).ownership,'owned','owned on Humble, as for imported Humble keys');
 assert(Object.values(db.canonicalItems).some(c=>c.title==='Monstress Volume 1'&&c.mediaType==='book'));
 db.providerItems[steamItem.id]=steamItem;const kept=structuredClone(steamItem);
 stats=await applyPurchaseSnapshot(db,snapshot(records),(await purchaseAccounts(db,'humble'))[0]);
 assert.deepEqual([stats.added,stats.updated,stats.unchanged],[0,0,5],'a repeated sync changes nothing');
 assert.deepEqual(db.providerItems[steamItem.id],kept,'other providers are untouched');
});

test('GL returns synced Library records with their identities so Humble Library can recognise its own',async()=>{
 const {db,p}=database();
 await applyPurchaseSnapshot(db,snapshot([native(1,'Monstress Volume 1','book'),native(3,'Celeste','game',{namespace:'steam',parent:902})]),(await purchaseAccounts(db,'humble'))[0]);
 const back=await purchaseSnapshot(db,'humble',p.profileId);
 assert.deepEqual(back.records.map(r=>r.providerItemId).sort(),['humble-library:download_drm_free:'+uuid(1),'humble-library:steam:'+uuid(3)]);
 assert(back.records.every(r=>r.metadata.purchaseId.startsWith('humble-library:')));
});

test('filtered Humble snapshots leave existing copies and precise access corrections intact through restore',async()=>{
 const {db,p}=database(),other=newProviderProfile('humble','Other account');
 db.providerProfiles[other.profileId]=other;
 const slot={providerItemId:'old-order:product:slot',title:'No Content',mediaType:'book',
   metadata:{purchaseId:'old-order',entitlement:'direct-download'},purchasedAt:null,origins:[]};
 const legitimate={...slot,providerItemId:'old-order:product:book',metadata:{...slot.metadata,formats:['pdf']}};
 const target=async(d,profile)=> (await purchaseAccounts(d,'humble')).find(a=>a.accountRef===profile.profileId);
 await applyPurchaseSnapshot(db,snapshot([slot,legitimate]),await target(db,p));
 await applyPurchaseSnapshot(db,snapshot([slot]),await target(db,other));
 const kindle=newProviderProfile('kindle','Synthetic Kindle');
 db.providerProfiles[kindle.profileId]=kindle;
 const additional=normalizeProviderItem({provider:'kindle',profileId:kindle.profileId,providerItemId:'B000000001',
   title:'No Content',mediaType:'book',ownership:'owned'},undefined,{profileKeySpace:kindle.keySpace});
 db.providerItems[additional.id]=additional;
 db.canonicalItems=rebuildCanonicalItems(db.providerItems);
 const savedSlot=db.providerItems[providerItemKey('humble',slot.providerItemId,p.keySpace)];
 db.ownershipReviews[savedSlot.recordRef]={reviewRef:uuid(98),source:'user-correction',ownership:'unknown',note:'Empty delivery',
   confirmedAt:'2026-11-16T00:00:00.000Z',evidenceDate:null,expiresAt:null,sourceUrl:''};
 const restored=parseBackup(createBackup(db));
 const before=structuredClone(restored);
 for(let n=0;n<2;n++){
   const stats=await applyPurchaseSnapshot(restored,snapshot([legitimate]),{...await target(restored,p),autoSync:{id:'synthetic'}});
   assert.deepEqual(stats,{added:0,updated:0,unchanged:1,skipped:0});
 }
 assert.deepEqual(restored,before,'absence leaves all provider records, profiles, canonical links and user corrections intact');
 assert.equal(effectiveOwnershipRecord(restored.providerItems[savedSlot.id],restored).ownership,'unknown');
 assert.equal(effectiveOwnershipRecord(restored.providerItems[additional.id],restored).ownership,'owned');
 assert.equal(effectiveOwnershipRecord(restored.providerItems[providerItemKey('humble',slot.providerItemId,other.keySpace)],restored).ownership,'owned');
});
