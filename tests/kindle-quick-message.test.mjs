import assert from 'node:assert/strict';
import {test} from 'node:test';
import {kindleWorker,kindleBook} from './kindle-recovery.js';

test('Kindle runtime returns committed additions and unchanged counts for Quick message',()=>kindleWorker(async h=>{
 let a=await h.acquire(),saved=await h.commit(a);assert(saved.result.ok,saved.result.error);assert.equal(saved.result.changes.added,1);
 h.setBooks([kindleBook(2),kindleBook(1)]);a=await h.acquire('incremental');saved=await h.commit(a);assert(saved.result.ok,saved.result.error);assert.equal(saved.result.bookCount,2);assert.equal(saved.result.changes.added,1);assert.equal(saved.result.changes.updated??0,0);
 a=await h.acquire('incremental');saved=await h.commit(a);assert(saved.result.ok,saved.result.error);assert.equal(saved.result.changes.added,0);assert.equal(saved.result.changes.updated??0,0);assert.equal(saved.result.bookCount,2);
}));

test('Kindle normal Quick continues to skip existing titles rather than refreshing their metadata',()=>kindleWorker(async h=>{
 let a=await h.acquire();assert((await h.commit(a)).result.ok);
 h.setBooks([kindleBook(1,{title:'Changed provider metadata'})]);
 a=await h.acquire('incremental');assert.equal(a.result.items.length,0);const saved=await h.commit(a);assert(saved.result.ok,saved.result.error);assert.equal(saved.result.changes.added,0);assert.equal(saved.result.bookCount,1);
 assert.equal(Object.values((await h.pageB.getDatabase()).providerItems).find(i=>i.provider==='kindle').title,'Synthetic Kindle 1');
}));

test('Kindle established Quick still reads 200 book rows and 100 personal documents in the representative stopping case',()=>kindleWorker(async h=>{
 const books=Array.from({length:3200},(_,i)=>kindleBook(i+1)),docs=Array.from({length:128},(_,i)=>kindleBook(4000+i,{originType:'PersonalDocument'}));
 h.setBooks(books);h.setDocuments(docs);assert((await h.commit(await h.acquire())).result.ok);
 h.setBooks([kindleBook(9001),kindleBook(9002),...books]);h.requests.length=0;
 const a=await h.acquire('incremental');assert(!a.full);assert.equal(a.result.items.length,2);assert.equal(a.result.diagnostics.books.rawCount,200);assert.equal(a.result.diagnostics['personal-documents'].rawCount,100);
 assert.deepEqual(h.requests.map(r=>[r.contentType,r.fetchCriteria.startIndex]),[['Ebook',0],['Ebook',100],['KindlePDoc',0]]);
 assert.deepEqual(a.result.diagnostics.books,{reportedCount:3202,rawCount:200,readableCount:200,duplicateCount:0,pagesRead:2,failedItems:0,failedPages:0,limitReached:false,complete:false});
 const saved=await h.commit(a);assert(saved.result.ok,saved.result.error);assert.equal(saved.result.changes.added,2);assert.equal(saved.result.bookCount,3330);
}));
