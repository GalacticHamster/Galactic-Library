import {openProviderPage} from './provider-launch.js';
import {builtinCompanions,companionBrowser} from '../lib/companion-identities.js';
import {createConfirmation} from './confirmation.js';
import {providerLabel,formatDate,countLabel} from './formatters.js';
import {bindBackupRestore,BACKUP_SCOPE_HELP,RESTORE_LOCAL_HELP,CLEAR_LIBRARY_HELP,CLEAR_LIBRARY_WARNING} from './backup-restore.js';
import {createLibraryLoader} from './library-loading.js';
import {createBackupExporter,handoffDownload} from './backup-export.js';
import {createOperation,afterFeedbackPaint,performAction,bindOperationSummary} from './operation-feedback.js';
import {accountLabel} from './item-presentation.js';
import {createDraftGuard} from './draft-guard.js';
import {createLibraryResultSummary} from './library-result.js';
import {mountLibraryRow,expandCompactLibraryRow} from './library-layout.js';
import {createAccessCardControls,openQuickAccessEditor} from './quick-access.js';
import {createPagination} from './pagination.js';
import {createLibraryBrowseProjection,libraryBrowseResults,recordQualifies,recordSearchRank,searchKey} from './library-browse.js';
import {createItemDetailsBody} from './item-details.js';
import {bookRoute,bookHref} from './contents-navigation.js';
import {createContentsBookDetails,createContentsHistory,createCollectionComparison} from './contents-book-details.js';
import {combinedProviderStates} from '../lib/profile-management.js';
import {createProvidersView} from './providers-view.js';
import {renderOnboarding} from './onboarding.js';
import {selectProviderProfile,renameProviderProfile,previewProviderProfileRemoval,removeProviderProfile,resetProviderProfileBaseline,saveKoboOwnershipAssumption} from '../lib/storage.js';
import {createContentsWorkspace} from './contents-workspace.js';
import {createContentsScanProgress} from './contents-scan-progress.js';
import {bindPerformanceDiagnostics} from './performance-diagnostics.js';
import '../lib/contents-performance.js';
import {bookToolHelp} from './book-tool-help.js';
import { createWorkspaceNavigation } from './workspaces.js';
import { getCommittedLibraryView, getUiPreferences, saveUiPreferences, saveComicCoverageMerge, removeComicCoverageMerge, saveOwnershipPolicy } from '../lib/storage.js';
import {getProviderDiagnosticsEnabled,saveProviderDiagnosticsEnabled} from '../lib/storage.js';
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
import {saveOwnershipReview,removeOwnershipReview,saveOwnershipCorrections,importPurchaseEvidence,refreshPurchaseEvidence,applyPurchaseEvidence,dismissPurchaseEvidence} from '../lib/storage.js';
import {createEnrichmentWorkbench} from './enrichment-workbench.js';
import {bookReviewCounts,receiptReviewCounts} from './review-status.js';
import {applyReviewedEnrichments,dismissEnrichmentReviews,undoEnrichmentSelections} from '../lib/storage.js';
import { addAllowedExternalClientId, clearGoogleBooksEnrichmentJob, createBackup, clearDatabase, getDatabase, getAllowedExternalClientIds, getGoogleBooksApiKey, getGoogleBooksEnrichmentJob, getShowEnrichmentActions, parseBackup, parseBackupPreferences, removeManualMatchDecision, restoreDatabase, saveAllowedExternalClientIds, saveGoogleBooksApiKey, saveGoogleBooksEnrichmentJob, saveGoogleBooksGenreHints, saveManualMatchDecision,savePreferredDisplayTitle, saveShowEnrichmentActions, startGoogleBooksEnrichmentJob } from '../lib/storage.js';
import { DATABASE_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY } from '../lib/constants.js';
import {OBSERVATION_KEY,OBSERVATION_HEAD_KEY} from '../lib/observation-overlays.js';
import { findDuplicateCandidates } from '../lib/duplicate-review.js';
import { isExtensionId } from '../lib/external-api.js';
import { comicMangaEvidence, libraryBroadGenreValues } from '../lib/genre-hints.js';
import { googleBooksEnrichment, googleBooksGenreHint, googleBooksGenreHintCandidate, googleBooksMatchClassification, highConfidenceGoogleBooksCandidate } from '../lib/google-books.js';
import { openLibraryEnrichment } from '../lib/open-library.js';
import { compareTitles } from '../lib/title-sort.js';
import { saveContentReview, confirmContentsSuggestions, removeContentReview,saveCoverageResolutions,saveCoverageReferenceDecision } from '../lib/storage.js';
import { createContentsEditor } from './contents-editor.js';
import { createEvidenceInspector } from './evidence-inspector.js';
import { separateEdition, undoEditionSeparation } from '../lib/storage.js';
import { createSeriesCoverageView } from './series-coverage.js';
import {createCollectionOverlapView} from './collection-overlap.js';
import {createComicCoverageView} from './comic-coverage.js';
import { identityEvidence } from '../lib/identity.js';
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
bindOperationSummary(document.querySelector('#application-operation-status'));
const assumeAllOwned = document.querySelector('#assume-all-owned');
const ownershipPolicyStatus = document.querySelector('#ownership-policy-status');
const search = document.querySelector('#search');
const downloadComixologyListButton = document.querySelector('#download-comixology-list');
const showEnrichmentActions = document.querySelector('#show-enrichment-actions');
const providerFilter = document.querySelector('#provider-filter');
const accountFilter=document.querySelector('#account-filter');
const readingFilter=document.querySelector('#reading-filter');
const seriesFilter=document.querySelector('#series-filter');
const informationFilter=document.querySelector('#information-filter');
const librarySort=document.querySelector('#library-sort');
const mediaTypeFilter = document.querySelector('#media-type-filter');
const acquisitionsFilter = document.querySelector('#acquisitions-filter');
const ownershipFilter = document.querySelector('#ownership-filter');
const dlcFilter = document.querySelector('#dlc-filter');
const genreFilter = document.querySelector('#genre-filter');
const clearFilters = document.querySelector('#clear-filters');
const summary = document.querySelector('#library-summary');
const items = document.querySelector('#library-items');
const libraryLayout=document.querySelector('#library-layout'),expandedLibraryRows=new Set();
const selectedAccessRecords=new Map(),accessSelection=document.createElement('div'),accessResult=document.createElement('p');
accessSelection.className='actions';accessSelection.setAttribute('aria-label','Selected access changes');accessSelection.hidden=true;accessResult.setAttribute('role','status');
document.querySelector('#library-pagination').before(accessSelection,accessResult);
function updateAccessSelection(){
  const current=new Map(Object.values(database?.providerItems??{}).map(record=>[record.recordRef,record]));for(const [ref,scope]of selectedAccessRecords){const record=current.get(ref);if(!record||record.provider!==scope.provider||record.profileId!==scope.profileId)selectedAccessRecords.delete(ref);}
  accessSelection.hidden=!selectedAccessRecords.size;accessSelection.replaceChildren();if(!selectedAccessRecords.size)return;
  const count=document.createElement('span');count.textContent=selectedAccessRecords.size+' selected copies';
  const edit=document.createElement('button');edit.type='button';edit.textContent='Change access for selected';edit.addEventListener('click',()=>editAccess(Object.values(database.providerItems).filter(record=>selectedAccessRecords.has(record.recordRef)),true));
  const clear=document.createElement('button');clear.type='button';clear.textContent='Clear selection';clear.addEventListener('click',()=>{selectedAccessRecords.clear();render();});accessSelection.append(count,edit,clear);
}
function editAccess(records,bulk=false){
  if(!drafts.allowNavigation())return;
  updateAccessSelection();
  if(bulk||records.some(record=>selectedAccessRecords.has(record.recordRef))){bulk=true;records=Object.values(database.providerItems).filter(record=>selectedAccessRecords.has(record.recordRef));}
  openQuickAccessEditor(records,database,{selectedRefs:bulk?records.map(r=>r.recordRef):undefined,save:(targets,value)=>saveOwnershipCorrections(targets,value),saved:(updated,count,cleared)=>{database=updated;selectedAccessRecords.clear();accessResult.textContent=count+' '+(count===1?'copy':'copies')+(cleared?' restored to provider-derived access.':' updated.');render();}});
}
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
const browseProjection=createLibraryBrowseProjection();
const draftNotice=document.createElement('div');draftNotice.id='draft-notice';draftNotice.className='compact-notice';draftNotice.hidden=true;draftNotice.setAttribute('role','status');
const draftMessage=document.createElement('span'),discardDrafts=document.createElement('button');discardDrafts.type='button';discardDrafts.textContent='Discard edits and reload view';draftNotice.append(draftMessage,discardDrafts);document.querySelector('#workspace-status').after(draftNotice);
function draftStamp(scope){
  if(scope.matches('.reading-order-draft'))return JSON.stringify(scope.dataset.readingOrder?database?.readingOrders?.[scope.dataset.readingOrder]??null:'new-order');
  const exact=scope.closest('[data-reading-record],[data-ownership-record]'),refs=exact?[exact.dataset.readingRecord??exact.dataset.ownershipRecord]:scope.closest('#contents-book-review')?[scope.closest('#contents-book-review').dataset.recordRef]:JSON.parse(scope.closest('li[data-record-refs]')?.dataset.recordRefs??'[]');
  const records=Object.values(database?.providerItems??{}).filter(record=>refs.includes(record.recordRef));
  const reading=scope.matches('[data-reading-record]'),ownership=scope.matches('[data-ownership-record]');
  const values=records.map(record=>{
    if(reading)return [record.id,record.recordRef,record.title,record.profileId,database.readingStates?.[record.recordRef]];
    const metadata=record.metadata??{},enrichment=metadata.enrichment??{},source=enrichment.kindleProductComicContents;
    const identity=[record.id,record.recordRef,record.title,record.profileId,record.ownership,metadata.authors,metadata.series,metadata.isbn,metadata.language,metadata.edition,metadata.volume,metadata.issue,enrichment.googleBooks,enrichment.openLibrary,enrichment.localMetadata];
    return ownership?[identity,database.ownershipReviews?.[record.recordRef],database.ownershipPolicy]:[identity,source?.statement,source?.parseInput,source?.checkedAt,database.contentReviews?.[record.id],database.titleAliases?.[record.recordRef]];
  });
  return JSON.stringify([values,reading||ownership?null:Object.values(database?.canonicalItems??{}).filter(item=>item.providerItemIds.some(id=>records.some(record=>record.id===id))).map(item=>[item.id,item.providerItemIds]),reading||ownership?null:Object.values(database?.enrichmentReviews??{}).filter(review=>review.recordRefs?.some(ref=>refs.includes(ref)))]);

}
const drafts=createDraftGuard({stamp:draftStamp});
discardDrafts.addEventListener('click',()=>{if(drafts.allowNavigation()){if(contentsWorkspace.selected)contentsWorkspace.refreshReview();render();}});
globalThis.addEventListener?.('beforeunload',event=>{if(drafts.dirty||backupRestore.saving){event.preventDefault();event.returnValue='';}});
const contentsReviewActions={
  save:async(id,value)=>{database=await drafts.commit(()=>saveContentReview(id,value));},
  remove:async(id)=>{database=await drafts.commit(()=>removeContentReview(id));},
  refresh:()=>{render();contentsWorkspace.refreshReview();}
};
const coverageResolutionActions={
  canLeave:()=>drafts.allowNavigation(),
  save:async request=>{database=await drafts.commit(()=>saveCoverageResolutions(request));return database;},
  saveReference:async request=>{database=await drafts.commit(()=>saveCoverageReferenceDecision(request));return database;},
  saveReview:async(id,value)=>{database=await drafts.commit(()=>saveContentReview(id,value));return database;},
  removeReview:async id=>{database=await drafts.commit(()=>removeContentReview(id));return database;},
  resolved:async next=>{database=next;comicCoverageDatabase=null;render();}
};
const contentsWorkspace=createContentsWorkspace({projection:browseProjection,resolutionActions:coverageResolutionActions,coverageOptions:()=>({merges:comicCoverageMerges}),canLeave:()=>drafts.allowNavigation(),pageSizeChanged:size=>changePageSize(size),changed:()=>workspace.rememberView(),backLabel:()=>reviewOrigin?.workspace==='books'?'Back to book information':reviewOrigin?.workspace==='library'?'Back to Library results':'Back to Contents results',back:returnFromContents,collection:()=>{reviewOrigin=null;pushRoute('#contents');},library:ref=>openLibraryRecord(ref,{returnToOrigin:true}),opened:ref=>{
  if(!reviewOrigin)reviewOrigin={workspace:'contents',view:contentsWorkspace.readView(),scroll:contentsWorkspace.scroll,ref};
  if(!restoringRoute)pushRoute(bookHref('contents',ref));
},review:(record,current)=>{
  const root=document.createElement('div');
  root.append(createContentsEditor(record,current.contentReviews?.[record.id],contentsReviewActions,{expanded:true}),
    createContentsBookDetails(record,current,{enrich:ref=>inspectEnrichmentRecords([ref]),undo:async ref=>{database=await undoEnrichmentSelection(ref);render();contentsWorkspace.refreshReview();}}),
    createCollectionComparison(record,current),createContentsHistory(record,current));
  return root;
}});
document.querySelector('#contents-collections-slot').append(contentsWorkspace.element);
const providerAccountsView=createProvidersView({saveKoboOwnershipAssumption,select:selectProviderProfile,rename:renameProviderProfile,preview:previewProviderProfileRemoval,remove:removeProviderProfile,reset:resetProviderProfileBaseline,openProvider:openProviderPage,onDatabase:next=>{database=next;render();}});
document.querySelector('#provider-accounts-slot').append(providerAccountsView.element);
let ownershipPolicySaving=false;
async function changeOwnershipPolicy(patch) {
  if(ownershipPolicySaving)return;ownershipPolicySaving=true;
  const focusId=document.activeElement?.id;
  assumeAllOwned.disabled=true;
  for(const checkbox of providers.querySelectorAll('[data-ownership-provider]'))checkbox.disabled=true;
  ownershipPolicyStatus.textContent='Saving ownership preference…';
  try{
    await afterFeedbackPaint();
    database=await saveOwnershipPolicy(patch);
    render();
    ownershipPolicyStatus.textContent='Saved. Refresh open HB/FAN bundle pages to run matching with this preference.';
  }catch(error){
    render();
    ownershipPolicyStatus.textContent='Could not save ownership preference: '+error.message;
  }finally{
    ownershipPolicySaving=false;
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
let browseAnchor='',lastBrowseResult,selectedBrowseRef;
let unlinkedPage=0;
let coverageDatabase;
const comparisonViewState={};
let overlapDatabase;
const comicCoverageBrowseState={};
let comicCoverageDatabase,comicCoverageStarts={},comicCoverageTransitions={},comicCoverageMerges={},comicCoverageNames={};
let duplicateReviewDatabase,duplicateReviewCandidates;
const itemDetailContexts=new Map();
const filterDefault=()=> 'all';
const viewControls = { provider: providerFilter, mediaType: mediaTypeFilter, genre: genreFilter, ownership: ownershipFilter, acquisitions:acquisitionsFilter, dlc: dlcFilter, account:accountFilter, reading:readingFilter, series:seriesFilter, information:informationFilter };
const workspace = createWorkspaceNavigation({
  readView: current => current==='contents'?contentsWorkspace.readView():({ search: search.value, ...Object.fromEntries(Object.entries(viewControls).map(([key, field]) => [key, field.value || filterDefault(key)])), sort:librarySort.value, page: libraryPage,anchor:lastBrowseResult?.rows.some(row=>row.records.some(value=>value.record.recordRef===selectedBrowseRef))?selectedBrowseRef:lastBrowseResult?.rows[0]?.canonical.id??'' }),
  applyView: (view,current) => {if(current==='contents'){if(contentsWorkspace.selected)contentsWorkspace.close();contentsWorkspace.applyView(view);return;} search.value = view.search; libraryPage = view.page; browseAnchor=view.anchor??'';librarySort.value=view.sort??'title-asc'; for (const [key, field] of Object.entries(viewControls)) { field.value = view[key]??filterDefault(key); if (!field.value) { field.dataset.pendingValue = view[key]; field.value = filterDefault(key); } } },
  save: saveUiPreferences, beforeSelect:()=>{if(!drafts.allowNavigation())return false;if(!restoringRoute)rememberNavigationEntry();},navigated:name=>{reviewOrigin=null;pushRoute('#'+name);}, changed: () => { if (database) render(); }
});
function changePageSize(size){if(!drafts.allowNavigation())return false;return workspace.setPageSize(size);}
const libraryPaging=createPagination({name:'Library',loading:true,top:document.querySelector('#library-pagination'),bottom:document.querySelector('#library-pagination-bottom'),sizeContainer:document.querySelector('#library-page-size'),ids:{previous:'library-previous',next:'library-next',status:'library-page-status',size:'library-items-per-page'},onSize:changePageSize,onPage:page=>{if(!drafts.allowNavigation())return false;libraryPage=page;browseAnchor='';render();workspace.rememberView();}});
libraryPaging.select.disabled=true;
document.querySelector("#open-active-book-job").addEventListener("click", () => workspace.select("books"));
document.querySelector("#pause-active-book-job").addEventListener("click", () => { googleBooksPauseRequested = true; document.querySelector("#active-book-job-status").textContent = "Pausing after the current book…"; });

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
  googleBooksSearches.clear();openLibrarySearches.clear();
}

let initialBookRoute=bookRoute(globalThis.location?.hash);
let contentsLibraryOrigin,reviewOrigin,restoringRoute=false,lastHandledHash='',navigationHydrated=false;
function currentNavigation(){return {workspace:workspace.workspace,view:workspace.workspace==='contents'?contentsWorkspace.readView():workspace.savedView,scroll:globalThis.scrollY??0,origin:reviewOrigin};}
function rememberNavigationEntry(){if(!database)return;globalThis.history?.replaceState({gl:currentNavigation()},'',globalThis.location.hash||'#library');}
function pushRoute(href){if(restoringRoute)return;lastHandledHash=href;const state={gl:currentNavigation()};if(globalThis.location.hash===href)globalThis.history?.replaceState(state,'',href);else globalThis.history?.pushState(state,'',href);}
function returnFromContents(){
  const origin=reviewOrigin??{workspace:'contents',view:contentsWorkspace.readView(),scroll:contentsWorkspace.scroll};
  if(!drafts.allowNavigation())return;
  contentsWorkspace.close();workspace.select(origin.workspace,{view:origin.view,history:false});
  if(origin.workspace==='library'){
    const ref=origin.ref,card=[...items.children].find(node=>JSON.parse(node.dataset.recordRefs||'[]').includes(ref));
    if(card){expandCompactLibraryRow(card);const details=card.querySelector('.item-details');details.open=true;details.dispatchEvent(new Event('toggle'));card.tabIndex=-1;card.focus({preventScroll:true});}
    else document.querySelector('#workspace-status').textContent='The original book moved or is no longer in these results. Your browsing filters are retained.';
  }
  reviewOrigin=null;workspace.rememberView();pushRoute('#'+origin.workspace);globalThis.scrollTo?.(0,origin.scroll);
}
function openContentsRecord(ref){
  if(!drafts.allowNavigation())return;
  if(!restoringRoute)rememberNavigationEntry();
  if(['library','books'].includes(workspace.workspace)){
    workspace.rememberView();if(workspace.workspace==='library')contentsLibraryOrigin={ref,workspace:workspace.workspace,search:search.value,filters:Object.fromEntries(Object.entries(viewControls).map(([key,field])=>[key,field.value])),sort:librarySort.value,page:libraryPage,scroll:globalThis.scrollY};
    reviewOrigin={workspace:workspace.workspace,view:{...workspace.savedView,anchor:ref},scroll:globalThis.scrollY,ref};
  }
  if(!workspace.select('contents',{history:false}))return;
  if(!contentsWorkspace.open(ref)){contentsWorkspace.close();document.querySelector('#workspace-status').textContent='That book is no longer in the current library. Search saved collections below.';if(!restoringRoute)pushRoute('#contents');}
}
function openLibraryRecord(ref,{returnToOrigin=false,section=null}={}){
  const record=Object.values(database.providerItems).find(record=>record.recordRef===ref);
  if(!record){document.querySelector('#workspace-status').textContent='That record is no longer in the current library.';return;}
  const restoredOrigin=reviewOrigin?.ref===ref&&reviewOrigin.workspace==='library'?{ref,workspace:reviewOrigin.workspace,search:reviewOrigin.view.search,filters:reviewOrigin.view,sort:reviewOrigin.view.sort,page:reviewOrigin.view.page,scroll:reviewOrigin.scroll}:null;
  const origin=returnToOrigin?(restoredOrigin??(contentsLibraryOrigin?.ref===ref?contentsLibraryOrigin:null)):null;
  const findCard=()=>[...items.children].find(node=>JSON.parse(node.dataset.recordRefs||'[]').includes(ref));
  if(!workspace.select(origin?.workspace??'library',{history:false}))return;
  if(origin){search.value=origin.search;librarySort.value=origin.sort;libraryPage=origin.page;for(const [key,value]of Object.entries(origin.filters))if(viewControls[key])viewControls[key].value=value;render();}
  if(!findCard()){
    search.value='';for(const [key,filter]of Object.entries(viewControls))filter.value=filterDefault(key);
    const sorted=libraryBrowseResults(browseProjection(database),{sort:librarySort.value,workspace:workspace.workspace}).matches;
    libraryPage=Math.max(0,Math.floor(sorted.findIndex(row=>row.canonical.providerItemIds.includes(record.id))/workspace.pageSize));render();
  }
  workspace.rememberView();
  const card=findCard();
  if(card){expandCompactLibraryRow(card);const details=card.querySelector('.item-details');details.open=true;details.dispatchEvent(new Event('toggle'));if(section){const target=card.querySelector(`[data-item-section="${section==='ownership'?'library':section}"]`);if(target){target.open=true;target.dispatchEvent(new Event('toggle'));if(section==='ownership'){const tools=target.querySelector('.ownership-review-tools');if(tools){tools.open=true;tools.dispatchEvent(new Event('toggle'));}}}}card.tabIndex=-1;card.focus({preventScroll:true});if(origin)globalThis.scrollTo(0,origin.scroll);else card.scrollIntoView({block:'center'});}
  pushRoute(bookHref('library',ref));
}
function visitBookRoute(route){if(route?.workspace==='contents')openContentsRecord(route.recordRef);else if(route)openLibraryRecord(route.recordRef);}
document.addEventListener('click',event=>{const link=event.target.closest('[data-contents-record]');if(link){event.preventDefault();initialBookRoute=null;if(database)openContentsRecord(link.dataset.contentsRecord);}});
document.querySelector('#workspace-navigation').addEventListener('click',()=>{initialBookRoute=null;});
function restoreNavigation(){
  if(lastHandledHash===globalThis.location.hash)return;
  if(!drafts.allowNavigation()){globalThis.history?.pushState({gl:currentNavigation()},'',lastHandledHash||'#'+workspace.workspace);return;}
  lastHandledHash=globalThis.location.hash;
  if(!database){initialBookRoute=bookRoute(globalThis.location.hash);return;}
  restoringRoute=true;
  try{
    const saved=globalThis.history?.state?.gl,route=bookRoute(globalThis.location.hash);
    if(globalThis.location.hash.startsWith('#overlap'))coverageView='overlap';
    reviewOrigin=saved?.origin??null;
    if(saved)workspace.select(saved.workspace,{view:saved.view,history:false});
    else workspace.select(route?.workspace??globalThis.location.hash,{history:false});
    if(route?.workspace==='contents'){
      if(!contentsWorkspace.open(route.recordRef))document.querySelector('#workspace-status').textContent='That book is no longer in the current library.';
    }else if(route)openLibraryRecord(route.recordRef);
    if(saved)globalThis.scrollTo?.(0,saved.scroll);
  }finally{restoringRoute=false;}
}
globalThis.addEventListener?.('hashchange',restoreNavigation);
globalThis.addEventListener?.('popstate',restoreNavigation);
function inspectEnrichmentRecords(refs,category){
  if(category==='unparsed'){openContentsRecord(refs[0]);return;}
  if(refs[0])openLibraryRecord(refs[0],{section:'books'});
}

function displayProviderName(provider) {return providerLabel(provider);
}

function displayMediaType(mediaType) {
  if (mediaType === 'audiobook') return 'Audiobook';
  if (mediaType === 'book') return 'Book';
  if(mediaType==='software')return 'Software';
  if (mediaType === 'movie') return 'Movie';
  if (mediaType === 'tv') return 'TV show';
  return 'Game';
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

function textElement(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
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

function selectedFilters() {return Object.fromEntries(Object.entries(viewControls).map(([key,field])=>[key,field.value||filterDefault(key)]));}

function filtersAreActive(filters, query) {return Boolean(query)||Object.entries(filters).some(([key,value])=>value!==filterDefault(key));}

let browseFacetDatabase;
function populateBrowseFilters(browse){
  if(browseFacetDatabase===browse.database)return;browseFacetDatabase=browse.database;
  for(const [field,all,options]of [[accountFilter,'All accounts',browse.accountOptions],[seriesFilter,'Any series',browse.seriesOptions.map(value=>({value,label:value}))],[genreFilter,'Any genre',browse.genreOptions.map(value=>({value,label:value}))]]){
    const selected=field.dataset.pendingValue??field.value;
    field.replaceChildren(...[{value:'all',label:all},...options].map(({value,label})=>Object.assign(textElement('option',label),{value})));
    field.value=selected;if(!field.value)field.value='all';
  }
}
function renderActiveFilters(filters){
  const root=document.querySelector('#library-active-filters');root.replaceChildren();
  if(search.value.trim())root.append(actionButton('Search: '+search.value.trim()+' - clear',()=>{search.value='';viewChanged();}));
  const labels={provider:'Provider',mediaType:'Media',account:'Account',genre:'Genre',ownership:'Access',acquisitions:'Copies owned',reading:'Reading',series:'Series',information:'Information',dlc:'DLC'};
  for(const [key,value]of Object.entries(filters))if(value!==filterDefault(key)){const field=viewControls[key];root.append(actionButton(labels[key]+': '+field.selectedOptions[0]?.textContent+' - clear',()=>{field.value=filterDefault(key);viewChanged();}));}
  root.hidden=!root.children.length;
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
  return `${record.title} — ${accountLabel(record,database)}`;
}

function actionButton(label, onClick) { return reviewButton(label, "", onClick); }

function reviewButton(label, className, onClick) {
  const button = textElement('button', label);
  button.type = 'button';
  button.className = className;
  button.addEventListener('click', onClick);
  return button;
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

function createOpenLibraryTools(canonicalItem, records, {enabled=showEnrichmentActions.checked}={}) {
  const enrichment = records.map((record) => record.metadata?.enrichment?.openLibrary).find(Boolean);
  if (!enabled && !enrichment?.workKey) return null;
  const container = document.createElement('div');
  container.className = 'open-library-tools';
  container.append(bookToolHelp({purpose:'Find the work behind this book, including authors and subjects.',input:'Its ISBN when known, otherwise title and author. Open Library needs no API key.',saves:'Nothing until you select a work. Work information describes a book across editions; its ISBN list is not evidence for your edition.',review:'Choose only the same work. Use edition lookup or reviewed contents for issue and volume coverage. Undo the selection under Sources and undo.',example:'A work for a manga volume may have paperback and digital editions; it does not establish what your omnibus collects.'}));
  const searchState = openLibrarySearches.get(canonicalItem.id);
  if (enabled) {
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
  if (!enabled || !searchState) return container;
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
  container.append(textElement('p',`${searchState.candidates.length} work suggestions saved. Preview and confirm them in Review suggestions for this item below.`));
  return container;
}

function createGoogleBooksTools(canonical,records,{enabled=showEnrichmentActions.checked}={}){
  const container=document.createElement('details');const heading=document.createElement('summary');
  const stages=enrichmentStages(records,database);
  heading.textContent='Find details for this edition';
  container.append(heading,bookToolHelp({purpose:'Look up edition details in Google Books, then choose the result that describes your copy.',input:'Its ISBN, or title and known authors. The Google Books API key is configured in Settings.',saves:'Manual searches save suggestions for review. They do not automatically apply edition metadata.',review:'Preview the fields, check the edition, then confirm before applying. Conflicting editions cannot be applied. Undo restores the previous source selection.',example:'A second edition may be related to your first edition, but should not supply its language, ISBN or page count.'}));
  const available=Object.entries(stages).filter(([,done])=>done).map(([stage])=>({genre:'genres',work:'work information',edition:'edition information',creators:'creators',contents:'reviewed contents',contentsLookup:'contents lookup'}[stage]));container.append(textElement('p',available.length?'Already available: '+available.join(', ')+'.':'No added book information yet.'));
  if(!enabled)return container;
  const search=reviewButton('Find Google Books candidates','google-books-search',async()=>{
    googleBooksSearches.set(canonical.id,{loading:true,candidates:[]});render();
    try{const response=await chrome.runtime.sendMessage({type:'SEARCH_GOOGLE_BOOKS',query:bibliographicQuery(canonical,records)});if(!response?.ok)throw new Error(response?.error??'Search unavailable.');googleBooksSearches.set(canonical.id,{loading:false,candidates:response.candidates??[]});database=await saveEnrichmentReview({recordRefs:records.map(record=>record.recordRef),source:'googleBooks',status:response.candidates?.length?'candidates':'no-results',title:canonical.title,reason:'Manual candidate discovery; confirm an edition before applying.',candidates:(response.candidates??[]).map(candidate=>googleBooksEnrichment(candidate))});}
    catch(error){googleBooksSearches.set(canonical.id,{loading:false,candidates:[],error:error.message});database=await saveEnrichmentReview({recordRefs:records.map(record=>record.recordRef),source:'googleBooks',status:'failed',title:canonical.title,reason:'Google Books lookup failed. Retry from the enrichment workbench.',candidates:[]});}render();
  });
  const pending=Object.values(database.enrichmentReviews).find(entry=>entry.source==='googleBooks'&&entry.recordRefs.some(ref=>records.some(record=>record.recordRef===ref)));
  const state=googleBooksSearches.get(canonical.id)??(pending?{loading:false,candidates:pending.candidates,error:pending.status==='failed'?pending.reason:''}:null);search.disabled=Boolean(state?.loading);container.append(search);
  if(state?.error)container.append(textElement('p',state.error));
  if(state&&!state.loading&&!state.candidates.length&&!state.error)container.append(textElement('p','No results. Try another source or add identifiers through local metadata.'));
  if(state?.candidates?.length)container.append(textElement('p',`${state.candidates.length} edition suggestions saved. Preview and confirm them below.`));
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
  const feedback=textElement('p','');feedback.className='review-feedback';feedback.setAttribute('role','status');
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  if (reviewed) {
    actions.append(textElement('span', candidate.decision === 'different' ? 'Marked as different works.' : candidate.decision==='same-edition'?'Marked as the same edition.':'Marked as the same work; editions stay separate.'));
    actions.append(reviewButton('Undo decision', 'undo', async () => {
      try {
        database = await performAction({status:feedback,name:'Removing edition relationship...',task:()=>removeManualMatchDecision(candidate.id)});
        render();
      } catch (error) {
        feedback.textContent = `Could not undo edition relationship: ${error.message}`;
      }
    }));
  } else {
    actions.append(reviewButton('Same work', 'same', async () => {
      try {
        database = await performAction({status:feedback,name:'Saving edition relationship...',task:()=>saveManualMatchDecision(candidate, 'same-work')});
        render();
      } catch (error) {
        feedback.textContent = `Could not save edition relationship: ${error.message}`;
      }
    }));
    actions.append(reviewButton('Same edition', 'same-edition', async () => {
      try {
        database = await performAction({status:feedback,name:'Saving edition relationship...',task:()=>saveManualMatchDecision(candidate, 'same-edition')});
        render();
      } catch (error) {
        feedback.textContent = `Could not save edition relationship: ${error.message}`;
      }
    }));
    actions.append(reviewButton('Different works', 'different', async () => {
      try {
        database = await performAction({status:feedback,name:'Saving edition relationship...',task:()=>saveManualMatchDecision(candidate, 'different')});
        render();
      } catch (error) {
        feedback.textContent = `Could not save edition relationship: ${error.message}`;
      }
    }));
  }
  node.append(actions,feedback);
  return node;
}

function renderDuplicateReview() {
  if(duplicateReviewDatabase!==database){duplicateReviewCandidates=findDuplicateCandidates(database.providerItems,database.manualMatchDecisions);duplicateReviewDatabase=database;}
  const candidates = duplicateReviewCandidates;
  const unresolved = candidates.filter((candidate) => !candidate.decision);
  const reviewed = candidates.filter((candidate) => candidate.decision);
  duplicateReviewSummary.textContent = unresolved.length
    ? `${unresolved.length} related product pair${unresolved.length === 1 ? '' : 's'} to review. A relationship decision does not confirm ownership.`
    : 'No related product pairs to review.';
  duplicateReviewItems.replaceChildren(...unresolved.map((candidate) => createReviewRow(candidate)));
  reviewedDuplicates.hidden = reviewed.length === 0;
  reviewedDuplicatesSummary.textContent = `${reviewed.length} saved product relationship${reviewed.length === 1 ? '' : 's'}`;
  reviewedDuplicateItems.replaceChildren(...reviewed.map((candidate) => createReviewRow(candidate, true)));
}

const companionConnectionStatuses=new Map();
async function renderCompanionExtensionLinks() {
  const official=builtinCompanions(chrome.runtime);
  document.querySelector('#official-companion-status').replaceChildren(...official.map(item=>{const row=document.createElement('li'),result=companionConnectionStatuses.get(item.id);row.textContent=item.name+': '+(result?.message||'Connection not checked yet. Use Check connections.');if(result){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Technical details';pre.textContent=JSON.stringify(result.details,null,2);pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';details.append(summary,pre);row.append(details);}return row;}));
  document.querySelector('#builtin-companion-identities').replaceChildren(...official.map(item=>{const row=document.createElement('li'),code=document.createElement('code');code.textContent=item.id;row.append(item.name+' ',code);return row;}));
  const ids = await getAllowedExternalClientIds();
  galacticExtensionId.textContent = chrome.runtime.id;
  companionExtensionId.value = '';
  companionExtensionLinkStatus.textContent = ids.length
    ? `${ids.length} additional ID${ids.length===1?'':'s'} saved. Built-in trust remains separate.`
    : 'No additional IDs saved. Official companions remain trusted.';
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
  if(otherRun){googleBooksEnrichmentStatus.textContent='Another Galactic Library tab is looking up book information. Pause the lookup there, or wait until it finishes. If that tab was closed, wait briefly and retry.';} else if (!key) {
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
  startGoogleBooksEnrichmentButton.disabled=true;resetGoogleBooksEnrichmentButton.disabled=true;
  googleBooksEnrichmentStatus.classList.add('operation-status');googleBooksEnrichmentStatus.setAttribute('aria-busy','true');
  googleBooksEnrichmentStatus.textContent='Preparing saved book lookup progress...';
  await afterFeedbackPaint();
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
        googleBooksEnrichmentStatus.textContent=googleBooksStatusText(job)+' Looking up “'+canonical.title+'”…';
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
    googleBooksRunning=false;googleBooksEnrichmentStatus.setAttribute('aria-busy','false');pauseGoogleBooksEnrichmentButton.hidden=true;await renderGoogleBooksEnrichment();
    if(lastError)googleBooksEnrichmentStatus.textContent='Google Books enrichment paused: '+lastError;
  }
}

function render(timing = null) {
  contentsWorkspace.setPageSize(workspace.pageSize);
  if(!database)return;
  libraryPaging.select.disabled=false;
  const draftState=drafts.reconcile();draftNotice.hidden=!draftState.dirty;
  if(draftState.dirty){draftMessage.textContent=draftState.stale?'Saved information changed. Your edits are retained; reload before saving.':'Your unsaved edits are retained. Finish them or discard to update this view.';contentsWorkspace.update(database,workspace.workspace==='contents');return;}
  let endContents=timing?.begin('options_contents');
  contentsWorkspace.update(database,workspace.workspace==='contents');endContents?.();
  let endSegment=timing?.begin('options_workbench');
  try {
  if(workspace.workspace==='providers')providerAccountsView.update(database);
  renderOnboarding(database);
  if(!enrichmentWorkbench){
    enrichmentWorkbench=createEnrichmentWorkbench({
      apply:async selections=>{database=await drafts.commit(()=>applyReviewedEnrichments(selections));googleBooksSearches.clear();openLibrarySearches.clear();},
      dismiss:async refs=>{database=await drafts.commit(()=>dismissEnrichmentReviews(refs));googleBooksSearches.clear();openLibrarySearches.clear();},
      undo:async refs=>{database=await drafts.commit(()=>undoEnrichmentSelections(refs));},
      confirmContents:async requests=>{const result=await drafts.commit(()=>confirmContentsSuggestions(requests));database=result.database;return result;},
      undoContents:async id=>{database=await drafts.commit(()=>removeContentReview(id));},
      retry:retryEnrichmentReview,inspect:inspectEnrichmentRecords,refresh:render
    });document.querySelector('#books-workspace').append(enrichmentWorkbench.element);
  }
  if(workspace.workspace==='books')enrichmentWorkbench.element.open=true;
  enrichmentWorkbench.update(database);
  endSegment?.();endSegment=timing?.begin('options_dashboards');
  const receiptWorkbench=createPurchaseEvidenceWorkbench(database,{
    save:async()=>{},import:async entries=>{database=await importPurchaseEvidence(entries);},retry:async()=>{database=await refreshPurchaseEvidence();},
    apply:async(...args)=>{database=await applyPurchaseEvidence(...args);},dismiss:async id=>{database=await dismissPurchaseEvidence(id);},refresh:render
  });
  const priorReceipts=document.querySelector('#purchase-evidence-workbench');receiptWorkbench.open=priorReceipts?.open??false;
  if(priorReceipts)priorReceipts.replaceWith(receiptWorkbench);else document.querySelector('#purchase-evidence-slot').append(receiptWorkbench);
  const syncDashboard=createSyncHealthView(database,{cancel:async(...args)=>{database=await cancelProviderScan(...args);},refresh:render});
  const priorSync=document.querySelector('#sync-health-dashboard');syncDashboard.open=priorSync?.open??false;
  if(priorSync)priorSync.replaceWith(syncDashboard);else document.querySelector('#providers-workspace').append(syncDashboard);
  const reminderDashboard=createRemindersView(database,{
    removeFeed:async clientId=>{await removeCompanionFeed(clientId);database=await getDatabase();},review:async(...args)=>{database=await saveReminderReview(...args);},refresh:render,inspect:ref=>openLibraryRecord(ref,{section:'library'}),
    requestPermission:()=>requestReminderPermissions(chrome),notificationSettings:getReminderNotificationSettings,notifications:saveReminderNotificationSettings,reviewSource:reviewCompanionSource
  });const priorReminders=document.querySelector('#entitlement-reminders');reminderDashboard.open=priorReminders?.open??false;
  if(priorReminders)priorReminders.replaceWith(reminderDashboard);else document.querySelector('#access-reminders-slot').append(reminderDashboard);
  const priorReading=document.querySelector('#reading-workbench');
  const readingWorkbench=createReadingWorkbench(database,{
    canLeave:()=>drafts.allowNavigation(),order:async(...args)=>{const result=await drafts.commit(()=>saveReadingOrder(...args));database=result.database;return result;},deleteOrder:async(...args)=>{database=await removeReadingOrder(...args);},refresh:render,inspect:ref=>openLibraryRecord(ref,{section:'library'})
  },priorReading?.dataset.selectedOrder??'');readingWorkbench.open=workspace.workspace==='reading'||(priorReading?.open??false);
  if(priorReading)priorReading.replaceWith(readingWorkbench);else document.querySelector('#reading-workspace').append(readingWorkbench);
  endSegment?.();endSegment=timing?.begin('options_filters');
  const providerEntries = Object.entries(combinedProviderStates(database)).sort(([left], [right]) => left.localeCompare(right));
  assumeAllOwned.checked=database.ownershipPolicy.allOwned;
  document.querySelector('#ownership-provider-help').textContent=assumeAllOwned.checked
    ? 'The global checkbox covers every library. Your provider choices below are saved and apply again when you switch it off.'
    : 'To apply this to one library, use its checkbox below.';
  populateProviderFilter(providerEntries);
  const endProjection=timing?.begin('options_projection');const browse=browseProjection(database);endProjection?.();
  const endFilters=timing?.begin('options_filter_controls');populateBrowseFilters(browse);endFilters?.();
  for(const field of Object.values(viewControls))if(field.dataset.pendingValue){field.value=field.dataset.pendingValue;if(!field.value)field.value='all';delete field.dataset.pendingValue;}
  providers.replaceChildren(...(providerEntries.length ? providerEntries.map(([id, state]) => {
    const node = document.createElement('article');
    node.className = 'provider';
    const providerParts = [];
    if (state.itemCount) providerParts.push(countLabel(state.itemCount,'game'));
    if (state.audiobookCount) providerParts.push(countLabel(state.audiobookCount,'audiobook'));
    if(state.softwareCount)providerParts.push(countLabel(state.softwareCount,'software product'));
    if (state.bookCount) providerParts.push(countLabel(state.bookCount,'book'));
    if (state.movieCount) providerParts.push(countLabel(state.movieCount,'movie'));
    if (state.tvCount) providerParts.push(countLabel(state.tvCount,'TV title'));
    if (state.addOnCount) providerParts.push(`${state.addOnCount} DLC`);
    if (!providerParts.length) providerParts.push('0 items');
    if (state.lastSync) providerParts.push(`synced ${formatDate(state.lastSync)}`);
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
  const addOnsByParent=new Map([...browse.addOnsByParent].map(([id,values])=>[id,values.map(value=>value.record)]));
  const linkedAddOnIds=browse.linkedAddOnIds;
  const query = search.value.trim().toLocaleLowerCase();
  const filters = selectedFilters();
  const result=libraryBrowseResults(browse,{query,filters,sort:librarySort.value,workspace:workspace.workspace,page:libraryPage,size:workspace.pageSize,anchor:browseAnchor,countAcquisitions:true});
  browseAnchor='';lastBrowseResult=result;libraryPage=result.page;
  for(const option of acquisitionsFilter.options){const n=Number(option.value);option.textContent=option.value==='all'?'All saved items':`Owned ${n}+ (${result.acquisitionThresholdCounts[n]})`;}
  const canonical=result.matches.map(row=>row.canonical);
  renderActiveFilters(filters);
  document.querySelector('#library-no-results').hidden=canonical.length>0||!Object.keys(database.providerItems).length;
  const visibleRecords=result.matches.flatMap(row=>row.qualifying);
  const types=new Map();for(const item of canonical)types.set(item.mediaType,(types.get(item.mediaType)??0)+1);
  const labels={game:'game',software:'software item',audiobook:'audiobook',book:'book',movie:'movie',tv:'TV title'};
  const counts=[...types].map(([type,count])=>count+' '+(labels[type]??type)+(count===1?'':'s'));
  const canShowAddOns=(filters.mediaType==='all'||filters.mediaType==='game')&&filters.dlc!=='without';
  const orphanValues=(workspace.workspace==='library'&&canShowAddOns&&['all','1'].includes(filters.acquisitions)?browse.addOns:[]).filter(value=>(filters.acquisitions==='all'||['owned','claimed'].includes(effectiveOwnershipRecord(value.record,database).ownership))&&!linkedAddOnIds.has(value.record.id)&&recordQualifies(value,filters,database)&&recordSearchRank(value,searchKey(query))!==null).sort((a,b)=>compareTitles(a.record.title,b.record.title));
  const visibleAddOnCount=canShowAddOns?new Set([...result.matches.flatMap(row=>row.addons),...orphanValues].map(value=>value.record.id)).size:0;
  const summaryText=result.total+' catalog '+(result.total===1?'item':'items')+(filtersAreActive(filters,query)?' matching search / filters':'')+'. '+counts.join(' / ')+(visibleRecords.length?' \u00b7 '+visibleRecords.length+' matching account records':'')+(visibleAddOnCount?' \u00b7 '+visibleAddOnCount+' DLC add-ons':'');
  if(summary.textContent!==summaryText)summary.textContent=summaryText;

  endSegment?.();endSegment=timing?.begin('options_cards');
  updateAccessSelection();
  libraryPaging.update({total:result.total,page:libraryPage,size:workspace.pageSize});
  libraryLayout.value=workspace.libraryLayout;
  items.replaceChildren(...result.rows.map((row) => {
    const canonicalItem=row.canonical;
    const node = document.createElement('li');
    const records = canonicalItem.providerItemIds.map((id) => database.providerItems[id]);
    node.dataset.recordRefs=JSON.stringify(records.map(record=>record.recordRef));
    const linkedAddOns = records.flatMap((record) => addOnsByParent.get(record.id) ?? []);
    node.className = 'library-item';
    mountLibraryRow(node,row,database,{layout:workspace.libraryLayout,expanded:expandedLibraryRows.has(canonicalItem.id),onToggle:open=>{open?expandedLibraryRows.add(canonicalItem.id):expandedLibraryRows.delete(canonicalItem.id);}},content=>{
    content.append(createLibraryResultSummary(row,database,{filtered:Object.entries(filters).some(([key,value])=>key!=='mediaType'&&value!==filterDefault(key)),information:filters.information,series:value=>{seriesFilter.value=value;search.value='';librarySort.value='series';viewChanged();}}));
    content.append(createAccessCardControls(row.qualifying.map(value=>value.record),database,{selected:selectedAccessRecords,onSelect:(record,checked)=>{if(checked&&selectedAccessRecords.size>=500){accessResult.textContent='Change up to 500 account copies at once.';return;}checked?selectedAccessRecords.set(record.recordRef,{provider:record.provider,profileId:record.profileId}):selectedAccessRecords.delete(record.recordRef);updateAccessSelection();},change:editAccess}));
    const details=document.createElement("details");details.className="item-details";details.dataset.canonicalId=canonicalItem.id;
    details.append(textElement("summary","Details"));
    const body=document.createElement("div");body.className="item-details-body";details.append(body);let built=false;
    const context=records.map(record=>itemDetailContexts.get(record.recordRef)).find(value=>value&&records.some(record=>record.recordRef===value.anchor))??{anchor:records[0].recordRef,sections:new Set(),open:false};
    for(const record of records)itemDetailContexts.set(record.recordRef,context);
    const build=()=>{if(built)return;built=true;
    let inspector;const identityInspector=()=>inspector??=createEvidenceInspector(canonicalItem,records,database,{split:async id=>{database=await separateEdition(id);},undoSplit:async ref=>{database=await undoEditionSeparation(ref);},save:async(candidate,decision,title)=>{database=await saveManualMatchDecision(candidate,decision,title);},preferredTitle:async(id,title)=>{database=await savePreferredDisplayTitle(id,title);},remove:async id=>{database=await removeManualMatchDecision(id);},refresh:render},{separateTechnical:true});
    body.append(createItemDetailsBody(canonicalItem,records,database,{
      reading:['book','audiobook'].includes(canonicalItem.mediaType)?()=>createReadingTools(records,database,{save:async(...args)=>{database=await drafts.commit(()=>saveReadingState(...args));},remove:async(...args)=>{database=await drafts.commit(()=>removeReadingState(...args));},refresh:render}):null,
      ownership:()=>createOwnershipReviewTools(records,database,{save:async(...args)=>{database=await drafts.commit(()=>saveOwnershipReview(...args));},remove:async(...args)=>{database=await drafts.commit(()=>removeOwnershipReview(...args));},refresh:render}),
      books:()=>{
        const root=document.createElement('div');
        const known=records.map(identityEvidence);const missing=[['authors','Creator'],['isbn','ISBN'],['edition','Edition'],['language','Language']].filter(([field])=>!known.some(value=>Array.isArray(value[field])?value[field].length:value[field])).map(([,label])=>label);
        if(missing.length)root.append(textElement('p','Not recorded: '+missing.join(', ')+'. You can still inspect this book.'));
        root.append(textElement('p','Find book details or review saved suggestions below.'),createGoogleBooksTools(canonicalItem,records,{enabled:true}));
        const open=createOpenLibraryTools(canonicalItem,records,{enabled:true});if(open)root.append(open);
        const local=createLocalMetadataTools(records,{queue:async review=>{database=await drafts.commit(()=>saveEnrichmentReview(review),local);},refresh:render});root.append(local);
        const review=createEnrichmentWorkbench({apply:async selections=>{database=await drafts.commit(()=>applyReviewedEnrichments(selections));googleBooksSearches.clear();openLibrarySearches.clear();},dismiss:async refs=>{database=await drafts.commit(()=>dismissEnrichmentReviews(refs));googleBooksSearches.clear();openLibrarySearches.clear();},undo:async refs=>{database=await drafts.commit(()=>undoEnrichmentSelections(refs));},retry:retryEnrichmentReview,refresh:render},{recordRefs:records.map(record=>record.recordRef),item:true});
        review.element.open=true;review.update(database);root.append(review.element,createEnrichmentEvidence(records,database,async ref=>{database=await undoEnrichmentSelection(ref);render();},context));
        return root;
      },
      matching:()=>identityInspector(),
      advanced:()=>{const root=document.createElement('div');root.append(identityInspector().technical,createTitleAliasTools(records,database,async(...args)=>{database=await drafts.commit(()=>saveTitleAliases(...args));render();}));
        if(canonicalItem.mediaType==='game')for(const record of records)root.append(createContentsEditor(record,database.contentReviews?.[record.id],contentsReviewActions));return root;
      },
      extras:()=>{const root=document.createElement('div');for(const create of [()=>createGenreTags(records),()=>createComicMangaCandidateTag(records)]){const value=create();if(value)root.append(value);}if(linkedAddOns.length)root.append(createAddOnList(linkedAddOns));return root;}
    },context));

    };
    details.addEventListener("toggle",()=>{if(!details.isConnected)return;context.open=details.open;if(details.open){selectedBrowseRef=context.anchor;build();}});
    if(context.open){details.open=true;build();}
    content.append(details);
    });
    return node;
  }));

  endSegment?.();endSegment=timing?.begin('options_reviews');
  unlinkedAddOnsSection.hidden=workspace.workspace!=='library'||!orphanValues.length;
  unlinkedPage=Math.max(0,Math.min(unlinkedPage,Math.max(0,Math.ceil(orphanValues.length/50)-1)));
  unlinkedAddOnsSummary.textContent='The provider did not return a parent game record for these add-ons. Showing '+(unlinkedPage*50+1)+'-'+Math.min((unlinkedPage+1)*50,orphanValues.length)+' of '+orphanValues.length+'.';
  document.querySelector('#unlinked-previous').disabled=unlinkedPage===0;
  document.querySelector('#unlinked-next').disabled=(unlinkedPage+1)*50>=orphanValues.length;
  document.querySelector('#unlinked-pagination').hidden=orphanValues.length<=50;
  unlinkedAddOns.replaceChildren(...orphanValues.slice(unlinkedPage*50,(unlinkedPage+1)*50).map(({record})=>{const node=document.createElement('li');node.append(textElement('strong',record.title),textElement('span',displayProviderName(record.provider)));return node;}));
  if(workspace.workspace==='ownership')renderDuplicateReview();
  let history=document.querySelector('#provider-history');
  if(!history){history=document.createElement('details');history.id='provider-history';document.querySelector('#providers-workspace').append(history);}
  const records=Object.values(database.providerHistory??{});
  history.replaceChildren(textElement('summary',`Earlier imports: ${records.length} records missing from the latest complete scan`));
  history.append(textElement('p','History preserves earlier purchase and access evidence. A missing record does not prove revocation. Earlier missing records may appear as Possible, never as confirmed current ownership.'));
  const list=document.createElement('ul');
  for(const entry of records.slice(0,50))list.append(textElement('li',`${entry.item.title} — ${displayProviderName(entry.item.provider)} — account ${entry.profileLabel||'nickname not recorded'} — ${entry.reason==='profile-switch'?'previous profile':'not observed in complete scan'} since ${entry.missingSince||'unknown'}; last observed ${entry.item.observedAt||'unknown'}.`));
  history.append(list);if(records.length>50)history.append(textElement('p',`Showing 50 of ${records.length}. All history is preserved in your backup.`));
  endSegment?.();endSegment=timing?.begin('options_coverage');
  renderCollectionCoverage();
  const alerts=document.querySelector('#library-alerts');alerts.replaceChildren();
  const bookCounts=bookReviewCounts(database),receiptCounts=receiptReviewCounts(database);
  const openBookQueue=value=>{if(workspace.select('books'))enrichmentWorkbench.showCategory(value);};
  if(bookCounts.attention)alerts.append(actionButton(bookCounts.attention+' book suggestions needing a decision',()=>openBookQueue('attention')));
  if(bookCounts.lookups)alerts.append(actionButton(countLabel(bookCounts.lookups,'lookup failure / no results','lookup failures / no results'),()=>openBookQueue('failed')));
  if(receiptCounts.attention)alerts.append(actionButton(receiptCounts.attention+' receipts ready to match',()=>{if(workspace.select('ownership')){const panel=document.querySelector('#purchase-evidence-workbench');panel.open=true;panel.dispatchEvent(new Event('toggle'));const filter=panel.querySelector('[aria-label="Receipt status"]');filter.value='ready';filter.dispatchEvent(new Event('change'));panel.querySelector('summary').focus();panel.scrollIntoView({block:'start'});}}));
  alerts.hidden=!alerts.children.length;
  } finally {endSegment?.();}
}

const optionsDiagnosticPrefix=crypto.randomUUID().replaceAll('-','').slice(0,12);let optionsDiagnosticSequence=0;
async function refreshView(context,diagnosticLookupId = null) {
  diagnosticLookupId??='lookup-'+optionsDiagnosticPrefix+'-'+String(++optionsDiagnosticSequence).padStart(3,'0');
  const timing=globalThis.GalacticContentsPerformance.trace(diagnosticLookupId,'options');
  const endTotal=timing?.begin('options_total');
  let endStage=timing?.begin('options_read');
  try {
  const {database:loadedDatabase,preferences,performance:workerTiming}=await getCommittedLibraryView(diagnosticLookupId);
  globalThis.GalacticContentsPerformance.merge(timing,workerTiming);
  database = loadedDatabase;
  downloadComixologyListButton.disabled = false;
  workspace.hydrate(preferences);
  comicCoverageStarts=preferences.comicCoverageStarts??{};comicCoverageTransitions=preferences.comicCoverageTransitions??{};comicCoverageMerges=preferences.comicCoverageMerges??{};comicCoverageNames=preferences.comicCoverageNames??{};
  if(!navigationHydrated&&globalThis.history?.state?.gl){restoringRoute=true;const saved=globalThis.history.state.gl;reviewOrigin=saved.origin??null;workspace.select(saved.workspace,{view:saved.view,history:false});restoringRoute=false;}
  navigationHydrated=true;
  endStage?.();endStage=timing?.begin('options_render');
  const endPaint=timing?.begin('options_feedback_paint');await context.phase('Preparing your Library view...');endPaint?.();
  render(timing);
  if(initialBookRoute){const route=initialBookRoute;initialBookRoute=null;visitBookRoute(route);}
  endStage?.();endStage=timing?.begin('options_other');
  await Promise.all([renderCompanionExtensionLinks(), renderGoogleBooksEnrichment()]);
  } finally {
    endStage?.();endTotal?.();
    if(timing)chrome.runtime.sendMessage({type:'GL_CONTENTS_UI_TIMING',timing:globalThis.GalacticContentsPerformance.clean(timing.finish('reparsed'))}).catch(()=>{});
  }
}

const libraryLoader=createLibraryLoader({panel:document.querySelector('#library-load-status'),message:document.querySelector('#library-load-status span'),retry:document.querySelector('#retry-library-load'),content:document.querySelector('#library-section'),load:refreshView});
const refresh=(...args)=>libraryLoader.refresh(...args);

const backupExporter=createBackupExporter({button:document.querySelector('#export'),status:backupStatus,read:async()=>({database:await getDatabase(),preferences:await getUiPreferences()}),prepare:value=>createBackup(value.database,value.preferences),canStart:()=>!backupRestore.saving&&!clearOperation.busy});
const exportCurrentBackup=()=>backupExporter.run();
document.querySelector('#export').addEventListener('click',()=>exportCurrentBackup().catch(()=>{}));

bindPerformanceDiagnostics({button:document.querySelector('#export-timing-summary'),status:document.querySelector('#performance-diagnostics-status'),worker:document.querySelector('#performance-diagnostics-worker'),runtime:chrome.runtime});

document.querySelector('label[for="import"]').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(!document.querySelector('#import').disabled)document.querySelector('#import').click();}});

document.querySelector('#backup-scope-help').textContent=BACKUP_SCOPE_HELP+' '+RESTORE_LOCAL_HELP;
document.querySelector('#clear-library-help').textContent=CLEAR_LIBRARY_HELP;
const backupRestore=bindBackupRestore({input:document.querySelector('#import'),status:backupStatus,parse:value=>({database:parseBackup(value),preferences:parseBackupPreferences(value)}),read:getDatabase,restore:value=>restoreDatabase(value.database,value.preferences),refresh:()=>libraryLoader.reload(),exportCurrent:exportCurrentBackup,canLeave:()=>drafts.allowNavigation(),criticalControls:[document.querySelector('#clear')]});

const clearOperation=createOperation({id:'library-clear',name:'Clearing local library...',status:backupStatus,controls:[document.querySelector('#clear'),document.querySelector('#import'),document.querySelector('#export')]});
document.querySelector('#clear').addEventListener('click', async () => {
  if(clearOperation.busy||backupRestore.busy||backupExporter.busy)return;
  if (!confirm(CLEAR_LIBRARY_WARNING)) return;
  clearOperation.run(async context=>{await clearDatabase();await context.phase('Reloading cleared Library...');try{await libraryLoader.reload();}catch(error){throw Error('Library cleared, but its view could not reload: '+error.message);}}, {success:'Local library cleared.'}).catch(()=>{});
});
downloadComixologyListButton.addEventListener('click', () => performAction({button:downloadComixologyListButton,status:backupStatus,name:'Preparing Comixology review list...',success:'Review list download handed to your browser.',task:() => {
  const blob = new Blob([comixologyReviewMarkdown(database.providerItems, 'Current Galactic Library')], { type: 'text/markdown' });
  handoffDownload(blob,'comixology-ownership-review.md');
}}).catch(()=>{}));
saveGoogleBooksApiKeyButton.addEventListener('click', async () => {
  try {
    await performAction({button:saveGoogleBooksApiKeyButton,status:document.querySelector('#book-service-status'),name:'Saving book service key...',task:async()=>{try{await saveGoogleBooksApiKey(googleBooksApiKey.value);}catch{throw Error('Could not save the Google Books key. Check the key and try again.');}}});
    googleBooksApiKey.value = '';
    document.querySelector('#book-service-status').textContent='Key saved in this browser.';
    await renderGoogleBooksEnrichment();
  } catch (error) {
    document.querySelector('#book-service-status').textContent='Could not save the Google Books key. Check the key and try again.';
  }
});
clearGoogleBooksApiKeyButton.addEventListener('click', async () => {
  try {
    googleBooksPauseRequested = true;
    await performAction({button:clearGoogleBooksApiKeyButton,status:document.querySelector('#book-service-status'),name:'Removing book service key...',task:async()=>{try{await saveGoogleBooksApiKey('');}catch{throw Error('Could not remove the Google Books key. Try again.');}}});
    document.querySelector('#book-service-status').textContent='Key removed.';
    googleBooksApiKey.value = '';
    await renderGoogleBooksEnrichment();
  } catch (error) {
    document.querySelector('#book-service-status').textContent='Could not remove the Google Books key. Try again.';
  }
});
startGoogleBooksEnrichmentButton.addEventListener('click', () => {
  runGoogleBooksEnrichment().catch(() => {});
});
pauseGoogleBooksEnrichmentButton.addEventListener('click', () => {
  googleBooksPauseRequested = true;
  googleBooksEnrichmentStatus.textContent = 'Pausing after the current book…';
});
const lookupResetOperation=createOperation({id:'lookup-queue-reset',name:'Checking saved lookup queue...',status:googleBooksEnrichmentStatus,controls:[resetGoogleBooksEnrichmentButton]});
resetGoogleBooksEnrichmentButton.addEventListener('click', () => lookupResetOperation.run(async context=>{
    const job=await getGoogleBooksEnrichmentJob();
    if(job&&job.cursor<job.queue.length){const decision=createConfirmation({title:'Clear saved lookup queue?',message:job.cursor+' of '+job.queue.length+' completed. This abandons the saved lookup position. Already saved book details stay.',confirmLabel:'Clear saved lookup queue'});if(!await decision.result)return {cancelled:true};const latest=await getGoogleBooksEnrichmentJob();if(JSON.stringify(latest)!==JSON.stringify(job))throw Error('Lookup progress changed. Review the current progress before clearing it.');}
    await context.phase('Clearing saved lookup position...');
    await clearGoogleBooksEnrichmentJob();
    await renderGoogleBooksEnrichment();
}, {success:result=>result?.cancelled?'Queue clearing cancelled. Saved progress is unchanged.':'Saved lookup position cleared; acquired metadata is retained.'}).catch(()=>{}));
document.querySelector('#check-companion-connections').addEventListener('click',async event=>{
  await performAction({button:event.currentTarget,status:companionExtensionLinkStatus,name:'Checking companion connections...',task:async()=>{await Promise.all(builtinCompanions(chrome.runtime).map(async item=>{const provider=item.role==='hb'?'humble':'fanatical';try{const value=await chrome.runtime.sendMessage({type:'GH_PURCHASE_ACTION',action:'connection',provider});companionConnectionStatuses.set(item.id,{message:value?.ok?'Connected. Purchase sharing is available. No purchases were transferred.':'Could not connect. Enable or update both extensions, then check the connection again.',details:value});}catch(error){companionConnectionStatuses.set(item.id,{message:'Could not connect. Enable or update both extensions, then check the connection again.',details:{error:error.message}});}}));await renderCompanionExtensionLinks();},success:'Connection checks completed; see each companion result.'}).catch(()=>{});
});
document.querySelector('#add-companion-extension-id').addEventListener('click', async () => {
  const id = companionExtensionId.value.trim();
  if (!isExtensionId(id)) {
    companionExtensionLinkStatus.textContent = 'Enter a valid Chrome extension ID or Firefox add-on ID.';
    return;
  }
  if(companionBrowser(chrome.runtime)==='chrome'&&!/^[a-p]{32}$/u.test(id)){companionExtensionLinkStatus.textContent='This is a Firefox add-on ID. Existing entries are preserved; add a Chrome ID for this browser.';return;}
  try {
    await performAction({button:document.querySelector('#add-companion-extension-id'),status:companionExtensionLinkStatus,name:'Saving companion link...',task:()=>addAllowedExternalClientId(id)});
    await renderCompanionExtensionLinks();
  } catch (error) {
    companionExtensionLinkStatus.textContent = `Could not save the allowed extension: ${error.message}`;
  }
});
document.querySelector('#clear-companion-extension-ids').addEventListener('click', async () => {
  try {
    await performAction({button:document.querySelector('#clear-companion-extension-ids'),status:companionExtensionLinkStatus,name:'Removing additional companion IDs...',task:()=>saveAllowedExternalClientIds([])});
    await renderCompanionExtensionLinks();
    companionExtensionLinkStatus.textContent = 'Additional IDs removed. Official companions remain trusted.';
  } catch (error) {
    companionExtensionLinkStatus.textContent = `Could not remove companion extensions: ${error.message}`;
  }
});
const viewChanged=()=>{if(!drafts.allowNavigation()){const view=workspace.savedView;search.value=view.search;librarySort.value=view.sort;for(const [key,field]of Object.entries(viewControls))field.value=view[key]??filterDefault(key);return;}browseAnchor='';libraryPage=0;unlinkedPage=0;render();workspace.rememberView();};
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
for(const field of [...Object.values(viewControls),librarySort])field.addEventListener('change',viewChanged);
libraryLayout.addEventListener('change',()=>{if(!drafts.allowNavigation()){libraryLayout.value=workspace.libraryLayout;return;}workspace.setLibraryLayout(libraryLayout.value);});
clearFilters.addEventListener('click', () => {
  search.value='';for(const [key,field]of Object.entries(viewControls)){field.value=filterDefault(key);delete field.dataset.pendingValue;}viewChanged();
});
document.querySelector('#unlinked-previous').addEventListener('click',()=>{unlinkedPage--;render();});
document.querySelector('#unlinked-next').addEventListener('click',()=>{unlinkedPage++;render();});
document.querySelector('#clear-empty-library-filters').addEventListener('click',()=>clearFilters.click());
let coverageView=location.hash.startsWith('#overlap')?'overlap':'series';
function renderCollectionCoverage(){
  document.querySelector('#comic-coverage-view').hidden=coverageView!=='series';
  document.querySelector('#overlap-workspace').hidden=coverageView!=='overlap';
  for(const button of document.querySelectorAll('[data-coverage-view]'))button.setAttribute('aria-pressed',String(button.dataset.coverageView===coverageView));
  if(database&&workspace.workspace==='comic-coverage'&&coverageView==='series'&&comicCoverageDatabase!==database){
    document.querySelector('#comic-coverage-view .comic-coverage')?.captureState?.();
    document.querySelector('#comic-coverage-view').replaceChildren(createComicCoverageView(database,{state:comicCoverageBrowseState,resolutionActions:coverageResolutionActions,starts:comicCoverageStarts,transitions:comicCoverageTransitions,names:comicCoverageNames,saveName:async(key,value)=>{const prefs=await saveUiPreferences({comicCoverageNames:{[key]:value}});comicCoverageNames=prefs.comicCoverageNames;return comicCoverageNames;},saveTransitions:async(key,value)=>{const prefs=await saveUiPreferences({comicCoverageTransitions:{[key]:value}});comicCoverageTransitions=prefs.comicCoverageTransitions;return comicCoverageTransitions;},merges:comicCoverageMerges,saveMerge:async(source,target,title,continuity)=>{const prefs=await saveComicCoverageMerge(source,target,title,continuity);comicCoverageMerges=prefs.comicCoverageMerges;comicCoverageNames=prefs.comicCoverageNames;return comicCoverageMerges;},undoMerge:async id=>{const prefs=await removeComicCoverageMerge(id);comicCoverageMerges=prefs.comicCoverageMerges;comicCoverageNames=prefs.comicCoverageNames;return comicCoverageMerges;},openRecord:(ref,options)=>openLibraryRecord(ref,options),saveStart:async(key,value)=>{const preferences=await saveUiPreferences({comicCoverageStarts:{[key]:value}});comicCoverageStarts=preferences.comicCoverageStarts;return comicCoverageStarts;}}));comicCoverageDatabase=database;
  }
  if(database&&workspace.workspace==='comic-coverage'&&coverageView==='overlap'&&overlapDatabase!==database){
    document.querySelector('#collection-overlap-view').replaceChildren(createCollectionOverlapView(database,{state:comicCoverageBrowseState.overlap??(comicCoverageBrowseState.overlap={}),openRecord:ref=>openLibraryRecord(ref)}));overlapDatabase=database;
  }
  if(!database||workspace.workspace!=='comparisons'||coverageDatabase===database)return;
  document.querySelector('#series-coverage-view').replaceChildren(createSeriesCoverageView(database,{state:comparisonViewState,openRecord:ref=>openLibraryRecord(ref,{returnToOrigin:true})}));coverageDatabase=database;
}
document.querySelector('#comic-coverage-navigation').addEventListener('click',event=>{const button=event.target.closest('[data-coverage-view]');if(button){coverageView=button.dataset.coverageView;renderCollectionCoverage();}});

const contentsScanProgress=createContentsScanProgress({runtime:chrome.runtime,container:document.querySelector('#contents-progress-slot'),reconcile:()=>refresh(recentContentsDiagnosticId())});
let contentsDiagnosticId=null,contentsDiagnosticExpires=0;
const recentContentsDiagnosticId=()=>{const id=Date.now()<contentsDiagnosticExpires?contentsDiagnosticId:null;contentsDiagnosticId=null;return id;};
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && [DATABASE_STORAGE_KEY,OBSERVATION_KEY,OBSERVATION_HEAD_KEY].some(key=>Object.hasOwn(changes,key))) {backupRestore.changed();contentsScanProgress.changed();}
  else if(areaName==='local'&&(changes.galacticLibraryProviderScans||changes.galacticLibraryProviderChecks)&&workspace.workspace==='providers')contentsScanProgress.changed();
  if(areaName==='local'&&changes.galacticLibraryProviderChecks)backupRestore.changed();
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
  if(sender.id===chrome.runtime.id&&message?.type===PRIVATE_STORAGE_CHANGED&&Array.isArray(message.keys)){
    if([DATABASE_STORAGE_KEY,OBSERVATION_KEY,OBSERVATION_HEAD_KEY].some(key=>message.keys.includes(key))){backupRestore.changed();contentsScanProgress.changed();}
    else if(message.keys.some(key=>['galacticLibraryProviderScans','galacticLibraryProviderChecks'].includes(key))&&workspace.workspace==='providers')contentsScanProgress.changed();
    if(message.keys.includes('galacticLibraryProviderChecks'))backupRestore.changed();
    if(message.keys.includes(SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY)){showEnrichmentActions.checked=workspace.workspace==='books';if(database)render();}
    if(!googleBooksRunning&&(message.keys.includes(GOOGLE_BOOKS_API_KEY_STORAGE_KEY)||message.keys.includes(GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY)))renderGoogleBooksEnrichment().catch(()=>{});
  }
  return false;
});
contentsScanProgress.initialize();
const loadLibrary=()=>refresh().catch(()=>{});
document.querySelector('#retry-library-load').addEventListener('click',loadLibrary);
loadLibrary();

document.querySelector('#copy-galactic-extension-id').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(chrome.runtime.id);companionExtensionLinkStatus.textContent='Galactic Library ID copied.';}catch{companionExtensionLinkStatus.textContent='Copy the Galactic Library ID shown above into the companion settings.';}});

document.addEventListener('gh-purchase-open',event=>{if(['humble','fanatical'].includes(event.detail?.provider))workspace.select('providers');});

const providerDiagnosticsCheckbox=document.querySelector('#enable-provider-diagnostics');
const providerDiagnosticsStatus=document.querySelector('#provider-diagnostics-setting-status');
getProviderDiagnosticsEnabled().then(enabled=>{providerDiagnosticsCheckbox.checked=enabled;providerDiagnosticsCheckbox.disabled=false;}).catch(()=>{providerDiagnosticsStatus.textContent='Could not load the troubleshooting setting. Reload GL to try again.';});
providerDiagnosticsCheckbox.addEventListener('change',async()=>{const enabled=providerDiagnosticsCheckbox.checked;providerDiagnosticsCheckbox.disabled=true;try{await saveProviderDiagnosticsEnabled(enabled);providerDiagnosticsStatus.textContent='Saved. Reopen or reload provider pages to apply this setting.';}catch{providerDiagnosticsCheckbox.checked=!enabled;providerDiagnosticsStatus.textContent='Could not save the setting. Your previous choice was kept.';}finally{providerDiagnosticsCheckbox.disabled=false;}});
