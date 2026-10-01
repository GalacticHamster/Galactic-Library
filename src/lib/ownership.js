import '../providers/kobo-ownership.js';

export function providerOwnership(provider, ownership, metadata) {
  if(provider==='kobo')return globalThis.GalacticKoboOwnership.fromMetadata(ownership,metadata);
  if(provider==='humble'&&metadata?.entitlement==='third-party-key'&&['expired','unavailable'].includes(metadata.keyStatus))return 'unknown';
  return ownership;
}

// A reseller purchase is evidence of the purchase, never of activation at its
// destination. Keep this projection small enough to share with companions.
export function entitlementEvidence(item) {
  if(!['humble','fanatical'].includes(item.provider))return {};
  const key=item.metadata?.entitlement==='third-party-key'||item.mediaType==='game';
  return {purchaseEvidence:'confirmed',activationStatus:key?'unknown':'not-applicable',
    ...(key?{keyStatus:item.metadata?.keyStatus||'unknown',expiresAt:item.metadata?.expiresAt||null}: {})};
}
