import {operationLibrary} from './fixtures/operation-library.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {operationLifecycleChecks} from './operation-lifecycle-browser.js';
const checks=[],assert=(value,message)=>{if(!value)throw Error(message);};
const params=new URLSearchParams(location.search),size=Number(params.get('size')??1000);
const timings=[],listeners=[],memory={};let phase='cold';
const wait=async(predicate,message)=>{const deadline=performance.now()+120000;while(performance.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error(message);};
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
try{
 const fixture=await operationLibrary(size);memory.galacticLibraryDatabase=structuredClone(fixture);
 const writer=createStorageWriter({get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,Object.hasOwn(memory,key)?memory[key]:value]))),set:async values=>Object.assign(memory,structuredClone(values)),remove:async keys=>{for(const key of keys)delete memory[key];}},Promise.resolve(),{cacheQuerySnapshots:true});
 let releaseStartup;const gate=params.has('exercise')?new Promise(resolve=>releaseStartup=resolve):null;
 let initialRequests=0;
 const requests=[];globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener(){}},sendMessage:async request=>{
  if(request.type==='GL_CONTENTS_UI_TIMING'){timings.push({phase,timing:request.timing});return {ok:true};}
  if(request.type==='GET_KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true,runs:[]};
  if(request.type!=='LIBRARY_STORAGE_OPERATION')return {ok:false,error:'Network disabled in synthetic fixture'};
  if(request.operation==='getCommittedLibraryView'&&++initialRequests===1&&gate)await gate;
  const start=performance.now();try{return {ok:true,result:structuredClone(await writer.execute(request.operation,request.args))};}catch(error){return {ok:false,error:error.message};}finally{requests.push({operation:request.operation,ms:performance.now()-start});}
 }},storage:{onChanged:{addListener:listener=>listeners.push(listener)}},tabs:{create:async()=>{throw Error('Provider acquisition prohibited');}}};
 const started=performance.now();let firstUsefulMs;const gaps=[];let lastFrame=started,tracking=true;
 const track=now=>{gaps.push(now-lastFrame);lastFrame=now;if(tracking)requestAnimationFrame(track);};requestAnimationFrame(track);
 const observe=new MutationObserver(()=>{if(firstUsefulMs===undefined&&(document.querySelector('#library-items li')||!document.querySelector('#empty-library').hidden)){firstUsefulMs=-1;frame().then(()=>firstUsefulMs=performance.now()-started);}});observe.observe(document.querySelector('#library-section'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 await frame();const staticFeedbackMs=performance.now()-started;
 assert(!document.querySelector('#library-load-status').hidden&&document.querySelector('#empty-library').hidden,'Initial loading state absent or false empty');
 await import('../src/ui/options.js');
 if(gate){await frame();assert(!document.querySelector('#library-load-status').hidden&&document.querySelector('#empty-library').hidden,'Delayed startup lost loading state');document.querySelector('[data-workspace="providers"]').click();document.querySelector('[data-workspace="library"]').click();document.querySelector('#retry-library-load').dispatchEvent(new Event('click'));await frame();assert(initialRequests===1,'Navigation/retry duplicated initial load');releaseStartup();checks.push('Delayed initial response paints loading, never claims empty, and coalesces retry/navigation');}
 await wait(()=>document.querySelector('#library-load-status').hidden,'Cold Library did not finish');await frame();
 const coldMs=performance.now()-started;tracking=false;observe.disconnect();
 assert(document.querySelectorAll('#library-items > li').length===Math.min(50,Object.keys(fixture.canonicalItems).length),'Incorrect first page');
 assert(document.querySelector('#empty-library').hidden===(size>0),'Empty state confused with loading');
 checks.push('Synthetic startup paints loading before work and renders bounded, correct Library results');
 phase='warm';const warmStarted=performance.now();listeners.forEach(listener=>listener({galacticLibraryDatabase:{}},'local'));
 await wait(()=>timings.some(value=>value.phase==='warm'),'Warm Library refresh did not finish');await frame();const warmMs=performance.now()-warmStarted;
 const report={size,providerRecords:Object.keys(fixture.providerItems).length,canonicalRecords:Object.keys(fixture.canonicalItems).length,profiles:Object.keys(fixture.providerProfiles).length,g5Records:Object.values(fixture.providerItems).filter(r=>r.metadata.enrichment?.kindleProductComicContents?.extractorVersion===5).length,reviews:Object.keys(fixture.contentReviews).length,sourceBaselines:Object.keys(fixture.kindleContentsObservations).length,bytes:new Blob([JSON.stringify(fixture)]).size,staticFeedbackMs,firstUsefulMs,maxFrameGapMs:Math.max(...gaps),coldMs,warmMs,timings,requests,measurement:'Synthetic in-page worker/storage with clone transport. Timings do not measure native extension transport or real private storage; frame gaps include the synthetic worker executing on the page thread.'};
 document.querySelector('[data-workspace="providers"]').click();assert(document.querySelectorAll('.provider-card').length>0,'Deferred provider cards missing');
 document.querySelector('[data-workspace="contents"]').click();assert(document.querySelector('#contents-collections').textContent.includes(size?'catalog books':'No imported books'),'Deferred Contents did not initialize');
 document.querySelector('[data-workspace="ownership"]').click();assert(!document.querySelector('#duplicate-review-summary').textContent.includes('Checking'),'Deferred duplicate review did not initialize');
 assert(JSON.stringify(memory.galacticLibraryDatabase)===JSON.stringify(fixture),'Browsing mutated synthetic protected library state');
 checks.push('Deferred workspaces initialize on navigation and preserve the full database exactly');
 if(params.has('exercise'))report.lifecycle=await operationLifecycleChecks({fixture,memory,listeners,wait,frame,checks});
 await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,performance:report})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
