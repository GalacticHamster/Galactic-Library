import { DATABASE_SCHEMA_VERSION, MEDIA_TYPES, OWNERSHIP_STATES, PROVIDERS } from './constants.js';
import { normalizeGameTitle } from './normalization.js';
import { identityConflicts, identityEvidence, sameEditionEvidence } from './identity.js';

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
    recordRef: /^[a-f0-9-]{36}$/iu.test(value.recordRef ?? '') ? value.recordRef : crypto.randomUUID(),
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

export function rebuildCanonicalItems(providerItems, manualMatchDecisions = {}, previousCanonicalItems = {}) {
  const records = Object.values(providerItems).filter((item) => item.mediaType !== 'game-addon');
  const parent = new Map(records.map((item) => [item.id, item.id]));
  const members = new Map(records.map((item) => [item.id, [item]]));
  const prohibited = new Set(Object.values(manualMatchDecisions).filter((decision) => decision.decision === 'different').map((decision) => [...(decision.itemIds ?? [])].sort().join('\u0000')));
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
    if (leftRoot === rightRoot) return;
    const leftGroup = members.get(leftRoot); const rightGroup = members.get(rightRoot);
    if (leftGroup.some((a) => rightGroup.some((b) => identityConflicts(a, b).length || prohibited.has([a.id, b.id].sort().join('\u0000'))))) return;
    parent.set(rightRoot, leftRoot);
    members.set(leftRoot, [...leftGroup, ...rightGroup]); members.delete(rightRoot);
  };
  const exactGroups = new Map();
  for (const item of records) {
    const identity = identityEvidence(item);
    const keys = [`title:${item.normalizedTitle}`, ...identity.isbn.map((isbn) => `isbn:${isbn}`), ...(identity.asin ? [`asin:${identity.asin}`] : [])];
    for (const signal of keys) {
      const key = `${item.mediaType}:${signal}`;
      const group = exactGroups.get(key) ?? [];
      group.push(item); exactGroups.set(key, group);
    }
  }
  for (const group of exactGroups.values()) {
    for (let index = 0; index < group.length; index += 1) {
      for (const item of group.slice(index + 1)) if (sameEditionEvidence(group[index], item)) join(group[index].id, item.id);
    }
  }
  for (const decision of Object.values(manualMatchDecisions)) {
    if (decision?.decision !== 'same-edition' || !Array.isArray(decision.itemIds) || decision.itemIds.length !== 2) continue;
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
  const usedIds = new Set();
  const previousByRecord = new Map();
  for (const entry of Object.values(previousCanonicalItems ?? {})) {
    if (/^edition:/u.test(entry.id)) for (const itemId of entry.providerItemIds ?? []) previousByRecord.set(itemId, entry);
  }
  return Object.fromEntries([...grouped.values()].map((items) => {
    const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
    const normalizedTitles = ordered.map((item) => item.normalizedTitle).sort();
    const previous = ordered.map((item) => previousByRecord.get(item.id)).find((entry) => entry && !usedIds.has(entry.id));
    const id = previous?.id ?? `edition:${ordered[0].recordRef}`;
    usedIds.add(id);
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
  if (![1, DATABASE_SCHEMA_VERSION].includes(value.schemaVersion)) throw new Error(`Unsupported database schema version: ${value.schemaVersion ?? '(missing)'}.`);
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
    canonicalItems: rebuildCanonicalItems(providerItems, manualMatchDecisions, value.canonicalItems),
    manualMatchDecisions
  };
}
