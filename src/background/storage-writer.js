import { DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY, PROVIDERS } from '../lib/constants.js';
import { normaliseExternalClientIds } from '../lib/external-api.js';
import { isConfirmedComicManga } from '../lib/genre-hints.js';
import { createEmptyDatabase, normalizeProviderItem, providerItemKey, rebuildCanonicalItems, validateDatabase } from '../lib/models.js';
import { STORAGE_OPERATIONS } from '../lib/storage-protocol.js';
import { validateProviderSnapshot } from '../lib/provider-snapshot.js';
import { validateContentReview,proposeContents } from '../lib/contents.js';
import { identityConflicts, identityEvidence, editionEnrichmentConflicts } from '../lib/identity.js';
import { PROVIDER_SOURCES } from '../lib/metadata-validation.js';
import { text } from '../lib/validation.js';
import {needsGoogleBooksEnrichment} from '../lib/enrichment.js';
import {validateEnrichment} from '../lib/metadata-validation.js';
import {validateEnrichmentReviews} from '../lib/enrichment-state.js';
import {validateTitleAliases} from '../lib/title-aliases.js';

/**
 * Instantiate once in the service worker. Every read and mutation shares this
 * queue, including calls made directly by provider message handlers. No client
 * context owns a writer or writes a cached database snapshot.
 */
