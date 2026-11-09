// Synthetic provider responses. Differences are explicit until each migration passes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {readFanaticalOrdersInPage} from './fixtures/fanatical-pre-adoption-gl.mjs';
import {importFanaticalOrdersInPage} from './fixtures/fanatical-pre-adoption-fan.mjs';
import {importer,order,bookDetail} from '../../HB/tests/partial-import-fixture.mjs';

const hash=id=>createHash('sha256').update(id).digest('hex');
const purchase=n=>({_id:`order-${n}00000`,status:'COMPLETE',date:'2026-01-01',items:[{_id:'bundle-000001',name:'Synthetic bundle',bundles:[{games:[{_id:`product-${n}00000`,name:`Synthetic book ${n}`,type:'book'}]}]}]});
const a=purchase(1),b=purchase(2);
export async function fanaticalFixture(engine,{list=[a,b],headers={'x-total-count':'2'},detail={},next,known=[],sessionChange=false}={}){
  const paths=[];let reads=0;
  const context=vm.createContext({URL,Headers,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:webcrypto,
    localStorage:{getItem:()=>JSON.stringify({token:sessionChange&&reads++?'CHANGED_SECRET':'PRIVATE_SECRET'})},
    fetch:async path=>{paths.push(path);const listing=path==='/api/user/orders';const value=listing?{data:list,headers}:path.includes('?')?next:{data:detail[path.split('/').at(-1)]??[a,b].find(o=>path.endsWith(o._id))};
      return {ok:(value?.status??200)===200,status:value?.status??200,headers:new Headers(value?.headers??{}),json:async()=>structuredClone(value?.data)};}});
  const run=vm.runInContext(`(${engine.toString()})`,context);
  const result=await run({fullScan:true,knownOrderFingerprints:known,accountOrderFingerprints:known,allowPartial:true,diagnostics:true,returnFailure:true});
  const serialized=JSON.stringify(result);assert(!serialized.includes('PRIVATE_SECRET'));assert(!serialized.includes('CHANGED_SECRET'));
  assert(!serialized.includes(a._id),'Raw Fanatical order ID crossed the page boundary');
  const fatal=Boolean(result.fanaticalFailure||result.fanaticalImportFailure);
  return {result,paths,summary:{fatal,products:result.items?.length??0,coverage:result.coverage?.complete??false,
    unresolved:result.unresolvedOrderFingerprints?.length??result.recovery?.failedOrders??0}};
}

// [GL today, FAN today]. Canonical policy is deliberately separate from baseline.
const fanaticalCases=[
  ['complete',{},[false,2,true,0],[false,2,true,0],'same'],
  ['empty',{list:[],headers:{'x-total-count':'0'}},[false,0,true,0],[false,0,true,0],'same'],
  ['range',{headers:{'content-range':'orders 0-1/2'}},[false,2,true,0],[false,2,true,0],'same'],
  ['bare array',{headers:{}},[false,2,false,0],[false,2,false,0],'representation: clean acquisition, unverified coverage'],
  ['later shape',{list:[a],headers:{link:'</api/user/orders?page=2>; rel="next"'},next:{data:{unknown:[]}}},[true,0,false,0],[false,1,false,0],'defect: preserve independently validated first page'],
  ['later failure',{list:[a],headers:{link:'</api/user/orders?page=2>; rel="next"'},next:{status:404}},[false,1,false,0],[false,1,false,0],'same'],
  ['identical duplicate',{list:[a,a],headers:{}},[false,1,false,0],[true,0,false,0],'defect: deduplicate identical evidence without claiming coverage'],
  ['conflicting duplicate',{list:[a,{...a,status:"REFUNDED"}],headers:{}},[false,1,false,0],[true,0,false,0],'defect: conflicting identity cannot be verified'],
  ['unknown status',{list:[a,{...b,status:'REVIEW'}]},[false,1,false,1],[false,1,false,1],'same: unresolved, never absence'],
  ['ineligible',{list:[a,{...b,status:'REFUNDED'}]},[false,1,true,0],[false,1,true,0],'same: explicit ineligibility distinct from unresolved'],
  ['wrong detail',{detail:{[b._id]:{...b,_id:'foreign-order'}}},[false,1,false,1],[true,0,false,0],'defect: explicit identity conflict remains fatal'],
  ['malformed detail',{detail:{[b._id]:{}}},[false,1,false,1],[false,1,false,1],'same'],
  ['missing known with affinity',{list:[a],headers:{'x-total-count':'1'},known:[hash(a._id),hash('missing-order')]},[true,0,false,0],[false,1,false,0],'defect: preserve validated purchases, withhold reconciliation'],
  ['account mismatch',{known:[hash('unrelated-order')]},[true,0,false,0],[true,0,false,0],'same: no account affinity'],
  ['session change',{sessionChange:true},[true,0,false,0],[true,0,false,0],'same: fatal'],
];
for(const [name,input,gl,fan,policy]of fanaticalCases)test('Fanatical differential: '+name+' ['+policy+']',async()=>{
  for(const [engine,expected]of [[readFanaticalOrdersInPage,gl],[importFanaticalOrdersInPage,fan]]){
    const value=await fanaticalFixture(engine,input);assert.deepEqual(Object.values(value.summary),expected);
    if(!value.summary.fatal){assert(value.result.orderFingerprints.every(fp=>/^[a-f0-9]{64}$/u.test(fp)));assert(value.result.items.every(i=>i.sourceItemId&&i.purchaseOrigins?.length));}
  }
});

