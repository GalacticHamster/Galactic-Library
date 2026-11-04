import assert from 'node:assert/strict';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {performanceWriter} from './provider-performance-fixture.js';
import {PROVIDER_CHECKS_KEY} from '../src/lib/provider-scan-checks.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {handleExternalApiRequestAsync} from '../src/lib/external-api.js';

function library(provider){
  const db=createEmptyDatabase(),profile=newProviderProfile(provider,'Personal');
  profile.state={connected:true,lastSync:'2026-01-01',fullSyncAt:'2026-01-01',quickSyncAt:'2026-01-02',...(provider==='humble'?{syncState:{knownPurchaseIds:[]}}:{})};
  if(['nintendo','playstation','xbox'].includes(provider))profile.sourceAccountFingerprint='a'.repeat(64);
  db.providerProfiles[profile.profileId]=profile;db.providers[provider]={...profile.state,activeProfileId:profile.profileId};
  const item=normalizeProviderItem({provider,profileId:profile.profileId,providerItemId:'saved',title:'Private fixture',mediaType:provider==='kobo'?'book':'game',ownership:'owned'},'2026-01-01');
  db.providerItems[item.id]=item;return validateDatabase(db);
}
const finish=(h,provider,scan,status)=>status==='failed'?h.writer.failProviderScan(provider,scan.scanToken,1,{code:'network'}):status==='cancelled'?h.writer.cancelProviderScan(provider,scan.attemptRef):h.writer.commitProviderScan(provider,[],{syncMode:'incremental',quickSyncAt:'2026-10-16',...(status==='partial'?{scanDiagnostics:{failedRequestCount:2}}:{})},null,scan.scanToken,1);
async function begin(h,provider,mode='incremental'){
  const scan=await h.writer.beginProviderScan(provider,'Personal',mode,false,1,null,false,['nintendo','playstation','xbox'].includes(provider)?'a'.repeat(64):null);
  return {...scan,attemptRef:h.stored.galacticLibraryProviderScans[provider].attemptRef};
}
export const providerStatusReceiptTests=[
 ...['steam','epic','gog','amazon-games','kobo'].map(provider=>['shared receipts: '+provider+' successful, partial, failed and cancelled checks keep data separate from status',async()=>{
   for(const status of ['succeeded','partial','failed','cancelled']){
     const db=library(provider),h=performanceWriter(db);await h.writer.getQueryDatabase();
     const snapshot=await h.writer.getQueryDatabase(),scan=await begin(h,provider);await finish(h,provider,scan,status);
     assert.equal(h.counts.databaseWrites,0);assert.deepEqual(h.stored.galacticLibraryDatabase,db);
     const view=(await h.writer.getCommittedLibraryView()).database;
     assert.equal(view.providers[provider].syncHealth.status,status);assert.equal(view.providers[provider].fullSyncAt,db.providers[provider].fullSyncAt);
     if(status!=='succeeded')for(const field of ['lastSync','quickSyncAt','fullSyncAt'])assert.equal(view.providers[provider][field],db.providers[provider][field]);
     assert.deepEqual(view.providerItems,db.providerItems);assert.equal(await h.writer.getQueryDatabase(),snapshot);
     assert.deepEqual(await handleExternalApiRequestAsync(view,{type:'GET_STATUS'}),await handleExternalApiRequestAsync(snapshot,{type:'GET_STATUS'}));
     const restart=performanceWriter(null,{stored:h.stored}),saved=await restart.writer.getDatabase();
     assert.equal(saved.providers[provider].syncHealth.status,status);await restart.writer.restoreDatabase(parseBackup(createBackup(saved)));
     assert.equal((await restart.writer.getDatabase()).providers[provider].syncHealth.status,status);
   }
 }]),
 ...['nintendo','playstation','xbox'].map(provider=>['shared receipts: '+provider+' failed/cancelled full attempt retains verified account and prior full baseline',async()=>{
   for(const status of ['failed','cancelled']){
     const db=library(provider),h=performanceWriter(db),scan=await begin(h,provider,'full'),writes=h.counts.databaseWrites;
     await finish(h,provider,scan,status);assert.equal(h.counts.databaseWrites,writes,'Completion needs no additional database write');
     const view=(await h.writer.getCommittedLibraryView()).database;
     assert.equal(view.providers[provider].syncHealth.status,status);assert.deepEqual(view.providerItems,db.providerItems);
     assert.equal(view.providers[provider].fullSyncAt,db.providers[provider].fullSyncAt);
     assert.equal(view.providerProfiles[scan.profileId].sourceAccountFingerprint,'a'.repeat(64));
   }
 }]),
 ['shared receipts: incomplete or failed checks cannot override a newer success or advance its baseline',async()=>{
   const h=performanceWriter(library('gog')),a=await begin(h,'gog');await finish(h,'gog',a,'partial');
   const b=await begin(h,'gog');await finish(h,'gog',b,'succeeded');const success=(await h.writer.getCommittedLibraryView()).database;
   assert.equal(await h.writer.failProviderScan('gog',a.scanToken,1),false);
   await assert.rejects(finish(h,'gog',a,'partial'),/superseded/);
   assert.deepEqual((await h.writer.getCommittedLibraryView()).database,success);
   const c=await begin(h,'gog');await finish(h,'gog',c,'partial');
   const after=(await h.writer.getCommittedLibraryView()).database;
   for(const field of ['lastSync','quickSyncAt','fullSyncAt'])assert.equal(after.providers.gog[field],success.providers.gog[field]);
   assert.equal(after.providers.gog.syncHealth.status,'partial');
 }],
 ['shared receipts: all terminal outcomes consume a durable receipt despite cleanup interruption; failed writes mint no completion',async()=>{
   for(const status of ['partial','failed','cancelled'])for(const step of ['receipt','acknowledgement','cleanup']){
     let armed=false;const db=library('amazon-games'),h=performanceWriter(db,{
       beforeSet:updates=>{if(armed&&(step==='receipt'&&updates[PROVIDER_CHECKS_KEY]||step==='cleanup'&&updates.galacticLibraryProviderScans))throw Error('Interrupted write');},
       afterSet:updates=>{if(armed&&step==='acknowledgement'&&updates[PROVIDER_CHECKS_KEY])throw Error('Lost acknowledgement');}
     });
     const scan=await begin(h,'amazon-games');armed=true;
     if(step==='cleanup')await finish(h,'amazon-games',scan,status);else await assert.rejects(finish(h,'amazon-games',scan,status),/Interrupted|acknowledgement/);
     assert.deepEqual(h.stored.galacticLibraryDatabase,db);
     const restart=performanceWriter(null,{stored:h.stored}),view=(await restart.writer.getCommittedLibraryView()).database;
     if(step==='receipt'){assert.equal(view.providers['amazon-games'].syncHealth.status,'running');assert(!h.stored[PROVIDER_CHECKS_KEY]);}
     else{
       assert.equal(view.providers['amazon-games'].syncHealth.status,status);
       await assert.rejects(restart.writer.commitProviderScan('amazon-games',[],{syncMode:'incremental'},null,scan.scanToken,1),/already completed/);
       assert.equal(await restart.writer.failProviderScan('amazon-games',scan.scanToken,1),false);
     }
   }
 }],
 ['shared receipts: saved provider sync cursors are data changes even when there are no items',async()=>{
   const db=library('humble'),h=performanceWriter(db),scan=await begin(h,'humble');
   await h.writer.commitProviderScan('humble',[],{syncMode:'incremental',syncState:{knownPurchaseIds:['new-saved-purchase']}},null,scan.scanToken,1);
   assert.equal(h.counts.databaseWrites,1);assert.deepEqual(h.stored.galacticLibraryDatabase.providers.humble.syncState.knownPurchaseIds,['new-saved-purchase']);
 }],
 ['shared receipts: lack of account baseline and observed metadata/access changes retain validated writes',async()=>{
   const db=library('gog'),h=performanceWriter(db),item=Object.values(db.providerItems)[0],scan=await begin(h,'gog');
   await h.writer.commitProviderScan('gog',[{...item,ownership:'revoked'}],{syncMode:'incremental',scanDiagnostics:{failedRequestCount:1}},null,scan.scanToken,1);
   assert.equal(h.counts.databaseWrites,1);assert.equal((await h.writer.getDatabase()).providerItems[item.id].ownership,'revoked');
   const fresh=performanceWriter(library('amazon-games')),start=await fresh.writer.beginProviderScan('amazon-games','New','full',true,1);
   const writes=fresh.counts.databaseWrites;await fresh.writer.failProviderScan('amazon-games',start.scanToken,1,{code:'network'});
   assert.equal(fresh.counts.databaseWrites,writes+1);assert(!fresh.stored[PROVIDER_CHECKS_KEY]);
 }]
];
