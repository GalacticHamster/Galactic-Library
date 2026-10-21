import assert from 'node:assert/strict';
import {contentsReviewSummary,relativeContentsDraft} from '../src/lib/contents-review-summary.js';
import {manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {collectionContents} from '../src/lib/inferred-coverage.js';
import {previewQuickContents} from '../src/lib/quick-contents.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {batmanReviewBook,batmanReviewStatement} from './contents-review-usability-fixture.js';
export const contentsReviewUsabilityTests=[
 ['contents review explains relative counts without changing parser or confirmed coverage',()=>{
  const book=batmanReviewBook(),db=coverageDatabase(book),before=JSON.stringify(db),proposal=manifestReviewProposal(book.metadata.enrichment.kindleProductComicContents,book.title);
  assert.equal(proposal.entries.length,0);
  const shown=contentsReviewSummary(book,proposal,null);
  assert.equal(shown.kind,'information');assert.equal(shown.statement,batmanReviewStatement);
  assert.match(shown.summary,/collects 6 issues/);assert.equal(shown.relative.text,'Batman and Robin (2009-2011) #1-6');
  const draft=previewQuickContents(shown.relative.text);assert.equal(draft.entries.length,6);assert.ok(draft.entries.every(e=>e.series==='Batman and Robin'&&e.run==='2009-2011'));
  assert.equal(collectionContents(book,db).entries.length,0);assert.equal(JSON.stringify(db),before);
 }],
 ['relative count drafts require unambiguous existing series context and preserve collected volume separation',()=>{
  for(const book of [{title:'Collected Adventures Omnibus',metadata:{}},{title:'Batman and Robin Vol. 1',metadata:{series:['Batman','Robin']}},{title:'Batman Vol. 1',metadata:{series:['Superman']}}]){
   const draft=relativeContentsDraft(book,batmanReviewStatement);assert.equal(draft.text,'');assert.match(contentsReviewSummary(book,{manifestEvidence:batmanReviewStatement,entries:[]},null).summary,/does not establish one comic series/);
  }
  assert.equal(relativeContentsDraft({title:'Batman Vol. 7'},'Includes the first 0 issues of the series'),null);
  assert.equal(relativeContentsDraft({title:'Batman Vol. 7'},'Collects Batman #1-6 and the first six issues of the hit series'),null);
  assert.equal(relativeContentsDraft({title:'Batman Vol. 7'},batmanReviewStatement).text,'Batman #1-6');
 }],
 ['queue distinguishes useful contents suggestions, information gaps and changed reviews using the editor summary',()=>{
  const a=batmanReviewBook(),b=coverageBook('review-ready'),c=coverageBook('review-changed'),db=coverageDatabase(a,b,c);
  db.contentReviews[c.id]=confirmed([issue()]);
  const rows=enrichmentWorkbenchRows(db,{includeMissing:false});assert.deepEqual(rows.map(r=>r.contentsState),['information','suggestions','changed']);
  for(const book of [a,b,c]){const p=manifestReviewProposal(book.metadata.enrichment.kindleProductComicContents,book.title),expected=contentsReviewSummary(book,p,db.contentReviews[book.id]);assert.ok(rows.find(r=>r.recordRefs.includes(book.recordRef)).reason.startsWith(expected.summary));}
  assert.equal(contentsReviewSummary({title:'No source',metadata:{}},null,null).kind,'information');
 }],
 ['confirmed corrections and rejection retain separate source evidence across backup and reload',()=>{
  const book=batmanReviewBook(),db=coverageDatabase(book),source=structuredClone(book.metadata);
  db.contentReviews[book.id]=confirmed(previewQuickContents(relativeContentsDraft(book,batmanReviewStatement).text).entries);
  let restored=parseBackup(createBackup(db));assert.equal(restored.contentReviews[book.id].entries.length,6);assert.deepEqual(restored.providerItems[book.id].metadata,source);
  db.contentReviews[book.id]=confirmed([],'rejected');restored=parseBackup(createBackup(db));assert.equal(collectionContents(restored.providerItems[book.id],restored).entries.length,0);assert.equal(restored.contentReviews[book.id].status,'rejected');
 }]
];
