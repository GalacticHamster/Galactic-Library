import test from 'node:test';import assert from 'node:assert/strict';
import '../shared/purchase-snapshot.js';import '../shared/purchase-transfer.js';import '../shared/purchase-sync.js';
const S=GalacticPurchaseSnapshot,T=GalacticPurchaseTransfer,Y=GalacticPurchaseSync;
const row=(n,p='humble')=>({providerItemId:p==='humble'?'purchase_'+n+':product:native_'+n:'product_'+n,title:'Synthetic '+n,mediaType:'book',metadata:p==='humble'?{purchaseId:'purchase_'+n}:{},purchasedAt:null,origins:[]});
function fixture(provider='humble',initial={gl:[],companion:[]}){
 const nodes={},services={},calls=[],commits=[];const role=provider==='humble'?'hb':'fan';
 function start(id){const n=nodes[id]??={saved:{},records:structuredClone(initial[id]??[]),accountId:id+'-stable',label:'Personal',alarms:new Map(),online:true};n.coordinator?.dispose();
  const area={get:async defaults=>structuredClone({...defaults,...n.saved}),set:async patch=>{n.saved={...n.saved,...structuredClone(patch)};}},runtime={id,getURL:()=>id+':///',onMessage:{addListener(){}},onMessageExternal:{addListener(){}},onStartup:{addListener(){}},onInstalled:{addListener(){}},sendMessage:async(peer,m)=>{if(typeof peer!=='string')return {};calls.push({from:id,to:peer,type:m.type});if(!nodes[peer]?.online||!services[peer])throw Error('Companion unavailable');if(n.intercept)await n.intercept(peer,m);try{const result=await services[peer].external(m,{id});if(n.afterResponse)await n.afterResponse(m,result);return {ok:true,protocolVersion:1,...result};}catch(e){return {ok:false,protocolVersion:1,error:e.message};}}};
  const account=()=>({accountRef:id+'-'+n.records.length+'-'+JSON.stringify(n.records),label:n.label,active:true,stableId:n.accountId,count:n.records.length,historicalCount:n.historicalCount??0,unassigned:n.records.length===0&&!n.historicalCount&&!n.assigned});
  // Handoff references may change; stable IDs do not. Use bounded SHA refs like real companions.
  const catalog=async()=>[{...account(),accountRef:await S.hash(account().accountRef)},...(n.extraAccounts??[])];
  const snapshot=async(_,ref)=>{assert((await catalog()).some(a=>a.accountRef===ref));return S.validate({protocolVersion:1,provider,snapshotId:crypto.randomUUID(),accountRef:ref,accountLabel:n.label,capturedAt:new Date().toISOString(),scope:'historical',completeness:'partial',limitations:[],records:n.records});};
  services[id]=T.createService({runtime,area,authorize:async(peer,p)=>p===provider&&peer===(id==='gl'?'companion':'gl'),peer:async()=>n.peerOverride??(id==='gl'?'companion':'gl'),accounts:catalog,snapshot,preview:async data=>({added:data.records.filter(r=>!n.records.some(old=>old.providerItemId===r.providerItemId)).length,updated:0,skipped:0}),commit:async(data,target)=>{if(n.skipAll&&data.records.length)throw Error('No compatible records can be imported. Synthetic unsupported records.');assert.equal(target.accountRef,(await catalog())[0].accountRef);const merged=new Map(n.records.map(r=>[r.providerItemId,r]));let added=0,updated=0;for(const r of data.records){const old=merged.get(r.providerItemId),next=old?{...old,metadata:S.richer(old.metadata,r.metadata)}:r;if(!old)added++;else if(!S.equal(old,next))updated++;merged.set(r.providerItemId,next);}if(added||updated){n.records=[...merged.values()];commits.push({id,added,updated});}return {added,updated,unchanged:data.records.length-added-updated,skipped:0};}});
  n.coordinator=Y.createCoordinator({runtime,area,alarms:{create:async(name,value)=>n.alarms.set(name,value),clear:async name=>n.alarms.delete(name),onAlarm:{addListener(){}}},service:services[id],role:id==='gl'?'gl':role,catalog,busy:async()=>n.busy,coalesceMs:3600000});services[id].setSync(n.coordinator);return n;
 }
 start('gl');start('companion');
 async function connect(first='gl'){const second=first==='gl'?'companion':'gl',a=nodes[first],b=nodes[second];await a.coordinator.local({action:'syncConnect',provider,localId:a.accountId,remoteId:b.accountId,confirmed:true,sameAccount:true});assert.equal(b.saved[Y.KEY][provider].confirmed,true,'one local confirmation enables the verified peer');}
 async function drain(){for(let n=0;n<4;n++){await nodes.companion.coordinator.run(provider);await nodes.gl.coordinator.run(provider);await Promise.resolve();}return nodes.gl.saved[Y.KEY]?.[provider];}
const dispose=()=>Object.values(nodes).forEach(n=>n.coordinator.dispose());return {nodes,services,calls,commits,start,connect,drain,dispose,provider};
}
for(const provider of ['humble','fanatical']){
 for(const destination of ['history-only','previously-assigned'])test(provider+' single-account setup includes '+destination+' datasets without treating names as identity',async()=>{
  const f=fixture(provider,{gl:[],companion:[row(1,provider)]});try{
   if(destination==='history-only')f.nodes.gl.historicalCount=3;else f.nodes.gl.assigned=true;
   await f.nodes.gl.coordinator.discover(provider);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);assert.equal(f.nodes.gl.historicalCount,destination==='history-only'?3:undefined);
  }finally{f.dispose();}
 });
 test(provider+' a busy source defers first setup instead of binding an in-progress account',async()=>{
  const f=fixture(provider,{gl:[],companion:[row(1,provider)]});try{
   f.nodes.companion.busy=true;await f.nodes.gl.coordinator.discover(provider);assert.equal(f.commits.length,0);assert.equal(f.nodes.gl.saved[Y.KEY]?.[provider],undefined);
   f.nodes.companion.busy=false;await f.nodes.gl.coordinator.discover(provider,undefined,true);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);
  }finally{f.dispose();}
 });
 test(provider+' an incompatible sharing model cannot fall back to automatic account setup',async()=>{
  const f=fixture(provider,{gl:[],companion:[row(1,provider)]});try{
   f.nodes.gl.afterResponse=async(m,result)=>{if(m.type===Y.PREFIX+'DISCOVER')result.sharingModel=2;};
   await f.nodes.gl.coordinator.discover(provider);assert.equal(f.commits.length,0);assert.equal((await f.nodes.gl.coordinator.local({action:'syncState',provider})).availability,'incompatible');
  }finally{f.dispose();}
 });
 test(provider+' default-on discovery transfers saved purchases without injected pairing',async()=>{
  const f=fixture(provider,{gl:[],companion:[row(1,provider)]});try{
   assert.equal(f.nodes.gl.saved[Y.KEY],undefined);assert.equal(f.nodes.companion.saved[Y.KEY],undefined);
   await f.nodes.gl.coordinator.discover(provider);assert.equal((await f.drain()).status,'synced');
   assert.equal(f.nodes.gl.records.length,1);assert.equal(f.nodes.companion.records.length,1);
   assert.equal(f.nodes.gl.saved[Y.PREFERENCE].version,1);assert.equal(f.nodes.gl.saved[Y.PREFERENCE][provider],true);
  }finally{f.dispose();}
 });
 test(provider+' new-model opt-out blocks old transfer entry points, survives restart and reconciles when enabled',async()=>{
  const f=fixture(provider,{gl:[],companion:[row(1,provider)]});try{
   await f.nodes.gl.coordinator.discover(provider);await f.drain();
   await f.nodes.companion.coordinator.local({action:'syncSetSharing',provider,enabled:false});
   f.nodes.companion.records.push(row(2,provider));await f.nodes.companion.coordinator.mark(provider);await f.drain();
   assert.equal(f.nodes.gl.records.length,1);
   await assert.rejects(f.services.companion.external({type:'GH_PURCHASE_BEGIN',protocolVersion:1,provider,accountRef:'old-peer'},{id:'gl'}),/disabled/);
   f.start('companion');await f.nodes.companion.coordinator.startup();assert.equal(f.nodes.companion.saved[Y.PREFERENCE][provider],false);
   await f.nodes.companion.coordinator.local({action:'syncSetSharing',provider,enabled:true});
   assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,2);
  }finally{f.dispose();}
 });
 test(provider+' single-account discovery additively reconciles populated subsets without a prior mapping',async()=>{
  const f=fixture(provider,{gl:[row(1,provider)],companion:[row(2,provider)]});try{
   f.nodes.gl.label='Different label';await f.nodes.gl.coordinator.discover(provider);assert.equal((await f.drain()).status,'synced');
   assert.deepEqual(f.nodes.gl.records.map(r=>r.providerItemId).sort(),[row(1,provider).providerItemId,row(2,provider).providerItemId].sort());assert.equal(f.nodes.companion.records.length,2);
  }finally{f.dispose();}
 });
 test(provider+' opt-out during transfer prevents persistence even with an existing valid account mapping',async()=>{
  const f=fixture(provider,{gl:[],companion:[row(1,provider)]});try{
   await f.connect();f.nodes.gl.intercept=async(_,m)=>{if(m.type==='GH_PURCHASE_CHUNK')await f.nodes.gl.coordinator.local({action:'syncSetSharing',provider,enabled:false});};
   await f.nodes.gl.coordinator.run(provider);assert.equal(f.commits.length,0);assert.equal(f.nodes.gl.records.length,0);
  }finally{f.dispose();}
 });
}
test('legacy settings migrate once; future version opt-outs and malformed preferences cannot be silently enabled',async()=>{
 for(const legacy of [{},{syncEnabled:false},{galacticPurchaseSync:{}},{syncEnabled:true}]){
  let state=structuredClone(legacy);const area={get:async d=>({...d,...state}),set:async p=>Object.assign(state,p)};
  assert.equal((await Y.sharingPreferences(area)).humble,true);state[Y.PREFERENCE].humble=false;
  assert.equal((await Y.sharingPreferences(area)).humble,false);
  state[Y.PREFERENCE].version=2;assert.equal((await Y.sharingPreferences(area)).humble,false);
  state[Y.PREFERENCE]={version:1,humble:'false',fanatical:true};await assert.rejects(Y.sharingPreferences(area),/unreadable/);
 }
});
for(const provider of ['humble','fanatical']){
 test(provider+' a lost legacy mapping recovers only when verified dataset identities still exist',async()=>{
  const f=fixture(provider,{gl:[row(1,provider)],companion:[row(1,provider)]});try{
   await f.connect();await f.drain();const original=f.nodes.gl.saved[Y.KEY][provider];delete f.nodes.companion.saved[Y.KEY];
   await f.nodes.gl.coordinator.startup();assert.equal((await f.drain()).status,'synced');
   assert.equal(f.nodes.gl.saved[Y.KEY][provider].localId,original.localId);assert.equal(f.nodes.gl.saved[Y.KEY][provider].remoteId,original.remoteId);assert.equal(f.nodes.gl.records.length,1);
  }finally{f.dispose();}
 });
 test(provider+' restore can reuse reverse-verified lineage without relying on an account name',async()=>{
  const f=fixture(provider,{gl:[row(1,provider)],companion:[row(1,provider)]});try{
   await f.connect();await f.drain();delete f.nodes.gl.saved[Y.KEY];f.nodes.gl.label='Renamed after restore';
   await f.nodes.gl.coordinator.discover(provider);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);
  }finally{f.dispose();}
 });
 test(provider+' legacy unconfirmed setup with an empty receiver does not become a permanent opt-out',async()=>{
  const f=fixture(provider,{gl:[],companion:[row(1,provider)]});try{
   f.nodes.gl.saved[Y.KEY]={[provider]:{id:'legacy-proposal',peerId:'companion',localId:f.nodes.gl.accountId,remoteId:f.nodes.companion.accountId,confirmed:false,remoteConfirmed:false}};
   await f.nodes.gl.coordinator.discover(provider);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);
  }finally{f.dispose();}
 });
 test(provider+' restoration retires stale tickets and reconnects only a retained verified account identity',async()=>{
  const f=fixture(provider,{gl:[row(1,provider)],companion:[row(1,provider)]});try{
   await f.connect();await f.drain();const old=structuredClone(f.nodes.companion.saved[Y.KEY][provider]);
   const area={get:async d=>({...d,...f.nodes.companion.saved}),set:async v=>Object.assign(f.nodes.companion.saved,v)};
   const restored=await Y.restorationPatch(area,{[provider]:[old.localId]});Object.assign(f.nodes.companion.saved,restored.patch);
   assert.equal(restored.retired.length,0);assert.notEqual(f.nodes.companion.saved[Y.KEY][provider].id,old.id);assert.equal(f.nodes.companion.saved[Y.KEY][provider].confirmed,false);
   await assert.rejects(Y.assertCommit(area,provider,{autoSync:old},old.localId),/changed/);
   await f.nodes.gl.coordinator.discover(provider);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);
   const foreign=await Y.restorationPatch(area,{[provider]:['foreign-account']});assert.deepEqual(foreign.patch[Y.KEY],{});assert.equal(foreign.retired.length,1);
  }finally{f.dispose();}
 });
}
for(const p of ['humble','fanatical'])for(const first of ['gl','companion'])test(p+' installed/connected '+first+' first: additive initial and both automatic directions',async()=>{
 const f=fixture(p,{gl:[row(1,p)],companion:[row(2,p)]});try{await f.connect(first);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,2);assert.equal(f.nodes.companion.records.length,2);
 for(const id of ['gl','companion']){f.nodes[id].records.push(row(id==='gl'?3:4,p));await f.nodes[id].coordinator.mark(p);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,f.nodes.companion.records.length);}
 const before=JSON.stringify(Object.values(f.nodes).map(n=>n.records)),count=f.commits.length;for(let i=0;i<5;i++){await f.nodes.gl.coordinator.mark(p);await f.drain();}assert.equal(f.commits.length,count);assert.equal(JSON.stringify(Object.values(f.nodes).map(n=>n.records)),before);assert.equal(f.nodes.gl.saved[Y.KEY][p].pending,false);assert(!f.calls.some(c=>c.type==='GH_PURCHASE_OFFER'));}finally{f.dispose();}
});
for(const scenario of [{gl:[],companion:[]},{gl:[row(1)],companion:[]},{gl:[],companion:[row(1)]}])test('empty or one-sided initial libraries synchronize without scans',async()=>{const f=fixture('humble',scenario);try{await f.connect();assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,f.nodes.companion.records.length);}finally{f.dispose();}});
test('authorization, provider, forged mapping and lack of standing consent cannot import',async()=>{const f=fixture();try{await assert.rejects(f.services.gl.external({type:Y.PREFIX+'PROPOSE',protocolVersion:1,provider:'humble',mapping:{id:'x',localId:'gl-stable',remoteId:'companion-stable'}},{id:'intruder'}));await assert.rejects(f.nodes.gl.coordinator.local({action:'syncConnect',provider:'humble',localId:'gl-stable',remoteId:'companion-stable'}),/Confirm/);await assert.rejects(f.services.gl.external({type:Y.PREFIX+'APPLY',protocolVersion:1,provider:'humble',id:'forged'},{id:'companion'}));assert.equal(f.commits.length,0);}finally{f.dispose();}});
test('nicknames never imply a mapping; missing selected identity suspends rather than guessing',async()=>{const f=fixture();try{assert.equal((await f.nodes.gl.coordinator.local({action:'syncState',provider:'humble'})).state,null);await f.connect();await f.drain();f.nodes.gl.accountId='replacement-account';await f.nodes.gl.coordinator.mark('humble');assert.equal((await f.drain()).status,'attention');assert.equal(f.commits.length,0);}finally{f.dispose();}});
test('rename keeps identity and a changed display name does not alter purchase fingerprint',async()=>{const f=fixture('humble',{gl:[row(1)],companion:[]});try{await f.connect();await f.drain();const pair=structuredClone(f.nodes.gl.saved[Y.KEY].humble.pair),commits=f.commits.length;f.nodes.companion.label='Renamed';await f.nodes.gl.coordinator.mark('humble');await f.drain();assert.deepEqual(f.nodes.gl.saved[Y.KEY].humble.pair,pair);assert.equal(f.commits.length,commits);}finally{f.dispose();}});
test('unavailable peer retains intent, bounded alarm, then restart resumes without duplicate evidence',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{await f.connect();f.nodes.companion.online=false;await f.drain();assert.equal(f.nodes.gl.saved[Y.KEY].humble.pending,true);assert(f.nodes.gl.alarms.size);f.nodes.companion.online=true;f.start('gl');await f.nodes.gl.coordinator.startup();assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);f.start('companion');await f.nodes.companion.coordinator.startup();await f.drain();assert.equal(f.nodes.gl.records.length,1);}finally{f.dispose();}});
test('scan guard prevents partial imports; committed completion wakes saved work',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{await f.connect();f.nodes.gl.busy=true;await f.drain();assert.equal(f.commits.length,0);f.nodes.gl.busy=false;await f.nodes.gl.coordinator.mark('humble');assert.equal((await f.drain()).status,'synced');}finally{f.dispose();}});
test('disconnect during chunk transfer cancels standing permission before commit',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{await f.connect();let done;const gate=new Promise(r=>done=r),entered=new Promise(resolve=>{f.nodes.gl.intercept=async(_,m)=>{if(m.type==='GH_PURCHASE_CHUNK'){resolve();await gate;}};});const job=f.nodes.gl.coordinator.run('humble');await entered;await f.nodes.gl.coordinator.local({action:'syncDisconnect',provider:'humble'});done();await job;assert.equal(f.commits.length,0);assert.equal(f.nodes.gl.saved[Y.KEY].humble,null);}finally{f.dispose();}});
test('duplicate dirty events and a concurrent source change reconcile from current committed state',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{await f.connect();let changed=false;f.nodes.gl.intercept=async(_,m)=>{if(m.type==='GH_PURCHASE_CHUNK'&&!changed){changed=true;f.nodes.companion.records.push(row(2));}};await f.drain();f.nodes.gl.intercept=null;await f.nodes.gl.coordinator.mark('humble');assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,2);assert.equal(f.nodes.companion.records.length,2);}finally{f.dispose();}});
test('metadata-only enrichment is propagated and repeated checks keep byte size stable',async()=>{const f=fixture('humble',{gl:[row(1)],companion:[row(1)]});try{await f.connect();await f.drain();f.nodes.companion.records[0].metadata.authors=['A Writer'];await f.nodes.companion.coordinator.mark('humble');await f.drain();assert.deepEqual(f.nodes.gl.records[0].metadata.authors,['A Writer']);const bytes=S.size(f.nodes.gl.records);await f.nodes.gl.coordinator.mark('humble');await f.drain();assert.equal(S.size(f.nodes.gl.records),bytes);}finally{f.dispose();}});
test('expired grant preserves pending intent and a fresh validated attempt succeeds',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{await f.connect();const original=f.services.companion.external;f.services.companion.external=async(...args)=>{const value=await original(...args);if(args[0].type==='GH_PURCHASE_BEGIN')value.manifest.expiresAt=0;return value;};await f.nodes.gl.coordinator.run('humble');assert.equal(f.commits.length,0);assert.equal(f.nodes.gl.saved[Y.KEY].humble.pending,true);assert(f.nodes.gl.alarms.size);f.services.companion.external=original;assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);}finally{f.dispose();}});

