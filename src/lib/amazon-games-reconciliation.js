import '../providers/amazon-games-identity.js';
import {normalizeProviderItem,providerItemKey} from './models.js';

const identity=globalThis.GalacticAmazonGamesIdentity;
const stable=value=>JSON.stringify(value,(_,entry)=>entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b))):entry);
function evidence(record){
  const {claimKey,claimProductKey,claimBasis,observationIds,collectedOn,...metadata}=record.metadata??{};
  return stable([record.title,record.mediaType,record.ownership,record.platform,metadata,record.acquiredAt]);
}
function references(database){
  const tokens=new Set();
  function walk(value){if(typeof value==='string')tokens.add(value);else if(value&&typeof value==='object')for(const [key,entry]of Object.entries(value)){tokens.add(key);walk(entry);}}
  for(const [key,value]of Object.entries(database))if(!['providerItems','providerHistory','canonicalItems','providers','providerProfiles','legacyProfileNamespaces'].includes(key))walk(value);
  return tokens;
}
// Operates only on a caller-owned disposable/transactional database. Originals
// suppressed as repeated observations remain in the existing history store.
export async function reconcileAmazonGames(database,profileId,incoming=[]){
  const profile=database.providerProfiles[profileId];
  if(!profile||profile.provider!=='amazon-games')throw Error('Invalid Amazon Games account.');
  const rows=Object.values(database.providerItems).filter(row=>row.provider==='amazon-games'&&row.profileId===profileId);
  const report={before:rows.length,after:0,evidenceGroups:0,repeatedObservations:0,archivedObservations:0,ambiguousGroups:0,protectedRecords:0,rekeyedRecords:0,catalogLinksUpdated:0,canonicalIdentitiesChanged:0};
  const tokens=references(database),canonical=new Map(),preferredReferences=new Set();
  for(const entry of Object.values(database.canonicalItems)){for(const id of entry.providerItemIds)canonical.set(id,entry.id);for(const ref of Object.keys(entry.displayTitlePreferences??{}))preferredReferences.add(ref);}
  const groups=new Map();
  for(const row of rows){const identified=await identity.identify(row);const key=identified.providerItemId,group=groups.get(key)??[];group.push({row,identified});groups.set(key,group);}
  report.evidenceGroups=groups.size;
  const incomingByProduct=new Map();
  for(const value of incoming){const item=await identity.identify(value),list=incomingByProduct.get(item.metadata.claimProductKey)??[];if(!list.some(row=>row.providerItemId===item.providerItemId))list.push(item);incomingByProduct.set(item.metadata.claimProductKey,list);}
  for(const group of groups.values()){
    const same=group.every(entry=>evidence(entry.row)===evidence(group[0].row));
    const protectedById=group.some(({row})=>tokens.has(row.id));
    const preferred=group.filter(({row})=>tokens.has(row.recordRef)||preferredReferences.has(row.recordRef));
    const sameCanonical=new Set(group.map(({row})=>canonical.get(row.id))).size===1;
    if(!same||protectedById||preferred.length>1||!sameCanonical){report.protectedRecords+=group.length;report.ambiguousGroups++;continue;}
    const chosen=preferred[0]??group.slice().sort((a,b)=>a.row.recordRef.localeCompare(b.row.recordRef))[0];
    let identified=chosen.identified;
    if(!identified.acquiredAt){
      const candidates=incomingByProduct.get(identified.metadata.claimProductKey)??[];
      // Missing legacy dates can only be associated when the whole incoming
      // observation set offers exactly one compatible claim for this product.
      if(candidates.length===1&&candidates[0].acquiredAt)identified={...identified,providerItemId:candidates[0].providerItemId,acquiredAt:candidates[0].acquiredAt,
        metadata:{...identified.metadata,claimKey:candidates[0].metadata.claimKey,claimBasis:'dated-evidence',collectedOn:candidates[0].metadata.collectedOn}};
      else report.ambiguousGroups++;
    }
    const newId=providerItemKey('amazon-games',identified.providerItemId,profile.keySpace);
    if(database.providerItems[newId]&&!group.some(({row})=>row.id===newId)){report.ambiguousGroups++;report.protectedRecords+=group.length;continue;}
    const originals=[...new Set(group.flatMap(({row})=>[...(row.metadata.observationIds??[]),...(!row.providerItemId.startsWith('claim-v1-')?[row.providerItemId]:[])]))].sort();
    const survivor=normalizeProviderItem({...identified,recordRef:chosen.row.recordRef,metadata:{...identified.metadata,...(originals.length?{observationIds:originals}:{})}},chosen.row.updatedAt,{profileKeySpace:profile.keySpace});
    const oldIds=new Set(group.map(({row})=>row.id));
    for(const {row}of group){delete database.providerItems[row.id];if(row.recordRef!==survivor.recordRef){
      database.providerHistory[row.recordRef]={item:row,profileLabel:profile.nickname,reason:'duplicate-observation',duplicateOf:survivor.recordRef,missingSince:row.observedAt??row.updatedAt};report.archivedObservations++;
    }}
    database.providerItems[newId]=survivor;
    for(const entry of Object.values(database.canonicalItems))if(entry.providerItemIds.some(id=>oldIds.has(id)))entry.providerItemIds=[...new Set(entry.providerItemIds.map(id=>oldIds.has(id)?newId:id))];
    report.catalogLinksUpdated+=group.filter(({row})=>row.id!==newId&&canonical.has(row.id)).length;
    report.repeatedObservations+=group.length-1;
    if(chosen.row.id!==newId)report.rekeyedRecords++;
  }
  report.after=Object.values(database.providerItems).filter(row=>row.profileId===profileId).length;
  profile.state={...profile.state,itemCount:report.after,recordCount:report.after};
  if(database.providers['amazon-games']?.activeProfileId===profileId)database.providers['amazon-games']={...database.providers['amazon-games'],itemCount:report.after,recordCount:report.after};
  return report;
}

