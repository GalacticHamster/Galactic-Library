import { clearGoogleBooksEnrichmentJob, createBackup, clearDatabase, getAllowedExternalClientIds, getDatabase, getGoogleBooksApiKey, getGoogleBooksEnrichmentJob, parseBackup, removeManualMatchDecision, saveAllowedExternalClientIds, saveDatabase, saveGoogleBooksApiKey, saveGoogleBooksEnrichmentJob, saveGoogleBooksEnrichments, saveGoogleBooksGenreHints, saveManualMatchDecision, saveOpenLibraryEnrichment, startGoogleBooksEnrichmentJob } from '../lib/storage.js';
import { DATABASE_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY } from '../lib/constants.js';
import { findDuplicateCandidates } from '../lib/duplicate-review.js';
import { isExtensionId } from '../lib/external-api.js';
import { libraryBroadGenreValues } from '../lib/genre-hints.js';
import { googleBooksEnrichment, googleBooksGenreHint, googleBooksGenreHintCandidate, googleBooksMatchClassification, highConfidenceGoogleBooksCandidate } from '../lib/google-books.js';
import { openLibraryEnrichment } from '../lib/open-library.js';

const providers = document.querySelector('#providers');
const search = document.querySelector('#search');
const providerFilter = document.querySelector('#provider-filter');
const mediaTypeFilter = document.querySelector('#media-type-filter');
const ownershipFilter = document.querySelector('#ownership-filter');
const dlcFilter = document.querySelector('#dlc-filter');
const genreFilter = document.querySelector('#genre-filter');
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
const googleBooksApiKey = document.querySelector('#google-books-api-key');
const saveGoogleBooksApiKeyButton = document.querySelector('#save-google-books-api-key');
const clearGoogleBooksApiKeyButton = document.querySelector('#clear-google-books-api-key');
const startGoogleBooksEnrichmentButton = document.querySelector('#start-google-books-enrichment');
const pauseGoogleBooksEnrichmentButton = document.querySelector('#pause-google-books-enrichment');
const resetGoogleBooksEnrichmentButton = document.querySelector('#reset-google-books-enrichment');
const googleBooksEnrichmentStatus = document.querySelector('#google-books-enrichment-status');
const googleBooksEnrichmentDiagnostics = document.querySelector('#google-books-enrichment-diagnostics');
const googleBooksEnrichmentDiagnosticsSummary = document.querySelector('#google-books-enrichment-diagnostics-summary');
const googleBooksEnrichmentDiagnosticsItems = document.querySelector('#google-books-enrichment-diagnostics-items');
const humbleExtensionId = document.querySelector('#humble-extension-id');
const humbleExtensionLinkStatus = document.querySelector('#humble-extension-link-status');
const galacticExtensionId = document.querySelector('#galactic-extension-id');
let database;
const openLibrarySearches = new Map();
let googleBooksRunning = false;
let googleBooksPauseRequested = false;

function displayProviderName(provider) {
  if (provider === 'gog') return 'GOG';
  if (provider === 'amazon-games') return 'Amazon Games';
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

function providerSourceDetails(records) {
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
    const ownershipLabel = ownership === 'unknown'
      ? 'ownership unconfirmed'
      : ownership === 'subscription'
        ? 'subscription access'
        : ownership === 'rental'
          ? 'rental'
          : ownership === 'claimed'
            ? 'claimed'
            : '';
    return { label: count === 1 ? name : `${name} (${count} records)`, ownershipLabel };
  }).sort((left, right) => left.label.localeCompare(right.label));
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

function genreTagLabels(records) {
  const values = records.flatMap(libraryBroadGenreValues).map((genre) => `Genre: ${genre}`);
  return [...new Set(values)];
}

function createGenreTags(records) {
  const labels = genreTagLabels(records);
  if (!labels.length) return null;
  const node = document.createElement('div');
  node.className = 'genre-tags';
  const visible = labels.slice(0, 8);
  node.replaceChildren(...visible.map((label) => textElement('span', label)));
  if (labels.length > visible.length) node.append(textElement('span', `+${labels.length - visible.length} more`));
  return node;
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
    ownership: ownershipFilter.value,
    dlc: dlcFilter.value,
    genre: genreFilter.value
  };
}

