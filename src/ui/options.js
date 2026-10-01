import {saveEnrichmentReview,dismissEnrichmentReview,undoEnrichmentSelection} from '../lib/storage.js';
import {enrichmentQuery,enrichmentStages} from '../lib/enrichment.js';
import {createEnrichmentEvidence} from './enrichment-evidence.js';
import { addAllowedExternalClientId, clearGoogleBooksEnrichmentJob, createBackup, clearDatabase, getDatabase, getAllowedExternalClientIds, getGoogleBooksApiKey, getGoogleBooksEnrichmentJob, getShowEnrichmentActions, parseBackup, removeManualMatchDecision, restoreDatabase, saveAllowedExternalClientIds, saveGoogleBooksApiKey, saveGoogleBooksEnrichmentJob, saveGoogleBooksEnrichments, saveGoogleBooksGenreHints, saveManualMatchDecision, saveOpenLibraryEnrichment, saveShowEnrichmentActions, startGoogleBooksEnrichmentJob } from '../lib/storage.js';
import { DATABASE_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY } from '../lib/constants.js';
import { findDuplicateCandidates } from '../lib/duplicate-review.js';
import { isExtensionId } from '../lib/external-api.js';
import { comicMangaEvidence, libraryBroadGenreValues } from '../lib/genre-hints.js';
import { googleBooksEnrichment, googleBooksGenreHint, googleBooksGenreHintCandidate, googleBooksMatchClassification, highConfidenceGoogleBooksCandidate } from '../lib/google-books.js';
import { openLibraryEnrichment } from '../lib/open-library.js';
import { compareTitles } from '../lib/title-sort.js';
import { saveContentReview, removeContentReview } from '../lib/storage.js';
import { createContentsEditor } from './contents-editor.js';
import { createEvidenceInspector } from './evidence-inspector.js';
import { separateEdition, undoEditionSeparation } from '../lib/storage.js';
import { createSeriesCoverageView } from './series-coverage.js';
import { identityEvidence, identityConflicts } from '../lib/identity.js';

const providers = document.querySelector('#providers');
const search = document.querySelector('#search');
const downloadComixologyListButton = document.querySelector('#download-comixology-list');
const showEnrichmentActions = document.querySelector('#show-enrichment-actions');
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
const companionExtensionId = document.querySelector('#companion-extension-id');
const companionExtensionLinkStatus = document.querySelector('#companion-extension-link-status');
const allowedCompanionExtensions = document.querySelector('#allowed-companion-extensions');
const galacticExtensionId = document.querySelector('#galactic-extension-id');
let database;
const openLibrarySearches = new Map();
const googleBooksSearches = new Map();
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
        : ownership === 'borrowed'
          ? 'borrowed'
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

function createComicMangaCandidateTag(records) {
  const evidence = records.flatMap(comicMangaEvidence);
  if (!evidence.length) return null;
  const sources = [...new Set(evidence.map((hint) => hint.source.replace(/-/gu, ' ')))];
  const node = document.createElement('div');
  node.className = 'genre-tags';
  const tag = textElement('span', 'Confirmed comic/manga candidate');
  tag.className = 'genre-tag';
  tag.title = `Evidence: ${sources.join(', ')}`;
  node.append(tag);
  return node;
}

