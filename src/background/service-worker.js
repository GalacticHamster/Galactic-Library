import {purchaseAccounts} from './purchase-handoff.js';
import {createPurchaseHandoff} from './purchase-handoff.js';
import {allowedCompanionOperation} from '../lib/companion-identities.js';
import {createAppearanceService} from './appearance.js';
import '../lib/kindle-contents-scan.js';
import {reconcileReminderNotifications,REMINDER_ALARM} from './reminder-notifier.js';
import { readFanaticalOrdersInPage } from '../providers/fanatical-scan.js';
import { matchItems } from '../lib/matcher.js';
import { handleExternalApiRequestAsync } from '../lib/external-api.js';
import '../providers/metadata.js';
import { googleBooksCandidatesFromSearch, googleBooksSearchUrl } from '../lib/google-books.js';
import { openLibraryCandidatesFromSearch, openLibrarySearchUrl } from '../lib/open-library.js';
import {kindleContentsPlan} from '../lib/kindle-contents.js';
import { createStorageWriter } from './storage-writer.js';
import { createStorageMessageHandler } from './storage-messages.js';
import { completeProviderSnapshot, completedScope } from '../lib/provider-snapshot.js';
import { restrictStorageAccess } from './storage-access.js';
import { validateFandangoState } from './import-state.js';
import {openLibraryEditionUrl,openLibraryEditionCandidate} from '../lib/open-library-edition.js';
import {validatePurchaseOrigins,mergePurchaseOrigins} from '../lib/purchase-origins.js';
import {libraryStorageArea,PRIVATE_STORAGE_CHANGED} from './private-storage.js';
import {createQueryDiagnostics,diagnosticStorageKey} from '../lib/query-diagnostics.js';
import {committedSnapshotSequence} from '../lib/committed-snapshot.js';
import {createWorkerLifecycleDiagnostics} from '../lib/worker-lifecycle-diagnostics.js';

let workerLifecycle,purchaseSync;
const queryDiagnostics=createQueryDiagnostics({onActivity:(stage,details)=>workerLifecycle?.observe(details.operation??stage)});

const privateArea=libraryStorageArea(chrome,globalThis.indexedDB,keys=>{
  // Only key names cross this channel. Library records/API keys never do.
  chrome.runtime.sendMessage({type:PRIVATE_STORAGE_CHANGED,keys}).catch(()=>{});
  if(keys.includes('galacticLibraryDatabase')||keys.includes('galacticLibraryKindleContentsRefresh'))storageWriter.invalidateRefreshPreflight();
  if(keys.includes('galacticLibraryDatabase')){storageWriter.invalidateQuerySnapshot(undefined,'private-observer');observePurchaseSync().catch(()=>{});}
  if(keys.includes('galacticLibraryReminderNotifications'))reconcileReminders();
});
const storageReady = restrictStorageAccess(chrome.storage,chrome.runtime,privateArea);
// Operations report initialization errors through their normal response channel.
storageReady.catch(() => {});
workerLifecycle=createWorkerLifecycleDiagnostics({area:chrome.storage.session,ready:storageReady,worker:queryDiagnostics.worker,startedEpochMs:queryDiagnostics.startedEpochMs});
const observesPrivateChanges=chrome.runtime.getURL('').startsWith('moz-extension://')||typeof chrome.storage.onChanged?.addListener==='function';
const storageWriter = createStorageWriter(privateArea, storageReady,{cacheRefreshPreflight:observesPrivateChanges,cacheQuerySnapshots:observesPrivateChanges,diagnostics:queryDiagnostics,certificateArea:chrome.storage.session,importSessionArea:chrome.storage.session});
const appearanceService=createAppearanceService(privateArea,storageWriter,chrome.runtime,storageReady);
globalThis.GalacticHamsterTheme.register(appearanceService,chrome.runtime);
const purchaseHandoff=createPurchaseHandoff({runtime:chrome.runtime,area:privateArea,writer:storageWriter});purchaseHandoff.register();
purchaseSync=chrome.alarms?GalacticPurchaseSync.createCoordinator({runtime:chrome.runtime,area:privateArea,alarms:chrome.alarms,service:purchaseHandoff,role:'gl',ensureAccount:provider=>storageWriter.ensurePurchaseAccount(provider),catalog:async provider=>(await purchaseAccounts(await storageWriter.getQueryDatabase(),provider)).map(a=>({...a,stableId:a.accountRef})),busy:async provider=>Boolean((await privateArea.get({galacticLibraryProviderScans:{}})).galacticLibraryProviderScans[provider]),onActive:async()=>{purchaseSyncActive=true;await observePurchaseSync(undefined,true);}}):null;
purchaseSync?.register();
let purchaseSignatures={},purchaseSyncActive=false;
async function observePurchaseSync(database,initialize=false){
 if(!purchaseSync||!purchaseSyncActive)return;const db=database??await storageWriter.getQueryDatabase();
 for(const provider of ['humble','fanatical']){
  const signature=GalacticPurchaseSync.stable(GalacticPurchaseSync.meaningful({profiles:Object.values(db.providerProfiles).filter(p=>p.provider===provider).map(p=>({profileId:p.profileId,keySpace:p.keySpace})),items:Object.values(db.providerItems).filter(i=>i.provider===provider)}));
  const previous=purchaseSignatures[provider];purchaseSignatures[provider]=signature;if(!initialize&&previous!==undefined&&signature!==previous)await purchaseSync.mark(provider);
 }
}
const { getDatabase, getGoogleBooksApiKey, mergeProviderItems, replaceProviderItems, saveKindleComicContents } = storageWriter;
chrome.runtime.onMessage.addListener(createStorageMessageHandler(storageWriter, chrome.runtime));
const contentsPerformance=globalThis.GalacticContentsPerformance;
const contentsUiTimings=contentsPerformance.collector();
const companionTimings=contentsPerformance.collector();
const providerTimings=contentsPerformance.collector();
let providerDiagnosticSequence=100;
function providerTiming(request){
  if(request.provider!=='kobo'&&request.type!=='GET_PROVIDER_PROFILE')return null;
  const sent=request.diagnosticSentEpochMs,entered=contentsPerformance.now(),hasSenderTime=Number.isFinite(sent)&&sent<=entered&&entered-sent<=60000;
  const timing=contentsPerformance.trace(contentsPerformance.validId(request.diagnosticLookupId)?request.diagnosticLookupId:`lookup-${companionDiagnosticPrefix}-${providerDiagnosticSequence++}`,'provider',undefined,hasSenderTime?sent:null);
  timing.providerPhase=request.type==='GET_PROVIDER_PROFILE_HINT'?'hint':request.type==='GET_PROVIDER_PROFILE'?'profile':request.beginScan?'start':'finish';
  timing.provider=request.provider;
  if(hasSenderTime)timing.events.push({stage:'handler_delay',attempt:0,startMs:0,durationMs:entered-sent});
  return timing;
}
function providerResponse(timing,sendResponse,value){
  if(timing){providerTimings.add(timing.finish(value.ok?'prepared':'failed'));value={...value,performance:contentsPerformance.clean(timing)};}
  sendResponse(value);
}
const companionCallbacks=new Map();
let contentsDiagnosticUntil=0,companionDiagnosticSequence=0;
const companionDiagnosticPrefix=crypto.randomUUID().replace(/-/gu,'').slice(0,12);
const contentsProgressHub=globalThis.GalacticContentsScan.progressHub();
const broadcastContentsProgress=()=>chrome.runtime.sendMessage({type:'GL_KINDLE_CONTENTS_PROGRESS',runs:contentsProgressHub.list()}).catch(()=>{});
chrome.tabs?.onRemoved?.addListener(tabId=>{storageWriter.interruptKindleContentsRefresh(tabId).catch(()=>{});if(contentsProgressHub.hasActive(tabId)){contentsProgressHub.interrupt(tabId);broadcastContentsProgress();}});
chrome.tabs?.onUpdated?.addListener((tabId,change)=>{if(change.status==='loading'){storageWriter.interruptKindleContentsRefresh(tabId).catch(()=>{});if(contentsProgressHub.hasActive(tabId)){contentsProgressHub.interrupt(tabId);broadcastContentsProgress();}}});
chrome.runtime.onStartup?.addListener(()=>{workerLifecycle.platformEvent('onStartup');storageWriter.interruptKindleContentsRefresh().catch(()=>{});});
function contentsTiming(request,kind){
  const timing=contentsPerformance.trace(request?.diagnosticLookupId,kind);
  if(timing)contentsDiagnosticUntil=contentsPerformance.now()+60000;
  if(timing)timing.onWrite=()=>chrome.runtime.sendMessage({type:'GL_CONTENTS_TIMING_START',diagnosticLookupId:timing.id}).catch(()=>{});
  return timing;
}
function timedContentsResponse(timing,sendResponse,value){
  if(timing){timing.finish();value={...value,performance:contentsPerformance.clean(timing)};}
  sendResponse(value);
}

