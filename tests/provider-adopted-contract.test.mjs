// Current production behavior, separate from frozen pre-adoption comparisons.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readFanaticalOrdersInPage as gl} from '../src/providers/fanatical-scan.js';
import {importFanaticalOrdersInPage as fan} from '../../Fanatical/src/order-importer.mjs';
import {fanaticalFixture} from './provider-engine-differential.test.mjs';
const hash=id=>createHash('sha256').update(id).digest('hex');
const purchase=n=>({_id:`order-${n}00000`,status:'COMPLETE',date:'2026-01-01',items:[{_id:'bundle-000001',name:'Synthetic bundle',bundles:[{games:[{_id:`product-${n}00000`,name:`Synthetic book ${n}`,type:'book'}]}]}]});
const a=purchase(1),b=purchase(2);
for(const [name,input,expectedGL,expectedFAN]of [
  ['complete',{},[false,2,true,0],[false,2,true,0]],
  ['verified empty',{list:[],headers:{'x-total-count':'0'}},[false,0,true,0],[false,0,true,0]],
  ['range',{headers:{'content-range':'orders 0-1/2'}},[false,2,true,0],[false,2,true,0]],
  ['bare array',{headers:{}},[false,2,true,0],[false,2,true,0]],
  ['later unreadable page',{list:[a],headers:{link:'</api/user/orders?page=2>; rel="next"'},next:{data:{unknown:[]}}},[false,1,false,0],[false,1,false,0]],
  ['later failed page',{list:[a],headers:{link:'</api/user/orders?page=2>; rel="next"'},next:{status:404}},[false,1,false,0],[false,1,false,0]],
  ['identical duplicate',{list:[a,a],headers:{}},[false,1,false,0],[false,1,false,0]],
  ['contradictory duplicate',{list:[a,{...a,status:'REFUNDED'}],headers:{}},[true,0,false,0],[false,0,false,1]],
  ['unknown status',{list:[a,{...b,status:'REVIEW'}]},[false,1,false,1],[false,1,false,1]],
  ['explicit ineligible',{list:[a,{...b,status:'REFUNDED'}]},[false,1,true,0],[false,1,true,0]],
  ['foreign order response',{detail:{[b._id]:{...b,_id:'foreign-order'}}},[true,0,false,0],[true,0,false,0]],
  ['malformed detail',{detail:{[b._id]:{}}},[false,1,false,1],[false,1,false,1]],
  ['missing known with overlap',{list:[a],headers:{'x-total-count':'1'},known:[hash(a._id),hash('missing-order')]},[false,1,false,0],[false,1,false,0]],
  ['disjoint account',{known:[hash('unrelated-order')]},[true,0,false,0],[true,0,false,0]],
  ['session changes',{sessionChange:true},[true,0,false,0],[true,0,false,0]]
])test('adopted production contract: '+name,async()=>{
  for(const [engine,expected]of [[gl,expectedGL],[fan,expectedFAN]]){
    const {result,summary}=await fanaticalFixture(engine,input);
    assert.deepEqual(Object.values(summary),expected);
    if(!summary.fatal){assert.equal(result.acquisitionContract.persistence.outcome,'not-attempted');assert.equal(result.acquisitionContract.reconciliation.authority,'none');if(name==='bare array'){assert.equal(result.acquisitionContract.coverage.evidence.length,1);assert.equal(result.acquisitionContract.coverage.evidence[0],'array-only');assert.equal(result.coverage.expectedTotal,null);}}
  }
});