function createComicContents(records) {
  const statements = [...new Set(records
    .map((record) => String(record.metadata?.enrichment?.kindleProductComicContents?.statement ?? '').trim())
    .filter(Boolean))];
  if (!statements.length) return null;
  const node = document.createElement('div');
  node.className = 'library-item-metadata';
  node.textContent = statements.map((statement) => `Collects: ${statement.replace(/^collects?\s*:?\s*/iu, '')}`).join(' · ');
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

function comixologyReviewMarkdown(providerItems, sourceLabel) {
  const records = Object.values(providerItems)
    .filter((item) => item.provider === 'kindle' && item.metadata?.originType?.toLocaleLowerCase() === 'comixology')
    .sort((left, right) => compareTitles(left.title, right.title));
  const lines = [
    '# Comixology ownership review',
    '',
    `Source: ${sourceLabel}`,
    `Records: ${records.length}`,
    '',
    'Check a title after confirming it was purchased or permanently claimed. Leave borrowed or uncertain titles unchecked.',
    ''
  ];
  for (const item of records) {
    const title = item.title.replace(/\s+/gu, ' ').replace(/[\\`*_{}\[\]<>]/gu, '\\$&');
    const date = item.acquiredAt ? ` · added ${item.acquiredAt.slice(0, 10)}` : '';
    lines.push(`- [ ] ${title} · ASIN ${item.providerItemId}${date}`);
  }
  return lines.join('\n') + '\n';
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
    .sort((left, right) => compareTitles(left.title, right.title))
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
      query: bibliographicQuery(canonicalItem,records)
    });
    if (!response?.ok) throw new Error(response?.error ?? 'Open Library search did not complete.');
    openLibrarySearches.set(canonicalItem.id, { loading: false, error: '', candidates: response.candidates ?? [] });
  } catch (error) {
    openLibrarySearches.set(canonicalItem.id, { loading: false, error: error.message, candidates: [] });
  }
  render();
}

function createOpenLibraryTools(canonicalItem, records) {
  const enrichment = records.map((record) => record.metadata?.enrichment?.openLibrary).find(Boolean);
  if (!showEnrichmentActions.checked && !enrichment?.workKey) return null;
  const container = document.createElement('div');
  container.className = 'open-library-tools';
  const searchState = openLibrarySearches.get(canonicalItem.id);
  if (showEnrichmentActions.checked) {
    const button = reviewButton(enrichment ? 'Update Open Library metadata' : 'Find Open Library metadata', 'open-library-search', () => {
      searchOpenLibrary(canonicalItem, records).catch(() => {});
    });
    button.disabled = Boolean(searchState?.loading);
    container.append(button);
  }
  if (enrichment?.workKey) {
    const source = document.createElement('a');
    source.href = `https://openlibrary.org${enrichment.workKey}`;
    source.target = '_blank';
    source.rel = 'noreferrer';
    source.textContent = 'View Open Library record';
    container.append(source);
  }
  if (!showEnrichmentActions.checked || !searchState) return container;
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
        database = await saveOpenLibraryEnrichment(canonicalItem.providerItemIds, openLibraryEnrichment(candidate),records.map(record=>record.recordRef));
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

function createGoogleBooksTools(canonical,records){
  const container=document.createElement('details');const heading=document.createElement('summary');
  const stages=enrichmentStages(records,database);
  heading.textContent=`Enrichment stages: ${Object.entries(stages).map(([stage,done])=>`${stage} ${done?'available':'missing'}`).join(' · ')}`;
  container.append(heading);
  if(!showEnrichmentActions.checked)return container;
  const search=reviewButton('Find Google Books candidates','google-books-search',async()=>{
    googleBooksSearches.set(canonical.id,{loading:true,candidates:[]});render();
    try{const response=await chrome.runtime.sendMessage({type:'SEARCH_GOOGLE_BOOKS',query:bibliographicQuery(canonical,records)});if(!response?.ok)throw new Error(response?.error??'Search unavailable.');googleBooksSearches.set(canonical.id,{loading:false,candidates:response.candidates??[]});database=await saveEnrichmentReview({recordRefs:records.map(record=>record.recordRef),source:'googleBooks',status:response.candidates?.length?'candidates':'no-results',title:canonical.title,reason:'Manual candidate discovery; confirm an edition before applying.',candidates:(response.candidates??[]).map(candidate=>googleBooksEnrichment(candidate))});}
    catch(error){googleBooksSearches.set(canonical.id,{loading:false,candidates:[],error:error.message});}render();
  });
  const pending=Object.values(database.enrichmentReviews).find(entry=>entry.source==='googleBooks'&&entry.recordRefs.some(ref=>records.some(record=>record.recordRef===ref)));
  const state=googleBooksSearches.get(canonical.id)??(pending?{loading:false,candidates:pending.candidates,error:pending.status==='failed'?pending.reason:''}:null);search.disabled=Boolean(state?.loading);container.append(search);
  if(state?.error)container.append(textElement('p',state.error));
  if(state&&!state.loading&&!state.candidates.length&&!state.error)container.append(textElement('p','No results. Try another source or add identifiers through local metadata.'));
  for(const candidate of state?.candidates??[]){
    const row=document.createElement('div');row.append(textElement('p',[candidate.title,candidate.subtitle,candidate.authors?.join(', '),candidate.publisher,candidate.language,candidate.isbn?.join(', ')].filter(Boolean).join(' · ')));
    const conflicts=records.flatMap(record=>identityConflicts(record,{title:[candidate.title,candidate.subtitle].filter(Boolean).join(': '),mediaType:'book',metadata:candidate})).filter(key=>key!=='authors');
    if(conflicts.length){row.append(textElement('p',`Edition conflicts: ${[...new Set(conflicts)].join(', ')}. Review the source; this candidate cannot supply this edition's metadata.`));container.append(row);continue;}
    const label=document.createElement('label');const confirm=document.createElement('input');confirm.type='checkbox';label.append(confirm,' I checked the source and this is the edition in my library.');
    const apply=reviewButton('Apply edition metadata','google-books-apply',async()=>{
      try{database=await saveGoogleBooksEnrichments([{itemIds:canonical.providerItemIds,recordRefs:records.map(record=>record.recordRef),enrichment:{...googleBooksEnrichment(candidate),approved:true,matchBasis:'user-selected-edition'}}]);googleBooksSearches.delete(canonical.id);render();}
      catch(error){googleBooksSearches.set(canonical.id,{...state,error:error.message});render();}
    });apply.disabled=true;confirm.addEventListener('change',()=>{apply.disabled=!confirm.checked;});row.append(label,apply);container.append(row);
  }
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
    actions.append(textElement('span', candidate.decision === 'different' ? 'Marked as different works.' : candidate.decision==='same-edition'?'Marked as the same edition.':'Marked as the same work; editions stay separate.'));
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
        database = await saveManualMatchDecision(candidate, 'same-work');
        render();
      } catch (error) {
        backupStatus.textContent = `Could not save duplicate decision: ${error.message}`;
      }
    }));
    actions.append(reviewButton('Same edition', 'same-edition', async () => {
      try {
        database = await saveManualMatchDecision(candidate, 'same-edition');
        render();
      } catch (error) {
        backupStatus.textContent = `Could not save edition decision: ${error.message}`;
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

async function renderCompanionExtensionLinks() {
  const ids = await getAllowedExternalClientIds();
  galacticExtensionId.textContent = chrome.runtime.id;
  companionExtensionId.value = '';
  companionExtensionLinkStatus.textContent = ids.length
    ? `${ids.length} companion extension${ids.length === 1 ? '' : 's'} allowed.`
    : 'No companion extensions are allowed yet.';
  allowedCompanionExtensions.replaceChildren(...ids.map((id) => {
    const row = document.createElement('li');
    const code = document.createElement('code'); code.textContent = id;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      await saveAllowedExternalClientIds(ids.filter((candidate) => candidate !== id));
      await renderCompanionExtensionLinks();
    });
    row.append(code, ' ', remove);
    return row;
  }));
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
    googleBooksEnrichmentStatus.textContent = 'Key saved locally. Books missing edition metadata are eligible, including authorless books. Uncertain results require review; genre hints do not complete edition enrichment.';
  }
}

const bibliographicQuery=enrichmentQuery;

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
      googleBooksEnrichmentStatus.textContent = 'No books need Google Books edition enrichment.';
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
      const query=bibliographicQuery(canonical,records);
      const authors = query.authors;
      googleBooksEnrichmentStatus.textContent = `${googleBooksStatusText(job)} Looking up “${canonical.title}”…`;
      let candidates;
      try {
        const response = await chrome.runtime.sendMessage({ type: 'SEARCH_GOOGLE_BOOKS', query });
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
      googleBooksSearches.set(canonical.id,{candidates,error:'',loading:false});
      const candidate = highConfidenceGoogleBooksCandidate(query, candidates);
      if(!candidate)database=await saveEnrichmentReview({recordRefs:records.map(record=>record.recordRef),source:'googleBooks',status:candidates.length?(query.authors.length||query.isbn.length?'ambiguous':'candidates'):'no-results',title:canonical.title,reason:'Automatic identity confidence was insufficient. Review the actual edition.',candidates:candidates.map(candidate=>googleBooksEnrichment(candidate))});
      if (candidate) {
        database = await saveGoogleBooksEnrichments([{ itemIds: canonical.providerItemIds, recordRefs:records.map(record=>record.recordRef),enrichment: googleBooksEnrichment(candidate) }]);
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
    .sort((left, right) => compareTitles(left.title, right.title));
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
    const comicMangaCandidateTag = createComicMangaCandidateTag(records);
    if (comicMangaCandidateTag) node.append(comicMangaCandidateTag);
    const comicContents = createComicContents(records);
    if (comicContents) node.append(comicContents);
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
    node.append(createEvidenceInspector(canonicalItem,records,database,{
      split:async id=>{database=await separateEdition(id);},
      undoSplit:async ref=>{database=await undoEditionSeparation(ref);},
      save:async(candidate,decision)=>{database=await saveManualMatchDecision(candidate,decision);},
      remove:async(id)=>{database=await removeManualMatchDecision(id);},
      refresh:render
    }));
    if (canonicalItem.mediaType === 'book') {
      node.append(createGoogleBooksTools(canonicalItem,records));
      node.append(createEnrichmentEvidence(records,database,async ref=>{database=await undoEnrichmentSelection(ref);render();}));
      const openLibraryTools = createOpenLibraryTools(canonicalItem, records);
      if (openLibraryTools) node.append(openLibraryTools);
    }
    if (['book','game'].includes(canonicalItem.mediaType)) {
      for (const record of records) node.append(createContentsEditor(record,database.contentReviews?.[record.id],{
        save:async(id,value)=>{database=await saveContentReview(id,value);},
        remove:async(id)=>{database=await removeContentReview(id);},
        refresh:render
      }));
    }
    if (linkedAddOns.length) node.append(createAddOnList(linkedAddOns));
    return node;
  }));

  const canShowUnlinkedAddOns = (filters.mediaType === 'all' || filters.mediaType === 'game') && filters.dlc === 'all';
  const unlinked = canShowUnlinkedAddOns
    ? addOns.filter((addOn) => !linkedAddOnIds.has(addOn.id) && providerMatches(addOn, filters.provider) && ownershipMatches(addOn, filters.ownership) && itemMatchesQuery(addOn, query))
      .sort((left, right) => compareTitles(left.title, right.title))
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
  let history=document.querySelector('#provider-history');
  if(!history){history=document.createElement('details');history.id='provider-history';items.parentElement.append(history);}
  const records=Object.values(database.providerHistory??{});
  history.replaceChildren(textElement('summary',`Provider history: ${records.length} records not in the current library`));
  history.append(textElement('p','History preserves earlier purchase and access evidence. A missing record does not prove revocation. Records from the active profile may appear as Possible, never as confirmed current ownership.'));
  const list=document.createElement('ul');
  for(const entry of records.slice(0,50))list.append(textElement('li',`${entry.item.title} — ${displayProviderName(entry.item.provider)} — profile ${entry.profileLabel||'unassigned'} — ${entry.reason==='profile-switch'?'previous profile':'not observed in complete scan'} since ${entry.missingSince||'unknown'}; last observed ${entry.item.observedAt||'unknown'}.`));
  history.append(list);if(records.length>50)history.append(textElement('p',`Showing 50 of ${records.length}. All history is preserved in your backup.`));
  document.querySelector('#series-coverage-view').replaceChildren(createSeriesCoverageView(database));
}

