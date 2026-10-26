/* ISOLATED world: ordinary GL profile lease and atomic import, no credentials. */
(function(){
  'use strict';
  if(location.origin!=='https://accounts.nintendo.com'||!/^\/portal\/vgcs(?:\/|$)/u.test(location.pathname)||document.getElementById('galactic-library-nintendo-importer'))return;
  const host=document.createElement('div');host.id='galactic-library-nintendo-importer';
  const shadow=host.attachShadow({mode:'open'});
  globalThis.GalacticFloatingPanel.render(shadow,'nintendo',{});
  document.documentElement.append(host);
  globalThis.GalacticFloatingPanel?.attach?.(shadow,'nintendo');
  const button=shadow.querySelector('[data-mode]'),status=shadow.querySelector('[data-import-status]');
  let importing=false;
  window.addEventListener('message',event=>{
    const r=event.data;
    if(event.source!==window||event.origin!==location.origin||r?.channel!=='gl-nintendo-progress'||importing)return;
    if(r.problem){status.textContent=r.problem;return;}
    if(r.complete){status.textContent=`All ${r.loaded} cards loaded and ready to import. Previously saved GL items will be retained.`;}
    else if(r.total!=null){status.textContent=`Loaded ${r.loaded} of ${r.total} cards. Scroll down to load more cards.`;}
    else if(r.loaded>0){status.textContent=`Loaded ${r.loaded} cards. Scroll down to load more cards.`;}
    else if(r.pending){status.textContent='Loading cards from Nintendo…';}
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
        if(typeof r.sourceAccountFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(r.sourceAccountFingerprint)||!Number.isSafeInteger(r.captureVersion)||r.captureVersion<0||action==='prepare'&&(!Array.isArray(r.items)||r.items.length>50000||r.snapshot?.provider!=='nintendo')){reject(Error('Nintendo returned an invalid library result. Saved items are unchanged.'));return;}
        resolve(r);
      }
      addEventListener('message',receive);window.postMessage({channel:'gl-nintendo-request',nonce,action},location.origin);
    });
  }
  button.addEventListener('click',async()=>{
    if(button.disabled)return;button.disabled=true;status.setAttribute('aria-busy','true');importing=true;
    try{
      status.textContent='Checking the loaded cards and signed-in Nintendo account…';
      const captured=await bridge('prepare');
      const start=await GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider:'nintendo',mode:'full',sourceAccountFingerprint:captured.sourceAccountFingerprint});
      if(!start.ok)throw Error(start.error??'Could not confirm the target saved account.');
      status.textContent=`Saving ${captured.items.length} loaded cards to Galactic Library…`;
      const current=await bridge('verify');if(current.sourceAccountFingerprint!==captured.sourceAccountFingerprint||current.captureVersion!==captured.captureVersion)throw Error('The Nintendo account or card list changed. No cards were imported. Reload the page.');
      const result=await GalacticSync.send({type:'IMPORT_PROVIDER_ITEMS',provider:'nintendo',mode:'full',items:captured.items,snapshot:captured.snapshot,sourceAccountFingerprint:captured.sourceAccountFingerprint});
      if(!result.ok)throw Error(result.error??'Could not save the loaded cards.');
      const owned=captured.items.filter(i=>i.ownership==='owned').length,borrowed=captured.items.filter(i=>i.ownership==='borrowed').length,unknown=captured.items.length-owned-borrowed;
      status.textContent=`Imported ${captured.items.length} cards · ${owned} owned${borrowed?` · ${borrowed} borrowed`:''}${unknown?` · ${unknown} with unconfirmed access`:''}. Previously saved cards were retained. No purchase dates were inferred.`;
    }catch(error){status.textContent=error.message;await globalThis.GalacticSync?.failed?.('nintendo',error);}
    finally{button.disabled=false;status.setAttribute('aria-busy','false');importing=false;}
  });
}());
