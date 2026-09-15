import { createBackup, clearDatabase, getDatabase, parseBackup, saveDatabase } from '../lib/storage.js';
import { DATABASE_STORAGE_KEY } from '../lib/constants.js';

const providers = document.querySelector('#providers');
const search = document.querySelector('#search');
const summary = document.querySelector('#library-summary');
const items = document.querySelector('#library-items');
const backupStatus = document.querySelector('#backup-status');
let database;

function displayProviderName(provider) {
  return provider === 'gog' ? 'GOG' : provider[0].toUpperCase() + provider.slice(1);
}

function textElement(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function render() {
  const providerEntries = Object.entries(database.providers).sort(([left], [right]) => left.localeCompare(right));
  providers.replaceChildren(...(providerEntries.length ? providerEntries.map(([id, state]) => {
    const node = document.createElement('article');
    node.className = 'provider';
    const providerSummary = `${state.itemCount ?? 0} games${state.lastSync ? ` · synced ${new Date(state.lastSync).toLocaleString()}` : ''}`;
    node.append(textElement('strong', displayProviderName(id)), textElement('span', providerSummary));
    return node;
  }) : [Object.assign(document.createElement('p'), { textContent: 'No libraries connected.' })]));

  const query = search.value.trim().toLocaleLowerCase();
  const canonical = Object.values(database.canonicalItems)
    .filter((item) => !query || item.title.toLocaleLowerCase().includes(query) || item.normalizedTitle.includes(query))
    .sort((left, right) => left.title.localeCompare(right.title));
  const total = Object.keys(database.providerItems).length;
  summary.textContent = `${canonical.length}${query ? ' matching' : ''} unique game${canonical.length === 1 ? '' : 's'} · ${total} provider record${total === 1 ? '' : 's'}.`;
  items.replaceChildren(...canonical.map((canonicalItem) => {
    const node = document.createElement('li');
    const records = canonicalItem.providerItemIds.map((id) => database.providerItems[id]);
    node.append(textElement('strong', canonicalItem.title), textElement('span', records.map((record) => displayProviderName(record.provider)).join(' · ')));
    return node;
  }));
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
