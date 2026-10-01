import assert from 'node:assert/strict';
import {highConfidenceGoogleBooksCandidate} from '../src/lib/google-books.js';

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
}]];
