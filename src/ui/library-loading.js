import {createOperation} from './operation-feedback.js';

export function createLibraryLoader({panel,message,retry,content,load,paint}) {
  const operation=createOperation({id:'library-load',name:'Loading your library...',status:message,controls:[retry],paint});
  function refresh(...args){
    if(operation.busy)return operation.run(()=>{});
    panel.hidden=false;retry.hidden=true;content?.setAttribute?.('aria-busy','true');
    return operation.run(context=>load(context,...args),{success:'Library loaded.'}).then(result=>{
      panel.hidden=true;return result;
    },error=>{
      panel.hidden=false;retry.hidden=false;message.textContent='Could not load library: '+error.message;throw error;
    }).finally(()=>content?.setAttribute?.('aria-busy','false'));
  }
  return {refresh,get busy(){return operation.busy;}};
}
