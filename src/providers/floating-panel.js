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
      if(!context.rememberedProfile&&!context.confirmed)throw new Error('Enter a profile label and confirm the signed-in account.');
      const result=await chrome.runtime.sendMessage({...request,...context,beginScan:true,...(timing?{diagnosticSentEpochMs:global.GalacticContentsPerformance.now()}: {})});
      if(generation!==session.generation)throw new Error('Account selection changed. Confirm the account and start a fresh import.');
      if(result.ok){
        session.context={...context,confirmed:true,mode:result.forceFull?'full':context.mode,scanToken:result.scanToken,profileId:result.profileId};
        if(context.mode==='incremental'&&result.forceFull){
          const status=session.status;
          if(status)status.textContent=result.scanReason==='first-import'?'First import: scanning your library...':'Incremental history unavailable: performing a full scan...';
        }
      }
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
        if(!context.confirmed)throw new Error('Enter a profile label and confirm the signed-in account.');
        request={...request,state:{...request.state,scanContext:context}};
      }
      const result=await chrome.runtime.sendMessage(request);
      if(request.action==='get'&&result.state){
        const context=result.state.scanContext;
        if(!context?.confirmed)throw new Error('Start a fresh scan; the previous scan has no confirmed profile.');
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

  const names={steam:'Steam',gog:'GOG',epic:'Epic Games','amazon-games':'Amazon Games',audible:'Audible',kindle:'Kindle','amazon-video':'Amazon Video','fandango-at-home':'Fandango at Home',kobo:'Kobo',fanatical:'Fanatical',humble:'Humble Bundle',xbox:'Xbox',playstation:'PlayStation',nintendo:'Nintendo'};
  const introductions={
    steam:'Import your Steam games and DLC, including applications Steam cannot currently identify.',
    gog:'Import your GOG games, including hidden games.',
    epic:'Import games and add-ons from your Epic Games library.',
    'amazon-games':'Import games delivered to your Amazon Games library. Code claims and deliveries to other stores are excluded.',
    audible:'Import your Audible audiobooks and supported ownership evidence. Owned, subscription, expired and unconfirmed access remain distinct.',
    kindle:'Import your Kindle library. You can also discover the individual works included in your books.',
    'amazon-video':'Import your Amazon Video movies and TV titles.',
    'fandango-at-home':'Import your Fandango at Home movies and TV shows.',
    kobo:'Import your Kobo books and audiobooks. Library presence alone does not confirm ownership.',
    fanatical:'Import supported products from completed Fanatical orders.',
    humble:'Import supported books, audiobooks, games and entitlements from Humble purchases.',
    xbox:'Import your web-visible Xbox Owned catalog. This is not your complete console or lifetime purchase history.',
    playstation:'Import your active PS4/PS5 Purchased web library. Older consoles and complete lifetime purchase history are not included.',
    nintendo:'Import the loaded, non-hidden Switch Virtual Game Cards. Other Nintendo purchase history is not included.'
  };
  const importHelp={
    steam:'Quick update checks newly added or previously unidentified applications. Full rescan checks the complete supported Steam library. Earlier saved titles stay if Steam cannot identify them.',
    gog:'Quick update reads newest-first purchase pages until it reaches a page already saved in GL. Full rescan checks every available supported page, including the hidden-games pages.',
    epic:'Sync Epic library checks the supported owned listing each time and refreshes saved games and add-ons. It does not stop at previously saved titles. Earlier saved titles stay if Epic cannot confirm a complete listing.',
    'amazon-games':'Quick update checks the past three months of claims. Full rescan checks all available calendar years. Without a complete initial import, or when the last sync is over 70 days old, Quick update automatically checks all years to avoid gaps. Unclear delivery details stay unconfirmed; earlier confirmed access and your corrections are kept.',
    audible:'Quick update stops at previously saved library titles and checks purchase, return and received-gift history for the current and previous calendar years. Without an initial library import, Quick update automatically reads the complete library and all available history years once. Full rescan reads the complete library and all available history years. Both enrich matching saved titles automatically and preserve earlier ownership evidence and acquisition dates. Incomplete history checks leave uncertain access unconfirmed. Readable titles from unfinished library scans are saved without removing earlier records. Run Full rescan to recover unchecked library pages; Quick update also runs Full while library recovery is pending.',
    kindle:'Quick update reads the newest Kindle pages until it reaches a page already saved in your library. Full rescan checks the supported library again.',
    'amazon-video':'Quick update checks recent additions until it reaches an already saved group. Full rescan checks the wider collection and refreshes purchase labels. Earlier saved titles stay when Amazon cannot confirm a complete listing.',
    'fandango-at-home':'Quick update reads newest-first Recently Purchased lists until it reaches known titles. Full rescan checks every available movie and TV card against Fandango’s reported counts. Readable titles from an unfinished scan are saved without removing earlier records. Run Full rescan to recover unchecked titles.',
    kobo:'Quick update reads newest-first My Books pages until it reaches a page already saved in GL. Full rescan also checks Archive and Audiobooks when Kobo exposes them. Without an initial full import, Quick update checks the wider library once. Your account ownership preference and manual corrections remain separate from Kobo’s source evidence.',
    fanatical:'Quick update reads details for new completed orders and skips orders already checked. Full rescan checks all completed orders again and refreshes the saved account library.',
    humble:'Quick update checks new purchases and refreshes pending key-status information. Full rescan checks all supported purchases again, including previously saved purchases. This can pick up information after an importer update. Redemption codes are removed before purchase details are read and are never saved.',
    xbox:'Quick update and Full rescan both inspect the entire supported web list; Quick update does not traverse less data. Quick update saves additions and changes; Full rescan records a complete supported-list check. Both keep earlier saved items that are absent from this limited view.',
    playstation:'Quick update and Full rescan both inspect the entire supported listing; Quick update does not traverse less data. Quick update saves additions and changes; Full rescan records a complete supported-list check. Both keep earlier saved items that are absent from this limited view.',
    nintendo:'Let the available cards finish loading before selecting Import Nintendo cards. This single action checks the loaded list and adds or updates matching saved cards. Earlier saved cards stay if they are not in this view.'
  };

  const singleActions={epic:'Sync Epic library',nintendo:'Import Nintendo cards'};
  function render(shadow,provider,{diagnostics='',specialized='',footer='',styles='',onImport}={}){
    if(!Object.hasOwn(names,provider)||!Object.hasOwn(introductions,provider)||!Object.hasOwn(importHelp,provider))throw Error('Unknown provider overlay.');
    shadow.host.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;color:var(--gh-text);';
    const baseStyle=document.createElement('style');
    baseStyle.textContent=`
      :host { font:14px/1.4 var(--gh-font,system-ui,sans-serif); color:var(--gh-text); }
      .panel { background:var(--gh-surface); color:var(--gh-text); border:1px solid var(--gh-border); box-shadow:var(--gh-shadow); padding:14px; border-radius:8px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; }
      button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; }
      .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; }
      @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    `+styles;
    const panel=document.createElement('section');panel.className='panel';panel.dataset.providerOverlay=provider;
    const body=document.createElement('div');body.className='panel-body';
    if(specialized){const label=document.createElement('h3');label.textContent='Library import';body.append(label);}
    const intro=document.createElement('p');intro.dataset.importDescription='';intro.textContent=introductions[provider];body.append(intro);
    const actions=[];
    for(const [mode,label] of singleActions[provider]?[[provider==='nintendo'?'full':null,singleActions[provider]]]:[['incremental','Quick update'],['full','Full rescan']]){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      if(mode)button.dataset.mode=mode;else button.dataset.importAction='';
      if(onImport)button.addEventListener('click',()=>onImport(mode));
      body.append(button);actions.push(button);
    }
    const status=document.createElement('p');status.className='status';status.dataset.importStatus='';status.setAttribute('role','status');
    status.textContent={xbox:'Let Xbox Library finish loading before importing.',playstation:'Let the Purchased library finish loading before importing.',nintendo:'Let Nintendo finish loading the card list before importing.'}[provider]??'';
    const help=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');
    help.dataset.importHelp='';summary.textContent='How importing works';text.textContent=importHelp[provider];help.append(summary,text);body.append(status,help);
    // Slots accept only extension-authored markup. They never build common controls.
    const append=(parent,markup)=>{if(markup){const template=document.createElement('template');template.innerHTML=markup;parent.append(template.content);}};
    append(body,specialized);append(body,diagnostics);panel.append(body);append(panel,footer);
    for(const section of body.querySelectorAll('details'))if(/diagnostic/iu.test(section.querySelector('summary')?.textContent??'')){section.dataset.providerDiagnostic='';section.hidden=true;}
    shadow.replaceChildren(baseStyle,panel);
    return {panel,body,actions,status};
  }
  function attach(shadow,provider) {
    const panel = shadow?.querySelector?.('.panel');
    if (!panel || shadow.querySelector('[data-galactic-floating-panel-control]')) return;
    if(provider&&panel.dataset.providerOverlay!==provider)throw Error('Use the shared provider overlay renderer before attaching account controls.');
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
    const oldHeading=[...panel.querySelectorAll('h3, p > strong:first-child')].find(element=>/^(?:Galactic Library|Audible ownership check)/u.test(element.textContent));
    const heading=document.createElement('h2');heading.className='galactic-panel-heading';
    heading.textContent=provider?`Galactic Library · ${names[provider]??provider}`:oldHeading?.textContent??'Galactic Library';
    if(oldHeading){const next=oldHeading.nextSibling;if(next?.nodeName==='BR')next.remove();oldHeading.remove();}
    panel.prepend(heading);
    if(provider){
      const controls=document.createElement('div');
      controls.innerHTML='<p data-profile-status role="status">Loading saved account...</p><div data-profile-summary hidden><button type="button" data-profile-change>Change account</button><p>Using a different account on this site? Select Change account first.</p></div><div data-profile-editor><label data-profile-choice-label hidden>Use saved account <select data-profile-choice></select></label><label>Account nickname <input data-profile-label maxlength="100" placeholder="e.g. Personal" list="galactic-profile-names"></label><datalist id="galactic-profile-names"></datalist><p>This nickname is your label for the website account. GL does not sign you in or verify your login. Use Add account for another account. Rename saved accounts in GL Providers; editing this field does not rename them.</p><p data-profile-new-help hidden>Quick update automatically scans the full library for a new account.</p><label data-profile-confirm-label><input type="checkbox" data-profile-confirm> I checked that the signed-in account matches this nickname</label><br><label><input type="checkbox" data-profile-switch> Confirm switching to this account</label><p><a data-profile-manage target="_blank" rel="noopener">Rename or manage accounts in GL Providers</a></p><button type="button" data-profile-cancel hidden>Cancel account change</button></div>';
      controls.dataset.providerAccount='';
      controls.style.cssText='font-size:12px;margin:10px 0';
      panel.querySelector('button').before(controls);
      let mode='full';
      const input=controls.querySelector('[data-profile-label]');
      let remembered=null,automatic=false,edited=false,hintValue='',resolved=false,lastProfileReply=null;
      const editor=controls.querySelector('[data-profile-editor]'),summary=controls.querySelector('[data-profile-summary]'),choice=controls.querySelector('[data-profile-choice]');
      controls.querySelector('[data-profile-manage]').href=(chrome.runtime.getURL?.('options.html')??'')+'#providers';
      const session={read:()=>({profileLabel:input.value.trim(),confirmed:controls.querySelector('[data-profile-confirm]').checked||automatic&&lastProfileReply?.reuseAllowed!==true,switchProfile:controls.querySelector('[data-profile-switch]').checked,mode,
        ...(choice.value!=='__add__'&&lastProfileReply?.profiles?.some(p=>p.profileId===choice.value)?{profileId:choice.value}:{}),
        ...(remembered&&input.value.trim()===remembered.profileLabel&&!controls.querySelector('[data-profile-switch]').checked?{profileId:remembered.profileId,rememberedProfile:lastProfileReply?.reuseAllowed===true}:{})})};
      session.generation=0;session.status=panel.querySelector('[data-import-status]');
      const invalidate=()=>{session.generation++;session.context=null;session.resume=null;};
      input.addEventListener('input',()=>{edited=true;automatic=false;remembered=null;invalidate();editor.hidden=false;summary.hidden=true;controls.querySelector('[data-profile-cancel]').hidden=!lastProfileReply?.profileId;controls.querySelector('[data-profile-confirm]').checked=false;controls.querySelector('[data-profile-confirm-label]').hidden=false;controls.querySelector('[data-profile-status]').textContent='Confirm the account you want to update.';});
      controls.querySelector('[data-profile-switch]').addEventListener('change',invalidate);
      controls.querySelector('[data-profile-change]').addEventListener('click',()=>{invalidate();remembered=null;automatic=false;edited=true;editor.hidden=false;summary.hidden=true;controls.querySelector('[data-profile-confirm-label]').hidden=false;controls.querySelector('[data-profile-confirm]').checked=false;controls.querySelector('[data-profile-cancel]').hidden=false;choice.focus();});
      controls.querySelector('[data-profile-cancel]').addEventListener('click',()=>{invalidate();edited=false;applyProfile(lastProfileReply);if(summary.hidden)input.focus();else controls.querySelector('[data-profile-change]').focus();});
      choice.addEventListener('change',()=>{input.value=choice.value==='__add__'?'':lastProfileReply?.profiles?.find(p=>p.profileId===choice.value)?.nickname??'';input.readOnly=choice.value!=='__add__';controls.querySelector('[data-profile-new-help]').hidden=choice.value!=='__add__';input.dispatchEvent(new Event('input'));if(!input.readOnly)input.focus();});
      function applyProfile(result){
        if(!result?.ok)throw Error(result?.error??'Could not read saved accounts.');
        lastProfileReply=result;
        const profiles=result.profiles??[];
        controls.querySelector('datalist').replaceChildren();choice.replaceChildren();
        for(const profile of profiles){const suggestion=document.createElement('option');suggestion.value=profile.nickname;controls.querySelector('datalist').append(suggestion);const option=document.createElement('option');option.value=profile.profileId;option.textContent=profile.nickname||'Default account';choice.append(option);}
        const add=document.createElement('option');add.value='__add__';add.textContent='Add account';choice.append(add);
        controls.querySelector('[data-profile-choice-label]').hidden=!profiles.length;
        if(!edited){input.value=result.profileLabel??'';choice.value=profiles.some(p=>p.profileId===result.profileId)?result.profileId:'__add__';input.readOnly=choice.value!=='__add__';controls.querySelector('[data-profile-switch]').checked=false;controls.querySelector('[data-profile-confirm]').checked=false;}
        if(!edited&&(profiles.length===0||profiles.length===1&&result.profileId)){
          automatic=true;
          remembered=result.profileId?{profileId:result.profileId,profileLabel:result.profileLabel??''}:null;editor.hidden=true;summary.hidden=false;
          controls.querySelector('[data-profile-confirm-label]').hidden=true;
          controls.querySelector('[data-profile-status]').textContent=`Selected account for updates: ${result.profileLabel||'Default account'}`;
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
    const contents=panel.querySelector('[data-book-contents-workflow]');
    // The same import order precedes any specialized workflow (Kindle).
    for(const element of [status,help].filter(Boolean)){
      if(contents)contents.before(element);else body.append(element);
    }
    for(const section of diagnosticSections)body.append(section);
    const style = document.createElement('style');
    style.textContent = ':host { color-scheme:var(--gh-color-scheme); } .panel { position:relative; } button:hover:not(:disabled) { background:var(--gh-accent-hover); } button:active:not(:disabled) { background:var(--gh-accent-pressed); } button:disabled { background:var(--gh-disabled); color:var(--gh-disabled-text); cursor:default; } input,select,textarea { background:var(--gh-input); color:var(--gh-text); border:1px solid var(--gh-input-border); accent-color:var(--gh-accent); font:inherit; max-width:100%; } button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid var(--gh-focus); outline-offset:3px; } .galactic-panel-minimize { position:absolute; right:9px; top:9px; padding:3px 7px; font-size:12px; } .galactic-panel-restore { border:1px solid var(--gh-border); border-radius:7px; background:var(--gh-accent); box-shadow:var(--gh-shadow); color:var(--gh-on-accent); cursor:pointer; font:14px/1.4 var(--gh-font); padding:7px 10px; }';
    const minimize = document.createElement('button');
    style.textContent += `
      :host { width:360px!important; max-width:calc(100vw - 36px)!important; font:14px/1.4 var(--gh-font,system-ui,sans-serif)!important; }
      .panel { box-sizing:border-box; width:100%; max-width:100%; max-height:calc(100vh - 36px); overflow:auto; padding:14px; border-radius:8px; overflow-wrap:anywhere; }
      .panel:has(.panel-body) { display:flex; flex-direction:column; overflow:hidden; }
      .panel-body { min-height:0; overflow:auto; padding:5px; margin:-5px; }
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
  global.GalacticFloatingPanel = { render,attach,diagnosticsEnabled };
}(globalThis));