test('uncertain outgoing commit is reconciled with read-only preview before any replay',async()=>{const f=fixture('humble',{gl:[row(1)],companion:[]});try{await f.connect();let lost=false;f.nodes.gl.afterResponse=async m=>{if(m.type===Y.PREFIX+'APPLY'&&!lost){lost=true;throw Error('Response interrupted after commit');}};await f.nodes.gl.coordinator.run('humble');assert.equal(f.nodes.companion.records.length,1);assert.equal(f.nodes.gl.saved[Y.KEY].humble.inFlight.direction,'outgoing');f.nodes.gl.afterResponse=null;f.start('gl');await f.nodes.gl.coordinator.startup();const commits=f.commits.length;assert.equal((await f.drain()).status,'synced');assert.equal(f.commits.length,commits);assert(f.calls.some(c=>c.type==='GH_PURCHASE_PREVIEW'));}finally{f.dispose();}});
test('identical values, timestamps, settings and progress do not trigger companion synchronization',async()=>{const listeners=[],marks=[],state={control:null};Y.observeCompanion({storage:{onChanged:{addListener:f=>listeners.push(f)},local:{get:async defaults=>({...defaults,...state})}}},{mark:async p=>marks.push(p)},'humble',['items'],'control');const emit=value=>listeners[0](value,'local');emit({items:{oldValue:[{title:'Same',updatedAt:'before'}],newValue:[{title:'Same',updatedAt:'after'}]}});emit({settings:{oldValue:1,newValue:2}});emit({progress:{newValue:50}});await Promise.resolve();assert.deepEqual(marks,[]);state.control={active:true};emit({items:{oldValue:[],newValue:[{title:'New'}]}});await Promise.resolve();assert.deepEqual(marks,[]);state.control=null;emit({control:{oldValue:{active:true},newValue:null}});await Promise.resolve();assert.deepEqual(marks,['humble']);});

