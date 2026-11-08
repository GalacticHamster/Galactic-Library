import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverProviderImporter,createProviderImporterHandler} from '../src/background/provider-importer.js';
import {builtinCompanions} from '../src/lib/companion-identities.js';
import {openProviderPage} from '../src/ui/provider-launch.js';

for(const firefox of [false,true])for(const provider of ['humble','fanatical']){
 const runtime={id:'self',getURL:()=>firefox?'moz-extension://self/':'chrome-extension://self/'},id=builtinCompanions(runtime).find(p=>p.role===(provider==='humble'?'hb':'fan')).id;
 const reply={ok:true,apiVersion:1,ready:true,appVersion:'1.0.2',purchaseProvider:provider,capabilities:{providerImporter:1}};
 const absent=async()=>{throw Error('Could not establish connection. Receiving end does not exist.');};
 test(`${provider} ${firefox?'Firefox':'Chrome'}: absent/disabled, installed unlinked, legacy, unavailable and recovery`,async()=>{
  runtime.sendMessage=absent;assert.equal((await discoverProviderImporter(runtime,provider)).owner,'galactic');
  runtime.sendMessage=async target=>target===id?reply:absent();assert.equal((await discoverProviderImporter(runtime,provider)).owner,'companion');
  delete reply.capabilities.providerImporter;assert.equal((await discoverProviderImporter(runtime,provider)).owner,'companion');reply.capabilities.providerImporter=1;
  runtime.sendMessage=async target=>target===id?new Promise(()=>{}):absent();assert.equal((await discoverProviderImporter(runtime,provider,[],10)).owner,'unavailable');
  runtime.sendMessage=absent;assert.equal((await discoverProviderImporter(runtime,provider)).owner,'galactic');
 });
 test(`${provider} ${firefox?'Firefox':'Chrome'}: custom IDs require existing allowlist, role and readiness`,async()=>{
  const custom='c'.repeat(32);runtime.sendMessage=async target=>target===custom?reply:absent();
  assert.equal((await discoverProviderImporter(runtime,provider)).owner,'galactic');assert.equal((await discoverProviderImporter(runtime,provider,[custom])).owner,'companion');
  runtime.sendMessage=async target=>target===id?{...reply,ready:false}:absent();assert.equal((await discoverProviderImporter(runtime,provider)).owner,'unavailable');
  runtime.sendMessage=async()=>({...reply,purchaseProvider:provider==='humble'?'fanatical':'humble'});assert.equal((await discoverProviderImporter(runtime,provider)).owner,'galactic');
 });
}
test('internal discovery guards the provider page and opening only launches a fixed URL, without sync or import',async()=>{
 const opened=[],requests=[],runtime={id:'self',getURL:()=> 'chrome-extension://self/',sendMessage:async(...args)=>{requests.push(args);throw Error('Receiving end does not exist');}};
 const handler=createProviderImporterHandler({browser:{runtime,tabs:{create:async value=>opened.push(value)}},allowed:async()=>[],isProviderPage:(p,url)=>url==='https://www.fanatical.com/en/orders'&&p==='fanatical'});
 const call=(request,sender)=>new Promise(resolve=>handler(request,sender,resolve));
 const own={id:'self',url:runtime.getURL('')+'options.html'};
 assert.equal((await call({type:'GET_PROVIDER_IMPORTER',provider:'fanatical'},{id:'foreign',url:own.url})).ok,false);
 assert.equal((await call({type:'GET_PROVIDER_IMPORTER',provider:'humble'},{id:'self',url:'https://www.fanatical.com/en/orders'})).ok,false);
 const result=await call({type:'OPEN_PURCHASE_IMPORTER',provider:'fanatical',url:'https://evil.test'},own);assert.equal(result.owner,'galactic');assert.deepEqual(opened,[{url:'https://www.fanatical.com/en/orders'}]);assert(requests.every(([,message])=>message.type==='PING'));
});
test('provider launch delegates Humble/Fanatical discovery without starting acquisition or enabling sharing',async()=>{
 const sent=[],browser={runtime:{sendMessage:async request=>{sent.push(request);return {ok:true,owner:'companion',name:'Fanatical Library'};}},tabs:{create:async()=>{throw Error('Unexpected direct launch');}}};
 assert.equal((await openProviderPage('https://www.fanatical.com/en/orders',browser)).owner,'companion');
 await openProviderPage('https://www.humblebundle.com/home/purchases',browser);
 assert.deepEqual(sent,[{type:'OPEN_PURCHASE_IMPORTER',provider:'fanatical'},{type:'OPEN_PURCHASE_IMPORTER',provider:'humble'}]);
});

test('page readiness is read-only and stale panels never imply a live importer',async()=>{
 const calls=[],runtime={getURL:()=> 'chrome-extension://self/',sendMessage:async(id,message)=>{calls.push(message);return message.type==='PING'?{ok:true,apiVersion:1,ready:true,appVersion:'1.0.3',purchaseProvider:'fanatical',capabilities:{providerImporter:1,importerPageStatus:1}}:{ok:true,present:false};}};
 const result=await discoverProviderImporter(runtime,'fanatical',[],25,7);
 assert.equal(result.owner,'companion');assert.equal(result.pageReady,false);
 assert(calls.some(m=>m.type==='GET_IMPORTER_STATUS'&&m.tabId===7));assert(calls.every(m=>['PING','GET_IMPORTER_STATUS'].includes(m.type)));
});

test('known role hints isolate providers but never cache a selected companion as installed',async()=>{
 const hints=new Map([['custom-fan','fanatical']]),runtime={getURL:()=> 'chrome-extension://self/',sendMessage:async id=>{if(id==='custom-fan')return {ok:false};throw Error('Receiving end does not exist');}};
 assert.equal((await discoverProviderImporter(runtime,'humble',['custom-fan'],25,undefined,hints)).owner,'galactic');
 assert.equal((await discoverProviderImporter(runtime,'fanatical',['custom-fan'],25,undefined,hints)).owner,'unavailable');
 runtime.sendMessage=async()=>{throw Error('Receiving end does not exist');};assert.equal((await discoverProviderImporter(runtime,'fanatical',['custom-fan'],25,undefined,hints)).owner,'galactic');
});
