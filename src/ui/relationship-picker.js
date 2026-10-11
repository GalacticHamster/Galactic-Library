import {identityEvidence} from '../lib/identity.js';
import {providerLabel,accountLabel} from './item-presentation.js';

const indexes=new WeakMap();
const key=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function relationshipSearchIndex(database){
  if(indexes.has(database))return indexes.get(database);
  const groups=new Map();
  for(const group of Object.values(database.canonicalItems))for(const id of group.providerItemIds)groups.set(id,group.providerItemIds);
  const entries=Object.values(database.providerItems).map(record=>{
    const identity=identityEvidence(record);
    const label=[record.title,providerLabel(record.provider),accountLabel(record,database),identity.unit?`${identity.unitType} ${identity.unit}`:'',identity.edition].filter(Boolean).join(' \u2014 ');
    return {record,label,search:key(label)};
  }).sort((a,b)=>a.record.title.localeCompare(b.record.title));
  const index={groups,entries};indexes.set(database,index);return index;
}
export function searchRelationshipRecords(index,currentId,query,limit=20){
  const current=index.entries.find(entry=>entry.record.id===currentId)?.record;
  const excluded=new Set(index.groups.get(currentId)??[currentId]);
  const tokens=key(query).split(' ').filter(Boolean),results=[];
  if(!current||!tokens.length)return results;
  for(const entry of index.entries){
    if(entry.record.mediaType!==current.mediaType||excluded.has(entry.record.id)||!tokens.every(token=>entry.search.includes(token)))continue;
    results.push(entry);if(results.length>=limit)break;
  }
  return results;
}
export function createRelationshipPicker(database,currentId,onChange){
  const root=document.createElement('div'),input=document.createElement('input'),select=document.createElement('select'),hint=document.createElement('p');
  const index=relationshipSearchIndex(database);
  input.type='search';input.placeholder='Search titles, providers or editions';input.setAttribute('aria-label','Search comparison records');
  select.setAttribute('aria-label','Compare with library record');
  hint.setAttribute('role','status');
  const update=()=>{
    const results=searchRelationshipRecords(index,currentId(),input.value);
    select.replaceChildren(new Option('Choose a search result',''),...results.map(entry=>new Option(entry.label,entry.record.id)));
    select.disabled=!results.length;
    hint.textContent=!input.value.trim()?'Type to find another item.':!results.length?'No other matching records. Try a different search.':results.length===20?'Showing up to 20 records. Refine your search to narrow the list.':`${results.length} matching record${results.length===1?'':'s'}.`;
    onChange();
  };
  input.addEventListener('input',update);select.addEventListener('change',onChange);
  root.append(input,select,hint);
  return {root,select,update};
}
