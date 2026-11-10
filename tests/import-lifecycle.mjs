// Browser-test helper: observe the actual busy transition before accepting completion.
// Self-contained so native drivers can execute its exact source in either browser.
export function observeImportLifecycle({button,status,timeoutMs=25000}){
  return new Promise(resolve=>{
    let started=false,settled=false;
    const finish=(state,reason)=>{if(settled)return;settled=true;observer.disconnect();clearTimeout(timer);resolve({state,started,reason,message:status.textContent});};
    const observer=new MutationObserver(records=>{
      // oldValue also catches a complete busy cycle delivered in one microtask.
      if(records.some(r=>r.type==='attributes'&&r.attributeName==='data-busy'&&(r.oldValue==='true'||status.dataset.busy==='true')))started=true;
      if(started&&!status.dataset.busy){
        const message=status.textContent;
        if(/(?:import failed|could not confirm|could not be saved)/iu.test(message))finish('failed');
        else if(/^(?:Full import|Quick update) completed\n\n(?:(?:Checked [\d,]+ purchases?\.|No purchases needed checking\.) (?:Imported [\d,]+ new items?\.|No new items found\.)|No purchases found in your account\.)\n\n[\d,]+ items? in your library\.$/u.test(message))finish('succeeded');
        else if(/^(?:Full import|Quick update) partially completed\n\n(?:Couldn't check [\d,]+ purchases?[^\n]*|Part of your purchase list couldn't be checked[^\n]*|Some purchase details couldn't be verified[^\n]*)\n\n(?:Saved [\d,]+ purchases?[^\n]*|Added [\d,]+ new items?[^\n]*|No purchases were saved\.[^\n]*)Earlier records were preserved\.$/u.test(message))finish('partial');
        else finish('unconfirmed','completion-message-missing');
      }
    });
    const timer=setTimeout(()=>finish('timed-out',started?'completion-not-observed':'import-not-started'),timeoutMs);
    observer.observe(status,{attributes:true,attributeOldValue:true,attributeFilter:['data-busy'],childList:true,characterData:true,subtree:true});
    if(button.disabled||status.dataset.busy){finish('not-started',button.disabled?'button-disabled':'already-running');return;}
    try{button.click();}catch(error){finish('not-started','click-rejected');}
  });
}
