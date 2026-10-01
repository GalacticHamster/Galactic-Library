import { DATABASE_SCHEMA_VERSION, MEDIA_TYPES, OWNERSHIP_STATES, PROVIDERS } from './constants.js';
import { normalizeGameTitle } from './normalization.js';
import { identityConflicts, identityEvidence, sameEditionEvidence } from './identity.js';
import { validateContentReview } from './contents.js';
import { validateMetadata } from './metadata-validation.js';
import { validateProviderStates } from './provider-state.js';
import { object, text, strings, date } from './validation.js';
import { editionBarriers, validateEditionSeparations } from './relationships.js';

export function createEmptyDatabase() {
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    providers: {},
    providerItems: {},
    canonicalItems: {},
    manualMatchDecisions: {},
    contentReviews: {},
    editionSeparations: {}
  };
}

export function providerItemKey(provider, providerItemId) {
  return `${provider}:${providerItemId}`;
}

export function canonicalItemKey(mediaType, normalizedTitle) {
  return `${mediaType}:${normalizedTitle}`;
}

export function normalizeProviderItem(value, now = new Date().toISOString(), options = {}) {
  object(value,'Provider item');
  const provider = text(value.provider,40,'Provider').toLowerCase();
  const providerItemId = text(value.providerItemId,500,'Provider item ID');
  const title = text(value.title,500,'Title');
  const mediaType = text(value.mediaType ?? 'game',40,'Media type').toLowerCase();
  const ownership = text(value.ownership ?? 'unknown',40,'Ownership').toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new Error(`Unsupported provider: ${provider || '(missing)'}.`);
  if (!providerItemId) throw new Error('Provider item needs a providerItemId.');
  if (!title) throw new Error('Provider item needs a title.');
  if (!MEDIA_TYPES.includes(mediaType)) throw new Error(`Unsupported media type: ${mediaType}.`);
  if (!OWNERSHIP_STATES.includes(ownership)) throw new Error(`Unsupported ownership state: ${ownership}.`);
  const titleParts = normalizeGameTitle(title);
  if (!titleParts.normalizedTitle) throw new Error('Provider item title cannot normalize to an empty value.');

  return {
    id: providerItemKey(provider, providerItemId),
    recordRef: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value.recordRef ?? '') ? value.recordRef : crypto.randomUUID(),
    provider,
    providerItemId,
    title,
    normalizedTitle: titleParts.normalizedTitle,
    baseTitle: titleParts.baseTitle,
    edition: titleParts.edition,
    mediaType,
    ownership,
    platform: strings(value.platform,30,80,'Platforms'),
    metadata: validateMetadata(provider,value.metadata,options),
    acquiredAt: date(value.acquiredAt,'Acquisition date'),
    observedAt: value.observedAt===null?null:date(value.observedAt??now,'Observation date'),
    updatedAt: date(now,'Update date')
  };
}

export function rebuildCanonicalItems(providerItems, manualMatchDecisions = {}, previousCanonicalItems = {}, editionSeparations = {}) {
  const records = Object.values(providerItems).filter((item) => item.mediaType !== 'game-addon');
  const parent = new Map(records.map((item) => [item.id, item.id]));
  const members = new Map(records.map((item) => [item.id, [item]]));
  const prohibited = editionBarriers(manualMatchDecisions,editionSeparations);
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
    if (/^edition:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(entry?.id??'') && Array.isArray(entry.providerItemIds) && entry.providerItemIds.length<=500000) for (const itemId of entry.providerItemIds) if(typeof itemId==='string'&&providerItems[itemId]) previousByRecord.set(itemId, entry);
  }
  return Object.fromEntries([...grouped.values()].map((items) => {
    const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
    const normalizedTitles = ordered.map((item) => item.normalizedTitle).sort();
    const previous = ordered.map((item) => previousByRecord.get(item.id)).find((entry) => entry && !usedIds.has(entry.id));
    let id = previous?.id ?? `edition:${ordered[0].recordRef}`;
    // A split can leave another group using this record's original ID.
    // Never overwrite that group when input/provider order changes.
    if(usedIds.has(id))id=ordered.map(item=>`edition:${item.recordRef}`).find(candidate=>!usedIds.has(candidate))??`edition:${crypto.randomUUID()}`;
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
  if (![1, 2, DATABASE_SCHEMA_VERSION].includes(value.schemaVersion)) throw new Error(`Unsupported database schema version: ${value.schemaVersion ?? '(missing)'}.`);
  if (!value.providerItems || typeof value.providerItems !== 'object' || Array.isArray(value.providerItems)) throw new Error('Backup is missing provider items.');
  if (Object.keys(value.providerItems).length>500000) throw new Error('The database contains too many provider records.');
  const normalizedItems = Object.values(value.providerItems).map((item) => {
    const normalized = normalizeProviderItem({...item,observedAt:item?.observedAt??null}, typeof item?.updatedAt === 'string' ? item.updatedAt : new Date().toISOString());
    return [normalized.id, normalized];
  });
  if(new Set(normalizedItems.map(([id])=>id)).size!==normalizedItems.length)throw new Error('Backup contains duplicate provider identities.');
  const providerItems = Object.fromEntries(normalizedItems);
  const providers = validateProviderStates(value.providers ?? {});
  const refs=new Set();
  for(const item of Object.values(providerItems)){
    if(refs.has(item.recordRef))throw new Error('Backup contains duplicate persistent record references.');
    refs.add(item.recordRef);
  }
  const manualMatchDecisions = {};
  object(value.manualMatchDecisions??{},'Saved relationships');
  if (Object.keys(value.manualMatchDecisions??{}).length>100000) throw new Error('Too many saved relationships.');
  for(const decision of Object.values(value.manualMatchDecisions??{})){
    if(!['same','same-work','same-edition','different'].includes(decision?.decision)||!Array.isArray(decision.itemIds)||decision.itemIds.length!==2||decision.itemIds.some(id=>typeof id!=='string')||decision.itemIds[0]===decision.itemIds[1])throw new Error('Invalid saved relationship.');
    const itemIds=[...decision.itemIds].sort();
    const [left,right]=itemIds.map(id=>providerItems[id]);
    if(left&&right&&left.mediaType!==right.mediaType)throw new Error('A saved relationship crosses media types.');
    if(itemIds.some(id=>id.length>550))throw new Error('Saved relationship IDs exceed their bounds.');
    manualMatchDecisions[itemIds.join('\u0000')]={decision:decision.decision,itemIds,updatedAt:date(decision.updatedAt)};
  }
  object(value.contentReviews??{},'Contents reviews');
  if(Object.keys(value.contentReviews??{}).length>500000)throw new Error('Too many contents reviews.');
  const editionSeparations=validateEditionSeparations(value.editionSeparations??{});
  for(const separation of Object.values(editionSeparations)){
    const item=providerItems[separation.itemId];
    if(item&&separation.otherItemIds.some(id=>providerItems[id]&&providerItems[id].mediaType!==item.mediaType))throw new Error('An edition separation crosses media types.');
  }
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    providers,
    providerItems,
    canonicalItems: rebuildCanonicalItems(providerItems, manualMatchDecisions, value.canonicalItems,editionSeparations),
    manualMatchDecisions,
    editionSeparations,
    contentReviews: Object.fromEntries(Object.entries(value.contentReviews ?? {}).map(([id, review]) => {if(id.length>550)throw new Error('Contents review ID exceeds its bounds.');return [id, validateContentReview(review)];}))
  };
}
