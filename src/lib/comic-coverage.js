import {librarySeriesCoverage} from './inferred-coverage.js';
import {identityKey} from './identity.js';

export const comicSeriesKey=group=>JSON.stringify([identityKey(group.series),identityKey(group.run),group.unitType,identityKey(group.language)]);
const numberValue=number=>{const fraction=/^(\d+)\/(\d+)$/u.exec(number);return fraction?Number(fraction[1])/Number(fraction[2]):/^\d+(?:\.\d+)?$/u.test(number)?Number(number):NaN;};
export function comicCoverage(database,{copiesForSources=()=>1}={}){
  const {groups,unresolved}=librarySeriesCoverage(database);
  const recognized=groups.filter(group=>!group.provisional&&['issue','annual','special'].includes(group.unitType)).map(group=>{
    const issues=group.entries.map(entry=>{
      const sources=entry.sources.map(source=>({...source,record:database.providerItems[source.id]})).filter(source=>source.record);
      return {...entry,sources,copies:Math.max(1,copiesForSources(sources.map(source=>source.record)))};
    }).sort((a,b)=>(numberValue(a.number)-numberValue(b.number))||a.number.localeCompare(b.number,undefined,{numeric:true}));
    return {id:comicSeriesKey(group),series:group.series,run:group.run,unitType:group.unitType,language:group.language,issues,duplicates:issues.filter(issue=>issue.copies>1).length};
  });
  return {groups:recognized,provisional:groups.filter(group=>group.provisional).reduce((sum,group)=>sum+group.entries.length,0),unresolved:unresolved.length};
}
export function comicRange(group,start=1){
  if(!Number.isSafeInteger(start)||start<0||start>999999)throw Error('Starting number must be a whole number from 0 to 999999.');
  const integers=group.issues.map(issue=>numberValue(issue.number)).filter(number=>Number.isSafeInteger(number)&&number>=0).sort((a,b)=>a-b);
  // Only whole numbers inside the requested range can be missing. Retain
  // fractional/decimal issues, without inventing absent fractional numbers.
  const end=Math.floor(group.issues.reduce((max,issue)=>Number.isFinite(numberValue(issue.number))?Math.max(max,numberValue(issue.number)):max,0)),covered=integers.filter(number=>number>=start&&number<=end),missingRanges=[];
  let cursor=start;
  for(const number of covered){if(number>cursor)missingRanges.push([cursor,number-1]);cursor=number+1;}
  if(cursor<=end)missingRanges.push([cursor,end]);
  return {start,end,missingRanges,missing:missingRanges.reduce((sum,[a,b])=>sum+b-a+1,0),belowStart:integers.filter(number=>number<start).length};
}
export function comicCoverageSummary(groups,starts={}){
  return {seriesNames:new Set(groups.map(group=>identityKey(group.series))).size,seriesGroups:groups.length,covered:groups.reduce((sum,group)=>sum+group.issues.length,0),duplicates:groups.reduce((sum,group)=>sum+group.duplicates,0),missing:groups.reduce((sum,group)=>sum+comicRange(group,starts[group.id]??1).missing,0)};
}
export function comicIssuePage(group,{start=1,filter='owned',page=0,size=50}={}){
  const range=comicRange(group,start);
  const available=filter==='duplicates'?group.issues.filter(issue=>issue.copies>1):group.issues;
  const total=filter==='missing'?range.missing:available.length;
  page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(total/size)-1)));
  const rows=[];
  if(filter==='missing'){
    let skip=page*size;
    for(const [first,last]of range.missingRanges){const length=last-first+1;if(skip>=length){skip-=length;continue;}
      for(let number=first+skip;number<=last&&rows.length<size;number++)rows.push({number:String(number),missing:true});skip=0;if(rows.length===size)break;
    }
  }else rows.push(...available.slice(page*size,(page+1)*size));
  return {rows,total,page,range};
}
