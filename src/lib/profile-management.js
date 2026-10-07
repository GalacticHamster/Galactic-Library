import {PROVIDERS} from './constants.js';

export function profileCounts(records){
  const counts={recordCount:records.length,itemCount:0,addOnCount:0,bookCount:0,audiobookCount:0,softwareCount:0,movieCount:0,tvCount:0};
  const fields={game:'itemCount','game-addon':'addOnCount',book:'bookCount',audiobook:'audiobookCount',software:'softwareCount',movie:'movieCount',tv:'tvCount'};
  for(const item of records)counts[fields[item.mediaType]]++;
  const games=new Set(records.filter(i=>i.mediaType==='game').map(i=>`${i.profileId}:${i.providerItemId}`));
  counts.linkedAddOnCount=records.filter(i=>i.mediaType==='game-addon'&&games.has(`${i.profileId}:${i.metadata.parentProviderItemId}`)).length;
  return counts;
}
export function enumerateProviderProfiles(database,provider=null){
  if(provider!==null&&!PROVIDERS.includes(provider))throw Error('Invalid provider.');
  return Object.values(database.providerProfiles).filter(p=>provider===null||p.provider===provider).map(p=>{
    const records=Object.values(database.providerItems).filter(i=>i.profileId===p.profileId),state=p.state;
    return {profileId:p.profileId,provider:p.provider,nickname:p.nickname,provenance:p.provenance,
      active:database.providers[p.provider]?.activeProfileId===p.profileId,lastSelectedAt:p.lastSelectedAt,
      ...profileCounts(records),historicalCount:Object.values(database.providerHistory).filter(h=>h.item.profileId===p.profileId).length,
      lastSuccessfulUpdate:state.lastSync??state.quickSyncAt??state.fullSyncAt??null,
      lastCompleteScan:state.fullSyncAt??null,baselineComplete:Boolean(state.fullSyncAt&&state.snapshotValidation?.complete),
      snapshotValidation:state.snapshotValidation??null,syncHealth:state.syncHealth??null};
  }).sort((a,b)=>a.provider.localeCompare(b.provider)||a.nickname.localeCompare(b.nickname)||a.profileId.localeCompare(b.profileId));
}
// Display counts reflect all remembered profiles. The active pointer still
// controls acquisition and is never inferred from these aggregates.
export function combinedProviderStates(database){
  const providers=new Set([...Object.keys(database.providers??{}),...Object.values(database.providerProfiles??{}).map(p=>p.provider)]);
  return Object.fromEntries([...providers].map(provider=>[provider,{...database.providers?.[provider],connected:Boolean(database.providers?.[provider]?.connected||Object.values(database.providerProfiles??{}).some(p=>p.provider===provider&&p.state.connected)),...profileCounts(Object.values(database.providerItems).filter(i=>i.provider===provider))}]));
}