function providerMatches(record, provider) {
  return provider === 'all' || record.provider === provider;
}

function ownershipMatches(record, ownership) {
  return ownership === 'all' || record.ownership === ownership;
}

function filtersAreActive(filters, query) {
  return Boolean(query) || filters.provider !== 'all' || filters.mediaType !== 'all' || filters.ownership !== 'all' || filters.dlc !== 'all' || filters.genre !== 'all';
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

function populateGenreFilter(records) {
  const selected = genreFilter.value;
  const byKey = new Map();
  for (const value of records.flatMap(libraryBroadGenreValues)) {
    const key = value.toLocaleLowerCase();
    if (!byKey.has(key)) byKey.set(key, value);
  }
  const options = [
    ['all', 'Any genre'],
    ...[...byKey.values()].sort((left, right) => left.localeCompare(right)).map((value) => [value, value])
  ];
  genreFilter.replaceChildren(...options.map(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
  genreFilter.value = options.some(([value]) => value === selected) ? selected : 'all';
}

function genreMatches(records, genre) {
  if (genre === 'all') return true;
  const key = genre.toLocaleLowerCase();
  return records.some((record) => libraryBroadGenreValues(record).some((value) => value.toLocaleLowerCase() === key));
}

function openLibraryCandidateLabel(candidate) {
  const parts = [candidate.title];
  if (candidate.authors?.length) parts.push(`by ${candidate.authors.join(', ')}`);
  if (candidate.firstPublishYear) parts.push(String(candidate.firstPublishYear));
  return parts.join(' — ');
}

async function searchOpenLibrary(canonicalItem, records) {
  const state = openLibrarySearches.get(canonicalItem.id) ?? {};
  openLibrarySearches.set(canonicalItem.id, { ...state, loading: true, error: '', candidates: [] });
  render();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEARCH_OPEN_LIBRARY',
      query: { title: canonicalItem.title, authors: metadataValues(records, 'authors') }
    });
    if (!response?.ok) throw new Error(response?.error ?? 'Open Library search did not complete.');
    openLibrarySearches.set(canonicalItem.id, { loading: false, error: '', candidates: response.candidates ?? [] });
  } catch (error) {
    openLibrarySearches.set(canonicalItem.id, { loading: false, error: error.message, candidates: [] });
  }
  render();
}

