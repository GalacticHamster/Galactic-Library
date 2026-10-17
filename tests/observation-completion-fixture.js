import {createStorageWriter} from '../src/background/storage-writer.js';
import {providerSyncLibrary,providerSyncValue,providerSyncSnapshot,consoleProvider,fingerprint} from './provider-sync-fixture.js';

export function completionWriter(database,{enabled=true,stored=null,beforeSet=()=>{},afterSet=()=>{},beforeRemove=()=>{},certificateArea=null}={}){
 const state=stored??{galacticLibraryDatabase:structuredClone(database)},counts={databaseWrites:0,receiptWrites:0,journalWrites:0},stages=[];
 const area={get:async defaults=>{const keys=defaults===null?Object.keys(state):typeof defaults==='string'?[defaults]:Array.isArray(defaults)?defaults:Object.keys(defaults);const result=defaults&&typeof defaults==='object'&&!Array.isArray(defaults)?{...defaults}:{};for(const k of keys)if(Object.hasOwn(state,k))result[k]=structuredClone(state[k]);return result;},set:async updates=>{await beforeSet(updates);if(updates.galacticLibraryDatabase)counts.databaseWrites++;if(updates.galacticLibraryObservations?.kind==='active'&&updates.galacticLibraryObservations.packet)counts.receiptWrites++;if(updates.galacticLibraryObservations?.kind==='saving')counts.journalWrites++;Object.assign(state,structuredClone(updates));await afterSet(updates);},remove:async keys=>{await beforeRemove(keys);for(const k of [keys].flat())delete state[k];}};
 const writer=createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true,observationCompletions:enabled,certificateArea});
 const execute=(name,args)=>writer.execute(name,args,{begin:stage=>{stages.push(stage);return ()=>{};}});
 return {writer,execute,area,stored:state,counts,stages};
}
export async function completionBaseline(provider,values=[providerSyncValue(provider)]){
 const h=completionWriter(providerSyncLibrary(provider,values),{enabled:false});
 const scan=await h.writer.beginProviderScan(provider,'Personal','full',false,1,null,false,consoleProvider(provider)?fingerprint:null);
 await h.writer.commitProviderScan(provider,values,{syncMode:'full'},providerSyncSnapshot(provider,values),scan.scanToken,1,false,consoleProvider(provider)?fingerprint:null);
 return h.writer.getDatabase();
}
export async function admitCompletion(h,provider,mode='full',tab=1){return h.writer.beginProviderScan(provider,'Personal',mode,false,tab,null,false,consoleProvider(provider)?fingerprint:null);}
export async function finishCompletion(h,provider,scan,values,mode='full',details={}){return h.execute('commitProviderScan',[provider,values,{syncMode:mode,...details},mode==='full'||consoleProvider(provider)?providerSyncSnapshot(provider,values):null,scan.scanToken,1,false,consoleProvider(provider)?fingerprint:null]);}
