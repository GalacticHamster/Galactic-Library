// Self-contained installed-test observer: row counts alone are not a save receipt.
export function observeReminderReview({button,status,list,expectedBefore,expectedAfter,timeoutMs=25000}){
 return new Promise(resolve=>{
  if(button.disabled||list.children.length!==expectedBefore){resolve({state:'not-started'});return;}
  status.textContent='';let settled=false;
  const finish=state=>{if(settled)return;settled=true;observer.disconnect();clearTimeout(timer);resolve({state,rows:list.children.length});};
  const check=()=>{const text=status.textContent;if(text==='Reminder review saved. Purchases and keys are unchanged.'&&list.children.length===expectedAfter)finish('saved');else if(text&&text!=='Reminder review saved. Purchases and keys are unchanged.')finish('failed');};
  const observer=new MutationObserver(check),timer=setTimeout(()=>finish('timed-out'),timeoutMs);
  observer.observe(status,{childList:true,characterData:true,subtree:true});observer.observe(list,{childList:true});
  try{button.click();}catch{finish('not-started');}
 });
}
