import { BACKUP_FORMAT, BACKUP_VERSION, DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY } from './constants.js';
import { normaliseExternalClientIds } from './external-api.js';
import { isConfirmedComicManga } from './genre-hints.js';
import { createEmptyDatabase, normalizeProviderItem, providerItemKey, rebuildCanonicalItems, validateDatabase } from './models.js';

export async function getDatabase() {
  const stored = await chrome.storage.local.get({ [DATABASE_STORAGE_KEY]: null });
  return stored[DATABASE_STORAGE_KEY] ? validateDatabase(stored[DATABASE_STORAGE_KEY]) : createEmptyDatabase();
}

export async function saveDatabase(database) {
  const validated = validateDatabase(database);
  await chrome.storage.local.set({ [DATABASE_STORAGE_KEY]: validated });
  return validated;
}

export async function replaceProviderItems(provider, values, syncDetails = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const retained = Object.fromEntries(Object.entries(database.providerItems).filter(([, item]) => item.provider !== provider));
  const incoming = values.map((value) => normalizeProviderItem({ ...value, provider }, now));
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
  database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions);
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
    ...syncDetails
  };
  return saveDatabase(database);
}

// Incremental syncs must never make an entitlement disappear merely because
// the provider returned only its recent additions. Full syncs use the
// replacement function above; quick syncs add or refresh records here.
export async function mergeProviderItems(provider, values, syncDetails = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const incoming = values.map((value) => normalizeProviderItem({ ...value, provider }, now));
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
  database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions);
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
  return saveDatabase(database);
}

export async function clearDatabase() {
  await chrome.storage.local.remove([DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]);
}

function normaliseGoogleBooksApiKey(value) {
  const key = String(value ?? '').trim();
  if (!key) return '';
  if (key.length < 20 || /\s/u.test(key)) throw new Error('Enter a valid Google Books API key.');
  return key;
}

export async function getGoogleBooksApiKey() {
  const stored = await chrome.storage.local.get({ [GOOGLE_BOOKS_API_KEY_STORAGE_KEY]: '' });
  return normaliseGoogleBooksApiKey(stored[GOOGLE_BOOKS_API_KEY_STORAGE_KEY]);
}

export async function saveGoogleBooksApiKey(value) {
  const key = normaliseGoogleBooksApiKey(value);
  if (key) await chrome.storage.local.set({ [GOOGLE_BOOKS_API_KEY_STORAGE_KEY]: key });
  else await chrome.storage.local.remove(GOOGLE_BOOKS_API_KEY_STORAGE_KEY);
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

export async function getGoogleBooksEnrichmentJob() {
  const stored = await chrome.storage.local.get({ [GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: null });
  return normaliseGoogleBooksJob(stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]);
}

export async function saveGoogleBooksEnrichmentJob(value) {
  const job = normaliseGoogleBooksJob(value);
  if (!job) throw new Error('Invalid Google Books enrichment job.');
  job.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ [GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: job });
  return job;
}

export async function clearGoogleBooksEnrichmentJob() {
  await chrome.storage.local.remove(GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY);
}

export async function startGoogleBooksEnrichmentJob() {
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

export async function getAllowedExternalClientIds() {
  const stored = await chrome.storage.local.get({ [EXTERNAL_CLIENT_IDS_STORAGE_KEY]: [] });
  return normaliseExternalClientIds(stored[EXTERNAL_CLIENT_IDS_STORAGE_KEY]);
}

export async function saveAllowedExternalClientIds(ids) {
  const normalised = normaliseExternalClientIds(ids);
  await chrome.storage.local.set({ [EXTERNAL_CLIENT_IDS_STORAGE_KEY]: normalised });
  return normalised;
}

export async function saveManualMatchDecision(candidate, decision) {
  if (!candidate || !Array.isArray(candidate.itemIds) || candidate.itemIds.length !== 2 || !['same', 'different'].includes(decision)) {
    throw new Error('Invalid duplicate-review decision.');
  }
  const database = await getDatabase();
  const itemIds = [...candidate.itemIds].sort();
  if (!itemIds.every((id) => database.providerItems[id])) throw new Error('One of the reviewed library items no longer exists.');
  database.manualMatchDecisions[candidate.id] = { decision, itemIds, updatedAt: new Date().toISOString() };
  database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions);
  return saveDatabase(database);
}

export async function saveOpenLibraryEnrichment(itemIds, enrichment) {
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
  database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions);
  return saveDatabase(database);
}

export async function saveGoogleBooksEnrichments(entries) {
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
  database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions);
  return saveDatabase(database);
}

export async function saveGoogleBooksGenreHints(entries) {
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
  database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions);
  return saveDatabase(database);
}

export async function saveKindleComicContents(entries) {
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
  database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions);
  return saveDatabase(database);
}

export async function removeManualMatchDecision(candidateId) {
  const database = await getDatabase();
  delete database.manualMatchDecisions[candidateId];
  database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions);
  return saveDatabase(database);
}

export function createBackup(database) {
  const validated = validateDatabase(database);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    database: validated
  };
}

export function parseBackup(value) {
  if (!value || typeof value !== 'object' || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION) {
    throw new Error('This is not a Galactic Library backup version 1.');
  }
  return validateDatabase(value.database);
}
