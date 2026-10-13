import {comicRange} from '../lib/comic-coverage.js';
import {identityKey} from '../lib/identity.js';
const numeric = value => /^\d+\/\d+$/u.test(value) ? Number(value.split('/')[0])/Number(value.split('/')[1]) : Number(value);
export function seriesMergeTargets(source,groups,query=''){
  const text=identityKey(query),key=identityKey(source.series),words=new Set(key.split(' '));
  const names=group=>[group.series,...(group.originalTitles??[])];
  const matches=group=>names(group).some(name=>{const runs=[group.run,...(group.originalScopes??[]).map(scope=>scope.run)].join(' '),value=identityKey(name+' '+runs+' '+group.unitType+'s '+group.language);return text.split(' ').every(word=>value.includes(word));});
  const score=group=>Math.max(...names(group).map(title=>{const value=identityKey(title);return value===key?1000:value.includes(key)||key.includes(value)?500:value.split(' ').filter(word=>words.has(word)).length;}));
  return groups.filter(group=>group.id!==source.id&&matches(group)).sort((a,b)=>Number(b.unitType===source.unitType)-Number(a.unitType===source.unitType)||score(b)-score(a)||comicSeriesLabel(a).localeCompare(comicSeriesLabel(b),undefined,{numeric:true}));
}
export function comicSeriesLabel(group, groups = [group]) {
  const base = item => item.series + (item.run ? ` (${item.run})` : '');
  const peers = groups.filter(item => base(item).toLocaleLowerCase() === base(group).toLocaleLowerCase());
  const qualifiers = [];
  if(new Set(peers.filter(item=>item.unitType===group.unitType).map(item=>item.language)).size>1) qualifiers.push(group.language);
  return base(group)+' — '+(group.unitType==='issue'?'issues':group.unitType+'s')+(qualifiers.length?' · '+qualifiers.join(' · '):'');
}
// Presentation only: keep the engine's range assumptions and special numbering.
// Segments are compact intervals; never allocate one entry per missing number.
export function coverageSegments(group,start=1,transitions=[]) {
  const range=comicRange(group,start,transitions),segments=[];
  const owned=new Map();
  for(const issue of group.issues){const n=numeric(issue.number);if(Number.isSafeInteger(n)&&n>=start&&n<=range.end)owned.set(n,issue);}
  const append=(first,last,status)=>{if(last<first)return;const previous=segments.at(-1);if(previous?.status===status&&previous.last+1===first)previous.last=last;else segments.push({first,last,status});};
  for(const [first,last]of range.sequence){let cursor=first;
    for(const [number,issue]of [...owned].sort((a,b)=>a[0]-b[0])){if(number<first||number>last)continue;append(cursor,number-1,'missing');append(number,number,issue.partial?'partial':issue.copies>1?'duplicate':'owned');cursor=number+1;}
    append(cursor,last,'missing');
  }return {range,segments};
}
export function comicGridPage(group,{start=1,transitions=[],page=0,size=100}={}) {
  const range=comicRange(group,start,transitions),total=range.extent,pages=Math.ceil(total/size);
  page=Math.max(0,Math.min(page,Math.max(0,pages-1)));
  const owned=new Map(group.issues.map(issue=>[numeric(issue.number),issue])),rows=[];
  let skip=page*size;
  for(const [a,b]of range.sequence){const length=b-a+1;if(skip>=length){skip-=length;continue;}for(let n=a+skip;n<=b&&rows.length<size;n++)rows.push(owned.get(n)??{number:String(n),missing:true});skip=0;if(rows.length===size)break;}
  const first=Number(rows[0]?.number??start),last=Number(rows.at(-1)?.number??(start-1));
  const extras=group.issues.filter(issue=>{const n=numeric(issue.number);return !Number.isSafeInteger(n)||n<start;});
  return {rows,extras,page,pages,first,last,range};
}
