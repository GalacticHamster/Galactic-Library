import {combinedProviderStates} from '../lib/profile-management.js';
import {createProvidersView} from './providers-view.js';
import {renderOnboarding} from './onboarding.js';
import {selectProviderProfile,renameProviderProfile,previewProviderProfileRemoval,removeProviderProfile,resetProviderProfileBaseline} from '../lib/storage.js';
import {createContentsWorkspace} from './contents-workspace.js';
import {createContentsScanProgress} from './contents-scan-progress.js';
import {bindPerformanceDiagnostics} from './performance-diagnostics.js';
import '../lib/contents-performance.js';
import {bookToolHelp, metadataPreview} from './book-tool-help.js';
import { createWorkspaceNavigation } from './workspaces.js';
import { getCommittedLibraryView, saveUiPreferences, saveOwnershipPolicy } from '../lib/storage.js';
import {acquireEnrichmentRun,commitEnrichmentBatch,finishEnrichmentRun} from '../lib/storage.js';
import {saveEnrichmentReview,dismissEnrichmentReview,undoEnrichmentSelection} from '../lib/storage.js';
import {enrichmentQuery,enrichmentStages} from '../lib/enrichment.js';
import {createEnrichmentEvidence} from './enrichment-evidence.js';
import {createLocalMetadataTools} from './local-metadata-tools.js';
import {createTitleAliasTools} from './title-aliases.js';
import {saveTitleAliases} from '../lib/storage.js';
import {createOwnershipReviewTools,createPurchaseEvidenceWorkbench} from './ownership-review.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {createReadingTools,createReadingWorkbench} from './reading.js';
import {saveReadingState,removeReadingState,saveReadingOrder,removeReadingOrder} from '../lib/storage.js';
import {createRemindersView,requestReminderPermissions} from './reminders.js';
import {removeCompanionFeed,saveReminderReview,getReminderNotificationSettings,saveReminderNotificationSettings} from '../lib/storage.js';
import {createSyncHealthView} from './sync-health.js';
import {cancelProviderScan} from '../lib/storage.js';
import {saveOwnershipReview,removeOwnershipReview,importPurchaseEvidence,refreshPurchaseEvidence,applyPurchaseEvidence,dismissPurchaseEvidence} from '../lib/storage.js';
import {createEnrichmentWorkbench} from './enrichment-workbench.js';
import {applyReviewedEnrichments,dismissEnrichmentReviews,undoEnrichmentSelections} from '../lib/storage.js';
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
import { identityEvidence, identityConflicts, editionEnrichmentConflicts } from '../lib/identity.js';
import {PRIVATE_STORAGE_CHANGED,isFirefoxRuntime} from '../background/private-storage.js';

