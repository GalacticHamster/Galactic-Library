import {object,text,date,count} from './validation.js';
import {PROVIDERS} from './constants.js';
import {equalDatabaseData} from './data-equality.js';
import {koboObservationChanged} from './kobo-observations.js';

function providerObservationChanged(previous,incoming){
  if(incoming.provider==='kobo')return koboObservationChanged(previous,incoming);
  // Freshness timestamps are not changed products; compare all content fields.
  const content=({updatedAt,observedAt,recordRef,...record})=>record;
  return !equalDatabaseData(content(previous),content(incoming));
}

export const SYNC_FAILURE_CODES=['authentication','network','timeout','coverage','other'];
export function validateSyncHealth(value){
  object(value,'Sync health');if(!['running','succeeded','partial','failed','cancelled'].includes(value.status)||!['full','incremental'].includes(value.mode))throw new Error('Invalid sync health state.');
  const failureCode=text(value.failureCode??'',20,'Sync failure code');if(failureCode&&!SYNC_FAILURE_CODES.includes(failureCode))throw new Error('Invalid sync failure category.');
  if(typeof value.retryable!=='boolean')throw new Error('Invalid sync retry state.');
  const failedPages=value.failedPages??[];if(!Array.isArray(failedPages)||failedPages.length>100||failedPages.some(page=>!Number.isSafeInteger(page)||page<1||page>100000))throw new Error('Invalid failed page numbers.');
  const attemptRef=text(value.attemptRef??'',36,'Sync attempt reference');if(attemptRef&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(attemptRef))throw new Error('Invalid sync attempt reference.');
  const result={attemptRef,status:value.status,mode:value.mode,attemptedProfileLabel:text(value.attemptedProfileLabel??'',100,'Attempted profile'),startedAt:date(value.startedAt),finishedAt:date(value.finishedAt),failureCode,retryable:value.retryable,failedRequestCount:count(value.failedRequestCount??0),failedPages:[...new Set(failedPages)],retries:value.retries===undefined||value.retries===null?null:count(value.retries),coverageLimit:text(value.coverageLimit??'',100,'Coverage limitation')};
  if(value.differences!==undefined){object(value.differences,'Snapshot differences');result.differences=Object.fromEntries(['added','missing','ownershipChanged','observed'].map(key=>[key,count(value.differences[key]??0)]));for(const key of ['updated','unchanged','gamesAdded','gamesUpdated','addOnsAdded','addOnsUpdated'])if(value.differences[key]!==undefined)result.differences[key]=count(value.differences[key]);}
  return result;
}
export function syncFailure(error){
  const message=String(error?.message??error??'');const code=/login|sign.in|401|403|account changed/iu.test(message)?'authentication':/timeout|timed out|abort/iu.test(message)?'timeout':/incomplete|coverage|pagination|count|malformed|unreadable|invalid|limit|bounds/iu.test(message)?'coverage':/fetch|network|offline|connection/iu.test(message)?'network':'other';
  const page=/\bpage\s+([1-9]\d{0,4})\b/iu.exec(message);return {code,retryable:true,failedPages:page?[Number(page[1])]:[],failedRequestCount:1};
}
export function snapshotDifferences(previous,incoming,full,detailed=false){
  const before=new Map(previous.map(item=>[item.id,item])),after=new Map(incoming.map(item=>[item.id,item]));
  const added=incoming.filter(item=>!before.has(item.id));
  const basic={added:added.length,missing:full?previous.filter(item=>!after.has(item.id)).length:0,ownershipChanged:incoming.filter(item=>before.has(item.id)&&before.get(item.id).ownership!==item.ownership).length,observed:after.size};
  if(!detailed)return basic;
  const updated=incoming.filter(item=>before.has(item.id)&&providerObservationChanged(before.get(item.id),item));
  return {...basic,
    updated:updated.length,unchanged:incoming.length-added.length-updated.length,
    gamesAdded:added.filter(item=>item.mediaType==='game').length,gamesUpdated:updated.filter(item=>item.mediaType==='game').length,
    addOnsAdded:added.filter(item=>item.mediaType==='game-addon').length,addOnsUpdated:updated.filter(item=>item.mediaType==='game-addon').length};
}
// A quick scan's persisted lease can show progress without changing the
// committed library. This projection is for trusted Options display only.
export function providerScanDisplay(database,scans={}){
  let result=database;
  for(const [provider,scan]of Object.entries(scans)){
    if(!scan?.readOnlyStart||database.providers[provider]?.activeProfileId!==scan.activeAtStartId||scan.profileId!==scan.activeAtStartId)continue;
    const profile=database.providerProfiles[scan.profileId];if(!profile||profile.provider!==provider)continue;
    if(profile.state.syncHealth?.attemptRef===scan.attemptRef&&profile.state.syncHealth.status!=='running')continue;
    let health;
    try{health=validateSyncHealth({attemptRef:scan.attemptRef,status:'running',mode:scan.mode,attemptedProfileLabel:profile.nickname,startedAt:scan.startedAt,retryable:false});}catch{continue;}
    if(result===database)result={...database,providers:{...database.providers},providerProfiles:{...database.providerProfiles}};
    result.providerProfiles[profile.profileId]={...profile,state:{...profile.state,syncHealth:health}};
    result.providers[provider]={...database.providers[provider],syncHealth:health};
  }
  return result;
}
export function syncHealthRows(database,now=Date.now()){
  return PROVIDERS.map(provider=>{
    const state=database.providers[provider]??{},health=state.syncHealth;
    return {provider,state,health,fullAgeDays:state.fullSyncAt?Math.max(0,Math.floor((now-Date.parse(state.fullSyncAt))/86400000)):null,
      historicalCount:Object.values(database.providerHistory??{}).filter(entry=>entry.item.provider===provider).length,
      longRunning:health?.status==='running'&&now-Date.parse(health.startedAt)>600000};
  });
}