async function refresh() {
  const [loadedDatabase, showActions] = await Promise.all([
    getDatabase(),
    getShowEnrichmentActions()
  ]);
  database = loadedDatabase;
  downloadComixologyListButton.disabled = false;
  showEnrichmentActions.checked = showActions;
  render();
  await Promise.all([renderCompanionExtensionLinks(), renderGoogleBooksEnrichment()]);
}

document.querySelector('#export').addEventListener('click', async () => {
  try {
    const snapshot = await getDatabase();
    const blob = new Blob([JSON.stringify(createBackup(snapshot), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: 'galactic-library-backup-v1.json' });
    link.click();
    URL.revokeObjectURL(url);
    backupStatus.textContent = 'Backup downloaded.';
  } catch (error) {
    backupStatus.textContent = `Export failed: ${error.message}`;
  }
});

document.querySelector('#import').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await restoreDatabase(parseBackup(JSON.parse(await file.text())));
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
  try {
    await clearDatabase();
    await refresh();
    backupStatus.textContent = 'Local library cleared.';
  } catch (error) {
    backupStatus.textContent = `Clear failed: ${error.message}`;
  }
});
downloadComixologyListButton.addEventListener('click', () => {
  const blob = new Blob([comixologyReviewMarkdown(database.providerItems, 'Current Galactic Library')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'comixology-ownership-review.md' });
  link.click();
  URL.revokeObjectURL(url);
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
document.querySelector('#add-companion-extension-id').addEventListener('click', async () => {
  const id = companionExtensionId.value.trim();
  if (!isExtensionId(id)) {
    companionExtensionLinkStatus.textContent = 'Enter a valid 32-character Chrome extension ID.';
    return;
  }
  try {
    await addAllowedExternalClientId(id);
    await renderCompanionExtensionLinks();
  } catch (error) {
    companionExtensionLinkStatus.textContent = `Could not save the allowed extension: ${error.message}`;
  }
});
document.querySelector('#clear-companion-extension-ids').addEventListener('click', async () => {
  try {
    await saveAllowedExternalClientIds([]);
    await renderCompanionExtensionLinks();
    companionExtensionLinkStatus.textContent = 'Companion extension links removed.';
  } catch (error) {
    companionExtensionLinkStatus.textContent = `Could not remove companion extensions: ${error.message}`;
  }
});
search.addEventListener('input', render);
showEnrichmentActions.addEventListener('change', async () => {
  const checked = showEnrichmentActions.checked;
  render();
  try {
    await saveShowEnrichmentActions(checked);
  } catch (error) {
    showEnrichmentActions.checked = !checked;
    render();
    backupStatus.textContent = `Could not save the enrichment action setting: ${error.message}`;
  }
});
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
  if (areaName === 'local' && changes[SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]) {
    showEnrichmentActions.checked = changes[SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY].newValue !== false;
    if (database) render();
  }
  if (areaName === 'local' && !googleBooksRunning && (changes[GOOGLE_BOOKS_API_KEY_STORAGE_KEY] || changes[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY])) {
    renderGoogleBooksEnrichment().catch(() => {});
  }
});
refresh().catch((error) => { backupStatus.textContent = `Could not load library: ${error.message}`; });
