import { createBackup, clearDatabase, getAllowedExternalClientIds, getDatabase, parseBackup, removeManualMatchDecision, saveAllowedExternalClientIds, saveDatabase, saveManualMatchDecision } from '../lib/storage.js';
import { DATABASE_STORAGE_KEY } from '../lib/constants.js';
import { findDuplicateCandidates } from '../lib/duplicate-review.js';
import { isExtensionId } from '../lib/external-api.js';

const providers = document.querySelector('#providers');
const search = document.querySelector('#search');
const providerFilter = document.querySelector('#provider-filter');
const mediaTypeFilter = document.querySelector('#media-type-filter');
const dlcFilter = document.querySelector('#dlc-filter');
const clearFilters = document.querySelector('#clear-filters');
const summary = document.querySelector('#library-summary');
const items = document.querySelector('#library-items');
const unlinkedAddOnsSection = document.querySelector('#unlinked-add-ons-section');
const unlinkedAddOnsSummary = document.querySelector('#unlinked-add-ons-summary');
const unlinkedAddOns = document.querySelector('#unlinked-add-ons');
const duplicateReviewSummary = document.querySelector('#duplicate-review-summary');
const duplicateReviewItems = document.querySelector('#duplicate-review-items');
const reviewedDuplicates = document.querySelector('#reviewed-duplicates');
const reviewedDuplicatesSummary = document.querySelector('#reviewed-duplicates-summary');
const reviewedDuplicateItems = document.querySelector('#reviewed-duplicate-items');
const backupStatus = document.querySelector('#backup-status');
const humbleExtensionId = document.querySelector('#humble-extension-id');
const humbleExtensionLinkStatus = document.querySelector('#humble-extension-link-status');
const galacticExtensionId = document.querySelector('#galactic-extension-id');
let database;

function displayProviderName(provider) {
  if (provider === 'gog') return 'GOG';
  if (provider === 'amazon-video') return 'Amazon Video';
  if (provider === 'fandango-at-home') return 'Fandango at Home';
  return provider[0].toUpperCase() + provider.slice(1);
}

function displayMediaType(mediaType) {
  if (mediaType === 'audiobook') return 'Audiobook';
  if (mediaType === 'book') return 'Book';
  if (mediaType === 'movie') return 'Movie';
  if (mediaType === 'tv') return 'TV show';
  return 'Game';
}

function displayRecordProviders(records) {
  const byProvider = new Map();
  for (const record of records) {
    const providerRecords = byProvider.get(record.provider) ?? [];
    providerRecords.push(record);
    byProvider.set(record.provider, providerRecords);
  }
  return [...byProvider].map(([provider, providerRecords]) => {
    const count = providerRecords.length;
    const name = displayProviderName(provider);
    const ownerships = [...new Set(providerRecords.map((record) => record.ownership))];
    const ownership = ownerships.length === 1 ? ownerships[0] : '';
    const ownershipSuffix = ownership && ownership !== 'owned' ? ` · ${ownership}` : '';
    return `${count === 1 ? name : `${name} (${count} records)`}${ownershipSuffix}`;
  }).join(' · ');
}

function metadataValues(records, key) {
  return [...new Set(records.flatMap((record) => {
    const value = record.metadata?.[key];
    return Array.isArray(value) ? value : value ? [value] : [];
  }).map(String).filter(Boolean))];
}

function displayMediaMetadata(records, mediaType) {
  if (mediaType !== 'book' && mediaType !== 'audiobook') return '';
  const parts = [];
  const authors = metadataValues(records, 'authors');
  const series = metadataValues(records, 'series');
  if (authors.length) parts.push(`By ${authors.join(', ')}`);
  if (series.length) parts.push(`Series: ${series.join(', ')}`);
  if (mediaType === 'audiobook') {
    const narrators = metadataValues(records, 'narrators');
    if (narrators.length) parts.push(`Narrated by ${narrators.join(', ')}`);
  }
  return parts.join(' · ');
}

