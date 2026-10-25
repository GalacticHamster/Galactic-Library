import {identityConflicts,sameEditionEvidence,identityEvidence,identityKey} from '../lib/identity.js';
import {editionBarriers,pairKey} from '../lib/relationships.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {providerLabel,accountLabel,accessLabel,formatDate,acquisitionDate} from './formatters.js';
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
    if(entry.reason==='duplicate-observation')continue;
    const record=entry.item;if(!record)continue;
    const key=record.mediaType+':'+policy.presentationTitle(record.title,record.mediaType),list=historical.get(key)??[];
    list.push({...record,historical:true});historical.set(key,list);
  }
  return output.map(row=>({...row,historyRecords:(historical.get(row.canonical.mediaType+':'+policy.presentationTitle(row.canonical.title,row.canonical.mediaType))??[])
    .filter(record=>compatible(row,{records:[{record}]}))}));
}

const unique=values=>[...new Set(values.filter(Boolean))];
// Immutable saved provenance only; access/expiry are reevaluated separately below.
const claimProjections=new WeakMap();
const scopeOf=record=>JSON.stringify([record.provider,record.profileId??'']);
const humbleOrder=record=>scopeOf(record)+':order:'+record.metadata.purchaseId;
const bundleName=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function repeatedClaimProjection(database){
  if(claimProjections.has(database))return claimProjections.get(database);
  const orders=new Map(),projection=new Map(),buckets=new Map();
  for(const record of [...Object.values(database.providerItems??{}),...Object.values(database.providerHistory??{}).map(value=>value.item).filter(Boolean)]){
    if(record.provider!=='humble'||!record.profileId||!record.metadata?.purchaseId)continue;
    const key=humbleOrder(record),order=orders.get(key)??{key,scope:scopeOf(record),names:new Set(),dates:new Set(),products:new Set(),safe:true};
    order.names.add(bundleName(record.metadata.sourceBundle));
    const date=Date.parse(record.acquiredAt);if(Number.isFinite(date))order.dates.add(date);
    const prefix=record.metadata.purchaseId+':product:',native=record.providerItemId?.startsWith(prefix)?record.providerItemId.slice(prefix.length):'';
    // A repeated paid order is still a purchase. Only explicit native free-product claims qualify.
    if(!native||!/(?:_|-)free$/iu.test(native)||record.metadata.entitlement!=='direct-download')order.safe=false;
    const identity=identityEvidence(record),details=['authors','isbn','asin','edition','run','unit','unitType','language','series'].map(field=>Array.isArray(identity[field])?identity[field].map(identityKey).sort():identityKey(identity[field]));
    order.products.add(JSON.stringify([native,record.mediaType,globalThis.LibraryMatchingPolicy.presentationTitle(record.title,record.mediaType),details]));orders.set(key,order);
  }
  for(const order of orders.values()){
    if(!order.safe||order.names.size!==1||!/(?:^| )free(?: |$)/u.test(order.names.values().next().value)||order.dates.size!==1||order.products.size<2)continue;
    order.date=[...order.dates][0];const fingerprint=JSON.stringify([order.scope,[...order.names][0],[...order.products].sort()]),bucket=buckets.get(fingerprint)??[];bucket.push(order);buckets.set(fingerprint,bucket);
  }
  const window=30*24*60*60*1000;
  for(const bucket of buckets.values()){
    bucket.sort((a,b)=>a.date-b.date||a.key.localeCompare(b.key));let component=[];
    const flush=()=>{if(component.length>1&&component.at(-1).date-component[0].date<=window){const key='claims:'+component[0].key;for(const order of component)projection.set(order.key,key);}component=[];};
    for(const order of bucket){if(component.length&&order.date-component.at(-1).date>window)flush();component.push(order);}flush();
  }
  claimProjections.set(database,projection);return projection;
}

