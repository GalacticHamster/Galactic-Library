import assert from 'node:assert/strict';
import {checkQuickContentsExamples} from './quick-contents-fixture.js';
import {previewQuickContents,quickContentsToAppend} from '../src/lib/quick-contents.js';
import {coverageBook,coverageDatabase,confirmed} from './inferred-coverage-fixture.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
export const quickContentsTests=[
 ['quick contents examples preserve ranges, series, types, years, partial extent and unsupported input',checkQuickContentsExamples],
 ['quick draft appends distinguish runs/types/extents and enforce review limits',()=>{
   const first=previewQuickContents('Alpha (2001) #1').entries,others=previewQuickContents('Alpha (2010) #1; Alpha Annual #1; material from Alpha (2001) #1').entries;
   assert.equal(quickContentsToAppend(first,others).length,3);assert.equal(quickContentsToAppend(first,first).length,0);
   assert.throws(()=>previewQuickContents('x'.repeat(10001)),/10,000/);
   assert.throws(()=>quickContentsToAppend(Array.from({length:2000},()=>({series:''})),first),/2,000/);
   const ambiguous=previewQuickContents('Alpha (1963) #1; Alpha (1999) #1; Alpha Annual (2000) #1');assert(ambiguous.annualRunHints.some(h=>!h.resolvedRun));assert.equal(ambiguous.entries.at(-1).run,'');
 }],
 ['quick drafts affect Sandman coverage only after review save and survive backup without changing sources',async()=>{
   const book=coverageBook('sandman','',{title:'The Sandman Vol. 1'}),existing=coverageBook('existing','Collects Alpha #1'),db=coverageDatabase(book,existing),data={},writer=createStorageWriter({get:async defaults=>({...defaults,...data}),set:async values=>Object.assign(data,structuredClone(values))});await writer.restoreDatabase(db);
   const original=await writer.getDatabase(),source=JSON.stringify(original.providerItems),entries=previewQuickContents('The Sandman #1-8').entries;
   assert(!comicCoverageForLibrary(original).groups.some(g=>g.series==='The Sandman'));assert.deepEqual(await writer.getDatabase(),original);
   await writer.saveContentReview(book.id,{entries,statement:'Manually entered contents:\nThe Sandman #1-8',source:'manual-review'});
   const saved=await writer.getDatabase(),group=comicCoverageForLibrary(saved).groups.find(g=>g.series==='The Sandman');assert.equal(group.covered,8);assert(group.issues.every(i=>!i.partial&&i.copies===1&&i.confidence==='verified'));assert.deepEqual(group.issues.map(i=>i.number),['1','2','3','4','5','6','7','8']);assert.equal(JSON.stringify(saved.providerItems),source);
   const restored=parseBackup(createBackup(saved));assert.deepEqual(restored.contentReviews,saved.contentReviews);assert.equal(comicCoverageForLibrary(restored).groups.find(g=>g.series==='The Sandman').covered,8);
   saved.providerItems[book.id].ownership='borrowed';assert(!comicCoverageForLibrary(saved).groups.some(g=>g.series==='The Sandman'));
   saved.contentReviews[existing.id]=confirmed(previewQuickContents('Alpha #1').entries);assert.equal(saved.contentReviews[existing.id].entries.length,1);
 }]
];
