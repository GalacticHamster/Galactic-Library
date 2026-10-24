import {validateDisplayTitlePreferences} from './display-title.js';
import {migrateProviderProfiles,validateProviderProfiles,profileRef,profileItemKey} from './provider-profiles.js';
import { DATABASE_SCHEMA_VERSION, MEDIA_TYPES, OWNERSHIP_STATES, PROVIDERS, normalizeOwnership } from './constants.js';
import { normalizeGameTitle } from './normalization.js';
import { identityConflicts, identityEvidence, sameEditionEvidence } from './identity.js';
import { validateContentReview } from './contents.js';
import { validateMetadata } from './metadata-validation.js';
import { validateProviderStates } from './provider-state.js';
import { object, text, strings, date } from './validation.js';
import { editionBarriers, validateEditionSeparations } from './relationships.js';
import { providerOwnership, defaultOwnershipPolicy, validateOwnershipPolicy } from './ownership.js';
import {validateEnrichmentReviews} from './enrichment-state.js';
import {validateCompanionFeeds} from './companion-entitlements.js';
import {validateReadingStates,validateReadingOrders} from './reading.js';
import {validateReminderReviews} from './reminders.js';
import {validateTitleAliases} from './title-aliases.js';
import {validateOwnershipReviews,validateOwnershipProposals} from './ownership-review.js';
import {kindleContentsObservationsSteps} from './kindle-contents-observations.js';
import {enrichmentHistorySteps} from './enrichment-state.js';
import {finishWork,finishWorkAsync} from './cooperative-work.js';

export function createEmptyDatabase() {
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    providers: {},
    providerProfiles: {},
    legacyProfileNamespaces: {},
    unresolvedProfileState: {contentReviews:{},manualMatchDecisions:{},editionSeparations:{},ownershipProposals:{},companionFeeds:{}},
    ownershipPolicy: defaultOwnershipPolicy(),
    providerItems: {},
    canonicalItems: {},
    manualMatchDecisions: {},
    contentReviews: {},
    editionSeparations: {},
    providerHistory: {},enrichmentHistory:{},enrichmentReviews:{},titleAliases:{},ownershipReviews:{},ownershipProposals:{},reminderReviews:{},readingStates:{},readingOrders:{},companionFeeds:{}
  };
}

export function providerItemKey(provider, providerItemId, profileId = '') {
  return profileItemKey(provider,providerItemId,profileId);
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
  const observedOwnership = text(value.ownership ?? 'unknown',40,'Ownership').toLowerCase();
  const ownership = normalizeOwnership(observedOwnership);
  if (!PROVIDERS.includes(provider)) throw new Error(`Unsupported provider: ${provider || '(missing)'}.`);
  if (!providerItemId) throw new Error('Provider item needs a providerItemId.');
  if (!title) throw new Error('Provider item needs a title.');
  if (!MEDIA_TYPES.includes(mediaType)) throw new Error(`Unsupported media type: ${mediaType}.`);
  if (!OWNERSHIP_STATES.includes(ownership)) throw new Error(`Unsupported ownership state: ${ownership}.`);
  const titleParts = normalizeGameTitle(title);
  if (!titleParts.normalizedTitle) throw new Error('Provider item title cannot normalize to an empty value.');
  const metadata=validateMetadata(provider,value.metadata,options);
  if (observedOwnership !== ownership) metadata.acquisitionMethod = 'permanent-claim';

  return {
    id: providerItemKey(provider, providerItemId, options.profileKeySpace??value.profileId??''),
    ...(value.profileId?{profileId:profileRef(value.profileId)}:{}),
    recordRef: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value.recordRef ?? '') ? value.recordRef : crypto.randomUUID(),
    provider,
    providerItemId,
    title,
    normalizedTitle: titleParts.normalizedTitle,
    baseTitle: titleParts.baseTitle,
    edition: titleParts.edition,
    mediaType,
    ownership:providerOwnership(provider,ownership,metadata),
    platform: strings(value.platform,30,80,'Platforms'),
    metadata,
    acquiredAt: date(value.acquiredAt,'Acquisition date'),
    observedAt: value.observedAt===null?null:date(value.observedAt??now,'Observation date'),
    updatedAt: date(now,'Update date')
  };
}

