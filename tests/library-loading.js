import assert from 'node:assert/strict';
import {createLibraryLoader} from '../src/ui/library-loading.js';
export const libraryLoadingTests=[
 ['Library load is visible before delayed dispatch, coalesces retries and retains navigation result',async()=>{
  let frame,complete,calls=0;const panel={hidden:true},message={textContent:''},retry={hidden:false,disabled:false};
  const loader=createLibraryLoader({panel,message,retry,paint:()=>new Promise(resolve=>frame=resolve),load:()=>{calls++;return new Promise(resolve=>complete=resolve);}});
  const first=loader.refresh();assert.equal(panel.hidden,false);assert.match(message.textContent,/Loading/);assert.equal(retry.hidden,true);assert.equal(calls,0);
  const second=loader.refresh();frame();await Promise.resolve();assert.equal(calls,1);complete({records:12});assert.deepEqual(await first,{records:12});assert.deepEqual(await second,{records:12});assert.equal(panel.hidden,true);
 }],
 ['Library failure remains distinct from empty state and a retry succeeds',async()=>{
  const panel={},message={},retry={};let failing=true;
  const loader=createLibraryLoader({panel,message,retry,paint:async()=>{},load:()=>{if(failing)throw Error('Worker unavailable');return {records:0};}});
  await assert.rejects(loader.refresh(),/Worker unavailable/);assert.equal(panel.hidden,false);assert.equal(retry.hidden,false);assert.equal(retry.disabled,undefined);assert.match(message.textContent,/Could not load library/);
  failing=false;assert.deepEqual(await loader.refresh(),{records:0});assert.equal(panel.hidden,true);
 }]
];
