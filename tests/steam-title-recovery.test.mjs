import test from 'node:test';
import assert from 'node:assert/strict';
import {steamOutcomeFixture} from './steam-outcomes.js';
import {steamTitleStatuses} from '../src/lib/provider-state.js';
import {normalizeProviderItem} from '../src/lib/models.js';
import {normalizeGameTitle} from '../src/lib/normalization.js';
import {withWorker,snapshotFixture} from './storage.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {performanceWriter} from './provider-performance-fixture.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
const copy=value=>JSON.parse(JSON.stringify(value)),game=(id,name='Synthetic game '+id)=>({appid:id,type:0,name}),reply=rows=>({body:{response:{store_items:rows}}});
const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://store.steampowered.com/account/',tab:{id:71}};
const fixture=(rows,ids=rows.map(r=>r.appid),options={})=>steamOutcomeFixture(ids,Array.from({length:Math.ceil(ids.length/100)},(_,i)=>reply(rows.filter(r=>ids.slice(i*100,i*100+100).includes(r.appid)||r.appid===undefined&&i===0))),options);
const records=db=>Object.values(db.providerItems).filter(i=>i.provider==='steam');
const begin=(w,mode='full',label='Synthetic')=>w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'steam',beginScan:true,confirmed:true,profileLabel:label,mode},sender);
const commit=(w,s,r,mode='full')=>w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'steam',mode,scanToken:s.scanToken,items:copy(r.items),snapshot:r.snapshot?copy(r.snapshot):undefined,syncState:{applications:copy(r.applications)},scanDiagnostics:{failedRequestCount:0,incomplete:false}},sender);

test('Steam 3000-ID Full admits 2999, persists one issue, reloads and Quick recovers one then checks zero metadata',()=>withWorker(async w=>{
 const ids=Array.from({length:3000},(_,i)=>i+1),rows=ids.map(id=>game(id,id===3000?'!!! ---':undefined));
 const f=fixture(rows,ids,{validate:r=>w.dispatch(r,sender)});f.S.setDiagnosticSampling(true);
 const r=await f.S.fetchOwnedSteamGames(()=>{},null,{diagnostics:true});assert.equal(f.calls(),30);assert.equal(f.validationCalls(),30);assert.equal(r.items.length,2999);assert.equal(r.unresolvedApps.length,1);assert.equal(r.diagnostics.canonicalTitleRejected,1);assert.equal(r.diagnostics.outcomes.invalidTitle,1);
 assert.equal(f.S.getDiagnosticSample().groups.invalidTitle[0].appId,'3000');assert.equal(f.S.getDiagnosticSample().groups.invalidTitle[0].hasUsableName,false);
 assert((await commit(w,await begin(w),r)).ok);let db=await w.pageA.getDatabase();assert.equal(records(db).length,2999);assert.equal(db.providers.steam.syncState.applications.appIds.length,3000);
 await w.pageA.restoreDatabase(parseBackup(createBackup(db)));const s=await begin(w,'incremental');assert(!s.syncState.knownProviderItemIds.includes('3000'));
 const q=steamOutcomeFixture(ids,[reply([game(3000)])]);const recovered=await q.S.fetchOwnedSteamGames(()=>{},s.syncState.knownProviderItemIds,{diagnostics:true});assert.equal(q.calls(),1);assert.equal(q.validationCalls(),1);assert((await commit(w,s,recovered,'incremental')).ok);db=await w.pageA.getDatabase();assert.equal(records(db).length,3000);assert.equal(db.providers.steam.syncState.applications.issues.length,0);
 const clean=fixture([],ids),s2=await begin(w,'incremental'),writes=w.memory.commits.length;const unchanged=await clean.S.fetchOwnedSteamGames(()=>{},s2.syncState.knownProviderItemIds,{diagnostics:true});assert.equal(clean.calls(),0);assert.equal(clean.validationCalls(),0);assert((await commit(w,s2,unchanged,'incremental')).ok);assert.equal(w.memory.commits.length,writes,'Unchanged Quick rewrote catalog');
 const P=globalThis.GalacticContentsPerformance,t=P.trace('lookup-aaaaaaaaaaaa-123','provider');t.provider='steam';t.steamDiagnostics={...r.diagnostics,saveState:'committed',savedCount:2999};const cleanReport=P.clean(t.finish('prepared'));assert.equal(cleanReport.steamDiagnostics.canonicalTitleRejected,1);assert(!JSON.stringify(cleanReport).includes('3000"'));assert(!JSON.stringify(cleanReport).includes('!!!'));
},{storageEvents:true,concurrentQueries:true}));

