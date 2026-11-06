import { PROVIDERS } from './constants.js';
import { object, text, strings, date, count } from './validation.js';
import {audibleHistoryFailures,audibleHistoryYears,audibleGiftHistory} from './audible-ownership.js';
import {validateSyncHealth} from './sync-health.js';

const STEAM_METADATA_ISSUES=['unsupported','unavailable','absent','missingTitle','invalidTitle','invalidType','conflictingDuplicate','http','authentication','malformed','classification','network','other'];
export function validateSteamApplications(value){
  object(value,'Steam owned applications');
  if(value.version!==1||value.source!=='dynamicstore-owned-apps'||value.complete!==true||Object.keys(value).some(k=>!['version','source','complete','appIds','issues','access','previouslyObservedAppIds'].includes(k)))throw Error('Invalid Steam owned application evidence.');
  const ids=strings(value.appIds,50000,10,'Steam owned App IDs');
  if(!Array.isArray(value.appIds)||!ids.length||ids.length!==value.appIds.length||ids.some(id=>!/^\d+$/u.test(id)||String(Number(id))!==id||Number(id)<1||Number(id)>0xffffffff))throw Error('Invalid Steam owned application identity.');
  const owned=new Set(ids),seen=new Set();
  const accessSeen=new Set(),access=value.access??[];
  if(!Array.isArray(access)||access.length>ids.length)throw Error('Invalid Steam access evidence.');
  const accessEvidence=access.map(entry=>{
    object(entry,'Steam access evidence');
    if(Object.keys(entry).some(k=>!['appId','basis'].includes(k))||!owned.has(entry.appId)||accessSeen.has(entry.appId)||!['master-subscription','auto-grant'].includes(entry.basis))throw Error('Invalid Steam access evidence.');
    accessSeen.add(entry.appId);return {appId:entry.appId,basis:entry.basis};
  }).sort((a,b)=>Number(a.appId)-Number(b.appId));
  if(!Array.isArray(value.issues)||value.issues.length>ids.length)throw Error('Invalid Steam metadata issues.');
  const issues=value.issues.map(issue=>{
    object(issue,'Steam metadata issue');
    if(Object.keys(issue).some(k=>!['appId','kind','reportedType','title'].includes(k))||!owned.has(issue.appId)||seen.has(issue.appId)||!STEAM_METADATA_ISSUES.includes(issue.kind))throw Error('Invalid Steam metadata issue.');
    seen.add(issue.appId);const entry={appId:issue.appId,kind:issue.kind};
    if(issue.reportedType!==undefined){if(!Number.isSafeInteger(issue.reportedType)||Math.abs(issue.reportedType)>100000)throw Error('Invalid Steam application type.');entry.reportedType=issue.reportedType;}
    if(issue.title!==undefined){entry.title=text(issue.title,500,'Steam application title');if(!entry.title)throw Error('Empty Steam application title.');}
    return entry;
  }).sort((a,b)=>Number(a.appId)-Number(b.appId));
  const previous=value.previouslyObservedAppIds===undefined?[]:strings(value.previouslyObservedAppIds,50000,10,'Earlier Steam App IDs');
  if(value.previouslyObservedAppIds!==undefined&&(!Array.isArray(value.previouslyObservedAppIds)||previous.length!==value.previouslyObservedAppIds.length||previous.some(id=>!/^\d+$/u.test(id)||String(Number(id))!==id||Number(id)<1||Number(id)>0xffffffff||owned.has(id))))throw Error('Invalid earlier Steam application evidence.');
  return {version:1,source:'dynamicstore-owned-apps',complete:true,appIds:ids.sort((a,b)=>Number(a)-Number(b)),issues,...(accessEvidence.length?{access:accessEvidence}:{}),...(previous.length?{previouslyObservedAppIds:previous.sort((a,b)=>Number(a)-Number(b))}:{})};
}

export const steamApplicationAccess=registry=>{
  const access=new Map((registry.access??[]).map(entry=>[entry.appId,entry.basis]));
  return id=>{const basis=access.get(id)??'owned-app-index';return {basis,ownership:basis==='master-subscription'?'subscription':basis==='auto-grant'?'unknown':'owned'};};
};

export function validateSteamApplicationImport(values,evidence,existing=[],full=false){
  const registry=validateSteamApplications(evidence),owned=new Set(registry.appIds),issues=new Set(registry.issues.map(i=>i.appId)),captured=new Set(),accessFor=steamApplicationAccess(registry);
  for(const item of values){const id=String(item.providerItemId??'');if(!owned.has(id)||issues.has(id)||captured.has(id)||item.ownership!==accessFor(id).ownership||!['game','game-addon'].includes(item.mediaType))throw Error('Steam application evidence does not match its readable records.');captured.add(id);}
  if(!full)for(const item of existing)if(owned.has(item.providerItemId)&&!issues.has(item.providerItemId))captured.add(item.providerItemId);
  if(registry.appIds.some(id=>!captured.has(id)&&!issues.has(id)))throw Error('Steam owned enumeration has unexplained applications. Previous records were kept.');
  return registry;
}

