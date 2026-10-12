import assert from 'node:assert/strict';
import '../src/lib/contents-performance.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {withWorker} from './storage.js';

const perf=globalThis.GalacticContentsPerformance;
const id=n=>`lookup-abcdef123456-${String(n).padStart(3,'0')}`;
const makeWriter=()=>{const values={};return createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});};
const prepare=async writer=>{
 await writer.mergeProviderItems('kindle',[{providerItemId:'B000000001',title:'PRIVATE_TITLE',mediaType:'book',ownership:'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B000000001',originType:'Purchase'}}]);
 const db=await writer.getDatabase(),record=db.providerItems['kindle:B000000001'];
 return {itemId:record.id,recordRef:record.recordRef,sourceUrl:record.metadata.detailUrl,statement:'Includes PRIVATE_ONE and PRIVATE_TWO',availability:'statement-found',extractorVersion:2};
};
const comparable=db=>{const copy=structuredClone(db);for(const item of Object.values(copy.providerItems)){delete item.recordRef;delete item.updatedAt;const saved=item.metadata.enrichment?.kindleProductComicContents;if(saved){delete saved.checkedAt;delete saved.retrievedAt;delete saved.selectionRef;}}for(const observation of Object.values(copy.kindleContentsObservations??{}))delete observation.undoRef;copy.enrichmentHistory={};copy.providers={};return copy;};

