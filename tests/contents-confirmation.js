import assert from 'node:assert/strict';
import {contentsConfirmation,contentsConfirmationToken} from '../src/lib/contents-confirmation.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {batmanReviewBook} from './contents-review-usability-fixture.js';
import {performanceWriter} from './provider-performance-fixture.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';
import {REVIEW_LABELS,REVIEW_TASKS,reviewCategory,reviewTaskForCategory,reviewWorkflowCounts} from '../src/ui/review-workflow.js';
import {selectManifest,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {libraryContentCoverage} from '../src/lib/inferred-coverage.js';
const requests=async db=>Promise.all(Object.values(db.providerItems).map(async r=>({itemId:r.id,recordRef:r.recordRef,token:await contentsConfirmationToken(r),confirmed:true})));
export const contentsConfirmationTests=[
 ['quick contents: one and multiple explicit lists use detailed validation and one atomic save',async()=>{
  for(const count of [1,3]){
   const h=performanceWriter(coverageDatabase(...Array.from({length:count},(_,n)=>coverageBook('quick-'+n))));
   const db=await h.writer.execute('getDatabase'),before=structuredClone(db),q=await requests(db),writes=h.counts.databaseWrites;
   const result=await h.writer.execute('confirmContentsSuggestions',[q]);assert.equal(h.counts.databaseWrites-writes,1);assert.equal(result.results.filter(r=>r.status==='confirmed').length,count);
   for(const r of Object.values(db.providerItems)){const review=result.database.contentReviews[r.id];assert.equal(review.entries.length,3);assert.equal(review.source,'manual-review');assert.ok(review.sourceBaseline);}
   assert.deepEqual(result.database.providerItems,before.providerItems);assert.deepEqual(result.database.ownershipReviews,before.ownershipReviews);
   const reload=await performanceWriter(null,{stored:h.stored}).writer.execute('getDatabase');assert.deepEqual(reload.contentReviews,result.database.contentReviews);
   assert.deepEqual(parseBackup(createBackup(reload)).contentReviews,reload.contentReviews);
  }
 }],
 ['quick contents: ambiguous, relative, unresolved, incomplete, supplementary and excerpt proposals require details',()=>{
  const books=[batmanReviewBook(),coverageBook('unresolved','Collects Alpha (2001) #1-3; bonus essays'),coverageBook('runless','Collects Alpha #1-3'),coverageBook('excerpt','Collects material from Alpha (2001) #1-3'),coverageBook('named','Collects The Silent Story')];
  const incomplete=coverageBook('incomplete');incomplete.metadata.enrichment.kindleProductComicContents.descriptionMayBeIncomplete=true;books.push(incomplete);
  for(const book of books)assert.equal(contentsConfirmation(book,coverageDatabase(book)).eligible,false,book.title);
  const book=coverageBook('annotated'),db=coverageDatabase(book);db.contentReviews[book.id]=confirmed([issue('2')]);assert.equal(contentsConfirmation(book,db).eligible,false);assert.equal(db.contentReviews[book.id].entries[0].number,'2');
 }],
 ['quick contents: complete selected clauses are distinct from a page-wide Read more hint and independent claims',()=>{
  const book=coverageBook('whole-clause'),saved=selectManifest([{selector:'#description',text:'A collected edition. Collects Alpha (2001) #1-3. Read more'}],book.title);
  book.metadata.enrichment.kindleProductComicContents={...saved,descriptionMayBeIncomplete:true};
  assert.equal(saved.manifest.descriptionMayBeIncomplete,true);assert.equal(contentsConfirmation(book,coverageDatabase(book)).eligible,true);
  const proposal=manifestReviewProposal(book.metadata.enrichment.kindleProductComicContents,book.title);
  assert.equal(contentsConfirmation(book,coverageDatabase(book),{...proposal,supportingStatements:['An additional story']}).eligible,false);
  assert.equal(contentsConfirmation(book,coverageDatabase(book),{...proposal,manifestCoverage:'bounded'}).eligible,false);
  const mixed=selectManifest([{selector:'#description',text:'Collects Alpha (2001) #1-3.'},{selector:'#other',text:'Collects Beta (2002) #1-2.'}],book.title);
  book.metadata.enrichment.kindleProductComicContents=mixed;assert.equal(contentsConfirmation(book,coverageDatabase(book)).eligible,false);
 }],
 ['quick contents confirmation never converts unknown, borrowed or subscription access to owned coverage',async()=>{
  for(const ownership of ['unknown','borrowed','subscription']){
   const h=performanceWriter(coverageDatabase(coverageBook('access-'+ownership,undefined,{ownership}))),db=await h.writer.execute('getDatabase');
   const result=await h.writer.execute('confirmContentsSuggestions',[await requests(db)]);assert.equal(result.results[0].status,'confirmed');
   const record=Object.values(result.database.providerItems)[0];assert.equal(record.ownership,ownership);assert.equal(libraryContentCoverage(result.database,[issue()]).owned,0);
  }
 }],
 ['quick contents: stale records fail separately, unchanged records commit, retry is idempotent and preserves review dates',async()=>{
  const h=performanceWriter(coverageDatabase(coverageBook('good'),coverageBook('stale'))),db=await h.writer.execute('getDatabase'),q=await requests(db);
  h.stored.galacticLibraryDatabase.providerItems['kindle:stale'].metadata.enrichment.kindleProductComicContents.statement='Collects Alpha (2001) #4-6';
  let result=await h.writer.execute('confirmContentsSuggestions',[q]);assert.deepEqual(result.results.map(r=>r.status),['confirmed','failed']);assert.match(result.results[1].message,/changed/);assert.equal(Object.keys(result.database.contentReviews).length,1);
  const review=structuredClone(result.database.contentReviews['kindle:good']),writes=h.counts.databaseWrites;
  result=await h.writer.execute('confirmContentsSuggestions',[[q[0]]]);assert.equal(result.results[0].status,'already-confirmed');assert.equal(h.counts.databaseWrites,writes);assert.deepEqual(result.database.contentReviews['kindle:good'],review);
  const fresh=await requests(result.database);result=await h.writer.execute('confirmContentsSuggestions',[[fresh.find(r=>r.itemId==='kindle:stale')]]);assert.equal(result.results[0].status,'confirmed');
 }],
 ['quick contents: user corrections and wrong record/account bindings cannot be overwritten',async()=>{
  const h=performanceWriter(coverageDatabase(coverageBook('protect'),coverageBook('other'))),db=await h.writer.execute('getDatabase'),q=await requests(db);
  await h.writer.execute('saveContentReview',['kindle:protect',{entries:[issue('8')],statement:'Checked original',source:'manual-review'}]);
  const result=await h.writer.execute('confirmContentsSuggestions',[[q[0],{...q[1],recordRef:q[0].recordRef}]]).catch(error=>({error}));assert.ok(result.error);
  const corrected=await h.writer.execute('confirmContentsSuggestions',[[q[0]]]);assert.equal(corrected.results[0].status,'failed');assert.equal(corrected.database.contentReviews['kindle:protect'].entries[0].number,'8');
  const wrong=await h.writer.execute('confirmContentsSuggestions',[[{...q[1],recordRef:crypto.randomUUID()}]]);assert.equal(wrong.results[0].status,'failed');assert.ok(!wrong.database.contentReviews['kindle:other']);
  const record=db.providerItems['kindle:other'],different=contentsConfirmation(record,db).value;different.entries=[issue('9')];
  const changedList=await h.writer.execute('confirmContentsSuggestions',[[{...q[1],token:await contentsConfirmationToken(record,different)}]]);assert.equal(changedList.results[0].status,'failed');assert.ok(!changedList.database.contentReviews[record.id]);
 }],
 ['quick contents: concurrent duplicate submissions save once; storage failures do not report committed results',async()=>{
  const h=performanceWriter(coverageDatabase(coverageBook('double'))),db=await h.writer.execute('getDatabase'),q=await requests(db),writes=h.counts.databaseWrites;
  const pair=await Promise.all([h.writer.execute('confirmContentsSuggestions',[q]),h.writer.execute('confirmContentsSuggestions',[q])]);assert.deepEqual(pair.map(r=>r.results[0].status),['confirmed','already-confirmed']);assert.equal(h.counts.databaseWrites-writes,1);
  let rejectWrites=false;const broken=performanceWriter(coverageDatabase(coverageBook('failed')), {beforeSet:updates=>{if(rejectWrites&&updates.galacticLibraryDatabase)throw Error('Disposable write failure');}}),current=await broken.writer.execute('getDatabase');rejectWrites=true;
  await assert.rejects(broken.writer.execute('confirmContentsSuggestions',[await requests(current)]),/Disposable write failure/);assert.equal(Object.keys(broken.stored.galacticLibraryDatabase.contentReviews).length,0);
 }],
 ['review tasks retain every legacy category and separate book lists, optional gaps, conflicts, failures and history',()=>{
  for(const category of Object.keys(REVIEW_LABELS))assert.ok(REVIEW_TASKS[reviewTaskForCategory(category)].categories.includes(category));
  const book=coverageBook('counts'),vague=batmanReviewBook(),db=coverageDatabase(book,vague),rows=enrichmentWorkbenchRows(db,{includeMissing:false}),before=JSON.stringify(db);
  assert.deepEqual(rows.map(reviewCategory),['contents-suggestions','contents-information']);assert.equal(reviewWorkflowCounts(rows).readyBooks,1);assert.equal(reviewWorkflowCounts(rows).optionalGaps,1);assert.equal(JSON.stringify(db),before);
 }],
 ['source choice history describes restoration while undo keeps purchases and saved contents reviews',async()=>{
  const h=performanceWriter(coverageDatabase(coverageBook('history'))),db=await h.writer.execute('getDatabase'),record=db.providerItems['kindle:history'];
  const value={source:'google-books',volumeId:'example',title:record.title,authors:['Writer'],approved:true,matchBasis:'user-selected-edition'};
  await h.writer.execute('saveGoogleBooksEnrichments',[[{itemIds:[record.id],recordRefs:[record.recordRef],enrichment:value}]]);
  await h.writer.execute('saveContentReview',[record.id,{entries:[issue('2')],statement:'Checked review'}]);
  const current=await h.writer.execute('getDatabase'),rows=enrichmentWorkbenchRows(current,{includeMissing:false}),history=rows.find(r=>r.category==='undo');assert.equal(history.history.kind,'googleBooks');assert.equal(history.history.previous,false);assert.ok(!history.reason.includes('source-evidence'));assert.ok(rows.some(r=>r.category==='review-history'));
  const restored=await h.writer.execute('undoEnrichmentSelections',[[history.id]]);assert.deepEqual(restored.contentReviews,current.contentReviews);assert.equal(restored.providerItems[record.id].ownership,record.ownership);assert.ok(!restored.providerItems[record.id].metadata.enrichment.googleBooks);
 }]
];
