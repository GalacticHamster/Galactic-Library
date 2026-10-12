import assert from 'node:assert/strict';
import {collectionOverlap,collectionOverlapAsync,overlapPairDetails} from '../src/lib/collection-overlap.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {validateUiPreferences,workspaceTarget,LIBRARY_WORKSPACES} from '../src/lib/ui-preferences.js';
import {overlapProjectionInput} from '../src/ui/collection-overlap-projection.js';
export const collectionOverlapTests=[
 ['UI worker input retains coverage results and ownership context without exporting history or sync state',()=>{
   const a=coverageBook('a'),b=coverageBook('b'),db=coverageDatabase(a,b);db.privateSecret='not a coverage input';db.enrichmentHistory={large:'not a coverage input'};
   db.providerProfiles={[a.profileId]:{id:a.profileId,provider:'kindle'}};
   const input=overlapProjectionInput(db);assert.deepEqual(collectionOverlap(input),collectionOverlap(db));assert(!('privateSecret'in input));assert(!('enrichmentHistory'in input));assert.equal(input.providerProfiles,db.providerProfiles);
 }],
 ['UI worker retains Kobo account ownership preferences and expired ownership reviews',()=>{
   const a=coverageBook('kobo',undefined,{provider:'kobo',ownership:'unknown'}),b=coverageBook('owned');
   a.metadata.ownershipBasis='library-presence-only';const db=coverageDatabase(a,b);
   db.contentReviews[a.id]=confirmed([issue()]);
   assert.equal(collectionOverlap(overlapProjectionInput(db)).pairs.length,0);
   db.providerProfiles={[a.profileId]:{provider:'kobo',assumeUnconfirmedOwned:true}};
   assert.equal(collectionOverlap(overlapProjectionInput(db)).pairs.length,1);
   db.ownershipReviews[a.recordRef]={ownership:'owned',expiresAt:'2020-01-01',source:'user',confirmedAt:'2019-01-01'};
   assert.equal(collectionOverlap(overlapProjectionInput(db)).pairs.length,0);
 }],
 ['collection pairs deduplicate issues and retain distinct comparable units and source records',()=>{
   const a=coverageBook('a','Collects Alpha (2001) #1-3'),b=coverageBook('b','Collects Alpha (2001) #3-5'),db=coverageDatabase(a,b),before=JSON.stringify(db);
   const result=collectionOverlap(db),pair=result.pairs[0],detail=overlapPairDetails(pair);
   assert.equal(result.pairs.length,1);assert.equal(pair.shared.length,1);assert.equal(detail.shared[0].entry.number,'3');assert.equal(detail.shared[0].confidence,'inferred');
   assert.equal(detail.left.unique.length,2);assert.equal(detail.right.unique.length,2);assert.equal(detail.shared[0].left.sources[0].item.recordRef,a.recordRef);assert.equal(JSON.stringify(db),before);
 }],
 ['same canonical collection observations do not generate self overlap or inflate shared counts',()=>{
   const a=coverageBook('a'),copy=coverageBook('copy'),b=coverageBook('b'),db=coverageDatabase(a,copy,b);
   db.canonicalItems={canonical:{id:'canonical',title:'Preferred collection',providerItemIds:[a.id,copy.id]}};
   const {pairs}=collectionOverlap(db);assert.equal(pairs.length,1);assert.equal(pairs[0].shared.length,3);
   const c=[pairs[0].left,pairs[0].right].find(c=>c.id==='canonical');assert.equal(c.title,'Preferred collection');assert.equal(c.units.values().next().value.sources.length,2);
 }],
 ['pair verified status requires reviewed evidence on both sides and respects rejection and ownership',()=>{
   const a=coverageBook('a'),b=coverageBook('b'),db=coverageDatabase(a,b);db.contentReviews[a.id]=confirmed([issue()]);
   assert.equal(collectionOverlap(db).pairs[0].verified,0);db.contentReviews[b.id]=confirmed([issue()]);assert.equal(collectionOverlap(db).pairs[0].verified,1);
   db.contentReviews[b.id]=confirmed([],'rejected');assert.equal(collectionOverlap(db).pairs.length,0);delete db.contentReviews[b.id];b.ownership='borrowed';assert.equal(collectionOverlap(db).pairs.length,0);
   db.ownershipPolicy={providers:{kindle:true}};assert.equal(collectionOverlap(db).pairs.length,1);
 }],
 ['explicit runs and languages stay distinct; provisional and direct standalone entries cannot create collection pairs',()=>{
   const a=coverageBook('a'),old=coverageBook('old','Collects Alpha (1990) #1-3'),fr=coverageBook('fr');fr.metadata.language='fr';
   const unknown=coverageBook('unknown','Collects Alpha #1-3'),direct=coverageBook('direct','',{title:'Alpha (2001) #1'});
   assert.equal(collectionOverlap(coverageDatabase(a,old,fr,unknown,direct)).pairs.length,0);
 }],
 ['chapters and excerpts do not become shared full issues; named material stays outside overlap',()=>{
   const text='Collects Alpha (2001) #0, 1/2; excerpts from Alpha (2001) #9; Digital Chapters 1-15; "Origin"';
   const {pairs}=collectionOverlap(coverageDatabase(coverageBook('a',text),coverageBook('b',text)));assert.equal(pairs[0].shared.length,2);
 }],
 ['run-unspecified versus known-run evidence is not presented as definitely unique in pair details',()=>{
   const a=coverageBook('a','Collects Alpha (2001) #1; Beta #2'),b=coverageBook('b','Collects Alpha (2001) #1; Beta (2000) #2');
   const detail=overlapPairDetails(collectionOverlap(coverageDatabase(a,b)).pairs[0]);assert.equal(detail.left.unique.length+detail.right.unique.length,0);assert.equal(detail.left.uncertain.length+detail.right.uncertain.length,2);
 }],
 ['on-demand cooperative overlap projection matches synchronous results',async()=>{
   const db=coverageDatabase(coverageBook('a'),coverageBook('b'));let yields=0;
   const asyncResult=await collectionOverlapAsync(db,{yieldWork:async()=>{yields++;}});assert.deepEqual(asyncResult,collectionOverlap(db));assert(yields>0);
   assert.equal(workspaceTarget('#overlap'),'overlap');assert(LIBRARY_WORKSPACES.includes('overlap'));assert.equal(validateUiPreferences({workspace:'overlap'}).workspace,'overlap');
 }]
];
