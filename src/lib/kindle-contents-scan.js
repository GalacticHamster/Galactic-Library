/* Shared, bounded contents-scan lifecycle. No changes to fetch/extraction rules. */
(function attachContentsScan(global) {
  'use strict';
  const MAX_RESULTS = 20, CHECKPOINT_MS = 60000;
  function checkpointBuffer(clock = Date.now) {
    let entries = [], lastCheckpoint = clock();
    return {
      get size() { return entries.length; },
      add(entry) { if(entries.length >= MAX_RESULTS)throw Error('Save pending contents before continuing.');entries.push(entry); },
      due() { return entries.length >= MAX_RESULTS || entries.length > 0 && clock()-lastCheckpoint >= CHECKPOINT_MS; },
      async flush(save) {
        if (!entries.length) return 0;
        const batch=entries.slice();
        await save(batch); // Remove only acknowledged results. A failed save is retryable.
        entries=entries.slice(batch.length);lastCheckpoint=clock();return batch.length;
      }
    };
  }
  const phases=new Set(['preparing','running','checkpointing','paused','completed','stopped','interrupted']);
  const active=state=>['preparing','running','checkpointing'].includes(state?.phase);
  // UI-only gate: delayed checkpoint reads and gestures begun before a state
  // transition must never activate the controls installed by that transition.
  function refreshControlsState() {
    let revision=0,ready=false,result=null,gesture=null;
    return {
      get ready(){return ready;},get result(){return result;},
      begin(){ready=false;result=null;return ++revision;},
      resolve(token,value){if(token!==revision)return false;ready=Boolean(value?.ok);result=ready?value:null;return true;},
      invalidate(){ready=false;++revision;},
      captureGesture(){gesture={revision,ready};},
      allowGesture(requireReady=true){const previous=gesture;gesture=null;return (!requireReady||ready)&&(!previous||(!requireReady||previous.ready)&&previous.revision===revision);}
    };
  }
  const resumableRefresh=job=>['running','paused','interrupted','blocked'].includes(job?.status);
  function refreshRestartConfirmation(job) {
    return Number.isInteger(job?.cursor)&&Number.isInteger(job?.total)
      ? `Start a new refresh from the beginning? The existing completed/total progress (${job.cursor}/${job.total}) will be abandoned. Previously saved contents and source history will be kept.`
      : `Start a new refresh from the beginning?${job?.status==='stale'?' The saved refresh is incompatible and cannot be resumed.':''} Previously saved contents and source history will be kept.`;
  }
  function progress(value) {
    if (!/^[a-f0-9-]{36}$/iu.test(value?.runRef??'') || !phases.has(value?.phase)
      || !['scan','retry','rescan','reparse'].includes(value.mode)) throw Error('Invalid contents scan progress.');
    const result={runRef:value.runRef,phase:value.phase,mode:value.mode};
    for(const key of ['checked','total','found','empty','unavailable','failures','reparsed','durable','buffered']){
      if(!Number.isInteger(value[key])||value[key]<0||value[key]>500000)throw Error('Invalid contents scan counts.');result[key]=value[key];
    }
    if(result.checked>result.total||result.durable>result.checked||result.buffered>MAX_RESULTS
      ||result.found+result.empty+result.unavailable+result.failures>result.checked)throw Error('Inconsistent contents scan progress.');
    return result;
  }
  function progressHub(clock = Date.now) {
    const runs=new Map();
    function prune(){for(const state of runs.values())if(active(state)&&clock()-state.updatedAt>600000)state.phase='interrupted';}
    return {
      accept(tabId,value){
        if(!Number.isInteger(tabId)||tabId<0)throw Error('Contents progress requires a provider tab.');
        const next=progress(value),previous=runs.get(tabId);
        if(previous?.runRef===next.runRef&&(next.checked<previous.checked||next.durable<previous.durable))throw Error('Contents progress moved backwards.');
        runs.set(tabId,{...next,updatedAt:clock()});if(runs.size>8)runs.delete(runs.keys().next().value);return this.list();
      },
      hasActive(tabId){return active(runs.get(tabId));},
      interrupt(tabId){const state=runs.get(tabId);if(state&&active(state)){state.phase='interrupted';state.updatedAt=clock();}return this.list();},
      list(){prune();return [...runs.values()].map(({updatedAt,...state})=>({...state}));}
    };
  }
  global.GalacticContentsScan=Object.freeze({MAX_RESULTS,CHECKPOINT_MS,checkpointBuffer,progress,progressHub,active,refreshControlsState,resumableRefresh,refreshRestartConfirmation});
}(globalThis));
