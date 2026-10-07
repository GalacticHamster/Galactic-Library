import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {kindleContentsPlan,kindleContentsState} from '../src/lib/kindle-contents.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {ownedContentIndex,CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import {KINDLE_REFRESH_KEY} from '../src/lib/kindle-contents-refresh.js';
import {contentsObservation} from '../src/lib/kindle-contents-observations.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
const equal=(a,b,message)=>assert(JSON.stringify(a)===JSON.stringify(b),message);
const rejects=async(fn,message)=>{let rejected=false;try{await fn();}catch{rejected=true;}assert(rejected,message);};
const url=id=>'https://www.amazon.com/dp/'+id;
const book=(n,saved)=>normalizeProviderItem({provider:'kindle',providerItemId:'B'+String(n).padStart(9,'0'),title:'Collection '+n,mediaType:'book',ownership:'owned',metadata:{detailUrl:url('B'+String(n).padStart(9,'0')),...(saved?{enrichment:{kindleProductComicContents:saved}}:{})}});
const old=(version=2)=>({source:'amazon-product-page',sourceUrl:url('B000000001'),statement:'Collects Historical #1-2',availability:'statement-found',checkedAt:'2026-10-01T00:00:00.000Z',extractorVersion:version,parserVersion:4,parseOutcome:'full'});
const database=(...items)=>{const db=createEmptyDatabase();for(const i of items)db.providerItems[i.id]=i;return validateDatabase(db);};
const memory=(cacheRefreshPreflight=false)=>{const values={},reads=[];let fail=false;const area={get:async defaults=>{reads.push(Object.keys(defaults));return Object.fromEntries(Object.keys(defaults).map(key=>[key,structuredClone(values[key]??defaults[key])]));},set:async patch=>{if(fail)throw Error('Synthetic write failure');Object.assign(values,structuredClone(patch));},remove:async keys=>keys.forEach(k=>delete values[k])};return {values,reads,area,writer:createStorageWriter(area,Promise.resolve(),{cacheRefreshPreflight}),setFail:value=>{fail=value;}};};
const observation=(candidate,statement='Collects Fresh #3-4',availability='statement-found',failureCode)=>({itemId:candidate.id,recordRef:candidate.recordRef,queuePosition:candidate.queuePosition,sourceUrl:candidate.detailUrl,statement,availability,extractorVersion:5,...(failureCode?{failureCode}:{}),...(availability==='statement-found'?{descriptionBlocks:[{selector:'#description',text:statement}]}:{})});
const begin=writer=>writer.beginKindleContentsRefresh('start',1);
const commit=(writer,plan,entries)=>writer.commitKindleContentsRefresh(entries,plan.refresh.runRef,plan.refresh.leaseRef,1);
const cases=[];const add=(name,check)=>cases.push([name,check]);

