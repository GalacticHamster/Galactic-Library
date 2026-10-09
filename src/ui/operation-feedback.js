// Page-local feedback only: no library state, timers for fake progress, or new API.
export function afterFeedbackPaint() {
  if(typeof requestAnimationFrame!=='function'||globalThis.document?.hidden)return Promise.resolve();
  return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
}

let sequence=0;
export function createOperation({id,name,scope=id,status,controls=[],paint=afterFeedbackPaint,changed=()=>{},cancel}) {
  const token=++sequence;
  let state={id,name,scope,state:'idle',startedAt:null,canCancel:typeof cancel==='function'},pending=null,active=false;
  const publish=patch=>{
    state={...state,...patch};
    if(status){
      status.setAttribute?.('role','status');status.setAttribute?.('aria-live','polite');status.setAttribute?.('aria-atomic','true');
      status.setAttribute?.('aria-busy',String(active));status.dataset&&(status.dataset.operationState=state.state);
      status.classList?.add('operation-status');
      status.textContent=state.message||state.phase||state.name;
    }
    changed({...state});
    if(globalThis.document?.dispatchEvent&&typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent('gl-operation-state',{detail:{token,id,name,scope,state:state.state,message:state.message,startedAt:state.startedAt}}));
  };
  function run(task,{message=name,success='Done.'}={}){
    if(active)return pending??Promise.reject(Error('This operation is already starting.'));
    active=true;
    const prior=controls.map(control=>({control,disabled:control.disabled}));
    for(const control of controls){control.disabled=true;control.setAttribute?.('aria-busy','true');}
    publish({state:'starting',startedAt:Date.now(),phase:null,completed:null,total:null,message,result:undefined,error:undefined});
    const context={
      update(message,counts={}){
        if(counts.total!==undefined&&(!Number.isFinite(counts.total)||counts.total<0||!Number.isFinite(counts.completed)||counts.completed<0||counts.completed>counts.total))throw Error('Invalid operation progress.');
        publish({message,...counts});
      },
      async phase(message){publish({phase:message,message});await paint();}
    };
    pending=(async()=>{
      try{
        await paint();publish({state:'running'});
        const result=await task(context);
        active=false;publish({state:result?.cancelled?'cancelled':'succeeded',message:typeof success==='function'?success(result):result?.cancelled?result.message??'Cancelled.':success,result});return result;
      }catch(error){active=false;publish({state:'failed',message:error.message,error});throw error;}
      finally{active=false;pending=null;for(const {control,disabled}of prior){control.disabled=disabled;control.removeAttribute?.('aria-busy');}}
    })();
    return pending;
  }
  return {run,cancel(){if(!active||typeof cancel!=='function')return false;return cancel();},get busy(){return active;},get state(){return {...state};}};
}

export function bindOperationSummary(element,root=document){
  const active=new Map();let latest,failure;
  root.addEventListener('gl-operation-state',({detail})=>{
    if(detail.id==='library-load')return;
    if(['starting','running'].includes(detail.state)){active.set(detail.token,detail);if(failure?.id===detail.id&&failure?.scope===detail.scope)failure=null;}
    else{active.delete(detail.token);latest=detail;if(detail.state==='failed')failure=detail;}
    element.hidden=!active.size&&!latest;
    element.textContent=[failure?.message,active.size?[...active.values()].map(value=>value.message||value.name).join(' '):failure?'':latest.message].filter(Boolean).join(' ');
    element.setAttribute('aria-busy',String(active.size>0));element.dataset.operationState=failure?'failed':active.size?'running':latest.state;
  });
}

const scopedOperations=new WeakMap();
// Forms sharing a status also share a submission guard, even if rerendered.
export function performAction({button,status,controls,name='Saving changes...',task,success='Saved.',paint}){
  const scope=status??button;
  let operation=scopedOperations.get(scope);
  if(!operation||!operation.busy){operation=createOperation({id:name,name,status,controls:controls??[...new Set([...(button?[button]:[]),...status?.parentElement?.querySelectorAll('button,input,select,textarea')??[]])],paint});scopedOperations.set(scope,operation);}
  return operation.run(task,{message:name,success});
}
