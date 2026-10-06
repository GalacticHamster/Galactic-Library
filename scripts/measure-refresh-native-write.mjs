// Real Chrome storage, disposable fixture extension/profile, production writer.
// No installed extension, user profile, provider requests or live refresh.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,sep,isAbsolute,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe} from '../tests/native-protocol.mjs';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
const args=process.argv.slice(2),file=args.find(x=>!x.startsWith('--'));
const runtime=args.find(x=>x.startsWith('--runtime='))?.slice(10)??resolve('.'),label=args.find(x=>x.startsWith('--label='))?.slice(8)??'after';
const {createRelease}=await import(pathToFileURL(resolve(runtime,'scripts/release.mjs')));
const bytes=await readFile(requireBackup(file)),input=JSON.parse(bytes.toString('utf8')),hash=value=>createHash('sha256').update(value).digest('hex');
const temporary=await mkdtemp(join(tmpdir(),'gl-refresh-write-'));let child,protocol,exited;
try{
 const extension=join(temporary,'extension');await mkdir(extension);const release=await createRelease();
 for(const [path,data]of release.files){if(path==='manifest.json')continue;const target=join(extension,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,data);}
 // No background worker/Options page: isolate native storage and the sole
 // production writer without unrelated startup/UI work or remote permissions.
 await writeFile(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Disposable refresh write control',version:'1.0',permissions:['storage','unlimitedStorage']}));
 await writeFile(join(extension,'control.html'),'<!doctype html><title>Disposable offline refresh control</title>');
 child=spawn(process.env.CHROME_BIN??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-pipe','--enable-unsafe-extension-debugging','--user-data-dir='+join(temporary,'profile'),'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe','pipe','pipe']});
 exited=new Promise(done=>child.once('exit',done));protocol=chromePipe(child);
 const {id}=await protocol.send('Extensions.loadUnpacked',{path:extension});const {targetId}=await protocol.send('Target.createTarget',{url:`chrome-extension://${id}/control.html`});const {sessionId}=await protocol.send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const response=await protocol.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(response.exceptionDetails)throw Error('Disposable write control failed (private data omitted).');return response.result.value;};
 await evaluate(`globalThis.control={done:false};globalThis.input=${JSON.stringify(input)};true`);
 await evaluate(`(async()=>{
  const {createStorageWriter}=await import('./src/background/storage-writer.js'),{validateDatabaseAsync}=await import('./src/lib/models.js'),{equalDatabaseData}=await import('./src/lib/data-equality.js');
  const input=globalThis.input.database??globalThis.input;
  const database=await validateDatabaseAsync(input);await chrome.storage.local.set({galacticLibraryDatabase:database});
  const writer=createStorageWriter(chrome.storage.local,Promise.resolve(),{cacheQuerySnapshots:true});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.galacticLibraryDatabase)writer.invalidateQuerySnapshot(changes.galacticLibraryDatabase.newValue);});
  await writer.getQueryDatabase();const plan=await writer.beginKindleContentsRefresh('start',1),results=[];
  for(let batch=0;batch<3;batch++){
   const trace=globalThis.GalacticContentsPerformance.trace('lookup-abcdef123456-'+String(batch+1).padStart(3,'0'),'checkpoint');const at=performance.now();
   const summary=await writer.execute('commitKindleContentsRefresh',[plan.candidates.slice(batch*14,batch*14+14).map((item,n)=>({itemId:item.id,recordRef:item.recordRef,queuePosition:batch*14+n,sourceUrl:item.detailUrl,statement:'Collects Synthetic Performance #1-4',availability:'statement-found',extractorVersion:5})),plan.refresh.runRef,plan.refresh.leaseRef,1],trace);
   const totalMs=performance.now()-at;results.push({totalMs,cursor:summary.cursor,events:trace.events});
   const raw=(await chrome.storage.local.get('galacticLibraryDatabase')).galacticLibraryDatabase;if(!equalDatabaseData(raw,await validateDatabaseAsync(raw)))throw Error('Persisted data failed exact revalidation');
  }
  globalThis.control={done:true,report:{browser:navigator.userAgent,records:Object.keys(database.providerItems).length,compactBytes:new TextEncoder().encode(JSON.stringify(database)).length,results}};
 })().catch(()=>{globalThis.control={done:true,failed:true};});true`);
 let state;for(let attempt=0;attempt<180;attempt++){state=await evaluate('control');if(state.done)break;await pause(500);}
 if(!state?.done||state.failed)throw Error('Disposable native control failed or exceeded its bound.');
 if(hash(bytes)!==hash(await readFile(file)))throw Error('Source backup changed during control');
 await writeFile(await outputPath('audit-artifacts/refresh-write-pacing/native-'+label+'.json'),JSON.stringify({label,measurement:'Offline, sequential 14-record refresh checkpoints. Production writer and real Chrome storage; no provider, active worker, companion, Options or private user profile.',sourceUnchanged:true,...state.report},null,2));
 console.log(JSON.stringify({label,records:state.report.records,results:state.report.results.map(row=>({totalMs:row.totalMs,cursor:row.cursor}))}));
}finally{
 if(child){try{await protocol?.send('Browser.close');}catch{child.kill();}await Promise.race([exited,pause(5000)]);if(child.exitCode===null)child.kill();await Promise.race([exited,pause(5000)]);}
 const target=resolve(temporary),location=relative(resolve(tmpdir()),target);
 if(!location||isAbsolute(location)||location==='..'||location.startsWith('..'+sep)||!location.startsWith('gl-refresh-write-'))throw Error('Unexpected temporary cleanup target');
 await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}
