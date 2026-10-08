import {identityEvidence} from '../lib/identity.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {libraryBroadGenreValues} from '../lib/genre-hints.js';
import {compareTitles} from '../lib/title-sort.js';
import {providerLabel,accountLabel} from './item-presentation.js';

// Retrieval keys only: never identity or ownership evidence.
export const searchKey=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ');
const strings=value=>(Array.isArray(value)?value:[value]).filter(value=>typeof value==='string'&&value.trim());
const distinct=values=>[...new Set(values.filter(Boolean))];
const stamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):null;

export function createLibraryBrowseProjection(){
  let current,projection;
  return database=>{
    if(database===current)return projection;
    const project=record=>{
      const identity=identityEvidence(record),metadata=record.metadata??{};
      const series=['book','audiobook'].includes(record.mediaType)?identity.series:strings(metadata.series);
      const aliases=database.titleAliases?.[record.recordRef]?.titles??[];
      const identifiers=distinct([...identity.isbn,identity.asin,identity.steamAppId,...identity.workIds,record.providerItemId,...strings(metadata.isbns)]);
      const titles=distinct([record.title,metadata.enrichment?.googleBooks?.title,metadata.enrichment?.openLibrary?.approved?metadata.enrichment.openLibrary.title:'',metadata.enrichment?.localMetadata?.approved?metadata.enrichment.localMetadata.title:'']);
      const names=distinct([providerLabel(record.provider),record.provider,accountLabel(record,database),database.providerProfiles?.[record.profileId]?.nickname]);
      const genres=libraryBroadGenreValues(record);
      const fields=distinct([...titles,...aliases,...identity.authors,...identity.contributors.map(value=>value.name),...strings(metadata.narrators),...series,
        identity.unit,identity.unit?`${identity.unitType} ${identity.unit}`:'',metadata.volume?`volume ${metadata.volume}`:'',metadata.issue?`issue ${metadata.issue}`:'',identity.edition,identity.publisher,identity.language,...identifiers,...genres,...names]);
      return {record,identity,series,genres,titles:titles.map(searchKey),aliases:aliases.map(searchKey),search:fields.map(searchKey).join(' '),
        identifiers:identifiers.map(value=>searchKey(value).replace(/\s/gu,'')),added:stamp(record.acquiredAt),updated:stamp(record.updatedAt)};
    };
    const records=new Map(Object.values(database.providerItems).map(record=>[record.id,project(record)]));
    const native=new Map([...records.values()].map(value=>[[value.record.provider,value.record.profileId??'',value.record.providerItemId].join('\0'),value]));
    const addOns=[...records.values()].filter(value=>value.record.mediaType==='game-addon');
    const addOnsByParent=new Map(),linkedAddOnIds=new Set();
    for(const value of addOns){const record=value.record,parent=native.get([record.provider,record.profileId??'',record.metadata?.parentProviderItemId].join('\0'));
      if(parent?.record.mediaType!=='game')continue;const list=addOnsByParent.get(parent.record.id)??[];list.push(value);addOnsByParent.set(parent.record.id,list);linkedAddOnIds.add(record.id);
    }
    const rows=Object.values(database.canonicalItems).map(canonical=>({canonical,title:searchKey(canonical.title),records:canonical.providerItemIds.map(id=>records.get(id)).filter(Boolean)}));
    current=database;projection={database,rows,records,addOns,addOnsByParent,linkedAddOnIds};return projection;
  };
}

export function recordSearchRank(value,query,canonicalTitle=''){
  if(!query)return 0;
  const tokens=query.split(' '),titles=distinct([canonicalTitle,...value.titles]);
  if(titles.includes(query))return 0;
  if(titles.some(title=>title.startsWith(query)))return 1;
  if(titles.some(title=>tokens.every(token=>title.includes(token))))return 2;
  if(value.aliases.some(title=>title===query||tokens.every(token=>title.includes(token))))return 3;
  if(/^\d[\d ]{8,}$/u.test(query)&&value.identifiers.includes(query.replace(/\s/gu,'')))return 3;
  return tokens.every(token=>(canonicalTitle+' '+value.search).includes(token))?4:null;
}

export function recordQualifies(value,filters,database){
  const record=value.record;
  return (!filters.provider||filters.provider==='all'||record.provider===filters.provider)
    &&(!filters.ownership||filters.ownership==='all'||effectiveOwnershipRecord(record,database).ownership===filters.ownership)
    &&(!filters.genre||filters.genre==='all'||value.genres.some(genre=>genre.toLocaleLowerCase()===filters.genre.toLocaleLowerCase()));
}

export function libraryBrowseResults(projection,{query='',filters={},workspace='library',page=0,size=50}={}){
  const key=searchKey(query),matches=[];
  for(const row of projection.rows){
    if(workspace==='books'&&!['book','audiobook'].includes(row.canonical.mediaType))continue;
    if(filters.mediaType&&filters.mediaType!=='all'&&row.canonical.mediaType!==filters.mediaType)continue;
    const qualifying=row.records.filter(value=>recordQualifies(value,filters,projection.database));if(!qualifying.length)continue;
    const addons=qualifying.flatMap(value=>projection.addOnsByParent.get(value.record.id)??[]).filter(value=>recordQualifies(value,filters,projection.database));
    if(filters.dlc&&filters.dlc!=='all'&&(row.canonical.mediaType!=='game'||(filters.dlc==='with')!==Boolean(addons.length)))continue;
    const ranks=[...qualifying.map(value=>recordSearchRank(value,key,row.title)),...addons.map(value=>recordSearchRank(value,key))].filter(rank=>rank!==null);
    if(ranks.length)matches.push({...row,qualifying,rank:Math.min(...ranks)});
  }
  matches.sort((a,b)=>a.rank-b.rank||compareTitles(a.canonical.title,b.canonical.title)||a.canonical.id.localeCompare(b.canonical.id));
  const pages=Math.max(1,Math.ceil(matches.length/size));page=Math.max(0,Math.min(page,pages-1));
  return {matches,rows:matches.slice(page*size,(page+1)*size),total:matches.length,page,pages};
}