add('Refresh A–H includes every eligible prior outcome and excludes unsupported records',async()=>{
 const items=[book(1),book(2,{...old(),sourceUrl:url('B000000002')}),book(3,{...old(5),sourceUrl:url('B000000003')}),book(4,{...old(),statement:'',availability:'unavailable'}),book(5,{...old(),statement:'',availability:'no-statement'}),book(6,{...old(),statement:'',availability:'temporary-failure'})];
 const invalid=book(7);invalid.metadata.detailUrl='https://www.amazon.com/not-supported';const foreign=normalizeProviderItem({provider:'humble',providerItemId:'other',title:'Other',mediaType:'book'});const doc=book(8);doc.mediaType='audiobook';
 const store=memory();await store.writer.restoreDatabase(database(...items,invalid,foreign,doc));const plan=await begin(store.writer);
 equal(plan.candidates.map(e=>e.id).sort(),items.map(e=>e.id).sort(),'Queue omitted prior success/outcome');assert(plan.reprocess.length===0,'Historical parse changed before acquisition');equal(plan.refresh.total,6,'Queue count');
});
add('Refresh I/L/M/R saves source and cursor together, preserves baseline and uses parser 5',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1,old())));const before=await store.writer.getDatabase(),plan=await begin(store.writer);
 await commit(store.writer,plan,[observation(plan.candidates[0])]);const after=await store.writer.getDatabase(),item=after.providerItems['kindle:B000000001'],history=after.kindleContentsObservations[item.recordRef];
 equal(history.baseline.statement,before.providerItems[item.id].metadata.enrichment.kindleProductComicContents.statement,'Lost baseline');equal(history.baseline.parserVersion,4,'Reparsed baseline');equal(history.baseline.extractorVersion,2,'Lost historical generation');
 equal(item.metadata.enrichment.kindleProductComicContents.extractorVersion,5,'New source generation');equal(item.metadata.enrichment.kindleProductComicContents.parserVersion,CONTENTS_PARSER_VERSION,'Fresh parser');equal(item.metadata.enrichment.kindleProductComicContents.statement,'Collects Fresh #3-4','Fresh not current');
 equal(store.values[KINDLE_REFRESH_KEY].cursor,1,'Cursor not saved');equal(parseBackup(createBackup(after)).kindleContentsObservations,after.kindleContentsObservations,'History backup');
 const saved=JSON.stringify(after);store.setFail(true);await rejects(()=>store.writer.saveKindleComicContents([observation(plan.candidates[0],'Collects Next #5')]),'Failed persistence did not reject');store.setFail(false);equal(JSON.stringify(await store.writer.getDatabase()),saved,'Partial failed write');
});
for(const [availability,code]of [['temporary-failure','network'],['temporary-failure','captcha'],['temporary-failure','sign-in'],['unavailable',undefined]]){
 add('Refresh J/K preserves useful current observation on '+(code??availability),async()=>{
  const store=memory();await store.writer.restoreDatabase(database(book(1,old())));const before=await store.writer.getDatabase(),plan=await begin(store.writer);
  await commit(store.writer,plan,[observation(plan.candidates[0],'',availability,code)]);const after=await store.writer.getDatabase(),item=after.providerItems['kindle:B000000001'];
  equal(item.metadata.enrichment,before.providerItems[item.id].metadata.enrichment,'Failure replaced usable source');
  const history=after.kindleContentsObservations[item.recordRef];equal(history.latestAttempt.extractorVersion,5,'Attempt generation');equal(history.latestAttempt.availability,availability,'Latest attempt missing');
  equal(parseBackup(createBackup(after)).kindleContentsObservations,after.kindleContentsObservations,'Failed latest backup');
  if(code==='captcha'||code==='sign-in'){equal(store.values[KINDLE_REFRESH_KEY].status,'blocked','Global safety stop');equal(store.values[KINDLE_REFRESH_KEY].cursor,0,'Blocked item cannot resume');const resumed=await store.writer.beginKindleContentsRefresh('resume',1);equal(resumed.candidates[0].id,item.id,'Blocked item skipped on resume');}
 });
}
add('Refresh successful no-statement becomes current, baseline stays accessible',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1,old())));const plan=await begin(store.writer);await commit(store.writer,plan,[observation(plan.candidates[0],'','no-statement')]);
 const db=await store.writer.getDatabase(),item=db.providerItems['kindle:B000000001'];equal(item.metadata.enrichment.kindleProductComicContents.statement,'','Empty success not current');equal(db.kindleContentsObservations[item.recordRef].baseline.statement,old().statement,'Empty erased historical statement');equal(item.metadata.enrichment.kindleProductComicContents.parseOutcome,'not-attempted','Empty parse state');
});
add('Refresh preserves incomplete-description evidence even when the capture found no statement',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1,old())));const plan=await begin(store.writer);
 await commit(store.writer,plan,[{...observation(plan.candidates[0],'','no-statement'),descriptionBlocks:[{selector:'#description',text:'Description still loading Read more'}]}]);
 const db=await store.writer.getDatabase(),item=db.providerItems['kindle:B000000001'],saved=item.metadata.enrichment.kindleProductComicContents,snapshot=contentsObservation(item,saved);
 equal(snapshot.descriptionMayBeIncomplete,true,'Manifest warning lost in observation');equal(snapshot.evidence.blocks[0].text,'Description still loading Read more','Source warning text removed');equal(db.kindleContentsObservations[item.recordRef].baseline.statement,old().statement,'Incomplete empty result erased baseline');
 equal(contentsObservation({...item,title:'Later catalog title'},saved).titleContext,item.title,'Captured manifest title was replaced by a later catalog title');
 const restored=parseBackup(createBackup(db));equal(contentsObservation(restored.providerItems[item.id],restored.providerItems[item.id].metadata.enrichment.kindleProductComicContents),snapshot,'Warning backup changed');
});
add('Refresh O/P freezes queue, persists pause/restart, rejects stale leases and skips removed identities',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1),book(2),book(3)));let plan=await begin(store.writer);await commit(store.writer,plan,[observation(plan.candidates[0])]);
 await store.writer.finishKindleContentsRefresh(plan.refresh.runRef,plan.refresh.leaseRef,1,'paused');const restarted=createStorageWriter(store.area);const resumed=await restarted.beginKindleContentsRefresh('resume',1);
 equal(resumed.refresh.total,3,'Moving denominator');equal(resumed.refresh.cursor,1,'Resume restarted at zero');equal(resumed.candidates.length,2,'Durable item requeued');
 await rejects(()=>commit(restarted,plan,[observation(plan.candidates[1])]),'Old lease accepted');
 await restarted.mergeProviderItems('kindle',[{providerItemId:'B000000004',title:'Added later',mediaType:'book',metadata:{detailUrl:url('B000000004')}}]);
 equal((await restarted.getKindleContentsRefresh()).checkpoint.total,3,'New item changed frozen queue');
 const db=await restarted.getDatabase(),target=resumed.candidates[0];delete db.providerItems[target.id];store.values.galacticLibraryDatabase=db;
 equal((await restarted.checkKindleContentsRefreshItem(resumed.refresh.runRef,resumed.refresh.leaseRef,1,target.queuePosition)).valid,false,'Removed record fetched');
 await commit(restarted,resumed,[{itemId:target.id,recordRef:target.recordRef,queuePosition:target.queuePosition,skip:true}]);equal(store.values[KINDLE_REFRESH_KEY].counts.skipped,1,'Skip not checkpointed');
 await restarted.interruptKindleContentsRefresh(1);equal((await restarted.getKindleContentsRefresh()).checkpoint.status,'interrupted','Close did not interrupt');
 plan=await restarted.beginKindleContentsRefresh('resume',2);equal(plan.refresh.cursor,2,'Restart lost position');
});
add('Refresh ownership leases prevent concurrent tabs and incompatible or restored checkpoints',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1)));const plan=await begin(store.writer);
 await rejects(()=>store.writer.beginKindleContentsRefresh('resume',2,true),'Concurrent tab accepted');
 await rejects(()=>commit(store.writer,plan,[{...observation(plan.candidates[0]),queuePosition:1}]),'Wrong position accepted');equal(store.values[KINDLE_REFRESH_KEY].cursor,0,'Invalid batch changed cursor');
 const copy=structuredClone(store.values[KINDLE_REFRESH_KEY]);store.values[KINDLE_REFRESH_KEY].version=99;equal((await store.writer.getKindleContentsRefresh()).checkpoint.status,'stale','Incompatible not marked stale');await rejects(()=>store.writer.beginKindleContentsRefresh('resume',1),'Stale resumed');store.values[KINDLE_REFRESH_KEY]=copy;
 await store.writer.restoreDatabase(await store.writer.getDatabase());equal((await store.writer.getKindleContentsRefresh()).checkpoint,null,'Restore retained live lease');await rejects(()=>commit(store.writer,plan,[observation(plan.candidates[0])]),'Restored old lease accepted');
});
add('Refresh Q repeated acquisitions retain baseline plus one generated undo, not an event log',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1,old())));
 for(let n=0;n<5;n++){const plan=await begin(store.writer);await commit(store.writer,plan,[observation(plan.candidates[0],`Collects Fresh #${n+3}`)]);}
 const db=await store.writer.getDatabase(),item=db.providerItems['kindle:B000000001'];equal(db.kindleContentsObservations[item.recordRef].baseline.statement,old().statement,'Baseline rotated');equal(Object.keys(db.enrichmentHistory).length,1,'Undo trail grew');
 equal(Object.keys(db.kindleContentsObservations[item.recordRef]).sort(),['baseline','providerItemId','undoRef'],'History accumulated');equal(parseBackup(createBackup(db)).kindleContentsObservations,db.kindleContentsObservations,'Repeated backup');
});
add('Refresh N/S/T/U/V local reparse and old scan distinctions remain intact',async()=>{
 const store=memory();const item=book(1,old());await store.writer.restoreDatabase(database(item,book(2),book(3,{...old(),statement:'',availability:'unavailable'}),book(4,{...old(),statement:'',availability:'temporary-failure'}),book(5,{...old(),statement:'',availability:'no-statement'})));
 const db=await store.writer.getDatabase();assert(!Object.hasOwn(db,'kindleContentsObservations'),'Legacy mass rewrite');
 equal(kindleContentsPlan(db).candidates.length,2,'Normal scan semantics');equal(kindleContentsPlan(db,'retry').candidates.length,1,'Retry semantics');equal(kindleContentsPlan(db,'rescan').candidates.length,5,'All fetch semantics');equal(kindleContentsPlan(db,'reparse').candidates.length,0,'Reparse network queue');
 const legacyStore=memory();await legacyStore.writer.restoreDatabase(database(book(9,{...old(1),sourceUrl:url('B000000009'),statement:'',availability:'unavailable'})));
 equal(kindleContentsPlan(await legacyStore.writer.getDatabase()).candidates.length,1,'Normal scan lost pre-generation-2 empty-unavailable exception');
 const legacyPlan=await begin(legacyStore.writer);await commit(legacyStore.writer,legacyPlan,[observation(legacyPlan.candidates[0],'','unavailable')]);
 equal(kindleContentsPlan(await legacyStore.writer.getDatabase()).candidates.length,0,'Latest G5 unavailable check kept retrying preserved G1 blank');equal(kindleContentsPlan(await legacyStore.writer.getDatabase(),'retry').candidates.length,0,'Unavailable became retryable');
 equal(parseBackup(createBackup(db)).providerItems,db.providerItems,'Legacy backup');
 await store.writer.reparseKindleContents([{itemId:item.id,recordRef:db.providerItems[item.id].recordRef}]);const after=await store.writer.getDatabase();equal(after.providerItems[item.id].metadata.enrichment.kindleProductComicContents.checkedAt,old().checkedAt,'Reparse acquired source');assert(!after.kindleContentsObservations,'Reparse created source observation');
});
add('Refresh W/X/Y source history never changes ownership, grouping or verified reviews',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1,old())));await store.writer.saveContentReview('kindle:B000000001',{statement:'Verified older source',entries:[{series:'Historical',run:'',unitType:'issue',number:'1',language:'',completeness:'full'}]});
 const before=await store.writer.getDatabase(),request={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Collection 1',mediaType:'book'},{title:'Fresh',mediaType:'book'}]},api=handleExternalApiRequest(before,request);
 const index=db=>[...ownedContentIndex(db)].map(([key,rows])=>[key,rows.map(e=>({itemId:e.item.id,entry:e.entry,review:e.review}))]);
 const plan=await begin(store.writer);await commit(store.writer,plan,[observation(plan.candidates[0])]);const after=await store.writer.getDatabase();
 for(const key of ['canonicalItems','contentReviews','manualMatchDecisions','ownershipPolicy','ownershipReviews','editionSeparations'])equal(after[key],before[key],key+' changed');equal(index(after),index(before),'Owned contents changed');equal(handleExternalApiRequest(after,request),api,'Ordinary matching changed');
 await store.writer.reparseKindleContents([{itemId:plan.candidates[0].id,recordRef:plan.candidates[0].recordRef}]);equal((await store.writer.getDatabase()).kindleContentsObservations[plan.candidates[0].recordRef].baseline,after.kindleContentsObservations[plan.candidates[0].recordRef].baseline,'Reparse changed historical evidence');
});
add('Refresh malicious observation evidence, identifiers and atomic multi-entry failures reject safely',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1,old()),book(2)));const plan=await begin(store.writer),before=await store.writer.getDatabase();
 await rejects(()=>commit(store.writer,plan,[observation(plan.candidates[0]),{...observation(plan.candidates[1]),sourceUrl:'https://user:secret@www.amazon.com/dp/B000000002'}]),'Invalid batch accepted');equal(await store.writer.getDatabase(),before,'Partial invalid batch');equal(store.values[KINDLE_REFRESH_KEY].cursor,0,'Invalid batch advanced cursor');
 await commit(store.writer,plan,[observation(plan.candidates[0])]);const db=await store.writer.getDatabase(),record=Object.values(db.kindleContentsObservations)[0];record.baseline.evidence={blocks:[{selector:'#test',text:'Collects Safe #1'}],selected:{block:0,start:0,end:15,raw:'Collects Fake #9'}};
 await rejects(()=>store.writer.restoreDatabase(db),'Forged source coordinates accepted');
});

