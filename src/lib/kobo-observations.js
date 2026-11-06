// Kobo quick scans are sparse observations of the same stable library UUID.
// Preserve richer saved evidence; never rewrite a title from its spelling alone.
const compact=value=>String(value??'').replace(/\s+/gu,' ').trim().toLocaleLowerCase();
const nonempty=value=>Array.isArray(value)?value.length>0:value!==undefined&&value!==null&&value!=='';
const reliable=new Set(['title-attribute','title-element']);
const quality={'title-attribute':3,'title-element':2,'cover-alt':1,'action-label':0};
// A missing link is not evidence that a previously observed section is empty.
export function koboRequiredScopes(database,profileId){
  const names=new Set(['my-books','archive','audiobooks','audiobooks-archive']);
  return [...new Set([...(database.providerProfiles[profileId]?.state.syncState?.pendingKoboScopes??[]),...Object.values(database.providerItems).filter(item=>item.provider==='kobo'&&item.profileId===profileId).map(item=>item.metadata.librarySection)])].filter(id=>names.has(id));
}
export function preserveKoboObservation(incoming,previous){
  if(!previous||incoming.provider!=='kobo'||previous.provider!=='kobo'||incoming.id!==previous.id||incoming.mediaType!==previous.mediaType)return incoming;
  const metadata={...previous.metadata,...incoming.metadata};
  for(const [key,value]of Object.entries(previous.metadata))if(nonempty(value)&&!nonempty(incoming.metadata[key]))metadata[key]=value;
  let title=incoming.title;
  const evidence=incoming.metadata.titleEvidence;
  const savedReliable=!previous.metadata.titleEvidence||reliable.has(previous.metadata.titleEvidence);
  // Legacy clean titles predate quality tags. Action/cover fallbacks must not
  // replace them. Exact prefix corroboration protects untagged observations;
  // it does not clean unrelated saved titles.
  if(compact(title)===compact(previous.title)||savedReliable&&evidence&&!reliable.has(evidence)
    ||!evidence&&/^read\s+now\s*:/iu.test(title)&&compact(title.replace(/^read\s+now\s*:\s*/iu,''))===compact(previous.title)){
    title=previous.title;
    if(previous.metadata.titleEvidence&&(!evidence||quality[previous.metadata.titleEvidence]>=quality[evidence]))metadata.titleEvidence=previous.metadata.titleEvidence;
    else if(evidence&&!reliable.has(evidence))delete metadata.titleEvidence;
  }
  let ownership=incoming.ownership;
  if(['library-presence-only','kobo-plus-availability'].includes(incoming.metadata.ownershipBasis)
    &&previous.metadata.ownershipBasis&&!['library-presence-only','kobo-plus-availability'].includes(previous.metadata.ownershipBasis)){
    ownership=previous.ownership;metadata.ownershipBasis=previous.metadata.ownershipBasis;
  }
  return {...incoming,title,...(title===previous.title?{normalizedTitle:previous.normalizedTitle,baseTitle:previous.baseTitle,edition:previous.edition}:{}),ownership,acquiredAt:incoming.acquiredAt??previous.acquiredAt,metadata};
}
const canonical=value=>Array.isArray(value)?value.map(canonical)
  :value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))
  :value;
export function koboObservationChanged(previous,incoming){
  if(!previous)return false;
  const content=item=>{
    const metadata={...item.metadata};
    for(const key of ['authors','genres','series','isbn','isbns'])if(Array.isArray(metadata[key]))metadata[key]=[...new Set(metadata[key].map(compact))].sort();
    return {title:compact(item.title),mediaType:item.mediaType,ownership:item.ownership,acquiredAt:item.acquiredAt,platform:item.platform,metadata};
  };
  return JSON.stringify(canonical(content(previous)))!==JSON.stringify(canonical(content(incoming)));
}
