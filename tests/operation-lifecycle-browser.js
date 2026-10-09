import {createBackup} from '../src/lib/storage.js';
import {createContentsScanProgress} from '../src/ui/contents-scan-progress.js';
export async function operationLifecycleChecks({fixture,memory,listeners,wait,frame,checks}){
 const select=name=>document.querySelector('[data-workspace="'+name+'"]').click();
 const status=document.querySelector('#backup-status'),exportButton=document.querySelector('#export'),input=document.querySelector('#import');
 const original=chrome.runtime.sendMessage,originalClick=HTMLAnchorElement.prototype.click,originalCreate=URL.createObjectURL;
 const downloads=[],blobs=new Map(),requests=[],phases=[];let heldRead,releaseRead,failRead=false,failView=false,failWrite=false,failReloadAfterWrite=false;
 chrome.runtime.sendMessage=async request=>{
  if(request.type==='LIBRARY_STORAGE_OPERATION'){
   requests.push(request.operation);
   if(request.operation==='getDatabase'){if(failRead){failRead=false;return {ok:false,error:'Synthetic read failure'};}if(heldRead)await heldRead;}
   if(request.operation==='getCommittedLibraryView'&&failView){failView=false;return {ok:false,error:'Synthetic worker unavailable'};}
   if(request.operation==='restoreDatabase'){if(failWrite){failWrite=false;return {ok:false,error:'Synthetic storage write failure'};}if(failReloadAfterWrite){failReloadAfterWrite=false;failView=true;}}
  }
  return original(request);
 };
 URL.createObjectURL=function(blob){const url=originalCreate.call(URL,blob);blobs.set(url,blob);return url;};
 HTMLAnchorElement.prototype.click=function(){if(this.download){downloads.push({filename:this.download,blob:blobs.get(this.href)});return;}return originalClick.call(this);};
 const observe=event=>phases.push({...event.detail,time:performance.now()});document.addEventListener('gl-operation-state',observe);
 const choose=value=>{const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(value)],'synthetic-recovery-candidate-with-a-long-filename-for-layout-testing.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));};
 const dialog=()=>document.querySelector('.confirmation-dialog[open]');
 const click=(root,label)=>[...root.querySelectorAll('button')].find(button=>button.textContent===label).click();
 try{
  select('settings');await frame();
  const originalBounds=exportButton.getBoundingClientRect();heldRead=new Promise(resolve=>releaseRead=resolve);
  const started=performance.now();exportButton.click();exportButton.dispatchEvent(new Event('click'));await frame();
  assert(exportButton.disabled&&exportButton.textContent==='Preparing export...','Export did not acknowledge immediately');
  assert(requests.filter(op=>op==='getDatabase').length===1,'Duplicate export read');assert(downloads.length===0,'Export completed during blocked read');
  const busyBounds=exportButton.getBoundingClientRect();assert(Math.abs(originalBounds.y-busyBounds.y)<2,'Busy export shifted under pointer');
  select('providers');await frame();assert(document.querySelector('#application-operation-status').textContent.includes('Preparing export'),'Export status lost on navigation');
  releaseRead();heldRead=null;await wait(()=>downloads.length===1&&!exportButton.disabled,'Export did not settle');
  assert(status.textContent.includes('handed to your browser')&&!status.textContent.includes('saved successfully'),'False disk-save claim');
  const exported=JSON.parse(await downloads[0].blob.text());assert(JSON.stringify(exported.database)===JSON.stringify(fixture),'Export altered protected state');
  checks.push('Delayed export paints busy state, rejects duplicate clicks, retains geometry/navigation and hands off exactly one unchanged backup');
  const exportMs=performance.now()-started;
  select('settings');failRead=true;exportButton.click();await wait(()=>status.textContent.includes('Synthetic read failure')&&!exportButton.disabled,'Export failure did not recover');await frame();assert(status.getAttribute('aria-busy')==='false','Export failure remained busy');
  exportButton.click();await wait(()=>downloads.length===2&&!exportButton.disabled,'Export retry failed');checks.push('Failed export retains an error and permits a successful subsequent export');
  choose({invalid:true});await frame();await wait(()=>status.textContent.includes('Backup validation failed')&&!input.disabled,'Invalid import did not settle');assert(!dialog(),'Invalid file prompted a restore');
  const candidate={...createBackup(fixture),recoveryManifest:{format:1,operation:'synthetic-test-only'}};
  choose(candidate);assert(input.disabled&&status.textContent==='Reading backup...','Import did not acknowledge selection');await frame();await wait(dialog,'Valid candidate did not prompt');
  assert(requests.filter(op=>op==='restoreDatabase').length===0,'Selection implicitly restored');click(dialog(),'Cancel');await wait(()=>!input.disabled,'Cancel left input disabled');
  assert(JSON.stringify(memory.galacticLibraryDatabase)===JSON.stringify(fixture),'Cancel mutated library');checks.push('Invalid and cancelled imports never replace data, and synthetic manifest metadata is accepted only after validation');
  const importStarted=performance.now();choose(candidate);await wait(dialog,'Restore confirmation missing');failWrite=true;click(dialog(),'Replace library');await wait(()=>status.textContent.includes('completion could not be confirmed')&&!input.disabled,'Write failure missing');assert(JSON.stringify(memory.galacticLibraryDatabase)===JSON.stringify(fixture),'Rejected write mutated library');
  choose(candidate);await wait(dialog,'Restore retry confirmation missing');failReloadAfterWrite=true;const confirm=[...dialog().querySelectorAll('button')].find(button=>button.textContent==='Replace library');confirm.click();confirm.dispatchEvent(new Event('click'));
  await wait(()=>status.textContent.includes('Backup was restored')&&!input.disabled,'Post-commit reload error missing');assert(status.textContent.includes('do not repeat'),'Post-commit failure suggests retrying restore');
  assert(requests.filter(op=>op==='restoreDatabase').length===2,'Duplicate confirmation started another restore');assert(JSON.stringify(memory.galacticLibraryDatabase)===JSON.stringify(fixture),'Restore lost contents/profiles/reviews/identity');
  document.querySelector('#retry-library-load').click();await wait(()=>document.querySelector('#library-load-status').hidden,'Post-restore view retry failed');
  assert(!Object.hasOwn(memory.galacticLibraryDatabase,'recoveryManifest'),'Recovery manifest became database state');checks.push('Write failure recovers; double confirmation commits once; post-commit reload failure is explicit and Library retry preserves all protected data');
  const restoreMs=performance.now()-importStarted;
  failView=true;listeners.forEach(listener=>listener({galacticLibraryDatabase:{}},'local'));await wait(()=>!document.querySelector('#retry-library-load').hidden,'Read failure missing');
  document.querySelector('#retry-library-load').click();await wait(()=>document.querySelector('#library-load-status').hidden,'Library retry failed');checks.push('Worker/read failure displays retry instead of an empty library and recovers without replacement');
  const scope=document.createElement('div');document.body.append(scope);let poll,unavailable=true;
  const scan=createContentsScanProgress({container:scope,runtime:{sendMessage:async()=>{if(unavailable)throw Error('Worker absent');return {ok:true,runs:[]};}},reconcile:async()=>{},schedule:callback=>{poll=callback;return 1;},cancel(){}});
  scan.accept([{runRef:'12345678-1234-1234-1234-123456789abc',phase:'running',mode:'scan',checked:3,total:10,found:2,empty:1,unavailable:0,failures:0,reparsed:0,durable:3,buffered:0}]);await scan.initialize();
  assert(scan.element.textContent.includes('last reported counts')&&scan.running,'Unavailable worker falsely completed scan');unavailable=false;await poll();scan.dispose();scope.remove();checks.push('Unavailable scan status retains last-known real counters rather than falsely reporting completion');
  for(const element of [document.querySelector('#application-operation-status'),document.querySelector('#library-load-status span'),status])assert(element.getAttribute('role')==='status'&&element.getAttribute('aria-live')==='polite','Accessible status semantics missing');
  assert(document.documentElement.scrollWidth<=innerWidth+1,'Operation UI overflows viewport');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){status.setAttribute('aria-busy','true');assert(getComputedStyle(status,'::before').animationName==='none','Reduced motion still animates');status.setAttribute('aria-busy','false');}
  exportButton.focus();assert(document.activeElement===exportButton,'Keyboard focus unavailable');
  checks.push('Status announcements, reduced-motion styling, keyboard focus and viewport geometry remain usable');
  return {exportWithDeliberateHoldMs:exportMs,importRestoreFailureRetryExerciseMs:restoreMs,phases,downloads:downloads.length,restoreRequests:requests.filter(op=>op==='restoreDatabase').length};
 }finally{chrome.runtime.sendMessage=original;HTMLAnchorElement.prototype.click=originalClick;URL.createObjectURL=originalCreate;document.removeEventListener('gl-operation-state',observe);}
}
function assert(value,message){if(!value)throw Error(message);}
