import assert from 'node:assert/strict';
import {bindBackupRestore} from '../src/ui/backup-restore.js';
import {readingSummary} from '../src/ui/reading-presentation.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(){
  let listener,pending,version=1;const writes=[],status={textContent:''},input={files:[],value:'',disabled:false,addEventListener:(name,fn)=>{listener=fn;}};
  const controller=bindBackupRestore({input,status,parse:value=>{if(!value.valid)throw Error('Invalid backup');return value;},read:async()=>({version}),restore:async value=>writes.push(value),refresh:async()=>{},prompt:()=>{let finish;const result=new Promise(resolve=>finish=resolve);pending={result,cancel:()=>finish(false),answer:finish};return pending;}});
  return {input,status,writes,controller,change(value={valid:true}){input.files=[{text:async()=>JSON.stringify(value)}];return listener();},answer:accepted=>pending.answer(accepted),changeDatabase(){version++;},changeFile(file){input.files=[file];return listener();},get pending(){return pending;}};
}
export const uxSafetyTests=[
 ['backup choice validates before confirmation; cancellation never writes',async()=>{const f=fixture(),run=f.change();await tick();assert(f.pending);assert.equal(f.writes.length,0);f.answer(false);await run;assert.equal(f.writes.length,0);assert.match(f.status.textContent,/cancelled/);}],
 ['invalid backup never prompts or replaces the database',async()=>{const f=fixture();await f.change({valid:false});assert.equal(f.pending,undefined);assert.equal(f.writes.length,0);assert.match(f.status.textContent,/Invalid backup/);}],
 ['accepted unchanged backup invokes the existing writer once',async()=>{const f=fixture(),run=f.change();await tick();f.answer(true);await run;assert.equal(f.writes.length,1);assert.equal(f.status.textContent,'Backup restored.');}],
 ['library changes while confirmation is open reject a stale restore',async()=>{const f=fixture(),run=f.change();await tick();f.changeDatabase();f.answer(true);await run;assert.equal(f.writes.length,0);assert.match(f.status.textContent,/changed/);}],
 ['observed library changes cancel the open restore decision',async()=>{const f=fixture(),run=f.change();await tick();f.controller.changed();await run;assert.equal(f.writes.length,0);assert.match(f.status.textContent,/changed/);}],
 ['selecting another backup cancels the earlier confirmation',async()=>{const f=fixture(),first=f.change();await tick();const old=f.pending,second=f.change({valid:true,selected:2});await tick();old.answer(true);await first;assert.equal(f.writes.length,0);f.answer(true);await second;assert.equal(f.writes.length,1);assert.equal(f.writes[0].selected,2);}],
 ['delayed obsolete file parsing cannot replace a newer choice',async()=>{const f=fixture();let resolve;const delayed=new Promise(r=>resolve=r),first=f.changeFile({text:()=>delayed});const second=f.change({valid:true,selected:2});await tick();f.answer(true);await second;resolve(JSON.stringify({valid:true,selected:1}));await first;assert.equal(f.writes.length,1);assert.equal(f.writes[0].selected,2);}],
 ['reading presentation separates no saved state from explicitly unread without changing data',()=>{const item={recordRef:'test',ownership:'owned',metadata:{}},db={readingStates:{},ownershipReviews:{},ownershipPolicy:{allOwned:false,providers:{}}},before=JSON.stringify(db);assert.match(readingSummary(item,db),/Reading status not saved/);assert.equal(JSON.stringify(db),before);db.readingStates.test={status:'unread',progress:0};assert.match(readingSummary(item,db),/Unread \(0%\)/);}],

];
