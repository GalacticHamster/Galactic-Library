import { createBackup, clearDatabase, getDatabase, parseBackup, saveDatabase } from '../lib/storage.js';
import { DATABASE_STORAGE_KEY } from '../lib/constants.js';

const providers = document.querySelector('#providers');
const search = document.querySelector('#search');
const summary = document.querySelector('#library-summary');
const items = document.querySelector('#library-items');
const unlinkedAddOnsSection = document.querySelector('#unlinked-add-ons-section');
const unlinkedAddOnsSummary = document.querySelector('#unlinked-add-ons-summary');
const unlinkedAddOns = document.querySelector('#unlinked-add-ons');
const backupStatus = document.querySelector('#backup-status');
let database;

function displayProviderName(provider) {
  return provider === 'gog' ? 'GOG' : provider[0].toUpperCase() + provider.slice(1);
}

function displayMediaType(mediaType) {
  return mediaType === 'audiobook' ? 'Audiobook' : 'Game';
}

function displayRecordProviders(records) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record.provider, (counts.get(record.provider) ?? 0) + 1);
  }
  return [...counts].map(([provider, count]) => {
    const name = displayProviderName(provider);
    return count === 1 ? name : `${name} (${count} records)`;
  }).join(' · ');
}

function textElement(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function itemMatchesQuery(item, query) {
  return !query || item.title.toLocaleLowerCase().includes(query) || item.normalizedTitle.includes(query);
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

function render() {
  const providerEntries = Object.entries(database.providers).sort(([left], [right]) => left.localeCompare(right));
  providers.replaceChildren(...(providerEntries.length ? providerEntries.map(([id, state]) => {
    const node = document.createElement('article');
    node.className = 'provider';
    const providerParts = [];
    if (state.itemCount) providerParts.push(`${state.itemCount} games`);
    if (state.audiobookCount) providerParts.push(`${state.audiobookCount} audiobooks`);
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
  const canonical = Object.values(database.canonicalItems)
    .filter((item) => itemMatchesQuery(item, query) || item.providerItemIds.some((id) => (addOnsByParent.get(id) ?? []).some((addOn) => itemMatchesQuery(addOn, query))))
    .sort((left, right) => left.title.localeCompare(right.title));
  const gameCanonicalCount = canonical.filter((item) => item.mediaType === 'game').length;
  const audiobookCanonicalCount = canonical.filter((item) => item.mediaType === 'audiobook').length;
  const gameRecordCount = allRecords.filter((item) => item.mediaType === 'game').length;
  const audiobookRecordCount = allRecords.filter((item) => item.mediaType === 'audiobook').length;
  const summaryParts = [];
  if (gameCanonicalCount || !audiobookCanonicalCount) summaryParts.push(`${gameCanonicalCount}${query ? ' matching' : ''} unique game${gameCanonicalCount === 1 ? '' : 's'}`);
  if (audiobookCanonicalCount) summaryParts.push(`${audiobookCanonicalCount}${query ? ' matching' : ''} unique audiobook${audiobookCanonicalCount === 1 ? '' : 's'}`);
  if (gameRecordCount) summaryParts.push(`${gameRecordCount} game record${gameRecordCount === 1 ? '' : 's'}`);
  if (audiobookRecordCount) summaryParts.push(`${audiobookRecordCount} audiobook record${audiobookRecordCount === 1 ? '' : 's'}`);
  if (addOns.length) summaryParts.push(`${addOns.length} DLC add-on${addOns.length === 1 ? '' : 's'}`);
  summary.textContent = `${summaryParts.join(' · ')}.`;

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
    header.append(textElement('strong', canonicalItem.title), textElement('span', canonicalItem.mediaType === 'audiobook' ? `${displayMediaType(canonicalItem.mediaType)} · ${providerText}` : providerText));
    node.append(header);
    if (linkedAddOns.length) node.append(createAddOnList(linkedAddOns));
    return node;
  }));

  const unlinked = addOns.filter((addOn) => !linkedAddOnIds.has(addOn.id) && itemMatchesQuery(addOn, query));
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
}

async function refresh() {
  database = await getDatabase();
  render();
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
search.addEventListener('input', render);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[DATABASE_STORAGE_KEY]) refresh().catch(() => {});
});
refresh().catch((error) => { backupStatus.textContent = `Could not load library: ${error.message}`; });
