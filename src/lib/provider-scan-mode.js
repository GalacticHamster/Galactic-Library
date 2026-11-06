/** Acquisition choice only. Persisted database integrity is validated separately. */
export function providerScanMode(provider,state={},requestedMode='incremental') {
  if(requestedMode==='full')return {mode:'full',forceFull:false,scanReason:'requested'};
  const acquisitionAt=['fanatical','humble'].includes(provider)?state.syncState?.acquisitionCheckedAt:null;
  if(!Number.isFinite(Date.parse(state.fullSyncAt??''))&&!Number.isFinite(Date.parse(acquisitionAt??'')))return {mode:'full',forceFull:true,scanReason:state.lastSync?'baseline-unavailable':'first-import'};
  const checkpoint=provider==='humble'?'knownPurchaseIds':provider==='fanatical'?'knownOrderFingerprints':null;
  if(checkpoint){
    const ids=state.syncState?.[checkpoint];
    if(!Array.isArray(ids)||ids.length>50000||ids.some(id=>typeof id!=='string'||(provider==='humble'?!id.trim()||id.length>256:!/^[a-f0-9]{64}$/iu.test(id))))return {mode:'full',forceFull:true,scanReason:'baseline-unavailable'};
  }
  // All other incremental importers derive stopping IDs from this profile's
  // catalog; they have no independent cursor to recover. Empty is a valid baseline.
  return {mode:'incremental',forceFull:false,scanReason:'incremental'};
}
