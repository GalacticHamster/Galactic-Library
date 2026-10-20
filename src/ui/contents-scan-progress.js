import '../lib/kindle-contents-scan.js';
import {performAction} from './operation-feedback.js';

// This view receives counts only. Library reads/renders stay at bounded
// reconciliation boundaries rather than competing with every page lookup.
export function createContentsScanProgress({runtime, reconcile, container, clock=Date.now,
  schedule=setTimeout, cancel=clearTimeout}) {
  const tools=globalThis.GalacticContentsScan;
  const element=document.createElement('section');element.id='kindle-contents-progress';element.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');
  const details=document.createElement('details');details.className='technical-details';
  const detailsSummary=document.createElement('summary');detailsSummary.textContent='Show scan details';
  const detailsList=document.createElement('ul');
  details.append(detailsSummary,detailsList);
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh library now';
  const feedback=document.createElement('p');feedback.setAttribute('role','status');element.append(status,details,refresh,feedback);container.prepend(element);
  let runs=[],dirty=false,lastFull=clock(),refreshing=null,timer=null,changedDuringRefresh=false;
  const active=()=>runs.some(tools.active);
  function fullRefresh() {
    if(refreshing)return refreshing;
    dirty=false;changedDuringRefresh=false;lastFull=clock();
    refreshing=performAction({button:refresh,status:feedback,name:'Updating the Library view...',task:reconcile,success:'Library view updated.'}).catch(()=>{dirty=true;}).finally(()=>{
      refreshing=null;
      if(changedDuringRefresh&&!active())fullRefresh();
      else if(dirty&&!active()&&timer===null)timer=schedule(poll,30000);
    });
    return refreshing;
  }
  function render() {
    element.hidden=!runs.length;
    status.textContent=runs.map(run=>{
      const phasePrefix=run.phase==='completed'?'Kindle contents check completed':run.phase==='paused'?'Kindle contents check paused':'Checking Kindle book contents';
      let msg=`${phasePrefix}: ${run.checked} of ${run.total} books checked (${run.total-run.checked} remaining).`;
      if(run.failures||run.unavailable)msg+=" Some books couldn't be checked; you can retry later.";
      if(run.buffered)msg+=` ${run.buffered} result${run.buffered===1?'':'s'} waiting to save.`;
      return msg;
    }).join(' ');
    detailsList.replaceChildren();
    for(const run of runs){
      for(const [label,val] of [
        ['Statements found',run.found],
        ['Contents not extracted',run.empty],
        ['Pages unavailable',run.unavailable],
        ['Retryable failures',run.failures],
        ['Locally reparsed',run.reparsed],
        ['Results waiting to save',run.buffered]
      ]){
        const item=document.createElement('li');item.textContent=`${label}: ${val}`;detailsList.append(item);
      }
    }
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
    try{const response=await runtime.sendMessage({type:'GET_KINDLE_CONTENTS_SCAN_PROGRESS'});if(!response?.ok)throw Error('Scan status unavailable');accept(response.runs??[]);}catch{
      // Preserve last-known counters; an unavailable worker is not scan completion.
      element.hidden=false;feedback.textContent='Could not check scan progress. These are the last reported counts; refresh to try again.';dirty=true;
    }
    if(dirty&&clock()-lastFull>=120000)fullRefresh();
  }
  refresh.addEventListener('click',()=>{dirty=true;fullRefresh();});
  return {element,accept,initialize:poll,changed(){dirty=true;if(refreshing)changedDuringRefresh=true;if(!active()||clock()-lastFull>=120000)fullRefresh();},get running(){return active();},dispose(){if(timer!==null)cancel(timer);element.remove();}};
}
