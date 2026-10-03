import assert from 'node:assert/strict';
import { normalizeProviderItem, rebuildCanonicalItems } from '../src/lib/models.js';
import { matchItems } from '../src/lib/matcher.js';

const book = (title, metadata = {}, id = 'copy', ownership = 'owned') => normalizeProviderItem({
  provider: 'humble', providerItemId: id, title, metadata, mediaType: 'book', ownership
});
const find = (title, copies, extra = {}, context = {}) => matchItems(
  Object.fromEntries(copies.map(item => [item.id, item])), [{ title, mediaType: 'book', ...extra }], context
)[0];

export const companionTitleOwnershipTests = [
  ['companion ownership accepts full comic titles despite missing library ISBNs and authors', () => {
    for (const [offered, stored] of [
      ['Archer & Armstrong Vol 1 The Michelangelo Code', 'Archer & Armstrong, Vol. 1:The Michelangelo Code'],
      ["Quantum and Woody! Vol 1 The World's Worst Superhero Team", "Quantum & Woody, Vol. 1:The World's Worst Superhero Team"],
      ['Harbinger Volume II Renegades', 'Harbinger, Vol. 2: Renegades'],
      ['Saga Vol. 1', 'Saga Vol. 1 EPUB'],
      ['4001 A.D. Beyond New Japan', '4001 A.D.: Beyond New Japan TPB']
    ]) {
      const result = find(offered, [book(stored)], { authors: ['Writer'], identifiers: { isbn: '9780306406157' } });
      assert.equal(result.owned, true, offered);
      assert.equal(result.matches[0].relationship, 'same-edition');
      assert.equal(result.possibleMatches.length, 0);
      assert.match(result.matches[0].reason, /full.*title/i);
    }
  }],
  ['repeat purchases establish companion ownership without merging canonical editions', () => {
    const copies = [book('Harbinger Vol. 1: Omega Rising', {}, 'first'), book('Harbinger, Vol. 1:Omega Rising', {}, 'second')];
    const records = Object.fromEntries(copies.map(item => [item.id, item]));
    const canonicalItems = rebuildCanonicalItems(records);
    assert.equal(Object.keys(canonicalItems).length, 2);
    const before = JSON.stringify({ records, canonicalItems });
    const result = find('Harbinger Vol 1 Omega Rising', copies, { identifiers: { isbn: '9780306406157' } }, { canonicalItems });
    assert.equal(result.owned, true);
    assert.equal(result.matches.length, 2);
    assert.equal(JSON.stringify({ records, canonicalItems }), before);
  }],
  ['both 4001 AD books match their own full title independently of related candidates', () => {
    const base = book('4001 A.D. TPB', {}, 'base');
    const beyond = book('4001 A.D.: Beyond New Japan', {}, 'beyond');
    const extra = { authors: ['Writer'], identifiers: { isbn: '9780306406157' } };
    const result = find('4001 A.D.', [base, beyond], extra);
    assert.equal(result.owned, true);
    assert.deepEqual(result.matches.map(item => item.title), [base.title]);
    assert.deepEqual(result.possibleMatches.map(item => item.title), [beyond.title]);
    const full = find('4001 A.D. Beyond New Japan', [base, beyond], extra);
    assert.equal(full.owned, true);
    assert.deepEqual(full.matches.map(item => item.title), [beyond.title]);
    assert.equal(find('4001 A.D.', [beyond], extra).owned, false);
  }],
  ['a purchased book with extra content covers its base title but not the reverse', () => {
    const title = 'Archer & Armstrong Vol 3 Far Faraway';
    assert.equal(find(title, [book('Archer & Armstrong, Vol. 3:Far Faraway (plus extra content)')]).owned, true);
    const reverse = find(title + ' (plus extra content)', [book(title)]);
    assert.equal(reverse.owned, false);
    assert.equal(reverse.possibleMatches.length, 1);
  }],
  ['a full title cannot bypass known identifier, author, language, run or edition conflicts', () => {
    for (const [stored, request] of [
      [{ isbn: '9780140328721' }, { identifiers: { isbn: '9780306406157' } }],
      [{ asin: 'B000000001' }, { identifiers: { asin: 'B000000002' } }],
      [{ authors: ['Other Writer'] }, { authors: ['Writer'] }],
      [{ language: 'ja' }, { language: 'en' }],
      [{ run: '1990' }, { run: '2020' }],
      [{ volume: '2' }, { volume: '1' }],
      [{ edition: 'second edition' }, { edition: 'first edition' }]
    ]) assert.equal(find('Shared Comic Vol. 1', [book('Shared Comic Vol. 1', stored)], request).owned, false, JSON.stringify(stored));
  }],
  ['contradictory homonyms remain ambiguous even when an unannotated copy bridges them', () => {
    for (const field of ['authors', 'run']) {
      const a = { authors: ['A'], isbn: '9780306406157', asin: 'B000000001', language: 'en', run: '1990', edition: 'first edition' };
      const b = { authors: ['B'], isbn: '9780140328721', asin: 'B000000002', language: 'ja', run: '2020', edition: 'second edition' };
      const copies = [book('Shared Title', { [field]: a[field] }, 'a'), book('Shared Title', {}, 'missing'), book('Shared Title', { [field]: b[field] }, 'b')];
      // Explicit edition labels require a compatible query before ambiguity matters.
      const result = find('Shared Title', copies);
      assert.equal(result.owned, false, field);
    }
  }],
  ['a matching validated ISBN distinguishes homonyms with sparse identity metadata', () => {
    const known = book('Shared Title', { isbn: '9780306406157', authors: ['A'] }, 'known');
    const other = book('Shared Title', { authors: ['B'] }, 'other');
    const identifiers = { isbn: '9780306406157' };
    const result = find('Shared Title', [known, other], { identifiers });
    assert.equal(result.owned, true);
    assert.deepEqual(result.matches.map(item => item.itemRef), [known.recordRef]);
    assert.equal(find('Shared Title', [known, other], { identifiers, authors: ['B'] }).owned, false);
  }],
  ['reviewed work differences and edition separations override full-title fallback', () => {
    const copies = [book('Shared Title', {}, 'a'), book('Shared Title', {}, 'b')];
    for (const decision of ['same-work', 'different']) {
      assert.equal(find('Shared Title', copies, {}, { manualMatchDecisions: { pair: { itemIds: copies.map(item => item.id), decision } } }).owned, false);
    }
    assert.equal(find('Shared Title', copies, {}, { editionSeparations: { split: { itemId: copies[0].id, otherItemIds: [copies[1].id] } } }).owned, false);
  }],
  ['narrow title ownership retains articles, accents, numerals, previews and numbered units', () => {
    for (const [offered, stored] of [
      ['The Room', 'Room'], ['Caf\u00e9', 'Cafe'], ['I Am Legend', '1 Am Legend'],
      ['Comic #1/2', 'Comic #1-2'], ['Saga Vol. 2', 'Saga Vol. 1'],
      ['Comic #1-2', 'Comic #1 2'], ['Book 1.2', 'Book 1 2'],
      ['Comic+', 'Comic'], ['Shared Title', 'Shared Title Preview'],
      ['4001 A.D.', '4001 A.D.: Beyond New Japan'], ['Book Second Edition', 'Book']
    ]) assert.equal(find(offered, [book(stored)]).owned, false, offered + ' / ' + stored);
  }],
  ['full-title identity does not turn temporary or unknown access into owned', () => {
    for (const access of ['unknown', 'subscription', 'borrowed', 'rental']) assert.equal(find('Shared Title', [book('Shared Title', {}, 'a', access)]).owned, false, access);
    assert.equal(find('Shared Title', [book('Shared Title')], { excludeProviders: ['humble'] }).matches.length, 0);
  }]
];
