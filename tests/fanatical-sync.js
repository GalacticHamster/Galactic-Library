import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFanaticalOrdersInPage } from '../src/providers/fanatical-scan.js';
import {fanaticalCoverageTests} from './fanatical-coverage.js';

const order=n=>({_id:`order-${String(n).padStart(6,'0')}`,status:'COMPLETE',items:[{_id:'bundle-123456',name:'Bundle',bundles:[{games:[{_id:`game-${String(n).padStart(6,'0')}`,name:`Game ${n}`,type:'game'}]}]}]});
function harness(reply) {
  let active=0,maxActive=0;const paths=[];
  const context=vm.createContext({URL,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,
    localStorage:{getItem:()=>JSON.stringify({token:'PRIVATE_TOKEN'})},fetch:async(path)=>{
      paths.push(path);active++;maxActive=Math.max(maxActive,active);
      try{await new Promise(done=>setTimeout(done,1));const result=await reply(path,paths);
        return {ok:result.status>=200&&result.status<300,status:result.status,headers:new Headers(result.headers),json:async()=>result.data};
      }finally{active--;}
    }});
  const scan=vm.runInContext(`(${readFanaticalOrdersInPage.toString()})`,context);
  return {scan,paths,get maxActive(){return maxActive;}};
}
export const fanaticalSyncTests=[
  ...fanaticalCoverageTests,
  ['Fanatical serialized scanner retains separate opaque occurrences for repeated product purchases',async()=>{
    const orders=[order(1),order(2)];for(const [index,entry]of orders.entries()){entry.date=`2026-09-${index?'20':'10'}T00:00:00Z`;entry.items[0].name=`Bundle ${index}`;entry.items[0].bundles[0].games[0]={_id:'shared-product',name:'Repeated book',type:'book'};}
    const run=harness(path=>({status:200,data:path==='/api/user/orders'?orders:orders.find(entry=>path.endsWith(entry._id))}));const result=await run.scan({fullScan:true});assert.equal(result.items.length,1);assert.equal(result.items[0].purchaseOrigins.length,2);assert.equal(new Set(result.items[0].purchaseOrigins.map(entry=>entry.occurrenceRef)).size,2);
    assert(!JSON.stringify(result).includes('order-000001'));assert(!JSON.stringify(result).includes('PRIVATE_TOKEN'));assert.deepEqual([...result.items[0].purchaseOrigins.map(entry=>entry.bundleTitle)].sort(),['Bundle 0','Bundle 1']);
  }],
  ['Fanatical shipped scanner bounds a large library to three active requests and follows validated pagination',async()=>{
    const orders=Array.from({length:12},(_,n)=>order(n));
    const run=harness(path=>path==='/api/user/orders'?{status:200,headers:{link:'</api/user/orders?page=2>; rel="next"','x-total-count':'12'},data:orders.slice(0,6)}:
      path==='/api/user/orders?page=2'?{status:200,headers:{'x-total-count':'12'},data:orders.slice(6)}:{status:200,data:orders.find(item=>path.endsWith(item._id))});
    const result=await run.scan({fullScan:true});assert.equal(result.items.length,12);assert.equal(result.coverage.pagesFetched,2);assert.equal(run.maxActive,3);
    assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  }],
  ['Fanatical retryable failures recover but changing totals, unsafe links and malformed details never certify coverage',async()=>{
    const entry=order(1);let attempts=0;
    const retry=harness(path=>path==='/api/user/orders'?{status:200,data:[entry]}:++attempts===1?{status:429,headers:{'retry-after':'0'},data:[]}:{status:200,data:entry});
    assert.equal((await retry.scan({fullScan:true})).coverage.retries,1);
    const counted=harness(path=>path==='/api/user/orders'?{status:200,headers:{'x-total-count':'2'},data:[entry]}:{status:200,data:entry});
    const partial=await counted.scan({fullScan:true});assert.equal(partial.coverage.complete,false);assert.equal(partial.items.length,1);assert(partial.recovery.listingIncomplete);
    for(const reply of [
      ()=>({status:200,headers:{link:'<https://foreign.example/api/user/orders?page=2>; rel="next"'},data:[entry]}),
      path=>({status:200,data:path==='/api/user/orders'?[entry]:{...entry,items:[]}})
    ])await assert.rejects(harness(reply).scan({fullScan:true}),/incomplete|unreadable/);
  }]
];
fanaticalSyncTests.push(['Fanatical count/range/link acquisition receipts distinguish real completion from contradictory last-page claims',async()=>{
  const a=order(1),b=order(2);
  for(const evidence of ['count','range','link']){
    const run=harness(path=>{
      if(path==='/api/user/orders')return {status:200,data:[a],headers:{link:'</api/user/orders?page=2>; rel="next", </api/user/orders?page=2>; rel="last"',...(evidence==='count'?{'x-total-count':'2'}:evidence==='range'?{'content-range':'orders 0-0/2'}:{})}};
      if(path==='/api/user/orders?page=2')return {status:200,data:[b],headers:evidence==='range'?{'content-range':'orders 1-1/2'}:{}};
      return {status:200,data:path.endsWith(a._id)?a:b};
    });
    const result=await run.scan({fullScan:true});assert.equal(result.coverage.complete,true);assert(result.acquisitionComplete);assert.equal(result.coverage.paginationEvidence,evidence);assert.equal(result.items.length,2);
  }
  const early=harness(path=>path==='/api/user/orders'?{status:200,data:[a],headers:{link:'</api/user/orders?page=2>; rel="next", </api/user/orders?page=3>; rel="last"'}}:path==='/api/user/orders?page=2'?{status:200,data:[b]}:{status:200,data:path.endsWith(a._id)?a:b});
  const partial=await early.scan({fullScan:true});assert.equal(partial.coverage.complete,false);assert.equal(partial.items.length,2);assert(partial.recovery.listingIncomplete);
}]);
