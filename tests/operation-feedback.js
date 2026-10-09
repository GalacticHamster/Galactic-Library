import assert from 'node:assert/strict';
import {createOperation,performAction,afterFeedbackPaint} from '../src/ui/operation-feedback.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const control=()=>({disabled:false,setAttribute(){},removeAttribute(){}});
export const operationFeedbackTests=[
 ['Operation acknowledges and guards same-task duplicate work before the paint boundary',async()=>{
  const frame=deferred(),button=control(),status={textContent:''},states=[];let calls=0;
  const op=createOperation({id:'export',name:'Preparing export...',status,controls:[button],paint:()=>frame.promise,changed:value=>states.push(value.state)});
  const first=op.run(()=>{calls++;return 42;},{success:'Download handed to browser.'}),second=op.run(()=>{calls++;});
  assert.equal(first,second);assert.equal(button.disabled,true);assert.equal(status.textContent,'Preparing export...');assert.equal(calls,0);
  frame.resolve();assert.equal(await first,42);assert.equal(calls,1);assert.equal(button.disabled,false);assert.deepEqual(states,['starting','running','succeeded']);
 }],
 ['Operation phase/count feedback is truthful and failures remain visible with retry enabled',async()=>{
  const button=control(),status={textContent:''},op=createOperation({id:'restore',name:'Restoring...',status,controls:[button],paint:async()=>{}});
  await assert.rejects(op.run(async context=>{await context.phase('Writing library...');context.update('2 records',{completed:2,total:3});throw Error('Storage write failed');}),/Storage write failed/);
  assert.equal(op.state.state,'failed');assert.equal(status.textContent,'Storage write failed');assert.equal(button.disabled,false);
  await op.run(()=>true,{success:'Restored.'});assert.equal(op.state.state,'succeeded');assert.equal(status.textContent,'Restored.');
  await assert.rejects(op.run(context=>context.update('Invalid',{completed:9,total:2})),/Invalid operation progress/);
 }],
 ['Scoped form actions guard different controls sharing status and restore prior disabled controls',async()=>{
  const hold=deferred(),a=control(),b=control(),status={textContent:''};let calls=0;
  const first=performAction({button:a,status,task:()=>{calls++;return hold.promise;},paint:async()=>{}});
  const second=performAction({button:b,status,task:()=>calls++,paint:async()=>{}});await Promise.resolve();assert.equal(calls,1);hold.resolve();await Promise.all([first,second]);assert.equal(a.disabled,false);
  b.disabled=true;const op=createOperation({id:'test',name:'Test',controls:[b],paint:async()=>{}});await op.run(()=>{});assert.equal(b.disabled,true);
 }],
 ['Feedback scheduling uses frame opportunities instead of a sleep',async()=>{
  const previous=globalThis.requestAnimationFrame,frames=[];globalThis.requestAnimationFrame=callback=>frames.push(callback);
  try{let painted=false;const pending=afterFeedbackPaint().then(()=>painted=true);assert.equal(frames.length,1);frames.shift()();assert.equal(painted,false);frames.shift()();await pending;assert.equal(painted,true);}finally{globalThis.requestAnimationFrame=previous;}
 }]
];
