import {PROVIDERS} from './constants.js';
import {VALIDATION_ALGORITHM_VERSION} from './validation-certificate.js';
import {validateProviderStates} from './provider-state.js';
import {equalDatabaseData} from './data-equality.js';

// Closed observation payload, committed inside Stage 2's single-value envelope.
export const OBSERVATION_KEY='galacticLibraryObservations';
export const OBSERVATION_HEAD_KEY='galacticLibraryObservationHead';
export const OBSERVATION_LIMITS=Object.freeze({bytes:1048576,records:5000,origins:10000,providers:14});
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu,hash=/^[a-f0-9]{64}$/u;
const fail=()=>{throw Error('Saved observation information is incomplete or invalid. Your library was kept. Restore a complete backup or retry the interrupted operation.');};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();};
const iso=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();return value;};
const integer=value=>{if(!Number.isSafeInteger(value)||value<1)fail();};
const consoles=new Set(['xbox','playstation','nintendo']);
export const observationToken=head=>head?`${head.baseDigest}:${head.generation}:${head.revision}:${head.status}`:'none';
export function validateObservationHead(head){
 exact(head,['format','baseDigest','generation','revision','status']);
 if(head.format!==1||!hash.test(head.baseDigest)||!uuid.test(head.generation)||!['active','retiring'].includes(head.status))fail();integer(head.revision);return head;
}
export function observationHead(packet){return {format:1,baseDigest:packet.baseDigest,generation:packet.generation,revision:packet.revision,status:'active'};}

