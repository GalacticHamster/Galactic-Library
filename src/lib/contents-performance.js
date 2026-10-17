/* Local diagnostic timing only. Shared by classic content scripts and ES modules.
 * Never accept arbitrary event names, payloads, error strings or library data. */
(function attachContentsPerformance(global) {
  'use strict';
  const LIMIT = 50;
  const stages = new Set(['queue_prepare','request_dispatch','fetch_headers','response_body','dom_parse','extraction','page_checks','attempt','retry_wait','save_message','refresh_check_message','refresh_checkpoint_read','refresh_checkpoint_validate','refresh_checkpoint_write','refresh_identity_validation','refresh_projection_build','refresh_projection_hit','history_update','worker_total','writer_capture','writer_queue','storage_read','read_validation','migration_compare','migration_write','entry_validation','parsing','enrichment_update','canonical_rebuild','persist_validation','storage_write','candidate_selection','page_ui','throttle','options_read','options_render','options_other','options_total','options_workbench','options_dashboards','options_filters','options_selection','options_cards','options_reviews','options_coverage','validation_records','validation_history','validation_canonical','validation_other','handler_delay','query_authorization','query_snapshot','matching_index','matching_execution','response_dispatch']);
  const categories = new Set(['pending','statement-found','no-statement','unavailable','temporary-failure','captcha','sign-in','paused','save-failure','prepared','reparsed','failed','checkpointed']);
  for(const stage of ['snapshot_hit','snapshot_wait','snapshot_read','snapshot_validation','snapshot_canonical','snapshot_compare','snapshot_freeze','snapshot_clone','snapshot_retry','snapshot_migration','matching_index_build','matching_index_wait','matching_index_hit','matching_canonical','options_snapshot','client_round_trip','response_transport'])stages.add(stage);
  for(const stage of ['read_committed_compare','read_committed_clone','storage_set_dispatch','storage_set_wait','storage_change_compare'])stages.add(stage);
  for(const stage of ['provider_check_digest','provider_check_write'])stages.add(stage);
  for(const stage of ['read_certificate','read_certificate_retry','certificate_unavailable','certificate_missing','certificate_invalid','certificate_mismatch','certificate_error'])stages.add(stage);
  stages.add('matching_yield_wait');
  stages.add('validation_yield_wait');
  for(const stage of ['options_contents','options_feedback_paint','options_projection','options_filter_controls'])stages.add(stage);
  for(const stage of ['snapshot_certificate','certificate_read','certificate_serialize','certificate_hash','certificate_hit','certificate_miss','certificate_issue','matching_canonical_reuse'])stages.add(stage);
  for(const stage of ['provider_profile','provider_start','provider_fetch','provider_compare','provider_finish','provider_total','provider_profile_wait','provider_hint_ready','provider_hint_read','provider_hint_message','provider_profile_message','provider_hint_display','provider_verified_display'])stages.add(stage);
  const cleanClient=value=>({...Object.fromEntries(['beforeSendMs','localStorageMs','preparationMs','previousFlightMs','postResponseMs','pageToRenderedMs'].filter(key=>Number.isFinite(value?.[key])&&value[key]>=0&&value[key]<=300000).map(key=>[key,value[key]])),...(['rendered','superseded','incomplete'].includes(value?.renderOutcome)?{renderOutcome:value.renderOutcome}:{})});
  const cleanWork=value=>Object.fromEntries(['snapshot','index','execution'].filter(key=>value?.[key]).map(key=>[key,Object.fromEntries(['cpuMs','waitMs','maxWaitMs','yields'].filter(field=>Number.isFinite(value[key][field])&&value[key][field]>=0).map(field=>[field,value[key][field]]))]));
  function cleanSteam(value){
    if(!value||typeof value!=='object')return null;
    const bounded=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
    const fields=['ownedIdCount','candidateCount','attemptedCount','titleRequests','failedRequests','unresolvedCount','malformedRows','savedCount','saveRejectedCount','requestSamplesDropped'];
    const result=Object.fromEntries(fields.filter(key=>bounded(value[key])).map(key=>[key,value[key]]));
    const kinds=['games','dlc','unsupported','absent','missingTitle','invalidTitle','invalidType','conflictingDuplicate','missing','http','authentication','malformed','classification','network','other'];
    result.outcomes=Object.fromEntries(kinds.map(key=>[key,bounded(value.outcomes?.[key])?value.outcomes[key]:0]));
    if(!bounded(result.attemptedCount)||Object.values(result.outcomes).reduce((sum,n)=>sum+n,0)!==result.attemptedCount)return null;
    if(typeof value.ownedListRead==='boolean')result.ownedListRead=value.ownedListRead;
    if(value.outcomeVersion===2)result.outcomeVersion=2;
    if(Array.isArray(value.requests))result.requests=value.requests.slice(0,32).map(row=>Object.fromEntries(['requestedCount','returnedRowCount','matchedIdCount','absentCount','unexpectedRowCount','malformedRowCount','duplicateRowCount','httpStatus'].filter(key=>key==='httpStatus'?Number.isInteger(row?.[key])&&row[key]>=100&&row[key]<=599:bounded(row?.[key])).map(key=>[key,row[key]])));
    result.httpStatuses=Object.fromEntries(Object.entries(value.httpStatuses??{}).filter(([key,n])=>/^[1-5]\d{2}$/u.test(key)&&bounded(n)).slice(0,500));
    result.unsupportedTypes=Object.fromEntries(Object.entries(value.unsupportedTypes??{}).filter(([key,n])=>(key==='other'||/^-?\d{1,6}$/u.test(key))&&bounded(n)).slice(0,32));
    const first=value.firstFailure;
    if(['owned-list','titles','save'].includes(first?.stage)&&kinds.includes(first.kind))result.firstFailure={stage:first.stage,kind:first.kind,...(Number.isInteger(first.httpStatus)&&first.httpStatus>=100&&first.httpStatus<=599?{httpStatus:first.httpStatus}:{})};
    if(['pending','committed','rejected','unconfirmed'].includes(value.saveState))result.saveState=value.saveState;
    return result;
  }
  const now = () => performance.timeOrigin + performance.now();
  const validId = id => /^lookup-[a-f0-9]{12}-\d{3,6}$/u.test(id ?? '');
  function trace(id, kind = 'network', clock = now, startAt = null) {
    if (!validId(id)) return null;
    const start = Number.isFinite(startAt)?startAt:clock(), events = [];
    function begin(stage, attempt = 0) {
      const at = clock();let ended=false;
      return () => {
        if(ended)return;ended=true;
        if (stages.has(stage) && events.length < 512 && Number.isInteger(attempt) && attempt >= 0 && attempt <= 3) events.push({stage,attempt,startMs:at-start,durationMs:Math.max(0,clock()-at)});
      };
    }
    return {id, kind, start, events, begin, clock, totalMs:0, result:'pending', attempts:0, batchSize:0, visibilityStart:'unknown',visibilityEnd:'unknown',focusStart:false,focusEnd:false,
      finish(result = 'pending') { this.result = categories.has(result) ? result : 'failed'; this.totalMs = Math.max(0,clock()-start); return this; }};
  }
  function clean(value) {
    if (!validId(value?.id)) return null;
    return {id:value.id,kind:['network','reparse','prepare','options','checkpoint','companion','provider'].includes(value.kind)?value.kind:'network',startEpochMs:Number.isFinite(value.startEpochMs??value.start)?value.startEpochMs??value.start:0,totalMs:Math.max(0,Number(value.totalMs)||0),result:categories.has(value.result)?value.result:'failed',attempts:Math.min(3,Math.max(0,Number(value.attempts)||0)),batchSize:Math.min(100,Math.max(0,Number(value.batchSize)||0)),visibilityStart:['visible','hidden'].includes(value.visibilityStart)?value.visibilityStart:'unknown',visibilityEnd:['visible','hidden'].includes(value.visibilityEnd)?value.visibilityEnd:'unknown',focusStart:value.focusStart===true,focusEnd:value.focusEnd===true,
      ...(value.scheduling&&Number.isSafeInteger(value.scheduling.yields)&&value.scheduling.yields>=0&&Number.isFinite(value.scheduling.maxSliceMs)&&value.scheduling.maxSliceMs>=0&&Number.isFinite(value.scheduling.cpuMs)&&value.scheduling.cpuMs>=0?{scheduling:{yields:value.scheduling.yields,maxSliceMs:value.scheduling.maxSliceMs,cpuMs:value.scheduling.cpuMs,...(Number.isFinite(value.scheduling.waitMs)&&value.scheduling.waitMs>=0&&Number.isFinite(value.scheduling.maxWaitMs)&&value.scheduling.maxWaitMs>=0?{waitMs:value.scheduling.waitMs,maxWaitMs:value.scheduling.maxWaitMs}:{})}}:{}),
      ...(Number.isSafeInteger(value.snapshotSequence)&&value.snapshotSequence>=0?{snapshotSequence:value.snapshotSequence}:{}),
      ...(Number.isSafeInteger(value.requestItemCount)&&value.requestItemCount>=0&&value.requestItemCount<=500?{requestItemCount:value.requestItemCount}:{}),
      ...(Number.isSafeInteger(value.requestContentsCount)&&value.requestContentsCount>=0&&value.requestContentsCount<=20000?{requestContentsCount:value.requestContentsCount}:{}),
      ...(/^[a-f0-9]{12}$/u.test(value.worker??'')?{worker:value.worker}:{}),
      ...(Number.isFinite(value.workerStartedEpochMs)?{workerStartedEpochMs:value.workerStartedEpochMs}:{}),
      ...(value.work?{work:cleanWork(value.work)}:{}),
      ...Object.fromEntries(['recordsRead','recordsWritten','recordsNormalized','providerCandidates','providerCaptured','providerUnresolved','providerUnsupported','providerFailedRequests'].filter(key=>Number.isSafeInteger(value[key])&&value[key]>=0&&value[key]<=10000000).map(key=>[key,value[key]])),
      ...(value.validationWork?{validationWork:Object.fromEntries(['executingMs','waitMs','yields'].filter(key=>Number.isFinite(value.validationWork[key])&&value.validationWork[key]>=0).map(key=>[key,value.validationWork[key]]))}:{}),
      ...(value.provider==='steam'&&cleanSteam(value.steamDiagnostics)?{steamDiagnostics:cleanSteam(value.steamDiagnostics)}:{}),
      ...(['profile','hint','account','start','finish','scan'].includes(value.providerPhase)?{providerPhase:value.providerPhase}:{}),
      ...(['found','missing','ambiguous','invalid'].includes(value.profileHintStatus)?{profileHintStatus:value.profileHintStatus}:{}),
      ...(['steam','gog','epic','humble','fanatical','kindle','kobo','audible','amazon-games','amazon-video','fandango-at-home'].includes(value.provider)?{provider:value.provider}:{}),
      ...(value.client?{client:cleanClient(value.client)}:{}),
      events:(Array.isArray(value.events)?value.events:[]).filter(event=>stages.has(event?.stage)&&Number.isFinite(event.startMs)&&Number.isFinite(event.durationMs)&&event.startMs>=0&&event.durationMs>=0).slice(0,512).map(event=>({stage:event.stage,attempt:Number.isInteger(event.attempt)&&event.attempt>=0&&event.attempt<=3?event.attempt:0,startMs:event.startMs,durationMs:event.durationMs}))};
  }
  const sum = (record,stage) => record.events.filter(event=>event.stage===stage).reduce((total,event)=>total+event.durationMs,0);
  function breakdown(record) {
    const network=sum(record,'fetch_headers')+sum(record,'response_body');
    const processing=sum(record,'dom_parse')+sum(record,'page_checks')+sum(record,'extraction')+sum(record,'parsing');
    const persistence=sum(record,'storage_read')+sum(record,'read_validation')+sum(record,'read_committed_compare')+sum(record,'read_committed_clone')+sum(record,'migration_compare')+sum(record,'migration_write')+sum(record,'persist_validation')+sum(record,'storage_write');
    const recomputation=sum(record,'canonical_rebuild')+sum(record,'enrichment_update')+sum(record,'entry_validation')+sum(record,'candidate_selection')+sum(record,'refresh_identity_validation')+sum(record,'refresh_projection_build')+sum(record,'refresh_projection_hit');
    const history=sum(record,'history_update');
    const checkpoint=sum(record,'refresh_checkpoint_read')+sum(record,'refresh_checkpoint_validate')+sum(record,'refresh_checkpoint_write');
    const worker=sum(record,'worker_total');
    const transfer=sum(record,record.kind==='prepare'?'queue_prepare':record.kind==='reparse'?'request_dispatch':'save_message')+sum(record,'refresh_check_message');
    const messaging=Math.max(0,transfer-worker)+sum(record,'writer_capture')+sum(record,'writer_queue');
    const workerOther=Math.max(0,worker-persistence-recomputation-history-checkpoint-sum(record,'parsing')-sum(record,'writer_capture')-sum(record,'writer_queue'));
    const ui=sum(record,'page_ui'), throttle=sum(record,'throttle'), retry=sum(record,'retry_wait');
    const accounted=network+processing+persistence+recomputation+history+checkpoint+messaging+workerOther+ui+throttle+retry;
    return {total:record.totalMs,network,processing,parsing:sum(record,'parsing'),extraction:sum(record,'extraction'),persistence,recomputation,history,checkpoint,messaging,workerOther,ui,throttle,retry,unexplained:Math.max(0,record.totalMs-accounted),accountingOverlap:Math.max(0,accounted-record.totalMs)};
  }
  function stats(values) {
    if (!values.length) return {count:0,min:null,median:null,mean:null,p90:null,p95:null,max:null};
    const sorted=[...values].sort((a,b)=>a-b),percent=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
    return {count:sorted.length,min:sorted[0],median:sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2,mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,p90:percent(.9),p95:percent(.95),max:sorted.at(-1)};
  }
  function aggregate(records, project = true) {
    const rows=records.map(breakdown), summary={};
    for (const key of Object.keys(rows[0]??{})) summary[key]=stats(rows.map(row=>row[key]));
    const total=summary.total;
    return {stagesMs:summary,rawStagesMs:Object.fromEntries([...stages].map(stage=>[stage,stats(records.filter(record=>record.events.some(event=>event.stage===stage)).map(record=>sum(record,stage)))])),itemsPerHour:project&&total?{mean:total.mean?3600000/total.mean:null,median:total.median?3600000/total.median:null}:null,estimated2894Hours:project&&total?{mean:total.mean*2894/3600000,median:total.median*2894/3600000}:null,percentOfTotal:total?.mean?Object.fromEntries(['network','processing','persistence','recomputation','history','checkpoint','messaging','workerOther','ui','throttle','retry','unexplained'].map(stage=>[stage,100*summary[stage].mean/total.mean])):{}};
  }
  function collector() {
    const records=[];
    return {add(value) {const record=clean(value);if(record){records.push(record);if(records.length>LIMIT)records.shift();}return record;},annotate(id,events,client){const index=records.findIndex(row=>row.id===id);if(index>=0)records[index]=clean({...records[index],...(client?{client:{...records[index].client,...cleanClient(client)}}:{}),events:[...records[index].events,...events]});},clear(){records.length=0;},report(options=[],companions=[]) {
      const network=records.filter(record=>record.kind==='network'),ordinary=network.filter(record=>record.attempts===1&&!['temporary-failure','captcha','sign-in','paused','save-failure'].includes(record.result));
      const group=key=>Object.fromEntries([...new Set(network.map(key))].map(value=>[value,aggregate(network.filter(record=>key(record)===value))]));
      const joinedOptions=options.map(clean).filter(Boolean).slice(-LIMIT);
      const queryRows=companions.map(clean).filter(record=>record?.kind==='companion').slice(-LIMIT);
      const companionStatsMs=Object.fromEntries(['handler_delay','query_authorization','query_snapshot','snapshot_hit','snapshot_wait','snapshot_read','snapshot_validation','snapshot_canonical','snapshot_compare','snapshot_freeze','snapshot_retry','matching_index','matching_index_build','matching_index_wait','matching_index_hit','matching_canonical','matching_execution','response_dispatch','client_round_trip','response_transport'].map(stage=>[stage,stats(queryRows.filter(record=>record.events.some(event=>event.stage===stage)).map(record=>sum(record,stage)))]));
      return {format:1,limit:LIMIT,units:'milliseconds',note:'Options rendering is asynchronous and may overlap the page lifecycle; it is reported separately. Fetch headers are not wire-level time-to-first-byte. Epoch offsets across contexts have clock precision/scheduling noise.',records:records.map(record=>({...record,timingMs:breakdown(record)})),aggregates:{network:aggregate(network),ordinary:aggregate(ordinary),retry:aggregate(network.filter(record=>record.attempts>1)),byResult:group(record=>record.result),byVisibility:group(record=>record.visibilityStart===record.visibilityEnd?record.visibilityStart:'changed'),byFocus:group(record=>record.focusStart===record.focusEnd?(record.focusStart?'focused':'unfocused'):'changed'),reparse:aggregate(records.filter(record=>record.kind==='reparse'),false),prepare:aggregate(records.filter(record=>record.kind==='prepare'),false),checkpoints:aggregate(records.filter(record=>record.kind==='checkpoint'),false)},finalCheckpointMs:records.filter(record=>record.kind==='checkpoint').reduce((total,record)=>total+record.totalMs,0),companions:queryRows,companionStatsMs,options:joinedOptions,optionsStatsMs:Object.fromEntries(['options_read','options_render','options_other','options_total','options_workbench','options_dashboards','options_filters','options_selection','options_cards','options_reviews','options_coverage'].map(stage=>[stage,stats(joinedOptions.filter(record=>record.events.some(event=>event.stage===stage)).map(record=>sum(record,stage)))]))};
    }};
  }
  function merge(target, value) {
    const record=clean(value);if(!target||!record||target.id!==record.id)return;
    for(const event of record.events)if(target.events.length<512)target.events.push({...event,startMs:Math.max(0,record.startEpochMs-target.start+event.startMs)});
    for(const key of ['recordsRead','recordsWritten','recordsNormalized'])if(record[key]!==undefined)target[key]=(target[key]??0)+record[key];
    if(record.validationWork){target.validationWork??={executingMs:0,waitMs:0,yields:0};for(const key of ['executingMs','waitMs','yields'])target.validationWork[key]+=(record.validationWork[key]??0);}
  }
  global.GalacticContentsPerformance=Object.freeze({LIMIT,now,validId,trace,clean,sum,breakdown,stats,aggregate,collector,merge});
}(globalThis));
