import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,sep} from 'node:path';
import {createRelease,readRuntimeZip} from './release.mjs';
import {outputPath} from './audit-artifacts.mjs';
import {chromePipe} from '../tests/native-protocol.mjs';
import {syntheticProviderLibrary} from '../tests/provider-performance-fixture.js';

const root=resolve(process.argv.find(arg=>arg.startsWith('--root='))?.slice(7)??'.');
const size=Number(process.argv.find(arg=>arg.startsWith('--size='))?.slice(7)??10000);
if(!Number.isSafeInteger(size)||size<100||size>20000)throw Error('Size must be 100..20000.');
const output=await outputPath(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9),'provider-browser.json');
const matrix=process.argv.includes('--matrix');
const coldMatrix=process.argv.includes('--cold-matrix');
const fullStarts=process.argv.includes('--full-starts');
const temporary=await mkdtemp(join(tmpdir(),'gl-provider-benchmark-'));let child,exited;
try{
 const stage=join(temporary,'extension'),release=await createRelease(root);
 for(const [name,data]of readRuntimeZip(release.zip)){const file=join(stage,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,data);}
 child=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--user-data-dir='+join(temporary,'profile'),'--remote-debugging-pipe','--enable-unsafe-extension-debugging','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe','pipe','pipe']});
 exited=new Promise(done=>child.once('exit',done));const driver=chromePipe(child,{timeoutMs:120000}),installed=await driver.send('Extensions.loadUnpacked',{path:stage});
 const target=await driver.send('Target.createTarget',{url:'chrome-extension://'+installed.id+'/manifest.json'});
 const {sessionId}=await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const evaluate=async script=>{const result=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},sessionId);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
 const db=syntheticProviderLibrary(size);
 await evaluate(`const S=await import('./src/lib/storage.js');await S.restoreDatabase(${JSON.stringify(db)});return true;`);
 console.log('Seeded disposable Chrome library:',size);
 let rows;
 if(coldMatrix||fullStarts){
  rows=[];
  for(const workflow of fullStarts?['warm-unchanged','cold-valid']:['warm-unchanged','cold-valid','cold-no-proof','cold-mismatch','cold-change','cold-incomplete']){
   const previous=await evaluate(`
    const S=await import('./src/lib/storage.js');await S.restoreDatabase(${JSON.stringify(db)});await S.getCommittedLibraryView();
    for(let n=0;n<500;n++){if((await chrome.storage.session.get('galacticLibraryValidationCertificate')).galacticLibraryValidationCertificate)break;await new Promise(done=>setTimeout(done,10));}
    if(!(await chrome.storage.session.get('galacticLibraryValidationCertificate')).galacticLibraryValidationCertificate)throw Error('Seed did not issue a session certificate');
    if(${JSON.stringify(workflow)}==='cold-no-proof')await chrome.storage.session.remove('galacticLibraryValidationCertificate');
    if(${JSON.stringify(workflow)}==='cold-mismatch'){const key='galacticLibraryValidationCertificate',certificate=(await chrome.storage.session.get(key))[key];await chrome.storage.session.set({[key]:{...certificate,digest:'0'.repeat(64)}});}
    return (await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'})).activity.worker;
   `);
   if(workflow.startsWith('cold-')){
    await driver.send('ServiceWorker.enable',{},sessionId);await driver.send('ServiceWorker.stopAllWorkers',{},sessionId);
    for(let n=0;n<100;n++){
     const targets=await driver.send('Target.getTargets');
     if(!targets.targetInfos.some(info=>info.type==='service_worker'&&info.url.startsWith('chrome-extension://'+installed.id+'/')))break;
     if(n===99)throw Error('Disposable worker did not stop');await new Promise(done=>setTimeout(done,20));
    }
   }
   const row=await evaluate(`
    const S=await import('./src/lib/storage.js'),client=S.createStorageClient(message=>chrome.runtime.sendMessage(message));
    const journal=async operation=>{const report=await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'}),events=report.activity.events;
     const event=events.filter(row=>row.stage==='operation'&&row.operation===operation).at(-1);
     const spans=events.filter(e=>e.operation===operation&&e.startEpochMs>=event.startEpochMs&&e.startEpochMs<event.startEpochMs+event.durationMs);
     const ms=stage=>spans.filter(e=>e.stage===stage).reduce((sum,e)=>sum+e.durationMs,0),has=stage=>spans.some(e=>e.stage===stage);
     const synchronousStart=${fullStarts}&&operation==='beginProviderScan'&&spans.some(e=>e.stage==='storage_set'&&e.key==='database');
     return {workerId:report.activity.worker,workerMs:event.durationMs,databaseReads:spans.filter(e=>e.stage==='storage_get'&&e.key==='database').length,databaseWrites:spans.filter(e=>e.stage==='storage_set'&&e.key==='database').length,metadataReads:spans.filter(e=>e.stage==='storage_get'&&e.key!=='database'||e.stage==='certificate_read').length,metadataWrites:spans.filter(e=>e.stage==='storage_set'&&e.key!=='database'||e.stage==='storage_remove'&&e.key!=='database').length,validationPasses:spans.filter(e=>e.stage==='validation').length+Number(synchronousStart),startSynchronousValidationDerivedFromWrite:synchronousStart,snapshotPublications:spans.filter(e=>e.stage==='snapshot_change'&&e.reason==='published').length,snapshotInvalidations:spans.filter(e=>e.stage==='snapshot_change'&&e.reason==='invalidated').length,
      storageReadMs:spans.filter(e=>e.stage==='storage_get'&&e.key==='database').reduce((sum,e)=>sum+e.durationMs,0),certificateMs:ms('read_certificate'),certificateReadMs:ms('certificate_read'),serializationMs:ms('certificate_serialize'),hashMs:ms('certificate_hash'),receiptDigestMs:ms('provider_check_digest'),snapshotCloneMs:ms('snapshot_clone'),snapshotFreezeMs:ms('snapshot_freeze'),validationMs:ms('validation'),migrationCompareMs:ms('migration_compare'),committedCompareMs:ms('read_committed_compare'),committedCloneMs:ms('read_committed_clone'),certificateHit:has('certificate_hit'),certificateMiss:has('certificate_miss'),fallbackReasons:['certificate_missing','certificate_mismatch','certificate_invalid','certificate_error','certificate_unavailable'].filter(has)};
    };
    const full=${fullStarts},provider=full?'epic':'steam',mode=full?'full':'incremental',P=await import('./src/lib/provider-snapshot.js');
    const at=performance.now(),scan=await client.beginProviderScan(provider,'Personal',mode,false,1),prepared=performance.now(),pre=await journal('beginProviderScan');
    const items=full?${JSON.stringify(Object.values(db.providerItems).filter(item=>item.profileId===db.providers.epic.activeProfileId))}:${JSON.stringify(workflow)}==='cold-change'?[{providerItemId:'cold-new',title:'Cold added game',mediaType:'game',ownership:'owned'}]:[];
    const finishStart=performance.now();await client.commitProviderScan(provider,items,{syncMode:mode,...(full?{fullSyncAt:'2026-10-16'}:{quickSyncAt:'2026-10-16'}),...(${JSON.stringify(workflow)}==='cold-incomplete'?{scanDiagnostics:{failedRequestCount:1}}:{})},full?P.completeProviderSnapshot(provider,items,[P.completedScope('library',items.length,items.length,'reported-count')]):null,scan.scanToken,1);
    const finished=performance.now(),post=await journal('commitProviderScan');
    return {workflow:${JSON.stringify(workflow)},preMessageMs:prepared-at,postMessageMs:finished-finishStart,captureMs:0,preparationTransportMs:prepared-at-pre.workerMs,commitTransportMs:finished-finishStart-post.workerMs,workerPre:pre,workerPost:post};
   `);
   row.previousWorkerId=previous;row.workerRestarted=row.workerPre.workerId!==previous;
   assert.equal(row.workerRestarted,workflow.startsWith('cold-'),'Worker generation: '+workflow);
   if(fullStarts||workflow==='cold-change')assert.equal(row.workerPost.databaseWrites,1);
   else assert.equal(row.workerPost.databaseWrites,0);
   rows.push(row);console.log(JSON.stringify(row));
  }
 }else if(matrix){
  rows=[];
  const scenarios=['quick-warm','quick-repeated','quick-repeated-2','quick-restart-no-proof','incremental-change','full-unchanged','full-change','incomplete','incomplete-repeated','incomplete-restart-no-proof','failed','failed-repeated'];
  for(const workflow of scenarios){
   if(workflow.endsWith('restart-no-proof')){
    await driver.send('ServiceWorker.enable',{},sessionId);await driver.send('ServiceWorker.stopAllWorkers',{},sessionId);
    await evaluate(`await chrome.storage.session.remove('galacticLibraryValidationCertificate');return true;`);
   }
   const row=await evaluate(`
    const S=await import('./src/lib/storage.js'),P=await import('./src/lib/provider-snapshot.js'),client=S.createStorageClient(message=>chrome.runtime.sendMessage(message));
    const workflow=${JSON.stringify(workflow)},full=workflow.startsWith('full-'),mode=full?'full':'incremental';
    const all=${JSON.stringify(Object.values(db.providerItems).filter(item=>item.profileId===db.providers.steam.activeProfileId))};
    const extra={providerItemId:'synthetic-new',title:'Synthetic Added Game',mediaType:'game',ownership:'owned'};
    const items=workflow==='incremental-change'?[extra]:workflow==='full-unchanged'?[...all,extra]:workflow==='full-change'?[...all.slice(0,-1).map((item,index)=>index?item:{...item,ownership:'revoked'}),extra]:[];
    const journal=async operation=>{const report=await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'}),events=report.activity.events;
     const event=events.filter(row=>row.stage==='operation'&&row.operation===operation).at(-1);
     const spans=events.filter(e=>e.startEpochMs>=event.startEpochMs&&e.startEpochMs<event.startEpochMs+event.durationMs);
     return {workerId:report.activity.worker,workerMs:event.durationMs,databaseReads:spans.filter(e=>e.stage==='storage_get'&&e.key==='database').length,databaseWrites:spans.filter(e=>e.stage==='storage_set'&&e.key==='database').length,metadataWrites:spans.filter(e=>e.stage==='storage_set'&&e.key!=='database'||e.stage==='storage_remove'&&e.key!=='database').length,validationPasses:spans.filter(e=>e.stage==='validation').length+(full&&operation==='beginProviderScan'&&spans.some(e=>e.stage==='storage_set'&&e.key==='database')?1:0)};};
    const at=performance.now(),scan=await client.beginProviderScan('steam','Personal',mode,false,1),prepared=performance.now(),pre=await journal('beginProviderScan');
    const finishStart=performance.now();let result;
    if(workflow.startsWith('failed'))await client.failProviderScan('steam',scan.scanToken,1,{code:'network'});
    else result=await client.commitProviderScan('steam',items,{syncMode:mode,...(full?{fullSyncAt:'2026-10-16'}:{quickSyncAt:'2026-10-16'}),...(workflow.startsWith('incomplete')?{scanDiagnostics:{failedRequestCount:1}}:{})},full?P.completeProviderSnapshot('steam',items,[P.completedScope('library',items.length,items.length,'reported-count')]):null,scan.scanToken,1);
    const finished=performance.now(),post=await journal(workflow.startsWith('failed')?'failProviderScan':'commitProviderScan');
    const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
    return {workflow,preMessageMs:prepared-at,postMessageMs:finished-finishStart,workerPre:pre,workerPost:post,databaseBytes:pre.databaseWrites*bytes(scan.database)+post.databaseWrites*bytes(result??scan.database)};
   `);
   rows.push(row);console.log(JSON.stringify(row));
  }
 }else rows=await evaluate(`
 const S=await import('./src/lib/storage.js'),client=S.createStorageClient(message=>chrome.runtime.sendMessage(message)),rows=[];
 const journal=async operation=>{const report=await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'}),events=report.activity.events;
  const row=events.filter(row=>row.stage==='operation'&&row.operation===operation).at(-1);
  const spans=events.filter(e=>e.startEpochMs>=row.startEpochMs&&e.startEpochMs<row.startEpochMs+row.durationMs);
  return {workerMs:row.durationMs,databaseReads:spans.filter(e=>e.stage==='storage_get'&&e.key==='database').length,databaseWrites:spans.filter(e=>e.stage==='storage_set'&&e.key==='database').length,validationPasses:spans.filter(e=>e.stage==='validation').length};};
 for(let repeat=0;repeat<3;repeat++){
  const at=performance.now(),scan=await client.beginProviderScan('steam','Personal','incremental',false,1),prepared=performance.now(),pre=await journal('beginProviderScan');
  const finishStart=performance.now();await client.commitProviderScan('steam',[],{syncMode:'incremental',quickSyncAt:'2026-10-16'},null,scan.scanToken,1);const finished=performance.now(),post=await journal('commitProviderScan');
  rows.push({repeat,preMessageMs:prepared-at,postMessageMs:finished-finishStart,workerPre:pre,workerPost:post});
 }
 return rows;
 `);
 await writeFile(output,JSON.stringify({format:1,size,sourceRoot:root,environment:'Packaged Chrome, disposable profile, actual worker and chrome.storage.local; storage-client calls return the database, unlike compact provider replies. Scan/network zero. Cold matrix seeds a validated certificate then actually stops the worker; generation changes are asserted. Missing/mismatched proof is set separately. Ordinary matrix restart removes proof. Nested stage times overlap; metadata counts exclude background certificate issuance outside an operation. Database bytes, where present, estimate returned DB serialization outside timed work; metadata bytes not measured natively.',rows},null,2));
 if(!matrix&&!coldMatrix)for(const row of rows)console.log(JSON.stringify(row));
 console.log('Wrote',output);
}finally{
 if(child&&child.exitCode===null){child.kill();await Promise.race([exited,new Promise(done=>setTimeout(done,3000))]);}
 if(resolve(temporary).startsWith(resolve(tmpdir())+sep))await rm(temporary,{recursive:true,force:true,maxRetries:20,retryDelay:100});
}