test('remote-only consent revocation is rechecked after chunks even if notification was lost',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{await f.connect();f.nodes.gl.intercept=async(_,m)=>{if(m.type==='GH_PURCHASE_CHUNK')f.nodes.companion.saved[Y.KEY].humble=null;};await f.nodes.gl.coordinator.run('humble');assert.equal(f.commits.length,0);assert.equal(f.nodes.gl.saved[Y.KEY].humble.pending,true);}finally{f.dispose();}});

test('all-unsupported source reports attention instead of a falsely synced empty destination',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{await f.connect();f.nodes.gl.skipAll=true;const state=await f.drain();assert.equal(state.status,'attention');assert.match(state.error,/No purchases could/);assert.equal(f.nodes.gl.records.length,0);assert.equal(f.nodes.companion.records.length,1);const writes=f.commits.length;await f.nodes.gl.coordinator.mark('humble');await f.drain();assert.equal(f.commits.length,writes);}finally{f.dispose();}});
test('bounded failures stop alarm retries at attention until an explicit wakeup resets intent',async()=>{const f=fixture();try{await f.connect();f.nodes.companion.online=false;for(let n=0;n<6;n++)await f.nodes.gl.coordinator.run('humble');assert.equal(f.nodes.gl.saved[Y.KEY].humble.status,'attention');assert.equal(f.nodes.gl.alarms.size,0);const attempts=f.nodes.gl.saved[Y.KEY].humble.attempts;await f.nodes.gl.coordinator.run('humble');assert.equal(f.nodes.gl.saved[Y.KEY].humble.attempts,attempts);f.nodes.companion.online=true;await f.nodes.gl.coordinator.mark('humble');assert.equal((await f.drain()).status,'synced');}finally{f.dispose();}});