export function createStorageWriter(storageArea, ready = Promise.resolve()) {
  const SCANS='galacticLibraryProviderScans';
  async function beginProviderScan(provider,profile,mode='full',switchProfile=false,tabId=null) {
    if(!PROVIDERS.includes(provider)||!['full','incremental'].includes(mode))throw new Error('Invalid provider scan.');
    const profileLabel=text(profile,100,'Account/profile label');if(!profileLabel)throw new Error('Enter an account/profile label and confirm the signed-in account before scanning.');
    const database=await getDatabase();const prior=database.providers[provider]?.profileLabel??'';
    const changing=Boolean(prior)&&prior!==profileLabel;
    if(changing&&(mode!=='full'||switchProfile!==true))throw new Error('A different account/profile is active. Choose Full rescan and explicitly switch profiles; the previous library will be archived.');
    const forceFull=changing||!prior||!database.providers[provider]?.fullSyncAt;
    const stored=await storageArea.get({[SCANS]:{}});const scans=stored[SCANS]??{};const scanToken=crypto.randomUUID();
    scans[provider]={scanToken,profileLabel,priorProfileLabel:prior,mode:forceFull?'full':mode,tabId,startedAt:new Date().toISOString()};
    await storageArea.set({[SCANS]:scans});
    return {scanToken,forceFull,profileLabel,database};
  }
  async function commitProviderScan(provider,values,syncDetails,snapshot,scanToken,tabId=null) {
    const stored=await storageArea.get({[SCANS]:{}});const scan=stored[SCANS]?.[provider];
    if(!scan||scan.scanToken!==scanToken||scan.tabId!==tabId)throw new Error('This scan was superseded by another scan, clear, restore, or profile change. Start a fresh scan.');
    if(!['full','incremental'].includes(syncDetails.syncMode)||scan.mode==='full'&&syncDetails.syncMode!=='full')throw new Error('This account/profile requires a complete full scan.');
    const details={...syncDetails,profileLabel:scan.profileLabel};
    return syncDetails.syncMode==='full'?replaceProviderItems(provider,values,details,snapshot):mergeProviderItems(provider,values,details);
  }
  async function restoreDatabase(database){return persistDatabase(database,'all');}
  async function importUnscopedProviderItems(provider,values,details,snapshot){
    const database=await getDatabase();
    if(database.providers[provider]?.profileLabel)throw new Error('Reload the provider page and start a confirmed profile scan.');
    return details.syncMode==='incremental'?mergeProviderItems(provider,values,details):replaceProviderItems(provider,values,details,snapshot);
  }
  async function getDatabase() {
    const stored = await storageArea.get({ [DATABASE_STORAGE_KEY]: null });
    if (!stored[DATABASE_STORAGE_KEY]) return createEmptyDatabase();
    const database = validateDatabase(stored[DATABASE_STORAGE_KEY]);
    if (JSON.stringify(stored[DATABASE_STORAGE_KEY]) !== JSON.stringify(database)) {
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
      await storageArea.set(migrated);
    }
    return database;
  }

  async function persistDatabase(database,invalidate=null) {
    const validated = validateDatabase(database);
    const updates={[DATABASE_STORAGE_KEY]:validated};
    if(invalidate){const stored=await storageArea.get({[SCANS]:{}});const scans=invalidate==='all'?{}:{...stored[SCANS]};if(invalidate!=='all')delete scans[invalidate];updates[SCANS]=scans;}
    if(invalidate==='all'){const stored=await storageArea.get({[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]:null});if(stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY])updates[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]=null;}
    await storageArea.set(updates);
    return validated;
  }

  function preserveEnrichment(incoming, previous) {
    if (previous?.recordRef) incoming = {...incoming, recordRef: previous.recordRef};
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
    const audiobookCount = records.filter((item) => item.mediaType === 'audiobook').length;
    const bookCount = records.filter((item) => item.mediaType === 'book').length;
    const movieCount = records.filter((item) => item.mediaType === 'movie').length;
    const tvCount = records.filter((item) => item.mediaType === 'tv').length;
    const linkedAddOnCount = records.filter((item) => {
      const parentId = String(item.metadata?.parentProviderItemId ?? '').trim();
      return item.mediaType === 'game-addon' && parentId && unique.has(providerItemKey(item.provider, parentId));
    }).length;
    database.providerItems = { ...retained, ...Object.fromEntries(unique) };
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    database.providers[provider] = {
      ...(changing?{}:database.providers[provider]),
      connected: true,
      itemCount: gameCount,
      addOnCount,
      audiobookCount,
      bookCount,
      movieCount,
      tvCount,
      linkedAddOnCount,
      recordCount: unique.size,
      lastSync: now,
      lastError: null,
      ...syncDetails,
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
    database.providerItems = { ...database.providerItems, ...Object.fromEntries(unique) };
    for(const [ref,entry]of Object.entries(database.providerHistory))if(entry.item.provider===provider&&entry.profileLabel===(database.providers[provider]?.profileLabel??'')&&unique.has(entry.item.id))delete database.providerHistory[ref];
    const records = Object.values(database.providerItems).filter((item) => item.provider === provider);
    const gameCount = records.filter((item) => item.mediaType === 'game').length;
    const addOnCount = records.filter((item) => item.mediaType === 'game-addon').length;
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
      audiobookCount,
      bookCount,
      movieCount,
      tvCount,
      linkedAddOnCount,
      recordCount: records.length,
      lastSync: now,
      lastError: null,
      ...syncDetails
    };
    return persistDatabase(database,provider);
  }

  async function clearDatabase() {
    await storageArea.remove([DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY, SCANS]);
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
  function selectEnrichment(database,id,kind,value,now){
    const item=database.providerItems[id];const selectionRef=crypto.randomUUID();
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
    if (!Array.isArray(entries) || !entries.length || entries.length > 100) throw new Error('No valid Kindle comic contents were provided.');
    const database = await getDatabase();
    const updatedAt = new Date().toISOString();
    for (const entry of entries) {
      const itemId = String(entry?.itemId ?? '').trim();
      const item = database.providerItems[itemId];
      const statement = String(entry?.statement ?? '').replace(/\s+/gu, ' ').trim().replace(/[.!?]+$/u, '');
      const availability = (entry?.availability??'available')==='available'?statement?'statement-found':'no-statement':entry?.availability;
      const failed=availability==='temporary-failure';
      const proposal=statement?proposeContents(statement):null;
      let sourceUrl = '';
      try {
        const url = new URL(String(entry?.sourceUrl ?? ''));
        if (url.origin === 'https://www.amazon.com' && /^\/dp\//u.test(url.pathname)) sourceUrl = `${url.origin}${url.pathname}`;
      } catch { /* invalid source URL remains unusable */ }
      if (!item || item.provider !== 'kindle' || item.mediaType !== 'book' || !isConfirmedComicManga(item) || sourceUrl !== String(item.metadata?.detailUrl ?? '') || statement.length > 700 || (statement && !/^collects?\b/iu.test(statement)) || (!['statement-found','no-statement','unavailable','temporary-failure'].includes(availability)) || (availability!=='statement-found'&&statement) || (availability==='statement-found'&&!statement) || (entry.recordRef&&entry.recordRef!==item.recordRef) || (database.providers.kindle?.profileLabel&&!entry.recordRef)) {
        throw new Error('Invalid Kindle comic contents entry.');
      }
      selectEnrichment(database,itemId,'kindleProductComicContents',{source:'amazon-product-page',sourceUrl,statement,availability,parseStatus:proposal?(proposal.entries.length&&!proposal.unparsed.length?'parsed':'unparsed'):'not-attempted',...(failed?{failureCode:['captcha','http','network'].includes(entry.failureCode)?entry.failureCode:'unknown'}:{}),checkedAt:updatedAt},updatedAt);
    }
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    return persistDatabase(database);
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

  async function getShowEnrichmentActions() {
    const stored = await storageArea.get({ [SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]: true });
    return stored[SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY] !== false;
  }

  async function saveShowEnrichmentActions(value) {
    const checked = value !== false;
    await storageArea.set({ [SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]: checked });
    return checked;
  }

  const operations = {
    getDatabase, restoreDatabase, replaceProviderItems, mergeProviderItems, clearDatabase, beginProviderScan, commitProviderScan, importUnscopedProviderItems,
    getGoogleBooksApiKey, saveGoogleBooksApiKey, getGoogleBooksEnrichmentJob,
    saveGoogleBooksEnrichmentJob:async value=>{const job=await getGoogleBooksEnrichmentJob();if(job?.runId&&job.leaseUntil>Date.now())throw new Error('Use the active enrichment checkpoint to update progress.');return saveGoogleBooksEnrichmentJob(value);}, clearGoogleBooksEnrichmentJob, startGoogleBooksEnrichmentJob, acquireEnrichmentRun, commitEnrichmentBatch, finishEnrichmentRun,
    getAllowedExternalClientIds, saveAllowedExternalClientIds, addAllowedExternalClientId,
    saveManualMatchDecision, removeManualMatchDecision, saveOpenLibraryEnrichment, saveEnrichmentReview, dismissEnrichmentReview, undoEnrichmentSelection, applyReviewedEnrichments, dismissEnrichmentReviews, undoEnrichmentSelections,
    saveGoogleBooksEnrichments, saveGoogleBooksGenreHints, saveKindleComicContents,
    saveContentReview, removeContentReview,
    separateEdition, undoEditionSeparation, saveTitleAliases,
    getShowEnrichmentActions, saveShowEnrichmentActions
  };
  let tail = Promise.resolve();

  function execute(operation, args = []) {
    if (!STORAGE_OPERATIONS.includes(operation) || !Array.isArray(args)) {
      return Promise.reject(new Error('Unsupported Galactic Library storage operation.'));
    }
    // Capture the request at admission, before callers can mutate it.
    let values;
    try { values = structuredClone(args); }
    catch { return Promise.reject(new Error('Invalid Galactic Library storage arguments.')); }
    const result = tail.then(() => ready).then(() => operations[operation](...values));
    // A rejected operation never poisons the queue; later requests still run.
    tail = result.catch(() => {});
    return result;
  }

  return Object.freeze({
    execute,
    ...Object.fromEntries(STORAGE_OPERATIONS.map((name) => [name, (...args) => execute(name, args)]))
  });
}
