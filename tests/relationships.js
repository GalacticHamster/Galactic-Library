import assert from 'node:assert/strict';
import { createStorageWriter } from '../src/background/storage-writer.js';
import { createEmptyDatabase, normalizeProviderItem, rebuildCanonicalItems, validateDatabase } from '../src/lib/models.js';
import { identityEvidence, validIsbn } from '../src/lib/identity.js';

export const book = (id, metadata = {}, title = 'Shared Title') => normalizeProviderItem({provider:'humble',providerItemId:id,title,mediaType:'book',ownership:'owned',metadata});
export const records = (...items) => Object.fromEntries(items.map((item) => [item.id,item]));
export const relationshipTests = [
  ['validates ISBN checksums and equivalent ISBN-10/13', () => {
    assert.equal(validIsbn('0-306-40615-2'), '9780306406157');
    assert.equal(validIsbn('9780306406158'), '');
    assert.equal(validIsbn('9781234567890'), '');
  }],
  ['homonymous books require edition evidence and separate different authors', () => {
    const a=book('a',{authors:['Author A']}); const b=book('b',{authors:['Author B']}); const c=book('c');
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,b,c))).length, 3);
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,book('d',{authors:['Author A']})))).length, 1);
  }],
  ['identifier matches preserve conflicting edition and language evidence', () => {
    const a=book('a',{isbn:'9780306406157',language:'en'});
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,book('b',{isbn:'9780306406157',language:'fr'})))).length,2);
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,book('c',{isbn:'9780306406157'},'Shared Title, 2nd Edition')))).length,2);
  }],
  ['persistent edition IDs survive rename, sync, validation and legacy migration', async () => {
    const values={}; const writer=createStorageWriter({get:async defaults=>({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    let database=await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Original Title',mediaType:'book',ownership:'owned'}]);
    const id=Object.keys(database.canonicalItems)[0];
    database=await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Renamed Title',mediaType:'book',ownership:'owned'}]);
    assert.equal(Object.keys(database.canonicalItems)[0],id);
    assert.equal(Object.keys(validateDatabase(database).canonicalItems)[0],id);
    assert.equal(validateDatabase({...createEmptyDatabase(),schemaVersion:1}).schemaVersion,2);
  }],
  ['different decisions block indirect grouping; same work never merges editions', () => {
    const a=book('a',{authors:['Author']}); const b=book('b',{authors:['Author']}); const c=book('c',{authors:['Author']});
    const groups=Object.values(rebuildCanonicalItems(records(a,b,c),{negative:{decision:'different',itemIds:[a.id,c.id]},bridge:{decision:'same-edition',itemIds:[b.id,c.id]}}));
    assert.ok(groups.every(group=>!(group.providerItemIds.includes(a.id)&&group.providerItemIds.includes(c.id))));
    const other=book('other',{},'Other Title');
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,other),{work:{decision:'same',itemIds:[a.id,other.id]}})).length,2);
  }],
  ['work-level Open Library ISBNs cannot identify an owned edition', () => {
    const item=book('a',{enrichment:{openLibrary:{workKey:'/works/OL1W',isbn:['9780306406157']}}});
    assert.deepEqual(identityEvidence(item).isbn,[]);
    assert.deepEqual(identityEvidence(item).workIds,['/works/OL1W']);
  }],
  ['provider allowlist retains creators, identifiers and numbering without secrets', () => {
    const metadata=globalThis.GalacticProviderMetadata.extract({authors:[{name:'Writer'}],contributors:[{name:'Artist',role:'illustrator'}],isbn:'9780306406157',volume:2,language:'ja',downloadUrl:'secret',token:'secret'});
    assert.deepEqual(metadata.authors,['Writer']); assert.equal(metadata.volume,'2');
    assert.deepEqual(metadata.contributors,[{name:'Artist',role:'illustrator'}]);
    assert.equal(JSON.stringify(metadata).includes('secret'),false);
  }]
];
