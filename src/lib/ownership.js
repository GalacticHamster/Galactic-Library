import '../providers/kobo-ownership.js';
import '../providers/kindle-ownership.js';
import {PROVIDERS,normalizeOwnership} from './constants.js';

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
  ownership=normalizeOwnership(ownership);
  if(['returned','revoked','expired'].includes(ownership))return ownership;
  if(provider==='steam'&&metadata?.ownershipBasis==='master-subscription')return 'subscription';
  if(provider==='steam'&&metadata?.ownershipBasis==='auto-grant')return 'unknown';
  if(provider==='kindle'){
    const access=globalThis.GalacticKindleOwnership.classify(metadata??{});
    if(['returned-access','revoked-access','expired-access','inactive-access','conflicting-access-evidence'].includes(access.basis))return access.ownership;
  }
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
  if(item.ownershipInference){
    const {ownershipInference,...original}=item;
    item={...original,ownership:ownershipInference.observedOwnership};
  }
  if(normalizeOwnership(item.ownership)!==item.ownership)item={...item,ownership:normalizeOwnership(item.ownership)};
  const review=database.ownershipReviews?.[item.recordRef];
  if(review?.source==='user-correction')return reviewedOwnershipRecord(item,review,now);
  // Explicit loss of access is not uncertainty to assume away. Keep the raw
  // observation intact; a saved user return also survives subsequent imports.
  const terminal=state=>['returned','revoked','expired'].includes(state);
  if(terminal(review?.ownership))return {...item,ownership:review.ownership,manualOwnershipEvidence:{source:review.source,confirmedAt:review.confirmedAt,evidenceDate:review.evidenceDate,expiresAt:review.expiresAt}};
  const observed=providerOwnership(item.provider,item.ownership,item.metadata);
  if(terminal(item.ownership)||terminal(observed))return {...item,ownership:terminal(observed)?observed:item.ownership};
  if(item.provider==='kindle'&&observed==='unknown'&&observed!==item.ownership)item={...item,ownership:observed};
  if(item.provider==='steam'&&observed!==item.ownership)item={...item,ownership:observed};
  const policy=database.ownershipPolicy;
  if(!ignoreOverride&&(policy?.allOwned===true||policy?.providers?.[item.provider]===true)){
    return {...item,ownership:'owned',ownershipOverride:{observedOwnership:item.ownership,
      scope:policy.allOwned?'all':'provider'}};
  }
  const key=item.metadata?.entitlement==='third-party-key'||item.provider==='fanatical'&&['game','software'].includes(item.mediaType);
  const expiredKey=key&&item.metadata?.expiresAt&&Date.parse(item.metadata.expiresAt)<=now;
  if(!review){
    const profile=database.providerProfiles?.[item.profileId];
    if(!ignoreOverride&&item.provider==='kobo'&&profile?.provider==='kobo'&&profile.assumeUnconfirmedOwned===true&&item.ownership==='unknown'
      &&[undefined,'','library-presence-only','kobo-plus-availability'].includes(item.metadata?.ownershipBasis)){
      return {...item,ownership:'owned',ownershipOverride:{observedOwnership:item.ownership,scope:'profile-unconfirmed'}};
    }
    if(expiredKey)return {...item,ownership:'unknown'};
    const inferred=globalThis.GalacticKindleOwnership.infer(item);
    return inferred?{...item,ownership:inferred.ownership,ownershipInference:{observedOwnership:item.ownership,basis:inferred.basis}}:item;
  }
  return reviewedOwnershipRecord(item,review,now);
}

function reviewedOwnershipRecord(item,review,now){
  const expired=review.expiresAt&&Date.parse(review.expiresAt)<=now;
  const key=item.metadata?.entitlement==='third-party-key'||item.provider==='fanatical'&&['game','software'].includes(item.mediaType);
  const negativeKey=key&&item.metadata?.expiresAt&&Date.parse(item.metadata.expiresAt)<=now||item.metadata?.entitlement==='third-party-key'&&['expired','unavailable'].includes(item.metadata.keyStatus);
  const ownership=expired||negativeKey&&normalizeOwnership(review.ownership)==='owned'?'unknown':normalizeOwnership(review.ownership);
  return {...item,ownership,manualOwnershipEvidence:{source:review.source,confirmedAt:review.confirmedAt,evidenceDate:review.evidenceDate,expiresAt:review.expiresAt}};
}

