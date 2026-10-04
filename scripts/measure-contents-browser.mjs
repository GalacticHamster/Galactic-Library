// Offline control against actual Chrome storage in a disposable extension/profile.
// No Amazon requests, user browser profile, source-export writes or runtime edits.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,sep,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {createRelease} from './release.mjs';
import {chromePipe} from '../tests/native-protocol.mjs';

const [file,countText='50',output]=process.argv.slice(2),count=Number(countText);
if(!file||!Number.isInteger(count)||count<20||count>50||process.argv.length>5)throw Error('Usage: node scripts/measure-contents-browser.mjs BACKUP_JSON [20..50] [REPORT_JSON]');
if(output&&resolve(output)===resolve(file))throw Error('The report must not replace the source backup.');
const bytes=await readFile(file),hash=value=>createHash('sha256').update(value).digest('hex');
const input=JSON.parse(bytes.toString('utf8'));
const temporary=await mkdtemp(join(tmpdir(),'gl-contents-measure-'));
let child,exited,protocol;
try{
  const extension=join(temporary,'extension');await mkdir(extension);
  const release=await createRelease();
  for(const [path,data]of release.files){const target=join(extension,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,data);}
  await writeFile(join(extension,'contents-benchmark.html'),'<!doctype html><meta charset="utf-8"><title>Isolated contents storage control</title>');
  child=spawn(process.env.CHROME_BIN??'C:/Program Files/Google/Chrome/Application/chrome.exe',[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--disable-component-update','--disable-sync','--remote-debugging-pipe','--enable-unsafe-extension-debugging',
    '--user-data-dir='+join(temporary,'profile'),'about:blank'
  ],{windowsHide:true,stdio:['ignore','pipe','pipe','pipe','pipe']});
  exited=new Promise(done=>child.once('exit',done));protocol=chromePipe(child);
  const {id}=await protocol.send('Extensions.loadUnpacked',{path:extension});
  const {targetId}=await protocol.send('Target.createTarget',{url:`chrome-extension://${id}/contents-benchmark.html`});
  const {sessionId}=await protocol.send('Target.attachToTarget',{targetId,flatten:true});
  async function evaluate(expression){
    const response=await protocol.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(response.exceptionDetails)throw Error('Isolated browser control failed (no library details logged).');
    return response.result.value;
  }
  await evaluate(`(async()=>{
    const S=await import('./src/lib/storage.js'),W=await import('./src/background/storage-writer.js'),M=await import('./src/lib/models.js'),E=await import('./src/lib/data-equality.js'),K=await import('./src/lib/kindle-contents.js');
    await import('./src/lib/kindle-contents-scan.js');
    const database=S.parseBackup(${JSON.stringify(input)});
    await chrome.storage.local.set({galacticLibraryDatabase:database});
    const stored=(await chrome.storage.local.get('galacticLibraryDatabase')).galacticLibraryDatabase,validated=M.validateDatabase(stored);
    let semanticMs=0,stringifyMs=0,semanticEqual=false,stringifyEqual=false;
    for(let n=0;n<10;n++){
      let at=performance.now();semanticEqual=E.equalDatabaseData(stored,validated);semanticMs+=performance.now()-at;
      at=performance.now();stringifyEqual=JSON.stringify(stored)===JSON.stringify(validated);stringifyMs+=performance.now()-at;
    }
    const plan=K.kindleContentsPlan(validated),books=plan.candidates.slice(0,${count});
    if(books.length!==${count})throw Error('Insufficient eligible candidates');
    const perf=globalThis.GalacticContentsPerformance,collector=perf.collector(),writer=W.createStorageWriter(chrome.storage.local),buffer=globalThis.GalacticContentsScan.checkpointBuffer();
    let writes=0,migrations=0,sequence=0;
    globalThis.control={done:false};
    globalThis.measure=async()=>{
      for(const [index,item]of books.entries()){
        const trace=perf.trace('lookup-abcdef123456-'+String(++sequence).padStart(3,'0'),'network');trace.attempts=1;
        const category=index%2?'statement-found':'no-statement';
        buffer.add({itemId:item.id,recordRef:item.recordRef,sourceUrl:item.detailUrl,statement:index%2?'Includes First Work and Second Work':'',availability:category,extractorVersion:K.KINDLE_CONTENTS_EXTRACTOR_VERSION});
        if(buffer.due()||index===books.length-1){
          trace.batchSize=buffer.size;const end=trace.begin('save_message'),worker=trace.begin('worker_total');
          await buffer.flush(entries=>writer.execute('saveKindleComicContents',[entries],trace));worker();end();
          writes+=trace.events.filter(event=>event.stage==='storage_write').length;
          migrations+=trace.events.filter(event=>event.stage==='migration_write').length;
        }
        collector.add(trace.finish(category));
      }
      const result=collector.report();
      globalThis.control={done:true,result:{measurement:'OFFLINE Chrome native storage control. Real packaged writer/validator/parser; alternating statement-found and no-statement replay. No Amazon, throttle, content-to-worker transport or Options rendering. Not a signed-in live after sample.',browser:navigator.userAgent,providerRecordCount:Object.keys(database.providerItems).length,sample:books.length,batchSizes:result.records.filter(row=>row.batchSize).map(row=>row.batchSize),writes,migrations,equality:{semanticEqual,stringifyEqual,semanticMeanMs:semanticMs/10,stringifyMeanMs:stringifyMs/10},...result}};
    };
    return true;
  })()`);
  await evaluate('measure().catch(()=>{globalThis.control={done:true,failed:true};});true');
  let state;
  for(let attempt=0;attempt<180;attempt++){state=await evaluate('control');if(state.done)break;await pause(500);}
  if(!state?.done||state.failed)throw Error('Isolated browser control failed or exceeded its time bound.');
  if(hash(bytes)!==hash(await readFile(file)))throw Error('Source backup changed during measurement.');
  const report=JSON.stringify({...state.result,sourceUnchanged:true},null,2)+'\n';
  if(output){await writeFile(output,report);console.log('Saved anonymous offline timings; source export unchanged.');}else console.log(report);
}finally{
  if(child){try{await protocol?.send('Browser.close');}catch{child.kill();}await Promise.race([exited,pause(5000)]);if(child.exitCode===null)child.kill();await Promise.race([exited,pause(5000)]);}
  // Verify the resolved recursive target belongs to this task's temporary root.
  const target=resolve(temporary),location=relative(resolve(tmpdir()),target);
  if(!location||isAbsolute(location)||location==='..'||location.startsWith('..'+sep)||!location.startsWith('gl-contents-measure-'))throw Error('Unexpected temporary cleanup target.');
  await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}
