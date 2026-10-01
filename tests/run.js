import assert from 'node:assert/strict';
import { matchItems } from '../src/lib/matcher.js';
import { normalizeProviderItem, rebuildCanonicalItems } from '../src/lib/models.js';
import { createStorageWriter } from '../src/background/storage-writer.js';
import { normalizeGameTitle } from '../src/lib/normalization.js';
import { findDuplicateCandidates } from '../src/lib/duplicate-review.js';
import { handleExternalApiRequest, isExtensionId, normaliseExternalClientIds } from '../src/lib/external-api.js';
import { googleBooksCandidatesFromSearch, googleBooksEnrichment, googleBooksGenreHint, googleBooksGenreHintCandidate, googleBooksMatchClassification, googleBooksSearchUrl, highConfidenceGoogleBooksCandidate } from '../src/lib/google-books.js';
import { comicMangaEvidence, fanaticalBundleGenreHints, humbleBundleGenreHints, isConfirmedComicManga, kindleComicMangaHints, libraryBroadGenreValues, libraryGenreSubjectValues } from '../src/lib/genre-hints.js';
import { openLibraryCandidatesFromSearch, openLibraryEnrichment, openLibrarySearchUrl } from '../src/lib/open-library.js';
import { compareTitles } from '../src/lib/title-sort.js';
import { storageTests, snapshotFixture } from './storage.js';
import { providerSnapshotTests } from './provider-snapshots.js';
import { relationshipTests } from './relationships.js';
import { securityTests } from './security.js';

await import('../src/providers/metadata.js');
await import('../src/providers/steam-store.js');
await import('../src/providers/gog.js');
await import('../src/providers/epic.js');
await import('../src/providers/amazon-games.js');
await import('../src/providers/audible.js');
await import('../src/providers/kindle.js');
await import('../src/providers/amazon-video.js');
await import('../src/providers/fandango-at-home.js');
await import('../src/providers/kobo.js');
await import('../src/providers/fanatical.js');
await import('../src/providers/humble.js');
const { ownedAppIdsFromDynamicStore, newOwnedAppIds, libraryItemsFromStoreItems } = globalThis.GalacticSteamStore;
const { gogItemsFromProducts, newGogItems, pageCount } = globalThis.GalacticGog;
const { epicItemsFromLibraryPage, nextCursorFromPage } = globalThis.GalacticEpic;
const { amazonGamesItemFromCardData, amazonGamesTitleKey, isLoadMoreText, deliveryTargetFromText, timeWindowOptionsFromDocument, timeWindowHeaderFromDocument } = globalThis.GalacticAmazonGames;
const { audibleItemIdFromUrl, audibleItemFromLibraryEntry, ownershipFromLibraryAction, newAudibleItems } = globalThis.GalacticAudible;
const { kindleItemsFromOwnershipResponse, ownershipFromOriginType, newKindleItems, explicitCollectsStatement } = globalThis.GalacticKindle;
const { amazonVideoItemFromCardData, ownershipFromCardText, newAmazonVideoItems } = globalThis.GalacticAmazonVideo;
const { contentIdFromValue, fandangoItemFromCardData, newFandangoItems, expectedFandangoCountsFromDocument } = globalThis.GalacticFandangoAtHome;
const { koboItemIdFromValue, koboItemFromCardData, newKoboItems } = globalThis.GalacticKobo;
const { fanaticalMediaType, fanaticalItemsFromProjection } = globalThis.GalacticFanatical;
const { redactRedemptionValues, humbleItemsFromOrder, purchaseIdsForSync } = globalThis.GalacticHumble;

