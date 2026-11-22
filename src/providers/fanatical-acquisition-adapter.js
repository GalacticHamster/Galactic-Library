// Self-contained projection, embedded by sync-provider-engines for MAIN serialization.
import {assertFanaticalAcquisitionContract,fanaticalCompatibilityReport} from '../../shared/provider-acquisition-contract.js';
export function fanaticalAcquisitionForGL(raw,options={}){
  const code=raw?.code??raw?.failures?.find(f=>f.code!=='discovery-unverified')?.code;
  const d=raw?.diagnostic??{},partial=raw?.acquisitionContract?.acquisition.outcome==='interrupted';
  const failureStage=raw?.failures?.find(f=>f.code!=='discovery-unverified')?.stage;
  const category=code?.startsWith('authentication')?'authentication':['session-changed','account-scope-conflict','order-identity-conflict'].includes(code)?'scope':
    code?.includes('limit')?'limit':code==='page-exception'?'unknown':failureStage==='summaries'||code?.startsWith('summaries')||code==='pagination-order'&&!d.ordersRecognized&&raw?.fanaticalImportFailure?'summary':failureStage==='details'||code?.startsWith('details')?'detail':
    code==='listing-unreadable'&&(d.listingEvidence?.objectPages||d.listingEvidence?.otherPages)?'shape':code?.startsWith('pagination')||code==='history-missing-known'?'continuation':code?'listing':'none';
  const count=n=>Number.isSafeInteger(n)?Math.min(100000,Math.max(0,n)):0;
  const phase=d.stage==='authentication'?'initial-listing':d.stage==='listing'?(d.pagesAttempted>1?'pagination':'initial-listing'):d.stage==='session'?'projection':d.stage==='summaries'?'summaries':d.stage==='details'?'details':'projection';
  const diagnostic={version:1,countsAvailable:true,category,stage:raw?.fanaticalImportFailure?phase:failureStage==='summaries'?'summaries':failureStage==='details'?'details':code?'pagination':'projection',
    pagesAttempted:count(d.pagesAttempted??raw?.coverage?.pagesFetched),pagesParsed:count(d.pagesParsed??raw?.coverage?.pagesParsed),ordersDiscovered:count(d.ordersRecognized??raw?.coverage?.listedOrders),ordersValidated:count(raw?.ordersScanned),ordersUnresolved:count(raw?.unresolvedOrderFingerprints?.length),detailsAttempted:count(raw?.coverage?.compatibility?.counts?.scheduled??d.detailsParsed??raw?.ordersScanned),detailsParsed:count(d.detailsParsed??raw?.ordersScanned),continuationPending:partial&&raw?.outcome==='partial-discovery',acquisitionFinished:!raw?.fanaticalImportFailure&&!partial};
  const compatibility=fanaticalCompatibilityReport(raw?.coverage?.compatibility??d.compatibility);
  if(compatibility)diagnostic.compatibility=compatibility;
  const fail=()=>{
    diagnostic.acquisitionFinished=false;
    if(options.diagnostics)return {fanaticalFailure:1,diagnostic};
    throw Error('Fanatical acquisition incomplete or unreadable. Earlier purchases were kept.');
  };
  if(raw?.fanaticalImportFailure)return fail();
  const authority=assertFanaticalAcquisitionContract(raw,options);
  // Verified components of a partially resolved order are admissible on
  // their own; the order itself stays in the retry set.
  const partialOrders=[...(raw.partialOrderFingerprints??[])];
  if(partial&&!raw.orderFingerprints.length&&!partialOrders.length)return fail();
  const blocked=new Map(), items=[];
  for(const item of raw.items){
    if ((item.occurrences?.length??0)>500) {
      for(const {orderRef} of item.occurrences)blocked.set(orderRef,(blocked.get(orderRef)??0)+1);
      continue;
    }
    // GL deliberately projects only its supported catalog types. FAN retains others.
    items.push({...item,mediaType:item.mediaType==='unclassified'?'other':item.mediaType,purchaseOrigins:item.occurrences});
  }
  const incomplete=partial||blocked.size>0;
  const failures=[...new Set([...(raw.unresolvedOrderFingerprints??[]),...blocked.keys()])];
  const fingerprints=raw.orderFingerprints.filter(id=>!blocked.has(id));
  const ordersScanned=raw.ordersScanned-(raw.verifiedOrderFingerprints??[]).filter(id=>blocked.has(id)).length;
  const ordersAvailable=fingerprints.length+failures.length;
  const scopes=new Map((raw.componentScopes??[]).map(s=>[s.order,s]));
  if(blocked.size){
    diagnostic.category='limit';diagnostic.stage='projection';diagnostic.acquisitionFinished=false;
    diagnostic.ordersValidated=count(ordersScanned);diagnostic.ordersUnresolved=count(failures.length);
    const surviving=new Set(items.flatMap(item=>(item.purchaseOrigins??[]).map(origin=>origin.orderRef)));
    for(const [order,unresolved] of blocked){
      if(!surviving.has(order)&&!scopes.has(order))continue;
      const prior=scopes.get(order);
      if(!prior)partialOrders.push(order);
      scopes.set(order,{order,unresolved:Math.min(100000,(prior?.unresolved??0)+unresolved),bundles:prior?.bundles??[]});
    }
    // Keep confirmed quantities, but treat the order's exact positions as
    // provisional until all of its evidence can be admitted by this consumer.
    for(const item of items)item.purchaseOrigins=item.purchaseOrigins.map(origin=>blocked.has(origin.orderRef)
      ? {...origin,basis:'order-bundle-count'} : origin);
  }
  const {compatibility:ignoredCompatibility,...coverage}=raw.coverage;
  return {...(options.diagnostics?{diagnostic}:{}),acquisitionContract:raw.acquisitionContract,schemaVersion:1,acquisitionComplete:!incomplete,
    ...(incomplete?{recovery:{failedOrderFingerprints:failures,failedOrders:failures.length,listingIncomplete:raw.outcome==='partial-discovery'&&partial,ordersSkipped:fingerprints.length-ordersScanned,...(partialOrders.length?{partialOrderFingerprints:partialOrders,componentScopes:[...scopes.values()]}:{})}}:{}),
    coverage:{...coverage,complete:!incomplete&&coverage.complete,validatedOrders:ordersScanned},ordersScanned,ordersAvailable,orderFingerprints:fingerprints,items,
    ...(authority.rejectedPurchaseItems!==undefined?{rejectedPurchaseItems:authority.rejectedPurchaseItems}:{})};
}