test('Steam title admission keeps global validation strict for normalization variants and accepts meaningful Unicode',async()=>{
 const invalid=['',' \t\n ','!!!','🎮✨','\u200b\u200d\u2060','\u0301\u0308','!'.repeat(501),'Good\u0000bad'];
 for(const name of invalid){const f=fixture([game(1,name)]),r=await f.S.fetchOwnedSteamGames(()=>{},null,{diagnostics:true});assert.equal(r.items.length,0,name);assert.equal(r.applications.issues.length,1);assert.throws(()=>normalizeProviderItem({provider:'steam',providerItemId:'1',title:name}));const h=performanceWriter(null);await h.writer.replaceProviderItems('steam',copy(r.items),{profileLabel:'Synthetic',syncMode:'full',syncState:{applications:copy(r.applications)}},copy(r.snapshot));assert.equal(records(await h.writer.getDatabase()).length,0);assert.equal((await h.writer.getDatabase()).providers.steam.syncState.applications.issues.length,1);}
 for(const name of ['東京物語','Café e\u0301','日本語 and English','Game 🎮','&nbsp;']){const r=await fixture([game(1,name)]).S.fetchOwnedSteamGames();assert.equal(r.items.length,1);assert(normalizeGameTitle(name).normalizedTitle);normalizeProviderItem({...r.items[0],provider:'steam'});}
 for(const row of [{appid:1,type:0},{appid:1,type:0,name:{bad:true}},{appid:1,type:99,name:'Other application'},{type:0,name:'Missing ID'},{appid:-1,type:0,name:'Invalid ID'}]){const r=await fixture([row],[1]).S.fetchOwnedSteamGames();assert.equal(r.items.length,0);assert.equal(r.applications.appIds[0],'1');assert.equal(r.applications.issues.length,1);}
 assert.throws(()=>steamTitleStatuses(['x'.repeat(501)]));assert.throws(()=>steamTitleStatuses(Array(101).fill('a')));
});

test('Steam duplicate metadata preserves conflicts and never borrows an unsolicited cross-batch identity',async()=>{
 for(const pair of [[game(1),game(1)],[game(1,'!!!'),game(1)],[game(1),game(1,'!!!')]]){const r=await fixture(pair,[1]).S.fetchOwnedSteamGames();assert.equal(r.items.length,pair[0].name===pair[1].name?1:0);if(!r.items.length)assert.equal(r.applications.issues[0].kind,'conflictingDuplicate');}
 const ids=Array.from({length:101},(_,i)=>i+1),f=steamOutcomeFixture(ids,[reply(ids.slice(0,100).map(id=>game(id))),reply([game(1,'!!!'),game(101)])]);const r=await f.S.fetchOwnedSteamGames();assert.equal(r.items.length,101);assert.equal(r.items.find(i=>i.providerItemId==='1').title,'Synthetic game 1');assert.equal(r.unresolvedApps.length,0);
});

