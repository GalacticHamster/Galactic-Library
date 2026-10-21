import assert from 'node:assert/strict';
import {validateDatabase} from '../src/lib/models.js';
import {activeObservationEnvelope,OBSERVATION_REGISTRATION} from '../src/lib/observation-transactions.js';
import {OBSERVATION_KEY,OBSERVATION_HEAD_KEY,materializeObservations} from '../src/lib/observation-overlays.js';
import {providerCheckDigest} from '../src/lib/provider-scan-checks.js';
import {bookReviewCounts} from '../src/ui/review-status.js';
import {performanceWriter} from './provider-performance-fixture.js';
import {providerSyncLibrary} from './provider-sync-fixture.js';
import {observationPacket} from './observation-fixture.js';

export function lookupFailureFixture(){
  let db=providerSyncLibrary('kindle');const book=Object.values(db.providerItems)[0],ref=crypto.randomUUID();
  book.title='Justice League Dark (2018) Vol. 1: The Last Age of Magic';
  db.enrichmentReviews[ref]={recordRefs:[book.recordRef],source:'openLibrary',status:'no-results',title:book.title,reason:'No matching work was found.',candidates:[],checkedAt:'2026-10-20T12:00:00Z'};
  db=validateDatabase(db);return {db,ref};
}

export const lookupDismissalTests=[
  ...['absent','empty','packet','warm'].map(mode=>['failed lookup dismissal: '+mode+' observation state preserves evidence and persists on reload',async()=>{
    const {db,ref}=lookupFailureFixture(),h=performanceWriter(db);
    const packet=mode==='packet'?await observationPacket(db,'kindle'):null;
    if(mode!=='absent'){
      h.stored[OBSERVATION_KEY]=activeObservationEnvelope(await providerCheckDigest(db),packet);
      h.stored[OBSERVATION_HEAD_KEY]=OBSERVATION_REGISTRATION;
    }
    if(mode==='warm')await h.writer.getQueryDatabase();
    const expected=packet?materializeObservations(db,packet):db;
    assert.equal(bookReviewCounts(expected).lookups,1);
    const result=await h.writer.execute('dismissEnrichmentReviews',[[ref]]);
    assert.equal(bookReviewCounts(result).lookups,0);assert.equal(result.enrichmentReviews[ref],undefined);
    assert.deepEqual(result.providerItems,expected.providerItems);assert.deepEqual(result.contentReviews,expected.contentReviews);
    const reloaded=await performanceWriter(null,{stored:h.stored}).writer.getDatabase();
    assert.equal(bookReviewCounts(reloaded).lookups,0);assert.deepEqual(reloaded.providerItems,result.providerItems);
  }]),
  ['failed lookup dismissal changes only its selected review',async()=>{
    const {db,ref}=lookupFailureFixture(),other=crypto.randomUUID();
    db.enrichmentReviews[other]={...db.enrichmentReviews[ref],source:'googleBooks'};
    const h=performanceWriter(db);h.stored[OBSERVATION_KEY]=activeObservationEnvelope(await providerCheckDigest(db));h.stored[OBSERVATION_HEAD_KEY]=OBSERVATION_REGISTRATION;
    const result=await h.writer.execute('dismissEnrichmentReviews',[[ref]]);
    assert.equal(bookReviewCounts(result).lookups,1);assert.deepEqual(result.enrichmentReviews[other],db.enrichmentReviews[other]);
    assert.deepEqual(result.providerItems,db.providerItems);
  }],
  ...[
    ['malformed envelope',e=>e.unexpected=true],
    ['foreign library digest',e=>e.baseDigest='f'.repeat(64)],
    ['malformed payload',e=>e.packet={format:99}]
  ].map(([name,mutate])=>['failed lookup dismissal rejects '+name+' without deleting any data',async()=>{
    const {db,ref}=lookupFailureFixture(),h=performanceWriter(db),envelope=activeObservationEnvelope(await providerCheckDigest(db));mutate(envelope);
    h.stored[OBSERVATION_KEY]=envelope;h.stored[OBSERVATION_HEAD_KEY]=OBSERVATION_REGISTRATION;
    const before=structuredClone(h.stored);
    await assert.rejects(h.writer.execute('dismissEnrichmentReviews',[[ref]]),/damaged|original library|observation/iu);
    assert.deepEqual(h.stored,before);assert.equal(h.counts.databaseWrites,0);
  }])
];
