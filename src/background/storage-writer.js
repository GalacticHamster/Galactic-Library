import {addSeriesMerge} from '../lib/comic-series-merges.js';
import {applyPurchaseSnapshot} from './purchase-handoff.js';
import {mergeProductDetailsEvidence} from '../lib/kindle-product-details.js';
import {effectiveExternalClientIds,allowedCompanionOperation} from '../lib/companion-identities.js';
import {enumerateProviderProfiles,profileDependencies,removeProfileData} from '../lib/profile-management.js';
import {strictDatabaseSerialization} from '../lib/validation-certificate.js';
import {newProviderProfile} from '../lib/provider-profiles.js';
import {preserveKoboObservation,koboObservationChanged} from '../lib/kobo-observations.js';
import {equalDatabaseData} from '../lib/data-equality.js';
import {createValidationCertificates} from '../lib/validation-certificate.js';
import {registerCommittedSnapshot,committedSnapshotSequence} from '../lib/committed-snapshot.js';
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
import {validateSyncHealth,snapshotDifferences,SYNC_FAILURE_CODES} from '../lib/sync-health.js';

/**
 * Instantiate once in the service worker. Mutations and ordinary storage
 * operations share one queue. Integration queries use detached committed read
 * snapshots. Refresh and Kobo checks can reuse their validation only after a fresh, exact
 * whole-value storage comparison, and receives a detached mutable copy.
 */
