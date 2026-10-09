import assert from 'node:assert/strict';
import {bindBackupRestore} from '../src/ui/backup-restore.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createEmptyDatabase} from '../src/lib/models.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {recoveryFixture} from './genre-recovery.js';
import {createGenreRecoveryCandidate,stable} from '../scripts/genre-recovery.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(overrides={}){
 let change,answer;const events=[],input={files:[],disabled:false,value:'',addEventListener:(name,callback)=>change=callback},clear={disabled:false},status={textContent:''};let writes=0;
 const controller=bindBackupRestore({input,status,criticalControls:[clear],paint:async()=>events.push(status.textContent),parse:value=>value,read:async()=>({unchanged:true}),restore:async()=>writes++,refresh:async()=>{},prompt:()=>({result:new Promise(resolve=>answer=resolve),cancel:()=>answer(false)}),...overrides});
 return {input,clear,status,controller,events,change,answer:value=>answer(value),get writes(){return writes;},choose(text=async()=>'{"valid":true}'){input.files=[{text}];return change();}};
}
export const backupRestoreFeedbackTests=[
 ['Restore reads/parses only after acknowledgement, never commits selection and guards duplicate events',async()=>{
  let release;const f=fixture(),run=f.choose(()=>new Promise(resolve=>release=resolve));assert.equal(f.status.textContent,'Reading backup...');assert.equal(f.input.disabled,true);assert.equal(f.clear.disabled,true);
  assert.equal(f.change(),run);await tick();assert.equal(f.writes,0);release('{"valid":true}');await tick();assert.match(f.status.textContent,/Confirm/);assert.equal(f.writes,0);
  f.answer(true);await run;assert.equal(f.writes,1);assert.equal(f.status.textContent,'Backup restored.');assert.equal(f.input.disabled,false);assert.equal(f.clear.disabled,false);
  assert.ok(f.events.includes('Validating backup...')&&f.events.includes('Reloading restored library...'));
 }],
 ['Restore distinguishes read, validation, persistence and committed-view reload failures and enables retry',async()=>{
  for(const stage of ['read','parse','restore','refresh']){
   const config={};if(stage==='parse')config.parse=()=>{throw Error('Invalid schema');};if(stage==='restore')config.restore=async()=>{throw Error('Write rejected');};if(stage==='refresh')config.refresh=async()=>{throw Error('Worker restarted');};
   const f=fixture(config),run=f.choose(stage==='read'?async()=>{throw Error('File unreadable');}:undefined);await tick();if(stage==='restore'||stage==='refresh')f.answer(true);await run;
   assert.equal(f.input.disabled,false);assert.equal(f.clear.disabled,false);assert.match(f.status.textContent,stage==='refresh'?/was restored.*do not repeat/:stage==='restore'?/Restore did not complete/:stage==='parse'?/validation failed/:/read backup/);
  }
 }],
 ['Actual writer rejects duplicate cross-page replacement requests until success or failure settles',async()=>{
  const values={};let release,hold=true;const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>{if(hold)await new Promise(resolve=>release=resolve);Object.assign(values,structuredClone(updates));},remove:async()=>{}});
  const first=writer.restoreDatabase(createEmptyDatabase());await assert.rejects(writer.restoreDatabase(createEmptyDatabase()),/already in progress/);await assert.rejects(writer.clearDatabase(),/already in progress/);await tick();hold=false;release();await first;await writer.restoreDatabase(createEmptyDatabase());
  await assert.rejects(writer.restoreDatabase({invalid:true}));await writer.restoreDatabase(createEmptyDatabase());
 }],
 ['Synthetic recovery candidate restores through actual parser/writer without persisting manifest or losing protected data',async()=>{
  const {old,current}=await recoveryFixture(),{candidate}=createGenreRecoveryCandidate(old,current),memory={};
  const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...memory}),set:async updates=>Object.assign(memory,structuredClone(updates)),remove:async keys=>{for(const key of keys)delete memory[key];}});
  const parsed=parseBackup(candidate);await writer.restoreDatabase(parsed);assert.equal(stable(await writer.getDatabase()),stable(parsed));assert.ok(!Object.hasOwn(memory.galacticLibraryDatabase,'recoveryManifest'));assert.ok(!Object.hasOwn(createBackup(parsed),'recoveryManifest'));
 }]
];
