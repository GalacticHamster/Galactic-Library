// Synthetic, browser-compatible injections. No production API creates overlays.
import {validateProviderStates} from '../src/lib/provider-state.js';
import {validateSyncHealth} from '../src/lib/sync-health.js';
import {providerSyncSnapshot} from './provider-sync-fixture.js';
import {consolidateObservations,observationHead,OBSERVATION_KEY,OBSERVATION_HEAD_KEY} from '../src/lib/observation-overlays.js';
import {providerCheckDigest} from '../src/lib/provider-scan-checks.js';
export const observationDate='2026-10-17T06:00:00.000Z';
export function observationEntry(database,provider,{refs=null,at=observationDate,mode='full',whole=false,originRefs=null}={}){
 const profile=database.providerProfiles[database.providers[provider].activeProfileId],members=Object.values(database.providerItems).filter(i=>i.profileId===profile.profileId),items=refs?members.filter(i=>refs.includes(i.recordRef)):members,attemptRef=crypto.randomUUID();
 const state={lastSync:at,lastError:null,syncMode:mode,[mode==='full'?'fullSyncAt':'quickSyncAt']:at,syncHealth:validateSyncHealth({attemptRef,status:'succeeded',mode,startedAt:at,finishedAt:at,retryable:false,differences:{added:0,missing:0,ownershipChanged:0,observed:items.length,unchanged:items.length}})};
 if(mode==='full'||['xbox','playstation','nintendo'].includes(provider))state.snapshotValidation={...providerSyncSnapshot(provider,items),validatedAt:at};
 return {provider,profileId:profile.profileId,attemptRef,mode,scope:items.length===members.length?'complete':'subset',sourceAccountFingerprint:profile.sourceAccountFingerprint??null,supersededStatusAttempts:[],state:validateProviderStates({[provider]:state})[provider],observations:whole?{kind:'all',observedAt:at,updatedAt:provider==='kobo'?'preserve':'advance'}:{kind:'records',items:items.map(i=>({recordRef:i.recordRef,observedAt:provider==='kobo'&&mode==='incremental'?i.observedAt:at,updatedAt:provider==='kobo'?i.updatedAt:at,origins:(i.metadata.purchaseOrigins??[]).filter(o=>!originRefs||originRefs.includes(o.occurrenceRef)).map(o=>({occurrenceRef:o.occurrenceRef,observedAt:at}))}))}};
}
export async function observationPacket(database,provider,options={},previous=null){return consolidateObservations(database,await providerCheckDigest(database),previous,observationEntry(database,provider,options));}
export function injectObservations(stored,writer,packet){stored[OBSERVATION_HEAD_KEY]=observationHead(packet);stored[OBSERVATION_KEY]=structuredClone(packet);writer?.invalidateObservationSnapshot();}
