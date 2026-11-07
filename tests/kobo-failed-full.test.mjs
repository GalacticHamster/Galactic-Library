import assert from 'node:assert/strict';
import {test} from 'node:test';
import {withWorker} from './storage.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const provider='kobo',sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://www.kobo.com/library',tab:{id:21}};
const item={providerItemId:'one',title:'Synthetic purchase',mediaType:'book',ownership:'owned',acquiredAt:'2020-01-01',metadata:{source:'kobo-my-books-library',librarySection:'my-books',ownershipBasis:'purchase-attribute'}};
const full=(scopes=[])=>completeProviderSnapshot(provider,[item],[completedScope('my-books',1,1),...scopes.map(id=>completedScope(id,0,0))]);
const begin=async h=>{const r=await h.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider,mode:'full',profileLabel:'Synthetic',confirmed:true,beginScan:true},sender);assert(r.ok,r.error);return r;};
const fail=(h,scan,scopes=[],from=sender)=>h.dispatch({type:'REPORT_PROVIDER_SCAN_FAILURE',provider,scanToken:scan.scanToken,failure:{code:'coverage',koboScopes:scopes}},from);
const commit=(h,s,receipt=full())=>h.dispatch({type:'COMMIT_PROVIDER_SCAN',provider,mode:'full',scanToken:s.scanToken,items:[item],snapshot:receipt},sender);
for(const production of [false,true])for(const scopes of [[],['archive'],['audiobooks','audiobooks-archive']])test(`Kobo failed Full recovery is durable (${production?'production':'default'}, ${scopes.join(',')||'root'})`,()=>withWorker(async h=>{
 assert((await commit(h,await begin(h))).ok);await h.pageA.mergeProviderItems('steam',[{providerItemId:'42',title:'Unrelated game',mediaType:'game',ownership:'owned'}]);
 let db=await h.pageA.getDatabase();await h.pageA.saveOwnershipReview(Object.values(db.providerItems).find(i=>i.provider==='kobo').recordRef,{ownership:'unknown',note:'Keep correction',evidenceDate:'2026-11-01'});const before=await h.pageA.getDatabase();
 let catalogWrites=0;const set=h.memory.area.set;h.memory.area.set=async patch=>{if(patch.galacticLibraryDatabase)catalogWrites++;return set(patch);};
 let scan=await begin(h);catalogWrites=0;assert((await fail(h,scan,scopes)).ok);db=await h.pageB.getDatabase();assert(db.providers.kobo.syncState.listingIncomplete);assert.deepEqual(db.providers.kobo.syncState.pendingKoboScopes??[],scopes);
 for(const key of ['providerItems','providerHistory','ownershipReviews'])assert.deepEqual(db[key],before[key]);assert.equal(db.providers.kobo.fullSyncAt,before.providers.kobo.fullSyncAt);assert.equal(catalogWrites,1,'One validated state transition uses the existing database commit');
 scan=await begin(h);catalogWrites=0;assert((await fail(h,scan,scopes)).ok);db=await h.pageB.getDatabase();assert(db.providers.kobo.syncState.listingIncomplete);if(production)assert.equal(catalogWrites,0,'Identical recovery state uses a status-only receipt');
 await h.pageA.restoreDatabase(parseBackup(createBackup(db)));const s=await begin(h);assert(s.syncState.listingIncomplete);if(scopes.length)assert(!(await commit(h,s)).ok);assert((await commit(h,s,full(scopes))).ok);db=await h.pageB.getDatabase();assert.equal(Boolean(db.providers.kobo.syncState?.listingIncomplete),false);assert.deepEqual(db.providers.kobo.syncState.pendingKoboScopes??[],[]);
},{storageEvents:production,concurrentQueries:production}));
for(const production of [false,true])test(`Kobo failed-Full guards and rejected recovery write (${production})`,()=>withWorker(async h=>{
 assert((await commit(h,await begin(h))).ok);const before=await h.pageA.getDatabase(),old=await begin(h),scan=await begin(h);
 for(const [s,from]of [[old,sender],[scan,{...sender,tab:{id:99}}],[scan,{...sender,url:'https://foreign.invalid/'}]]){await fail(h,s,['archive'],from);assert.deepEqual((await h.pageA.getDatabase()).providers.kobo.syncState,before.providers.kobo.syncState);}
 assert(!(await fail(h,scan,['foreign'])).ok);const set=h.memory.area.set;h.memory.area.set=async patch=>{if(patch.galacticLibraryDatabase)throw Error('Synthetic disk rejection');return set(patch);};
 assert(!(await fail(h,scan,['archive'])).ok,'Rejected recovery persistence must not be acknowledged');h.memory.area.set=set;const after=await h.pageB.getDatabase();assert.deepEqual(after.providerItems,before.providerItems);assert.deepEqual(after.providers.kobo.syncState,before.providers.kobo.syncState);
 assert((await fail(h,await begin(h),['archive'])).ok);const current=await h.pageA.getDatabase();await fail(h,scan,['audiobooks']);assert.deepEqual((await h.pageB.getDatabase()).providers.kobo.syncState,current.providers.kobo.syncState);
},{storageEvents:production,concurrentQueries:production}));
