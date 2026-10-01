import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createStorageWriter } from '../src/background/storage-writer.js';
import { createStorageClient, createBackup, parseBackup } from '../src/lib/storage.js';
import { createEmptyDatabase, normalizeProviderItem, rebuildCanonicalItems } from '../src/lib/models.js';
import { DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY } from '../src/lib/constants.js';
import { STORAGE_MESSAGE_TYPE } from '../src/lib/storage-protocol.js';
import { completeProviderSnapshot, completedScope } from '../src/lib/provider-snapshot.js';

// Fixtures represent an already validated complete source, not a partial scan.
export function snapshotFixture(provider, items) {
  const scopes = provider === 'kindle' ? ['books', 'personal-documents'].map((id) => {
    const size = items.filter((item) => (item.metadata?.libraryCategory ?? 'books') === id).length;
    return { ...completedScope(id, size, size, 'reported-count'), duplicateCount: 0 };
  }) : provider === 'fandango-at-home' ? ['movie','tv'].map(type => {const size=items.filter(item=>item.mediaType===type).length; return completedScope(type,size,size,'reported-count');}) : [completedScope('library', items.length, items.length, 'reported-count')];
  return completeProviderSnapshot(provider, items, scopes);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Chrome copies storage values; an in-memory reference would hide lost writes.
// Yield on every access so overlapping read/modify/write sequences are exposed.
function memoryStorage() {
  const values = {};
  const commits = [];
  let active = 0;
  let highWater = 0;
  let getCount = 0;
  let heldRead = null;
  let failSet = false;
  async function access(operation) {
    active += 1;
    highWater = Math.max(highWater, active);
    try {
      await nextTurn();
      return await operation();
    } finally { active -= 1; }
  }
  return {
    values,
    commits,
    get highWater() { return highWater; },
    get getCount() { return getCount; },
    holdNextRead() {
      heldRead = { started: deferred(), released: deferred() };
      return heldRead;
    },
    failNextWrite() { failSet = true; },
    area: {
      get: (defaults) => access(async () => {
        getCount += 1;
        if (heldRead) {
          const held = heldRead;
          heldRead = null;
          held.started.resolve();
          await held.released.promise;
        }
        return structuredClone({ ...defaults, ...Object.fromEntries(Object.keys(defaults).filter((key) => key in values).map((key) => [key, values[key]])) });
      }),
      set: (updates) => access(() => {
        if (failSet) {
          failSet = false;
          throw new Error('Simulated storage write failure.');
        }
        Object.assign(values, structuredClone(updates));
        if (updates[DATABASE_STORAGE_KEY]) commits.push(Object.keys(updates[DATABASE_STORAGE_KEY].providers).sort());
      }),
      remove: (keys) => access(() => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
        commits.push('clear');
      })
    }
  };
}

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const root = `chrome-extension://${extensionId}/`;
const kindleBooks = [1, 2].map((number) => ({
  providerItemId: `B00000000${number}`,
  title: `Test Comic Vol. ${number}`,
  mediaType: 'book',
  ownership: 'owned',
  metadata: {
    originType: 'Purchase', contentType: 'Comic', authors: ['Test Author'],
    detailUrl: `https://www.amazon.com/dp/B00000000${number}`
  }
}));
const itemIds = kindleBooks.map((item) => `kindle:${item.providerItemId}`);
const review = { id: [...itemIds].sort().join('\u0000'), itemIds };
const openLibrary = { source: 'open-library', workKey: '/works/OL1W', subjects: ['Comics'] };
const googleBooks = { source: 'google-books', volumeId: 'volume-1', categories: ['Comics'] };
const googleHint = { source: 'google-books', confidence: 'author-and-title-stem', categories: ['Comics & Graphic Novels'] };
const comicContents = { itemId: itemIds[0], sourceUrl: kindleBooks[0].metadata.detailUrl, statement: 'Collects Test Comic #1-4' };