export function rebuildCanonicalItems(providerItems, manualMatchDecisions = {}, previousCanonicalItems = {}, editionSeparations = {}) {
  return finishWork(canonicalItemsSteps(providerItems,manualMatchDecisions,previousCanonicalItems,editionSeparations));
}
export function* canonicalItemsSteps(providerItems, manualMatchDecisions = {}, previousCanonicalItems = {}, editionSeparations = {}) {
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
    yield;
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
      for (const item of group.slice(index + 1)) {yield;if (sameEditionEvidence(group[index], item)) join(group[index].id, item.id);}
    }
  }
  for (const decision of Object.values(manualMatchDecisions)) {
    yield;
    if (decision?.decision !== 'same-edition' || !Array.isArray(decision.itemIds) || decision.itemIds.length !== 2) continue;
    const [left, right] = decision.itemIds;
    const leftItem = providerItems[left];
    const rightItem = providerItems[right];
    if (!leftItem || !rightItem || leftItem.mediaType !== rightItem.mediaType || leftItem.mediaType === 'game-addon') continue;
    join(left, right);
  }
  const grouped = new Map();
  for (const item of records) {
    yield;
    const key = find(item.id);
    const existing = grouped.get(key) ?? [];
    existing.push(item);
    grouped.set(key, existing);
  }
  const usedIds = new Set();
  const previousByRecord = new Map();
  const titlePreferences = new Map();
  for (const entry of Object.values(previousCanonicalItems ?? {})) {
    yield;
    if(entry?.displayTitlePreferences!==undefined){
      const memberRefs=new Set((Array.isArray(entry.providerItemIds)?entry.providerItemIds:[]).map(id=>providerItems[id]?.recordRef));
      for(const [ref,choice] of Object.entries(validateDisplayTitlePreferences(entry.displayTitlePreferences))){
        if(memberRefs.has(ref))titlePreferences.set(ref,choice);
      }
    }
    if (/^edition:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(entry?.id??'') && Array.isArray(entry.providerItemIds) && entry.providerItemIds.length<=500000) for (const itemId of entry.providerItemIds) if(typeof itemId==='string'&&providerItems[itemId]) previousByRecord.set(itemId, entry);
  }
  const result=[];
  for(const items of grouped.values()) {
    yield;
    const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
    const normalizedTitles = ordered.map((item) => item.normalizedTitle).sort();
    const previous = ordered.map((item) => previousByRecord.get(item.id)).find((entry) => entry && !usedIds.has(entry.id));
    let id = previous?.id ?? `edition:${ordered[0].recordRef}`;
    // A split can leave another group using this record's original ID.
    // Never overwrite that group when input/provider order changes.
    if(usedIds.has(id))id=ordered.map(item=>`edition:${item.recordRef}`).find(candidate=>!usedIds.has(candidate))??`edition:${crypto.randomUUID()}`;
    usedIds.add(id);
    const displayTitlePreferences=Object.fromEntries(ordered.filter(item=>titlePreferences.has(item.recordRef)).map(item=>[item.recordRef,titlePreferences.get(item.recordRef)]));
    result.push([id, {
      id,
      mediaType: ordered[0].mediaType,
      title: ordered[0].title,
      normalizedTitle: normalizedTitles[0],
      baseTitle: ordered[0].baseTitle,
      edition: ordered[0].edition,
      providerItemIds: ordered.map((item) => item.id),
      ...(Object.keys(displayTitlePreferences).length?{displayTitlePreferences}:{}),
      providerCount: ordered.length
    }]);
  }
  return Object.fromEntries(result);
}

