import '../providers/kobo-ownership.js';

export function providerOwnership(provider, ownership, metadata) {
  if(provider==='kobo')return globalThis.GalacticKoboOwnership.fromMetadata(ownership,metadata);
  if(provider==='humble'&&metadata?.entitlement==='third-party-key'&&['expired','unavailable'].includes(metadata.keyStatus))return 'unknown';
  return ownership;
}

export function effectiveOwnershipRecord(item,database={},now=Date.now()){
  if(!item)return item;
  const review=database.ownershipReviews?.[item.recordRef];
  if(!review)return item;
  const expired=review.expiresAt&&Date.parse(review.expiresAt)<=now;
  const negativeKey=item.metadata?.entitlement==='third-party-key'&&['expired','unavailable'].includes(item.metadata.keyStatus);
  const ownership=expired||negativeKey&&['owned','claimed'].includes(review.ownership)?'unknown':review.ownership;
  return {...item,ownership,manualOwnershipEvidence:{source:review.source,confirmedAt:review.confirmedAt,evidenceDate:review.evidenceDate,expiresAt:review.expiresAt}};
}

// A reseller purchase is evidence of the purchase, never of activation at its
// destination. Keep this projection small enough to share with companions.
export function entitlementEvidence(item) {
  if(!['humble','fanatical'].includes(item.provider))return {};
  const key=item.metadata?.entitlement==='third-party-key'||['game','software'].includes(item.mediaType);
  return {purchaseEvidence:'confirmed',activationStatus:key?'unknown':'not-applicable',
    ...(key?{keyStatus:item.metadata?.keyStatus||'unknown',expiresAt:item.metadata?.expiresAt||null}: {})};
}
