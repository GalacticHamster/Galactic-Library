(function attachAmazonVideoSync() {
  'use strict';
  // Troubleshooting builds only; see the release checklist. No saved setting.
  const SHOW_SCAN_DIAGNOSTICS = false;
  if (!location.pathname.includes('/gp/video/') || document.querySelector('#galactic-library-amazon-video-importer') || !globalThis.GalacticAmazonVideo) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-amazon-video-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  const diagnosticsMarkup = SHOW_SCAN_DIAGNOSTICS ? `<details><summary>Scan diagnostics</summary><p>Check the listing without importing or changing your library, then export the scan checks. Reading purchase labels hovers each unconfirmed card once, waiting up to 0.6 seconds per title; 343 titles may add about 3.5 minutes. Check without importing first.</p><button type="button" data-mode="inspect">Check listing (no import)</button> <button type="button" data-mode="ownership">Check purchase labels (no import)</button> <button type="button" data-export-diagnostics disabled>Export scan diagnostics</button></details>` : '';
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> checks recent additions and stops at an already saved group. <strong>Full rescan</strong> checks your collection and refreshes purchase information. Earlier saved titles are kept when Amazon does not confirm a complete listing.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button>${diagnosticsMarkup}<p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const exportButton = shadow.querySelector('[data-export-diagnostics]');
  const status = shadow.querySelector('.status');
  let exportContext = null;

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    if (exportButton) exportButton.disabled = true;
    exportContext = { mode, outcome: 'running' };
    let scanStarted = false;
    try {
      if (mode === 'ownership') {
        scanStarted = true;
        const counts = await globalThis.GalacticAmazonVideo.checkPurchaseLabels(counts => {
          status.textContent = `For 15 seconds, hover a purchased movie and a purchased season, then a season with only purchased episodes. ${counts.owned} full-product purchase labels recognized. No library records will change.`;
        });
        exportContext.outcome = 'ownership-checked-without-import';
        status.textContent = `Purchase-label check finished: ${counts.owned} purchased, ${counts.rental} rentals, ${counts.subscription} subscription, ${counts.unknown} unconfirmed among observed cards. No library records changed. Export scan diagnostics; missing labels may require a different page-specific extraction.`;
        return;
      }
      if (mode === 'inspect') {
        scanStarted = true;
        await globalThis.GalacticAmazonVideo.fetchAmazonVideoLibrary(({ movies, tv, phase }) => {
          status.textContent = `Checking listing: ${movies} movies and ${tv} TV titles found.${phase === 'verification' ? ' Confirming the listing.' : phase === 'boundary-probe' ? ' Confirming the listing.' : phase === 'purchase-labels' ? ' Checking purchase information.' : ''} No library records will be changed.`;
        }, null, { readOnly: true, readPurchaseLabels: true });
        const checked = globalThis.GalacticAmazonVideo.getDiagnostics();
        exportContext.outcome = checked.completionStatus + '-without-import';
        status.textContent = `Listing check ended: ${checked.itemCount} titles found (${checked.mediaTypes.movie} movies and ${checked.mediaTypes.tv} TV titles). ${checked.completionStatus === 'confirmed' ? 'Completion confirmed by a whole-list total.' : checked.completionStatus === 'inferred' ? 'End inferred from boundary checks and a verification sweep; Amazon did not confirm a total.' : 'Completion uncertain; the traversal checks did not agree.'} No library records were changed. ${checked.ownership ? `${checked.ownership.owned} titles have purchase labels; ${checked.ownership.unknown} remain unconfirmed in this scan.` : ''} Export the scan diagnostics for investigation.`;
        return;
      }
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'amazon-video' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Amazon Video sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No complete Amazon Video import yet; checking the full library…';
      scanStarted = true;
      const { items, snapshot, completionStatus } = await globalThis.GalacticAmazonVideo.fetchAmazonVideoLibrary(({ passes, movies, tv, phase }) => {
        status.textContent = `Reading Amazon Video library: ${movies} movies and ${tv} TV titles found.${phase === 'verification' ? ' Confirming the listing.' : phase === 'boundary-probe' ? ' Confirming the listing.' : phase === 'purchase-labels' ? ' Checking purchase information.' : ''}`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? [], { readPurchaseLabels: true });
      if (fullRescan) {
        const found = new Set(items.map(item => item.providerItemId));
        const known = new Set(state.syncState?.knownProviderItemIds ?? []);
        const missing = [...known].filter(id => !found.has(id)).length;
        exportContext.baselineComparison = { previousItems: known.size, foundItems: found.size, missingPreviousItems: missing };
        if (missing && completionStatus !== 'inferred' && snapshot?.scopes?.[0]?.expectedCount === null) throw new Error(`The listing did not include ${missing} previously saved title${missing === 1 ? '' : 's'}, and Amazon did not provide a total to confirm completeness. No library changes were saved. Reload the Amazon library after it finishes loading, then retry Full rescan.`);
      }
      status.textContent = items.length ? `Saving ${items.length} Amazon Video title${items.length === 1 ? '' : 's'} locally...` : 'No new Amazon Video titles; recording the completed check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-video', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Video import did not complete.');
      exportContext.outcome = 'saved';
      if (fullRescan && completionStatus === 'inferred') {
        status.textContent = `Full rescan finished. ${items.filter(item => item.mediaType === 'movie').length} movies and ${items.filter(item => item.mediaType === 'tv').length} TV titles found. Observed titles saved; earlier saved titles were kept because Amazon did not confirm a complete listing.`;
      } else {
      status.textContent = `${fullRescan ? 'Full rescan complete' : `Newest-title check added ${items.length} Amazon Video title${items.length === 1 ? '' : 's'}`}. ${response.movieCount} Amazon Video movie${response.movieCount === 1 ? '' : 's'} and ${response.tvCount} TV title${response.tvCount === 1 ? '' : 's'} stored locally.${fullRescan ? '' : ' Older titles were not fully checked.'}`;
      }
    } catch (error) {
      exportContext.outcome = 'failed';
      if (!['inspect', 'ownership'].includes(mode)) await globalThis.GalacticSync.failed('amazon-video',error);
      status.textContent = `${['inspect', 'ownership'].includes(mode) ? 'Read-only check stopped; no library records were changed' : 'Amazon Video import failed'}: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      if (exportButton) {
        exportButton.disabled = !scanStarted || !globalThis.GalacticAmazonVideo.getDiagnostics?.();
        if (!exportButton.disabled) exportButton.closest('details').open = true;
      }
      delete status.dataset.busy;
    }
  }
  exportButton?.addEventListener('click', () => {
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
