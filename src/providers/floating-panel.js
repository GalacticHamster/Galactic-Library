/* Shared collapse/restore control for Galactic Library's provider panels. */
(function attachFloatingPanelControls(global) {
  'use strict';
  const sessions=new Map();
  let profiling=false,profileSequence=100;
  let profilePrefix;
  async function diagnosticsEnabled(provider){
    const flag={steam:'gl-steam-diagnostics','amazon-games':'gl-date-check',audible:'gl-audible-ownership-check'}[provider];
    if(flag&&new URLSearchParams(global.location?.search??'').get(flag)==='1')return true;
    try{const result=await chrome.runtime.sendMessage({type:'GET_PROVIDER_DIAGNOSTICS_SETTING',provider});return result?.ok===true&&result.enabled===true;}catch{return false;}
  }
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
      const generation=session.generation;
      if(!context.rememberedProfile&&(!context.confirmed||!context.profileLabel))throw new Error('Enter a profile label and confirm the signed-in account.');
      const result=await chrome.runtime.sendMessage({...request,...context,beginScan:true,...(timing?{diagnosticSentEpochMs:global.GalacticContentsPerformance.now()}: {})});
      if(generation!==session.generation)throw new Error('Account selection changed. Confirm the account and start a fresh import.');
      if(result.ok)session.context={...context,confirmed:true,scanToken:result.scanToken,profileId:result.profileId};
      if(timing){global.GalacticContentsPerformance.merge(timing,result.performance);result.performance=global.GalacticContentsPerformance.clean(timing.finish(result.ok?'prepared':'failed'));}
      return result;
    }
    if(request.type==='IMPORT_PROVIDER_ITEMS'){
      if(!session?.context?.scanToken)throw new Error('Start a fresh confirmed profile scan.');
      const generation=session.generation;
      const result=await chrome.runtime.sendMessage({...request,type:'COMMIT_PROVIDER_SCAN',scanToken:session.context.scanToken,...(request.diagnosticLookupId?{diagnosticSentEpochMs:global.GalacticContentsPerformance?.now()}: {})});
      if(result?.ok&&generation===session.generation)await session.refresh?.(generation);
      return result;
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
    panel.dataset.providerDiagnostics='disabled';
    const diagnosticSections=[...panel.querySelectorAll('details')].filter(section=>/diagnostic/iu.test(section.querySelector('summary')?.textContent??''));
    const diagnosticControls=[...panel.querySelectorAll('[data-export-report], [data-export-scan], [data-export-evidence], [data-export-diagnostics], [data-export-timing], [data-export-sample]')];
    for(const element of [...diagnosticSections,...diagnosticControls])element.dataset.providerDiagnostic='';
    for(const control of diagnosticControls)if(!control.closest('details')&&diagnosticSections[0])diagnosticSections[0].append(control);
    for(const section of diagnosticSections)section.hidden=true;
    if(provider)diagnosticsEnabled(provider).then(enabled=>{
      panel.dataset.providerDiagnostics=enabled?'enabled':'disabled';
      for(const section of diagnosticSections)section.hidden=!enabled;
    });
    const names={steam:'Steam',gog:'GOG',epic:'Epic Games','amazon-games':'Amazon Games',audible:'Audible',kindle:'Kindle','amazon-video':'Amazon Video','fandango-at-home':'Fandango at Home',kobo:'Kobo',fanatical:'Fanatical',humble:'Humble Bundle',xbox:'Xbox',playstation:'PlayStation',nintendo:'Nintendo'};
    const oldHeading=[...panel.querySelectorAll('h3, p > strong:first-child')].find(element=>/^(?:Galactic Library|Audible ownership check)/u.test(element.textContent));
    const heading=document.createElement('h2');heading.className='galactic-panel-heading';
    heading.textContent=provider?`Galactic Library · ${names[provider]??provider}`:oldHeading?.textContent??'Galactic Library';
    if(oldHeading){const next=oldHeading.nextSibling;if(next?.nodeName==='BR')next.remove();oldHeading.remove();}
    panel.prepend(heading);
    const introductions={
      steam:'Import your Steam games and DLC. Quick update checks new or unidentified applications; Full rescan checks the library again. Saved titles stay when Steam cannot identify them.',
      gog:'Import your GOG games, including hidden games. Quick update checks recent additions; Full rescan checks every available page.',
      epic:'Import the games and add-ons Epic reports as owned by the signed-in account. Sync checks the supported library each time.',
      'amazon-games':'Import games delivered to your Amazon Games library. Games delivered to other stores and code claims are excluded. Quick update checks recent claims; Full rescan checks all available years. Older or first-time imports may require a Full rescan.',
      audible:'Import your Audible audiobooks and available ownership evidence. Quick update checks new titles and recent purchase, return and gift history. Full rescan checks the library and all available history years. Subscription, expired and unconfirmed access remain distinct.',
      kindle:'Import your Kindle library. Quick update checks recent additions; Full rescan checks the supported library again. Use Book contents discovery below to find included works for review.',
      'amazon-video':'Import your Amazon Video movies and TV titles. Quick update checks recent additions; Full rescan refreshes the collection and purchase information. Earlier saved titles stay when Amazon cannot confirm a complete listing.',
      'fandango-at-home':'Import your Fandango movies and TV shows. Quick update checks recent purchases; Full rescan checks the whole available collection.',
      kobo:'Import your Kobo books and audiobooks. Quick update checks recent additions; Full rescan checks all available library sections. Library presence alone does not confirm ownership.',
      fanatical:'Import supported products from completed Fanatical orders. Quick update checks new completed orders; Full rescan checks all completed orders again.',
      humble:'Import supported books, audiobooks and game entitlements from Humble purchases. Quick update checks new purchases and pending key information; Full rescan checks all supported purchases again.',
      xbox:'Import the web-visible Xbox Owned catalog. Both actions check this entire list; Quick update adds changes. This is not your complete console or lifetime purchase history. Earlier saved items stay.',
      playstation:'Import the active PS4/PS5 Purchased web library. Both actions check the supported list; Quick update saves additions and changes. Older consoles and lifetime purchase history are outside this scope. Earlier saved items stay.',
      nintendo:'Import the non-hidden Switch Virtual Game Cards loaded on this page. Load all cards before importing. Other Nintendo purchase history is not included; earlier saved cards stay.'
    };
    if(introductions[provider]){
      const intro=panel.querySelector('p');
      if(intro){const help=document.createElement('details'),label=document.createElement('summary');label.textContent='How importing works';help.append(label,intro.cloneNode(true));intro.textContent=introductions[provider];help.dataset.importHelp='';(panel.querySelector('.panel-body')??panel).append(help);}
    }
    if(provider){
      const controls=document.createElement('div');
      controls.innerHTML='<p data-profile-status role="status">Loading saved account...</p><div data-profile-summary hidden><button type="button" data-profile-change>Change account</button><p>If you signed into another website account, change this selection first.</p></div><div data-profile-editor><label data-profile-choice-label hidden>Use saved account <select data-profile-choice></select></label><label>Account nickname <input data-profile-label maxlength="100" placeholder="e.g. Personal" list="galactic-profile-names"></label><datalist id="galactic-profile-names"></datalist><p>This nickname is your label for the website account. GL does not sign you in or verify your login. Editing it selects or adds an account; it does not rename one.</p><p data-profile-new-help hidden>Use Full rescan to start a new alternate account.</p><label data-profile-confirm-label><input type="checkbox" data-profile-confirm> I checked that the signed-in account matches this nickname</label><br><label><input type="checkbox" data-profile-switch> Confirm switching to this account</label><p><a data-profile-manage target="_blank" rel="noopener">Rename or manage accounts in GL Providers</a></p><button type="button" data-profile-cancel hidden>Cancel account change</button></div>';
      controls.style.cssText='font-size:12px;margin:10px 0';
      panel.querySelector('button').before(controls);
      let mode='full';
      const input=controls.querySelector('[data-profile-label]');
      let remembered=null,edited=false,hintValue='',resolved=false,lastProfileReply=null;
      const editor=controls.querySelector('[data-profile-editor]'),summary=controls.querySelector('[data-profile-summary]'),choice=controls.querySelector('[data-profile-choice]');
      controls.querySelector('[data-profile-manage]').href=(chrome.runtime.getURL?.('options.html')??'')+'#providers';
      const session={read:()=>({profileLabel:input.value.trim(),confirmed:controls.querySelector('[data-profile-confirm]').checked,switchProfile:controls.querySelector('[data-profile-switch]').checked,mode,
        ...(remembered&&input.value.trim()===remembered.profileLabel&&!controls.querySelector('[data-profile-switch]').checked?{profileId:remembered.profileId,rememberedProfile:true}:{})})};
      session.generation=0;
      const invalidate=()=>{session.generation++;session.context=null;session.resume=null;};
      input.addEventListener('input',()=>{edited=true;remembered=null;invalidate();editor.hidden=false;summary.hidden=true;controls.querySelector('[data-profile-cancel]').hidden=!lastProfileReply?.profileId;controls.querySelector('[data-profile-confirm]').checked=false;controls.querySelector('[data-profile-confirm-label]').hidden=false;controls.querySelector('[data-profile-status]').textContent='Confirm the account you want to update.';});
      controls.querySelector('[data-profile-switch]').addEventListener('change',invalidate);
      controls.querySelector('[data-profile-change]').addEventListener('click',()=>{invalidate();remembered=null;edited=true;editor.hidden=false;summary.hidden=true;controls.querySelector('[data-profile-confirm-label]').hidden=false;controls.querySelector('[data-profile-confirm]').checked=false;controls.querySelector('[data-profile-cancel]').hidden=false;choice.focus();});
      controls.querySelector('[data-profile-cancel]').addEventListener('click',()=>{invalidate();edited=false;applyProfile(lastProfileReply);if(summary.hidden)input.focus();else controls.querySelector('[data-profile-change]').focus();});
      choice.addEventListener('change',()=>{input.value=choice.value==='__add__'?'':lastProfileReply?.profiles?.find(p=>p.profileId===choice.value)?.nickname??'';input.readOnly=choice.value!=='__add__';controls.querySelector('[data-profile-new-help]').hidden=choice.value!=='__add__';input.dispatchEvent(new Event('input'));if(!input.readOnly)input.focus();});
      function applyProfile(result){
        if(!result?.ok)throw Error(result?.error??'Could not read saved accounts.');
        lastProfileReply=result;
        const profiles=(result.profiles??[]).filter(profile=>profile.nickname);
        controls.querySelector('datalist').replaceChildren();choice.replaceChildren();
        for(const profile of profiles){const suggestion=document.createElement('option');suggestion.value=profile.nickname;controls.querySelector('datalist').append(suggestion);const option=document.createElement('option');option.value=profile.profileId;option.textContent=profile.nickname;choice.append(option);}
        const add=document.createElement('option');add.value='__add__';add.textContent='Add account';choice.append(add);
        controls.querySelector('[data-profile-choice-label]').hidden=!profiles.length;
        if(!edited){input.value=result.profileLabel??'';choice.value=profiles.find(p=>p.nickname===input.value)?.profileId??'__add__';input.readOnly=choice.value!=='__add__';controls.querySelector('[data-profile-switch]').checked=false;controls.querySelector('[data-profile-confirm]').checked=false;}
        if(!edited&&result.reuseAllowed&&result.profileId){
          remembered={profileId:result.profileId,profileLabel:result.profileLabel??''};editor.hidden=true;summary.hidden=false;
          controls.querySelector('[data-profile-confirm-label]').hidden=true;
          controls.querySelector('[data-profile-status]').textContent=`Selected GL account: ${result.profileLabel||'Default account'}`;
        }else if(!edited){remembered=null;editor.hidden=false;summary.hidden=true;controls.querySelector('[data-profile-confirm-label]').hidden=false;controls.querySelector('[data-profile-status]').textContent='Select and confirm the signed-in account.';}
      }
      session.refresh=async generation=>{
        try{const result=await chrome.runtime.sendMessage({type:'GET_PROVIDER_PROFILE',provider});if(generation!==session.generation||sessions.get(provider)!==session)return;edited=false;applyProfile(result);}
        catch{controls.querySelector('[data-profile-status]').textContent='Library saved. Reload this page to refresh the account controls.';}
      };
      sessions.set(provider,session);
      shadow.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&(['full','incremental'].includes(button.dataset.mode)||button.hasAttribute('data-import-action'))){mode=button.dataset.mode??'full';invalidate();}},true);
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
        applyProfile(result);
        accountTiming?.begin('provider_verified_display')();
      }).catch(error=>{profileFailed=true;profileEnd?.();controls.querySelector('[data-profile-status]').textContent='Could not load saved accounts. Reload this page before updating.';throw error;})
        .finally(()=>{profileFinished=true;reportAccountTiming();});
      // A click during hydration waits for the same account result. Failure
      // keeps scans blocked; never infer consent from an unresolved lookup.
      session.ready.catch(()=>{});
    }
    const body=panel.querySelector('.panel-body')??panel;
    const status=panel.querySelector('.status, [data-import-status]'),help=panel.querySelector('[data-import-help]');
    if(status)body.append(status);
    if(help)body.append(help);
    for(const section of diagnosticSections)body.append(section);
    const style = document.createElement('style');
    style.textContent = ':host { color-scheme:var(--gh-color-scheme); } .panel { position:relative; } button:hover:not(:disabled) { background:var(--gh-accent-hover); } button:active:not(:disabled) { background:var(--gh-accent-pressed); } button:disabled { background:var(--gh-disabled); color:var(--gh-disabled-text); cursor:default; } input,select,textarea { background:var(--gh-input); color:var(--gh-text); border:1px solid var(--gh-input-border); accent-color:var(--gh-accent); font:inherit; max-width:100%; } button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid var(--gh-focus); outline-offset:3px; } .galactic-panel-minimize { position:absolute; right:9px; top:9px; padding:3px 7px; font-size:12px; } .galactic-panel-restore { border:1px solid var(--gh-border); border-radius:7px; background:var(--gh-accent); box-shadow:var(--gh-shadow); color:var(--gh-on-accent); cursor:pointer; font:14px/1.4 var(--gh-font); padding:7px 10px; }';
    const minimize = document.createElement('button');
    style.textContent += `
      :host { width:360px!important; max-width:calc(100vw - 36px)!important; font:14px/1.4 var(--gh-font,system-ui,sans-serif)!important; }
      .panel { box-sizing:border-box; width:100%; max-width:100%; max-height:calc(100vh - 36px); overflow:auto; padding:14px; border-radius:8px; overflow-wrap:anywhere; }
      .panel:has(.panel-body) { display:flex; flex-direction:column; overflow:hidden; }
      .panel-body { min-height:0; overflow:auto; }
      .galactic-panel-heading { flex-shrink:0; font:700 14px/1.4 var(--gh-font,system-ui,sans-serif); margin:0 0 10px; padding-right:76px; overflow-wrap:anywhere; }
      .panel p { margin:0 0 10px; } .panel button { font:inherit; border-radius:5px; padding:8px 10px; margin:3px 2px 3px 0; }
      .panel .galactic-panel-minimize { font-size:12px; padding:3px 7px; margin:0; }
      .panel label { overflow-wrap:anywhere; } .panel input:not([type=checkbox]),.panel select { box-sizing:border-box; max-width:100%; }
      .panel details { margin-top:10px; } .panel summary { cursor:pointer; } .panel .status { margin-top:10px; }
      .contents-controls { flex-shrink:0; } .panel[hidden] { display:none; }
      .panel:not([data-provider-diagnostics="enabled"]) [data-provider-diagnostic] { display:none!important; }
    `;
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
  global.GalacticFloatingPanel = { attach,diagnosticsEnabled };
}(globalThis));
