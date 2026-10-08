/** Store identities are configuration, not permission to execute arbitrary API operations.
 * Gecko identities already exist in the release overlays; keep them independent of Chrome.
 * User additions stay in their existing storage key and are never rewritten here. */
export const COMPANION_IDENTITIES = Object.freeze({
  hb: Object.freeze({name:'Humble Comic Library',chrome:'bjjpfofmcmiipeghcbhdfjedpldmkcii',firefox:'humble-comic-library@galactichamster.com'}),
  gl: Object.freeze({name:'Galactic Library',chrome:'pdknncacndkicpogbebdfanniibnnpic',firefox:'galactic-library@galactichamster.com'}),
  fan: Object.freeze({name:'Fanatical Library',chrome:'ieoobffekgbfjfoiheejkfihneooiadb',firefox:'fanatical-library@galactichamster.com'})
});
export function companionBrowser(runtime=globalThis.chrome?.runtime){
  return runtime?.getURL?.('').startsWith('moz-extension:')||runtime?.getManifest?.().browser_specific_settings?.gecko?'firefox':'chrome';
}
export function builtinCompanions(runtime=globalThis.chrome?.runtime){
  const browser=companionBrowser(runtime);
  return ['hb','fan'].map(role=>({...COMPANION_IDENTITIES[role],role,id:COMPANION_IDENTITIES[role][browser]}));
}
export function effectiveExternalClientIds(manual=[],runtime){
  return [...new Set([...builtinCompanions(runtime).map(item=>item.id),...manual])];
}
const reads=new Set(['PING','GET_STATUS','MATCH_ITEMS','GET_REMINDERS','OPEN_REVIEW','MATCH_ITEMS_DIAGNOSTIC_CALLBACK','MATCH_ITEMS_DIAGNOSTIC_RENDER']);
const feeds=new Set(['BEGIN_ENTITLEMENT_FEED','APPEND_ENTITLEMENT_FEED','COMMIT_ENTITLEMENT_FEED','REMOVE_ENTITLEMENT_FEED']);
export function allowedCompanionOperation(id,type,runtime=globalThis.chrome?.runtime){
  // Caller must FIRST authorize the identity against the effective allowlist.
  if(reads.has(type))return true;
  if(!feeds.has(type))return false;
  // FAN has no Humble publication role. Explicit development IDs retain the
  // prior feed contract, including its active-Humble-profile confirmation.
  return id!==builtinCompanions(runtime).find(item=>item.role==='fan').id;
}
export async function checkCompanionConnection(runtime,id,timeoutMs=5000){
  let timer;
  try{
    const response=await Promise.race([runtime.sendMessage(id,{type:'PING',apiVersion:1}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No response in time.')),timeoutMs);})]);
    if(response?.ok!==true)return 'Not connected; enable or update the companion and check its Advanced pairing settings.';
    if(response.apiVersion!==1)return 'Incompatible companion API; update both extensions.';
    return 'Connected (API 1).';
  }catch{return 'Connection not verified; install or enable the companion, update both extensions, or check Advanced pairing.';}
  finally{clearTimeout(timer);}
}
