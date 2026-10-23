(function attachAmazonVideoSync() {
  'use strict';
  if (!location.pathname.includes('/gp/video/') || document.querySelector('#galactic-library-amazon-video-importer') || !globalThis.GalacticAmazonVideo) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-amazon-video-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> checks newest additions and stops at an already saved group; it cannot repair older gaps from an incomplete scan. <strong>Full rescan</strong> replaces the saved listing only when completeness can be confirmed.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><details><summary>Scan diagnostics</summary><p>Check the listing without importing or changing your library, then export the scan checks.</p><button type="button" data-mode="inspect">Check listing (no import)</button> <button type="button" data-export-diagnostics disabled>Export scan diagnostics</button></details><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const exportButton = shadow.querySelector('[data-export-diagnostics]');
  const status = shadow.querySelector('.status');
  let exportContext = null;

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    exportButton.disabled = true;
    exportContext = { mode, outcome: 'running' };
    let scanStarted = false;
    try {
      if (mode === 'inspect') {
        scanStarted = true;
        await globalThis.GalacticAmazonVideo.fetchAmazonVideoLibrary(({ movies, tv, phase }) => {
          status.textContent = `Checking listing: ${movies} movies and ${tv} TV titles found.${phase === 'awaiting-confirmation' ? ' Waiting for end-of-library evidence.' : ''} No library records will be changed.`;
        }, null, { readOnly: true });
        const checked = globalThis.GalacticAmazonVideo.getDiagnostics();
        exportContext.outcome = checked.completionConfirmed ? 'checked-without-import' : 'uncertain-without-import';
        status.textContent = `Listing check ended: ${checked.itemCount} titles found (${checked.mediaTypes.movie} movies and ${checked.mediaTypes.tv} TV titles). ${checked.completionConfirmed ? 'The observed IDs match a whole-list total shown on the page.' : 'Completeness remains unconfirmed; a loading pause is not proof of the end.'} No library records were changed. Export the scan diagnostics for investigation.`;
        return;
      }
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'amazon-video' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Amazon Video sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Amazon Video baseline yet; reading the complete library once…';
      scanStarted = true;
      const { items, snapshot } = await globalThis.GalacticAmazonVideo.fetchAmazonVideoLibrary(({ passes, movies, tv, phase }) => {
        status.textContent = `Reading Amazon Video library: ${movies} movies and ${tv} TV titles found.${phase === 'awaiting-confirmation' ? ' Waiting for end-of-library evidence; no records will be replaced without confirmation.' : ''}`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      if (fullRescan) {
        const found = new Set(items.map(item => item.providerItemId));
        const known = new Set(state.syncState?.knownProviderItemIds ?? []);
        const missing = [...known].filter(id => !found.has(id)).length;
        exportContext.baselineComparison = { previousItems: known.size, foundItems: found.size, missingPreviousItems: missing };
        if (missing && snapshot?.scopes?.[0]?.expectedCount === null) throw new Error(`The listing did not include ${missing} previously saved title${missing === 1 ? '' : 's'}, and Amazon did not provide a total to confirm completeness. No library changes were saved. Use Scan diagnostics to check the listing without importing.`);
      }
      status.textContent = items.length ? `Saving ${items.length} Amazon Video title${items.length === 1 ? '' : 's'} locally...` : 'No new Amazon Video titles; recording the completed check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-video', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Video import did not complete.');
      exportContext.outcome = 'saved';
      status.textContent = `${fullRescan ? 'Full rescan complete' : `Newest-title check added ${items.length} Amazon Video title${items.length === 1 ? '' : 's'}`}. ${response.movieCount} Amazon Video movie${response.movieCount === 1 ? '' : 's'} and ${response.tvCount} TV title${response.tvCount === 1 ? '' : 's'} stored locally.${fullRescan ? '' : ' Older titles were not fully checked.'}`;
    } catch (error) {
      exportContext.outcome = 'failed';
      if (mode !== 'inspect') await globalThis.GalacticSync.failed('amazon-video',error);
      status.textContent = `${mode === 'inspect' ? 'Listing check stopped; no library records were changed' : 'Amazon Video import failed'}: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      exportButton.disabled = !scanStarted || !globalThis.GalacticAmazonVideo.getDiagnostics?.();
      if (!exportButton.disabled) exportButton.closest('details').open = true;
      delete status.dataset.busy;
    }
  }
  exportButton.addEventListener('click', () => {
    const diagnostics = globalThis.GalacticAmazonVideo.getDiagnostics?.();
    if (!diagnostics) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...diagnostics, operation: exportContext }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'GL-amazon-video-scan.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow, 'amazon-video');
  document.documentElement.append(host);
}());
