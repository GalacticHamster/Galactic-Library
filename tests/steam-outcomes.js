import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../src/lib/contents-performance.js';

function fixture(ids,requests,{owned={ok:true,status:200,body:{rgOwnedApps:ids}},onTitleRequest=()=>{}}={}){
  let calls=0;
  const context=vm.createContext({setTimeout:callback=>callback(),fetch:async url=>{
    const ownedRequest=String(url).startsWith('/dynamicstore');if(!ownedRequest)onTitleRequest(url);
    const r=ownedRequest?owned:requests[calls++];
    if(r?.networkError)throw Error('PRIVATE URL / token');
    return {ok:r?.ok??true,status:r?.status??200,json:async()=>{if(r?.jsonError)throw Error('PRIVATE invalid response');return r?.body;}};
  }});
  for(const file of ['provider-snapshot','steam-store'])vm.runInContext(readFileSync(new URL('../src/providers/'+file+'.js',import.meta.url),'utf8'),context);
  return {S:context.GalacticSteamStore,calls:()=>calls};
}
export {fixture as steamOutcomeFixture};
const response=rows=>({body:{response:{store_items:rows}}});
const run=(ids,rows)=>fixture(ids,[response(rows)]).S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});
// Synthetic shape from the observed StoreBrowse failure contract; no user IDs.
const placeholder=(id,extra={})=>({item_type:0,id,success:15,visible:false,name:'',appid:0,...extra});
const reconcile=result=>{
  const d=result.diagnostics;
  assert.equal(Object.values(d.outcomes).reduce((sum,n)=>sum+n,0),d.attemptedCount);
  assert.equal(d.outcomes.games+d.outcomes.dlc,result.items.length);
  assert.equal(d.attemptedCount-result.items.length-d.outcomes.unsupported,result.unresolvedApps.length);
};
export const steamOutcomeTests=[
 ['Steam placeholders: explicit app failures stay unavailable, never imported, with unknown codes left numeric',async()=>{
   const rows=[placeholder(1),placeholder('0002',{success:987,visible:undefined}),placeholder(3,{appid:undefined})];
   const f=fixture([1,2,3,4],[response(rows)]);f.S.setDiagnosticSampling(true);
   const r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);
   assert.equal(r.diagnostics.outcomeVersion,3);assert.equal(r.items.length,0);assert.equal(r.unresolvedApps.length,4);assert.equal(r.failedRequestCount,0);
   assert.equal(r.diagnostics.outcomes.unavailable,3);assert.equal(r.diagnostics.outcomes.absent,1);assert.equal(r.diagnostics.malformedRows,0);
   assert.deepEqual({...r.diagnostics.placeholderResultCodes},{15:2,987:1});assert.deepEqual({...r.diagnostics.placeholderVisibility},{false:2,unspecified:1});
   assert.equal(r.diagnostics.requests[0].placeholderRowCount,3);assert.equal(r.diagnostics.requests[0].unavailableCount,3);
   const s=f.S.getDiagnosticSample();assert.equal(s.format,2);assert.equal(s.outcomeVersion,3);assert.equal(s.groups.unavailable[1].resultCode,987);assert(!Object.hasOwn(s.groups.unavailable[1],'visible'));assert.equal(s.groups.unavailable[0].returnedEntry,true);
   assert(!r.failureSummary.includes('revoked'));assert(!r.failureSummary.includes('sign in'));
 }],
 ...[
   ['invalid ID',placeholder('invalid'),1,0],
   ['unsolicited ID',placeholder(999),0,1],
   ['package namespace',placeholder(1,{item_type:1}),1,0],
   ['bundle namespace',placeholder(1,{item_type:2}),1,0],
   ['missing item type',placeholder(1,{item_type:undefined}),1,0],
   ['visibility without failure',placeholder(1,{success:undefined}),1,0],
   ['success without an appid',placeholder(1,{success:1}),1,0],
   ['invalid result code',placeholder(1,{success:'15'}),1,0]
 ].map(([label,row,malformed,unexpected])=>['Steam placeholders: '+label+' cannot substitute id for appid',async()=>{
   const r=await run([1],[row]);reconcile(r);assert.equal(r.items.length,0);assert.equal(r.diagnostics.outcomes.absent,1);assert.equal(r.diagnostics.outcomes.unavailable,0);assert.equal(r.diagnostics.malformedRows,malformed);assert.equal(r.diagnostics.requests[0].unexpectedRowCount,unexpected);
 }]),
 ['Steam placeholders: conflicting valid appid is never reassigned to the placeholder id',async()=>{
   const r=await run([1,2],[placeholder(1,{appid:2})]);reconcile(r);
   assert.equal(r.diagnostics.outcomes.unavailable,0);assert.equal(r.diagnostics.outcomes.absent,1);assert.equal(r.diagnostics.outcomes.invalidType,1);assert.equal(r.items.length,0);
 }],
 ['Steam placeholders: conflicts and repeated rows are conservative and independent of row order',async()=>{
   for(const rows of [[placeholder(1),placeholder(1,{success:99})],[placeholder(1),{appid:1,type:0,name:'Usable but conflicting'}],[placeholder(1),placeholder(1,{visible:true})]])for(const order of [rows,[...rows].reverse()]){
     const r=await run([1],order);reconcile(r);assert.equal(r.items.length,0);assert.equal(r.diagnostics.outcomes.conflictingDuplicate,1);assert.equal(r.diagnostics.requests[0].conflictingIdCount,1);assert.equal(r.diagnostics.requests[0].duplicateRowCount,1);assert.equal(r.diagnostics.outcomes.unavailable,0);
   }
   const r=await run([1],[placeholder(1),placeholder(1)]);reconcile(r);assert.equal(r.diagnostics.outcomes.unavailable,1);assert.equal(r.diagnostics.requests[0].placeholderRowCount,2);assert.equal(r.diagnostics.requests[0].duplicateRowCount,1);
 }],
 ['Steam placeholders: mixed games, DLC, unavailable, missing titles, malformed and omitted rows reconcile separately',async()=>{
   const r=await run([1,2,3,4,5],[{appid:1,type:0,name:'Game'},{appid:2,type:4,name:'DLC'},placeholder(3),{appid:4,type:0},{id:5},placeholder(888)]);reconcile(r);
   assert.equal(r.items.length,2);assert.equal(r.diagnostics.outcomes.unavailable,1);assert.equal(r.diagnostics.outcomes.missingTitle,1);assert.equal(r.diagnostics.outcomes.absent,1);assert.equal(r.diagnostics.malformedRows,1);assert.equal(r.failedRequestCount,0);
   const q=r.diagnostics.requests[0];assert.equal(q.returnedRowCount,q.matchedRowCount+q.placeholderRowCount+q.unexpectedRowCount+q.malformedRowCount);
 }],
 ['Steam placeholders: the 159-candidate shape reconciles 143 unavailable and 16 unsupported across two batches',async()=>{
   const ids=Array.from({length:159},(_,i)=>i+1),rows=ids.map(id=>id%10===0||id===159?{appid:id,type:6,name:'Unsupported'}:placeholder(id));
   const f=fixture(ids,[response(rows.slice(0,100)),response(rows.slice(100))]);
   const r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);assert.equal(r.diagnostics.outcomes.unavailable,143);assert.equal(r.unsupportedAppCount,16);assert.equal(r.diagnostics.outcomes.absent,0);assert.equal(r.failedRequestCount,0);assert.equal(r.diagnostics.malformedRows,0);assert.equal(r.diagnostics.requests.reduce((n,q)=>n+q.unavailableCount,0),143);
   const repeat=fixture([1],[response([placeholder(1)])]);assert.equal((await repeat.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true})).unresolvedApps.length,1);
 }],
 ['Steam placeholders: result and visibility aggregates are bounded and sanitized independently of opt-in samples',async()=>{
   const ids=Array.from({length:40},(_,i)=>i+1),f=fixture(ids,[response(ids.map(id=>placeholder(id,{success:id+10,visible:id%2===0})))]);f.S.setDiagnosticSampling(true);
   const r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);assert.equal(Object.keys(r.diagnostics.placeholderResultCodes).length,32);assert.equal(f.S.getDiagnosticSample().groups.unavailable.length,20);
   const P=globalThis.GalacticContentsPerformance,t=P.trace('lookup-aaaaaaaaaaaa-111','provider');t.provider='steam';t.steamDiagnostics={...r.diagnostics,placeholderResultCodes:{...r.diagnostics.placeholderResultCodes,PRIVATE:1},placeholderVisibility:{false:20,true:20,PRIVATE:1},samples:f.S.getDiagnosticSample()};
   const clean=P.clean(t.finish('prepared')).steamDiagnostics;assert.equal(clean.outcomes.unavailable,40);assert.equal(clean.outcomeVersion,3);assert(!JSON.stringify(clean).includes('PRIVATE'));assert(!clean.samples);assert.equal(clean.requests[0].unavailableCount,40);
 }],
 ['Provider profiling: a one-trace request uses the existing collector without arming later or other-provider traces',()=>{
   const make=()=>{const c=vm.createContext({crypto:{randomUUID:()=> 'abcdef123456-0000'},GalacticContentsPerformance:globalThis.GalacticContentsPerformance});vm.runInContext(readFileSync(new URL('../src/providers/floating-panel.js',import.meta.url),'utf8'),c);return c.GalacticSync;};
   const S=make();assert.equal(S.trace('steam'),null);assert.equal(S.trace('epic'),null);
   const otherTab=make(),t=S.trace('steam',{once:true});assert.equal(t.provider,'steam');assert.equal(t.providerPhase,'scan');assert.equal(otherTab.trace('steam'),null,'A different tab must remain off while this trace is active');assert(otherTab.trace('steam',{once:true}));assert.equal(S.trace('steam'),null);assert.equal(otherTab.trace('steam'),null);assert.equal(S.trace('epic'),null);
   assert.equal(make().trace('steam'),null,'Page reload must start off');S.setProfiling(true);assert(S.trace('steam'));S.trace('steam',{once:true});assert(S.trace('epic'),'Console development switch is preserved');S.setProfiling(false);assert.equal(S.trace('steam'),null);
 }],
 ['Steam metadata: an injected parser fault is local to one ID and never becomes an HTTP failure',async()=>{
   const broken={appid:2,type:0};Object.defineProperty(broken,'name',{get(){throw Error('PRIVATE PARSER DETAIL');}});
   const f=fixture([1,2,3],[response([{appid:1,type:0,name:'One'},broken,{appid:3,type:4,name:'Three'}])]);f.S.setDiagnosticSampling(true);
   const r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);
   assert.equal(r.items.length,2);assert.equal(r.failedRequestCount,0);assert.equal(r.diagnostics.outcomes.classification,1);assert.equal(r.diagnostics.httpStatuses['200'],1);
   assert.equal(f.S.getDiagnosticSample().groups.classification[0].returnedEntry,true);assert(!JSON.stringify(r.diagnostics).includes('PRIVATE'));
 }],
 ['Steam metadata: deeply malformed names never serialize raw objects or poison valid neighbors and totals',async()=>{
   let name={};for(let i=0;i<12000;i++)name={child:name};
   const r=await run([1,2],[{appid:1,name:'Valid game',type:0},{appid:2,name,type:0}]);reconcile(r);
   assert.equal(r.items.length,1);assert.equal(r.unresolvedApps.length,1);assert.equal(r.failedRequestCount,0);assert.equal(r.diagnostics.outcomes.invalidTitle,1);
 }],
 ['Steam metadata: absent, absent-name, empty-name, malformed-name and invalid-type outcomes stay disjoint',async()=>{
   const r=await run([1,2,3,4,5,6,7,8],[{appid:2,type:0},{appid:3,type:4,name:' \n '},{appid:4,type:0,name:42},{appid:5,type:null,name:'Valid name'},{appid:6,type:6,name:'Unsupported'},{appid:7,type:0,name:'Game'},{appid:8,type:4,name:'DLC'}]);
   reconcile(r);assert.equal(r.diagnostics.outcomeVersion,3);
   assert.deepEqual({...r.metadataOutcomes},{games:1,dlc:1,unsupported:1,unavailable:0,absent:1,missingTitle:2,invalidTitle:1,invalidType:1,conflictingDuplicate:0,http:0,authentication:0,malformed:0,classification:0,network:0,other:0});
   assert.equal(r.diagnostics.requests[0].requestedCount,8);assert.equal(r.diagnostics.requests[0].returnedRowCount,7);assert.equal(r.diagnostics.requests[0].absentCount,1);
 }],
 ['Steam metadata: normalized numeric/string App IDs resolve and already-saved equivalents are not retried',async()=>{
   const f=fixture(['0001',' 2 ',2],[response([{appid:1,name:'One',type:0},{appid:'0002',name:'Two',type:4,related_items:{parent_appid:'0001'}}])]);
   const r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);assert.deepEqual(Array.from(r.items,item=>item.providerItemId),['1','2']);
   assert.equal(r.items[1].metadata.parentProviderItemId,'1');assert.deepEqual(Array.from(f.S.newOwnedAppIds(['1',2,'0002'],['0001','2'])),[]);
 }],
 ['Steam metadata: invalid or lossy App IDs cannot establish ownership or launch title requests',async()=>{
   for(const id of [0,-1,true,null,{},'1e3','1.5',4294967296,'9007199254740993']){
     const f=fixture([id],[]);await assert.rejects(f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true}),/malformed owned-App-ID list/);assert.equal(f.calls(),0);
   }
   const r=await run([1],[{appid:4294967296,name:'Unrequested',type:0},{appid:0,name:'Not an app',type:0}]);reconcile(r);assert.equal(r.items.length,0);assert.equal(r.diagnostics.malformedRows,2);assert.equal(r.diagnostics.outcomes.absent,1);
 }],
 ['Steam metadata: empty HTTP 200 rows are absent metadata, not failed requests or revoked ownership',async()=>{
   const r=await run([1,2],[]);reconcile(r);assert.equal(r.failedRequestCount,0);assert.equal(r.diagnostics.httpStatuses['200'],1);assert.equal(r.diagnostics.outcomes.absent,2);assert.equal(r.diagnostics.requests[0].returnedRowCount,0);
 }],
 ['Steam metadata: partial 200 responses preserve valid siblings and expose extra, malformed and duplicate row counts',async()=>{
   const r=await run([1,2,3],[{appid:1,name:'Game',type:0},{appid:'01',name:' Game ',type:'0'},{appid:2,name:'',type:4},{appid:99,name:'Extra',type:0},{name:'Invalid row'}]);
   reconcile(r);assert.equal(r.items.length,1);assert.equal(r.diagnostics.outcomes.missingTitle,1);assert.equal(r.diagnostics.outcomes.absent,1);
   assert.deepEqual({...r.diagnostics.requests[0]},{requestedCount:3,httpStatus:200,returnedRowCount:5,unexpectedRowCount:1,malformedRowCount:1,duplicateRowCount:1,matchedRowCount:3,placeholderRowCount:0,unavailableCount:0,conflictingIdCount:0,matchedIdCount:2,absentCount:1});
 }],
 ['Steam metadata: conflicting duplicates are unresolved regardless of row order or type representation',async()=>{
   for(const rows of [[{appid:1,type:0,name:'One'},{appid:'01',type:4,name:'One'}],[{appid:'01',type:4,name:'One'},{appid:1,type:0,name:'One'}]]){
    const r=await run([1],rows);reconcile(r);assert.equal(r.items.length,0);assert.equal(r.diagnostics.outcomes.conflictingDuplicate,1);
   }
 }],
 ['Steam metadata: repeated scans retry unresolved/unsupported IDs but not captured games or DLC',async()=>{
   const f=fixture([1,2,3,4],[response([{appid:1,type:0,name:'Game'},{appid:2,type:4,name:'DLC'},{appid:3,type:6}]),response([{appid:3,type:6},{appid:4,type:0,name:'Now available'}])]);
   const first=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true}),next=await f.S.fetchOwnedSteamGames(()=>{},first.items.map(i=>i.providerItemId),{diagnostics:true});
   reconcile(first);reconcile(next);assert.equal(next.newAppCount,2);assert.equal(next.items[0].providerItemId,'4');assert.equal(next.unsupportedAppCount,1);assert.equal(next.unresolvedApps.length,0);
 }],
 ['Steam samples: disabled by default, explicit collection is bounded and never part of ordinary diagnostics',async()=>{
   const ids=Array.from({length:55},(_,i)=>i+1),f=fixture(ids,[response([]),response([])]);
   await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});assert.equal(f.S.getDiagnosticSample(),null);
   const notice=f.S.setDiagnosticSampling(true);assert.match(notice.notice,/may reveal/);
   const r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true}),sample=f.S.getDiagnosticSample();
   assert.equal(sample.groups.absent.length,20);assert.deepEqual(Array.from(sample.groups.absent,row=>row.appId),ids.slice(0,20).map(String));
   assert(!JSON.stringify(r.diagnostics).includes('appId'));assert(sample.groups.absent.every(row=>row.returnedEntry===false));
   f.S.setDiagnosticSampling(false);assert.equal(f.S.getDiagnosticSample(),null);
 }],
 ['Steam samples: deterministic across owned-list ordering and capture only closed identity/outcome fields',async()=>{
   const ids=[7,3,1,6,2,5,4],rows=[{appid:1,type:0,name:'PRIVATE TITLE',account:'PRIVATE ACCOUNT'},{appid:2,type:4},{appid:3,type:0,name:{secret:'PRIVATE TOKEN'}},{appid:4,type:null,name:'PRIVATE TITLE'},{appid:5,type:6,name:'PRIVATE TITLE'},{appid:6,type:0,name:'One'},{appid:6,type:4,name:'One'}];
   let previous;
   for(const order of [ids,[...ids].reverse()]){const f=fixture(order,[response(rows)]);f.S.setDiagnosticSampling(true);await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});const sample=JSON.parse(JSON.stringify(f.S.getDiagnosticSample()));
     assert(!JSON.stringify(sample).includes('PRIVATE'));assert(!sample.groups.games&&!sample.groups.dlc);
     assert.equal(sample.groups.invalidType[0].hasUsableName,true);assert.equal(sample.groups.invalidTitle[0].hasUsableName,false);
     assert.equal(sample.groups.unsupported[0].returnedType,6);if(previous)assert.deepEqual(sample,previous);previous=sample;
   }
 }],
 ['Steam samples: disabling collection during a request prevents late publication',async()=>{
   let f;f=fixture([1],[response([])],{onTitleRequest:()=>f.S.setDiagnosticSampling(false)});f.S.setDiagnosticSampling(true);
   await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});assert.equal(f.S.getDiagnosticSample(),null);
 }],
 ['Steam diagnostics: request summaries and samples cannot leak IDs, names, raw errors or new arbitrary fields',async()=>{
   const r=await run([123456789],[{appid:123456789,type:0}]),P=globalThis.GalacticContentsPerformance,t=P.trace('lookup-aaaaaaaaaaaa-102','provider');
   t.provider='steam';t.steamDiagnostics={...r.diagnostics,samples:[{appId:'123456789'}],requests:[{...r.diagnostics.requests[0],appId:'123456789',name:'PRIVATE TITLE',headers:'PRIVATE TOKEN'}]};
   const clean=P.clean(t.finish('prepared'));assert.equal(clean.steamDiagnostics.outcomes.missingTitle,1);assert.equal(clean.steamDiagnostics.requests[0].matchedIdCount,1);
   assert(!JSON.stringify(clean).includes('123456789')&&!JSON.stringify(clean).includes('PRIVATE'));
   t.steamDiagnostics.outcomes.absent=5;assert.equal(P.clean(t).steamDiagnostics,undefined);
 }],
 ['Steam outcomes: a malformed neighbor no longer discards valid games and DLC',async()=>{
   const r=await run([1,2,3,4],[{appid:1,name:'PRIVATE GAME',type:0},{appid:2,name:'PRIVATE DLC',type:4,related_items:{parent_appid:1}},{appid:3,name:'Broken',type:null},{appid:'invalid',type:0}]);
   reconcile(r);assert.equal(r.items.length,2);assert.equal(r.items[1].metadata.parentProviderItemId,'1');
   assert.equal(r.diagnostics.outcomes.invalidType,1);assert.equal(r.diagnostics.outcomes.absent,1);assert.equal(r.diagnostics.malformedRows,1);assert.equal(r.failedRequestCount,0);
 }],
 ['Steam outcomes: null, missing, empty and noninteger app types never become owned games',async()=>{
   const r=await run([1,2,3,4,5],[null,undefined,'',0.5,{}].map((type,i)=>({appid:i+1,name:'Uncertain',type})));
   reconcile(r);assert.equal(r.items.length,0);assert.equal(r.diagnostics.outcomes.invalidType,5);
 }],
 ['Steam outcomes: requested titles and identifiers remain bounded to the owned selection',async()=>{
   const r=await run([1,2,3],[{appid:1,name:{secret:'not a title'},type:0},{appid:2,name:'',type:4},{appid:77,name:'Unrequested',type:0}]);
   reconcile(r);assert.equal(r.items.length,0);for(const kind of ['absent','missingTitle','invalidTitle'])assert.equal(r.diagnostics.outcomes[kind],1);
 }],
 ['Steam outcomes: repeated identical rows deduplicate; conflicting rows remain unresolved',async()=>{
   const a={appid:1,name:'Game',type:0},r=await run([1,1,2],[a,a,{appid:2,name:'One',type:0},{appid:2,name:'Two',type:0}]);
   reconcile(r);assert.equal(r.newAppCount,2);assert.equal(r.items.length,1);assert.equal(r.diagnostics.outcomes.conflictingDuplicate,1);
 }],
 ['Steam outcomes: explicit unsupported types are separate from temporary failures and remain retryable candidates',async()=>{
   const f=fixture([1,2],[response([{appid:1,name:'Game',type:0},{appid:2,type:6}]),response([{appid:2,type:6}])]);
   const a=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(a);
   const b=await f.S.fetchOwnedSteamGames(()=>{},a.items.map(i=>i.providerItemId),{diagnostics:true});reconcile(b);
   assert.equal(b.newAppCount,1);assert.equal(b.unresolvedApps.length,0);assert.equal(b.unsupportedAppCount,1);assert.equal(b.diagnostics.unsupportedTypes['6'],1);
 }],
 ...[400,401,403,429,500].map(status=>['Steam outcomes: HTTP '+status+' is retained without inventing a session diagnosis',async()=>{
   const f=fixture([1,2],[{ok:false,status},{ok:false,status}]),r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);
   const attempts=status===429||status>=500?2:1;
   assert.equal(r.failedRequestCount,attempts);assert.equal(r.diagnostics.httpStatuses[status],attempts);assert.equal(r.diagnostics.outcomes[[401,403].includes(status)?'authentication':'http'],2);
   assert.equal(r.diagnostics.firstFailure.httpStatus,status);assert.match(r.failureSummary,new RegExp(String(status)));
 }]),
 ['Steam outcomes: malformed JSON, malformed envelope and network failures remain distinct',async()=>{
   for(const [request,kind] of [[{jsonError:true},'malformed'],[{body:{error:'PRIVATE RESPONSE'}},'malformed'],[{networkError:true},'network']]){
     const r=await fixture([1],[request,request]).S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);assert.equal(r.diagnostics.outcomes[kind],1);
     if(kind==='malformed')assert.equal(r.diagnostics.firstFailure.httpStatus,200);else assert.equal(r.diagnostics.firstFailure.httpStatus,undefined);
     assert(!r.failureSummary.includes('PRIVATE'));
   }
 }],
 ['Steam outcomes: batches reconcile attempted IDs, unique unresolved IDs, request statuses and valid saves independently',async()=>{
   const ids=Array.from({length:159},(_,i)=>i+1),f=fixture(ids,[{ok:false,status:400},{ok:false,status:429},{ok:false,status:429}]);
   const r=await f.S.fetchOwnedSteamGames(()=>{},[],{diagnostics:true});reconcile(r);
   assert.equal(r.newAppCount,159);assert.equal(r.unresolvedApps.length,159);assert.equal(r.failedRequestCount,3);assert.equal(r.diagnostics.titleRequests,3);
   assert.equal(r.diagnostics.outcomes.http,159);assert.equal(f.calls(),3);
 }],
 ['Steam outcomes: full metadata failures retain owned IDs separately from readable catalog records',async()=>{
   for(const request of [{ok:false,status:403},response([{appid:1,type:null}])]){
     const result=await fixture([1],[request]).S.fetchOwnedSteamGames(()=>{},null,{diagnostics:true});
     assert(result.diagnostics.firstFailure);assert.equal(result.applications.issues.length,1);assert.equal(result.items.length,0);assert(result.snapshot.complete);
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
