import {providerScanMode} from '../lib/provider-scan-mode.js';
import {normalizePermanentClaimsDatabase} from '../lib/ownership.js';
import {validateAudibleHistory,enrichAudibleRecords,audibleGiftHistory,audibleLibraryExpiry} from '../lib/audible-ownership.js';
import {validateSteamApplicationImport,steamApplicationAccess} from '../lib/provider-state.js';
import {identicalCapture} from '../lib/source-history.js';
import {prepareAmazonGamesImport} from '../lib/amazon-games-reconciliation.js';
import {addSeriesMerge,mergeCoverageGroups,continuityProblem} from '../lib/comic-series-merges.js';
import {comicCoverageNameKey} from '../lib/comic-series-names.js';
import {comicCoverage} from '../lib/comic-coverage.js';
import {applyPurchaseSnapshot,preserveHumbleEntitlementReference} from './purchase-handoff.js';
import {mergeProductDetailsEvidence} from '../lib/kindle-product-details.js';
import {effectiveExternalClientIds,allowedCompanionOperation} from '../lib/companion-identities.js';
import {enumerateProviderProfiles,profileDependencies,removeProfileData} from '../lib/profile-management.js';
import {strictDatabaseSerialization} from '../lib/validation-certificate.js';
import {newProviderProfile} from '../lib/provider-profiles.js';
import {preserveKoboObservation,koboObservationChanged} from '../lib/kobo-observations.js';
import {equalDatabaseData} from '../lib/data-equality.js';
import {createValidationCertificates} from '../lib/validation-certificate.js';
import {registerCommittedSnapshot,committedSnapshotSequence,registerEffectiveSnapshot,isCommittedSnapshot,committedCatalogSnapshot,reuseCommittedIdentity} from '../lib/committed-snapshot.js';
import {OBSERVATION_KEY,OBSERVATION_HEAD_KEY,validateObservationOverlay,materializeObservations,observationToken,observationStatusChecks,consolidateObservations} from '../lib/observation-overlays.js';
import {OBSERVATION_REGISTRATION,isObservationTransaction,activeObservationEnvelope,validateActiveEnvelope,validateObservationJournal,providerObservationToken,retainedCompletions,observationCorruption} from '../lib/observation-transactions.js';
import {validateProviderStates} from '../lib/provider-state.js';
import {observationCompletionEntry} from '../lib/observation-completion.js';
import {diagnosticStorageKey} from '../lib/query-diagnostics.js';
import '../lib/contents-performance.js';
import { UI_PREFERENCES_KEY, defaultUiPreferences, validateUiPreferences, mergeUiPreferences } from '../lib/ui-preferences.js';
import {validateOwnershipPolicy,effectiveOwnershipRecord} from '../lib/ownership.js';
import { DATABASE_SCHEMA_VERSION, DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY, PROVIDERS } from '../lib/constants.js';
import { isExtensionId, normaliseExternalClientIds } from '../lib/external-api.js';
import {supportedKindleContentsBook, contentsParseState, kindleContentsPlan, KINDLE_CONTENTS_EXTRACTOR_VERSION} from '../lib/kindle-contents.js';
import {KINDLE_REFRESH_KEY,KINDLE_REFRESH_ARCHIVES_KEY,bindKindleRefresh,KINDLE_REFRESH_VERSION,validateKindleRefresh,kindleRefreshSummary} from '../lib/kindle-contents-refresh.js';
import {selectManifest,MANIFEST_INTERPRETATION_VERSION} from '../lib/kindle-manifest.js';
import {CONTENTS_FILTER_VERSION} from '../lib/contents-quality.js';
import {contentsSourceBaseline} from '../lib/contents.js';
import {contentsConfirmation,contentsConfirmationToken,sameConfirmedContents} from '../lib/contents-confirmation.js';
import {applyCoverageResolutions,applyCoverageReferenceDecision} from '../lib/coverage-resolution.js';
import {contentsObservation} from '../lib/kindle-contents-observations.js';
import { createEmptyDatabase, normalizeProviderItem, providerItemKey, rebuildCanonicalItems, validateDatabase,validateDatabaseAsync } from '../lib/models.js';
import { STORAGE_OPERATIONS } from '../lib/storage-protocol.js';
import { validateProviderSnapshot } from '../lib/provider-snapshot.js';
import { validateContentReview,CONTENTS_PARSER_VERSION } from '../lib/contents.js';
import { identityConflicts, identityEvidence, editionEnrichmentConflicts } from '../lib/identity.js';
import { PROVIDER_SOURCES } from '../lib/metadata-validation.js';
import { text } from '../lib/validation.js';
import {needsGoogleBooksEnrichment} from '../lib/enrichment.js';
import {validateEnrichment} from '../lib/metadata-validation.js';
import {validateKindleCategoryPaths} from '../lib/kindle-categories.js';
import {validateEnrichmentReviews} from '../lib/enrichment-state.js';
import {validateTitleAliases} from '../lib/title-aliases.js';
import {mergePurchaseOrigins} from '../lib/purchase-origins.js';
import {validateOwnershipReview,purchaseEvidence,purchaseCandidates} from '../lib/ownership-review.js';
import {FEED_UPLOAD_KEY,validateEntitlementEntry} from '../lib/companion-entitlements.js';
import {validateReadingState,validateReadingOrder,READING_MEDIA} from '../lib/reading.js';
import {libraryReminders} from '../lib/reminders.js';
import {date} from '../lib/validation.js';
import {validateSyncHealth,snapshotDifferences,SYNC_FAILURE_CODES,providerScanDisplay} from '../lib/sync-health.js';
import {PROVIDER_CHECKS_KEY,providerCheckDigest,validProviderChecks,providerCheckPatch,providerCheckBaseline,applyProviderChecks} from '../lib/provider-scan-checks.js';

/**
 * Instantiate once in the service worker. Mutations and ordinary storage
 * operations share one queue. Integration queries use detached committed read
 * snapshots. Provider/refresh reads can reuse validation only after a fresh,
 * exact whole-value snapshot comparison or protected session proof. They return
 * a separate mutable value; incoming data and saves still require validation.
 */
