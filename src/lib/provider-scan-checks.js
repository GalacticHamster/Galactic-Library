import {strictDatabaseSerialization} from './validation-certificate.js';
import {validateProviderStates} from './provider-state.js';
import {equalDatabaseData} from './data-equality.js';

// Successful empty incremental checks, never item observations or ownership.
export const PROVIDER_CHECKS_KEY='galacticLibraryProviderChecks';
const providers=['steam','epic'];
const fields=['lastSync','quickSyncAt','lastError','source','syncMode','syncHealth'];
export async function providerCheckDigest(database){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(strictDatabaseSerialization(database)));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function validProviderChecks(value,digest){
  if(!value||value.format!==1||value.baseDigest!==digest||typeof digest!=='string'||!/^[a-f0-9]{64}$/u.test(digest)
    ||Object.keys(value).some(key=>!['format','baseDigest','checks'].includes(key))
    ||!value.checks||typeof value.checks!=='object'||Array.isArray(value.checks)
    ||Object.keys(value.checks).some(key=>!providers.includes(key)))return {};
  return value.checks;
}
export function providerCheckPatch(provider,state){
  if(!providers.includes(provider))throw Error('Unsupported empty provider check.');
  const patch=Object.fromEntries(fields.filter(key=>Object.hasOwn(state,key)).map(key=>[key,state[key]]));
  const validated=validateProviderStates({[provider]:patch})[provider];
  if(validated.syncMode!=='incremental'||!validated.lastSync
    ||validated.lastError!==null||validated.syncHealth?.status!=='succeeded'||validated.syncHealth.mode!=='incremental'
    ||!validated.syncHealth.attemptRef||validated.syncHealth.failedRequestCount||validated.syncHealth.coverageLimit
    ||!validated.syncHealth.finishedAt||Object.values(validated.syncHealth.differences??{}).some(Boolean))throw Error('Invalid empty provider check.');
  return validated;
}
export function applyProviderChecks(database,value,digest){
  let result=database;
  for(const [provider,entry]of Object.entries(validProviderChecks(value,digest))){
    try{
      if(!entry||Object.keys(entry).some(key=>!['profileId','patch'].includes(key)))continue;
      const profile=database.providerProfiles[entry.profileId];
      if(profile?.provider!==provider||database.providers[provider]?.activeProfileId!==profile.profileId||!profile.state.connected||!profile.state.fullSyncAt)continue;
      const patch=providerCheckPatch(provider,entry.patch);
      if(!equalDatabaseData(patch,entry.patch))continue;
      if(result===database)result={...database,providers:{...database.providers},providerProfiles:{...database.providerProfiles}};
      result.providerProfiles[profile.profileId]={...profile,state:{...profile.state,...patch}};
      result.providers[provider]={...database.providers[provider],...patch};
    }catch{/* Invalid/stale receipts never certify a successful check. */}
  }
  return result;
}