async function reviewCompanionSource(clientId){
  if(!isExtensionId(clientId))throw Error('Configure the companion link first.');
  if(!isFirefoxRuntime(chrome.runtime)&&/^[a-p]{32}$/u.test(clientId))return chrome.tabs.create({url:`chrome://extensions/?options=${clientId}`});
  let timer;
  try{
    const result=await Promise.race([chrome.runtime.sendMessage(clientId,{type:'OPEN_REVIEW',apiVersion:1}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Source review timed out.')),5000);})]);
    if(result?.ok&&result.apiVersion===1)return;
  }catch{/* Older or unpaired companions retain a toolbar fallback. */}finally{clearTimeout(timer);}
  throw Error('Open Humble Comic Library from its Firefox toolbar menu. Check the pairing and update HB to enable source review.');
}

const providers = document.querySelector('#providers');
const assumeAllOwned = document.querySelector('#assume-all-owned');
const ownershipPolicyStatus = document.querySelector('#ownership-policy-status');
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
const contentsWorkspace=createContentsWorkspace();
document.querySelector('#contents-collections-slot').append(contentsWorkspace.element);
const providerAccountsView=createProvidersView({select:selectProviderProfile,rename:renameProviderProfile,preview:previewProviderProfileRemoval,remove:removeProviderProfile,reset:resetProviderProfileBaseline,openProvider:url=>chrome.tabs.create({url}),onDatabase:next=>{database=next;render();}});
document.querySelector('#provider-accounts-slot').append(providerAccountsView.element);
async function changeOwnershipPolicy(patch) {
  const focusId=document.activeElement?.id;
  assumeAllOwned.disabled=true;
  for(const checkbox of providers.querySelectorAll('[data-ownership-provider]'))checkbox.disabled=true;
  ownershipPolicyStatus.textContent='Saving ownership preference…';
  try{
    database=await saveOwnershipPolicy(patch);
    render();
    ownershipPolicyStatus.textContent='Saved. Refresh open HB/FAN bundle pages to run matching with this preference.';
  }catch(error){
    render();
    ownershipPolicyStatus.textContent='Could not save ownership preference: '+error.message;
  }finally{
    assumeAllOwned.disabled=false;
    if(focusId)document.getElementById(focusId)?.focus();
  }
}
assumeAllOwned.addEventListener('change',()=>changeOwnershipPolicy({allOwned:assumeAllOwned.checked}));
const openLibrarySearches = new Map();
const googleBooksSearches = new Map();
let googleBooksRunning = false;
let googleBooksPauseRequested = false;
let enrichmentWorkbench;
let libraryPage = 0;
const openItemDetails = new Set();
const viewControls = { provider: providerFilter, mediaType: mediaTypeFilter, genre: genreFilter, ownership: ownershipFilter, dlc: dlcFilter };
const workspace = createWorkspaceNavigation({
  readView: () => ({ search: search.value, ...Object.fromEntries(Object.entries(viewControls).map(([key, field]) => [key, field.value || "all"])), page: libraryPage }),
  applyView: view => { search.value = view.search; libraryPage = view.page; for (const [key, field] of Object.entries(viewControls)) { field.value = view[key]; if (!field.value) { field.dataset.pendingValue = view[key]; field.value = "all"; } } },
  save: saveUiPreferences, changed: () => { if (database) render(); }
});
document.querySelector("#library-previous").addEventListener("click", () => { libraryPage--; render(); workspace.rememberView(); });
document.querySelector("#library-next").addEventListener("click", () => { libraryPage++; render(); workspace.rememberView(); });
document.querySelector("#open-active-book-job").addEventListener("click", () => workspace.select("books"));
document.querySelector("#pause-active-book-job").addEventListener("click", () => { googleBooksPauseRequested = true; document.querySelector("#active-book-job-status").textContent = "Pausing after the current book?"; });

async function retryEnrichmentReview(review){
  const byRef=new Map(Object.values(database.providerItems).map(record=>[record.recordRef,record]));
  const records=review.recordRefs.map(ref=>byRef.get(ref));if(records.some(record=>!record))throw new Error('These records are no longer current.');
  const query=enrichmentQuery({title:records[0].title},records);let candidates=[],status='failed',reason='';
  try{
    const response=await chrome.runtime.sendMessage({type:review.source==='openLibrary'?'SEARCH_OPEN_LIBRARY':'SEARCH_GOOGLE_BOOKS',query});
    if(!response?.ok)throw new Error(response?.error||'Lookup unavailable.');
    candidates=(response.candidates??[]).map(candidate=>({...((review.source==='openLibrary'?openLibraryEnrichment:googleBooksEnrichment)(candidate)),approved:false}));
    status=candidates.length?'candidates':'no-results';reason='Retried lookup; confirm the source before applying.';
  }catch(error){reason=error.message;}
  database=await saveEnrichmentReview({...review,candidates,status,reason});
}

function inspectEnrichmentRecords(refs){
  workspace.select(refs.every(ref=>['book','audiobook'].includes(Object.values(database.providerItems).find(record=>record.recordRef===ref)?.mediaType))?'books':'library');search.value='';for(const filter of [providerFilter,mediaTypeFilter,ownershipFilter,dlcFilter,genreFilter])filter.value='all';render();
  const first=Object.values(database.providerItems).find(record=>refs.includes(record.recordRef));if(first){search.value=first.title;libraryPage=0;render();workspace.rememberView();}
  const card=[...items.children].find(node=>JSON.parse(node.dataset.recordRefs||'[]').some(ref=>refs.includes(ref)));
  if(card){card.tabIndex=-1;card.scrollIntoView({block:'center'});card.focus();const root=card.querySelector('.item-details');root.open=true;root.dispatchEvent(new Event('toggle'));for(const details of card.querySelectorAll('details'))details.open=true;}
}

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
  if(mediaType==='software')return 'Software';
  if (mediaType === 'movie') return 'Movie';
  if (mediaType === 'tv') return 'TV show';
  return 'Game';
}

function providerSourceDetails(records) {
  const byProvider = new Map();
  for (const record of records) {
    const providerRecords = byProvider.get(record.provider) ?? [];
    providerRecords.push(effectiveOwnershipRecord(record,database));
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
            : ownership === 'owned' ? 'Owned' : '';
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
  const tag = textElement('span', 'Comic/manga evidence');
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
  node.textContent = statements.map((statement) => `Contents found: ${statement}`).join(' · ');
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
  return ownership === 'all' || effectiveOwnershipRecord(record,database).ownership === ownership;
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
  return parentId ? Object.values(database.providerItems).find(item=>item.provider===addOn.provider&&item.profileId===addOn.profileId&&item.providerItemId===parentId)?.id??null : null;
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

function actionButton(label, onClick) { return reviewButton(label, "", onClick); }

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
    database=await saveEnrichmentReview({recordRefs:records.map(record=>record.recordRef),source:'openLibrary',status:response.candidates?.length?'candidates':'no-results',title:canonicalItem.title,reason:'Work discovery; a work does not establish an edition or its contents.',candidates:(response.candidates??[]).map(candidate=>({...openLibraryEnrichment(candidate),approved:false}))});
  } catch (error) {
    openLibrarySearches.set(canonicalItem.id, { loading: false, error: error.message, candidates: [] });
    database=await saveEnrichmentReview({recordRefs:records.map(record=>record.recordRef),source:'openLibrary',status:'failed',title:canonicalItem.title,reason:'Open Library lookup failed. Retry from the enrichment workbench.',candidates:[]});
  }
  render();
}

function createOpenLibraryTools(canonicalItem, records) {
  const enrichment = records.map((record) => record.metadata?.enrichment?.openLibrary).find(Boolean);
  if (!showEnrichmentActions.checked && !enrichment?.workKey) return null;
  const container = document.createElement('div');
  container.className = 'open-library-tools';
  container.append(bookToolHelp({purpose:'Find the work behind this book, including authors and subjects.',input:'Its ISBN when known, otherwise title and author. Open Library needs no API key.',saves:'Nothing until you select a work. Work information describes a book across editions; its ISBN list is not evidence for your edition.',review:'Choose only the same work. Use edition lookup or reviewed contents for issue and volume coverage. Undo the selection under Sources and undo.',example:'A work for a manga volume may have paperback and digital editions; it does not establish what your omnibus collects.'}));
  const searchState = openLibrarySearches.get(canonicalItem.id);
  if (showEnrichmentActions.checked) {
    const button = reviewButton(enrichment ? 'Find another Open Library work' : 'Find Open Library work', 'open-library-search', () => {
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
    result.append(textElement('span', openLibraryCandidateLabel(candidate)),metadataPreview(records,openLibraryEnrichment(candidate),'openLibrary'));
    const apply = reviewButton('Save this work', 'open-library-apply', async () => {
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
  heading.textContent='Find details for this edition';
  container.append(heading,bookToolHelp({purpose:'Look up edition details in Google Books, then choose the result that describes your copy.',input:'Its ISBN, or title and known authors. The Google Books API key is configured in Settings.',saves:'Manual searches save suggestions for review. They do not automatically apply edition metadata.',review:'Preview the fields, check the edition, then confirm before applying. Conflicting editions cannot be applied. Undo restores the previous source selection.',example:'A second edition may be related to your first edition, but should not supply its language, ISBN or page count.'}));
  const available=Object.entries(stages).filter(([,done])=>done).map(([stage])=>({genre:'genres',work:'work information',edition:'edition information',creators:'creators',contents:'reviewed contents',contentsLookup:'contents lookup'}[stage]));container.append(textElement('p',available.length?'Already available: '+available.join(', ')+'.':'No added book information yet.'));
  if(!showEnrichmentActions.checked)return container;
  const search=reviewButton('Find Google Books candidates','google-books-search',async()=>{
    googleBooksSearches.set(canonical.id,{loading:true,candidates:[]});render();
    try{const response=await chrome.runtime.sendMessage({type:'SEARCH_GOOGLE_BOOKS',query:bibliographicQuery(canonical,records)});if(!response?.ok)throw new Error(response?.error??'Search unavailable.');googleBooksSearches.set(canonical.id,{loading:false,candidates:response.candidates??[]});database=await saveEnrichmentReview({recordRefs:records.map(record=>record.recordRef),source:'googleBooks',status:response.candidates?.length?'candidates':'no-results',title:canonical.title,reason:'Manual candidate discovery; confirm an edition before applying.',candidates:(response.candidates??[]).map(candidate=>googleBooksEnrichment(candidate))});}
    catch(error){googleBooksSearches.set(canonical.id,{loading:false,candidates:[],error:error.message});database=await saveEnrichmentReview({recordRefs:records.map(record=>record.recordRef),source:'googleBooks',status:'failed',title:canonical.title,reason:'Google Books lookup failed. Retry from the enrichment workbench.',candidates:[]});}render();
  });
  const pending=Object.values(database.enrichmentReviews).find(entry=>entry.source==='googleBooks'&&entry.recordRefs.some(ref=>records.some(record=>record.recordRef===ref)));
  const state=googleBooksSearches.get(canonical.id)??(pending?{loading:false,candidates:pending.candidates,error:pending.status==='failed'?pending.reason:''}:null);search.disabled=Boolean(state?.loading);container.append(search);
  if(state?.error)container.append(textElement('p',state.error));
  if(state&&!state.loading&&!state.candidates.length&&!state.error)container.append(textElement('p','No results. Try another source or add identifiers through local metadata.'));
  for(const candidate of state?.candidates??[]){
    const row=document.createElement('div');row.append(textElement('p',[candidate.title,candidate.subtitle,candidate.authors?.join(', '),candidate.publisher,candidate.language,candidate.isbn?.join(', ')].filter(Boolean).join(' · ')));
    row.append(metadataPreview(records,googleBooksEnrichment(candidate),'googleBooks'));
    const conflicts=records.flatMap(record=>editionEnrichmentConflicts(record,{title:[candidate.title,candidate.subtitle].filter(Boolean).join(': '),mediaType:'book',metadata:candidate}));
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

function renderActiveBookJob(job) {
  const active=googleBooksRunning||Boolean(job?.runId&&job.leaseUntil>Date.now());
  const incomplete=Boolean(job&&job.cursor<job.queue.length);
  document.querySelector("#active-book-job").hidden=!active&&!incomplete;
  document.querySelector("#active-book-job-status").textContent=(active?"Finding book details: ":"Book lookup paused: ")+(job?job.cursor+" of "+job.queue.length+" checked.":"Preparing books.");
  document.querySelector("#pause-active-book-job").hidden=!googleBooksRunning;
}
async function renderGoogleBooksEnrichment() {
  const [key, job] = await Promise.all([getGoogleBooksApiKey(), getGoogleBooksEnrichmentJob()]);
  clearGoogleBooksApiKeyButton.disabled = !key || googleBooksRunning;
  saveGoogleBooksApiKeyButton.disabled = googleBooksRunning;
  const otherRun=Boolean(job?.runId&&job.leaseUntil>Date.now()&&!googleBooksRunning);
  startGoogleBooksEnrichmentButton.disabled = googleBooksRunning || !key || otherRun;
  startGoogleBooksEnrichmentButton.textContent = job && job.cursor < job.queue.length ? 'Resume book lookup' : 'Find missing book details';
  pauseGoogleBooksEnrichmentButton.hidden = !googleBooksRunning;
  resetGoogleBooksEnrichmentButton.disabled = googleBooksRunning || !job;
  renderGoogleBooksDiagnostics(job);
  renderActiveBookJob(job);
  if (googleBooksRunning) return;
  if(otherRun){googleBooksEnrichmentStatus.textContent='Another options page is running enrichment. Pause it or wait for its lease to expire.';} else if (!key) {
    googleBooksEnrichmentStatus.textContent = 'Save a private Google Books API key to enable automated enrichment.';
  } else if (job?.lastError) {
    googleBooksEnrichmentStatus.textContent = `Google Books stopped: ${job.lastError} Progress is saved. If this is a quota limit, wait for Google to reset it, then Resume book lookup.`;
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
  if(googleBooksRunning)return;googleBooksRunning=true;googleBooksPauseRequested=false;
  let job;let lastError='';
  try{
    if(!await getGoogleBooksApiKey())throw new Error('Save a Google Books API key before starting enrichment.');
    job=await getGoogleBooksEnrichmentJob();
    if(!job||job.cursor>=job.queue.length||!Object.values(job.targets??{}).some(refs=>refs.length))job=await startGoogleBooksEnrichmentJob();
    job=await acquireEnrichmentRun(job.jobId);
    await renderGoogleBooksEnrichment();
    while(job.cursor<job.queue.length&&!googleBooksPauseRequested){
      database=await getDatabase();const byRef=new Map(Object.values(database.providerItems).map(record=>[record.recordRef,record]));
      const outcomes=[];const cursor=job.cursor;
      for(let count=0;count<5&&cursor+count<job.queue.length&&!googleBooksPauseRequested;count++){
        job=await acquireEnrichmentRun(job.jobId,job.runId);
        const canonicalId=job.queue[cursor+count];const records=(job.targets[canonicalId]??[]).map(ref=>byRef.get(ref));
        if(!records.length||records.some(record=>!record||record.mediaType!=='book'||record.metadata.enrichment?.googleBooks?.volumeId)){outcomes.push({canonicalId,status:'skipped'});continue;}
        const canonical=database.canonicalItems[canonicalId]??{title:records[0].title};const query=enrichmentQuery(canonical,records);
        googleBooksEnrichmentStatus.textContent=googleBooksStatusText(job)+' Looking up ?'+canonical.title+'??';
        try{
          const response=await chrome.runtime.sendMessage({type:'SEARCH_GOOGLE_BOOKS',query});if(!response?.ok)throw new Error(response?.error??'Google Books lookup failed.');
          const candidates=response.candidates??[];const candidate=highConfidenceGoogleBooksCandidate(query,candidates);
          if(candidate)outcomes.push({canonicalId,enrichment:{...googleBooksEnrichment(candidate),matchBasis:query.isbn.length?'validated-isbn':'unambiguous-title-and-author'}});
          else{const hint=googleBooksGenreHintCandidate(query,candidates);outcomes.push({canonicalId,status:googleBooksMatchClassification(query,candidates),candidates:candidates.map(candidate=>googleBooksEnrichment(candidate)),...(hint?{hint:googleBooksGenreHint(hint)}:{})});}
        }catch(error){
          if(stopsGoogleBooksEnrichment(error.message)){lastError=error.message;googleBooksPauseRequested=true;break;}
          outcomes.push({canonicalId,status:'failed',reason:error.message,candidates:[]});
        }
        outcomes.at(-1).recordObservations=records.map(record=>({ref:record.recordRef,observedAt:record.observedAt,title:record.title}));
        await pause(1200);
      }
      if(outcomes.length){const committed=await commitEnrichmentBatch(job.jobId,job.runId,cursor,outcomes);job=committed.job;database=committed.database;renderActiveBookJob(job);render();}
    }
  }catch(error){lastError=error.message;}
  finally{
    if(job?.runId)try{job=await finishEnrichmentRun(job.jobId,job.runId,lastError);}catch(error){lastError=error.message;}
    googleBooksRunning=false;pauseGoogleBooksEnrichmentButton.hidden=true;await renderGoogleBooksEnrichment();
    if(lastError)googleBooksEnrichmentStatus.textContent='Google Books enrichment paused: '+lastError;
  }
}

function render(timing = null) {
  contentsWorkspace.update(database,workspace.workspace==='contents');
  let endSegment=timing?.begin('options_workbench');
  try {
  providerAccountsView.update(database);
  renderOnboarding(database);
  if(!enrichmentWorkbench){
    enrichmentWorkbench=createEnrichmentWorkbench({
      apply:async selections=>{database=await applyReviewedEnrichments(selections);googleBooksSearches.clear();openLibrarySearches.clear();},
      dismiss:async refs=>{database=await dismissEnrichmentReviews(refs);googleBooksSearches.clear();openLibrarySearches.clear();},
      undo:async refs=>{database=await undoEnrichmentSelections(refs);},
      retry:retryEnrichmentReview,inspect:inspectEnrichmentRecords,refresh:render
    });document.querySelector('#books-workspace').append(enrichmentWorkbench.element);
  }
  enrichmentWorkbench.update(database);
  endSegment?.();endSegment=timing?.begin('options_dashboards');
  const receiptWorkbench=createPurchaseEvidenceWorkbench(database,{
    save:async()=>{},import:async entries=>{database=await importPurchaseEvidence(entries);},retry:async()=>{database=await refreshPurchaseEvidence();},
    apply:async(...args)=>{database=await applyPurchaseEvidence(...args);},dismiss:async id=>{database=await dismissPurchaseEvidence(id);},refresh:render
  });
  const priorReceipts=document.querySelector('#purchase-evidence-workbench');receiptWorkbench.open=priorReceipts?.open??false;
  if(priorReceipts)priorReceipts.replaceWith(receiptWorkbench);else document.querySelector('#ownership-workspace').append(receiptWorkbench);
  const syncDashboard=createSyncHealthView(database,{cancel:async(...args)=>{database=await cancelProviderScan(...args);},refresh:render});
  const priorSync=document.querySelector('#sync-health-dashboard');syncDashboard.open=priorSync?.open??false;
  if(priorSync)priorSync.replaceWith(syncDashboard);else document.querySelector('#providers-workspace').append(syncDashboard);
  const reminderDashboard=createRemindersView(database,{
    removeFeed:async clientId=>{await removeCompanionFeed(clientId);database=await getDatabase();},review:async(...args)=>{database=await saveReminderReview(...args);},refresh:render,inspect:ref=>inspectEnrichmentRecords([ref]),
    requestPermission:()=>requestReminderPermissions(chrome),notificationSettings:getReminderNotificationSettings,notifications:saveReminderNotificationSettings,reviewSource:reviewCompanionSource
  });const priorReminders=document.querySelector('#entitlement-reminders');reminderDashboard.open=priorReminders?.open??false;
  if(priorReminders)priorReminders.replaceWith(reminderDashboard);else receiptWorkbench.after(reminderDashboard);
  const priorReading=document.querySelector('#reading-workbench');
  const readingWorkbench=createReadingWorkbench(database,{
    order:async(...args)=>{const result=await saveReadingOrder(...args);database=result.database;return result;},deleteOrder:async(...args)=>{database=await removeReadingOrder(...args);},refresh:render,inspect:ref=>inspectEnrichmentRecords([ref])
  },priorReading?.dataset.selectedOrder??'');readingWorkbench.open=priorReading?.open??false;
  if(priorReading)priorReading.replaceWith(readingWorkbench);else document.querySelector('#reading-workspace').append(readingWorkbench);
  endSegment?.();endSegment=timing?.begin('options_filters');
  const providerEntries = Object.entries(combinedProviderStates(database)).sort(([left], [right]) => left.localeCompare(right));
  assumeAllOwned.checked=database.ownershipPolicy.allOwned;
  document.querySelector('#ownership-provider-help').textContent=assumeAllOwned.checked
    ? 'The global checkbox covers every library. Your provider choices below are saved and apply again when you switch it off.'
    : 'To apply this to one library, use its checkbox below.';
  populateProviderFilter(providerEntries);
  populateGenreFilter(Object.values(database.providerItems));
  for(const field of Object.values(viewControls))if(field.dataset.pendingValue){field.value=field.dataset.pendingValue;if(!field.value)field.value="all";delete field.dataset.pendingValue;}
  providers.replaceChildren(...(providerEntries.length ? providerEntries.map(([id, state]) => {
    const node = document.createElement('article');
    node.className = 'provider';
    const providerParts = [];
    if (state.itemCount) providerParts.push(`${state.itemCount} games`);
    if (state.audiobookCount) providerParts.push(`${state.audiobookCount} audiobooks`);
    if(state.softwareCount)providerParts.push(`${state.softwareCount} software products`);
    if (state.bookCount) providerParts.push(`${state.bookCount} books`);
    if (state.movieCount) providerParts.push(`${state.movieCount} movies`);
    if (state.tvCount) providerParts.push(`${state.tvCount} TV titles`);
    if (state.addOnCount) providerParts.push(`${state.addOnCount} DLC`);
    if (!providerParts.length) providerParts.push('0 items');
    if (state.lastSync) providerParts.push(`synced ${new Date(state.lastSync).toLocaleString()}`);
    const providerSummary = providerParts.join(' · ');
    node.append(textElement('strong', displayProviderName(id)), textElement('span', providerSummary));
    const choice=document.createElement('label');choice.className='ownership-choice ownership-provider-choice';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='assume-owned-'+id;
    checkbox.dataset.ownershipProvider=id;checkbox.checked=database.ownershipPolicy.providers[id]===true;
    checkbox.disabled=database.ownershipPolicy.allOwned;
    checkbox.setAttribute('aria-describedby','ownership-provider-help');
    checkbox.addEventListener('change',()=>changeOwnershipPolicy({providers:{[id]:checkbox.checked}}));
    choice.append(checkbox,document.createTextNode('Treat all '+displayProviderName(id)+' items as owned'));
    node.append(choice);
    return node;
  }) : [Object.assign(document.createElement('p'), { textContent: 'No libraries connected.' })]));

  endSegment?.();endSegment=timing?.begin('options_selection');
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
      return (workspace.workspace !== 'books' || ['book','audiobook'].includes(item.mediaType)) && matchesProviderAndOwnership && matchesMediaType && matchesDlc && matchesGenre && matchesSearch;
    })
    .sort((left, right) => compareTitles(left.title, right.title));
  const gameCanonicalCount = canonical.filter((item) => item.mediaType === 'game').length;
  const audiobookCanonicalCount = canonical.filter((item) => item.mediaType === 'audiobook').length;
  const softwareCanonicalCount=canonical.filter(item=>item.mediaType==='software').length;
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
  if(softwareCanonicalCount)summaryParts.push(`${softwareCanonicalCount} unique software products`);
  const suffix = filtersAreActive(filters, query) ? ' matching filters' : '';
  if (gameCanonicalCount || (!softwareCanonicalCount && !audiobookCanonicalCount && !bookCanonicalCount && !movieCanonicalCount && !tvCanonicalCount)) summaryParts.push(`${gameCanonicalCount} unique game${gameCanonicalCount === 1 ? '' : 's'}`);
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

  endSegment?.();endSegment=timing?.begin('options_cards');
  libraryPage=Math.max(0,Math.min(libraryPage,Math.max(0,Math.ceil(canonical.length/50)-1)));
  document.querySelector("#library-previous").disabled=libraryPage===0;
  document.querySelector("#library-next").disabled=(libraryPage+1)*50>=canonical.length;
  document.querySelector("#library-page-status").textContent=canonical.length ? "Showing "+(libraryPage*50+1)+"?"+Math.min((libraryPage+1)*50,canonical.length)+" of "+canonical.length : "No items to show";
  items.replaceChildren(...canonical.slice(libraryPage*50,(libraryPage+1)*50).map((canonicalItem) => {
    const node = document.createElement('li');
    const records = canonicalItem.providerItemIds.map((id) => database.providerItems[id]);
    node.dataset.recordRefs=JSON.stringify(records.map(record=>record.recordRef));
    const linkedAddOns = records.flatMap((record) => addOnsByParent.get(record.id) ?? []);
    node.className = 'library-item';
    const header = document.createElement('div');
    header.className = 'library-item-header';
    header.append(textElement('strong', canonicalItem.title), textElement('span', displayMediaType(canonicalItem.mediaType)));
    node.append(header);
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
    const details=document.createElement("details");details.className="item-details";details.dataset.canonicalId=canonicalItem.id;
    details.append(textElement("summary",workspace.workspace==="books"?"Book details and tools":"Details"));
    const body=document.createElement("div");body.className="item-details-body";details.append(body);let built=false;
    const build=()=>{if(built)return;built=true;
    const metadataText = displayMediaMetadata(records, canonicalItem.mediaType);
    if (metadataText) {
      const metadata = textElement('div', metadataText);
      metadata.className = 'library-item-metadata';
      body.append(metadata);
    }
    const genreTags = createGenreTags(records);
    if (genreTags) body.append(genreTags);
    const comicMangaCandidateTag = createComicMangaCandidateTag(records);
    if (comicMangaCandidateTag) body.append(comicMangaCandidateTag);
    const comicContents = createComicContents(records);
    if (comicContents) body.append(comicContents);

      if(canonicalItem.mediaType==="book"&&workspace.workspace!=="books"){const improve=actionButton("Improve book information",()=>{workspace.select("books");search.value=canonicalItem.title;libraryPage=0;render();workspace.rememberView();const target=[...items.children].find(node=>JSON.parse(node.dataset.recordRefs||"[]").some(ref=>records.some(record=>record.recordRef===ref)));if(target){const detail=target.querySelector(".item-details");detail.open=true;detail.dispatchEvent(new Event("toggle"));target.scrollIntoView({block:"center"});}});body.append(improve);}
    body.append(createEvidenceInspector(canonicalItem,records,database,{
      split:async id=>{database=await separateEdition(id);},
      undoSplit:async ref=>{database=await undoEditionSeparation(ref);},
      save:async(candidate,decision)=>{database=await saveManualMatchDecision(candidate,decision);},
      remove:async(id)=>{database=await removeManualMatchDecision(id);},
      refresh:render
    }));
    body.append(createTitleAliasTools(records,database,async(...args)=>{database=await saveTitleAliases(...args);render();}));
    body.append(createOwnershipReviewTools(records,database,{
      save:async(...args)=>{database=await saveOwnershipReview(...args);},remove:async(...args)=>{database=await removeOwnershipReview(...args);},refresh:render
    }));
    if(['book','audiobook'].includes(canonicalItem.mediaType))body.append(createReadingTools(records,database,{
      save:async(...args)=>{database=await saveReadingState(...args);},remove:async(...args)=>{database=await removeReadingState(...args);},refresh:render
    }));
    if (canonicalItem.mediaType === 'book' && workspace.workspace === 'books') {
      body.append(createGoogleBooksTools(canonicalItem,records));
      body.append(createEnrichmentEvidence(records,database,async ref=>{database=await undoEnrichmentSelection(ref);render();}));
      body.append(createLocalMetadataTools(records,{queue:async review=>{database=await saveEnrichmentReview(review);workspace.select('books');enrichmentWorkbench.showTitle(review.title);},refresh:()=>{render();enrichmentWorkbench.element.open=true;backupStatus.textContent='Metadata lookup saved in the enrichment workbench for review.';}}));
      const openLibraryTools = createOpenLibraryTools(canonicalItem, records);
      if (openLibraryTools) body.append(openLibraryTools);
    }
    if (['book','game'].includes(canonicalItem.mediaType)) {
      for (const record of records) body.append(createContentsEditor(record,database.contentReviews?.[record.id],{
        save:async(id,value)=>{database=await saveContentReview(id,value);},
        remove:async(id)=>{database=await removeContentReview(id);},
        refresh:render
      }));
    }
    if (linkedAddOns.length) body.append(createAddOnList(linkedAddOns));

    };
    details.addEventListener("toggle",()=>{if(details.open){build();openItemDetails.add(canonicalItem.id);}else if(details.isConnected)openItemDetails.delete(canonicalItem.id);});
    if(openItemDetails.has(canonicalItem.id)){details.open=true;build();}
    node.append(details);
    return node;
  }));

  endSegment?.();endSegment=timing?.begin('options_reviews');
  const canShowUnlinkedAddOns = (filters.mediaType === 'all' || filters.mediaType === 'game') && filters.dlc === 'all';
  const unlinked = canShowUnlinkedAddOns
    ? addOns.filter((addOn) => !linkedAddOnIds.has(addOn.id) && providerMatches(addOn, filters.provider) && ownershipMatches(addOn, filters.ownership) && itemMatchesQuery(addOn, query))
      .sort((left, right) => compareTitles(left.title, right.title))
    : [];
  unlinkedAddOnsSection.hidden = workspace.workspace !== 'library' || unlinked.length === 0;
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
  if(!history){history=document.createElement('details');history.id='provider-history';document.querySelector('#providers-workspace').append(history);}
  const records=Object.values(database.providerHistory??{});
  history.replaceChildren(textElement('summary',`Earlier imports: ${records.length} records missing from the latest complete scan`));
  history.append(textElement('p','History preserves earlier purchase and access evidence. A missing record does not prove revocation. Earlier missing records may appear as Possible, never as confirmed current ownership.'));
  const list=document.createElement('ul');
  for(const entry of records.slice(0,50))list.append(textElement('li',`${entry.item.title} — ${displayProviderName(entry.item.provider)} — account ${entry.profileLabel||'nickname not recorded'} — ${entry.reason==='profile-switch'?'previous profile':'not observed in complete scan'} since ${entry.missingSince||'unknown'}; last observed ${entry.item.observedAt||'unknown'}.`));
  history.append(list);if(records.length>50)history.append(textElement('p',`Showing 50 of ${records.length}. All history is preserved in your backup.`));
  endSegment?.();endSegment=timing?.begin('options_coverage');
  document.querySelector('#series-coverage-view').replaceChildren(createSeriesCoverageView(database));
  const alerts=document.querySelector('#library-alerts');alerts.replaceChildren();
  const pending=Object.keys(database.enrichmentReviews??{}).length;const ownershipCount=Object.keys(database.ownershipProposals??{}).length+duplicateReviewItems.children.length;
  if(pending)alerts.append(actionButton(pending+' book suggestions to review',()=>{workspace.select('books');enrichmentWorkbench.element.open=true;}));
  if(ownershipCount)alerts.append(actionButton(ownershipCount+' ownership reviews',()=>workspace.select('ownership')));
  alerts.hidden=!alerts.children.length;
  } finally {endSegment?.();}
}

const optionsDiagnosticPrefix=crypto.randomUUID().replaceAll('-','').slice(0,12);let optionsDiagnosticSequence=0;
async function refresh(diagnosticLookupId = null) {
  diagnosticLookupId??='lookup-'+optionsDiagnosticPrefix+'-'+String(++optionsDiagnosticSequence).padStart(3,'0');
  const timing=globalThis.GalacticContentsPerformance.trace(diagnosticLookupId,'options');
  const endTotal=timing?.begin('options_total');
  let endStage=timing?.begin('options_read');
  try {
  const {database:loadedDatabase,preferences,performance:workerTiming}=await getCommittedLibraryView(diagnosticLookupId);
  globalThis.GalacticContentsPerformance.merge(timing,workerTiming);
  database = loadedDatabase;
  document.querySelector('#library-load-status').hidden=true;
  downloadComixologyListButton.disabled = false;
  workspace.hydrate(preferences);
  endStage?.();endStage=timing?.begin('options_render');
  render(timing);
  endStage?.();endStage=timing?.begin('options_other');
  await Promise.all([renderCompanionExtensionLinks(), renderGoogleBooksEnrichment()]);
  } finally {
    endStage?.();endTotal?.();
    if(timing)chrome.runtime.sendMessage({type:'GL_CONTENTS_UI_TIMING',timing:globalThis.GalacticContentsPerformance.clean(timing.finish('reparsed'))}).catch(()=>{});
  }
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

bindPerformanceDiagnostics({button:document.querySelector('#export-timing-summary'),status:document.querySelector('#performance-diagnostics-status'),worker:document.querySelector('#performance-diagnostics-worker'),runtime:chrome.runtime});

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
    companionExtensionLinkStatus.textContent = 'Enter a valid Chrome extension ID or Firefox add-on ID.';
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
const viewChanged=()=>{libraryPage=0;render();workspace.rememberView();};
search.addEventListener('input', viewChanged);
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
providerFilter.addEventListener('change', viewChanged);
mediaTypeFilter.addEventListener('change', viewChanged);
ownershipFilter.addEventListener('change', viewChanged);
dlcFilter.addEventListener('change', viewChanged);
genreFilter.addEventListener('change', viewChanged);
clearFilters.addEventListener('click', () => {
  search.value = '';
  providerFilter.value = 'all';
  mediaTypeFilter.value = 'all';
  ownershipFilter.value = 'all';
  dlcFilter.value = 'all';
  genreFilter.value = 'all';
  render();
});
const contentsScanProgress=createContentsScanProgress({runtime:chrome.runtime,container:document.querySelector('#contents-progress-slot'),reconcile:()=>refresh(recentContentsDiagnosticId())});
let contentsDiagnosticId=null,contentsDiagnosticExpires=0;
const recentContentsDiagnosticId=()=>{const id=Date.now()<contentsDiagnosticExpires?contentsDiagnosticId:null;contentsDiagnosticId=null;return id;};
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[DATABASE_STORAGE_KEY]) contentsScanProgress.changed();
  if (areaName === 'local' && changes[SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]) {
    showEnrichmentActions.checked = workspace.workspace === 'books';
    if (database) render();
  }
  if (areaName === 'local' && !googleBooksRunning && (changes[GOOGLE_BOOKS_API_KEY_STORAGE_KEY] || changes[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY])) {
    renderGoogleBooksEnrichment().catch(() => {});
  }
});
chrome.runtime.onMessage?.addListener((message,sender)=>{
  if(sender.id===chrome.runtime.id&&message?.type==='GL_CONTENTS_TIMING_START'&&globalThis.GalacticContentsPerformance.validId(message.diagnosticLookupId)){contentsDiagnosticId=message.diagnosticLookupId;contentsDiagnosticExpires=Date.now()+60000;}
  if(sender.id===chrome.runtime.id&&message?.type==='GL_KINDLE_CONTENTS_PROGRESS')contentsScanProgress.accept(message.runs??[]);
  if(sender.id===chrome.runtime.id&&message?.type===PRIVATE_STORAGE_CHANGED)contentsScanProgress.changed();
  return false;
});
contentsScanProgress.initialize();
const loadLibrary=()=>refresh().catch(error=>{const status=document.querySelector('#library-load-status');status.hidden=false;status.querySelector('span').textContent='Could not load library: '+error.message;document.querySelector('#retry-library-load').hidden=false;});
document.querySelector('#retry-library-load').addEventListener('click',loadLibrary);
loadLibrary();
