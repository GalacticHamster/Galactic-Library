import '../src/providers/floating-panel.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
const originalFetch=globalThis.fetch.bind(globalThis),originalAttach=Element.prototype.attachShadow;
const code=await Promise.all(['provider-snapshot','steam-store','steam-store-content'].map(async name=>(await originalFetch('/src/providers/'+name+'.js')).text()));
const ids=Array.from({length:161},(_,i)=>i+1),rows=new Map(ids.map(id=>[id,id===1?{appid:id,type:0,name:'Synthetic base game'}:id===2?{appid:id,type:4,name:'Synthetic DLC',related_items:{parent_appid:1}}:id<=145?{item_type:0,id,appid:0,success:15,visible:false,name:''}:{appid:id,type:6,name:'Synthetic other application '+id}]));
let owned={rgOwnedApps:ids,rgMasterSubApps:[],rgAutoGrantApps:[]},shadow,mode='full',scan,imports=0;
const stored={},area={get:async defaults=>structuredClone({...defaults,...stored}),set:async patch=>Object.assign(stored,structuredClone(patch)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete stored[key];}};
let writer=createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true,observationCompletions:true});
globalThis.chrome={runtime:{getURL:path=>location.origin+'/'+path,sendMessage:async r=>r.type==='GET_PROVIDER_DIAGNOSTICS_SETTING'?{ok:true,enabled:false}:{ok:true,profileLabel:'Disposable',profiles:[],reuseAllowed:false}}};
globalThis.fetch=async url=>{
 if(String(url).startsWith('/dynamicstore'))return {ok:true,status:200,json:async()=>structuredClone(owned)};
 if(String(url).startsWith('https://api.steampowered.com/')){const requested=JSON.parse(new URL(url).searchParams.get('input_json')).ids.map(i=>i.appid);return {ok:true,status:200,json:async()=>({response:{store_items:requested.flatMap(id=>rows.has(id)?[rows.get(id)]:[])}})};}
 return originalFetch(url);
};
globalThis.GalacticSync={send:async request=>{
 if(request.type==='GET_PROVIDER_SYNC_STATE'){
  scan=await writer.beginProviderScan('steam','Disposable',mode,false,1);
  const db=await writer.getDatabase(),pending=new Set(db.providers.steam?.syncState?.applications?.issues.map(i=>i.appId));
  return {ok:true,hasFullBaseline:!scan.forceFull,syncState:{knownProviderItemIds:Object.values(db.providerItems).filter(i=>i.provider==='steam'&&!pending.has(i.providerItemId)).map(i=>i.providerItemId)}};
 }
 if(request.type==='IMPORT_PROVIDER_ITEMS'){
  imports++;const db=await writer.commitProviderScan('steam',request.items,{syncMode:request.mode,source:'steam-store-browse-items',[request.mode==='full'?'fullSyncAt':'quickSyncAt']:new Date().toISOString(),syncState:request.syncState,scanDiagnostics:request.scanDiagnostics},request.snapshot,scan.scanToken,1);
  return {ok:true,gameCount:db.providers.steam.itemCount,addOnCount:db.providers.steam.addOnCount,linkedAddOnCount:db.providers.steam.linkedAddOnCount,changes:db.providers.steam.syncHealth.differences};
 }
 throw Error('Unexpected source request');
},failed:async()=>{}};
Element.prototype.attachShadow=function(options){shadow=originalAttach.call(this,options);return shadow;};
const mount=()=>{document.querySelector('#galactic-library-steam-store-importer')?.remove();(0,eval)(code[2]);};
async function sync(nextMode){mode=nextMode;shadow.querySelector('[data-mode="'+mode+'"]').click();for(let i=0;i<1000&&shadow.querySelector('.status').dataset.busy;i++)await new Promise(resolve=>setTimeout(resolve,10));assert(!shadow.querySelector('.status').dataset.busy,'Steam '+mode+' completes without a stalled panel');}
try{
 (0,eval)(code[0]);(0,eval)(code[1]);mount();
 assert(!shadow.querySelector('[data-import-help]').hidden,'Ordinary Steam import help remains visible while diagnostics are disabled');
 assert(shadow.querySelector('[data-provider-diagnostic]').hidden,'Developer diagnostics are absent from the ordinary Steam panel');
 await sync('full');let db=await writer.getDatabase();const first=Object.values(db.providerItems).find(i=>i.providerItemId==='1'),originalRef=first.recordRef;
 assert(Object.keys(db.providerItems).length===2&&db.providers.steam.syncState.applications.appIds.length===161&&db.providers.steam.syncState.applications.issues.length===159,'Full UI saves readable game/DLC plus all 143 unavailable and 16 other application identities separately');
 assert(shadow.querySelector('.status').textContent.includes('Steam import complete')&&shadow.querySelector('.status').textContent.includes('143 applications still need title or type information')&&!/App IDs|parser|HTTP|incomplete/u.test(shadow.querySelector('.status').textContent),'Normal completion explains unidentified metadata without claiming the owned enumeration failed');
 await sync('full');await sync('incremental');db=await writer.getDatabase();
 assert(Object.keys(db.providerItems).length===2&&db.providerItems[first.id].recordRef===originalRef&&Object.keys(db.providerHistory).length===0,'Repeated Full and Quick scans preserve source identities without duplicate acquisitions');
 rows.set(3,{appid:3,type:0,name:'Recovered synthetic title'});await sync('incremental');db=await writer.getDatabase();const recovered=Object.values(db.providerItems).find(i=>i.providerItemId==='3');
 assert(recovered?.ownership==='owned'&&recovered.acquiredAt===null&&db.providers.steam.syncState.applications.issues.length===158,'Quick UI enriches an earlier unidentified App ID once without inventing an acquisition date');
 ids.push(162);rows.set(162,{appid:162,type:0,name:'New synthetic title'});await sync('incremental');await sync('incremental');db=await writer.getDatabase();
 assert(Object.keys(db.providerItems).length===4&&Object.keys(db.providerHistory).length===0&&db.providerItems[recovered.id].recordRef===recovered.recordRef,'A newly acquired application is added once and recovered sources retain their identity');
 ids.push(163);rows.set(163,{item_type:0,id:163,appid:0,success:15,visible:false,name:''});await sync('incremental');db=await writer.getDatabase();
 assert(Object.keys(db.providerItems).length===4&&db.providers.steam.syncState.applications.appIds.includes('163')&&db.providers.steam.syncState.applications.issues.some(i=>i.appId==='163'),'A Quick update with no readable additions durably saves newly indexed unresolved evidence');
 owned.rgMasterSubApps=[1];await sync('incremental');db=await writer.getDatabase();
 assert(db.providerItems[first.id].ownership==='subscription'&&db.providerItems[first.id].recordRef===originalRef,'Quick access-only evidence updates an existing source without misclassifying subscription access as permanent ownership');
 const before=JSON.stringify(db.providerItems),commits=imports;owned.complete=false;await sync('full');
 assert(imports===commits&&JSON.stringify((await writer.getDatabase()).providerItems)===before&&shadow.querySelector('.status').textContent.includes('Steam import failed'),'An explicitly incomplete owned list fails before saving and preserves the existing library');delete owned.complete;
 await writer.restoreDatabase(parseBackup(createBackup(db)));writer=createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true,observationCompletions:true});
 assert(Object.keys((await writer.getDatabase()).providerItems).length===4&&(await writer.getDatabase()).providers.steam.syncState.applications.appIds.length===163,'Account-scoped ID evidence and named records survive actual writer restart and backup restore');
 history.replaceState({},'',location.pathname+'?gl-steam-diagnostics=1');mount();await new Promise(resolve=>setTimeout(resolve,0));
 assert(!shadow.querySelector('[data-provider-diagnostic]').hidden&&shadow.querySelector('[data-profile-next]')&&shadow.querySelector('[data-sample-ids]'),'Explicit troubleshooting mode retains timing and private App-ID sampling controls without DevTools');
 await originalFetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await originalFetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
finally{globalThis.fetch=originalFetch;Element.prototype.attachShadow=originalAttach;}