const reconcileReminders=(notify=false)=>reconcileReminderNotifications(storageWriter,chrome,notify).catch(()=>{});
let reminderAlarmRegistered=false,reminderClickRegistered=false;
function registerReminderEvents(){
  if(chrome.alarms?.onAlarm&&!reminderAlarmRegistered){chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===REMINDER_ALARM)reconcileReminders(true);});reminderAlarmRegistered=true;}
  if(chrome.notifications?.onClicked&&!reminderClickRegistered){chrome.notifications.onClicked.addListener(id=>{if(id==='galactic-library-reminder')chrome.runtime.openOptionsPage().catch(()=>{});});reminderClickRegistered=true;}
}
registerReminderEvents();
chrome.permissions?.onAdded?.addListener(()=>{registerReminderEvents();reconcileReminders();});
chrome.permissions?.onRemoved?.addListener(()=>reconcileReminders());
chrome.storage.onChanged?.addListener((changes,area)=>{
  if(area==='local')for(const key of Object.keys(changes).slice(0,16))queryDiagnostics.event('storage_change',{key:diagnosticStorageKey(key),source:'observer'});
  if(area==='local'&&(changes.galacticLibraryDatabase||changes.galacticLibraryKindleContentsRefresh))storageWriter.invalidateRefreshPreflight();
  if(area==='local'&&changes.galacticLibraryDatabase){storageWriter.invalidateQuerySnapshot(changes.galacticLibraryDatabase.newValue);observePurchaseSync(changes.galacticLibraryDatabase.newValue).catch(()=>{});}
  if(area==='local'&&changes.galacticLibraryReminderNotifications&&changes.galacticLibraryReminderNotifications.oldValue?.enabled!==changes.galacticLibraryReminderNotifications.newValue?.enabled)reconcileReminders();
});
chrome.runtime.onStartup?.addListener(()=>reconcileReminders());
if(chrome.permissions)reconcileReminders();
chrome.runtime.onInstalled.addListener((details) => {
  workerLifecycle.platformEvent('onInstalled',details?.reason);
  chrome.runtime.openOptionsPage().catch(() => {});
});

function isProviderImportPage(provider, url) {
  try {
    const page = new URL(url);
    return (provider === 'steam' && page.origin === 'https://store.steampowered.com')
      || (provider === 'gog' && page.origin === 'https://www.gog.com')
      || (provider === 'epic' && page.origin === 'https://store.epicgames.com')
      || (provider === 'amazon-games' && ((page.origin === 'https://gaming.amazon.com' && page.pathname.startsWith('/my-collection')) || (page.origin === 'https://luna.amazon.com' && page.pathname.startsWith('/claims/my-collection'))))
      || (provider === 'audible' && page.origin === 'https://www.audible.com')
      || (provider === 'kindle' && page.origin === 'https://www.amazon.com')
      || (provider === 'amazon-video' && page.origin === 'https://www.amazon.com' && page.pathname.includes('/gp/video/'))
      || (provider === 'fandango-at-home' && page.origin === 'https://athome.fandango.com')
      || (provider === 'kobo' && page.origin === 'https://www.kobo.com' && page.pathname.includes('/library'))
      || (provider === 'fanatical' && page.origin === 'https://www.fanatical.com' && /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?orders\/?$/iu.test(page.pathname))
      || (provider === 'humble' && page.origin === 'https://www.humblebundle.com' && page.pathname.startsWith('/home/purchases'));
  } catch {
    return false;
  }
}

