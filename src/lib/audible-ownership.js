import {date,object,text} from './validation.js';

export function audibleCalendarDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value)||date(value).slice(0,10)!==value)throw Error('Invalid Audible purchase date.');
  return value;
}
export function audiblePurchaseEvidence(values){
  if(!Array.isArray(values)||values.length>10000)throw Error('Too much Audible purchase evidence.');
  return [...new Map(values.map(value=>{object(value,'Audible purchase');const day=audibleCalendarDate(value.date),method=text(value.method,20);if(!['cash','credit','free','purchase','promotion','gift'].includes(method))throw Error('Invalid Audible purchase method.');return [day+':'+method,{date:day,method}];})).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.method.localeCompare(b.method));
}
export function validateAudibleHistory(value){
  object(value,'Audible history');
  if(value.format!==1||typeof value.ordersComplete!=='boolean'||typeof value.refundsComplete!=='boolean')throw Error('Invalid Audible history completion.');
  const scope=value.scope??'full';if(!['full','recent'].includes(scope))throw Error('Invalid Audible history scope.');
  const ids=list=>{if(!Array.isArray(list)||list.length>50000)throw Error('Invalid Audible history size.');return list;};
  const asin=value=>{if(typeof value!=='string'||!/^[A-Z0-9]{10}$/u.test(value))throw Error('Invalid Audible history ASIN.');return value;};
  const purchases=ids(value.purchases).map(e=>({asin:asin(e.asin),...audiblePurchaseEvidence([e])[0]}));
  const refunds=ids(value.refunds).map(e=>({asin:asin(e.asin),date:audibleCalendarDate(e.date)}));
  const uncertainRefundAsins=[...new Set(ids(value.uncertainRefundAsins).map(asin))].sort();
  if(!Array.isArray(value.years)||value.years.length>200||value.years.some(y=>!Number.isInteger(y)||y<1900||y>2100)||!Number.isSafeInteger(value.pagesRead)||value.pagesRead<0||value.pagesRead>10000)throw Error('Invalid Audible history traversal.');
  return {format:1,scope,ordersComplete:value.ordersComplete,refundsComplete:value.refundsComplete,purchases,refunds,uncertainRefundAsins,years:[...new Set(value.years)].sort((a,b)=>b-a),pagesRead:value.pagesRead,reason:text(value.reason??'',100)};
}

// Historical facts enrich one existing source record; they never create a
// transaction-shaped audiobook or change a manual ownership review.
export function enrichAudibleRecords(database,profileId,incoming,raw,{full=false}={}){
  if(raw===undefined)return incoming;
  const history=validateAudibleHistory(raw),byAsin=new Map(),refunds=new Map();
  for(const p of history.purchases){const list=byAsin.get(p.asin)??[];list.push(p);byAsin.set(p.asin,list);}
  for(const r of history.refunds){const list=refunds.get(r.asin)??[];list.push(r.date);refunds.set(r.asin,list);}
  const uncertain=new Set(history.uncertainRefundAsins),supplied=new Set(incoming.map(i=>i.id));
  const records=full?incoming:[...incoming,...Object.values(database.providerItems).filter(i=>i.profileId===profileId&&!supplied.has(i.id)&&(byAsin.has(i.providerItemId)||refunds.has(i.providerItemId)))];
  return records.flatMap(item=>{
    if(item.provider!=='audible'||item.profileId!==profileId||item.mediaType!=='audiobook'||item.metadata.asin&&item.metadata.asin!==item.providerItemId)return [item];
    const evidence=audiblePurchaseEvidence([...(item.metadata.audiblePurchaseEvidence??[]),...(byAsin.get(item.providerItemId)??[])]);
    const returned=[...new Set([...(item.metadata.audibleRefundDates??[]),...(refunds.get(item.providerItemId)??[])])].sort();
    const metadata={...item.metadata},dates=[...new Set(evidence.map(e=>e.date))].sort(),lastPurchase=dates.at(-1),lastReturn=returned.at(-1);
    if(evidence.length)metadata.audiblePurchaseEvidence=evidence;
    if(returned.length)metadata.audibleRefundDates=returned;
    let ownership=item.ownership,acquiredAt=item.acquiredAt;
    if(!acquiredAt&&dates.length){metadata.audibleAcquiredOn=dates[0];acquiredAt=dates[0]+'T00:00:00.000Z';}
    if(!uncertain.has(item.providerItemId)&&history.refundsComplete){
      const checkedReturn=history.scope==='full'||(refunds.get(item.providerItemId)??[]).some(day=>day===lastReturn&&history.years.includes(Number(day.slice(0,4))));
      const checkedPurchase=history.scope==='full'||byAsin.has(item.providerItemId);
      if(lastReturn&&checkedReturn&&history.ordersComplete&&(!lastPurchase||lastReturn>lastPurchase)){ownership='returned';metadata.audibleOwnershipBasis='audible-refund-history';}
      else if(lastPurchase&&checkedPurchase&&(!lastReturn||lastPurchase>lastReturn)&&(!['returned','revoked','expired'].includes(item.ownership)||item.metadata.audibleOwnershipBasis==='audible-refund-history'&&lastReturn&&lastPurchase>lastReturn)){ownership='owned';metadata.audibleOwnershipBasis='audible-purchase-history';}
    }
    const next={...item,ownership,acquiredAt,metadata};
    const changed=JSON.stringify(next)!==JSON.stringify(item);
    if(!supplied.has(item.id)&&!changed)return [];
    return [{...next,...(changed?{updatedAt:new Date().toISOString()}:{})}];
  });
}
