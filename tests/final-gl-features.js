import assert from 'node:assert/strict';
import {normalizeGameTitle} from '../src/lib/normalization.js';
import {identityKey} from '../src/lib/identity.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {matchItems} from '../src/lib/matcher.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import '../src/providers/humble.js';
import '../src/providers/fanatical.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {parsePurchaseEvidence} from '../src/lib/ownership-review.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {contentCoverage} from '../src/lib/contents.js';

export function memory(){const stored={},writes=[];return {stored,writes,writer:createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async updates=>{writes.push(structuredClone(updates));Object.assign(stored,structuredClone(updates));},remove:async keys=>{for(const key of keys)delete stored[key];}})};}

export const finalGlTests=[['local CSV/JSON purchase evidence projects only safe bibliographic fields and requires dates',()=>{
  const csv='Title,ASIN,Purchase Date,Customer,Card,Redemption Key\n"Comic, Vol. 1",B000000001,2026-09-01,PRIVATE CUSTOMER,PRIVATE CARD,PRIVATE KEY';const entries=parsePurchaseEvidence(csv,{provider:'comixology'});assert.equal(entries[0].title,'Comic, Vol. 1');assert.equal(entries[0].provider,'kindle');assert(!JSON.stringify(entries).includes('PRIVATE'));
  assert.equal(parsePurchaseEvidence(JSON.stringify([{title:'Audio',asin:'B000000001',acquiredAt:'2026-09-01',customer:'PRIVATE'}]),{provider:'audible'})[0].mediaType,'audiobook');assert.throws(()=>parsePurchaseEvidence('[{"title":"Missing date"}]'),/purchase date/);assert.throws(()=>parsePurchaseEvidence('Title,Date\n"Unclosed,2026-09-01'),/Unclosed/);
}],['dated ownership review changes matching and reviewed coverage without rewriting provider observations, supports undo and resists stale edits',async()=>{
  const {writer}=memory();await writer.mergeProviderItems('kindle',[{providerItemId:'B000000001',title:'Comic Vol. 1',mediaType:'book',ownership:'unknown'}]);let db=await writer.getDatabase(),record=db.providerItems['kindle:B000000001'];const observed=record.observedAt;
  await writer.saveContentReview(record.id,{entries:[{series:'Comic',run:'2024',unitType:'volume',number:'1',language:'en',completeness:'full'}],statement:'Collects Comic Vol. 1'});
  db=await writer.saveOwnershipReview(record.recordRef,{ownership:'owned',note:'Checked receipt, private account details omitted',evidenceDate:'2026-09-01',sourceUrl:'https://www.amazon.com/orders?secret=PRIVATE'});const review=db.ownershipReviews[record.recordRef];assert.equal(db.providerItems[record.id].ownership,'unknown');assert.equal(db.providerItems[record.id].observedAt,observed);
  const response=handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:record.title,mediaType:'book',identifiers:{asin:'B000000001'}}]});assert(response.results[0].owned);assert.equal(response.results[0].matches[0].evidence.ownershipBasis,'dated-manual-confirmation');assert(!JSON.stringify(response).includes('Checked receipt'));
  assert.equal(contentCoverage(db,db.contentReviews[record.id].entries).owned,1);assert.equal(parseBackup(createBackup(db)).ownershipReviews[record.recordRef].note,review.note);
  await assert.rejects(writer.saveOwnershipReview(record.recordRef,{ownership:'unknown',note:'Stale edit',evidenceDate:'2026-09-01'}),/changed/);
  db=await writer.removeOwnershipReview(record.recordRef,review.reviewRef);assert.equal(contentCoverage(db,db.contentReviews[record.id].entries).owned,0);assert(!handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:record.title,mediaType:'book',identifiers:{asin:'B000000001'}}]}).results[0].owned);
}],['receipt candidates never auto-approve, require edition/account confirmation and keep unmatched receipts for review',async()=>{
  const {writer}=memory();await writer.mergeProviderItems('audible',[{providerItemId:'B000000001',title:'Audio book',mediaType:'audiobook',ownership:'subscription'}]);const evidence=parsePurchaseEvidence('[{"title":"Audio book","asin":"B000000001","acquiredAt":"2026-09-01"},{"title":"Unmatched book","asin":"B000000002","acquiredAt":"2026-09-01"}]',{provider:'audible'});
  let db=await writer.importPurchaseEvidence(evidence);assert.equal(Object.keys(db.ownershipReviews).length,0);const [id,proposal]=Object.entries(db.ownershipProposals).find(([,entry])=>entry.evidence.asin==='B000000001');assert.equal(proposal.recordRefs.length,1);
  await assert.rejects(writer.applyPurchaseEvidence(id,proposal.recordRefs[0],false),/Confirm/);db=await writer.applyPurchaseEvidence(id,proposal.recordRefs[0],true);assert.equal(db.ownershipReviews[proposal.recordRefs[0]].source,'local-purchase-history');assert.equal(Object.keys(db.ownershipProposals).length,1);assert.equal(db.providerItems['audible:B000000001'].ownership,'subscription');
  const restored=parseBackup(createBackup(db));assert.equal(Object.values(restored.ownershipProposals)[0].recordRefs.length,0);
}],['ownership reviews remain scoped to account records and temporary/expired key access never supplies permanent coverage',async()=>{
  const {writer}=memory();const items=[{providerItemId:'B000000001',title:'Comic',mediaType:'book',ownership:'unknown'}],snapshot=completeProviderSnapshot('kindle',items,[{...completedScope('books',1,1,'reported-count'),duplicateCount:0},{...completedScope('personal-documents',0,0,'reported-count'),duplicateCount:0}]);
  await writer.replaceProviderItems('kindle',items,{profileLabel:'personal'},snapshot);let db=await writer.getDatabase(),record=db.providerItems['kindle:B000000001'];db=await writer.saveOwnershipReview(record.recordRef,{ownership:'rental',note:'Rental receipt',evidenceDate:'2026-09-01',expiresAt:'2026-09-02'});assert.equal(effectiveOwnershipRecord(record,db).ownership,'unknown');
  await writer.importPurchaseEvidence([{provider:'kindle',title:record.title,asin:'B000000001',acquiredAt:'2026-09-01'}]);const proposalId=Object.keys((await writer.getDatabase()).ownershipProposals)[0];db=await writer.replaceProviderItems('kindle',items,{profileLabel:'work'},snapshot);await assert.rejects(writer.applyPurchaseEvidence(proposalId,record.recordRef,true),/active library|profile/);assert.equal(effectiveOwnershipRecord(db.providerItems[record.id],db).ownership,'unknown');
  await writer.mergeProviderItems('humble',[{providerItemId:'key',title:'Game',mediaType:'game',ownership:'owned',metadata:{entitlement:'third-party-key',keyStatus:'expired'}}]);db=await writer.getDatabase();const key=db.providerItems['humble:key'];db=await writer.saveOwnershipReview(key.recordRef,{ownership:'owned',note:'A purchase is not activation',evidenceDate:'2026-09-01'});assert.equal(effectiveOwnershipRecord(key,db).ownership,'unknown');
}],['purchase provenance merges quick and full scans, deduplicates repeats, survives backups and isolates profiles without API disclosure',async()=>{
  const {writer}=memory();const origin=n=>({occurrenceRef:String(n).repeat(64),orderRef:String(n).repeat(64),bundleId:`bundle-${n}`,bundleTitle:`Bundle ${n}`,purchasedAt:`2026-09-${n===1?'10':'20'}T00:00:00Z`,redemptionKey:'NEVER_STORE'});
  const product=origins=>({providerItemId:'shared-product',title:'Repeated book',mediaType:'book',ownership:'owned',metadata:{authors:['Writer'],purchaseOrigins:origins}});
  const full=async(origins,profile)=>{const items=[product(origins)];return writer.replaceProviderItems('fanatical',items,{profileLabel:profile,syncMode:'full'},completeProviderSnapshot('fanatical',items,[completedScope('orders',1,1,'index-complete',1)]));};
  await full([origin(1)],'personal');let db=await writer.mergeProviderItems('fanatical',[product([origin(2)])]);const record=db.providerItems['fanatical:shared-product'];assert.equal(record.metadata.purchaseOrigins.length,2);assert.equal(record.acquiredAt,'2026-09-10T00:00:00.000Z');
  db=await full([origin(2)],'personal');assert.equal(db.providerItems[record.id].metadata.purchaseOrigins.length,2);assert.equal(parseBackup(createBackup(db)).providerItems[record.id].metadata.purchaseOrigins.length,2);assert(!JSON.stringify(db).includes('NEVER_STORE'));
  const response=handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:record.title,mediaType:'book',authors:['Writer']}]});assert(response.results[0].owned);assert(!JSON.stringify(response).includes('purchaseOrigins')&&!JSON.stringify(response).includes(origin(1).orderRef));
  db=await full([origin(2)],'work');assert.equal(db.providerItems[record.id].metadata.purchaseOrigins.length,1);assert.notEqual(db.providerItems[record.id].recordRef,record.recordRef);assert.equal(db.providerHistory[record.recordRef].item.metadata.purchaseOrigins.length,2);
}],['software classification, central capability and matching remain separate from games and booklet formats',async()=>{
  const items=globalThis.GalacticHumble.humbleItemsFromOrder({subproducts:[{machine_name:'tool',human_name:'Tool',product_type:'software',downloads:[{url:'https://example.test/booklet.pdf'}]},{machine_name:'game',human_name:'Game',product_type:'game'}],tpkd_dict:{all_tpks:[{machine_name:'license',human_name:'License',product_type:'software'}]}},{},'purchase');
  assert.equal(items.find(item=>item.title==='Tool').mediaType,'software');assert.equal(items.find(item=>item.title==='Game').mediaType,'game');assert.equal(items.find(item=>item.title==='License').mediaType,'software');
  assert.equal(globalThis.GalacticFanatical.fanaticalItemsFromProjection({items:[{sourceItemId:'software-product',title:'Tool',mediaType:'software'}]})[0].mediaType,'software');
  const {writer}=memory();await writer.mergeProviderItems('humble',items);let db=await writer.getDatabase();assert.equal(db.providers.humble.softwareCount,2);
  assert(handleExternalApiRequest(db,{type:'GET_STATUS'}).capabilities.mediaTypes.includes('software'));
  const result=handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Tool',mediaType:'software'},{title:'Tool',mediaType:'game'}]});assert(result.ok&&result.results[0].owned&&!result.results[1].owned);
  assert.equal(parseBackup(createBackup(db)).providers.humble.softwareCount,2);
}],['changing legacy game classification to software clears incompatible edition reviews without losing the record reference',async()=>{
  const {writer}=memory();await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Tool',mediaType:'game',ownership:'owned'},{providerItemId:'b',title:'Alias',mediaType:'game'}]);let db=await writer.getDatabase();const ref=db.providerItems['humble:a'].recordRef;
  await writer.saveManualMatchDecision({itemIds:['humble:a','humble:b']},'same-edition');db=await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Tool',mediaType:'software',ownership:'owned'}]);assert.equal(db.providerItems['humble:a'].recordRef,ref);assert.equal(Object.keys(db.manualMatchDecisions).length,0);
}],['Unicode title keys preserve Japanese voicing, Korean composition and Indic marks',()=>{
  assert.notEqual(normalizeGameTitle('ガンダム').normalizedTitle,normalizeGameTitle('カンダム').normalizedTitle);
  assert.equal(normalizeGameTitle('ガンダム').normalizedTitle,normalizeGameTitle('カ\u3099ンダム').normalizedTitle);
  assert.equal(normalizeGameTitle('한글').normalizedTitle,'한글');assert.equal(normalizeGameTitle('किताब').normalizedTitle,'किताब');assert.equal(identityKey('किताब'),'किताब');
}],['reviewed aliases survive backups, warn as Possible, retain edition guards and stay scoped to record references',async()=>{
  const {writer}=memory();await writer.mergeProviderItems('humble',[{providerItemId:'manga',title:'ガンダム Vol. 1',mediaType:'book',ownership:'owned',metadata:{authors:['Writer'],isbn:'9780140328721'}}]);
  let db=await writer.getDatabase();const record=db.providerItems['humble:manga'];db=await writer.saveTitleAliases(record.recordRef,['Gundam Vol. 1'],'Publisher translation');db=parseBackup(createBackup(db));
  const possible=matchItems(db.providerItems,[{title:'Gundam Vol. 1',mediaType:'book'}],db)[0];assert(!possible.owned&&possible.possibleMatches.some(item=>item.title===record.title));
  const owned=matchItems(db.providerItems,[{title:'Gundam Vol. 1',mediaType:'book',identifiers:{isbn:'9780140328721'}}],db)[0];assert(owned.owned);
  db=await writer.saveTitleAliases(record.recordRef,['Gundam Vol. 2']);assert.equal(matchItems(db.providerItems,[{title:'Gundam Vol. 2',mediaType:'book'}],db)[0].possibleMatches.length,0);
  await writer.clearDatabase();await writer.mergeProviderItems('humble',[{providerItemId:'manga',title:record.title,mediaType:'book'}]);await assert.rejects(writer.saveTitleAliases(record.recordRef,['Gundam']),/active library/);
}]];
