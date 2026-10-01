/* Shared collapse/restore control for Galactic Library's provider panels. */
(function attachFloatingPanelControls(global) {
  'use strict';
  const sessions=new Map();
  async function send(request) {
    const provider=request.provider??(request.type==='FANDANGO_IMPORT_STATE'?'fandango-at-home':null);
    const session=sessions.get(provider);
    if(request.type==='GET_PROVIDER_SYNC_STATE'){
      if(!session)throw new Error('Reload this page to start a profile scan.');
      const context=session.resume??session.read();session.resume=null;
      if(!context.confirmed||!context.profileLabel)throw new Error('Enter a profile label and confirm the signed-in account.');
      const result=await chrome.runtime.sendMessage({...request,...context,beginScan:true});
      if(result.ok)session.context={...context,scanToken:result.scanToken};
      return result;
    }
    if(request.type==='IMPORT_PROVIDER_ITEMS'){
      if(!session?.context?.scanToken)throw new Error('Start a fresh confirmed profile scan.');
      return chrome.runtime.sendMessage({...request,type:'COMMIT_PROVIDER_SCAN',scanToken:session.context.scanToken});
    }
    if(request.type==='FANDANGO_IMPORT_STATE'&&session){
      if(request.action==='set'){
        const context=session.context??session.read();
        if(!context.confirmed||!context.profileLabel)throw new Error('Enter a profile label and confirm the signed-in account.');
        request={...request,state:{...request.state,scanContext:context}};
      }
      const result=await chrome.runtime.sendMessage(request);
      if(request.action==='get'&&result.state){
        const context=result.state.scanContext;
        if(!context?.confirmed||!context.profileLabel)throw new Error('Start a fresh scan; the previous scan has no confirmed profile.');
        session.context=context;session.resume=context;
      }
      return result;
    }
    return chrome.runtime.sendMessage(request);
  }
  global.GalacticSync={send};
  function attach(shadow,provider) {
    const panel = shadow?.querySelector?.('.panel');
    if (!panel || shadow.querySelector('[data-galactic-floating-panel-control]')) return;
    if(provider){
      const controls=document.createElement('div');
      controls.innerHTML='<label>Account/profile label <input data-profile-label maxlength="100" placeholder="e.g. personal"></label><br><label><input type="checkbox" data-profile-confirm> Signed-in account matches this label</label><br><label><input type="checkbox" data-profile-switch> Switch active profile on full rescan</label>';
      controls.style.cssText='font-size:12px;margin:10px 0';
      panel.querySelector('button').before(controls);
      let mode='full';
      const input=controls.querySelector('[data-profile-label]');
      const session={read:()=>({profileLabel:input.value.trim(),confirmed:controls.querySelector('[data-profile-confirm]').checked,switchProfile:controls.querySelector('[data-profile-switch]').checked,mode})};
      sessions.set(provider,session);
      shadow.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.dataset.galacticFloatingPanelControl){mode=button.dataset.mode??'full';session.context=null;session.resume=null;}},true);
      chrome.runtime.sendMessage({type:'GET_PROVIDER_PROFILE',provider}).then(result=>{if(result.ok&&!input.value)input.value=result.profileLabel??'';}).catch(()=>{});
    }
    const style = document.createElement('style');
    style.textContent = '.panel { position:relative; } .galactic-panel-minimize { position:absolute; right:9px; top:9px; padding:3px 7px; font-size:12px; } .galactic-panel-restore { border:1px solid #a78bfa; border-radius:7px; background:#312e81; box-shadow:0 8px 30px #0008; color:#f5f3ff; cursor:pointer; font:14px/1.4 system-ui,sans-serif; padding:7px 10px; }';
    const minimize = document.createElement('button');
    minimize.type = 'button';
    minimize.className = 'galactic-panel-minimize';
    minimize.dataset.galacticFloatingPanelControl = 'minimize';
    minimize.textContent = 'Minimize';
    minimize.setAttribute('aria-label', 'Minimize Galactic Library panel');
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'galactic-panel-restore';
    restore.dataset.galacticFloatingPanelControl = 'restore';
    restore.textContent = 'Galactic Library — Expand';
    restore.hidden = true;
    restore.addEventListener('click', () => {
      panel.hidden = false;
      restore.hidden = true;
      minimize.focus();
    });
    minimize.addEventListener('click', () => {
      panel.hidden = true;
      restore.hidden = false;
      restore.focus();
    });
    panel.append(minimize);
    shadow.append(style, restore);
  }
  global.GalacticFloatingPanel = { attach };
}(globalThis));
