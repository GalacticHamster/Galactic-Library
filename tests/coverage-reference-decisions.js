import assert from 'node:assert/strict';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {collectionContents} from '../src/lib/inferred-coverage.js';
import {dispositionReferences} from '../src/lib/coverage-disposition.js';
import {applyCoverageReferenceDecision,resolutionStamp} from '../src/lib/coverage-resolution.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {contentsSummary} from '../src/ui/contents-overview.js';
import {kindleContentsState} from '../src/lib/kindle-contents.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
export function referenceDecisionFixture(){
 const book=coverageBook('reference-dismissal','Collects Example Heroes (2020) #1-6; The Forgotten Adventure one-shot.'),other=coverageBook('reference-other','Collects Example Heroes (2020) #1-6; The Forgotten Adventure one-shot.');return {book,other,db:coverageDatabase(book,other)};
}
const rowFor=(db,book)=>comicCoverageForLibrary(db).dispositions.find(r=>r.id===book.id);
const request=(db,book,reference,reason)=>({recordRef:book.recordRef,key:reference.key,reason,expected:resolutionStamp(db.providerItems[book.id],db)});
export const coverageReferenceTests=[
 ['promotional miniseries suffix is retained but not flagged as a publication; named works stay actionable',()=>{
  const phrase='of the thrilling miniseries event presented by DC Comics and IDW Publishing.',refs=dispositionReferences({unparsed:[phrase,'The Forgotten Adventure miniseries','The Miniseries Event one-shot']});assert.equal(refs[0].actionable,false);assert.equal(refs[0].fragment,phrase);assert(refs.slice(1).every(r=>r.actionable));
  const book=coverageBook('batman-tmnt','collects all six issues '+phrase,{title:'Batman/Teenage Mutant Ninja Turtles II (2017-2018)'}),p=collectionContents(book,coverageDatabase(book));assert.equal(p.entries.length,6);assert.equal(dispositionReferences(p).filter(r=>r.actionable).length,0);
 }],
 ['reference dismissal is exact-record scoped, reversible, persistent and never verifies inferred issues',()=>{
  const {db,book,other}=referenceDecisionFixture(),before=collectionContents(book,db),row=rowFor(db,book),ref=row.references.find(r=>r.actionable);assert(ref);
  const next=applyCoverageReferenceDecision(db,request(db,book,ref,'incorrect-extraction')),after=rowFor(next,book);assert.equal(after.summary.actionable,0);assert.equal(after.summary.full,row.summary.full);assert(after.references.some(r=>r.ignored));assert.equal(rowFor(next,other).summary.actionable,rowFor(db,other).summary.actionable);
  assert.deepEqual(collectionContents(book,next).entries,before.entries);assert.equal(collectionContents(book,next).confidence,'inferred');assert.equal(kindleContentsState(book,next).reviewStatus,'unverified');assert.notEqual(contentsSummary(book,next).status,'reviewed');assert.deepEqual(next.providerItems,db.providerItems);
  const query={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Unrelated listing',mediaType:'book',contents:[issue('1',{series:'Example Heroes',run:'2020'})],contentsComplete:true}]};assert.deepEqual(handleExternalApiRequest(next,query),handleExternalApiRequest(db,query));
  const restored=parseBackup(createBackup(next));assert.equal(rowFor(restored,book).summary.actionable,0);restored.providerItems[book.id]=structuredClone(book);assert.equal(rowFor(restored,book).summary.actionable,0);
  const undo=applyCoverageReferenceDecision(restored,request(restored,book,ref,'restore'));assert.equal(rowFor(undo,book).summary.actionable,row.summary.actionable);assert.equal(undo.contentReviews[book.id],undefined);
  assert.throws(()=>applyCoverageReferenceDecision(next,request(db,book,ref,'not-included')),/changed/u);
 }],
 ['reference keys distinguish repeated references and retained decisions survive source changes without globally hiding matching text',()=>{
  const refs=dispositionReferences({unparsed:['Example one-shot','Example one-shot']});assert.notEqual(refs[0].key,refs[1].key);
  const decisions=[{key:refs[0].key,fragment:refs[0].fragment,reason:'not-included',decidedAt:null}],next=dispositionReferences({unparsed:['Example one-shot','Example one-shot']},decisions);assert(next[0].ignored);assert(next[1].actionable);
  const missing=dispositionReferences({unparsed:[]},decisions);assert(missing[0].ignored);assert.equal(missing[0].fragment,'Example one-shot');
 }],
 ['atomic reference saves preserve existing reviews and survive ordinary review save/remove and backup restore',async()=>{
  const {db,book}=referenceDecisionFixture();db.contentReviews[book.id]={...confirmed([issue('1',{series:'Example Heroes',run:'2020'})]),source:'coverage-resolution'};const previous=structuredClone(db.contentReviews[book.id]),state={};const writer=createStorageWriter({get:async d=>structuredClone({...d,...state}),set:async v=>Object.assign(state,structuredClone(v)),remove:async()=>{}});let current=await writer.restoreDatabase(db),reference=rowFor(current,book).references.find(r=>r.actionable);assert(reference);
  current=await writer.saveCoverageReferenceDecision(request(current,book,reference,'not-included'));assert.deepEqual(current.contentReviews[book.id].entries,previous.entries);assert.equal(current.contentReviews[book.id].verifiedAt,previous.verifiedAt);assert.equal(current.contentReviews[book.id].source,previous.source);
  current=await writer.saveContentReview(book.id,confirmed([issue('2',{series:'Example Heroes',run:'2020'})]));assert.equal(current.contentReviews[book.id].referenceDecisions.length,1);current=await writer.removeContentReview(book.id);assert(current.contentReviews[book.id].referenceOnly);assert.equal(collectionContents(book,current).confidence,'inferred');assert.equal(rowFor(current,book).summary.actionable,0);
  current=await writer.restoreDatabase(parseBackup(createBackup(current)));assert.equal(rowFor(current,book).summary.actionable,0);
  const stored=current.providerItems[book.id];current=await writer.mergeProviderItems(stored.provider,[{providerItemId:stored.providerItemId,title:stored.title,mediaType:stored.mediaType,ownership:stored.ownership,metadata:stored.metadata}],{profileId:stored.profileId});assert.equal(current.contentReviews[book.id].referenceDecisions.length,1);assert.equal(rowFor(current,book).summary.actionable,0);
 }]
];
