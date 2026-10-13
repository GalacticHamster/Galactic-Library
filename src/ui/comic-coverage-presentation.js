import {comicRange} from '../lib/comic-coverage.js';
const numeric = value => /^\d+\/\d+$/u.test(value) ? Number(value.split('/')[0])/Number(value.split('/')[1]) : Number(value);
export function comicSeriesLabel(group, groups = [group]) {
  const base = item => item.series + (item.run ? ` (${item.run})` : '');
  const peers = groups.filter(item => base(item).toLocaleLowerCase() === base(group).toLocaleLowerCase());
  const qualifiers = [];
  if(new Set(peers.map(item=>item.unitType)).size>1) qualifiers.push(group.unitType==='issue'?'issues':group.unitType+'s');
  if(new Set(peers.filter(item=>item.unitType===group.unitType).map(item=>item.language)).size>1) qualifiers.push(group.language);
  return base(group)+(qualifiers.length?' · '+qualifiers.join(' · '):'');
}
// Presentation only: keep the engine's range assumptions and special numbering.
// Segments are compact intervals; never allocate one entry per missing number.
export function coverageSegments(group,start=1) {
  const range=comicRange(group,start),segments=[];
  const owned=new Map();
  for(const issue of group.issues){const n=numeric(issue.number);if(Number.isSafeInteger(n)&&n>=start&&n<=range.end)owned.set(n,issue);}
  const append=(first,last,status)=>{if(last<first)return;const previous=segments.at(-1);if(previous?.status===status&&previous.last+1===first)previous.last=last;else segments.push({first,last,status});};
  let cursor=start;
  for(const [number,issue]of [...owned].sort((a,b)=>a[0]-b[0])){append(cursor,number-1,'missing');append(number,number,issue.partial?'partial':issue.copies>1?'duplicate':'owned');cursor=number+1;}
  append(cursor,range.end,'missing');return {range,segments};
}
export function comicGridPage(group,{start=1,page=0,size=100}={}) {
  const range=comicRange(group,start),total=Math.max(0,range.end-start+1),pages=Math.ceil(total/size);
  page=Math.max(0,Math.min(page,Math.max(0,pages-1)));
  const first=start+page*size,last=Math.min(range.end,first+size-1),owned=new Map(group.issues.map(issue=>[numeric(issue.number),issue])),rows=[];
  for(let n=first;n<=last;n++)rows.push(owned.get(n)??{number:String(n),missing:true});
  const extras=group.issues.filter(issue=>{const n=numeric(issue.number);return !Number.isSafeInteger(n)||n<start;});
  return {rows,extras,page,pages,first,last,range};
}
