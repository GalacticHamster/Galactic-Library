import assert from 'node:assert/strict';
import {steamOutcomeFixture as fixture} from './steam-outcomes.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateSteamApplications,validateSteamApplicationImport} from '../src/lib/provider-state.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {withWorker} from './storage.js';
const reply=rows=>({body:{response:{store_items:rows}}});
const missing=id=>({item_type:0,id,appid:0,name:'',success:15,visible:false});
const game=(id,name='Synthetic game')=>({appid:id,type:0,name});
const copy=value=>JSON.parse(JSON.stringify(value));
const acquire=(ids,rows,known=null,body={rgOwnedApps:ids,rgMasterSubApps:[],rgAutoGrantApps:[]})=>fixture(ids,[reply(rows)],{owned:{ok:true,status:200,body}}).S.fetchOwnedSteamGames(()=>{},known,{diagnostics:true});
function memory(){const stored={};const area={get:async defaults=>structuredClone({...defaults,...stored}),set:async patch=>Object.assign(stored,structuredClone(patch)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete stored[key];}};return {stored,area,writer:createStorageWriter(area)};}
const details=(result,full)=>({profileLabel:'Personal',source:'steam-store-browse-items',syncMode:full?'full':'incremental',[full?'fullSyncAt':'quickSyncAt']:'2026-10-24',syncState:{applications:copy(result.applications)}});
const save=(writer,result,full=true)=>full?writer.replaceProviderItems('steam',copy(result.items),details(result,true),copy(result.snapshot)):writer.mergeProviderItems('steam',copy(result.items),details(result,false));
export const steamOwnedApplicationTests=[
 ['Steam owned applications: actual worker binds ID-only evidence to its confirmed account and retries pending saved IDs',async()=>{
  await withWorker(async({dispatch,pageA})=>{
   const sender={id:chrome.runtime.id,url:'https://store.steampowered.com/account/',tab:{id:91}};
   const start=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'steam',beginScan:true,profileLabel:'Personal',confirmed:true,mode:'full'},sender);assert(start.ok,start.error);
   const result=await acquire([1,2],[game(1),missing(2)]);
   const done=await dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'steam',mode:'full',scanToken:start.scanToken,items:copy(result.items),snapshot:copy(result.snapshot),syncState:{applications:copy(result.applications)}},sender);assert(done.ok,done.error);
   const db=await pageA.getDatabase();assert.equal(db.providers.steam.syncState.applications.appIds.length,2);assert.equal(Object.keys(db.providerItems).length,1);
   const next=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'steam',beginScan:true,profileLabel:'Personal',confirmed:true,mode:'incremental'},sender);assert(next.ok,next.error);assert.deepEqual(next.syncState.knownProviderItemIds,['1']);
   const wrong=await dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'steam',mode:'incremental',scanToken:next.scanToken,items:[],syncState:{applications:{...copy(result.applications),issues:[]}}},sender);
   assert.equal(wrong.ok,false);assert.equal(Object.keys((await pageA.getDatabase()).providerItems).length,1);
  });
 }],
 ['Steam owned applications: full 143 unavailable plus 16 other types preserves all stable IDs without invented catalog games',async()=>{
  const ids=Array.from({length:159},(_,i)=>i+1),rows=ids.map(id=>id<=143?missing(id):{appid:id,type:6,name:'Synthetic non-game '+id});
  const f=fixture(ids,[reply(rows.slice(0,100)),reply(rows.slice(100))]),result=await f.S.fetchOwnedSteamGames(()=>{},null,{diagnostics:true});
  assert.equal(result.unresolvedApps.length,143);assert.equal(result.unsupportedAppCount,16);assert.equal(result.items.length,0);
  assert.equal(result.applications.appIds.length,159);assert.equal(result.applications.issues.length,159);assert(result.snapshot.complete);
  const h=memory(),db=await save(h.writer,result);assert.equal(Object.keys(db.providerItems).length,0);assert.equal(Object.keys(db.canonicalItems).length,0);
  assert.equal(db.providers.steam.syncState.applications.appIds.length,159);assert.equal(db.providers.steam.syncHealth.status,'succeeded');
  assert.equal(Object.keys(db.providerHistory).length,0);assert.deepEqual(parseBackup(createBackup(db)),db);
 }],
 ['Steam owned applications: readable game and DLC coexist with unclassified IDs and unsupported types',async()=>{
  const result=await acquire([1,2,3,4],[game(1),{appid:2,type:4,name:'Synthetic expansion',related_items:{parent_appid:1}},missing(3),{appid:4,type:11,name:'Actual supplied metadata title'}]);
  const h=memory(),db=await save(h.writer,result),items=Object.values(db.providerItems);
  assert.equal(items.length,2);assert.deepEqual(items.map(i=>i.mediaType).sort(),['game','game-addon']);assert(items.every(i=>i.acquiredAt===null));
  assert.equal(db.providers.steam.syncState.applications.issues.length,2);assert.equal(db.providers.steam.syncState.applications.issues.find(i=>i.appId==='4').reportedType,11);
 }],
 ['Steam owned applications: placeholder metadata never removes existing sources, corrections or catalog associations',async()=>{
  const h=memory(),first=await save(h.writer,await acquire([1,2],[game(1),game(2,'Second game')]));
  const old=Object.values(first.providerItems).find(i=>i.providerItemId==='1');
  await h.writer.saveOwnershipCorrections([{recordRef:old.recordRef,provider:'steam',profileId:old.profileId,expectedReviewRef:null}],{ownership:'returned'});
  const before=await h.writer.getDatabase(),next=await save(h.writer,await acquire([1,2],[missing(1),game(2,'Second game')]));
  assert.deepEqual(next.providerItems[old.id],before.providerItems[old.id]);assert.deepEqual(next.ownershipReviews,before.ownershipReviews);
  assert.deepEqual(next.canonicalItems,before.canonicalItems);assert.equal(Object.keys(next.providerHistory).length,0);
  assert.equal(effectiveOwnershipRecord(next.providerItems[old.id],next).ownership,'returned');
 }],
 ['Steam owned applications: repeated Full and Quick checks and later metadata enrichment are source-idempotent',async()=>{
  const h=memory(),rows=[game(1),missing(2)],initial=await acquire([1,2],rows);initial.items[0].acquiredAt='2020-06-15';let db=await save(h.writer,initial);
  const first=Object.values(db.providerItems)[0],canonical=Object.keys(db.canonicalItems)[0];
  db=await save(h.writer,await acquire([1,2],rows));db=await save(h.writer,await acquire([1,2],[missing(2)],['1']),false);
  assert.equal(Object.keys(db.providerItems).length,1);assert.equal(db.providerItems[first.id].recordRef,first.recordRef);assert.equal(db.providerItems[first.id].acquiredAt,first.acquiredAt);assert.equal(Object.keys(db.providerHistory).length,0);
  db=await save(h.writer,await acquire([1,2],[game(2,'Recovered metadata')],['1']),false);
  const recovered=Object.values(db.providerItems).find(i=>i.providerItemId==='2');assert(recovered);assert.equal(recovered.acquiredAt,null);
  assert.equal(db.providers.steam.syncState.applications.issues.length,0);assert.equal(db.providerItems[first.id].recordRef,first.recordRef);assert(db.canonicalItems[canonical]);
  db=await save(h.writer,await acquire([1,2],[game(1),game(2,'Recovered metadata')]));assert.equal(Object.keys(db.providerItems).length,2);assert.equal(db.providerItems[recovered.id].recordRef,recovered.recordRef);assert.equal(Object.keys(db.providerHistory).length,0);
 }],
 ['Steam owned applications: one bounded retry recovers transient metadata and never retries unavailable placeholders',async()=>{
  for(const error of [{ok:false,status:429},{ok:false,status:503},{networkError:true}]){
   const f=fixture([1],[error,reply([game(1)])]),result=await f.S.fetchOwnedSteamGames(()=>{},null,{diagnostics:true});
   assert.equal(f.calls(),2);assert.equal(result.items.length,1);assert.equal(result.failedRequestCount,1);assert.equal(result.unresolvedApps.length,0);
  }
  const f=fixture([1],[reply([missing(1)])]);await f.S.fetchOwnedSteamGames();assert.equal(f.calls(),1);
  const unavailable=fixture([1],[{ok:false,status:503},{ok:false,status:503}]),result=await unavailable.S.fetchOwnedSteamGames();assert.equal(unavailable.calls(),2);assert.equal(result.items.length,0);assert.equal(result.applications.issues[0].kind,'http');
 }],
 ['Steam owned applications: incomplete, unauthenticated or malformed ownership evidence cannot become a full import',async()=>{
  for(const body of [{rgOwnedApps:[1],complete:false},{rgOwnedApps:[1],has_more:true},{rgOwnedApps:[1],bLoggedIn:false},{rgOwnedApps:[1,0]},{rgOwnedApps:[1],rgMasterSubApps:[null]}]){
   const f=fixture([1],[],{owned:{ok:true,status:200,body}});await assert.rejects(f.S.fetchOwnedSteamGames(),/owned-App-ID list/);assert.equal(f.calls(),0);
  }
  const result=await acquire([1,2],[game(1),missing(2)]),h=memory(),before=copy(h.stored);
  const bad={...result,applications:{...result.applications,issues:[]}};await assert.rejects(save(h.writer,bad),/unexplained/);assert.deepEqual(h.stored,before);
  for(const ids of [['0'],['01'],['4294967296'],['1','1']])assert.throws(()=>validateSteamApplications({...result.applications,appIds:ids,issues:[]}));
  assert.throws(()=>validateSteamApplicationImport([{...result.items[0],providerItemId:'999'}],result.applications),/does not match/);
 }],
 ['Steam owned applications: subscription and automatically granted flags do not establish permanent ownership',async()=>{
  const body={rgOwnedApps:[1,2,3],rgMasterSubApps:[2],rgAutoGrantApps:[3]},result=await acquire([1,2,3],[game(1),game(2),game(3)],null,body);
  assert.deepEqual(Array.from(result.items,i=>i.ownership),['owned','subscription','unknown']);
  const h=memory();let db=await save(h.writer,result);const temp=Object.values(db.providerItems).find(i=>i.providerItemId==='2');
  await h.writer.saveOwnershipCorrections([{recordRef:temp.recordRef,provider:'steam',profileId:temp.profileId,expectedReviewRef:null}],{ownership:'owned'});
  db=await h.writer.getDatabase();assert.equal(effectiveOwnershipRecord(db.providerItems[temp.id],db).ownership,'owned');
  assert.equal(db.providerItems[temp.id].ownership,'subscription');assert.deepEqual(parseBackup(createBackup(db)),db);
 }],
 ['Steam owned applications: per-account identity evidence stays isolated through repeated scans and backup restore',async()=>{
  const h=memory(),result=await acquire([1,2],[game(1),missing(2)]);
  let db=await save(h.writer,result),first=Object.values(db.providerItems)[0],firstProfile=copy(db.providerProfiles[first.profileId]);
  const other=await acquire([1,3],[game(1,'Different account copy'),missing(3)]);
  db=await h.writer.replaceProviderItems('steam',copy(other.items),{...details(other,true),profileLabel:'Other account'},copy(other.snapshot));
  const second=Object.values(db.providerItems).find(i=>i.profileId!==first.profileId);
  assert(second);assert.notEqual(second.recordRef,first.recordRef);assert.deepEqual(db.providerProfiles[first.profileId],firstProfile);
  assert.deepEqual(db.providerItems[first.id],first);assert.deepEqual(db.providerProfiles[second.profileId].state.syncState.applications.appIds,['1','3']);
  db=await h.writer.replaceProviderItems('steam',copy(result.items),details(result,true),copy(result.snapshot));
  assert.equal(Object.keys(db.providerItems).length,2);assert.deepEqual(db.providerItems[second.id],second);assert.equal(Object.keys(db.providerHistory).length,0);
  await h.writer.restoreDatabase(parseBackup(createBackup(db)));const restored=await h.writer.getDatabase();
  assert.deepEqual(restored.providerProfiles,db.providerProfiles);assert.deepEqual(restored.providerItems,db.providerItems);
 }],
 ['Steam owned applications: access-only Quick updates use stable saved titles and preserve independent providers and earlier evidence',async()=>{
  const h=memory();let db=await save(h.writer,await acquire([1,2],[game(1),missing(2)]));
  await h.writer.mergeProviderItems('gog',[{providerItemId:'independent',title:'Independent source',mediaType:'game',ownership:'owned'}]);
  const before=await h.writer.getDatabase(),first=Object.values(before.providerItems).find(i=>i.provider==='steam');
  const quick=await acquire([1],[game(1)],['1'],{rgOwnedApps:[1],rgMasterSubApps:[1],rgAutoGrantApps:[]});
  // Existing ID needs no title lookup: the access observation alone can update it.
  quick.items=[];db=await save(h.writer,quick,false);
  assert.equal(db.providerItems[first.id].ownership,'subscription');assert.equal(db.providerItems[first.id].recordRef,first.recordRef);
  assert.deepEqual(db.providers.steam.syncState.applications.previouslyObservedAppIds,['2']);
  const gog=Object.values(before.providerItems).find(i=>i.provider==='gog');assert.deepEqual(db.providerItems[gog.id],gog);assert.equal(Object.keys(db.providerHistory).length,0);
 }]
];
