// Explicitly bounded, one-run static-fetch pilot. No real-page navigation,
// hydration, clicks, signed-in profile, or installed extension storage access.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import vm from 'node:vm';
import {supportedKindleContentsBook} from '../src/lib/kindle-contents.js';
import {manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {proposeContentsForReview,contentKey} from '../src/lib/contents.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import '../src/lib/kindle-contents-scan.js';
const [backupPath,outputPath,authorization]=process.argv.slice(2);
if(!backupPath||!outputPath||authorization!=='--run-exact-77')throw Error('Usage: node scripts/pilot-kindle-manifests.mjs BACKUP_JSON NEW_OUTPUT_JSON --run-exact-77');
try{await readFile(outputPath);throw Error('Pilot output already exists; refusing an accidental network rerun.');}catch(e){if(e.code!=='ENOENT')throw e;}
const bytes=await readFile(backupPath),sourceHash=createHash('sha256').update(bytes).digest('hex');
if(sourceHash!=='3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e')throw Error('Source is not the audited backup.');
const original=JSON.parse(bytes).database;
const eligible=Object.values(original.providerItems).filter(supportedKindleContentsBook);
const population=eligible.filter(i=>/\s+Read more\s*$/iu.test(i.metadata?.enrichment?.kindleProductComicContents?.statement??'')||/^100 Bullets: Book (Four|Five)$/u.test(i.title));
if(eligible.length!==3194||population.length!==77||new Set(population.map(i=>i.metadata.detailUrl)).size!==77)throw Error('Exact pilot population changed.');
population.sort((a,b)=>/^100 Bullets: Book (Four|Five)$/u.test(b.title)-/^100 Bullets: Book (Four|Five)$/u.test(a.title)||a.title.localeCompare(b.title));
const populationHash=createHash('sha256').update(population.map(i=>i.metadata.detailUrl).sort().join('\n')).digest('hex');
const values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
await writer.restoreDatabase(original);const initial=await writer.getDatabase();
const adapter=await readFile(new URL('../src/providers/kindle.js',import.meta.url),'utf8');
const content=await readFile(new URL('../src/providers/kindle-content.js',import.meta.url),'utf8');
const retrySource=content.slice(content.indexOf('  function wait(milliseconds)'),content.indexOf('  async function enrichComicContents()'));
if(!retrySource.includes('attempt < 3')||!retrySource.includes('30000')||!retrySource.includes('2000 * (attempt + 1)')||!content.includes('await wait(1000)'))throw Error('Scan lifecycle changed; reassess harness before any request.');
const profile=await mkdtemp(join(tmpdir(),'gl-static-manifest-pilot-'));
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe','pipe','pipe']});
let nextId=0,input=Buffer.alloc(0);const pending=new Map(),listeners=new Map();
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('Protocol timeout: '+method));},45000);pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
child.stdio[4].on('data',chunk=>{input=Buffer.concat([input,chunk]);let end;while((end=input.indexOf(0))>=0){const m=JSON.parse(input.subarray(0,end));input=input.subarray(end+1);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else for(const fn of listeners.get(m.method)??[])fn(m);}});
const report={sourceHash,populationHash,populationDefinition:'Audited eligible Kindle books: terminal Read more saved statements (75) union 100 Bullets Books Four/Five (2), deduplicated by product URL',eligible:3194,pagesPlanned:77,context:'Anonymous disposable Chrome context; production static fetch + DOMParser only. Synthetic origin document fulfilled locally without an Amazon navigation request. No live Amazon DOM/hydration/clicks.',extractorVersion:4,parserVersion:3,filterVersion:1,retrySourceHash:createHash('sha256').update(retrySource).digest('hex'),startedAt:new Date().toISOString(),rows:[],checkpoints:[],stop:''};
const start=performance.now(),buffer=globalThis.GalacticContentsScan.checkpointBuffer();let session,context,interrupted=false;
process.once('SIGINT',()=>{interrupted=true;report.stop='User interruption';if(context){context.pauseComicContentsRequested=true;context.activeContentsRequest?.abort();}});
async function checkpoint(){if(!buffer.size)return;const t=performance.now(),count=await buffer.flush(entries=>writer.saveKindleComicContents(entries));report.checkpoints.push({count,ms:performance.now()-t});await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');}
try{
  const target=await send('Target.createTarget',{url:'about:blank'});({sessionId:session}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true}));
  await send('Page.enable',{},session);await send('Runtime.enable',{},session);
  listeners.set('Fetch.requestPaused',[m=>{send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<!doctype html><title>Local static-fetch harness</title>').toString('base64')},session).catch(()=>{});}]);
  await send('Fetch.enable',{patterns:[{urlPattern:'https://www.amazon.com/hz/mycd/*',requestStage:'Request'}]},session);
  await send('Page.navigate',{url:'https://www.amazon.com/hz/mycd/'},session);
  // Protocol context readiness, not a product-page delay or hydration wait.
  for(let n=0;n<30;n++){const r=await send('Runtime.evaluate',{expression:'location.origin',returnByValue:true},session);if(r.result.value==='https://www.amazon.com')break;await new Promise(resolve=>setTimeout(resolve,50));if(n===29)throw Error('Synthetic Amazon origin did not initialize.');}
  await send('Fetch.disable',{},session);await send('Runtime.evaluate',{expression:adapter},session);
  await send('Runtime.evaluate',{expression:`globalThis.pilotAllowed=new Set(${JSON.stringify(population.map(i=>i.metadata.detailUrl))});globalThis.pilotOriginalFetch=fetch;globalThis.fetch=(url,options)=>{if(!pilotAllowed.has(String(url)))throw Error('Request outside exact pilot');return pilotOriginalFetch(url,options);};`},session);
  const remoteFetch=async(url,{signal,timing})=>{
    const onAbort=()=>send('Runtime.evaluate',{expression:'globalThis.pilotAbort?.abort()'},session).catch(()=>{});signal.addEventListener('abort',onAbort,{once:true});
    try{
      const response=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{const stages=[];globalThis.pilotAbort=new AbortController();const timer=setTimeout(()=>pilotAbort.abort(),30000);const timing={attempts:${timing.attempts},begin(stage,attempt){const start=performance.now();return()=>stages.push({stage,attempt,ms:performance.now()-start});}};try{return {ok:true,value:await GalacticKindle.fetchKindleProductComicContents(${JSON.stringify(url)},{signal:pilotAbort.signal,timing}),stages};}catch(e){return {ok:false,error:e.message,stages};}finally{clearTimeout(timer);}})()`},session);
      if(response.exceptionDetails)throw Error('Static fetch harness exception');
      const r=response.result.value;timing.remoteAttempts.push({attempt:timing.attempts,ok:r.ok,error:r.error??'',stages:r.stages});
      if(!r.ok)throw Error(r.error);return r.value;
    }finally{signal.removeEventListener('abort',onAbort);}
  };
  // Compile the actual production retry helper, not a new network policy.
  context=vm.createContext({setTimeout,clearTimeout,AbortController,status:{textContent:''},GalacticKindle:{fetchKindleProductComicContents:remoteFetch},activeContentsRequest:null,pauseComicContentsRequested:false});
  vm.runInContext(retrySource+';globalThis.pilotRetry=fetchComicContentsWithRetry;',context);
  for(let index=0;index<population.length&&!interrupted;index++){
    const originalItem=population[index],item=initial.providerItems[originalItem.id],before=proposeContentsForReview(originalItem.metadata.enrichment.kindleProductComicContents.statement,item.title);
    const timing={attempts:0,remoteAttempts:[],localStages:[],begin(stage,attempt){const start=performance.now();return()=>this.localStages.push({stage,attempt,ms:performance.now()-start});}};
    const pageStart=performance.now();let entry,error='';
    try{entry=await context.pilotRetry({detailUrl:item.metadata.detailUrl},index+1,77,timing);}
    catch(e){if(interrupted)break;error=e.message;const failureCode=/CAPTCHA/iu.test(error)?'captcha':/sign in/iu.test(error)?'sign-in':/\b\d{3}\b/u.test(error)?'http':/network|fetch|timed out|abort/iu.test(error)?'network':'unknown';entry={sourceUrl:item.metadata.detailUrl,statement:'',availability:'temporary-failure',failureCode};if(['captcha','sign-in'].includes(failureCode))report.stop=error;}
    buffer.add({...entry,itemId:item.id,recordRef:item.recordRef});
    report.rows.push({ordinal:index+1,title:item.title,sourceUrl:item.metadata.detailUrl,beforeStatement:originalItem.metadata.enrichment.kindleProductComicContents.statement,before:{outcome:before.outcome,entries:before.entries.length,unresolved:before.unparsed.length},availability:entry.availability,error,attempts:timing.attempts,pageMs:performance.now()-pageStart,remoteAttempts:timing.remoteAttempts,localStages:timing.localStages});
    console.log(JSON.stringify({checked:index+1,total:77,title:item.title,availability:entry.availability,attempts:timing.attempts}));
    if(buffer.due())await checkpoint();
    if(report.stop)break;
    if(index<population.length-1)await new Promise(resolve=>setTimeout(resolve,1000));
  }
}catch(e){report.stop=report.stop||e.message;console.error('Pilot stopped:',e.message);}
finally{
  try{await checkpoint();}catch(e){report.stop=report.stop||'Checkpoint failed: '+e.message;}
  const after=await writer.getDatabase();
  for(const row of report.rows){
    const item=population.find(i=>i.metadata.detailUrl===row.sourceUrl),saved=after.providerItems[item.id].metadata.enrichment.kindleProductComicContents,p=manifestReviewProposal(saved,item.title);
    row.after={outcome:p.outcome,entries:p.entries.length,unresolved:p.unparsed.length};row.statement=saved.statement;row.manifest=saved.manifest??null;
    const prior=proposeContentsForReview(row.beforeStatement,item.title),keys=new Set(p.entries.map(contentKey));row.lostPriorUnits=prior.entries.filter(e=>!keys.has(contentKey(e)));
    row.changed=row.beforeStatement!==row.statement||row.before.outcome!==row.after.outcome||row.before.entries!==row.after.entries;
  }
  report.finishedAt=new Date().toISOString();report.elapsedMs=performance.now()-start;
  report.invariants={ownershipUnchanged:population.every(i=>after.providerItems[i.id].ownership===original.providerItems[i.id].ownership),reviewsUnchanged:JSON.stringify(after.contentReviews)===JSON.stringify(original.contentReviews),sourceFileUnchanged:createHash('sha256').update(await readFile(backupPath)).digest('hex')===sourceHash};
  await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
  try{await send('Browser.close');}catch{}child.kill();
  for(const p of pending.values())clearTimeout(p.timer);pending.clear();
  const resolved=resolve(profile),expected=resolve(tmpdir())+sep;
  if(!resolved.startsWith(expected)||!resolved.includes('gl-static-manifest-pilot-'))throw Error('Unsafe disposable-profile cleanup path');
  await rm(resolved,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
console.log(JSON.stringify({pages:report.rows.length,stop:report.stop,elapsedMs:report.elapsedMs,invariants:report.invariants}));
if(report.stop)process.exitCode=1;