export function validateProviderStates(value = {}) {
  object(value,'Provider states');
  return Object.fromEntries(PROVIDERS.filter(provider=>Object.hasOwn(value,provider)).map(provider=>{
    const state=object(value[provider],'Provider state');const result={};
    for(const key of ['activeProfileId','connected','itemCount','addOnCount','audiobookCount','softwareCount','bookCount','movieCount','tvCount','linkedAddOnCount','recordCount','lastSync','lastError','source','syncMode','quickSyncAt','fullSyncAt','accountLabel','profileLabel']){
      if(!Object.hasOwn(state,key))continue;
      if(key==='activeProfileId'){if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(state[key]??''))throw Error('Invalid active profile.');result[key]=state[key];}
      else if(key==='connected'){if(typeof state[key]!=='boolean')throw new Error('Provider connected must be boolean.');result[key]=state[key];}
      else if(key.endsWith('Count'))result[key]=count(state[key],key);
      else if(['lastSync','quickSyncAt','fullSyncAt'].includes(key))result[key]=date(state[key],key);
      else result[key]=state[key]===null?null:text(state[key],key==='lastError'?600:500,key);
    }
    if(result.syncMode && !['full','incremental'].includes(result.syncMode))throw new Error('Invalid provider scan mode.');
    if(state.syncHealth!==undefined)result.syncHealth=validateSyncHealth(state.syncHealth);
    if(state.syncState!==undefined){
      object(state.syncState,'Provider sync state');result.syncState={};
      if(provider==='steam'&&state.syncState.applications!==undefined)result.syncState.applications=validateSteamApplications(state.syncState.applications);
      if(provider==='audible'&&state.syncState.audibleHistory!==undefined){
        const h=object(state.syncState.audibleHistory,'Audible history checkpoint');
        if(h.version!==1||!['full','recent'].includes(h.scope??'full')||typeof h.ordersComplete!=='boolean'||typeof h.refundsComplete!=='boolean'||!Array.isArray(h.years)||h.years.length>200||h.years.some(y=>!Number.isInteger(y)||y<1900||y>2100))throw Error('Invalid Audible history checkpoint.');
        if(audibleHistoryYears(h.refundPurchaseYearsChecked).some(y=>!h.years.includes(y)))throw Error('Invalid Audible refund year scope.');
        result.syncState.audibleHistory={version:1,scope:h.scope??'full',...audibleGiftHistory(h),...(h.failures?{failures:audibleHistoryFailures(h.failures)}:{}),...(h.uncertainRefunds!==undefined?{uncertainRefunds:count(h.uncertainRefunds,'Uncertain Audible refunds',50000)}:{}),ordersComplete:h.ordersComplete,refundsComplete:h.refundsComplete,...(h.refundPurchaseYearsChecked?{refundPurchaseYearsChecked:audibleHistoryYears(h.refundPurchaseYearsChecked)}:{}),years:[...new Set(h.years)],pagesRead:count(h.pagesRead,'Audible pages',10000),checkedAt:date(h.checkedAt),...(h.fullCheckedAt?{fullCheckedAt:date(h.fullCheckedAt)}:{}),reason:text(h.reason??'',100)};
      }
      // Missing/non-array acquisition checkpoints are not completed empty scans.
      // Keep validation of supplied values, but let admission request a full scan.
      if(provider==='humble'){
        const ids=strings(state.syncState.knownPurchaseIds,50000,256,'Purchase IDs');
        if(Array.isArray(state.syncState.knownPurchaseIds))result.syncState.knownPurchaseIds=ids;
        if(state.syncState.failedPurchaseIds!==undefined)result.syncState.failedPurchaseIds=strings(state.syncState.failedPurchaseIds,50000,256,'Unresolved Humble purchases');
        if(state.syncState.acquisitionCheckedAt!==undefined)result.syncState.acquisitionCheckedAt=date(state.syncState.acquisitionCheckedAt,'Humble acquisition check');
      }
      if(provider==='fanatical'){
        if(state.syncState.acquisitionCheckedAt!==undefined)result.syncState.acquisitionCheckedAt=date(state.syncState.acquisitionCheckedAt,'Fanatical acquisition check');
        const fingerprints=strings(state.syncState.knownOrderFingerprints,50000,64,'Order fingerprints');
        if(fingerprints.some(entry=>!/^[a-f0-9]{64}$/iu.test(entry)))throw new Error('Invalid order fingerprint.');
        if(Array.isArray(state.syncState.knownOrderFingerprints))result.syncState.knownOrderFingerprints=fingerprints.map(entry=>entry.toLowerCase());
      }
    }
    if(state.snapshotValidation!==undefined){
      const snapshot=object(state.snapshotValidation,'Snapshot validation');
      if(snapshot.version!==1||snapshot.provider!==provider||snapshot.complete!==true||!Array.isArray(snapshot.scopes)||!snapshot.scopes.length||snapshot.scopes.length>100)throw new Error('Invalid saved snapshot.');
      result.snapshotValidation={version:1,provider,complete:true,itemCount:count(snapshot.itemCount),validatedAt:date(snapshot.validatedAt),scopes:snapshot.scopes.map(entry=>{
        object(entry,'Snapshot section');
        if(entry.complete!==true||entry.limitReached!==false||!['reported-count','pagination-end','scroll-end','index-complete'].includes(entry.end))throw new Error('Invalid saved snapshot section.');
        const section={id:text(entry.id,80,'Snapshot section ID'),readCount:count(entry.readCount),expectedCount:entry.expectedCount===null?null:count(entry.expectedCount),end:entry.end,pagesRead:count(entry.pagesRead),complete:true,limitReached:false,...(entry.duplicateCount!==undefined?{duplicateCount:count(entry.duplicateCount)}:{})};
        if(!section.id || !section.pagesRead || (section.expectedCount!==null && section.expectedCount!==section.readCount) || (section.expectedCount===null && (!section.readCount || section.end==='reported-count')) || (section.duplicateCount??0)>section.readCount)throw new Error('Inconsistent saved snapshot section.');
        return section;
      })};
      const sections=result.snapshotValidation.scopes.map(section=>section.id);
      if(new Set(sections).size!==sections.length || (provider==='kindle'?['books','personal-documents']:provider==='fandango-at-home'?['movie','tv']:[]).some(id=>!sections.includes(id)))throw new Error('Missing or duplicate saved snapshot sections.');
    }
    return [provider,result];
  }));
}