export function createStorageWriter(storageArea, ready = Promise.resolve(), {cacheRefreshPreflight=false,cacheQuerySnapshots=false,diagnostics=null,certificateArea=null,importSessionArea=null,observationCompletions=false,onPurchaseSyncInvalidated=()=>{}} = {}) {
  const PROFILE_HINTS='galacticLibraryProviderProfileHints';
  const profileHints=database=>Object.fromEntries(['kobo'].map(provider=>{
    const profiles=Object.values(database.providerProfiles).filter(p=>p.provider===provider),profile=database.providerProfiles[database.providers[provider]?.activeProfileId];
    return [provider,profile?{profileId:profile.profileId,nickname:profile.nickname,count:profiles.length}:null];
  }));
  async function getProviderProfileHint(provider,timing=null){
    let end=timing?.begin('provider_hint_ready');
    try{await ready;}finally{end?.();}
    end=timing?.begin('provider_hint_read');let hints;
    try{hints=(await committedArea.get({[PROFILE_HINTS]:{}}))[PROFILE_HINTS];}finally{end?.();}
    const hint=hints?.[provider];
    const status=!hint?'missing':hint.count>1?'ambiguous':provider!=='kobo'||typeof hint.profileId!=='string'||hint.profileId.length>100||typeof hint.nickname!=='string'||hint.nickname.length>100||hint.count!==1?'invalid':'found';
    if(timing)timing.profileHintStatus=status;
    if(status!=='found')return null;
    return hint; // Display only. Never a source of account/write authorization.
  }
  function rememberProviderProfileHints(database){
    // Advisory metadata writes still share the single mutation queue.
    const result=tail.then(async()=>{
      await ready;
      const hints=profileHints(database),previous=(await committedArea.get({[PROFILE_HINTS]:{}}))[PROFILE_HINTS];
      if(equalDatabaseData(hints,previous)||cacheQuerySnapshots&&querySnapshot!==database)return;
      await storageArea.set({[PROFILE_HINTS]:hints});
    });
    tail=result.catch(()=>{});return result;
  }
  const certificates=createValidationCertificates(certificateArea);
  let activeTiming = null;
  let activeOperation=null;
  const activity=(stage,details)=>diagnostics?.begin(stage,details)??(()=>{});
  const snapshotEvent=(reason,source,previousSnapshot=0)=>diagnostics?.event('snapshot_change',{reason,source,operation:activeOperation,epoch:querySnapshotEpoch,snapshot:committedSnapshotSequence(querySnapshot),previousSnapshot});
  const storageKey=keys=>{const list=Array.isArray(keys)?keys:Object.keys(keys??{});return list.includes(DATABASE_STORAGE_KEY)?'database':list.length===1?diagnosticStorageKey(list[0]):'settings';};
  const committedArea=storageArea;
  let querySnapshot=null,querySnapshotEpoch=0,querySnapshotPending=null,querySnapshotsUsed=false;
  let providerChecksPresent=false;
  const checkDigests=new WeakMap();
  const checkBases=new WeakMap();
  let observationEpoch=0,observationCache=null,observationPending=null;
  let activeObservationRead=null;
  let retiringObservation=null;
  const effectivePackets=new WeakMap();
  const observationVersions=new Map();
  const effectiveTokens=new WeakMap();
  let activeEnvelope=null,recoveryChecked=false,recoveryPending=null;
  let pendingScanCompletion=null;
  let pendingAdmission=null;
  let pendingIdentityCatalog=null;
  function invalidateObservationSnapshot(){observationEpoch++;observationCache=null;recoveryChecked=false;invalidateRefreshPreflight();}
  async function recoverObservations(){
    if(recoveryChecked||retiringObservation)return;
    if(recoveryPending)return recoveryPending;
    recoveryPending=(async()=>{
      const saved=await committedArea.get({[OBSERVATION_KEY]:null,[OBSERVATION_HEAD_KEY]:null}),value=saved[OBSERVATION_KEY];
      if(saved[OBSERVATION_HEAD_KEY]&&![1,2].includes(saved[OBSERVATION_HEAD_KEY].format))observationCorruption();
      if(saved[OBSERVATION_HEAD_KEY]?.format===2&&!equalDatabaseData(saved[OBSERVATION_HEAD_KEY],OBSERVATION_REGISTRATION))observationCorruption();
      if(saved[OBSERVATION_HEAD_KEY]?.format===2&&!isObservationTransaction(value))observationCorruption();
      if(isObservationTransaction(value)&&value.kind==='saving'){
        validateObservationJournal(value);
        const raw=(await committedArea.get({[DATABASE_STORAGE_KEY]:null}))[DATABASE_STORAGE_KEY],digest=raw?await providerCheckDigest(raw):null;
        const forward=digest===value.afterDigest,backward=digest===value.before.baseDigest;
        if(!forward&&!backward)observationCorruption();
        // A committed catalog is the decision point. Replay or undo only its
        // journaled metadata; a crash can occur between any two native keys.
        if(forward){
          if(Object.keys(value.updates).length)await committedArea.set(value.updates);
          if(value.removals.length)await committedArea.remove(value.removals);
        }else{
          validateActiveEnvelope(value.before,raw,digest);
          const updates=Object.fromEntries(Object.entries(value.previous).filter(([,v])=>v.present).map(([k,v])=>[k,v.value])),remove=Object.entries(value.previous).filter(([,v])=>!v.present).map(([k])=>k);
          if(Object.keys(updates).length)await committedArea.set(updates);if(remove.length)await committedArea.remove(remove);
        }
        const completed=value.completion?[...value.before.completions.filter(c=>c.provider!==value.completion.provider),value.completion]:value.before.completions;
        const next=forward?activeObservationEnvelope(digest,null,value.afterEpoch,!value.reset&&raw?retainedCompletions(completed,raw):[]):value.before;
        await committedArea.set({[OBSERVATION_KEY]:next});activeEnvelope=next;observationVersions.clear();invalidateObservationSnapshot();invalidateQuerySnapshot(raw,'observation-recovery');
        diagnostics?.event('observation_recovered',{reason:forward?'catalog-committed':'catalog-not-committed'});
      }
      recoveryChecked=true;
    })();
    try{await recoveryPending;}finally{recoveryPending=null;}
  }
  async function ensureObservationRegistration(base,packet){
    if(activeEnvelope){
      if(!equalDatabaseData((await committedArea.get({[OBSERVATION_HEAD_KEY]:null}))[OBSERVATION_HEAD_KEY],OBSERVATION_REGISTRATION))await committedArea.set({[OBSERVATION_HEAD_KEY]:OBSERVATION_REGISTRATION});
      return;
    }
    const value=activeObservationEnvelope(await checkDigest(base),packet??null);
    // The complete empty/legacy value precedes registration. Losing either
    // reply is harmless: the next reader can recognize this same complete value.
    await committedArea.set({[OBSERVATION_KEY]:value});
    await committedArea.set({[OBSERVATION_HEAD_KEY]:OBSERVATION_REGISTRATION});
    activeEnvelope=value;invalidateObservationSnapshot();
  }
  async function requireNoObservations(){
    await recoverObservations();
    const stored=await committedArea.get({[OBSERVATION_HEAD_KEY]:null,[OBSERVATION_KEY]:null});
    if(isObservationTransaction(stored[OBSERVATION_KEY])){
      validateActiveEnvelope(stored[OBSERVATION_KEY],createEmptyDatabase(),null);return;
    }
    if(stored[OBSERVATION_HEAD_KEY]||stored[OBSERVATION_KEY])throw Error('Saved observations require their original library. Restore a complete backup before repairing or replacing this library.');
  }
  async function readObservations(base,force=false){
    if(!force&&retiringObservation?.base===base)return retiringObservation;
    if(!force&&observationCache?.base===base&&observationCache.epoch===observationEpoch)return observationCache;
    if(!force&&observationPending?.base===base&&observationPending.epoch===observationEpoch)return observationPending.promise;
    const epoch=observationEpoch;
    const promise=(async()=>{
      const stored=await storageArea.get({[OBSERVATION_HEAD_KEY]:null,[OBSERVATION_KEY]:null});let head=stored[OBSERVATION_HEAD_KEY],packet=stored[OBSERVATION_KEY],envelope=null;
      if(isObservationTransaction(packet)){
        if(packet.kind!=='active')observationCorruption();
        const digest=packet.baseDigest===null?null:await checkDigest(base);
        envelope=validateActiveEnvelope(packet,base,digest);activeEnvelope=envelope;packet=envelope.packet;head=packet?{format:1,baseDigest:packet.baseDigest,generation:packet.generation,revision:packet.revision,status:'active'}:null;
      }else if(head?.format===2)observationCorruption();
      if(epoch!==observationEpoch)return readObservations(base,force);
      if(observationCache?.base===base&&observationCache.epoch===epoch&&equalDatabaseData(envelope,observationCache.envelope)&&equalDatabaseData(head,observationCache.head)&&equalDatabaseData(packet,observationCache.packet))return observationCache;
      // The format-2 envelope already validated this exact payload against the
      // raw digest above. Legacy pairs still require their own validation.
      const digest=envelope?envelope.baseDigest:head||packet?await checkDigest(base):null;
      const validated=envelope?packet:validateObservationOverlay(base,digest,head,packet),token=envelope?`${envelope.epoch}:${validated?observationToken(head):'none'}`:validated?observationToken(head):'none';
      if(epoch!==observationEpoch)return readObservations(base,force);
      if(validated){const prior=observationVersions.get(digest);if(prior&&(prior.generation!==packet.generation||prior.revision>packet.revision||prior.revision===packet.revision&&!equalDatabaseData(prior.packet,packet)))throw Error('Saved observations changed unexpectedly. Restore a complete backup or retry.');observationVersions.clear();observationVersions.set(digest,{generation:packet.generation,revision:packet.revision,packet:freezeQuerySnapshot(packet)});}
      else if(!head&&!packet&&observationVersions.size){
        const current=await checkDigest(base);if(observationVersions.has(current))throw Error('Saved observation information is missing. Your library was kept. Restore a complete backup or retry.');
      }
      const value={base,epoch,head,packet:validated,envelope,token,view:null};
      if(isCommittedSnapshot(base)){value.view=validated?registerEffectiveSnapshot(freezeQuerySnapshot(materializeObservations(base,validated)),base):base;effectivePackets.set(value.view,validated);effectiveTokens.set(value.view,value);observationCache=value;}
      return value;
    })();
    observationPending={base,epoch,promise};try{return await promise;}finally{if(observationPending?.promise===promise)observationPending=null;}
  }
  async function checkedProviderView(database,base){
    // Keep the validated observation base separate from the caller's editable
    // database, including cold reads with an empty observation envelope.
    if(database===base)database=structuredClone(database);
    const observations=await readObservations(base,true);
    if(activeOperation)activeObservationRead={...observations,base};
    const effective=observations.packet?materializeObservations(database,structuredClone(observations.packet)):database;
    effectivePackets.set(effective,observations.packet);
    const view=await providerCheckView(effective,base);effectivePackets.set(view,observations.packet);checkBases.set(view,base);return view;
  }
  function checkDigest(database){
    // Only immutable worker-owned bases may cache a digest. Mutable caller
    // copies never mint a reusable proof.
    if(database===querySnapshot&&Object.isFrozen(database)){
      if(!checkDigests.has(database))checkDigests.set(database,certificates.committedDigest(database)??providerCheckDigest(database));
      return checkDigests.get(database);
    }
    return providerCheckDigest(database);
  }
  async function providerCheckView(database,base=committedCatalogSnapshot(database)??database){
    const checks=observationStatusChecks((await storageArea.get({[PROVIDER_CHECKS_KEY]:null}))[PROVIDER_CHECKS_KEY],effectivePackets.get(database));
    if(!checks)return database;
    providerChecksPresent=true;
    const digest=await timedAsync('provider_check_digest',()=>checkDigest(base));
    return applyProviderChecks(database,checks,digest);
  }
  async function getProviderDatabase(provider,options){
    const database=await getQueryDatabase(options);
    return providerCheckView(database);
  }
  function canPersistProviderCheck(database,provider,profile,scan){
    const base=checkBases.get(database);
    if(base&&Object.isFrozen(base)&&base!==querySnapshot)throw Error('The library changed while completing this check. Start a fresh scan.');
    return cacheQuerySnapshots&&base&&base===querySnapshot&&scan.profileId===profile.profileId
      &&scan.activeAtStartId===profile.profileId&&database.providers[provider]?.activeProfileId===profile.profileId
      &&profile.state.connected===true&&(['fanatical','gog','kindle'].includes(provider)?!providerScanMode(provider,profile.state,'incremental').forceFull:Boolean(profile.state.fullSyncAt));
  }
  async function persistProviderCheck(database,provider,profile,scan,patch,storedScans){
    patch=providerCheckPatch(provider,patch);
    const base=checkBases.get(database),digest=await timedAsync('provider_check_digest',()=>checkDigest(base));
    const previous=observationStatusChecks((await storageArea.get({[PROVIDER_CHECKS_KEY]:null}))[PROVIDER_CHECKS_KEY],effectivePackets.get(database));
    if(base!==querySnapshot)throw Error('The library changed while completing this check. Start a fresh scan.');
    const checks=validProviderChecks(previous,digest),old=checks[provider];
    const baseline=patch.syncHealth.status!=='succeeded'&&old?.profileId===profile.profileId?providerCheckBaseline(provider,old):null;
    const receipt={format:1,baseDigest:digest,checks:{...checks,[provider]:{profileId:profile.profileId,patch,...(baseline?{baseline}:{})}}};
    if(activeObservationRead&&(await readObservations(activeObservationRead.base,true)).token!==activeObservationRead.token)throw Error('Observations changed while completing this check. Start a fresh scan.');
    await timedAsync('provider_check_write',()=>storageArea.set({[PROVIDER_CHECKS_KEY]:receipt}));
    providerChecksPresent=true;
    const scans={...storedScans};delete scans[provider];
    try{await storageArea.set({[SCANS]:scans});}catch{/* Durable terminal receipt consumes the attempt even without lease cleanup. */}
    return applyProviderChecks(database,receipt,digest);
  }
  const scanCompleted=(profile,scan)=>profile.state.syncHealth?.attemptRef===scan.attemptRef&&profile.state.syncHealth.status!=='running';
  async function tryObservationCompletion(database,provider,context){
    const {scan,base,observations,before,returnedIds}=context,profile=database.providerProfiles[scan.profileId];
    // Match persistDatabase's existing state normalization without validating
    // unrelated records again. Incoming rows and canonical reconciliation have
    // already used the ordinary importer below.
    profile.state=validateProviderStates({[provider]:profile.state})[provider];
    database.providers[provider]={...profile.state,activeProfileId:profile.profileId,profileLabel:profile.nickname};
    const checks=(await storageArea.get({[PROVIDER_CHECKS_KEY]:null}))[PROVIDER_CHECKS_KEY],old=checks?.checks?.[provider],digest=await checkDigest(base);
    let packet;
    const end=()=>{endTiming?.();endJournal();},endTiming=activeTiming?.begin('observation_equality'),endJournal=activity('observation_equality');
    try{
      const entry=observationCompletionEntry(before,database,provider,scan,returnedIds);
      if(!entry)return null;
      entry.supersededStatusAttempts=[...new Set([old?.patch?.syncHealth?.attemptRef,old?.baseline?.syncHealth?.attemptRef].filter(Boolean))];
      // Exact public result equality includes canonical IDs, reviews, history,
      // counts, origin order, access and every field outside the closed delta.
      const view=timed('observation_materialization',()=>materializeObservations(before,{entries:[entry]}));if(!equalDatabaseData(view,database))return null;
      pendingIdentityCatalog=base;
      packet=timed('observation_consolidation',()=>consolidateObservations(base,digest,observations.packet,entry));
    }catch(error){
      // Only unsupported representation/limits use the validated full save.
      // Native reads and commits occur outside this eligibility catch below.
      if(!/Saved observation information|Invalid (?:saved snapshot|provider|sync)|Snapshot|bounded/iu.test(error.message))throw error;
      diagnostics?.event('observation_fallback',{reason:'unsupported-delta-or-bound'});return null;
    }finally{end?.();}
    if(base!==querySnapshot)throw Error('The library changed while completing this scan. Start a fresh scan.');
    const current=await readObservations(base,true);if(current.token!==observations.token)throw Error('Observations changed while completing this scan. Start a fresh scan.');
    const completion=pendingScanCompletion;
    const envelope=activeObservationEnvelope(await checkDigest(base),packet,current.envelope.epoch,[...current.envelope.completions.filter(c=>c.provider!==provider),completion]);
    validateActiveEnvelope(envelope,base,envelope.baseDigest);
    await timedAsync('observation_commit',async()=>{
      try{await committedArea.set({[OBSERVATION_KEY]:envelope});}
      catch(error){const saved=(await committedArea.get({[OBSERVATION_KEY]:null}))[OBSERVATION_KEY];if(!equalDatabaseData(saved,envelope))throw error;}
    });
    activeEnvelope=envelope;invalidateObservationSnapshot();
    // Native settlement is the commit point. Publish before best-effort lease
    // cleanup; the committed attempt makes stale leases and lost replies safe.
    await timedAsync('observation_publication',()=>readObservations(base,true));
    const scans={...context.storedScans};delete scans[provider];
    try{await storageArea.set({[SCANS]:scans});}catch{/* Terminal attempt is durable. */}
    return database;
  }
  function freezeQuerySnapshot(value){
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      for(const child of Object.values(value))freezeQuerySnapshot(child);
      Object.freeze(value);
    }
    return value;
  }
  function invalidateQuerySnapshot(value,source='observer'){
    // Chrome can deliver our own notification after the commit promise. Keep
    // an identical committed snapshot; any different/removed value is a miss.
    const previousSnapshot=committedSnapshotSequence(querySnapshot),end=activity('snapshot_compare',{source,epoch:querySnapshotEpoch,snapshot:previousSnapshot});
    try{if(value&&querySnapshot&&timed('storage_change_compare',()=>equalDatabaseData(value,querySnapshot))){snapshotEvent('retained',source,previousSnapshot);return;}}
    catch{/* A malformed change must invalidate, never retain, the snapshot. */}
    finally{end();}
    querySnapshot=null;querySnapshotEpoch++;
    observationEpoch++;observationCache=null;
    snapshotEvent('invalidated',source,previousSnapshot);
  }
  function publishQuerySnapshot(database,verifiedDigest=null){
    const previousSnapshot=committedSnapshotSequence(querySnapshot);
    querySnapshotEpoch++;
    observationEpoch++;observationCache=null;
    // Only these trusted writer paths supply fully validated committed values.
    // Detach before sharing: caller-owned mutable results must not affect queries.
    querySnapshot=null;
    try{if(cacheQuerySnapshots&&querySnapshotsUsed){
      const detached=timed('snapshot_clone',()=>structuredClone(database));
      querySnapshot=timed('snapshot_freeze',()=>registerCommittedSnapshot(freezeQuerySnapshot(detached)));
      if(pendingIdentityCatalog)reuseCommittedIdentity(querySnapshot,pendingIdentityCatalog);
    }}
    catch{/* A query optimization must never turn an acknowledged commit into a failed write. */}
    snapshotEvent(querySnapshot?'published':'unavailable','writer',previousSnapshot);
    // Every authoritative DB set funnels through here after full validation.
    // No additional snapshot copy is made solely to obtain a certificate.
    if(querySnapshot&&verifiedDigest){
      // The certificate verified this exact detached storage value. Reuse its
      // hash for receipts; neither reserialize nor reissue the same proof.
      checkDigests.set(querySnapshot,Promise.resolve(verifiedDigest));
    }else if(querySnapshot)certificates.issue(querySnapshot);else certificates.clear();
  }
  async function beginObservationSave(updates,removals=[],database=null){
    const stored=await committedArea.get({[OBSERVATION_KEY]:null}),before=stored[OBSERVATION_KEY];
    if(!isObservationTransaction(before))return null;
    if(before.kind!=='active')observationCorruption();
    let prior;
    if(activeObservationRead&&activeOperation!=='restoreDatabase'&&activeOperation!=='clearDatabase'){
      const current=await readObservations(activeObservationRead.base,true);
      if(current.token!==activeObservationRead.token)throw Error('Observations changed while saving. Start a fresh operation.');
      prior=current;
    }
    if(!prior?.view){
      const view=await getQueryDatabase();prior={...effectiveTokens.get(view),base:committedCatalogSnapshot(view),view};
    }
    const afterEpoch=crypto.randomUUID();
    const afterDigest=database?await providerCheckDigest(database):null;
    if(database&&activeOperation!=='restoreDatabase'&&activeOperation!=='clearDatabase'){
      // Network scans carry no old catalog write-set. Commit reads/merges the
      // current catalog in the writer queue. Rebase only an intact admission
      // whose complete provider/account/source scope did not change; never
      // revive a stale observation or bless a replacement/restore generation.
      const scans=updates[SCANS]??(await committedArea.get({[SCANS]:{}}))[SCANS];
      const beforeView=await providerCheckView(prior.view,prior.base);
      const scope=(db,provider)=>({state:db.providers[provider],
        profiles:Object.fromEntries(Object.entries(db.providerProfiles).filter(([,p])=>p.provider===provider)),
        items:Object.fromEntries(Object.entries(db.providerItems).filter(([,p])=>p.provider===provider)),
        history:Object.fromEntries(Object.entries(db.providerHistory??{}).filter(([,p])=>p.item.provider===provider))});
      let rebased;
      for(const [provider,scan]of Object.entries(scans)){
        const intact=scan.observationProviderToken?scan.observationProviderToken===providerObservationToken(prior.envelope,prior.packet,provider):(scan.observationToken??'none')===(prior.token??'none');
        if(!intact||scan.readOnlyStart&&scan.mode==='full'&&scan.fullStartDigest!==await checkDigest(prior.base)
          ||!equalDatabaseData(scope(beforeView,provider),scope(database,provider)))continue;
        rebased??={...scans};rebased[provider]={...scan,observationToken:`${afterEpoch}:none`,observationProviderToken:`${afterEpoch}:none`,
          ...(scan.readOnlyStart&&scan.mode==='full'?{fullStartDigest:afterDigest}:{})};
      }
      // The existing journal replays/undoes these leases with the exact catalog
      // they describe, including interruption before envelope publication.
      if(rebased)updates[SCANS]=rebased;
    }
    if(pendingAdmission&&updates[SCANS]?.[pendingAdmission.provider]?.attemptRef===pendingAdmission.attemptRef){
      const provider=pendingAdmission.provider;updates[SCANS]={...updates[SCANS],[provider]:{...updates[SCANS][provider],observationToken:`${afterEpoch}:none`,observationProviderToken:`${afterEpoch}:none`}};
    }
    const extra=Object.fromEntries(Object.entries(updates).filter(([k])=>k!==DATABASE_STORAGE_KEY)),keys=[...Object.keys(extra),...removals.filter(k=>k!==DATABASE_STORAGE_KEY)],old=await committedArea.get(keys);
    const journal={format:2,kind:'saving',before,afterDigest,afterEpoch,reset:activeOperation==='restoreDatabase'||activeOperation==='clearDatabase',completion:pendingScanCompletion,updates:extra,removals:removals.filter(k=>k!==DATABASE_STORAGE_KEY),previous:Object.fromEntries(keys.map(k=>[k,Object.hasOwn(old,k)?{present:true,value:old[k]}:{present:false}]))};
    validateObservationJournal(journal);
    retiringObservation=prior;
    try{await committedArea.set({[OBSERVATION_KEY]:journal});}
    catch(error){retiringObservation=null;invalidateObservationSnapshot();throw error;}
    invalidateObservationSnapshot();return journal;
  }
  async function finishObservationSave(journal,database){
    const replacing=activeOperation==='restoreDatabase'||activeOperation==='clearDatabase';
    const completed=journal.completion?[...journal.before.completions.filter(c=>c.provider!==journal.completion.provider),journal.completion]:journal.before.completions;
    const next=activeObservationEnvelope(journal.afterDigest,null,journal.afterEpoch,replacing?[]:database?retainedCompletions(completed,database):[]);
    await committedArea.set({[OBSERVATION_KEY]:next});activeEnvelope=next;observationVersions.clear();invalidateObservationSnapshot();return next;
  }
  storageArea={
    async get(defaults){const end=activity('storage_get',{key:storageKey(defaults),operation:activeOperation});try{return await committedArea.get(defaults);}finally{end();}},
    async set(updates){
      if(Object.hasOwn(updates,DATABASE_STORAGE_KEY))updates={...updates,[PROFILE_HINTS]:profileHints(updates[DATABASE_STORAGE_KEY])};
      let retirement=false;
      let journal;
      if(Object.hasOwn(updates,DATABASE_STORAGE_KEY)){
        journal=await beginObservationSave(updates,[],updates[DATABASE_STORAGE_KEY]);
        if(!journal){
        const replacing=activeOperation==='restoreDatabase'||activeOperation==='clearDatabase';
        let head;
        if(replacing){const stored=await committedArea.get({[OBSERVATION_HEAD_KEY]:null,[OBSERVATION_KEY]:null});if(stored[OBSERVATION_HEAD_KEY]||stored[OBSERVATION_KEY])head={format:1,baseDigest:'0'.repeat(64),generation:crypto.randomUUID(),revision:1,status:'retiring'};}
        else if(activeObservationRead){const current=await readObservations(activeObservationRead.base,true);if(current.token!==activeObservationRead.token)throw Error('Observations changed while saving. Start a fresh operation.');if(current.packet){head={...current.head,status:'retiring'};retiringObservation=current;}}
        if(head){
          // No cross-key atomicity assumption: readers fail closed during this
          // short barrier. A failed/interrupted save retains the original packet.
          try{await committedArea.set({[OBSERVATION_HEAD_KEY]:head});}
          catch(error){retiringObservation=null;invalidateObservationSnapshot();throw error;}
          invalidateObservationSnapshot();retirement=true;
        }
        }
      }
      const endActivity=activity('storage_set',{key:storageKey(updates),operation:activeOperation});
      try{
      let pending;
      const dispatchEnd=activeTiming?.begin('storage_set_dispatch');
      try{pending=committedArea.set(updates);}finally{dispatchEnd?.();}
      const waitEnd=activeTiming?.begin('storage_set_wait');
      try{await pending;}finally{waitEnd?.();}
      if(Object.hasOwn(updates,DATABASE_STORAGE_KEY)){
        if(journal)await finishObservationSave(journal,updates[DATABASE_STORAGE_KEY]);
        if(retirement){await committedArea.remove([OBSERVATION_HEAD_KEY,OBSERVATION_KEY]);observationVersions.clear();invalidateObservationSnapshot();}
        publishQuerySnapshot(updates[DATABASE_STORAGE_KEY]);
        // Valid receipts were folded before the database commit. Retire them
        // only after that commit; failed cleanup leaves digest-rejected state,
        // never a lost catalog save or a false ownership acknowledgement.
        if(providerChecksPresent)try{await storageArea.remove([PROVIDER_CHECKS_KEY]);providerChecksPresent=false;}catch{}
      }
      }finally{if(retirement||journal){retiringObservation=null;recoveryChecked=false;}endActivity();}
    },
    async remove(keys){
      if((Array.isArray(keys)?keys:[keys]).includes(DATABASE_STORAGE_KEY))keys=[...(Array.isArray(keys)?keys:[keys]),PROFILE_HINTS];
      const removesDatabase=(Array.isArray(keys)?keys:[keys]).includes(DATABASE_STORAGE_KEY);
      const journal=removesDatabase?await beginObservationSave({},keys):null;
      if(removesDatabase&&!journal){const stored=await committedArea.get({[OBSERVATION_HEAD_KEY]:null,[OBSERVATION_KEY]:null});if(stored[OBSERVATION_HEAD_KEY]||stored[OBSERVATION_KEY]){await committedArea.set({[OBSERVATION_HEAD_KEY]:{format:1,baseDigest:'0'.repeat(64),generation:crypto.randomUUID(),revision:1,status:'retiring'}});invalidateObservationSnapshot();}}
      const end=activity('storage_remove',{key:storageKey(typeof keys==='string'?[keys]:keys),operation:activeOperation});try{
      await committedArea.remove(keys);
      if(removesDatabase){if(journal)await finishObservationSave(journal,null);else await committedArea.remove([OBSERVATION_HEAD_KEY,OBSERVATION_KEY]);observationVersions.clear();invalidateObservationSnapshot();publishQuerySnapshot(createEmptyDatabase());certificates.clear();}
      }finally{if(journal){retiringObservation=null;recoveryChecked=false;}end();}
    }
  };
  async function getQueryDatabase(options={}){
    if(retiringObservation?.view)return retiringObservation.view;
    for(;;){const epoch=observationEpoch,base=await getRawQueryDatabase(options),catalogEpoch=querySnapshotEpoch,observations=await readObservations(base);
      if(epoch!==observationEpoch||catalogEpoch!==querySnapshotEpoch)continue;
      return observations.view??base;
    }
  }
  async function getRawQueryDatabase({beginSpan=()=>{},onValidationSlice=()=>{},onValidationWait=()=>{}}={}){
    const span=async(stage,work)=>{const end=beginSpan(stage),endActivity=activity(stage);try{return await work();}finally{end?.();endActivity();}};
    const sync=(stage,work)=>{const end=beginSpan(stage);try{return work();}finally{end?.();}};
    querySnapshotsUsed=true;await ready;await recoverObservations();
    if(cacheQuerySnapshots&&querySnapshot)return sync('snapshot_hit',()=>querySnapshot);
    if(querySnapshotPending)return span('snapshot_wait',()=>querySnapshotPending);
    const loading=(async()=>{
      for(;;){
        if(cacheQuerySnapshots&&querySnapshot)return querySnapshot;
        const epoch=querySnapshotEpoch;
        const stored=await span('snapshot_read',()=>committedArea.get({[DATABASE_STORAGE_KEY]:null}));
        // A read overlapped a commit or invalidation. Never publish its older
        // result over a newer committed revision, including clear/restore.
        if(epoch!==querySnapshotEpoch){sync('snapshot_retry',()=>{});continue;}
        const raw=stored[DATABASE_STORAGE_KEY];
        if(!raw)await requireNoObservations();
        const certified=raw&&await span('snapshot_certificate',()=>certificates.verifyDigest(raw,{beginSpan}));
        sync(certified?'certificate_hit':'certificate_miss',()=>{});
        if(epoch!==querySnapshotEpoch){sync('snapshot_retry',()=>{});continue;}
        let endValidationStage;
        const database=certified?raw:raw?await span('snapshot_validation',async()=>{
          try{return await validateDatabaseAsync(raw,{onSlice:onValidationSlice,onWait:onValidationWait,onStage:stage=>{endValidationStage?.();endValidationStage=beginSpan(stage==='validation_canonical'?'snapshot_canonical':stage);}});}
          finally{endValidationStage?.();}
        }):createEmptyDatabase();
        if(epoch!==querySnapshotEpoch){sync('snapshot_retry',()=>{});continue;}
        if(raw&&!certified&&sync('snapshot_compare',()=>!equalDatabaseData(raw,database))){
          // Legacy/repair reads may allocate persistent record/canonical refs.
          // Preserve the existing ordered migration; never expose identities
          // synthesized from a read that has not been committed. Normal active
          // refresh data is already validated and does not take this fallback.
          await span('snapshot_migration',()=>execute('getDatabase'));continue;
        }
        sync('snapshot_freeze',()=>registerCommittedSnapshot(freezeQuerySnapshot(database)));
        if(certified)checkDigests.set(database,Promise.resolve(certified));
        if(cacheQuerySnapshots)querySnapshot=database;
        snapshotEvent('published','cold-read');
        if(raw&&!certified)sync('certificate_issue',()=>certificates.issue(database));
        return database;
      }
    })();
    querySnapshotPending=loading;
    try{return await loading;}finally{if(querySnapshotPending===loading)querySnapshotPending=null;}
  }
  async function getQueryAllowedExternalClientIds(){
    await ready;
    // Authorization is never cached and does not wait on a refresh mutation.
    const stored=await committedArea.get({[EXTERNAL_CLIENT_IDS_STORAGE_KEY]:[]});
    return effectiveExternalClientIds(normaliseExternalClientIds(stored[EXTERNAL_CLIENT_IDS_STORAGE_KEY]));
  }
  async function getCommittedLibraryView(diagnosticLookupId){
    const endActivity=activity('options_view');
    const timing=globalThis.GalacticContentsPerformance.trace(diagnosticLookupId,'options');
    const beginSpan=stage=>timing?.begin(stage);
    const end=beginSpan('options_snapshot');
    let database,preferences,scans;
    try{[database,preferences,scans]=await Promise.all([getQueryDatabase({beginSpan}),ready.then(()=>getUiPreferences()),ready.then(()=>storageArea.get({[SCANS]:{}}))]);
      const packet=effectivePackets.get(database),info=effectiveTokens.get(database),token=info?.token??(packet?observationToken({...packet,status:'active'}):'none');
      scans={[SCANS]:Object.fromEntries(Object.entries(scans[SCANS]??{}).filter(([provider,scan])=>scan.observationProviderToken?scan.observationProviderToken===providerObservationToken(info?.envelope,packet,provider):(scan.observationToken??'none')===token))};
      database=await providerCheckView(database);}
    finally{end?.();endActivity();}
    return {database:providerScanDisplay(database,scans[SCANS]),preferences,...(timing?{performance:globalThis.GalacticContentsPerformance.clean(timing.finish('reparsed'))}:{})};
  }
  // Private, bounded read-only eligibility answers. No database/source snapshot
  // is reused for a write. Only the worker with change observation enables this.
  let refreshProjection=null,refreshProjectionEpoch=0;
  const invalidateRefreshPreflight=()=>{refreshProjection=null;refreshProjectionEpoch++;};
  const readStages=new Set(['storage_read','read_committed_compare','read_committed_clone','read_certificate','read_certificate_retry','certificate_hit','certificate_miss','migration_compare','snapshot_clone','snapshot_freeze','provider_check_digest','observation_consolidation','observation_commit','observation_publication','observation_materialization','entry_validation','canonical_rebuild']);
  const timed = (stage, work) => { const end=activeTiming?.begin(stage),journalEnd=readStages.has(stage)?activity(stage,{operation:activeOperation}):null;try{return work();}finally{end?.();journalEnd?.();} };
  const timedAsync = (stage, work) => {
    if(!activeTiming&&!readStages.has(stage))return work();
    const end=activeTiming?.begin(stage),journalEnd=readStages.has(stage)?activity(stage,{operation:activeOperation}):null;
    if(stage==='storage_write'||stage==='migration_write'){try{activeTiming.onWrite?.();}catch{/* Diagnostics must never prevent a write. */}}
    return (async()=>{try{return await work();}finally{end?.();journalEnd?.();}})();
  };
  async function validateForWriter(value){
    const timing=activeTiming;let endStage,endActivityStage;const endActivity=activity('validation',{operation:activeOperation});
    const work=timing?(timing.validationWork??={executingMs:0,waitMs:0,yields:0}):null;
    try{return await validateDatabaseAsync(value,{onSlice:(duration,yielded)=>{if(work){work.executingMs+=duration;if(yielded)work.yields++;}},onWait:duration=>{if(work)work.waitMs+=duration;},onStage:stage=>{endStage?.();endActivityStage?.();endStage=timing?.begin(stage);endActivityStage=activity(stage,{operation:activeOperation});}});}
    finally{endStage?.();endActivityStage?.();endActivity();}
  }
  const NOTIFICATIONS='galacticLibraryReminderNotifications';
  const SCANS='galacticLibraryProviderScans';
  function canStartProviderLease(database,provider,profile,scan,forceFull,bindingUnchanged){
    return !forceFull&&bindingUnchanged&&profile.provider===provider
      &&scan.activeAtStartId===profile.profileId
      &&(scan.mode==='incremental'||canPersistProviderCheck(database,provider,profile,scan));
  }
  async function beginProviderScan(provider,nickname,mode='full',switchProfile=false,tabId=null,requestedProfileId=null,rememberedProfile=false,sourceAccountFingerprint=null) {
    if(!PROVIDERS.includes(provider)||!['full','incremental'].includes(mode))throw new Error('Invalid provider scan.');
    let profileLabel=text(nickname,100,'Account/profile label');
    const database=await readDatabase(true),active=database.providers[provider]?.activeProfileId;
    const profiles=Object.values(database.providerProfiles).filter(p=>p.provider===provider);
    if(!profileLabel&&!requestedProfileId&&switchProfile){let n=profiles.length+1;do{profileLabel='Account '+n++;}while(profiles.some(p=>p.nickname===profileLabel));}
    if(!profileLabel&&!requestedProfileId&&profiles.length>1)throw Error('Choose the saved account to update in Change account.');
    let existing=requestedProfileId?profiles.find(p=>p.profileId===requestedProfileId):profileLabel?profiles.find(p=>p.nickname===profileLabel):profiles.length===1?profiles[0]:null;
    if(requestedProfileId&&!existing)throw Error('Scan profile changed. Start a fresh confirmed scan.');
    if(existing)profileLabel=existing.nickname;
    let bindingUnchanged=true;
    if(['nintendo','playstation','xbox'].includes(provider)){
      const label=provider==='nintendo'?'Nintendo':provider==='xbox'?'Xbox':'PlayStation';
      if(provider==='nintendo'&&mode!=='full'||typeof sourceAccountFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(sourceAccountFingerprint))throw Error('Reload '+label+' and import its complete library with a verified account.');
      const bound=Object.values(database.providerProfiles).find(p=>p.provider===provider&&p.sourceAccountFingerprint===sourceAccountFingerprint);
      if(bound&&bound.profileId!==existing?.profileId){if(requestedProfileId||profileLabel)throw Error('This '+label+' account is already saved as '+(bound.nickname||'an existing profile')+'. Select that saved profile instead of creating another one.');existing=bound;profileLabel=bound.nickname;}
      if(existing?.sourceAccountFingerprint&&existing.sourceAccountFingerprint!==sourceAccountFingerprint)throw Error('This saved account belongs to a different '+label+' account. Choose another saved account and confirm switching.');
      if(existing&&!existing.sourceAccountFingerprint&&Object.values(database.providerItems).some(i=>i.profileId===existing.profileId))throw Error('This saved account has no verified '+label+' identity. Use a new account profile.');
      bindingUnchanged=existing?.sourceAccountFingerprint===sourceAccountFingerprint;
    }
    if(requestedProfileId&&existing?.profileId!==requestedProfileId)throw Error('Scan profile changed. Start a fresh confirmed scan.');
    if(rememberedProfile===true&&(Object.values(database.providerProfiles).filter(p=>p.provider===provider).length!==1
      ||!requestedProfileId||existing?.profileId!==active||existing?.state.connected!==true||!existing?.state.lastSync))throw Error('Saved accounts changed. Select and confirm the signed-in account before scanning.');
    const changing=Boolean(active)&&existing?.profileId!==active;
    if(changing&&switchProfile!==true)throw Error('A different account/profile is active. Explicitly confirm switching to the target account.');
    const profile=importProfile(database,provider,profileLabel,existing?.profileId??requestedProfileId);
    const plan=providerScanMode(provider,profile.state,mode),forceFull=plan.forceFull||(['fanatical','humble','gog','kindle'].includes(provider)?providerScanMode(provider,profile.state,'incremental').forceFull:!profile.state.fullSyncAt);
    if(!active){profile.lastSelectedAt=new Date().toISOString();profileState(database,profile,profile.state);}
    const activeAtStartId=database.providers[provider].activeProfileId;
    const stored=await storageArea.get({[SCANS]:{}}),scans=stored[SCANS]??{},scanToken=crypto.randomUUID();
    if(observationCompletions&&cacheQuerySnapshots&&profile.state.connected&&profile.state.fullSyncAt&&checkBases.get(database)===querySnapshot){
      await ensureObservationRegistration(querySnapshot,effectivePackets.get(database));
      const current=await readObservations(querySnapshot,true);activeObservationRead=current;
    }
    scans[provider]={scanToken,attemptRef:crypto.randomUUID(),profileId:profile.profileId,activeAtStartId,profileLabel,mode:forceFull?'full':mode,tabId,startedAt:new Date().toISOString()};
    scans[provider].observationToken=activeObservationRead?.token??'none';
    if(activeObservationRead?.envelope)scans[provider].observationProviderToken=providerObservationToken(activeObservationRead.envelope,activeObservationRead.packet,provider);
    if(['nintendo','playstation','xbox'].includes(provider))scans[provider].sourceAccountFingerprint=sourceAccountFingerprint;
    // Announcing a scan does not reobserve any records. An unchanged established
    // account can project Running from a durable lease in either acquisition mode.
    if(canStartProviderLease(database,provider,profile,scans[provider],forceFull,bindingUnchanged)){
      scans[provider].readOnlyStart=true;
      if(mode==='full'){
        const base=checkBases.get(database);
        scans[provider].fullStartDigest=await timedAsync('provider_check_digest',()=>checkDigest(base));
        if(base!==querySnapshot)throw Error('The library changed while starting this scan. Start a fresh scan.');
      }
      await storageArea.set({[SCANS]:scans});
      return {scanToken,forceFull,scanReason:plan.scanReason,profileLabel,profileId:profile.profileId,database};
    }
    profile.state.syncHealth=validateSyncHealth({attemptRef:scans[provider].attemptRef,status:'running',mode:scans[provider].mode,attemptedProfileLabel:profileLabel,startedAt:scans[provider].startedAt,finishedAt:null,retryable:false});
    if(activeAtStartId===profile.profileId)profileState(database,profile,profile.state);
    pendingAdmission={provider,attemptRef:scans[provider].attemptRef};
    await storageArea.set({[SCANS]:scans,[DATABASE_STORAGE_KEY]:timed('persist_validation',()=>validateDatabase(database))});
    return {scanToken,forceFull,scanReason:plan.scanReason,profileLabel,profileId:profile.profileId,database};
  }
  async function commitProviderScan(provider,values,syncDetails,snapshot,scanToken,tabId=null,includeResult=false,sourceAccountFingerprint=null) {
    const stored=await storageArea.get({[SCANS]:{}}),scan=stored[SCANS]?.[provider],database=await readDatabase(true);
    if(!Array.isArray(values)||values.length>50000)throw Error('Import needs a bounded item list.');
    const receivedDetails=syncDetails;
    const requestDigest=()=>{const {quickSyncAt,fullSyncAt,...details}=receivedDetails;return providerCheckDigest(JSON.parse(JSON.stringify({provider,values,snapshot:snapshot??null,details})));};
    const done=activeEnvelope?.completions.find(c=>c.provider===provider&&c.scanToken===scanToken&&c.tabId===tabId&&c.mode===syncDetails.syncMode&&c.sourceAccountFingerprint===(sourceAccountFingerprint??null));
    if(done&&database.providers[provider]?.activeProfileId===done.profileId&&database.providerProfiles[done.profileId]?.state.syncHealth?.attemptRef===done.attemptRef){
      if(done.requestDigest!==await requestDigest())throw Error('This scan already completed with different results. Start a fresh scan.');
      return includeResult?{database,scanResult:providerScanResult(database,provider,done.profileId,values)}:database;
    }
    if(!scan||scan.scanToken!==scanToken||scan.tabId!==tabId||!scan.profileId||database.providers[provider]?.activeProfileId!==scan.activeAtStartId||!database.providerProfiles[scan.profileId])throw new Error('This scan was superseded by another scan, clear, restore, or profile change. Start a fresh scan.');
    if(scan.observationProviderToken?scan.observationProviderToken!==providerObservationToken(activeObservationRead?.envelope,activeObservationRead?.packet,provider):(scan.observationToken??'none')!==(activeObservationRead?.token??'none'))throw Error('Observations changed during this scan. Start a fresh scan.');
    if(!['full','incremental'].includes(syncDetails.syncMode)||scan.mode==='full'&&syncDetails.syncMode!=='full')throw new Error('This account/profile requires a complete full scan.');
    const profile=database.providerProfiles[scan.profileId];
    if(['fandango-at-home','audible'].includes(provider)){
      const partial=snapshot?.complete===false, pending=profile.state.syncState?.listingIncomplete;
      if(partial||pending&&syncDetails.syncMode==='full')validateProviderSnapshot(provider,values,snapshot);
      if(partial||pending){
        const incomplete=partial||snapshot?.complete!==true;
        const {fullSyncAt,...safe}=syncDetails;
        syncDetails={...(incomplete?safe:syncDetails),syncState:{...(provider==='audible'?profile.state.syncState:{}),...(incomplete?{listingIncomplete:true}:{listingIncomplete:false})},...(incomplete?{scanDiagnostics:{...safe.scanDiagnostics,incomplete:true}}:{})};
      }
    }
    if(provider==='kindle'){
      if(snapshot?.complete===false)validateProviderSnapshot(provider,values,snapshot);
      syncDetails=kindleAcquisitionDetails(profile,syncDetails,snapshot);
    }
    if(provider==='amazon-games'){
      const partial=snapshot?.complete===false;
      if(partial||profile.state.syncState?.listingIncomplete&&syncDetails.syncMode==='full')validateProviderSnapshot(provider,values,snapshot);
      if(!partial&&profile.state.syncState?.listingIncomplete&&syncDetails.syncMode==='full'
        &&(profile.state.syncState.pendingWindows??[]).some(id=>!snapshot.scopes.some(scope=>scope.id===id)))throw Error('Amazon Games did not check every unfinished date range. Earlier records were kept.');
      if(partial||profile.state.syncState?.listingIncomplete&&syncDetails.syncMode!=='full')syncDetails={...syncDetails,scanDiagnostics:{...syncDetails.scanDiagnostics,incomplete:true,coverageLimit:'incomplete-amazon-games-claims'}};
      if(partial||profile.state.syncState?.listingIncomplete)syncDetails={...syncDetails,syncState:{...(partial||syncDetails.syncMode!=='full'?{listingIncomplete:true,pendingWindows:[...new Set([...(profile.state.syncState?.pendingWindows??[]),...(snapshot?.recovery?.pendingWindows??[])])]}:{})}};
    }
    if(provider==='amazon-video'){
      const partial=snapshot?.complete===false;
      if(partial||profile.state.syncState?.listingIncomplete&&snapshot?.complete===true){
        validateProviderSnapshot(provider,values,snapshot);
        if(!partial){
          const scope=snapshot.scopes[0];
          if(snapshot.scopes.length!==1||scope.id!=='library'||scope.readCount!==values.length
            ||!(scope.end==='reported-count'&&scope.expectedCount===values.length||scope.end==='scroll-end'&&scope.expectedCount===null))throw Error('Amazon Video recovery did not provide supported completion evidence. Previous records were kept.');
        }
      }
      if(partial)syncDetails={...syncDetails,scanDiagnostics:{...syncDetails.scanDiagnostics,incomplete:true,coverageLimit:'unreadable-amazon-video-cards'}};
      // A bounded Quick does not clear unresolved work. Only a validated
      // whole traversal (count-confirmed or inferred) can clear this marker.
      if(partial||profile.state.syncState?.listingIncomplete){
        syncDetails={...syncDetails,syncState:{...(partial||snapshot?.complete!==true?{listingIncomplete:true}:{})}};
      }
    }
    if(['gog','epic'].includes(provider)&&snapshot?.complete===false){validateProviderSnapshot(provider,values,snapshot);syncDetails={...syncDetails,scanDiagnostics:{...syncDetails.scanDiagnostics,incomplete:true}};}
    if(provider==='gog'){
      const partial=snapshot?.complete===false;
      // Preserve a stable acquisition baseline; a failed prefix cannot authorize a known-page stop.
      if(partial||profile.state.syncState?.acquisitionCheckedAt)syncDetails={...syncDetails,syncState:{acquisitionCheckedAt:profile.state.syncState?.acquisitionCheckedAt??new Date().toISOString(),...(partial?{listingIncomplete:true}:{})}};
    }
    if(provider==='fanatical'&&snapshot?.complete===false){
      validateProviderSnapshot(provider,values,snapshot);
      if(snapshot.recovery){
        const recovery=snapshot.recovery,state=syncDetails.syncState??{},known=state.knownOrderFingerprints??[],failed=state.failedOrderFingerprints??[];
        if(known.length!==recovery.orderFingerprints.length||known.some(id=>!recovery.orderFingerprints.includes(id))||failed.length!==recovery.failedOrderFingerprints.length||failed.some(id=>!recovery.failedOrderFingerprints.includes(id))||Boolean(state.listingIncomplete)!==recovery.listingIncomplete)throw Error('Fanatical retry state does not match the validated acquisition.');
      }
      syncDetails=fanaticalAcquisitionDetails(profile,syncDetails);
    }
    if(provider==='humble'&&snapshot?.complete===false){
      validateProviderSnapshot(provider,values,snapshot);
      const known=syncDetails.syncState?.knownPurchaseIds??[],failed=syncDetails.syncState?.failedPurchaseIds??[];
      if(known.length!==snapshot.successfulPurchaseIds.length||known.some(id=>!snapshot.successfulPurchaseIds.includes(id))
        ||failed.length!==snapshot.failedPurchaseIds.length||failed.some(id=>!snapshot.failedPurchaseIds.includes(id)))throw Error('Humble partial purchase state does not match its validated results.');
      syncDetails=humbleAcquisitionDetails(profile,syncDetails,true);
    }
    const details={...syncDetails,profileId:profile.profileId,profileLabel:profile.nickname,
      scanAttempt:{attemptRef:scan.attemptRef,startedAt:scan.startedAt}};
    const checkedBase=checkBases.get(database);
    if(checkedBase&&Object.isFrozen(checkedBase)&&checkedBase!==querySnapshot)throw Error('The library changed while completing this check. Start a fresh scan.');
    let beforeFullSave=null;
    if(scan.readOnlyStart&&scan.mode==='full'){
      if(!/^[a-f0-9]{64}$/u.test(scan.fullStartDigest??'')||!checkedBase
        ||scan.fullStartDigest!==await timedAsync('provider_check_digest',()=>checkDigest(checkedBase)))throw Error('The library changed during this full scan. Start a fresh scan.');
      beforeFullSave=()=>{if(checkedBase!==querySnapshot)throw Error('The library changed during this full scan. Start a fresh scan.');};
      beforeFullSave();
    }
    if(scanCompleted(profile,scan))throw Error('This scan already completed. Start a fresh scan.');
    pendingScanCompletion=activeObservationRead?.envelope?{provider,profileId:profile.profileId,attemptRef:scan.attemptRef,scanToken:scan.scanToken,tabId:scan.tabId,mode:scan.mode,sourceAccountFingerprint:scan.sourceAccountFingerprint??null,requestDigest:await requestDigest()}:null;
    let result,changes,preparedIncoming;
    const completion=observationCompletions&&scan.readOnlyStart&&canPersistProviderCheck(database,provider,profile,scan)&&activeObservationRead?.envelope?{scan,base:checkedBase,observations:activeObservationRead,storedScans:stored[SCANS],returnedIds:new Set(values.map(v=>v.providerItemId)),before:{...database,providerItems:{...database.providerItems},providerHistory:{...database.providerHistory},providers:structuredClone(database.providers),providerProfiles:structuredClone(database.providerProfiles)}}:null;
    if(['nintendo','playstation','xbox'].includes(provider)){
      const label=provider==='nintendo'?'Nintendo':provider==='xbox'?'Xbox':'PlayStation';
      if(typeof sourceAccountFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(sourceAccountFingerprint)||scan.sourceAccountFingerprint!==sourceAccountFingerprint||profile.sourceAccountFingerprint&&profile.sourceAccountFingerprint!==sourceAccountFingerprint)throw Error('The '+label+' account changed before saving. No items were imported. Start a fresh import.');
      if(provider==='nintendo'&&details.syncMode!=='full')throw Error('Nintendo requires a complete loaded card list.');
      validateProviderSnapshot(provider,values,snapshot);
      const scope=snapshot.scopes[0];
      if(snapshot.scopes.length!==1||scope.id!==(provider==='nintendo'?'non-hidden-virtual-cards':provider==='xbox'?'owned-web-library':'ps4-ps5-purchased')||(provider==='playstation'?scope.expectedCount!==null||scope.end!=='pagination-end':scope.expectedCount!==values.length||provider==='xbox'&&scope.end!=='reported-count')||scope.readCount!==values.length||new Set(values.map(v=>v.providerItemId)).size!==values.length)throw Error(label+' library coverage is incomplete. Previously saved items were kept.');
      if(provider==='xbox'&&values.some(v=>v.provider!=='xbox'||!/^[A-Z0-9]{12}$/u.test(v.providerItemId)||v.metadata?.productId!==v.providerItemId||v.metadata?.source!=='xbox-web-library'||v.metadata?.accessBasis!=='personal-owned-web-catalog'||v.ownership!=='owned'||!Array.isArray(v.metadata?.accessTypes)||!v.metadata.accessTypes.includes(1)))throw Error('Xbox items do not match the validated web-owned source. Previously saved items were kept.');
      profile.sourceAccountFingerprint=sourceAccountFingerprint;
      // A complete non-hidden view is still not a complete purchase history.
      // Reuse the additive importer; never archive omissions or revoke access.
      result=await mergeIntoDatabase(provider,values,{...details,snapshotValidation:{...snapshot,validatedAt:new Date().toISOString()}},database,null,beforeFullSave,completion);
    }
    if(!result&&provider==='audible'&&!values.length&&snapshot?.complete!==false&&scan.readOnlyStart&&details.syncMode==='incremental'&&canPersistProviderCheck(database,provider,profile,scan)&&details.audibleHistory!==undefined){
      const audible=audibleHistoryDetails(provider,details,profile,new Date().toISOString());
      // A recent-history check may change access or acquisition evidence even
      // when no new library titles were returned. Skip the catalog write only
      // after the real enrichment path proves there are no record changes.
      if(!enrichAudibleRecords(database,profile.profileId,[],audible.history).length){
        const health=successfulSyncHealth(database,provider,[],false,audible.details);changes=health.differences;
        result=await persistProviderCheck(database,provider,profile,scan,{...profile.state,...audible.details,lastSync:new Date().toISOString(),lastError:null,syncHealth:health},stored[SCANS]);
      }
    }
    if(!result&&scan.readOnlyStart&&details.syncMode==='incremental'&&canPersistProviderCheck(database,provider,profile,scan)
      &&(provider!=='amazon-games'||!values.length||!Object.values(database.providerItems).some(item=>item.profileId===profile.profileId&&!item.providerItemId.startsWith('claim-v1-')))
      &&Object.keys(syncDetails).every(key=>['source','syncMode','quickSyncAt','scanDiagnostics','syncState'].includes(key))
      &&(!Object.hasOwn(syncDetails,'syncState')||equalDatabaseData(syncDetails.syncState,profile.state.syncState))){
      preparedIncoming=timed('entry_validation',()=>normalizedIncoming(database,provider,profile,values));
      const incoming=[...new Map(preparedIncoming.map(item=>[item.id,item])).values()];
      // Compare ALL normalized fields, including observation/access evidence.
      // A count of zero additions/updates alone is not a write-set proof.
      const unchanged=timed('provider_compare',()=>incoming.every(item=>equalDatabaseData(item,database.providerItems[item.id])));
      if(unchanged){
        const health=successfulSyncHealth(database,provider,incoming,false,details);changes=health.differences;
        const patch=health.status==='succeeded'?{...profile.state,...syncDetails,lastSync:new Date().toISOString(),lastError:null,syncHealth:health}:{syncHealth:health};
        result=await persistProviderCheck(database,provider,profile,scan,patch,stored[SCANS]);
      }
    }
    result??=await (details.syncMode==='full'?replaceIntoDatabase(provider,values,details,snapshot,database,beforeFullSave,completion):mergeIntoDatabase(provider,values,details,database,preparedIncoming,beforeFullSave,completion));
    if(!includeResult)return result;
    return {database:result,scanResult:providerScanResult(result,provider,profile.profileId,values,changes)};
  }
  function providerScanResult(database,provider,profileId,values,changes){
    const observedIds=new Set(values.map(value=>value.providerItemId));
    const observed=provider==='kobo'?Object.values(database.providerItems).filter(item=>item.provider===provider&&item.profileId===profileId&&observedIds.has(item.providerItemId)):[];
    const ownership={unconfirmed:0,covered:0,review:0,subscriptions:0};
    for(const item of observed){
      if(item.ownership==='subscription')ownership.subscriptions++;
      if(item.ownership!=='unknown')continue;
      ownership.unconfirmed++;
      const effective=effectiveOwnershipRecord(item,database);
      if(effective.ownership==='owned'&&effective.ownershipOverride)ownership.covered++;
      else if(effective.ownership==='unknown')ownership.review++;
    }
    return {changes:changes??database.providers[provider].syncHealth?.differences,ownership,checkedAt:new Date().toISOString()};
  }
  async function kindleProfileTransition(database,oldId,newId){
    if(oldId===newId)return {};
    const stored=await storageArea.get({[KINDLE_REFRESH_KEY]:null,[KINDLE_REFRESH_ARCHIVES_KEY]:{}}),jobs={...stored[KINDLE_REFRESH_ARCHIVES_KEY]};
    const raw=stored[KINDLE_REFRESH_KEY];
    if(raw){
      try{
        let job=bindKindleRefresh(raw,database);
        if(job.profileId!==oldId)throw Error('Refresh owner differs from previous selection.');
        if(job.status==='running')job={...job,status:'interrupted',leaseRef:'',tabId:null,updatedAt:new Date().toISOString()};
        jobs[job.profileId]=job;
      }catch{const previous=jobs.unresolvedLegacy;const unresolved=previous?.runRef?{[previous.runRef]:previous}:{...previous};if(Object.keys(unresolved).length>=10000)throw Error('Too many unresolved legacy refresh jobs.');unresolved[raw.runRef??crypto.randomUUID()]=raw;jobs.unresolvedLegacy=unresolved;}
    }
    const next=jobs[newId]??null;delete jobs[newId];
    return {[KINDLE_REFRESH_KEY]:next,[KINDLE_REFRESH_ARCHIVES_KEY]:jobs};
  }
  async function selectProviderProfile(profileId,expectedActiveId,confirmed=false){
    const database=await getDatabase(),profile=database.providerProfiles[profileId];
    if(!profile)throw Error('Unknown provider profile.');
    if(confirmed!==true)throw Error('Confirm the signed-in account before selecting its profile.');
    if(database.providers[profile.provider]?.activeProfileId!==expectedActiveId)throw Error('Active profile changed. Reload before selecting.');
    cancelProfileAttempt(database,profile.provider);
    const oldId=database.providers[profile.provider]?.activeProfileId;
    const jobs=profile.provider==='kindle'?await kindleProfileTransition(database,oldId,profileId):{};
    profile.lastSelectedAt=new Date().toISOString();profileState(database,profile,profile.state);
    return persistDatabase(database,profile.provider,jobs);
  }
  function cancelProfileAttempt(database,provider){
    for(const profile of Object.values(database.providerProfiles))if(profile.provider===provider&&profile.state.syncHealth?.status==='running')profile.state.syncHealth={...profile.state.syncHealth,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true};
    const active=database.providerProfiles[database.providers[provider]?.activeProfileId];if(active)profileState(database,active,active.state);
  }
  async function renameProviderProfile(profileId,nickname){
    const database=await getDatabase(),profile=database.providerProfiles[profileId];if(!profile)throw Error('Unknown provider profile.');
    nickname=text(nickname,100,'Profile nickname');if(!nickname)throw Error('Enter a profile nickname.');
    if(Object.values(database.providerProfiles).some(p=>p.provider===profile.provider&&p.profileId!==profileId&&p.nickname===nickname))throw Error('That nickname is already used by another profile.');
    const extra=await invalidateProfileScan(database,profileId);profile.nickname=nickname;profile.provenance='declared';profile.state.profileLabel=nickname;
    for(const h of Object.values(database.providerHistory))if(h.item.profileId===profileId)h.profileLabel=nickname;
    if(database.providers[profile.provider]?.activeProfileId===profileId)profileState(database,profile,profile.state);
    return persistDatabase(database,null,extra);
  }
  async function saveKoboOwnershipAssumption(profileId,enabled){
    const database=await getDatabase(),profile=database.providerProfiles[profileId];
    if(!profile||profile.provider!=='kobo'||typeof enabled!=='boolean')throw Error('Choose a saved Kobo account and a valid ownership preference.');
    if(enabled)profile.assumeUnconfirmedOwned=true;else delete profile.assumeUnconfirmedOwned;
    return persistDatabase(database);
  }
  async function getProviderProfiles(provider=null){return enumerateProviderProfiles(await getDatabase(),provider);}
  async function invalidateProfileScan(database,profileId){
    const p=database.providerProfiles[profileId];
    if(p.state.syncHealth?.status==='running')p.state.syncHealth={...p.state.syncHealth,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true};
    if(database.providers[p.provider]?.activeProfileId===profileId)profileState(database,p,p.state);
    const scans=(await storageArea.get({[SCANS]:{}}))[SCANS];if(scans[p.provider]?.profileId===profileId){delete scans[p.provider];return {[SCANS]:scans};}return {};
  }
  async function resetProviderProfileBaseline(profileId,confirmed=false){
    if(confirmed!==true)throw Error('Confirm resetting this profile import baseline.');
    const database=await getDatabase(),p=database.providerProfiles[profileId];if(!p)throw Error('Unknown provider profile.');
    const extra=await invalidateProfileScan(database,profileId);
    for(const key of ['lastSync','quickSyncAt','fullSyncAt','syncState','snapshotValidation','syncMode'])delete p.state[key];
    if(database.providers[p.provider]?.activeProfileId===profileId)profileState(database,p,p.state);
    return persistDatabase(database,null,extra);
  }
  async function removalPlan(database,profileId){
    const plan=profileDependencies(database,profileId),stored=await storageArea.get({galacticPurchaseSync:{},[SCANS]:{},[KINDLE_REFRESH_KEY]:null,[KINDLE_REFRESH_ARCHIVES_KEY]:{},[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]:null,[FEED_UPLOAD_KEY]:{}});
    const session=importSessionArea?await importSessionArea.get(null):{},sessionKeys=Object.keys(session).filter(key=>key.startsWith('fandango-import-')&&session[key]?.scanContext?.profileId===profileId);
    const current=stored[KINDLE_REFRESH_KEY],archived=stored[KINDLE_REFRESH_ARCHIVES_KEY]?.[profileId];
    let currentOwner=current?.profileId;
    if(current&&!currentOwner){try{currentOwner=bindKindleRefresh(current,database).profileId;}catch{/* Unknown jobs remain preserved. */}}
    const kindleJob=currentOwner===profileId?current:archived;
    const google=stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY],googleTargets=Object.entries(google?.targets??{}).filter(([,refs])=>refs.some(ref=>plan.refs.has(ref)));
    const scan=stored[SCANS][plan.profile.provider],scanAffected=scan&&(scan.profileId===profileId||scan.activeAtStartId===profileId);
    const uploads=Object.fromEntries(Object.entries(stored[FEED_UPLOAD_KEY]).filter(([,u])=>u.profileId===profileId));
    plan.summary.jobs={kindle:kindleJob?{status:kindleJob.status,cursor:kindleJob.cursor,total:kindleJob.queue?.length??0}:null,googleAffectedTargets:googleTargets.length,scan:scanAffected?{attemptRef:scan.attemptRef,mode:scan.mode}:null,fandangoNavigationContexts:sessionKeys.length,pendingCompanionUploads:Object.keys(uploads).length};
    const relationship=stored.galacticPurchaseSync[plan.profile.provider],mappedRelationship=relationship?.localId===profileId?{id:relationship.id,peerId:relationship.peerId,localId:relationship.localId,remoteId:relationship.remoteId,confirmed:relationship.confirmed}:null;plan.summary.jobs.purchaseSync=Boolean(mappedRelationship);
    const payload={purchaseSync:mappedRelationship,profile:plan.profile,current:plan.current,history:plan.history,dependents:plan.dependents,canonicalItems:plan.canonicalItems,kindleJob:kindleJob??null,googleTargets,scan:scanAffected?scan:null,uploads,session:Object.fromEntries(sessionKeys.map(key=>[key,session[key]]))};
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(strictDatabaseSerialization(payload)));
    plan.summary.dependencyStamp=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    return {...plan,stored,currentOwner,sessionKeys,scanAffected};
  }
  async function previewProviderProfileRemoval(profileId){return (await removalPlan(await getDatabase(),profileId)).summary;}
  async function removeProviderProfile(profileId,dependencyStamp,confirmed=false){
    if(confirmed!==true)throw Error('Confirm removing this profile and its dependent state.');
    const database=await getDatabase(),plan=await removalPlan(database,profileId);
    if(typeof dependencyStamp!=='string'||dependencyStamp!==plan.summary.dependencyStamp)throw Error('Profile dependencies changed. Review a fresh removal preview.');
    const updates={},jobs={...plan.stored[KINDLE_REFRESH_ARCHIVES_KEY]};delete jobs[profileId];
    if(plan.profile.provider==='kindle'){updates[KINDLE_REFRESH_ARCHIVES_KEY]=jobs;if(plan.currentOwner===profileId)updates[KINDLE_REFRESH_KEY]=null;}
    if(plan.scanAffected){const scans={...plan.stored[SCANS]},target=database.providerProfiles[scans[plan.profile.provider].profileId];if(target&&target.profileId!==profileId&&target.state.syncHealth?.status==='running'){target.state.syncHealth={...target.state.syncHealth,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true};if(database.providers[target.provider]?.activeProfileId===target.profileId)profileState(database,target,target.state);}delete scans[plan.profile.provider];updates[SCANS]=scans;}
    const uploads={...plan.stored[FEED_UPLOAD_KEY]};for(const [key,u]of Object.entries(uploads))if(u.profileId===profileId)delete uploads[key];updates[FEED_UPLOAD_KEY]=uploads;
    const google=plan.stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY];
    if(google){
      let changed=false,pendingChanged=false;
      for(const [id,refs]of Object.entries(google.targets??{})){const next=refs.filter(ref=>!plan.refs.has(ref));if(next.length!==refs.length){changed=true;pendingChanged||=google.queue.indexOf(id)>=google.cursor;google.targets[id]=next;}}
      if(changed){if(pendingChanged){google.runId=null;google.leaseUntil=0;}updates[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]=normaliseGoogleBooksJob(google);}
    }
    const retirement=await GalacticPurchaseSync.retirementPatch(storageArea,{provider:plan.profile.provider,localId:profileId});Object.assign(updates,retirement.patch);
    removeProfileData(database,plan);
    const result=await persistDatabase(database,null,updates);
    Promise.resolve().then(()=>onPurchaseSyncInvalidated(retirement.retired)).catch(()=>{});
    // Tokens are already invalidated atomically. Session cleanup is secondary;
    // its failure must not misreport a committed library removal as a failure.
    if(plan.sessionKeys.length)try{await importSessionArea.remove(plan.sessionKeys);}catch{}
    return result;
  }
  async function failProviderScan(provider,scanToken,tabId,failure={}){
    const stored=await storageArea.get({[SCANS]:{}}),scan=stored[SCANS]?.[provider];
    if(!scan||scan.scanToken!==scanToken||scan.tabId!==tabId)return false;
    const database=await readDatabase(true);
    if(scan.observationProviderToken?scan.observationProviderToken!==providerObservationToken(activeObservationRead?.envelope,activeObservationRead?.packet,provider):(scan.observationToken??'none')!==(activeObservationRead?.token??'none'))return false;
    const failureCode=SYNC_FAILURE_CODES.includes(failure.code)?failure.code:'other';
    const profile=database.providerProfiles[scan.profileId];if(!profile||database.providers[provider]?.activeProfileId!==scan.activeAtStartId)return false;
    if(scanCompleted(profile,scan))return false;
    const health=validateSyncHealth({attemptRef:scan.attemptRef,status:'failed',mode:scan.mode,attemptedProfileLabel:scan.profileLabel,startedAt:scan.startedAt,finishedAt:new Date().toISOString(),failureCode,retryable:true,failedRequestCount:failure.failedRequestCount??1,failedPages:failure.failedPages??[]});
    if(canPersistProviderCheck(database,provider,profile,scan)){await persistProviderCheck(database,provider,profile,scan,{syncHealth:health},stored[SCANS]);return true;}
    profile.state={...profile.state,syncHealth:health};
    if(database.providers[provider]?.activeProfileId===profile.profileId)profileState(database,profile,profile.state);
    await persistDatabase(database,provider);return true;
  }
  async function cancelProviderScan(provider,attemptRef){
    const stored=await storageArea.get({[SCANS]:{}}),scan=stored[SCANS]?.[provider];if(!scan||scan.attemptRef!==attemptRef)throw new Error('This scan changed or already finished. Refresh the dashboard.');
    const database=await readDatabase(true),profile=database.providerProfiles[scan.profileId];if(!profile)throw Error('Scan profile changed.');
    if(scan.observationProviderToken?scan.observationProviderToken!==providerObservationToken(activeObservationRead?.envelope,activeObservationRead?.packet,provider):(scan.observationToken??'none')!==(activeObservationRead?.token??'none'))throw Error('Observations changed during this scan. Refresh the dashboard.');
    if(scanCompleted(profile,scan))throw Error('This scan already finished. Refresh the dashboard.');
    const health=validateSyncHealth({attemptRef:scan.attemptRef,startedAt:scan.startedAt,mode:scan.mode,attemptedProfileLabel:scan.profileLabel,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true});
    if(canPersistProviderCheck(database,provider,profile,scan))return persistProviderCheck(database,provider,profile,scan,{syncHealth:health},stored[SCANS]);
    profile.state.syncHealth=health;if(database.providers[provider]?.activeProfileId===profile.profileId)profileState(database,profile,profile.state);return persistDatabase(database,provider);
  }
  function successfulSyncHealth(database,provider,records,full,details){
    const diagnostics=details.scanDiagnostics??{};const profile=Object.values(database.providerProfiles).find(p=>p.provider===provider&&(p.profileId===details.profileId||p.nickname===(details.profileLabel??database.providers[provider]?.profileLabel??'')));const prior=details.scanAttempt??profile?.state.syncHealth;
    const failedRequestCount=diagnostics.failedRequestCount??0;
    const informationalCoverage=provider==='fanatical'&&diagnostics.coverageLimit==='array-only-index-without-total';
    const incomplete=failedRequestCount>0||diagnostics.incomplete===true||Boolean(diagnostics.coverageLimit)&&!informationalCoverage;
    return validateSyncHealth({attemptRef:details.scanAttempt||prior?.status==='running'?prior.attemptRef:'',status:incomplete?'partial':'succeeded',mode:full?'full':'incremental',attemptedProfileLabel:details.profileLabel??database.providers[provider]?.profileLabel??'',startedAt:details.scanAttempt||prior?.status==='running'?prior.startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),retryable:incomplete,failedRequestCount,retries:diagnostics.retries??null,coverageLimit:diagnostics.coverageLimit??'',differences:{...snapshotDifferences(Object.values(database.providerItems).filter(item=>item.profileId===profile?.profileId),records,full,['steam','epic','audible'].includes(provider)),...(provider==='kobo'?{updated:records.filter(item=>koboObservationChanged(database.providerItems[item.id],item)).length}:{})}});
  }
  async function restoreDatabase(database,preferences){
    const restored=validateDatabase(database),retirement=await GalacticPurchaseSync.retirementPatch(storageArea),extra={...retirement.patch,[PROVIDER_CHECKS_KEY]:null};
    if(preferences!==undefined){
      if(!preferences||Object.keys(preferences).some(key=>!['comicCoverageStarts','comicCoverageTransitions','comicCoverageMerges','comicCoverageNames'].includes(key))||!Object.keys(preferences).length)throw Error('Invalid backup display preferences.');
      extra[UI_PREFERENCES_KEY]=validateUiPreferences({...await getUiPreferences(),...preferences});
    }
    // Explicit replacement must not revive a receipt when restoring an exactly
    // identical old value. Failure here aborts replacement, before its DB set.
    for(const provider of Object.keys(restored.providers))cancelProfileAttempt(restored,provider);for(const state of Object.values(restored.providers))if(state.syncHealth?.status==='running')state.syncHealth={...state.syncHealth,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true};const result=await persistDatabase(restored,'all',extra);Promise.resolve().then(()=>onPurchaseSyncInvalidated(retirement.retired)).catch(()=>{});return result;
  }
  async function importUnscopedProviderItems(provider,values,details,snapshot){
    if(['nintendo','playstation','xbox'].includes(provider))throw Error('Console imports require a confirmed account-bound scan.');
    const database=await getDatabase();
    if(database.providers[provider]?.profileLabel)throw new Error('Reload the provider page and start a confirmed profile scan.');
    return details.syncMode==='incremental'?mergeProviderItems(provider,values,details):replaceProviderItems(provider,values,details,snapshot);
  }
  async function getDatabase() {
    return readDatabase();
  }
  async function readDatabase(reuseCommittedValidation=false) {
    await recoverObservations();
    // A successful refresh commit should publish a proof for its next batch,
    // even if no Options/companion query has requested a snapshot yet.
    if(reuseCommittedValidation&&cacheQuerySnapshots)querySnapshotsUsed=true;
    const epoch=querySnapshotEpoch;
    const stored = await timedAsync('storage_read',()=>storageArea.get({ [DATABASE_STORAGE_KEY]: null }));
    if(activeTiming)activeTiming.recordsRead=(activeTiming.recordsRead??0)+Object.keys(stored[DATABASE_STORAGE_KEY]?.providerItems??{}).length;
    if (!stored[DATABASE_STORAGE_KEY]){await requireNoObservations();return createEmptyDatabase();}
    // Mutation proof: the freshly read authoritative value is exactly the
    // already validated immutable committed revision. Never use the eligibility
    // projection, an uncommitted working copy, or epoch identity alone as proof.
    const committed=querySnapshot;
    if(reuseCommittedValidation&&cacheQuerySnapshots&&committed
      &&timed('read_committed_compare',()=>equalDatabaseData(stored[DATABASE_STORAGE_KEY],committed))){
      return checkedProviderView(timed('read_committed_clone',()=>structuredClone(committed)),committed);
    }
    if(reuseCommittedValidation&&cacheQuerySnapshots){
      // Authoritative cold mutation reads may reuse only exact current-code
      // validation proof. This never validates incoming records or a save.
      const verifiedDigest=await timedAsync('read_certificate',()=>certificates.verifyDigest(stored[DATABASE_STORAGE_KEY],{beginSpan:stage=>{
        const end=activeTiming?.begin(stage),endActivity=activity(stage,{operation:activeOperation});
        return ()=>{end?.();endActivity();};
      }}));
      if(epoch!==querySnapshotEpoch){timed('read_certificate_retry',()=>{});return readDatabase(true);}
      timed(verifiedDigest?'certificate_hit':'certificate_miss',()=>{});
      if(verifiedDigest){
        publishQuerySnapshot(stored[DATABASE_STORAGE_KEY],verifiedDigest);
        return checkedProviderView(stored[DATABASE_STORAGE_KEY],querySnapshot??stored[DATABASE_STORAGE_KEY]);
      }
    }
    const database = await timedAsync('read_validation',()=>validateForWriter(stored[DATABASE_STORAGE_KEY]));
    if(reuseCommittedValidation&&cacheQuerySnapshots&&epoch!==querySnapshotEpoch){timed('read_certificate_retry',()=>{});return readDatabase(true);}
    if (timed('migration_compare',()=>!equalDatabaseData(stored[DATABASE_STORAGE_KEY], database))) {
      const claimsOnly=normalizePermanentClaimsDatabase(stored[DATABASE_STORAGE_KEY]);
      if(equalDatabaseData(claimsOnly,database)){
        // Validate the original observation binding before retiring it through
        // the ordinary atomic writer. Foreign/damaged observations still fail.
        // Give the journal an immutable view of its original, fully checked
        // base. Otherwise it tries to load the snapshot currently awaiting this
        // migration and waits on its own queued getDatabase operation.
        const original=registerCommittedSnapshot(freezeQuerySnapshot(structuredClone(stored[DATABASE_STORAGE_KEY])));
        return persistDatabase(await checkedProviderView(database,original));
      }

      // An identity repair cannot silently detach authoritative observations
      // from their exact original base. Explicit restore/clear remains available.
      await requireNoObservations();
      const jobState = await storageArea.get({[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]: null});
      const job = jobState[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY];
      const migrated = {[DATABASE_STORAGE_KEY]: database};
      const legacyRefresh=await readKindleRefresh();
      if(legacyRefresh){try{const bound=bindKindleRefresh(legacyRefresh,database);if(!equalDatabaseData(bound,legacyRefresh))migrated[KINDLE_REFRESH_KEY]=bound;}catch{/* Retain unresolved old checkpoint without inventing ownership. */}}

      const archives=(await storageArea.get({[KINDLE_REFRESH_ARCHIVES_KEY]:{}}))[KINDLE_REFRESH_ARCHIVES_KEY];let archiveChanged=false;
      for(const [id,raw]of Object.entries(archives))if(database.providerProfiles[id])try{const bound=bindKindleRefresh(raw,database);if(!equalDatabaseData(bound,raw)){archives[id]=bound;archiveChanged=true;}}catch{/* Preserve unresolved frozen work. */}
      if(archiveChanged)migrated[KINDLE_REFRESH_ARCHIVES_KEY]=archives;
      if (Array.isArray(job?.queue)) {
        const byRecord = new Map(Object.values(database.canonicalItems).flatMap((entry) => entry.providerItemIds.map((id) => [id, entry.id])));
        migrated[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY] = {...job, queue: job.queue.map((id) => {
          const previous = stored[DATABASE_STORAGE_KEY].canonicalItems?.[id];
          return previous?.providerItemIds?.map((itemId) => byRecord.get(itemId)).find(Boolean) ?? id;
        })};
      }
      await timedAsync('migration_write',()=>storageArea.set(migrated));
    }
    if(reuseCommittedValidation&&cacheQuerySnapshots)publishQuerySnapshot(database);
    const base=querySnapshot&&equalDatabaseData(stored[DATABASE_STORAGE_KEY],querySnapshot)?querySnapshot:database;
    return checkedProviderView(database,base);
  }

  async function persistDatabase(database,invalidate=null,extra={},beforeSave=null) {
    for(const [provider,state]of Object.entries(database.providers)){
      const profile=database.providerProfiles[state.activeProfileId];if(profile){profile.state={...state};delete profile.state.activeProfileId;}
    }
    const validated = await timedAsync('persist_validation',()=>validateForWriter(database));
    if(activeTiming)activeTiming.recordsWritten=(activeTiming.recordsWritten??0)+Object.keys(validated.providerItems).length;
    const updates={...extra,[DATABASE_STORAGE_KEY]:validated};
    if(invalidate==='all'){updates[KINDLE_REFRESH_KEY]=null;updates[KINDLE_REFRESH_ARCHIVES_KEY]={};}
    if(invalidate){const stored=await storageArea.get({[SCANS]:{}});const scans=invalidate==='all'?{}:{...stored[SCANS]};if(invalidate!=='all')delete scans[invalidate];updates[SCANS]=scans;}
    if(invalidate==='all'||invalidate==='humble')updates[FEED_UPLOAD_KEY]={};
    if(invalidate==='all')updates[NOTIFICATIONS]={enabled:false,lastNotifiedDay:''};
    if(invalidate==='all'){const stored=await storageArea.get({[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]:null});if(stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY])updates[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]=null;}
    if(beforeSave)await beforeSave();await timedAsync('storage_write',()=>storageArea.set(updates));
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

  async function ensurePurchaseAccount(provider){
    if(!['humble','fanatical'].includes(provider))throw Error('Unsupported purchase provider.');
    const database=await getDatabase(),existing=Object.values(database.providerProfiles).filter(p=>p.provider===provider);if(existing.length)return existing.map(p=>p.profileId);
    const profile=newProviderProfile(provider);database.providerProfiles[profile.profileId]=profile;profileState(database,profile,profile.state);await persistDatabase(database);return [profile.profileId];
  }
  async function importPurchaseSnapshot(data,target){const scans=(await storageArea.get({[SCANS]:{}}))[SCANS];if(scans[data.provider])throw Error('Wait for the provider scan to finish before importing saved purchases.');const database=await getDatabase();const guard=()=>GalacticPurchaseSync.assertCommit(storageArea,data.provider,target,target?.accountRef);await guard();const stats=await applyPurchaseSnapshot(database,data,target);if(stats.added||stats.updated||target?.newLabel)await persistDatabase(database,null,{},guard);return stats;}

  function historicalRecords(database,profileId){
    const groups=new Map();for(const h of Object.values(database.providerHistory))if(h.item.profileId===profileId){const list=groups.get(h.item.id)??[];list.push(h.item);groups.set(h.item.id,list);}
    return new Map([...groups].filter(([,items])=>items.length===1).map(([id,items])=>[id,items[0]]));
  }
  function preserveEnrichment(incoming, previous,stableSparse=false) {
    if(incoming.provider==='audible'&&previous?.mediaType===incoming.mediaType){
      const metadata={...incoming.metadata};
      for(const key of ['authors','narrators','series','edition','language','publisher','isbn','volume','run'])if(!metadata[key]?.length&&previous.metadata?.[key]?.length)metadata[key]=previous.metadata[key];
      for(const key of ['audiblePurchaseEvidence','audibleRefundDates','audibleAcquiredOn'])if(previous.metadata?.[key]!==undefined)metadata[key]=previous.metadata[key];
      const keepOwnership=['owned','returned','revoked','expired'].includes(previous.ownership)&&['unknown','subscription','expired'].includes(incoming.ownership)&&!(audibleLibraryExpiry(previous)&&incoming.ownership==='subscription');
      if(keepOwnership){
        if(previous.metadata?.audibleOwnershipBasis!==undefined)metadata.audibleOwnershipBasis=previous.metadata.audibleOwnershipBasis;
        else delete metadata.audibleOwnershipBasis;
      }else if(previous.metadata?.audibleOwnershipBasis&&previous.metadata.audibleOwnershipBasis!=='audible-library-action')metadata.audibleOwnershipBasis=previous.metadata.audibleOwnershipBasis;
      if(audibleLibraryExpiry(previous)&&incoming.ownership==='unknown')metadata.libraryAvailability='unavailable';
      incoming={...incoming,metadata,acquiredAt:previous.acquiredAt??incoming.acquiredAt,
        ...(keepOwnership?{ownership:previous.ownership}:{})};
    }
    if(incoming.provider==='steam'&&previous)incoming={...incoming,acquiredAt:incoming.acquiredAt??previous.acquiredAt,metadata:{...previous.metadata,...incoming.metadata}};
    if(incoming.provider==='kindle'&&previous)incoming={...incoming,acquiredAt:incoming.acquiredAt??previous.acquiredAt};
    if(incoming.provider==='fandango-at-home'&&previous)incoming={...incoming,acquiredAt:incoming.acquiredAt??previous.acquiredAt,metadata:{...previous.metadata,...incoming.metadata}};
    if(incoming.provider==='kindle'&&previous?.ownership==='owned'&&incoming.ownership==='unknown'&&!incoming.metadata.ownershipBasis){
      incoming={...incoming,ownership:previous.ownership,metadata:{...incoming.metadata,originType:previous.metadata.originType,...(previous.metadata.ownershipBasis?{ownershipBasis:previous.metadata.ownershipBasis}:{})}};
    }
    if (previous?.recordRef) incoming = {...incoming, recordRef: previous.recordRef};
    incoming=preserveKoboObservation(incoming,previous);
    if(incoming.provider==='amazon-games'&&previous){
      incoming={...incoming,acquiredAt:incoming.acquiredAt??previous.acquiredAt,metadata:{...incoming.metadata,
        ...(previous.metadata.acquisitionMethod&&!incoming.metadata.acquisitionMethod?{acquisitionMethod:previous.metadata.acquisitionMethod}:{}),
        ...(previous.metadata.collectedOn&&!incoming.metadata.collectedOn?{collectedOn:previous.metadata.collectedOn}:{}),
        ...(previous.metadata.observationIds?.length?{observationIds:previous.metadata.observationIds}:{})}};
    }
    if(incoming.provider==='amazon-games'&&previous?.mediaType===incoming.mediaType
        &&incoming.ownership==='unknown'&&['owned','claimed'].includes(previous.ownership)){
      incoming={...incoming,ownership:previous.ownership,metadata:{...incoming.metadata,delivery:
        [...new Set([previous.metadata?.delivery,incoming.metadata?.delivery].flatMap(value=>(value||'').split(' | ')).filter(Boolean))].join(' | ')}};
    }
    if(incoming.provider==='amazon-video'&&previous?.mediaType===incoming.mediaType
        &&[previous.ownership,incoming.ownership].includes('owned')
        &&['owned','subscription'].includes(previous.ownership)&&['owned','subscription'].includes(incoming.ownership)){
      const purchase=incoming.ownership==='owned'?incoming:previous,other=purchase===incoming?previous:incoming;
      incoming={...incoming,ownership:'owned',metadata:{...incoming.metadata,ownershipEvidence:
        [...new Set([purchase,other].flatMap(item=>(item.metadata.ownershipEvidence||'').split(' | ')).filter(Boolean))].join(' | ')}};
    }
    // A sparse Video card is not evidence that an earlier entitlement ended.
    // Source observations stay separate from authoritative user corrections.
    if(incoming.provider==='amazon-video'&&previous?.mediaType===incoming.mediaType
        &&incoming.ownership==='unknown'&&previous.ownership!=='unknown'){
      incoming={...incoming,ownership:previous.ownership,metadata:{...incoming.metadata,
        ...(previous.metadata?.ownershipEvidence?{ownershipEvidence:previous.metadata.ownershipEvidence}:{})}};
    }
    // Kobo sparse observations with no meaningful metadata/access change have
    // historically retained their saved representation and observation date.
    // Normalize that policy here; persistence can then compare exact records.
    if(incoming.provider==='kobo'&&previous&&!koboObservationChanged(previous,incoming)){
      if(stableSparse)return previous;
      incoming.updatedAt=previous.updatedAt;
    }
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

  function importProfile(database,provider,label,profileId){
    if(profileId){const p=database.providerProfiles[profileId];if(!p||p.provider!==provider)throw Error('Invalid target profile.');return p;}
    label=text(label??database.providers[provider]?.profileLabel??'',100,'Profile nickname');
    let profile=Object.values(database.providerProfiles).find(p=>p.provider===provider&&p.nickname===label);
    if(!profile){profile=newProviderProfile(provider,label,!label&&!database.legacyProfileNamespaces?.[provider]&&!Object.values(database.providerProfiles).some(p=>p.provider===provider));database.providerProfiles[profile.profileId]=profile;}
    return profile;
  }
  function profileState(database,profile,state){
    profile.state={...state};delete profile.state.activeProfileId;
    database.providers[profile.provider]={...state,profileLabel:profile.nickname,activeProfileId:profile.profileId};
  }
  function audibleHistoryDetails(provider,details,profile,now){
    if(provider!=='audible'||details.audibleHistory===undefined)return {details,history:undefined};
    const history=validateAudibleHistory(details.audibleHistory),next={...details};delete next.audibleHistory;
    const complete=history.ordersComplete&&history.refundsComplete&&history.giftsComplete!==false&&!history.uncertainRefundAsins.length;
    const fullCheckedAt=history.scope==='full'&&complete?now:profile.state.syncState?.audibleHistory?.fullCheckedAt;
    next.syncState={...(details.syncState??profile.state.syncState),audibleHistory:{version:1,scope:history.scope,...audibleGiftHistory(history),failures:history.failures,uncertainRefunds:history.uncertainRefundAsins.length,ordersComplete:history.ordersComplete,refundsComplete:history.refundsComplete,refundPurchaseYearsChecked:history.refundPurchaseYearsChecked,years:history.years,pagesRead:history.pagesRead,checkedAt:now,...(fullCheckedAt?{fullCheckedAt}:{}),reason:history.reason}};
    next.scanDiagnostics={...details.scanDiagnostics,incomplete:details.scanDiagnostics?.incomplete===true||!complete,failedRequestCount:0};
    return {details:next,history};
  }
  // Validated orders are useful skip evidence, independently of enumeration.
  // Retain prior successes when a headerless response omits them. A Full
  // acquisition refreshes returned details but grants no absence authority.
  function fanaticalAcquisitionDetails(profile,details){
    const {fullSyncAt,...safe}=details;
    const prior=profile.state.syncState??{};
    const incoming=details.syncState??{},failed=new Set([...(prior.failedOrderFingerprints??[]),...(incoming.failedOrderFingerprints??[])]);
    for(const id of incoming.knownOrderFingerprints??[])failed.delete(id);
    return {...safe,syncState:{...incoming,
      knownOrderFingerprints:[...new Set([...(prior.knownOrderFingerprints??[]),...(incoming.knownOrderFingerprints??[])])].filter(id=>!failed.has(id)),
      ...(failed.size?{failedOrderFingerprints:[...failed]}:{}),
      acquisitionCheckedAt:prior.acquisitionCheckedAt??new Date().toISOString()}};
  }
  function humbleAcquisitionDetails(profile,details,partialFull=false){
    const {fullSyncAt,...safe}=details,prior=profile.state.syncState??{};
    const incoming=details.syncState??{},failed=new Set([...(prior.failedPurchaseIds??[]),...(incoming.failedPurchaseIds??[])]);
    for(const id of incoming.knownPurchaseIds??[])failed.delete(id);
    const knownPurchaseIds=[...new Set([...(prior.knownPurchaseIds??[]),...(incoming.knownPurchaseIds??[])])].filter(id=>!failed.has(id));
    const acquisitionCheckedAt=prior.acquisitionCheckedAt??incoming.acquisitionCheckedAt??(partialFull?new Date().toISOString():null);
    return {...safe,syncState:{knownPurchaseIds,...(failed.size?{failedPurchaseIds:[...failed]}:{}),...(acquisitionCheckedAt?{acquisitionCheckedAt}:{})}};
  }
  function kindleAcquisitionDetails(profile,details,snapshot){
    const prior=profile.state.syncState??{},partial=snapshot?.complete===false;
    const pending=partial?Boolean(snapshot.recovery.failedItems||snapshot.recovery.failedPages):prior.listingIncomplete&&snapshot?.complete!==true;
    if(!partial&&!prior.listingIncomplete&&!prior.acquisitionCheckedAt)return details;
    const {fullSyncAt,...safe}=details;
    const state={...(prior.acquisitionCheckedAt||partial?{acquisitionCheckedAt:prior.acquisitionCheckedAt??new Date().toISOString()}:{}),...(pending?{listingIncomplete:true}:{})};
    return {...(partial||pending?safe:details),syncState:state,...(pending?{scanDiagnostics:{...safe.scanDiagnostics,incomplete:true}}:{})};
  }
  async function replaceProviderItems(provider, values, syncDetails = {}, snapshot) {
    return replaceIntoDatabase(provider,values,syncDetails,snapshot);
  }
  async function replaceIntoDatabase(provider, values, syncDetails = {}, snapshot,authoritativeDatabase=null,beforeSave=null,completion=null) {
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid provider.');
    if (!Array.isArray(values) || values.length>50000) throw new Error('Import needs a bounded item list.');
    if(['fandango-at-home','audible'].includes(provider)&&snapshot?.complete===false){
      validateProviderSnapshot(provider,values,snapshot);
      const {fullSyncAt,...safe}=syncDetails;
      return mergeIntoDatabase(provider,values,{...safe,syncState:{...(provider==='audible'?syncDetails.syncState:{}),listingIncomplete:true},scanDiagnostics:{...safe.scanDiagnostics,incomplete:true}},authoritativeDatabase,null,beforeSave,completion);
    }
    if(provider==='kindle'&&snapshot?.complete===false){
      validateProviderSnapshot(provider,values,snapshot);
      const database=authoritativeDatabase??await getDatabase(),profile=importProfile(database,provider,syncDetails.profileLabel,syncDetails.profileId);
      return mergeIntoDatabase(provider,values,kindleAcquisitionDetails(profile,syncDetails,snapshot),database,null,beforeSave,completion);
    }
    if(provider==='amazon-games'&&snapshot?.complete===false){
      validateProviderSnapshot(provider,values,snapshot);
      const {fullSyncAt,...safe}=syncDetails;
      return mergeIntoDatabase(provider,values,{...safe,syncState:{listingIncomplete:true,pendingWindows:snapshot.recovery.pendingWindows},scanDiagnostics:{...safe.scanDiagnostics,incomplete:true,coverageLimit:'incomplete-amazon-games-claims'}},authoritativeDatabase,null,beforeSave,completion);
    }
    if(provider==='amazon-video'&&snapshot?.complete===false){
      validateProviderSnapshot(provider,values,snapshot);
      const {fullSyncAt,...safe}=syncDetails;
      return mergeIntoDatabase(provider,values,{...safe,syncState:{listingIncomplete:true},scanDiagnostics:{...safe.scanDiagnostics,incomplete:true,coverageLimit:'unreadable-amazon-video-cards'}},authoritativeDatabase,null,beforeSave,completion);
    }
    validateProviderSnapshot(provider, values, snapshot);
    if(['gog','epic'].includes(provider)&&snapshot.complete===false){
      const database=authoritativeDatabase??await getDatabase(),profile=importProfile(database,provider,syncDetails.profileLabel,syncDetails.profileId),historical=historicalRecords(database,profile.profileId);
      values=values.filter(value=>{const id=providerItemKey(provider,value.providerItemId,profile.keySpace);return database.providerItems[id]||!historical.has(id);});
      const {fullSyncAt,...safe}=syncDetails;
      return mergeIntoDatabase(provider,values,{...safe,scanDiagnostics:{...safe.scanDiagnostics,incomplete:true}},database,null,beforeSave,completion);
    }
    if(provider==='humble'&&snapshot.complete===false){
      const database=authoritativeDatabase??await getDatabase(),profile=importProfile(database,provider,syncDetails.profileLabel,syncDetails.profileId);
      const historical=historicalRecords(database,profile.profileId);
      // A partial acquisition does not undo a prior historical transition.
      values=values.filter(value=>{const id=providerItemKey(provider,value.providerItemId,profile.keySpace);return database.providerItems[id]||!historical.has(id);});
      return mergeIntoDatabase(provider,values,humbleAcquisitionDetails(profile,syncDetails,true),database,null,beforeSave,completion);
    }
    if(provider==='fanatical'&&snapshot.complete===false){
      const database=authoritativeDatabase??await getDatabase(),profile=importProfile(database,provider,syncDetails.profileLabel,syncDetails.profileId);
      if(snapshot.recovery){const historical=historicalRecords(database,profile.profileId);values=values.filter(value=>{const id=providerItemKey(provider,value.providerItemId,profile.keySpace);return database.providerItems[id]||!historical.has(id);});}
      return mergeIntoDatabase(provider,values,fanaticalAcquisitionDetails(profile,syncDetails),database,null,beforeSave,completion);
    }
    if(provider==='steam'&&syncDetails.syncState?.applications){
      const applications=validateSteamApplicationImport(values,syncDetails.syncState.applications,[],true);
      const scope=snapshot.scopes[0];
      if(snapshot.scopes.length!==1||scope.id!=='library'||scope.end!=='index-complete'||scope.readCount!==applications.appIds.length||scope.expectedCount!==applications.appIds.length)throw Error('Steam owned enumeration is incomplete. Previous records were kept.');
      // Ownership enumeration is complete even when catalog metadata is not.
      // Keep ID-only evidence in this account's state, outside named catalogs;
      // never remove a saved title merely because its metadata cannot be read.
      return mergeIntoDatabase(provider,values,{...syncDetails,syncState:{applications},snapshotValidation:{...snapshot,validatedAt:new Date().toISOString()}},authoritativeDatabase,null,beforeSave,completion);
    }
    if(provider==='amazon-games'&&snapshot.scopes.some(scope=>scope.expectedCount===null))return mergeIntoDatabase(provider,values,{...syncDetails,scanDiagnostics:{...syncDetails.scanDiagnostics,coverageLimit:'inferred-scroll-convergence-preserve-unseen'}},authoritativeDatabase,null,beforeSave,completion);
    // Amazon's count-independent traversal is inferred, not authoritative
    // absence evidence. Reuse additive reconciliation under the same lease,
    // validation and stale-save guards; never archive an unseen title.
    if (provider === 'amazon-video') {
      const scope = snapshot.scopes[0];
      if (snapshot.scopes.length !== 1 || scope.id !== 'library' || scope.readCount !== snapshot.itemCount) {
        throw Error('Amazon Video provided inconsistent library completion evidence. Previous records were kept.');
      }
      if (scope.end === 'scroll-end' && scope.expectedCount === null) {
        return mergeIntoDatabase(provider, values, { ...syncDetails,
          scanDiagnostics: { ...syncDetails.scanDiagnostics, coverageLimit: 'inferred-scroll-convergence-preserve-unseen' }
        }, authoritativeDatabase, null, beforeSave, completion);
      }
      if (scope.end !== 'reported-count' || scope.expectedCount === null) {
        throw Error('Amazon Video did not provide supported completion evidence. Previous records were kept.');
      }
    }
    const database = authoritativeDatabase??await getDatabase();
    const now = new Date().toISOString();
    const priorActiveId=database.providers[provider]?.activeProfileId;
    const profile=importProfile(database,provider,syncDetails.profileLabel,syncDetails.profileId);
    const audible=audibleHistoryDetails(provider,syncDetails,profile,now);syncDetails=audible.details;
    if(provider==='amazon-games')values=await prepareAmazonGamesImport(database,profile.profileId,values);
    const retained = Object.fromEntries(Object.entries(database.providerItems).filter(([, item]) => item.profileId !== profile.profileId));
    const historicalById=historicalRecords(database,profile.profileId);
    if(activeTiming)activeTiming.recordsNormalized=(activeTiming.recordsNormalized??0)+values.length;
    let incoming = timed('entry_validation',()=>values.map((value) => {
      if(provider==='humble')value=preserveHumbleEntitlementReference(database,profile,value);
      const item = normalizeProviderItem({ ...value, provider, profileId:profile.profileId, recordRef:undefined, observedAt:now }, now, {allowEnrichment:false,profileKeySpace:profile.keySpace});
      item.metadata.source = PROVIDER_SOURCES[provider];
      return preserveEnrichment(item, database.providerItems[item.id]??historicalById.get(item.id));
    }));
    if(provider==='audible')incoming=enrichAudibleRecords(database,profile.profileId,incoming,audible.history,{full:true});
    const unique = new Map(incoming.map((item) => [item.id, item]));
    for(const item of Object.values(database.providerItems))if(item.profileId===profile.profileId&&!unique.has(item.id))database.providerHistory[item.recordRef]={item,profileLabel:profile.nickname,reason:'missing-from-complete-scan',missingSince:now};
    for(const [ref,entry]of Object.entries(database.providerHistory))if(entry.item.profileId===profile.profileId&&unique.get(entry.item.id)?.recordRef===ref)delete database.providerHistory[ref];
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
      return item.mediaType === 'game-addon' && parentId && unique.has(providerItemKey(item.provider, parentId,profile.keySpace));
    }).length;
    const syncHealth=successfulSyncHealth(database,provider,records,true,syncDetails);
    reconcileMediaChanges(database,incoming);
    database.providerItems = { ...retained, ...Object.fromEntries(unique) };
    database.canonicalItems = timed('canonical_rebuild',()=>rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations));
    database.providers[provider] = {
      ...profile.state,
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
    const jobs=provider==='kindle'?await kindleProfileTransition(database,priorActiveId,profile.profileId):{};
    if(priorActiveId!==profile.profileId)profile.lastSelectedAt=now;
    profileState(database,profile,database.providers[provider]);
    if(completion){const observed=await tryObservationCompletion(database,provider,completion);if(observed)return observed;}
    return persistDatabase(database,provider,jobs,beforeSave);
  }

  // Incremental syncs must never make an entitlement disappear merely because
  // the provider returned only its recent additions. Full syncs use the
  // replacement function above; quick syncs add or refresh records here.
  function normalizedIncoming(database,provider,profile,values){
    if(!Array.isArray(values)||values.length>50000)throw Error('Import needs a bounded item list.');
    const historicalById=historicalRecords(database,profile.profileId),now=new Date().toISOString();
    if(activeTiming)activeTiming.recordsNormalized=(activeTiming.recordsNormalized??0)+values.length;
    return values.map(value=>{
      if(provider==='humble')value=preserveHumbleEntitlementReference(database,profile,value);
      const item=normalizeProviderItem({...value,provider,profileId:profile.profileId,recordRef:undefined,observedAt:now},now,{allowEnrichment:false,profileKeySpace:profile.keySpace});
      item.metadata.source=PROVIDER_SOURCES[provider];
      return preserveEnrichment(item,database.providerItems[item.id]??historicalById.get(item.id),true);
    });
  }
  async function mergeProviderItems(provider,values,syncDetails={}){
    return mergeIntoDatabase(provider,values,syncDetails);
  }
  async function mergeIntoDatabase(provider, values, syncDetails = {}, authoritativeDatabase=null,preparedIncoming=null,beforeSave=null,completion=null) {
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid provider.');
    if (!Array.isArray(values) || values.length>50000) throw new Error('Import needs a bounded item list.');
    const database = authoritativeDatabase??await getDatabase();
    const priorActiveId=database.providers[provider]?.activeProfileId;
    const profile=importProfile(database,provider,syncDetails.profileLabel,syncDetails.profileId);
    if(['gog','epic','amazon-video','kindle','fandango-at-home','audible'].includes(provider)&&syncDetails.scanDiagnostics?.incomplete||provider==='kindle'&&!syncDetails.fullSyncAt){
      const historical=historicalRecords(database,profile.profileId);values=values.filter(value=>{const id=providerItemKey(provider,value.providerItemId,profile.keySpace);return database.providerItems[id]||!historical.has(id);});preparedIncoming=null;
      const {fullSyncAt,...safe}=syncDetails;syncDetails=safe;
    }
    if(provider==='fandango-at-home'&&syncDetails.scanDiagnostics?.incomplete){
      values=values.filter(value=>{const prior=database.providerItems[providerItemKey(provider,value.providerItemId,profile.keySpace)];return !prior||prior.mediaType===value.mediaType&&!(prior.ownership==='owned'&&value.ownership==='rental');});preparedIncoming=null;
    }
    if(provider==='fanatical'&&syncDetails.syncState&&(profile.state.syncState?.acquisitionCheckedAt||syncDetails.syncState.acquisitionCheckedAt)){
      if(syncDetails.scanDiagnostics?.incomplete||profile.state.syncState?.failedOrderFingerprints?.length||profile.state.syncState?.listingIncomplete){
        const historical=historicalRecords(database,profile.profileId);values=values.filter(value=>{const id=providerItemKey(provider,value.providerItemId,profile.keySpace);return database.providerItems[id]||!historical.has(id);});preparedIncoming=null;
      }
      syncDetails=fanaticalAcquisitionDetails(profile,syncDetails);
    }
    if(provider==='humble'&&syncDetails.syncState){
      if(syncDetails.scanDiagnostics?.incomplete||profile.state.syncState?.failedPurchaseIds?.length){
        const historical=historicalRecords(database,profile.profileId);
        values=values.filter(value=>{const id=providerItemKey(provider,value.providerItemId,profile.keySpace);return database.providerItems[id]||!historical.has(id);});
        preparedIncoming=null;
      }
      syncDetails=humbleAcquisitionDetails(profile,syncDetails);
    }
    if(provider==='steam'&&syncDetails.syncState?.applications){
      const applications=validateSteamApplicationImport(values,syncDetails.syncState.applications,Object.values(database.providerItems).filter(item=>item.profileId===profile.profileId),syncDetails.syncMode==='full');
      const latest=new Set(applications.appIds),prior=profile.state.syncState?.applications;
      const supplied=new Set(values.map(item=>item.providerItemId)),pending=new Set(applications.issues.map(issue=>issue.appId));
      if(syncDetails.syncMode!=='full')for(const issue of prior?.issues??[])if(latest.has(issue.appId)&&!pending.has(issue.appId)&&!supplied.has(issue.appId))throw Error('Steam did not recheck a pending application. Previous records were kept.');
      const earlier=[...new Set([...(prior?.previouslyObservedAppIds??[]),...(prior?.appIds??[]),...(applications.previouslyObservedAppIds??[])])].filter(id=>!latest.has(id)).sort((a,b)=>Number(a)-Number(b));
      if(earlier.length)applications.previouslyObservedAppIds=earlier;
      syncDetails={...syncDetails,syncState:{applications}};
      const accessFor=steamApplicationAccess(applications);
      const accessUpdates=Object.values(database.providerItems).filter(item=>item.profileId===profile.profileId&&latest.has(item.providerItemId)&&!supplied.has(item.providerItemId)).flatMap(item=>{
        const {basis,ownership}=accessFor(item.providerItemId);
        return item.ownership!==ownership||item.metadata.ownershipBasis!==basis?[{...item,ownership,metadata:{...item.metadata,ownershipBasis:basis}}]:[];
      });
      if(accessUpdates.length){values=[...values,...accessUpdates];preparedIncoming=null;}
    }
    const now = new Date().toISOString();
    if(provider==='amazon-games'){
      values=await prepareAmazonGamesImport(database,profile.profileId,values);preparedIncoming=null;
      if(syncDetails.scanDiagnostics?.incomplete){
        const historical=historicalRecords(database,profile.profileId);values=values.filter(value=>{const id=providerItemKey(provider,value.providerItemId,profile.keySpace);return database.providerItems[id]||!historical.has(id);});
        const {fullSyncAt,...safe}=syncDetails;syncDetails=safe;
        syncDetails={...syncDetails,syncState:{listingIncomplete:true,pendingWindows:[...new Set([...(profile.state.syncState?.pendingWindows??[]),...(syncDetails.syncState?.pendingWindows??[])])]}};
      }
    }
    const audible=audibleHistoryDetails(provider,syncDetails,profile,now);syncDetails=audible.details;
    let incoming = preparedIncoming??timed('entry_validation',()=>normalizedIncoming(database,provider,profile,values));
    if(provider==='audible')incoming=enrichAudibleRecords(database,profile.profileId,incoming,audible.history);
    const unique = new Map(incoming.map((item) => [item.id, item]));
    const syncHealth=successfulSyncHealth(database,provider,[...unique.values()],false,syncDetails);
    if(['amazon-games','steam','fanatical','humble','fandango-at-home','audible'].includes(provider)&&syncDetails.syncMode==='full')syncHealth.mode='full';
    reconcileMediaChanges(database,incoming);
    database.providerItems = { ...database.providerItems, ...Object.fromEntries(unique) };
    for(const [ref,entry]of Object.entries(database.providerHistory))if(entry.item.provider===provider&&entry.item.profileId===profile.profileId&&unique.get(entry.item.id)?.recordRef===ref)delete database.providerHistory[ref];
    const records = Object.values(database.providerItems).filter((item) => item.profileId === profile.profileId);
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
      return item.mediaType === 'game-addon' && parentId && providerRecords.has(providerItemKey(provider, parentId,profile.keySpace));
    }).length;
    if(incoming.length)database.canonicalItems = timed('canonical_rebuild',()=>rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations));
    database.providers[provider] = {
      ...profile.state,
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
    const jobs=provider==='kindle'?await kindleProfileTransition(database,priorActiveId,profile.profileId):{};
    if(priorActiveId!==profile.profileId)profile.lastSelectedAt=now;
    profileState(database,profile,database.providers[provider]);
    if(completion){const observed=await tryObservationCompletion(database,provider,completion);if(observed)return observed;}
    return persistDatabase(database,provider,jobs,beforeSave);
  }

  async function clearDatabase() {
    const retirement=await GalacticPurchaseSync.retirementPatch(storageArea);
    await storageArea.remove([PROVIDER_CHECKS_KEY,'galacticPurchaseSync','galacticLibraryProviderDiagnostics',DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY, SCANS, NOTIFICATIONS, FEED_UPLOAD_KEY, UI_PREFERENCES_KEY,KINDLE_REFRESH_KEY,KINDLE_REFRESH_ARCHIVES_KEY]);
    Promise.resolve().then(()=>onPurchaseSyncInvalidated(retirement.retired)).catch(()=>{});
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
      else if(outcome.enrichment){for(const record of records)selectEnrichment(database,record.id,'googleBooks',outcome.enrichment,now,true);job.matched++;}
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

  async function saveManualMatchDecision(candidate, decision, preferredTitle=null) {
    if (!candidate || !Array.isArray(candidate.itemIds) || candidate.itemIds.length !== 2 || !['same', 'same-work', 'same-edition', 'different'].includes(decision)) {
      throw new Error('Invalid duplicate-review decision.');
    }
    const database = await getDatabase();
    const itemIds = [...candidate.itemIds].sort();
    if (!itemIds.every((id) => database.providerItems[id])) throw new Error('One of the reviewed library items no longer exists.');
    if(itemIds[0]===itemIds[1]||database.providerItems[itemIds[0]].mediaType!==database.providerItems[itemIds[1]].mediaType)throw new Error('Review two different records of the same media type.');
    if(decision==='same-edition'&&Object.values(database.canonicalItems).some(group=>itemIds.every(id=>group.providerItemIds.includes(id))))throw Error('These records already belong to the same edition. Change its preferred title instead.');
    if(decision==='same-edition'&&identityConflicts(...itemIds.map(id=>database.providerItems[id])).length)throw new Error('These records have conflicting edition evidence. Use Same work instead.');
    database.manualMatchDecisions[itemIds.join('\u0000')] = { decision, itemIds, updatedAt: new Date().toISOString() };
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
    if(decision==='same-edition'&&!Object.values(database.canonicalItems).some(group=>itemIds.every(id=>group.providerItemIds.includes(id))))throw new Error('An indirect identity conflict or Different works decision prevents this edition merge. Review those relationships first.');
    if(decision==='same-edition'&&preferredTitle){
      const group=Object.values(database.canonicalItems).find(group=>itemIds.every(id=>group.providerItemIds.includes(id)));
      applyPreferredTitle(database,group,preferredTitle);
    }
    return persistDatabase(database);
  }

  function applyPreferredTitle(database,group,choice){
    const record=group?.providerItemIds.map(id=>database.providerItems[id]).find(record=>record?.recordRef===choice?.recordRef);
    if(!record||typeof choice.title!=='string'||record.title!==choice.title)throw Error('This source title changed or no longer belongs to this edition. Reload and choose again.');
    const last=Object.values(group.displayTitlePreferences??{}).reduce((latest,value)=>Math.max(latest,Date.parse(value.updatedAt)||0),0);
    group.displayTitlePreferences={...(group.displayTitlePreferences??{}),[record.recordRef]:{title:record.title,updatedAt:new Date(Math.max(Date.now(),last+1)).toISOString()}};
  }

  async function savePreferredDisplayTitle(canonicalId,choice){
    const database=await getDatabase();
    applyPreferredTitle(database,database.canonicalItems[canonicalId],choice);
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
  async function saveOwnershipCorrections(targets,value){
    if(!Array.isArray(targets)||!targets.length||targets.length>500||new Set(targets.map(t=>t?.recordRef)).size!==targets.length)throw Error('Choose 1–500 distinct account records.');
    if(!value||!Object.hasOwn(value,'ownership'))throw Error('Choose an access status.');
    const confirmedAt=new Date().toISOString();
    const review=value.ownership===null?null:validateOwnershipReview({ownership:value.ownership,note:value.note??'',source:'user-correction',evidenceDate:null,sourceUrl:'',expiresAt:null,confirmedAt,reviewRef:crypto.randomUUID()});
    const database=await getDatabase();
    // Validate the entire selection before editing or persisting any record.
    for(const target of targets){
      if(!target||!Object.hasOwn(target,'expectedReviewRef'))throw Error('Reload the selected records before changing access.');
      const item=currentOwnershipRecord(database,target.recordRef,target.expectedReviewRef);
      if(item.provider!==target.provider||item.profileId!==target.profileId)throw Error('A selected account changed. Reload before changing access.');
    }
    for(const target of targets){if(review)database.ownershipReviews[target.recordRef]={...review,reviewRef:crypto.randomUUID()};else delete database.ownershipReviews[target.recordRef];}
    return persistDatabase(database);
  }
  async function importPurchaseEvidence(entries){
    if(!Array.isArray(entries)||!entries.length||entries.length>1000)throw new Error('Import 1–1,000 purchase evidence entries.');
    const evidence=entries.map(purchaseEvidence),database=await getDatabase(),now=new Date().toISOString();
    for(const entry of evidence){
      const profileId=database.providers[entry.provider]?.activeProfileId,profileLabel=database.providerProfiles[profileId]?.nickname??'';
      if(Object.values(database.ownershipProposals).some(proposal=>proposal.profileId===profileId&&JSON.stringify(proposal.evidence)===JSON.stringify(entry)))continue;
      database.ownershipProposals[crypto.randomUUID()]={evidence:entry,...(profileId?{profileId}:{}),profileLabel,recordRefs:profileId?purchaseCandidates(entry,database.providerItems,profileId):[],importedAt:now};
    }
    return persistDatabase(database);
  }
  async function refreshPurchaseEvidence(){
    const database=await getDatabase();for(const proposal of Object.values(database.ownershipProposals))if(database.providerProfiles[proposal.profileId])proposal.recordRefs=purchaseCandidates(proposal.evidence,database.providerItems,proposal.profileId);return persistDatabase(database);
  }
  async function applyPurchaseEvidence(proposalId,ref,confirmed,expected=null){
    const database=await getDatabase(),proposal=database.ownershipProposals[proposalId];
    if(!proposal||confirmed!==true||!proposal.recordRefs.includes(ref))throw new Error('Confirm a current candidate for this receipt.');
    const item=currentOwnershipRecord(database,ref,expected),evidence=proposal.evidence;
    if(item.provider!==evidence.provider||item.mediaType!==evidence.mediaType||!proposal.profileId||proposal.profileId!==item.profileId)throw new Error('This receipt belongs to another provider/profile.');
    const candidate={title:evidence.title,mediaType:evidence.mediaType,metadata:{...(evidence.asin?{asin:evidence.asin}:{}),...(evidence.isbn?{isbn:[evidence.isbn]}:{})}};
    const conflicts=identityConflicts(item,candidate);
    if(evidence.asin&&/^[A-Z0-9]{10}$/iu.test(item.providerItemId)&&item.providerItemId.toUpperCase()!==evidence.asin)conflicts.push('catalog identifier');
    if(conflicts.length)throw new Error(`Receipt conflicts on ${[...new Set(conflicts)].join(', ')}. Review the identifiers and edition first.`);
    database.ownershipReviews[ref]=validateOwnershipReview({ownership:'owned',source:'local-purchase-history',reviewRef:crypto.randomUUID(),note:`${evidence.sourceLabel}: ${evidence.title}`,evidenceDate:evidence.acquiredAt,confirmedAt:new Date().toISOString(),expiresAt:null});delete database.ownershipProposals[proposalId];return persistDatabase(database);
  }
  async function dismissPurchaseEvidence(proposalId){const database=await getDatabase();delete database.ownershipProposals[proposalId];return persistDatabase(database);}
  function selectEnrichment(database,id,kind,value,now,preserveMissingCategories=false,routineCapture=false){
    // Routine reacquisition of the same catalogue item is not an explicit
    // category deletion. Never transplant labels across different source IDs;
    // reviewed replacement/undo/restore use their existing explicit paths.
    const previous=database.providerItems[id]?.metadata?.enrichment?.[kind];
    if(preserveMissingCategories&&kind==='googleBooks'&&value.volumeId&&previous?.categories?.length){
      let sameVolume=previous.volumeId===value.volumeId;
      // Sparse category-only recovery deliberately omits identity fields. Its
      // validated catalogue URL can still prove an identical source for this
      // omission guard; do not promote that URL's ID into matching evidence.
      if(!previous.volumeId&&previous.sourceUrl)try{const source=new URL(previous.sourceUrl);sameVolume=source.origin==='https://books.google.com'&&source.searchParams.get('id')===value.volumeId;}catch{/* No positive source association. */}
      if(sameVolume&&(value.categories===undefined||Array.isArray(value.categories)&&!value.categories.length))value={...value,categories:previous.categories};
    }
    const item=database.providerItems[id];const selectionRef=crypto.randomUUID();
    const enrichment=validateEnrichment(kind,{...value,selectionRef,retrievedAt:value.retrievedAt??value.appliedAt??now,appliedAt:now,approved:value.approved===true,matchBasis:value.matchBasis??(kind==='googleBooks'?'validated-identifier-or-title-and-author':'source-evidence')});
    if(routineCapture&&kind==='kindleProductComicContents'&&identicalCapture(previous,enrichment)){
      // Refresh retrieval metadata without rotating the source choice or its
      // undo predecessor. Never coalesce punctuation, source or parser changes.
      const retained={...enrichment,selectionRef:previous.selectionRef};
      if(previous.appliedAt)retained.appliedAt=previous.appliedAt;else delete retained.appliedAt;
      database.providerItems[id]={...item,metadata:{...item.metadata,enrichment:{...item.metadata.enrichment,[kind]:retained}},updatedAt:now};
      return;
    }
    const observations=kind==='kindleProductComicContents'&&database.kindleContentsObservations?.[item.recordRef];
    if(observations){
      const undo=database.enrichmentHistory[observations.undoRef];
      // Only prune the one undo entry generated by this bounded model. Older
      // legacy history is retained; no historical corpus is silently purged.
      if(undo?.recordRef===item.recordRef&&undo.kind===kind)delete database.enrichmentHistory[observations.undoRef];
      observations.undoRef=selectionRef;
    }
    database.enrichmentHistory[selectionRef]={recordRef:item.recordRef,kind,selectionRef,previous:item.metadata?.enrichment?.[kind]??null,changedAt:now};
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
        selectEnrichment(database,id,'googleBooks',entry.enrichment,updatedAt,true);
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

  function applyKindleComicContents(database,entries,rebuild=true) {
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
      if (!supportedKindleContentsBook(item) || item.profileId!==database.providers.kindle?.activeProfileId || sourceUrl !== String(item.metadata?.detailUrl ?? '') || statement.length > 10000 || (statement && !selection && !/^(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b/iu.test(statement)) || (selection && (entry.extractorVersion!==KINDLE_CONTENTS_EXTRACTOR_VERSION||!['statement-found','no-statement'].includes(entry.availability))) || (!['statement-found','no-statement','unavailable','temporary-failure'].includes(availability)) || (availability!=='statement-found'&&statement) || (availability==='statement-found'&&!statement) || (entry.recordRef&&entry.recordRef!==item.recordRef) || (database.providers.kindle?.profileLabel&&!entry.recordRef) || entry.extractorVersion !== undefined && (!Number.isInteger(entry.extractorVersion) || entry.extractorVersion < 1 || entry.extractorVersion > KINDLE_CONTENTS_EXTRACTOR_VERSION)) {
        endValidation?.();throw new Error('Invalid Kindle contents entry.');
      }
      const previous = item.metadata?.enrichment?.kindleProductComicContents;
      const paths=entry.categoryPaths===undefined?[]:validateKindleCategoryPaths(entry.categoryPaths);
      if(paths.length&&!['statement-found','no-statement'].includes(availability))throw new Error('Category capture requires a successfully retrieved product page.');
      if(entry.productDetailsEvidence&&!['statement-found','no-statement'].includes(availability))throw Error('Product Details require a successfully retrieved product page.');
      const productDetailsEvidence=mergeProductDetailsEvidence(previous?.productDetailsEvidence,entry.productDetailsEvidence,sourceUrl,updatedAt);
      const categoryMetadata=paths.length?{categoryPaths:paths,categoriesCheckedAt:updatedAt}:previous?.categoryPaths?.length?{categoryPaths:previous.categoryPaths,categoriesCheckedAt:previous.categoriesCheckedAt}:{};
      const result = {source:'amazon-product-page',sourceUrl,statement,availability,
        ...categoryMetadata, ...(productDetailsEvidence?{productDetailsEvidence}:{}),
        ...(selection?{manifest:selection.manifest}:{}),extractorVersion:entry.extractorVersion ?? 1,
        ...(availability==='temporary-failure'?{failureCode:['captcha','sign-in','http','network'].includes(entry.failureCode)?entry.failureCode:'unknown'}:{}),checkedAt:updatedAt};
      endValidation?.();
      const parse = timed('parsing',()=>contentsParseState({...item,metadata:{...item.metadata,enrichment:{...item.metadata.enrichment,kindleProductComicContents:result}}}));
      const endHistory=activeTiming?.begin('history_update');
      const observations=database.kindleContentsObservations??={};
      const history=observations[item.recordRef]??={providerItemId:item.id,baseline:contentsObservation(item,previous)};
      // A record with no prior observation can pin its first trustworthy
      // observation before a later acquisition. Once pinned, never rotate it.
      if(!history.baseline&&previous&&['statement-found','no-statement','available'].includes(previous.availability))history.baseline=contentsObservation(item,previous);
      const untrustworthy=['temporary-failure','unavailable'].includes(availability);
      if(untrustworthy)history.latestAttempt=contentsObservation(item,{...result,...parse});else delete history.latestAttempt;
      endHistory?.();
      if(!untrustworthy||!previous)timed('enrichment_update',()=>selectEnrichment(database,itemId,'kindleProductComicContents',{...result,...parse},updatedAt,false,true));
      endValidation=activeTiming?.begin('entry_validation');
    }
    endValidation?.();
    if(rebuild)database.canonicalItems = timed('canonical_rebuild',()=>rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations));
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
      timed('enrichment_update',()=>selectEnrichment(database,item.id,'kindleProductComicContents',{...saved,...parsed},now,false,true));
    }
    return persistDatabase(database);
  }

  async function readKindleRefresh(){return (await timedAsync('refresh_checkpoint_read',()=>storageArea.get({[KINDLE_REFRESH_KEY]:null})))[KINDLE_REFRESH_KEY];}
  const queueItemCurrent=(db,target)=>{const item=db.providerItems[target.id];return supportedKindleContentsBook(item)&&item.profileId===db.providers.kindle?.activeProfileId&&item.recordRef===target.recordRef&&item.metadata.detailUrl===target.detailUrl;};
  function currentRefresh(raw,db){
    return timed('refresh_checkpoint_validate',()=>{
      const job=raw?.profileId?validateKindleRefresh(raw):bindKindleRefresh(raw,db);
      if(job.profileId!==db.providers.kindle?.activeProfileId)throw Error('Stale refresh profile; start a new refresh for the current library.');
      return job;
    });
  }
  async function getKindleContentsRefresh(){
    const db=await getDatabase(),raw=await readKindleRefresh();let checkpoint=null;
    if(raw){try{checkpoint=kindleRefreshSummary(currentRefresh(raw,db));}catch{checkpoint={status:'stale'};}}
    return {eligible:Object.values(db.providerItems).filter(i=>supportedKindleContentsBook(i)&&i.profileId===db.providers.kindle?.activeProfileId).length,checkpoint};
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
        status:queue.length?'running':'completed',profileId:db.providers.kindle?.activeProfileId,profileLabel:db.providers.kindle?.profileLabel??'',queue,cursor:0,counts:{found:0,empty:0,unavailable:0,failures:0,skipped:0},tabId,startedAt:now,updatedAt:now};
    }
    job=timed('refresh_checkpoint_validate',()=>validateKindleRefresh(job));await timedAsync('refresh_checkpoint_write',()=>storageArea.set({[KINDLE_REFRESH_KEY]:job}));
    // Fresh acquisition derives its own parse. Do not reparse the historical
    // observation before pinning its original parser/source metadata.
    return {candidates:job.queue.slice(job.cursor).map((item,n)=>({...item,queuePosition:job.cursor+n})),reprocess:[],eligible:job.queue.length,
      refresh:{...kindleRefreshSummary(job),leaseRef:job.leaseRef}};
  }
  function refreshLease(job,runRef,leaseRef,tabId){if(job.runRef!==runRef||job.leaseRef!==leaseRef||job.tabId!==tabId||job.status!=='running')throw Error('This refresh lease is stale; resume or start again.');}
  const refreshIdentity=(db,target)=>{
    const raw=db.providerItems[target.id];
    const item=raw?normalizeProviderItem({...raw,observedAt:raw.observedAt??null},typeof raw.updatedAt==='string'?raw.updatedAt:undefined,{profileKeySpace:db.providerProfiles?.[raw.profileId]?.keySpace}):null;
    return Boolean(item&&item.id===target.id&&supportedKindleContentsBook(item)&&item.profileId===db.providers.kindle?.activeProfileId&&item.recordRef===target.recordRef&&item.metadata.detailUrl===target.detailUrl);
  };
  const projectionMatches=(cache,job)=>cache&&job&&cache.runRef===job.runRef&&cache.leaseRef===job.leaseRef&&cache.tabId===job.tabId&&cache.cursor===job.cursor&&cache.profileId===job.profileId;
  const projectionEntryMatches=(entry,target)=>entry&&target&&entry.id===target.id&&entry.recordRef===target.recordRef&&entry.detailUrl===target.detailUrl;
  async function checkKindleContentsRefreshItem(runRef,leaseRef,tabId,position){
    // Queue/lease/cursor remain freshly read on every request. Reuse at most
    // twenty eligibility answers only across uninterrupted checks by this sole
    // writer. Any other admitted operation (including failed writes/reads),
    // storage change or worker restart discards them. Commits never use them.
    const epoch=refreshProjectionEpoch,rawJob=await readKindleRefresh();
    let cache=refreshProjection,db;
    if(!cacheRefreshPreflight||!projectionMatches(cache,rawJob)||!projectionEntryMatches(cache.entries[position-rawJob.cursor],rawJob.queue?.[position]))cache=null;
    if(cache)db={providers:{kindle:{activeProfileId:cache.profileId}}};
    else{
      const stored=await timedAsync('storage_read',()=>storageArea.get({[DATABASE_STORAGE_KEY]:null}));db=stored[DATABASE_STORAGE_KEY];
      if(db?.schemaVersion!==DATABASE_SCHEMA_VERSION||!db.providerItems||Array.isArray(db.providerItems)||typeof db.providerItems!=='object'||!db.providers||Array.isArray(db.providers)||typeof db.providers!=='object')db=await getDatabase();
    }
    const job=currentRefresh(rawJob,db);refreshLease(job,runRef,leaseRef,tabId);
    if(!Number.isInteger(position)||position<job.cursor||position>=Math.min(job.cursor+20,job.queue.length))throw Error('Invalid refresh queue position.');
    const target=job.queue[position],entry=cache?.entries[position-job.cursor];
    if(cache&&projectionEntryMatches(entry,target)){
      timed('refresh_projection_hit',()=>{});
      return timed('refresh_identity_validation',()=>{if(entry.error)throw entry.error;return {valid:entry.valid};});
    }
    const valid=timed('refresh_identity_validation',()=>refreshIdentity(db,target));
    if(cacheRefreshPreflight&&epoch===refreshProjectionEpoch){
      refreshProjection=timed('refresh_projection_build',()=>({runRef:job.runRef,leaseRef:job.leaseRef,tabId:job.tabId,cursor:job.cursor,profileId:job.profileId,entries:job.queue.slice(job.cursor,job.cursor+20).map(next=>{
        const identity={id:next.id,recordRef:next.recordRef,detailUrl:next.detailUrl};
        try{return {...identity,valid:next===target?valid:refreshIdentity(db,next)};}catch(error){return {...identity,error};}
      })}));
    }
    return {valid};
  }
  async function commitKindleContentsRefresh(entries,runRef,leaseRef,tabId){
    if(!Array.isArray(entries)||!entries.length||entries.length>20)throw Error('Save 1–20 refresh observations.');
    const db=await readDatabase(true),job=currentRefresh(await readKindleRefresh(),db);refreshLease(job,runRef,leaseRef,tabId);
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
      // persistDatabase fully validates and reconstructs canonical items. The
      // contents update changes no identity fields; avoid an identical rebuild
      // immediately before that authoritative validation.
      applyKindleComicContents(db,accepted.map(row=>row.entry),false);
      // Worker selection is authoritative; adapter preliminary counts may
      // differ from the saved selected source. Rebuild only once per batch.
      for(const {entry,counted}of accepted)if(counted){
        const item=db.providerItems[entry.itemId],outcome=(db.kindleContentsObservations[item.recordRef].latestAttempt??item.metadata.enrichment.kindleProductComicContents).availability;
        job.counts[outcome==='temporary-failure'?'failures':outcome==='unavailable'?'unavailable':outcome==='no-statement'?'empty':'found']++;
      }
    }
    if(job.cursor===job.queue.length)job.status='completed';job.updatedAt=new Date().toISOString();
    const checkpoint=timed('refresh_checkpoint_validate',()=>validateKindleRefresh(job));
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
    job.status=status;job.updatedAt=new Date().toISOString();const checkpoint=timed('refresh_checkpoint_validate',()=>validateKindleRefresh(job));await timedAsync('refresh_checkpoint_write',()=>storageArea.set({[KINDLE_REFRESH_KEY]:checkpoint}));return kindleRefreshSummary(job);
  }
  async function interruptKindleContentsRefresh(tabId=null){
    const raw=await readKindleRefresh();if(raw?.status!=='running'||tabId!==null&&raw.tabId!==tabId)return;
    const job=validateKindleRefresh(raw);job.status='interrupted';job.leaseRef='';job.tabId=null;job.updatedAt=new Date().toISOString();
    await timedAsync('refresh_checkpoint_write',()=>storageArea.set({[KINDLE_REFRESH_KEY]:job}));
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

  function setContentReview(database,itemId,value){
    if (!database.providerItems[itemId] || !['book','game'].includes(database.providerItems[itemId].mediaType)) throw new Error('Contents can be reviewed only for a current book or game record.');
    database.contentReviews[itemId]=validateContentReview({...value,referenceDecisions:database.contentReviews[itemId]?.referenceDecisions,sourceBaseline:contentsSourceBaseline(database.providerItems[itemId]),verifiedAt:new Date().toISOString()});
  }
  async function saveContentReview(itemId, value) {
    const database=await getDatabase();setContentReview(database,itemId,value);
    return persistDatabase(database);
  }

  async function confirmContentsSuggestions(requests){
    if(!Array.isArray(requests)||!requests.length||requests.length>50||new Set(requests.map(r=>r?.recordRef)).size!==requests.length)throw Error('Select 1-50 distinct book records.');
    const database=await getDatabase(),results=[];let writes=0;
    for(const request of requests){
      try{
        if(request?.confirmed!==true||typeof request.token!=='string'||!/^[a-f0-9]{64}$/u.test(request.token))throw Error('Preview and confirm this issue list first.');
        const record=database.providerItems[request.itemId];
        if(!record||record.recordRef!==request.recordRef)throw Error('This book or account changed. Review the current list before retrying.');
        const review=database.contentReviews[record.id];
        const candidate=contentsConfirmation(record,review?{...database,contentReviews:{}}:database);
        if(!candidate.eligible)throw Error(candidate.reason);
        if(await contentsConfirmationToken(record,candidate.value)!==request.token)throw Error('This book, source or proposed list changed. Review the current list before retrying.');
        if(review){if(!sameConfirmedContents(review,record,candidate.value))throw Error('A contents review or correction was saved meanwhile. Open Review details.');}
        else{setContentReview(database,record.id,candidate.value);writes++;}
        results.push({itemId:record.id,recordRef:record.recordRef,status:review?'already-confirmed':'confirmed'});
      }catch(error){results.push({itemId:request?.itemId,recordRef:request?.recordRef,status:'failed',message:error.message});}
    }
    // Independent validation failures do not block other selected books. All
    // successful validations share one atomic save; a storage failure throws
    // rather than reporting any uncommitted review as successful.
    return {database:writes?await persistDatabase(database):database,results};
  }

  async function saveCoverageResolutions(request){
    const database=await getDatabase(),preferences=await getUiPreferences();
    const result=applyCoverageResolutions(database,request,{merges:preferences.comicCoverageMerges??{}});
    return persistDatabase(result.database);
  }

  async function saveCoverageReferenceDecision(request){
    const database=await getDatabase();return persistDatabase(applyCoverageReferenceDecision(database,request));
  }
  async function removeContentReview(itemId) {
    const database=await getDatabase(),decisions=database.contentReviews[itemId]?.referenceDecisions;delete database.contentReviews[itemId];
    if(decisions?.length)database.contentReviews[itemId]=validateContentReview({referenceOnly:true,entries:[],referenceDecisions:decisions,statement:'',source:'coverage-reference-decisions'});
    return persistDatabase(database);
  }

  async function addAllowedExternalClientId(id) {
    const ids = await getAllowedExternalClientIds();
    return saveAllowedExternalClientIds([...ids, id]);
  }

  async function getUiPreferences() {
    const stored = await storageArea.get({ [UI_PREFERENCES_KEY]: defaultUiPreferences() });
    try { return validateUiPreferences(stored[UI_PREFERENCES_KEY]); } catch { return defaultUiPreferences(); }
  }
  async function saveComicCoverageMerge(source,target,title,continuity=false){
    const current=await getUiPreferences();
    if(continuity||current.comicCoverageMerges[source]?.continuity||current.comicCoverageMerges[target]?.continuity){
      const groups=mergeCoverageGroups(comicCoverage(await getDatabase(),{runInferenceExclusions:Object.values(current.comicCoverageMerges).flatMap(merge=>merge.members)}).groups,current.comicCoverageMerges,()=>1),left=groups.find(g=>g.id===source),right=groups.find(g=>g.id===target);
      if(left&&right){const problem=continuityProblem(left,right);if(problem)throw Error(problem);}
    }
    const next=validateUiPreferences({...current,comicCoverageMerges:addSeriesMerge(current.comicCoverageMerges,source,target,title,continuity)});
    // The explicit name chosen in the merge dialog wins for this new group.
    // Original-member and earlier-group rename preferences remain untouched.
    const combined=Object.entries(next.comicCoverageMerges).find(([,merge])=>merge.members.includes(source)&&merge.members.includes(target));
    if(combined)delete next.comicCoverageNames[comicCoverageNameKey({id:combined[0],members:combined[1].members})];
    await storageArea.set({[UI_PREFERENCES_KEY]:next});return next;
  }
  async function removeComicCoverageMerge(id){
    const current=await getUiPreferences();if(!Object.hasOwn(current.comicCoverageMerges,id))throw Error('This merge no longer exists.');
    const merges={...current.comicCoverageMerges};delete merges[id];
    const next=validateUiPreferences({...current,comicCoverageMerges:merges});await storageArea.set({[UI_PREFERENCES_KEY]:next});return next;
  }
  async function saveUiPreferences(patch) {
    validateUiPreferences(patch);
    const current = await getUiPreferences();
    const next = mergeUiPreferences(current, patch);
    await storageArea.set({ [UI_PREFERENCES_KEY]: next });
    return next;
  }
  async function getShowEnrichmentActions() {
    const stored = await storageArea.get({ [SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY]: true });
    return stored[SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY] !== false;
  }

  async function getProviderDiagnosticsEnabled(){
    return (await storageArea.get({galacticLibraryProviderDiagnostics:false})).galacticLibraryProviderDiagnostics===true;
  }
  async function saveProviderDiagnosticsEnabled(value){
    if(typeof value!=='boolean')throw Error('Choose whether to enable provider diagnostics.');
    await storageArea.set({galacticLibraryProviderDiagnostics:value});return value;
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
  async function feedClient(client,external=false){if(!isExtensionId(client))throw new Error('Invalid reminder client.');if(external&&(!effectiveExternalClientIds(await getAllowedExternalClientIds()).includes(client)||!allowedCompanionOperation(client,'BEGIN_ENTITLEMENT_FEED')))throw new Error('Companion permission was revoked.');}
  async function beginCompanionFeed(client,value,external=false){
    await feedClient(client,external);const database=await getDatabase(),profileLabel=text(value?.profileLabel,100,'Humble profile');
    if(!profileLabel||database.providers.humble?.profileLabel!==profileLabel)throw new Error('The GL Humble profile does not match. Confirm the same account and enter its current GL profile label.');
    if(!Number.isSafeInteger(value.count)||value.count<0||value.count>100000||!['complete','partial'].includes(value.coverage)||!date(value.sentAt))throw new Error('Invalid reminder feed summary.');
    const uploads=Object.fromEntries(Object.entries(await feedUploads()).filter(([key,entry])=>key!==client&&entry.expiresAt>Date.now()));
    if(Object.keys(uploads).length>=64)throw new Error('Too many active reminder uploads.');
    const uploadToken=crypto.randomUUID();uploads[client]={uploadToken,profileId:database.providers.humble.activeProfileId,profileLabel,count:value.count,coverage:value.coverage,sentAt:date(value.sentAt),expiresAt:Date.now()+600000,entries:[]};await storageArea.set({[FEED_UPLOAD_KEY]:uploads});return {uploadToken};
  }
  async function activeFeedUpload(client,token,external=false){
    await feedClient(client,external);const uploads=await feedUploads(),upload=uploads[client];if(!upload||upload.uploadToken!==token||upload.expiresAt<=Date.now())throw new Error('Reminder upload expired or was superseded. Send it again.');
    const database=await getDatabase();if(database.providers.humble?.activeProfileId!==upload.profileId)throw new Error('The GL Humble profile changed during reminder sharing.');return {uploads,upload,database};
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
    const feedKey=Object.keys(database.companionFeeds).find(key=>key.split(':')[0]===client&&database.companionFeeds[key].profileId===upload.profileId)??(database.companionFeeds[client]?`${client}:${upload.profileId}`:client);
    const previous=database.companionFeeds[feedKey],refs=new Map(previous?.profileId===upload.profileId?previous.entries.map(entry=>[entry.itemRef,entry.localRef]):[]);
    database.companionFeeds[feedKey]={profileId:upload.profileId,profileLabel:database.providerProfiles[upload.profileId].nickname,coverage:upload.coverage,sentAt:upload.sentAt,receivedAt:new Date().toISOString(),revisionRef:crypto.randomUUID(),entries:upload.entries.map(entry=>({...entry,localRef:refs.get(entry.itemRef)??crypto.randomUUID()}))};
    delete uploads[client];await storageArea.set({[DATABASE_STORAGE_KEY]:validateDatabase(database),[FEED_UPLOAD_KEY]:uploads});return {count:upload.entries.length};
  }
  async function removeCompanionFeed(key,external=false){
    const client=String(key).split(':')[0];await feedClient(client,external);
    const database=await getDatabase(),uploads=await feedUploads();
    if(external){for(const [feedKey,feed]of Object.entries(database.companionFeeds))if(feedKey.split(':')[0]===client&&feed.profileId===database.providers.humble?.activeProfileId)delete database.companionFeeds[feedKey];}
    else delete database.companionFeeds[key];
    delete uploads[client];await storageArea.set({[DATABASE_STORAGE_KEY]:validateDatabase(database),[FEED_UPLOAD_KEY]:uploads});return {count:0};
  }
  const operations = {
    saveOwnershipPolicy,
    saveKoboOwnershipAssumption,
    beginCompanionFeed,appendCompanionFeed,commitCompanionFeed,removeCompanionFeed,
    saveReadingState,removeReadingState,saveReadingOrder,removeReadingOrder,
    saveReminderReview,getReminderNotificationSettings,saveReminderNotificationSettings,reserveReminderNotification,releaseReminderNotification,
    ensurePurchaseAccount,importPurchaseSnapshot,getDatabase, restoreDatabase, replaceProviderItems, mergeProviderItems, clearDatabase, beginProviderScan, commitProviderScan, selectProviderProfile, renameProviderProfile, getProviderProfiles, previewProviderProfileRemoval, removeProviderProfile, resetProviderProfileBaseline, importUnscopedProviderItems,failProviderScan,cancelProviderScan,
    getGoogleBooksApiKey, saveGoogleBooksApiKey, getGoogleBooksEnrichmentJob,
    saveGoogleBooksEnrichmentJob:async value=>{const job=await getGoogleBooksEnrichmentJob();if(job?.runId&&job.leaseUntil>Date.now())throw new Error('Use the active enrichment checkpoint to update progress.');return saveGoogleBooksEnrichmentJob(value);}, clearGoogleBooksEnrichmentJob, startGoogleBooksEnrichmentJob, acquireEnrichmentRun, commitEnrichmentBatch, finishEnrichmentRun,
    getAllowedExternalClientIds, saveAllowedExternalClientIds, addAllowedExternalClientId,
    saveManualMatchDecision, savePreferredDisplayTitle, removeManualMatchDecision, saveOpenLibraryEnrichment, saveEnrichmentReview, dismissEnrichmentReview, undoEnrichmentSelection, applyReviewedEnrichments, dismissEnrichmentReviews, undoEnrichmentSelections,
    saveGoogleBooksEnrichments, saveGoogleBooksGenreHints, saveKindleComicContents, reparseKindleContents,
    getKindleContentsRefresh,beginKindleContentsRefresh,checkKindleContentsRefreshItem,commitKindleContentsRefresh,finishKindleContentsRefresh,interruptKindleContentsRefresh,
    saveContentReview, confirmContentsSuggestions, removeContentReview,saveCoverageResolutions,saveCoverageReferenceDecision,
    separateEdition, undoEditionSeparation, saveTitleAliases,saveOwnershipReview,removeOwnershipReview,saveOwnershipCorrections,importPurchaseEvidence,refreshPurchaseEvidence,applyPurchaseEvidence,dismissPurchaseEvidence,
    getProviderDiagnosticsEnabled,saveProviderDiagnosticsEnabled,getShowEnrichmentActions, saveShowEnrichmentActions, getUiPreferences, saveUiPreferences, saveComicCoverageMerge, removeComicCoverageMerge
  };
  let tail = Promise.resolve();
  let replacementPending=false;

  async function runOperation(operation,values){
    if(operation!=='checkKindleContentsRefreshItem')invalidateRefreshPreflight();
    const end=activity('operation',{operation});activeOperation=operation;
    activeObservationRead=null;
    pendingScanCompletion=null;
    pendingAdmission=null;
    pendingIdentityCatalog=null;
    try{await recoverObservations();return await operations[operation](...values);}finally{activeObservationRead=null;pendingScanCompletion=null;pendingAdmission=null;pendingIdentityCatalog=null;activeOperation=null;end();}
  }

  function execute(operation, args = [], timing = null) {
    if (!STORAGE_OPERATIONS.includes(operation) || !Array.isArray(args)) {
      return Promise.reject(new Error('Unsupported Galactic Library storage operation.'));
    }
    // Cross-page admission guard; persistence transactions/order are unchanged.
    const replacement=operation==='restoreDatabase'||operation==='clearDatabase';
    if(replacementPending&&(replacement||operation==='removeProviderProfile'))return Promise.reject(Error('A library replacement is already in progress. Wait for it to finish.'));
    // Capture the request at admission, before callers can mutate it.
    let values;
    const captureEnd=timing?.begin('writer_capture');
    try { values = structuredClone(args); }
    catch { return Promise.reject(new Error('Invalid Galactic Library storage arguments.')); }
    finally {captureEnd?.();}
    // Only this explicit read-only view bypasses the ordinary writer queue.
    // Mutations and authoritative mutable reads retain their original ordering.
    if(operation==='getCommittedLibraryView')return getCommittedLibraryView(...values);
    if(replacement)replacementPending=true;
    const queueEnd=timing?.begin('writer_queue');
    const result = tail.then(() => ready).then(timing ? async () => {
      queueEnd();activeTiming=timing;
      try{return await runOperation(operation,values);}catch(error){invalidateRefreshPreflight();throw error;}finally{activeTiming=null;}
    } : async () => {try{return await runOperation(operation,values);}catch(error){invalidateRefreshPreflight();throw error;}});
    // A rejected operation never poisons the queue; later requests still run.
    tail = result.catch(() => {});
    return replacement?result.finally(()=>{replacementPending=false;}):result;
  }

  return Object.freeze({
    execute,
    invalidateRefreshPreflight,
    getQueryDatabase,getProviderDatabase,getQueryAllowedExternalClientIds,invalidateQuerySnapshot,invalidateObservationSnapshot,getProviderProfileHint,rememberProviderProfileHints,
    ...Object.fromEntries(STORAGE_OPERATIONS.map((name) => [name, (...args) => execute(name, args)]))
  });
}
