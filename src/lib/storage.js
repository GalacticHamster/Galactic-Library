import { BACKUP_FORMAT, BACKUP_VERSION, DATABASE_STORAGE_KEY } from './constants.js';
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
    linkedAddOnCount,
    recordCount: unique.size,
    lastSync: now,
    lastError: null,
    ...syncDetails
  };
  return saveDatabase(database);
}

export async function clearDatabase() {
  await chrome.storage.local.remove(DATABASE_STORAGE_KEY);
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
