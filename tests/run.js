import assert from 'node:assert/strict';
import { matchItems } from '../src/lib/matcher.js';
import { normalizeProviderItem, rebuildCanonicalItems } from '../src/lib/models.js';
import { normalizeGameTitle } from '../src/lib/normalization.js';

await import('../src/providers/steam-store.js');
await import('../src/providers/gog.js');
await import('../src/providers/epic.js');
await import('../src/providers/audible.js');
await import('../src/providers/kindle.js');
const { ownedAppIdsFromDynamicStore, libraryItemsFromStoreItems } = globalThis.GalacticSteamStore;
const { gogItemsFromProducts, pageCount } = globalThis.GalacticGog;
const { epicItemsFromLibraryPage, nextCursorFromPage } = globalThis.GalacticEpic;
const { audibleItemIdFromUrl, audibleItemFromLibraryEntry, ownershipFromLibraryAction } = globalThis.GalacticAudible;
const { kindleItemsFromOwnershipResponse, ownershipFromOriginType } = globalThis.GalacticKindle;

const tests = [
  ['normalizes punctuation, symbols, articles, and Roman numerals', () => {
    assert.deepEqual(normalizeGameTitle("The Sid Meier’s Civilization® VI"), {
      normalizedTitle: 'sid meiers civilization 6', baseTitle: 'sid meiers civilization 6', edition: null
    });
  }],
  ['keeps meaningful editions distinct', () => {
    assert.deepEqual(normalizeGameTitle('Control: Ultimate Edition'), {
      normalizedTitle: 'control ultimate', baseTitle: 'control', edition: 'ultimate'
    });
    assert.notEqual(normalizeGameTitle('Control').normalizedTitle, normalizeGameTitle('Control Ultimate Edition').normalizedTitle);
  }],
  ['matches an exact normalized title across providers', () => {
    const providerItems = Object.fromEntries([
      normalizeProviderItem({ provider: 'steam', providerItemId: '123', title: 'SOMA' }),
      normalizeProviderItem({ provider: 'gog', providerItemId: 'abc', title: 'The SOMA' })
    ].map((item) => [item.id, item]));
    const [result] = matchItems(providerItems, [{ requestId: 'soma', mediaType: 'game', title: 'SOMA' }]);
    assert.equal(result.owned, true);
    assert.equal(result.confidence, 1);
    assert.equal(result.matches.length, 2);
    assert.equal(Object.keys(rebuildCanonicalItems(providerItems)).length, 1);
  }],
  ['does not claim a separate edition as owned', () => {
    const item = normalizeProviderItem({ provider: 'steam', providerItemId: '870780', title: 'Control' });
    const [result] = matchItems({ [item.id]: item }, [{ requestId: 'control', mediaType: 'game', title: 'Control Ultimate Edition' }]);
    assert.equal(result.owned, false);
    assert.equal(result.matches.length, 0);
  }],
  ['keeps owned Steam games and links DLC while resolving Store data', () => {
    assert.deepEqual(ownedAppIdsFromDynamicStore({ rgOwnedApps: [440, '570', 'not-an-app', 440] }), ['440', '570']);
    assert.deepEqual(libraryItemsFromStoreItems({ response: { store_items: [
      { appid: 440, type: 0, name: 'Team Fortress 2' },
      { appid: 570, type: 4, name: 'Mann Co. Supply Crate Key', related_items: { parent_appid: 440 } }
    ] } }, new Set(['440', '570'])), [
      { providerItemId: '440', title: 'Team Fortress 2', mediaType: 'game', ownership: 'owned', metadata: { source: 'steam-store-browse-items' } },
      { providerItemId: '570', title: 'Mann Co. Supply Crate Key', mediaType: 'game-addon', ownership: 'owned', metadata: { source: 'steam-store-browse-items', parentProviderItemId: '440' } }
    ]);
    const game = normalizeProviderItem({ provider: 'steam', providerItemId: '440', title: 'Team Fortress 2' });
    const addOn = normalizeProviderItem({ provider: 'steam', providerItemId: '570', title: 'Mann Co. Supply Crate Key', mediaType: 'game-addon', metadata: { parentProviderItemId: '440' } });
    assert.equal(Object.keys(rebuildCanonicalItems({ [game.id]: game, [addOn.id]: addOn })).length, 1);
  }],
  ['keeps GOG game records across library pages and ignores movies', () => {
    assert.equal(pageCount({ totalPages: 3 }), 3);
    assert.equal(pageCount({ totalPages: 'not-a-number' }), 1);
    assert.deepEqual(gogItemsFromProducts({ products: [
      { id: 1207658691, title: 'The Witcher 3: Wild Hunt', isGame: true, worksOn: { Windows: true, Mac: false } },
      { id: 1207658692, title: 'A movie', isMovie: true, isGame: false }
    ] }), [{
      providerItemId: '1207658691',
      title: 'The Witcher 3: Wild Hunt',
      mediaType: 'game',
      ownership: 'owned',
      platform: ['windows'],
      metadata: { source: 'gog-account-library' }
    }]);
  }],
  ['keeps Epic games and links Epic add-ons from library pages', () => {
    const page = { data: { Library: { libraryItems: { records: [
      { catalogItemId: 'game-id', namespace: 'store', sandboxType: 'PUBLICGAME', product: { supportedTypes: ['GAME'] }, catalogItem: { id: 'game-id', title: 'Alan Wake 2', releaseInfo: [{ platform: 'Windows' }] } },
      { catalogItemId: 'dlc-id', namespace: 'store', sandboxType: 'PUBLICGAME', product: { supportedTypes: ['DLC'] }, catalogItem: { id: 'dlc-id', title: 'Alan Wake 2: Night Springs', mainGameItem: { id: 'game-id' }, releaseInfo: [{ platform: 'Windows' }] } },
      { catalogItemId: 'untyped-game-id', namespace: 'store', sandboxType: 'PUBLICGAME', catalogItem: { id: 'untyped-game-id', title: 'A current Epic game' } },
      { catalogItemId: 'asset-id', namespace: 'ue', sandboxType: 'PUBLICGAME', product: { supportedTypes: ['GAME'] }, catalogItem: { id: 'asset-id', title: 'Unreal asset' } }
    ], responseMetadata: { nextCursor: 'next-page' } } } } };
    assert.deepEqual(epicItemsFromLibraryPage(page), {
      items: [
        { providerItemId: 'game-id', title: 'Alan Wake 2', mediaType: 'game', ownership: 'owned', platform: ['windows'], metadata: { source: 'epic-store-library' } },
        { providerItemId: 'dlc-id', title: 'Alan Wake 2: Night Springs', mediaType: 'game-addon', ownership: 'owned', platform: ['windows'], metadata: { source: 'epic-store-library', parentProviderItemId: 'game-id' } },
        { providerItemId: 'untyped-game-id', title: 'A current Epic game', mediaType: 'game', ownership: 'owned', platform: [], metadata: { source: 'epic-store-library' } }
      ],
      skipped: ['asset-id']
    });
    assert.equal(nextCursorFromPage(page), 'next-page');
  }],
  ['keeps Audible audiobook identity and available library metadata', () => {
    const url = 'https://www.audible.com/pd/Project-Hail-Mary-Audiobook/B08G9PRS1K?ref_paginate';
    assert.equal(audibleItemIdFromUrl(url), 'B08G9PRS1K');
    assert.equal(ownershipFromLibraryAction('Remove'), 'subscription');
    assert.equal(ownershipFromLibraryAction('Listen now'), 'unknown');
    assert.deepEqual(audibleItemFromLibraryEntry({
      url,
      title: '  Project Hail Mary  ',
      authors: ['Andy Weir'],
      narrators: ['Ray Porter'],
      series: [],
      ownership: 'subscription',
      libraryAction: 'Remove from your library'
    }), {
      providerItemId: 'B08G9PRS1K',
      title: 'Project Hail Mary',
      mediaType: 'audiobook',
      ownership: 'subscription',
      metadata: {
        source: 'audible-library-page',
        detailUrl: 'https://www.audible.com/pd/Project-Hail-Mary-Audiobook/B08G9PRS1K',
        authors: ['Andy Weir'],
        narrators: ['Ray Porter'],
        series: [],
        libraryAction: 'Remove from your library'
      }
    });
    const audiobook = normalizeProviderItem({ provider: 'audible', providerItemId: 'B08G9PRS1K', title: 'Project Hail Mary', mediaType: 'audiobook', ownership: 'unknown' });
    const game = normalizeProviderItem({ provider: 'steam', providerItemId: '123', title: 'Project Hail Mary' });
    const canonical = rebuildCanonicalItems({ [audiobook.id]: audiobook, [game.id]: game });
    assert.ok(canonical['audiobook:project hail mary']);
    assert.ok(canonical['game:project hail mary']);
  }],
  ['keeps Kindle books and their available Content Library metadata', () => {
    assert.equal(ownershipFromOriginType('Purchase'), 'owned');
    assert.equal(ownershipFromOriginType('KindleUnlimited'), 'subscription');
    assert.deepEqual(kindleItemsFromOwnershipResponse({
      GetContentOwnershipData: {
        items: [{
          asin: 'B012345678', title: '  Sandman &amp; More  ', authors: ['Neil Gaiman'],
          seriesName: 'The Sandman', collectionNames: ['Comics'], originType: 'Purchase',
          contentType: 'Ebook', itemStatus: 'Active', publisherName: 'DC Comics',
          publicationDate: '2024-01-15', fileFormat: 'KFX', acquiredDate: 1704067200
        }]
      }
    }, 'https://www.amazon.com'), [{
      providerItemId: 'B012345678', title: 'Sandman & More', mediaType: 'book', ownership: 'owned', acquiredAt: '2024-01-01T00:00:00.000Z',
      metadata: {
        source: 'amazon-kindle-content-library', detailUrl: 'https://www.amazon.com/dp/B012345678', libraryCategory: 'books',
        authors: ['Neil Gaiman'], series: ['The Sandman'], collections: ['Comics'], originType: 'Purchase',
        contentType: 'Ebook', itemStatus: 'Active', publisher: 'DC Comics', publicationDate: '2024-01-15', format: 'KFX'
      }
    }]);
    const book = normalizeProviderItem({ provider: 'kindle', providerItemId: 'B012345678', title: 'Sandman & More', mediaType: 'book' });
    assert.ok(rebuildCanonicalItems({ [book.id]: book })['book:sandman and more']);
  }]
];

let failures = 0;
for (const [name, run] of tests) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}
if (failures) process.exitCode = 1;
else console.log(`\n${tests.length} tests passed.`);
