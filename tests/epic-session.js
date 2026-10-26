import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
export const epicPage=(cursor=null)=>({data:{Library:{libraryItems:{records:[{catalogItemId:'fixture-123',namespace:'store',catalogItem:{id:'fixture-123',title:'Test epic'}}],responseMetadata:{nextCursor:cursor}}}}});
export function epicHarness(responses){
 let count=0,challenge=false,visible=true;
 const ctx=vm.createContext({document:{readyState:'complete',querySelector:()=>challenge?{getClientRects:()=>visible?[{}]:[],getAttribute:()=>null}:null},fetch:async()=>{const response=responses[count++];if(response instanceof Error)throw response;if(typeof response==='function')return response();return {ok:response.status<400,status:response.status,json:async()=>response.body};}});
 for(const file of ['provider-snapshot','epic'])vm.runInContext(readFileSync(new URL('../src/providers/'+file+'.js',import.meta.url),'utf8'),ctx);
 return {api:ctx.GalacticEpic,count:()=>count,challenge:value=>{challenge=value;},visible:value=>{visible=value;}};
}
export const epicSessionTests=[
 ['Epic live failure/success shape: loaded page without a visible challenge is not authorization readiness',async()=>{
   const h=epicHarness([{status:200,body:{errors:[{message:'LibraryQuery/libraryItems: Request failed with status code 401'}]}},...Array.from({length:6},(_,index)=>({status:200,body:epicPage(index===5?null:'page-'+(index+2))}))]);
   await assert.rejects(h.api.fetchEpicGames(),/My Achievements/);
   const failed=h.api.getDiagnostics();
   assert.equal(failed.documentReady,true);assert.equal(failed.securityCheckVisible,false);assert.equal(failed.requestsMade,1);assert.equal(failed.pagesRead,0);
   assert.equal(failed.firstFailure.httpStatus,200);assert.equal(failed.firstFailure.upstreamStatus,401);assert.equal(failed.saveState,'not-requested');
   // A separate explicit attempt represents the observed retry after account
   // navigation. The fixture does not invent the unknown refresh mechanism.
   await h.api.fetchEpicGames();const succeeded=h.api.getDiagnostics();
   assert.equal(succeeded.documentReady,failed.documentReady);assert.equal(succeeded.securityCheckVisible,failed.securityCheckVisible);
   assert.equal(succeeded.requestsMade,6);assert.equal(succeeded.pagesRead,6);assert.equal(succeeded.firstFailure,null);assert.equal(succeeded.automaticRetries,0);
   assert.equal(succeeded.saveState,'not-requested','Reading all pages alone must not claim a save');
 }],
 ['Epic distinguishes transport and upstream GraphQL authorization without exposing raw server text or retrying',async()=>{
   for(const response of [{status:401},{status:403},{status:200,body:{errors:[{message:'LibraryQuery/libraryItems: Request failed with status code 401 PRIVATE_TOKEN'}]}},{status:200,body:{errors:[{extensions:{code:'UNAUTHENTICATED'},message:'PRIVATE_ACCOUNT'}]}}]){
     const h=epicHarness([response]);await assert.rejects(h.api.fetchEpicGames(),error=>error.message.includes(response.status===200?'My Achievements':'Sign in on Epic')&&!/401|403|PRIVATE|LibraryQuery/.test(error.message));
     assert.equal(h.count(),1);const report=h.api.getDiagnostics();assert.equal(report.requestsMade,1);assert.equal(report.pagesRead,0);assert.equal(report.automaticRetries,0);assert.equal(report.saveState,'not-requested');assert(!JSON.stringify(report).includes('PRIVATE'));
   }
 }],
 ['Epic permits a fresh user retry after session navigation or security verification, with no overlapping request',async()=>{
   let release;const h=epicHarness([()=>new Promise(resolve=>{release=()=>resolve({ok:false,status:401});}),{status:200,body:epicPage()}]);
   h.challenge(true);const first=h.api.fetchEpicGames();await assert.rejects(h.api.fetchEpicGames(),/already running/);assert.equal(h.count(),1);release();await assert.rejects(first,/Sign in on Epic/);
   assert.equal(h.api.getDiagnostics().firstFailure.securityCheckVisible,true);h.challenge(false);const result=await h.api.fetchEpicGames();assert.equal(result.items.length,1);assert.equal(h.count(),2);assert.equal(h.api.getDiagnostics().firstFailure,null);assert.equal(h.api.getDiagnostics().securityCheckVisible,false);
   h.api.recordSaveState('requested');assert.equal(h.api.getDiagnostics().saveState,'requested');
   h.api.recordSaveState('saved');assert.equal(h.api.getDiagnostics().saveState,'saved');h.api.resetDiagnostics();assert.equal(h.api.getDiagnostics(),null);
 }],
 ['Epic later-page authorization failure never returns a partial or empty replacement snapshot',async()=>{
   const h=epicHarness([{status:200,body:epicPage('next')},{status:401}]);await assert.rejects(h.api.fetchEpicGames(),/saved library is unchanged/);assert.equal(h.api.getDiagnostics().pagesRead,1);assert.equal(h.count(),2);assert.equal(h.api.getDiagnostics().saveState,'not-requested');
 }],
 ['Epic hidden sign-in/challenge markup is not reported as a visible interactive check',async()=>{
   const h=epicHarness([{status:401}]);h.challenge(true);h.visible(false);await assert.rejects(h.api.fetchEpicGames());assert.equal(h.api.getDiagnostics().firstFailure.securityCheckVisible,false);
 }],
 ['Epic unknown GraphQL, unreadable and network failures stay distinct and sanitized',async()=>{
   for(const [response,kind]of [[{status:200,body:{errors:[{message:'PRIVATE_ERROR'}]}},'graphql'],[{status:200,body:null},'validation'],[Error('PRIVATE_NETWORK'),'network']]){
     const h=epicHarness([response]);await assert.rejects(h.api.fetchEpicGames(),e=>!e.message.includes('PRIVATE'));assert.equal(h.api.getDiagnostics().firstFailure.kind,kind);assert.equal(h.count(),1);
   }
   for(const response of [{status:429},{status:200,body:{errors:[{extensions:{code:'FORBIDDEN'}}]}}]){
     const h=epicHarness([response]);await assert.rejects(h.api.fetchEpicGames(),e=>!e.message.includes('My Achievements'));assert.equal(h.count(),1);
   }
 }]
];
