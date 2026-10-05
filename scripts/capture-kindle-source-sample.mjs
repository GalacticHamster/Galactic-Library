// Explicit bounded experiment, never installed-extension storage. Static HTML
// only, synthetic locally fulfilled origin, no product navigation/hydration.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import vm from 'node:vm';
import {loadCorpus,hash} from './contents-parser-corpus.mjs';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {selectManifest,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import '../src/lib/kindle-contents-scan.js';
const [backupPath,outputPath,authorization,resume]=process.argv.slice(2);
if(!backupPath||!outputPath||authorization!=='--run-frozen-25'||resume&&!['--resume'].includes(resume))throw Error('Usage: node scripts/capture-kindle-source-sample.mjs BACKUP NEW_OUTPUT --run-frozen-25 [--resume]');
const ledger=JSON.parse(await readFile(new URL('../docs/kindle-source-capture-sample.json',import.meta.url),'utf8'));
if(ledger.planned!==25||ledger.rows.length!==25||hash(ledger.rows.map(r=>r.sourceUrl).join('\n'))!==ledger.populationHash||new Set(ledger.rows.map(r=>r.sourceUrl)).size!==25)throw Error('Frozen population changed');
let previous;
try{previous=JSON.parse(await readFile(outputPath,'utf8'));if(!resume)throw Error('Output exists; refusing accidental network rerun');}catch(e){if(e.code!=='ENOENT')throw e;}
if(resume&&!previous)throw Error('No checkpoint to resume');
if(previous&&(previous.populationHash!==ledger.populationHash||previous.rows.length===25||/CAPTCHA|Sign in|outside/iu.test(previous.stop)))throw Error('Resume not permitted');
const corpus=await loadCorpus(backupPath);
if(corpus.sourceHash!==ledger.sourceHash)throw Error('Wrong backup');
const original=structuredClone(corpus.db);
const rawPilot=JSON.parse(await readFile(new URL('../docs/kindle-manifest-pilot-results.json',import.meta.url),'utf8'));
const metrics=JSON.parse(await readFile(new URL('../docs/kindle-manifest-pilot-metrics.json',import.meta.url),'utf8'));
for(const row of ledger.rows.filter(r=>r.extractorVersion===4)){
 const p=rawPilot.rows.find(p=>p.sourceUrl===row.sourceUrl),m=metrics.rows.find(p=>p.sourceUrl===row.sourceUrl);
 Object.assign(original.providerItems[row.itemId].metadata.enrichment.kindleProductComicContents,{statement:m.statement,extractorVersion:4,manifest:{...p.manifest,candidates:m.candidates,selected:m.selected,secondary:m.secondary}});
}
const values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
await writer.restoreDatabase(original);
const initial=await writer.getDatabase();
const adapter=await readFile(new URL('../src/providers/kindle.js',import.meta.url),'utf8');
if(!/const contentsExtractorVersion\s*=\s*4;/u.test(adapter))throw Error('Capture must use frozen generation 4');
const content=await readFile(new URL('../src/providers/kindle-content.js',import.meta.url),'utf8');
const retrySource=content.slice(content.indexOf('  function wait(milliseconds)'),content.indexOf('  async function enrichComicContents()'));
if(!retrySource.includes('attempt < 3')||!retrySource.includes('30000')||!retrySource.includes('2000 * (attempt + 1)')||!content.includes('await wait(1000)'))throw Error('Scan lifecycle changed');
// No attributes, scripts, links, images, personal data, or full page retained.
// Preserve only semantic markup and literal text in the five production regions.
function diagnosticWrapper(urls){
 const allowed=new Set(urls),originalFetch=fetch;
 const selectors=['#bookDescription_feature_div','#productDescription','#featurebullets_feature_div','#productOverview_feature_div','[data-feature-name="bookDescription"]'];
 const escape=s=>s.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');
 const tags=new Set(['p','div','span','ul','ol','li','br','b','strong','em','i','h1','h2','h3','h4','table','tr','td']);
 function sanitize(node,budget){
  if(budget.left<=0)return '';
  if(node.nodeType===3){const text=node.nodeValue.slice(0,budget.left);budget.left-=text.length;return escape(text);}
  if(node.nodeType!==1||['SCRIPT','STYLE','NOSCRIPT','IFRAME','FORM','INPUT','BUTTON','SELECT','TEXTAREA'].includes(node.tagName))return '';
  const tag=node.tagName.toLowerCase(),body=Array.from(node.childNodes).map(n=>sanitize(n,budget)).join('');
  return tag==='br'?'<br>':tags.has(tag)?`<${tag}>${body}</${tag}>`:body;
 }
 globalThis.fetch=async(url,options)=>{
  if(!allowed.has(String(url)))throw Error('Request outside frozen sample');
  globalThis.captureDiagnostic=null;
  const response=await originalFetch(url,options),body=await response.clone().text();
  const doc=new DOMParser().parseFromString(body,'text/html'),regions=[],seen=new Set();let left=120000;
  for(const selector of selectors)for(const element of doc.querySelectorAll(selector)){
   if(seen.has(element))continue;seen.add(element);
   const budget={left:Math.min(60000,left)},html=sanitize(element,budget);left-=Math.min(60000,left)-budget.left;
   regions.push({selector,textContent:element.textContent.slice(0,60000),textContentLength:element.textContent.length,sanitizedHtml:html,diagnosticTruncated:budget.left===0});
   if(left<=0||regions.length>=16)break;
  }
  globalThis.captureDiagnostic={status:response.status,responseCharacters:body.length,responseUrl:response.url,regions};
  return response;
 };
}
const profile=await mkdtemp(join(tmpdir(),'gl-source-capture-'));
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe','pipe','pipe']});
let nextId=0,input=Buffer.alloc(0);const pending=new Map(),listeners=new Map();
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('Protocol timeout: '+method));},45000);pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
child.stdio[4].on('data',chunk=>{input=Buffer.concat([input,chunk]);let end;while((end=input.indexOf(0))>=0){const m=JSON.parse(input.subarray(0,end));input=input.subarray(end+1);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else for(const fn of listeners.get(m.method)??[])fn(m);}});
const report=previous??{sourceHash:corpus.sourceHash,populationHash:ledger.populationHash,context:'Anonymous disposable Chrome; production static fetch; no hydration, clicks, signed-in profile or installed storage.',extractorVersion:4,parserVersion:4,filterVersion:1,retrySourceHash:hash(retrySource),adapterHash:hash(adapter),startedAt:new Date().toISOString(),requests:0,requestUrls:[],blockedRequests:[],rows:[],checkpoints:[],stop:''};
report.stop='';let session,context,interrupted=false,synthetic=true;
const buffer=globalThis.GalacticContentsScan.checkpointBuffer();
async function persist(){await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');}
async function checkpoint(){if(!buffer.size)return;const count=await buffer.flush(entries=>writer.saveKindleComicContents(entries));report.checkpoints.push({count,at:new Date().toISOString()});await persist();}
process.once('SIGINT',()=>{interrupted=true;report.stop='User interruption';if(context){context.pauseComicContentsRequested=true;context.activeContentsRequest?.abort();}});
try{
 const target=await send('Target.createTarget',{url:'about:blank'});({sessionId:session}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true}));
 await send('Page.enable',{},session);await send('Runtime.enable',{},session);
 const allowed=new Set(ledger.rows.map(r=>new URL(r.sourceUrl).origin+new URL(r.sourceUrl).pathname));
 listeners.set('Fetch.requestPaused',[m=>{
  const url=m.params.request.url;
  if(synthetic&&url==='https://www.amazon.com/hz/mycd/'){
   synthetic=false;send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<!doctype html><title>Local static harness</title><link rel="icon" href="data:,">').toString('base64')},session).catch(()=>{});return;
  }
  const u=new URL(url);
  if(allowed.has(u.origin+u.pathname)){
   report.requests++;report.requestUrls.push(u.origin+u.pathname);send('Fetch.continueRequest',{requestId:m.params.requestId},session).catch(()=>{});
  }else{
   report.blockedRequests.push(u.origin+u.pathname);report.stop='Request outside frozen sample blocked';interrupted=true;send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'},session).catch(()=>{});
  }
 }]);
 await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},session);
 await send('Page.navigate',{url:'https://www.amazon.com/hz/mycd/'},session);
 for(let n=0;n<30;n++){const r=await send('Runtime.evaluate',{expression:'location.origin',returnByValue:true},session);if(r.result.value==='https://www.amazon.com')break;await new Promise(resolve=>setTimeout(resolve,50));if(n===29)throw Error('Synthetic origin did not initialize');}
 await send('Runtime.evaluate',{expression:adapter},session);
 await send('Runtime.evaluate',{expression:`(${diagnosticWrapper.toString()})(${JSON.stringify(ledger.rows.map(r=>r.sourceUrl))})`},session);
 const remoteFetch=async(url,{signal,timing})=>{
  const onAbort=()=>send('Runtime.evaluate',{expression:'globalThis.captureAbort?.abort()'},session).catch(()=>{});signal.addEventListener('abort',onAbort,{once:true});
  try{
   const response=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{const stages=[];globalThis.captureAbort=new AbortController();const timer=setTimeout(()=>captureAbort.abort(),30000);const timing={attempts:${timing.attempts},begin(stage,attempt){const start=performance.now();return()=>stages.push({stage,attempt,ms:performance.now()-start});}};try{return {ok:true,value:await GalacticKindle.fetchKindleProductComicContents(${JSON.stringify(url)},{signal:captureAbort.signal,timing}),diagnostic:captureDiagnostic,stages};}catch(e){return {ok:false,error:e.message,diagnostic:captureDiagnostic,stages};}finally{clearTimeout(timer);}})()`},session);
   if(response.exceptionDetails)throw Error('Static harness exception');const r=response.result.value;
   timing.remoteAttempts.push({attempt:timing.attempts,ok:r.ok,error:r.error??'',stages:r.stages,diagnostic:r.diagnostic});
   if(!r.ok)throw Error(r.error);return r.value;
  }finally{signal.removeEventListener('abort',onAbort);}
 };
 context=vm.createContext({setTimeout,clearTimeout,AbortController,status:{textContent:''},GalacticKindle:{fetchKindleProductComicContents:remoteFetch},activeContentsRequest:null,pauseComicContentsRequested:false});
 vm.runInContext(retrySource+';globalThis.sampleRetry=fetchComicContentsWithRetry;',context);
 // Resume durable successful captures into the private writer, no new request.
 if(previous)for(const row of report.rows)if(row.acquired)buffer.add({...row.acquired,itemId:row.itemId,recordRef:initial.providerItems[row.itemId].recordRef});
 await checkpoint();
 for(const sample of ledger.rows.filter(r=>!report.rows.some(p=>p.ordinal===r.ordinal))){
  if(interrupted)break;const item=initial.providerItems[sample.itemId];
  const timing={attempts:0,remoteAttempts:[],begin(){return()=>{};}};let entry,error='';const start=performance.now();
  try{entry=await context.sampleRetry({detailUrl:sample.sourceUrl},sample.ordinal,25,timing);}
  catch(e){error=e.message;if(/CAPTCHA|Sign in/iu.test(error))report.stop=error;}
  const row={ordinal:sample.ordinal,auditId:sample.auditId,itemId:sample.itemId,title:sample.title,sourceUrl:sample.sourceUrl,error,attempts:timing.attempts,ms:performance.now()-start,attemptDiagnostics:timing.remoteAttempts,acquired:entry??null};
  if(entry){const selected=selectManifest(entry.descriptionBlocks??[],item.title);row.selection=selected;buffer.add({...entry,itemId:item.id,recordRef:item.recordRef});}
  report.rows.push(row);await persist();
  console.log(JSON.stringify({checked:report.rows.length,total:25,title:item.title,availability:entry?.availability,error,requests:report.requests}));
  if(buffer.due())await checkpoint();if(report.stop||interrupted)break;
  if(report.rows.length<25)await new Promise(resolve=>setTimeout(resolve,1000));
 }
}catch(e){report.stop=report.stop||e.message;console.error('Experiment stopped:',e.message);}
finally{
 try{await checkpoint();}catch(e){report.stop=report.stop||'Checkpoint failed: '+e.message;}
 const after=await writer.getDatabase();
 for(const row of report.rows){if(!row.acquired)continue;const item=after.providerItems[row.itemId],saved=item.metadata.enrichment.kindleProductComicContents;row.serialized=saved;row.parser=manifestReviewProposal(saved,item.title,saved.statement,{series:item.metadata.series??[]});}
 report.invariants={ownershipUnchanged:ledger.rows.every(r=>after.providerItems[r.itemId].ownership===initial.providerItems[r.itemId].ownership),canonicalUnchanged:JSON.stringify(after.canonicalItems)===JSON.stringify(initial.canonicalItems),reviewsUnchanged:JSON.stringify(after.contentReviews)===JSON.stringify(initial.contentReviews),sourceFileUnchanged:hash(await readFile(backupPath))===ledger.sourceHash};
 report.finishedAt=new Date().toISOString();await persist();
 try{await send('Browser.close');}catch{}child.kill();for(const p of pending.values())clearTimeout(p.timer);pending.clear();
 const resolved=resolve(profile);if(!resolved.startsWith(resolve(tmpdir())+sep)||!resolved.includes('gl-source-capture-'))throw Error('Unsafe cleanup path');await rm(resolved,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
console.log(JSON.stringify({checked:report.rows.length,requests:report.requests,stop:report.stop,invariants:report.invariants}));
if(report.stop)process.exitCode=1;
