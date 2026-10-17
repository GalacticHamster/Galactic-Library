(function attachEpicSync() {
  'use strict';
  if (document.querySelector('#galactic-library-epic-importer') || !globalThis.GalacticEpic) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-epic-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br>Import games Epic Games Store reports as owned by this signed-in account. Only game IDs, titles, platforms, and add-on links are saved locally.</p><button type="button">Sync Epic library</button><p class="status" role="status"></p><details><summary>Performance diagnostics</summary><p><label><input type="checkbox" data-profile-next> Profile the next Epic sync</label></p><p data-profile-timing-status role="status">Detailed timing is off.</p><p><a data-open-timing target="_blank" rel="noopener">Export timing in GL Settings > Performance diagnostics</a>. Export promptly: worker timings are in memory and are lost when the worker restarts. Arm this option again for a second scan.</p></details></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');
  const profileNext=shadow.querySelector('[data-profile-next]'),profileStatus=shadow.querySelector('[data-profile-timing-status]');
  shadow.querySelector('[data-open-timing]').href=chrome.runtime.getURL('options.html')+'#settings';
  profileNext.addEventListener('change',()=>{profileStatus.textContent=profileNext.checked?'Armed for the next Epic sync in this tab.':'Detailed timing is off.';});

  button.addEventListener('click', async () => {
    if(button.disabled)return;
    const profileThisScan=profileNext.checked;if(profileThisScan){profileNext.checked=false;profileStatus.textContent='Profiling this Epic sync…';}profileNext.disabled=true;
    const timing=globalThis.GalacticSync.trace?.('epic',{once:profileThisScan}),P=globalThis.GalacticContentsPerformance;let completed=false,uiEnd,fetchEnd,finishEnd;
    const startEnd=timing?.begin('request_dispatch');
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const scan = await globalThis.GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider:'epic',diagnosticLookupId:timing?.id});
      startEnd?.();P?.merge(timing,scan?.performance);
      if(!scan?.ok)throw new Error(scan?.error??'Could not start scan.');
      fetchEnd=timing?.begin('provider_fetch');
      const { items, skippedCount, snapshot } = await globalThis.GalacticEpic.fetchEpicGames(({ pagesRead, games }) => {
        status.textContent = `Reading Epic library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${games} games found.`;
      });
      fetchEnd?.();
      if(timing)Object.assign(timing,{providerCaptured:items.length,providerUnsupported:skippedCount});
      status.textContent = 'Saving Epic games and add-ons locally...';
      finishEnd=timing?.begin('save_message');
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'epic', items, snapshot,diagnosticLookupId:timing?.id });
      finishEnd?.();P?.merge(timing,response?.performance);
      if (!response?.ok) throw new Error(response?.error ?? 'Epic import did not complete.');
      completed=true;
      uiEnd=timing?.begin('page_ui');
      const unlinkedAddOnCount = response.addOnCount - response.linkedAddOnCount;
      const c=response.changes;
      status.textContent = `Sync complete. ${!scan.hasFullBaseline?`Imported ${response.gameCount} games and ${response.addOnCount??0} add-ons.`:c?`${c.gamesAdded} new games, ${c.gamesUpdated} updated; ${c.addOnsAdded} new add-ons, ${c.addOnsUpdated} updated.`:'Library saved.'} ${response.gameCount} games and ${response.addOnCount??0} add-ons currently recorded.${unlinkedAddOnCount?` ${unlinkedAddOnCount} add-ons have no saved parent game.`:''}${skippedCount?` ${skippedCount} non-game account items excluded.`:''}`;
    } catch (error) {
      await globalThis.GalacticSync.failed('epic',error);
      status.textContent = `Epic import failed: ${error.message}`;
    } finally {
      startEnd?.();fetchEnd?.();finishEnd?.();uiEnd??=timing?.begin('page_ui');
      button.disabled = false;
      delete status.dataset.busy;
      profileNext.disabled=false;
      if(timing){await new Promise(resolve=>requestAnimationFrame(resolve));uiEnd?.();try{const reply=await globalThis.GalacticSync.send({type:'GL_PROVIDER_UI_TIMING',provider:'epic',timing:P.clean(timing.finish(completed?'prepared':'failed'))});if(profileThisScan)profileStatus.textContent=reply?.ok?'Timing captured. Export promptly from GL Settings > Performance diagnostics.':'Timing could not be delivered. Arm profiling and try again.';}catch{if(profileThisScan)profileStatus.textContent='Timing could not be delivered. Arm profiling and try again.';}}
      if(profileThisScan&&!timing)profileStatus.textContent='Timing tools are unavailable. Reload this page before profiling again.';
    }
  });
  globalThis.GalacticFloatingPanel?.attach(shadow, 'epic');
  document.documentElement.append(host);
}());
