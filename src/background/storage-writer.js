import { DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY, PROVIDERS } from '../lib/constants.js';
import { normaliseExternalClientIds } from '../lib/external-api.js';
import { isConfirmedComicManga } from '../lib/genre-hints.js';
import { createEmptyDatabase, normalizeProviderItem, providerItemKey, rebuildCanonicalItems, validateDatabase } from '../lib/models.js';
import { STORAGE_OPERATIONS } from '../lib/storage-protocol.js';
import { validateProviderSnapshot } from '../lib/provider-snapshot.js';

/**
 * Instantiate once in the service worker. Every read and mutation shares this
 * queue, including calls made directly by provider message handlers. No client
 * context owns a writer or writes a cached database snapshot.
 */
export function createStorageWriter(storageArea) {
  async function getDatabase() {
    const stored = await storageArea.get({ [DATABASE_STORAGE_KEY]: null });
    if (!stored[DATABASE_STORAGE_KEY]) return createEmptyDatabase();
    const database = validateDatabase(stored[DATABASE_STORAGE_KEY]);
    if (stored[DATABASE_STORAGE_KEY].schemaVersion !== database.schemaVersion) {
      const jobState = await storageArea.get({[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: null});
      const job = jobState[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY];
      const migrated = {[DATABASE_STORAGE_KEY]: database};
      if (Array.isArray(job?.queue)) {
        const byRecord = new Map(Object.values(database.canonicalItems).flatMap((entry) => entry.providerItemIds.map((id) => [id, entry.id])));
        migrated[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY] = {...job, queue: job.queue.map((id) => {
          const previous = stored[DATABASE_STORAGE_KEY].canonicalItems?.[id];
          return previous?.providerItemIds?.map((itemId) => byRecord.get(itemId)).find(Boolean) ?? id;
        })};
      }
      await storageArea.set(migrated);
    }
    return database;
  }

  async function persistDatabase(database) {
    const validated = validateDatabase(database);
    await storageArea.set({ [DATABASE_STORAGE_KEY]: validated });
    return validated;
  }

  function preserveEnrichment(incoming, previous) {
    if (previous?.recordRef) incoming = {...incoming, recordRef: previous.recordRef};
    const existing = previous?.metadata?.enrichment;
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return incoming;
    return {
      ...incoming,
      metadata: {
        ...incoming.metadata,
        enrichment: { ...existing, ...(incoming.metadata?.enrichment ?? {}) }
      }
    };
  }

  async function replaceProviderItems(provider, values, syncDetails = {}, snapshot) {
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid provider.');
    validateProviderSnapshot(provider, values, snapshot);
    const database = await getDatabase();
    const now = new Date().toISOString();
    const retained = Object.fromEntries(Object.entries(database.providerItems).filter(([, item]) => item.provider !== provider));
    const incoming = values.map((value) => {
      const item = normalizeProviderItem({ ...value, provider }, now);
      return preserveEnrichment(item, database.providerItems[item.id]);
    });
    const unique = new Map(incoming.map((item) => [item.id, item]));
    const records = [...unique.values()];
    const gameCount = records.filter((item) => item.mediaType === 'game').length;
    const addOnCount = records.filter((item) => item.mediaType === 'game-addon').length;
    const audiobookCount = records.filter((item) => item.mediaType === 'audiobook').length;
    const bookCount = records.filter((item) => item.mediaType === 'book').length;
    const movieCount = records.filter((item) => item.mediaType === 'movie').length;
    const tvCount = records.filter((item) => item.mediaType === 'tv').length;
    const linkedAddOnCount = records.filter((item) => {
      const parentId = String(item.metadata?.parentProviderItemId ?? '').trim();
      return item.mediaType === 'game-addon' && parentId && unique.has(providerItemKey(item.provider, parentId));
    }).length;
    database.providerItems = { ...retained, ...Object.fromEntries(unique) };
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems);
    database.providers[provider] = {
      connected: true,
      itemCount: gameCount,
      addOnCount,
      audiobookCount,
      bookCount,
      movieCount,
      tvCount,
      linkedAddOnCount,
      recordCount: unique.size,
      lastSync: now,
      lastError: null,
      ...syncDetails,
      snapshotValidation: { ...snapshot, validatedAt: now }
    };
    return persistDatabase(database);
  }

  // Incremental syncs must never make an entitlement disappear merely because
  // the provider returned only its recent additions. Full syncs use the
  // replacement function above; quick syncs add or refresh records here.
  async function mergeProviderItems(provider, values, syncDetails = {}) {
    const database = await getDatabase();
    const now = new Date().toISOString();
    const incoming = values.map((value) => {
      const item = normalizeProviderItem({ ...value, provider }, now);
      return preserveEnrichment(item, database.providerItems[item.id]);
    });
    const unique = new Map(incoming.map((item) => [item.id, item]));
    database.providerItems = { ...database.providerItems, ...Object.fromEntries(unique) };
    const records = Object.values(database.providerItems).filter((item) => item.provider === provider);
    const gameCount = records.filter((item) => item.mediaType === 'game').length;
    const addOnCount = records.filter((item) => item.mediaType === 'game-addon').length;
    const audiobookCount = records.filter((item) => item.mediaType === 'audiobook').length;
    const bookCount = records.filter((item) => item.mediaType === 'book').length;
    const movieCount = records.filter((item) => item.mediaType === 'movie').length;
    const tvCount = records.filter((item) => item.mediaType === 'tv').length;
    const providerRecords = new Map(records.map((item) => [item.id, item]));
    const linkedAddOnCount = records.filter((item) => {
      const parentId = String(item.metadata?.parentProviderItemId ?? '').trim();
      return item.mediaType === 'game-addon' && parentId && providerRecords.has(providerItemKey(provider, parentId));
    }).length;
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems);
    database.providers[provider] = {
      ...database.providers[provider],
      connected: true,
      itemCount: gameCount,
      addOnCount,
      audiobookCount,
      bookCount,
      movieCount,
      tvCount,
      linkedAddOnCount,
      recordCount: records.length,
      lastSync: now,
      lastError: null,
      ...syncDetails
    };
    return persistDatabase(database);
  }

  async function clearDatabase() {
    await storageArea.remove([DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]);
  }

  function normaliseGoogleBooksApiKey(value) {
    const key = String(value ?? '').trim();
    if (!key) return '';
    if (key.length < 20 || /\s/u.test(key)) throw new Error('Enter a valid Google Books API key.');
    return key;
  }

  async function getGoogleBooksApiKey() {
    const stored = await storageArea.get({ [GOOGLE_BOOKS_API_KEY_STORAGE_KEY]: '' });
    return normaliseGoogleBooksApiKey(stored[GOOGLE_BOOKS_API_KEY_STORAGE_KEY]);
  }

  async function saveGoogleBooksApiKey(value) {
    const key = normaliseGoogleBooksApiKey(value);
    if (key) await storageArea.set({ [GOOGLE_BOOKS_API_KEY_STORAGE_KEY]: key });
    else await storageArea.remove(GOOGLE_BOOKS_API_KEY_STORAGE_KEY);
    return key;
  }

  function normaliseGoogleBooksJob(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.queue)) return null;
    const queue = [...new Set(value.queue.map(String).filter(Boolean))];
    const cursor = Math.max(0, Math.min(Number.isInteger(value.cursor) ? value.cursor : 0, queue.length));
    const count = (key) => Math.max(0, Number.isInteger(value[key]) ? value[key] : 0);
    const samples = (Array.isArray(value.samples) ? value.samples : []).slice(-50).flatMap((sample) => {
      const title = String(sample?.title ?? '').trim();
      const reason = String(sample?.reason ?? '').trim();
      if (!title || !reason) return [];
      return [{ title, reason, candidateTitle: String(sample?.candidateTitle ?? '').trim() }];
    });
    return {
      queue,
      cursor,
      processed: count('processed'),
      matched: count('matched'),
      genreHints: count('genreHints'),
      noMatch: count('noMatch'),
      zeroResults: count('zeroResults'),
      titleVariant: count('titleVariant'),
      authorVariant: count('authorVariant'),
      samples,
      skipped: count('skipped'),
      errors: count('errors'),
      lastError: String(value.lastError ?? '').trim().slice(0, 600),
      lastErrorAt: typeof value.lastErrorAt === 'string' ? value.lastErrorAt : '',
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : new Date().toISOString(),
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
    };
  }

  async function getGoogleBooksEnrichmentJob() {
    const stored = await storageArea.get({ [GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: null });
    return normaliseGoogleBooksJob(stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]);
  }

  async function saveGoogleBooksEnrichmentJob(value) {
    const job = normaliseGoogleBooksJob(value);
    if (!job) throw new Error('Invalid Google Books enrichment job.');
    job.updatedAt = new Date().toISOString();
    await storageArea.set({ [GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: job });
    return job;
  }

  async function clearGoogleBooksEnrichmentJob() {
    await storageArea.remove(GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY);
  }

  async function startGoogleBooksEnrichmentJob() {
    const database = await getDatabase();
    const queue = Object.values(database.canonicalItems).filter((canonical) => {
      if (canonical.mediaType !== 'book') return false;
      const records = canonical.providerItemIds.map((id) => database.providerItems[id]).filter(Boolean);
      const hasGoogleBooks = records.some((record) => record.metadata?.enrichment?.googleBooks?.volumeId || record.metadata?.enrichment?.googleBooksGenreHint?.categories?.length);
      const hasAuthors = records.some((record) => Array.isArray(record.metadata?.authors) && record.metadata.authors.length > 0);
      return !hasGoogleBooks && hasAuthors;
    }).map((canonical) => canonical.id).sort();
    return saveGoogleBooksEnrichmentJob({ queue, cursor: 0, processed: 0, matched: 0, genreHints: 0, noMatch: 0, zeroResults: 0, titleVariant: 0, authorVariant: 0, samples: [], skipped: 0, errors: 0, startedAt: new Date().toISOString() });
  }

  async function getAllowedExternalClientIds() {
    const stored = await storageArea.get({ [EXTERNAL_CLIENT_IDS_STORAGE_KEY]: [] });
    return normaliseExternalClientIds(stored[EXTERNAL_CLIENT_IDS_STORAGE_KEY]);
  }

  async function saveAllowedExternalClientIds(ids) {
    const normalised = normaliseExternalClientIds(ids);
    await storageArea.set({ [EXTERNAL_CLIENT_IDS_STORAGE_KEY]: normalised });
    return normalised;
  }

  async function saveManualMatchDecision(candidate, decision) {
    if (!candidate || !Array.isArray(candidate.itemIds) || candidate.itemIds.length !== 2 || !['same', 'different'].includes(decision)) {
      throw new Error('Invalid duplicate-review decision.');
    }
    const database = await getDatabase();
    const itemIds = [...candidate.itemIds].sort();
    if (!itemIds.every((id) => database.providerItems[id])) throw new Error('One of the reviewed library items no longer exists.');
    database.manualMatchDecisions[candidate.id] = { decision, itemIds, updatedAt: new Date().toISOString() };
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems);
    return persistDatabase(database);
  }

  async function saveOpenLibraryEnrichment(itemIds, enrichment) {
    if (!Array.isArray(itemIds) || !itemIds.length || !enrichment || enrichment.source !== 'open-library') {
      throw new Error('Invalid Open Library enrichment.');
    }
    const database = await getDatabase();
    const ids = [...new Set(itemIds.map(String))];
    if (!ids.every((id) => database.providerItems[id]?.mediaType === 'book')) {
      throw new Error('Open Library enrichment can be applied only to current book records.');
    }
    const updatedAt = new Date().toISOString();
    for (const id of ids) {
      const item = database.providerItems[id];
      database.providerItems[id] = {
        ...item,
        metadata: {
          ...item.metadata,
          enrichment: { ...item.metadata?.enrichment, openLibrary: { ...enrichment, appliedAt: updatedAt } }
        },
        updatedAt
      };
    }
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems);
    return persistDatabase(database);
  }

  async function saveGoogleBooksEnrichments(entries) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('No Google Books enrichments were provided.');
    const database = await getDatabase();
    const updatedAt = new Date().toISOString();
    for (const entry of entries) {
      const ids = [...new Set((entry?.itemIds ?? []).map(String))];
      if (!ids.length || !entry?.enrichment || entry.enrichment.source !== 'google-books' || !ids.every((id) => database.providerItems[id]?.mediaType === 'book')) {
        throw new Error('Invalid Google Books enrichment.');
      }
      for (const id of ids) {
        const item = database.providerItems[id];
        database.providerItems[id] = {
          ...item,
          metadata: {
            ...item.metadata,
            enrichment: { ...item.metadata?.enrichment, googleBooks: { ...entry.enrichment, appliedAt: updatedAt } }
          },
          updatedAt
        };
      }
    }
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems);
    return persistDatabase(database);
  }

  async function saveGoogleBooksGenreHints(entries) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('No Google Books genre hints were provided.');
    const database = await getDatabase();
    const updatedAt = new Date().toISOString();
    for (const entry of entries) {
      const ids = [...new Set((entry?.itemIds ?? []).map(String))];
      const categories = entry?.hint?.categories;
      if (!ids.length || entry?.hint?.source !== 'google-books' || entry.hint.confidence !== 'author-and-title-stem' || !Array.isArray(categories) || !categories.length || !ids.every((id) => database.providerItems[id]?.mediaType === 'book')) {
        throw new Error('Invalid Google Books genre hint.');
      }
      for (const id of ids) {
        const item = database.providerItems[id];
        database.providerItems[id] = {
          ...item,
          metadata: {
            ...item.metadata,
            enrichment: { ...item.metadata?.enrichment, googleBooksGenreHint: { ...entry.hint, appliedAt: updatedAt } }
          },
          updatedAt
        };
      }
    }
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems);
    return persistDatabase(database);
  }

  async function saveKindleComicContents(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 100) throw new Error('No valid Kindle comic contents were provided.');
    const database = await getDatabase();
    const updatedAt = new Date().toISOString();
    for (const entry of entries) {
      const itemId = String(entry?.itemId ?? '').trim();
      const item = database.providerItems[itemId];
      const statement = String(entry?.statement ?? '').replace(/\s+/gu, ' ').trim().replace(/[.!?]+$/u, '');
      const availability = entry?.availability === 'unavailable' ? 'unavailable' : 'available';
      let sourceUrl = '';
      try {
        const url = new URL(String(entry?.sourceUrl ?? ''));
        if (url.origin === 'https://www.amazon.com' && /^\/dp\//u.test(url.pathname)) sourceUrl = `${url.origin}${url.pathname}`;
      } catch { /* invalid source URL remains unusable */ }
      if (!item || item.provider !== 'kindle' || item.mediaType !== 'book' || !isConfirmedComicManga(item) || sourceUrl !== String(item.metadata?.detailUrl ?? '') || statement.length > 700 || (statement && !/^collects?\b/iu.test(statement)) || (availability === 'unavailable' && statement)) {
        throw new Error('Invalid Kindle comic contents entry.');
      }
      database.providerItems[itemId] = {
        ...item,
        metadata: {
          ...item.metadata,
          enrichment: {
            ...item.metadata?.enrichment,
            kindleProductComicContents: {
              source: 'amazon-product-page',
              sourceUrl,
              statement,
              availability,
              checkedAt: updatedAt
            }
          }
        },
        updatedAt
      };
    }
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems);
    return persistDatabase(database);
  }

  async function removeManualMatchDecision(candidateId) {
    const database = await getDatabase();
    delete database.manualMatchDecisions[candidateId];
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems);
    return persistDatabase(database);
  }

  async function addAllowedExternalClientId(id) {
    const ids = await getAllowedExternalClientIds();
    return saveAllowedExternalClientIds([...ids, id]);
  }

  async function getShowEnrichmentActions() {
    const stored = await storageArea.get({ [SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]: true });
    return stored[SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY] !== false;
  }

  async function saveShowEnrichmentActions(value) {
    const checked = value !== false;
    await storageArea.set({ [SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]: checked });
    return checked;
  }

  const operations = {
    getDatabase, restoreDatabase: persistDatabase, replaceProviderItems, mergeProviderItems, clearDatabase,
    getGoogleBooksApiKey, saveGoogleBooksApiKey, getGoogleBooksEnrichmentJob,
    saveGoogleBooksEnrichmentJob, clearGoogleBooksEnrichmentJob, startGoogleBooksEnrichmentJob,
    getAllowedExternalClientIds, saveAllowedExternalClientIds, addAllowedExternalClientId,
    saveManualMatchDecision, removeManualMatchDecision, saveOpenLibraryEnrichment,
    saveGoogleBooksEnrichments, saveGoogleBooksGenreHints, saveKindleComicContents,
    getShowEnrichmentActions, saveShowEnrichmentActions
  };
  let tail = Promise.resolve();

  function execute(operation, args = []) {
    if (!STORAGE_OPERATIONS.includes(operation) || !Array.isArray(args)) {
      return Promise.reject(new Error('Unsupported Galactic Library storage operation.'));
    }
    // Capture the request at admission, before callers can mutate it.
    let values;
    try { values = structuredClone(args); }
    catch { return Promise.reject(new Error('Invalid Galactic Library storage arguments.')); }
    const result = tail.then(() => operations[operation](...values));
    // A rejected operation never poisons the queue; later requests still run.
    tail = result.catch(() => {});
    return result;
  }

  return Object.freeze({
    execute,
    ...Object.fromEntries(STORAGE_OPERATIONS.map((name) => [name, (...args) => execute(name, args)]))
  });
}