add('Refresh rejects older generations and atomically saves checkpoint with source on write failure',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1,old())));const plan=await begin(store.writer),before=structuredClone(store.values);
 await rejects(()=>commit(store.writer,plan,[{...observation(plan.candidates[0]),extractorVersion:2}]),'Old source generation accepted');equal(store.values,before,'Old source changed storage');
 store.setFail(true);await rejects(()=>commit(store.writer,plan,[observation(plan.candidates[0])]),'Failed checkpoint acknowledged');store.setFail(false);equal(store.values,before,'Source/cursor only partly persisted');
 await store.writer.finishKindleContentsRefresh(plan.refresh.runRef,plan.refresh.leaseRef,1,'aborted');await rejects(()=>store.writer.beginKindleContentsRefresh('resume',1),'Stopped queue resumed');
});
add('Refresh first acquisition, repeated failed attempts and profile history remain bounded and validated',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1)));let plan=await begin(store.writer);await commit(store.writer,plan,[observation(plan.candidates[0])]);
 let db=await store.writer.getDatabase(),item=db.providerItems['kindle:B000000001'];equal(db.kindleContentsObservations[item.recordRef].baseline,null,'Invented historical source');equal(parseBackup(createBackup(db)).kindleContentsObservations,db.kindleContentsObservations,'No-history backup');
 plan=await begin(store.writer);await commit(store.writer,plan,[observation(plan.candidates[0],'','temporary-failure','network')]);
 for(let n=0;n<3;n++){plan=await begin(store.writer);await commit(store.writer,plan,[observation(plan.candidates[0],'','unavailable')]);}
 db=await store.writer.getDatabase();const history=db.kindleContentsObservations[item.recordRef];equal(history.baseline.statement,'Collects Fresh #3-4','First successful evidence not pinned');equal(history.latestAttempt.availability,'unavailable','Latest failed attempt not replaced');
 const forged=structuredClone(db);forged.kindleContentsObservations[item.recordRef].providerItemId='kindle:DIFFERENT';await rejects(()=>store.writer.restoreDatabase(forged),'History reference attached to other record');
 plan=await begin(store.writer);const changed=await store.writer.getDatabase();changed.providers.kindle={...changed.providers.kindle,profileLabel:'Another account'};store.values.galacticLibraryDatabase=changed;
 await rejects(()=>store.writer.beginKindleContentsRefresh('resume',1),'Changed profile resumed');equal((await store.writer.getKindleContentsRefresh()).checkpoint.status,'stale','Changed profile not shown stale');
});