test('changing the configured peer suspends both sides without data writes; restoring it resumes consent',async()=>{const f=fixture('humble',{gl:[row(1)],companion:[]});try{await f.connect();await f.drain();const before=f.commits.length;f.nodes.companion.peerOverride='missing';await f.nodes.companion.coordinator.configurationChanged('humble');await f.nodes.gl.coordinator.mark('humble');assert.equal(f.nodes.gl.saved[Y.KEY].humble.status,'attention');assert.equal(f.nodes.companion.saved[Y.KEY].humble.status,'attention');assert.equal(f.nodes.gl.saved[Y.KEY].humble.remoteConfirmed,false);assert.equal(f.commits.length,before);f.nodes.companion.peerOverride='gl';await f.nodes.companion.coordinator.configurationChanged('humble');assert.equal((await f.drain()).status,'synced');assert.equal(f.commits.length,before);}finally{f.dispose();}});

test('one confirmation fills the initially empty GL library without a companion Options approval',async()=>{const f=fixture('humble',{gl:[],companion:[row(1),row(2)]});try{await f.nodes.gl.coordinator.local({action:'syncConnect',provider:'humble',confirmed:true});assert.equal(f.nodes.companion.saved[Y.KEY].humble.confirmed,true);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,2);assert.equal(f.nodes.gl.saved[Y.KEY].humble.remoteConfirmed,true);}finally{f.dispose();}});
test('populated unrelated accounts require same-account confirmation; nicknames are insufficient',async()=>{const f=fixture('humble',{gl:[row(1)],companion:[row(2)]});try{await assert.rejects(f.nodes.gl.coordinator.local({action:'syncConnect',provider:'humble',confirmed:true}),/same store account/);assert.equal(f.commits.length,0);assert.equal(f.nodes.gl.saved[Y.KEY],undefined);}finally{f.dispose();}});
test('multiple accounts require explicit IDs instead of picking the active account',async()=>{const f=fixture();try{f.nodes.companion.extraAccounts=[{stableId:'another',accountRef:'another',label:'Other',count:0}];await assert.rejects(f.nodes.gl.coordinator.local({action:'syncConnect',provider:'humble',confirmed:true}),/explicit choice/);assert.equal(f.commits.length,0);}finally{f.dispose();}});
test('authorized but unsolicited or stale ACCEPT cannot enable an account relationship',async()=>{const f=fixture();try{const m={type:Y.PREFIX+'ACCEPT',protocolVersion:1,provider:'humble',mapping:{id:'forged',localId:'companion-stable',remoteId:'gl-stable'},ticket:'forged'};await assert.rejects(f.services.companion.external(m,{id:'gl'}),/verified local setup/);await f.connect();await f.drain();const prior=f.nodes.gl.saved[Y.KEY].humble;await f.nodes.gl.coordinator.local({action:'syncDisconnect',provider:'humble'});await assert.rejects(f.services.companion.external({...m,mapping:{id:prior.id,localId:prior.remoteId,remoteId:prior.localId}},{id:'gl'}),/verified local setup/);assert.equal(f.nodes.companion.saved[Y.KEY].humble,null);}finally{f.dispose();}});
test('an old inert proposal can be completed by one confirmation without opening the peer',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{const id=crypto.randomUUID();f.nodes.companion.saved[Y.KEY]={humble:{id,peerId:'gl',localId:'companion-stable',remoteId:'gl-stable',confirmed:false,remoteConfirmed:true,status:'confirmation'}};f.nodes.gl.saved[Y.KEY]={humble:{id,peerId:'companion',localId:'gl-stable',remoteId:'companion-stable',confirmed:true,remoteConfirmed:false,status:'confirmation'}};await f.nodes.gl.coordinator.local({action:'syncConnect',provider:'humble',confirmed:true});assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);}finally{f.dispose();}});

