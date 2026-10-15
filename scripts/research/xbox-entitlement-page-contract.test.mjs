import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inspectTraversal} from './xbox-entitlement-page-contract.mjs';
const feed=pages=>{let n=0;return async()=>pages[n++];};
const page=(items,next)=>({status:200,body:{items,...next===undefined?{}:{continuationToken:next}}});
test('Collections walks beyond 100 observations without any launch-history input',async()=>{
  const first=Array.from({length:100},(_,i)=>({productId:'SYNTHETIC-'+i,skuId:'0010',status:'Active'}));
  let calls=0;
  const r=await inspectTraversal(async request=>{
    assert.equal(request.continuationToken,calls===0?null:'opaque-page-2');
    return ++calls===1?page(first,'opaque-page-2'):page([{productId:'NEVER-LAUNCHED',skuId:'0010'}]);
  });
  assert.equal(r.items.length,101);assert.equal(r.pages,2);assert.equal(r.traversalComplete,true);
  assert.equal(r.accountLibraryComplete,false);assert.equal(r.ownershipEstablished,false);
});
test('Preserves separate SKUs, grant states, bundles and legacy identifiers without catalog filtering',async()=>{
  const rows=[{productId:'SYNTHETIC',skuId:'0010',status:'Active',ownershipType:'OwnedByBeneficiary'},
    {productId:'SYNTHETIC',skuId:'0020',status:'Expired'},
    {productId:'00000000-0000-0000-0000-000000000001',status:'Revoked'},
    {productId:'BUNDLE',productKind:'Bundle'},{productId:'DLC',productKind:'Durable'}];
  const before=JSON.stringify(rows),r=await inspectTraversal(feed([page(rows)]));
  assert.deepEqual(r.items,rows);assert.equal(JSON.stringify(rows),before);assert.equal(r.ownershipEstablished,false);
});
test('Legacy inventory uses nested pagingInfo rather than silently stopping at its first page',async()=>{
  const r=await inspectTraversal(feed([{status:200,body:{items:[{titleId:'old'}],pagingInfo:{continuationToken:'next'}}},
    {status:200,body:{items:[{titleId:'older'}],pagingInfo:{continuationToken:null}}}]),{source:'inventory'});
  assert.equal(r.items.length,2);assert.equal(r.traversalComplete,true);
});
test('An empty page with a continuation is not an empty or complete library',async()=>{
  const r=await inspectTraversal(feed([page([],'next'),page([{productId:'later'}])]));
  assert.equal(r.pages,2);assert.equal(r.items.length,1);assert.equal(r.traversalComplete,true);
});
test('401/403, transport failure and malformed pages preserve partial work without completeness claims',async()=>{
  for(const tail of [{status:401},{status:403},{status:200,body:{}},null]) {
    const r=await inspectTraversal(feed([page([{productId:'first'}],'next'),tail]));
    assert.equal(r.items.length,1);assert.equal(r.traversalComplete,false);
  }
  const r=await inspectTraversal(async()=>{throw Error('Sensitive server response must not be echoed');});
  assert.equal(r.reason,'transport-failure');assert(!JSON.stringify(r).includes('Sensitive'));
});
test('Page bound and repeated continuation never masquerade as complete enumeration',async()=>{
  const a=await inspectTraversal(feed([page([],'next')]),{maxPages:1});
  assert.equal(a.reason,'page-bound');assert.equal(a.traversalComplete,false);
  const b=await inspectTraversal(feed([page([],'same'),page([],'same')]));
  assert.equal(b.reason,'continuation-cycle');assert.equal(b.traversalComplete,false);
  const c=await inspectTraversal(feed([page([])]),{maxPages:1});assert.equal(c.traversalComplete,true);
});
test('Invalid pagination and unproven legacy shapes fail explicitly',async()=>{
  const a=await inspectTraversal(feed([page([],123)]));assert.equal(a.reason,'invalid-continuation');
  const b=await inspectTraversal(feed([page([])]),{source:'inventory'});
  assert.equal(b.reason,'missing-paging-info');assert.equal(b.traversalComplete,false);
});
