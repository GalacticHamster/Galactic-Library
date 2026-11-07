/* ISOLATED world: ordinary GL profile lease and atomic import, no credentials. */
(function(){
  'use strict';
  if(location.origin!=='https://accounts.nintendo.com'||!/^\/portal\/vgcs(?:\/|$)/u.test(location.pathname)||document.getElementById('galactic-library-nintendo-importer'))return;
  const host=document.createElement('div');host.id='galactic-library-nintendo-importer';
  const shadow=host.attachShadow({mode:'open'});
  globalThis.GalacticFloatingPanel.render(shadow,'nintendo',{diagnostics:'<details><summary>Scan diagnostics</summary><p>Export counts and the last check result. No game lists, account identifiers or credentials are included. Storage-call measurements are not collected here.</p><button type="button" data-export-diagnostics>Export scan report</button></details>'});
  document.documentElement.append(host);
  globalThis.GalacticFloatingPanel?.attach?.(shadow,'nintendo');
  const buttons=[...shadow.querySelectorAll('[data-mode]')],status=shadow.querySelector('[data-import-status]');
  let importing=false,lastScan=null,progressEvents=0;
  window.addEventListener('message',event=>{
    const r=event.data;
    if(event.source!==window||event.origin!==location.origin||r?.channel!=='gl-nintendo-progress')return;
    progressEvents++;
    if(importing){if(r.phase==='validating'&&Number.isSafeInteger(r.loaded))status.textContent='Checking '+r.loaded+' loaded cards'+(Number.isSafeInteger(r.total)?' of '+r.total:'')+'...';return;}
    if(r.problem){status.textContent=r.problem;return;}
    if(r.complete){status.textContent='All '+r.loaded+' cards loaded. Ready to check; earlier saved cards will be retained.';}
    else if(r.total!=null){status.textContent='Loaded '+r.loaded+' of '+r.total+' cards. Scroll down to let Nintendo load the rest.';}
    else if(r.loaded>0){status.textContent='Loaded '+r.loaded+' cards. Scroll down to load more.';}
    else if(r.pending){status.textContent='Waiting for Nintendo to load the card list...';}
  });
  window.postMessage({channel:'gl-nintendo-status-request'},location.origin);
  function bridge(action){
    const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{removeEventListener('message',receive);reject(Error('Nintendo did not provide a complete loaded list. Reload this page and try again.'));},20000);
      function receive(event){
        const r=event.data;if(event.source!==window||event.origin!==location.origin||r?.channel!=='gl-nintendo-response'||r.nonce!==nonce)return;
        clearTimeout(timer);removeEventListener('message',receive);
        if(r.ok!==true){reject(Error(typeof r.error==='string'?r.error.slice(0,500):'Could not read the loaded card list.'));return;}
        if(action==='diagnostics'){resolve(r);return;}
        if(typeof r.sourceAccountFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(r.sourceAccountFingerprint)||!Number.isSafeInteger(r.captureVersion)||r.captureVersion<0||action==='prepare'&&(!Array.isArray(r.items)||r.items.length>50000||r.snapshot?.provider!=='nintendo')){reject(Error('Nintendo returned an invalid library result. Saved items are unchanged.'));return;}
        resolve(r);
      }
      addEventListener('message',receive);window.postMessage({channel:'gl-nintendo-request',nonce,action},location.origin);
    });
  }
  for(const button of buttons)button.addEventListener('click',async()=>{
    if(importing)return;buttons.forEach(b=>b.disabled=true);status.setAttribute('aria-busy','true');status.dataset.busy='true';importing=true;
    const started=performance.now(),progressStart=progressEvents;let phase='checking-loaded-list',heartbeat;
    lastScan={outcome:'running',mode:button.dataset.mode,cardsValidated:0};
    try{
      status.textContent='Checking loaded Nintendo cards...';
      const captured=await bridge('prepare');lastScan.cardsValidated=captured.items.length;
      phase='confirming-account';status.textContent='Confirming the saved account before comparing '+captured.items.length+' cards...';
      const start=await GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider:'nintendo',mode:button.dataset.mode,sourceAccountFingerprint:captured.sourceAccountFingerprint});
      if(!start.ok)throw Error(start.error??'Could not confirm the target saved account.');
      const mode=start.forceFull?'full':button.dataset.mode;lastScan.mode=mode;
      const current=await bridge('verify');if(current.sourceAccountFingerprint!==captured.sourceAccountFingerprint||current.captureVersion!==captured.captureVersion)throw Error('The Nintendo account or card list changed. No cards were imported. Reload the page.');
      phase='comparing-and-saving';const message='Comparing '+captured.items.length+' cards and saving changes';status.textContent=message+'...';
      const saving=performance.now();heartbeat=setInterval(()=>{status.textContent=message+'... '+Math.floor((performance.now()-saving)/1000)+' seconds elapsed. Keep this tab open.';},1000);
      const result=await GalacticSync.send({type:'IMPORT_PROVIDER_ITEMS',provider:'nintendo',mode,items:captured.items,snapshot:captured.snapshot,sourceAccountFingerprint:captured.sourceAccountFingerprint});
      clearInterval(heartbeat);
      if(!result.ok)throw Error(result.error??'Could not save the loaded cards.');
      const owned=captured.items.filter(i=>i.ownership==='owned').length,borrowed=captured.items.filter(i=>i.ownership==='borrowed').length,unknown=captured.items.length-owned-borrowed;
      const c=result.changes;lastScan={...lastScan,outcome:'complete',persistence:result.persistence??'not-reported',...(c?{added:c.added,updated:c.updated,unchanged:c.unchanged}:{})};
      status.textContent=(mode==='full'?'Full rescan':'Quick update')+' complete. Checked '+captured.items.length+' loaded cards'+(c?' | '+c.added+' new | '+(c.updated??0)+' updated':'')+' | '+owned+' owned'+(borrowed?' | '+borrowed+' borrowed':'')+(unknown?' | '+unknown+' with unconfirmed access':'')+'. Earlier saved cards were retained. Reload Nintendo to refresh purchases or changes made elsewhere.';
    }catch(error){lastScan.outcome='failed';lastScan.failedPhase=phase;status.textContent=error.message;await globalThis.GalacticSync?.failed?.('nintendo',error);}
    finally{clearInterval(heartbeat);lastScan.elapsedMs=Math.round(performance.now()-started);lastScan.progressEvents=progressEvents-progressStart;buttons.forEach(b=>b.disabled=false);status.setAttribute('aria-busy','false');delete status.dataset.busy;importing=false;}
  });
  shadow.querySelector('[data-export-diagnostics]').addEventListener('click',async()=>{
    try{
      const r=await bridge('diagnostics'),counts={};
      for(const key of ['requestsObserved','responseBytesMeasured','responsesWithoutByteSize','progressEvents','prepareChecks','pagesObserved','pendingRequests','cardsObserved','glAcquisitionRequests'])if(Number.isSafeInteger(r.diagnostics?.[key])&&r.diagnostics[key]>=0)counts[key]=r.diagnostics[key];
      const report={format:1,provider:'nintendo',acquisition:'website-observed-non-hidden-cards',counts,lastScan,storageCalls:'not-measured'};
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='GL-nintendo-scan-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{if(!importing)status.textContent='The scan report could not be read. Reload Nintendo and try again; saved cards are unchanged.';}
  });
}());
