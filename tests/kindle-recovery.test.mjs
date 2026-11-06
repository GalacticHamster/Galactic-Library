import assert from 'node:assert/strict';import {test} from 'node:test';
import {kindleWorker,kindleBook,kindlePayload,kindleSender} from './kindle-recovery.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
const records=db=>Object.values(db.providerItems).filter(i=>i.provider==='kindle');
const save=async h=>{const a=await h.acquire();const c=await h.commit(a);assert(c.result.ok,c.result.error);return a;};
for(const badIndex of [0,249,499])test(`Kindle partial 499/500 at position ${badIndex} saves peers and retries with Full`,()=>kindleWorker(async h=>{
 const books=Array.from({length:500},(_,i)=>kindleBook(i+1));delete books[badIndex].title;h.setBooks(books);const a=await save(h);assert.equal(a.result.items.length,499);assert.equal(a.result.snapshot.complete,false);let db=await h.pageA.getDatabase();assert.equal(records(db).length,499);assert(db.providers.kindle.syncState.listingIncomplete);assert(!db.providers.kindle.fullSyncAt);assert(records(db).every(i=>i.ownership==='owned'));await h.pageA.restoreDatabase(parseBackup(createBackup(db)));
 books[badIndex]=kindleBook(badIndex+1);h.setBooks(books);h.requests.length=0;const q=await h.acquire('incremental');assert(q.full);assert.equal(h.requests.length,6);assert((await h.commit(q)).result.ok);db=await h.pageB.getDatabase();assert.equal(records(db).length,500);assert(!db.providers.kindle.syncState.listingIncomplete);assert(db.providers.kindle.fullSyncAt);
 const writes=h.memory.commits.length;h.requests.length=0;const unchanged=await h.acquire('incremental');assert(!unchanged.full);assert.equal(unchanged.result.items.length,0);assert((await h.commit(unchanged)).result.ok);assert.equal(h.requests.length,2);assert.equal(h.memory.commits.length,writes);
}));
for(const status of [429,500,502,503])test(`Kindle later HTTP ${status} retains 100 and withholds completeness`,()=>kindleWorker(async h=>{
 const books=Array.from({length:101},(_,i)=>kindleBook(i+1));h.setReply(input=>input.contentType==='KindlePDoc'?{ok:true,json:async()=>kindlePayload([],0)}:input.fetchCriteria.startIndex?{ok:false,status}:{ok:true,json:async()=>kindlePayload(books.slice(0,100),101)});const a=await save(h);assert.equal(a.result.items.length,100);assert(a.result.incomplete);assert.equal(a.result.snapshot.recovery.failedPages,1);const db=await h.pageA.getDatabase();assert.equal(records(db).length,100);assert(!db.providers.kindle.fullSyncAt);
}));
for(const status of [401,403])for(const later of [false,true])test(`Kindle HTTP ${status}, later=${later}, remains fatal`,()=>kindleWorker(async h=>{
 h.setReply(input=>later&&!input.fetchCriteria.startIndex?{ok:true,json:async()=>kindlePayload(Array.from({length:100},(_,i)=>kindleBook(i+1)),101)}:{ok:false,status});await assert.rejects(h.acquire(),new RegExp(String(status)));assert.equal(records(await h.pageA.getDatabase()).length,0);
}));
test('Kindle transport failure preserves peers; first-page and invalid outer scope remain fatal',()=>kindleWorker(async h=>{
 const books=Array.from({length:100},(_,i)=>kindleBook(i+1));h.setReply(input=>{if(input.contentType==='KindlePDoc')return {ok:true,json:async()=>kindlePayload([],0)};if(input.fetchCriteria.startIndex)throw Error('Synthetic timeout');return {ok:true,json:async()=>kindlePayload(books,101)};});assert.equal((await save(h)).result.items.length,100);
 for(const body of [null,{success:true,GetContentOwnershipData:{items:{bad:true}}}]){h.setReply(()=>({ok:true,json:async()=>body}));await assert.rejects(h.acquire(),/unreadable Kindle/u);}
 h.setReply(()=>{throw Error('Synthetic timeout');});await assert.rejects(h.acquire(),/timeout/);
}));
test('Kindle malformed rows and metadata cannot invalidate independent peers',()=>kindleWorker(async h=>{
 for(const patch of [{title:''},{title:'!!! 🎮'},{asin:null,contentId:null,id:null},{asin:'https://secret.invalid/'},{title:'a'.repeat(501)},{acquiredDate:'not-a-date'},{originType:{token:'secret'}},{contentType:['Movie']},{isbn:'0'.repeat(100)},{authors:['a'.repeat(501)]}]){
 h.setBooks([kindleBook(1),kindleBook(2,patch)]);const a=await h.acquire();assert.equal(a.result.items.length,1,JSON.stringify(patch));assert.equal(a.result.snapshot.recovery.failedItems,1);assert((await h.commit(a)).result.ok);
 }
}));
test('Kindle duplicate identity conflicts are quarantined rather than choosing ownership',()=>kindleWorker(async h=>{
 h.setBooks([kindleBook(1),kindleBook(1),kindleBook(2)]);let a=await save(h);assert(!a.result.incomplete);assert.equal(a.result.items.length,2);assert.equal(a.result.snapshot.scopes[0].duplicateCount,1);
 h.setBooks([kindleBook(1),kindleBook(1,{originType:'KindleUnlimited'}),kindleBook(2)]);a=await save(h);assert(a.result.incomplete);assert.equal(a.result.items.length,1);assert.equal(a.result.items[0].providerItemId,kindleBook(2).asin);assert.equal(records(await h.pageA.getDatabase()).find(i=>i.providerItemId===kindleBook(1).asin).ownership,'owned');
}));
test('Kindle changing totals or session are fatal; ambiguous empty/duplicate pages never replace',()=>kindleWorker(async h=>{
 const rows=Array.from({length:100},(_,i)=>kindleBook(i+1));h.setReply((input,change)=>{change();return {ok:true,json:async()=>kindlePayload(rows,101)};});await assert.rejects(h.acquire(),/session changed/);
}));
test('Kindle missing later range and repeated page cannot retire prior records',()=>kindleWorker(async h=>{
 await save(h);const old=await h.pageA.getDatabase();let first=true;h.setReply(input=>input.contentType==='KindlePDoc'?{ok:true,json:async()=>kindlePayload([],0)}:{ok:true,json:async()=>kindlePayload((first?(first=false,[kindleBook(2)]):[]),1000)});const a=await save(h);assert(a.result.incomplete);const db=await h.pageA.getDatabase();assert.equal(records(db).length,2);assert.deepEqual(db.providerHistory,old.providerHistory);assert.equal(db.providers.kindle.fullSyncAt,old.providers.kindle.fullSyncAt);
}));
test('Kindle unreported short response is additive, with no false Full or repeated Full requirement',()=>kindleWorker(async h=>{
 h.setReply(input=>({ok:true,json:async()=>kindlePayload(input.contentType==='Ebook'?[kindleBook(1)]:[],null)}));const a=await save(h);assert(a.result.coverageUnverified);assert(!a.result.incomplete);let db=await h.pageA.getDatabase();assert(!db.providers.kindle.fullSyncAt);assert(db.providers.kindle.syncState.acquisitionCheckedAt);const q=await h.acquire('incremental');assert(!q.full);assert.equal(q.result.items.length,0);assert((await h.commit(q)).result.ok);
}));
test('Kindle mixed access, dates, editions, historical records, reviews and other providers survive partial save',()=>kindleWorker(async h=>{
 const books=['Purchase','KindleUnlimited','Prime','PersonalLending','Sample','Comixology'].map((originType,i)=>kindleBook(i+1,{originType,edition:i===0?'First':'Second',authors:['Synthetic author'],isbn:'9780306406157'}));h.setBooks(books);h.setDocuments([kindleBook(7,{originType:'PersonalDocument',contentType:'KindlePDoc'})]);await save(h);let db=await h.pageA.getDatabase();const purchased=records(db).find(i=>i.providerItemId===kindleBook(1).asin);await h.pageA.saveOwnershipReview(purchased.recordRef,{ownership:'unknown',note:'Keep my correction',evidenceDate:'2026-11-01'});await h.pageA.mergeProviderItems('kobo',[{providerItemId:'other',title:'Other Kobo',mediaType:'book',ownership:'owned'}]);await h.pageA.mergeProviderItems('audible',[{providerItemId:'B999999999',title:'Other Audible',mediaType:'audiobook',ownership:'owned'}]);
 db=await h.pageA.getDatabase();const before=parseBackup(createBackup(db));h.setBooks([books[0],kindleBook(8,{title:''})]);await save(h);db=await h.pageB.getDatabase();assert.equal(records(db).length,7);assert.deepEqual(db.providerHistory,before.providerHistory);assert.deepEqual(db.ownershipReviews,before.ownershipReviews);assert.equal(effectiveOwnershipRecord(records(db).find(i=>i.recordRef===purchased.recordRef),db).ownership,'unknown');assert.deepEqual(Object.values(db.providerItems).filter(i=>i.provider!=='kindle'),Object.values(before.providerItems).filter(i=>i.provider!=='kindle'));
 assert.deepEqual(records(db).map(i=>i.ownership).sort(),['owned','owned','subscription','subscription','borrowed','unknown','unknown'].sort());assert.equal(purchased.acquiredAt,'2023-06-07T00:00:00.000Z');assert.equal(purchased.metadata.isbn[0],'9780306406157');
 assert(!handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Unrelated synthetic',mediaType:'book'}]}).results[0].owned);
}));
test('Kindle quota/disk failures preserve catalogs and recovery remains retryable',()=>kindleWorker(async h=>{
 await save(h);const before=await h.pageA.getDatabase();h.setBooks([kindleBook(1),kindleBook(2),kindleBook(3,{title:''})]);const set=h.memory.area.set;
 for(const reason of ['Quota exceeded','Disk rejected']){const a=await h.acquire();h.memory.area.set=async patch=>{if(patch.galacticLibraryDatabase)throw Error(reason);return set(patch);};assert(!(await h.commit(a)).result.ok);h.memory.area.set=set;const after=await h.pageA.getDatabase();assert.deepEqual(after.providerItems,before.providerItems);assert.deepEqual(after.providerHistory,before.providerHistory);assert.deepEqual(after.providers.kindle.syncState,before.providers.kindle.syncState);}
 assert((await h.commit(await h.acquire())).result.ok);assert.equal(records(await h.pageA.getDatabase()).length,2);
}));
test('Kindle partial receipts retain lease, origin, account and snapshot guards',()=>kindleWorker(async h=>{
 h.setBooks([kindleBook(1),kindleBook(2,{title:''})]);const stale=await h.acquire(),a=await h.acquire();assert(!(await h.commit(stale)).result.ok);
 const b=structuredClone(a);b.result.snapshot.recovery.failedItems=-1;assert(!(await h.commit(b)).result.ok);const c=await h.commit(a);assert(c.result.ok,c.result.error);const replay=await h.dispatch(c.request,kindleSender);assert(replay.ok||/superseded|completed/.test(replay.error));assert.equal(records(await h.pageA.getDatabase()).length,1);
 assert(!(await h.dispatch({type:'VALIDATE_KINDLE_ITEMS',items:[]},{...kindleSender,url:'https://foreign.invalid/'})).ok);
 const wrong=await h.dispatch({...c.request,scanToken:'wrong'},kindleSender);assert(!wrong.ok);
}));
test('Kindle unknown entitlement cannot erase existing purchase evidence or fabricate document ownership',()=>kindleWorker(async h=>{
 await save(h);const before=records(await h.pageA.getDatabase())[0];h.setBooks([kindleBook(1,{originType:'Unrecognized',acquiredDate:null}),kindleBook(2,{originType:'Unrecognized'}),kindleBook(3,{title:''})]);h.setDocuments([kindleBook(4,{originType:'Purchase',contentType:'KindlePDoc'})]);await save(h);const db=await h.pageA.getDatabase(),saved=records(db);assert.equal(saved.find(i=>i.providerItemId===kindleBook(1).asin).ownership,'owned');assert.equal(saved.find(i=>i.providerItemId===kindleBook(1).asin).metadata.originType,'Purchase');assert.equal(saved.find(i=>i.providerItemId===kindleBook(1).asin).acquiredAt,before.acquiredAt);assert.equal(saved.find(i=>i.providerItemId===kindleBook(2).asin).ownership,'unknown');assert(!saved.some(i=>i.providerItemId===kindleBook(4).asin));
}));
test('Kindle repeated pages and safety bound preserve prefix without full authority',()=>kindleWorker(async h=>{
 const rows=Array.from({length:100},(_,i)=>kindleBook(i+1));h.setReply(input=>({ok:true,json:async()=>kindlePayload(input.contentType==='Ebook'?rows:[],input.contentType==='Ebook'?1000:0)}));const a=await save(h);assert(a.result.incomplete);assert.equal(a.result.items.length,100);assert.equal(a.result.snapshot.recovery.failedPages,1);assert.equal(h.requests.length,3);assert(!a.result.snapshot.complete);
}));
test('Kindle wrong selected profile and forged entitlement/section counts cannot commit',()=>kindleWorker(async h=>{
 h.setBooks([kindleBook(1),kindleBook(2,{title:''})]);const a=await h.acquire();const wrong=await h.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'kindle',mode:'full',beginScan:true,confirmed:true,profileId:'00000000-0000-4000-8000-000000000000'},kindleSender);assert(!wrong.ok);
 for(const mutate of [r=>r.items[0].ownership='subscription',r=>r.snapshot.scopes[0].readCount=0,r=>r.snapshot.scopes[1].id='books',r=>r.snapshot.itemCount++,r=>r.snapshot.recovery.coverageUnverified='yes']){const b=structuredClone(a);mutate(b.result);assert(!(await h.commit(b)).result.ok);}
 assert((await h.commit(a)).result.ok);
}));
test('Kindle existing 500-page limit produces bounded incomplete evidence',()=>kindleWorker(async h=>{
 h.setReply(input=>({ok:true,json:async()=>kindlePayload(input.contentType==='Ebook'?[kindleBook(input.fetchCriteria.startIndex+1)]:[],input.contentType==='Ebook'?100000:0)}));const a=await h.acquire();assert.equal(a.result.items.length,500);assert.equal(a.result.snapshot.scopes[0].pagesRead,500);assert(a.result.snapshot.scopes[0].limitReached);assert((await h.commit(a)).result.ok);assert(!(await h.pageA.getDatabase()).providers.kindle.fullSyncAt);
}));
test('Kindle contradictory purchase/subscription/sample evidence is isolated without promoting ownership',()=>kindleWorker(async h=>{
 for(const patch of [{sourceType:'Prime'},{ownershipType:'KindleUnlimited'},{contentType:'Sample'},{contentType:'KindlePDoc'},{contentType:'Movie'}]){h.setBooks([kindleBook(1),kindleBook(2,patch)]);const a=await h.acquire();assert.equal(a.result.items.length,1);assert(a.result.incomplete);assert((await h.commit(a)).result.ok);}
}));
