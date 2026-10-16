import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createQueryDiagnostics} from '../src/lib/query-diagnostics.js';
import {snapshotFixture} from './storage.js';

export function syntheticProviderLibrary(size){
  const db=createEmptyDatabase(),profiles={};
  for(const provider of ['steam','gog','epic','kindle']){
    profiles[provider]=[0,1].map(index=>newProviderProfile(provider,index?'Other':'Personal'));
    for(const profile of profiles[provider]){
      profile.state={connected:true,fullSyncAt:'2026-01-01',lastSync:'2026-01-01',syncHealth:{status:'succeeded',mode:'full',retryable:false}};
      db.providerProfiles[profile.profileId]=profile;
    }
    db.providers[provider]={...profiles[provider][0].state,activeProfileId:profiles[provider][0].profileId};
  }
  for(let index=0;index<size;index++){
    const provider=['steam','gog','epic','kindle'][index%4],profile=profiles[provider][Math.floor(index/4)%5===4?1:0];
    const addon=provider!=='kindle'&&index%13===0;
    const record=normalizeProviderItem({provider,profileId:profile.profileId,providerItemId:String(index+1),
      title:'Synthetic '+(provider==='kindle'?'Collection ':'Game ')+Math.floor(index/4),mediaType:provider==='kindle'?'book':addon?'game-addon':'game',
      ownership:index%11===0?'subscription':index%7===0?'unknown':'owned',
      metadata:{...(addon?{parentProviderItemId:String(Math.max(1,index-3))}:{}),...(provider==='kindle'?{authors:['Synthetic Author'],collects:'Collects Synthetic Comic (2000) #1-8.'}:{})}
    },'2026-01-01');
    db.providerItems[record.id]=record;
    if(index%101===0)db.ownershipReviews[record.recordRef]={reviewRef:crypto.randomUUID(),ownership:'owned',source:'user-correction',note:'Synthetic correction',confirmedAt:'2026-01-01'};
  }
  return validateDatabase(db);
}

export function performanceWriter(database,{cache=true,stored:existing=null,beforeGet=()=>{},beforeSet=()=>{},afterSet=()=>{},beforeRemove=()=>{},writerFactory=createStorageWriter}={}){
  const stored=existing??{galacticLibraryDatabase:structuredClone(database)},counts={databaseReads:0,databaseWrites:0,bytesWritten:0,metadataWrites:0,metadataBytes:0},journal=createQueryDiagnostics({limit:192});
  const area={
    async get(defaults){await beforeGet(defaults);if(Object.hasOwn(defaults,'galacticLibraryDatabase'))counts.databaseReads++;return structuredClone(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,Object.hasOwn(stored,key)?stored[key]:value])));},
    async set(updates){await beforeSet(updates);if(updates.galacticLibraryDatabase){counts.databaseWrites++;counts.bytesWritten+=Buffer.byteLength(JSON.stringify(updates.galacticLibraryDatabase));}else{counts.metadataWrites++;counts.metadataBytes+=Buffer.byteLength(JSON.stringify(updates));}Object.assign(stored,structuredClone(updates));await afterSet(updates);},
    async remove(keys){await beforeRemove(keys);counts.metadataWrites++;for(const key of [keys].flat())delete stored[key];}
  };
  const writer=writerFactory(area,Promise.resolve(),{cacheQuerySnapshots:cache,diagnostics:journal});
  return {writer,stored,counts,journal};
}

export async function measuredScan(harness,{mode='incremental',items=[],fail=false,provider='steam',scanDiagnostics}={}){
  const before={...harness.counts},clock=()=>performance.now(),at=clock(),events=[];
  const timing={begin(stage){const start=clock();return ()=>events.push({stage,durationMs:clock()-start});}};
  const lease=await harness.writer.execute('beginProviderScan',[provider,'Personal',mode,false,1],timing),prepared=clock();
  if(fail)await harness.writer.execute('failProviderScan',[provider,lease.scanToken,1,{code:'network'}],timing);
  else await harness.writer.execute('commitProviderScan',[provider,items,{syncMode:mode,...(mode==='full'?{fullSyncAt:'2026-10-16'}:{quickSyncAt:'2026-10-16'}),...(scanDiagnostics?{scanDiagnostics}:{})},mode==='full'?snapshotFixture(provider,items):undefined,lease.scanToken,1,true],timing);
  const done=clock();
  return {preMs:prepared-at,scanMs:0,postMs:done-prepared,totalMs:done-at,
    counts:{...Object.fromEntries(Object.keys(before).map(key=>[key,harness.counts[key]-before[key]])),validationPasses:events.filter(event=>['read_validation','persist_validation'].includes(event.stage)).length},
    phases:events.reduce((totals,event)=>({...totals,[event.stage]:(totals[event.stage]??0)+event.durationMs}),{})};
}
