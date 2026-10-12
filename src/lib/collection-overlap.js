import {libraryCoverageIndex} from './inferred-coverage.js';
import {contentKey} from './contents.js';
import {identityKey} from './identity.js';

// A read-only inverted-index projection, built only for the overlap workspace.
// Canonical product identities are existing identities, never contents merges.
function* overlapProjection(database) {
  const owners=new Map(),collections=new Map(),pairs=new Map();
  for(const canonical of Object.values(database.canonicalItems??{}))for(const id of canonical.providerItemIds)owners.set(id,canonical);
  const {index}=libraryCoverageIndex(database);let visited=0;
  for(const [key,evidence]of index){
    const candidates=evidence.filter(e=>['issue','annual','special'].includes(e.entry.unitType)&&e.confidence!=='direct');
    const participating=new Map();
    for(const e of candidates){
      const canonical=owners.get(e.item.id),id=canonical?.id??e.item.id;
      let collection=collections.get(id);
      if(!collection){collection={id,title:canonical?.title??e.item.title,records:new Map(),units:new Map(),provisional:new Map()};collections.set(id,collection);}
      collection.records.set(e.item.id,e.item);
      if(e.provisional){collection.provisional.set(key,e);continue;}
      const unit=collection.units.get(key)??{entry:e.entry,sources:[],confidence:'inferred'};
      if(!unit.sources.some(source=>source.item.id===e.item.id))unit.sources.push(e);
      if(e.confidence==='verified')unit.confidence='verified';
      collection.units.set(key,unit);participating.set(id,collection);
    }
    const ids=[...participating.keys()].sort();
    // Compare only collections that already share this resolved issue key.
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
      const pairKey=JSON.stringify([ids[i],ids[j]]),pair=pairs.get(pairKey)??{id:pairKey,left:participating.get(ids[i]),right:participating.get(ids[j]),shared:[],verified:0};
      pair.shared.push(key);
      if(pair.left.units.get(key).confidence==='verified'&&pair.right.units.get(key).confidence==='verified')pair.verified++;
      pairs.set(pairKey,pair);
      if(++visited%250===0)yield;
    }
    if(++visited%250===0)yield;
  }
  return {pairs:[...pairs.values()],collections};
}
export function collectionOverlap(database){const iterator=overlapProjection(database);let next;do{next=iterator.next();}while(!next.done);return next.value;}
export async function collectionOverlapAsync(database,{yieldWork=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
  await yieldWork();const iterator=overlapProjection(database);let next;
  do{next=iterator.next();if(!next.done)await yieldWork();}while(!next.done);return next.value;
}
const uncertainKey=entry=>JSON.stringify([identityKey(entry.series),entry.unitType,entry.number,identityKey(entry.language)]);
export function overlapPairDetails(pair){
  const partition=(own,other)=>{
    const possible=new Map();
    for(const unit of other.units.values()){const key=uncertainKey(unit.entry),entries=possible.get(key)??[];entries.push(unit.entry);possible.set(key,entries);}
    for(const unit of other.provisional.values()){const key=uncertainKey(unit.entry),entries=possible.get(key)??[];entries.push(unit.entry);possible.set(key,entries);}
    const unique=[],uncertain=[];
    for(const [key,unit]of own.units){
      if(other.units.has(key))continue;
      const related=possible.get(uncertainKey(unit.entry))??[];
      (related.some(entry=>!entry.run||!unit.entry.run)?uncertain:unique).push(unit);
    }
    return {unique,uncertain};
  };
  return {shared:pair.shared.map(key=>({entry:pair.left.units.get(key).entry,left:pair.left.units.get(key),right:pair.right.units.get(key),confidence:pair.left.units.get(key).confidence==='verified'&&pair.right.units.get(key).confidence==='verified'?'verified':'inferred'})),left:partition(pair.left,pair.right),right:partition(pair.right,pair.left)};
}
export function overlapIssueLabel(entry){return `${entry.series}${entry.run?' ('+entry.run+')':''} ${entry.unitType==='issue'?'#':entry.unitType+' #'}${entry.number} · ${entry.language}`;}
export const sortOverlapUnits=units=>units.sort((a,b)=>contentKey(a.entry).localeCompare(contentKey(b.entry),undefined,{numeric:true}));
