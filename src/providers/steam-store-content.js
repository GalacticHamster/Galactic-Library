(function attachSteamStoreSync() {
  'use strict';
  if (document.querySelector('#galactic-library-steam-store-importer') || !globalThis.GalacticSteamStore) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-steam-store-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> checks for newly added or previously unidentified applications. <strong>Full rescan</strong> checks your complete Steam library. Earlier saved titles are kept if their information is unavailable.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p><details><summary>Steam diagnostics</summary><p><label><input type="checkbox" data-profile-next> Profile the next Quick Update</label></p><p data-profile-timing-status role="status">Detailed timing is off.</p><p><a data-open-timing target="_blank" rel="noopener">Export timing in GL Settings > Performance diagnostics</a>. Export promptly: worker timings are held in memory and lost when the worker restarts. Reloading this page clears an unused profiling request.</p><p><label><input type="checkbox" data-sample-ids> Sample unresolved App IDs on the next update</label></p><p>App IDs may reveal part of your Steam library. Samples stay in this page, exclude titles and accounts, and are never included in timing exports.</p><button type="button" data-export-sample disabled>Export sampled App IDs</button></details></div>`;
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  shadow.querySelector('details').hidden=new URLSearchParams(location.search).get('gl-steam-diagnostics')!=='1';
  const status = shadow.querySelector('.status');
  const sampleCheckbox=shadow.querySelector('[data-sample-ids]'),sampleButton=shadow.querySelector('[data-export-sample]');
  const refreshSampleButton=()=>{const sample=globalThis.GalacticSteamStore.getDiagnosticSample();sampleButton.disabled=!sampleCheckbox.checked||!sample||!Object.values(sample.groups).some(rows=>rows.length);};
  sampleCheckbox.addEventListener('change',()=>{globalThis.GalacticSteamStore.setDiagnosticSampling(sampleCheckbox.checked);refreshSampleButton();});
  sampleButton.addEventListener('click',()=>{
    const sample=globalThis.GalacticSteamStore.getDiagnosticSample();if(!sampleCheckbox.checked||!sample)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(sample,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='GL-steam-app-id-sample.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });

  const profileNext=shadow.querySelector('[data-profile-next]'),profileStatus=shadow.querySelector('[data-profile-timing-status]');
  shadow.querySelector('[data-open-timing]').href=chrome.runtime.getURL('options.html')+'#settings';
  profileNext.addEventListener('change',()=>{profileStatus.textContent=profileNext.checked?'Armed for the next Quick Update in this Steam tab.':'Detailed timing is off.';});
  let scanning=false;
  async function sync(mode) {
    if(scanning)return;scanning=true;
    const profileThisScan=mode==='incremental'&&profileNext.checked;
    if(profileThisScan){profileNext.checked=false;profileStatus.textContent='Profiling this Quick Update…';}
    profileNext.disabled=true;
    const timing=globalThis.GalacticSync.trace?.('steam',{once:profileThisScan}),P=globalThis.GalacticContentsPerformance;let completed=false,uiEnd,fetchEnd,finishEnd;
    const startEnd=timing?.begin('request_dispatch');
    buttons.forEach((button) => { button.disabled = true; });
    sampleCheckbox.disabled=true;sampleButton.disabled=true;
    globalThis.GalacticSteamStore.setDiagnosticSampling(sampleCheckbox.checked);
    status.dataset.busy = 'true';
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'steam',diagnosticLookupId:timing?.id });
      startEnd?.();P?.merge(timing,state?.performance);
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Steam sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'Checking your complete Steam library before the first quick update...';
      fetchEnd=timing?.begin('provider_fetch');
      const result = await globalThis.GalacticSteamStore.fetchOwnedSteamGames(({ completed, total, ownedApps, games, phase }) => {
        const retryingTitles = phase === 'retrying-titles';
        status.textContent = retryingTitles
          ? `Steam is checking titles one at a time: ${completed}/${total} apps checked; ${games} games found so far.`
          : `Identifying Steam applications: ${completed}/${total} checked.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? [],{diagnostics:Boolean(timing)});
      fetchEnd?.();
      const { items, unresolvedApps } = result;
      if(timing)Object.assign(timing,{providerCandidates:result.newAppCount,providerCaptured:items.length,providerUnresolved:unresolvedApps.length,providerUnsupported:result.unsupportedAppCount??0,providerFailedRequests:result.failedRequestCount??0});
      if(timing&&result.diagnostics)timing.steamDiagnostics={...result.diagnostics,saveState:'pending'};
      status.textContent = items.length ? 'Saving Steam games and DLC locally...' : 'Recording the Steam check; existing saved items are retained...';
      finishEnd=timing?.begin('save_message');
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'steam', mode: fullRescan ? 'full' : 'incremental', items, snapshot: result.snapshot,syncState:{applications:result.applications},diagnosticLookupId:timing?.id,scanDiagnostics:{failedRequestCount:0,incomplete:false} });
      finishEnd?.();P?.merge(timing,response?.performance);
      if (!response?.ok){if(timing?.steamDiagnostics){Object.assign(timing.steamDiagnostics,{saveState:response?.ok===false?'rejected':'unconfirmed',...(response?.ok===false?{savedCount:0,saveRejectedCount:items.length}:{})});timing.steamDiagnostics.firstFailure??={stage:'save',kind:'other'};}throw new Error(response?.error ?? 'Steam import did not complete.');}
      if(timing?.steamDiagnostics)Object.assign(timing.steamDiagnostics,{saveState:'committed',savedCount:items.length,saveRejectedCount:0});
      completed=true;
      uiEnd=timing?.begin('page_ui');
      const unlinkedAddOnCount = response.addOnCount - response.linkedAddOnCount;
      const c=response.changes;
      const changed=!state.hasFullBaseline?`Imported ${response.gameCount} games and ${response.addOnCount??0} DLC.`:c?`${c.gamesAdded} new games, ${c.gamesUpdated} updated; ${c.addOnsAdded} new DLC, ${c.addOnsUpdated} updated.`:'Library saved.';
      const details=[];
      if(unresolvedApps.length)details.push(`${unresolvedApps.length} applications still need title or type information. Their access evidence is saved for later identification.`);
      if(result.unsupportedAppCount)details.push(`${result.unsupportedAppCount} other ${result.unsupportedAppCount===1?'application is':'applications are'} saved separately from games and DLC.`);
      status.textContent = `${fullRescan?'Steam import':'Quick update'} complete. ${changed} ${response.gameCount} games and ${response.addOnCount??0} DLC currently recorded. ${details.join(' ')} Earlier saved titles were kept.${unlinkedAddOnCount?` ${unlinkedAddOnCount} DLC have no saved parent game.`:''}`;
    } catch (error) {
      if(timing&&error.steamDiagnostics)timing.steamDiagnostics=error.steamDiagnostics;
      if(timing?.steamDiagnostics?.saveState==='pending'){timing.steamDiagnostics.saveState='unconfirmed';timing.steamDiagnostics.firstFailure??={stage:'save',kind:'other'};}
      await globalThis.GalacticSync.failed('steam',error);
      status.textContent = `Steam import failed: ${error.message}`;
    } finally {
      startEnd?.();fetchEnd?.();finishEnd?.();uiEnd??=timing?.begin('page_ui');
      sampleCheckbox.disabled=false;refreshSampleButton();
      delete status.dataset.busy;
      if(timing){await new Promise(resolve=>requestAnimationFrame(resolve));uiEnd?.();try{const reply=await globalThis.GalacticSync.send({type:'GL_PROVIDER_UI_TIMING',provider:'steam',timing:P.clean(timing.finish(completed?'prepared':'failed'))});if(profileThisScan)profileStatus.textContent=reply?.ok?'Timing captured. Export promptly from GL Settings > Performance diagnostics.':'Timing could not be delivered. Arm profiling and try again.';}catch{if(profileThisScan)profileStatus.textContent='Timing could not be delivered. Arm profiling and try again.';}}
      if(profileThisScan&&!timing)profileStatus.textContent='Timing tools are unavailable. Reload this page before profiling again.';
      profileNext.disabled=false;scanning=false;
      buttons.forEach((button) => { button.disabled = false; });
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow, 'steam');
  document.documentElement.append(host);
}());