test('a lost setup acceptance response resumes after restart without another local approval',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{let lost=false;f.nodes.gl.afterResponse=async m=>{if(m.type===Y.PREFIX+'ACCEPT'&&!lost){lost=true;throw Error('Response lost');}};await assert.rejects(f.nodes.gl.coordinator.local({action:'syncConnect',provider:'humble',confirmed:true}),/Response lost/);assert.equal(f.nodes.gl.saved[Y.KEY].humble.status,'attention');f.nodes.gl.afterResponse=null;f.start('gl');await f.nodes.gl.coordinator.startup();assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,1);assert.equal(f.nodes.gl.saved[Y.KEY].humble.setup,null);}finally{f.dispose();}});
test('a setup source change invalidates the reverse-verified ticket before any import',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{f.nodes.gl.intercept=async(_,m)=>{if(m.type===Y.PREFIX+'ACCEPT')f.nodes.gl.records.push(row(3));};await assert.rejects(f.nodes.gl.coordinator.local({action:'syncConnect',provider:'humble',confirmed:true}),/changed during setup/);assert.equal(f.commits.length,0);assert.equal(f.nodes.gl.saved[Y.KEY].humble.status,'attention');assert.equal(f.nodes.companion.saved[Y.KEY],undefined);}finally{f.dispose();}});


