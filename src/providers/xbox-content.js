/* ISOLATED world: source account binding, ordinary GL lease and atomic save. */
(function(){
  'use strict';
  if(location.origin!=='https://play.xbox.com')return;
  if(globalThis.GalacticXboxRouteUI){globalThis.GalacticXboxRouteUI.refresh();return;}
  const ownedUrl='https://play.xbox.com/library?tab=fullLibrary&view=grid&catalog=owned';
  const library=()=>/^\/library\/?$/u.test(location.pathname);
  const owned=()=>{const q=new URLSearchParams(location.search);return library()&&q.get('tab')==='fullLibrary'&&q.get('catalog')==='owned';};
  const challenge=()=>document.querySelector('input[type="password"],iframe[src*="captcha" i],[data-testid*="captcha" i]');
  let attached=false,wasOwned=false,generation=0,running=false,scheduled=false;
  let launchChecked=false,launchPending=false,recovering=false,recoveryTimer=null,retries=0;
  const host=document.createElement('div');host.id='galactic-library-xbox-importer';
  const shadow=host.attachShadow({mode:'open'});
  globalThis.GalacticFloatingPanel.render(shadow,'xbox',{});
  // Keep the same controls/account selection across SPA routes and hydration.
  // Route changes suspend imports; mounting never starts one.
  const pageRoot=document.documentElement;
  const buttons=[...shadow.querySelectorAll('[data-mode]')],status=shadow.querySelector('[data-import-status]');
  function bridge(action){
    const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{removeEventListener('message',receive);reject(Error('The Xbox check timed out. Saved GL items are unchanged; reload and retry.'));},130000);
      function receive(event){
        const r=event.data;if(event.source!==window||event.origin!==location.origin||r?.channel!=='gl-xbox-response'||r.nonce!==nonce)return;
        clearTimeout(timer);removeEventListener('message',receive);
        if(r.ok!==true){reject(Error(typeof r.error==='string'?r.error.slice(0,500):'Xbox could not complete this check.'));return;}
        if(action==='navigation-ready'){if(typeof r.authenticated!=='boolean'){reject(Error('Xbox readiness is unavailable.'));return;}resolve(r);return;}
        if(typeof r.sourceAccountFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(r.sourceAccountFingerprint)||action!=='identify'&&(typeof r.captureVersion!=='string'||!/^[a-f0-9]{64}$/u.test(r.captureVersion))||action==='prepare'&&(!Array.isArray(r.items)||r.items.length>50000||r.snapshot?.provider!=='xbox')){reject(Error('Xbox returned an invalid library result. Saved items are unchanged.'));return;}
        resolve(r);
      }
      addEventListener('message',receive);window.postMessage({channel:'gl-xbox-request',nonce,action},location.origin);
    });
  }
  for(const button of buttons)button.addEventListener('click',async()=>{
    if(button.disabled||running||!owned()||!host.isConnected)return;
    running=true;const epoch=generation;
    const currentRoute=()=>{if(epoch!==generation||!owned()||!host.isConnected)throw Error('Xbox navigation changed. Return to Owned and start the update again. Saved items are unchanged.');};
    for(const b of buttons)b.disabled=true;status.setAttribute('aria-busy','true');
    try{
      status.textContent='Confirming the signed-in Xbox account…';const actor=await bridge('identify');
      currentRoute();
      const start=await GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider:'xbox',mode:button.dataset.mode,sourceAccountFingerprint:actor.sourceAccountFingerprint});
      currentRoute();
      if(!start.ok)throw Error(start.error??'Could not confirm the target saved account.');
      const mode=start.forceFull?'full':button.dataset.mode;
      status.textContent='Checking the web-visible Xbox Owned catalog…';const captured=await bridge('prepare');
      currentRoute();
      if(captured.sourceAccountFingerprint!==actor.sourceAccountFingerprint)throw Error('The signed-in Xbox account changed. No items were saved.');
      status.textContent=`Checking the account before saving ${captured.items.length} titles…`;const current=await bridge('verify');
      currentRoute();
      if(current.sourceAccountFingerprint!==captured.sourceAccountFingerprint||current.captureVersion!==captured.captureVersion)throw Error('The Xbox account or library changed. Start a fresh import.');
      status.textContent=`Saving ${captured.items.length} titles to Galactic Library…`;
      const result=await GalacticSync.send({type:'IMPORT_PROVIDER_ITEMS',provider:'xbox',mode,items:captured.items,snapshot:captured.snapshot,sourceAccountFingerprint:captured.sourceAccountFingerprint});
      if(!result.ok)throw Error(result.error??'Could not save Xbox titles.');
      const products=new Set(captured.items.map(i=>i.providerItemId)).size,unknown=captured.items.filter(i=>i.ownership==='unknown').length,subscriptions=captured.items.filter(i=>i.ownership==='subscription').length;
      status.textContent=`Saved ${captured.items.length} checked titles · ${products} products · ${result.changes?.added??0} new · ${result.changes?.ownershipChanged??0} access changes${subscriptions?` · ${subscriptions} subscription`:''}${unknown?` · ${unknown} with unconfirmed access`:''}. Complete web-visible Owned catalog; earlier saved items retained.`;
    }catch(error){status.textContent=error.message;await globalThis.GalacticSync?.failed?.('xbox',error);}
    finally{running=false;for(const b of buttons)b.disabled=false;status.setAttribute('aria-busy','false');}
  });
  async function recoverLaunch(){
    if(!library()||recovering||recoveryTimer)return;
    recovering=true;
    try{
      if(!launchChecked){const r=await chrome.runtime.sendMessage({type:'XBOX_IMPORT_LAUNCH',action:'get'});launchChecked=true;launchPending=r?.ok===true&&r.pending===true;}
      if(!launchPending)return;
      // Do not touch Microsoft's auth pages or redirect an on-page challenge.
      if(challenge())return;
      const ready=await bridge('navigation-ready');
      if(!library()||challenge())return;
      if(!ready.authenticated){if(retries++<8)recoveryTimer=setTimeout(()=>{recoveryTimer=null;recoverLaunch();},Math.min(4000,250*2**retries));return;}
      const r=await chrome.runtime.sendMessage({type:'XBOX_IMPORT_LAUNCH',action:'consume'});launchPending=false;
      if(r?.ok&&r.pending&&r.url===ownedUrl&&library()&&!owned()&&!challenge())location.assign(ownedUrl);
    }catch{/* Manual Owned navigation still works; no library data is changed. */}
    finally{recovering=false;}
  }
  function refresh(){
    const active=owned();if(active!==wasOwned){generation++;wasOwned=active;}
    if(active){
      if(!attached){globalThis.GalacticFloatingPanel?.attach?.(shadow,'xbox');attached=true;}
      if(host.parentNode!==pageRoot)pageRoot.append(host);
    }else if(host.isConnected)host.remove();
    if(library())recoverLaunch();
    else if(recoveryTimer){clearTimeout(recoveryTimer);recoveryTimer=null;}
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;refresh();});}
  globalThis.GalacticXboxRouteUI={refresh};
  new MutationObserver(schedule).observe(pageRoot,{childList:true,subtree:true});
  for(const name of ['gl-xbox-route','popstate','hashchange'])addEventListener(name,refresh);
  globalThis.navigation?.addEventListener?.('currententrychange',refresh);
  refresh();
}());