export function validateDatabase(value) {
  return finishWork(databaseSteps(value));
}
export function validateDatabaseAsync(value,options){return finishWorkAsync(databaseSteps(value),options);}
function* databaseSteps(value) {
  yield 'validation_records';
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Backup does not contain a database object.');
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, DATABASE_SCHEMA_VERSION].includes(value.schemaVersion)) throw new Error(`Unsupported database schema version: ${value.schemaVersion ?? '(missing)'}.`);
  if (!value.providerItems || typeof value.providerItems !== 'object' || Array.isArray(value.providerItems)) throw new Error('Backup is missing provider items.');
  if (Object.keys(value.providerItems).length>500000) throw new Error('The database contains too many provider records.');
  value=migrateProviderProfiles(value);
  const providerProfiles=validateProviderProfiles(value.providerProfiles);
  object(value.legacyProfileNamespaces??{},'Legacy profile namespaces');
  const legacyProfileNamespaces={};
  for(const [provider,id]of Object.entries(value.legacyProfileNamespaces??{})){if(!PROVIDERS.includes(provider))throw Error('Invalid legacy namespace provider.');legacyProfileNamespaces[provider]=profileRef(id);}
  for(const p of Object.values(providerProfiles))if(!p.keySpace){if(legacyProfileNamespaces[p.provider]&&legacyProfileNamespaces[p.provider]!==p.profileId)throw Error('Legacy namespace belongs to another profile.');legacyProfileNamespaces[p.provider]=p.profileId;}
  const profileFor=item=>{const p=providerProfiles[item.profileId];if(!p||p.provider!==item.provider)throw Error('Record belongs to an unknown provider profile.');return p;};
  const normalizedItems=[];
  for(const item of Object.values(value.providerItems)) {
    yield;
    const normalized = normalizeProviderItem({...item,observedAt:item?.observedAt??null}, typeof item?.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),{profileKeySpace:profileFor(item).keySpace});
    normalizedItems.push([normalized.id, normalized]);
  }
  if(new Set(normalizedItems.map(([id])=>id)).size!==normalizedItems.length)throw new Error('Backup contains duplicate provider identities.');
  const providerItems = Object.fromEntries(normalizedItems);
  // Older Humble imports labelled a game product as a direct download even
  // when that purchase delivered it through a key. Preserve both records, but
  // do not let the duplicate product conceal explicit negative key evidence.
  const unavailablePurchases=new Set(Object.values(providerItems)
    .filter(item=>item.provider==='humble'&&item.metadata.entitlement==='third-party-key'
      &&['expired','unavailable'].includes(item.metadata.keyStatus)&&item.metadata.purchaseId)
    .map(item=>JSON.stringify([item.profileId,item.metadata.purchaseId,item.normalizedTitle])));
  for(const item of Object.values(providerItems))if(item.provider==='humble'&&item.mediaType==='game'
    &&item.metadata.entitlement==='direct-download'&&unavailablePurchases.has(JSON.stringify([item.profileId,item.metadata.purchaseId,item.normalizedTitle])))item.ownership='unknown';
  const providers = validateProviderStates(value.providers ?? {});
  for(const [provider,state]of Object.entries(providers)){const p=providerProfiles[state.activeProfileId];if(!p||p.provider!==provider)throw Error('Invalid active provider profile.');providers[provider]={...p.state,activeProfileId:p.profileId,profileLabel:p.nickname};}
  yield 'validation_history';
  object(value.providerHistory??{},'Provider history');
  if(Object.keys(value.providerHistory??{}).length>500000)throw new Error('Provider history exceeds its limit.');
  const historyEntries=[];
  let currentByReference;
  for(const [ref,entry] of Object.entries(value.providerHistory??{})){
    yield;
    object(entry,'Historical record');
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(ref)||!['missing-from-complete-scan','profile-switch','duplicate-observation'].includes(entry.reason))throw new Error('Invalid historical record.');
    const item=normalizeProviderItem({...entry.item,observedAt:entry.item?.observedAt??null},entry.item?.updatedAt,{profileKeySpace:profileFor(entry.item).keySpace});
    if(item.recordRef!==ref)throw Error('Historical reference does not match its record.');
    if(entry.reason==='duplicate-observation'){
      currentByReference??=new Map(Object.values(providerItems).map(row=>[row.recordRef,row]));
      const target=currentByReference.get(entry.duplicateOf)??(value.providerHistory?.[entry.duplicateOf]?.reason!=='duplicate-observation'?value.providerHistory?.[entry.duplicateOf]?.item:null);
      if(item.provider!=='amazon-games'||!target||target.provider!=='amazon-games'||target.profileId!==item.profileId||target.recordRef===item.recordRef)throw Error('Invalid repeated Amazon Games observation association.');
    }
    historyEntries.push([ref,{item,profileLabel:text(entry.profileLabel??'',100,'Historical profile'),missingSince:date(entry.missingSince),reason:entry.reason,...(entry.reason==='duplicate-observation'?{duplicateOf:entry.duplicateOf}:{})}]);
  }
  const providerHistory=Object.fromEntries(historyEntries);
  const refs=new Set();
  yield 'validation_other';
  for(const item of Object.values(providerItems)){
    yield;
    if(refs.has(item.recordRef))throw new Error('Backup contains duplicate persistent record references.');
    refs.add(item.recordRef);
  }
  for(const [ref,h]of Object.entries(providerHistory)){if(refs.has(ref))throw Error('Historical and current records share a reference.');refs.add(ref);}
  const companionFeeds=validateCompanionFeeds(value.companionFeeds);
  for(const feed of Object.values(companionFeeds)){
    if(!feed.profileId)feed.profileId=Object.values(providerProfiles).find(p=>p.provider==='humble'&&p.nickname===feed.profileLabel)?.profileId;
    const p=providerProfiles[feed.profileId];if(!p||p.provider!=='humble')throw Error('Companion feed belongs to an unknown Humble profile.');
  }

  for(const feed of Object.values(companionFeeds))for(const entry of feed.entries)if(refs.has(entry.localRef)||Object.hasOwn(providerHistory,entry.localRef))throw new Error('A companion reminder reference collides with a library record.');
  const manualMatchDecisions = {};
  object(value.manualMatchDecisions??{},'Saved relationships');
  if (Object.keys(value.manualMatchDecisions??{}).length>100000) throw new Error('Too many saved relationships.');
  for(const decision of Object.values(value.manualMatchDecisions??{})){
    yield;
    if(!['same','same-work','same-edition','different'].includes(decision?.decision)||!Array.isArray(decision.itemIds)||decision.itemIds.length!==2||decision.itemIds.some(id=>typeof id!=='string')||decision.itemIds[0]===decision.itemIds[1])throw new Error('Invalid saved relationship.');
    const itemIds=[...decision.itemIds].sort();
    const [left,right]=itemIds.map(id=>providerItems[id]);
    if(left&&right&&left.mediaType!==right.mediaType)throw new Error('A saved relationship crosses media types.');
    if(itemIds.some(id=>id.length>600))throw new Error('Saved relationship IDs exceed their bounds.');
    manualMatchDecisions[itemIds.join('\u0000')]={decision:decision.decision,itemIds,updatedAt:date(decision.updatedAt)};
  }
  object(value.contentReviews??{},'Contents reviews');
  if(Object.keys(value.contentReviews??{}).length>500000)throw new Error('Too many contents reviews.');
  const editionSeparations=validateEditionSeparations(value.editionSeparations??{});
  for(const separation of Object.values(editionSeparations)){
    yield;
    const item=providerItems[separation.itemId];
    if(item&&separation.otherItemIds.some(id=>providerItems[id]&&providerItems[id].mediaType!==item.mediaType))throw new Error('An edition separation crosses media types.');
  }
  const ownershipPolicy=validateOwnershipPolicy(value.ownershipPolicy);
  yield 'validation_history';
  const enrichmentHistory=yield* enrichmentHistorySteps(value.enrichmentHistory);
  const observations=value.kindleContentsObservations!==undefined?yield* kindleContentsObservationsSteps(value.kindleContentsObservations,[...Object.values(providerItems),...Object.values(providerHistory).map(entry=>entry.item)]):undefined;
  yield 'validation_other';
  const remaining={enrichmentReviews:validateEnrichmentReviews(value.enrichmentReviews),titleAliases:validateTitleAliases(value.titleAliases),
    readingStates:validateReadingStates(value.readingStates),readingOrders:validateReadingOrders(value.readingOrders),reminderReviews:validateReminderReviews(value.reminderReviews),
    ownershipReviews:validateOwnershipReviews(value.ownershipReviews),ownershipProposals:validateOwnershipProposals(value.ownershipProposals)};
  for(const proposal of Object.values(remaining.ownershipProposals)){if(proposal.profileId&&providerProfiles[proposal.profileId]?.provider!==proposal.evidence.provider)throw Error('Receipt belongs to an unknown provider profile.');}
  yield 'validation_canonical';
  const canonicalItems=yield* canonicalItemsSteps(providerItems,manualMatchDecisions,value.canonicalItems,editionSeparations);
  yield 'validation_other';
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,companionFeeds,providerProfiles,legacyProfileNamespaces,
    unresolvedProfileState: validateUnresolvedProfileState(value.unresolvedProfileState),
    providers,
    ownershipPolicy,
    providerHistory,
    enrichmentHistory,
    ...(observations!==undefined?{kindleContentsObservations:observations}:{}),
    ...remaining,
    providerItems,
    canonicalItems,
    manualMatchDecisions,
    editionSeparations,
    contentReviews: Object.fromEntries(Object.entries(value.contentReviews ?? {}).map(([id, review]) => {if(id.length>600)throw new Error('Contents review ID exceeds its bounds.');return [id, validateContentReview(review)];}))
  };
}