for(const provider of ['humble','fanatical'])test('R1 '+provider+': missing mapped account suspends once without historical proposals on startup',async()=>{
 const f=fixture(provider,{gl:[row(1,provider)],companion:[row(1,provider)]});try{
  await f.connect();await f.drain();delete f.nodes.companion.saved[Y.KEY];f.nodes.companion.accountId='replacement';
  await f.nodes.gl.coordinator.startup();const state=structuredClone(f.nodes.gl.saved[Y.KEY][provider]),calls=f.calls.length;
  assert.equal(state.status,'attention');assert.equal(state.errorCode,'missing-account');assert.equal(state.remoteConfirmed,false);assert.equal(state.peerVerified,false);
  for(let i=0;i<10;i++)await f.nodes.gl.coordinator.startup();
  assert.equal(f.calls.length,calls);assert.equal(f.nodes.gl.saved[Y.KEY][provider].attempts,state.attempts);assert(!f.calls.some(c=>c.type===Y.PREFIX+'PROPOSE'));assert.equal(f.nodes.gl.records.length,1);
 }finally{f.dispose();}
});
for(const provider of ['humble','fanatical'])test('R1 '+provider+': a committed companion change wakes a transport-exhausted GL relationship',async()=>{
 const f=fixture(provider,{gl:[row(1,provider)],companion:[row(1,provider)]});try{
  await f.connect();await f.drain();f.nodes.companion.online=false;await f.nodes.gl.coordinator.mark(provider);
  for(let i=0;i<6;i++)await f.nodes.gl.coordinator.run(provider);
  assert.equal(f.nodes.gl.saved[Y.KEY][provider].errorCode,'transport-exhausted');
  f.nodes.companion.online=true;f.nodes.companion.records.push(row(2,provider));
  const listeners=[];Y.observeCompanion({storage:{onChanged:{addListener:fn=>listeners.push(fn)},local:{get:async d=>d}}},f.nodes.companion.coordinator,provider,['items'],'control');
  listeners[0]({items:{oldValue:[row(1,provider)],newValue:f.nodes.companion.records}},'local');await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,2);
 }finally{f.dispose();}
});
test('new-model remote opt-out is permanent and cannot be revived by a dirty event',async()=>{
 const f=fixture('humble',{gl:[row(1)],companion:[row(1)]});try{await f.connect();await f.drain();delete f.nodes.companion.saved[Y.KEY];f.nodes.companion.saved[Y.PREFERENCE]={version:1,humble:false,fanatical:true};await f.nodes.gl.coordinator.startup();const state=f.nodes.gl.saved[Y.KEY].humble;assert.equal(state.errorCode,'sharing-disabled');assert.equal(state.remoteConfirmed,false);const before=f.commits.length;await f.nodes.gl.coordinator.mark('humble');await f.drain();assert.equal(f.commits.length,before);assert.equal(f.nodes.gl.saved[Y.KEY].humble.status,'attention');}finally{f.dispose();}
});

