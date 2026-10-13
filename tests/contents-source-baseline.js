import assert from 'node:assert/strict';
import {contentsSourceBaseline,contentsReviewChanged,validateContentReview} from '../src/lib/contents.js';
import {coverageBook,coverageDatabase,confirmed} from './inferred-coverage-fixture.js';
import {previewQuickContents} from '../src/lib/quick-contents.js';
import {contentsSummary} from '../src/ui/contents-overview.js';
import {kindleContentsState} from '../src/lib/kindle-contents.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {selectManifest} from '../src/lib/kindle-manifest.js';
export const baselineStatements=['',"including a look at John Constantine's rough and tumble childhood and the beginnings of his unique skills.",'Collects Hellblazer #1-2; bonus essays'];
export const contentsSourceBaselineTests=[
 ['captured raw description baselines survive authoritative saves and backup restore without reusing parser selection',async()=>{
   const record=coverageBook('raw-baseline','Collects Alpha #1-3'),captured=record.metadata.enrichment.kindleProductComicContents;captured.manifest=selectManifest([{selector:'#description',text:'A collection of stories. Collects Alpha #1-3.'}],record.title).manifest;
   const data={},writer=createStorageWriter({get:async defaults=>({...defaults,...data}),set:async values=>Object.assign(data,structuredClone(values))});await writer.restoreDatabase(coverageDatabase(record));
   const saved=await writer.saveContentReview(record.id,{entries:previewQuickContents('Alpha #1-4').entries,statement:'Corrected contents',source:'manual-review'}),restored=parseBackup(createBackup(saved));assert.equal(restored.contentReviews[record.id].sourceBaseline.kind,'description');assert(!contentsReviewChanged(restored.providerItems[record.id],restored.contentReviews[record.id]));
   restored.providerItems[record.id].metadata.enrichment.kindleProductComicContents.manifest.blocks[0].text+=' Newly captured information.';assert(contentsReviewChanged(restored.providerItems[record.id],restored.contentReviews[record.id]));assert.equal(restored.contentReviews[record.id].entries.length,4);
 }],
 ['contents review establishes an authoritative baseline independently of manual draft text for empty/failed/partial sources',async()=>{
   for(const [i,statement]of baselineStatements.entries()){
     const record=coverageBook('baseline-'+i,statement,{title:'Hellblazer Collection'}),data={},writer=createStorageWriter({get:async defaults=>({...defaults,...data}),set:async values=>Object.assign(data,structuredClone(values))});await writer.restoreDatabase(coverageDatabase(record));
     const before=await writer.getDatabase(),sources=JSON.stringify(before.providerItems),entries=previewQuickContents('Hellblazer #1-8').entries;
     const saved=await writer.saveContentReview(record.id,{entries,statement:statement+'\n\nManually entered contents:\nHellblazer #1-8',sourceBaseline:{version:1,kind:'statement',text:'Caller cannot forge the baseline'},source:'manual-review'});
     assert.deepEqual(saved.contentReviews[record.id].sourceBaseline,contentsSourceBaseline(saved.providerItems[record.id]));assert.equal(JSON.stringify(saved.providerItems),sources);
     for(const db of [saved,await writer.getDatabase(),parseBackup(createBackup(saved))]){
       const current=db.providerItems[record.id],review=db.contentReviews[record.id];assert(!contentsSummary(current,db).changed);assert(!kindleContentsState(current,db).reviewChanged);assert(!enrichmentWorkbenchRows(db,{includeMissing:false}).some(row=>row.id.startsWith('contents:')));assert.equal(review.entries.length,8);
     }
     const changed=structuredClone(saved);changed.providerItems[record.id].metadata.enrichment.kindleProductComicContents.statement='Collects Hellblazer #1-9';assert(contentsSummary(changed.providerItems[record.id],changed).changed);assert(kindleContentsState(changed.providerItems[record.id],changed).reviewChanged);assert.deepEqual(changed.contentReviews,saved.contentReviews);
   }
 }],
 ['baseline tracks captured description text, not parser results, timestamps, row edits or candidate selection',()=>{
   const book=coverageBook('description','Collects Alpha #1-3');book.metadata.enrichment.kindleProductComicContents.manifest={blocks:[{text:'First description. Collects Alpha #1-3.'},{text:'Additional description.'}],candidates:[],selected:0};
   const review=validateContentReview({...confirmed(previewQuickContents('Alpha #1-3').entries),statement:'Human corrections are different',sourceBaseline:contentsSourceBaseline(book)});
   const copy=structuredClone(book),source=copy.metadata.enrichment.kindleProductComicContents;source.checkedAt='2026-10-14';source.statement='A different selected span';source.parserVersion=99;source.parseOutcome='failed';source.manifest.blocks.reverse();assert(!contentsReviewChanged(copy,review));
   source.manifest.blocks[0].text+=' Newly captured contents.';assert(contentsReviewChanged(copy,review));assert.equal(review.entries.length,3);
   assert.throws(()=>validateContentReview({...review,sourceBaseline:{version:2,kind:'statement',text:''}}),/baseline/);assert.throws(()=>validateContentReview({...review,sourceBaseline:{version:1,kind:'other',text:''}}),/baseline/);
 }],
 ['legacy manual-add prefixes and whole-manifest reviews compare safely without rewriting old reviews',()=>{
   for(const statement of baselineStatements){const book=coverageBook('legacy',statement),review=confirmed(previewQuickContents('Hellblazer #1-8').entries);review.statement=[statement,'Manually entered contents: Hellblazer #1-8'].filter(Boolean).join(' ');const before=JSON.stringify(review);assert(!contentsReviewChanged(book,review));book.metadata.enrichment.kindleProductComicContents.statement='Collects Different #1';assert(contentsReviewChanged(book,review));assert.equal(JSON.stringify(review),before);assert(!Object.hasOwn(parseBackup(createBackup(coverageDatabase(book))).contentReviews,'unrelated'));}
   const record=coverageBook('whole','Collects Alpha #1'),review=confirmed(previewQuickContents('Alpha #1').entries);record.metadata.enrichment.kindleProductComicContents.manifest={selected:0,candidates:[{block:0,raw:'Collects Alpha #1',manifestRange:{start:0,end:50}},{block:0,whole:true,raw:'Collects Alpha #1; Other #2',manifestRange:{start:0,end:50}}]};review.statement='Collects Alpha #1; Other #2';assert(!contentsReviewChanged(record,review));
   const legacy=coverageBook('legacy-backup','Collects Alpha #1'),db=coverageDatabase(legacy);db.contentReviews[legacy.id]={...review,statement:'Collects Alpha #1'};const restored=parseBackup(createBackup(db));assert(!Object.hasOwn(restored.contentReviews[legacy.id],'sourceBaseline'));assert(!contentsReviewChanged(restored.providerItems[legacy.id],restored.contentReviews[legacy.id]));
   review.statement='Collects Old #1';assert(contentsReviewChanged(record,review));
 }]
];
