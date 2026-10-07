import { object, text, strings, date } from './validation.js';

export const pairKey = (a,b) => [a,b].sort().join('\u0000');
export function editionBarriers(decisions = {}, separations = {}) {
  const pairs=new Set(Object.values(decisions).filter(value=>['different','same','same-work'].includes(value.decision)).map(value=>pairKey(...value.itemIds)));
  for(const separation of Object.values(separations))for(const other of separation.otherItemIds)pairs.add(pairKey(separation.itemId,other));
  return pairs;
}

export function validateEditionSeparations(value = {}) {
  object(value,'Edition separations');
  if(Object.keys(value).length>100000)throw new Error('Too many edition separations.');
  let pairs=0;
  return Object.fromEntries(Object.entries(value).map(([ref,entry])=>{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(ref))throw new Error('Invalid separation reference.');
    object(entry,'Edition separation');
    const itemId=text(entry.itemId,600,'Separated record ID');
    const otherItemIds=strings(entry.otherItemIds,50000,600,'Separated edition members').sort();
    pairs+=otherItemIds.length;
    if(!itemId||!otherItemIds.length||otherItemIds.includes(itemId)||pairs>100000)throw new Error('Invalid edition separation members.');
    return [ref,{itemId,otherItemIds,updatedAt:date(entry.updatedAt)}];
  }));
}