async function repairFixture(f){const p=f.provider,c=await f.nodes.gl.coordinator.local({action:'syncChoices',provider:p}),a=c.accounts[0],b=c.remoteAccounts[0];return f.nodes.gl.coordinator.local({action:'syncRepair',provider:p,confirmed:true,sameAccount:true,localId:a.stableId,remoteId:b.stableId,expectedId:c.state?.id??null,expectedRemoteId:c.remoteRelationshipId,localFingerprint:a.fingerprint,remoteFingerprint:b.fingerprint});}
for(const provider of ['humble','fanatical'])test('R2 '+provider+': one repair replaces lost identity, preserves purchases and subsequent observer-driven sync',async()=>{
 const f=fixture(provider,{gl:[row(1,provider)],companion:[row(1,provider)]});try{await f.connect();await f.drain();const oldId=f.nodes.gl.saved[Y.KEY][provider].id;delete f.nodes.companion.saved[Y.KEY];f.nodes.companion.accountId='replacement';f.nodes.companion.records.push(row(2,provider));await f.nodes.gl.coordinator.startup();await repairFixture(f);assert.notEqual(f.nodes.gl.saved[Y.KEY][provider].id,oldId);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,2);f.nodes.companion.records.push(row(3,provider));await f.nodes.companion.coordinator.mark(provider);await f.drain();assert.equal(f.nodes.gl.records.length,3);assert.equal(f.nodes.companion.records.length,3);}finally{f.dispose();}
});
test('R2 refuses unconfirmed or stale repair without replacing the relationship',async()=>{const f=fixture();try{await f.connect();await f.drain();const before=structuredClone(f.nodes.gl.saved[Y.KEY]);await assert.rejects(f.nodes.gl.coordinator.local({action:'syncRepair',provider:'humble'}),/Confirm/);await assert.rejects(f.nodes.gl.coordinator.local({action:'syncRepair',provider:'humble',confirmed:true,expectedId:'obsolete'}),/changed/);assert.deepEqual(f.nodes.gl.saved[Y.KEY],before);f.nodes.companion.online=false;await assert.rejects(repairFixture(f),/unavailable/);assert.deepEqual(f.nodes.gl.saved[Y.KEY],before);}finally{f.dispose();}});
test('R2 repair invalidates a queued old transfer before its commit',async()=>{const f=fixture('humble',{gl:[row(1)],companion:[row(1)]});try{await f.connect();await f.drain();f.nodes.companion.records.push(row(2));await f.nodes.gl.coordinator.mark('humble');let release,entered;const hold=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);f.nodes.gl.intercept=async(_,m)=>{if(m.type==='GH_PURCHASE_CHUNK'){entered();await hold;}};const job=f.nodes.gl.coordinator.run('humble');await waiting;await repairFixture(f);f.nodes.gl.intercept=null;release();await job;assert.equal(f.nodes.gl.records.length,1);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,2);}finally{f.dispose();}});

for(const provider of ['humble','fanatical'])test('R4 '+provider+': diagnostic report verifies consent/accounts without importing and retirement notifies peer',async()=>{
 const f=fixture(provider,{gl:[row(1,provider)],companion:[row(1,provider)]});try{await f.connect();await f.drain();const before=f.commits.length,report=(await f.nodes.gl.coordinator.local({action:'syncDiagnostics',provider})).report;assert.equal(report.pairingAvailable,true);assert.equal(report.verifiedPeerConfirmation,true);assert.equal(report.recoveryAction,'sync');assert.equal(f.commits.length,before);assert(!JSON.stringify(report).includes('companion-stable'));
 const saved=f.nodes.gl.saved[Y.KEY][provider];f.nodes.gl.saved[Y.KEY]={};await f.nodes.gl.coordinator.notifyInvalidated([{provider,id:saved.id,peerId:saved.peerId}]);assert.equal(f.nodes.companion.saved[Y.KEY][provider],null);f.nodes.companion.records.push(row(2,provider));await f.nodes.companion.coordinator.mark(provider);await f.drain();assert.equal(f.nodes.gl.records.length,1);
 }finally{f.dispose();}
});

test('manual Sync now persists a missing-account repair state instead of only returning an error',async()=>{const f=fixture();try{await f.connect();await f.drain();f.nodes.companion.accountId='replacement';await assert.rejects(f.nodes.gl.coordinator.local({action:'syncNow',provider:'humble'}),/Mapped account/);assert.equal(f.nodes.gl.saved[Y.KEY].humble.errorCode,'missing-account');assert.equal(f.nodes.gl.saved[Y.KEY].humble.status,'attention');}finally{f.dispose();}});