function validateUnresolvedProfileState(value={}){
  object(value,'Unresolved legacy profile state');const result={};
  for(const key of ['contentReviews','manualMatchDecisions','editionSeparations','ownershipProposals','companionFeeds']){
    object(value[key]??{},'Unresolved profile decisions');if(Object.keys(value[key]??{}).length>500000)throw Error('Too much unresolved legacy state.');
    // These entries never participate in matching. Validate their old payloads
    // through the same validators instead of retaining arbitrary backup data.
    const entries=value[key]??{};
    if(key==='contentReviews')result[key]=Object.fromEntries(Object.entries(entries).map(([id,r])=>{if(id.length>600)throw Error('Invalid legacy review ID.');return [id,validateContentReview(r)];}));
    else if(key==='editionSeparations')result[key]=validateEditionSeparations(entries);
    else if(key==='ownershipProposals')result[key]=validateOwnershipProposals(entries);
    else if(key==='companionFeeds')result[key]=validateCompanionFeeds(entries);
    else {result[key]={};for(const [id,d]of Object.entries(entries)){if(!['same','same-work','same-edition','different'].includes(d.decision)||!Array.isArray(d.itemIds)||d.itemIds.length!==2||d.itemIds.some(i=>typeof i!=='string'||i.length>600)||d.itemIds[0]===d.itemIds[1])throw Error('Invalid unresolved relationship.');result[key][id]={decision:d.decision,itemIds:d.itemIds,updatedAt:date(d.updatedAt)};}}
  }return result;
}
