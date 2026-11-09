import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import {importFanaticalOrdersInPage as candidate} from '../shared/fanatical-acquisition.js';
import {importFanaticalOrdersInPage as baseline} from '../../Fanatical/src/order-importer.mjs';
const order=n=>({_id:'order-00000'+n,status:'COMPLETE',items:[{_id:'bundle-000001',name:'Synthetic bundle',bundles:[{games:[{_id:'product-00000'+n,name:'Synthetic book '+n,type:'book'}]}]}]});
function run(engine,{pages=[{data:[order(1),order(1)]}],...options}={}){
  const paths=[];let index=0;
  const ctx=vm.createContext({URL,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,localStorage:{getItem:()=>'{"token":"PRIVATE"}'},fetch:async path=>{
    paths.push(path);const response=path.includes('/orders/')?{data:[order(1),order(2)].find(o=>path.endsWith(o._id))}:pages[index++];
    return {status:200,headers:new Headers(response.headers??{}),json:async()=>response.data};}});
  return {paths,result:vm.runInContext('('+engine.toString()+')',ctx)({fullScan:true,...options})};
}
for(const fullScan of [true,false])for(const later of [false,true])test(`candidate strict duplicates reject before detail requests (full=${fullScan}, later=${later})`,async()=>{
  const pages=later?[{data:[order(1)],headers:{link:'<?page=2>; rel="next"'}},{data:[order(1)]}]:[{data:[order(1),order(1)]}];
  for(const engine of [baseline,candidate]){const h=run(engine,{fullScan,pages});await assert.rejects(h.result,/incomplete|unreadable/);assert(h.paths.every(p=>!p.includes('/orders/')));}
});
test('candidate partial duplicate handling preserves peers and withholds coverage',async()=>{
  for(const conflicting of [false,true]){
    const h=run(candidate,{allowPartial:true,pages:[{data:[order(1),conflicting?{...order(1),status:'REFUNDED'}:order(1),order(2)]}]});const result=await h.result;
    assert.equal(result.coverage.complete,false);assert.equal(result.items.length,conflicting?1:2);assert.equal(result.unresolvedOrderFingerprints.length,conflicting?1:0);
    assert.equal(h.paths.filter(p=>p.includes('/orders/')).length,conflicting?1:2);
  }
});
test('candidate projection-only result retains the baseline exact allowlist',async()=>{
  const input={operation:'project',orderSummaries:[order(1)],orderDetails:[order(1)]};
  const a=await run(baseline,input).result,b=await run(candidate,input).result;
  assert.deepEqual(structuredClone(b),structuredClone(a));assert(!Object.hasOwn(b.items[0],'occurrences'));
});