export function createStorageWriter(storageArea, ready = Promise.resolve(), {cacheRefreshPreflight=false,cacheQuerySnapshots=false,diagnostics=null,certificateArea=null,importSessionArea=null} = {}) {
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
    snapshotEvent('invalidated',source,previousSnapshot);
  }
  function publishQuerySnapshot(database){
    const previousSnapshot=committedSnapshotSequence(querySnapshot);
    querySnapshotEpoch++;
    // Only these trusted writer paths supply fully validated committed values.
    // Detach before sharing: caller-owned mutable results must not affect queries.
    querySnapshot=null;
    try{if(cacheQuerySnapshots&&querySnapshotsUsed){
      const endClone=activeTiming?.begin('snapshot_clone');let detached;
      try{detached=structuredClone(database);}finally{endClone?.();}
      const endFreeze=activeTiming?.begin('snapshot_freeze');
      try{querySnapshot=registerCommittedSnapshot(freezeQuerySnapshot(detached));}finally{endFreeze?.();}
    }}
    catch{/* A query optimization must never turn an acknowledged commit into a failed write. */}
    snapshotEvent(querySnapshot?'published':'unavailable','writer',previousSnapshot);
    // Every authoritative DB set funnels through here after full validation.
    // No additional snapshot copy is made solely to obtain a certificate.
    if(querySnapshot)certificates.issue(querySnapshot);else certificates.clear();
  }
  storageArea={
    async get(defaults){const end=activity('storage_get',{key:storageKey(defaults),operation:activeOperation});try{return await committedArea.get(defaults);}finally{end();}},
    async set(updates){
      if(Object.hasOwn(updates,DATABASE_STORAGE_KEY))updates={...updates,[PROFILE_HINTS]:profileHints(updates[DATABASE_STORAGE_KEY])};
      const endActivity=activity('storage_set',{key:storageKey(updates),operation:activeOperation});
      try{
      let pending;
      const dispatchEnd=activeTiming?.begin('storage_set_dispatch');
      try{pending=committedArea.set(updates);}finally{dispatchEnd?.();}
      const waitEnd=activeTiming?.begin('storage_set_wait');
      try{await pending;}finally{waitEnd?.();}
      if(Object.hasOwn(updates,DATABASE_STORAGE_KEY))publishQuerySnapshot(updates[DATABASE_STORAGE_KEY]);
      }finally{endActivity();}
    },
    async remove(keys){
      if((Array.isArray(keys)?keys:[keys]).includes(DATABASE_STORAGE_KEY))keys=[...(Array.isArray(keys)?keys:[keys]),PROFILE_HINTS];
      const end=activity('storage_remove',{key:storageKey(typeof keys==='string'?[keys]:keys),operation:activeOperation});try{
      await committedArea.remove(keys);
      if((Array.isArray(keys)?keys:[keys]).includes(DATABASE_STORAGE_KEY)){publishQuerySnapshot(createEmptyDatabase());certificates.clear();}
      }finally{end();}
    }
  };
  async function getQueryDatabase({beginSpan=()=>{},onValidationSlice=()=>{},onValidationWait=()=>{}}={}){
    const span=async(stage,work)=>{const end=beginSpan(stage),endActivity=activity(stage);try{return await work();}finally{end?.();endActivity();}};
    const sync=(stage,work)=>{const end=beginSpan(stage);try{return work();}finally{end?.();}};
    querySnapshotsUsed=true;await ready;
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
        const certified=raw&&await span('snapshot_certificate',()=>certificates.verify(raw,{beginSpan}));
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
    let database,preferences;
    try{[database,preferences]=await Promise.all([getQueryDatabase({beginSpan}),ready.then(()=>getUiPreferences())]);}
    finally{end?.();endActivity();}
    return {database,preferences,...(timing?{performance:globalThis.GalacticContentsPerformance.clean(timing.finish('reparsed'))}:{})};
  }
  // Private, bounded read-only eligibility answers. No database/source snapshot
  // is reused for a write. Only the worker with change observation enables this.
  let refreshProjection=null,refreshProjectionEpoch=0;
  const invalidateRefreshPreflight=()=>{refreshProjection=null;refreshProjectionEpoch++;};
  const timed = (stage, work) => { const end=activeTiming?.begin(stage);try{return work();}finally{end?.();} };
  const timedAsync = (stage, work) => {
    if(!activeTiming)return work();
    const end=activeTiming.begin(stage);
    if(stage==='storage_write'||stage==='migration_write'){try{activeTiming.onWrite?.();}catch{/* Diagnostics must never prevent a write. */}}
    return (async()=>{try{return await work();}finally{end();}})();
  };
  async function validateForWriter(value){
    const timing=activeTiming;let endStage,endActivityStage;const endActivity=activity('validation',{operation:activeOperation});
    try{return await validateDatabaseAsync(value,{onStage:stage=>{endStage?.();endActivityStage?.();endStage=timing?.begin(stage);endActivityStage=activity(stage,{operation:activeOperation});}});}
    finally{endStage?.();endActivityStage?.();endActivity();}
  }
  const NOTIFICATIONS='galacticLibraryReminderNotifications';
  const SCANS='galacticLibraryProviderScans';
  async function beginProviderScan(provider,nickname,mode='full',switchProfile=false,tabId=null,requestedProfileId=null,rememberedProfile=false) {
    if(!PROVIDERS.includes(provider)||!['full','incremental'].includes(mode))throw new Error('Invalid provider scan.');
    const profileLabel=text(nickname,100,'Account/profile label');if(!profileLabel&&!requestedProfileId)throw new Error('Enter an account/profile label and confirm the signed-in account before scanning.');
    const database=await readDatabase(provider==='kobo'),active=database.providers[provider]?.activeProfileId;
    const existing=Object.values(database.providerProfiles).find(p=>p.provider===provider&&p.nickname===profileLabel);
    if(requestedProfileId&&existing?.profileId!==requestedProfileId)throw Error('Scan profile changed. Start a fresh confirmed scan.');
    if(rememberedProfile===true&&(Object.values(database.providerProfiles).filter(p=>p.provider===provider).length!==1
      ||!requestedProfileId||existing?.profileId!==active||existing?.state.connected!==true||!existing?.state.lastSync))throw Error('Saved accounts changed. Select and confirm the signed-in account before scanning.');
    const changing=Boolean(active)&&existing?.profileId!==active;
    if(changing&&switchProfile!==true)throw Error('A different account/profile is active. Explicitly confirm switching to the target account.');
    if(changing&&!existing&&mode!=='full')throw Error('A different account without a baseline requires a complete full scan.');
    const profile=importProfile(database,provider,profileLabel,requestedProfileId),forceFull=!profile.state.fullSyncAt;
    if(!active){profile.lastSelectedAt=new Date().toISOString();profileState(database,profile,profile.state);}
    const activeAtStartId=database.providers[provider].activeProfileId;
    const stored=await storageArea.get({[SCANS]:{}}),scans=stored[SCANS]??{},scanToken=crypto.randomUUID();
    scans[provider]={scanToken,attemptRef:crypto.randomUUID(),profileId:profile.profileId,activeAtStartId,profileLabel,mode:forceFull?'full':mode,tabId,startedAt:new Date().toISOString()};
    // An existing-account quick check needs a tab-bound lease, not a rewrite of
    // every saved book merely to announce that scanning has started.
    if(provider==='kobo'&&mode==='incremental'&&!forceFull&&active===profile.profileId){
      scans[provider].readOnlyStart=true;
      await storageArea.set({[SCANS]:scans});
      return {scanToken,forceFull,profileLabel,profileId:profile.profileId,database};
    }
    profile.state.syncHealth=validateSyncHealth({attemptRef:scans[provider].attemptRef,status:'running',mode:scans[provider].mode,attemptedProfileLabel:profileLabel,startedAt:scans[provider].startedAt,finishedAt:null,retryable:false});
    if(activeAtStartId===profile.profileId)profileState(database,profile,profile.state);
    await storageArea.set({[SCANS]:scans,[DATABASE_STORAGE_KEY]:validateDatabase(database)});
    return {scanToken,forceFull,profileLabel,profileId:profile.profileId,database};
  }
  async function commitProviderScan(provider,values,syncDetails,snapshot,scanToken,tabId=null,includeResult=false) {
    const stored=await storageArea.get({[SCANS]:{}}),scan=stored[SCANS]?.[provider],database=await readDatabase(provider==='kobo');
    if(!scan||scan.scanToken!==scanToken||scan.tabId!==tabId||!scan.profileId||database.providers[provider]?.activeProfileId!==scan.activeAtStartId||!database.providerProfiles[scan.profileId])throw new Error('This scan was superseded by another scan, clear, restore, or profile change. Start a fresh scan.');
    if(!['full','incremental'].includes(syncDetails.syncMode)||scan.mode==='full'&&syncDetails.syncMode!=='full')throw new Error('This account/profile requires a complete full scan.');
    const profile=database.providerProfiles[scan.profileId],details={...syncDetails,profileId:profile.profileId,profileLabel:profile.nickname};
    let result,changes;
    if(provider==='kobo'&&scan.readOnlyStart&&details.syncMode==='incremental'&&!details.scanDiagnostics?.failedRequestCount
      &&profile.state.syncHealth?.status==='succeeded'){
      const incoming=timed('entry_validation',()=>[...new Map(normalizedIncoming(database,provider,profile,values).map(item=>[item.id,item])).values()]);
      changes=timed('provider_compare',()=>successfulSyncHealth(database,provider,incoming,false,details).differences);
      if(changes.added===0&&changes.updated===0){
        // No database mutation means no canonical rebuild, database set or sync
        // notification. Completing the lease still rejects a repeated commit.
        const scans={...stored[SCANS]};delete scans[provider];await storageArea.set({[SCANS]:scans});
        result=database;
      }
    }
    result??=await (details.syncMode==='full'?replaceProviderItems(provider,values,details,snapshot):mergeIntoDatabase(provider,values,details,provider==='kobo'?database:null));
    if(!includeResult)return result;
    const observedIds=new Set(values.map(value=>value.providerItemId));
    const observed=provider==='kobo'?Object.values(result.providerItems).filter(item=>item.provider===provider&&item.profileId===profile.profileId&&observedIds.has(item.providerItemId)):[];
    const ownership={unconfirmed:0,covered:0,review:0,subscriptions:0};
    for(const item of observed){
      if(item.ownership==='subscription')ownership.subscriptions++;
      if(item.ownership!=='unknown')continue;
      ownership.unconfirmed++;
      const effective=effectiveOwnershipRecord(item,result);
      if(effective.ownership==='owned'&&effective.ownershipOverride)ownership.covered++;
      else if(effective.ownership==='unknown')ownership.review++;
    }
    return {database:result,scanResult:{changes:changes??result.providers[provider].syncHealth?.differences,ownership,checkedAt:new Date().toISOString()}};
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
    const plan=profileDependencies(database,profileId),stored=await storageArea.get({[SCANS]:{},[KINDLE_REFRESH_KEY]:null,[KINDLE_REFRESH_ARCHIVES_KEY]:{},[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY]:null,[FEED_UPLOAD_KEY]:{}});
    const session=importSessionArea?await importSessionArea.get(null):{},sessionKeys=Object.keys(session).filter(key=>key.startsWith('fandango-import-')&&session[key]?.scanContext?.profileId===profileId);
    const current=stored[KINDLE_REFRESH_KEY],archived=stored[KINDLE_REFRESH_ARCHIVES_KEY]?.[profileId];
    let currentOwner=current?.profileId;
    if(current&&!currentOwner){try{currentOwner=bindKindleRefresh(current,database).profileId;}catch{/* Unknown jobs remain preserved. */}}
    const kindleJob=currentOwner===profileId?current:archived;
    const google=stored[GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY],googleTargets=Object.entries(google?.targets??{}).filter(([,refs])=>refs.some(ref=>plan.refs.has(ref)));
    const scan=stored[SCANS][plan.profile.provider],scanAffected=scan&&(scan.profileId===profileId||scan.activeAtStartId===profileId);
    const uploads=Object.fromEntries(Object.entries(stored[FEED_UPLOAD_KEY]).filter(([,u])=>u.profileId===profileId));
    plan.summary.jobs={kindle:kindleJob?{status:kindleJob.status,cursor:kindleJob.cursor,total:kindleJob.queue?.length??0}:null,googleAffectedTargets:googleTargets.length,scan:scanAffected?{attemptRef:scan.attemptRef,mode:scan.mode}:null,fandangoNavigationContexts:sessionKeys.length,pendingCompanionUploads:Object.keys(uploads).length};
    const payload={profile:plan.profile,current:plan.current,history:plan.history,dependents:plan.dependents,canonicalItems:plan.canonicalItems,kindleJob:kindleJob??null,googleTargets,scan:scanAffected?scan:null,uploads,session:Object.fromEntries(sessionKeys.map(key=>[key,session[key]]))};
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
    removeProfileData(database,plan);
    const result=await persistDatabase(database,null,updates);
    // Tokens are already invalidated atomically. Session cleanup is secondary;
    // its failure must not misreport a committed library removal as a failure.
    if(plan.sessionKeys.length)try{await importSessionArea.remove(plan.sessionKeys);}catch{}
    return result;
  }
  async function failProviderScan(provider,scanToken,tabId,failure={}){
    const stored=await storageArea.get({[SCANS]:{}}),scan=stored[SCANS]?.[provider];
    if(!scan||scan.scanToken!==scanToken||scan.tabId!==tabId)return false;
    const database=await getDatabase();
    const failureCode=SYNC_FAILURE_CODES.includes(failure.code)?failure.code:'other';
    const profile=database.providerProfiles[scan.profileId];if(!profile||database.providers[provider]?.activeProfileId!==scan.activeAtStartId)return false;
    profile.state={...profile.state,syncHealth:validateSyncHealth({attemptRef:scan.attemptRef,status:'failed',mode:scan.mode,attemptedProfileLabel:scan.profileLabel,startedAt:scan.startedAt,finishedAt:new Date().toISOString(),failureCode,retryable:true,failedRequestCount:failure.failedRequestCount??1,failedPages:failure.failedPages??[]})};
    if(database.providers[provider]?.activeProfileId===profile.profileId)profileState(database,profile,profile.state);
    await persistDatabase(database,provider);return true;
  }
  async function cancelProviderScan(provider,attemptRef){
    const stored=await storageArea.get({[SCANS]:{}}),scan=stored[SCANS]?.[provider];if(!scan||scan.attemptRef!==attemptRef)throw new Error('This scan changed or already finished. Refresh the dashboard.');
    const database=await getDatabase(),profile=database.providerProfiles[scan.profileId];if(!profile)throw Error('Scan profile changed.');profile.state.syncHealth={...profile.state.syncHealth,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true};if(database.providers[provider]?.activeProfileId===profile.profileId)profileState(database,profile,profile.state);return persistDatabase(database,provider);
  }
  function successfulSyncHealth(database,provider,records,full,details){
    const diagnostics=details.scanDiagnostics??{};const profile=Object.values(database.providerProfiles).find(p=>p.provider===provider&&(p.profileId===details.profileId||p.nickname===(details.profileLabel??database.providers[provider]?.profileLabel??'')));const prior=profile?.state.syncHealth;
    const failedRequestCount=diagnostics.failedRequestCount??0;
    return validateSyncHealth({attemptRef:prior?.status==='running'?prior.attemptRef:'',status:failedRequestCount?'partial':'succeeded',mode:full?'full':'incremental',attemptedProfileLabel:details.profileLabel??database.providers[provider]?.profileLabel??'',startedAt:prior?.status==='running'?prior.startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),retryable:failedRequestCount>0,failedRequestCount,retries:diagnostics.retries??null,coverageLimit:diagnostics.coverageLimit??'',differences:{...snapshotDifferences(Object.values(database.providerItems).filter(item=>item.profileId===profile?.profileId),records,full),...(provider==='kobo'?{updated:records.filter(item=>koboObservationChanged(database.providerItems[item.id],item)).length}:{})}});
  }
  async function restoreDatabase(database,preferences){
    const restored=validateDatabase(database),extra={galacticPurchaseSync:{}};
    if(preferences!==undefined){
      if(!preferences||Object.keys(preferences).some(key=>!['comicCoverageStarts','comicCoverageMerges'].includes(key))||!Object.keys(preferences).length)throw Error('Invalid backup display preferences.');
      extra[UI_PREFERENCES_KEY]=validateUiPreferences({...await getUiPreferences(),...preferences});
    }
    for(const provider of Object.keys(restored.providers))cancelProfileAttempt(restored,provider);for(const state of Object.values(restored.providers))if(state.syncHealth?.status==='running')state.syncHealth={...state.syncHealth,status:'cancelled',finishedAt:new Date().toISOString(),retryable:true};return persistDatabase(restored,'all',extra);
  }
  async function importUnscopedProviderItems(provider,values,details,snapshot){
    const database=await getDatabase();
    if(database.providers[provider]?.profileLabel)throw new Error('Reload the provider page and start a confirmed profile scan.');
    return details.syncMode==='incremental'?mergeProviderItems(provider,values,details):replaceProviderItems(provider,values,details,snapshot);
  }
  async function getDatabase() {
    return readDatabase();
  }
  async function readDatabase(reuseCommittedValidation=false) {
    // A successful refresh commit should publish a proof for its next batch,
    // even if no Options/companion query has requested a snapshot yet.
    if(reuseCommittedValidation&&cacheQuerySnapshots)querySnapshotsUsed=true;
    const stored = await timedAsync('storage_read',()=>storageArea.get({ [DATABASE_STORAGE_KEY]: null }));
    if (!stored[DATABASE_STORAGE_KEY]) return createEmptyDatabase();
    // Mutation proof: the freshly read authoritative value is exactly the
    // already validated immutable committed revision. Never use the eligibility
    // projection, an uncommitted working copy, or epoch identity alone as proof.
    const committed=querySnapshot;
    if(reuseCommittedValidation&&cacheQuerySnapshots&&committed
      &&timed('read_committed_compare',()=>equalDatabaseData(stored[DATABASE_STORAGE_KEY],committed))){
      return timed('read_committed_clone',()=>structuredClone(committed));
    }
    const database = await timedAsync('read_validation',()=>validateForWriter(stored[DATABASE_STORAGE_KEY]));
    if (timed('migration_compare',()=>!equalDatabaseData(stored[DATABASE_STORAGE_KEY], database))) {
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
    return database;
  }

  async function persistDatabase(database,invalidate=null,extra={},beforeSave=null) {
    for(const [provider,state]of Object.entries(database.providers)){
      const profile=database.providerProfiles[state.activeProfileId];if(profile){profile.state={...state};delete profile.state.activeProfileId;}
    }
    const validated = await timedAsync('persist_validation',()=>validateForWriter(database));
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
  function preserveEnrichment(incoming, previous) {
    if (previous?.recordRef) incoming = {...incoming, recordRef: previous.recordRef};
    incoming=preserveKoboObservation(incoming,previous);
    if(incoming.provider==='kobo'&&previous&&!koboObservationChanged(previous,incoming))incoming.updatedAt=previous.updatedAt;
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
  async function replaceProviderItems(provider, values, syncDetails = {}, snapshot) {
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid provider.');
    if (!Array.isArray(values) || values.length>50000) throw new Error('Import needs a bounded item list.');
    validateProviderSnapshot(provider, values, snapshot);
    const database = await getDatabase();
    const now = new Date().toISOString();
    const priorActiveId=database.providers[provider]?.activeProfileId;
    const profile=importProfile(database,provider,syncDetails.profileLabel,syncDetails.profileId);
    const retained = Object.fromEntries(Object.entries(database.providerItems).filter(([, item]) => item.profileId !== profile.profileId));
    const historicalById=historicalRecords(database,profile.profileId);
    const incoming = values.map((value) => {
      const item = normalizeProviderItem({ ...value, provider, profileId:profile.profileId, recordRef:undefined, observedAt:now }, now, {allowEnrichment:false,profileKeySpace:profile.keySpace});
      item.metadata.source = PROVIDER_SOURCES[provider];
      return preserveEnrichment(item, database.providerItems[item.id]??historicalById.get(item.id));
    });
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
    database.canonicalItems = rebuildCanonicalItems(database.providerItems, database.manualMatchDecisions, database.canonicalItems, database.editionSeparations);
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
    return persistDatabase(database,provider,jobs);
  }

  // Incremental syncs must never make an entitlement disappear merely because
  // the provider returned only its recent additions. Full syncs use the
  // replacement function above; quick syncs add or refresh records here.
  function normalizedIncoming(database,provider,profile,values){
    if(!Array.isArray(values)||values.length>50000)throw Error('Import needs a bounded item list.');
    const historicalById=historicalRecords(database,profile.profileId),now=new Date().toISOString();
    return values.map(value=>{
      const item=normalizeProviderItem({...value,provider,profileId:profile.profileId,recordRef:undefined,observedAt:now},now,{allowEnrichment:false,profileKeySpace:profile.keySpace});
      item.metadata.source=PROVIDER_SOURCES[provider];
      return preserveEnrichment(item,database.providerItems[item.id]??historicalById.get(item.id));
    });
  }
  async function mergeProviderItems(provider,values,syncDetails={}){
    return mergeIntoDatabase(provider,values,syncDetails);
  }
  async function mergeIntoDatabase(provider, values, syncDetails = {}, authoritativeDatabase=null) {
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid provider.');
    if (!Array.isArray(values) || values.length>50000) throw new Error('Import needs a bounded item list.');
    const database = authoritativeDatabase??await getDatabase();
    const priorActiveId=database.providers[provider]?.activeProfileId;
    const profile=importProfile(database,provider,syncDetails.profileLabel,syncDetails.profileId);
    const now = new Date().toISOString();
    const incoming = timed('entry_validation',()=>normalizedIncoming(database,provider,profile,values));
    const unique = new Map(incoming.map((item) => [item.id, item]));
    const syncHealth=successfulSyncHealth(database,provider,[...unique.values()],false,syncDetails);
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
      recordCount: records.length,
      lastSync: now,
      lastError: null,
      ...syncDetails,syncHealth
    };
    const jobs=provider==='kindle'?await kindleProfileTransition(database,priorActiveId,profile.profileId):{};
    if(priorActiveId!==profile.profileId)profile.lastSelectedAt=now;
    profileState(database,profile,database.providers[provider]);
    return persistDatabase(database,provider,jobs);
  }

  async function clearDatabase() {
    await storageArea.remove(['galacticPurchaseSync',DATABASE_STORAGE_KEY, EXTERNAL_CLIENT_IDS_STORAGE_KEY, GOOGLE_BOOKS_API_KEY_STORAGE_KEY, GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY, SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY, SCANS, NOTIFICATIONS, FEED_UPLOAD_KEY, UI_PREFERENCES_KEY,KINDLE_REFRESH_KEY,KINDLE_REFRESH_ARCHIVES_KEY]);
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
  function selectEnrichment(database,id,kind,value,now,preserveMissingCategories=false){
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
      if(!untrustworthy||!previous)timed('enrichment_update',()=>selectEnrichment(database,itemId,'kindleProductComicContents',{...result,...parse},updatedAt));
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
      timed('enrichment_update',()=>selectEnrichment(database,item.id,'kindleProductComicContents',{...saved,...parsed},now));
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
  async function saveComicCoverageMerge(source,target,title){
    const current=await getUiPreferences();
    const next=validateUiPreferences({...current,comicCoverageMerges:addSeriesMerge(current.comicCoverageMerges,source,target,title)});
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
    saveContentReview, removeContentReview,
    separateEdition, undoEditionSeparation, saveTitleAliases,saveOwnershipReview,removeOwnershipReview,importPurchaseEvidence,refreshPurchaseEvidence,applyPurchaseEvidence,dismissPurchaseEvidence,
    getShowEnrichmentActions, saveShowEnrichmentActions, getUiPreferences, saveUiPreferences, saveComicCoverageMerge, removeComicCoverageMerge
  };
  let tail = Promise.resolve();
  let replacementPending=false;

  async function runOperation(operation,values){
    if(operation!=='checkKindleContentsRefreshItem')invalidateRefreshPreflight();
    const end=activity('operation',{operation});activeOperation=operation;
    try{return await operations[operation](...values);}finally{activeOperation=null;end();}
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
    getQueryDatabase,getQueryAllowedExternalClientIds,invalidateQuerySnapshot,getProviderProfileHint,rememberProviderProfileHints,
    ...Object.fromEntries(STORAGE_OPERATIONS.map((name) => [name, (...args) => execute(name, args)]))
  });
}
