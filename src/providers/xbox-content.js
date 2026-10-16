/* ISOLATED world: source account binding, ordinary GL lease and atomic save. */
(function(){
  'use strict';
  if(location.origin!=='https://play.xbox.com'||!/^\/library(?:\/|$)/u.test(location.pathname)||document.getElementById('galactic-library-xbox-importer'))return;
  const host=document.createElement('div');host.id='galactic-library-xbox-importer';host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(410px,95vw)';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML='<style>:host{font:14px system-ui}.panel{background:var(--gh-surface,#fff);color:var(--gh-text,#111);border:1px solid var(--gh-border,#888);border-radius:10px;padding:16px;box-shadow:0 4px 20px #0003}button{font:inherit;padding:7px 12px;margin:4px;background:var(--gh-accent,#7c3aed);color:var(--gh-on-accent,#fff);border:0;border-radius:6px}p{margin:9px 0}</style><section class="panel"><h3>Galactic Library · Xbox — Web Library</h3><p>Import the games in the Owned catalog of your current Xbox web library. This covers web-visible games, not your complete console or lifetime purchase history. Previously saved items are retained.</p><button type="button" data-mode="full">Full rescan</button><button type="button" data-mode="incremental">Quick update</button><p data-import-status role="status">Let Xbox Library finish loading. Both actions check the complete web-visible Owned catalog; Quick update adds changes without removing earlier items.</p></section>';
  document.documentElement.append(host);globalThis.GalacticFloatingPanel?.attach?.(shadow,'xbox');
  const buttons=[...shadow.querySelectorAll('[data-mode]')],status=shadow.querySelector('[data-import-status]');
  function bridge(action){
    const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{removeEventListener('message',receive);reject(Error('The Xbox check timed out. Saved GL items are unchanged; reload and retry.'));},130000);
      function receive(event){
        const r=event.data;if(event.source!==window||event.origin!==location.origin||r?.channel!=='gl-xbox-response'||r.nonce!==nonce)return;
        clearTimeout(timer);removeEventListener('message',receive);
        if(r.ok!==true){reject(Error(typeof r.error==='string'?r.error.slice(0,500):'Xbox could not complete this check.'));return;}
        if(typeof r.sourceAccountFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(r.sourceAccountFingerprint)||action!=='identify'&&(typeof r.captureVersion!=='string'||!/^[a-f0-9]{64}$/u.test(r.captureVersion))||action==='prepare'&&(!Array.isArray(r.items)||r.items.length>50000||r.snapshot?.provider!=='xbox')){reject(Error('Xbox returned an invalid library result. Saved items are unchanged.'));return;}
        resolve(r);
      }
      addEventListener('message',receive);window.postMessage({channel:'gl-xbox-request',nonce,action},location.origin);
    });
  }
  for(const button of buttons)button.addEventListener('click',async()=>{
    if(button.disabled)return;for(const b of buttons)b.disabled=true;status.setAttribute('aria-busy','true');
    try{
      status.textContent='Confirming the signed-in Xbox account…';const actor=await bridge('identify');
      const start=await GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider:'xbox',mode:button.dataset.mode,sourceAccountFingerprint:actor.sourceAccountFingerprint});
      if(!start.ok)throw Error(start.error??'Could not confirm the target GL account.');
      const mode=start.forceFull?'full':button.dataset.mode;
      status.textContent='Checking the web-visible Xbox Owned catalog…';const captured=await bridge('prepare');
      if(captured.sourceAccountFingerprint!==actor.sourceAccountFingerprint)throw Error('The signed-in Xbox account changed. No items were saved.');
      status.textContent=`Checking the account before saving ${captured.items.length} titles…`;const current=await bridge('verify');
      if(current.sourceAccountFingerprint!==captured.sourceAccountFingerprint||current.captureVersion!==captured.captureVersion)throw Error('The Xbox account or library changed. Start a fresh import.');
      status.textContent=`Saving ${captured.items.length} titles to Galactic Library…`;
      const result=await GalacticSync.send({type:'IMPORT_PROVIDER_ITEMS',provider:'xbox',mode,items:captured.items,snapshot:captured.snapshot,sourceAccountFingerprint:captured.sourceAccountFingerprint});
      if(!result.ok)throw Error(result.error??'Could not save Xbox titles.');
      const products=new Set(captured.items.map(i=>i.providerItemId)).size,unknown=captured.items.filter(i=>i.ownership==='unknown').length,subscriptions=captured.items.filter(i=>i.ownership==='subscription').length;
      status.textContent=`Saved ${captured.items.length} checked titles · ${products} products · ${result.changes?.added??0} new · ${result.changes?.ownershipChanged??0} access changes${subscriptions?` · ${subscriptions} subscription`:''}${unknown?` · ${unknown} with unconfirmed access`:''}. Complete web-visible Owned catalog; earlier saved items retained.`;
    }catch(error){status.textContent=error.message;await globalThis.GalacticSync?.failed?.('xbox',error);}
    finally{for(const b of buttons)b.disabled=false;status.setAttribute('aria-busy','false');}
  });
}());
