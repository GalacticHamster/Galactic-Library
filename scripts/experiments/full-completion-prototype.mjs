// Architecture experiment only. Never imported by shipped extension code.
// Receives a disposable native storage area; never locates a personal profile.
export async function completionExperiment(D, native, size) {
 const {models:M,profiles:P,metadata:MD,snapshot:SN,writer:W,equality:E,digest:DG,storage:S,matcher:MT}=D;
 const check=(value,message)=>{if(!value)throw Error(message);},now=()=>performance.now();
 const old='2020-01-01T00:00:00.000Z',prefix='completion-experiment:';
 const metrics={reads:0,fullReads:0,fullWrites:0,scopedWrites:0,dispatchMs:0,settlementMs:0};
 const area={
  async get(defaults){metrics.reads++;if(Object.hasOwn(defaults,'galacticLibraryDatabase'))metrics.fullReads++;const entries=Object.entries(defaults);let raw=await native.get(Object.fromEntries(entries.map(([k,v])=>[prefix+k,v])));if(D.reconstitute)raw=JSON.parse(JSON.stringify(raw));return Object.fromEntries(entries.map(([k,v])=>[k,raw[prefix+k]??v]));},
  async set(updates){if(Object.hasOwn(updates,'galacticLibraryDatabase'))metrics.fullWrites++;else metrics.scopedWrites++;const start=now(),pending=native.set(Object.fromEntries(Object.entries(updates).map(([k,v])=>[prefix+k,v])));metrics.dispatchMs+=now()-start;const sent=now();await pending;metrics.settlementMs+=now()-sent;},
  async remove(keys){await native.remove([keys].flat().map(k=>prefix+k));}
 };
 const reset=()=>{for(const k of Object.keys(metrics))metrics[k]=0;};
 const clone=structuredClone,bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
 const database=M.createEmptyDatabase(),profiles={};
 const providers=['epic','steam','kindle','fanatical','xbox','kobo'];
 for(const provider of providers){const p=P.newProviderProfile(provider,'Synthetic');p.state={connected:true,lastSync:old,fullSyncAt:old,syncMode:'full'};profiles[provider]=p;database.providerProfiles[p.profileId]=p;database.providers[provider]={...p.state,activeProfileId:p.profileId};}
 const epicCount=Math.min(563,Math.floor(size/3));
 const statement='Collects Synthetic Series (2000) #1-8. '+('Captured source evidence with named supplementary material and explicit numbered contents. '.repeat(18));
 for(let n=0;n<size;n++){
  const provider=n<epicCount?'epic':providers[1+(n%5)],p=profiles[provider];
  const metadata={source:MD.PROVIDER_SOURCES[provider],publisher:'Synthetic Publisher',language:'en',authors:['Synthetic Creator '+n%31],series:['Synthetic Series '+n%97],
   ...(provider==='kindle'||provider==='kobo'?{collects:statement}:{})};
  if(provider==='fanatical')metadata.purchaseOrigins=[0,1,2].map(i=>({occurrenceRef:(n*3+i+1).toString(16).padStart(64,'0'),orderRef:(n+1).toString(16).padStart(64,'0'),bundleId:'bundle-'+i,bundleTitle:'Synthetic bundle '+i,purchasedAt:old,observedAt:old}));
  const item=M.normalizeProviderItem({provider,profileId:p.profileId,providerItemId:String(n+1),title:'Synthetic '+provider+' '+n,mediaType:['kindle','kobo','fanatical'].includes(provider)?'book':'game',ownership:n%13===0?'subscription':'owned',metadata},old,{profileKeySpace:p.keySpace});database.providerItems[item.id]=item;
 }
 const base=M.validateDatabase(database),baseBytes=bytes(base),profile=profiles.epic;
 const input=Object.values(base.providerItems).filter(i=>i.provider==='epic');
 const snapshot=SN.completeProviderSnapshot('epic',input,[SN.completedScope('library',input.length,input.length,'reported-count')]);
 await area.set({galacticLibraryDatabase:base});
 let writer=W.createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true});await writer.getQueryDatabase();
 const scan=await writer.beginProviderScan('epic','Synthetic','full',false,1);
 const stages=[],work={executingMs:0,waitMs:0,yields:0};
 const timing={validationWork:work,begin(stage){const at=now();return()=>stages.push({stage,ms:now()-at});}};
 reset();const baselineStart=now();await writer.execute('commitProviderScan',['epic',input,{syncMode:'full',fullSyncAt:new Date().toISOString()},snapshot,scan.scanToken,1],timing);const baselineMs=now()-baselineStart;
 const baselineCounts={...metrics},next=(await area.get({galacticLibraryDatabase:null})).galacticLibraryDatabase;
 const state=clone(next.providers.epic),profileState=clone(next.providerProfiles[profile.profileId].state);
 check(state.fullSyncAt!==old&&state.fullSyncAt===profileState.fullSyncAt,'Successful full state not advanced');
 // This prototype consumes the real writer's post-normalization records as its
 // oracle. It measures proof/storage/materialization, not a replacement importer.
 // A separate normalization workload is measured so this omission is explicit.
 const incoming=input.map(i=>next.providerItems[i.id]);
 const nstart=now();for(const i of input)M.normalizeProviderItem(i,incoming[0].updatedAt,{allowEnrichment:false,profileKeySpace:profile.keySpace});const normalizationMs=now()-nstart;
 const strip=item=>{const r={...item};delete r.observedAt;delete r.updatedAt;r.metadata={...item.metadata};if(r.metadata.purchaseOrigins)r.metadata.purchaseOrigins=r.metadata.purchaseOrigins.map(o=>{const v={...o};delete v.observedAt;return v;});return r;};
 function prove(raw,provider,records,additive=false){
  const p=raw.providerProfiles[raw.providers[provider].activeProfileId],known=Object.values(raw.providerItems).filter(i=>i.profileId===p.profileId),ids=new Set(records.map(i=>i.id));
  if(ids.size!==records.length||!additive&&known.length!==records.length)return null;
  const changes=[];for(const record of records){const prior=raw.providerItems[record.id];if(!prior||prior.profileId!==p.profileId||prior.recordRef!==record.recordRef||!E.equalDatabaseData(strip(prior),strip(record)))return null;
   changes.push({id:record.id,recordRef:record.recordRef,observedAt:record.observedAt,updatedAt:record.updatedAt,origins:(record.metadata.purchaseOrigins??[]).filter((o,i)=>o.observedAt!==prior.metadata.purchaseOrigins?.[i]?.observedAt).map(o=>[o.occurrenceRef,o.observedAt])});}
  return changes;
 }
 function materialize(raw,receipt){
  const result={...raw,providerItems:{...raw.providerItems},providers:{...raw.providers},providerProfiles:{...raw.providerProfiles}};
  for(const entry of receipt.records){const prior=result.providerItems[entry.id];check(prior?.recordRef===entry.recordRef,'Stale reference');const times=new Map(entry.origins);result.providerItems[entry.id]={...prior,observedAt:entry.observedAt,updatedAt:entry.updatedAt,...(times.size?{metadata:{...prior.metadata,purchaseOrigins:prior.metadata.purchaseOrigins.map(o=>({...o,observedAt:times.get(o.occurrenceRef)??o.observedAt}))}}:{})};}
  if(receipt.state){result.providers.epic=receipt.state;result.providerProfiles[profile.profileId]={...raw.providerProfiles[profile.profileId],state:receipt.profileState};}return result;
 }
 const digest=await DG.providerCheckDigest(base),proofStart=now(),records=prove(base,'epic',incoming);check(records,'Unchanged proof failed');const proofMs=now()-proofStart;
 const receipt={format:2,baseDigest:digest,profileId:profile.profileId,revision:1,state,profileState,records};
 const effective=materialize(base,receipt);check(E.equalDatabaseData(effective,next),'Receipt disagrees with real writer');
 const compact={...receipt,records:undefined,wholeProfile:{observedAt:records[0].observedAt,updatedAt:records[0].updatedAt,count:records.length}};
 delete compact.records;check(records.every(r=>r.observedAt===records[0].observedAt&&r.updatedAt===records[0].updatedAt&&!r.origins.length),'Whole-profile compression unsafe');
 const segments={};for(const p of Object.values(base.providerProfiles))segments[p.profileId]={providerItems:Object.fromEntries(Object.entries(base.providerItems).filter(([,i])=>i.profileId===p.profileId))};
 const core={...base,providerItems:{}};const refs=Object.fromEntries(Object.keys(segments).map(id=>[id,'segment:'+id+':0']));
 await area.set({base,receipt:null,core,head:{generation:0,refs},...Object.fromEntries(Object.entries(segments).map(([id,v])=>[refs[id],v]))});
 const rows=[{candidate:'current-writer',mode:'warm',totalMs:baselineMs,...baselineCounts,validationPasses:stages.filter(s=>s.stage==='persist_validation').length,validationMs:stages.filter(s=>s.stage==='persist_validation').reduce((n,s)=>n+s.ms,0),validationWork:work,stages}];
 for(const mode of ['warm','fresh-valid-base','fresh-no-proof'])for(const candidate of ['scoped-receipt','whole-profile-receipt','provider-segment','segment-plus-receipt']){
  reset();const t=now();let raw=base,validationMs=0,digestMs=0,readMs=0;
  const a=now();
  // Preserve authoritative read requirement for receipt paths. A migrated
  // segment path reads its head and affected segment, not the legacy DB blob.
  if(candidate==='provider-segment'||candidate==='segment-plus-receipt'){
   const h=(await area.get({head:null})).head;check(h.generation===0,'Stale head');
   const selected=(await area.get({[h.refs[profile.profileId]]:null}))[h.refs[profile.profileId]];check(E.equalDatabaseData(selected,segments[profile.profileId]),'Stale segment');
   if(mode!=='warm'){const keys={core:null,...Object.fromEntries(Object.values(h.refs).map(k=>[k,null]))},all=await area.get(keys);raw={...all.core,providerItems:Object.assign({},...Object.values(h.refs).map(k=>all[k].providerItems))};}
  }else{raw=(await area.get({base:null})).base;metrics.fullReads++;}
  readMs=now()-a;
  if(mode==='warm')check(E.equalDatabaseData(raw,base),'Authoritative base changed');
  if(mode!=='warm'){let v=now();check(await DG.providerCheckDigest(raw)===digest,'Cold base digest');digestMs=now()-v;if(mode==='fresh-no-proof'){v=now();M.validateDatabase(raw);validationMs=now()-v;}}
  const p=now(),proof=prove(raw,'epic',incoming);check(proof,'Candidate proof failed');const compareMs=now()-p;
  const packet=candidate==='whole-profile-receipt'?compact:receipt;
  if(candidate==='provider-segment'){
   const value={providerItems:Object.fromEntries(incoming.map(i=>[i.id,i]))};
   // Copy-on-write then a single root pointer; no multi-key Chrome transaction
   // is assumed. This is two settled writes, including the commit point.
   await area.set({'segment:next':value});await area.set({candidateHead:{generation:1,refs:{...refs,[profile.profileId]:'segment:next'},state,profileState}});
  }else await area.set({receipt:packet});
  const completionMs=now()-t,settled={...metrics};
  const m=now(),view=materialize(raw,receipt),materializationMs=now()-m;
  check(E.equalDatabaseData(view,next),'Read-after-write mismatch');
  const b=now(),backup=S.createBackup(view),backupMs=now()-b;check(backup.database.providerItems[input[0].id].observedAt===incoming[0].observedAt,'Backup lost observations');
  const q=now(),matches=MT.matchItems(view.providerItems,[{title:input[1].title,mediaType:'game'}],view),queryMs=now()-q;
  check(matches[0].matches.some(m=>m.evidence.checkedAt===incoming[1].observedAt),'Matcher evidence stale');
  const c=now();clone(view);const cloneMs=now()-c;
  const persisted=(await area.get(candidate==='provider-segment'?{candidateHead:null}:{receipt:null}));
  if(candidate==='provider-segment'){check(persisted.candidateHead.generation===1,'Read-after-write lost head');const key=persisted.candidateHead.refs[profile.profileId],stored=(await area.get({[key]:null}))[key];check(E.equalDatabaseData(stored.providerItems,Object.fromEntries(incoming.map(i=>[i.id,i]))),'Read-after-write lost segment');}
  else check(E.equalDatabaseData(persisted.receipt,packet),'Read-after-write lost receipt fields');
  rows.push({candidate,mode,totalMs:completionMs,...settled,readMs,digestMs,validationMs,validationPasses:mode==='fresh-no-proof'?1:0,proofMs:compareMs,materializationMs,backupMs,queryMs,cloneMs,receiptBytes:candidate==='provider-segment'?0:bytes(packet),segmentBytes:candidate==='provider-segment'?bytes({providerItems:Object.fromEntries(incoming.map(i=>[i.id,i]))}):0,matchResults:matches.length});
 }
 // Bounded semantic/fault probes; they deliberately do not claim production
 // lease, authorization, certificate or browser-process-crash verification.
 const controls=[];const test=(name,fn)=>{fn();controls.push(name);};
 test('one-record metadata change falls back',()=>check(!prove(base,'epic',incoming.map((r,i)=>i?r:{...r,title:'Changed'})),'Metadata change accepted'));
 test('removal falls back instead of hiding history work',()=>check(!prove(base,'epic',incoming.slice(1)),'Removal accepted'));
 test('addition falls back',()=>check(!prove(base,'epic',[...incoming,{...incoming[0],id:'new',recordRef:crypto.randomUUID()}]),'Addition accepted'));
 test('ownership changes fall back',()=>check(!prove(base,'epic',incoming.map((r,i)=>i?r:{...r,ownership:'returned'})),'Ownership accepted'));
 const xbox=Object.values(base.providerItems).filter(i=>i.provider==='xbox'),xr={...xbox[0],observedAt:'2026-10-17T00:00:00.000Z',updatedAt:'2026-10-17T00:00:00.000Z'};
 test('additive subset retains omitted Xbox observations',()=>{const rr=prove(base,'xbox',[xr],true);check(rr,'Subset rejected');const v=materialize(base,{records:rr});check(v.providerItems[xbox[1].id].observedAt===old,'Omitted record refreshed');});
 const fan=Object.values(base.providerItems).find(i=>i.provider==='fanatical'),fr={...fan,observedAt:xr.observedAt,updatedAt:xr.updatedAt,metadata:{...fan.metadata,purchaseOrigins:fan.metadata.purchaseOrigins.map((o,i)=>i?o:{...o,observedAt:xr.observedAt})}};
 test('Fanatical subset origin keeps other origin dates',()=>{const rr=prove(base,'fanatical',[fr],true),v=materialize(base,{records:rr}).providerItems[fan.id];check(v.metadata.purchaseOrigins[0].observedAt===xr.observedAt&&v.metadata.purchaseOrigins[1].observedAt===old,'Origin scope lost');});
 test('Kobo updatedAt can remain unchanged while observation advances',()=>{const k=Object.values(base.providerItems).find(i=>i.provider==='kobo'),r={...k,observedAt:xr.observedAt};const rr=prove(base,'kobo',[r],true),v=materialize(base,{records:rr}).providerItems[k.id];check(v.updatedAt===old&&v.observedAt===xr.observedAt,'Kobo timestamp lost');});
 test('stale reference rejected',()=>{try{materialize(base,{records:[{...records[0],recordRef:crypto.randomUUID()}]});}catch{return;}throw Error('Stale reference accepted');});
 test('new observation invalidates pending review observation guard',()=>{const prior=base.providerItems[input[0].id],current=effective.providerItems[prior.id];check(prior.recordRef===current.recordRef&&prior.observedAt!==current.observedAt,'Stale guard would be bypassed');});
 test('compact receipt expands to exact record scope',()=>{const expanded={...compact,records:Object.values(base.providerItems).filter(i=>i.profileId===compact.profileId).map(i=>({id:i.id,recordRef:i.recordRef,...compact.wholeProfile,origins:[]}))};check(E.equalDatabaseData(materialize(base,expanded),next),'Compressed scope disagrees');});
 const byRecord=new Map(),left=xbox[0],right=xbox[1];
 for(let i=1;i<=100;i++){const item=i%2?left:right,stamp=new Date(Date.UTC(2026,0,i)).toISOString();byRecord.set(item.id,{id:item.id,recordRef:item.recordRef,observedAt:stamp,updatedAt:stamp,origins:[]});}
 test('alternating subset scans consolidate per record without losing earlier observations',()=>{check(byRecord.size===2,'Scope grew with scans');const v=materialize(base,{records:[...byRecord.values()]});check(v.providerItems[left.id].observedAt!==old&&v.providerItems[right.id].observedAt!==old,'Earlier subset lost');});
 let r=receipt;const growth=[];for(let i=1;i<=100;i++){r={...receipt,revision:i};if([1,10,100].includes(i))growth.push({scans:i,bytes:bytes(r)});}check(growth.at(-1).bytes-growth[0].bytes<10,'Receipt grows with attempts');
 if(size===1000){for(let i=1;i<=10;i++)await area.set({receipt:{...receipt,revision:i}});check((await area.get({receipt:null})).receipt.revision===10,'Repeated receipt not consolidated');controls.push('ten native receipts replace prior packet');
  // Fault injection at the copy-on-write boundary: staged content without a
  // head switch is invisible. A losing writer must compare the root generation.
  await area.set({'segment:orphan':{providerItems:{}}});check((await area.get({head:null})).head.generation===0,'Orphan changed head');controls.push('interrupted staging retains old committed head');
  await area.set({raceHead:{generation:1}});const head=(await area.get({raceHead:null})).raceHead;check(head.generation!==0,'Lost update guard not exercised');controls.push('stale generation detected; serialized commit still required');}
 for(const [scenario,values]of [['metadata-change',input.map((i,n)=>n?i:{...i,title:i.title+' changed'})],['removal',input.slice(1)],['addition',[...input,{...input[0],providerItemId:'synthetic-new',title:'Synthetic new game'}]]]){
  await area.set({galacticLibraryDatabase:base});writer=W.createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true});await writer.getQueryDatabase();const s=await writer.beginProviderScan('epic','Synthetic','full',false,1);reset();const t=now();await writer.commitProviderScan('epic',values,{syncMode:'full',fullSyncAt:new Date().toISOString()},SN.completeProviderSnapshot('epic',values,[SN.completedScope('library',values.length,values.length,'reported-count')]),s.scanToken,1);const elapsed=now()-t,counters={...metrics},saved=(await area.get({galacticLibraryDatabase:null})).galacticLibraryDatabase;
  check(Object.keys(saved.providerItems).length===size+values.length-input.length,'Changed save count');if(scenario==='removal')check(saved.providerHistory[input[0].recordRef].item.observedAt===old,'Removal history changed');rows.push({candidate:'current-writer-fallback',mode:scenario,totalMs:elapsed,...counters});
 }
 return {size,epicCount,baseBytes,normalizationMs,initialProofMs:proofMs,scopedReceiptBytes:bytes(receipt),compactReceiptBytes:bytes(compact),growth,controls,rows,limitations:['Post-normalization records/state come from the actual writer oracle; prototype is not a production equality classifier. Normalization workload measured separately.','Fresh modes recreate reader state and verify full digest, not actual service-worker suspension or browser-crash testing.','Publication, observers, query index reuse and authorization integrations remain design obligations.','No full DB writes in candidate rows; provider segmentation assumes migration already completed outside timing.','Native dispatch and promise settlement are wall time, not CPU/disk time; only current writer cooperative slices separate execution/wait.','Firefox results include fixture-only JSON realm reconstitution on reads, not a production storage change.']};
}
