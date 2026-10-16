import {STORAGE_OPERATIONS} from './storage-protocol.js';
import {DATABASE_STORAGE_KEY,EXTERNAL_CLIENT_IDS_STORAGE_KEY,GOOGLE_BOOKS_API_KEY_STORAGE_KEY,GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY,SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY} from './constants.js';

// Bounded, value-free worker journal. It records activity, not CPU attribution.
// Never hash/clone a database, retain request payloads, or add scheduling work.
const knownKeys=new Set([EXTERNAL_CLIENT_IDS_STORAGE_KEY,GOOGLE_BOOKS_API_KEY_STORAGE_KEY,GOOGLE_BOOKS_ENRICHMENT_JOB_STORAGE_KEY,SHOW_ENRICHMENT_ACTIONS_STORAGE_KEY,'galacticLibraryUiPreferences','galacticLibraryReminderNotifications','galacticLibraryKindleContentsRefresh']);
export const diagnosticStorageKey=key=>key===DATABASE_STORAGE_KEY?'database':knownKeys.has(key)?key:'other';
const labels=new Set([...STORAGE_OPERATIONS,...knownKeys,'database','settings','other','writer','observer','private-observer','cold-read','removed','retained','invalidated','published','unavailable']);
const stages=new Set(['worker_start','operation','storage_get','storage_set','storage_remove','storage_change','snapshot_change','snapshot_compare','snapshot_read','snapshot_validation','snapshot_canonical','snapshot_migration','snapshot_wait','validation','validation_records','validation_history','validation_canonical','validation_other','options_view','query','internal_query']);
for(const stage of ['storage_read','read_committed_compare','read_committed_clone','read_certificate','read_certificate_retry','certificate_read','certificate_serialize','certificate_hash','certificate_hit','certificate_miss','certificate_unavailable','certificate_missing','certificate_invalid','certificate_mismatch','certificate_error','migration_compare','snapshot_clone','snapshot_freeze','provider_check_digest'])stages.add(stage);
export function createQueryDiagnostics({clock=()=>performance.timeOrigin+performance.now(),limit=192,worker=crypto.randomUUID().replaceAll('-','').slice(0,12),onActivity=()=>{}}={}){
  const started=clock(),rows=[],active=new Map();let sequence=0,dropped=0;
  const fields=value=>Object.fromEntries(Object.entries(value??{}).filter(([key,v])=>
    ['operation','key','reason','source'].includes(key)?labels.has(v):['epoch','snapshot','previousSnapshot'].includes(key)?Number.isSafeInteger(v)&&v>=0:false));
  function add(row){rows.push(row);if(rows.length>limit){rows.shift();dropped++;}}
  function begin(stage,details){
    if(!stages.has(stage))return ()=>{};
    onActivity(stage,fields(details));
    const id=++sequence,row={id,stage,startEpochMs:clock(),...fields(details)};active.set(id,row);
    if(active.size>limit){active.delete(active.keys().next().value);dropped++;}
    return ()=>{if(!active.delete(id))return;onActivity(stage,fields(details));add({...row,durationMs:Math.max(0,clock()-row.startEpochMs)});};
  }
  function event(stage,details){begin(stage,details)();}
  event('worker_start');
  return {begin,event,worker,startedEpochMs:started,report:()=>({worker,startedEpochMs:started,limit,dropped,events:[...rows,...active.values()].sort((a,b)=>a.id-b.id).slice(-limit).map(row=>({...row,...(!Object.hasOwn(row,'durationMs')?{durationMs:Math.max(0,clock()-row.startEpochMs),pending:true}:{})}))})};
}
