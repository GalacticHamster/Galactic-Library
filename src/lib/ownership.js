import '../providers/kobo-ownership.js';
import {PROVIDERS} from './constants.js';

export const defaultOwnershipPolicy = () => ({allOwned:false,providers:{}});

export function validateOwnershipPolicy(value) {
  if(value === undefined)return defaultOwnershipPolicy();
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).some(key=>!['allOwned','providers'].includes(key))
    ||value.allOwned!==undefined&&typeof value.allOwned!=='boolean')throw Error('Invalid ownership display and matching preference.');
  const providers=value.providers===undefined?{}:value.providers;
  if(!providers||typeof providers!=='object'||Array.isArray(providers)
    ||Object.entries(providers).some(([provider,enabled])=>!PROVIDERS.includes(provider)||typeof enabled!=='boolean'))throw Error('Invalid provider ownership preference.');
  return {allOwned:value.allOwned??false,providers:Object.fromEntries(Object.entries(providers).filter(([,enabled])=>enabled))};
}

export function providerOwnership(provider, ownership, metadata) {
  if(provider==='kobo')return globalThis.GalacticKoboOwnership.fromMetadata(ownership,metadata);
  if(provider==='humble'&&metadata?.entitlement==='third-party-key'&&['expired','unavailable'].includes(metadata.keyStatus))return 'unknown';
  return ownership;
}

export function effectiveOwnershipRecord(item,database={},now=Date.now(),{ignoreOverride=false}={}){
  if(!item)return item;
  // Derived records can be passed through contents matching a second time.
  // Always retain the original observation, including after the option is off.
  if(item.ownershipOverride){
    const {ownershipOverride,...original}=item;
    item={...original,ownership:ownershipOverride.observedOwnership};
  }
  const policy=database.ownershipPolicy;
  if(!ignoreOverride&&(policy?.allOwned===true||policy?.providers?.[item.provider]===true)){
    return {...item,ownership:'owned',ownershipOverride:{observedOwnership:item.ownership,
      scope:policy.allOwned?'all':'provider'}};
  }
  const review=database.ownershipReviews?.[item.recordRef];
  const key=item.metadata?.entitlement==='third-party-key'||item.provider==='fanatical'&&['game','software'].includes(item.mediaType);
  const expiredKey=key&&item.metadata?.expiresAt&&Date.parse(item.metadata.expiresAt)<=now;
  if(!review){
    const profile=database.providerProfiles?.[item.profileId];
    if(!ignoreOverride&&item.provider==='kobo'&&profile?.provider==='kobo'&&profile.assumeUnconfirmedOwned===true&&item.ownership==='unknown'
      &&[undefined,'','library-presence-only','kobo-plus-availability'].includes(item.metadata?.ownershipBasis)){
      return {...item,ownership:'owned',ownershipOverride:{observedOwnership:item.ownership,scope:'profile-unconfirmed'}};
    }
    return expiredKey?{...item,ownership:'unknown'}:item;
  }
  const expired=review.expiresAt&&Date.parse(review.expiresAt)<=now;
  const negativeKey=expiredKey||item.metadata?.entitlement==='third-party-key'&&['expired','unavailable'].includes(item.metadata.keyStatus);
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