export function coverageAccessExclusion(item,database={},now=Date.now()){
  const effective=effectiveOwnershipRecord(item,database,now);
  if(['owned','claimed'].includes(effective.ownership))return null;
  const unavailable={returned:'This book was returned or refunded and does not establish current ownership.',revoked:'Access to this book was revoked.',expired:'Access to this book has expired.'};
  if(unavailable[effective.ownership])return {ownership:effective.ownership,reason:effective.ownership,explanation:unavailable[effective.ownership]};
  const review=database.ownershipReviews?.[item.recordRef];
  if(review?.expiresAt&&Date.parse(review.expiresAt)<=now)return {ownership:effective.ownership,reason:'expired',explanation:'The saved temporary access has expired.'};
  const key=item.metadata?.entitlement==='third-party-key'||item.provider==='fanatical'&&['game','software'].includes(item.mediaType);
  if(key&&(item.metadata?.keyStatus==='expired'||item.metadata?.expiresAt&&Date.parse(item.metadata.expiresAt)<=now))return {ownership:effective.ownership,reason:'expired',explanation:'The saved key access has expired.'};
  if(review?.ownership==='unknown')return {ownership:effective.ownership,reason:'user-unconfirmed',explanation:'Your saved ownership correction leaves this book unconfirmed.'};
  if(item.provider==='kindle'){
    if(/^(?:expired|access expired|loan expired)$/iu.test(item.metadata?.itemStatus??''))return {ownership:effective.ownership,reason:'expired',explanation:'The provider reports expired access.'};
    const access=globalThis.GalacticKindleOwnership.classify(item.metadata??{});
    if(access.basis==='expired-access')return {ownership:effective.ownership,reason:'expired',explanation:'The provider reports expired access.'};
    if(['inactive-access','conflicting-access-evidence'].includes(access.basis))return {ownership:effective.ownership,reason:access.basis,explanation:'The saved provider access is inactive or contains conflicting ownership information.'};
    if(String(item.metadata?.originType).toLowerCase()==='sample')return {ownership:effective.ownership,reason:'sample',explanation:'A sample does not establish ownership of the complete book.'};
  }
  const captions={subscription:'Subscription access does not establish permanent ownership.',borrowed:'This book is borrowed.',rental:'This book is rented.',unknown:'Permanent ownership is not established by the saved provider evidence.'};
  return {ownership:effective.ownership,reason:effective.ownership,explanation:captions[effective.ownership]??captions.unknown};
}

// A reseller purchase is evidence of the purchase, never of activation at its
// destination. Keep this projection small enough to share with companions.
export function entitlementEvidence(item) {
  if(!['humble','fanatical'].includes(item.provider))return {};
  const key=item.metadata?.entitlement==='third-party-key'||['game','software'].includes(item.mediaType);
  return {purchaseEvidence:'confirmed',activationStatus:key?'unknown':'not-applicable',
    ...(key?{keyStatus:item.metadata?.keyStatus||'unknown',expiresAt:item.metadata?.expiresAt||null}: {})};
}

// A narrow migration proof: nothing except legacy permanent-claim states and
// their acquisition provenance may differ. The writer uses this to retain and
// validate observations against their original base before its atomic save.
export function normalizePermanentClaimsDatabase(value) {
  const result=structuredClone(value);
  const record=item=>{if(item && normalizeOwnership(item.ownership)!==item.ownership){
    item.ownership=normalizeOwnership(item.ownership);
    item.metadata={...item.metadata,acquisitionMethod:'permanent-claim'};
  }};
  for(const item of Object.values(result.providerItems??{}))record(item);
  for(const entry of Object.values(result.providerHistory??{}))record(entry.item);
  for(const review of Object.values(result.ownershipReviews??{}))review.ownership=normalizeOwnership(review.ownership);
  return result;
}
