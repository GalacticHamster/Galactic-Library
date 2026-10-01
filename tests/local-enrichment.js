import assert from 'node:assert/strict';
import {zipMetadataReader} from '../src/lib/zip-metadata.js';
import {openLibraryEditionUrl,openLibraryEditionCandidate} from '../src/lib/open-library-edition.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {identityEvidence,editionEnrichmentConflicts} from '../src/lib/identity.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {metadataZip} from './metadata-fixtures.js';

const memory=()=>{const data={},writes=[];return {data,writes,writer:createStorageWriter({get:async defaults=>structuredClone({...defaults,...data}),set:async updates=>{writes.push(structuredClone(updates));Object.assign(data,structuredClone(updates));},remove:async keys=>{for(const key of keys)delete data[key];}})};};
const proposal=(extra={})=>({source:'comicinfo',title:'Manga Vol. 1',authors:['Writer'],series:['Manga'],volume:'1',unitType:'volume',categories:['Manga'],approved:false,...extra});
async function queue(writer,source,candidate,ref){const db=await writer.saveEnrichmentReview({recordRefs:[ref],source,status:'candidates',title:'Manga Vol. 1',candidates:[candidate]});return Object.keys(db.enrichmentReviews).find(id=>db.enrichmentReviews[id].source===source&&db.enrichmentReviews[id].recordRefs.includes(ref));}

