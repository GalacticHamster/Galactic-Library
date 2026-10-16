import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../src/lib/contents-performance.js';

function fixture(ids,requests,{owned={ok:true,status:200,body:{rgOwnedApps:ids}}}={}){
  let calls=0;
  const context=vm.createContext({setTimeout:callback=>callback(),fetch:async url=>{
    const r=String(url).startsWith('/dynamicstore')?owned:requests[calls++];
    if(r?.networkError)throw Error('PRIVATE URL / token');
    return {ok:r?.ok??true,status:r?.status??200,json:async()=>{if(r?.jsonError)throw Error('PRIVATE invalid response');return r?.body;}};
  }});
  for(const file of ['provider-snapshot','steam-store'])vm.runInContext(readFileSync(new URL('../src/providers/'+file+'.js',import.meta.url),'utf8'),context);
  return {S:context.GalacticSteamStore,calls:()=>calls};
}
const response=rows=>({body:{response:{store_items:rows}}});
const run=(ids,rows)=>fixture(ids,[response(rows)]).S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});
const reconcile=result=>{
  const d=result.diagnostics;
  assert.equal(Object.values(d.outcomes).reduce((sum,n)=>sum+n,0),d.attemptedCount);
  assert.equal(d.outcomes.games+d.outcomes.dlc,result.items.length);
  assert.equal(d.attemptedCount-result.items.length-d.outcomes.unsupported,result.unresolvedApps.length);
};
export const steamOutcomeTests=[
 ['Steam outcomes: a malformed neighbor no longer discards valid games and DLC',async()=>{
   const r=await run([1,2,3,4],[{appid:1,name:'PRIVATE GAME',type:0},{appid:2,name:'PRIVATE DLC',type:4,related_items:{parent_appid:1}},{appid:3,name:'Broken',type:null},{appid:'invalid',type:0}]);
   reconcile(r);assert.equal(r.items.length,2);assert.equal(r.items[1].metadata.parentProviderItemId,'1');
   assert.equal(r.diagnostics.outcomes.classification,1);assert.equal(r.diagnostics.outcomes.missing,1);assert.equal(r.diagnostics.malformedRows,1);assert.equal(r.failedRequestCount,0);
 }],
 ['Steam outcomes: null, missing, empty and noninteger app types never become owned games',async()=>{
   const r=await run([1,2,3,4,5],[null,undefined,'',0.5,{}].map((type,i)=>({appid:i+1,name:'Uncertain',type})));
   reconcile(r);assert.equal(r.items.length,0);assert.equal(r.diagnostics.outcomes.classification,5);
 }],
 ['Steam outcomes: requested titles and identifiers remain bounded to the owned selection',async()=>{
   const r=await run([1,2,3],[{appid:1,name:{secret:'not a title'},type:0},{appid:2,name:'',type:4},{appid:77,name:'Unrequested',type:0}]);
   reconcile(r);assert.equal(r.items.length,0);assert.equal(r.diagnostics.outcomes.missing,3);
 }],
 ['Steam outcomes: repeated identical rows deduplicate; conflicting rows remain unresolved',async()=>{
   const a={appid:1,name:'Game',type:0},r=await run([1,1,2],[a,a,{appid:2,name:'One',type:0},{appid:2,name:'Two',type:0}]);
   reconcile(r);assert.equal(r.newAppCount,2);assert.equal(r.items.length,1);assert.equal(r.diagnostics.outcomes.classification,1);
 }],
 ['Steam outcomes: explicit unsupported types are separate from temporary failures and remain retryable candidates',async()=>{
   const f=fixture([1,2],[response([{appid:1,name:'Game',type:0},{appid:2,type:6}]),response([{appid:2,type:6}])]);
   const a=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(a);
   const b=await f.S.fetchOwnedSteamGames(()=>{},a.items.map(i=>i.providerItemId),{diagnostics:true});reconcile(b);
   assert.equal(b.newAppCount,1);assert.equal(b.unresolvedApps.length,0);assert.equal(b.unsupportedAppCount,1);assert.equal(b.diagnostics.unsupportedTypes['6'],1);
 }],
 ...[400,401,403,429,500].map(status=>['Steam outcomes: HTTP '+status+' is retained without inventing a session diagnosis',async()=>{
   const f=fixture([1,2],[{ok:false,status}]),r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);
   assert.equal(r.failedRequestCount,1);assert.equal(r.diagnostics.httpStatuses[status],1);assert.equal(r.diagnostics.outcomes[[401,403].includes(status)?'authentication':'http'],2);
   assert.equal(r.diagnostics.firstFailure.httpStatus,status);assert.match(r.failureSummary,new RegExp(String(status)));
 }]),
 ['Steam outcomes: malformed JSON, malformed envelope and network failures remain distinct',async()=>{
   for(const [request,kind] of [[{jsonError:true},'malformed'],[{body:{error:'PRIVATE RESPONSE'}},'malformed'],[{networkError:true},'network']]){
     const r=await fixture([1],[request]).S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);assert.equal(r.diagnostics.outcomes[kind],1);
     if(kind==='malformed')assert.equal(r.diagnostics.firstFailure.httpStatus,200);else assert.equal(r.diagnostics.firstFailure.httpStatus,undefined);
     assert(!r.failureSummary.includes('PRIVATE'));
   }
 }],
 ['Steam outcomes: batches reconcile attempted IDs, unique unresolved IDs, request statuses and valid saves independently',async()=>{
   const ids=Array.from({length:159},(_,i)=>i+1),f=fixture(ids,[{ok:false,status:400},{ok:false,status:429}]);
   const r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);
   assert.equal(r.newAppCount,159);assert.equal(r.unresolvedApps.length,159);assert.equal(r.failedRequestCount,2);assert.equal(r.diagnostics.titleRequests,2);
   assert.equal(r.diagnostics.outcomes.http,159);assert.equal(f.calls(),2);
 }],
 ['Steam outcomes: full failures preserve diagnostic evidence and never return a replacement snapshot',async()=>{
   for(const request of [{ok:false,status:403},response([{appid:1,type:null}])]){
     await assert.rejects(fixture([1],[request]).S.fetchOwnedSteamGames(()=>{},null,{diagnostics:true}),e=>Boolean(e.steamDiagnostics?.firstFailure));
   }
 }],
 ['Steam outcomes: owned-list failures are distinguished before any title requests',async()=>{
   for(const request of [{ok:false,status:401},{networkError:true},{jsonError:true},{body:{rgOwnedApps:['not-id']}}]){
     const f=fixture([1],[],{owned:request});await assert.rejects(f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true}),e=>e.steamDiagnostics?.firstFailure.stage==='owned-list'&&e.steamDiagnostics.ownedListRead===false);
     assert.equal(f.calls(),0);
   }
 }],
 ['Steam outcomes: default acquisition retains no detailed diagnostic report; opt-in export redacts raw values',async()=>{
   const f=fixture([123456789],[response([{appid:123456789,name:'PRIVATE TITLE',type:0}])]);const ordinary=await f.S.fetchOwnedSteamGames(()=>{},[]);assert.equal(ordinary.diagnostics,undefined);
   const r=await run([123456789],[{appid:123456789,name:'PRIVATE TITLE',type:0}]),P=globalThis.GalacticContentsPerformance,t=P.trace('lookup-aaaaaaaaaaaa-101','provider');
   t.provider='steam';t.steamDiagnostics={...r.diagnostics,saveState:'committed',savedCount:1,saveRejectedCount:0,rawResponses:'PRIVATE TOKEN',accountId:'PRIVATE ACCOUNT'};
   const clean=P.clean(t.finish('prepared'));assert.equal(clean.steamDiagnostics.savedCount,1);assert(!JSON.stringify(clean).includes('PRIVATE'));assert(!JSON.stringify(clean).includes('123456789'));
   const collector=P.collector();collector.add(clean);assert.equal(collector.report().records[0].steamDiagnostics.saveState,'committed');
   t.steamDiagnostics.outcomes.games=5;assert.equal(P.clean(t).steamDiagnostics,undefined,'Reject inconsistent aggregate partitions');
 }]
];