for(const provider of ['humble','fanatical'])test(provider+' populated overlapping accounts retain mapping over repeated OFF/ON and restart',async()=>{
 const f=fixture(provider,{gl:[row(1,provider),row(2,provider)],companion:[row(2,provider),row(3,provider)]});try{
  await f.nodes.gl.coordinator.discover(provider);await f.drain();const id=f.nodes.gl.saved[Y.KEY][provider].id;
  for(let n=0;n<2;n++){
   await f.nodes.gl.coordinator.local({action:'syncSetSharing',provider,enabled:false});assert.equal(f.nodes.gl.saved[Y.KEY][provider].id,id);
   f.start('gl');await f.nodes.gl.coordinator.startup();assert.equal(f.nodes.gl.saved[Y.PREFERENCE][provider],false);
   await f.nodes.gl.coordinator.local({action:'syncSetSharing',provider,enabled:true});assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.saved[Y.KEY][provider].id,id);
   assert.equal(f.nodes.gl.records.length,3);assert.equal(f.nodes.companion.records.length,3);
  }
 }finally{f.dispose();}
});
for(const provider of ['humble','fanatical'])test(provider+' genuine multiple-account ambiguity never uses the single-account policy',async()=>{
 const f=fixture(provider,{gl:[row(1,provider)],companion:[row(2,provider)]});try{
  f.nodes.gl.extraAccounts=[{stableId:'another',accountRef:'another',label:'Personal',count:1}];
  await f.nodes.gl.coordinator.discover(provider);await f.drain();assert.equal(f.commits.length,0);assert.equal((await f.nodes.gl.coordinator.local({action:'syncState',provider})).availability,'account-resolution-required');
 }finally{f.dispose();}
});
test('retry cannot override an explicit opt-out',async()=>{const f=fixture();try{await f.nodes.gl.coordinator.local({action:'syncSetSharing',provider:'humble',enabled:false});await assert.rejects(f.nodes.gl.coordinator.local({action:'syncRetry',provider:'humble'}),/disabled/);assert.equal(f.nodes.gl.saved[Y.PREFERENCE].humble,false);}finally{f.dispose();}});

for(const provider of ['humble','fanatical'])test(provider+' single-account policy cannot overwrite a foreign confirmed relationship',async()=>{
 const f=fixture(provider,{gl:[row(1,provider)],companion:[row(2,provider)]});try{
  const foreign={id:'foreign-relationship',peerId:'another-extension',localId:f.nodes.companion.accountId,remoteId:'foreign-account',confirmed:true,remoteConfirmed:true};f.nodes.companion.saved[Y.KEY]={[provider]:foreign};
  await f.nodes.gl.coordinator.discover(provider);await f.drain();assert.equal(f.commits.length,0);assert.deepEqual(f.nodes.companion.saved[Y.KEY][provider],foreign);
 }finally{f.dispose();}
});

for(const provider of ['humble','fanatical'])test(provider+' unique empty accounts establish a relationship without waiting for an import',async()=>{const f=fixture(provider,{gl:[],companion:[]});try{await f.nodes.gl.coordinator.discover(provider);assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.records.length,0);assert.equal(f.nodes.companion.records.length,0);}finally{f.dispose();}});

test('a genuine source validation failure is diagnosed separately from account ambiguity and retry recovers',async()=>{
 const f=fixture('humble',{gl:[row(1)],companion:[row(2)]});try{
  f.nodes.companion.records[0].metadata.keyCheckedAt='INVALID_OPTIONAL_WIRE_DATA';await f.nodes.gl.coordinator.discover('humble');
  const state=await f.nodes.gl.coordinator.local({action:'syncState',provider:'humble'});assert.equal(state.availability,'validation-failed');assert.equal(state.discoveryError.code,'operation-failed');assert.equal(f.commits.length,0);
  const diagnostic=(await f.nodes.gl.coordinator.local({action:'syncDiagnostics',provider:'humble'})).report;assert.equal(diagnostic.failureCode,'operation-failed');assert(!JSON.stringify(diagnostic).includes('INVALID_OPTIONAL_WIRE_DATA'));
  delete f.nodes.companion.records[0].metadata.keyCheckedAt;await f.nodes.gl.coordinator.local({action:'syncRetry',provider:'humble'});assert.equal((await f.drain()).status,'synced');assert.equal((await f.nodes.gl.coordinator.local({action:'syncState',provider:'humble'})).discoveryError,null);
 }finally{f.dispose();}
});

test('startup rechecks a repaired validation failure without discarding its verified mapping',async()=>{const f=fixture('humble',{gl:[],companion:[row(1)]});try{await f.connect();await f.drain();const id=f.nodes.gl.saved[Y.KEY].humble.id;f.nodes.companion.records[0].metadata.keyCheckedAt='invalid';await f.nodes.gl.coordinator.startup();assert.equal(f.nodes.gl.saved[Y.KEY].humble.errorCode,'operation-failed');delete f.nodes.companion.records[0].metadata.keyCheckedAt;f.start('gl');await f.nodes.gl.coordinator.startup();assert.equal((await f.drain()).status,'synced');assert.equal(f.nodes.gl.saved[Y.KEY].humble.id,id);assert.equal(f.nodes.gl.records.length,1);}finally{f.dispose();}});