add('Refresh preflight validates only the current record without writing or rebuilding the entire library',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1,old()),book(2)));const plan=await begin(store.writer),snapshot=structuredClone(store.values),target=plan.candidates[0];
 const trace=globalThis.GalacticContentsPerformance.trace('lookup-abcdef123456-001');
 equal(await store.writer.execute('checkKindleContentsRefreshItem',[plan.refresh.runRef,plan.refresh.leaseRef,1,0],trace),{valid:true},'Valid preflight rejected');
 const stages=new Set(trace.events.map(event=>event.stage));
 for(const stage of ['storage_read','refresh_checkpoint_read','refresh_checkpoint_validate','refresh_identity_validation'])assert(stages.has(stage),'Missing preflight stage '+stage);
 for(const stage of ['read_validation','migration_compare','canonical_rebuild','persist_validation','storage_write'])assert(!stages.has(stage),'Preflight repeated whole-library work '+stage);
 equal(store.values,snapshot,'Read-only preflight changed stored history/cursor');
 for(const patch of [{recordRef:crypto.randomUUID()},{mediaType:'audiobook'},{metadata:{detailUrl:'https://www.amazon.com/not-supported'}},{providerItemId:'DIFFERENT'}]){
  store.values.galacticLibraryDatabase=structuredClone(snapshot.galacticLibraryDatabase);Object.assign(store.values.galacticLibraryDatabase.providerItems[target.id],patch);
  equal(await store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,0),{valid:false},'Changed current identity not rejected');
 }
 store.values.galacticLibraryDatabase=structuredClone(snapshot.galacticLibraryDatabase);delete store.values.galacticLibraryDatabase.providerItems[target.id];
 equal(await store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,0),{valid:false},'Removed record still fetched');
});
add('Refresh preflight retains legacy migration and full commit validation after a cheap identity check',async()=>{
 const store=memory();await store.writer.restoreDatabase(database(book(1),book(2)));const plan=await begin(store.writer),snapshot=structuredClone(store.values);
 store.values.galacticLibraryDatabase.schemaVersion=11;const migration=globalThis.GalacticContentsPerformance.trace('lookup-abcdef123456-002');
 equal(await store.writer.execute('checkKindleContentsRefreshItem',[plan.refresh.runRef,plan.refresh.leaseRef,1,0],migration),{valid:true},'Legacy preflight failed');assert(migration.events.some(event=>event.stage==='read_validation'),'Legacy validation bypassed');equal(store.values.galacticLibraryDatabase.schemaVersion,13,'Legacy migration skipped');
 store.values.galacticLibraryDatabase=structuredClone(snapshot.galacticLibraryDatabase);const other=plan.candidates[1];store.values.galacticLibraryDatabase.providerItems[other.id].title='';
 equal(await store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,0),{valid:true},'Unrelated data blocked read-only current identity');
 const before=structuredClone(store.values);await rejects(()=>commit(store.writer,plan,[observation(plan.candidates[0])]),'Commit bypassed full database validation');equal(store.values,before,'Invalid global commit saved partial data');
});

