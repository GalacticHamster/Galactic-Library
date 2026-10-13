import {inferredCoverageCases,coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {libraryContentCoverage} from '../src/lib/inferred-coverage.js';
import assert from 'node:assert/strict';
import {validateContents} from '../src/lib/contents.js';
import {contentsSummary,contentsPage} from '../src/ui/contents-overview.js';
import {validateUiPreferences} from '../src/lib/ui-preferences.js';
import {coverageRunContextTests} from './coverage-run-context.js';
export const inferredCoverageTests=[...inferredCoverageCases,...coverageRunContextTests,
 ['rejection is explicit, searchable and persists as a contents filter without accepting invalid empty reviews',()=>{
   const a=coverageBook('status'),db=coverageDatabase(a);db.contentReviews[a.id]=confirmed([],'rejected');
   const row=contentsSummary(a,db);assert.equal(row.status,'rejected');assert.equal(row.needsReview,false);
   assert.equal(contentsPage([row],{status:'rejected'}).total,1);
   assert.equal(validateUiPreferences({contents:{status:'rejected'}}).contents.status,'rejected');
   assert.throws(()=>confirmed([]));assert.throws(()=>confirmed([issue()],'rejected'));assert.throws(()=>confirmed([issue()],'other'));
   assert.throws(()=>validateContents([{...issue(),unitType:'chapter'}]));
 }],
 ['writer saves rejection atomically and preserves it through reimport and backup restore',async()=>{
   const values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
   const a=coverageBook('writer');await writer.restoreDatabase(coverageDatabase(a));
   let db=await writer.saveContentReview(a.id,confirmed([],'rejected'));
   const source=JSON.stringify(db.providerItems[a.id]);
   assert.equal(libraryContentCoverage(db,[issue()]).owned,0);
   db=await writer.mergeProviderItems('kindle',[{providerItemId:'writer',title:a.title,mediaType:'book',ownership:'owned',metadata:a.metadata}]);
   assert.equal(Object.values(db.contentReviews)[0].status,'rejected');
   assert.deepEqual(db.providerItems[a.id].metadata.enrichment,a.metadata.enrichment);
   db=await writer.restoreDatabase(parseBackup(createBackup(db)));assert.equal(db.contentReviews[a.id].status,'rejected');
   db=await writer.removeContentReview(a.id);assert.equal(libraryContentCoverage(db,[issue()]).inferred,1);
   assert(source.includes('Collects Alpha'),'Source fixture missing');
 }]
];