export function profileDependencies(database,profileId){
  const profile=database.providerProfiles[profileId];if(!profile)throw Error('Unknown provider profile.');
  const current=Object.values(database.providerItems).filter(i=>i.profileId===profileId),history=Object.values(database.providerHistory).filter(h=>h.item.profileId===profileId);
  const records=[...current,...history.map(h=>h.item)],ids=new Set(records.map(i=>i.id)),refs=new Set(records.map(i=>i.recordRef));
  const ownsId=id=>ids.has(id)||Boolean(profile.keySpace&&id.startsWith(`${profile.provider}@${profile.keySpace}:`));
  const feeds=Object.entries(database.companionFeeds).filter(([,f])=>f.profileId===profileId);
  for(const [,feed]of feeds)for(const e of feed.entries)refs.add(e.localRef);
  const ownRefs=entry=>entry.recordRefs?.some(ref=>refs.has(ref));
  const selected=(name,predicate)=>Object.fromEntries(Object.entries(database[name]??{}).filter(([id,e])=>predicate(e,id)));
  const dependents={
    contentReviews:selected('contentReviews',(_,id)=>ownsId(id)),
    manualMatchDecisions:selected('manualMatchDecisions',d=>d.itemIds.some(ownsId)),
    editionSeparations:selected('editionSeparations',s=>ownsId(s.itemId)||s.otherItemIds.some(ownsId)),
    enrichmentHistory:selected('enrichmentHistory',e=>refs.has(e.recordRef)),
    enrichmentReviews:selected('enrichmentReviews',ownRefs),
    titleAliases:selected('titleAliases',(_,id)=>refs.has(id)),
    ownershipReviews:selected('ownershipReviews',(_,id)=>refs.has(id)),
    ownershipProposals:selected('ownershipProposals',e=>e.profileId===profileId||ownRefs(e)),
    readingStates:selected('readingStates',(_,id)=>refs.has(id)),
    readingOrders:selected('readingOrders',ownRefs),
    reminderReviews:selected('reminderReviews',(_,id)=>refs.has(id.split(':')[0])),
    kindleContentsObservations:selected('kindleContentsObservations',(_,id)=>refs.has(id)),
    companionFeeds:Object.fromEntries(feeds)
  };
  const canonicalItems=selected('canonicalItems',c=>c.providerItemIds.some(ownsId));
  const summary={profileId,provider:profile.provider,nickname:profile.nickname,active:database.providers[profile.provider]?.activeProfileId===profileId,
    records:current.length,historicalRecords:history.length,
    dependencies:Object.fromEntries(Object.entries(dependents).map(([key,v])=>[key,Object.keys(v).length])),
    canonicalGroups:Object.keys(canonicalItems).length,
    crossProfileRelationships:Object.values(dependents.manualMatchDecisions).filter(d=>d.itemIds.some(id=>!ownsId(id))).length,
    unresolvedLegacyStateRetained:Object.fromEntries(Object.entries(database.unresolvedProfileState).map(([key,v])=>[key,Object.keys(v).length])),
    activeAfterRemoval:database.providers[profile.provider]?.activeProfileId===profileId?null:database.providers[profile.provider]?.activeProfileId??null};
  return {profile,current,history,ids,refs,ownsId,dependents,canonicalItems,summary};
}
export function removeProfileData(database,plan){
  const {profile,refs,ownsId}=plan,id=profile.profileId;
  for(const [key,item]of Object.entries(database.providerItems))if(item.profileId===id)delete database.providerItems[key];
  for(const [ref,h]of Object.entries(database.providerHistory))if(h.item.profileId===id)delete database.providerHistory[ref];
  for(const key of ['titleAliases','ownershipReviews','readingStates','kindleContentsObservations'])for(const ref of refs)if(database[key])delete database[key][ref];
  for(const key of Object.keys(database.contentReviews))if(ownsId(key))delete database.contentReviews[key];
  for(const [key,d]of Object.entries(database.manualMatchDecisions))if(d.itemIds.some(ownsId))delete database.manualMatchDecisions[key];
  for(const [key,s]of Object.entries(database.editionSeparations)){
    if(ownsId(s.itemId)){delete database.editionSeparations[key];continue;}
    s.otherItemIds=s.otherItemIds.filter(other=>!ownsId(other));if(!s.otherItemIds.length)delete database.editionSeparations[key];
  }
  for(const [key,e]of Object.entries(database.enrichmentHistory))if(refs.has(e.recordRef))delete database.enrichmentHistory[key];
  for(const [key,e]of Object.entries(database.enrichmentReviews)){e.recordRefs=e.recordRefs.filter(ref=>!refs.has(ref));if(!e.recordRefs.length)delete database.enrichmentReviews[key];}
  for(const e of Object.values(database.readingOrders)){const next=e.recordRefs.filter(ref=>!refs.has(ref));if(next.length!==e.recordRefs.length){e.recordRefs=next;e.revisionRef=crypto.randomUUID();e.updatedAt=new Date().toISOString();}}
  for(const [key,e]of Object.entries(database.ownershipProposals)){
    if(e.profileId===id){delete database.ownershipProposals[key];continue;}e.recordRefs=e.recordRefs.filter(ref=>!refs.has(ref));
  }
  for(const key of Object.keys(database.reminderReviews))if(refs.has(key.split(':')[0]))delete database.reminderReviews[key];
  for(const [key,f]of Object.entries(database.companionFeeds))if(f.profileId===id)delete database.companionFeeds[key];
  if(database.providers[profile.provider]?.activeProfileId===id)delete database.providers[profile.provider];
  delete database.providerProfiles[id];
}
