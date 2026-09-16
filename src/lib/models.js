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
  const ownership = String(value.ownership ?? 'owned').trim().toLowerCase();
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

export function rebuildCanonicalItems(providerItems) {
  const grouped = new Map();
  for (const item of Object.values(providerItems)) {
    // Add-ons are records of their own, linked directly to a provider game
    // record. They must not create or inflate a canonical game.
    if (item.mediaType !== 'game') continue;
    const key = canonicalItemKey(item.mediaType, item.normalizedTitle);
    const existing = grouped.get(key) ?? [];
    existing.push(item);
    grouped.set(key, existing);
  }

  return Object.fromEntries([...grouped.entries()].map(([id, items]) => {
    const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
    return [id, {
      id,
      mediaType: ordered[0].mediaType,
      title: ordered[0].title,
      normalizedTitle: ordered[0].normalizedTitle,
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
    canonicalItems: rebuildCanonicalItems(providerItems),
    manualMatchDecisions
  };
}
