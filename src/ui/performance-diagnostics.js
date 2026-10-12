import '../lib/contents-performance.js';
import {afterFeedbackPaint} from './operation-feedback.js';

function downloadSummary(summary){
  const url=URL.createObjectURL(new Blob([JSON.stringify(summary,null,2)],{type:'application/json'}));
  const link=Object.assign(document.createElement('a'),{href:url,download:'GL-timing-export.json'});
  document.body.append(link);
  try{link.click();}finally{link.remove();URL.revokeObjectURL(url);}
}

export function bindPerformanceDiagnostics({button,status,worker,runtime,download=downloadSummary}){
  button.addEventListener('click',async()=>{
    if(button.disabled)return;
    button.disabled=true;status.textContent='Exporting timing summary…';
    await afterFeedbackPaint();
    try{
      const response=await runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'});
      if(!response?.ok)throw Error('Could not read worker diagnostics.');
      const summary={...globalThis.GalacticContentsPerformance.collector().report(response.records??[],response.companions??[]),providers:response.providers??[],activity:response.activity,lifecycle:response.lifecycle};
      const activity=response.activity;
      worker.textContent=activity?.worker&&Number.isFinite(activity.startedEpochMs)
        ?`Worker at last export: ${activity.worker}; started ${new Date(activity.startedEpochMs).toLocaleString()}.`
        :'Worker details are unavailable.';
      download(summary);
      status.textContent=`Timing summary handed to your browser (${summary.companions.length} companion lookups, ${summary.options.length} Options timings).`;
    }catch(error){status.textContent=`Export failed: ${error.message}`;}
    finally{button.disabled=false;}
  });
}
