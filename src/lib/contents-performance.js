/* Local, opt-in timing only. Shared by classic content scripts and ES modules.
 * Never accept arbitrary event names, payloads, error strings or library data. */
(function attachContentsPerformance(global) {
  'use strict';
  const LIMIT = 50;
  const stages = new Set(['queue_prepare','request_dispatch','fetch_headers','response_body','dom_parse','extraction','page_checks','attempt','retry_wait','save_message','worker_total','writer_capture','writer_queue','storage_read','read_validation','migration_compare','migration_write','entry_validation','parsing','enrichment_update','canonical_rebuild','persist_validation','storage_write','candidate_selection','page_ui','throttle','options_read','options_render','options_other','options_total','options_workbench','options_dashboards','options_filters','options_selection','options_cards','options_reviews','options_coverage']);
  const categories = new Set(['pending','statement-found','no-statement','unavailable','temporary-failure','captcha','sign-in','paused','save-failure','prepared','reparsed','failed','checkpointed']);
  const now = () => performance.timeOrigin + performance.now();
  const validId = id => /^lookup-[a-f0-9]{12}-\d{3,6}$/u.test(id ?? '');
  function trace(id, kind = 'network', clock = now) {
    if (!validId(id)) return null;
    const start = clock(), events = [];
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
    return {id:value.id,kind:['network','reparse','prepare','options','checkpoint'].includes(value.kind)?value.kind:'network',startEpochMs:Number.isFinite(value.startEpochMs??value.start)?value.startEpochMs??value.start:0,totalMs:Math.max(0,Number(value.totalMs)||0),result:categories.has(value.result)?value.result:'failed',attempts:Math.min(3,Math.max(0,Number(value.attempts)||0)),batchSize:Math.min(100,Math.max(0,Number(value.batchSize)||0)),visibilityStart:['visible','hidden'].includes(value.visibilityStart)?value.visibilityStart:'unknown',visibilityEnd:['visible','hidden'].includes(value.visibilityEnd)?value.visibilityEnd:'unknown',focusStart:value.focusStart===true,focusEnd:value.focusEnd===true,
      events:(Array.isArray(value.events)?value.events:[]).filter(event=>stages.has(event?.stage)&&Number.isFinite(event.startMs)&&Number.isFinite(event.durationMs)&&event.startMs>=0&&event.durationMs>=0).slice(0,512).map(event=>({stage:event.stage,attempt:Number.isInteger(event.attempt)&&event.attempt>=0&&event.attempt<=3?event.attempt:0,startMs:event.startMs,durationMs:event.durationMs}))};
  }
  const sum = (record,stage) => record.events.filter(event=>event.stage===stage).reduce((total,event)=>total+event.durationMs,0);
  function breakdown(record) {
    const network=sum(record,'fetch_headers')+sum(record,'response_body');
    const processing=sum(record,'dom_parse')+sum(record,'page_checks')+sum(record,'extraction')+sum(record,'parsing');
    const persistence=sum(record,'storage_read')+sum(record,'read_validation')+sum(record,'migration_compare')+sum(record,'migration_write')+sum(record,'persist_validation')+sum(record,'storage_write');
    const recomputation=sum(record,'canonical_rebuild')+sum(record,'enrichment_update')+sum(record,'entry_validation')+sum(record,'candidate_selection');
    const worker=sum(record,'worker_total');
    const transfer=sum(record,record.kind==='prepare'?'queue_prepare':record.kind==='reparse'?'request_dispatch':'save_message');
    const messaging=Math.max(0,transfer-worker)+sum(record,'writer_capture')+sum(record,'writer_queue');
    const workerOther=Math.max(0,worker-persistence-recomputation-sum(record,'parsing')-sum(record,'writer_capture')-sum(record,'writer_queue'));
    const ui=sum(record,'page_ui'), throttle=sum(record,'throttle'), retry=sum(record,'retry_wait');
    const accounted=network+processing+persistence+recomputation+messaging+workerOther+ui+throttle+retry;
    return {total:record.totalMs,network,processing,parsing:sum(record,'parsing'),extraction:sum(record,'extraction'),persistence,recomputation,messaging,workerOther,ui,throttle,retry,unexplained:Math.max(0,record.totalMs-accounted),accountingOverlap:Math.max(0,accounted-record.totalMs)};
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
    return {stagesMs:summary,rawStagesMs:Object.fromEntries([...stages].map(stage=>[stage,stats(records.filter(record=>record.events.some(event=>event.stage===stage)).map(record=>sum(record,stage)))])),itemsPerHour:project&&total?{mean:total.mean?3600000/total.mean:null,median:total.median?3600000/total.median:null}:null,estimated2894Hours:project&&total?{mean:total.mean*2894/3600000,median:total.median*2894/3600000}:null,percentOfTotal:total?.mean?Object.fromEntries(['network','processing','persistence','recomputation','messaging','workerOther','ui','throttle','retry','unexplained'].map(stage=>[stage,100*summary[stage].mean/total.mean])):{}};
  }
  function collector() {
    const records=[];
    return {add(value) {const record=clean(value);if(record){records.push(record);if(records.length>LIMIT)records.shift();}return record;},clear(){records.length=0;},report(options=[]) {
      const network=records.filter(record=>record.kind==='network'),ordinary=network.filter(record=>record.attempts===1&&!['temporary-failure','captcha','sign-in','paused','save-failure'].includes(record.result));
      const group=key=>Object.fromEntries([...new Set(network.map(key))].map(value=>[value,aggregate(network.filter(record=>key(record)===value))]));
      const joinedOptions=options.map(clean).filter(Boolean).filter(record=>records.some(sample=>sample.id===record.id)).slice(-LIMIT);
      return {format:1,limit:LIMIT,units:'milliseconds',note:'Options rendering is asynchronous and may overlap the page lifecycle; it is reported separately. Fetch headers are not wire-level time-to-first-byte. Epoch offsets across contexts have clock precision/scheduling noise.',records:records.map(record=>({...record,timingMs:breakdown(record)})),aggregates:{network:aggregate(network),ordinary:aggregate(ordinary),retry:aggregate(network.filter(record=>record.attempts>1)),byResult:group(record=>record.result),byVisibility:group(record=>record.visibilityStart===record.visibilityEnd?record.visibilityStart:'changed'),byFocus:group(record=>record.focusStart===record.focusEnd?(record.focusStart?'focused':'unfocused'):'changed'),reparse:aggregate(records.filter(record=>record.kind==='reparse'),false),prepare:aggregate(records.filter(record=>record.kind==='prepare'),false),checkpoints:aggregate(records.filter(record=>record.kind==='checkpoint'),false)},finalCheckpointMs:records.filter(record=>record.kind==='checkpoint').reduce((total,record)=>total+record.totalMs,0),options:joinedOptions,optionsStatsMs:Object.fromEntries(['options_read','options_render','options_other','options_total','options_workbench','options_dashboards','options_filters','options_selection','options_cards','options_reviews','options_coverage'].map(stage=>[stage,stats(joinedOptions.filter(record=>record.events.some(event=>event.stage===stage)).map(record=>sum(record,stage)))]))};
    }};
  }
  function merge(target, value) {
    const record=clean(value);if(!target||!record||target.id!==record.id)return;
    for(const event of record.events)if(target.events.length<512)target.events.push({...event,startMs:Math.max(0,record.startEpochMs-target.start+event.startMs)});
  }
  global.GalacticContentsPerformance=Object.freeze({LIMIT,now,validId,trace,clean,sum,breakdown,stats,aggregate,collector,merge});
}(globalThis));
