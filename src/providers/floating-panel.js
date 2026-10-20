/* Shared collapse/restore control for Galactic Library's provider panels. */
(function attachFloatingPanelControls(global) {
  'use strict';
  const sessions=new Map();
  let profiling=false,profileSequence=100;
  let profilePrefix;
  async function send(request) {
    const provider=request.provider??(request.type==='FANDANGO_IMPORT_STATE'?'fandango-at-home':null);
    const session=sessions.get(provider);
    if(request.type==='GET_PROVIDER_SYNC_STATE'){
      if(!session)throw new Error('Reload this page to start a profile scan.');
      const timing=global.GalacticContentsPerformance?.validId(request.diagnosticLookupId)?global.GalacticContentsPerformance.trace(request.diagnosticLookupId,'provider'):null;
      const waitEnd=timing?.begin('provider_profile_wait');
      await session.ready;
      waitEnd?.();
      const context=session.resume??session.read();session.resume=null;
      if(!context.rememberedProfile&&(!context.confirmed||!context.profileLabel))throw new Error('Enter a profile label and confirm the signed-in account.');
      const result=await chrome.runtime.sendMessage({...request,...context,beginScan:true,...(timing?{diagnosticSentEpochMs:global.GalacticContentsPerformance.now()}: {})});
      if(result.ok)session.context={...context,confirmed:true,scanToken:result.scanToken,profileId:result.profileId};
      if(timing){global.GalacticContentsPerformance.merge(timing,result.performance);result.performance=global.GalacticContentsPerformance.clean(timing.finish(result.ok?'prepared':'failed'));}
      return result;
    }
    if(request.type==='IMPORT_PROVIDER_ITEMS'){
      if(!session?.context?.scanToken)throw new Error('Start a fresh confirmed profile scan.');
      return chrome.runtime.sendMessage({...request,type:'COMMIT_PROVIDER_SCAN',scanToken:session.context.scanToken,...(request.diagnosticLookupId?{diagnosticSentEpochMs:global.GalacticContentsPerformance?.now()}: {})});
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
  async function failed(provider,error){
    const context=sessions.get(provider)?.context;if(!context?.scanToken)return;
    const message=String(error?.message??''),code=/login|sign.in|401|403|account changed/iu.test(message)?'authentication':/timeout|timed out|abort/iu.test(message)?'timeout':/incomplete|coverage|pagination|count|malformed|unreadable|invalid|limit|bounds/iu.test(message)?'coverage':/fetch|network|offline|connection/iu.test(message)?'network':'other';
    const page=/\bpage\s+([1-9]\d{0,4})\b/iu.exec(message);
    try{await chrome.runtime.sendMessage({type:'REPORT_PROVIDER_SCAN_FAILURE',provider,scanToken:context.scanToken,failure:{code,failedRequestCount:1,failedPages:page?[Number(page[1])]:[]}});}catch{}
  }
  // A page-local UI may request one trace without enabling later scans. The
  // explicit console switch remains available for development only.
  global.GalacticSync={send,failed,setProfiling(value){profiling=value===true;},trace(provider,{once=false}={}){
    if(profiling||once)profilePrefix??=crypto.randomUUID().replace(/-/gu,'').slice(0,12);
    const timing=profiling||once?global.GalacticContentsPerformance?.trace(`lookup-${profilePrefix}-${profileSequence++}`,'provider'):null;
    if(timing){timing.provider=provider;timing.providerPhase='scan';}return timing;
  }};
  function attach(shadow,provider) {
    const panel = shadow?.querySelector?.('.panel');
    if (!panel || shadow.querySelector('[data-galactic-floating-panel-control]')) return;
    if(provider){
      const controls=document.createElement('div');
      controls.innerHTML='<p data-profile-status role="status">Loading saved account...</p><label>Account nickname <input data-profile-label maxlength="100" placeholder="e.g. Personal" list="galactic-profile-names"></label><datalist id="galactic-profile-names"></datalist><p>A name you choose for the account signed in on this site. GL does not sign you in or verify your login. If you sign in to another store account, choose a different nickname and confirm switching before updating.</p><label data-profile-confirm-label><input type="checkbox" data-profile-confirm> I checked that the signed-in account matches this nickname</label><br><label><input type="checkbox" data-profile-switch> Confirm switching to this account</label>';
      controls.style.cssText='font-size:12px;margin:10px 0';
      panel.querySelector('button').before(controls);
      let mode='full';
      const input=controls.querySelector('[data-profile-label]');
      let remembered=null,edited=false,hintValue='',resolved=false;
      const session={read:()=>({profileLabel:input.value.trim(),confirmed:controls.querySelector('[data-profile-confirm]').checked,switchProfile:controls.querySelector('[data-profile-switch]').checked,mode,
        ...(remembered&&input.value.trim()===remembered.profileLabel&&!controls.querySelector('[data-profile-switch]').checked?{profileId:remembered.profileId,rememberedProfile:true}:{})})};
      input.addEventListener('input',()=>{edited=true;remembered=null;controls.querySelector('[data-profile-confirm]').checked=false;controls.querySelector('[data-profile-confirm-label]').hidden=false;controls.querySelector('[data-profile-status]').textContent='Confirm the account you want to update.';});
      sessions.set(provider,session);
      shadow.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.dataset.galacticFloatingPanelControl){mode=button.dataset.mode??'full';session.context=null;session.resume=null;}},true);
      const performanceApi=provider==='kobo'?global.GalacticContentsPerformance:null;
      const accountTiming=performanceApi?.trace(`lookup-${crypto.randomUUID().replace(/-/gu,'').slice(0,12)}-100`,'provider');
      if(accountTiming)accountTiming.providerPhase='account';
      let hintFinished=provider!=='kobo',profileFinished=false,profileFailed=false;
      const reportAccountTiming=()=>{
        if(!accountTiming||!hintFinished||!profileFinished)return;
        chrome.runtime.sendMessage({type:'GL_PROVIDER_UI_TIMING',provider,timing:performanceApi.clean(accountTiming.finish(profileFailed?'failed':'prepared'))}).catch(()=>{});
      };
      const diagnostic=()=>accountTiming?{diagnosticLookupId:accountTiming.id,diagnosticSentEpochMs:performanceApi.now()}:{};
      const hintEnd=accountTiming?.begin('provider_hint_message');
      if(provider==='kobo')chrome.runtime.sendMessage({type:'GET_PROVIDER_PROFILE_HINT',provider,...diagnostic()}).then(result=>{
        hintEnd?.();performanceApi?.merge(accountTiming,result.performance);
        if(accountTiming&&result.performance?.profileHintStatus)accountTiming.profileHintStatus=result.performance.profileHintStatus;
        if(!resolved&&!edited&&!input.value&&result?.hint){
          hintValue=result.hint.nickname;input.value=hintValue;
          controls.querySelector('[data-profile-status]').textContent='Checking which saved account this import will update...';
          accountTiming?.begin('provider_hint_display')();
        }
      }).catch(()=>{hintEnd?.();}).finally(()=>{hintFinished=true;reportAccountTiming();});
      const profileEnd=accountTiming?.begin('provider_profile_message');
      session.ready=chrome.runtime.sendMessage({type:'GET_PROVIDER_PROFILE',provider,...diagnostic()}).then(result=>{
        profileEnd?.();performanceApi?.merge(accountTiming,result.performance);
        resolved=true;
        if(!result.ok)throw Error(result.error??'Could not read saved accounts.');
        if(!edited&&(!input.value||input.value===hintValue))input.value=result.profileLabel??'';
        for(const profile of result.profiles??[]){if(!profile.nickname)continue;const option=document.createElement('option');option.value=profile.nickname;controls.querySelector('datalist').append(option);}
        if(!edited&&result.reuseAllowed&&result.profileId){
          remembered={profileId:result.profileId,profileLabel:result.profileLabel??''};
          controls.querySelector('[data-profile-confirm-label]').hidden=true;
          controls.querySelector('[data-profile-status]').textContent=`Using saved account: ${result.profileLabel||'Default account'}.`;
        }else controls.querySelector('[data-profile-status]').textContent='Select and confirm the signed-in account.';
        accountTiming?.begin('provider_verified_display')();
      }).catch(error=>{profileFailed=true;profileEnd?.();controls.querySelector('[data-profile-status]').textContent='Could not load saved accounts. Reload this page before updating.';throw error;})
        .finally(()=>{profileFinished=true;reportAccountTiming();});
      // A click during hydration waits for the same account result. Failure
      // keeps scans blocked; never infer consent from an unresolved lookup.
      session.ready.catch(()=>{});
    }
    const style = document.createElement('style');
    style.textContent = ':host { color-scheme:var(--gh-color-scheme); } .panel { position:relative; } button:hover:not(:disabled) { background:var(--gh-accent-hover); } button:active:not(:disabled) { background:var(--gh-accent-pressed); } button:disabled { background:var(--gh-disabled); color:var(--gh-disabled-text); cursor:default; } input,select,textarea { background:var(--gh-input); color:var(--gh-text); border:1px solid var(--gh-input-border); accent-color:var(--gh-accent); font:inherit; max-width:100%; } button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid var(--gh-focus); outline-offset:3px; } .galactic-panel-minimize { position:absolute; right:9px; top:9px; padding:3px 7px; font-size:12px; } .galactic-panel-restore { border:1px solid var(--gh-border); border-radius:7px; background:var(--gh-accent); box-shadow:var(--gh-shadow); color:var(--gh-on-accent); cursor:pointer; font:14px/1.4 var(--gh-font); padding:7px 10px; }';
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
