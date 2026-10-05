import {equalDatabaseData} from '../lib/data-equality.js';
import '../lib/contents-performance.js';
import { UI_PREFERENCES_KEY, defaultUiPreferences, validateUiPreferences } from '../lib/ui-preferences.js';
import {validateOwnershipPolicy} from '../lib/ownership.js';
import { DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY, PROVIDERS } from '../lib/constants.js';
import { isExtensionId, normaliseExternalClientIds } from '../lib/external-api.js';
import {supportedKindleContentsBook, contentsParseState, kindleContentsPlan, KINDLE_CONTENTS_EXTRACTOR_VERSION} from '../lib/kindle-contents.js';
import {KINDLE_REFRESH_KEY,KINDLE_REFRESH_VERSION,validateKindleRefresh,kindleRefreshSummary} from '../lib/kindle-contents-refresh.js';
import {selectManifest,MANIFEST_INTERPRETATION_VERSION} from '../lib/kindle-manifest.js';
import {CONTENTS_FILTER_VERSION} from '../lib/contents-quality.js';
import {contentsObservation} from '../lib/kindle-contents-observations.js';
import { createEmptyDatabase, normalizeProviderItem, providerItemKey, rebuildCanonicalItems, validateDatabase } from '../lib/models.js';
import { STORAGE_OPERATIONS } from '../lib/storage-protocol.js';
import { validateProviderSnapshot } from '../lib/provider-snapshot.js';
import { validateContentReview,CONTENTS_PARSER_VERSION } from '../lib/contents.js';
import { identityConflicts, identityEvidence, editionEnrichmentConflicts } from '../lib/identity.js';
import { PROVIDER_SOURCES } from '../lib/metadata-validation.js';
import { text } from '../lib/validation.js';
import {needsGoogleBooksEnrichment} from '../lib/enrichment.js';
import {validateEnrichment} from '../lib/metadata-validation.js';
import {validateEnrichmentReviews} from '../lib/enrichment-state.js';
import {validateTitleAliases} from '../lib/title-aliases.js';
import {mergePurchaseOrigins} from '../lib/purchase-origins.js';
import {validateOwnershipReview,purchaseEvidence,purchaseCandidates} from '../lib/ownership-review.js';
import {FEED_UPLOAD_KEY,validateEntitlementEntry} from '../lib/companion-entitlements.js';
import {validateReadingState,validateReadingOrder,READING_MEDIA} from '../lib/reading.js';
import {libraryReminders} from '../lib/reminders.js';
import {date} from '../lib/validation.js';
import {validateSyncHealth,snapshotDifferences,SYNC_FAILURE_CODES} from '../lib/sync-health.js';

/**
 * Instantiate once in the service worker. Every read and mutation shares this
 * queue, including calls made directly by provider message handlers. No client
 * context owns a writer or writes a cached database snapshot.
 */
