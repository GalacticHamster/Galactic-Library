/* ISOLATED world: ordinary GL profile lease and atomic import, no credentials. */
(function(){
  'use strict';
  if(location.origin!=='https://accounts.nintendo.com'||!/^\/portal\/vgcs(?:\/|$)/u.test(location.pathname)||document.getElementById('galactic-library-nintendo-importer'))return;
  const host=document.createElement('div');host.id='galactic-library-nintendo-importer';host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(410px,95vw)';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML='<style>:host{font:14px system-ui}.panel{background:var(--gh-surface,#fff);color:var(--gh-text,#111);border:1px solid var(--gh-border,#888);border-radius:10px;padding:16px;box-shadow:0 4px 20px #0003}button{font:inherit;padding:7px 12px;background:var(--gh-accent,#7c3aed);color:var(--gh-on-accent,#fff);border:0;border-radius:6px}p{margin:9px 0}</style><section class="panel"><h3>Galactic Library · Nintendo</h3><p>Switch Virtual Game Cards. Import the non-hidden cards loaded by this page. Other Nintendo purchases and older consoles are not included.</p><button type="button" data-mode="full">Import loaded cards</button><p data-import-status role="status">Let Nintendo finish loading the card list before importing. Previously saved GL items will be retained.</p></section>';
  document.documentElement.append(host);
  globalThis.GalacticFloatingPanel?.attach?.(shadow,'nintendo');
  const button=shadow.querySelector('[data-mode]'),status=shadow.querySelector('[data-import-status]');
  function bridge(action){
    const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{removeEventListener('message',receive);reject(Error('Nintendo did not provide a complete loaded list. Reload this page and try again.'));},20000);
      function receive(event){
        const r=event.data;if(event.source!==window||event.origin!==location.origin||r?.channel!=='gl-nintendo-response'||r.nonce!==nonce)return;
        clearTimeout(timer);removeEventListener('message',receive);
        if(r.ok!==true){reject(Error(typeof r.error==='string'?r.error.slice(0,500):'Could not read the loaded card list.'));return;}
        if(typeof r.sourceAccountFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(r.sourceAccountFingerprint)||!Number.isSafeInteger(r.captureVersion)||r.captureVersion<0||action==='prepare'&&(!Array.isArray(r.items)||r.items.length>50000||r.snapshot?.provider!=='nintendo')){reject(Error('Nintendo returned an invalid library result. Saved items are unchanged.'));return;}
        resolve(r);
      }
      addEventListener('message',receive);window.postMessage({channel:'gl-nintendo-request',nonce,action},location.origin);
    });
  }
  button.addEventListener('click',async()=>{
    if(button.disabled)return;button.disabled=true;status.setAttribute('aria-busy','true');
    try{
      status.textContent='Checking the loaded cards and signed-in Nintendo account…';
      const captured=await bridge('prepare');
      const start=await GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider:'nintendo',mode:'full',sourceAccountFingerprint:captured.sourceAccountFingerprint});
      if(!start.ok)throw Error(start.error??'Could not confirm the target GL account.');
      status.textContent=`Saving ${captured.items.length} loaded cards to Galactic Library…`;
      const current=await bridge('verify');if(current.sourceAccountFingerprint!==captured.sourceAccountFingerprint||current.captureVersion!==captured.captureVersion)throw Error('The Nintendo account or card list changed. No cards were imported. Reload the page.');
      const result=await GalacticSync.send({type:'IMPORT_PROVIDER_ITEMS',provider:'nintendo',mode:'full',items:captured.items,snapshot:captured.snapshot,sourceAccountFingerprint:captured.sourceAccountFingerprint});
      if(!result.ok)throw Error(result.error??'Could not save the loaded cards.');
      const owned=captured.items.filter(i=>i.ownership==='owned').length,borrowed=captured.items.filter(i=>i.ownership==='borrowed').length,unknown=captured.items.length-owned-borrowed;
      status.textContent=`Imported ${captured.items.length} cards · ${owned} owned${borrowed?` · ${borrowed} borrowed`:''}${unknown?` · ${unknown} with unconfirmed access`:''}. Previously saved cards were retained. No purchase dates were inferred.`;
    }catch(error){status.textContent=error.message;await globalThis.GalacticSync?.failed?.('nintendo',error);}
    finally{button.disabled=false;status.setAttribute('aria-busy','false');}
  });
}());
