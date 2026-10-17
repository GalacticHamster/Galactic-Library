import {PROVIDERS} from './constants.js';
import {OBSERVATION_KEY,OBSERVATION_HEAD_KEY,observationHead,validateObservationOverlay} from './observation-overlays.js';
import {equalDatabaseData} from './data-equality.js';

// Single-value commit records. No atomicity across storage keys is assumed.
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu,hash=/^[a-f0-9]{64}$/u;
export const OBSERVATION_REGISTRATION=Object.freeze({format:2,registered:true});
export const observationCorruption=()=>{throw Error('Saved observation information is damaged or does not belong to this library. Your records were kept. Export a backup if available and use a complete backup to recover.');};
function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))observationCorruption();}
export const isObservationTransaction=value=>value?.format===2;
export const providerObservationToken=(envelope,packet,provider)=>`${envelope?.epoch??'legacy'}:${packet?.entries.find(e=>e.provider===provider)?.attemptRef??'none'}`;
export function activeObservationEnvelope(baseDigest,packet=null,epoch=crypto.randomUUID(),completions=[]){return {format:2,kind:'active',epoch,baseDigest,packet,completions};}
export function validateActiveEnvelope(value,base,digest){
 exact(value,['format','kind','epoch','baseDigest','packet','completions']);
 if(value.format!==2||value.kind!=='active'||!uuid.test(value.epoch)||value.baseDigest!==null&&!hash.test(value.baseDigest)||value.baseDigest!==digest||value.packet!==null&&(!value.packet||typeof value.packet!=='object'||Array.isArray(value.packet)))observationCorruption();
 if(!Array.isArray(value.completions)||value.completions.length>PROVIDERS.length)observationCorruption();const providers=new Set();
 for(const c of value.completions){exact(c,['provider','profileId','attemptRef','scanToken','tabId','mode','sourceAccountFingerprint','requestDigest']);
  if(!PROVIDERS.includes(c.provider)||providers.has(c.provider)||!uuid.test(c.profileId)||!uuid.test(c.attemptRef)||!uuid.test(c.scanToken)||!hash.test(c.requestDigest)||c.tabId!==null&&!Number.isSafeInteger(c.tabId)||!['full','incremental'].includes(c.mode)||c.sourceAccountFingerprint!==null&&!hash.test(c.sourceAccountFingerprint))observationCorruption();providers.add(c.provider);
 }
 if(value.packet){if(value.packet.baseDigest!==value.baseDigest)observationCorruption();validateObservationOverlay(base,digest,observationHead(value.packet),value.packet);}
 return value;
}
// Metadata affected by a catalog commit. Full DB values are never duplicated in
// this journal; existing validators bound these operation-specific values.
const metadataKeys=new Set(['galacticLibraryProviderProfileHints','galacticLibraryProviderScans','galacticLibraryProviderChecks','galacticPurchaseSync','galacticLibraryReminderNotifications','galacticLibraryCompanionFeedUploads','galacticLibraryUiPreferences','galacticLibraryKindleContentsRefresh','galacticLibraryKindleContentsRefreshArchives','googleBooksApiKey','googleBooksEnrichmentJob','galacticLibraryShowEnrichmentActions','galacticLibraryAllowedExternalClientIds']);
export function validateObservationJournal(value){
 exact(value,['format','kind','before','afterDigest','afterEpoch','reset','completion','updates','removals','previous']);
 if(value.format!==2||value.kind!=='saving'||typeof value.reset!=='boolean'||value.before?.format!==2||value.before.kind!=='active'||!uuid.test(value.afterEpoch)||value.afterDigest!==null&&!hash.test(value.afterDigest))observationCorruption();
 validateActiveEnvelope({...value.before,packet:null},null,value.before.baseDigest);
 if(value.completion)validateActiveEnvelope({...value.before,packet:null,completions:[value.completion]},null,value.before.baseDigest);
 if(!value.updates||typeof value.updates!=='object'||Array.isArray(value.updates)||!value.previous||typeof value.previous!=='object'||Array.isArray(value.previous)||!Array.isArray(value.removals))observationCorruption();
 const keys=[...Object.keys(value.updates),...value.removals];
 if(new Set(keys).size!==keys.length||keys.some(k=>!metadataKeys.has(k)||[OBSERVATION_KEY,OBSERVATION_HEAD_KEY].includes(k))||!equalDatabaseData([...keys].sort(),Object.keys(value.previous).sort()))observationCorruption();
 for(const v of Object.values(value.previous)){if(!v||typeof v!=='object'||typeof v.present!=='boolean'||Object.keys(v).some(k=>!['present','value'].includes(k))||v.present!==Object.hasOwn(v,'value'))observationCorruption();}
 return value;
}
export function retainedCompletions(completions,db){return completions.filter(c=>db.providerProfiles[c.profileId]?.state.syncHealth?.attemptRef===c.attemptRef&&db.providers[c.provider]?.activeProfileId===c.profileId);}