add('Refresh projection eliminates repeated library reads within its bounded window without saving anything',async()=>{
 const store=memory(true);await store.writer.restoreDatabase(database(...Array.from({length:42},(_,n)=>book(n+1))));const plan=await begin(store.writer),snapshot=structuredClone(store.values),start=store.reads.length;
 for(let position=0;position<20;position++){
  const timing=globalThis.GalacticContentsPerformance.trace('lookup-abcdef123456-'+String(position+1).padStart(3,'0'));
  equal(await store.writer.execute('checkKindleContentsRefreshItem',[plan.refresh.runRef,plan.refresh.leaseRef,1,position],timing),{valid:true},'Projected eligible item rejected');
  assert(timing.events.some(e=>e.stage==='refresh_checkpoint_read'),'Queue state not read fresh');assert(timing.events.some(e=>e.stage==='refresh_identity_validation'),'Identity not checked');
  assert(timing.events.some(e=>e.stage===(position?'refresh_projection_hit':'refresh_projection_build')),'Missing projection diagnostic');
  equal(timing.events.filter(e=>e.stage==='storage_read').length,position?0:1,'Wrong library read count');
 }
 equal(store.reads.slice(start).filter(keys=>keys.includes('galacticLibraryDatabase')).length,1,'Repeated full-library reads');
 equal(store.reads.slice(start).filter(keys=>keys.includes(KINDLE_REFRESH_KEY)).length,20,'Queue read skipped');equal(store.values,snapshot,'Preflight saved source, queue or history');
 await rejects(()=>store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,20),'Projection fetched beyond unacknowledged window');
});
add('Refresh projection invalidates at serialized reads, mutations and failed writes and rechecks before commit',async()=>{
 const store=memory(true);await store.writer.restoreDatabase(database(book(1),book(2),book(3)));const plan=await begin(store.writer);
 const check=()=>store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,0);
 await check();let reads=store.reads.length;await store.writer.getUiPreferences();await check();assert(store.reads.slice(reads).some(keys=>keys.includes('galacticLibraryDatabase')),'Other operation kept a projection');
 store.setFail(true);await rejects(()=>store.writer.saveGoogleBooksApiKey('a'.repeat(24)),'Synthetic failure did not happen');store.setFail(false);reads=store.reads.length;await check();assert(store.reads.slice(reads).some(keys=>keys.includes('galacticLibraryDatabase')),'Failed mutation kept a projection');
 const item=plan.candidates[0];await store.writer.mergeProviderItems('kindle',[{providerItemId:item.id.slice(7),title:item.title,mediaType:'book',metadata:{detailUrl:url('B000000099')}}]);
 equal(await check(),{valid:false},'Changed URL borrowed a cached answer');
 await commit(store.writer,plan,[observation(item)]);equal(store.values[KINDLE_REFRESH_KEY].counts.skipped,1,'Commit trusted stale preflight');assert(!store.values.galacticLibraryDatabase.providerItems[item.id].metadata.enrichment?.kindleProductComicContents,'Stale source was written');
 const current={...plan,refresh:{...plan.refresh,cursor:1}};reads=store.reads.length;equal(await store.writer.checkKindleContentsRefreshItem(current.refresh.runRef,current.refresh.leaseRef,1,1),{valid:true},'Committed cursor failed');assert(store.reads.slice(reads).some(keys=>keys.includes('galacticLibraryDatabase')),'Checkpoint kept old projection');
});
add('Refresh projection is lost on restart, invalidated by observed external changes and cannot survive clear or restore',async()=>{
 for(const action of ['restart','profile','record','queue','clear','restore']){
  const store=memory(true);await store.writer.restoreDatabase(database(book(1),book(2)));const plan=await begin(store.writer),snapshot=structuredClone(store.values.galacticLibraryDatabase);
  const check=()=>store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,0);await check();const reads=store.reads.length;
  if(action==='restart'){store.writer=createStorageWriter(store.area,Promise.resolve(),{cacheRefreshPreflight:true});equal(await check(),{valid:true},'Restart lost resumable identity');assert(store.reads.slice(reads).some(keys=>keys.includes('galacticLibraryDatabase')),'Restart retained a projection');}
  else if(action==='profile'){store.values.galacticLibraryDatabase.providers.kindle={profileLabel:'Changed profile'};store.writer.invalidateRefreshPreflight();await rejects(check,'Changed profile borrowed old evidence');}
  else if(action==='record'){delete store.values.galacticLibraryDatabase.providerItems[plan.candidates[0].id];store.writer.invalidateRefreshPreflight();equal(await check(),{valid:false},'Removed current record borrowed a cached answer');}
  else if(action==='queue'){store.values[KINDLE_REFRESH_KEY].queue[0].detailUrl=url('B000000099');equal(await check(),{valid:false},'Changed queue target borrowed a cached answer');}
  else{await store.writer[action==='clear'?'clearDatabase':'restoreDatabase'](...(action==='restore'?[snapshot]:[]));await rejects(check,'Invalidated queue reused cached eligibility');equal(store.values[KINDLE_REFRESH_KEY]??null,null,'Invalidated queue recreated');}
 }
});
add('Refresh projection never replaces authoritative full commit validation or hides malformed neighboring records',async()=>{
 const store=memory(true);await store.writer.restoreDatabase(database(book(1),book(2)));const plan=await begin(store.writer),target=plan.candidates[0],other=plan.candidates[1];
 await store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,0);
 store.values.galacticLibraryDatabase.providerItems[other.id].title='';store.writer.invalidateRefreshPreflight();
 equal(await store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,0),{valid:true},'Malformed neighbor blocked current eligible item');
 await rejects(()=>store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,1),'Malformed cached neighbor became eligible');
 const snapshot=structuredClone(store.values);await rejects(()=>commit(store.writer,plan,[observation(target)]),'Cached identity bypassed full validation');equal(store.values,snapshot,'Invalid database was partially saved');
});
add('Refresh projection invalidates at queued mutation boundaries and during an observed in-flight queue read',async()=>{
 const store=memory(true);await store.writer.restoreDatabase(database(book(1),book(2)));const plan=await begin(store.writer),target=plan.candidates[0];
 const check=()=>store.writer.checkKindleContentsRefreshItem(plan.refresh.runRef,plan.refresh.leaseRef,1,0);await check();
 const before=check(),mutation=store.writer.mergeProviderItems('kindle',[{providerItemId:target.id.slice(7),title:target.title,mediaType:'book',metadata:{detailUrl:url('B000000099')}}]),after=check();
 equal(await before,{valid:true},'Queued later mutation changed preceding check');await mutation;equal(await after,{valid:false},'Queued mutation did not invalidate following check');
 await check();const get=store.area.get;let entered,release;const started=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{release=resolve;});
 store.area.get=async defaults=>{const result=await get(defaults);if(Object.keys(defaults).length===1&&Object.hasOwn(defaults,KINDLE_REFRESH_KEY)){entered();await held;}return result;};
 const pending=check();await started;store.values.galacticLibraryDatabase.providerItems[target.id].metadata.detailUrl=target.detailUrl;store.writer.invalidateRefreshPreflight();release();
 equal(await pending,{valid:true},'Change notification during queue read reused old eligibility');store.area.get=get;
 const writes=structuredClone(store.values);store.values.galacticLibraryDatabase.schemaVersion=11;store.writer.invalidateRefreshPreflight();
 equal(await check(),{valid:true},'Observed legacy data did not take migration path');equal(store.values.galacticLibraryDatabase.schemaVersion,13,'Legacy migration skipped');equal(store.values[KINDLE_REFRESH_KEY],writes[KINDLE_REFRESH_KEY],'Migration altered queue/cursor');
});
add('Refresh relies on final canonical validation without an extra rebuild while preserving identities and history',async()=>{
 const duplicate=normalizeProviderItem({provider:'humble',providerItemId:'H1',title:'Collection 1',mediaType:'book',ownership:'owned'}),store=memory(true);
 await store.writer.restoreDatabase(database(book(1,old()),book(2),duplicate));const before=await store.writer.getDatabase(),plan=await begin(store.writer);
 const timing=globalThis.GalacticContentsPerformance.trace('lookup-abcdef123456-050');
 await store.writer.execute('commitKindleContentsRefresh',[[observation(plan.candidates[0])],plan.refresh.runRef,plan.refresh.leaseRef,1],timing);
 assert(timing.events.some(e=>e.stage==='persist_validation'),'Full final validation missing');assert(!timing.events.some(e=>e.stage==='canonical_rebuild'),'Extra pre-validation rebuild remained');
 const after=await store.writer.getDatabase();equal(after.canonicalItems,before.canonicalItems,'Canonical identities changed');equal(after.contentReviews,before.contentReviews,'Verified reviews changed');
 equal(after.providerItems['humble:H1'],before.providerItems['humble:H1'],'Unrelated provider changed');equal(after.kindleContentsObservations[plan.candidates[0].recordRef].baseline.statement,'Collects Historical #1-2','Baseline changed');
});

export const kindleRefreshCases=cases;
export async function checkKindleRefresh(){for(const [name,check]of cases){try{await check();}catch(error){throw Error(name+': '+error.message);}}return cases.length;}
