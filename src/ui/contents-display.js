import {proposeContentsForReview,contentsStatement} from '../lib/contents.js';
import {accountLabel} from './item-presentation.js';

// Presentation only: use committed reviews or the saved bounded parser input.
// Never select candidates, read source blocks, or feed this projection to matching.
export function createContentsDisplay({limit=200,interpret=proposeContentsForReview}={}){
  let current;const cache=new Map();
  return (record,database)=>{
    if(current!==database){current=database;cache.clear();}
    if(cache.has(record.recordRef))return cache.get(record.recordRef);
    const review=database.contentReviews?.[record.id],saved=record.metadata?.enrichment?.kindleProductComicContents;
    let entries=review?.entries??[],unresolved=[],fallback='',incomplete=Boolean(saved?.descriptionMayBeIncomplete);
    if(!review){
      if(saved?.parseInput&&['full','partial'].includes(saved.parseOutcome)){
        const proposal=interpret(saved.parseInput,record.title);
        entries=proposal.entries;unresolved=proposal.unparsed;if(!entries.length)fallback=contentsStatement(record);
      }else fallback=contentsStatement(record);
      incomplete ||= saved?.parseOutcome==='partial'||Boolean(unresolved.length);
    }
    const result={entries,groups:groupContents(entries),reviewed:Boolean(review),incomplete,unresolved,fallback,
      source:accountLabel(record,database),basis:review?'Human reviewed':saved?'From book description':'From saved metadata'};
    cache.set(record.recordRef,result);while(cache.size>limit)cache.delete(cache.keys().next().value);
    return result;
  };
}
export const contentsDisplay=createContentsDisplay();
export function groupContents(entries){
  const groups=new Map();
  for(const entry of entries){
    const key=JSON.stringify([entry.series,entry.run,entry.unitType,entry.language,entry.completeness]);
    const group=groups.get(key)??{...entry,numbers:[]};group.numbers.push(entry.number);groups.set(key,group);
  }
  return [...groups.values()].map(group=>{
    const numbers=[...new Set(group.numbers)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),parts=[];
    for(let n=0;n<numbers.length;n++){
      let end=n;while(group.unitType!=='component'&&/^\d+$/u.test(numbers[n])&&end+1<numbers.length&&/^\d+$/u.test(numbers[end+1])&&Number(numbers[end+1])===Number(numbers[end])+1)end++;
      parts.push({text:end>n?numbers[n]+'\u2013'+numbers[end]:numbers[n],count:end-n+1});n=end;
    }
    const kind={issue:'#',volume:'vol. ',annual:'Annual #',special:'Special ',component:''}[group.unitType]??'';
    const label=group.series+(group.run?' ('+group.run+')':'')+(group.language?' ['+group.language+']':'')+(group.completeness==='excerpt'?' (excerpts)':'');
    return {label,kind,parts,count:numbers.length,text:label+' '+kind+parts.map(part=>part.text).join(', ')};
  });
}
export function contentsPreview(value){
  const chunks=[];let included=0;
  for(const group of value.groups.slice(0,3)){
    const label=group.label.length>90?group.label.slice(0,87)+'\u2026':group.label;
    const parts=group.parts.slice(0,5);chunks.push(label+' '+group.kind+parts.map(part=>part.text).join(', '));included+=parts.reduce((n,part)=>n+part.count,0);
  }
  const remaining=value.groups.reduce((n,group)=>n+group.count,0)-included;
  return {text:chunks.join('; '),remaining};
}
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
export function createContentsReadOnly(record,database,{compact=false}={}){
  const value=contentsDisplay(record,database),preview=contentsPreview(value),root=text('div','');root.className='contents-read-only';
  if(preview.text)root.append(text('p','Collects: '+preview.text+(preview.remaining?' \u00b7 '+preview.remaining+' more entries':'')));
  else if(value.fallback)root.append(text('p','Description: '+value.fallback.slice(0,220)+(value.fallback.length>220?'\u2026':'')));
  else return null;
  root.append(text('small',value.source+' \u00b7 '+value.basis+(value.reviewed?'':' \u00b7 Not verified')+(value.incomplete?' \u00b7 Some description details need review':'')));
  if(!compact){
    const full=text('details','');full.append(text('summary','All known included works'+(value.entries.length?' ('+value.entries.length+' entries)':'')));let built=false;
    full.addEventListener('toggle',()=>{if(!full.open||built)return;built=true;const list=text('ul','');for(const group of value.groups)list.append(text('li',group.text));if(value.fallback)list.append(text('li',value.fallback));full.append(list);if(value.unresolved.length)full.append(text('p','Still to check: '+value.unresolved.join('; ')));});root.append(full);
  }
  return root;
}
