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
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads Steam's owned App-ID list and checks titles for App IDs not yet saved in GL. These may be retries rather than new purchases. <strong>Full rescan</strong> rebuilds the Steam snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    const timing=globalThis.GalacticSync.trace?.('steam'),P=globalThis.GalacticContentsPerformance;let completed=false,uiEnd,fetchEnd,finishEnd;
    const startEnd=timing?.begin('request_dispatch');
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'steam',diagnosticLookupId:timing?.id });
      startEnd?.();P?.merge(timing,state?.performance);
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Steam sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Steam baseline yet; resolving every owned app once…';
      fetchEnd=timing?.begin('provider_fetch');
      const result = await globalThis.GalacticSteamStore.fetchOwnedSteamGames(({ completed, total, ownedApps, games, phase }) => {
        const retryingTitles = phase === 'retrying-titles';
        status.textContent = retryingTitles
          ? `Steam is checking titles one at a time: ${completed}/${total} apps checked; ${games} games found so far.`
          : `Reading Steam titles: ${completed}/${total} candidate App IDs checked from ${ownedApps} owned apps; ${games} games found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? [],{diagnostics:Boolean(timing)});
      fetchEnd?.();
      const { items, unresolvedApps } = result;
      if(timing)Object.assign(timing,{providerCandidates:result.newAppCount,providerCaptured:items.length,providerUnresolved:unresolvedApps.length,providerUnsupported:result.unsupportedAppCount??0,providerFailedRequests:result.failedRequestCount??0});
      if(timing&&result.diagnostics)timing.steamDiagnostics={...result.diagnostics,saveState:'pending'};
      status.textContent = items.length ? 'Saving Steam games and DLC locally...' : 'No new Steam apps; recording the completed check...';
      finishEnd=timing?.begin('save_message');
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'steam', mode: fullRescan ? 'full' : 'incremental', items, snapshot: result.snapshot,diagnosticLookupId:timing?.id,scanDiagnostics:{failedRequestCount:result.failedRequestCount??0,incomplete:unresolvedApps.length>0} });
      finishEnd?.();P?.merge(timing,response?.performance);
      if (!response?.ok){if(timing?.steamDiagnostics){Object.assign(timing.steamDiagnostics,{saveState:response?.ok===false?'rejected':'unconfirmed',...(response?.ok===false?{savedCount:0,saveRejectedCount:items.length}:{})});timing.steamDiagnostics.firstFailure??={stage:'save',kind:'other'};}throw new Error(response?.error ?? 'Steam import did not complete.');}
      if(timing?.steamDiagnostics)Object.assign(timing.steamDiagnostics,{saveState:'committed',savedCount:items.length,saveRejectedCount:0});
      completed=true;
      uiEnd=timing?.begin('page_ui');
      const unlinkedAddOnCount = response.addOnCount - response.linkedAddOnCount;
      const c=response.changes;
      const changed=!state.hasFullBaseline?`Imported ${response.gameCount} games and ${response.addOnCount??0} DLC.`:c?`${c.gamesAdded} new games, ${c.gamesUpdated} updated; ${c.addOnsAdded} new DLC, ${c.addOnsUpdated} updated.`:'Library saved.';
      const incomplete=result.failedRequestCount||unresolvedApps.length;
      status.textContent = `${fullRescan?'Full rescan':'Quick update'} ${incomplete?items.length?'incomplete; readable records saved':'incomplete; no readable games or DLC saved':'complete'}. ${changed} ${response.gameCount} games and ${response.addOnCount??0} DLC currently recorded. ${result.newAppCount} candidate App IDs checked (including retries).${unresolvedApps.length?` The owned App-ID list was read; ${unresolvedApps.length} App IDs still lack usable title metadata and will be retried. ${result.failureSummary??''}`:''}${result.unsupportedAppCount?` ${result.unsupportedAppCount} App IDs returned other catalog types; no game ownership was added for them.`:''}${unlinkedAddOnCount?` ${unlinkedAddOnCount} DLC have no saved parent game.`:''}`;
    } catch (error) {
      if(timing&&error.steamDiagnostics)timing.steamDiagnostics=error.steamDiagnostics;
      if(timing?.steamDiagnostics?.saveState==='pending'){timing.steamDiagnostics.saveState='unconfirmed';timing.steamDiagnostics.firstFailure??={stage:'save',kind:'other'};}
      await globalThis.GalacticSync.failed('steam',error);
      status.textContent = `Steam import failed: ${error.message}`;
    } finally {
      startEnd?.();fetchEnd?.();finishEnd?.();uiEnd??=timing?.begin('page_ui');
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
      if(timing){await new Promise(resolve=>requestAnimationFrame(resolve));uiEnd?.();globalThis.GalacticSync.send({type:'GL_PROVIDER_UI_TIMING',provider:'steam',timing:P.clean(timing.finish(completed?'prepared':'failed'))}).catch(()=>{});}
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow, 'steam');
  document.documentElement.append(host);
}());