// Null on a genuinely unregistered library or a well-formed older raw base.
// Missing/unreadable members of an active pair are never treated as no evidence.
export function validateObservationOverlay(base,digest,head,packet){
 if(head==null&&packet==null)return null;
 if(head)validateObservationHead(head);
 if(packet){exact(packet,['format','baseDigest','generation','revision','validationVersion','entries']);
  if(packet.format!==1||packet.validationVersion!==VALIDATION_ALGORITHM_VERSION||!hash.test(packet.baseDigest)||!uuid.test(packet.generation))fail();integer(packet.revision);
  if(!Array.isArray(packet.entries)||!packet.entries.length||packet.entries.length>OBSERVATION_LIMITS.providers||new TextEncoder().encode(JSON.stringify(packet)).length>OBSERVATION_LIMITS.bytes)fail();
 }
 if(head?.status==='retiring')fail();
 if(!head||!packet||head.baseDigest!==packet.baseDigest||head.generation!==packet.generation||head.revision!==packet.revision)fail();
 // A new fully saved catalog owns its own evidence; this older packet cannot
 // attach to new records even when provider titles/IDs happen to be reused.
 if(packet.baseDigest!==digest)return null;
 const profiles=new Set(),byRef=new Map(Object.values(base.providerItems).map(i=>[i.recordRef,i]));let recordCount=0,originCount=0;
 for(const entry of packet.entries){
  exact(entry,['provider','profileId','attemptRef','mode','scope','sourceAccountFingerprint','supersededStatusAttempts','state','observations']);
  const {provider,profileId,mode,scope,state,observations}=entry,p=base.providerProfiles[profileId];
  if(!PROVIDERS.includes(provider)||!p||p.provider!==provider||profiles.has(provider)||base.providers[provider]?.activeProfileId!==profileId||!p.state.connected||!p.state.fullSyncAt||!uuid.test(entry.attemptRef)||!['full','incremental'].includes(mode)||!['complete','subset'].includes(scope))fail();profiles.add(provider);
  if(entry.sourceAccountFingerprint!==(p.sourceAccountFingerprint??null)||consoles.has(provider)&&!hash.test(entry.sourceAccountFingerprint))fail();
  if(!Array.isArray(entry.supersededStatusAttempts)||entry.supersededStatusAttempts.length>3||new Set(entry.supersededStatusAttempts).size!==entry.supersededStatusAttempts.length||entry.supersededStatusAttempts.some(ref=>!uuid.test(ref)))fail();
  const validated=validateProviderStates({[provider]:state})[provider];if(!equalDatabaseData(validated,state))fail();
  for(const [key,value]of Object.entries(state))if(!['lastSync','quickSyncAt','fullSyncAt','lastError','syncMode','syncHealth','snapshotValidation'].includes(key)&&!equalDatabaseData(value,p.state[key]))fail();
  const health=state.syncHealth;
  if(state.lastError!==null||state.syncMode!==mode||!state.lastSync||!health||health.status!=='succeeded'||health.mode!==mode||health.attemptRef!==entry.attemptRef||!health.startedAt||!health.finishedAt||health.failureCode||health.failedRequestCount||health.failedPages?.length||health.coverageLimit||health.retryable)fail();
  if(!state[mode==='full'?'fullSyncAt':'quickSyncAt'])fail();
  if(Object.entries(health.differences??{}).some(([k,v])=>!['observed','unchanged',...(provider==='fanatical'?['updated']:[])].includes(k)&&v!==0))fail();
  if(mode==='full'&&!state.snapshotValidation||consoles.has(provider)&&!state.snapshotValidation)fail();
  if(!consoles.has(provider)&&mode==='full'&&scope!=='complete')fail();
  const members=Object.values(base.providerItems).filter(i=>i.profileId===profileId);
  if(observations.kind==='all'){
   exact(observations,['kind','observedAt','updatedAt']);iso(observations.observedAt);
   if(scope!=='complete'||provider==='fanatical'||!['advance','preserve'].includes(observations.updatedAt)||observations.updatedAt!==(provider==='kobo'?'preserve':'advance')||provider==='kobo'&&mode==='incremental')fail();
  }else if(observations.kind==='records'){
   exact(observations,['kind','items']);if(!Array.isArray(observations.items))fail();const refs=new Set();
   for(const row of observations.items){
    exact(row,['recordRef','observedAt','updatedAt','origins']);const item=byRef.get(row.recordRef);
    if(!item||item.profileId!==profileId||refs.has(row.recordRef)||!Array.isArray(row.origins))fail();refs.add(row.recordRef);iso(row.observedAt);iso(row.updatedAt);
    // A consolidated Kobo quick check can retain a preceding full observation
    // on this base; it cannot invent a fresh record clock of its own.
    if(provider==='kobo'?(row.updatedAt!==item.updatedAt||mode==='incremental'&&row.observedAt!==item.observedAt&&(!state.fullSyncAt||state.fullSyncAt===p.state.fullSyncAt||!state.snapshotValidation)):row.updatedAt!==row.observedAt)fail();
    const origins=new Set();for(const origin of row.origins){exact(origin,['occurrenceRef','observedAt']);iso(origin.observedAt);if(provider!=='fanatical'||origins.has(origin.occurrenceRef)||!item.metadata.purchaseOrigins?.some(o=>o.occurrenceRef===origin.occurrenceRef))fail();origins.add(origin.occurrenceRef);originCount++;}recordCount++;
   }
   if(scope==='complete'&&(refs.size!==members.length||members.some(i=>!refs.has(i.recordRef))))fail();
  }else fail();
  const count=observations.kind==='all'?members.length:observations.items.length;
  if((mode==='full'||consoles.has(provider))&&state.snapshotValidation?.itemCount>count||health.differences?.observed>count||(health.differences?.updated??0)>count)fail();
 }
 if(recordCount>OBSERVATION_LIMITS.records||originCount>OBSERVATION_LIMITS.origins)fail();return packet;
}