function isFandangoPage(url) {
  try {
    return new URL(url).origin === 'https://athome.fandango.com';
  } catch {
    return false;
  }
}

function fandangoImportKey(sender) {
  return sender.tab?.id === undefined ? '' : `fandango-import-${sender.tab.id}`;
}

function isOwnExtensionPage(url) {
  return typeof url === 'string' && url.startsWith(chrome.runtime.getURL(''));
}

function isKnownProvider(provider) {
  return ['steam', 'gog', 'epic', 'amazon-games', 'audible', 'kindle', 'amazon-video', 'fandango-at-home', 'kobo', 'fanatical', 'humble'].includes(provider);
}

function humbleSyncState(value) {
  const knownPurchaseIds = [...new Set((Array.isArray(value?.knownPurchaseIds) ? value.knownPurchaseIds : [])
    .map((id) => String(id ?? '').trim())
    .filter((id) => id.length > 0 && id.length <= 256))].slice(0, 50000);
  return { knownPurchaseIds };
}

function fanaticalSyncState(value) {
  const knownOrderFingerprints = [...new Set((Array.isArray(value?.knownOrderFingerprints) ? value.knownOrderFingerprints : [])
    .map((fingerprint) => String(fingerprint ?? '').toLocaleLowerCase())
    .filter((fingerprint) => /^[a-f0-9]{64}$/u.test(fingerprint)))].slice(0, 50000);
  return { knownOrderFingerprints };
}

// This function is serialized into Fanatical's MAIN world. It is the only
// code allowed to read the signed-in page's session token, and returns a
// strict ownership projection rather than a token or raw order response.
function sanitizeFanaticalProjection(value, {fullScan=false,knownOrderFingerprints:known=[]}={}) {
  const input = value && typeof value === 'object' ? value : {};
  const coverage=input.coverage;const count=value=>Number.isSafeInteger(value)&&value>=0;
  if (input.schemaVersion!==1||!Array.isArray(input.items)||input.items.length>50000||coverage?.complete!==true
    ||!count(input.ordersScanned)||!count(input.ordersAvailable)||!count(coverage.listedOrders)||coverage.listedOrders>100000
    ||coverage.listedOrders<input.ordersAvailable||coverage.validatedOrders!==input.ordersScanned
    ||coverage.emptyAccount!==(coverage.listedOrders===0)||!count(coverage.pagesFetched)||coverage.pagesFetched<1||coverage.pagesFetched>1000
    ||!count(coverage.retries)||coverage.concurrency!==3||!['array-only','link','count','range'].includes(coverage.paginationEvidence)
    ||coverage.expectedTotal!==null&&(!count(coverage.expectedTotal)||coverage.expectedTotal!==coverage.listedOrders)
    ||['count','range'].includes(coverage.paginationEvidence)!==(coverage.expectedTotal!==null)
    ||coverage.paginationEvidence==='array-only'&&coverage.pagesFetched!==1||coverage.paginationEvidence==='link'&&coverage.pagesFetched<2)throw new Error('Fanatical did not return a complete validated order projection.');
  const knownOrderFingerprints = fanaticalSyncState({ knownOrderFingerprints: input.orderFingerprints }).knownOrderFingerprints;
  if(!Array.isArray(input.orderFingerprints)||input.orderFingerprints.length!==input.ordersAvailable
    ||knownOrderFingerprints.length!==input.ordersAvailable
    ||input.ordersScanned!==(fullScan?input.ordersAvailable:knownOrderFingerprints.filter(id=>!known.includes(id)).length))throw new Error('Fanatical returned inconsistent order coverage.');
  const items = [];
  for (const candidate of Array.isArray(input.items) ? input.items : []) {
    const sourceItemId = String(candidate?.sourceItemId ?? '').trim();
    const title = String(candidate?.title ?? '').trim().slice(0, 500);
    const mediaType = ['game', 'book', 'audiobook','software'].includes(candidate?.mediaType) ? candidate.mediaType : '';
    if (!/^[a-zA-Z0-9_-]{6,128}$/u.test(sourceItemId) || !title) throw new Error('Fanatical returned an unreadable projected product.');
    if(!mediaType)continue;
    const safeList = (entries) => [...new Set((Array.isArray(entries) ? entries : []).map((entry) => String(entry ?? '').trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
    const safeText = (entry, max = 300) => String(entry ?? '').trim().slice(0, max);
    const steamAppId = /^\d{1,16}$/u.test(String(candidate?.externalIds?.steamAppId ?? '')) ? String(candidate.externalIds.steamAppId) : '';
    const isbn = /^[0-9X]{10,17}$/iu.test(String(candidate?.externalIds?.isbn ?? '')) ? String(candidate.externalIds.isbn).toUpperCase() : '';
    items.push({
      sourceItemId, title, mediaType, slug: safeText(candidate?.slug),
      externalIds: { ...(steamAppId ? { steamAppId } : {}), ...(isbn ? { isbn } : {}) },
      bibliographic: globalThis.GalacticProviderMetadata.extract(candidate),
      drm: safeList(candidate?.drm), platforms: safeList(candidate?.platforms), formats: safeList(candidate?.formats),
      bundle: { sourceItemId: /^[a-zA-Z0-9_-]{6,128}$/u.test(String(candidate?.bundle?.sourceItemId ?? '')) ? String(candidate.bundle.sourceItemId) : '', title: safeText(candidate?.bundle?.title, 500), slug: safeText(candidate?.bundle?.slug) },
      purchaseDate: typeof candidate?.purchaseDate === 'string' && !Number.isNaN(Date.parse(candidate.purchaseDate)) ? candidate.purchaseDate : null
      ,...(candidate?.purchaseOrigins!==undefined?{purchaseOrigins:validatePurchaseOrigins(candidate.purchaseOrigins)}:{})
    });
  }
  return {
    ordersScanned: Math.max(0, Math.floor(Number(input.ordersScanned) || 0)),
    ordersAvailable: Math.max(0, Math.floor(Number(input.ordersAvailable) || 0)),
    orderFingerprints: knownOrderFingerprints,
    coverage:{complete:true,listedOrders:coverage.listedOrders,pagesFetched:coverage.pagesFetched,expectedTotal:coverage.expectedTotal,paginationEvidence:coverage.paginationEvidence,retries:coverage.retries,concurrency:3},
    items: [...items.reduce((map,item)=>{const prior=map.get(item.sourceItemId);map.set(item.sourceItemId,{...item,...(item.purchaseOrigins||prior?.purchaseOrigins?{purchaseOrigins:mergePurchaseOrigins(prior?.purchaseOrigins??[],item.purchaseOrigins??[])}:{})});return map;},new Map()).values()],
    snapshot: fullScan ? completeProviderSnapshot('fanatical', items.map((item) => ({ providerItemId: item.sourceItemId })), [completedScope('orders', input.ordersScanned, input.ordersAvailable, 'index-complete', coverage.pagesFetched)]) : undefined
  };
}

async function searchOpenLibrary(query) {
  const title = String(query?.title ?? '').trim();
  if (!title) throw new Error('Choose a book with a title before searching Open Library.');
  return openLibraryCandidatesFromSearch(await enrichmentJson(openLibrarySearchUrl({ title, authors: query?.authors, isbn: query?.isbn }), 'Open Library'));
}

let enrichmentRequests=Promise.resolve();let lastEnrichmentRequest=0;
function enrichmentJson(url,label){
  const result=enrichmentRequests.then(async()=>{
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,1200-(Date.now()-lastEnrichmentRequest))));lastEnrichmentRequest=Date.now();
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(`${label} returned ${response.status}.`);return await response.json();}
    catch(error){if(controller.signal.aborted)throw new Error(`${label} lookup timed out. Try again later.`);throw error;}
    finally{clearTimeout(timer);}
  });enrichmentRequests=result.catch(()=>{});return result;
}

