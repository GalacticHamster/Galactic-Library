import assert from 'node:assert/strict';
import {highConfidenceGoogleBooksCandidate} from '../src/lib/google-books.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {enrichmentQuery,enrichmentStages} from '../src/lib/enrichment.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';

export const enrichmentTests=[['Google Books rejects different, missing and ambiguous volume/edition evidence',()=>{
  const query={title:'Saga (Vol. 1)',authors:['Writer']};
  const candidate={volumeId:'one',title:'Saga',subtitle:'Vol. 1',authors:['Writer']};
  assert.equal(highConfidenceGoogleBooksCandidate(query,[{...candidate,subtitle:'Vol. 2'}]),null);
  assert.equal(highConfidenceGoogleBooksCandidate(query,[{...candidate,subtitle:''}]),null);
  assert.equal(highConfidenceGoogleBooksCandidate({title:'Saga Vol. 1',authors:['Writer']},[{...candidate,title:'Saga Vol. 1',subtitle:''}])?.volumeId,'one');
  const first={volumeId:'one',title:'Saga Vol. 1',authors:['Writer']};
  assert.equal(highConfidenceGoogleBooksCandidate({title:first.title,authors:['Writer']},[first,{...first,volumeId:'two',isbn:['9780140328721']}]),null);
  assert.equal(highConfidenceGoogleBooksCandidate({title:'Saga Deluxe Vol. 1',authors:['Writer']},[first]),null);
  assert.equal(highConfidenceGoogleBooksCandidate({title:'Saga Vol. 1',isbn:['9780140328721']},[{...first,isbn:['9780140328721'],title:'Saga Vol. 2'}]),null);
}],['authorless and genre-only books stay eligible; approved work evidence improves searches without supplying edition ISBNs',async()=>{
  const stored={};const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async updates=>Object.assign(stored,structuredClone(updates))});
  await writer.mergeProviderItems('humble',[{providerItemId:'comic',title:'Saga Vol. 1',mediaType:'book'}]);
  await writer.saveGoogleBooksGenreHints([{itemIds:['humble:comic'],hint:{source:'google-books',confidence:'author-and-title-stem',candidateVolumeId:'series',candidateTitle:'Saga',categories:['Manga']}}]);
  assert.equal((await writer.startGoogleBooksEnrichmentJob()).queue.length,1);
  await writer.saveOpenLibraryEnrichment(['humble:comic'],{source:'open-library',workKey:'/works/OL1W',authors:['Writer'],publishers:['Publisher'],isbn:['9780140328721'],approved:true,matchBasis:'user-selected-work'});
  const database=await writer.getDatabase();const record=database.providerItems['humble:comic'];
  const query=enrichmentQuery({title:record.title},[record]);assert.deepEqual(query.authors,['Writer']);assert.equal(query.publisher,'Publisher');assert.deepEqual(query.isbn,[]);
  const stages=enrichmentStages([record],database);assert.equal(stages.genre,true);assert.equal(stages.work,true);assert.equal(stages.edition,false);assert.equal(stages.contents,false);
}],['candidate review and source selections survive backups, undo restores prior fields and stale references fail closed',async()=>{
  const stored={};const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async updates=>Object.assign(stored,structuredClone(updates))});
  await writer.mergeProviderItems('humble',[{providerItemId:'comic',title:'Saga Vol. 1',mediaType:'book'}]);let database=await writer.getDatabase();const record=database.providerItems['humble:comic'];
  const candidate={source:'google-books',volumeId:'one',title:'Saga Vol. 1',authors:['Writer'],sourceUrl:'https://books.google.com/books?id=one',approved:true,matchBasis:'user-selected-edition'};
  await writer.saveEnrichmentReview({recordRefs:[record.recordRef],source:'googleBooks',status:'candidates',title:record.title,candidates:[candidate]});
  assert.equal(Object.values(parseBackup(createBackup(await writer.getDatabase())).enrichmentReviews).length,1);
  await writer.saveGoogleBooksEnrichments([{itemIds:[record.id],recordRefs:[record.recordRef],enrichment:candidate}]);
  database=await writer.getDatabase();const first=database.providerItems[record.id].metadata.enrichment.googleBooks.selectionRef;
  assert.equal(Object.keys(database.enrichmentReviews).length,0);assert.ok(database.enrichmentHistory[first]);
  await writer.saveGoogleBooksEnrichments([{itemIds:[record.id],recordRefs:[record.recordRef],enrichment:{...candidate,publisher:'Publisher'}}]);
  const current=(await writer.getDatabase()).providerItems[record.id].metadata.enrichment.googleBooks.selectionRef;
  await assert.rejects(writer.undoEnrichmentSelection(first),/no longer current/);
  await writer.restoreDatabase(parseBackup(createBackup(await writer.getDatabase())));await writer.undoEnrichmentSelection(current);
  assert.equal((await writer.getDatabase()).providerItems[record.id].metadata.enrichment.googleBooks.publisher,undefined);
  await writer.undoEnrichmentSelection(first);assert.equal((await writer.getDatabase()).providerItems[record.id].metadata.enrichment?.googleBooks,undefined);
  await assert.rejects(writer.saveGoogleBooksEnrichments([{itemIds:[record.id],recordRefs:[crypto.randomUUID()],enrichment:candidate}]),/changed during enrichment/);
}],['enrichment leases isolate options pages and batch five selections into one atomic checkpoint',async()=>{
  const stored={};const writes=[];const area={get:async defaults=>structuredClone({...defaults,...stored}),set:async updates=>{writes.push(structuredClone(updates));Object.assign(stored,structuredClone(updates));}};
  let writer=createStorageWriter(area);await writer.mergeProviderItems('humble',Array.from({length:6},(_,index)=>({providerItemId:`book-${index}`,title:`Manga Vol. ${index+1}`,mediaType:'book',metadata:{authors:['Writer']}})));
  let job=await writer.startGoogleBooksEnrichmentJob();job=await writer.acquireEnrichmentRun(job.jobId);await assert.rejects(writer.acquireEnrichmentRun(job.jobId),/Another options page/);
  await assert.rejects(writer.startGoogleBooksEnrichmentJob(),/Another options page/);await assert.rejects(writer.clearGoogleBooksEnrichmentJob(),/Pause/);
  writer=createStorageWriter(area);const database=await writer.getDatabase();const byRef=new Map(Object.values(database.providerItems).map(item=>[item.recordRef,item]));
  const outcomes=job.queue.slice(0,5).map(id=>{const records=job.targets[id].map(ref=>byRef.get(ref));return {canonicalId:id,enrichment:{source:'google-books',volumeId:`volume-${id}`,title:records[0].title,authors:['Writer']},recordObservations:records.map(record=>({ref:record.recordRef,observedAt:record.observedAt,title:record.title}))};});
  const before=writes.length;const committed=await writer.commitEnrichmentBatch(job.jobId,job.runId,0,outcomes);assert.equal(writes.length-before,1);assert.equal(committed.job.cursor,5);assert.equal(committed.job.matched,5);
  await assert.rejects(writer.commitEnrichmentBatch(job.jobId,job.runId,0,outcomes),/stale enrichment checkpoint/);
  const restored=await writer.getDatabase();await writer.restoreDatabase(restored);await assert.rejects(writer.commitEnrichmentBatch(job.jobId,job.runId,5,[]),/cleared, restored/);
}]];
