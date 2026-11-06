import assert from 'node:assert/strict';
import {providerContext} from './provider-snapshots.js';
import {withWorker} from './storage.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {performanceWriter,syntheticProviderLibrary} from './provider-performance-fixture.js';

const plain=v=>JSON.parse(JSON.stringify(v));
const product=id=>({id,title:`Synthetic recovery game ${id}`});
const record=id=>({catalogItemId:String(id),namespace:'store',catalogItem:{id:String(id),title:`Synthetic recovery game ${id}`}});
const page=(provider,ids,next=null)=>provider==='gog'?{products:ids.map(product),totalPages:next?2:1,totalProducts:ids.length}:{data:{Library:{libraryItems:{records:ids.map(record),responseMetadata:{nextCursor:next}}}}};
const json=data=>({ok:true,status:200,json:async()=>data});
const sender=provider=>({id:'abcdefghijklmnopabcdefghijklmnop',url:provider==='gog'?'https://www.gog.com/account':'https://store.epicgames.com/en-US/library',tab:{id:72}});
async function acquire(provider,reply,known=null,recover=false){let requests=0;const c=providerContext(provider,async(...args)=>reply(++requests,...args));const result=await(provider==='gog'?c.GalacticGog.fetchGogGames(()=>{},known,recover):c.GalacticEpic.fetchEpicGames());return {...plain(result),requests};}
async function save(w,provider,result,mode='full'){
 const start=await w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider,beginScan:true,confirmed:true,profileLabel:'Synthetic',mode},sender(provider));assert(start.ok,start.error);
 const r=await w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider,scanToken:start.scanToken,mode,items:result.items,snapshot:result.snapshot,scanDiagnostics:{incomplete:result.incomplete===true}},sender(provider));return {start,result:r};
}
const rows=(db,p)=>Object.values(db.providerItems).filter(i=>i.provider===p);
export const gogEpicRecoveryTests=[];
for(const provider of ['gog','epic']){
 gogEpicRecoveryTests.push([`${provider} recovery: 499 validated records survive later HTTP failure; reload/restore/retry`,()=>withWorker(async w=>{
  const ids=Array.from({length:499},(_,i)=>i+1);
  const first=page(provider,ids,'next');if(provider==='gog')first.totalProducts=500;
  const partial=await acquire(provider,n=>n===1?json(first):{ok:false,status:503});assert.equal(partial.items.length,499);assert.equal(partial.snapshot.complete,false);assert.equal(partial.requests,2);
  let s=await save(w,provider,partial);assert(s.result.ok,s.result.error);let db=await w.pageB.getDatabase();assert.equal(rows(db,provider).length,499);assert.equal(db.providers[provider].fullSyncAt,undefined);
  assert(rows(db,provider).every(i=>i.ownership==='owned'));assert(handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:rows(db,provider)[0].title,mediaType:'game'}]}).results[0].owned);
  await w.pageA.restoreDatabase(parseBackup(createBackup(db)));db=await w.pageB.getDatabase();assert.equal(rows(db,provider).length,499);
  const full=page(provider,[...ids,500]);const recovered=await acquire(provider,()=>json(full),provider==='gog'?ids.map(String):null,true);s=await save(w,provider,recovered,provider==='gog'?'incremental':'full');assert(s.result.ok,s.result.error);db=await w.pageB.getDatabase();assert.equal(rows(db,provider).length,500);
  const unchanged=await acquire(provider,()=>json(full),provider==='gog'?[...ids,500].map(String):null);assert.equal(unchanged.requests,1);if(provider==='gog')assert.equal(unchanged.items.length,0);
  s=await save(w,provider,unchanged,provider==='gog'?'incremental':'full');assert(s.result.ok,s.result.error);assert.equal(rows(await w.pageB.getDatabase(),provider).length,500);
 },{storageEvents:true,concurrentQueries:true})]);
 gogEpicRecoveryTests.push([`${provider} recovery: one malformed item preserves valid peers and retries without duplicate identities`,()=>withWorker(async w=>{
  const body=page(provider,[1,2]);if(provider==='gog')body.products.push({id:3});else body.data.Library.libraryItems.records.push({catalogItemId:'3'});
  const partial=await acquire(provider,()=>json(body));assert.equal(partial.items.length,2);assert.equal(partial.failedItems,1);assert((await save(w,provider,partial)).result.ok);
  const recovered=await acquire(provider,()=>json(page(provider,[1,2,3])),provider==='gog'?['1','2']:null,true);assert((await save(w,provider,recovered,provider==='gog'?'incremental':'full')).result.ok);assert.equal(rows(await w.pageB.getDatabase(),provider).length,3);
 })]);
 gogEpicRecoveryTests.push([`${provider} recovery: authentication and malformed top-level responses remain fatal after a valid page`,async()=>{
  const malformed=provider==='gog'?{products:{},totalPages:2}:{data:{Library:{libraryItems:{records:{},responseMetadata:{nextCursor:null}}}}};
  for(const failure of [{ok:false,status:401},{ok:false,status:403},json(malformed)])await assert.rejects(acquire(provider,n=>n===1?json(page(provider,[1],'next')):failure));
 }]);
 gogEpicRecoveryTests.push([`${provider} recovery: partial omissions, historical records, manual corrections and unrelated providers stay intact`,()=>withWorker(async w=>{
  assert((await save(w,provider,await acquire(provider,()=>json(page(provider,[1,2]))))).result.ok);
  assert((await save(w,provider,await acquire(provider,()=>json(page(provider,[1]))))).result.ok);
  let db=await w.pageA.getDatabase();await w.pageA.saveOwnershipCorrections([ownershipCorrectionTarget(rows(db,provider)[0],db)],{ownership:'returned',note:'Synthetic correction'});
  await w.pageA.mergeProviderItems('steam',[{providerItemId:'42',title:'Unrelated game',mediaType:'game',ownership:'owned'}]);db=await w.pageA.getDatabase();const before=plain(db);
  const partial=await acquire(provider,n=>n===1?json(page(provider,[2,3],'next')):{ok:false,status:503});const saved=await save(w,provider,partial);assert(saved.result.ok,saved.result.error);db=await w.pageB.getDatabase();assert.deepEqual(rows(db,provider).map(i=>i.providerItemId).sort(),['1','3']);assert.deepEqual(db.providerHistory,before.providerHistory);assert.deepEqual(db.ownershipReviews,before.ownershipReviews);assert.deepEqual(db.providerItems['steam:42'],before.providerItems['steam:42']);assert.equal(db.providers[provider].fullSyncAt,before.providers[provider].fullSyncAt);
  assert((await save(w,provider,await acquire(provider,()=>json(page(provider,[3]))))).result.ok);db=await w.pageB.getDatabase();assert.deepEqual(rows(db,provider).map(i=>i.providerItemId),['3']);assert(Object.values(db.providerHistory).some(entry=>entry.item.provider===provider&&entry.item.providerItemId==='1'));
 })]);
 gogEpicRecoveryTests.push([`${provider} recovery: empty/all malformed remains safe; forged partial receipts rejected`,()=>withWorker(async w=>{
  await assert.rejects(acquire(provider,()=>json(page(provider,[]))));
  const r=await acquire(provider,n=>n===1?json(page(provider,[1],'next')):{ok:false,status:503});r.snapshot.itemCount=100;const s=await save(w,provider,r);assert.equal(s.result.ok,false);assert.equal(rows(await w.pageB.getDatabase(),provider).length,0);
 })]);
 gogEpicRecoveryTests.push([`${provider} recovery: rejected storage, stale lease, duplicate completion and lost reply preserve atomic results`,async()=>{
  const partial=await acquire(provider,n=>n===1?json(page(provider,[9001],'next')):{ok:false,status:503});
  for(const failure of ['QuotaExceededError','disk failure']){
   const db=syntheticProviderLibrary(8);let reject=false;const h=performanceWriter(db,{beforeSet:updates=>{if(reject&&updates.galacticLibraryDatabase)throw Error(failure);}});
   const begin=()=>h.writer.beginProviderScan(provider,'Personal','full',false,1);
   let lease=await begin();const before=plain(h.stored.galacticLibraryDatabase);reject=true;
   await assert.rejects(h.writer.commitProviderScan(provider,partial.items,{syncMode:'full',fullSyncAt:'2026-11-05'},partial.snapshot,lease.scanToken,1),new RegExp(failure));assert.deepEqual(h.stored.galacticLibraryDatabase,before);
   reject=false;lease=await begin();await begin();await assert.rejects(h.writer.commitProviderScan(provider,partial.items,{syncMode:'full'},partial.snapshot,lease.scanToken,1),/superseded/);
   lease=await begin();await h.writer.commitProviderScan(provider,partial.items,{syncMode:'full'},partial.snapshot,lease.scanToken,1);const after=await h.writer.getDatabase();assert.equal(rows(after,provider).filter(i=>i.providerItemId==='9001').length,1);
   await assert.rejects(h.writer.commitProviderScan(provider,partial.items,{syncMode:'full'},partial.snapshot,lease.scanToken,1),/superseded|completed/);
   const restarted=performanceWriter(null,{stored:h.stored});assert.equal(rows(await restarted.writer.getDatabase(),provider).filter(i=>i.providerItemId==='9001').length,1);
   assert.equal(after.providers[provider].fullSyncAt,db.providers[provider].fullSyncAt);
  }
 }]);
 gogEpicRecoveryTests.push([`${provider} recovery: duplicate IDs and invalid records cannot certify complete coverage`,async()=>{
  const first=page(provider,[1],'next'),second=page(provider,[1,2]);if(provider==='gog'){first.totalProducts=3;second.totalPages=2;second.totalProducts=3;}
  const result=await acquire(provider,n=>json(n===1?first:second));assert.equal(result.items.length,2);assert.equal(result.snapshot.complete,false);
  const malformed=page(provider,[1]);if(provider==='gog')malformed.products.push(null,{id:4,title:'x'.repeat(501)});else malformed.data.Library.libraryItems.records.push(null,{catalogItem:{id:'4',title:'x'.repeat(501)}});
  const valid=await acquire(provider,()=>json(malformed));assert.equal(valid.items.length,1);assert.equal(valid.failedItems,2);
 }]);
 gogEpicRecoveryTests.push([`${provider} recovery: mixed supported/excluded products retain clean classification and comparison identity`,()=>withWorker(async w=>{
  const mixed=page(provider,[1]);
  if(provider==='gog')mixed.products.push({id:2,title:'Excluded movie',isMovie:true},{id:3,title:'Excluded non-game',isGame:false});
  else mixed.data.Library.libraryItems.records.push({...record(2),catalogItem:{...record(2).catalogItem,mainGameItem:{id:'1'}}},{...record(3),namespace:'ue'},{...record(4),sandboxType:'PRIVATE'},{...record(5),product:{supportedTypes:['SOFTWARE']}});
  const clean=await acquire(provider,()=>json(mixed));const body=plain(mixed);if(provider==='gog'){body.products.push({id:6});body.totalProducts=body.products.length;}else body.data.Library.libraryItems.records.push({catalogItemId:'6'});
  const partial=await acquire(provider,()=>json(body));assert.deepEqual(partial.items,clean.items);assert((await save(w,provider,partial)).result.ok);const db=await w.pageA.getDatabase();assert.equal(rows(db,provider).filter(i=>i.mediaType==='game-addon').length,provider==='epic'?1:0);assert.equal(rows(db,provider).filter(i=>i.mediaType==='game').length,1);
 })]);
}
gogEpicRecoveryTests.push(['GOG recovery: known first page cannot hide a failed older page or hidden scope',async()=>{
 let first={products:[product(1)],totalPages:2,totalProducts:2,hasHiddenProducts:true};
 const result=await acquire('gog',(_n,url)=>{const p=new URL(url,'https://www.gog.com');return p.searchParams.get('hiddenFlag')==='1'?json({products:[product(3)],totalPages:1,totalProducts:1}):p.searchParams.get('page')==='1'?json(first):json({...first,products:[product(2)]});},['1'],true);
 assert.equal(result.requests,3);assert.deepEqual(result.items.map(i=>i.providerItemId).sort(),['2','3']);
}]);
gogEpicRecoveryTests.push(['GOG recovery: unchanged Quick after partial acquisition uses status receipt with zero catalog writes',async()=>{
 const db=syntheticProviderLibrary(8),profile=db.providerProfiles[db.providers.gog.activeProfileId];profile.state.syncState={acquisitionCheckedAt:'2026-01-01'};db.providers.gog.syncState=profile.state.syncState;delete profile.state.fullSyncAt;delete db.providers.gog.fullSyncAt;
 const h=performanceWriter(db);await h.writer.getQueryDatabase();const lease=await h.writer.beginProviderScan('gog','Personal','incremental',false,1);const before=h.counts.databaseWrites;
 await h.writer.commitProviderScan('gog',[],{syncMode:'incremental',quickSyncAt:'2026-11-05'},undefined,lease.scanToken,1);assert.equal(h.counts.databaseWrites,before);
 const cold=performanceWriter(null,{stored:h.stored});assert.equal((await cold.writer.getDatabase()).providers.gog.quickSyncAt,'2026-11-05T00:00:00.000Z');
}]);

gogEpicRecoveryTests.push(['Epic recovery: an independently readable add-on survives a later-page failure without becoming a base game',()=>withWorker(async w=>{
 const body=page('epic',[2],'next');body.data.Library.libraryItems.records[0].catalogItem.mainGameItem={id:'1'};
 const partial=await acquire('epic',n=>n===1?json(body):{ok:false,status:503});assert.equal(partial.items.length,1);assert.equal(partial.items[0].mediaType,'game-addon');assert.equal(partial.items[0].metadata.parentProviderItemId,'1');const saved=await save(w,'epic',partial);assert(saved.result.ok,saved.result.error);const db=await w.pageA.getDatabase();assert.equal(rows(db,'epic')[0].mediaType,'game-addon');assert.equal(db.providers.epic.fullSyncAt,undefined);
})]);
