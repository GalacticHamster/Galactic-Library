// Offline synthetic control only: no backup inputs, browser profile or network.
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {operationLibrary} from '../tests/fixtures/operation-library.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
import {outputPath} from './audit-artifacts.mjs';

const size=Number(process.argv.find(arg=>arg.startsWith('--size='))?.slice(7)??14000);
if(!Number.isSafeInteger(size)||size<0||size>14000)throw Error('Choose a synthetic size between 0 and 14000.');
const database=await operationLibrary(size),memory={[DATABASE_STORAGE_KEY]:structuredClone(database)};
const writer=createStorageWriter({
  get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,Object.hasOwn(memory,key)?memory[key]:value]))),
  set:async updates=>Object.assign(memory,structuredClone(updates)),
  remove:async keys=>{for(const key of keys)delete memory[key];}
});
const stages=[],writerStages=[];
const timed=async(name,work)=>{const start=performance.now();try{return await work();}finally{stages.push({name,ms:performance.now()-start});}};
const trace=phase=>({begin(name){const start=performance.now();return ()=>writerStages.push({phase,name,ms:performance.now()-start});}});
const snapshot=await timed('export_authoritative_read',()=>writer.execute('getDatabase',[],trace('export')));
const backup=await timed('export_full_validation',()=>createBackup(snapshot));
const text=await timed('export_serialization',()=>JSON.stringify(backup,null,2));
const blob=await timed('export_blob_creation',()=>new Blob([text],{type:'application/json'}));
const fileText=await timed('import_blob_text',()=>blob.text());
const parsed=await timed('import_json_parse',()=>JSON.parse(fileText));
const candidate=await timed('import_full_validation',()=>parseBackup(parsed));
const before=await timed('confirmation_read_and_serialize',async()=>JSON.stringify(await writer.execute('getDatabase')));
const now=await timed('stale_check_read_and_serialize',async()=>JSON.stringify(await writer.execute('getDatabase')));
if(now!==before)throw Error('Synthetic confirmation snapshot unexpectedly changed.');
await timed('restore_writer_commit',()=>writer.execute('restoreDatabase',[candidate],trace('restore')));
const restored=await timed('reload_committed_view',()=>writer.execute('getCommittedLibraryView'));
if(!isDeepStrictEqual(memory[DATABASE_STORAGE_KEY],database)||!isDeepStrictEqual(restored.database,database))throw Error('Synthetic round trip changed protected library data.');
const report={size,providerRecords:Object.keys(database.providerItems).length,canonicalRecords:Object.keys(database.canonicalItems).length,compactBytes:new Blob([JSON.stringify(database)]).size,backupBytes:blob.size,stages,writerStages,unchanged:true,measurement:'Single Node synthetic run, real validator/writer, clone-only mock storage. No native storage/extension transport, user decision time, browser paint or download latency. Nested writer stages overlap; do not sum them with their parent.'};
const path=await outputPath(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)??'audit-artifacts/operation-feedback/operation-paths-14000.json');
await writeFile(path,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({path,backupBytes:blob.size,stages,unchanged:true},null,2));