export function createStorageWriter(storageArea, ready = Promise.resolve()) {
  let activeTiming = null;
  const timed = (stage, work) => { const end=activeTiming?.begin(stage);try{return work();}finally{end?.();} };
  const timedAsync = (stage, work) => {
    if(!activeTiming)return work();
    const end=activeTiming.begin(stage);
    if(stage==='storage_write'||stage==='migration_write'){try{activeTiming.onWrite?.();}catch{/* Diagnostics must never prevent a write. */}}
    return (async()=>{try{return await work();}finally{end();}})();
  };
  const NOTIFICATIONS='galacticLibraryReminderNotifications';
  const SCANS='galacticLibraryProviderScans';
  async function beginProviderScan(provider,profile,mode='full',switchProfile=false,tabId=null) {
    if(!PROVIDERS.includes(provider)||!['full','incremental'].includes(mode))throw new Error('Invalid provider scan.');
    const profileLabel=text(profile,100,'Account/profile label');if(!profileLabel)throw new Error('Enter an account/profile label and confirm the signed-in account before scanning.');
    const database=await getDatabase();const prior=database.providers[provider]?.profileLabel??'';
    const changing=Boolean(prior)&&prior!==profileLabel;
    if(changing&&(mode!=='full'||switchProfile!==true))throw new Error('A different account/profile is active. Choose Full rescan and explicitly switch profiles; the previous library will be archived.');
    const forceFull=changing||!prior||!database.providers[provider]?.fullSyncAt;
    const stored=await storageArea.get({[SCANS]:{}});const scans=stored[SCANS]??{};const scanToken=crypto.randomUUID();
    scans[provider]={scanToken,attemptRef:crypto.randomUUID(),profileLabel,priorProfileLabel:prior,mode:forceFull?'full':mode,tabId,startedAt:new Date().toISOString()};
    database.providers[provider]={...database.providers[provider],syncHealth:validateSyncHealth({attemptRef:scans[provider].attemptRef,status:'running',mode:scans[provider].mode,attemptedProfileLabel:profileLabel,startedAt:scans[provider].startedAt,finishedAt:null,retryable:false})};
    await storageArea.set({[SCANS]:scans,[DATABASE_STORAGE_KEY]:validateDatabase(database)});
    return {scanToken,forceFull,profileLabel,database};
  }
  async function commitProviderScan(provider,values,syncDetails,snapshot,scanToken,tabId=null) {
    const stored=await storageArea.get({[SCANS]:{}});const scan=stored[SCANS]?.[provider];
    if(!scan||scan.scanToken!==scanToken||scan.tabId!==tabId)throw new Error('This scan was superseded by another scan, clear, restore, or profile change. Start a fresh scan.');
    if(!['full','incremental'].includes(syncDetails.syncMode)||scan.mode==='full'&&syncDetails.syncMode!=='full')throw new Error('This account/profile requires a complete full scan.');
    const details={...syncDetails,profileLabel:scan.profileLabel};
    return syncDetails.syncMode==='full'?replaceProviderItems(provider,values,details,snapshot):mergeProviderItems(provider,values,details);
  }
  async function failProviderScan(provider,scanToken,tabId,failure={}){
    const stored=await storageArea.get({[SCANS]:{}}),scan=stored[SCANS]?.[provider];
    if(!scan||scan.scanToken!==scanToken||scan.tabId!==tabId)return false;
    const database=await getDatabase();
    const failureCode=SYNC_FAILURE_CODES.includes(failure.code)?failure.code:'other';
    database.providers[provider]={...database.providers[provider],syncHealth:validateSyncHealth({attemptRef:scan.attemptRef,status:'failed',mode:scan.mode,attemptedProfileLabel:scan.profileLabel,startedAt:scan.startedAt,finishedAt:new Date().toISOString(),failureCode,retryable:true,failedRequestCount:failure.failedRequestCount??1,failedPages:failure.failedPages??[]})};
    await persistDatabase(database,provider);return true;
  }
  async function cancelProviderScan(provider,attemptRef){
    const stored=await storageArea.get({[SCANS]:{}}),scan=stored[SCANS]?.[provider];if(!scan||scan.attemptRef!==attemptRef)throw new Error('This scan changed or already finished. Refresh the dashboard.');
    const database=await getDatabase();database.providers[provider].syncHealth={...database.providers[provider].syncHealth,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true};return persistDatabase(database,provider);
  }
  function successfulSyncHealth(database,provider,records,full,details,changing=false){
    const diagnostics=details.scanDiagnostics??{};const prior=database.providers[provider]?.syncHealth;
    const failedRequestCount=diagnostics.failedRequestCount??0;
    return validateSyncHealth({attemptRef:prior?.status==='running'?prior.attemptRef:'',status:failedRequestCount?'partial':'succeeded',mode:full?'full':'incremental',attemptedProfileLabel:details.profileLabel??database.providers[provider]?.profileLabel??'',startedAt:prior?.status==='running'?prior.startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),retryable:failedRequestCount>0,failedRequestCount,retries:diagnostics.retries??null,coverageLimit:diagnostics.coverageLimit??'',differences:snapshotDifferences(changing?[]:Object.values(database.providerItems).filter(item=>item.provider===provider),records,full)});
  }
  async function restoreDatabase(database){
    const restored=validateDatabase(database);for(const state of Object.values(restored.providers))if(state.syncHealth?.status==='running')state.syncHealth={...state.syncHealth,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true};return persistDatabase(restored,'all');
  }
  async function importUnscopedProviderItems(provider,values,details,snapshot){
    const database=await getDatabase();
    if(database.providers[provider]?.profileLabel)throw new Error('Reload the provider page and start a confirmed profile scan.');
    return details.syncMode==='incremental'?mergeProviderItems(provider,values,details):replaceProviderItems(provider,values,details,snapshot);
  }
  async function getDatabase() {
    const stored = await timedAsync('storage_read',()=>storageArea.get({ [DATABASE_STORAGE_KEY]: null }));
    if (!stored[DATABASE_STORAGE_KEY]) return createEmptyDatabase();
    const database = timed('read_validation',()=>validateDatabase(stored[DATABASE_STORAGE_KEY]));
    if (timed('migration_compare',()=>!equalDatabaseData(stored[DATABASE_STORAGE_KEY], database))) {
      const jobState = await storageArea.get({[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: null});
      const job = jobState[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY];
      const migrated = {[DATABASE_STORAGE_KEY]: database};
      if (Array.isArray(job?.queue)) {
        const byRecord = new Map(Object.values(database.canonicalItems).flatMap((entry) => entry.providerItemIds.map((id) => [id, entry.id])));
        migrated[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY] = {...job, queue: job.queue.map((id) => {
          const previous = stored[DATABASE_STORAGE_KEY].canonicalItems?.[id];
          return previous?.providerItemIds?.map((itemId) => byRecord.get(itemId)).find(Boolean) ?? id;
        })};
      }
      await timedAsync('migration_write',()=>storageArea.set(migrated));
    }
    return database;
  }

  async function persistDatabase(database,invalidate=null,extra={}) {
    const validated = timed('persist_validation',()=>validateDatabase(database));
    const updates={...extra,[DATABASE_STORAGE_KEY]:validated};
    if(invalidate==='all')updates[KINDLE_REFRESH_KEY]=null;
    if(invalidate){const stored=await storageArea.get({[SCANS]:{}});const scans=invalidate==='all'?{}:{...stored[SCANS]};if(invalidate!=='all')delete scans[invalidate];updates[SCANS]=scans;}
    if(invalidate==='all'||invalidate==='humble')updates[FEED_UPLOAD_KEY]={};
    if(invalidate==='all')updates[NOTIFICATIONS]={enabled:false,lastNotifiedDay:''};
    if(invalidate==='all'){const stored=await storageArea.get({[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]:null});if(stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY])updates[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]=null;}
    await timedAsync('storage_write',()=>storageArea.set(updates));
    return validated;
  }

  async function saveOwnershipPolicy(patch) {
    // Validate before reading or writing. Merge patches inside the shared queue
    // so changes from two windows cannot overwrite each other's provider flags.
    validateOwnershipPolicy(patch);
    if(patch===undefined)throw Error('Choose an ownership preference to save.');
    const database=await getDatabase();
    database.ownershipPolicy=validateOwnershipPolicy({...database.ownershipPolicy,...patch,
      providers:{...database.ownershipPolicy.providers,...patch.providers}});
    return persistDatabase(database);
  }

  function preserveEnrichment(incoming, previous) {
    if (previous?.recordRef) incoming = {...incoming, recordRef: previous.recordRef};
    if(incoming.provider==='fanatical'){
      const origins=(incoming.metadata.purchaseOrigins??[]).map(entry=>({...entry,observedAt:incoming.observedAt}));
      if(origins.length||previous?.metadata.purchaseOrigins?.length)incoming.metadata.purchaseOrigins=mergePurchaseOrigins(previous?.metadata.purchaseOrigins??[],origins);
      const dates=[previous?.acquiredAt,incoming.acquiredAt,...(incoming.metadata.purchaseOrigins??[]).map(entry=>entry.purchasedAt)].filter(Boolean).sort();incoming.acquiredAt=dates[0]??null;
    }
    if(previous&&previous.mediaType!==incoming.mediaType)return incoming;
    const existing = previous?.metadata?.enrichment;
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return incoming;
    return {
      ...incoming,
      metadata: {
        ...incoming.metadata,
        enrichment: { ...existing, ...(incoming.metadata?.enrichment ?? {}) }
      }
    };
  }

  function reconcileMediaChanges(database,incoming){
    const changed=new Set(incoming.filter(item=>database.providerItems[item.id]&&database.providerItems[item.id].mediaType!==item.mediaType).map(item=>item.id));
    for(const id of changed)delete database.contentReviews[id];
    for(const [key,review]of Object.entries(database.manualMatchDecisions))if(review.itemIds.some(id=>changed.has(id)))delete database.manualMatchDecisions[key];
    for(const [key,entry]of Object.entries(database.editionSeparations))if(changed.has(entry.itemId)||entry.otherItemIds.some(id=>changed.has(id)))delete database.editionSeparations[key];
  }

  async function replaceProviderItems(provider, values, syncDetails = {}, snapshot) {
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid provider.');
    if (!Array.isArray(values) || values.length>50000) throw new Error('Import needs a bounded item list.');
    validateProviderSnapshot(provider, values, snapshot);
    const database = await getDatabase();
    const now = new Date().toISOString();
    const retained = Object.fromEntries(Object.entries(database.providerItems).filter(([, item]) => item.provider !== provider));
    const priorProfile=database.providers[provider]?.profileLabel??'';
    const nextProfile=syncDetails.profileLabel??priorProfile;const changing=Boolean(priorProfile)&&priorProfile!==nextProfile;
    const historicalById=new Map(Object.values(database.providerHistory).filter(entry=>entry.profileLabel===nextProfile).map(entry=>[entry.item.id,entry.item]));
    const incoming = values.map((value) => {
      const item = normalizeProviderItem({ ...value, provider, recordRef:undefined, observedAt:now }, now, {allowEnrichment:false});
      item.metadata.source = PROVIDER_SOURCES[provider];
      return preserveEnrichment(item, (changing?null:database.providerItems[item.id])??historicalById.get(item.id));
    });
    const unique = new Map(incoming.map((item) => [item.id, item]));
    const profileLabel=database.providers[provider]?.profileLabel??'';
    const oldIds=new Set(Object.values(database.providerItems).filter(item=>item.provider===provider).map(item=>item.id));
    for(const item of Object.values(database.providerItems))if(item.provider===provider&&(changing||!unique.has(item.id)))database.providerHistory[item.recordRef]={item,profileLabel,reason:changing?'profile-switch':'missing-from-complete-scan',missingSince:now};
    for(const [ref,entry]of Object.entries(database.providerHistory))if(entry.item.provider===provider&&entry.profileLabel===nextProfile&&unique.has(entry.item.id))delete database.providerHistory[ref];
    if(changing){for(const [id,decision]of Object.entries(database.manualMatchDecisions))if(decision.itemIds.some(id=>oldIds.has(id)))delete database.manualMatchDecisions[id];for(const id of oldIds)delete database.contentReviews[id];for(const [id,separation]of Object.entries(database.editionSeparations))if(oldIds.has(separation.itemId)||separation.otherItemIds.some(id=>oldIds.has(id)))delete database.editionSeparations[id];}
    const records = [...unique.values()];
    const gameCount = records.filter((item) => item.mediaType === 'game').length;
    const addOnCount = records.filter((item) => item.mediaType === 'game-addon').length;
    const softwareCount = records.filter(item=>item.mediaType==='software').length;
    const audiobookCount = records.filter((item) => item.mediaType === 'audiobook').length;
    const bookCount = records.filter((item) => item.mediaType === 'book').length;
    const movieCount = records.filter((item) => item.mediaType === 'movie').length;
    const tvCount = records.filter((item) => item.mediaType === 'tv').length;
    const linkedAddOnCount = records.filter((item) => {
      const parentId = String(item.metadata?.parentProviderItemId ?? '').trim();
      return item.mediaType === 'game-addon' && parentId && unique.has(providerItemKey(item.provider, parentId));
    }).length;
    const syncHealth=successfulSyncHealth(database,provider,records,true,syncDetails,changing);
    reconcileMediaChanges(database,incoming);
    database.providerItems = { ...retained, ...Object.fromEntries(unique) };
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    database.providers[provider] = {
      ...(changing?{}:database.providers[provider]),
      connected: true,
      itemCount: gameCount,
      addOnCount,
      audiobookCount,softwareCount,
      bookCount,
      movieCount,
      tvCount,
      linkedAddOnCount,
      recordCount: unique.size,
      lastSync: now,
      lastError: null,
      ...syncDetails,
      syncHealth,
      snapshotValidation: { ...snapshot, validatedAt: now }
    };
    return persistDatabase(database,provider);
  }

  // Incremental syncs must never make an entitlement disappear merely because
  // the provider returned only its recent additions. Full syncs use the
  // replacement function above; quick syncs add or refresh records here.
  async function mergeProviderItems(provider, values, syncDetails = {}) {
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid provider.');
    if (!Array.isArray(values) || values.length>50000) throw new Error('Import needs a bounded item list.');
    const database = await getDatabase();
    const historicalById=new Map(Object.values(database.providerHistory).filter(entry=>entry.profileLabel===(database.providers[provider]?.profileLabel??'')).map(entry=>[entry.item.id,entry.item]));
    const now = new Date().toISOString();
    const incoming = values.map((value) => {
      const item = normalizeProviderItem({ ...value, provider, recordRef:undefined, observedAt:now }, now, {allowEnrichment:false});
      item.metadata.source = PROVIDER_SOURCES[provider];
      return preserveEnrichment(item, database.providerItems[item.id]??historicalById.get(item.id));
    });
    const unique = new Map(incoming.map((item) => [item.id, item]));
    const syncHealth=successfulSyncHealth(database,provider,[...unique.values()],false,syncDetails);
    reconcileMediaChanges(database,incoming);
    database.providerItems = { ...database.providerItems, ...Object.fromEntries(unique) };
    for(const [ref,entry]of Object.entries(database.providerHistory))if(entry.item.provider===provider&&entry.profileLabel===(database.providers[provider]?.profileLabel??'')&&unique.has(entry.item.id))delete database.providerHistory[ref];
    const records = Object.values(database.providerItems).filter((item) => item.provider === provider);
    const gameCount = records.filter((item) => item.mediaType === 'game').length;
    const addOnCount = records.filter((item) => item.mediaType === 'game-addon').length;
    const softwareCount = records.filter(item=>item.mediaType==='software').length;
    const audiobookCount = records.filter((item) => item.mediaType === 'audiobook').length;
    const bookCount = records.filter((item) => item.mediaType === 'book').length;
    const movieCount = records.filter((item) => item.mediaType === 'movie').length;
    const tvCount = records.filter((item) => item.mediaType === 'tv').length;
    const providerRecords = new Map(records.map((item) => [item.id, item]));
    const linkedAddOnCount = records.filter((item) => {
      const parentId = String(item.metadata?.parentProviderItemId ?? '').trim();
      return item.mediaType === 'game-addon' && parentId && providerRecords.has(providerItemKey(provider, parentId));
    }).length;
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    database.providers[provider] = {
      ...database.providers[provider],
      connected: true,
      itemCount: gameCount,
      addOnCount,
      audiobookCount,softwareCount,
      bookCount,
      movieCount,
      tvCount,
      linkedAddOnCount,
      recordCount: records.length,
      lastSync: now,
      lastError: null,
      ...syncDetails,syncHealth
    };
    return persistDatabase(database,provider);
  }

  async function clearDatabase() {
    await storageArea.remove([DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY, SCANS, NOTIFICATIONS, FEED_UPLOAD_KEY, UI_PREFERENCES_KEY,KINDLE_REFRESH_KEY]);
  }

  function normaliseGoogleBooksApiKey(value) {
    const key = String(value ?? '').trim();
    if (!key) return '';
    if (key.length < 20 || /\s/u.test(key)) throw new Error('Enter a valid Google Books API key.');
    return key;
  }

  async function getGoogleBooksApiKey() {
    const stored = await storageArea.get({ [GOOGLE_BOOKS_API_KEY_STORAGE_KEY]: '' });
    return normaliseGoogleBooksApiKey(stored[GOOGLE_BOOKS_API_KEY_STORAGE_KEY]);
  }

  async function saveGoogleBooksApiKey(value) {
    const key = normaliseGoogleBooksApiKey(value);
    if (key) await storageArea.set({ [GOOGLE_BOOKS_API_KEY_STORAGE_KEY]: key });
    else await storageArea.remove(GOOGLE_BOOKS_API_KEY_STORAGE_KEY);
    return key;
  }

  function normaliseGoogleBooksJob(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.queue)) return null;
    const queue = [...new Set(value.queue.map(String).filter(Boolean))];
    const cursor = Math.max(0, Math.min(Number.isInteger(value.cursor) ? value.cursor : 0, queue.length));
    const count = (key) => Math.max(0, Number.isInteger(value[key]) ? value[key] : 0);
    const samples = (Array.isArray(value.samples) ? value.samples : []).slice(-50).flatMap((sample) => {
      const title = String(sample?.title ?? '').trim();
      const reason = String(sample?.reason ?? '').trim();
      if (!title || !reason) return [];
      return [{ title, reason, candidateTitle: String(sample?.candidateTitle ?? '').trim() }];
    });
    return {
      queue,
      jobId:typeof value.jobId==='string'?value.jobId:crypto.randomUUID(),
      runId:typeof value.runId==='string'?value.runId:null,
      leaseUntil:Number.isFinite(value.leaseUntil)?value.leaseUntil:0,
      targets:Object.fromEntries(queue.map(id=>[id,(Array.isArray(value.targets?.[id])?value.targets[id]:[]).filter(ref=>typeof ref==='string'&&/^[a-f0-9-]{36}$/iu.test(ref)).slice(0,50)])),
      cursor,
      processed: count('processed'),
      matched: count('matched'),
      genreHints: count('genreHints'),
      noMatch: count('noMatch'),
      zeroResults: count('zeroResults'),
      titleVariant: count('titleVariant'),
      authorVariant: count('authorVariant'),
      samples,
      skipped: count('skipped'),
      errors: count('errors'),
      lastError: String(value.lastError ?? '').trim().slice(0, 600),
      lastErrorAt: typeof value.lastErrorAt === 'string' ? value.lastErrorAt : '',
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : new Date().toISOString(),
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
    };
  }

  async function getGoogleBooksEnrichmentJob() {
    const stored = await storageArea.get({ [GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: null });
    return normaliseGoogleBooksJob(stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]);
  }

  async function saveGoogleBooksEnrichmentJob(value) {
    const job = normaliseGoogleBooksJob(value);
    if (!job) throw new Error('Invalid Google Books enrichment job.');
    job.updatedAt = new Date().toISOString();
    await storageArea.set({ [GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: job });
    return job;
  }

  async function clearGoogleBooksEnrichmentJob() {
    const job=await getGoogleBooksEnrichmentJob();if(job?.runId&&job.leaseUntil>Date.now())throw new Error('Pause the active enrichment run before resetting it.');
    await storageArea.remove(GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY);
  }

  async function startGoogleBooksEnrichmentJob() {
    const existing=await getGoogleBooksEnrichmentJob();if(existing?.runId&&existing.leaseUntil>Date.now())throw new Error('Another options page is running enrichment. Pause it or wait for its lease to expire.');
    const database = await getDatabase();
    const queue = Object.values(database.canonicalItems).filter((canonical) => {
      if (canonical.mediaType !== 'book') return false;
      const records = canonical.providerItemIds.map((id) => database.providerItems[id]).filter(Boolean);
      return needsGoogleBooksEnrichment(records);
    }).map((canonical) => canonical.id).sort();
    const targets=Object.fromEntries(queue.map(id=>[id,database.canonicalItems[id].providerItemIds.map(id=>database.providerItems[id].recordRef)]));
    return saveGoogleBooksEnrichmentJob({ queue,targets,jobId:crypto.randomUUID(),cursor: 0, processed: 0, matched: 0, genreHints: 0, noMatch: 0, zeroResults: 0, titleVariant: 0, authorVariant: 0, samples: [], skipped: 0, errors: 0, startedAt: new Date().toISOString() });
  }

  async function acquireEnrichmentRun(jobId,runId=null){
    let job=await getGoogleBooksEnrichmentJob();if(!job||job.jobId!==jobId)throw new Error('Enrichment progress was replaced or cleared.');
    if(job.runId&&job.runId!==runId&&job.leaseUntil>Date.now())throw new Error('Another options page is running enrichment.');
    if(runId&&job.runId!==runId)throw new Error('This enrichment run was superseded.');
    job={...job,runId:runId??crypto.randomUUID(),leaseUntil:Date.now()+120000};return saveGoogleBooksEnrichmentJob(job);
  }
  async function activeEnrichmentRun(jobId,runId){
    const job=await getGoogleBooksEnrichmentJob();if(!job||job.jobId!==jobId||job.runId!==runId||job.leaseUntil<=Date.now())throw new Error('Enrichment run expired, cleared, restored, or superseded. Resume from the current progress.');return job;
  }
  async function commitEnrichmentBatch(jobId,runId,cursor,outcomes){
    let job=await activeEnrichmentRun(jobId,runId);if(job.cursor!==cursor||!Array.isArray(outcomes)||outcomes.length>5)throw new Error('Invalid or stale enrichment checkpoint.');
    const database=await getDatabase();const byRef=new Map(Object.values(database.providerItems).map(item=>[item.recordRef,item]));const now=new Date().toISOString();
    for(let index=0;index<outcomes.length;index++){
      const outcome=outcomes[index];const id=job.queue[cursor+index];if(!id||outcome.canonicalId!==id)throw new Error('Enrichment batch does not match its queue.');
      const records=(job.targets[id]??[]).map(ref=>byRef.get(ref));
      const observations=outcome.recordObservations;
      const changed=outcome.status!=='skipped'&&(!Array.isArray(observations)||observations.length!==records.length||records.some((item,index)=>item&&(observations[index]?.ref!==item.recordRef||observations[index]?.observedAt!==item.observedAt||observations[index]?.title!==item.title)));
      if(!records.length||changed||records.some(item=>!item||item.mediaType!=='book'||item.metadata.enrichment?.googleBooks?.volumeId)||outcome.status==='skipped'){job.skipped++;}
      else if(outcome.enrichment){for(const record of records)selectEnrichment(database,record.id,'googleBooks',outcome.enrichment,now);job.matched++;}
      else{
        if(outcome.hint){for(const record of records)selectEnrichment(database,record.id,'googleBooksGenreHint',outcome.hint,now);job.genreHints++;}
        else if(outcome.status==='failed')job.errors++;else{job.noMatch++;if(outcome.status==='no-results')job.zeroResults++;else if(outcome.status==='title-variant')job.titleVariant++;else if(outcome.status==='author-variant')job.authorVariant++;}
        const ref=crypto.randomUUID();const review=validateEnrichmentReviews({[ref]:{recordRefs:records.map(record=>record.recordRef),source:'googleBooks',status:outcome.status==='failed'?'failed':outcome.candidates?.length?'ambiguous':'no-results',title:records[0].title,reason:outcome.reason??'Automatic selection was insufficient.',checkedAt:now,candidates:outcome.candidates??[]}})[ref];
        for(const [oldRef,old]of Object.entries(database.enrichmentReviews))if(old.source==='googleBooks'&&old.recordRefs.some(ref=>review.recordRefs.includes(ref)))delete database.enrichmentReviews[oldRef];database.enrichmentReviews[ref]=review;
      }
      job.cursor++;job.processed++;
    }
    database.canonicalItems=rebuildCanonicalItems(database.providerItems,database.manualMatchDecisions,database.canonicalItems,database.editionSeparations);
    job={...job,leaseUntil:Date.now()+120000,updatedAt:now};
    await storageArea.set({[DATABASE_STORAGE_KEY]:validateDatabase(database),[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]:normaliseGoogleBooksJob(job)});return {database,job};
  }
  async function finishEnrichmentRun(jobId,runId,lastError=''){
    const job=await activeEnrichmentRun(jobId,runId);return saveGoogleBooksEnrichmentJob({...job,runId:null,leaseUntil:0,lastError:text(lastError,600,'Enrichment error'),lastErrorAt:lastError?new Date().toISOString():''});
  }

  async function getAllowedExternalClientIds() {
    const stored = await storageArea.get({ [EXTERNAL_CLIENT_IDS_STORAGE_KEY]: [] });
    return normaliseExternalClientIds(stored[EXTERNAL_CLIENT_IDS_STORAGE_KEY]);
  }

  async function saveAllowedExternalClientIds(ids) {
    const normalised = normaliseExternalClientIds(ids);
    await storageArea.set({ [EXTERNAL_CLIENT_IDS_STORAGE_KEY]: normalised });
    return normalised;
  }

  async function saveManualMatchDecision(candidate, decision) {
    if (!candidate || !Array.isArray(candidate.itemIds) || candidate.itemIds.length !== 2 || !['same', 'same-work', 'same-edition', 'different'].includes(decision)) {
      throw new Error('Invalid duplicate-review decision.');
    }
    const database = await getDatabase();
    const itemIds = [...candidate.itemIds].sort();
    if (!itemIds.every((id) => database.providerItems[id])) throw new Error('One of the reviewed library items no longer exists.');
    if(itemIds[0]===itemIds[1]||database.providerItems[itemIds[0]].mediaType!==database.providerItems[itemIds[1]].mediaType)throw new Error('Review two different records of the same media type.');
    if(decision==='same-edition'&&identityConflicts(...itemIds.map(id=>database.providerItems[id])).length)throw new Error('These records have conflicting edition evidence. Use Same work instead.');
    database.manualMatchDecisions[itemIds.join('\u0000')] = { decision, itemIds, updatedAt: new Date().toISOString() };
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    if(decision==='same-edition'&&!Object.values(database.canonicalItems).some(group=>itemIds.every(id=>group.providerItemIds.includes(id))))throw new Error('An indirect identity conflict or Different works decision prevents this edition merge. Review those relationships first.');
    return persistDatabase(database);
  }

  function verifyRecordRefs(database,ids,refs){
    if(refs&&(!Array.isArray(refs)||refs.length!==ids.length||ids.some((id,index)=>database.providerItems[id]?.recordRef!==refs[index])))throw new Error('These records changed during enrichment. Reload and review the current profile.');
  }

  async function saveTitleAliases(recordRef,titles,note=''){
    const database=await getDatabase();
    if(!Object.values(database.providerItems).some(item=>item.recordRef===recordRef))throw new Error('This record is no longer in the active library.');
    if(!Array.isArray(titles))throw new Error('Alternate titles must be a list.');
    if(!titles.length)delete database.titleAliases[recordRef];
    else database.titleAliases[recordRef]=validateTitleAliases({[recordRef]:{titles,note,updatedAt:new Date().toISOString()}})[recordRef];
    return persistDatabase(database);
  }

  function currentOwnershipRecord(database,ref,expected=null){
    const item=Object.values(database.providerItems).find(item=>item.recordRef===ref);
    if(!item)throw new Error('This record is no longer in the active library.');
    if((database.ownershipReviews[ref]?.reviewRef??null)!==expected)throw new Error('Ownership evidence changed. Reload this record before reviewing it.');
    return item;
  }
  async function saveOwnershipReview(ref,value,expected=null){
    const database=await getDatabase();currentOwnershipRecord(database,ref,expected);
    database.ownershipReviews[ref]=validateOwnershipReview({...value,source:'manual-confirmation',reviewRef:crypto.randomUUID(),confirmedAt:new Date().toISOString()});return persistDatabase(database);
  }
  async function removeOwnershipReview(ref,expected){
    const database=await getDatabase();currentOwnershipRecord(database,ref,expected);delete database.ownershipReviews[ref];return persistDatabase(database);
  }
  async function importPurchaseEvidence(entries){
    if(!Array.isArray(entries)||!entries.length||entries.length>1000)throw new Error('Import 1–1,000 purchase evidence entries.');
    const evidence=entries.map(purchaseEvidence),database=await getDatabase(),now=new Date().toISOString();
    for(const entry of evidence){
      const profileLabel=database.providers[entry.provider]?.profileLabel??'';
      if(Object.values(database.ownershipProposals).some(proposal=>proposal.profileLabel===profileLabel&&JSON.stringify(proposal.evidence)===JSON.stringify(entry)))continue;
      database.ownershipProposals[crypto.randomUUID()]={evidence:entry,profileLabel,recordRefs:purchaseCandidates(entry,database.providerItems),importedAt:now};
    }
    return persistDatabase(database);
  }
  async function refreshPurchaseEvidence(){
    const database=await getDatabase();for(const proposal of Object.values(database.ownershipProposals))if(proposal.profileLabel===(database.providers[proposal.evidence.provider]?.profileLabel??''))proposal.recordRefs=purchaseCandidates(proposal.evidence,database.providerItems);return persistDatabase(database);
  }
  async function applyPurchaseEvidence(proposalId,ref,confirmed,expected=null){
    const database=await getDatabase(),proposal=database.ownershipProposals[proposalId];
    if(!proposal||confirmed!==true||!proposal.recordRefs.includes(ref))throw new Error('Confirm a current candidate for this receipt.');
    const item=currentOwnershipRecord(database,ref,expected),evidence=proposal.evidence;
    if(item.provider!==evidence.provider||item.mediaType!==evidence.mediaType||proposal.profileLabel!==(database.providers[item.provider]?.profileLabel??''))throw new Error('This receipt belongs to another provider/profile.');
    const candidate={title:evidence.title,mediaType:evidence.mediaType,metadata:{...(evidence.asin?{asin:evidence.asin}:{}),...(evidence.isbn?{isbn:[evidence.isbn]}:{})}};
    const conflicts=identityConflicts(item,candidate);
    if(evidence.asin&&/^[A-Z0-9]{10}$/iu.test(item.providerItemId)&&item.providerItemId.toUpperCase()!==evidence.asin)conflicts.push('catalog identifier');
    if(conflicts.length)throw new Error(`Receipt conflicts on ${[...new Set(conflicts)].join(', ')}. Review the identifiers and edition first.`);
    database.ownershipReviews[ref]=validateOwnershipReview({ownership:'owned',source:'local-purchase-history',reviewRef:crypto.randomUUID(),note:`${evidence.sourceLabel}: ${evidence.title}`,evidenceDate:evidence.acquiredAt,confirmedAt:new Date().toISOString(),expiresAt:null});delete database.ownershipProposals[proposalId];return persistDatabase(database);
  }
  async function dismissPurchaseEvidence(proposalId){const database=await getDatabase();delete database.ownershipProposals[proposalId];return persistDatabase(database);}
  function selectEnrichment(database,id,kind,value,now){
    const item=database.providerItems[id];const selectionRef=crypto.randomUUID();
    const observations=kind==='kindleProductComicContents'&&database.kindleContentsObservations?.[item.recordRef];
    if(observations){
      const undo=database.enrichmentHistory[observations.undoRef];
      // Only prune the one undo entry generated by this bounded model. Older
      // legacy history is retained; no historical corpus is silently purged.
      if(undo?.recordRef===item.recordRef&&undo.kind===kind)delete database.enrichmentHistory[observations.undoRef];
      observations.undoRef=selectionRef;
    }
    database.enrichmentHistory[selectionRef]={recordRef:item.recordRef,kind,selectionRef,previous:item.metadata?.enrichment?.[kind]??null,changedAt:now};
    const enrichment=validateEnrichment(kind,{...value,selectionRef,retrievedAt:value.retrievedAt??value.appliedAt??now,appliedAt:now,approved:value.approved===true,matchBasis:value.matchBasis??(kind==='googleBooks'?'validated-identifier-or-title-and-author':'source-evidence')});
    database.providerItems[id]={...item,metadata:{...item.metadata,enrichment:{...item.metadata.enrichment,[kind]:enrichment}},updatedAt:now};
    for(const [ref,review]of Object.entries(database.enrichmentReviews))if(review.source===kind&&review.recordRefs.includes(item.recordRef))delete database.enrichmentReviews[ref];
  }
  async function saveEnrichmentReview(review){
    const database=await getDatabase();const ref=crypto.randomUUID();
    const entry=validateEnrichmentReviews({[ref]:{...review,checkedAt:new Date().toISOString()}})[ref];
    const current=new Set(Object.values(database.providerItems).map(item=>item.recordRef));
    if(entry.recordRefs.some(ref=>!current.has(ref)))throw new Error('Review records are no longer current.');
    for(const [id,old]of Object.entries(database.enrichmentReviews))if(old.source===entry.source&&old.recordRefs.some(ref=>entry.recordRefs.includes(ref)))delete database.enrichmentReviews[id];
    database.enrichmentReviews[ref]=entry;return persistDatabase(database);
  }
  async function dismissEnrichmentReview(ref){const database=await getDatabase();delete database.enrichmentReviews[ref];return persistDatabase(database);}
  async function applyReviewedEnrichments(selections){
    if(!Array.isArray(selections)||!selections.length||selections.length>50)throw new Error('Review 1–50 selections at a time.');
    const database=await getDatabase();const byRef=new Map(Object.values(database.providerItems).map(item=>[item.recordRef,item]));const selected=[];
    for(const selection of selections){
      if(selection.confirmed!==true)throw new Error('Confirm each selected source before applying it.');
      const review=database.enrichmentReviews[selection.reviewId];const candidate=Number.isInteger(selection.candidateIndex)&&review?.candidates[selection.candidateIndex];
      const records=review?.recordRefs.map(ref=>byRef.get(ref));
      if(!candidate||!records?.length||records.some(record=>!record||record.mediaType!=='book'))throw new Error('A selected review no longer belongs to the active library.');
      if(review.source!=='openLibrary'){
        const conflicts=records.flatMap(record=>editionEnrichmentConflicts(record,{title:[candidate.title,candidate.subtitle].filter(Boolean).join(': '),mediaType:'book',metadata:candidate}));
        if(conflicts.length)throw new Error(`Review conflicting ${[...new Set(conflicts)].join(', ')} evidence before selecting this edition.`);
      }
      selected.push({records,kind:review.source,value:{...candidate,approved:true,matchBasis:review.source==='openLibrary'?'user-selected-work':'user-selected-edition'}});
    }
    const editionSelections=selected.filter(entry=>entry.kind!=='openLibrary');
    for(let i=0;i<editionSelections.length;i++)for(let j=i+1;j<editionSelections.length;j++){
      const left=editionSelections[i],right=editionSelections[j];
      if(!left.records.some(record=>right.records.some(other=>other.recordRef===record.recordRef)))continue;
      if(left.kind===right.kind)throw new Error('Select only one candidate per source and record.');
      const conflicts=identityConflicts({title:[left.value.title,left.value.subtitle].filter(Boolean).join(': '),mediaType:'book',metadata:left.value},{title:[right.value.title,right.value.subtitle].filter(Boolean).join(': '),mediaType:'book',metadata:right.value});
      if(conflicts.length)throw new Error(`Selected sources conflict on ${conflicts.join(', ')}. Review them separately.`);
    }
    const now=new Date().toISOString();for(const {records,kind,value}of selected)for(const record of records)selectEnrichment(database,record.id,kind,value,now);
    database.canonicalItems=rebuildCanonicalItems(database.providerItems,database.manualMatchDecisions,database.canonicalItems,database.editionSeparations);return persistDatabase(database);
  }
  async function undoEnrichmentSelection(ref){
    return undoEnrichmentSelections([ref]);
  }
  async function dismissEnrichmentReviews(refs){
    if(!Array.isArray(refs)||!refs.length||refs.length>50)throw new Error('Select 1–50 reviews.');
    const database=await getDatabase();for(const ref of refs)delete database.enrichmentReviews[ref];return persistDatabase(database);
  }
  async function undoEnrichmentSelections(refs){
    if(!Array.isArray(refs)||!refs.length||refs.length>50||new Set(refs).size!==refs.length)throw new Error('Select 1–50 distinct current selections.');
    const database=await getDatabase();const records=new Map(Object.values(database.providerItems).map(item=>[item.recordRef,item]));
    const changes=refs.map(ref=>{
      const change=database.enrichmentHistory[ref],item=change&&records.get(change.recordRef);
      if(!item||item.metadata.enrichment?.[change.kind]?.selectionRef!==change.selectionRef)throw new Error('This selection is no longer current; a newer selection or profile replaced it.');
      return {ref,change,item};
    });
    for(const {ref,change,item}of changes){
      if(change.previous===null)delete item.metadata.enrichment[change.kind];else item.metadata.enrichment[change.kind]=change.previous;
      delete database.enrichmentHistory[ref];
    }
    database.canonicalItems=rebuildCanonicalItems(database.providerItems,database.manualMatchDecisions,database.canonicalItems,database.editionSeparations);return persistDatabase(database);
  }
  async function saveOpenLibraryEnrichment(itemIds, enrichment, recordRefs) {
    if (!Array.isArray(itemIds) || !itemIds.length || !enrichment || enrichment.source !== 'open-library') {
      throw new Error('Invalid Open Library enrichment.');
    }
    const database = await getDatabase();
    const ids = [...new Set(itemIds.map(String))];
    verifyRecordRefs(database,ids,recordRefs);
    if (!ids.every((id) => database.providerItems[id]?.mediaType === 'book')) {
      throw new Error('Open Library enrichment can be applied only to current book records.');
    }
    const updatedAt = new Date().toISOString();
    for (const id of ids) {
      const item = database.providerItems[id];
      selectEnrichment(database,id,'openLibrary',enrichment,updatedAt);
    }
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    return persistDatabase(database);
  }

  async function saveGoogleBooksEnrichments(entries) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('No Google Books enrichments were provided.');
    const database = await getDatabase();
    const updatedAt = new Date().toISOString();
    for (const entry of entries) {
      const ids = [...new Set((entry?.itemIds ?? []).map(String))];
      verifyRecordRefs(database,ids,entry.recordRefs);
      if (!ids.length || !entry?.enrichment || entry.enrichment.source !== 'google-books' || !ids.every((id) => database.providerItems[id]?.mediaType === 'book')) {
        throw new Error('Invalid Google Books enrichment.');
      }
      if(entry.enrichment.approved===true){
        const candidate={title:[entry.enrichment.title,entry.enrichment.subtitle].filter(Boolean).join(': '),mediaType:'book',metadata:entry.enrichment};
        const conflicts=[...new Set(ids.flatMap(id=>editionEnrichmentConflicts(database.providerItems[id],candidate)))];
        if(conflicts.length)throw new Error(`Review conflicting ${conflicts.join(', ')} evidence before selecting this edition.`);
      }
      for (const id of ids) {
        const item = database.providerItems[id];
        selectEnrichment(database,id,'googleBooks',entry.enrichment,updatedAt);
      }
    }
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    return persistDatabase(database);
  }

  async function saveGoogleBooksGenreHints(entries) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('No Google Books genre hints were provided.');
    const database = await getDatabase();
    const updatedAt = new Date().toISOString();
    for (const entry of entries) {
      const ids = [...new Set((entry?.itemIds ?? []).map(String))];
      const categories = entry?.hint?.categories;
      if (!ids.length || entry?.hint?.source !== 'google-books' || entry.hint.confidence !== 'author-and-title-stem' || !Array.isArray(categories) || !categories.length || !ids.every((id) => database.providerItems[id]?.mediaType === 'book')) {
        throw new Error('Invalid Google Books genre hint.');
      }
      for (const id of ids) {
        const item = database.providerItems[id];
        selectEnrichment(database,id,'googleBooksGenreHint',entry.hint,updatedAt);
      }
    }
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    return persistDatabase(database);
  }

  async function saveKindleComicContents(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 100) throw new Error('No valid Kindle contents were provided.');
    const database = await getDatabase();
    applyKindleComicContents(database,entries);
    return persistDatabase(database);
  }

  function applyKindleComicContents(database,entries) {
    let endValidation=activeTiming?.begin('entry_validation');
    const updatedAt = new Date().toISOString();
    for (const entry of entries) {
      const itemId = String(entry?.itemId ?? '').trim();
      const item = database.providerItems[itemId];
      const selection=entry?.descriptionBlocks!==undefined?selectManifest(entry.descriptionBlocks,item?.title):null;
      const statement = selection?.statement ?? String(entry?.statement ?? '').replace(/\s+/gu, ' ').trim();
      const availability = selection ? statement?'statement-found':'no-statement' : (entry?.availability??'available')==='available'?statement?'statement-found':'no-statement':entry?.availability;
      let sourceUrl = '';
      try {
        const url = new URL(String(entry?.sourceUrl ?? ''));
        if (url.origin === 'https://www.amazon.com' && !url.username && !url.password && /^\/dp\//u.test(url.pathname)) sourceUrl = `${url.origin}${url.pathname}`;
      } catch { /* invalid source URL remains unusable */ }
      if (!supportedKindleContentsBook(item) || sourceUrl !== String(item.metadata?.detailUrl ?? '') || statement.length > 10000 || (statement && !selection && !/^(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b/iu.test(statement)) || (selection && (entry.extractorVersion!==KINDLE_CONTENTS_EXTRACTOR_VERSION||!['statement-found','no-statement'].includes(entry.availability))) || (!['statement-found','no-statement','unavailable','temporary-failure'].includes(availability)) || (availability!=='statement-found'&&statement) || (availability==='statement-found'&&!statement) || (entry.recordRef&&entry.recordRef!==item.recordRef) || (database.providers.kindle?.profileLabel&&!entry.recordRef) || entry.extractorVersion !== undefined && (!Number.isInteger(entry.extractorVersion) || entry.extractorVersion < 1 || entry.extractorVersion > KINDLE_CONTENTS_EXTRACTOR_VERSION)) {
        endValidation?.();throw new Error('Invalid Kindle contents entry.');
      }
      const previous = item.metadata?.enrichment?.kindleProductComicContents;
      const result = {source:'amazon-product-page',sourceUrl,statement,availability,
        ...(selection?{manifest:selection.manifest}:{}),extractorVersion:entry.extractorVersion ?? 1,
        ...(availability==='temporary-failure'?{failureCode:['captcha','sign-in','http','network'].includes(entry.failureCode)?entry.failureCode:'unknown'}:{}),checkedAt:updatedAt};
      endValidation?.();
      const parse = timed('parsing',()=>contentsParseState({...item,metadata:{...item.metadata,enrichment:{...item.metadata.enrichment,kindleProductComicContents:result}}}));
      const observations=database.kindleContentsObservations??={};
      const history=observations[item.recordRef]??={providerItemId:item.id,baseline:contentsObservation(item,previous)};
      // A record with no prior observation can pin its first trustworthy
      // observation before a later acquisition. Once pinned, never rotate it.
      if(!history.baseline&&previous&&['statement-found','no-statement','available'].includes(previous.availability))history.baseline=contentsObservation(item,previous);
      const untrustworthy=['temporary-failure','unavailable'].includes(availability);
      if(untrustworthy)history.latestAttempt=contentsObservation(item,{...result,...parse});else delete history.latestAttempt;
      if(!untrustworthy||!previous)timed('enrichment_update',()=>selectEnrichment(database,itemId,'kindleProductComicContents',{...result,...parse},updatedAt));
      endValidation=activeTiming?.begin('entry_validation');
    }
    endValidation?.();
    database.canonicalItems = timed('canonical_rebuild',()=>rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations));
  }

  async function reparseKindleContents(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 100) throw new Error('Choose 1–100 saved Kindle statements to reparse.');
    const database = await getDatabase();const now = new Date().toISOString();
    for (const entry of entries) {
      const endValidation=activeTiming?.begin('entry_validation');
      const item = database.providerItems[entry?.itemId];
      const saved = item?.metadata?.enrichment?.kindleProductComicContents;
      if (!supportedKindleContentsBook(item) || !entry.recordRef || entry.recordRef !== item.recordRef || !saved?.statement) {endValidation?.();throw new Error('The saved Kindle statement is no longer current.');}
      endValidation?.();
      const parsed=timed('parsing',()=>contentsParseState(item));
      timed('enrichment_update',()=>selectEnrichment(database,item.id,'kindleProductComicContents',{...saved,...parsed},now));
    }
    return persistDatabase(database);
  }

  async function readKindleRefresh(){return (await storageArea.get({[KINDLE_REFRESH_KEY]:null}))[KINDLE_REFRESH_KEY];}
  const queueItemCurrent=(db,target)=>{const item=db.providerItems[target.id];return supportedKindleContentsBook(item)&&item.recordRef===target.recordRef&&item.metadata.detailUrl===target.detailUrl;};
  function currentRefresh(raw,db){
    const job=validateKindleRefresh(raw);
    if(job.profileLabel!==(db.providers.kindle?.profileLabel??''))throw Error('Stale refresh profile; start a new refresh for the current library.');
    return job;
  }
  async function getKindleContentsRefresh(){
    const db=await getDatabase(),raw=await readKindleRefresh();let checkpoint=null;
    if(raw){try{checkpoint=kindleRefreshSummary(currentRefresh(raw,db));}catch{checkpoint={status:'stale'};}}
    return {eligible:Object.values(db.providerItems).filter(supportedKindleContentsBook).length,checkpoint};
  }
  async function beginKindleContentsRefresh(action,tabId,otherOwnerOpen=true,closedOwnerTabId=null){
    if(!['start','resume'].includes(action)||!Number.isInteger(tabId)||tabId<0)throw Error('Invalid refresh action.');
    const db=await getDatabase(),raw=await readKindleRefresh();
    if(raw?.status==='running'&&raw.tabId!==tabId&&(otherOwnerOpen||raw.tabId!==closedOwnerTabId))throw Error('A refresh is running in another Kindle tab. Pause or close that tab first.');
    let job;
    if(action==='resume'){
      job=currentRefresh(raw,db);
      if(!['running','paused','interrupted','blocked'].includes(job.status))throw Error('This refresh cannot resume; start a new refresh.');
      job={...job,status:'running',leaseRef:crypto.randomUUID(),tabId,updatedAt:new Date().toISOString()};delete job.blockedBy;
    }else{
      const queue=kindleContentsPlan(db,'rescan').candidates,now=new Date().toISOString();
      job={version:KINDLE_REFRESH_VERSION,extractorVersion:KINDLE_CONTENTS_EXTRACTOR_VERSION,parserVersion:CONTENTS_PARSER_VERSION,filterVersion:CONTENTS_FILTER_VERSION,manifestVersion:MANIFEST_INTERPRETATION_VERSION,runRef:crypto.randomUUID(),leaseRef:crypto.randomUUID(),
        status:queue.length?'running':'completed',profileLabel:db.providers.kindle?.profileLabel??'',queue,cursor:0,counts:{found:0,empty:0,unavailable:0,failures:0,skipped:0},tabId,startedAt:now,updatedAt:now};
    }
    job=validateKindleRefresh(job);await storageArea.set({[KINDLE_REFRESH_KEY]:job});
    // Fresh acquisition derives its own parse. Do not reparse the historical
    // observation before pinning its original parser/source metadata.
    return {candidates:job.queue.slice(job.cursor).map((item,n)=>({...item,queuePosition:job.cursor+n})),reprocess:[],eligible:job.queue.length,
      refresh:{...kindleRefreshSummary(job),leaseRef:job.leaseRef}};
  }
  function refreshLease(job,runRef,leaseRef,tabId){if(job.runRef!==runRef||job.leaseRef!==leaseRef||job.tabId!==tabId||job.status!=='running')throw Error('This refresh lease is stale; resume or start again.');}
  async function checkKindleContentsRefreshItem(runRef,leaseRef,tabId,position){
    const db=await getDatabase(),job=currentRefresh(await readKindleRefresh(),db);refreshLease(job,runRef,leaseRef,tabId);
    if(!Number.isInteger(position)||position<job.cursor||position>=Math.min(job.cursor+20,job.queue.length))throw Error('Invalid refresh queue position.');
    return {valid:queueItemCurrent(db,job.queue[position])};
  }
  async function commitKindleContentsRefresh(entries,runRef,leaseRef,tabId){
    if(!Array.isArray(entries)||!entries.length||entries.length>20)throw Error('Save 1–20 refresh observations.');
    const db=await getDatabase(),job=currentRefresh(await readKindleRefresh(),db);refreshLease(job,runRef,leaseRef,tabId);
    const accepted=[];
    for(const [offset,entry]of entries.entries()){
      const target=job.queue[job.cursor],position=job.cursor;
      if(!target||entry.queuePosition!==position||entry.itemId!==target.id||entry.recordRef!==target.recordRef)throw Error('Stale or out-of-order refresh checkpoint.');
      const current=queueItemCurrent(db,target);
      if(entry.skip&&current)throw Error('Cannot skip a current eligible refresh record.');
      if(current&&!entry.skip&&entry.extractorVersion!==KINDLE_CONTENTS_EXTRACTOR_VERSION)throw Error('Refresh requires the current source generation.');
      const blocked=current&&entry.availability==='temporary-failure'&&['captcha','sign-in'].includes(entry.failureCode);
      if(blocked&&offset!==entries.length-1)throw Error('A blocked refresh must stop requests.');
      if(current&&!entry.skip)accepted.push({entry,counted:!blocked});
      if(blocked){job.status='blocked';job.blockedBy=entry.failureCode;break;}
      job.cursor++;
      if(!current)job.counts.skipped++;
    }
    if(accepted.length){
      applyKindleComicContents(db,accepted.map(row=>row.entry));
      // Worker selection is authoritative; adapter preliminary counts may
      // differ from the saved selected source. Rebuild only once per batch.
      for(const {entry,counted}of accepted)if(counted){
        const item=db.providerItems[entry.itemId],outcome=(db.kindleContentsObservations[item.recordRef].latestAttempt??item.metadata.enrichment.kindleProductComicContents).availability;
        job.counts[outcome==='temporary-failure'?'failures':outcome==='unavailable'?'unavailable':outcome==='no-statement'?'empty':'found']++;
      }
    }
    if(job.cursor===job.queue.length)job.status='completed';job.updatedAt=new Date().toISOString();
    const checkpoint=validateKindleRefresh(job);
    // Evidence and cursor acknowledge together in the single private store
    // transaction. A lost reply safely repeats only unacknowledged work.
    await persistDatabase(db,null,{[KINDLE_REFRESH_KEY]:checkpoint});return kindleRefreshSummary(checkpoint);
  }
  async function finishKindleContentsRefresh(runRef,leaseRef,tabId,status){
    const db=await getDatabase(),job=currentRefresh(await readKindleRefresh(),db);
    if(job.runRef!==runRef||job.leaseRef!==leaseRef||job.tabId!==tabId)throw Error('Stale refresh lifecycle request.');
    if(!['paused','aborted','completed','interrupted'].includes(status))throw Error('Invalid refresh finish state.');
    if(job.status==='completed'||job.status==='blocked'&&status!=='aborted')return kindleRefreshSummary(job);
    if(status==='completed'&&job.cursor!==job.queue.length)throw Error('Refresh still has pending records.');
    job.status=status;job.updatedAt=new Date().toISOString();await storageArea.set({[KINDLE_REFRESH_KEY]:validateKindleRefresh(job)});return kindleRefreshSummary(job);
  }
  async function interruptKindleContentsRefresh(tabId=null){
    const raw=await readKindleRefresh();if(raw?.status!=='running'||tabId!==null&&raw.tabId!==tabId)return;
    const job=validateKindleRefresh(raw);job.status='interrupted';job.leaseRef='';job.tabId=null;job.updatedAt=new Date().toISOString();
    await storageArea.set({[KINDLE_REFRESH_KEY]:job});
  }

  async function removeManualMatchDecision(candidateId) {
    const database = await getDatabase();
    delete database.manualMatchDecisions[candidateId];
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    return persistDatabase(database);
  }

  async function separateEdition(itemId) {
    const database=await getDatabase();
    const group=Object.values(database.canonicalItems).find(value=>value.providerItemIds.includes(itemId));
    if(!group||group.providerItemIds.length<2)throw new Error('This record is already a separate edition.');
    database.editionSeparations[crypto.randomUUID()]={itemId,otherItemIds:group.providerItemIds.filter(id=>id!==itemId),updatedAt:new Date().toISOString()};
    return persistDatabase(database);
  }

  async function undoEditionSeparation(ref) {
    const database=await getDatabase();
    if(!Object.hasOwn(database.editionSeparations,ref))throw new Error('This edition separation no longer exists.');
    delete database.editionSeparations[ref];
    return persistDatabase(database);
  }

  async function saveContentReview(itemId, value) {
    const database=await getDatabase();
    if (!database.providerItems[itemId] || !['book','game'].includes(database.providerItems[itemId].mediaType)) throw new Error('Contents can be reviewed only for a current book or game record.');
    database.contentReviews[itemId]=validateContentReview({...value,verifiedAt:new Date().toISOString()});
    return persistDatabase(database);
  }

  async function removeContentReview(itemId) {
    const database=await getDatabase();delete database.contentReviews[itemId];return persistDatabase(database);
  }

  async function addAllowedExternalClientId(id) {
    const ids = await getAllowedExternalClientIds();
    return saveAllowedExternalClientIds([...ids, id]);
  }

  async function getUiPreferences() {
    const stored = await storageArea.get({ [UI_PREFERENCES_KEY]: defaultUiPreferences() });
    try { return validateUiPreferences(stored[UI_PREFERENCES_KEY]); } catch { return defaultUiPreferences(); }
  }
  async function saveUiPreferences(patch) {
    validateUiPreferences(patch);
    const current = await getUiPreferences();
    const next = validateUiPreferences({ ...current, ...patch, library: { ...current.library, ...patch.library }, books: { ...current.books, ...patch.books } });
    await storageArea.set({ [UI_PREFERENCES_KEY]: next });
    return next;
  }
  async function getShowEnrichmentActions() {
    const stored = await storageArea.get({ [SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]: true });
    return stored[SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY] !== false;
  }

  async function saveShowEnrichmentActions(value) {
    const checked = value !== false;
    await storageArea.set({ [SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]: checked });
    return checked;
  }


  async function saveReminderReview(ref,action,basis,until=null){
    const database=await getDatabase(),entry=libraryReminders(database,Date.now(),true).find(item=>item.reminderRef===ref);
    if(!entry||entry.basis!==basis)throw new Error('This reminder changed. Refresh before reviewing.');
    if(action==='restore')delete database.reminderReviews[ref];
    else{
      if(!['dismissed','snoozed'].includes(action))throw new Error('Invalid reminder action.');
      const deadline=date(until);if(action==='snoozed'&&(!deadline||Date.parse(deadline)<=Date.now()||Date.parse(deadline)>Date.now()+366*86400000))throw new Error('Snooze must end within the next year.');
      database.reminderReviews[ref]={action,basis,until:action==='snoozed'?deadline:null,updatedAt:new Date().toISOString()};
    }
    return persistDatabase(database);
  }
  async function getReminderNotificationSettings(){
    const stored=await storageArea.get({[NOTIFICATIONS]:null}),value=stored[NOTIFICATIONS];
    return {enabled:value?.enabled===true,lastNotifiedDay:/^\d{4}-\d{2}-\d{2}$/u.test(value?.lastNotifiedDay??'')?value.lastNotifiedDay:''};
  }
  async function saveReminderNotificationSettings(enabled){
    if(typeof enabled!=='boolean')throw new Error('Invalid notification preference.');
    const prior=await getReminderNotificationSettings(),value={...prior,enabled};await storageArea.set({[NOTIFICATIONS]:value});return value;
  }
  async function reserveReminderNotification(day){
    if(!/^\d{4}-\d{2}-\d{2}$/u.test(day)||!date(day))throw new Error('Invalid notification date.');
    const settings=await getReminderNotificationSettings();if(!settings.enabled||settings.lastNotifiedDay===day)return false;
    await storageArea.set({[NOTIFICATIONS]:{...settings,lastNotifiedDay:day}});return true;
  }
  async function releaseReminderNotification(day){
    const settings=await getReminderNotificationSettings();if(settings.lastNotifiedDay===day)await storageArea.set({[NOTIFICATIONS]:{...settings,lastNotifiedDay:''}});
  }

  function currentReadingRecord(database,ref,expected){
    const item=Object.values(database.providerItems).find(record=>record.recordRef===ref&&READING_MEDIA.includes(record.mediaType));
    if(!item)throw new Error('This reading record is not in the current library.');
    if((database.readingStates[ref]?.revisionRef??null)!==expected)throw new Error('Reading state changed. Refresh before saving.');return item;
  }
  async function saveReadingState(ref,value,expected=null){
    const database=await getDatabase();currentReadingRecord(database,ref,expected);
    database.readingStates[ref]=validateReadingState({...value,revisionRef:crypto.randomUUID(),accessCheckedAt:value.access==='unknown'?null:new Date().toISOString(),updatedAt:new Date().toISOString()});return persistDatabase(database);
  }
  async function removeReadingState(ref,expected){
    const database=await getDatabase();currentReadingRecord(database,ref,expected);delete database.readingStates[ref];return persistDatabase(database);
  }
  async function saveReadingOrder(ref,title,recordRefs,expected=null){
    const database=await getDatabase(),previous=ref?database.readingOrders[ref]:null;
    if(ref&&!previous||(previous?.revisionRef??null)!==expected)throw new Error('Reading order changed. Refresh before saving.');
    const order=validateReadingOrder({title,recordRefs,revisionRef:crypto.randomUUID(),updatedAt:new Date().toISOString()});
    const active=new Set(Object.values(database.providerItems).filter(item=>READING_MEDIA.includes(item.mediaType)).map(item=>item.recordRef));
    if(order.recordRefs.some(itemRef=>!active.has(itemRef)&&!previous?.recordRefs.includes(itemRef)))throw new Error('New order entries must be current books or audiobooks.');
    const orderRef=ref??crypto.randomUUID();database.readingOrders[orderRef]=order;return {database:await persistDatabase(database),orderRef};
  }
  async function removeReadingOrder(ref,expected){
    const database=await getDatabase(),order=database.readingOrders[ref];if(!order||order.revisionRef!==expected)throw new Error('Reading order changed. Refresh before deleting.');delete database.readingOrders[ref];return persistDatabase(database);
  }

  async function feedUploads(){return (await storageArea.get({[FEED_UPLOAD_KEY]:{}}))[FEED_UPLOAD_KEY];}
  async function feedClient(client,external=false){if(!isExtensionId(client))throw new Error('Invalid reminder client.');if(external&&!(await getAllowedExternalClientIds()).includes(client))throw new Error('Companion permission was revoked.');}
  async function beginCompanionFeed(client,value,external=false){
    await feedClient(client,external);const database=await getDatabase(),profileLabel=text(value?.profileLabel,100,'Humble profile');
    if(!profileLabel||database.providers.humble?.profileLabel!==profileLabel)throw new Error('The GL Humble profile does not match. Confirm the same account and enter its current GL profile label.');
    if(!Number.isSafeInteger(value.count)||value.count<0||value.count>100000||!['complete','partial'].includes(value.coverage)||!date(value.sentAt))throw new Error('Invalid reminder feed summary.');
    const uploads=Object.fromEntries(Object.entries(await feedUploads()).filter(([key,entry])=>key!==client&&entry.expiresAt>Date.now()));
    if(Object.keys(uploads).length>=64)throw new Error('Too many active reminder uploads.');
    const uploadToken=crypto.randomUUID();uploads[client]={uploadToken,profileLabel,count:value.count,coverage:value.coverage,sentAt:date(value.sentAt),expiresAt:Date.now()+600000,entries:[]};await storageArea.set({[FEED_UPLOAD_KEY]:uploads});return {uploadToken};
  }
  async function activeFeedUpload(client,token,external=false){
    await feedClient(client,external);const uploads=await feedUploads(),upload=uploads[client];if(!upload||upload.uploadToken!==token||upload.expiresAt<=Date.now())throw new Error('Reminder upload expired or was superseded. Send it again.');
    const database=await getDatabase();if(database.providers.humble?.profileLabel!==upload.profileLabel)throw new Error('The GL Humble profile changed during reminder sharing.');return {uploads,upload,database};
  }
  async function appendCompanionFeed(client,token,offset,entries,external=false){
    const {uploads,upload}=await activeFeedUpload(client,token,external);
    if(!Number.isSafeInteger(offset)||offset!==upload.entries.length||!Array.isArray(entries)||!entries.length||entries.length>200||offset+entries.length>upload.count)throw new Error('Invalid reminder batch or offset.');
    const next=entries.map(validateEntitlementEntry),refs=new Set(upload.entries.map(entry=>entry.itemRef));for(const entry of next){if(refs.has(entry.itemRef))throw new Error('Duplicate reminder reference.');refs.add(entry.itemRef);}
    if(Object.values(uploads).reduce((sum,entry)=>sum+entry.entries.length,0)+next.length>100000)throw new Error('Active reminder uploads exceed their bound.');
    upload.entries.push(...next);await storageArea.set({[FEED_UPLOAD_KEY]:uploads});return {received:upload.entries.length};
  }
  async function commitCompanionFeed(client,token,external=false){
    const {uploads,upload,database}=await activeFeedUpload(client,token,external);if(upload.entries.length!==upload.count)throw new Error('Reminder feed is incomplete; prior reminders retained.');
    const previous=database.companionFeeds[client],refs=new Map(previous?.profileLabel===upload.profileLabel?previous.entries.map(entry=>[entry.itemRef,entry.localRef]):[]);
    database.companionFeeds[client]={profileLabel:upload.profileLabel,coverage:upload.coverage,sentAt:upload.sentAt,receivedAt:new Date().toISOString(),revisionRef:crypto.randomUUID(),entries:upload.entries.map(entry=>({...entry,localRef:refs.get(entry.itemRef)??crypto.randomUUID()}))};
    delete uploads[client];await storageArea.set({[DATABASE_STORAGE_KEY]:validateDatabase(database),[FEED_UPLOAD_KEY]:uploads});return {count:upload.entries.length};
  }
  async function removeCompanionFeed(client,external=false){
    await feedClient(client,external);const database=await getDatabase(),uploads=await feedUploads();delete database.companionFeeds[client];delete uploads[client];await storageArea.set({[DATABASE_STORAGE_KEY]:validateDatabase(database),[FEED_UPLOAD_KEY]:uploads});return {count:0};
  }
  const operations = {
    saveOwnershipPolicy,
    beginCompanionFeed,appendCompanionFeed,commitCompanionFeed,removeCompanionFeed,
    saveReadingState,removeReadingState,saveReadingOrder,removeReadingOrder,
    saveReminderReview,getReminderNotificationSettings,saveReminderNotificationSettings,reserveReminderNotification,releaseReminderNotification,
    getDatabase, restoreDatabase, replaceProviderItems, mergeProviderItems, clearDatabase, beginProviderScan, commitProviderScan, importUnscopedProviderItems,failProviderScan,cancelProviderScan,
    getGoogleBooksApiKey, saveGoogleBooksApiKey, getGoogleBooksEnrichmentJob,
    saveGoogleBooksEnrichmentJob:async value=>{const job=await getGoogleBooksEnrichmentJob();if(job?.runId&&job.leaseUntil>Date.now())throw new Error('Use the active enrichment checkpoint to update progress.');return saveGoogleBooksEnrichmentJob(value);}, clearGoogleBooksEnrichmentJob, startGoogleBooksEnrichmentJob, acquireEnrichmentRun, commitEnrichmentBatch, finishEnrichmentRun,
    getAllowedExternalClientIds, saveAllowedExternalClientIds, addAllowedExternalClientId,
    saveManualMatchDecision, removeManualMatchDecision, saveOpenLibraryEnrichment, saveEnrichmentReview, dismissEnrichmentReview, undoEnrichmentSelection, applyReviewedEnrichments, dismissEnrichmentReviews, undoEnrichmentSelections,
    saveGoogleBooksEnrichments, saveGoogleBooksGenreHints, saveKindleComicContents, reparseKindleContents,
    getKindleContentsRefresh,beginKindleContentsRefresh,checkKindleContentsRefreshItem,commitKindleContentsRefresh,finishKindleContentsRefresh,interruptKindleContentsRefresh,
    saveContentReview, removeContentReview,
    separateEdition, undoEditionSeparation, saveTitleAliases,saveOwnershipReview,removeOwnershipReview,importPurchaseEvidence,refreshPurchaseEvidence,applyPurchaseEvidence,dismissPurchaseEvidence,
    getShowEnrichmentActions, saveShowEnrichmentActions, getUiPreferences, saveUiPreferences
  };
  let tail = Promise.resolve();

  function execute(operation, args = [], timing = null) {
    if (!STORAGE_OPERATIONS.includes(operation) || !Array.isArray(args)) {
      return Promise.reject(new Error('Unsupported Galactic Library storage operation.'));
    }
    // Capture the request at admission, before callers can mutate it.
    let values;
    const captureEnd=timing?.begin('writer_capture');
    try { values = structuredClone(args); }
    catch { return Promise.reject(new Error('Invalid Galactic Library storage arguments.')); }
    finally {captureEnd?.();}
    const queueEnd=timing?.begin('writer_queue');
    const result = tail.then(() => ready).then(timing ? async () => {
      queueEnd();activeTiming=timing;
      try{return await operations[operation](...values);}finally{activeTiming=null;}
    } : () => operations[operation](...values));
    // A rejected operation never poisons the queue; later requests still run.
    tail = result.catch(() => {});
    return result;
  }

  return Object.freeze({
    execute,
    ...Object.fromEntries(STORAGE_OPERATIONS.map((name) => [name, (...args) => execute(name, args)]))
  });
}
