import assert from 'node:assert/strict';
import {audibleOwnershipTests} from './audible-ownership.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {preferredDisplayTitle} from '../src/lib/display-title.js';
import {parseBackup,createBackup} from '../src/lib/storage.js';
import '../src/providers/audible.js';

const api=globalThis.GalacticAudible;
const memory=()=>{const values={};let fail=false;return {values,setFail:value=>{fail=value;},writer:createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async patch=>{if(fail)throw Error('Simulated storage failure');Object.assign(values,structuredClone(patch));}})};};
const snapshot=items=>completeProviderSnapshot('audible',items,[completedScope('library',items.length,items.length,'pagination-end',1)]);
const old=(n,title='Recorded work')=>({providerItemId:'B'+String(n).padStart(9,'0'),title,mediaType:'audiobook',ownership:'subscription'});
const fresh=(n,title='Recorded work',action='Remove from favorites')=>api.audibleItemFromLibraryEntry({url:'https://www.audible.com/pd/'+old(n).providerItemId,title,authors:['Writer'],narrators:['Narrator '+n],series:['Series'],libraryAction:action,ownership:api.ownershipFromLibraryAction(action)});
const group=(db,id)=>Object.values(db.canonicalItems).find(g=>g.providerItemIds.includes(id));
async function fixture(){
 const m=memory(),w=m.writer;
 await w.mergeProviderItems('kindle',[{providerItemId:'K1',title:'Curated comic',mediaType:'book',ownership:'owned'},{providerItemId:'K2',title:'Alternate comic title',mediaType:'book',ownership:'owned'}]);
 await w.saveManualMatchDecision({itemIds:['kindle:K1','kindle:K2']},'same-work');
 await w.saveContentReview('kindle:K1',{statement:'Collects Test Series (2000) #1-2',entries:[{series:'Test Series',run:'2000',unitType:'issue',number:'1',completeness:'full'},{series:'Test Series',run:'2000',unitType:'issue',number:'2',completeness:'full'}]});
 await w.mergeProviderItems('gog',[{providerItemId:'other',title:'Other provider game',mediaType:'game',ownership:'owned'}]);
 await w.mergeProviderItems('audible',[old(1),old(2),old(3,'Obsolete wishlist product')],{profileLabel:'Primary'});
 let db=await w.getDatabase();const profile=db.providers.audible.activeProfileId,records=Object.values(db.providerItems).filter(x=>x.profileId===profile),a=records.find(x=>x.providerItemId===old(1).providerItemId),missing=records.find(x=>x.providerItemId===old(3).providerItemId);
 await w.mergeProviderItems('humble',[{providerItemId:'audio',title:'Chosen display title',mediaType:'audiobook',ownership:'owned',metadata:{asin:a.providerItemId,authors:['Writer']}}]);
 db=await w.getDatabase();const other=db.providerItems['humble:audio'];
 await w.saveManualMatchDecision({itemIds:[a.id,other.id]},'same-edition',{recordRef:other.recordRef,title:other.title});
 await w.saveOwnershipCorrections([{recordRef:a.recordRef,profileId:a.profileId,provider:'audible',expectedReviewRef:null}],{ownership:'owned',note:'User correction'});
 await w.saveOwnershipCorrections([{recordRef:missing.recordRef,profileId:missing.profileId,provider:'audible',expectedReviewRef:null}],{ownership:'returned',note:'Keep this history'});
 db=await w.getDatabase();
 db.providerItems[a.id].metadata.enrichment={localMetadata:{source:'publisher',title:'Approved metadata title',authors:['Writer'],approved:true,categories:['Curated category']}};
 await w.restoreDatabase(db);
 await w.mergeProviderItems('audible',[old(100,'Second account record')],{profileLabel:'Secondary'});
 return {...m,profile,a,missing,before:await w.getDatabase(),items:[fresh(1,'Updated source title'),fresh(2)]};
}

