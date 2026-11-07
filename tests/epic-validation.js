import assert from 'node:assert/strict';
import {epicHarness} from './epic-session.js';
import {withWorker} from './storage.js';
const record=(id,extra={})=>({namespace:'store',catalogItemId:String(id),catalogItem:{id:String(id),title:`Synthetic Epic ${id}`,...extra}});
const page=(records,nextCursor=null)=>({status:200,body:{data:{Library:{libraryItems:{records,responseMetadata:{nextCursor}}}}}});
const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://store.epicgames.com/en-US/library',tab:{id:72}};
const plain=v=>JSON.parse(JSON.stringify(v));
const scenarios=[
 ['single page',[page([record(1)])],false,1,null],
 ['six pages without optional totals',Array.from({length:6},(_,i)=>page([record(i+1)],i===5?null:String(i+1))),false,6,null],
 ['empty terminal page',[page([record(1)],'next'),page([])],false,1,null],
 ['identical duplicate across pages',[page([record(1)],'next'),page([record(1),record(2)])],false,2,null],
 ['identical duplicate within page',[page([record(1),record(1)])],false,1,null],
 ['conflicting title',[page([record(1),record(2)],'next'),page([record(1,{title:'Conflicting title'})])],true,1,'conflicting-entry'],
 ['conflicting type',[page([record(1),record(2)],'next'),page([record(1,{mainGameItem:{id:'2'}})])],true,1,'conflicting-entry'],
 ['conflicting namespace',[page([record(1),record(2),{...record(1),namespace:'different'}])],true,1,'conflicting-entry'],
 ['malformed entry',[page([record(1)],'next'),page([null,{catalogItemId:'2'}])],true,1,'invalid-entry'],
 ['later HTTP 503',[page([record(1)],'next'),{status:503}],true,1,'http'],
 ['later network failure',[page([record(1)],'next'),Error('private network details')],true,1,'network'],
 ['cursor loop',[page([record(1)],'next'),page([record(2)],'next')],true,2,'cursor-loop'],
 ['empty cursor exhaustion',[page([record(1)],'next'),page([record(2)],'')],false,2,null],
 ['non-string cursor',[page([record(1)],'next'),page([record(2)],17)],true,1,'invalid-cursor'],
 ['add-on-only partial',[page([record(2,{mainGameItem:{id:'1'}})],'next'),{status:503}],true,1,'http'],
 ['page bound',Array.from({length:500},(_,i)=>page([record(i+1)],String(i+1))),true,500,'page-limit']
];
export const epicValidationTests=scenarios.map(([name,responses,incomplete,count,reason])=>[
 `Epic operational completion: ${name}`,()=>withWorker(async w=>{
   const h=epicHarness(responses),acquired=plain(await h.api.fetchEpicGames());
   assert.equal(acquired.incomplete,incomplete);assert.equal(acquired.snapshot.complete,!incomplete);assert.equal(acquired.items.length,count);
   const d=h.api.getDiagnostics();assert.equal(d.incomplete,incomplete);assert.equal(d.conflictingIds,name.startsWith('conflicting')?1:0);
   assert.deepEqual(plain(d.incompleteReasons),reason?[reason]:[]);
   if(!incomplete)assert.equal(d.terminal,'cursor-exhausted');
   if(['cursor loop','page bound'].includes(name))assert.equal(d.firstFailure.kind,reason);
   // Exercise runtime lease validation and durable writer, not just projection.
   await w.pageA.mergeProviderItems('epic',[{providerItemId:'old',title:'Earlier owned game',mediaType:'game',ownership:'owned'}],{profileLabel:'Personal'});
   const start=await w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'epic',beginScan:true,confirmed:true,profileLabel:'Personal',mode:'full'},sender);assert(start.ok,start.error);
   const saved=await w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'epic',mode:'full',scanToken:start.scanToken,items:acquired.items,snapshot:acquired.snapshot,scanDiagnostics:{incomplete}},sender);assert(saved.ok,saved.error);
   const db=await w.pageB.getDatabase(),items=Object.values(db.providerItems).filter(i=>i.provider==='epic');
   assert.equal(items.length,count+1);assert(items.some(i=>i.providerItemId==='old'&&i.ownership==='owned'));
   assert.equal(Object.keys(db.providerHistory).length,0);assert.equal(Boolean(db.providers.epic.fullSyncAt),!incomplete);
   assert.equal(db.providers.epic.syncHealth.status,incomplete?'partial':'succeeded');
 })
]);
for(const [name,response]of [
 ['missing identity',page([{catalogItem:{title:'No native ID'}}])],
 ['unreadable top-level',{status:200,body:{data:{}}}],
 ['missing next cursor',{status:200,body:{data:{Library:{libraryItems:{records:[record(2)],responseMetadata:{}}}}}}],
 ['upstream 401',{status:200,body:{errors:[{extensions:{code:'UNAUTHENTICATED'}}]}}]
])epicValidationTests.push([`Epic fatal boundary: ${name}`,async()=>{
 const h=epicHarness(name==='missing identity'?[response]:[page([record(1)],'next'),response]);
 await assert.rejects(h.api.fetchEpicGames());assert.equal(h.api.getDiagnostics().saveState,'not-requested');
}]);
epicValidationTests.push(['Epic successful supported subset preserves unseen ownership and clears a real incomplete status',()=>withWorker(async w=>{
 const run=async responses=>{const h=epicHarness(responses),result=plain(await h.api.fetchEpicGames());const lease=await w.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'epic',beginScan:true,confirmed:true,profileLabel:'Personal',mode:'full'},sender);const saved=await w.dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'epic',mode:'full',scanToken:lease.scanToken,items:result.items,snapshot:result.snapshot,scanDiagnostics:{incomplete:result.incomplete}},sender);assert(saved.ok,saved.error);};
 await run([page([record(1),record(2)],'next'),{status:503}]);const before=await w.pageA.getDatabase();assert(!before.providers.epic.fullSyncAt);
 await run([page([record(1)])]);const after=await w.pageB.getDatabase();assert.equal(Object.values(after.providerItems).filter(i=>i.provider==='epic').length,2);assert(after.providers.epic.fullSyncAt);assert.equal(after.providers.epic.syncHealth.status,'succeeded');assert.equal(Object.keys(after.providerHistory).length,0);
})]);
