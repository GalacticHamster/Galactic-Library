import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {observeImportLifecycle} from './import-lifecycle.mjs';
function fixture(){
  let listener,expire,text='',records=[];const data={};
  const notify=record=>{records.push(record);queueMicrotask(()=>{if(listener&&records.length){const batch=records;records=[];listener(batch);}});};
  const status={dataset:new Proxy(data,{set(target,key,value){const oldValue=target[key]??null;target[key]=value;notify({type:'attributes',attributeName:'data-'+key,oldValue});return true;},deleteProperty(target,key){const oldValue=target[key]??null;delete target[key];notify({type:'attributes',attributeName:'data-'+key,oldValue});return true;}}),get textContent(){return text;},set textContent(value){text=value;notify({type:'childList'});}};
  const button={disabled:false,click(){button.action?.();}};
  const context=vm.createContext({MutationObserver:class{constructor(callback){this.callback=callback;}observe(){listener=this.callback;}disconnect(){listener=null;}},setTimeout:callback=>{expire=callback;return 1;},clearTimeout:()=>{expire=null;}});
  const observe=vm.runInContext('('+observeImportLifecycle.toString()+')',context);
  return {status,button,run:()=>observe({button,status}),timeout:()=>expire(),get observing(){return Boolean(listener);}};
}
test('absence of busy is not completion; no-op click times out as not started',async()=>{
  const f=fixture();let settled=false;const pending=f.run().then(value=>{settled=true;return value;});await Promise.resolve();assert(!settled);
  f.timeout();const r=await pending;assert.equal(r.state,'timed-out');assert.equal(r.started,false);assert.equal(r.reason,'import-not-started');assert(!f.observing);
});
test('delayed start remains pending until an observed busy cycle completes',async()=>{
  const f=fixture();let settled=false;const pending=f.run().then(value=>{settled=true;return value;});await Promise.resolve();assert(!settled);
  f.status.dataset.busy='true';await Promise.resolve();assert(!settled);f.status.textContent='Full import completed\n\nChecked 1 purchase. Imported 47 new items.\n\n47 items in your library.';delete f.status.dataset.busy;
  const r=await pending;assert.equal(r.state,'succeeded');assert(r.started);assert.equal(r.message,'Full import completed\n\nChecked 1 purchase. Imported 47 new items.\n\n47 items in your library.');assert(!f.observing);
});
test('a synchronous start and completion in one observer batch is retained',async()=>{
  const f=fixture();f.button.action=()=>{f.status.dataset.busy='true';f.status.textContent='Full import completed\n\nChecked 1 purchase. Imported 47 new items.\n\n47 items in your library.';delete f.status.dataset.busy;};
  const r=await f.run();assert.equal(r.state,'succeeded');assert(r.started);
});
for(const message of ['Fanatical import failed: sign in','GL could not confirm that these purchases were saved'])test('completed failure remains a failure: '+message,async()=>{
  const f=fixture();f.button.action=()=>{f.status.dataset.busy='true';f.status.textContent=message;delete f.status.dataset.busy;};assert.equal((await f.run()).state,'failed');
});
test('a started scan that never finishes times out separately',async()=>{
  const f=fixture();f.button.action=()=>{f.status.dataset.busy='true';};const pending=f.run();await Promise.resolve();f.timeout();const r=await pending;
  assert.equal(r.state,'timed-out');assert(r.started);assert.equal(r.reason,'completion-not-observed');assert(!f.observing);
});
test('disabled buttons and already-running imports cannot impersonate a new scan',async()=>{
  for(const busy of [false,true]){const f=fixture();if(busy)f.status.dataset.busy='true';else f.button.disabled=true;const r=await f.run();assert.equal(r.state,'not-started');assert.equal(r.started,false);assert(!f.observing);}
});
test('clearing busy without a terminal message cannot pass as success',async()=>{
  const f=fixture();f.button.action=()=>{f.status.dataset.busy='true';f.status.textContent='Loading purchases';delete f.status.dataset.busy;};
  const r=await f.run();assert.equal(r.state,'unconfirmed');assert(r.started);assert.equal(r.reason,'completion-message-missing');
});

for(const title of ['Full import','Quick update'])test('partial completion has its own lifecycle state: '+title,async()=>{
  const f=fixture();f.button.action=()=>{f.status.dataset.busy='true';f.status.textContent=title+" partially completed\n\nCouldn't check 1 purchase. It will be retried on your next update.\n\nSaved 2 purchases. Your library now contains 47 items. Earlier records were preserved.";delete f.status.dataset.busy;};
  const r=await f.run();assert.equal(r.state,'partial');assert(r.started);
});
test('a success heading without counts is not a verified completion',async()=>{
  const f=fixture();f.button.action=()=>{f.status.dataset.busy='true';f.status.textContent='Full import completed';delete f.status.dataset.busy;};assert.equal((await f.run()).state,'unconfirmed');
});
