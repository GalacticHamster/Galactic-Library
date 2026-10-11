import {preferredDisplayTitle} from '../lib/display-title.js';
import {consolidateLibraryRows,acquisitionHistory} from './library-acquisitions.js';
import {identityEvidence} from '../lib/identity.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {libraryBroadGenreValues} from '../lib/genre-hints.js';
import {compareTitles} from '../lib/title-sort.js';
import {providerLabel,accountLabel} from './item-presentation.js';
import {contentsSummary} from './contents-overview.js';
import {paginationState} from './pagination.js';
export const LIBRARY_SORTS=['title-asc','title-desc','added','updated','creator','series'];

// Retrieval keys only: never identity or ownership evidence.
export const searchKey=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ');
const strings=value=>(Array.isArray(value)?value:[value]).filter(value=>typeof value==='string'&&value.trim());
const distinct=values=>[...new Set(values.filter(Boolean))];
const stamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):null;

export function createLibraryBrowseProjection(){
  let current,projection;
  return database=>{
    if(database===current)return projection;
    const pending=new Set(Object.values(database.enrichmentReviews??{}).flatMap(review=>review.recordRefs));
    const project=record=>{
      const identity=identityEvidence(record),metadata=record.metadata??{};
      const series=['book','audiobook'].includes(record.mediaType)?identity.series:strings(metadata.series);
      const aliases=database.titleAliases?.[record.recordRef]?.titles??[];
      const identifiers=distinct([...identity.isbn,identity.asin,identity.steamAppId,...identity.workIds,record.providerItemId,...strings(metadata.isbns)]);
      const titles=distinct([record.title,record.normalizedTitle,metadata.enrichment?.googleBooks?.title,metadata.enrichment?.openLibrary?.approved?metadata.enrichment.openLibrary.title:'',metadata.enrichment?.localMetadata?.approved?metadata.enrichment.localMetadata.title:'']);
      const names=distinct([providerLabel(record.provider),record.provider,accountLabel(record,database),database.providerProfiles?.[record.profileId]?.nickname]);
      const genres=libraryBroadGenreValues(record);
      const fields=distinct([...titles,...aliases,...identity.authors,...identity.contributors.map(value=>value.name),...strings(metadata.narrators),...series,
        identity.unit,identity.unit?`${identity.unitType} ${identity.unit}`:'',metadata.volume?`volume ${metadata.volume}`:'',metadata.issue?`issue ${metadata.issue}`:'',identity.edition,identity.publisher,identity.language,...identifiers,...genres,...names]);
      return {record,identity,unitType:identity.unitType||(metadata.volume?'volume':metadata.issue?'issue':''),series,genres,titles:titles.map(searchKey),aliases:aliases.map(searchKey),search:fields.map(searchKey).join(' '),
        identifiers:identifiers.map(value=>searchKey(value).replace(/\s/gu,'')),added:stamp(record.acquiredAt),updated:stamp(record.updatedAt),
        reading:['book','audiobook'].includes(record.mediaType)?database.readingStates?.[record.recordRef]?.status??'not-saved':null,
        missing:record.mediaType==='book'&&(!identity.authors.length||!identifiers.some(id=>identity.isbn.includes(id)||id===identity.asin&&Boolean(id))),
        review:pending.has(record.recordRef)||record.mediaType==='book'&&contentsSummary(record,database).needsReview};
    };
    const records=new Map(Object.values(database.providerItems).map(record=>[record.id,project(record)]));
    const native=new Map([...records.values()].map(value=>[[value.record.provider,value.record.profileId??'',value.record.providerItemId].join('\0'),value]));
    const addOns=[...records.values()].filter(value=>value.record.mediaType==='game-addon');
    const addOnsByParent=new Map(),linkedAddOnIds=new Set();
    for(const value of addOns){const record=value.record,parent=native.get([record.provider,record.profileId??'',record.metadata?.parentProviderItemId].join('\0'));
      if(parent?.record.mediaType!=='game')continue;const list=addOnsByParent.get(parent.record.id)??[];list.push(value);addOnsByParent.set(parent.record.id,list);linkedAddOnIds.add(record.id);
    }
    const rows=consolidateLibraryRows(Object.values(database.canonicalItems).map(canonical=>({canonical,title:searchKey(canonical.title),records:canonical.providerItemIds.map(id=>records.get(id)).filter(Boolean)})),database).map(row=>{
      const title=preferredDisplayTitle(row.canonicalIds.map(id=>database.canonicalItems[id]));
      return title?{...row,title:searchKey(title),canonical:{...row.canonical,title}}:row;
    });
    const accounts=new Map();for(const value of records.values())if(value.record.profileId&&!accounts.has(value.record.profileId))accounts.set(value.record.profileId,accountLabel(value.record,database));
    const accountOptions=[...accounts].map(([value,label])=>({value,label})).sort((a,b)=>compareTitles(a.label,b.label));
    const seriesOptions=distinct([...records.values()].flatMap(value=>value.series)).sort(compareTitles);
    const genreOptions=distinct([...records.values()].flatMap(value=>value.genres)).sort(compareTitles);
    current=database;projection={database,rows,records,addOns,addOnsByParent,linkedAddOnIds,accountOptions,seriesOptions,genreOptions};return projection;
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
    &&(!filters.account||filters.account==='all'||record.profileId===filters.account)
    &&(!filters.reading||filters.reading==='all'||value.reading===filters.reading)
    &&(!filters.series||filters.series==='all'||value.series.includes(filters.series))
    &&(!filters.information||filters.information==='all'||filters.information==='missing'&&value.missing||filters.information==='review'&&value.review)
    &&(!filters.genre||filters.genre==='all'||value.genres.some(genre=>genre.toLocaleLowerCase()===filters.genre.toLocaleLowerCase()));
}

export function compareBrowseRows(a,b,sort='title-asc'){
  const title=()=>compareTitles(a.canonical.title,b.canonical.title)||a.canonical.id.localeCompare(b.canonical.id);
  if(sort==='title-desc')return -title();
  if(['added','updated'].includes(sort)){
    const date=row=>{const dates=row.qualifying.map(value=>value[sort]).filter(value=>value!==null);return dates.length?Math.max(...dates):null;};
    const left=date(a),right=date(b);if(left===null||right===null)return left===right?title():left===null?1:-1;
    return right-left||title();
  }
  if(sort==='creator'){
    const creator=row=>distinct(row.qualifying.flatMap(value=>value.identity.authors)).sort(compareTitles)[0]??'';
    const left=creator(a),right=creator(b);return left&&right?compareTitles(left,right)||title():left?-1:right?1:title();
  }
  if(sort==='series'){
    const series=row=>row.qualifying.flatMap(value=>value.series.map(series=>({series,run:value.identity.run,unit:['book','audiobook'].includes(value.record.mediaType)?value.identity.unit:'',kind:value.unitType}))).sort((a,b)=>compareTitles(a.series,b.series)||compareTitles(a.run,b.run)||compareTitles(a.kind,b.kind)||compareTitles(a.unit,b.unit))[0];
    const left=series(a),right=series(b);if(!left||!right)return left?-1:right?1:title();
    return compareTitles(left.series,right.series)||compareTitles(left.run,right.run)||compareTitles(left.kind,right.kind)||(left.unit&&right.unit?compareTitles(left.unit,right.unit):left.unit?-1:right.unit?1:0)||title();
  }
  return title();
}

export function libraryBrowseResults(projection,{query='',filters={},sort='title-asc',workspace='library',page=0,size=50,anchor='',recordFilter=()=>true,paginateRecords=false,countAcquisitions=false}={}){
  const key=searchKey(query),matches=[];const acquisitionThresholdCounts={1:0,2:0,3:0,4:0,5:0};
  const threshold=Number(({all:undefined,multiple:'2'})[filters.acquisitions]??filters.acquisitions)||0;
  for(const row of projection.rows){
    if(workspace==='books'&&!['book','audiobook'].includes(row.canonical.mediaType))continue;
    if(filters.mediaType&&filters.mediaType!=='all'&&row.canonical.mediaType!==filters.mediaType)continue;
    const qualifying=row.records.filter(value=>recordQualifies(value,filters,projection.database)&&recordFilter(value.record));if(!qualifying.length)continue;
    const addons=qualifying.flatMap(value=>projection.addOnsByParent.get(value.record.id)??[]).filter(value=>recordQualifies(value,{provider:filters.provider,account:filters.account,ownership:filters.ownership},projection.database));
    if(filters.dlc&&filters.dlc!=='all'&&(row.canonical.mediaType!=='game'||(filters.dlc==='with')!==Boolean(addons.length)))continue;
    const ranks=[...qualifying.map(value=>recordSearchRank(value,key,row.title)),...addons.map(value=>recordSearchRank(value,key))].filter(rank=>rank!==null);
    if(!ranks.length)continue;
    if(countAcquisitions||threshold){
      const count=acquisitionHistory([...row.records.map(value=>value.record),...(row.historyRecords??[])],projection.database).ownedGroups;
      for(let n=1;n<=5;n++)if(count>=n)acquisitionThresholdCounts[n]++;
      if(threshold&&count<threshold)continue;
    }
    matches.push({...row,qualifying,addons,rank:Math.min(...ranks)});
  }
  matches.sort((a,b)=>a.rank-b.rank||compareBrowseRows(a,b,sort));
  const entries=paginateRecords?matches.flatMap(row=>row.qualifying.map(value=>({...row,qualifying:[value]}))):matches;
  size=paginationState(entries.length,page,size).size;
  const anchored=anchor?entries.findIndex(row=>row.canonical.id===anchor||row.canonicalIds?.includes(anchor)||row.qualifying.some(value=>value.record.recordRef===anchor)):-1;
  if(anchored>=0)page=Math.floor(anchored/size);
  const state=paginationState(entries.length,page,size);page=state.page;
  return {matches,rows:entries.slice(page*size,(page+1)*size),total:entries.length,acquisitionThresholdCounts,multipleOwnedCount:acquisitionThresholdCounts[2],catalogTotal:matches.length,page,pages:state.pages};
}
