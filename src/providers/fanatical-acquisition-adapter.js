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
  assertFanaticalAcquisitionContract(raw,options);
  if(partial&&!raw.orderFingerprints.length)return fail();
  const items=raw.items.map(item=>{
    if((item.occurrences?.length??0)>500){diagnostic.category='limit';diagnostic.stage='projection';return null;}
    // GL deliberately projects only its supported catalog types. FAN retains others.
    return {...item,mediaType:item.mediaType==='unclassified'?'other':item.mediaType,purchaseOrigins:item.occurrences};
  });
  if(items.some(item=>!item))return fail();
  const failures=raw.unresolvedOrderFingerprints??[],ordersAvailable=raw.orderFingerprints.length+failures.length;
  const {compatibility:ignoredCompatibility,...coverage}=raw.coverage;
  return {...(options.diagnostics?{diagnostic}:{}),acquisitionContract:raw.acquisitionContract,schemaVersion:1,acquisitionComplete:!partial,
    ...(partial?{recovery:{failedOrderFingerprints:failures,failedOrders:failures.length,listingIncomplete:raw.outcome==='partial-discovery',ordersSkipped:raw.orderFingerprints.length-raw.ordersScanned}}:{}),
    coverage:{...coverage,validatedOrders:raw.ordersScanned},ordersScanned:raw.ordersScanned,ordersAvailable,orderFingerprints:raw.orderFingerprints,items};
}
