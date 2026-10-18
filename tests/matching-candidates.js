import assert from 'node:assert/strict';
import {revisionMatchingTests} from './revision-matching.js';
import { normalizeProviderItem, createEmptyDatabase, rebuildCanonicalItems } from '../src/lib/models.js';
import { matchItems } from '../src/lib/matcher.js';
import { handleExternalApiRequest } from '../src/lib/external-api.js';
import { identityConflicts, identityEvidence } from '../src/lib/identity.js';

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
  }],
  ['excluded-provider pruning skips candidate discovery without influencing warnings, ambiguity or candidate ordering', () => {
    const itemHumble = normalizeProviderItem({ provider: 'humble', providerItemId: 'h1', title: 'Batman: Year One, 1st Edition', mediaType: 'book', ownership: 'owned', metadata: { authors: ['Frank Miller'] } });
    const itemSteam = normalizeProviderItem({ provider: 'steam', providerItemId: 's1', title: 'Batman: Year One (Special Edition)', mediaType: 'book', ownership: 'owned', metadata: { authors: ['Frank Miller'] } });
    const itemKobo = normalizeProviderItem({ provider: 'kobo', providerItemId: 'k1', title: 'Batman: Year One, 2nd Edition', mediaType: 'book', ownership: 'owned', metadata: { authors: ['Frank Miller'] } });
    const itemOther = normalizeProviderItem({ provider: 'humble', providerItemId: 'h2', title: 'Batman: Year One, 3rd Edition', mediaType: 'book', ownership: 'owned', metadata: { authors: ['Different Author'] } });

    const allItems = { [itemHumble.id]: itemHumble, [itemSteam.id]: itemSteam, [itemKobo.id]: itemKobo, [itemOther.id]: itemOther };
    const withoutHumble = { [itemSteam.id]: itemSteam, [itemKobo.id]: itemKobo };

    const query = { title: 'Batman: Year One', mediaType: 'book', authors: ['Frank Miller'] };
    const resWithExcluded = matchItems(allItems, [{ ...query, excludeProviders: ['humble'] }])[0];
    const resWithoutHumble = matchItems(withoutHumble, [{ ...query, excludeProviders: ['humble'] }])[0];

    assert.deepEqual(resWithExcluded.matches, resWithoutHumble.matches);
    assert.deepEqual(resWithExcluded.possibleMatches, resWithoutHumble.possibleMatches);
    assert.equal(resWithExcluded.owned, resWithoutHumble.owned);
    assert.equal(resWithExcluded.confidence, resWithoutHumble.confidence);

    assert.ok(!resWithExcluded.possibleMatches.some(m => m.provider === 'humble'));
    assert.equal(resWithExcluded.possibleMatches.length, 2);
    assert.equal(resWithExcluded.possibleMatches[0].itemRef, itemKobo.recordRef);
    assert.equal(resWithExcluded.possibleMatches[1].itemRef, itemSteam.recordRef);
    assert.deepEqual(resWithExcluded.possibleMatches.map(m => m.itemRef), resWithoutHumble.possibleMatches.map(m => m.itemRef));

    const resMultiExcluded = matchItems(allItems, [{ ...query, excludeProviders: ['humble', 'steam'] }])[0];
    assert.equal(resMultiExcluded.possibleMatches.length, 1);
    assert.equal(resMultiExcluded.possibleMatches[0].provider, 'kobo');

    const resAllExcluded = matchItems(allItems, [{ ...query, excludeProviders: ['humble', 'steam', 'kobo'] }])[0];
    assert.equal(resAllExcluded.possibleMatches.length, 0);
    assert.equal(resAllExcluded.matches.length, 0);

    const resNoneExcluded = matchItems(allItems, [{ ...query, excludeProviders: [] }])[0];
    assert.ok(resNoneExcluded.possibleMatches.some(m => m.provider === 'humble'));
  }],
  ['identity evidence reuse preserves exact public contract and results across all conflict dimensions', () => {
    const pairs = [
      [{ title: 'Dune', mediaType: 'book', metadata: { authors: ['Frank Herbert'], isbn: '9780441172719', edition: '1st' } },
       { title: 'Dune', mediaType: 'book', metadata: { authors: ['Frank Herbert'], isbn: '9780441172719', edition: '1st' } }],
      [{ title: 'Dune', mediaType: 'book', metadata: {} },
       { title: 'Dune', mediaType: 'game', metadata: {} }],
      [{ title: 'Book', mediaType: 'book', metadata: { authors: ['Alan Moore'] } },
       { title: 'Book', mediaType: 'book', metadata: { authors: ['Neil Gaiman'] } }],
      [{ title: 'Book', mediaType: 'book', metadata: { authors: ['Alan Moore'] } },
       { title: 'Book', mediaType: 'book', metadata: { authors: ['A. Moore'] } }],
      [{ title: 'Novel', mediaType: 'book', metadata: { isbn: '9780441172719' } },
       { title: 'Novel', mediaType: 'book', metadata: { isbn: '9780140328721' } }],
      [{ title: 'Item', mediaType: 'book', metadata: { asin: 'B000000001' } },
       { title: 'Item', mediaType: 'book', metadata: { asin: 'B000000002' } }],
      [{ title: 'Sandman', mediaType: 'book', metadata: { series: 'The Sandman' } },
       { title: 'Sandman', mediaType: 'book', metadata: { series: 'Lucifer' } }],
      [{ title: 'Comic', mediaType: 'book', metadata: { run: '1990', unit: '1', unitType: 'volume', language: 'en' } },
       { title: 'Comic', mediaType: 'book', metadata: { run: '2020', unit: '2', unitType: 'issue', language: 'fr' } }],
      [{ title: 'Atlas Shrugged, Revised', mediaType: 'book', metadata: { edition: 'Revised' } },
       { title: 'Atlas Shrugged, Updated', mediaType: 'book', metadata: { edition: 'Updated' } }],
      [{ title: 'Batman Preview', mediaType: 'book', metadata: {} },
       { title: 'Batman', mediaType: 'book', metadata: {} }],
      [{ title: 'Empty Metadata Left', mediaType: 'book' },
       { title: 'Empty Metadata Right', mediaType: 'book' }]
    ];

    const optionSets = [
      undefined,
      {},
      { edition: true },
      { edition: false },
      { companion: true },
      { companion: true, edition: false }
    ];

    for (const [left, right] of pairs) {
      const evLeft = identityEvidence(left);
      const evRight = identityEvidence(right);
      const evLeftFrozen = JSON.stringify(evLeft);
      const evRightFrozen = JSON.stringify(evRight);

      for (const opts of optionSets) {
        const baseline = identityConflicts(left, right, opts);

        const withLeft = identityConflicts(left, right, { ...(opts ?? {}), leftEvidence: evLeft });
        assert.deepEqual(withLeft, baseline);

        const withRight = identityConflicts(left, right, { ...(opts ?? {}), rightEvidence: evRight });
        assert.deepEqual(withRight, baseline);

        const withBoth = identityConflicts(left, right, { ...(opts ?? {}), leftEvidence: evLeft, rightEvidence: evRight });
        assert.deepEqual(withBoth, baseline);

        const withNulls = identityConflicts(left, right, { ...(opts ?? {}), leftEvidence: null, rightEvidence: undefined });
        assert.deepEqual(withNulls, baseline);

        assert.equal(JSON.stringify(evLeft), evLeftFrozen);
        assert.equal(JSON.stringify(evRight), evRightFrozen);
      }
    }
  }]
];
