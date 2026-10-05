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
const memory=()=>{const values={};let fail=false;const area={get:async defaults=>structuredClone({...defaults,...values}),set:async patch=>{if(fail)throw Error('Synthetic write failure');Object.assign(values,structuredClone(patch));},remove:async keys=>keys.forEach(k=>delete values[k])};return {values,area,writer:createStorageWriter(area),setFail:value=>{fail=value;}};};
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

export const kindleRefreshCases=cases;
export async function checkKindleRefresh(){for(const [name,check]of cases){try{await check();}catch(error){throw Error(name+': '+error.message);}}return cases.length;}