export async function prepareAmazonGamesImport(database,profileId,values){
  const profile=database.providerProfiles[profileId];if(!profile||profile.provider!=='amazon-games')throw Error('Invalid Amazon Games account.');
  if(!values.length)return []; // A status-only check is not an observation or repair.
  // Validate original inputs before deriving keys; a fingerprint must not turn
  // a malformed source ID, timestamp or metadata value into an accepted row.
  const validated=values.map(value=>normalizeProviderItem({...value,provider:'amazon-games',profileId},undefined,{allowEnrichment:false,profileKeySpace:profile.keySpace}));
  const incoming=await identity.consolidate(validated);
  await reconcileAmazonGames(database,profileId,incoming);
  const protectedTokens=references(database),existing=Object.values(database.providerItems).filter(row=>row.profileId===profileId);
  if(incoming.some(item=>!existing.some(row=>row.providerItemId===item.providerItemId)&&existing.some(row=>(protectedTokens.has(row.id)||protectedTokens.has(row.recordRef))&&identity.potentiallySameClaim(row,item)&&row.metadata.claimProductKey!==item.metadata.claimProductKey)))throw Error('Amazon Games could not safely associate sparse evidence with a saved correction or edition decision. No changes were saved. Review those decisions before retrying.');
  const protectedProducts=new Set();
  for(const row of Object.values(database.providerItems))if(row.profileId===profileId&&!row.providerItemId.startsWith('claim-v1-'))protectedProducts.add((await identity.identify(row)).metadata.claimProductKey);
  if(incoming.some(item=>protectedProducts.has(item.metadata.claimProductKey)&&!Object.values(database.providerItems).some(row=>row.profileId===profileId&&row.providerItemId===item.providerItemId)))throw Error('Amazon Games could not safely associate an entry with saved corrections or edition decisions. No changes were saved. Review those decisions before retrying.');
  const products=new Map();
  for(const row of Object.values(database.providerItems))if(row.profileId===profileId&&row.metadata.claimProductKey){const list=products.get(row.metadata.claimProductKey)??[];list.push(row);products.set(row.metadata.claimProductKey,list);}
  return incoming.map(item=>{
    const matches=products.get(item.metadata.claimProductKey)??[];
    if(!item.acquiredAt&&matches.length===1&&matches[0].acquiredAt){const previous=matches[0];return {...item,providerItemId:previous.providerItemId,acquiredAt:previous.acquiredAt,metadata:{...item.metadata,collectedOn:previous.metadata.collectedOn,claimKey:previous.metadata.claimKey,claimBasis:previous.metadata.claimBasis}};}
    return item;
  });
}