function textElement(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function itemMatchesQuery(item, query) {
  return !query || item.title.toLocaleLowerCase().includes(query) || item.normalizedTitle.includes(query);
}

function selectedFilters() {
  return {
    provider: providerFilter.value,
    mediaType: mediaTypeFilter.value,
    dlc: dlcFilter.value
  };
}

function providerMatches(record, provider) {
  return provider === 'all' || record.provider === provider;
}

function filtersAreActive(filters, query) {
  return Boolean(query) || filters.provider !== 'all' || filters.mediaType !== 'all' || filters.dlc !== 'all';
}

function populateProviderFilter(providerEntries) {
  const selected = providerFilter.value;
  const options = [
    ['all', 'All providers'],
    ...providerEntries.map(([id]) => [id, displayProviderName(id)])
  ];
  providerFilter.replaceChildren(...options.map(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
  providerFilter.value = options.some(([value]) => value === selected) ? selected : 'all';
}

function parentRecordKey(addOn) {
  const parentId = String(addOn.metadata?.parentProviderItemId ?? '').trim();
  return parentId ? `${addOn.provider}:${parentId}` : null;
}

function createAddOnList(addOns) {
  const group = document.createElement('div');
  const label = textElement('strong', `DLC (${addOns.length})`);
  label.className = 'add-ons-label';
  const list = document.createElement('ul');
  list.className = 'add-ons';
  list.replaceChildren(...addOns
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((addOn) => textElement('li', `${addOn.title} (${displayProviderName(addOn.provider)})`)));
  group.append(label, list);
  return group;
}

function reviewRecordLabel(record) {
  return `${record.title} — ${displayProviderName(record.provider)}`;
}

function reviewButton(label, className, onClick) {
  const button = textElement('button', label);
  button.type = 'button';
  button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

function createReviewRow(candidate, reviewed = false) {
  const node = document.createElement('li');
  const records = candidate.itemIds.map((id) => database.providerItems[id]).filter(Boolean);
  node.append(textElement('strong', `${displayMediaType(candidate.mediaType)} · ${Math.round(candidate.confidence * 100)}% candidate`));
  const recordList = document.createElement('div');
  recordList.className = 'review-records';
  recordList.replaceChildren(...records.map((record) => textElement('span', reviewRecordLabel(record))));
  node.append(recordList);
  node.append(textElement('p', candidate.reasons.map((reason) => reason.text).join(' ')));
  node.lastElementChild.className = 'review-reasons';
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  if (reviewed) {
    actions.append(textElement('span', candidate.decision === 'same' ? 'Marked as the same work.' : 'Marked as different works.'));
    actions.append(reviewButton('Undo decision', 'undo', async () => {
      try {
        database = await removeManualMatchDecision(candidate.id);
        render();
      } catch (error) {
        backupStatus.textContent = `Could not undo duplicate decision: ${error.message}`;
      }
    }));
  } else {
    actions.append(reviewButton('Same work', 'same', async () => {
      try {
        database = await saveManualMatchDecision(candidate, 'same');
        render();
      } catch (error) {
        backupStatus.textContent = `Could not save duplicate decision: ${error.message}`;
      }
    }));
    actions.append(reviewButton('Different works', 'different', async () => {
      try {
        database = await saveManualMatchDecision(candidate, 'different');
        render();
      } catch (error) {
        backupStatus.textContent = `Could not save duplicate decision: ${error.message}`;
      }
    }));
  }
  node.append(actions);
  return node;
}

function renderDuplicateReview() {
  const candidates = findDuplicateCandidates(database.providerItems, database.manualMatchDecisions);
  const unresolved = candidates.filter((candidate) => !candidate.decision);
  const reviewed = candidates.filter((candidate) => candidate.decision);
  duplicateReviewSummary.textContent = unresolved.length
    ? `${unresolved.length} possible duplicate${unresolved.length === 1 ? '' : 's'} need review. They remain separate until you confirm them.`
    : 'No possible duplicates need review.';
  duplicateReviewItems.replaceChildren(...unresolved.map((candidate) => createReviewRow(candidate)));
  reviewedDuplicates.hidden = reviewed.length === 0;
  reviewedDuplicatesSummary.textContent = `${reviewed.length} saved duplicate decision${reviewed.length === 1 ? '' : 's'}`;
  reviewedDuplicateItems.replaceChildren(...reviewed.map((candidate) => createReviewRow(candidate, true)));
}

async function renderHumbleExtensionLink() {
  const ids = await getAllowedExternalClientIds();
  galacticExtensionId.textContent = chrome.runtime.id;
  humbleExtensionId.value = ids[0] ?? '';
  humbleExtensionLinkStatus.textContent = ids.length
    ? `Allowed extension ID: ${ids[0]}.`
    : 'No companion extension is allowed yet.';
}

function render() {
  const providerEntries = Object.entries(database.providers).sort(([left], [right]) => left.localeCompare(right));
  populateProviderFilter(providerEntries);
  providers.replaceChildren(...(providerEntries.length ? providerEntries.map(([id, state]) => {
    const node = document.createElement('article');
    node.className = 'provider';
    const providerParts = [];
    if (state.itemCount) providerParts.push(`${state.itemCount} games`);
    if (state.audiobookCount) providerParts.push(`${state.audiobookCount} audiobooks`);
    if (state.bookCount) providerParts.push(`${state.bookCount} books`);
    if (state.movieCount) providerParts.push(`${state.movieCount} movies`);
    if (state.tvCount) providerParts.push(`${state.tvCount} TV titles`);
    if (state.addOnCount) providerParts.push(`${state.addOnCount} DLC`);
    if (!providerParts.length) providerParts.push('0 items');
    if (state.lastSync) providerParts.push(`synced ${new Date(state.lastSync).toLocaleString()}`);
    const providerSummary = providerParts.join(' · ');
    node.append(textElement('strong', displayProviderName(id)), textElement('span', providerSummary));
    return node;
  }) : [Object.assign(document.createElement('p'), { textContent: 'No libraries connected.' })]));

  const allRecords = Object.values(database.providerItems);
  const addOns = allRecords.filter((item) => item.mediaType === 'game-addon');
  const addOnsByParent = new Map();
  for (const addOn of addOns) {
    const parentKey = parentRecordKey(addOn);
    if (!parentKey) continue;
    const existing = addOnsByParent.get(parentKey) ?? [];
    existing.push(addOn);
    addOnsByParent.set(parentKey, existing);
  }

  const query = search.value.trim().toLocaleLowerCase();
  const filters = selectedFilters();
  const canonical = Object.values(database.canonicalItems)
    .filter((item) => {
      const records = item.providerItemIds.map((id) => database.providerItems[id]);
      const linkedAddOns = records.flatMap((record) => addOnsByParent.get(record.id) ?? []);
      const matchesProvider = records.some((record) => providerMatches(record, filters.provider));
      const matchesMediaType = filters.mediaType === 'all' || item.mediaType === filters.mediaType;
      const hasDlc = linkedAddOns.length > 0;
      const matchesDlc = filters.dlc === 'all' || (item.mediaType === 'game' && (filters.dlc === 'with' ? hasDlc : !hasDlc));
      const matchesSearch = itemMatchesQuery(item, query)
        || linkedAddOns.some((addOn) => providerMatches(addOn, filters.provider) && itemMatchesQuery(addOn, query));
      return matchesProvider && matchesMediaType && matchesDlc && matchesSearch;
    })
    .sort((left, right) => left.title.localeCompare(right.title));
  const gameCanonicalCount = canonical.filter((item) => item.mediaType === 'game').length;
  const audiobookCanonicalCount = canonical.filter((item) => item.mediaType === 'audiobook').length;
  const bookCanonicalCount = canonical.filter((item) => item.mediaType === 'book').length;
  const movieCanonicalCount = canonical.filter((item) => item.mediaType === 'movie').length;
  const tvCanonicalCount = canonical.filter((item) => item.mediaType === 'tv').length;
  const visibleRecords = canonical.flatMap((item) => item.providerItemIds.map((id) => database.providerItems[id]))
    .filter((record) => providerMatches(record, filters.provider));
  const gameRecordCount = visibleRecords.filter((item) => item.mediaType === 'game').length;
  const audiobookRecordCount = visibleRecords.filter((item) => item.mediaType === 'audiobook').length;
  const bookRecordCount = visibleRecords.filter((item) => item.mediaType === 'book').length;
  const movieRecordCount = visibleRecords.filter((item) => item.mediaType === 'movie').length;
  const tvRecordCount = visibleRecords.filter((item) => item.mediaType === 'tv').length;
  const summaryParts = [];
  const suffix = filtersAreActive(filters, query) ? ' matching filters' : '';
  if (gameCanonicalCount || (!audiobookCanonicalCount && !bookCanonicalCount && !movieCanonicalCount && !tvCanonicalCount)) summaryParts.push(`${gameCanonicalCount} unique game${gameCanonicalCount === 1 ? '' : 's'}`);
  if (audiobookCanonicalCount) summaryParts.push(`${audiobookCanonicalCount} unique audiobook${audiobookCanonicalCount === 1 ? '' : 's'}`);
  if (bookCanonicalCount) summaryParts.push(`${bookCanonicalCount} unique book${bookCanonicalCount === 1 ? '' : 's'}`);
  if (movieCanonicalCount) summaryParts.push(`${movieCanonicalCount} unique movie${movieCanonicalCount === 1 ? '' : 's'}`);
  if (tvCanonicalCount) summaryParts.push(`${tvCanonicalCount} unique TV title${tvCanonicalCount === 1 ? '' : 's'}`);
  if (gameRecordCount) summaryParts.push(`${gameRecordCount} game record${gameRecordCount === 1 ? '' : 's'}`);
  if (audiobookRecordCount) summaryParts.push(`${audiobookRecordCount} audiobook record${audiobookRecordCount === 1 ? '' : 's'}`);
  if (bookRecordCount) summaryParts.push(`${bookRecordCount} book record${bookRecordCount === 1 ? '' : 's'}`);
  if (movieRecordCount) summaryParts.push(`${movieRecordCount} movie record${movieRecordCount === 1 ? '' : 's'}`);
  if (tvRecordCount) summaryParts.push(`${tvRecordCount} TV record${tvRecordCount === 1 ? '' : 's'}`);
  const visibleAddOnCount = addOns.filter((item) => providerMatches(item, filters.provider)).length;
  if (visibleAddOnCount) summaryParts.push(`${visibleAddOnCount} DLC add-on${visibleAddOnCount === 1 ? '' : 's'}`);
  summary.textContent = summaryParts.length ? `${summaryParts.join(' · ')}${suffix}.` : `No library items${suffix}.`;

  const linkedAddOnIds = new Set();
  items.replaceChildren(...canonical.map((canonicalItem) => {
    const node = document.createElement('li');
    const records = canonicalItem.providerItemIds.map((id) => database.providerItems[id]);
    const linkedAddOns = records.flatMap((record) => addOnsByParent.get(record.id) ?? []);
    for (const addOn of linkedAddOns) linkedAddOnIds.add(addOn.id);
    node.className = 'library-item';
    const header = document.createElement('div');
    header.className = 'library-item-header';
    const providerText = displayRecordProviders(records);
    header.append(textElement('strong', canonicalItem.title), textElement('span', canonicalItem.mediaType === 'game' ? providerText : `${displayMediaType(canonicalItem.mediaType)} · ${providerText}`));
    node.append(header);
    const metadataText = displayMediaMetadata(records, canonicalItem.mediaType);
    if (metadataText) {
      const metadata = textElement('div', metadataText);
      metadata.className = 'library-item-metadata';
      node.append(metadata);
    }
    if (linkedAddOns.length) node.append(createAddOnList(linkedAddOns));
    return node;
  }));

  const canShowUnlinkedAddOns = (filters.mediaType === 'all' || filters.mediaType === 'game') && filters.dlc === 'all';
  const unlinked = canShowUnlinkedAddOns
    ? addOns.filter((addOn) => !linkedAddOnIds.has(addOn.id) && providerMatches(addOn, filters.provider) && itemMatchesQuery(addOn, query))
    : [];
  unlinkedAddOnsSection.hidden = unlinked.length === 0;
  if (unlinked.length) {
    unlinkedAddOnsSummary.textContent = 'The provider did not return a parent game record for these add-ons.';
    unlinkedAddOns.replaceChildren(...unlinked.map((addOn) => {
      const node = document.createElement('li');
      node.append(textElement('strong', addOn.title), textElement('span', displayProviderName(addOn.provider)));
      return node;
    }));
  } else {
    unlinkedAddOns.replaceChildren();
  }
  renderDuplicateReview();
}

async function refresh() {
  database = await getDatabase();
  render();
  await renderHumbleExtensionLink();
}

document.querySelector('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(createBackup(database), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'galactic-library-backup-v1.json' });
  link.click();
  URL.revokeObjectURL(url);
  backupStatus.textContent = 'Backup downloaded.';
});

document.querySelector('#import').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await saveDatabase(parseBackup(JSON.parse(await file.text())));
    await refresh();
    backupStatus.textContent = 'Backup restored.';
  } catch (error) {
    backupStatus.textContent = `Import failed: ${error.message}`;
  } finally {
    event.target.value = '';
  }
});