export const localEnrichmentTests=[['reviewing and undoing two source selections is atomic; stale undo and direct conflicting approval reject before persistence',async()=>{
  assert(editionEnrichmentConflicts({title:'Manga Vol. 1',mediaType:'book',metadata:{isbn:['9780306406157'],enrichment:{googleBooks:{title:'Manga Vol. 1',isbn:['9780140328721']}}}},{title:'Manga Vol. 1',mediaType:'book',metadata:{isbn:['9780140328721']}}).includes('ISBN'),'Merged ISBNs hid a provider/source conflict.');
  const {writer,writes}=memory();await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Manga Vol. 1',mediaType:'book'},{providerItemId:'b',title:'Manga Vol. 2',mediaType:'book',metadata:{language:'en'}}]);
  let db=await writer.getDatabase();const a=db.providerItems['humble:a'],b=db.providerItems['humble:b'];const first=await queue(writer,'localMetadata',proposal(),a.recordRef),second=await queue(writer,'localMetadata',proposal({title:b.title,volume:'2'}),b.recordRef);
  let before=writes.length;db=await writer.applyReviewedEnrichments([first,second].map(reviewId=>({reviewId,candidateIndex:0,confirmed:true})));assert.equal(writes.length-before,1);
  const refs=[a.id,b.id].map(id=>db.providerItems[id].metadata.enrichment.localMetadata.selectionRef);before=writes.length;
  await assert.rejects(writer.undoEnrichmentSelections([refs[0],crypto.randomUUID()]),/no longer current/);assert.equal(writes.length,before);assert((await writer.getDatabase()).providerItems[a.id].metadata.enrichment.localMetadata);
  db=await writer.undoEnrichmentSelections(refs);assert.equal(writes.length-before,1);assert(!db.providerItems[a.id].metadata.enrichment&&!db.providerItems[b.id].metadata.enrichment);
  await assert.rejects(writer.saveGoogleBooksEnrichments([{itemIds:[b.id],recordRefs:[b.recordRef],enrichment:{source:'google-books',volumeId:'wrong-language',title:b.title,language:'ja',approved:true}}]),/conflicting language/);
}],['bounded ZIP metadata reader verifies paths, integrity, encryption and size before reading metadata',async()=>{
  const read=await zipMetadataReader(new Blob([metadataZip([{name:'content.opf',text:'metadata'},{name:'images/cover.jpg',text:'unread'}])]));assert.equal(await read('content.opf'),'metadata');
  for(const entries of [[{name:'../content.opf',text:'bad'}],[{name:'content.opf',text:'a'},{name:'content.opf',text:'b'}]])await assert.rejects(zipMetadataReader(new Blob([metadataZip(entries)])),/Unsafe or duplicate/);
  for(const entry of [{flags:1},{size:1024*1024+1},{badCrc:true}]){const read=await zipMetadataReader(new Blob([metadataZip([{name:'content.opf',text:'metadata',...entry}])]));await assert.rejects(read('content.opf'),/Encrypted|oversized|checksum/);}
  await assert.rejects(zipMetadataReader(new Blob(['bad ZIP'])),/Missing ZIP/);await assert.rejects(read('../content.opf'),/Unsafe/);
}],['Open Library identifier adapter requires an edition, canonicalizes ISBN and retains scope without work ISBN inference',()=>{
  assert.equal(openLibraryEditionUrl('0-140-32872-6'),'https://openlibrary.org/isbn/9780140328721.json');assert.throws(()=>openLibraryEditionUrl('123'),/validated ISBN/);
  const candidate=openLibraryEditionCandidate({key:'/books/OL123M',title:'Manga',subtitle:'Vol. 1',works:[{key:'/works/OL9W'}],isbn_10:['0140328726'],isbn_13:['9780140328721','invalid'],languages:[{key:'/languages/jpn'}],publishers:['Publisher']},['Writer']);
  assert.deepEqual(candidate.isbn,['9780140328721']);assert.equal(candidate.language,'ja');assert.equal(candidate.approved,false);assert.equal(candidate.editionKey,'/books/OL123M');assert.throws(()=>openLibraryEditionCandidate({key:'/works/OL9W',title:'Work'}),/edition/);
}],['local proposals remain non-authoritative until reviewed; batch approval and undo use one write and preserve provider ownership',async()=>{
  const {writer,writes}=memory();await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Manga Vol. 1',mediaType:'book',ownership:'unknown'},{providerItemId:'b',title:'Other Vol. 1',mediaType:'book',ownership:'owned'}]);
  let db=await writer.getDatabase();const record=db.providerItems['humble:a'];const id=await queue(writer,'localMetadata',proposal({isbn:['9780140328721'],statement:'Collects Manga Vol. One',fileName:'ComicInfo.xml',downloadToken:'discard'}),record.recordRef);
  db=await writer.getDatabase();assert.equal(db.enrichmentReviews[id].candidates[0].downloadToken,undefined);assert.deepEqual(identityEvidence(db.providerItems[record.id]).isbn,[]);
  await assert.rejects(writer.applyReviewedEnrichments([{reviewId:id,candidateIndex:0,confirmed:false}]),/Confirm/);
  const before=writes.length;db=await writer.applyReviewedEnrichments([{reviewId:id,candidateIndex:0,confirmed:true}]);assert.equal(writes.length-before,1);assert.deepEqual(identityEvidence(db.providerItems[record.id]).isbn,['9780140328721']);assert.equal(db.providerItems[record.id].ownership,'unknown');
  assert.equal(parseBackup(createBackup(db)).providerItems[record.id].metadata.enrichment.localMetadata.fileName,'ComicInfo.xml');
  const rows=enrichmentWorkbenchRows(db);assert(rows.some(row=>row.category==='unparsed'));assert(rows.some(row=>row.category==='undo'));assert(rows.some(row=>row.category==='missing'));
  const selection=db.providerItems[record.id].metadata.enrichment.localMetadata.selectionRef;
  const undoWrites=writes.length;db=await writer.undoEnrichmentSelections([selection]);assert.equal(writes.length-undoWrites,1);assert.equal(db.providerItems[record.id].metadata.enrichment?.localMetadata,undefined);assert.equal(db.providerItems['humble:b'].ownership,'owned');
}],['review batch rejects cross-source conflicts, duplicate source choices and stale records atomically',async()=>{
  const {writer,writes}=memory();await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Manga Vol. 1',mediaType:'book'}]);let db=await writer.getDatabase();const record=db.providerItems['humble:a'];
  const local=await queue(writer,'localMetadata',proposal({isbn:['9780140328721']}),record.recordRef),google=await queue(writer,'googleBooks',{source:'google-books',volumeId:'one',title:'Manga Vol. 1',isbn:['9780306406157']},record.recordRef);
  const pick=id=>({reviewId:id,candidateIndex:0,confirmed:true}),before=writes.length;
  await assert.rejects(writer.applyReviewedEnrichments([pick(local),pick(google)]),/Selected sources conflict/);await assert.rejects(writer.applyReviewedEnrichments([pick(local),pick(local)]),/one candidate/);assert.equal(writes.length,before);assert.equal((await writer.getDatabase()).providerItems[record.id].metadata.enrichment,undefined);
  await writer.clearDatabase();await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Manga Vol. 1',mediaType:'book'}]);await assert.rejects(writer.applyReviewedEnrichments([pick(local)]),/active library/);
}],['known source conflicts and failed reviews appear in dedicated workbench queues; inactive profile reviews do not',async()=>{
  const {writer}=memory();await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Manga Vol. 1',mediaType:'book',metadata:{language:'en'}}]);let db=await writer.getDatabase();const record=db.providerItems['humble:a'];const id=await queue(writer,'localMetadata',proposal({language:'ja'}),record.recordRef);
  assert(enrichmentWorkbenchRows(await writer.getDatabase()).some(row=>row.id===id&&row.category==='conflicts'));await assert.rejects(writer.applyReviewedEnrichments([{reviewId:id,candidateIndex:0,confirmed:true}]),/conflicting language/);
  db=await writer.saveEnrichmentReview({recordRefs:[record.recordRef],source:'googleBooks',status:'failed',reason:'Temporary failure',candidates:[]});assert(enrichmentWorkbenchRows(db).some(row=>row.category==='failed'));
  const modified=structuredClone(db);delete modified.providerItems[record.id];modified.canonicalItems={};assert.equal(enrichmentWorkbenchRows(modified).length,0);
  const refs=Object.keys(db.enrichmentReviews);db=await writer.dismissEnrichmentReviews(refs);assert.equal(Object.keys(db.enrichmentReviews).length,0);
}]];
