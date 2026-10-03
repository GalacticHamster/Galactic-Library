import assert from 'node:assert/strict';
import {revisionMatchingTests} from './revision-matching.js';
import { normalizeProviderItem, createEmptyDatabase, rebuildCanonicalItems } from '../src/lib/models.js';
import { matchItems } from '../src/lib/matcher.js';
import { handleExternalApiRequest } from '../src/lib/external-api.js';

const record = (title, mediaType = 'book', metadata = {}, id = 'candidate') =>
  normalizeProviderItem({ provider: 'humble', providerItemId: id, title, mediaType, metadata, ownership: 'owned' });
const find = (title, item, extra = {}, context = {}) =>
  matchItems({ [item.id]: item }, [{ title, mediaType: item.mediaType, ...extra }], context)[0];

export const matchingCandidateTests = [
  ...revisionMatchingTests,
  ['discovers broader Possible titles without treating discovery as identity', () => {
    const cases = [
      ['Think Like a Programmer', 'Think Like a Programmer: An Introduction to Creative Problem Solving', 'book'],
      ['Maggie the Mechanic', 'Maggie the Mechanic (Love & Rockets)', 'book'],
      ['Dune', 'Dune: A Novel', 'book'],
      ['Practical Python Programming', 'Pratical Python Programming', 'book'],
      ['Complete Guide to Practical Python Programming', 'Complete Guide to Python Programming', 'book'],
      ['Forest Builder Pro v2', 'Forest Builder Pro v1', 'software'],
      ['BioShock Infinite', 'BioShock: The Collection', 'game'],
      ['Long Book Title, 1st Edition', 'Long Book Title, 5th Edition', 'book'],
      ['Dune Second Edition', 'Dune', 'book'],
      ['Control Gold', 'Control', 'game'],
      ['Control Deluxe', 'Control Platinum', 'game']
    ];
    for (const [left, right, media] of cases) for (const [offered, library] of [[left, right], [right, left]]) {
      const result = find(offered, record(library, media));
      assert.equal(result.owned, false, offered + ' / ' + library);
      assert.equal(result.matches.length, 0, offered + ' / ' + library);
      assert.equal(result.possibleMatches.length, 1, offered + ' / ' + library);
      assert.equal(result.possibleMatches[0].title, library);
      assert.equal(result.coverage?.owned ?? 0, 0);
    }
  }],
  ['candidate discovery respects known identity conflicts and unrelated titles', () => {
    for (const [offered, library, media] of [
      ['It', 'It: A Novel', 'book'],
      ['Tool v2', 'Tool v1', 'software'],
      ['Saga Vol. 2', 'Saga Vol. 1', 'book'],
      ['The Complete History of Computing: A Cultural Guide', 'The Complete History of Computing: A Technical Survey', 'book']
    ]) assert.equal(find(offered, record(library, media)).possibleMatches.length, 0, offered);
    for (const [metadata, request] of [
      [{ authors: ['Author One'] }, { authors: ['Author Two'] }],
      [{ run: '1990' }, { run: '2020' }],
      [{ volume: '1' }, { volume: '2' }]
    ]) assert.equal(find('Dune', record('Dune: A Novel', 'book', metadata), request).possibleMatches.length, 0);
    assert.equal(find('Dune', record('Dune: A Novel'), { excludeProviders: ['humble'] }).possibleMatches.length, 0);
    assert.equal(matchItems({ x: record('Dune: A Novel') }, [{ title: 'Dune', mediaType: 'game' }])[0].possibleMatches.length, 0);
  }],
  ['candidate differences remain visible and existing exact ownership remains intact', () => {
    const item = record('Dune: A Novel', 'book', { language: 'en', isbn: '9780441172719' });
    const possible = find('Dune', item, { language: 'fr', identifiers: { isbn: ['9780140328721'] } });
    assert.equal(possible.owned, false);
    assert.match(possible.possibleMatches[0].reason, /language/);
    assert.equal(find(item.title, item, { identifiers: { isbn: ['9780441172719'] } }).owned, true);
    assert.equal(find('Hello World', record('Hello, World!', 'game')).owned, true);
  }],
  ['external Possible API names candidates without changing canonical or enrichment identity', () => {
    const item = record('Dune: A Novel');
    const other = record('Dune', 'book', {}, 'other');
    const database = { ...createEmptyDatabase(), providerItems: { [item.id]: item, [other.id]: other } };
    database.canonicalItems = rebuildCanonicalItems(database.providerItems);
    const before = JSON.stringify(database);
    const result = handleExternalApiRequest(database, { type: 'MATCH_ITEMS', apiVersion: 1, items: [{ title: 'Dune', mediaType: 'book' }] }).results[0];
    assert.equal(result.owned, true);
    assert.equal(result.matches[0].title, other.title);
    assert.ok(result.possibleMatches.some(match => match.title === item.title));
    assert.equal(JSON.stringify(database), before);
    assert.equal(Object.keys(database.canonicalItems).length, 2);
  }],
  ['reviewed Different decisions suppress newly discovered candidates', () => {
    const anchor = record('Dune', 'book', {}, 'anchor');
    const other = record('Dune: A Novel', 'book', {}, 'other');
    const result = matchItems({ [anchor.id]: anchor, [other.id]: other }, [{ title: 'Dune', mediaType: 'book' }], {
      manualMatchDecisions: { no: { itemIds: [anchor.id, other.id], decision: 'different' } }
    })[0];
    assert.ok(!result.possibleMatches.some(match => match.title === other.title));
  }]
];
