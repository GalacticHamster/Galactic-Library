import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {memory} from './final-gl-features.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {withWorker} from './storage.js';

const row=i=>({productId:'product-'+(i===1?0:i),titleId:'title-'+i,name:'Synthetic PlayStation title '+i,platform:i<2?'PS5':'PS4',membership:i===58?'PS_PLUS':'NONE',isActive:true,isTrial:i===59});
const page=(offset=0,count=60)=>({data:{purchasedTitlesRetrieve:{games:Array.from({length:Math.max(0,Math.min(24,count-offset))},(_,i)=>row(offset+i)),pageInfo:{offset,size:Math.min(24,Math.max(0,count-offset)),isLast:offset+24>=count}}}});
const url=(operation,start=0)=>'https://web.np.playstation.com/api/graphql/v1/op?'+new URLSearchParams({operationName:operation,variables:JSON.stringify(operation==='getProfileOracle'?{}:{start,size:24,isActive:true,platform:['ps4','ps5'],sortBy:'ACTIVE_DATE',sortDirection:'desc'}),extensions:JSON.stringify({persistedQuery:{version:1,sha256Hash:(operation==='getProfileOracle'?'a':'b').repeat(64)}})});
export function playstationHarness(){
  const options={actor:'private-account',count:60,status:200,onRequest:null},posts=[],calls=[],listeners=[];let resolve;
  const headers={'Content-Type':'application/json','apollographql-client-name':'FixtureLibrary','apollographql-client-version':'1.2.3'};
  const native=async(input,init={})=>{
    const u=new URL(input),operation=u.searchParams.get('operationName'),variables=JSON.parse(u.searchParams.get('variables'));calls.push({operation,variables,headers:init.headers});options.onRequest?.(operation,variables);
    assert.equal(init.headers['Content-Type'],'application/json');
    if(operation==='getProfileOracle'){
      assert.equal(init.headers['apollographql-client-name'],'FixtureLibrary');assert.equal(init.headers['apollographql-client-version'],'1.2.3');
      return new Response(JSON.stringify({data:{oracleUserProfileRetrieve:{accountId:options.actor,onlineId:'private-online'}}}));
    }
    assert.deepEqual(Object.keys(init.headers).sort(),init.headers.Accept?['Accept','Content-Type']:['Content-Type']);
    return new Response(JSON.stringify(page(variables.start,options.count)),{status:options.status});
  };
  const ctx=vm.createContext({URL,URLSearchParams,AbortController,TextDecoder,TextEncoder,Uint8Array,crypto:webcrypto,Date,setTimeout,clearTimeout,location:{origin:'https://library.playstation.com'},fetch:native,addEventListener:(name,fn)=>listeners.push(fn)});
  ctx.window=ctx;ctx.postMessage=value=>{posts.push(value);if(!value.progress)resolve?.(JSON.parse(JSON.stringify(value)));};
  for(const path of ['provider-snapshot.js','console-library.js','playstation-capture.js'])vm.runInContext(readFileSync(new URL('../src/providers/'+path,import.meta.url),'utf8'),ctx);
  return {ctx,options,posts,calls,async load(){await ctx.fetch(url('getProfileOracle'),{headers});await ctx.fetch(url('getPurchasedGameList'),{headers:{'Content-Type':'application/json'}});await new Promise(r=>setTimeout(r,10));},ask(action='prepare'){return new Promise(done=>{resolve=done;ctx.action=action;ctx.listeners=listeners;vm.runInContext("for(const fn of listeners)fn({source:window,origin:location.origin,data:{channel:'gl-playstation-request',nonce:'c'.repeat(32),action}});",ctx);});}};
}
const fp='a'.repeat(64);
const item=id=>({provider:'playstation',providerItemId:id,title:'Synthetic '+id,platform:['PS4'],mediaType:'game',ownership:'owned',metadata:{source:'playstation-web-purchased-library',productId:id,titleId:id,isActive:true,membership:'NONE'}});
const snapshot=items=>completeProviderSnapshot('playstation',items,[completedScope('ps4-ps5-purchased',items.length,null,'pagination-end')]);
const begin=(w,mode='full',fingerprint=fp,name='Personal',switching=false)=>w.beginProviderScan('playstation',name,mode,switching,1,null,false,fingerprint);
const commit=(w,scan,items,mode='full',fingerprint=fp)=>w.commitProviderScan('playstation',items,{syncMode:mode,...(mode==='full'?{fullSyncAt:'2026-10-15'}:{quickSyncAt:'2026-10-15'})},snapshot(items),scan.scanToken,1,false,fingerprint);
export const playstationImportTests=[
 ['PlayStation paginates the supported source with observed client context and independent account/head checks, exporting no credentials',async()=>{
   const h=playstationHarness();assert.equal((await h.ask('identify')).ok,false);assert.equal(h.calls.length,0);
   await h.load();const result=await h.ask();assert.equal(result.ok,true,result.error);assert.equal(result.items.length,60);assert.equal(new Set(result.items.map(i=>i.metadata.productId)).size,59);assert.equal(result.snapshot.scopes[0].pagesRead,3);
   assert.deepEqual(h.calls.filter(c=>c.operation==='getPurchasedGameList').map(c=>c.variables.start),[0,0,24,48,0]);
   assert.equal(result.items.filter(i=>i.ownership==='owned').length,58);assert.equal(result.items.filter(i=>i.ownership==='subscription').length,1);assert.equal(result.items.filter(i=>i.ownership==='unknown').length,1);
   assert.equal(h.posts.filter(p=>p.progress).length,3);assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('FixtureLibrary'));
   const verified=await h.ask('verify');assert.equal(verified.ok,true);assert.equal(verified.sourceAccountFingerprint,result.sourceAccountFingerprint);assert.equal(verified.items,undefined);
 }],
 ['PlayStation fails closed on expired authentication, account switches, incomplete responses, changed first pages and stale preparation',async()=>{
   for(const scenario of ['http','account','head','empty']){
     const h=playstationHarness();await h.load();
     if(scenario==='http')h.options.status=401;
     if(scenario==='empty')h.options.count=0;
     if(scenario==='account')h.options.onRequest=(op,v)=>{if(op==='getPurchasedGameList'&&v.start===24)h.options.actor='private-other';};
     if(scenario==='head')h.options.onRequest=(op,v)=>{if(op==='getPurchasedGameList'&&v.start===24)h.options.count=23;};
     const result=await h.ask();assert.equal(result.ok,false,scenario);assert.equal(result.items,undefined);assert(!JSON.stringify(result).includes('private'));
   }
   const h=playstationHarness();await h.load();assert.equal((await h.ask()).ok,true);await h.load();assert.equal((await h.ask('verify')).ok,false);
 }],
 ['PlayStation full/quick imports remain additive, idempotent, account-bound and backup-compatible',async()=>{
   const {writer}=memory();await assert.rejects(begin(writer,'full',null),/verified account/);
   await assert.rejects(writer.importUnscopedProviderItems('playstation',[item('a')]),/account-bound/);
   let db=await commit(writer,await begin(writer),[item('a'),item('b')]);const profile=db.providers.playstation.activeProfileId,ref=Object.values(db.providerItems)[0].recordRef;
   assert.equal(db.providerProfiles[profile].sourceAccountFingerprint,fp);
   db=await writer.saveOwnershipCorrections([ownershipCorrectionTarget(Object.values(db.providerItems)[0],db)],{ownership:'returned',note:'Synthetic correction'});
   db=await commit(writer,await begin(writer,'incremental'),[item('a')],'incremental');assert.equal(Object.keys(db.providerItems).length,2);assert.equal(Object.keys(db.providerHistory).length,0);assert.equal(db.providers.playstation.syncHealth.differences.added,0);assert.equal(db.providers.playstation.syncHealth.differences.ownershipChanged,0);assert.equal(effectiveOwnershipRecord(Object.values(db.providerItems).find(i=>i.recordRef===ref),db).ownership,'returned');
   db=await commit(writer,await begin(writer),[item('a')]);assert.equal(Object.keys(db.providerItems).length,2);assert(Object.values(db.providerItems).some(i=>i.recordRef===ref));assert.deepEqual(parseBackup(createBackup(db)),db);
   await writer.restoreDatabase(parseBackup(createBackup(db)));await assert.rejects(begin(writer,'full','b'.repeat(64)),/different PlayStation account/);await assert.rejects(begin(writer,'full',fp,'Other',true),/already saved/);
   const scan=await begin(writer);await assert.rejects(commit(writer,scan,[item('a')],'full','b'.repeat(64)),/account changed/);
 }],
 ['PlayStation accounts retain independent identities and stale-lease protection',async()=>{
   const {writer}=memory();let db=await commit(writer,await begin(writer),[item('a')]),a=db.providers.playstation.activeProfileId;
   db=await commit(writer,await begin(writer,'full','b'.repeat(64),'Family',true),[item('a')],'full','b'.repeat(64));const b=db.providers.playstation.activeProfileId;
   assert.notEqual(a,b);assert.equal(Object.keys(db.providerItems).length,2);assert.equal(new Set(Object.values(db.providerItems).map(i=>i.recordRef)).size,2);
   assert.deepEqual(parseBackup(createBackup(db)),db);
   const scan=await begin(writer,'incremental','b'.repeat(64),'Family');await writer.selectProviderProfile(a,b,true);
   await assert.rejects(commit(writer,scan,[item('a')],'incremental','b'.repeat(64)),/superseded/);
 }],
 ['PlayStation worker restricts imports to the matching tab, lease, supported snapshot and provider source',()=>withWorker(async({dispatch})=>{
     const sender={id:chrome.runtime.id,url:'https://library.playstation.com/recently-purchased',tab:{id:1}},items=[item('a')];
     assert.equal((await dispatch({type:'GET_PROVIDER_PROFILE',provider:'playstation'},{...sender,url:'https://evil.example/'})).ok,false);
     assert.equal((await dispatch({type:'IMPORT_PROVIDER_ITEMS',provider:'playstation',items},sender)).ok,false);
     const scan=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'playstation',beginScan:true,confirmed:true,profileLabel:'Personal',mode:'full',sourceAccountFingerprint:fp},sender);assert.equal(scan.ok,true,scan.error);
     assert.equal((await dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'playstation',items,snapshot:snapshot(items),scanToken:scan.scanToken,sourceAccountFingerprint:fp,mode:'full'},{...sender,tab:{id:2}})).ok,false);
     const result=await dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'playstation',items,snapshot:snapshot(items),scanToken:scan.scanToken,sourceAccountFingerprint:fp,mode:'full'},sender);assert.equal(result.ok,true,result.error);assert.equal(result.gameCount,1);
 })]
];
