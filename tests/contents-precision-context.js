import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {proposeContentsForReview,contentKey} from '../src/lib/contents.js';
import {manifestReviewProposal,selectManifest} from '../src/lib/kindle-manifest.js';
import {precisionRecord,verifySourcePaths} from './contents-precision-context-fixture.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle/contents-precision-context.json',import.meta.url),'utf8'));
const counts=[0,0,13,6,6,6,6];
export const contentsPrecisionContextTests=[
 ...fixtures.chapters.map((c,index)=>['chapter precision: '+c.title,()=>{
   const record=precisionRecord(c),source=record.metadata.enrichment.kindleProductComicContents,before=JSON.stringify(source);
   const p=manifestReviewProposal(source,c.title);
   assert.equal(p.entries.length,counts[index]);
   assert.ok(p.unparsed.some(t=>/digital|chapters?/iu.test(t)),'Unsupported digital units must remain unresolved');
   assert.equal(p.outcome,counts[index]?'partial':'failed');
   assert.ok(!p.entries.some(e=>/digital|chapter/iu.test(e.series)));
   if(index===2){assert.equal(p.entries.filter(e=>e.unitType==='annual'&&e.number==='1').length,1);assert.equal(p.entries.filter(e=>e.unitType==='issue').length,12);}
   if(index===3)assert.ok(p.entries.every(e=>e.completeness==='full'&&e.series==='Batman: White Knight Presents Harley Quinn'));
   if(index>=4)assert.deepEqual(p.entries.map(e=>e.number),Array.from({length:6},(_,n)=>String(n+(index===5?7:1))));
   assert.equal(JSON.stringify(source),before);
 }]),
 ...fixtures.sourceContext.map(c=>['source context across UI paths: '+c.title,()=>verifySourcePaths(c,assert.ok)]),
 ['chapter guard preserves print types and never inherits unsupported chapter context',()=>{
   for(const text of ['Collects Alpha digital chapters #1-3, 4-5; Beta #0, 1/2; Beta Annual #1; Beta Special #2; Beta Vol. 3.','Collects Alpha chapters 1-3, #4-5; Beta #0, 1/2; Beta Annual #1; Beta Special #2; Beta Vol. 3.']){
     const p=proposeContentsForReview(text);
     assert.deepEqual(p.entries.map(e=>[e.unitType,e.number]),[['issue','0'],['issue','1/2'],['annual','1'],['special','2'],['volume','3']]);
     assert.ok(p.unparsed.some(t=>t.includes('4-5')));
   }
   const p=proposeContentsForReview('Collects Chapterhouse #1-3; Alpha #1-2 (digital chapters #1-4); Beta #7-8.');
   assert.equal(p.entries.length,7);assert.ok(p.unparsed.includes('(digital chapters #1-4)'));
   assert.equal(proposeContentsForReview('Collects Alpha #1-6 (digital #1-12, with different contents).').entries.length,0);
 }],
 ['source context rejects substantive edits and preserves whole-manifest scope',()=>{
   const saved=selectManifest([{selector:'#description',text:'Collects issues #1-3; Beta #4-5.'}],'Alpha Vol. 1');
   assert.ok(manifestReviewProposal(saved,'Alpha Vol. 1').entries.length);
   const whole=selectManifest([{selector:'#description',text:'Collects Alpha #1-3;\nBeta #4-5.'}],'Alpha Vol. 1');
   assert.deepEqual(manifestReviewProposal(whole,'Alpha Vol. 1',whole.statement.replace(/\s+/gu,' ')),manifestReviewProposal(whole,'Alpha Vol. 1'));
   assert.equal(manifestReviewProposal(whole,'Alpha Vol. 1').manifestCoverage,'whole-clause');
   for(const edit of ['Collects issues #1-8','Collects issues #1-3; Gamma #4-5','Collects issues #1-3.']){
     const p=manifestReviewProposal(saved,'Alpha Vol. 1',edit);
     assert.equal(p.parseBinding,'explicit-statement');assert.ok(!p.entries.some(e=>e.series==='Alpha'));
   }
   assert.equal(manifestReviewProposal(undefined,'Alpha Vol. 1','Collects issues #1-3').entries.length,0);
   const c=fixtures.sourceContext[0],source=precisionRecord(c).metadata.enrichment.kindleProductComicContents;
   const edit=manifestReviewProposal(source,c.title,c.statement.replace('7-11','7-12'));
   assert.equal(edit.parseBinding,'explicit-statement');assert.notDeepEqual(edit.entries.map(contentKey),c.expected.map(contentKey));
 }]
];
