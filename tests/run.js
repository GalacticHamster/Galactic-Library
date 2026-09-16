import assert from 'node:assert/strict';
import { matchItems } from '../src/lib/matcher.js';
import { normalizeProviderItem, rebuildCanonicalItems } from '../src/lib/models.js';
import { normalizeGameTitle } from '../src/lib/normalization.js';

await import('../src/providers/steam-store.js');
await import('../src/providers/gog.js');
const { ownedAppIdsFromDynamicStore, libraryItemsFromStoreItems } = globalThis.GalacticSteamStore;
const { gogItemsFromProducts, pageCount } = globalThis.GalacticGog;

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