// One shared projection, once per observation revision. Original records,
// metadata, reviews and raw committed objects are never mutated.
export function materializeObservations(base,packet){
 if(!packet)return base;
 const result={...base,providerItems:{...base.providerItems},providers:{...base.providers},providerProfiles:{...base.providerProfiles}};
 const byRef=new Map(Object.values(base.providerItems).map(i=>[i.recordRef,i]));
 for(const entry of packet.entries){
  const {observations,profileId,provider}=entry;
  const rows=observations.kind==='all'?Object.values(base.providerItems).filter(i=>i.profileId===profileId).map(i=>({recordRef:i.recordRef,observedAt:observations.observedAt,updatedAt:observations.updatedAt==='preserve'?i.updatedAt:observations.observedAt,origins:[]})):observations.items;
  for(const row of rows){const item=byRef.get(row.recordRef),origins=new Map(row.origins.map(o=>[o.occurrenceRef,o.observedAt]));result.providerItems[item.id]={...item,observedAt:row.observedAt,updatedAt:row.updatedAt,...(origins.size?{metadata:{...item.metadata,purchaseOrigins:item.metadata.purchaseOrigins.map(o=>origins.has(o.occurrenceRef)?{...o,observedAt:origins.get(o.occurrenceRef)}:o)}}:{})};}
  result.providerProfiles[profileId]={...base.providerProfiles[profileId],state:{...base.providerProfiles[profileId].state,...entry.state}};
  result.providers[provider]={...base.providers[provider],...entry.state};
 }return result;
}

// Pure bounded consolidation shared by the writer and injected fixtures.
// Overflow requires the existing validated full save.
export function consolidateObservations(base,digest,previous,entry){
 if(previous&&!validateObservationOverlay(base,digest,observationHead(previous),previous))fail();
 const incoming={format:1,baseDigest:digest,generation:previous?.generation??crypto.randomUUID(),revision:(previous?.revision??0)+1,validationVersion:VALIDATION_ALGORITHM_VERSION,entries:[entry]};
 validateObservationOverlay(base,digest,observationHead(incoming),incoming);
 const old=previous?.entries.find(e=>e.provider===entry.provider);let merged=entry;
 if(old&&entry.observations.kind==='records'){
  const prior=materializeObservations(base,{entries:[old]}),refs=old.observations.kind==='all'?Object.values(base.providerItems).filter(i=>i.profileId===old.profileId).map(i=>i.recordRef):old.observations.items.map(i=>i.recordRef),byRef=new Map(Object.values(prior.providerItems).map(i=>[i.recordRef,i]));
  const priorOrigins=new Map(old.observations.kind==='records'?old.observations.items.map(row=>[row.recordRef,row.origins]):[]);
  const rows=new Map(refs.map(ref=>{const i=byRef.get(ref);return [ref,{recordRef:ref,observedAt:i.observedAt,updatedAt:i.updatedAt,origins:priorOrigins.get(ref)??[]}];}));
  for(const row of entry.observations.items){const before=rows.get(row.recordRef),origins=new Map([...(before?.origins??[]),...row.origins].map(o=>[o.occurrenceRef,o]));rows.set(row.recordRef,{...row,...(entry.provider==='kobo'&&entry.mode==='incremental'&&before?{observedAt:before.observedAt,updatedAt:before.updatedAt}:{}),origins:[...origins.values()]});}
  merged={...entry,state:{...old.state,...entry.state},observations:{kind:'records',items:[...rows.values()]}};
 }
 if(old)merged={...merged,state:{...old.state,...entry.state},supersededStatusAttempts:[...new Set([...old.supersededStatusAttempts,...entry.supersededStatusAttempts])]};
 const packet={...incoming,entries:[...(previous?.entries??[]).filter(e=>e.provider!==entry.provider),merged]};
 validateObservationOverlay(base,digest,observationHead(packet),packet);return packet;
}

// Explicit lineage avoids ordering independent successful observations by wall
// clock. Only status attempts captured by the future producer are superseded.
export function observationStatusChecks(checks,packet){
 if(!packet||!checks?.checks)return checks;
 const result={...checks,checks:{...checks.checks}};
 for(const entry of packet.entries){const status=result.checks[entry.provider];if(!status)continue;
  if(entry.supersededStatusAttempts.includes(status.patch?.syncHealth?.attemptRef)){delete result.checks[entry.provider];continue;}
  if(entry.supersededStatusAttempts.includes(status.baseline?.syncHealth?.attemptRef)){result.checks[entry.provider]={...status};delete result.checks[entry.provider].baseline;}
 }return result;
}
