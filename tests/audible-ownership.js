import assert from 'node:assert/strict';
import {withWorker} from './storage.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateAudibleHistory} from '../src/lib/audible-ownership.js';
import {validateMetadata} from '../src/lib/metadata-validation.js';
import {acquisitionDate,formatDate} from '../src/ui/formatters.js';
import {acquisitionHistory} from '../src/ui/library-acquisitions.js';
const id=n=>'B'+String(n).padStart(9,'0');
const item=(n,ownership='unknown')=>({providerItemId:id(n),title:'Synthetic recording '+n,mediaType:'audiobook',ownership,metadata:{asin:id(n),narrators:['Narrator '+n]}});
const history=(purchases=[],patch={})=>({format:1,ordersComplete:true,refundsComplete:true,purchases,refunds:[],uncertainRefundAsins:[],years:[2026,2025],pagesRead:4,reason:null,...patch});
const purchase=(n,method='cash',date='2025-12-07')=>({asin:id(n),date,method});
const snapshot=items=>completeProviderSnapshot('audible',items,[completedScope('library',items.length,items.length,'pagination-end',1)]);
const memory=()=>{const values={};let fail=false;return {values,fail:()=>{fail=true;},writer:createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async patch=>{if(fail)throw Error('Storage failed');Object.assign(values,structuredClone(patch));}})};};
const rows=db=>Object.values(db.providerItems).filter(i=>i.provider==='audible');
const temporary=(n,locked=false)=>({...item(n,locked?'expired':'subscription'),metadata:{...item(n).metadata,source:'audible-library-page',libraryAction:'Remove',...(locked?{libraryAvailability:'unavailable',audibleOwnershipBasis:'audible-library-action'}:{})}});
export const audibleOwnershipTests=[
 ['Audible temporary access is reversible, scoped, dateless and durable without manufacturing purchases',async()=>{
   const {writer:w}=memory();let db=await w.mergeProviderItems('audible',[temporary(1),temporary(2,true),item(3)]);const refs=rows(db).map(r=>r.recordRef);
   assert.deepEqual(rows(db).map(r=>r.ownership),['subscription','expired','unknown']);assert(rows(db).every(r=>!r.acquiredAt&&!r.metadata.audiblePurchaseEvidence));
   db=await w.mergeProviderItems('audible',[temporary(1,true),temporary(2)]);
   assert.deepEqual(rows(db).map(r=>r.ownership),['expired','subscription','unknown']);assert.deepEqual(rows(db).map(r=>r.recordRef),refs);assert.equal(Object.keys(db.providerHistory).length,0);
   const restored=parseBackup(createBackup(db));await w.restoreDatabase(restored);db=await w.getDatabase();assert.equal(rows(db)[0].metadata.libraryAvailability,'unavailable');
   db=await w.mergeProviderItems('audible',[item(1)]);assert.equal(rows(db)[0].ownership,'expired');assert.equal(rows(db)[0].metadata.audibleOwnershipBasis,'audible-library-action');
   db=await w.mergeProviderItems('audible',[temporary(1)]);assert.equal(rows(db)[0].ownership,'subscription');assert.equal(rows(db)[0].metadata.libraryAvailability,undefined);
 }],
 ['Audible library expiry cannot revoke owned purchases, gifts, terminal states or user corrections',async()=>{
   const {writer:w}=memory();let db=await w.mergeProviderItems('audible',[item(1),item(2),item(3,'returned'),item(4,'revoked'),item(5,'expired'),item(6,'owned'),item(7)]);
   db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1),purchase(2,'gift','2023-06-20')],{giftYears:[2023],giftsComplete:true,giftPagesRead:1})});
   const record=rows(db).find(r=>r.providerItemId===id(7));db=await w.saveOwnershipCorrections([{recordRef:record.recordRef,provider:'audible',profileId:record.profileId,expectedReviewRef:null}],{ownership:'owned',note:'User choice'});const reviews=structuredClone(db.ownershipReviews),dates=rows(db).map(r=>r.acquiredAt);
   db=await w.mergeProviderItems('audible',[1,2,3,4,5,6,7].map(n=>temporary(n,true)));
   assert.deepEqual(rows(db).map(r=>r.ownership),['owned','owned','returned','revoked','expired','owned','expired']);assert.deepEqual(rows(db).map(r=>r.acquiredAt),dates);assert.deepEqual(db.ownershipReviews,reviews);assert.equal(effectiveOwnershipRecord(rows(db).find(r=>r.providerItemId===id(7)),db).ownership,'owned');
   db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(5,'gift','2023-06-20')],{giftYears:[2023],giftsComplete:true,giftPagesRead:1})});assert.equal(rows(db).find(r=>r.providerItemId===id(5)).ownership,'expired','An explicit earlier expiry must not become a library-derived expiry on reimport');
 }],
 ['Audible current purchase or redeemed gift evidence supersedes temporary library expiry without erasing source labels',async()=>{
   const {writer:w}=memory();await w.mergeProviderItems('audible',[temporary(1,true),temporary(2,true)]);
   const db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1),purchase(2,'gift','2023-06-20')],{giftYears:[2023],giftsComplete:true,giftPagesRead:1})});
   assert(rows(db).every(r=>r.ownership==='owned'&&r.metadata.libraryAction==='Remove'&&r.metadata.libraryAvailability==='unavailable'&&r.metadata.audibleOwnershipBasis==='audible-purchase-history'));
   assert.equal(rows(db)[0].acquiredAt,'2025-12-07T00:00:00.000Z');assert.equal(rows(db)[1].acquiredAt,'2023-06-20T00:00:00.000Z');
 }],
 ['Audible availability metadata validates fixed labels without accepting arbitrary source prose',()=>{
   assert.equal(validateMetadata('audible',{libraryAvailability:'unavailable',audibleOwnershipBasis:'audible-library-action'}).libraryAvailability,'unavailable');
   assert.throws(()=>validateMetadata('audible',{libraryAvailability:'Purchased'}),/availability/);
 }],
 ['Audible actual worker commits scoped history atomically and exposes historical baseline without changing manual ownership',()=>withWorker(async({dispatch,pageA})=>{
   const sender={id:chrome.runtime.id,url:'https://www.audible.com/library',tab:{id:92}},items=[item(1)];
   const begin=mode=>dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'audible',beginScan:true,profileLabel:'Personal',confirmed:true,mode},sender);
   let scan=await begin('full');assert(scan.ok,scan.error);
   let done=await dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'audible',mode:'full',scanToken:scan.scanToken,items,snapshot:snapshot(items),audibleHistory:history([purchase(1)])},sender);assert(done.ok,done.error);assert.equal(done.ownership.owned,1);
   let db=await pageA.getDatabase(),record=rows(db)[0];const fullCheckedAt=db.providers.audible.syncState.audibleHistory.fullCheckedAt;assert(fullCheckedAt);
   await pageA.saveOwnershipCorrections([{recordRef:record.recordRef,provider:'audible',profileId:record.profileId,expectedReviewRef:null}],{ownership:'returned',note:'User choice'});
   scan=await begin('incremental');assert(scan.ok,scan.error);assert.equal(scan.syncState.audibleHistory.fullCheckedAt,fullCheckedAt);
   const before=await pageA.getDatabase(),request={type:'COMMIT_PROVIDER_SCAN',provider:'audible',mode:'incremental',scanToken:scan.scanToken,items:[],audibleHistory:history([purchase(1)],{scope:'recent'})};
   const foreign=await dispatch(request,{...sender,tab:{id:93}});assert.equal(foreign.ok,false);assert.deepEqual(await pageA.getDatabase(),before);
   done=await dispatch(request,sender);assert(done.ok,done.error);assert.equal(done.ownership.returned,1);assert.equal(done.ownership.owned??0,0);
   db=await pageA.getDatabase();assert.equal(db.providers.audible.syncState.audibleHistory.scope,'recent');assert.equal(db.providers.audible.syncState.audibleHistory.fullCheckedAt,fullCheckedAt);assert.deepEqual(db.ownershipReviews,before.ownershipReviews);assert.equal(rows(db)[0].recordRef,record.recordRef);
 })],
 ['Audible full scan reconciles cash, credit, zero-price and other completed purchases without new audiobook identities',async()=>{
   const {writer:w}=memory(),items=[1,2,3,4].map(n=>item(n));let db=await w.mergeProviderItems('audible',items);const refs=rows(db).map(i=>i.recordRef);
   db=await w.replaceProviderItems('audible',items,{syncMode:'full',audibleHistory:history(['cash','credit','free','purchase'].map((m,n)=>purchase(n+1,m)))},snapshot(items));
   assert.deepEqual(rows(db).map(i=>i.recordRef),refs);assert.equal(rows(db).length,4);
   for(const row of rows(db)){assert.equal(row.ownership,'owned');assert.equal(row.acquiredAt,'2025-12-07T00:00:00.000Z');assert.equal(acquisitionDate(row),'2025-12-07');assert.equal(row.metadata.audiblePurchaseEvidence.length,1);}
   assert.equal(Object.keys(db.providerHistory).length,0);assert.equal(db.providers.audible.syncState.audibleHistory.ordersComplete,true);
 }],
 ['Audible zero-item Quick update enriches previously unconfirmed records by exact ASIN, preserving other providers and accounts',async()=>{
   const {writer:w}=memory();let db=await w.mergeProviderItems('audible',[item(1)],{profileLabel:'First'});const profile=db.providers.audible.activeProfileId;
   db=await w.mergeProviderItems('audible',[item(2)],{profileLabel:'Second'});db=await w.mergeProviderItems('gog',[{providerItemId:'keep',title:'Other game',mediaType:'game',ownership:'owned'}]);const before=structuredClone(db);
   db=await w.mergeProviderItems('audible',[],{profileId:profile,syncMode:'incremental',audibleHistory:history([purchase(1),purchase(2),purchase(999)],{scope:'recent'})});
   assert.equal(rows(db).find(i=>i.providerItemId===id(1)).ownership,'owned');assert.equal(rows(db).find(i=>i.providerItemId===id(2)).ownership,'unknown');
   for(const record of Object.values(before.providerItems).filter(i=>i.profileId!==profile))assert.deepEqual(db.providerItems[record.id],record);
   assert.equal(rows(db).length,2);assert(!rows(db).some(i=>i.providerItemId===id(999)));
 }],
 ['Audible manual corrections remain authoritative while purchase facts and original calendar dates are retained',async()=>{
   const {writer:w}=memory();let db=await w.mergeProviderItems('audible',[item(1)]),r=rows(db)[0];
   db=await w.saveOwnershipCorrections([{recordRef:r.recordRef,provider:'audible',profileId:r.profileId,expectedReviewRef:null}],{ownership:'returned',note:'User choice'});const reviews=structuredClone(db.ownershipReviews);
   db=await w.replaceProviderItems('audible',[item(1)],{audibleHistory:history([purchase(1)])},snapshot([item(1)]));r=rows(db)[0];
   assert.deepEqual(db.ownershipReviews,reviews);assert.equal(effectiveOwnershipRecord(r,db).ownership,'returned');assert.equal(acquisitionDate(r),'2025-12-07');
   assert.match(formatDate(acquisitionDate(r),{time:false,locale:'en-US'}),/Dec 7, 2025/);
 }],
 ['Audible incomplete history saves library discoveries, preserves dates and positive access, and does not promote purchases while refunds are unchecked',async()=>{
   const {writer:w}=memory();let db=await w.mergeProviderItems('audible',[item(1),item(2,'owned')]);
   db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1)],{ordersComplete:false,refundsComplete:false,reason:'history-inaccessible'})});
   assert.equal(rows(db).find(i=>i.providerItemId===id(1)).ownership,'unknown');assert.equal(rows(db).find(i=>i.providerItemId===id(1)).acquiredAt,'2025-12-07T00:00:00.000Z');
   db=await w.replaceProviderItems('audible',[item(1),item(2),item(3)],{audibleHistory:history([],{ordersComplete:false,refundsComplete:false})},snapshot([item(1),item(2),item(3)]));
   assert.equal(rows(db).length,3);assert.equal(rows(db).find(i=>i.providerItemId===id(2)).ownership,'owned');assert.equal(rows(db).find(i=>i.providerItemId===id(1)).acquiredAt,'2025-12-07T00:00:00.000Z');
   assert.equal(db.providers.audible.syncState.audibleHistory.ordersComplete,false);
 }],
 ['Audible failed refund purchase year holds only linked purchases after complete Full orders, and checked scope survives reload and restore',async()=>{
   const {writer:w}=memory(),items=[1,2,3,4,5].map(n=>item(n));
   const facts=[purchase(1,'cash','2021-01-02'),purchase(2,'credit','2015-01-02'),purchase(3,'cash','2014-01-02'),purchase(3,'cash','2015-01-02'),purchase(4,'cash','2021-01-02'),purchase(5,'cash','2013-01-02')];
   const partial=history(facts,{scope:'full',refundsComplete:false,years:[2021,2015,2014,2013],refundPurchaseYearsChecked:[2021,2014,2013],refunds:[{asin:id(4),date:'2021-07-29'}],uncertainRefundAsins:[id(5)],reason:'history-provider-error'});
   let db=await w.replaceProviderItems('audible',items,{audibleHistory:partial},snapshot(items));
   assert.deepEqual(rows(db).map(r=>r.ownership),['owned','unknown','unknown','returned','unknown']);
   assert(rows(db).every(r=>r.acquiredAt));assert(!db.providers.audible.syncState.audibleHistory.fullCheckedAt);
   const refs=rows(db).map(r=>r.recordRef),restored=parseBackup(createBackup(db));assert.deepEqual(restored.providers.audible.syncState.audibleHistory.refundPurchaseYearsChecked,[2021,2014,2013]);
   db=await w.replaceProviderItems('audible',items,{audibleHistory:partial},snapshot(items));assert.equal(db.providers.audible.syncHealth.differences.updated,0);assert.deepEqual(rows(db).map(r=>r.recordRef),refs);
   assert.deepEqual(rows(await w.getDatabase()).map(r=>r.ownership),['owned','unknown','unknown','returned','unknown']);
 }],
 ['Audible partial refund scope cannot promote legacy payloads, incomplete orders, Quick updates, or out-of-scope years',async()=>{
   for(const patch of [{},{scope:'full',ordersComplete:false,refundPurchaseYearsChecked:[2021]},{scope:'recent',refundPurchaseYearsChecked:[2021]}]){
     const {writer:w}=memory();const db=await w.mergeProviderItems('audible',[item(1)],{audibleHistory:history([purchase(1,'cash','2021-01-02')],{scope:'full',refundsComplete:false,years:[2021,2015],...patch})});
     assert.equal(rows(db)[0].ownership,'unknown');assert.equal(rows(db)[0].metadata.audiblePurchaseEvidence.length,1);
   }
   assert.throws(()=>validateAudibleHistory(history([],{refundPurchaseYearsChecked:[2015]})),/scope/);
   assert.throws(()=>validateAudibleHistory(history([],{refundPurchaseYearsChecked:['2025']})),/years/);
 }],
 ['Audible recipient redemption establishes exact-account gift ownership even when unrelated historical checks are incomplete',async()=>{
   const {writer:w}=memory();let db=await w.mergeProviderItems('audible',[item(1)],{profileLabel:'Recipient'});const profile=db.providers.audible.activeProfileId;
   await w.mergeProviderItems('audible',[item(1)],{profileLabel:'Other account'});
   const gifts=history([purchase(1,'gift','2022-12-30')],{ordersComplete:false,refundsComplete:false,giftsComplete:false,giftYears:[2023,2022],giftPagesRead:1,years:[2026,2025],reason:'history-provider-error'});
   db=await w.mergeProviderItems('audible',[],{profileId:profile,audibleHistory:gifts});
   const received=rows(db).find(r=>r.profileId===profile),other=rows(db).find(r=>r.profileId!==profile);
   assert.equal(received.ownership,'owned');assert.equal(received.acquiredAt,'2022-12-30T00:00:00.000Z');assert.equal(other.ownership,'unknown');assert(!db.providers.audible.syncState.audibleHistory.fullCheckedAt);
   assert.deepEqual(parseBackup(createBackup(db)).providers.audible.syncState.audibleHistory.giftYears,[2023,2022]);
 }],
 ['Audible gifts preserve manual corrections, explicit revocation and expiry, and do not invent a purchase date',async()=>{
   const {writer:w}=memory();let db=await w.mergeProviderItems('audible',[item(1),item(2,'revoked'),item(3,'expired')]);const record=rows(db).find(r=>r.providerItemId===id(1));
   db=await w.saveOwnershipCorrections([{recordRef:record.recordRef,provider:'audible',profileId:record.profileId,expectedReviewRef:null}],{ownership:'returned',note:'User correction'});const reviews=structuredClone(db.ownershipReviews);
   db=await w.replaceProviderItems('audible',[item(1),item(2),item(3)],{audibleHistory:history([1,2,3].map(n=>purchase(n,'gift','2023-06-20')),{refundsComplete:false,giftsComplete:true,giftYears:[2023],giftPagesRead:1})},snapshot([item(1),item(2),item(3)]));
   assert.deepEqual(db.ownershipReviews,reviews);assert.equal(effectiveOwnershipRecord(rows(db).find(r=>r.providerItemId===id(1)),db).ownership,'returned');
   assert.equal(rows(db).find(r=>r.providerItemId===id(2)).ownership,'revoked');assert.equal(rows(db).find(r=>r.providerItemId===id(3)).ownership,'expired');assert(rows(db).every(r=>r.acquiredAt==='2023-06-20T00:00:00.000Z'));
 }],
 ['Audible gift scope is optional for legacy backups but requires valid completion and bounded years when present',()=>{
   assert.equal(validateAudibleHistory(history()).giftsComplete,undefined);
   assert.throws(()=>validateAudibleHistory(history([],{giftsComplete:'yes',giftYears:[2023],giftPagesRead:1})),/gift/);
   assert.throws(()=>validateAudibleHistory(history([],{giftYears:[2023]})),/gift/);
   assert.throws(()=>validateAudibleHistory(history([],{giftsComplete:true,giftYears:['2023'],giftPagesRead:1})),/years/);
 }],
 ['Audible partial orders with a complete refund check can contribute safe positive purchases without declaring historical completeness',async()=>{
   const {writer:w}=memory();await w.mergeProviderItems('audible',[item(1)]);
   const db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1)],{ordersComplete:false})});assert.equal(rows(db)[0].ownership,'owned');assert.equal(db.providers.audible.syncState.audibleHistory.ordersComplete,false);
 }],
 ['Audible known returns, later repurchases and same-day ambiguities respect chronology without creating acquisition events',async()=>{
   const {writer:w}=memory(),items=[1,2,3,4].map(n=>item(n));await w.mergeProviderItems('audible',items);
   const h=history([purchase(1),purchase(2,'credit','2026-02-01'),purchase(3,'cash','2026-01-01'),purchase(4)],{refunds:[{asin:id(1),date:'2026-01-01'},{asin:id(2),date:'2026-01-01'},{asin:id(3),date:'2026-01-01'}],uncertainRefundAsins:[id(4)]});
   const db=await w.mergeProviderItems('audible',[],{audibleHistory:h});const state=n=>rows(db).find(i=>i.providerItemId===id(n)).ownership;
   assert.equal(state(1),'returned');assert.equal(state(2),'owned');assert.equal(state(3),'unknown');assert.equal(state(4),'unknown');assert.equal(db.providers.audible.syncState.audibleHistory.uncertainRefunds,1);assert.equal(Object.keys(db.providerHistory).length,0);
 }],
 ['Audible repeated Full and Quick enrichment is idempotent in records, acquisitions, corrections and backup restore',async()=>{
   const {writer:w}=memory(),items=[item(1)],h=history([purchase(1),purchase(1),purchase(1,'credit','2026-01-30')]);
   let db=await w.replaceProviderItems('audible',items,{audibleHistory:h},snapshot(items));const ref=rows(db)[0].recordRef,metadata=structuredClone(rows(db)[0].metadata),dates=acquisitionHistory(rows(db),db).entries.map(e=>e.dates);
   db=await w.replaceProviderItems('audible',items,{audibleHistory:h},snapshot(items));assert.equal(db.providers.audible.syncHealth.differences.updated,0);
   db=await w.mergeProviderItems('audible',[],{audibleHistory:h});assert.deepEqual(rows(db)[0].metadata,metadata);assert.equal(rows(db)[0].recordRef,ref);assert.equal(Object.keys(db.providerHistory).length,0);assert.equal(rows(db)[0].metadata.audiblePurchaseEvidence.length,2);assert.deepEqual(acquisitionHistory(rows(db),db).entries.map(e=>e.dates),dates);
   const restored=parseBackup(createBackup(db));assert.deepEqual(rows(restored)[0].metadata,metadata);assert.equal(rows(restored)[0].acquiredAt,rows(db)[0].acquiredAt);
 }],
 ['Audible acquisition enrichment never overwrites a reliable existing date and unknown absence does not imply subscription',async()=>{
   const {writer:w}=memory();await w.mergeProviderItems('audible',[{...item(1),acquiredAt:'2020-01-01'},item(2),item(3,'subscription')]);
   const db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1)])});assert.equal(rows(db).find(i=>i.providerItemId===id(1)).acquiredAt,'2020-01-01T00:00:00.000Z');assert.equal(rows(db).find(i=>i.providerItemId===id(2)).ownership,'unknown');assert.equal(rows(db).find(i=>i.providerItemId===id(3)).ownership,'subscription');
 }],
 ['Audible recent checks preserve historical evidence without claiming an all-year baseline or approving old uncertain purchases',async()=>{
   const {writer:w}=memory(),items=[item(1),item(2)];await w.mergeProviderItems('audible',items);
   let db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1,'credit','2014-02-01')],{refundsComplete:false})});
   db=await w.mergeProviderItems('audible',items,{audibleHistory:history([purchase(2)],{scope:'recent'})});
   assert.equal(rows(db).find(r=>r.providerItemId===id(1)).ownership,'unknown');assert.equal(rows(db).find(r=>r.providerItemId===id(1)).acquiredAt,'2014-02-01T00:00:00.000Z');assert.equal(rows(db).find(r=>r.providerItemId===id(2)).ownership,'owned');
   assert.equal(db.providers.audible.syncState.audibleHistory.scope,'recent');assert.equal(db.providers.audible.syncState.audibleHistory.fullCheckedAt,undefined);
   db=await w.replaceProviderItems('audible',items,{audibleHistory:history([purchase(1,'credit','2014-02-01'),purchase(2)])},snapshot(items));const baseline=db.providers.audible.syncState.audibleHistory.fullCheckedAt;assert(baseline);
   db=await w.mergeProviderItems('audible',[],{audibleHistory:history([],{scope:'recent'})});
   assert.equal(db.providers.audible.syncState.audibleHistory.fullCheckedAt,baseline);assert.equal(rows(db).find(r=>r.providerItemId===id(1)).ownership,'owned');assert.equal(rows(db).find(r=>r.providerItemId===id(1)).metadata.audiblePurchaseEvidence[0].date,'2014-02-01');
   assert.equal(parseBackup(createBackup(db)).providers.audible.syncState.audibleHistory.fullCheckedAt,baseline);
 }],
 ['Audible complete refund enumeration holds only undated refund identities, allowing unrelated supported purchases',async()=>{
   const {writer:w}=memory();await w.mergeProviderItems('audible',[item(1),item(2),item(3)]);
   const db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1),purchase(2)],{ordersComplete:false,uncertainRefundAsins:[id(1)]})});
   assert.equal(rows(db).find(r=>r.providerItemId===id(1)).ownership,'unknown');assert.equal(rows(db).find(r=>r.providerItemId===id(2)).ownership,'owned');assert.equal(rows(db).find(r=>r.providerItemId===id(3)).ownership,'unknown');
   assert.equal(db.providers.audible.syncState.audibleHistory.refundsComplete,true);assert.equal(db.providers.audible.syncState.audibleHistory.uncertainRefunds,1);assert.equal(db.providers.audible.syncState.audibleHistory.fullCheckedAt,undefined);
   assert.equal(rows(db).filter(r=>r.acquiredAt==='2025-12-07T00:00:00.000Z').length,2);
 }],
 ['Audible per-view failure details survive reload and backup without accepting arbitrary page text',async()=>{
   const {writer:w}=memory();await w.mergeProviderItems('audible',[item(1)]);
   const failures=[{view:'refund-history',year:2026,reason:'history-empty-unconfirmed',pagesRead:1,rows:0,unboundRows:0,conflictingGroups:0,multipleIdentities:0,limited:false},{view:'orders',year:2021,reason:'history-unreadable-entries',pagesRead:5,rows:12,unboundRows:1,conflictingGroups:0,multipleIdentities:0,limited:false}];
   const db=await w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1)],{ordersComplete:false,refundsComplete:false,failures})});
   assert.deepEqual(db.providers.audible.syncState.audibleHistory.failures,failures);assert.equal(rows(db)[0].ownership,'unknown');assert.equal(rows(db)[0].acquiredAt,'2025-12-07T00:00:00.000Z');
   assert.deepEqual((await w.getDatabase()).providers.audible.syncState.audibleHistory.failures,failures);assert.deepEqual(parseBackup(createBackup(db)).providers.audible.syncState.audibleHistory.failures,failures);
   assert.throws(()=>validateAudibleHistory(history([],{failures:[{...failures[0],reason:'PRIVATE_PAGE_TEXT'}]})));assert.throws(()=>validateAudibleHistory(history([],{failures:[{...failures[0],rows:-1}]})));
 }],
 ['Audible invalid snapshots, malformed purchase dates and failed writes are atomic',async()=>{
   const {writer:w,values,fail}=memory(),items=[item(1)];await w.mergeProviderItems('audible',items);const before=structuredClone(values);
   await assert.rejects(w.replaceProviderItems('audible',items,{audibleHistory:history([purchase(1)])},{...snapshot(items),complete:false}));assert.deepEqual(values,before);
   assert.throws(()=>validateAudibleHistory(history([purchase(1,'cash','2025-02-30')])));
   await assert.rejects(w.mergeProviderItems('audible',[],{audibleHistory:history([{...purchase(1),asin:'bad'}])}));assert.deepEqual(values,before);
   fail();await assert.rejects(w.mergeProviderItems('audible',[],{audibleHistory:history([purchase(1)])}));assert.deepEqual(values,before);
 }]
];
