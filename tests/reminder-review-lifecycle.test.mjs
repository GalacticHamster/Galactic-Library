import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {observeReminderReview} from './reminder-review-lifecycle.mjs';
function fixture(){
 let callback,expire,text='',rows=10;const notify=()=>queueMicrotask(()=>callback?.());
 const status={get textContent(){return text;},set textContent(value){text=value;notify();}},list={get children(){return Array(rows);}},button={disabled:false,click(){button.action?.();}};
 const context=vm.createContext({MutationObserver:class{constructor(fn){callback=fn;}observe(){}disconnect(){callback=null;}},setTimeout:fn=>{expire=fn;return 1;},clearTimeout(){expire=null;}});
 const observe=vm.runInContext('('+observeReminderReview.toString()+')',context);
 return {button,status,list,setRows:n=>{rows=n;notify();},run:()=>observe({button,status,list,expectedBefore:10,expectedAfter:9}),timeout:()=>expire()};
}
const saved='Reminder review saved. Purchases and keys are unchanged.';
test('row-count transition cannot complete before the explicit save acknowledgment',async()=>{
 const f=fixture();f.button.action=()=>f.setRows(9);let done=false;const promise=f.run().then(r=>{done=true;return r;});await Promise.resolve();await Promise.resolve();assert(!done);f.status.textContent=saved;assert.equal((await promise).state,'saved');
});
test('stale nine-row display and disabled controls cannot impersonate a new save',async()=>{
 for(const disabled of [true,false]){const f=fixture();let clicked=false;f.button.action=()=>{clicked=true;};if(disabled)f.button.disabled=true;else f.setRows(9);assert.equal((await f.run()).state,'not-started');assert(!clicked);}
});
test('a prior successful acknowledgment cannot satisfy a no-op click',async()=>{
 const f=fixture();f.status.textContent=saved;const pending=f.run();await Promise.resolve();assert.equal(f.status.textContent,'');f.timeout();assert.equal((await pending).state,'timed-out');
});
test('save rejection remains failure even after an optimistic nine-row refresh',async()=>{
 const f=fixture();f.button.action=()=>{f.setRows(9);f.status.textContent='This reminder changed. Refresh before reviewing.';};assert.equal((await f.run()).state,'failed');
});
test('acknowledgment with the wrong row count cannot pass',async()=>{
 const f=fixture();f.button.action=()=>{f.status.textContent=saved;};const pending=f.run();await Promise.resolve();f.timeout();assert.equal((await pending).state,'timed-out');
});
