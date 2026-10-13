import {librarySeriesCoverage} from './inferred-coverage.js';
import {identityKey} from './identity.js';

export const comicSeriesKey=group=>JSON.stringify([identityKey(group.series),identityKey(group.run),group.unitType,identityKey(group.language)]);
const numberValue=number=>{const fraction=/^(\d+)\/(\d+)$/u.exec(number);return fraction?Number(fraction[1])/Number(fraction[2]):/^\d+(?:\.\d+)?$/u.test(number)?Number(number):NaN;};
export function comicIssueEvidence(issue,copiesForSources){
  const complete=issue.sources.filter(source=>source.completeness!=='excerpt'),primary=complete.length?complete:issue.sources;
  return {...issue,partial:!complete.length,copies:complete.length?Math.max(1,copiesForSources(complete.map(source=>source.record))):0,
    confidence:primary.some(source=>source.confidence==='verified')?'verified':primary.some(source=>source.confidence==='direct')?'direct':'inferred'};
}
export function comicGroupCounts(group){
  return {covered:group.issues.filter(issue=>!issue.partial).length,partial:group.issues.filter(issue=>issue.partial).length,duplicates:group.issues.filter(issue=>!issue.partial&&issue.copies>1).length};
}
export function comicCoverage(database,{copiesForSources=()=>1}={}){
  const {groups,unresolved}=librarySeriesCoverage(database,{includeExcerpts:true});
  const recognized=groups.filter(group=>!group.provisional&&['issue','annual','special'].includes(group.unitType)).map(group=>{
    const issues=group.entries.map(entry=>{
      const sources=entry.sources.map(source=>({...source,record:database.providerItems[source.id]})).filter(source=>source.record);
      return comicIssueEvidence({...entry,sources},copiesForSources);
    }).sort((a,b)=>(numberValue(a.number)-numberValue(b.number))||a.number.localeCompare(b.number,undefined,{numeric:true}));
    return {id:comicSeriesKey(group),series:group.series,run:group.run,unitType:group.unitType,language:group.language,issues,...comicGroupCounts({issues})};
  });
  const unassigned=groups.filter(group=>group.provisional).map(group=>({series:group.series,run:group.run,unitType:group.unitType,numbers:group.entries.map(entry=>entry.number),sources:[...new Map(group.entries.flatMap(entry=>entry.sources).map(source=>[source.id,{id:source.id,title:source.title,recordRef:database.providerItems[source.id]?.recordRef}])).values()]}));
  return {groups:recognized,unassigned,provisional:groups.filter(group=>group.provisional).reduce((sum,group)=>sum+group.entries.length,0),unresolved:unresolved.length};
}
export function validateNumberingTransitions(value){
  if(!Array.isArray(value)||value.length>100)throw Error('Use at most 100 numbering transitions.');
  const output=value.map(pair=>{
    if(!Array.isArray(pair)||pair.length!==2||pair.some(n=>!Number.isSafeInteger(n)||n<0||n>999999)||pair[1]<=pair[0]+1)throw Error('A transition must skip forward between whole issue numbers from 0 to 999999.');
    return [...pair];
  }).sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<output.length;i++)if(output[i][0]<output[i-1][1])throw Error('Numbering transitions cannot overlap.');
  return output;
}
export function comicRange(group,start=1,transitions=[]){
  if(!Number.isSafeInteger(start)||start<0||start>999999)throw Error('Starting number must be a whole number from 0 to 999999.');
  const integers=group.issues.filter(issue=>!issue.partial).map(issue=>numberValue(issue.number)).filter(number=>Number.isSafeInteger(number)&&number>=0).sort((a,b)=>a-b);
  // Only whole numbers inside the requested range can be missing. Retain
  // fractional/decimal issues, without inventing absent fractional numbers.
  const end=Math.floor(group.issues.reduce((max,issue)=>Number.isFinite(numberValue(issue.number))?Math.max(max,numberValue(issue.number)):max,0)),covered=integers.filter(number=>number>=start&&number<=end),missingRanges=[];
  // A stale transition must never hide newly acquired issues. Keep that entire
  // transition inactive if any represented number lies in its skipped gap.
  const defined=validateNumberingTransitions(transitions),conflicts=defined.filter(([from,to])=>group.issues.some(issue=>numberValue(issue.number)>from&&numberValue(issue.number)<to)),active=defined.filter(pair=>!conflicts.includes(pair));
  const sequence=[];let cursor=start;
  for(const [from,to]of active){if(from>=end||to<=start)continue;if(cursor<=from)sequence.push([cursor,Math.min(from,end)]);cursor=Math.max(cursor,to);}
  if(cursor<=end)sequence.push([cursor,end]);
  for(const [first,last]of sequence){cursor=first;for(const number of covered){if(number<first||number>last)continue;if(number>cursor)missingRanges.push([cursor,number-1]);cursor=number+1;}if(cursor<=last)missingRanges.push([cursor,last]);}
  const missing=missingRanges.reduce((sum,[a,b])=>sum+b-a+1,0),partial=group.issues.filter(issue=>issue.partial&&Number.isSafeInteger(numberValue(issue.number))&&numberValue(issue.number)>=start&&numberValue(issue.number)<=end).length;
  return {start,end,sequence,extent:sequence.reduce((sum,[a,b])=>sum+b-a+1,0),conflicts,missingRanges,missing,partial,uncovered:missing-partial,belowStart:integers.filter(number=>number<start).length};
}
export function comicSequenceOffset(range,number){
  let offset=0;for(const [a,b]of range.sequence){if(number>=a&&number<=b)return offset+number-a;offset+=b-a+1;}return -1;
}
export function comicCoverageSummary(groups,starts={},transitions={}){
  return {seriesNames:new Set(groups.map(group=>identityKey(group.series))).size,seriesGroups:groups.length,covered:groups.reduce((sum,group)=>sum+comicGroupCounts(group).covered,0),partial:groups.reduce((sum,group)=>sum+comicGroupCounts(group).partial,0),duplicates:groups.reduce((sum,group)=>sum+group.duplicates,0),missing:groups.reduce((sum,group)=>sum+comicRange(group,starts[group.id]??1,transitions[group.id]).uncovered,0),needsComplete:groups.reduce((sum,group)=>sum+comicRange(group,starts[group.id]??1,transitions[group.id]).missing,0)};
}
export function comicIssuePage(group,{start=1,transitions=[],filter='owned',page=0,size=50}={}){
  const range=comicRange(group,start,transitions);
  const available=filter==='duplicates'?group.issues.filter(issue=>!issue.partial&&issue.copies>1):filter==='partial'?group.issues.filter(issue=>issue.partial):group.issues;
  const total=filter==='missing'?range.missing:available.length;
  page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(total/size)-1)));
  const rows=[];
  if(filter==='missing'){
    let skip=page*size;
    for(const [first,last]of range.missingRanges){const length=last-first+1;if(skip>=length){skip-=length;continue;}
      for(let number=first+skip;number<=last&&rows.length<size;number++)rows.push(group.issues.find(issue=>issue.partial&&numberValue(issue.number)===number)??{number:String(number),missing:true});skip=0;if(rows.length===size)break;
    }
  }else rows.push(...available.slice(page*size,(page+1)*size));
  return {rows,total,page,range};
}