const tests = [
  ['sorts numbered media titles in reading order', () => {
    assert.deepEqual(
      ['Batman Vol. 10', 'Batman Vol. 2', 'Batman Vol. 1', 'Batman #12', 'Batman #3']
        .sort(compareTitles),
      ['Batman #3', 'Batman #12', 'Batman Vol. 1', 'Batman Vol. 2', 'Batman Vol. 10']
    );
  }],
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
  ['normalizes book format labels but keeps substantive editions distinct', () => {
    assert.equal(normalizeGameTitle('4001 A.D. TPB').normalizedTitle, '4001 a d');
    assert.equal(normalizeGameTitle('Archer & Armstrong, Vol. 3: Far Faraway (plus extra content)').normalizedTitle, 'archer and armstrong vol 3 far faraway');
    assert.equal(normalizeGameTitle('The Valiant Deluxe Edition').normalizedTitle, 'valiant deluxe');
  }],
  ['treats missing ownership evidence as unknown', () => {
    const item = normalizeProviderItem({ provider: 'kindle', providerItemId: 'B000000000', title: 'Unverified Book', mediaType: 'book' });
    assert.equal(item.ownership, 'unknown');
    assert.equal(matchItems({ [item.id]: item }, [{ mediaType: 'book', title: item.title }])[0].owned, false);
  }],
  ['preserves saved Kindle enrichment through full and quick syncs', async () => {
    const stored = {};
    const { replaceProviderItems, mergeProviderItems, saveKindleComicContents } = createStorageWriter({
      get: async (defaults) => ({ ...defaults, ...stored }),
      set: async (values) => Object.assign(stored, structuredClone(values))
    });
    const base = { providerItemId: 'B000000001', title: 'Test Comic', mediaType: 'book', ownership: 'unknown' };
    const initial = [{ ...base, metadata: { originType: 'Comixology', detailUrl:'https://www.amazon.com/dp/B000000001' } }];
    await replaceProviderItems('kindle', initial, {}, snapshotFixture('kindle', initial));
    await saveKindleComicContents([{itemId:'kindle:B000000001',sourceUrl:initial[0].metadata.detailUrl,statement:'Collects Test Comic #1-4'}]);
    const rescanned = [{ ...base, metadata: { originType: 'Purchase' }, ownership: 'owned' }];
    let database = await replaceProviderItems('kindle', rescanned, {}, snapshotFixture('kindle', rescanned));
    assert.equal(database.providerItems['kindle:B000000001'].ownership, 'owned');
    assert.equal(database.providerItems['kindle:B000000001'].metadata.enrichment.kindleProductComicContents.statement, 'Collects Test Comic #1-4');
    database = await mergeProviderItems('kindle', [{ ...base, metadata: { originType: 'Purchase' }, ownership: 'owned' }]);
    assert.equal(database.providerItems['kindle:B000000001'].metadata.enrichment.kindleProductComicContents.statement, 'Collects Test Comic #1-4');
  }],
  ['matches an exact normalized title across providers', () => {
    const providerItems = Object.fromEntries([
      normalizeProviderItem({ provider: 'steam', providerItemId: '123', title: 'SOMA', ownership: 'owned' }),
      normalizeProviderItem({ provider: 'gog', providerItemId: 'abc', title: 'The SOMA', ownership: 'owned' })
    ].map((item) => [item.id, item]));
    const [result] = matchItems(providerItems, [{ requestId: 'soma', mediaType: 'game', title: 'SOMA' }]);
    assert.equal(result.owned, true);
    assert.equal(result.confidence, 1);
    assert.equal(result.matches.length, 2);
    assert.equal(Object.keys(rebuildCanonicalItems(providerItems)).length, 1);
  }],
  ['returns named game editions as possible matches, never exact ownership', () => {
    const steelrising = normalizeProviderItem({ provider: 'steam', providerItemId: '99', title: 'Steelrising', ownership: 'owned' });
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
    assert.deepEqual(newOwnedAppIds(['440', '570', '620'], ['440', '570']), ['620']);
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
    assert.deepEqual(newGogItems([{ providerItemId: '1' }, { providerItemId: '2' }], ['1']).map((item) => item.providerItemId), ['2']);
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
  ['keeps delivered Amazon Games claims from the Luna collection', () => {
    assert.deepEqual(amazonGamesItemFromCardData({
      providerItemId: 'f768b9eab0028c35991883bc9e3afbce-1-body', title: 'Wall World 2',
      imageUrl: 'https://images.example.test/wall-world.jpg?size=large', deliveryText: 'Delivered', deliveryTarget: 'Amazon Games library'
    }), {
      providerItemId: 'f768b9eab0028c35991883bc9e3afbce-1', title: 'Wall World 2', mediaType: 'game', ownership: 'claimed',
      metadata: { source: 'amazon-games-collection', detailUrl: '', imageUrl: 'https://images.example.test/wall-world.jpg', delivery: 'Amazon Games library' }
    });
    assert.equal(amazonGamesItemFromCardData({
      providerItemId: 'f768b9eab0028c35991883bc9e3afbce-1-body', title: 'Wall World 2', deliveryText: 'Delivered', deliveryTarget: 'Epic Games Store'
    }), null);
    assert.equal(isLoadMoreText('See 10 more'), true);
    assert.equal(isLoadMoreText('See more'), true);
    assert.equal(isLoadMoreText('Load 10 more'), false);
    assert.equal(deliveryTargetFromText('Collected on\n\nSep 18, 2026\n\nSent to\n\nAmazon Games library\n\nAmazon account\nSean'), 'Amazon Games library');
    assert.equal(amazonGamesTitleKey('  Wall World 2! '), amazonGamesTitleKey('Wall World 2'));
    const timeWindowDocument = {
      querySelectorAll: () => [
        { textContent: 'Past 3 months', getAttribute: () => 'past-3-months' },
        { textContent: '2026', getAttribute: () => '2026' },
        { textContent: '2025', getAttribute: () => '2025' }
      ]
    };
    assert.deepEqual(timeWindowOptionsFromDocument(timeWindowDocument), [{ id: '2026', label: '2026' }, { id: '2025', label: '2025' }]);
    const otherDropdown = { querySelector: () => null };
    const timeWindowDropdown = { querySelector: (selector) => selector === '[data-a-target="time-window-filter-dropdown"]' ? {} : null };
    assert.equal(timeWindowHeaderFromDocument({ querySelectorAll: () => [otherDropdown, timeWindowDropdown] }), timeWindowDropdown);
  }],
  ['keeps Audible audiobook identity and available library metadata', () => {
    assert.deepEqual(newAudibleItems([{ providerItemId: 'B000000001' }, { providerItemId: 'B000000002' }], ['B000000001']).map((item) => item.providerItemId), ['B000000002']);
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
    assert.ok(Object.values(canonical).some(item => item.mediaType === 'audiobook' && item.normalizedTitle === 'project hail mary'));
    assert.ok(Object.values(canonical).some(item => item.mediaType === 'game' && item.normalizedTitle === 'project hail mary'));
  }],
  ['keeps Kindle books and their available Content Library metadata', () => {
    assert.deepEqual(newKindleItems([{ providerItemId: 'B000000001' }, { providerItemId: 'B000000002' }], ['B000000001']).map((item) => item.providerItemId), ['B000000002']);
    assert.equal(ownershipFromOriginType('Purchase'), 'owned');
    assert.equal(ownershipFromOriginType('KindleUnlimited'), 'subscription');
    assert.equal(ownershipFromOriginType('ComicsUnlimited'), 'subscription');
    assert.equal(ownershipFromOriginType('Comixology'), 'unknown');
    assert.equal(ownershipFromOriginType('Pottermore'), 'unknown');
    assert.equal(ownershipFromOriginType('PublicLibraryLending'), 'borrowed');
    assert.equal(ownershipFromOriginType('PersonalLending'), 'borrowed');
    assert.equal(ownershipFromOriginType('Rental'), 'rental');
    assert.equal(ownershipFromOriginType('Sample'), 'unknown');
    assert.equal(explicitCollectsStatement('An acclaimed edition. Collects Batman #1–6 and Detective Comics #27. More details.'), 'Collects Batman #1–6 and Detective Comics #27');
    assert.equal(explicitCollectsStatement('A book about collecting stamps.'), '');
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
        asin: 'B012345678', source: 'amazon-kindle-content-library', detailUrl: 'https://www.amazon.com/dp/B012345678', libraryCategory: 'books',
        authors: ['Neil Gaiman'], series: ['The Sandman'], collections: ['Comics'], originType: 'Purchase',
        contentType: 'Ebook', itemStatus: 'Active', publisher: 'DC Comics', publicationDate: '2024-01-15', format: 'KFX'
      }
    }]);
    const book = normalizeProviderItem({ provider: 'kindle', providerItemId: 'B012345678', title: 'Sandman & More', mediaType: 'book' });
    assert.ok(Object.values(rebuildCanonicalItems({ [book.id]: book })).some(item => item.mediaType === 'book' && item.normalizedTitle === 'sandman and more'));
  }],
  ['keeps a user-selected Open Library work and subjects as attributed enrichment', () => {
    const url = new URL(openLibrarySearchUrl({ title: 'Watchmen', authors: ['Alan Moore'] }));
    assert.equal(url.origin, 'https://openlibrary.org');
    assert.equal(url.searchParams.get('title'), 'Watchmen');
    assert.equal(url.searchParams.get('author'), 'Alan Moore');
    const [candidate] = openLibraryCandidatesFromSearch({ docs: [{
      key: '/works/OL123W', title: 'Watchmen', author_name: ['Alan Moore', 'Dave Gibbons'],
      subject: ['Comics & Graphic Novels', 'Superheroes'], first_publish_year: 1987,
      isbn: ['9780930289232'], edition_key: ['OL123M']
    }] });
    assert.deepEqual(openLibraryEnrichment(candidate, '2026-09-18T00:00:00.000Z'), {
      source: 'open-library', workKey: '/works/OL123W', sourceUrl: 'https://openlibrary.org/works/OL123W', title: 'Watchmen',
      authors: ['Alan Moore', 'Dave Gibbons'], subjects: ['Comics & Graphic Novels', 'Superheroes'], firstPublishYear: 1987,
      isbn: ['9780930289232'], editionKeys: ['OL123M'], appliedAt: '2026-09-18T00:00:00.000Z'
    });
  }],
  ['auto-selects only a high-confidence title-and-author Google Books result', () => {
    const url = new URL(googleBooksSearchUrl({ title: 'Little Brother', authors: ['Doctorow, Cory'], apiKey: 'AIzaExampleKeyThatIsLongEnough' }));
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.match(url.searchParams.get('q'), /intitle:Little Brother/u);
    const candidates = googleBooksCandidatesFromSearch({ items: [{
      id: 'volume-123', volumeInfo: { title: 'Little Brother', authors: ['Cory Doctorow'], categories: ['Young Adult Fiction'],
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780765319852' }], publisher: 'Tor Teen', publishedDate: '2008-04-29', pageCount: 382, language: 'en' }
    }, { id: 'volume-456', volumeInfo: { title: 'Little Brother: A Study Guide', authors: ['Other Author'] } }] });
    const candidate = highConfidenceGoogleBooksCandidate({ title: 'Little Brother', authors: ['Doctorow, Cory'] }, candidates);
    assert.equal(candidate.volumeId, 'volume-123');
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'Little Brother (Tenth Anniversary Edition)', authors: ['Cory Doctorow, Neil Gaiman'] }, candidates), null); // A related work cannot supply another edition's ISBN/page count.
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'Little Brother: A Novel About Hacking', authors: ['Cory Doctorow'] }, candidates)?.volumeId, 'volume-123');
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'I Am Number Four: A #1 New York Times Bestselling YA Sci-Fi Thriller about an Alien Teen with Powers Fighting to Save Earth (Lorien Legacies)', authors: ['Pittacus Lore'] }, [{ ...candidate, title: 'I Am Number Four', authors: ['Pittacus Lore'] }])?.volumeId, 'volume-123');
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'Amazing Spider-Man by J.M.S. Ultimate Collection Book One (Amazing Spider-Man (1999-2013))', authors: ['Cory Doctorow'] }, [{ ...candidate, title: 'Amazing Spider-Man By JMS Ultimate Collection Book 1' }])?.volumeId, 'volume-123');
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'Little Brother #1', authors: ['Cory Doctorow'] }, candidates), null);
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'Advanced Reading, Writing, and Grammar for Test Prep', authors: ['Cory Doctorow'] }, [{ ...candidate, title: 'Advanced Reading, Writing, and Grammar' }])?.volumeId, 'volume-123');
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'Action Comics, Vol. 3: At the End of Days (The New 52)', authors: ['Cory Doctorow'] }, [{ ...candidate, title: 'Superman - Action Comics Vol. 3: At the End of Days' }])?.volumeId, 'volume-123');
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'Alias Ultimate Collection Vol. 1', authors: ['Cory Doctorow'] }, [{ ...candidate, title: 'Alias' }]), null);
    const aliasHint = googleBooksGenreHintCandidate({ title: 'Alias Ultimate Collection Vol. 1', authors: ['Cory Doctorow'] }, [{ ...candidate, title: 'Alias', categories: ['Comics & Graphic Novels'] }]);
    assert.equal(aliasHint?.volumeId, 'volume-123');
    assert.deepEqual(googleBooksGenreHint(aliasHint, '2026-09-18T00:00:00.000Z'), {
      source: 'google-books', confidence: 'author-and-title-stem', candidateVolumeId: 'volume-123', candidateTitle: 'Alias', sourceUrl: 'https://books.google.com/books?id=volume-123', categories: ['Comics & Graphic Novels'], appliedAt: '2026-09-18T00:00:00.000Z'
    });
    assert.equal(googleBooksGenreHintCandidate({ title: 'Alias Ultimate Collection Vol. 1', authors: ['Someone Else'] }, [{ ...candidate, title: 'Alias', categories: ['Comics & Graphic Novels'] }]), null);
    assert.equal(highConfidenceGoogleBooksCandidate({ title: 'Little Brother', authors: ['Someone Else'] }, candidates), null);
    assert.equal(googleBooksMatchClassification({ title: 'Little Brother', authors: ['Someone Else'] }, candidates), 'author-variant');
    assert.equal(googleBooksMatchClassification({ title: 'Not This Book', authors: ['Someone Else'] }, candidates), 'title-variant');
    assert.equal(googleBooksMatchClassification({ title: 'Little Brother', authors: ['Cory Doctorow'] }, []), 'no-results');
    assert.deepEqual(googleBooksEnrichment(candidate, '2026-09-18T00:00:00.000Z'), {
      source: 'google-books', volumeId: 'volume-123', sourceUrl: 'https://books.google.com/books?id=volume-123', title: 'Little Brother', subtitle: '',
      authors: ['Cory Doctorow'], categories: ['Young Adult Fiction'], isbn: ['9780765319852'], publisher: 'Tor Teen', publishedDate: '2008-04-29', pageCount: 382, language: 'en', appliedAt: '2026-09-18T00:00:00.000Z'
    });
  }],
  ['keeps Amazon Video movie and TV entitlement identities without guessing ambiguous ownership', () => {
    assert.equal(ownershipFromCardText('Purchased in HD'), 'owned');
    assert.equal(ownershipFromCardText('Rental expires in 12 days'), 'rental');
    assert.equal(ownershipFromCardText('Watch now'), 'unknown');
    assert.deepEqual(newAmazonVideoItems([{ providerItemId: 'known' }, { providerItemId: 'new' }], ['known']).map((item) => item.providerItemId), ['new']);
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
    assert.ok(Object.values(rebuildCanonicalItems({ [movie.id]: movie })).some(item => item.mediaType === 'movie' && item.normalizedTitle === 'arrival'));
  }],
  ['keeps Fandango at Home movie and TV library identities', () => {
    assert.equal(contentIdFromValue('https://athome.fandango.com/content/detail/ABCD-1234?ref=library'), 'ABCD-1234');
    assert.equal(contentIdFromValue('https://athome.fandango.com/content/browse/details/Warm-Bodies/410824'), '410824');
    assert.deepEqual(newFandangoItems([{ providerItemId: 'known' }, { providerItemId: 'new' }], ['known']).map((item) => item.providerItemId), ['new']);
    assert.deepEqual(fandangoItemFromCardData({
      providerItemId: 'programId=series-123', title: 'Star Trek: Strange New Worlds, Season 1',
      detailUrl: 'https://athome.fandango.com/content/detail/series-123', imageUrl: 'https://images.fandango.com/cover.jpg',
      typeText: 'TV Season', ownershipText: 'Purchased'
    }), {
      providerItemId: 'series-123', title: 'Star Trek: Strange New Worlds, Season 1', mediaType: 'tv', ownership: 'owned',
      metadata: {
        source: 'fandango-at-home-library', detailUrl: 'https://athome.fandango.com/content/detail/series-123', imageUrl: 'https://images.fandango.com/cover.jpg', cardType: 'TV Season'
      }
    });
    assert.equal(fandangoItemFromCardData({ providerItemId: '410824', title: 'Warm Bodies', detailUrl: 'https://athome.fandango.com/content/browse/details/Warm-Bodies/410824', typeText: 'My Movies (346)' })?.mediaType, 'movie');
    assert.equal(fandangoItemFromCardData({ providerItemId: 'tv-123', title: 'Example Show', detailUrl: 'https://athome.fandango.com/content/browse/details/Example-Show/tv-123', typeText: 'My TV Shows (39)' })?.mediaType, 'tv');
    assert.deepEqual(expectedFandangoCountsFromDocument({ querySelectorAll: () => [{ textContent: 'My Library' }, { textContent: 'My Movies (346)' }, { textContent: 'My TV Shows (39)' }] }), { movies: 346, tv: 39 });
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
      providerItemId: 'ec296889-f3ba-4eb4-bb64-ab0d16e7cbe2', title: 'Kobo Read Now Book', mediaType: 'book', ownership: 'unknown',
      metadata: {
        source: 'kobo-my-books-library', ownershipBasis:'library-presence-only', detailUrl: 'https://readnow.kobo.com/ec296889-f3ba-4eb4-bb64-ab0d16e7cbe2', imageUrl: '', authors: [], series: [], format: 'ebook'
      }
    });
    assert.deepEqual(koboItemFromCardData({
      providerItemId: 'bookId=1f2e3d4c-1234-5678-9abc-def012345678', title: '  A Memory Called Empire ',
      detailUrl: 'https://www.kobo.com/us/en/ebook/a-memory-called-empire?utm_source=library', imageUrl: 'https://cdn.kobo.com/cover.jpg',
      typeText: 'eBook', authors: ['Arkady Martine'], series: ['Teixcalaan']
    }), {
      providerItemId: '1f2e3d4c-1234-5678-9abc-def012345678', title: 'A Memory Called Empire', mediaType: 'book', ownership: 'unknown',
      metadata: {
        source: 'kobo-my-books-library', ownershipBasis:'library-presence-only', detailUrl: 'https://www.kobo.com/us/en/ebook/a-memory-called-empire', imageUrl: 'https://cdn.kobo.com/cover.jpg',
        authors: ['Arkady Martine'], series: ['Teixcalaan'], format: 'ebook'
      }
    });
    assert.deepEqual(koboItemFromCardData({
      providerItemId: 'book-2', title: 'Kobo Card Attribute Title', detailUrl: 'https://www.kobo.com/us/en/ebook/kobo-card-attribute-title', typeText: 'eBook'
    })?.title, 'Kobo Card Attribute Title');
    assert.deepEqual(newKoboItems([
      { providerItemId: 'known-book' }, { providerItemId: 'NEW-BOOK' }, { providerItemId: 'another-book' }
    ], ['Known-Book', 'another-book']).map((item) => item.providerItemId), ['NEW-BOOK']);
    const audiobook = normalizeProviderItem({ provider: 'kobo', providerItemId: 'audio-1', title: 'Kobo Audio', mediaType: 'audiobook' });
    assert.ok(Object.values(rebuildCanonicalItems({ [audiobook.id]: audiobook })).some(item => item.mediaType === 'audiobook' && item.normalizedTitle === 'kobo audio'));
  }],
  ['keeps Fanatical game, book, and audiobook order items without order secrets', () => {
    assert.equal(fanaticalMediaType('comic'), 'book');
    assert.equal(fanaticalMediaType('software'), null);
    assert.deepEqual(fanaticalItemsFromProjection({ items: [
      { sourceItemId: 'game-leaf-123', title: 'Example Game', mediaType: 'game', platforms: ['windows'], externalIds: { steamAppId: '12345' }, bundle: { sourceItemId: 'bundle-123', title: 'Example Bundle' }, purchaseDate: '2026-09-26T00:00:00.000Z' },
      { sourceItemId: 'comic-leaf-123', title: 'Example Comic', mediaType: 'comic', externalIds: { isbn: '9781234567890' }, bundle: { sourceItemId: 'bundle-123', title: 'Example Bundle' } },
      { sourceItemId: 'asset-leaf-123', title: 'Ignore Asset', mediaType: 'software' }
    ] }), [
      { providerItemId: 'game-leaf-123', title: 'Example Game', mediaType: 'game', ownership: 'owned', platform: ['windows'], acquiredAt: '2026-09-26T00:00:00.000Z', metadata: { source: 'fanatical-order-history', bundleId: 'bundle-123', bundleTitle: 'Example Bundle', bundleSlug: '', slug: '', drm: [], formats: [], steamAppId: '12345' } },
      { providerItemId: 'comic-leaf-123', title: 'Example Comic', mediaType: 'book', ownership: 'owned', platform: [], acquiredAt: null, metadata: { source: 'fanatical-order-history', bundleId: 'bundle-123', bundleTitle: 'Example Bundle', bundleSlug: '', slug: '', drm: [], formats: [], isbn: '9781234567890' } }
    ]);
  }],
  ['imports Humble books and game entitlements without retaining redemption values', () => {
    const purchaseSync = purchaseIdsForSync([{ gamekey: 'old' }, { key: 'new' }, { gamekey: 'new' }], ['old']);
    assert.deepEqual(purchaseSync.purchaseIds, ['old', 'new']);
    assert.deepEqual(purchaseSync.newPurchaseIds, ['new']);
    assert.deepEqual([...purchaseSync.knownPurchaseIds], ['old']);
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
    assert.deepEqual(humbleBundleGenreHints(normalizeProviderItem({
      provider: 'humble', providerItemId: 'comic-1', title: 'A Comic Title', mediaType: 'book', metadata: { sourceBundle: 'Humble Manga Bundle: Kodansha Comics' }
    })), [{
      source: 'humble-bundle-name', confidence: 'explicit-bundle-name', category: 'Comics & Graphic Novels', evidence: 'Humble Manga Bundle: Kodansha Comics'
    }]);
    assert.deepEqual(humbleBundleGenreHints(normalizeProviderItem({
      provider: 'humble', providerItemId: 'audio-1', title: 'Comic Audio', mediaType: 'audiobook', metadata: { sourceBundle: 'Humble Comics Bundle' }
    })), []);
    const kindleComic = normalizeProviderItem({ provider: 'kindle', providerItemId: 'B012345678', title: 'A Graphic Story', mediaType: 'book', metadata: { originType: 'Comixology' } });
    assert.deepEqual(kindleComicMangaHints(kindleComic), [{ source: 'kindle-library-type', confidence: 'provider-explicit', category: 'Comics & Graphic Novels', evidence: 'Comixology' }]);
    const fanaticalComic = normalizeProviderItem({ provider: 'fanatical', providerItemId: 'fanatical-comic-1', title: 'A Comic Story', mediaType: 'book', metadata: { bundleTitle: 'Fantastic Manga & Comics Bundle' } });
    assert.deepEqual(fanaticalBundleGenreHints(fanaticalComic), [{ source: 'fanatical-bundle-name', confidence: 'explicit-bundle-name', category: 'Comics & Graphic Novels', evidence: 'Fantastic Manga & Comics Bundle' }]);
    assert.equal(isConfirmedComicManga(normalizeProviderItem({ provider: 'kindle', providerItemId: 'B012345679', title: 'Batman: Guessing Is Not Enough', mediaType: 'book' })), false);
    assert.ok(comicMangaEvidence(normalizeProviderItem({ provider: 'gog', providerItemId: 'comic-category-1', title: 'Explicit Category', mediaType: 'book', metadata: { enrichment: { googleBooks: { categories: ['Manga'] } } } })).length);
    assert.deepEqual(libraryGenreSubjectValues(normalizeProviderItem({
      provider: 'humble', providerItemId: 'comic-2', title: 'Another Comic', mediaType: 'book',
      metadata: { sourceBundle: 'Humble Manga Bundle', enrichment: { openLibrary: { subjects: ['Manga', 'Comics'] }, googleBooks: { categories: ['Comics & Graphic Novels'] }, googleBooksGenreHint: { categories: ['Comics & Graphic Novels'] } } }
    })), ['Manga', 'Comics', 'Comics & Graphic Novels']);
    assert.deepEqual(libraryBroadGenreValues(normalizeProviderItem({
      provider: 'humble', providerItemId: 'comic-3', title: 'Batman', mediaType: 'book',
      metadata: { enrichment: { openLibrary: { subjects: ['Batman', 'Science fiction', 'History'] } } }
    })), ['Comics & Graphic Novels', 'Science Fiction & Fantasy', 'History']);
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
    assert.equal(Object.keys(rebuildCanonicalItems(providerItems, decisions)).length, 4); // Same work is a relationship, not edition identity.
  }],
  ['serves only narrow, validated external ownership results', () => {
    const steam = normalizeProviderItem({ provider: 'steam', providerItemId: '123', title: 'Deathloop', ownership: 'owned' });
    const database = { providerItems: { [steam.id]: steam }, providers: { steam: { connected: true, itemCount: 1 } } };
    assert.equal(isExtensionId('abcdefghijklmnopabcdefghijklmnop'), true);
    assert.deepEqual(normaliseExternalClientIds(['abcdefghijklmnopabcdefghijklmnop', 'bad', 'ponmlkjihgfedcbaponmlkjihgfedcba', 'abcdefghijklmnopabcdefghijklmnop']), ['abcdefghijklmnopabcdefghijklmnop', 'ponmlkjihgfedcbaponmlkjihgfedcba']);
    assert.deepEqual(handleExternalApiRequest(database, { type: 'PING' }), { ok: true, apiVersion: 1, appVersion: '0.1.0' });
    const response = handleExternalApiRequest(database, { type: 'MATCH_ITEMS', apiVersion: 1, items: [{ requestId: 'deathloop', mediaType: 'game', title: 'Deathloop' }] });
    assert.equal(response.ok, true);
    assert.equal(response.results[0].owned, true);
    assert.match(handleExternalApiRequest(database, { type: 'MATCH_ITEMS', apiVersion: 1, items: [{ mediaType: 'movie', title: 'Deathloop' }] }).error, /valid game/u);
  }]
];

let failures = 0;
for (const [name, run] of [...tests, ...storageTests, ...providerSnapshotTests, ...relationshipTests, ...securityTests]) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}
if (failures) process.exitCode = 1;
else console.log(`\n${tests.length + storageTests.length + providerSnapshotTests.length + relationshipTests.length + securityTests.length} tests passed.`);