test('Steam bad refresh preserves valid title/date, history, manual corrections, subscription distinctions and unrelated provider',()=>withWorker(async w=>{
 const seed=[1,2,3].map(id=>({providerItemId:String(id),title:'Saved '+id,mediaType:'game',ownership:id===3?'subscription':'owned',acquiredAt:'2025-01-02',metadata:{source:'steam-store-browse-items',ownershipBasis:id===3?'master-subscription':'owned-app-index'}}));
 await w.pageA.replaceProviderItems('steam',seed,{profileLabel:'Synthetic',fullSyncAt:'2026-11-01'},snapshotFixture('steam',seed));await w.pageA.replaceProviderItems('steam',seed.filter(i=>i.providerItemId!=='2'),{profileLabel:'Synthetic'},snapshotFixture('steam',seed.filter(i=>i.providerItemId!=='2')));
 let db=await w.pageA.getDatabase(),first=records(db).find(i=>i.providerItemId==='1');await w.pageA.saveOwnershipReview(first.recordRef,{ownership:'unknown',note:'Keep correction',evidenceDate:'2026-11-01'});await w.pageA.mergeProviderItems('gog',[{providerItemId:'other',title:'Other provider',mediaType:'game',ownership:'owned'}]);const before=await w.pageA.getDatabase();
 const f=fixture([game(1,'!!!'),game(2,'🎮'),game(3,'\u200b'),game(7)], [1,2,3,7],{owned:{ok:true,status:200,body:{rgOwnedApps:[1,2,3,7],rgMasterSubApps:[3],rgAutoGrantApps:[7]}}}),r=await f.S.fetchOwnedSteamGames();assert((await commit(w,await begin(w),r)).ok);db=await w.pageA.getDatabase();assert.deepEqual(db.providerItems[first.id],before.providerItems[first.id]);assert.deepEqual(db.providerHistory,before.providerHistory);assert.deepEqual(db.ownershipReviews,before.ownershipReviews);assert.equal(records(db).find(i=>i.providerItemId==='3').ownership,'subscription');assert.equal(records(db).find(i=>i.providerItemId==='7').ownership,'unknown');assert.equal(effectiveOwnershipRecord(db.providerItems[first.id],db).ownership,'unknown');assert.deepEqual(Object.values(db.providerItems).filter(i=>i.provider==='gog'),Object.values(before.providerItems).filter(i=>i.provider==='gog'));assert.deepEqual(parseBackup(createBackup(db)),db);
 const s=await begin(w,'incremental'),q=fixture([game(1,'Recovered')],[1,2,3,7]);const recovered=await q.S.fetchOwnedSteamGames(()=>{},s.syncState.knownProviderItemIds);assert.equal(recovered.items.length,1);assert(recovered.applications.issues.some(i=>i.appId==='2'));
}));

test('Steam storage rejection cannot resolve an issue; fresh authorized retry persists once',async()=>{
 let reject=false;const h=performanceWriter(null,{beforeSet:patch=>{if(reject&&patch.galacticLibraryDatabase)throw Error('Quota exceeded');}}),r=await fixture([game(1,'!!!')]).S.fetchOwnedSteamGames();
 const save=async value=>{const s=await h.writer.beginProviderScan('steam','Synthetic','full',false,1);return h.writer.commitProviderScan('steam',copy(value.items),{syncMode:'full',syncState:{applications:copy(value.applications)}},copy(value.snapshot),s.scanToken,1);};
 await save(r);const before=copy(h.stored.galacticLibraryDatabase),recovered=await fixture([game(1)]).S.fetchOwnedSteamGames();reject=true;await assert.rejects(save(recovered),/Quota/);assert.deepEqual(h.stored.galacticLibraryDatabase,before);reject=false;await save(recovered);assert.equal(records(await h.writer.getDatabase()).length,1);assert.equal((await h.writer.getDatabase()).providers.steam.syncState.applications.issues.length,0);
});

test('Steam title service, authorization, index and receipt failures remain fatal at their original boundaries',()=>withWorker(async w=>{
 assert.equal((await w.dispatch({type:'VALIDATE_STEAM_TITLES',titles:['Game']},{...sender,url:'https://foreign.invalid/'})).ok,false);assert.equal((await w.dispatch({type:'VALIDATE_STEAM_TITLES',titles:Array(101).fill('Game')},sender)).ok,false);
 for(const response of [{ok:false},{ok:true,statuses:[]},{ok:true,statuses:['invented']}])await assert.rejects(fixture([game(1)],[1],{validate:async()=>response}).S.fetchOwnedSteamGames(),/title validation could not finish/);
 for(const owned of [{ok:false,status:401},{ok:true,body:{rgOwnedApps:[1],complete:false}},{ok:true,body:{rgOwnedApps:[0]}}])await assert.rejects(fixture([game(1)],[1],{owned}).S.fetchOwnedSteamGames(),/owned-App-ID list/);
 const r=await fixture([game(1)]).S.fetchOwnedSteamGames(),stale=await begin(w),latest=await begin(w);assert.equal((await commit(w,stale,r)).ok,false);const invalid=copy(r);invalid.snapshot.itemCount++;assert.equal((await commit(w,latest,invalid)).ok,false);const once=await begin(w);assert((await commit(w,once,r)).ok);const replayed=await commit(w,once,r);assert(replayed.ok||/completed|superseded/.test(replayed.error));assert.equal(records(await w.pageA.getDatabase()).length,1);const switched=await begin(w);await w.pageA.mergeProviderItems('steam',[{providerItemId:'other',title:'Other profile',mediaType:'game',ownership:'owned'}],{profileLabel:'Other'});assert.equal((await commit(w,switched,r)).ok,false);
}));
