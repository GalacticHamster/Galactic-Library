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
 const rows=await evaluate(`
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
 await writeFile(output,JSON.stringify({format:1,size,sourceRoot:root,environment:'Packaged Chrome, disposable profile, actual worker and chrome.storage.local; storage-client calls return the database, unlike compact provider replies. Scan/network zero. First request after seeding is not a cold worker restart.',rows},null,2));
 for(const row of rows)console.log(JSON.stringify(row));
 console.log('Wrote',output);
}finally{
 if(child&&child.exitCode===null){child.kill();await Promise.race([exited,new Promise(done=>setTimeout(done,3000))]);}
 if(resolve(temporary).startsWith(resolve(tmpdir())+sep))await rm(temporary,{recursive:true,force:true,maxRetries:20,retryDelay:100});
}
