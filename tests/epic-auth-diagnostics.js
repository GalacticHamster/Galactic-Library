import assert from 'node:assert/strict';
import {createEpicAuthDiagnostics,EPIC_AUTH_DIAGNOSTICS_KEY as KEY,EPIC_AUTH_MAX_FAILURES as MAX,EPIC_AUTH_RETENTION_MS as TTL} from '../src/background/epic-auth-diagnostics.js';
import {withWorker,snapshotFixture} from './storage.js';
const failure=()=>({requestsMade:1,pagesRead:0,saveState:'not-requested',firstFailure:{stage:'library',kind:'authorization',httpStatus:200,upstreamStatus:401,documentReady:true,securityCheckVisible:false}});
const sender={id:'gl',frameId:0,url:'https://store.epicgames.com/en-US/?PRIVATE_TOKEN',tab:{id:1,url:'https://store.epicgames.com/en-US/'}};
const success={snapshot:{scopes:[{id:'library',pagesRead:6}]},epicDiagnostic:{documentReady:true,securityCheckVisible:false}};
function harness(){
  const values={};let now=100000,writes=0,ioFailure=false;
  const area={get:async defaults=>{if(ioFailure)throw Error('unavailable');return structuredClone({...defaults,...values});},set:async patch=>{if(ioFailure)throw Error('unavailable');writes++;Object.assign(values,structuredClone(patch));},remove:async key=>{writes++;delete values[key];}};
  const runtime={id:'gl',getURL:path=>'chrome-extension://gl/'+path};
  const fresh=()=>createEpicAuthDiagnostics({area,runtime,clock:()=>now});let diagnostic=fresh();
  return {values,get diagnostic(){return diagnostic;},reload:()=>{diagnostic=fresh();},advance:ms=>{now+=ms;},fail:()=>{ioFailure=true;},writes:()=>writes,ask:(request,s=sender)=>new Promise(resolve=>diagnostic.handle({type:'EPIC_AUTH_DIAGNOSTICS',...request},s,resolve))};
}
export const epicAuthDiagnosticsTests=[
 ['Epic passive diagnostics record only HTTP 200/upstream 401 stopped before saving, with an explicit field allowlist',async()=>{
   const h=harness();
   for(const patch of [{firstFailure:{...failure().firstFailure,httpStatus:401}},{firstFailure:{...failure().firstFailure,upstreamStatus:403}},{saveState:'requested'},{saveState:'saved'}, {requestsMade:99}])assert.equal((await h.ask({action:'recordFailure',operation:'full',diagnostic:{...failure(),...patch}})).recorded,false);
   assert.equal(h.writes(),0);
   const d={...failure(),rawBody:'PRIVATE_BODY',accountId:'PRIVATE_ID',headers:{authorization:'PRIVATE_TOKEN'},title:'PRIVATE_TITLE'};
   assert((await h.ask({action:'recordFailure',operation:'full',diagnostic:d})).recorded);
   const history=(await h.ask({action:'get'})).history,event=history.episodes[0].failure;
   assert.deepEqual(Object.keys(event).sort(),['at','operation','phase','outerStatus','upstreamStatus','category','pagesRead','pageReady','securityCheckVisible','route','saveState'].sort());
   assert.equal(event.outerStatus,200);assert.equal(event.upstreamStatus,401);assert.equal(event.route,'store');assert(!JSON.stringify(h.values).includes('PRIVATE'));
 }],
 ['Epic diagnostic messages reject foreign sites, extensions, frames, and page-claimed success',async()=>{
   const h=harness(),request={action:'recordFailure',operation:'full',diagnostic:failure()};
   for(const patch of [{id:'foreign'},{frameId:1},{url:'https://store.epicgames.com.evil.example/'},{url:'https://www.epicgames.com/'}])assert.equal((await h.ask(request,{...sender,...patch})).ok,false);
   assert.equal((await h.ask({action:'recordSuccess',operation:'full',diagnostic:failure()})).ok,false);
   assert.equal(h.writes(),0);
 }],
 ['Epic ordinary successful imports produce no retained event or diagnostic write',async()=>{
   const h=harness();assert.equal(await h.diagnostic.committed(success,sender,'full'),false);assert.equal((await h.diagnostic.report()).episodes.length,0);assert.equal(h.writes(),0);
 }],
 ['Epic later successes do not grow history or attach themselves to older historical failures',async()=>{
   const h=harness();for(let n=0;n<2;n++)await h.ask({action:'recordFailure',operation:'full',diagnostic:failure()});
   await h.diagnostic.committed(success,sender,'full');const writes=h.writes();await h.diagnostic.committed(success,sender,'full');
   const episodes=(await h.diagnostic.report()).episodes;assert.equal(h.writes(),writes);assert.equal(episodes[0].subsequentSuccess,null);assert.equal(episodes[1].subsequentSuccess.saveState,'saved');
 }],
 ['Epic Full and incremental failure receipts survive worker recreation and interrupted attempts; only committed later success is paired',async()=>{
   for(const operation of ['full','incremental']){
     const h=harness();await h.ask({action:'recordFailure',operation,diagnostic:failure()});h.reload();
     assert.equal((await h.diagnostic.report()).episodes[0].subsequentSuccess,null);
     h.advance(1000);await h.diagnostic.committed(success,{...sender,tab:{id:9,url:'https://store.epicgames.com/en-US/u/PRIVATE_USERNAME/achievements?PRIVATE_TOKEN'}},operation);
     const report=await h.diagnostic.report(),episode=report.episodes[0];assert.equal(episode.failure.operation,operation);assert.equal(episode.subsequentSuccess.operation,operation);
     assert.equal(episode.subsequentSuccess.pagesRead,6);assert.equal(episode.subsequentSuccess.multiplePages,true);assert.equal(episode.subsequentSuccess.route,'achievements');
     assert.equal(report.navigationBetweenAttempts,'not-monitored');assert(report.correlation.includes('account-continuity-not-collected'));assert(!JSON.stringify(report).includes('PRIVATE'));
     const writes=h.writes();await h.diagnostic.committed(success,sender,operation);assert.equal(h.writes(),writes);
   }
 }],
 ['Epic history retains at most ten failure episodes and expires from the failure time without extending retention on success',async()=>{
   const h=harness();for(let n=0;n<MAX+3;n++){await h.ask({action:'recordFailure',operation:'full',diagnostic:failure()});h.advance(1);}
   assert.equal((await h.diagnostic.report()).episodes.length,MAX);h.advance(TTL-100);await h.diagnostic.committed(success,sender,'full');h.advance(101);
   assert.equal((await h.diagnostic.report()).episodes.length,0);assert.equal(h.values[KEY],undefined);
 }],
 ['Epic stored diagnostic extras and malformed/expired records cannot leak into exports or library data',async()=>{
   const h=harness();await h.ask({action:'recordFailure',operation:'full',diagnostic:failure()});h.values[KEY].episodes[0].failure.cookies='PRIVATE';h.values[KEY].account='PRIVATE';h.values[KEY].episodes.push({failure:{at:-1,title:'PRIVATE'}});
   assert.equal((await h.diagnostic.report()).episodes.length,1);assert(!JSON.stringify(h.values).includes('PRIVATE'));h.fail();assert.equal((await h.ask({action:'get'})).ok,false);
 }],
 ['Epic real worker pairs recovery only after a validated atomic save, preserving failed-save behavior',()=>withWorker(async({dispatch,pageA,memory})=>{
   const s={...sender,id:chrome.runtime.id},items=[{providerItemId:'epic-fixture',title:'Synthetic Epic game',mediaType:'game',ownership:'owned'}];
   const recorded=await dispatch({type:'EPIC_AUTH_DIAGNOSTICS',action:'recordFailure',operation:'full',diagnostic:failure()},s);assert(recorded.recorded);
   const scan=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'epic',beginScan:true,confirmed:true,profileLabel:'Synthetic',mode:'full'},s);assert(scan.ok,scan.error);
   const before=await pageA.getDatabase(),request={type:'COMMIT_PROVIDER_SCAN',provider:'epic',mode:'full',items,scanToken:scan.scanToken,epicDiagnostic:{documentReady:true,securityCheckVisible:false}};
   assert.equal((await dispatch(request,s)).ok,false);assert.deepEqual((await pageA.getDatabase()).providerItems,before.providerItems);
   assert.equal((await dispatch({type:'EPIC_AUTH_DIAGNOSTICS',action:'get'},s)).history.episodes[0].subsequentSuccess,null);
   const snapshot=snapshotFixture('epic',items);snapshot.scopes[0].pagesRead=6;
   assert((await dispatch({...request,snapshot},s)).ok);
   const history=(await dispatch({type:'EPIC_AUTH_DIAGNOSTICS',action:'get'},s)).history;assert.equal(history.episodes[0].subsequentSuccess.pagesRead,6);assert.equal(history.episodes[0].subsequentSuccess.saveState,'saved');
   assert(memory.values[KEY]);assert(!JSON.stringify(history).includes('Synthetic Epic game'));assert.equal(Object.keys((await pageA.getDatabase()).providerItems).length,1);
   // Diagnostic persistence failure cannot turn a committed library save into
   // an import failure. The area rejects only the separate diagnostic key.
   await dispatch({type:'EPIC_AUTH_DIAGNOSTICS',action:'recordFailure',operation:'full',diagnostic:failure()},s);
   const set=memory.area.set;memory.area.set=patch=>{if(KEY in patch)throw Error('Diagnostic storage unavailable');return set(patch);};
   const again=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'epic',beginScan:true,confirmed:true,profileLabel:'Synthetic',mode:'full'},s);
   assert((await dispatch({...request,scanToken:again.scanToken,snapshot},s)).ok);assert.equal(Object.keys((await pageA.getDatabase()).providerItems).length,1);
 })]
];
