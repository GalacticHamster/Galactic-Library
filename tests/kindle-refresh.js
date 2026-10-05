import assert from 'node:assert/strict';
import {withWorker} from './storage.js';
export const kindleRefreshWorkerTests=[
 ['Actual worker refresh messages require Kindle library, preserve queue ownership and acknowledge evidence/cursor together',()=>withWorker(async({dispatch,importItems,pageA})=>{
  globalThis.chrome.runtime.sendMessage=async()=>({ok:true});
  await importItems('kindle',[{providerItemId:'B000000001',title:'Synthetic collection',mediaType:'book',metadata:{detailUrl:'https://www.amazon.com/dp/B000000001'}}]);
  const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}};
  const forbidden={...sender,url:'https://www.amazon.com/dp/B000000001'};
  assert.equal((await dispatch({type:'GET_KINDLE_CONTENTS_REFRESH'},forbidden)).ok,false);
  assert.equal((await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},forbidden)).ok,false);
  const plans=await Promise.all([1,2].map(id=>dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'rescan'},{...sender,tab:{id}})));
  assert.equal(plans.filter(plan=>plan.ok).length,1,'Concurrent preparations admitted two owning tabs');
  const index=plans.findIndex(plan=>plan.ok),plan=plans[index],owner={...sender,tab:{id:index+1}},candidate=plan.candidates[0];
  const checkRequest={type:'CHECK_KINDLE_CONTENTS_REFRESH_ITEM',runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef,position:0};
  assert.deepEqual(await dispatch(checkRequest,owner),{ok:true,valid:true},'Disabled preflight diagnostics changed response');
  const timed=await dispatch({...checkRequest,diagnosticLookupId:'lookup-abcdef123456-001'},owner);assert.equal(timed.valid,true);assert.equal(timed.performance.id,'lookup-abcdef123456-001');
  for(const stage of ['worker_total','storage_read','refresh_checkpoint_read','refresh_checkpoint_validate','refresh_identity_validation'])assert.ok(timed.performance.events.some(event=>event.stage===stage),stage);
  assert.ok(!timed.performance.events.some(event=>event.stage==='read_validation'));assert.ok(!JSON.stringify(timed.performance).includes('B000000001'),'Preflight diagnostics leaked source identity');
  const refresh={runRef:plan.refresh.runRef,leaseRef:plan.refresh.leaseRef};
  const request={type:'SAVE_KINDLE_COMIC_CONTENTS',refresh,entries:[{itemId:candidate.id,recordRef:candidate.recordRef,queuePosition:0,sourceUrl:candidate.detailUrl,statement:'Collects Synthetic #1',descriptionBlocks:[{selector:'#description',text:'Collects Synthetic #1'}],availability:'statement-found',extractorVersion:5}]};
  assert.equal((await dispatch(request,forbidden)).ok,false);
  assert.equal((await dispatch(request,{...owner,tab:{id:owner.tab.id+10}})).ok,false);
  const saved=await dispatch(request,owner);assert.equal(saved.ok,true,saved.error);assert.equal(saved.refresh.cursor,1);assert.equal(saved.refresh.status,'completed');
  const db=await pageA.getDatabase(),item=db.providerItems[candidate.id];assert.equal(item.metadata.enrichment.kindleProductComicContents.extractorVersion,5);assert.equal(db.kindleContentsObservations[item.recordRef].baseline,null);
  assert.equal((await dispatch(request,owner)).ok,false,'Acknowledged entry replayed against completed lease');
  const finished=await dispatch({type:'FINISH_KINDLE_CONTENTS_REFRESH',...refresh,status:'completed',diagnosticLookupId:'lookup-abcdef123456-002'},owner);
  assert.equal(finished.ok,true);assert.equal(finished.performance.kind,'checkpoint');assert.equal(finished.performance.id,'lookup-abcdef123456-002');assert.ok(finished.performance.events.some(event=>event.stage==='refresh_checkpoint_read'),'Final housekeeping not measured');
 })]
];