export const contentsPerformanceTests=[
 ['Kobo diagnostics retain only bounded numeric stages, survive export and enforce provider-page access',async()=>withWorker(async({dispatch,pageA})=>{
   await pageA.mergeProviderItems('kobo',[{providerItemId:'a',title:'PRIVATE KOBO TITLE',mediaType:'book',ownership:'unknown'}],{profileLabel:'Private nickname'});
   const sender={id:globalThis.chrome.runtime.id,url:'https://www.kobo.com/us/en/library',tab:{id:42}};
   const profile=await dispatch({type:'GET_PROVIDER_PROFILE',provider:'kobo'},sender);assert(profile.ok);assert.equal(profile.performance.kind,'provider');assert.equal(profile.performance.providerPhase,'profile');
   const hint=await dispatch({type:'GET_PROVIDER_PROFILE_HINT',provider:'kobo',diagnosticSentEpochMs:perf.now()-25},sender);assert(hint.ok);
   assert.equal(hint.performance.providerPhase,'hint');assert.equal(hint.performance.profileHintStatus,'found');
   for(const stage of ['handler_delay','provider_hint_ready','provider_hint_read'])assert(hint.performance.events.some(e=>e.stage===stage));
   const account=perf.clean({...hint.performance,providerPhase:'account',profileHintStatus:'missing',privateNickname:'PRIVATE'});assert.equal(account.providerPhase,'account');assert.equal(account.profileHintStatus,'missing');assert(!JSON.stringify(account).includes('PRIVATE'));
   const denied=await dispatch({type:'GET_PROVIDER_PROFILE_HINT',provider:'kobo'},{...sender,url:'https://example.com'});assert.equal(denied.ok,false);
   const row=perf.trace(id(8),'provider');row.providerPhase='scan';const end=row.begin('provider_fetch');end();row.privateTitle='PRIVATE';
   await dispatch({type:'GL_PROVIDER_UI_TIMING',provider:'kobo',timing:row.finish('prepared')},sender);
   await dispatch({type:'GL_PROVIDER_UI_TIMING',provider:'kobo',timing:{...row,id:id(9)}},{...sender,url:'https://example.com'});
   const exported=await dispatch({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'},{id:sender.id,url:globalThis.chrome.runtime.getURL('src/ui/options.html')});
   assert(exported.ok);assert(exported.providers.some(r=>r.id===id(8)&&r.providerPhase==='scan'));assert(!exported.providers.some(r=>r.id===id(9)));
   assert(!JSON.stringify(exported.providers).includes('PRIVATE'));assert(!JSON.stringify(exported.providers).includes('nickname'));
 },{concurrentQueries:true})],
 ['refresh timing joins preflight and save without double counting history, checkpoint or worker costs',()=>{
  let clock=1000;const page=perf.trace(id(1),'network',()=>clock),worker=perf.trace(id(1),'network',()=>clock);
  const event=(trace,stage,amount)=>{const end=trace.begin(stage);clock+=amount;end();};
  let message=page.begin('refresh_check_message'),total=worker.begin('worker_total');event(worker,'storage_read',100);event(worker,'refresh_checkpoint_read',4);event(worker,'refresh_checkpoint_validate',2);event(worker,'refresh_identity_validation',1);total();message();perf.merge(page,worker);
  event(page,'fetch_headers',400);event(page,'response_body',1500);event(page,'extraction',2);event(page,'throttle',1000);
  const save=perf.trace(id(1),'network',()=>clock);message=page.begin('save_message');total=save.begin('worker_total');event(save,'history_update',3);event(save,'parsing',5);event(save,'storage_write',200);event(save,'refresh_checkpoint_validate',2);total();message();perf.merge(page,save);
  const row=perf.breakdown(perf.clean(page.finish('statement-found')));
  assert.equal(row.total,3219);assert.equal(row.network,1900);assert.equal(row.persistence,300);assert.equal(row.history,3);assert.equal(row.checkpoint,8);assert.equal(row.recomputation,1);assert.equal(row.processing,7);assert.equal(row.throttle,1000);assert.equal(row.messaging,0);assert.equal(row.workerOther,0);assert.equal(row.unexplained,0);assert.equal(row.accountingOverlap,0);
 }],
 ['tail checkpoint diagnostics remain separate and retain their cost for amortized live comparisons',()=>{
  const collector=perf.collector();let clock=0;
  const page=perf.trace(id(1),'network',()=>clock);page.attempts=1;clock+=3200;collector.add(page.finish('no-statement'));
  const checkpoint=perf.trace(id(2),'checkpoint',()=>clock);checkpoint.batchSize=7;
  const end=checkpoint.begin('storage_write');clock+=3000;end();collector.add(checkpoint.finish('checkpointed'));
  const report=collector.report();assert.equal(report.aggregates.network.stagesMs.total.count,1);assert.equal(report.aggregates.network.stagesMs.total.mean,3200);
  assert.equal(report.finalCheckpointMs,3000);assert.equal(report.aggregates.checkpoints.stagesMs.persistence.mean,3000);assert.equal(report.records[1].batchSize,7);
 }],
 ['contents diagnostics are inert without an opaque diagnostic ID',()=>{
  assert.equal(perf.trace(undefined),null);assert.equal(perf.trace('B000000001'),null);assert.equal(perf.trace('PRIVATE_TITLE'),null);
  assert.equal(perf.clean({id:'PRIVATE_ACCOUNT'}),null);
 }],
 ['contents timing joins context clocks and accounts for a complete wall-clock iteration',()=>{
  let pageNow=1000,workerNow=1020;const page=perf.trace(id(1),'network',()=>pageNow),worker=perf.trace(id(1),'network',()=>workerNow);
  const event=(t,stage,amount,set)=>{const end=t.begin(stage);set(amount);end();};
  event(page,'fetch_headers',10,x=>pageNow+=x);event(page,'response_body',5,x=>pageNow+=x);
  event(page,'extraction',2,x=>pageNow+=x);event(page,'page_ui',3,x=>pageNow+=x);
  const saveEnd=page.begin('save_message'),totalEnd=worker.begin('worker_total');
  event(worker,'storage_read',10,x=>workerNow+=x);event(worker,'read_validation',5,x=>workerNow+=x);
  event(worker,'parsing',2,x=>workerNow+=x);event(worker,'canonical_rebuild',3,x=>workerNow+=x);
  event(worker,'storage_write',10,x=>workerNow+=x);totalEnd();worker.finish();
  pageNow+=35;saveEnd();perf.merge(page,worker);
  event(page,'throttle',1000,x=>pageNow+=x);pageNow+=7;page.finish('statement-found');
  const row=perf.breakdown(perf.clean(page));
  assert.equal(row.network,15);assert.equal(row.extraction,2);assert.equal(row.parsing,2);assert.equal(row.persistence,25);assert.equal(row.messaging,5);assert.equal(row.unexplained,7);
  assert.equal(row.total,row.network+row.processing+row.persistence+row.recomputation+row.messaging+row.workerOther+row.ui+row.throttle+row.retry+row.unexplained);
  assert.equal(page.events.find(event=>event.stage==='storage_read').startMs,20);
  const before=page.events.length;perf.merge(page,perf.trace(id(2)));assert.equal(page.events.length,before);
 }],
 ['contents diagnostic samples are bounded and export only allowlisted timing fields',()=>{
  const collector=perf.collector();for(let n=1;n<=75;n++)collector.add({...perf.trace(id(n)).finish('no-statement'),title:'PRIVATE_TITLE',asin:'PRIVATE_ASIN',account:'PRIVATE_ACCOUNT',url:'https://secret.example',statement:'PRIVATE_STATEMENT',events:[{stage:'PRIVATE_STAGE',durationMs:1,startMs:0},{stage:'extraction',durationMs:2,startMs:0,contents:'PRIVATE_STATEMENT'}]});
  const report=collector.report([{...perf.trace(id(75),'options').finish(),providerId:'PRIVATE_ID'}]);
  assert.equal(report.records.length,50);assert.equal(report.records[0].id,id(26));assert.equal(report.options.length,1);
  const json=JSON.stringify(report);for(const secret of ['PRIVATE','https:','asin','statement":"','"account":','providerId'])assert.ok(!json.includes(secret),secret);
  collector.clear();assert.equal(collector.report().records.length,0);
 }],
 ['contents timing separates retries, result classes, visibility and local reparse controls',()=>{
  const collector=perf.collector();
  for(const [n,kind,result,attempts] of [[1,'network','statement-found',1],[2,'network','no-statement',1],[3,'network','statement-found',3],[4,'reparse','reparsed',0]]){
   let clock=0;const t=perf.trace(id(n),kind,()=>clock);t.attempts=attempts;t.visibilityStart=t.visibilityEnd=n===2?'hidden':'visible';t.focusStart=t.focusEnd=n!==2;
   if(n===3){const end=t.begin('retry_wait',1);clock+=2000;end();}
   clock+=100;collector.add(t.finish(result));
  }
  const report=collector.report();assert.equal(report.aggregates.ordinary.stagesMs.total.count,2);assert.equal(report.aggregates.retry.stagesMs.total.count,1);assert.equal(report.aggregates.retry.stagesMs.retry.mean,2000);assert.equal(report.aggregates.reparse.stagesMs.total.count,1);assert.equal(report.aggregates.byVisibility.hidden.stagesMs.total.count,1);
  assert.deepEqual(perf.stats([1,2,3,4,5]),{count:5,min:1,median:3,mean:3,p90:5,p95:5,max:5});
 }],
 ['contents writer diagnostics measure read/validation/parse/rebuild/checkpoint without changing saved semantics',async()=>{
  const normal=makeWriter(),instrumented=makeWriter(),a=await prepare(normal);await instrumented.restoreDatabase(await normal.getDatabase());const b=structuredClone(a);
  await normal.saveKindleComicContents([a]);const trace=perf.trace(id(1));await instrumented.execute('saveKindleComicContents',[[b]],trace);
  const measured=new Set(trace.events.map(event=>event.stage));for(const stage of ['writer_capture','writer_queue','storage_read','read_validation','migration_compare','entry_validation','parsing','history_update','enrichment_update','canonical_rebuild','persist_validation','storage_write'])assert.ok(measured.has(stage),stage);
  assert.deepEqual(comparable(await normal.getDatabase()),comparable(await instrumented.getDatabase()));
  const reparse=perf.trace(id(2),'reparse');await instrumented.execute('reparseKindleContents',[[{itemId:b.itemId,recordRef:b.recordRef}]],reparse);assert.ok(reparse.events.some(event=>event.stage==='parsing'));assert.ok(!reparse.events.some(event=>event.stage==='canonical_rebuild'));
  assert.ok(!JSON.stringify(perf.clean(trace)).includes('PRIVATE'));assert.equal(perf.trace(undefined),null);
 }],
 ['contents worker replies preserve correlation, keep disabled responses unchanged and guard diagnostic access',async()=>withWorker(async({dispatch,pageA})=>{
  const notices=[];globalThis.chrome.runtime.sendMessage=async request=>{notices.push(request);return {ok:true};};
  const entry=await prepare(pageA),sender={id:globalThis.chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll'};
  const normal=await dispatch({type:'SAVE_KINDLE_COMIC_CONTENTS',entries:[entry]},sender);assert.deepEqual(normal,{ok:true});
  const timed=await dispatch({type:'SAVE_KINDLE_COMIC_CONTENTS',entries:[entry],diagnosticLookupId:id(1)},sender);assert.equal(timed.ok,true);assert.equal(timed.performance.id,id(1));assert.ok(timed.performance.events.some(event=>event.stage==='worker_total'));assert.ok(timed.performance.events.some(event=>event.stage==='storage_write'));assert.equal(notices[0].diagnosticLookupId,id(1));
  for(const [type,kind] of [['GET_KINDLE_COMIC_CONTENT_CANDIDATES','prepare'],['REPARSE_KINDLE_CONTENTS','reparse']]){const response=await dispatch({type,entries:[{itemId:entry.itemId,recordRef:entry.recordRef}],diagnosticLookupId:id(2)},sender);assert.equal(response.ok,true);assert.equal(response.performance.kind,kind);}
  const denied=await dispatch({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'},{...sender,url:'https://example.com'});assert.equal(denied.ok,false);
  assert.ok(!JSON.stringify(timed.performance).includes('PRIVATE'));assert.ok(!JSON.stringify(timed.performance).includes('amazon'));
 })],
];