let workerNumber = 0;
export async function withWorker(run, {accessGate = Promise.resolve(), accessError = null} = {}) {
  const previousChrome = globalThis.chrome;
  const memory = memoryStorage();
  const listeners = [];
  const externalListeners = [];
  const accessLevels = [];
  memory.area.setAccessLevel = async value => {accessLevels.push(['local',value.accessLevel]); await accessGate; if(accessError) throw accessError;};
  const sessionValues = {};
  const session = {setAccessLevel:async value => {accessLevels.push(['session',value.accessLevel]); await accessGate; if(accessError) throw accessError;},
    get:async key => ({[key]:structuredClone(sessionValues[key])}), set:async value => Object.assign(sessionValues,structuredClone(value)), remove:async key => {delete sessionValues[key];}};
  const runtime = {
    id: extensionId,
    getURL: (path) => root + path,
    onMessage: { addListener: (listener) => listeners.push(listener) },
    onMessageExternal: { addListener: listener => externalListeners.push(listener) },
    onInstalled: { addListener: () => {} }
  };
  const dispatchTo = handlers => (request, sender) => new Promise((resolve, reject) => {
    let handled = false;
    let replied = false;
    const respond = (response) => {
      replied = true;
      // Mirror Chrome's JSON message boundary between independent contexts.
      resolve(JSON.parse(JSON.stringify(response)));
    };
    try {
      for (const listener of handlers) {
        if (listener(JSON.parse(JSON.stringify(request)), sender, respond) === true) handled = true;
      }
      if (!handled && !replied) reject(new Error('No message handler responded.'));
    } catch (error) { reject(error); }
  });
  const dispatch = dispatchTo(listeners);
  const dispatchExternal = dispatchTo(externalListeners);
  globalThis.chrome = { runtime, storage: { local: memory.area, session } };
  try {
    // Load the real worker: provider handlers and page clients must share its
    // single writer. Separate clients simulate separate Library page contexts.
    await import(`../src/background/service-worker.js?storage-test=${++workerNumber}`);
    const page = (name) => createStorageClient((request) => dispatch(request, { id: extensionId, url: `${root}options.html#${name}` }));
    const importItems = (provider, items, mode = 'full') => dispatch({ type: 'IMPORT_PROVIDER_ITEMS', provider, items, mode, snapshot: mode === 'full' ? snapshotFixture(provider, items) : undefined }, {
      id: extensionId,
      url: { steam: 'https://store.steampowered.com/', gog: 'https://www.gog.com/account', kindle: 'https://www.amazon.com/hz/mycd/' }[provider]
    }).then((response) => {
      if (!response.ok) throw new Error(response.error);
      return response;
    });
    await run({ memory, dispatch, dispatchExternal, pageA: page('a'), pageB: page('b'), importItems, accessLevels });
    assert.ok(memory.highWater <= 1, 'Storage operations overlapped instead of sharing the writer.');
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
}

function game(id, title = `Game ${id}`) {
  return { providerItemId: id, title, mediaType: 'game', ownership: 'owned' };
}

export const storageTests = [
  ['concurrent provider tabs retain both full imports in the actual worker', () => withWorker(async ({ memory, pageA, importItems }) => {
    const responses = await Promise.all([
      importItems('steam', [game('1')]),
      importItems('gog', [game('2')])
    ]);
    assert.deepEqual(responses.map((response) => response.gameCount), [1, 1]);
    const database = await pageA.getDatabase();
    assert.deepEqual(Object.keys(database.providerItems).sort(), ['gog:2', 'steam:1']);
    assert.deepEqual(memory.commits, [['steam'], ['gog', 'steam']]);
  })],
  ['all enrichment and review writes survive imports from overlapping contexts', () => withWorker(async ({ pageA, pageB, importItems, dispatch }) => {
    await importItems('kindle', kindleBooks);
    await pageA.saveManualMatchDecision({ ...review, id: 'obsolete' }, 'different');
    await Promise.all([
      pageA.saveOpenLibraryEnrichment([itemIds[0]], openLibrary),
      importItems('steam', [game('1')]),
      pageB.saveGoogleBooksEnrichments([{ itemIds: [itemIds[0]], enrichment: googleBooks }]),
      importItems('kindle', [kindleBooks[0]], 'incremental'),
      dispatch({ type: 'SAVE_KINDLE_COMIC_CONTENTS', entries: [comicContents] }, { id: extensionId, url: 'https://www.amazon.com/hz/mycd/' }).then((response) => assert.equal(response.ok, true, response.error)),
      pageA.saveGoogleBooksGenreHints([{ itemIds: [itemIds[0]], hint: googleHint }]),
      pageB.saveManualMatchDecision(review, 'same'),
      importItems('gog', [game('2')]),
      importItems('kindle', kindleBooks),
      pageA.removeManualMatchDecision('obsolete')
    ]);
    const database = await pageB.getDatabase();
    const enrichment = database.providerItems[itemIds[0]].metadata.enrichment;
    assert.equal(enrichment.openLibrary.workKey, '/works/OL1W');
    assert.equal(enrichment.googleBooks.volumeId, 'volume-1');
    assert.deepEqual(enrichment.googleBooksGenreHint.categories, googleHint.categories);
    assert.equal(enrichment.kindleProductComicContents.statement, comicContents.statement);
    assert.equal(database.manualMatchDecisions[review.id].decision, 'same');
    assert.equal(database.manualMatchDecisions.obsolete, undefined);
    assert.equal(database.providers.kindle.bookCount, 2);
    assert.equal(database.providers.steam.itemCount, 1);
    assert.equal(database.providers.gog.itemCount, 1);
    assert.equal(Object.values(database.canonicalItems).filter((item) => item.mediaType === 'book').length, 2);
  })],
  ['queued reads and acknowledgements respect admission order while a write is blocked', () => withWorker(async ({ memory, pageA, importItems }) => {
    const held = memory.holdNextRead();
    let acknowledged = false;
    const first = importItems('steam', [game('1')]).then(() => { acknowledged = true; });
    await held.started.promise;
    const read = pageA.getDatabase();
    const later = importItems('gog', [game('2')]);
    await nextTurn();
    assert.equal(acknowledged, false, 'Acknowledged an import before its storage commit.');
    assert.equal(memory.getCount, 1, 'A later operation read during an earlier mutation.');
    held.released.resolve();
    await first;
    assert.deepEqual(Object.keys((await read).providerItems), ['steam:1']);
    await later;
    assert.deepEqual(Object.keys((await pageA.getDatabase()).providerItems).sort(), ['gog:2', 'steam:1']);
  })],
  ['restore replaces prior queued writes and retains subsequent imports and decisions', () => withWorker(async ({ pageA, pageB, importItems }) => {
    const backup = createEmptyDatabase();
    for (const item of kindleBooks) {
      const record = normalizeProviderItem({ ...item, provider: 'kindle' });
      backup.providerItems[record.id] = record;
    }
    backup.manualMatchDecisions.saved = { ...review, decision: 'different' };
    backup.canonicalItems = rebuildCanonicalItems(backup.providerItems, backup.manualMatchDecisions);
    await Promise.all([
      importItems('steam', [game('1')]),
      pageA.restoreDatabase(parseBackup(createBackup(backup))),
      importItems('gog', [game('2')]),
      pageB.saveManualMatchDecision(review, 'same'),
      pageA.saveOpenLibraryEnrichment([itemIds[0]], openLibrary)
    ]);
    const database = await pageB.getDatabase();
    assert.equal(database.providerItems['steam:1'], undefined);
    assert.ok(database.providerItems['gog:2']);
    assert.ok(database.providerItems[itemIds[1]]);
    assert.equal(database.manualMatchDecisions.saved, undefined); // Migrated pair key; the subsequent review supersedes it.
    assert.equal(database.manualMatchDecisions[review.id].decision, 'same');
    assert.equal(database.providerItems[itemIds[0]].metadata.enrichment.openLibrary.workKey, openLibrary.workKey);
  })],
  ['clear removes preceding writes and settings before later imports run', () => withWorker(async ({ memory, pageA, pageB, importItems }) => {
    await importItems('kindle', kindleBooks);
    await pageA.saveOpenLibraryEnrichment([itemIds[0]], openLibrary);
    await pageB.saveManualMatchDecision(review, 'same');
    await Promise.all([
      pageA.saveGoogleBooksApiKey('a'.repeat(24)),
      pageB.addAllowedExternalClientId(extensionId),
      pageA.startGoogleBooksEnrichmentJob(),
      pageB.saveShowEnrichmentActions(false)
    ]);
    const first = importItems('steam', [game('1')]);
    const clear = pageA.clearDatabase();
    const emptyRead = pageB.getDatabase();
    const later = importItems('gog', [game('2')]);
    await Promise.all([first, clear, later]);
    assert.deepEqual((await emptyRead), createEmptyDatabase());
    const database = await pageA.getDatabase();
    assert.deepEqual(Object.keys(database.providerItems), ['gog:2']);
    assert.deepEqual(database.manualMatchDecisions, {});
    for (const key of [EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]) assert.equal(memory.values[key], undefined);
    assert.equal(await pageB.getShowEnrichmentActions(), true);
  })],
  ['restore and clear take effect at their exact positions in the shared queue', () => withWorker(async ({ pageA, pageB }) => {
    const backup = createEmptyDatabase();
    const record = normalizeProviderItem({ ...game('1'), provider: 'steam' });
    backup.providerItems[record.id] = record;
    await Promise.all([pageA.restoreDatabase(backup), pageB.clearDatabase()]);
    assert.deepEqual(await pageA.getDatabase(), createEmptyDatabase());
    await Promise.all([pageA.clearDatabase(), pageB.restoreDatabase(backup)]);
    assert.ok((await pageA.getDatabase()).providerItems['steam:1']);
  })],
  ['stale enrichment and review requests after clear cannot recreate removed records', () => withWorker(async ({ memory, pageA, pageB, importItems }) => {
    await importItems('kindle', kindleBooks);
    const held = memory.holdNextRead();
    const enrichment = pageA.saveOpenLibraryEnrichment([itemIds[0]], openLibrary);
    await held.started.promise;
    const clear = pageB.clearDatabase();
    // These payloads were built from the old library in another page, but are
    // admitted after clear. Their validations must read the cleared database.
    const staleEnrichment = pageA.saveGoogleBooksEnrichments([{ itemIds: [itemIds[0]], enrichment: googleBooks }]);
    const staleReview = pageB.saveManualMatchDecision(review, 'same');
    const laterImport = importItems('gog', [game('2')]);
    const rejectedEnrichment = assert.rejects(staleEnrichment, /Invalid Google Books enrichment/u);
    const rejectedReview = assert.rejects(staleReview, /no longer exists/u);
    held.released.resolve();
    await Promise.all([enrichment, clear, rejectedEnrichment, rejectedReview, laterImport]);
    const database = await pageA.getDatabase();
    assert.deepEqual(Object.keys(database.providerItems), ['gog:2']);
    assert.deepEqual(database.manualMatchDecisions, {});
  })],
  ['overlapping full and quick scans of one provider follow the documented order', () => withWorker(async ({ pageA, importItems }) => {
    await Promise.all([
      importItems('kindle', [kindleBooks[0]]),
      importItems('kindle', [kindleBooks[1]], 'incremental')
    ]);
    assert.deepEqual(Object.keys((await pageA.getDatabase()).providerItems).sort(), itemIds);
    await Promise.all([
      importItems('kindle', [kindleBooks[0]], 'incremental'),
      importItems('kindle', [kindleBooks[1]])
    ]);
    assert.deepEqual(Object.keys((await pageA.getDatabase()).providerItems), [itemIds[1]]);
  })],
  ['invalid enrichment batches and storage failures leave the queue usable', () => withWorker(async ({ memory, pageA, pageB, importItems }) => {
    await importItems('kindle', kindleBooks);
    const failure = pageA.saveGoogleBooksEnrichments([
      { itemIds: [itemIds[0]], enrichment: googleBooks },
      { itemIds: ['kindle:missing'], enrichment: googleBooks }
    ]);
    const later = importItems('steam', [game('1')]);
    await assert.rejects(failure, /Invalid Google Books enrichment/u);
    await later;
    let database = await pageB.getDatabase();
    assert.equal(database.providerItems[itemIds[0]].metadata.enrichment, undefined, 'Part of an invalid batch was committed.');
    assert.ok(database.providerItems['steam:1']);
    memory.failNextWrite();
    const failedWrite = pageA.saveOpenLibraryEnrichment([itemIds[0]], openLibrary);
    const successfulWrite = pageB.saveManualMatchDecision(review, 'same');
    await assert.rejects(failedWrite, /Simulated storage write failure/u);
    await successfulWrite;
    database = await pageB.getDatabase();
    assert.equal(database.providerItems[itemIds[0]].metadata.enrichment, undefined);
    assert.equal(database.manualMatchDecisions[review.id].decision, 'same');
  })],
  ['concurrent companion-link additions are atomic across Library windows', () => withWorker(async ({ pageA, pageB }) => {
    const otherId = 'ponmlkjihgfedcbaponmlkjihgfedcba';
    await Promise.all([pageA.addAllowedExternalClientId(extensionId), pageB.addAllowedExternalClientId(otherId)]);
    assert.deepEqual(await pageA.getAllowedExternalClientIds(), [extensionId, otherId].sort());
  })],
  ['privileged storage messages reject provider tabs, other extensions, and invalid operations', () => withWorker(async ({ pageA, dispatch }) => {
    const clear = { type: STORAGE_MESSAGE_TYPE, operation: 'clearDatabase', args: [] };
    for (const sender of [
      { id: extensionId, url: 'https://www.amazon.com/' },
      { id: 'other-extension', url: `${root}options.html` },
      { id: extensionId, url: `chrome-extension://${extensionId}.evil/options.html` }
    ]) assert.equal((await dispatch(clear, sender)).ok, false);
    const sender = { id: extensionId, url: `${root}options.html` };
    assert.equal((await dispatch({ ...clear, operation: '__proto__' }, sender)).ok, false);
    assert.equal((await dispatch({ ...clear, args: {} }, sender)).ok, false);
    await assert.rejects(pageA.restoreDatabase({ schemaVersion: -1 }), /schema version/u);
    assert.deepEqual(await pageA.getDatabase(), createEmptyDatabase());
  })],
  ['writer captures queued arguments and reads persisted state after worker recreation', async () => {
    const memory = memoryStorage();
    const writer = createStorageWriter(memory.area);
    const held = memory.holdNextRead();
    const first = writer.getDatabase();
    await held.started.promise;
    const records = [game('1', 'Original title')];
    const queued = writer.replaceProviderItems('steam', records, {}, snapshotFixture('steam', records));
    records[0].title = 'Changed after admission';
    held.released.resolve();
    await Promise.all([first, queued]);
    const restarted = createStorageWriter(memory.area);
    await restarted.replaceProviderItems('gog', [game('2')], {}, snapshotFixture('gog', [game('2')]));
    const database = await restarted.getDatabase();
    assert.equal(database.providerItems['steam:1'].title, 'Original title');
    assert.ok(database.providerItems['gog:2']);
  }],
  ['client transport errors propagate without local writes or automatic retry', async () => {
    let attempts = 0;
    const client = createStorageClient(async () => { attempts += 1; throw new Error('Message channel closed.'); });
    await assert.rejects(client.clearDatabase(), /Message channel closed/u);
    assert.equal(attempts, 1);
  }]
];
