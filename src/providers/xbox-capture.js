/* MAIN world: current website cache only; no requests or credential handling. */
(()=>{
  'use strict';
  if(location.origin!=='https://play.xbox.com')return;
  let prepared=null,busy=false;
  const fail=message=>{const error=Error(message);error.glXboxUserMessage=message;throw error;};
  const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  async function current(){
    const value=globalThis.GalacticXboxLibrary.read(window);
    const sourceAccountFingerprint=await hash('xbox\u0000'+value.xuid),captureVersion=await hash(value.revision);
    if(globalThis.GalacticXboxLibrary.read(window).revision!==value.revision)fail('The Xbox account or library changed during the check. Try again; saved GL items are unchanged.');
    return {...value,sourceAccountFingerprint,captureVersion};
  }
  addEventListener('message',async event=>{
    const r=event.data;if(event.source!==window||event.origin!==location.origin||!/^\/library(?:\/|$)/u.test(location.pathname)||r?.channel!=='gl-xbox-request'||!['identify','prepare','verify'].includes(r.action)||typeof r.nonce!=='string'||!/^[a-f0-9]{32}$/u.test(r.nonce))return;
    const reply=value=>window.postMessage({channel:'gl-xbox-response',nonce:r.nonce,...value},location.origin);
    if(busy){reply({ok:false,error:'Another Xbox check is running. Wait for it to finish.'});return;}
    busy=true;
    try{
      const value=await current();
      if(r.action==='identify'){reply({ok:true,sourceAccountFingerprint:value.sourceAccountFingerprint});return;}
      if(r.action==='verify'){
        if(!prepared||Date.now()-prepared.at>120000||prepared.captureVersion!==value.captureVersion||prepared.sourceAccountFingerprint!==value.sourceAccountFingerprint)fail('The prepared Xbox library changed or expired. Start a fresh import; saved items are unchanged.');
        reply({ok:true,sourceAccountFingerprint:value.sourceAccountFingerprint,captureVersion:value.captureVersion});return;
      }
      prepared={sourceAccountFingerprint:value.sourceAccountFingerprint,captureVersion:value.captureVersion,at:Date.now()};
      reply({ok:true,items:value.items,snapshot:value.snapshot,sourceAccountFingerprint:value.sourceAccountFingerprint,captureVersion:value.captureVersion});
    }catch(error){prepared=null;reply({ok:false,error:typeof error?.glXboxUserMessage==='string'?error.glXboxUserMessage.slice(0,500):'Xbox could not read the current library. Reload Library and try again; saved GL items are unchanged.'});}
    finally{busy=false;}
  });
})();
