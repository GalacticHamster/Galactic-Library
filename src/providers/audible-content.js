(function attachAudibleSync() {
  'use strict';
  if (document.querySelector('#galactic-library-audible-importer') || !globalThis.GalacticAudible) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-audible-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads Audible's Date added pages until it reaches titles already in your local baseline. <strong>Full rescan</strong> rebuilds the Audible snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const diagnostics=document.createElement('details');diagnostics.innerHTML='<summary>Audible pagination diagnostics</summary><p>Read-only check of pages 1, 18, 19 and 20. The export contains page numbers and counts, not book titles, product IDs, page contents, URLs or credentials. No library records are changed by this check.</p><button type="button" data-check-pages>Check library pagination</button> <button type="button" data-export-pages disabled>Export pagination diagnostics</button><p data-diagnostic-status role="status"></p>';
  shadow.querySelector('.panel').append(diagnostics);
  const checkPages=diagnostics.querySelector('[data-check-pages]'),exportPages=diagnostics.querySelector('[data-export-pages]'),diagnosticStatus=diagnostics.querySelector('[data-diagnostic-status]');
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const refreshExport=()=>{exportPages.disabled=!globalThis.GalacticAudible.getDiagnostics();};
  exportPages.addEventListener('click',()=>{const report=globalThis.GalacticAudible.getDiagnostics();if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='GL-audible-pagination.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  checkPages.addEventListener('click',async()=>{buttons.forEach(button=>{button.disabled=true;});checkPages.disabled=true;exportPages.disabled=true;diagnosticStatus.textContent='Checking library pagination without changing your library...';try{await globalThis.GalacticAudible.inspectPagination();diagnosticStatus.textContent='Check complete. Export pagination diagnostics to share the page counts and end signals. No library changes were saved.';}catch{diagnosticStatus.textContent='The check could not finish. Any available pagination diagnostics can still be exported; your library was not changed.';}finally{buttons.forEach(button=>{button.disabled=false;});checkPages.disabled=false;refreshExport();}});
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    checkPages.disabled=true;exportPages.disabled=true;
    status.dataset.busy = 'true';
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'audible' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Audible sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Audible baseline yet; reading every library page once…';
      const { items, snapshot } = await globalThis.GalacticAudible.fetchAudibleAudiobooks(({ pagesRead, audiobooks }) => {
        status.textContent = `Reading Audible library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${audiobooks} audiobooks found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      const subscriptionCount = items.filter((item) => item.ownership === 'subscription').length;
      status.textContent = items.length ? `Saving ${items.length} Audible audiobook${items.length === 1 ? '' : 's'} locally...` : 'No new Audible titles; recording the completed check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'audible', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Audible import did not complete.');
      globalThis.GalacticAudible.recordSaveState('committed');
      status.textContent = `${fullRescan ? 'Full rescan complete' : `Quick update added ${items.length} audiobook${items.length === 1 ? '' : 's'}`}. ${response.audiobookCount} Audible audiobook${response.audiobookCount === 1 ? '' : 's'} stored locally; ${subscriptionCount} new cards exposed a membership-remove action.`;
    } catch (error) {
      if(globalThis.GalacticAudible.getDiagnostics()?.state==='prepared')globalThis.GalacticAudible.recordSaveState('not-confirmed');
      await globalThis.GalacticSync.failed('audible',error);
      status.textContent = `Audible import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      checkPages.disabled=false;refreshExport();
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow, 'audible');
  document.documentElement.append(host);
}());
