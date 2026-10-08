import assert from 'node:assert/strict';
import {createDraftGuard} from '../src/ui/draft-guard.js';
export const draftGuardTests=[
 ['UI drafts require deliberate discard, retain failures, reject stale saves and clear only the successful form',async()=>{
  const listeners={},root={addEventListener:(event,fn)=>{listeners[event]=fn;}},save={textContent:'Save reading state',disabled:false};
  const a={querySelectorAll:()=>[save]},b={querySelectorAll:()=>[]};let revision='one',allowed=false,operations=0;
  const guard=createDraftGuard({root,stamp:()=>revision,confirmDiscard:()=>allowed});
  const event=scope=>({target:{closest:selector=>selector==='button'?null:scope}});
  listeners.input(event(a));listeners.change(event(b));assert(guard.dirty);assert.equal(guard.allowNavigation(),false);assert.equal(guard.reconcile().stale,false);
  listeners.click(event(a));await assert.rejects(guard.commit(async()=>{throw Error('Failed save');}));assert(guard.dirty);
  await guard.commit(async()=>{operations++;});assert(guard.dirty,'Saving one form discarded another');
  revision='two';assert(guard.reconcile().stale);listeners.click(event(b));await assert.rejects(guard.commit(async()=>operations++),/Saved information changed/u);assert.equal(operations,1);
  allowed=true;assert(guard.allowNavigation());assert.equal(guard.dirty,false);
 }]
];