document.querySelector('#clear').addEventListener('click', async () => {
  if (!confirm('Clear every locally stored provider record, match, and setting?')) return;
  await clearDatabase();
  await refresh();
  backupStatus.textContent = 'Local library cleared.';
});
document.querySelector('#save-humble-extension-id').addEventListener('click', async () => {
  const id = humbleExtensionId.value.trim();
  if (!isExtensionId(id)) {
    humbleExtensionLinkStatus.textContent = 'Enter a valid 32-character Chrome extension ID.';
    return;
  }
  try {
    await saveAllowedExternalClientIds([id]);
    humbleExtensionLinkStatus.textContent = `Allowed extension ID: ${id}.`;
  } catch (error) {
    humbleExtensionLinkStatus.textContent = `Could not save the allowed extension: ${error.message}`;
  }
});
document.querySelector('#clear-humble-extension-id').addEventListener('click', async () => {
  try {
    await saveAllowedExternalClientIds([]);
    humbleExtensionId.value = '';
    humbleExtensionLinkStatus.textContent = 'Companion extension link removed.';
  } catch (error) {
    humbleExtensionLinkStatus.textContent = `Could not remove the companion extension: ${error.message}`;
  }
});
search.addEventListener('input', render);
providerFilter.addEventListener('change', render);
mediaTypeFilter.addEventListener('change', render);
dlcFilter.addEventListener('change', render);
clearFilters.addEventListener('click', () => {
  search.value = '';
  providerFilter.value = 'all';
  mediaTypeFilter.value = 'all';
  dlcFilter.value = 'all';
  render();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[DATABASE_STORAGE_KEY]) refresh().catch(() => {});
});
refresh().catch((error) => { backupStatus.textContent = `Could not load library: ${error.message}`; });
