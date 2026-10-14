import assert from 'node:assert/strict';
import '../src/providers/kindle.js';
import {normalizeProviderItem} from '../src/lib/models.js';
import {effectiveOwnershipRecord,coverageAccessExclusion} from '../src/lib/ownership.js';
import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup,parseBackupPreferences} from '../src/lib/storage.js';
import {snapshotFixture} from './storage.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {validateUiPreferences,defaultUiPreferences} from '../src/lib/ui-preferences.js';

export const kindleReturnTests=[
 ['the three reported Miles Morales collections keep source evidence and identities after a return correction',()=>{
   for(const [title,statement,count]of [
     ['Miles Morales: Spider-Man (Ultimate Comics Spider-Man (2011-2013))','Collects Ultimate Comics Spider-Man (2011) #1-10.',10],
     ['Miles Morales: With Great Power (Ultimate Comics Spider-Man (2011-2013))','Collects Ultimate Comics Spider-Man #11-22 and #16.1.',13],
     ['Miles Morales: Great Responsibility (Ultimate Comics Spider-Man (2011-2013))','Collects Ultimate Comics Spider-Man (2011) #23-28, Cataclysm: Ultimate Spider-Man (2013) #1-3; Ultimate Spider-Man (2011) #200.',10]
   ]){
     const book=coverageBook('miles',statement,{title}),db=coverageDatabase(book);Object.assign(book.metadata,{source:'amazon-kindle-content-library',originType:'Purchase',itemStatus:'',libraryCategory:'books'});const original=JSON.stringify(book);
     assert.equal(comicCoverageForLibrary(db).groups.reduce((n,g)=>n+g.covered,0),count);
     db.ownershipReviews[book.recordRef]={ownership:'returned',note:'Checked Return complete for this exact product'};
     const result=comicCoverageForLibrary(db);assert.equal(result.groups.length,0);assert.equal(result.excluded[0].entries.length,count);assert.equal(result.excluded[0].reason,'returned');assert.equal(JSON.stringify(book),original);
   }
 }],
 ['completed Kindle returns and access loss override purchase and Comixology inference without interpreting absence or pending text',()=>{
   for(const originType of ['Purchase','Comixology','KindleUnlimited','PublicLibraryLending'])for(const [itemStatus,state]of [['Return complete','returned'],['Returned','returned'],['Refunded','returned'],['Refund completed','returned'],['Access revoked','revoked'],['Expired','expired'],['Loan expired','expired']]){
     const imported=globalThis.GalacticKindle.kindleItemFromOwnershipItem({asin:'B012345678',title:'Provider example',originType,itemStatus});assert.equal(imported.ownership,state);
     const item=normalizeProviderItem({...imported,provider:'kindle',ownership:'owned'}),before=JSON.stringify(item);
     assert.equal(item.ownership,state);assert.equal(effectiveOwnershipRecord(item,{ownershipPolicy:{allOwned:true}}).ownership,state);
     assert.equal(coverageAccessExclusion(item).reason,state);assert.equal(JSON.stringify(item),before);
     const legacy={...item,ownership:'owned'};assert.equal(effectiveOwnershipRecord(legacy).ownership,state);
   }
   for(const itemStatus of ['','Active','Return requested','Refund pending','Return for refund','Not returned'])assert.equal(globalThis.GalacticKindle.kindleItemFromOwnershipItem({asin:'B012345678',title:'Example',originType:'Purchase',itemStatus}).ownership,'owned');
   for(const itemStatus of ['Inactive','Removed','Deleted'])assert.equal(globalThis.GalacticKindle.kindleItemFromOwnershipItem({asin:'B012345678',title:'Example',originType:'Purchase',itemStatus}).ownership,'unknown');
   const explicit=normalizeProviderItem({provider:'kindle',providerItemId:'explicit',title:'Existing purchase',mediaType:'book',ownership:'owned',metadata:{originType:'Comixology'}});assert.equal(effectiveOwnershipRecord(explicit).ownership,'owned','The fix introduced a new context requirement for an explicit purchase');
 }],
 ['return correction removes only that acquisition from coverage and survives reimport, reload and backup without source edits',async()=>{
   const book=coverageBook('returned','Collects Alpha (2001) #1-3'),other=coverageBook('retained','Collects Alpha (2001) #2-3'),data={},writer=createStorageWriter({get:async defaults=>({...defaults,...structuredClone(data)}),set:async values=>Object.assign(data,structuredClone(values))});
   await writer.restoreDatabase(coverageDatabase(book,other));let db=await writer.getDatabase();const original=JSON.stringify(db.providerItems),reviews=JSON.stringify(db.contentReviews),before=comicCoverageForLibrary(db).groups[0];assert.equal(before.covered,3);assert.equal(before.duplicates,2);
   await writer.saveOwnershipReview(book.recordRef,{ownership:'returned',note:'Amazon order item shows Return complete; ASIN checked',evidenceDate:'2026-10-13'});
   db=await writer.getDatabase();let after=comicCoverageForLibrary(db);assert.equal(after.groups[0].covered,2);assert.equal(after.groups[0].duplicates,0);assert.equal(after.excluded[0].reason,'returned');
   assert.equal(JSON.stringify(db.providerItems),original);assert.equal(JSON.stringify(db.contentReviews),reviews);
   assert.equal(handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:book.title,mediaType:'book'}]}).results[0].owned,false);
   // Saved corrections remain tied to record/account, rather than a title.
   const incoming=Object.values(db.providerItems).map(r=>({...r,providerItemId:r.providerItemId}));await writer.replaceProviderItems('kindle',incoming,{},snapshotFixture('kindle',incoming));db=await writer.getDatabase();assert.equal(effectiveOwnershipRecord(db.providerItems[book.id],db).ownership,'returned');
   const backup=createBackup(db,defaultUiPreferences());await writer.restoreDatabase(parseBackup(backup),parseBackupPreferences(backup));db=await writer.getDatabase();after=comicCoverageForLibrary(db);assert.equal(after.groups[0].covered,2);assert.equal(after.groups[0].duplicates,0);
   assert.equal(effectiveOwnershipRecord(db.providerItems[book.id],{...db,ownershipPolicy:{allOwned:true}}).ownership,'returned');
   for(const ownership of ['returned','revoked','expired'])assert.equal(validateUiPreferences({...defaultUiPreferences(),browse:{...defaultUiPreferences().browse,ownership}}).browse.ownership,ownership);
 }],
 ['Comixology migration and temporary access cannot resurrect an explicit return or revocation',()=>{
   const book=coverageBook('migration','Collects Alpha (2001) #1',{ownership:'unknown'});Object.assign(book.metadata,{source:'amazon-kindle-content-library',originType:'Comixology',libraryCategory:'books'});const db=coverageDatabase(book);
   assert.equal(effectiveOwnershipRecord(book,db).ownership,'owned');
   for(const itemStatus of ['Return complete','Revoked','Expired'])assert.notEqual(effectiveOwnershipRecord({...book,metadata:{...book.metadata,itemStatus}},db).ownership,'owned');
   db.ownershipReviews[book.recordRef]={ownership:'owned',note:'Earlier purchase confirmation'};assert.equal(effectiveOwnershipRecord({...book,metadata:{...book.metadata,itemStatus:'Return complete'}},db).ownership,'returned');
   db.ownershipReviews[book.recordRef]={ownership:'returned',note:'Checked return'};assert.equal(effectiveOwnershipRecord(book,db).ownership,'returned');
   db.ownershipReviews[book.recordRef]={ownership:'subscription',expiresAt:'2020-01-01'};assert.equal(effectiveOwnershipRecord(book,db).ownership,'unknown');assert.equal(coverageAccessExclusion(book,db).reason,'expired');
 }]
];
