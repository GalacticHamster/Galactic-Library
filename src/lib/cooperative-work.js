// Sync callers and the worker consume exactly the same checked computation.
// A timer (not a resolved Promise) lets queued runtime messages execute.
export function finishWork(steps){let next;do{next=steps.next();}while(!next.done);return next.value;}
export async function finishWorkAsync(steps,{budgetMs=8,clock=()=>performance.now(),yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0)),onStage=()=>{},onSlice=()=>{}}={}){
  let started=clock();
  for(;;){
    const next=steps.next();if(next.done){onSlice(clock()-started,false);return next.value;}
    if(typeof next.value==='string')onStage(next.value);
    const duration=clock()-started;
    if(duration>=budgetMs){onSlice(duration,true);await yieldTask();started=clock();}
  }
}
