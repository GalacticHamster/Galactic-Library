import {strictDatabaseSerialization} from './validation-certificate.js';
import {validateProviderStates} from './provider-state.js';
import {equalDatabaseData} from './data-equality.js';
import {PROVIDERS} from './constants.js';
import {providerScanMode} from './provider-scan-mode.js';

// Status-only scans, never item observations or ownership.
export const PROVIDER_CHECKS_KEY='galacticLibraryProviderChecks';
const providers=PROVIDERS;
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
  if(!providers.includes(provider))throw Error('Unsupported provider check.');
  const patch=Object.fromEntries(fields.filter(key=>Object.hasOwn(state,key)).map(key=>[key,state[key]]));
  const validated=validateProviderStates({[provider]:patch})[provider];
  const health=validated.syncHealth,success=health?.status==='succeeded';
  if(!health||!['succeeded','partial','failed','cancelled'].includes(health.status)||!health.attemptRef||!health.finishedAt
    ||Object.entries(health.differences??{}).some(([key,value])=>!['observed','unchanged'].includes(key)&&value!==0)
    ||success&&(validated.syncMode!=='incremental'||!validated.lastSync||validated.lastError!==null||health.mode!=='incremental'||health.failedRequestCount
      ||health.coverageLimit&&!(provider==='fanatical'&&health.coverageLimit==='array-only-index-without-total'))
    ||!success&&Object.keys(patch).some(key=>key!=='syncHealth'))throw Error('Invalid provider status check.');
  return validated;
}
export function providerCheckBaseline(provider,entry){
  const raw=entry?.baseline??(entry?.patch?.syncHealth?.status==='succeeded'?entry.patch:null);
  if(!raw)return null;
  try{const patch=providerCheckPatch(provider,raw);return patch.syncHealth.status==='succeeded'&&equalDatabaseData(raw,patch)?patch:null;}catch{return null;}
}
export function applyProviderChecks(database,value,digest){
  let result=database;
  for(const [provider,entry]of Object.entries(validProviderChecks(value,digest))){
    try{
      if(!entry||Object.keys(entry).some(key=>!['profileId','patch','baseline'].includes(key)))continue;
      const profile=database.providerProfiles[entry.profileId];
      if(profile?.provider!==provider||database.providers[provider]?.activeProfileId!==profile.profileId||!profile.state.connected
        ||(provider==='fanatical'?providerScanMode(provider,profile.state,'incremental').forceFull:!profile.state.fullSyncAt))continue;
      const patch=providerCheckPatch(provider,entry.patch);
      if(!equalDatabaseData(patch,entry.patch))continue;
      const baseline=providerCheckBaseline(provider,entry);
      if(entry.baseline&&!baseline)continue;
      const effective={...(baseline??{}),...patch};
      if(result===database)result={...database,providers:{...database.providers},providerProfiles:{...database.providerProfiles}};
      result.providerProfiles[profile.profileId]={...profile,state:{...profile.state,...effective}};
      result.providers[provider]={...database.providers[provider],...effective};
    }catch{/* Invalid/stale receipts never certify a successful check. */}
  }
  return result;
}
