import '../lib/kindle-contents-scan.js';

// This view receives counts only. Library reads/renders stay at bounded
// reconciliation boundaries rather than competing with every page lookup.
export function createContentsScanProgress({runtime, reconcile, container, clock=Date.now,
  schedule=setTimeout, cancel=clearTimeout}) {
  const tools=globalThis.GalacticContentsScan;
  const element=document.createElement('section');element.id='kindle-contents-progress';element.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh library now';
  element.append(status,refresh);container.prepend(element);
  let runs=[],dirty=false,lastFull=clock(),refreshing=null,timer=null,changedDuringRefresh=false;
  const active=()=>runs.some(tools.active);
  function fullRefresh() {
    if(refreshing)return refreshing;
    dirty=false;changedDuringRefresh=false;lastFull=clock();
    refreshing=Promise.resolve().then(reconcile).catch(()=>{dirty=true;}).finally(()=>{
      refreshing=null;
      if(changedDuringRefresh&&!active())fullRefresh();
      else if(dirty&&!active()&&timer===null)timer=schedule(poll,30000);
    });
    return refreshing;
  }
  function render() {
    element.hidden=!runs.length;
    status.textContent=runs.map(run=>`Kindle contents ${run.phase}: ${run.checked}/${run.total} checked; ${run.total-run.checked} remaining; ${run.found} statements found; ${run.empty} no contents; ${run.unavailable} unavailable; ${run.failures} failed; ${run.reparsed} locally reparsed. ${run.buffered} results waiting to save.`).join(' ');
  }
  function accept(values) {
    const wasActive=active();
    try{runs=values.slice(0,8).map(tools.progress);}catch{return;}
    if(wasActive&&!active()){dirty=true;if(refreshing)changedDuringRefresh=true;}
    render();
    if(dirty&&(!active()||clock()-lastFull>=120000))fullRefresh();
    if(active()&&timer===null)timer=schedule(poll,30000);
    if(!active()&&timer!==null){cancel(timer);timer=null;}
  }
  async function poll() {
    timer=null;
    try{const response=await runtime.sendMessage({type:'GET_KINDLE_CONTENTS_SCAN_PROGRESS'});accept(response?.ok?response.runs??[]:[]);}catch{
      // Worker/tab interruption must not leave the Library view stale forever.
      accept([]);
    }
    if(dirty&&clock()-lastFull>=120000)fullRefresh();
  }
  refresh.addEventListener('click',()=>{dirty=true;fullRefresh();});
  return {element,accept,initialize:poll,changed(){dirty=true;if(refreshing)changedDuringRefresh=true;if(!active()||clock()-lastFull>=120000)fullRefresh();},get running(){return active();},dispose(){if(timer!==null)cancel(timer);element.remove();}};
}