function createOpenLibraryTools(canonicalItem, records) {
  const container = document.createElement('div');
  container.className = 'open-library-tools';
  const enrichment = records.map((record) => record.metadata?.enrichment?.openLibrary).find(Boolean);
  const searchState = openLibrarySearches.get(canonicalItem.id);
  const button = reviewButton(enrichment ? 'Update Open Library metadata' : 'Find Open Library metadata', 'open-library-search', () => {
    searchOpenLibrary(canonicalItem, records).catch(() => {});
  });
  button.disabled = Boolean(searchState?.loading);
  container.append(button);
  if (enrichment?.workKey) {
    const source = document.createElement('a');
    source.href = `https://openlibrary.org${enrichment.workKey}`;
    source.target = '_blank';
    source.rel = 'noreferrer';
    source.textContent = 'View Open Library record';
    container.append(source);
  }
  if (!searchState) return container;
  if (searchState.loading) {
    container.append(textElement('span', 'Searching Open Library…'));
    return container;
  }
  if (searchState.error) {
    container.append(textElement('span', `Open Library search failed: ${searchState.error}`));
    return container;
  }
  if (!searchState.candidates.length) {
    container.append(textElement('span', 'No Open Library candidates found.'));
    return container;
  }
  const results = document.createElement('ul');
  results.className = 'open-library-results';
  for (const candidate of searchState.candidates) {
    const result = document.createElement('li');
    result.append(textElement('span', openLibraryCandidateLabel(candidate)));
    const apply = reviewButton('Apply', 'open-library-apply', async () => {
      try {
        database = await saveOpenLibraryEnrichment(canonicalItem.providerItemIds, openLibraryEnrichment(candidate));
        openLibrarySearches.delete(canonicalItem.id);
        render();
      } catch (error) {
        openLibrarySearches.set(canonicalItem.id, { loading: false, error: error.message, candidates: searchState.candidates });
        render();
      }
    });
    result.append(apply);
    results.append(result);
  }
  container.append(results);
  return container;
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

function googleBooksStatusText(job, prefix = '') {
  const total = job.queue.length;
  const remaining = Math.max(0, total - job.cursor);
  const outcomes = [`${job.processed}/${total} checked`, `${job.matched} matched`, `${job.genreHints ?? 0} genre hints`, `${job.noMatch} no exact match`, `${job.zeroResults} no results`, `${job.titleVariant} title variants`, `${job.authorVariant} author variants`, `${job.skipped} skipped`, `${job.errors} errors`];
  return `${prefix}${outcomes.join(' · ')}; ${remaining} remaining.`;
}

function renderGoogleBooksDiagnostics(job) {
  const samples = job?.samples ?? [];
  googleBooksEnrichmentDiagnostics.hidden = samples.length === 0;
  if (!samples.length) {
    googleBooksEnrichmentDiagnosticsItems.replaceChildren();
    return;
  }
  googleBooksEnrichmentDiagnosticsSummary.textContent = `${samples.length} recent declined Google Books result${samples.length === 1 ? '' : 's'}`;
  googleBooksEnrichmentDiagnosticsItems.replaceChildren(...samples.map((sample) => {
    const item = document.createElement('li');
    const reason = sample.reason === 'title-variant'
      ? 'Title variant'
      : sample.reason === 'author-variant'
        ? 'Author variant'
        : 'No results';
    item.append(textElement('strong', reason), textElement('span', sample.title));
    if (sample.candidateTitle) item.append(textElement('small', `Top Google result: ${sample.candidateTitle}`));
    return item;
  }));
}

async function renderGoogleBooksEnrichment() {
  const [key, job] = await Promise.all([getGoogleBooksApiKey(), getGoogleBooksEnrichmentJob()]);
  clearGoogleBooksApiKeyButton.disabled = !key || googleBooksRunning;
  saveGoogleBooksApiKeyButton.disabled = googleBooksRunning;
  startGoogleBooksEnrichmentButton.disabled = googleBooksRunning || !key;
  startGoogleBooksEnrichmentButton.textContent = job && job.cursor < job.queue.length ? 'Resume enrichment' : 'Start enrichment';
  pauseGoogleBooksEnrichmentButton.hidden = !googleBooksRunning;
  resetGoogleBooksEnrichmentButton.disabled = googleBooksRunning || !job;
  renderGoogleBooksDiagnostics(job);
  if (googleBooksRunning) return;
  if (!key) {
    googleBooksEnrichmentStatus.textContent = 'Save a private Google Books API key to enable automated enrichment.';
  } else if (job?.lastError) {
    googleBooksEnrichmentStatus.textContent = `Google Books stopped: ${job.lastError} Progress is saved. If this is a quota limit, wait for Google to reset it, then Resume enrichment.`;
  } else if (job) {
    googleBooksEnrichmentStatus.textContent = googleBooksStatusText(job, job.cursor >= job.queue.length ? 'Completed: ' : 'Paused: ');
  } else {
    googleBooksEnrichmentStatus.textContent = 'Key saved locally. The first run will queue only book records that have an author and no Google Books enrichment.';
  }
}

function authorsForRecords(records) {
  return [...new Set(records.flatMap((record) => Array.isArray(record.metadata?.authors) ? record.metadata.authors : []).map(String).filter(Boolean))];
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stopsGoogleBooksEnrichment(message) {
  return /\b(?:401|403|429)\b|quota|rate limit|daily limit|api key|permission denied/iu.test(String(message ?? ''));
}

async function runGoogleBooksEnrichment() {
  if (googleBooksRunning) return;
  googleBooksRunning = true;
  googleBooksPauseRequested = false;
  await renderGoogleBooksEnrichment();
  try {
    const key = await getGoogleBooksApiKey();
    if (!key) throw new Error('Save a Google Books API key before starting enrichment.');
    let job = await getGoogleBooksEnrichmentJob();
    if (!job || job.cursor >= job.queue.length) job = await startGoogleBooksEnrichmentJob();
    if (!job.queue.length) {
      googleBooksEnrichmentStatus.textContent = 'No author-backed books without Google Books metadata need enrichment.';
      return;
    }
    while (job.cursor < job.queue.length && !googleBooksPauseRequested) {
      database = await getDatabase();
      const canonical = database.canonicalItems[job.queue[job.cursor]];
      const records = canonical?.providerItemIds.map((id) => database.providerItems[id]).filter(Boolean) ?? [];
      if (!canonical || !records.length || canonical.mediaType !== 'book') {
        job = { ...job, cursor: job.cursor + 1, processed: job.processed + 1, skipped: job.skipped + 1 };
        job = await saveGoogleBooksEnrichmentJob(job);
        continue;
      }
      const authors = authorsForRecords(records);
      if (!authors.length) {
        job = { ...job, cursor: job.cursor + 1, processed: job.processed + 1, skipped: job.skipped + 1 };
        job = await saveGoogleBooksEnrichmentJob(job);
        continue;
      }
      googleBooksEnrichmentStatus.textContent = `${googleBooksStatusText(job)} Looking up “${canonical.title}”…`;
      let candidates;
      try {
        const response = await chrome.runtime.sendMessage({ type: 'SEARCH_GOOGLE_BOOKS', query: { title: canonical.title, authors } });
        if (!response?.ok) throw new Error(response?.error ?? 'Google Books search did not complete.');
        candidates = response.candidates ?? [];
      } catch (error) {
        if (stopsGoogleBooksEnrichment(error.message)) {
          const lastError = String(error.message).trim();
          job = await saveGoogleBooksEnrichmentJob({ ...job, lastError, lastErrorAt: new Date().toISOString() });
          throw new Error(lastError);
        }
        job = { ...job, cursor: job.cursor + 1, processed: job.processed + 1, errors: job.errors + 1 };
        job = await saveGoogleBooksEnrichmentJob(job);
        await pause(1200);
        continue;
      }
      if (job.lastError) job = { ...job, lastError: '', lastErrorAt: '' };
      const candidate = highConfidenceGoogleBooksCandidate({ title: canonical.title, authors }, candidates);
      if (candidate) {
        database = await saveGoogleBooksEnrichments([{ itemIds: canonical.providerItemIds, enrichment: googleBooksEnrichment(candidate) }]);
        job = { ...job, cursor: job.cursor + 1, processed: job.processed + 1, matched: job.matched + 1 };
      } else {
        const genreHint = googleBooksGenreHintCandidate({ title: canonical.title, authors }, candidates);
        if (genreHint) {
          database = await saveGoogleBooksGenreHints([{ itemIds: canonical.providerItemIds, hint: googleBooksGenreHint(genreHint) }]);
          job = { ...job, cursor: job.cursor + 1, processed: job.processed + 1, genreHints: (job.genreHints ?? 0) + 1 };
        } else {
        const classification = googleBooksMatchClassification({ title: canonical.title, authors }, candidates);
        const diagnosticKey = classification === 'no-results'
          ? 'zeroResults'
          : classification === 'title-variant'
            ? 'titleVariant'
            : classification === 'author-variant'
              ? 'authorVariant'
              : '';
        const sample = diagnosticKey ? {
          reason: classification,
          title: canonical.title,
          candidateTitle: candidates[0]?.title ?? ''
        } : null;
        job = {
          ...job,
          cursor: job.cursor + 1,
          processed: job.processed + 1,
          noMatch: job.noMatch + 1,
          ...(diagnosticKey ? { [diagnosticKey]: job[diagnosticKey] + 1 } : {}),
          ...(sample ? { samples: [...(job.samples ?? []), sample].slice(-50) } : {})
        };
        }
      }
      job = await saveGoogleBooksEnrichmentJob(job);
      renderGoogleBooksDiagnostics(job);
      await pause(1200);
    }
    googleBooksEnrichmentStatus.textContent = googleBooksStatusText(job, googleBooksPauseRequested ? 'Paused: ' : 'Completed: ');
  } catch (error) {
    googleBooksEnrichmentStatus.textContent = `Google Books enrichment paused: ${error.message}`;
  } finally {
    googleBooksRunning = false;
    pauseGoogleBooksEnrichmentButton.hidden = true;
    await renderGoogleBooksEnrichment();
  }
}

function render() {
  const providerEntries = Object.entries(database.providers).sort(([left], [right]) => left.localeCompare(right));
  populateProviderFilter(providerEntries);
  populateGenreFilter(Object.values(database.providerItems));
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
  const linkedAddOnIds = new Set();
  for (const addOn of addOns) {
    const parentKey = parentRecordKey(addOn);
    if (!parentKey) continue;
    const existing = addOnsByParent.get(parentKey) ?? [];
    existing.push(addOn);
    addOnsByParent.set(parentKey, existing);
    if (database.providerItems[parentKey]?.mediaType === 'game') linkedAddOnIds.add(addOn.id);
  }

  const query = search.value.trim().toLocaleLowerCase();
  const filters = selectedFilters();
  const canonical = Object.values(database.canonicalItems)
    .filter((item) => {
      const records = item.providerItemIds.map((id) => database.providerItems[id]);
      const linkedAddOns = records.flatMap((record) => addOnsByParent.get(record.id) ?? []);
      const matchesProviderAndOwnership = records.some((record) => providerMatches(record, filters.provider) && ownershipMatches(record, filters.ownership));
      const matchesMediaType = filters.mediaType === 'all' || item.mediaType === filters.mediaType;
      const matchingLinkedAddOns = linkedAddOns.filter((addOn) => providerMatches(addOn, filters.provider) && ownershipMatches(addOn, filters.ownership));
      const hasDlc = matchingLinkedAddOns.length > 0;
      const matchesDlc = filters.dlc === 'all' || (item.mediaType === 'game' && (filters.dlc === 'with' ? hasDlc : !hasDlc));
      const matchesGenre = genreMatches(records, filters.genre);
      const matchesSearch = itemMatchesQuery(item, query)
        || matchingLinkedAddOns.some((addOn) => itemMatchesQuery(addOn, query));
      return matchesProviderAndOwnership && matchesMediaType && matchesDlc && matchesGenre && matchesSearch;
    })
    .sort((left, right) => left.title.localeCompare(right.title));
  const gameCanonicalCount = canonical.filter((item) => item.mediaType === 'game').length;
  const audiobookCanonicalCount = canonical.filter((item) => item.mediaType === 'audiobook').length;
  const bookCanonicalCount = canonical.filter((item) => item.mediaType === 'book').length;
  const movieCanonicalCount = canonical.filter((item) => item.mediaType === 'movie').length;
  const tvCanonicalCount = canonical.filter((item) => item.mediaType === 'tv').length;
  const visibleRecords = canonical.flatMap((item) => item.providerItemIds.map((id) => database.providerItems[id]))
    .filter((record) => providerMatches(record, filters.provider) && ownershipMatches(record, filters.ownership));
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
  const canShowAddOns = (filters.mediaType === 'all' || filters.mediaType === 'game') && filters.dlc !== 'without';
  const visibleAddOnCount = canShowAddOns ? addOns.filter((addOn) => {
    const parentKey = parentRecordKey(addOn);
    const parent = parentKey ? database.providerItems[parentKey] : null;
    return providerMatches(addOn, filters.provider)
      && ownershipMatches(addOn, filters.ownership)
      && (itemMatchesQuery(addOn, query) || (parent && itemMatchesQuery(parent, query)));
  }).length : 0;
  if (visibleAddOnCount) summaryParts.push(`${visibleAddOnCount} DLC add-on${visibleAddOnCount === 1 ? '' : 's'}`);
  summary.textContent = summaryParts.length ? `${summaryParts.join(' · ')}${suffix}.` : `No library items${suffix}.`;

  items.replaceChildren(...canonical.map((canonicalItem) => {
    const node = document.createElement('li');
    const records = canonicalItem.providerItemIds.map((id) => database.providerItems[id]);
    const linkedAddOns = records.flatMap((record) => addOnsByParent.get(record.id) ?? []);
    node.className = 'library-item';
    const header = document.createElement('div');
    header.className = 'library-item-header';
    header.append(textElement('strong', canonicalItem.title), textElement('span', displayMediaType(canonicalItem.mediaType)));
    node.append(header);
    const metadataText = displayMediaMetadata(records, canonicalItem.mediaType);
    if (metadataText) {
      const metadata = textElement('div', metadataText);
      metadata.className = 'library-item-metadata';
      node.append(metadata);
    }
    const genreTags = createGenreTags(records);
    if (genreTags) node.append(genreTags);
    const providerSources = document.createElement('div');
    providerSources.className = 'library-item-providers';
    providerSources.replaceChildren(...providerSourceDetails(records).map(({ label, ownershipLabel }) => {
      const source = document.createElement('span');
      source.className = 'library-item-provider';
      source.append(textElement('strong', label));
      if (ownershipLabel) source.append(textElement('small', ownershipLabel));
      return source;
    }));
    node.append(providerSources);
    if (canonicalItem.mediaType === 'book') node.append(createOpenLibraryTools(canonicalItem, records));
    if (linkedAddOns.length) node.append(createAddOnList(linkedAddOns));
    return node;
  }));

  const canShowUnlinkedAddOns = (filters.mediaType === 'all' || filters.mediaType === 'game') && filters.dlc === 'all';
  const unlinked = canShowUnlinkedAddOns
    ? addOns.filter((addOn) => !linkedAddOnIds.has(addOn.id) && providerMatches(addOn, filters.provider) && ownershipMatches(addOn, filters.ownership) && itemMatchesQuery(addOn, query))
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
  await Promise.all([renderHumbleExtensionLink(), renderGoogleBooksEnrichment()]);
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
saveGoogleBooksApiKeyButton.addEventListener('click', async () => {
  try {
    await saveGoogleBooksApiKey(googleBooksApiKey.value);
    googleBooksApiKey.value = '';
    await renderGoogleBooksEnrichment();
  } catch (error) {
    googleBooksEnrichmentStatus.textContent = `Could not save Google Books key: ${error.message}`;
  }
});
clearGoogleBooksApiKeyButton.addEventListener('click', async () => {
  try {
    googleBooksPauseRequested = true;
    await saveGoogleBooksApiKey('');
    googleBooksApiKey.value = '';
    await renderGoogleBooksEnrichment();
  } catch (error) {
    googleBooksEnrichmentStatus.textContent = `Could not remove Google Books key: ${error.message}`;
  }
});
startGoogleBooksEnrichmentButton.addEventListener('click', () => {
  runGoogleBooksEnrichment().catch(() => {});
});
pauseGoogleBooksEnrichmentButton.addEventListener('click', () => {
  googleBooksPauseRequested = true;
  googleBooksEnrichmentStatus.textContent = 'Pausing after the current book…';
});
resetGoogleBooksEnrichmentButton.addEventListener('click', async () => {
  try {
    await clearGoogleBooksEnrichmentJob();
    await renderGoogleBooksEnrichment();
  } catch (error) {
    googleBooksEnrichmentStatus.textContent = `Could not reset enrichment progress: ${error.message}`;
  }
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
ownershipFilter.addEventListener('change', render);
dlcFilter.addEventListener('change', render);
genreFilter.addEventListener('change', render);
clearFilters.addEventListener('click', () => {
  search.value = '';
  providerFilter.value = 'all';
  mediaTypeFilter.value = 'all';
  ownershipFilter.value = 'all';
  dlcFilter.value = 'all';
  genreFilter.value = 'all';
  render();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[DATABASE_STORAGE_KEY]) refresh().catch(() => {});
  if (areaName === 'local' && !googleBooksRunning && (changes[GOOGLE_BOOKS_API_KEY_STORAGE_KEY] || changes[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY])) {
    renderGoogleBooksEnrichment().catch(() => {});
  }
});
refresh().catch((error) => { backupStatus.textContent = `Could not load library: ${error.message}`; });