export const audibleRescanTests=[
 ...audibleOwnershipTests,
 ['Audible access evidence excludes favorites, wishlist, collections and ambiguous Remove controls',()=>{
   for(const action of ['Remove','Remove from favorites','Remove from favourites','Remove from wishlist','Remove from collection','Listen now','Audible Plus available'])assert.equal(api.ownershipFromLibraryAction(action),'unknown',action);
   for(const action of ['Remove from Plus Catalog','Included in your Audible Plus membership'])assert.equal(api.ownershipFromLibraryAction(action),'subscription',action);
 }],
 ['Audible complete rescan preserves curated relationships, metadata, account scope and historical source records',async()=>{
   const {writer,profile,a,missing,before,items}=await fixture();
   const after=await writer.replaceProviderItems('audible',items,{profileId:profile,syncMode:'full'},snapshot(items));
   assert.equal(Object.values(after.providerItems).filter(x=>x.profileId===profile).length,2);
   assert.equal(after.providerItems[missing.id],undefined);assert.deepEqual(after.providerHistory[missing.recordRef].item,before.providerItems[missing.id]);
   for(const item of Object.values(before.providerItems).filter(x=>x.profileId!==profile))assert.deepEqual(after.providerItems[item.id],item);
   for(const key of ['contentReviews','enrichmentHistory','manualMatchDecisions','editionSeparations','ownershipReviews','titleAliases','readingStates','readingOrders','enrichmentReviews'])assert.deepEqual(after[key],before[key],key);
   for(const item of Object.values(before.providerItems).filter(x=>x.profileId===profile&&x.id!==missing.id)){assert.equal(after.providerItems[item.id].recordRef,item.recordRef);assert.equal(group(after,item.id).id,group(before,item.id).id);}
   assert.equal(preferredDisplayTitle([group(after,a.id)]),'Chosen display title');assert.deepEqual(group(after,a.id).providerItemIds,group(before,a.id).providerItemIds);
   assert.deepEqual(after.providerItems[a.id].metadata.enrichment,before.providerItems[a.id].metadata.enrichment);
   assert.equal(after.providerItems[a.id].title,'Updated source title');assert.deepEqual(after.providerItems[a.id].metadata.authors,['Writer']);assert.deepEqual(after.providerItems[a.id].metadata.narrators,['Narrator 1']);assert.deepEqual(after.providerItems[a.id].metadata.series,['Series']);
   assert.equal(after.providerItems[a.id].ownership,'unknown');assert.equal(effectiveOwnershipRecord(after.providerItems[a.id],after).ownership,'owned');
   assert.deepEqual(after.providers.audible.syncHealth.differences,{added:0,missing:1,ownershipChanged:2,observed:2,updated:2,unchanged:0,gamesAdded:0,gamesUpdated:0,addOnsAdded:0,addOnsUpdated:0});
   const restored=parseBackup(createBackup(after));assert.deepEqual(restored.contentReviews,before.contentReviews);assert.deepEqual(restored.ownershipReviews,before.ownershipReviews);assert.equal(group(restored,a.id).id,group(after,a.id).id);
   const repeated=await writer.replaceProviderItems('audible',items,{profileId:profile,syncMode:'full'},snapshot(items));assert.equal(repeated.providers.audible.syncHealth.differences.updated,0);assert.equal(repeated.providers.audible.syncHealth.differences.added,0);
 }],
 ['Audible ASIN evidence prevents author enrichment from merging distinct recordings',async()=>{
   const {writer}=memory();await writer.mergeProviderItems('audible',[old(1),old(2)]);const before=await writer.getDatabase(),items=[fresh(1),fresh(2)];
   const after=await writer.replaceProviderItems('audible',items,{},snapshot(items));assert.equal(Object.keys(after.canonicalItems).length,2);
   for(const record of Object.values(before.providerItems))assert.equal(group(after,record.id).id,group(before,record.id).id);
 }],
 ['Audible invalid snapshots and failed storage commits cannot partially retire records or alter unrelated data',async()=>{
   const {writer,values,setFail}=memory();await writer.mergeProviderItems('audible',[old(1),old(3)]);await writer.mergeProviderItems('gog',[{providerItemId:'keep',title:'Keep',mediaType:'game'}]);
   const before=structuredClone(values),items=[fresh(1)];
   await assert.rejects(writer.replaceProviderItems('audible',items,{}, {...snapshot(items),complete:false}));assert.deepEqual(values,before);
   setFail(true);await assert.rejects(writer.replaceProviderItems('audible',items,{},snapshot(items)));setFail(false);assert.deepEqual(values,before);
 }]
];
