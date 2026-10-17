import {equalDatabaseData} from './data-equality.js';

// Compare the actual existing importer's prepared result. This is a proof of a
// closed delta, not another normalizer, acquisition predicate or UI counter.
export function observationCompletionEntry(before,after,provider,scan,returnedIds){
 const profile=before.providerProfiles[scan.profileId],next=after.providerProfiles[scan.profileId];
 if(Object.keys(before.providerProfiles).length!==Object.keys(after.providerProfiles).length||Object.keys(before.providers).length!==Object.keys(after.providers).length)return null;
 if(!profile?.state.connected||!profile.state.fullSyncAt||!next||before.providers[provider].activeProfileId!==profile.profileId||after.providers[provider].activeProfileId!==profile.profileId)return null;
 if(!equalDatabaseData(before.providerHistory,after.providerHistory)||Object.keys(before.providerItems).length!==Object.keys(after.providerItems).length)return null;
 const rows=[],members=Object.values(before.providerItems).filter(i=>i.profileId===profile.profileId),byRef=new Map(members.map(i=>[i.recordRef,i]));
 for(const [id,old]of Object.entries(before.providerItems)){
  const item=after.providerItems[id];if(!item)return null;
  if(old.profileId!==profile.profileId||!returnedIds.has(old.providerItemId)){if(!equalDatabaseData(old,item))return null;continue;}
  const oldOrigins=old.metadata.purchaseOrigins??[],newOrigins=item.metadata.purchaseOrigins??[];
  if(oldOrigins.length!==newOrigins.length)return null;
  const origins=[];for(let n=0;n<oldOrigins.length;n++){
   if(!equalDatabaseData({...oldOrigins[n],observedAt:newOrigins[n].observedAt},newOrigins[n]))return null;
   if(oldOrigins[n].observedAt!==newOrigins[n].observedAt)origins.push({occurrenceRef:newOrigins[n].occurrenceRef,observedAt:newOrigins[n].observedAt});
  }
  const permitted={...old,observedAt:item.observedAt,updatedAt:item.updatedAt,...(Object.hasOwn(old.metadata,'purchaseOrigins')?{metadata:{...old.metadata,purchaseOrigins:newOrigins}}:{})};
  if(!equalDatabaseData(permitted,item))return null;
  rows.push({recordRef:item.recordRef,observedAt:item.observedAt,updatedAt:item.updatedAt,origins});
 }
 for(const [id,p]of Object.entries(before.providerProfiles))if(!equalDatabaseData(id===profile.profileId?{...p,state:next.state}:p,after.providerProfiles[id]))return null;
 for(const [p,state]of Object.entries(before.providers))if(p!==provider&&!equalDatabaseData(state,after.providers[p]))return null;
 for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!['providerItems','providers','providerProfiles'].includes(key)&&!equalDatabaseData(before[key],after[key]))return null;
 const complete=rows.length===members.length;
 const uniform=complete&&provider!=='fanatical'&&!(provider==='kobo'&&scan.mode==='incremental')&&rows.length&&rows.every(r=>r.observedAt===rows[0].observedAt&&r.updatedAt===(provider==='kobo'?byRef.get(r.recordRef).updatedAt:r.observedAt));
 return {provider,profileId:profile.profileId,attemptRef:scan.attemptRef,mode:scan.mode,scope:complete?'complete':'subset',sourceAccountFingerprint:profile.sourceAccountFingerprint??null,supersededStatusAttempts:[],state:next.state,observations:uniform?{kind:'all',observedAt:rows[0].observedAt,updatedAt:provider==='kobo'?'preserve':'advance'}:{kind:'records',items:rows}};
}
