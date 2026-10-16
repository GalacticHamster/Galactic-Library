import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {syntheticProviderLibrary,performanceWriter,measuredScan} from './provider-performance-fixture.js';
import {normalizeProviderItem} from '../src/lib/models.js';
import {snapshotDifferences} from '../src/lib/sync-health.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {withWorker,snapshotFixture} from './storage.js';
import {PROVIDER_CHECKS_KEY,providerCheckDigest,applyProviderChecks} from '../src/lib/provider-scan-checks.js';
import {handleExternalApiRequestAsync} from '../src/lib/external-api.js';
import {steamOutcomeTests} from './steam-outcomes.js';
import {providerStatusReceiptTests} from './provider-status-receipts.js';

function steamFixture(responses){
  let queries=0;
  const c=vm.createContext({setTimeout:callback=>callback(),fetch:async url=>({ok:true,json:async()=>String(url).startsWith('/dynamicstore')?{rgOwnedApps:[1,2,3]}:responses[queries++]})});
  for(const file of ['provider-snapshot','steam-store'])vm.runInContext(readFileSync(new URL('../src/providers/'+file+'.js',import.meta.url),'utf8'),c);
  return {S:c.GalacticSteamStore,queries:()=>queries};
}
export const providerPipelinePerformanceTests=[
 ...steamOutcomeTests,
 ...providerStatusReceiptTests,
 ['empty checks: an observed base change during receipt acquisition rejects the stale commit',async()=>{
   let armed=false,h;const db=syntheticProviderLibrary(40),item=Object.values(db.providerItems).find(item=>item.provider==='steam');
   h=performanceWriter(db,{beforeGet:defaults=>{if(armed&&Object.hasOwn(defaults,PROVIDER_CHECKS_KEY)){armed=false;h.stored.galacticLibraryDatabase.providerItems[item.id].ownership='revoked';h.writer.invalidateQuerySnapshot();}}});
   const scan=await h.writer.beginProviderScan('steam','Personal','incremental',false,1);armed=true;
   await assert.rejects(h.writer.commitProviderScan('steam',[],{syncMode:'incremental'},null,scan.scanToken,1),/library changed/);
   assert.equal(h.stored.galacticLibraryDatabase.providerItems[item.id].ownership,'revoked');assert(!h.stored[PROVIDER_CHECKS_KEY]);assert.equal(h.counts.databaseWrites,0);
 }],
 ['empty checks: durable receipt survives restart and backup/restore without rewriting item observations',async()=>{
   const db=syntheticProviderLibrary(80),h=performanceWriter(db),original=structuredClone(db);
   await measuredScan(h);assert.deepEqual(h.stored.galacticLibraryDatabase,original);assert(h.stored[PROVIDER_CHECKS_KEY]);
   const beforeQuery=await h.writer.getQueryDatabase();
   await measuredScan(h);assert.equal(await h.writer.getQueryDatabase(),beforeQuery,'Identity projection base is unchanged');
   const restart=performanceWriter(null,{stored:h.stored}),view=(await restart.writer.getCommittedLibraryView()).database;
   assert.equal(view.providers.steam.quickSyncAt,'2026-10-16T00:00:00.000Z');assert.equal(view.providers.steam.syncHealth.status,'succeeded');
   assert.deepEqual(view.providerItems,original.providerItems);
   assert.deepEqual(await handleExternalApiRequestAsync(view,{type:'GET_STATUS'}),await handleExternalApiRequestAsync(beforeQuery,{type:'GET_STATUS'}));
   const backup=parseBackup(createBackup(await restart.writer.getDatabase()));
   assert.equal(backup.providers.steam.lastSync,view.providers.steam.lastSync);
   await restart.writer.restoreDatabase(backup);assert.equal(h.stored[PROVIDER_CHECKS_KEY],undefined);
   assert.equal((await restart.writer.getDatabase()).providers.steam.lastSync,view.providers.steam.lastSync);
   await restart.writer.restoreDatabase(original);assert.deepEqual((await restart.writer.getDatabase()).providerItems,original.providerItems);
   assert.equal((await restart.writer.getDatabase()).providers.steam.quickSyncAt,undefined);
 }],
 ['empty checks: receipt failure preserves baseline; committed receipt consumes lease despite failed cleanup/restart',async()=>{
   for(const failAfter of [false,true]){
     let armed=false;
     const db=syntheticProviderLibrary(40),h=performanceWriter(db,{
       beforeSet:updates=>{if(armed&&(!failAfter&&updates[PROVIDER_CHECKS_KEY]||failAfter&&!updates[PROVIDER_CHECKS_KEY]&&updates.galacticLibraryProviderScans))throw Error('Interrupted storage');}
     });
     const scan=await h.writer.beginProviderScan('steam','Personal','incremental',false,1);armed=true;
     const commit=()=>h.writer.commitProviderScan('steam',[],{syncMode:'incremental',quickSyncAt:'2026-10-16'},null,scan.scanToken,1);
     if(!failAfter){await assert.rejects(commit(),/Interrupted/);assert(!h.stored[PROVIDER_CHECKS_KEY]);}
     else {await commit();assert(h.stored.galacticLibraryProviderScans.steam);}
     const restart=performanceWriter(null,{stored:h.stored});
     assert.deepEqual(h.stored.galacticLibraryDatabase,db);
     if(failAfter){
       const view=(await restart.writer.getCommittedLibraryView()).database;
       assert.equal(view.providers.steam.syncHealth.status,'succeeded');
       await assert.rejects(restart.writer.commitProviderScan('steam',[],{syncMode:'incremental'},null,scan.scanToken,1),/already completed/);
       await assert.rejects(restart.writer.cancelProviderScan('steam',h.stored.galacticLibraryProviderScans.steam.attemptRef),/already finished/);
       assert.equal(await restart.writer.failProviderScan('steam',scan.scanToken,1),false);
     }else await restart.writer.commitProviderScan('steam',[],{syncMode:'incremental'},null,scan.scanToken,1);
   }
 }],
 ['empty checks: write-then-error acknowledgement recovery never replays a durable completion',async()=>{
   let armed=false;const h=performanceWriter(syntheticProviderLibrary(40),{afterSet:updates=>{if(armed&&updates[PROVIDER_CHECKS_KEY])throw Error('Lost acknowledgement');}});
   const scan=await h.writer.beginProviderScan('steam','Personal','incremental',false,1);armed=true;
   await assert.rejects(h.writer.commitProviderScan('steam',[],{syncMode:'incremental'},null,scan.scanToken,1),/acknowledgement/);
   const restart=performanceWriter(null,{stored:h.stored});assert.equal((await restart.writer.getCommittedLibraryView()).database.providers.steam.syncHealth.status,'succeeded');
   await assert.rejects(restart.writer.commitProviderScan('steam',[],{syncMode:'incremental'},null,scan.scanToken,1),/already completed/);
 }],
 ['empty checks: stale/malformed overlays cannot claim freshness or modify ownership or counts',async()=>{
   const db=syntheticProviderLibrary(40),h=performanceWriter(db);await measuredScan(h);
   const receipt=structuredClone(h.stored[PROVIDER_CHECKS_KEY]),digest=await providerCheckDigest(db);
   const invalid=[{...receipt,baseDigest:'0'.repeat(64)}, {...receipt,format:2}, {...receipt,checks:{...receipt.checks,untrusted:receipt.checks.steam}},
     {...receipt,checks:{steam:{...receipt.checks.steam,profileId:db.providers.epic.activeProfileId}}},
     {...receipt,checks:{steam:{...receipt.checks.steam,patch:{...receipt.checks.steam.patch,itemCount:123}}}}];
   for(const overlay of invalid)assert.deepEqual(applyProviderChecks(db,overlay,digest),db);
   const item=Object.values(h.stored.galacticLibraryDatabase.providerItems)[0];item.ownership='returned';
   const restart=performanceWriter(null,{stored:h.stored}),view=(await restart.writer.getCommittedLibraryView()).database;
   assert.equal(view.providers.steam.quickSyncAt,undefined);assert.equal(view.providerItems[item.id].ownership,'returned');
 }],
 ['empty checks: concurrent providers retain both receipts; a real edit folds check metadata into the atomic database save',async()=>{
   const h=performanceWriter(syntheticProviderLibrary(80));
   await Promise.all([measuredScan(h),measuredScan(h,{provider:'epic'})]);
   const view=(await h.writer.getCommittedLibraryView()).database;
   for(const provider of ['steam','epic'])assert.equal(view.providers[provider].quickSyncAt,'2026-10-16T00:00:00.000Z');
   await h.writer.saveOwnershipPolicy({providers:{kobo:true}});
   for(const provider of ['steam','epic'])assert.equal(h.stored.galacticLibraryDatabase.providers[provider].lastSync,view.providers[provider].lastSync);
   assert.equal((await h.writer.getCommittedLibraryView()).database.ownershipPolicy.providers.kobo,true);
 }],
 ['empty checks: first imports, account switching and records with refreshed evidence take the validated save path',async()=>{
   const db=syntheticProviderLibrary(40),profile=db.providers.steam.activeProfileId;
   const item=Object.values(db.providerItems).find(item=>item.profileId===profile);
   for(const change of [{},{title:'Changed title'},{ownership:'returned'},{ownership:'revoked'},{ownership:'expired'},{ownership:'subscription'},{ownership:'borrowed'},{ownership:'unknown'},{metadata:{...item.metadata,parentProviderItemId:'900'}}]){
     const h=performanceWriter(db),result=await measuredScan(h,{items:[{...item,...change}]});
     assert.equal(result.counts.databaseWrites,1);assert(result.phases.persist_validation>0);assert.equal(h.stored[PROVIDER_CHECKS_KEY],undefined);
     assert.equal(h.stored.galacticLibraryDatabase.providerItems[item.id].ownership,change.ownership??item.ownership);
   }
   for(const diagnostics of [{failedRequestCount:1},{coverageLimit:'array-only-index-without-total'}]){
     const h=performanceWriter(db),scan=await h.writer.beginProviderScan('steam','Personal','incremental',false,1);
     await h.writer.commitProviderScan('steam',[],{syncMode:'incremental',scanDiagnostics:diagnostics},null,scan.scanToken,1);
     assert.equal(h.counts.databaseWrites,0);assert(h.stored[PROVIDER_CHECKS_KEY]);
     const state=(await h.writer.getCommittedLibraryView()).database.providers.steam;
     assert.equal(state.syncHealth.status,'partial');assert.equal(state.lastSync,db.providers.steam.lastSync);assert.equal(state.quickSyncAt,db.providers.steam.quickSyncAt);
     assert.deepEqual(h.stored.galacticLibraryDatabase.providerItems,db.providerItems);
   }
   const h=performanceWriter(db),scan=await h.writer.beginProviderScan('steam','Other','incremental',true,1);
   await h.writer.commitProviderScan('steam',[],{syncMode:'incremental'},null,scan.scanToken,1);
   assert.equal(h.counts.databaseWrites,2);assert(!h.stored[PROVIDER_CHECKS_KEY]);assert.equal((await h.writer.getDatabase()).providers.steam.activeProfileId,scan.profileId);
   const fresh=performanceWriter(syntheticProviderLibrary(1));delete fresh.stored.galacticLibraryDatabase.providerProfiles[profile];
   const first=await fresh.writer.beginProviderScan('steam','New','full',true,1);
   await fresh.writer.commitProviderScan('steam',[],{syncMode:'full'},snapshotFixture('steam',[]),first.scanToken,1);
   assert.equal(fresh.counts.databaseWrites,2);assert(!fresh.stored[PROVIDER_CHECKS_KEY]);
 }],
 ['empty checks: replacement failures are conservative and never resurrect stale successful checks',async()=>{
   for(const step of ['remove','database']){
     let armed=false;const db=syntheticProviderLibrary(40),h=performanceWriter(db,{
       beforeRemove:()=>{if(armed&&step==='remove')throw Error('Interrupted removal');},
       beforeSet:updates=>{if(armed&&step==='database'&&updates.galacticLibraryDatabase)throw Error('Interrupted replacement');}
     });
     await measuredScan(h);armed=true;await assert.rejects(h.writer.restoreDatabase(db),/Interrupted/);
     assert.deepEqual(h.stored.galacticLibraryDatabase,db);
     const restart=performanceWriter(null,{stored:h.stored}),view=(await restart.writer.getCommittedLibraryView()).database;
     assert.equal(Boolean(view.providers.steam.quickSyncAt),step==='remove');
   }
 }],
 ['empty checks: failed retirement after a real commit cannot resurrect old successful health',async()=>{
   let armed=false;const h=performanceWriter(syntheticProviderLibrary(40),{beforeRemove:()=>{if(armed)throw Error('Interrupted receipt cleanup');}});
   await measuredScan(h);armed=true;await measuredScan(h,{items:[{providerItemId:'real-change',title:'Real change',mediaType:'game',ownership:'owned'}],scanDiagnostics:{failedRequestCount:1}});
   assert(h.stored[PROVIDER_CHECKS_KEY]);assert.equal(h.stored.galacticLibraryDatabase.providers.steam.syncHealth.status,'partial');
   const restart=performanceWriter(null,{stored:h.stored});assert.equal((await restart.writer.getCommittedLibraryView()).database.providers.steam.syncHealth.status,'partial');
 }],
 ['provider pipeline: repeated empty quick scans read twice, write no database and retain data',async()=>{
   for(const size of [40,200]){
     const db=syntheticProviderLibrary(size),h=performanceWriter(db),other=Object.values(db.providerItems).filter(item=>item.provider!=='steam');
     for(let pass=0;pass<2;pass++){
       const result=await measuredScan(h);
       assert.equal(result.counts.databaseReads,2);assert.equal(result.counts.databaseWrites,0);
       assert.equal(result.phases.canonical_rebuild,undefined);
       if(pass)assert.equal(result.phases.read_validation,undefined,'Fresh equal committed revision reuses validation');
       const after=(await h.writer.getCommittedLibraryView()).database;
       assert.deepEqual(other,Object.values(after.providerItems).filter(item=>item.provider!=='steam'));
       assert.equal(after.providers.steam.quickSyncAt,'2026-10-16T00:00:00.000Z');
       assert.equal(after.providers.steam.syncHealth.differences.added,0);assert.equal(after.providers.steam.syncHealth.differences.updated,0);
       assert.deepEqual(parseBackup(createBackup(after)),after);
     }
   }
 }],
 ['provider pipeline: failed and stale scan commits retain records and reject cross-account writes',async()=>{
   const db=syntheticProviderLibrary(40),h=performanceWriter(db),original=structuredClone(db.providerItems);
   await measuredScan(h,{fail:true});assert.deepEqual(h.stored.galacticLibraryDatabase.providerItems,original);
   const old=await h.writer.beginProviderScan('steam','Personal','incremental',false,1),next=await h.writer.beginProviderScan('steam','Personal','incremental',false,1);
   await assert.rejects(h.writer.commitProviderScan('steam',[],{syncMode:'incremental'},undefined,old.scanToken,1),/superseded/);
   await assert.rejects(h.writer.commitProviderScan('steam',[],{syncMode:'incremental'},undefined,next.scanToken,2),/superseded/);
   await h.writer.restoreDatabase(db);
   await assert.rejects(h.writer.commitProviderScan('steam',[],{syncMode:'incremental'},undefined,next.scanToken,1),/superseded/);
 }],
 ['provider pipeline: lease-only quick starts remain visible and cancellable without changing library data',async()=>{
   const db=syntheticProviderLibrary(40),h=performanceWriter(db),before=h.counts.databaseWrites;
   const scan=await h.writer.beginProviderScan('steam','Personal','incremental',false,1);
   assert.equal(h.counts.databaseWrites,before);
   const view=await h.writer.getCommittedLibraryView(),health=view.database.providers.steam.syncHealth;
   assert.equal(health.status,'running');assert.equal(h.stored.galacticLibraryDatabase.providers.steam.syncHealth.status,'succeeded');
   const after=await h.writer.cancelProviderScan('steam',health.attemptRef);
   assert.equal(after.providers.steam.syncHealth.status,'cancelled');assert.equal(after.providers.steam.syncHealth.attemptRef,health.attemptRef);
   await assert.rejects(h.writer.commitProviderScan('steam',[],{syncMode:'incremental'},null,scan.scanToken,1),/superseded/);
 }],
 ['provider pipeline: exact committed comparison revalidates changed storage instead of reusing stale ownership',async()=>{
   const h=performanceWriter(syntheticProviderLibrary(40));await measuredScan(h);
   const item=Object.values(h.stored.galacticLibraryDatabase.providerItems).find(item=>item.provider==='steam');item.ownership='revoked';
   const result=await measuredScan(h);assert(result.phases.read_validation>0);
   assert.equal(h.stored.galacticLibraryDatabase.providerItems[item.id].ownership,'revoked');
   h.stored.galacticLibraryDatabase.providerItems[item.id].ownership='invented';
   await assert.rejects(measuredScan(h),/ownership state/);
 }],
 ['provider pipeline: full scans keep absence history, ownership corrections, add-on parents and account isolation',async()=>{
   const db=syntheticProviderLibrary(80),h=performanceWriter(db),profile=db.providers.steam.activeProfileId;
   const records=Object.values(db.providerItems).filter(item=>item.profileId===profile),target=records.find(item=>item.mediaType==='game'),removed=records.at(-1);
   await h.writer.saveOwnershipCorrections([ownershipCorrectionTarget(target,db)],{ownership:'owned',note:'Synthetic correction'});
   const incoming=records.filter(item=>item.id!==removed.id).map(item=>({...item,ownership:item.id===target.id?'unknown':item.ownership}));
   await measuredScan(h,{mode:'full',items:incoming});
   const after=h.stored.galacticLibraryDatabase;
   assert.equal(effectiveOwnershipRecord(after.providerItems[target.id],after).ownership,'owned');
   assert(after.providerHistory[removed.recordRef]);assert(!after.providerItems[removed.id]);
   assert.deepEqual(Object.values(after.providerItems).filter(item=>item.provider==='steam'&&item.profileId!==profile),Object.values(db.providerItems).filter(item=>item.provider==='steam'&&item.profileId!==profile));
   for(const item of incoming.filter(item=>item.mediaType==='game-addon'))assert.equal(after.providerItems[item.id].metadata.parentProviderItemId,item.metadata.parentProviderItemId);
 }],
 ['provider summaries: meaningful changes include access, identifiers, titles and parent links but exclude timestamps',()=>{
   const before=normalizeProviderItem({provider:'steam',providerItemId:'1',title:'Synthetic Game',ownership:'owned',metadata:{source:'steam-store-browse-items'}});
   const fresh={...before,updatedAt:'2026-10-16',observedAt:'2026-10-16'};
   assert.equal(snapshotDifferences([before],[fresh],false,true).unchanged,1);
   for(const change of [{title:'Synthetic Revised Game'},{ownership:'revoked'},{platform:['Linux']},{metadata:{...before.metadata,parentProviderItemId:'5'}}])assert.equal(snapshotDifferences([before],[{...fresh,...change}],false,true).updated,1);
   const addon=normalizeProviderItem({...before,providerItemId:'2',mediaType:'game-addon',metadata:{parentProviderItemId:'1'}});
   const result=snapshotDifferences([before],[fresh,addon],false,true);
   assert.equal(result.gamesAdded,0);assert.equal(result.addOnsAdded,1);assert.equal(result.unchanged,1);
 }],
 ['Steam retries: repeated candidates are not additions; successfully saved IDs stop being retried',async()=>{
   const f=steamFixture([{response:{store_items:[{appid:1,name:'Synthetic Game',type:0},{appid:2,name:'Synthetic DLC',type:4,parent_appid:1},{appid:3,name:'Synthetic Tool',type:6}]}},
     {response:{store_items:[{appid:3,name:'Synthetic Tool',type:6}]}}]);
   const first=await f.S.fetchOwnedSteamGames(()=>{},[]);assert.equal(first.newAppCount,3);assert.equal(first.items.length,2);assert.equal(first.unsupportedAppCount,1);
   const second=await f.S.fetchOwnedSteamGames(()=>{},first.items.map(item=>item.providerItemId));
   assert.equal(second.newAppCount,1);assert.equal(second.items.length,0);assert.equal(second.unsupportedAppCount,1);assert.equal(f.queries(),2);
 }],
 ['Steam retries: missing and malformed batch results never count an unresolved ID twice',async()=>{
   const f=steamFixture([{response:{store_items:[{appid:1,type:'invalid'}]}}]);
   const result=await f.S.fetchOwnedSteamGames(()=>{},[]);
   assert.equal(result.unresolvedApps.length,3);assert.equal(new Set(result.unresolvedApps.map(item=>item.appId)).size,3);assert.equal(result.failedRequestCount,0);assert.equal(result.items.length,0);
 }],
 ['provider diagnostics: Steam start/finish profiles remain bounded and redact all private values',async()=>withWorker(async({dispatch,pageA})=>{
   await pageA.mergeProviderItems('steam',[{providerItemId:'1',title:'PRIVATE SYNTHETIC TITLE',ownership:'owned',mediaType:'game'}],{profileLabel:'Personal',fullSyncAt:'2026-01-01'});
   const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://store.steampowered.com/account/',tab:{id:1}};
   const start=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'steam',beginScan:true,confirmed:true,profileLabel:'Personal',mode:'incremental',diagnosticLookupId:'lookup-aaaaaaaaaaaa-101'},sender);
   assert(start.ok,start.error);assert(start.performance.events.some(event=>event.stage==='provider_start'));
   const finish=await dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'steam',mode:'incremental',items:[],scanToken:start.scanToken,diagnosticLookupId:'lookup-aaaaaaaaaaaa-101'},sender);
   assert(finish.ok,finish.error);assert.equal(finish.changes.gamesAdded,0);assert.equal(finish.changes.gamesUpdated,0);
   assert(!JSON.stringify(finish.performance).includes('PRIVATE'));assert.equal(finish.performance.validationWork,undefined);
 },{storageEvents:true,concurrentQueries:true})]
];