export function acquisitionHistory(records,database){
  const entries=new Map(),fanGroups=new Map();
  const add=(key,record,source={})=>{
    const entry=entries.get(key)??{key,provider:record.provider,records:[],bundles:[],titles:[],dates:[],confirmedPurchase:false,quantity:1};
    if(!entry.records.includes(record))entry.records.push(record);
    entry.bundles=unique([...entry.bundles,source.bundle]);entry.titles=unique([...entry.titles,record.title]);
    entry.dates=unique([...entry.dates,source.date]);entry.confirmedPurchase||=source.confirmed===true;entries.set(key,entry);return entry;
  };
  for(const record of records){
    if(database.providerHistory?.[record.recordRef]?.reason==='duplicate-observation')continue;
    const scope=JSON.stringify([record.provider,record.profileId??'']),metadata=record.metadata??{};
    if(record.provider==='humble'&&metadata.purchaseId){
      const entry=add(humbleOrder(record),record,{bundle:metadata.sourceBundle,date:record.acquiredAt,confirmed:true});entry.purchaseRef=metadata.purchaseId;continue;
    }
    if(record.provider==='fanatical'&&metadata.purchaseOrigins?.length){
      const perRecord=new Map();
      for(const origin of metadata.purchaseOrigins){
        const key=scope+':order:'+JSON.stringify([origin.orderRef,origin.bundleId]),group=fanGroups.get(key)??{native:new Set(),maximum:0};
        if(!origin.basis)group.native.add(origin.occurrenceRef);
        perRecord.set(key,(perRecord.get(key)??0)+1);fanGroups.set(key,group);
        const entry=add(key,record,{bundle:origin.bundleTitle,date:origin.purchasedAt,confirmed:true});entry.purchaseRef=origin.orderRef;
      }
      for(const [key,count]of perRecord)fanGroups.get(key).maximum=Math.max(fanGroups.get(key).maximum,count);
      continue;
    }
    // A catalog record without an order/occurrence is not another proven purchase.
    add(scope+':record:'+(record.providerItemId||record.recordRef),record,{bundle:metadata.sourceBundle||metadata.bundleTitle,date:acquisitionDate(record)});
  }
  for(const [key,group]of fanGroups)entries.get(key).quantity=Math.max(group.native.size,group.maximum);
  const claims=repeatedClaimProjection(database),groups=new Map();
  for(const entry of entries.values()){
    const key=claims.get(entry.key)??entry.key,group=groups.get(key)??{...entry,key,records:[],bundles:[],titles:[],dates:[],transactions:[]};
    group.transactions.push(entry);group.records=unique([...group.records,...entry.records]);
    for(const field of ['bundles','titles','dates'])group[field]=unique([...group[field],...entry[field]]);
    groups.set(key,group);
  }
  const history=[...groups.values()].sort((a,b)=>(a.dates[0]??'9999').localeCompare(b.dates[0]??'9999')||a.key.localeCompare(b.key));
  let purchases=0,ownedPurchases=0;
  const now=Date.now(),owned=record=>!record.historical&&['owned','claimed'].includes(effectiveOwnershipRecord(record,database,now,{ignoreOverride:true}).ownership);
  for(const entry of history){entry.claims=entry.transactions.length;entry.accounts=unique(entry.records.map(record=>accountLabel(record,database)));
    entry.access=unique(entry.records.map(record=>record.historical?'Earlier record; not in the latest complete scan (previously '+accessLabel(record.ownership)+')':accessLabel(effectiveOwnershipRecord(record,database,now,{ignoreOverride:true}).ownership)));
    if(entry.confirmedPurchase){purchases++;if(entry.records.some(owned))ownedPurchases++;}
  }
  // Unlinked catalogs/Steam activation can establish access to one copy, never an extra purchase.
  const ownedGroups=Math.max(ownedPurchases,records.some(record=>!record.historical&&['owned','claimed'].includes(effectiveOwnershipRecord(record,database,now).ownership))?1:0);
  const repeated=history.filter(entry=>entry.claims>1),claimCount=repeated.reduce((sum,entry)=>sum+entry.claims,0);
  const label=ownedPurchases>1?(ownedPurchases===2?'Owned twice':`Owned ${ownedPurchases} times`):repeated.length?`${claimCount} claims in ${repeated.length} acquisition group${repeated.length===1?'':'s'}`:purchases>1?`${purchases} recorded acquisition groups`:history.length>1?'Multiple library records':'';
  return {entries:history,purchases,ownedPurchases,ownedGroups,label};
}