async function humbleFixture(orders,details){
  const hb=importer({},orders,details);let hbResult,hbError;
  try{hbResult=await hb.scan();}catch(e){hbError=e;}
  const paths=[];const context=vm.createContext({URL,console,Map,Set,setTimeout:fn=>{fn();return 0;},fetch:async path=>{
    if(path.startsWith('/api/v1/user/'))return {ok:true,json:async()=>orders};const id=decodeURIComponent(path.match(/\/order\/([^?]+)/u)[1]);paths.push(id);return {ok:true,status:200,text:async()=>JSON.stringify(details[id])};}});
  for(const file of ['provider-snapshot','humble'])vm.runInContext(fs.readFileSync(new URL('../src/providers/'+file+'.js',import.meta.url),'utf8'),context);
  let glResult,glError;try{glResult=await context.GalacticHumble.fetchHumblePurchases();}catch(e){glError=e;}
  return {hb:{fatal:Boolean(hbError),products:hb.stored.libraryItems?.length??0,coverage:hbResult?.reconciled??false,requests:hb.requests.length},
    gl:{fatal:Boolean(glError),products:glResult?.items.length??0,coverage:glResult?.snapshot.complete??false,requests:paths.length}};
}
const h=order('synthetic-order'),book=bookDetail('Synthetic book');
for(const [name,orders,details,gl,hb,policy]of [
  ['complete',[h],{[h.gamekey]:book},[false,1,true,1],[false,1,true,1],'same'],
  ['empty',[],{},[false,0,true,0],[false,0,true,0],'same'],
  ['multiple',[h,order('second-order')],{[h.gamekey]:book,'second-order':bookDetail('Second book')},[false,2,true,2],[false,2,true,2],'same'],
  ['duplicate',[h,h],{[h.gamekey]:book},[false,1,true,2],[false,1,true,2],'shared defect: schedule once'],
  ['detail-level',[h],{[h.gamekey]:{human_name:'Synthetic book',downloads:[{url:'https://example.invalid/a.epub'}]}},[true,0,false,1],[false,1,true,1],'defect: validated detail-level product supported'],
  ['unclassified',[h],{[h.gamekey]:{subproducts:[{human_name:'Unknown type',machine_name:'unknown',downloads:[{url:'https://example.invalid/a.xyz'}]}]}},[true,0,false,1],[false,1,true,1],'product adapter: evidence survives unsupported classification'],
  ['wrong identity',[h,order('second-order')],{[h.gamekey]:book,'second-order':{...book,gamekey:'foreign-order'}},[false,1,false,2],[false,1,false,2],'same: scoped failure'],
  ['malformed',[h,order('second-order')],{[h.gamekey]:book,'second-order':{}},[false,1,false,2],[false,1,false,2],'same: scoped failure']
])test('Humble differential: '+name+' ['+policy+']',async()=>{const value=await humbleFixture(orders,details);assert.deepEqual(Object.values(value.gl),gl);assert.deepEqual(Object.values(value.hb),hb);});
