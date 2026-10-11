import {identityConflicts,sameEditionEvidence} from '../lib/identity.js';
import {editionBarriers,pairKey} from '../lib/relationships.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {providerLabel,accountLabel,accessLabel,formatDate} from './formatters.js';
import '../lib/matching-policy.js';

// A view only. Never replace canonical items or use these rows for matching.
export function consolidateLibraryRows(rows,database){
  const policy=globalThis.LibraryMatchingPolicy,barriers=editionBarriers(database.manualMatchDecisions,database.editionSeparations);
  const buckets=new Map(),output=[];
  for(const row of rows){const key=row.canonical.mediaType+':'+policy.presentationTitle(row.canonical.title,row.canonical.mediaType);const bucket=buckets.get(key)??[];bucket.push(row);buckets.set(key,bucket);}
  const compatible=(a,b)=>a.records.every(({record:left})=>b.records.every(({record:right})=>
    !barriers.has(pairKey(left.id,right.id))&&!identityConflicts(left,right,{companion:true}).length
    &&(sameEditionEvidence(left,right)||policy.fullTitleMatches(left.title,right.title,left.mediaType)&&policy.fullTitleMatches(right.title,left.title,right.mediaType))));
  for(const bucket of buckets.values()){
    if(bucket.length===1){output.push({...bucket[0],canonicalIds:[bucket[0].canonical.id]});continue;}
    const links=bucket.map(()=>new Set());
    for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++)if(compatible(bucket[i],bucket[j])){links[i].add(j);links[j].add(i);}
    const visited=new Set();
    for(let i=0;i<bucket.length;i++){
      if(visited.has(i))continue;const component=[],queue=[i];visited.add(i);
      while(queue.length){const n=queue.pop();component.push(n);for(const next of links[n])if(!visited.has(next)){visited.add(next);queue.push(next);}}
      // Missing metadata must not bridge two explicitly conflicting editions.
      const groups=component.every((n,index)=>component.slice(index+1).every(other=>links[n].has(other)))?[component]:component.map(n=>[n]);
      for(const group of groups){const members=group.map(n=>bucket[n]).sort((a,b)=>a.canonical.id.localeCompare(b.canonical.id)),first=members[0],records=members.flatMap(row=>row.records);
        output.push({...first,canonicalIds:members.map(row=>row.canonical.id),records,
          canonical:{...first.canonical,sourceCanonicalIds:members.map(row=>row.canonical.id),providerItemIds:records.map(value=>value.record.id)}});
      }
    }
  }
  const historical=new Map();
  for(const entry of Object.values(database.providerHistory??{})){
    const record=entry.item;if(!record)continue;
    const key=record.mediaType+':'+policy.presentationTitle(record.title,record.mediaType),list=historical.get(key)??[];
    list.push({...record,historical:true});historical.set(key,list);
  }
  return output.map(row=>({...row,historyRecords:(historical.get(row.canonical.mediaType+':'+policy.presentationTitle(row.canonical.title,row.canonical.mediaType))??[])
    .filter(record=>compatible(row,{records:[{record}]}))}));
}

const unique=values=>[...new Set(values.filter(Boolean))];
export function acquisitionHistory(records,database){
  const entries=new Map(),fanGroups=new Map();
  const add=(key,record,source={})=>{
    const entry=entries.get(key)??{key,provider:record.provider,records:[],bundles:[],titles:[],dates:[],confirmedPurchase:false,quantity:1};
    if(!entry.records.includes(record))entry.records.push(record);
    entry.bundles=unique([...entry.bundles,source.bundle]);entry.titles=unique([...entry.titles,record.title]);
    entry.dates=unique([...entry.dates,source.date]);entry.confirmedPurchase||=source.confirmed===true;entries.set(key,entry);return entry;
  };
  for(const record of records){
    const scope=JSON.stringify([record.provider,record.profileId??'']),metadata=record.metadata??{};
    if(record.provider==='humble'&&metadata.purchaseId){
      add(scope+':order:'+metadata.purchaseId,record,{bundle:metadata.sourceBundle,date:record.acquiredAt,confirmed:true});continue;
    }
    if(record.provider==='fanatical'&&metadata.purchaseOrigins?.length){
      const perRecord=new Map();
      for(const origin of metadata.purchaseOrigins){
        const key=scope+':order:'+JSON.stringify([origin.orderRef,origin.bundleId]),group=fanGroups.get(key)??{native:new Set(),maximum:0};
        if(!origin.basis)group.native.add(origin.occurrenceRef);
        perRecord.set(key,(perRecord.get(key)??0)+1);fanGroups.set(key,group);
        add(key,record,{bundle:origin.bundleTitle,date:origin.purchasedAt,confirmed:true});
      }
      for(const [key,count]of perRecord)fanGroups.get(key).maximum=Math.max(fanGroups.get(key).maximum,count);
      continue;
    }
    // A catalog record without an order/occurrence is not another proven purchase.
    add(scope+':record:'+(record.providerItemId||record.recordRef),record,{bundle:metadata.sourceBundle||metadata.bundleTitle,date:record.acquiredAt});
  }
  for(const [key,group]of fanGroups)entries.get(key).quantity=Math.max(group.native.size,group.maximum);
  const history=[...entries.values()].sort((a,b)=>(a.dates[0]??'9999').localeCompare(b.dates[0]??'9999')||a.key.localeCompare(b.key));
  let purchases=0,ownedPurchases=0;
  for(const entry of history){entry.accounts=unique(entry.records.map(record=>accountLabel(record,database)));
    entry.access=unique(entry.records.map(record=>record.historical?'Earlier record; not in the latest complete scan (previously '+accessLabel(record.ownership)+')':accessLabel(effectiveOwnershipRecord(record,database,Date.now(),{ignoreOverride:true}).ownership)));
    if(entry.confirmedPurchase){purchases+=entry.quantity;if(entry.records.some(record=>!record.historical&&['owned','claimed'].includes(effectiveOwnershipRecord(record,database,Date.now(),{ignoreOverride:true}).ownership)))ownedPurchases+=entry.quantity;}
  }
  const label=ownedPurchases>1?(ownedPurchases===2?'Owned twice':`Owned ${ownedPurchases} times`):purchases>1?`${purchases} recorded purchases`:history.length>1?'Multiple library records':'';
  return {entries:history,purchases,ownedPurchases,label};
}

const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
export function createAcquisitionHistory(history){
  const details=text('details','');details.className='library-purchase-history';
  details.append(text('summary','Purchase and access history'));
  // Details are created only when expanded, so the normal card stays small.
  let built=false;details.addEventListener('toggle',()=>{if(!details.open||built)return;built=true;const list=text('ul','');
    for(const entry of history.entries){const item=text('li','');
      item.append(text('strong',providerLabel(entry.provider)+' — '+(entry.bundles.join('; ')||entry.titles.join('; '))));
      item.append(text('p',entry.accounts.join('; ')));
      item.append(text('p',(entry.confirmedPurchase?'Purchase date: ':'Acquisition date: ')+(entry.dates.length?entry.dates.map(date=>formatDate(date,{time:false})).join('; '):'Not recorded')));
      item.append(text('p',entry.access.join('; ')+(entry.quantity>1?` · ${entry.quantity} copies in this order`:'')));
      if(entry.bundles.length)item.append(text('small','Total bundle price: not recorded'));
      if(!entry.confirmedPurchase)item.append(text('small','Purchase details are not recorded; this is a saved library record.'));
      list.append(item);
    }
    details.append(list);
  });return details;
}
