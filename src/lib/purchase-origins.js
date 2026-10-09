import {object,text,date} from './validation.js';

export function validatePurchaseOrigins(value){
  if(!Array.isArray(value)||value.length>500)throw new Error('Purchase origins must be a bounded list.');
  const refs=new Set();return value.map(entry=>{
    object(entry,'Purchase origin');const occurrenceRef=text(entry.occurrenceRef,64,'Purchase occurrence reference'),orderRef=text(entry.orderRef,64,'Opaque order reference');
    if(!/^[a-f0-9]{64}$/u.test(occurrenceRef)||!/^[a-f0-9]{64}$/u.test(orderRef)||refs.has(occurrenceRef))throw new Error('Invalid or duplicate purchase occurrence.');refs.add(occurrenceRef);
    if(entry.basis!==undefined&&entry.basis!=='order-bundle-count')throw Error('Invalid purchase occurrence basis.');
    return {occurrenceRef,orderRef,...(entry.basis?{basis:entry.basis}:{}),bundleId:text(entry.bundleId,128,'Bundle ID'),bundleTitle:text(entry.bundleTitle,500,'Bundle title'),purchasedAt:date(entry.purchasedAt),observedAt:date(entry.observedAt)};
  });
}

export function mergePurchaseOrigins(prior=[],incoming=[]){
  const merged=[...new Map([...prior,...incoming].map(entry=>[entry.occurrenceRef,entry])).values()];
  // Companion history has confirmed order/bundle quantities but not native
  // occurrence IDs. Keep that distinction. A later native scan supplies real
  // occurrences for the same group; they replace aggregate slots, not add a
  // second purchase. All-native groups retain their existing union semantics.
  const key=entry=>JSON.stringify([entry.orderRef,entry.bundleId]);
  const aggregateGroups=new Set(merged.filter(entry=>entry.basis==='order-bundle-count').map(key));
  const counts=rows=>{const result=new Map();for(const row of rows)result.set(key(row),(result.get(key(row))??0)+1);return result;};
  const oldCounts=counts(prior),newCounts=counts(incoming),selected=[];
  for(const group of aggregateGroups){
    const rows=merged.filter(entry=>key(entry)===group),native=rows.filter(entry=>!entry.basis),aggregate=rows.filter(entry=>entry.basis);
    const remaining=Math.max(0,Math.max(oldCounts.get(group)??0,newCounts.get(group)??0)-native.length);
    selected.push(...native,...aggregate.slice(0,remaining));
  }
  selected.push(...merged.filter(entry=>!aggregateGroups.has(key(entry))));
  return validatePurchaseOrigins(selected.sort((a,b)=>a.occurrenceRef.localeCompare(b.occurrenceRef)));
}
