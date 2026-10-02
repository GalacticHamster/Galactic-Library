import {object,text,date} from './validation.js';

export function validatePurchaseOrigins(value){
  if(!Array.isArray(value)||value.length>500)throw new Error('Purchase origins must be a bounded list.');
  const refs=new Set();return value.map(entry=>{
    object(entry,'Purchase origin');const occurrenceRef=text(entry.occurrenceRef,64,'Purchase occurrence reference'),orderRef=text(entry.orderRef,64,'Opaque order reference');
    if(!/^[a-f0-9]{64}$/u.test(occurrenceRef)||!/^[a-f0-9]{64}$/u.test(orderRef)||refs.has(occurrenceRef))throw new Error('Invalid or duplicate purchase occurrence.');refs.add(occurrenceRef);
    return {occurrenceRef,orderRef,bundleId:text(entry.bundleId,128,'Bundle ID'),bundleTitle:text(entry.bundleTitle,500,'Bundle title'),purchasedAt:date(entry.purchasedAt),observedAt:date(entry.observedAt)};
  });
}

export function mergePurchaseOrigins(prior=[],incoming=[]){
  return validatePurchaseOrigins([...new Map([...prior,...incoming].map(entry=>[entry.occurrenceRef,entry])).values()].sort((a,b)=>a.occurrenceRef.localeCompare(b.occurrenceRef)));
}
