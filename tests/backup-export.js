import assert from 'node:assert/strict';
import {createBackupExporter,handoffDownload} from '../src/ui/backup-export.js';
const ui=()=>({button:{textContent:'Export Library',disabled:false},status:{textContent:''}});
export const backupExportTests=[
 ['Backup export acknowledges before slow read and prevents same-task duplicate downloads',async()=>{
  const controls=ui();let release,calls=0,downloads=0;
  const exporter=createBackupExporter({...controls,paint:async()=>{},read:()=>{calls++;return new Promise(resolve=>release=resolve);},prepare:value=>value,download:async()=>downloads++});
  const first=exporter.run(),second=exporter.run();assert.equal(first,second);assert.equal(controls.button.disabled,true);assert.equal(controls.button.textContent,'Preparing export...');assert.equal(calls,0);
  await Promise.resolve();release({records:[]});await first;assert.equal(calls,1);assert.equal(downloads,1);assert.equal(controls.button.textContent,'Export Library');assert.equal(controls.button.disabled,false);assert.match(controls.status.textContent,/handed to your browser/);
 }],
 ['Backup validation, serialization and download failures recover without false success',async()=>{
  for(const stage of ['read','prepare','serialize','download']){
    const controls=ui();let fail=true;
    const options={...controls,paint:async()=>{},read:async()=>({items:[]}),prepare:value=>value,serialize:JSON.stringify,download:async()=>{}};
    const original=options[stage];options[stage]=(...args)=>{if(fail)throw Error('Synthetic '+stage+' failure');return original(...args);};
    const exporter=createBackupExporter(options);await assert.rejects(exporter.run(),/Synthetic/);assert.equal(controls.button.disabled,false);assert.match(controls.status.textContent,/failure/);assert.ok(!controls.status.textContent.includes('handed'));
    fail=false;await exporter.run();assert.match(controls.status.textContent,/handed/);
  }
 }],
 ['Backup synchronous preparation and serialization wait for visible phase opportunities',async()=>{
  const controls=ui(),events=[];
  const exporter=createBackupExporter({...controls,paint:async()=>events.push(controls.status.textContent),read:async()=>({}),prepare:value=>{assert.equal(events.at(-1),'Validating backup for export...');return value;},serialize:value=>{assert.equal(events.at(-1),'Preparing backup file...');return JSON.stringify(value);},download:async(blob,name)=>{assert.equal(name,'galactic-library-backup-v1.json');assert.equal(await blob.text(),'{}');assert.equal(events.at(-1),'Handing backup download to your browser...');}});
  await exporter.run();assert.equal(events[0],'Preparing export...');
 }],
 ['Browser handoff cleanup runs even if clicking the download fails',()=>{
  const oldDocument=globalThis.document,oldURL=globalThis.URL;let removed=false,revoked=false;
  globalThis.document={body:{append(){}},createElement:()=>({click(){throw Error('Download blocked');},remove(){removed=true;}})};
  globalThis.URL={createObjectURL:()=> 'blob:synthetic',revokeObjectURL:()=>revoked=true};
  try{assert.throws(()=>handoffDownload(new Blob(['test']),'test.json'),/Download blocked/);assert.ok(removed&&revoked);}finally{globalThis.document=oldDocument;globalThis.URL=oldURL;}
 }]
];
