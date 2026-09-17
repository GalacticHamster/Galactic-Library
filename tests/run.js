import assert from 'node:assert/strict';
import { matchItems } from '../src/lib/matcher.js';
import { normalizeProviderItem, rebuildCanonicalItems } from '../src/lib/models.js';
import { normalizeGameTitle } from '../src/lib/normalization.js';
import { findDuplicateCandidates } from '../src/lib/duplicate-review.js';
import { handleExternalApiRequest, isExtensionId, normaliseExternalClientIds } from '../src/lib/external-api.js';

await import('../src/providers/steam-store.js');
await import('../src/providers/gog.js');
await import('../src/providers/epic.js');
await import('../src/providers/audible.js');
await import('../src/providers/kindle.js');
await import('../src/providers/amazon-video.js');
await import('../src/providers/kobo.js');
await import('../src/providers/humble.js');
const { ownedAppIdsFromDynamicStore, libraryItemsFromStoreItems } = globalThis.GalacticSteamStore;
const { gogItemsFromProducts, pageCount } = globalThis.GalacticGog;
const { epicItemsFromLibraryPage, nextCursorFromPage } = globalThis.GalacticEpic;
const { audibleItemIdFromUrl, audibleItemFromLibraryEntry, ownershipFromLibraryAction } = globalThis.GalacticAudible;
const { kindleItemsFromOwnershipResponse, ownershipFromOriginType } = globalThis.GalacticKindle;
const { amazonVideoItemFromCardData, ownershipFromCardText } = globalThis.GalacticAmazonVideo;
const { koboItemIdFromValue, koboItemFromCardData } = globalThis.GalacticKobo;
const { redactRedemptionValues, humbleItemsFromOrder } = globalThis.GalacticHumble;

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
  ['returns named game editions as possible matches, never exact ownership', () => {
    const steelrising = normalizeProviderItem({ provider: 'steam', providerItemId: '99', title: 'Steelrising' });
    const results = matchItems({ [steelrising.id]: steelrising }, [{ requestId: 'steelrising', mediaType: 'game', title: 'Steelrising - Bastille Edition' }]);
    assert.equal(results[0].owned, false);
    assert.deepEqual(results[0].matches, []);
    assert.deepEqual(results[0].possibleMatches.map((item) => item.title), ['Steelrising']);
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
  }],
  ['keeps Amazon Video movie and TV entitlement identities without guessing ambiguous ownership', () => {
    assert.equal(ownershipFromCardText('Purchased in HD'), 'owned');
    assert.equal(ownershipFromCardText('Rental expires in 12 days'), 'rental');
    assert.equal(ownershipFromCardText('Watch now'), 'unknown');
    assert.deepEqual(amazonVideoItemFromCardData({
      providerItemId: 'amzn1.dv.gti.1234-abcd', title: '  The Expanse: Season 1 ', entityType: 'TV_SHOW',
      detailUrl: 'https://www.amazon.com/gp/video/detail/amzn1.dv.gti.1234-abcd?ref=library',
      imageUrl: 'https://m.media-amazon.com/images/example.jpg', ownershipEvidence: 'Purchased'
    }), {
      providerItemId: 'amzn1.dv.gti.1234-abcd', title: 'The Expanse: Season 1', mediaType: 'tv', ownership: 'owned',
      metadata: {
        source: 'amazon-prime-video-purchases-library', detailUrl: 'https://www.amazon.com/gp/video/detail/amzn1.dv.gti.1234-abcd', entityType: 'TV_SHOW',
        imageUrl: 'https://m.media-amazon.com/images/example.jpg', libraryView: 'purchases-and-rentals', ownershipEvidence: 'Purchased'
      }
    });
    const movie = normalizeProviderItem({ provider: 'amazon-video', providerItemId: 'B012345678', title: 'Arrival', mediaType: 'movie' });
    assert.ok(rebuildCanonicalItems({ [movie.id]: movie })['movie:arrival']);
  }],
  ['keeps Kobo book and audiobook identities from signed-in My Books cards', () => {
    assert.equal(koboItemIdFromValue('https://www.kobo.com/us/en/ebook/the-left-hand-of-darkness'), 'the-left-hand-of-darkness');
    assert.equal(koboItemIdFromValue('bookId=1f2e3d4c-1234-5678-9abc-def012345678'), '1f2e3d4c-1234-5678-9abc-def012345678');
    assert.deepEqual(koboItemFromCardData({
      providerItemId: 'https://readingservices.kobo.com/ReadNow/1f2e3d4c-1234-5678-9abc-def012345678', title: 'Web Reader Book',
      detailUrl: 'https://readingservices.kobo.com/ReadNow/1f2e3d4c-1234-5678-9abc-def012345678', typeText: ''
    })?.mediaType, 'book');
    assert.deepEqual(koboItemFromCardData({
      providerItemId: 'https://readnow.kobo.com/ec296889-f3ba-4eb4-bb64-ab0d16e7cbe2', title: 'Kobo Read Now Book',
      detailUrl: 'https://readnow.kobo.com/ec296889-f3ba-4eb4-bb64-ab0d16e7cbe2', typeText: ''
    }), {
      providerItemId: 'ec296889-f3ba-4eb4-bb64-ab0d16e7cbe2', title: 'Kobo Read Now Book', mediaType: 'book', ownership: 'owned',
      metadata: {
        source: 'kobo-my-books-library', detailUrl: 'https://readnow.kobo.com/ec296889-f3ba-4eb4-bb64-ab0d16e7cbe2', imageUrl: '', authors: [], series: [], format: 'ebook'
      }
    });
    assert.deepEqual(koboItemFromCardData({
      providerItemId: 'bookId=1f2e3d4c-1234-5678-9abc-def012345678', title: '  A Memory Called Empire ',
      detailUrl: 'https://www.kobo.com/us/en/ebook/a-memory-called-empire?utm_source=library', imageUrl: 'https://cdn.kobo.com/cover.jpg',
      typeText: 'eBook', authors: ['Arkady Martine'], series: ['Teixcalaan']
    }), {
      providerItemId: '1f2e3d4c-1234-5678-9abc-def012345678', title: 'A Memory Called Empire', mediaType: 'book', ownership: 'owned',
      metadata: {
        source: 'kobo-my-books-library', detailUrl: 'https://www.kobo.com/us/en/ebook/a-memory-called-empire', imageUrl: 'https://cdn.kobo.com/cover.jpg',
        authors: ['Arkady Martine'], series: ['Teixcalaan'], format: 'ebook'
      }
    });
    assert.deepEqual(koboItemFromCardData({
      providerItemId: 'book-2', title: 'Kobo Card Attribute Title', detailUrl: 'https://www.kobo.com/us/en/ebook/kobo-card-attribute-title', typeText: 'eBook'
    })?.title, 'Kobo Card Attribute Title');
    const audiobook = normalizeProviderItem({ provider: 'kobo', providerItemId: 'audio-1', title: 'Kobo Audio', mediaType: 'audiobook' });
    assert.ok(rebuildCanonicalItems({ [audiobook.id]: audiobook })['audiobook:kobo audio']);
  }],
  ['imports Humble books and game entitlements without retaining redemption values', () => {
    const rawDetail = '{"subproducts":[{"machine_name":"ebook-one","human_name":"Book One","downloads":[{"url":"https://cdn.example.test/book-one.pdf"}]},{"machine_name":"audio-two","human_name":"Audio Two","downloads":[{"platform":"audio","download_struct":[{"name":"MP3"}]}]},{"id":"game-three","human_name":"Game Three","platform":"steam"}],"tpkd_dict":{"all_tpks":[{"machine_name":"steam-key","keyindex":2,"human_name":"Third Party Game","key_type":"Steam","redeemed_key_val":"never-store-this"}]}}';
    const redacted = redactRedemptionValues(rawDetail);
    assert.equal(redacted.includes('never-store-this'), false);
    assert.equal(redacted.includes('__GALACTIC_REDACTED_REDEMPTION_VALUE__'), true);
    const items = humbleItemsFromOrder(JSON.parse(redacted), {
      gamekey: 'purchase-123', product: { human_name: 'Example Bundle' }, purchased_at: '2026-09-01T00:00:00.000Z'
    }, 'purchase-123');
    assert.deepEqual(items, [
      {
        providerItemId: 'purchase-123:product:ebook-one', title: 'Book One', mediaType: 'book', ownership: 'owned', acquiredAt: '2026-09-01T00:00:00.000Z',
        metadata: { source: 'humble-purchase-library', sourceBundle: 'Example Bundle', purchaseId: 'purchase-123', entitlement: 'direct-download' }
      },
      {
        providerItemId: 'purchase-123:product:audio-two', title: 'Audio Two', mediaType: 'audiobook', ownership: 'owned', acquiredAt: '2026-09-01T00:00:00.000Z',
        metadata: { source: 'humble-purchase-library', sourceBundle: 'Example Bundle', purchaseId: 'purchase-123', entitlement: 'direct-download' }
      },
      {
        providerItemId: 'purchase-123:product:game-three', title: 'Game Three', mediaType: 'game', ownership: 'owned', acquiredAt: '2026-09-01T00:00:00.000Z',
        metadata: { source: 'humble-purchase-library', sourceBundle: 'Example Bundle', purchaseId: 'purchase-123', entitlement: 'direct-download' }
      },
      {
        providerItemId: 'purchase-123:entitlement:steam-key:2', title: 'Third Party Game', mediaType: 'game', ownership: 'owned', acquiredAt: '2026-09-01T00:00:00.000Z',
        metadata: { source: 'humble-purchase-library', sourceBundle: 'Example Bundle', purchaseId: 'purchase-123', entitlement: 'third-party-key', keyType: 'Steam' }
      }
    ]);
  }],
  ['queues provider series labels for review and applies a saved same-work decision', () => {
    const humbleAudio = normalizeProviderItem({
      provider: 'humble', providerItemId: 'boys-1', title: 'The Boys: Volume 1 [Dramatized Adaptation]', mediaType: 'audiobook'
    });
    const audibleAudio = normalizeProviderItem({
      provider: 'audible', providerItemId: 'B000000001', title: 'The Boys: Volume 1 [Dramatized Adaptation]: The Boys, Book 1', mediaType: 'audiobook',
      metadata: { authors: ['Garth Ennis'] }
    });
    const humbleBook = normalizeProviderItem({
      provider: 'humble', providerItemId: 'example-1', title: 'Example: Volume 1', mediaType: 'book'
    });
    const kindleBook = normalizeProviderItem({
      provider: 'kindle', providerItemId: 'B000000002', title: 'Example: Volume 1: Example Series, Book 1', mediaType: 'book', metadata: { authors: ['Example Author'] }
    });
    const providerItems = Object.fromEntries([humbleAudio, audibleAudio, humbleBook, kindleBook].map((item) => [item.id, item]));
    const candidates = findDuplicateCandidates(providerItems);
    assert.equal(candidates.length, 2);
    assert.ok(candidates.every((candidate) => candidate.reasons.some((reason) => reason.code === 'provider-series-label')));
    const boysCandidate = candidates.find((candidate) => candidate.itemIds.includes(humbleAudio.id));
    assert.equal(boysCandidate.confidence, 0.98);
    assert.equal(Object.keys(rebuildCanonicalItems(providerItems)).length, 4);
    const decisions = { [boysCandidate.id]: { decision: 'same', itemIds: boysCandidate.itemIds } };
    assert.equal(Object.keys(rebuildCanonicalItems(providerItems, decisions)).length, 3);
  }],
  ['serves only narrow, validated external ownership results', () => {
    const steam = normalizeProviderItem({ provider: 'steam', providerItemId: '123', title: 'Deathloop' });
    const database = { providerItems: { [steam.id]: steam }, providers: { steam: { connected: true, itemCount: 1 } } };
    assert.equal(isExtensionId('abcdefghijklmnopabcdefghijklmnop'), true);
    assert.deepEqual(normaliseExternalClientIds(['abcdefghijklmnopabcdefghijklmnop', 'bad', 'abcdefghijklmnopabcdefghijklmnop']), ['abcdefghijklmnopabcdefghijklmnop']);
    assert.deepEqual(handleExternalApiRequest(database, { type: 'PING' }), { ok: true, apiVersion: 1, appVersion: '0.1.0' });
    const response = handleExternalApiRequest(database, { type: 'MATCH_ITEMS', apiVersion: 1, items: [{ requestId: 'deathloop', mediaType: 'game', title: 'Deathloop' }] });
    assert.equal(response.ok, true);
    assert.equal(response.results[0].owned, true);
    assert.match(handleExternalApiRequest(database, { type: 'MATCH_ITEMS', apiVersion: 1, items: [{ mediaType: 'movie', title: 'Deathloop' }] }).error, /valid game/u);
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
