import { DATABASE_SCHEMA_VERSION, MEDIA_TYPES, OWNERSHIP_STATES, PROVIDERS } from './constants.js';
import { normalizeGameTitle } from './normalization.js';

export function createEmptyDatabase() {
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    providers: {},
    providerItems: {},
    canonicalItems: {},
    manualMatchDecisions: {}
  };
}

export function providerItemKey(provider, providerItemId) {
  return `${provider}:${providerItemId}`;
}

export function canonicalItemKey(mediaType, normalizedTitle) {
  return `${mediaType}:${normalizedTitle}`;
}

export function normalizeProviderItem(value, now = new Date().toISOString()) {
  if (!value || typeof value !== 'object') throw new Error('Provider item must be an object.');
  const provider = String(value.provider ?? '').trim().toLowerCase();
  const providerItemId = String(value.providerItemId ?? '').trim();
  const title = String(value.title ?? '').trim();
  const mediaType = String(value.mediaType ?? 'game').trim().toLowerCase();
  const ownership = String(value.ownership ?? 'unknown').trim().toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new Error(`Unsupported provider: ${provider || '(missing)'}.`);
  if (!providerItemId) throw new Error('Provider item needs a providerItemId.');
  if (!title) throw new Error('Provider item needs a title.');
  if (!MEDIA_TYPES.includes(mediaType)) throw new Error(`Unsupported media type: ${mediaType}.`);
  if (!OWNERSHIP_STATES.includes(ownership)) throw new Error(`Unsupported ownership state: ${ownership}.`);
  const titleParts = normalizeGameTitle(title);
  if (!titleParts.normalizedTitle) throw new Error('Provider item title cannot normalize to an empty value.');

  return {
    id: providerItemKey(provider, providerItemId),
    provider,
    providerItemId,
    title,
    normalizedTitle: titleParts.normalizedTitle,
    baseTitle: titleParts.baseTitle,
    edition: titleParts.edition,
    mediaType,
    ownership,
    platform: Array.isArray(value.platform) ? [...new Set(value.platform.map(String).filter(Boolean))] : [],
    metadata: value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata) ? value.metadata : {},
    acquiredAt: typeof value.acquiredAt === 'string' ? value.acquiredAt : null,
    updatedAt: now
  };
}

export function rebuildCanonicalItems(providerItems, manualMatchDecisions = {}) {
  const records = Object.values(providerItems).filter((item) => item.mediaType !== 'game-addon');
  const parent = new Map(records.map((item) => [item.id, item.id]));
  const find = (id) => {
    const current = parent.get(id);
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const join = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  const exactGroups = new Map();
  for (const item of records) {
    const key = canonicalItemKey(item.mediaType, item.normalizedTitle);
    const group = exactGroups.get(key) ?? [];
    group.push(item);
    exactGroups.set(key, group);
  }
  for (const group of exactGroups.values()) {
    for (const item of group.slice(1)) join(group[0].id, item.id);
  }
  for (const decision of Object.values(manualMatchDecisions)) {
    if (decision?.decision !== 'same' || !Array.isArray(decision.itemIds) || decision.itemIds.length !== 2) continue;
    const [left, right] = decision.itemIds;
    const leftItem = providerItems[left];
    const rightItem = providerItems[right];
    if (!leftItem || !rightItem || leftItem.mediaType !== rightItem.mediaType || leftItem.mediaType === 'game-addon') continue;
    join(left, right);
  }
  const grouped = new Map();
  for (const item of records) {
    const key = find(item.id);
    const existing = grouped.get(key) ?? [];
    existing.push(item);
    grouped.set(key, existing);
  }
  return Object.fromEntries([...grouped.values()].map((items) => {
    const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
    const normalizedTitles = ordered.map((item) => item.normalizedTitle).sort();
    const id = canonicalItemKey(ordered[0].mediaType, normalizedTitles[0]);
    return [id, {
      id,
      mediaType: ordered[0].mediaType,
      title: ordered[0].title,
      normalizedTitle: normalizedTitles[0],
      baseTitle: ordered[0].baseTitle,
      edition: ordered[0].edition,
      providerItemIds: ordered.map((item) => item.id),
      providerCount: ordered.length
    }];
  }));
}

export function validateDatabase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Backup does not contain a database object.');
  if (value.schemaVersion !== DATABASE_SCHEMA_VERSION) throw new Error(`Unsupported database schema version: ${value.schemaVersion ?? '(missing)'}.`);
  if (!value.providerItems || typeof value.providerItems !== 'object' || Array.isArray(value.providerItems)) throw new Error('Backup is missing provider items.');
  const providerItems = Object.fromEntries(Object.values(value.providerItems).map((item) => {
    const normalized = normalizeProviderItem(item, typeof item?.updatedAt === 'string' ? item.updatedAt : new Date().toISOString());
    return [normalized.id, normalized];
  }));
  const providers = value.providers && typeof value.providers === 'object' && !Array.isArray(value.providers) ? value.providers : {};
  const manualMatchDecisions = value.manualMatchDecisions && typeof value.manualMatchDecisions === 'object' && !Array.isArray(value.manualMatchDecisions) ? value.manualMatchDecisions : {};
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    providers,
    providerItems,
    canonicalItems: rebuildCanonicalItems(providerItems, manualMatchDecisions),
    manualMatchDecisions
  };
}
