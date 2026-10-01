import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFanaticalOrdersInPage } from '../src/providers/fanatical-scan.js';

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
    for(const reply of [
      path=>path==='/api/user/orders'?{status:200,headers:{'x-total-count':'2'},data:[entry]}:{status:200,data:entry},
      ()=>({status:200,headers:{link:'<https://foreign.example/api/user/orders?page=2>; rel="next"'},data:[entry]}),
      path=>({status:200,data:path==='/api/user/orders'?[entry]:{...entry,items:[]}})
    ])await assert.rejects(harness(reply).scan({fullScan:true}),/incomplete|unreadable/);
  }]
];
