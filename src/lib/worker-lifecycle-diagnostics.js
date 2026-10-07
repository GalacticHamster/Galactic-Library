import {STORAGE_OPERATIONS} from './storage-protocol.js';

export const WORKER_LIFECYCLE_KEY='galacticLibraryWorkerLifecycleBreadcrumb';
export const ACTIVITY_CHECKPOINT_MS=10000;
const companionTypes=new Set(['PING','GET_STATUS','GET_REMINDERS','MATCH_ITEMS','OPEN_REVIEW','BEGIN_ENTITLEMENT_FEED','APPEND_ENTITLEMENT_FEED','COMMIT_ENTITLEMENT_FEED','REMOVE_ENTITLEMENT_FEED']);
const activityTypes=new Set(['worker_start','operation','storage_get','storage_set','storage_remove','storage_change','snapshot_change','snapshot_compare','snapshot_read','snapshot_validation','snapshot_canonical','snapshot_migration','snapshot_wait','validation','validation_records','validation_history','validation_canonical','validation_other','options_view','query','internal_query','diagnostics_export','options_timing_received','companion_diagnostic_callback','companion_diagnostic_render','runtime_onStartup','runtime_onInstalled',...STORAGE_OPERATIONS,...[...companionTypes].flatMap(type=>['external_started:'+type,'external_completed:'+type])]);
const installReasons=new Set(['install','update','chrome_update','shared_module_update']);
const epoch=value=>Number.isFinite(value)&&value>=0&&value<=8640000000000000;
function cleanGeneration(value){
  if(!/^[a-f0-9]{12}$/u.test(value?.worker??'')||!epoch(value.startedEpochMs)||!epoch(value.lastActivityEpochMs)||!activityTypes.has(value.lastActivityType)||!epoch(value.recordedAtEpochMs))return null;
  const completed=companionTypes.has(value.lastCompletedExternalType)&&epoch(value.lastCompletedExternalEpochMs);
  return {worker:value.worker,startedEpochMs:value.startedEpochMs,lastActivityEpochMs:value.lastActivityEpochMs,lastActivityType:value.lastActivityType,recordedAtEpochMs:value.recordedAtEpochMs,
    lastCompletedExternalEpochMs:completed?value.lastCompletedExternalEpochMs:null,lastCompletedExternalType:completed?value.lastCompletedExternalType:null,
    ...(value.platformEvent==='onStartup'||value.platformEvent==='onInstalled'?{platformEvent:value.platformEvent,platformEventEpochMs:epoch(value.platformEventEpochMs)?value.platformEventEpochMs:null,platformEventReason:value.platformEvent==='onInstalled'&&installReasons.has(value.platformEventReason)?value.platformEventReason:null}:{})};
}

// One browser-session key, two flat generations. No timers, journals, requests,
// database writes or storage.local fallback. Writes never gate API responses.
export function createWorkerLifecycleDiagnostics({area,ready=Promise.resolve(),worker,startedEpochMs,clock=()=>performance.timeOrigin+performance.now()}){
  let previous=null,available=false,inFlight=null,criticalPending=false,lastAttempt=-Infinity,lastSaved=null,writeFailure=false;
  const current={worker,startedEpochMs,lastActivityEpochMs:startedEpochMs,lastActivityType:'worker_start',lastCompletedExternalEpochMs:null,lastCompletedExternalType:null};
  function persist(force=false){
    if(!available)return Promise.resolve();
    if(inFlight){if(force)criticalPending=true;return inFlight;}
    const at=clock();if(!force&&at-lastAttempt<ACTIVITY_CHECKPOINT_MS)return Promise.resolve();
    lastAttempt=at;
    const captured=cleanGeneration({...current,recordedAtEpochMs:at});
    if(!captured)return Promise.resolve();
    inFlight=Promise.resolve().then(()=>area.set({[WORKER_LIFECYCLE_KEY]:{format:1,current:captured,previous}}))
      .then(()=>{lastSaved=at;writeFailure=false;},()=>{writeFailure=true;})
      .finally(()=>{inFlight=null;if(criticalPending){criticalPending=false;persist(true);}});
    return inFlight;
  }
  const initialized=(async()=>{
    try{
      await ready;
      if(typeof area?.get!=='function'||typeof area?.set!=='function')return;
      const stored=await area.get(WORKER_LIFECYCLE_KEY);
      previous=stored?.[WORKER_LIFECYCLE_KEY]?.format===1?cleanGeneration(stored[WORKER_LIFECYCLE_KEY].current):null;
      available=true;await persist(true);
    }catch{writeFailure=true;}
  })();
  function observe(type){
    if(!activityTypes.has(type))return;
    current.lastActivityEpochMs=clock();current.lastActivityType=type;
    persist();
  }
  function completed(type){
    if(!companionTypes.has(type))return;
    current.lastCompletedExternalEpochMs=clock();current.lastCompletedExternalType=type;
    current.lastActivityEpochMs=current.lastCompletedExternalEpochMs;current.lastActivityType='external_completed:'+type;
    persist(true);
  }
  function platformEvent(type,reason){
    if(!['onStartup','onInstalled'].includes(type))return;
    current.platformEvent=type;current.platformEventEpochMs=clock();current.platformEventReason=type==='onInstalled'&&installReasons.has(reason)?reason:null;
    current.lastActivityEpochMs=current.platformEventEpochMs;current.lastActivityType='runtime_'+type;
    persist(true);
  }
  return {observe,completed,platformEvent,ready:initialized,async report(){
    await initialized;
    return {format:1,storage:'session',activityCheckpointMs:ACTIVITY_CHECKPOINT_MS,status:!available?'unavailable':writeFailure?'write-failed':'available',lastSuccessfulWriteEpochMs:lastSaved,
      currentDataSource:'live-memory',previousDataSource:'session-checkpoint',
      current:cleanGeneration({...current,recordedAtEpochMs:lastSaved??startedEpochMs}),previous:previous?{...previous}:null,
      gapFromPreviousRecordedActivityMs:previous?startedEpochMs-previous.lastActivityEpochMs:null,
      shutdownReason:null,shutdownReasonStatus:'not-exposed'};
  }};
}