async function searchGoogleBooks(query) {
  const title = String(query?.title ?? '').trim();
  const apiKey = await getGoogleBooksApiKey();
  if (!title) throw new Error('Choose a book with a title before searching Google Books.');
  if (!apiKey) throw new Error('Save your Google Books API key before starting enrichment.');
  const body=await enrichmentJson(googleBooksSearchUrl({...query,title,apiKey}), 'Google Books');
  return googleBooksCandidatesFromSearch(body);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ok:false,error:'Library operations are accepted only from Galactic Library.'});
    return undefined;
  }
  if(request?.type==='KINDLE_CONTENTS_SCAN_PROGRESS'){
    if(!isProviderImportPage('kindle',sender.url)){sendResponse({ok:false});return undefined;}
    try{const runs=contentsProgressHub.accept(sender.tab?.id,request.progress);chrome.runtime.sendMessage({type:'GL_KINDLE_CONTENTS_PROGRESS',runs}).catch(()=>{});sendResponse({ok:true});}
    catch(error){sendResponse({ok:false,error:error.message});}return undefined;
  }
  if(request?.type==='GET_KINDLE_CONTENTS_SCAN_PROGRESS'){
    if(!isOwnExtensionPage(sender.url)){sendResponse({ok:false});return undefined;}
    sendResponse({ok:true,runs:contentsProgressHub.list()});return undefined;
  }
  if(request?.type==='GL_CONTENTS_UI_TIMING'){
    if(isOwnExtensionPage(sender.url)){const clean=contentsPerformance.clean(request.timing);if(clean?.kind==='options'){contentsUiTimings.add(clean);workerLifecycle.observe('options_timing_received');}}
    sendResponse({ok:true});return undefined;
  }
  if(request?.type==='GET_KINDLE_CONTENTS_UI_TIMINGS'){
    if(!isProviderImportPage('kindle',sender.url)&&!isOwnExtensionPage(sender.url)){sendResponse({ok:false});return undefined;}
    workerLifecycle.observe('diagnostics_export');
    workerLifecycle.report().then(lifecycle=>sendResponse({ok:true,records:contentsUiTimings.report().records.map(contentsPerformance.clean),companions:companionTimings.report().records.map(contentsPerformance.clean),providers:providerTimings.report().records.map(contentsPerformance.clean),activity:queryDiagnostics.report(),lifecycle}));return true;
  }
  if (request?.type === 'SEARCH_GOOGLE_BOOKS') {
    if (!isOwnExtensionPage(sender.url)) {
      sendResponse({ ok: false, error: 'Google Books searches are accepted only from Galactic Library.' });
      return undefined;
    }
    searchGoogleBooks(request.query)
      .then((candidates) => sendResponse({ ok: true, candidates }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.type === 'SEARCH_OPEN_LIBRARY') {
    if (!isOwnExtensionPage(sender.url)) {
      sendResponse({ ok: false, error: 'Open Library searches are accepted only from Galactic Library.' });
      return undefined;
    }
    searchOpenLibrary(request.query)
      .then((candidates) => sendResponse({ ok: true, candidates }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if(request?.type==='SEARCH_OPEN_LIBRARY_EDITION'){
    if(!isOwnExtensionPage(sender.url)){sendResponse({ok:false,error:'Edition lookup is available only from Galactic Library.'});return undefined;}
    (async()=>{
      const edition=await enrichmentJson(openLibraryEditionUrl(request.isbn),'Open Library');const authors=[];
      for(const author of (Array.isArray(edition.authors)?edition.authors:[]).slice(0,6)){
        const key=author?.key??author?.author?.key;if(!/^\/authors\/OL\d+A$/u.test(key??''))continue;
        const entry=await enrichmentJson(`https://openlibrary.org${key}.json`,'Open Library');if(typeof entry.name==='string')authors.push(entry.name);
      }
      return openLibraryEditionCandidate(edition,authors);
    })().then(candidate=>sendResponse({ok:true,candidate})).catch(error=>sendResponse({ok:false,error:error.message}));return true;
  }

  if (request?.type === 'FETCH_FANATICAL_ORDERS') {
    if (!isProviderImportPage('fanatical', sender.url) || !sender.tab?.id) {
      sendResponse({ ok: false, error: 'Fanatical orders can be read only from a signed-in Fanatical tab.' });
      return undefined;
    }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: readFanaticalOrdersInPage,
      args: [{ fullScan: request.fullScan === true, knownOrderFingerprints: fanaticalSyncState({ knownOrderFingerprints: request.knownOrderFingerprints }).knownOrderFingerprints }]
    })
      .then((results) => {if(results?.length!==1)throw new Error('Fanatical scan did not return one complete result.');return sendResponse({ ok: true, result: sanitizeFanaticalProjection(results[0]?.result,{fullScan:request.fullScan===true,knownOrderFingerprints:fanaticalSyncState({knownOrderFingerprints:request.knownOrderFingerprints}).knownOrderFingerprints}) });})
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if(['GET_KINDLE_CONTENTS_REFRESH','CHECK_KINDLE_CONTENTS_REFRESH_ITEM','FINISH_KINDLE_CONTENTS_REFRESH'].includes(request?.type)){
    if(!isProviderImportPage('kindle',sender.url)||!sender.url.includes('/hz/mycd/')||!Number.isInteger(sender.tab?.id)){
      sendResponse({ok:false,error:'Refresh is available only from the Kindle library tab.'});return undefined;
    }
    const timing=request.type==='GET_KINDLE_CONTENTS_REFRESH'?null:contentsTiming(request,request.type==='FINISH_KINDLE_CONTENTS_REFRESH'?'checkpoint':'network'),workerEnd=timing?.begin('worker_total');
    const task=request.type==='GET_KINDLE_CONTENTS_REFRESH'?storageWriter.getKindleContentsRefresh():request.type==='CHECK_KINDLE_CONTENTS_REFRESH_ITEM'
      ?storageWriter.execute('checkKindleContentsRefreshItem',[request.runRef,request.leaseRef,sender.tab.id,request.position],timing)
      :storageWriter.execute('finishKindleContentsRefresh',[request.runRef,request.leaseRef,sender.tab.id,request.status],timing);
    task.then(result=>{workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:true,...(request.type==='FINISH_KINDLE_CONTENTS_REFRESH'?{refresh:result}:result)});}).catch(error=>{workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:false,error:error.message});});return true;
  }

  if (request?.type === 'GET_KINDLE_COMIC_CONTENT_CANDIDATES') {
    if (!isProviderImportPage('kindle', sender.url)) {
      sendResponse({ ok: false, error: 'Kindle contents discovery is available only from the signed-in Kindle library page.' });
      return undefined;
    }
    const timing=contentsTiming(request,'prepare');const workerEnd=timing?.begin('worker_total');
    if(request.mode==='rescan'){
      if(!sender.url.includes('/hz/mycd/')||!Number.isInteger(sender.tab?.id)){sendResponse({ok:false,error:'Refresh requires the Kindle library tab.'});return undefined;}
      (async()=>{
        const info=await storageWriter.getKindleContentsRefresh();let otherOwnerOpen=true,closedOwnerTabId=null;
        if(info.checkpoint?.status==='running'&&info.checkpoint.tabId!==sender.tab.id){
          otherOwnerOpen=true;
          if(chrome.tabs?.get)try{await chrome.tabs.get(info.checkpoint.tabId);}catch{otherOwnerOpen=false;closedOwnerTabId=info.checkpoint.tabId;}
        }
        return storageWriter.execute('beginKindleContentsRefresh',[request.refreshAction??'start',sender.tab.id,otherOwnerOpen,closedOwnerTabId],timing);
      })().then(plan=>{workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:true,...plan});})
        .catch(error=>{workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:false,error:error.message});});return true;
    }
    storageWriter.execute('getDatabase',[],timing)
      .then((database) => {
        const selectionEnd=timing?.begin('candidate_selection');let plan;
        try{plan=kindleContentsPlan(database, request.mode ?? 'scan');}finally{selectionEnd?.();}
        workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:true,...plan});
      })
      .catch((error) => {workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:false,error:error.message});});
    return true;
  }

  if (request?.type === 'REPARSE_KINDLE_CONTENTS') {
    if (!isProviderImportPage('kindle', sender.url)) {
      sendResponse({ok:false,error:'Saved Kindle statements can be reprocessed only from the signed-in Kindle library page.'});return undefined;
    }
    const timing=contentsTiming(request,'reparse');const workerEnd=timing?.begin('worker_total');
    storageWriter.execute('reparseKindleContents',[request.entries],timing).then(() => {workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:true});})
      .catch(error => {workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:false,error:error.message});});return true;
  }

  if (request?.type === 'SAVE_KINDLE_COMIC_CONTENTS') {
    if (!isProviderImportPage('kindle', sender.url) || request.refresh && (!sender.url.includes('/hz/mycd/') || !Number.isInteger(sender.tab?.id))) {
      sendResponse({ ok: false, error: 'Kindle contents can be saved only from the signed-in Kindle library page.' });
      return undefined;
    }
    const timing=contentsTiming(request,'network');const workerEnd=timing?.begin('worker_total');
    const operation=request.refresh?'commitKindleContentsRefresh':'saveKindleComicContents';
    const args=request.refresh?[request.entries,request.refresh.runRef,request.refresh.leaseRef,sender.tab?.id]:[request.entries];
    storageWriter.execute(operation,args,timing)
      .then(result => {workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:true,...(request.refresh?{refresh:result}:{})});})
      .catch(error => {workerEnd?.();timedContentsResponse(timing,sendResponse,{ok:false,error:error.message});});
    return true;
  }

  if (request?.type === 'FANDANGO_IMPORT_STATE') {
    const key = fandangoImportKey(sender);
    if (!key || !isFandangoPage(sender.url)) {
      sendResponse({ ok: false, error: 'Fandango import state is available only in the signed-in Fandango tab.' });
      return undefined;
    }
    if (request.action === 'get') {
      storageReady.then(() => chrome.storage.session.get(key))
        .then((values) => sendResponse({ ok: true, state: values[key] ?? null }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (request.action === 'set' && request.state && typeof request.state === 'object') {
      storageReady.then(() => chrome.storage.session.set({ [key]: validateFandangoState(request.state) }))
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (request.action === 'clear') {
      storageReady.then(() => chrome.storage.session.remove(key))
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    sendResponse({ ok: false, error: 'Invalid Fandango import-state request.' });
    return undefined;
  }

  if (request?.type === 'MATCH_ITEMS') {
    const end=queryDiagnostics.begin('internal_query'),respond=sendResponse;
    sendResponse=value=>{try{respond(value);}finally{end();}};
    if (!isOwnExtensionPage(sender.url)) {
      sendResponse({ok:false,error:'Library comparisons are accepted only from Galactic Library pages.'});
      return undefined;
    }
    storageWriter.getQueryDatabase()
      .then(database=>handleExternalApiRequestAsync(database,{...request,apiVersion:request.apiVersion??1},{cacheImmutableRecords:true,cacheCommittedProjection:true})).then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if(request?.type==='GL_PROVIDER_UI_TIMING'){
    if(request.provider==='kobo'&&isProviderImportPage('kobo',sender.url)&&contentsPerformance.clean(request.timing)?.kind==='provider')providerTimings.add(request.timing);
    sendResponse({ok:true});return undefined;
  }
  if(request?.type==='GET_PROVIDER_PROFILE_HINT'){
    if(request.provider!=='kobo'||!isProviderImportPage('kobo',sender.url)){sendResponse({ok:false});return undefined;}
    const timing=providerTiming(request);
    storageWriter.getProviderProfileHint('kobo',timing).then(hint=>providerResponse(timing,sendResponse,{ok:true,hint})).catch(()=>providerResponse(timing,sendResponse,{ok:false}));return true;
  }
  if (['GET_PROVIDER_SYNC_STATE','GET_PROVIDER_PROFILE'].includes(request?.type)) {
    if (!isKnownProvider(request.provider) || !isProviderImportPage(request.provider, sender.url)) {
      sendResponse({ ok: false, error: 'Sync state is available only from the matching signed-in provider site.' });
      return undefined;
    }
    const timing=providerTiming(request),end=timing?.begin(request.type==='GET_PROVIDER_PROFILE'?'provider_profile':'provider_start');
    const reply=value=>{end?.();providerResponse(timing,sendResponse,value);};
    const read = request.beginScan===true
      ? ((request.confirmed===true || request.rememberedProfile===true) && Number.isInteger(sender.tab?.id)
        ? storageWriter.execute('beginProviderScan',[request.provider,request.profileLabel,request.mode,request.switchProfile,sender.tab.id,request.profileId,request.confirmed!==true&&request.rememberedProfile===true],timing)
        : Promise.reject(new Error('Confirm that the signed-in account matches the profile label.')))
      : (request.type==='GET_PROVIDER_PROFILE'||request.provider==='kobo'?storageWriter.getQueryDatabase({beginSpan:stage=>timing?.begin(stage)}):getDatabase()).then(database=>({database}));
    read.then(({database,scanToken,forceFull,profileLabel,profileId}) => {
        const activeId=profileId??database.providers?.[request.provider]?.activeProfileId;
        const state = database.providerProfiles?.[activeId]?.state ?? {};
        if(request.type==='GET_PROVIDER_PROFILE'){
          const profile=database.providerProfiles?.[activeId],profiles=Object.values(database.providerProfiles??{}).filter(p=>p.provider===request.provider);
          if(request.provider==='kobo')storageWriter.rememberProviderProfileHints(database).catch(()=>{});
          reply({ok:true,profileLabel:profile?.nickname??'',profileId:activeId,
            reuseAllowed:profiles.length===1&&profile?.state.connected===true&&Boolean(profile.state.lastSync),
            profiles:profiles.map(p=>({profileId:p.profileId,nickname:p.nickname}))});return;
        }
        const knownProviderItemIds = Object.values(database.providerItems)
          .filter((item) => item.provider === request.provider&&item.profileId===activeId)
          .map((item) => item.providerItemId)
          .filter(Boolean)
          .slice(0, 50000);
        reply({
          ok: true,
          scanToken,profileLabel,profileId:activeId,
          hasFullBaseline: Boolean(state.fullSyncAt)&&!forceFull,
          lastSuccessfulSyncAt: String(state.quickSyncAt ?? state.fullSyncAt ?? ''),
          syncState: forceFull ? {} : request.provider === 'humble'
            ? {...humbleSyncState(state.syncState),refreshPurchaseIds:[...new Set(Object.values(database.providerItems)
              .filter(item=>item.provider==='humble'&&item.profileId===activeId&&item.metadata?.entitlement==='third-party-key'
                &&(item.metadata.keyStatus!=='revealed'||item.metadata.expiresAt&&Date.parse(item.metadata.expiresAt)<=Date.now()))
              .map(item=>item.metadata.purchaseId).filter(Boolean))].slice(0,50000)}
            : request.provider === 'fanatical'
              ? fanaticalSyncState(state.syncState)
            : { knownProviderItemIds }
        });
      })
      .catch((error) => reply({ ok: false, error: error.message }));
    return true;
  }

  if(request?.type==='REPORT_PROVIDER_SCAN_FAILURE'){
    if(!isKnownProvider(request.provider)||!isProviderImportPage(request.provider,sender.url)||!sender.tab?.id){sendResponse({ok:false,error:'Scan failures are accepted only from the matching provider tab.'});return undefined;}
    storageWriter.failProviderScan(request.provider,request.scanToken,sender.tab.id,request.failure).then(recorded=>sendResponse({ok:true,recorded})).catch(error=>sendResponse({ok:false,error:error.message}));return true;
  }
  if (!['IMPORT_PROVIDER_ITEMS','COMMIT_PROVIDER_SCAN'].includes(request?.type)) return undefined;
  if (!isKnownProvider(request.provider) || !isProviderImportPage(request.provider, sender.url)) {
    sendResponse({ ok: false, error: 'Imports are accepted only from the matching signed-in provider site.' });
    return undefined;
  }
  const incrementalProvider = request.mode === 'incremental' && ['humble', 'fanatical', 'steam', 'gog', 'kindle', 'amazon-games', 'audible', 'kobo', 'amazon-video', 'fandango-at-home'].includes(request.provider);
  if (!Array.isArray(request.items) || request.items.length > 50000) {
    sendResponse({ ok: false, error: 'The provider did not provide a valid game list.' });
    return undefined;
  }
  const source = request.provider === 'steam'
    ? 'steam-store-browse-items'
    : request.provider === 'gog'
      ? 'gog-account-library'
      : request.provider === 'epic'
        ? 'epic-store-library'
        : request.provider === 'amazon-games'
          ? 'amazon-games-collection'
    : request.provider === 'audible'
      ? 'audible-library-page'
        : request.provider === 'kindle'
          ? 'amazon-kindle-content-library'
          : request.provider === 'amazon-video'
            ? 'amazon-prime-video-purchases-library'
            : request.provider === 'fandango-at-home'
              ? 'fandango-at-home-library'
            : request.provider === 'kobo'
              ? 'kobo-my-books-library'
              : request.provider === 'fanatical'
                ? 'fanatical-order-history'
                : 'humble-purchase-library';
  const now = new Date().toISOString();
  const syncDetails = request.provider === 'humble'
    ? {
        source,
        syncMode: incrementalProvider ? 'incremental' : 'full',
        ...(incrementalProvider ? { quickSyncAt: now } : { fullSyncAt: now }),
        syncState: humbleSyncState(request.syncState)
      }
    : request.provider === 'fanatical'
      ? {
        source,
        syncMode: incrementalProvider ? 'incremental' : 'full',
        ...(incrementalProvider ? { quickSyncAt: now } : { fullSyncAt: now }),
        syncState: fanaticalSyncState(request.syncState)
      }
    : {
        source,
        syncMode: incrementalProvider ? 'incremental' : 'full',
        ...(incrementalProvider ? { quickSyncAt: now } : { fullSyncAt: now })
      };
  if(request.scanDiagnostics!==undefined){
    const raw=request.scanDiagnostics;
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||['failedRequestCount','retries'].some(key=>raw[key]!==undefined&&(!Number.isSafeInteger(raw[key])||raw[key]<0||raw[key]>100000))){sendResponse({ok:false,error:'Invalid sync diagnostics.'});return undefined;}
    syncDetails.scanDiagnostics={failedRequestCount:raw.failedRequestCount??0,...(raw.retries!==undefined?{retries:raw.retries}:{}),coverageLimit:raw.arrayOnly===true?'array-only-index-without-total':''};
  }
  const timing=providerTiming(request),end=timing?.begin('provider_finish');
  const reply=value=>{end?.();providerResponse(timing,sendResponse,value);};
  (request.type==='COMMIT_PROVIDER_SCAN'
    ? storageWriter.execute('commitProviderScan',[request.provider,request.items,syncDetails,request.snapshot,request.scanToken,sender.tab?.id,request.provider==='kobo'],timing)
    : storageWriter.importUnscopedProviderItems(request.provider,request.items,syncDetails,request.snapshot))
    .then((result) => {const database=result.database??result;reply({
      ok: true,
      gameCount: database.providers[request.provider].itemCount,
      addOnCount: database.providers[request.provider].addOnCount ?? 0,
      audiobookCount: database.providers[request.provider].audiobookCount ?? 0,
      softwareCount:database.providers[request.provider].softwareCount??0,
      bookCount: database.providers[request.provider].bookCount ?? 0,
      movieCount: database.providers[request.provider].movieCount ?? 0,
      tvCount: database.providers[request.provider].tvCount ?? 0,
      linkedAddOnCount: database.providers[request.provider].linkedAddOnCount ?? 0,
      ...(request.provider==='kobo'?{changes:result.scanResult?.changes??database.providers.kobo.syncHealth?.differences,ownership:result.scanResult?.ownership,checkedAt:result.scanResult?.checkedAt}:{}),
      syncedAt: database.providers[request.provider].lastSync
    });})
    .catch((error) => reply({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if(request?.type?.startsWith('GH_PURCHASE_'))return false;
  if(['MATCH_ITEMS_DIAGNOSTIC_CALLBACK','MATCH_ITEMS_DIAGNOSTIC_RENDER'].includes(request?.type)){
    const observed=contentsPerformance.now(),callback=request.diagnosticCallbackEpochMs,id=request.diagnosticLookupId;
    storageWriter.getQueryAllowedExternalClientIds().then(allowed=>{
      const original=companionCallbacks.get(id);
      if(request.apiVersion!==1||!sender.id||!allowed.includes(sender.id)||!original||original.sender!==sender.id||!Number.isFinite(callback)||callback<original.start||callback>observed+1000||observed-original.responded>60000){sendResponse({ok:false});return;}
      workerLifecycle.observe(request.type==='MATCH_ITEMS_DIAGNOSTIC_RENDER'?'companion_diagnostic_render':'companion_diagnostic_callback');
      if(request.type==='MATCH_ITEMS_DIAGNOSTIC_RENDER'){
        if(original.rendered){sendResponse({ok:false});return;}original.rendered=true;
        companionTimings.annotate(id,[],request.diagnosticHb);sendResponse({ok:true,apiVersion:1});return;
      }
      if(original.callback){sendResponse({ok:false});return;}original.callback=callback;
      companionTimings.annotate(id,[{stage:'client_round_trip',attempt:0,startMs:0,durationMs:callback-original.start},{stage:'response_transport',attempt:0,startMs:original.responded-original.start,durationMs:Math.max(0,callback-original.responded)}]);
      sendResponse({ok:true,apiVersion:1});
    }).catch(()=>sendResponse({ok:false}));return true;
  }
  const entered=contentsPerformance.now(),sent=request?.diagnosticSentEpochMs;
  let authorizedCompanion=false,completedCompanion=false;
  const deliver=sendResponse;
  sendResponse=value=>{try{deliver(value);}finally{if(authorizedCompanion&&!completedCompanion){completedCompanion=true;workerLifecycle.completed(request?.type);}}};
  const explicit=contentsPerformance.validId(request?.diagnosticLookupId);
  const diagnosticId=explicit?request.diagnosticLookupId:request?.type==='MATCH_ITEMS'&&entered<contentsDiagnosticUntil?'lookup-'+companionDiagnosticPrefix+'-'+String(++companionDiagnosticSequence).padStart(3,'0'):null;
  const timing=contentsPerformance.trace(diagnosticId,'companion',undefined,explicit&&Number.isFinite(sent)&&sent<=entered&&entered-sent<=60000?sent:null);
  if(timing){timing.worker=queryDiagnostics.worker;timing.workerStartedEpochMs=queryDiagnostics.startedEpochMs;timing.client=request.diagnosticHb;timing.work=Object.fromEntries(['snapshot','index','execution'].map(phase=>[phase,{cpuMs:0,waitMs:0,maxWaitMs:0,yields:0}]));}
  if(timing&&Array.isArray(request.items)&&request.items.length<=500){timing.requestItemCount=request.items.length;timing.requestContentsCount=Math.min(20000,request.items.reduce((total,item)=>total+(Array.isArray(item?.contents)?item.contents.length:0),0));}
  let workPhase='index',longWaitCount=0;
  const endActivity=request?.type==='MATCH_ITEMS'?queryDiagnostics.begin('query'):()=>{};
  if(timing)timing.scheduling={yields:0,maxSliceMs:0,cpuMs:0,waitMs:0,maxWaitMs:0};
  if(timing&&timing.start<entered)timing.events.push({stage:'handler_delay',attempt:0,startMs:0,durationMs:entered-timing.start});
  let endStage=timing?.begin('query_authorization');
  const respond=value=>{
    endStage?.();endStage=null;
    const end=timing?.begin('response_dispatch');
    if(explicit&&timing){companionCallbacks.set(timing.id,{sender:sender.id,start:timing.start,responded:contentsPerformance.now()});if(companionCallbacks.size>50)companionCallbacks.delete(companionCallbacks.keys().next().value);}
    try{sendResponse(explicit&&timing?{...value,performance:contentsPerformance.clean(timing.finish())}:value);}
    finally{end?.();endActivity();if(timing)companionTimings.add(timing.finish());}
  };
  storageWriter.getQueryAllowedExternalClientIds()
    .then((allowedIds) => {
      endStage?.();endStage=null;
      if (!sender.id || !allowedIds.includes(sender.id)) {
        respond({ ok: false, error: 'This extension is not allowed to use the Galactic Library API.' });
        return null;
      }
      if(!allowedCompanionOperation(sender.id,request?.type)){respond({ok:false,error:'Unsupported or unauthorized Galactic Library API operation.'});return null;}
      authorizedCompanion=true;workerLifecycle.observe('external_started:'+request?.type);
      if(request?.type==='GET_APPEARANCE'){
        if(request.apiVersion!==1){respond({ok:false,apiVersion:1,error:'Unsupported Galactic Library API version.'});return null;}
        return appearanceService.get().then(value=>{respond({ok:true,apiVersion:1,appearance:{mode:value.appearance.mode}});return null;});
      }
      if(request?.type==='OPEN_REVIEW'){
        if(request.apiVersion!==1){sendResponse({ok:false,apiVersion:1,error:'Unsupported Galactic Library API version.'});return null;}
        return chrome.runtime.openOptionsPage().then(()=>sendResponse({ok:true,apiVersion:1}),()=>sendResponse({ok:false,apiVersion:1,error:'Could not open Galactic Library options.'}));
      }
      if(['BEGIN_ENTITLEMENT_FEED','APPEND_ENTITLEMENT_FEED','COMMIT_ENTITLEMENT_FEED','REMOVE_ENTITLEMENT_FEED'].includes(request?.type)){
        if(request.apiVersion!==1){sendResponse({ok:false,error:'Unsupported Galactic Library API version.'});return null;}
        const operation=request.type==='BEGIN_ENTITLEMENT_FEED'?storageWriter.beginCompanionFeed(sender.id,request,true):request.type==='APPEND_ENTITLEMENT_FEED'?storageWriter.appendCompanionFeed(sender.id,request.uploadToken,request.offset,request.entries,true):request.type==='COMMIT_ENTITLEMENT_FEED'?storageWriter.commitCompanionFeed(sender.id,request.uploadToken,true):storageWriter.removeCompanionFeed(sender.id,true);
        return operation.then(result=>sendResponse({ok:true,apiVersion:1,...result}),()=>sendResponse({ok:false,apiVersion:1,error:'Reminder transfer did not complete. Check the active Humble profile, batch order and storage; prior reminders were retained.'}));
      }
      endStage=timing?.begin('query_snapshot');
      const beginSpan=stage=>timing?.begin(stage);
      return storageWriter.getQueryDatabase({beginSpan,onValidationSlice:(duration,yielded)=>{if(timing){timing.work.snapshot.cpuMs+=duration;timing.work.snapshot.yields+=Number(yielded);}},onValidationWait:duration=>{if(timing){timing.work.snapshot.waitMs+=duration;timing.work.snapshot.maxWaitMs=Math.max(timing.work.snapshot.maxWaitMs,duration);if(duration>=50&&longWaitCount++<16)timing.events.push({stage:'validation_yield_wait',attempt:0,startMs:Math.max(0,contentsPerformance.now()-timing.start-duration),durationMs:duration});}}}).then(async database=>{
        if(timing)timing.snapshotSequence=committedSnapshotSequence(database);
        endStage?.();endStage=null;
        const result=await handleExternalApiRequestAsync(database,request,{cacheImmutableRecords:true,cacheCommittedProjection:true,beginSpan,onStage:stage=>{if(stage==='matching_execution')workPhase='execution';endStage?.();endStage=timing?.begin(stage);},onSlice:(duration,yielded)=>{if(timing){timing.scheduling.yields+=Number(yielded);timing.scheduling.maxSliceMs=Math.max(timing.scheduling.maxSliceMs,duration);timing.scheduling.cpuMs+=duration;timing.work[workPhase].cpuMs+=duration;timing.work[workPhase].yields+=Number(yielded);}},onWait:duration=>{if(timing){timing.scheduling.waitMs+=duration;timing.scheduling.maxWaitMs=Math.max(timing.scheduling.maxWaitMs,duration);timing.work[workPhase].waitMs+=duration;timing.work[workPhase].maxWaitMs=Math.max(timing.work[workPhase].maxWaitMs,duration);if(duration>=50&&longWaitCount++<16)timing.events.push({stage:'matching_yield_wait',attempt:0,startMs:Math.max(0,contentsPerformance.now()-timing.start-duration),durationMs:duration});}}});
        respond(result);
      });
    })
    .catch(() => respond({ ok: false, error: 'The Galactic Library API is unavailable. Open Galactic Library to check its storage.' }));
  return true;
});