const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
function datesLabel(dates,{month=false}={}){
  const sorted=unique(dates).sort((a,b)=>Date.parse(a)-Date.parse(b));if(!sorted.length)return 'Not recorded';
  const first=sorted[0],last=sorted.at(-1),date=value=>/^\d{4}-\d{2}-\d{2}$/u.test(value)?new Date(value+'T12:00:00'):new Date(value);
  if(month&&date(first).getFullYear()===date(last).getFullYear()&&date(first).getMonth()===date(last).getMonth())return date(first).toLocaleDateString(undefined,{month:'long',year:'numeric'});
  return first===last?formatDate(first,{time:false}):formatDate(first,{time:false})+' to '+formatDate(last,{time:false});
}
function transactionItem(entry,database){
  const item=text('li','');item.append(text('strong',providerLabel(entry.provider)+' \u2014 '+(entry.bundles[0]||entry.titles[0])));
  item.append(text('p',unique(entry.records.map(record=>accountLabel(record,database))).join('; ')));
  item.append(text('p',(entry.confirmedPurchase?'Purchase date: ':'Acquisition date: ')+(entry.dates.length?entry.dates.map(date=>formatDate(date)).join('; '):'Not recorded')));
  if(entry.purchaseRef)item.append(text('p','Transaction reference: '+entry.purchaseRef));
  item.append(text('p','Source item references: '+unique(entry.records.map(record=>record.providerItemId||record.recordRef)).join('; ')));
  if(entry.dates.length)item.append(text('small','Saved dates: '+entry.dates.join('; ')));
  if(entry.quantity>1)item.append(text('p',entry.quantity+' copies recorded in this order'));
  return item;
}
export function createAcquisitionHistory(history,database={}){
  const details=text('details','');details.className='library-purchase-history';details.append(text('summary','Purchase and access history'));
  let built=false;details.addEventListener('toggle',()=>{if(!details.open||built)return;built=true;const list=text('ul','');
    for(const entry of history.entries){const item=text('li','');
      item.append(text('strong',providerLabel(entry.provider)+' \u2014 '+(entry.bundles[0]||entry.titles[0])+(entry.claims>1?` \u2014 ${entry.claims} claims (${datesLabel(entry.dates,{month:true})})`:'')));
      item.append(text('p',entry.accounts.join('; ')));
      if(entry.claims===1)item.append(text('p',(entry.confirmedPurchase?'Purchase date: ':'Acquisition date: ')+datesLabel(entry.dates)));
      item.append(text('p',entry.access.join('; ')));
      if(entry.records.some(record=>record.metadata?.acquisitionMethod==='permanent-claim'||record.metadata?.ownershipBasis==='free-claim'))item.append(text('p','Acquisition method: Permanently claimed'));
      if(!entry.confirmedPurchase)item.append(text('small','Purchase details are not recorded; this is a saved library record.'));
      if(entry.provider==='amazon-games'){
        const originals=Object.values(database.providerHistory??{}).filter(value=>value.reason==='duplicate-observation'&&entry.records.some(record=>record.recordRef===value.duplicateOf));
        if(originals.length){const saved=text('details','');saved.append(text('summary','Earlier observations ('+originals.length+')'));
          saved.addEventListener('toggle',()=>{if(!saved.open||saved.dataset.built)return;saved.dataset.built='true';const list=text('ul','');for(const value of originals)list.append(text('li',value.item.title+' — '+value.item.providerItemId));saved.append(list);});item.append(saved);}
      }
      if(entry.confirmedPurchase){const originals=text('details','');originals.className='acquisition-transactions';originals.append(text('summary',entry.claims>1?'Original transactions ('+entry.claims+')':'Original transaction'));let loaded=false;
        originals.addEventListener('toggle',()=>{if(!originals.open||loaded)return;loaded=true;const transactions=text('ul','');for(const transaction of entry.transactions)transactions.append(transactionItem(transaction,database));originals.append(transactions);});item.append(originals);
      }
      list.append(item);
    }details.append(list);
  });return details;
}
