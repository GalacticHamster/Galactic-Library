(function attachAmazonVideoSync() {
  'use strict';
  // Use the existing Provider Diagnostics setting; no separate debug switch.
  const SHOW_SCAN_DIAGNOSTICS = true;
  if (!location.pathname.includes('/gp/video/') || document.querySelector('#galactic-library-amazon-video-importer') || !globalThis.GalacticAmazonVideo) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-amazon-video-importer';

  const shadow = host.attachShadow({ mode: 'closed' });
  const diagnosticsMarkup = SHOW_SCAN_DIAGNOSTICS ? `<details><summary>Scan diagnostics</summary><p>Check the listing without importing or changing your library, then export the scan checks. Reading purchase labels hovers each unconfirmed card once, waiting up to 0.6 seconds per title; 343 titles may add about 3.5 minutes. Check without importing first.</p><button type="button" data-mode="inspect">Check listing (no import)</button> <button type="button" data-mode="ownership">Check purchase labels (no import)</button> <button type="button" data-export-diagnostics disabled>Export scan diagnostics</button></details>` : '';
  globalThis.GalacticFloatingPanel.render(shadow,'amazon-video',{onImport:sync,diagnostics:diagnosticsMarkup});
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  // These are provider-specific read-only tools, not shared import actions.
  shadow.querySelectorAll('[data-mode="inspect"], [data-mode="ownership"]').forEach(button=>button.addEventListener('click',()=>sync(button.dataset.mode)));
  const exportButton = shadow.querySelector('[data-export-diagnostics]');
  const status = shadow.querySelector('.status');
  let exportContext = null;
  let diagnosticsEnabled = false, settingGeneration = 0;
  const diagnosticSection = exportButton.closest('details');
  const traceSummary = document.createElement('p'), traceDetails = document.createElement('details'), traceText = document.createElement('pre');
  traceSummary.setAttribute('role', 'status');
  traceDetails.innerHTML = '<summary>Traversal timeline</summary>';
  traceText.style.cssText = 'white-space:pre-wrap;max-height:180px;overflow:auto;font-size:11px';
  traceDetails.append(traceText); diagnosticSection.append(traceSummary, traceDetails);
  function refreshTrace() {
    if (!diagnosticsEnabled) return;
    const report = globalThis.GalacticAmazonVideo.getDiagnostics(), trace = report?.traversal;
    if (!trace) return;
    const last = [...trace.events].reverse().find(event => event.pass);
    traceSummary.textContent = `${trace.mode === 'full' ? 'Full' : 'Quick'} scan ${trace.scanId.slice(0, 8)} · ${trace.outcome}${last ? ` · ${last.phase} · ${last.uniqueItems} titles · pass ${last.pass} · ${last.visibility}` : ''}. ${report.reason ?? ''}`;
    traceText.textContent = trace.events.map(event => JSON.stringify(event)).join('\n');
  }
  function applyDiagnostics(enabled) {
    diagnosticsEnabled = enabled === true;
    globalThis.GalacticAmazonVideo.setDiagnosticsEnabled(diagnosticsEnabled);
    shadow.querySelector('.panel').dataset.providerDiagnostics = diagnosticsEnabled ? 'enabled' : 'disabled';
    diagnosticSection.hidden = !diagnosticsEnabled;
    if (!diagnosticsEnabled) { traceSummary.textContent = ''; traceText.textContent = ''; exportButton.disabled = true; }
    else exportButton.disabled = !globalThis.GalacticAmazonVideo.getDiagnostics();
  }
  const initialGeneration = settingGeneration;
  globalThis.GalacticFloatingPanel.diagnosticsEnabled('amazon-video').then(enabled => {
    if (initialGeneration === settingGeneration) applyDiagnostics(enabled);
  });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, 'galacticLibraryProviderDiagnostics')) return;
    settingGeneration += 1; applyDiagnostics(changes.galacticLibraryProviderDiagnostics.newValue);
  });
  chrome.runtime.onMessage?.addListener((message, sender) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'GL_VIDEO_DIAGNOSTICS_CHANGED') return;
    const generation = ++settingGeneration;
    globalThis.GalacticFloatingPanel.diagnosticsEnabled('amazon-video').then(enabled => {
      if (generation === settingGeneration) applyDiagnostics(enabled);
    });
  });

  async function sync(mode) {
    if (['inspect', 'ownership'].includes(mode) && !diagnosticsEnabled) return;
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
          refreshTrace();
          status.textContent = `Checking listing: ${movies} movies and ${tv} TV titles found.${phase === 'verification' ? ' Confirming the listing.' : phase === 'boundary-probe' ? ' Confirming the listing.' : phase === 'purchase-labels' ? ' Checking purchase information.' : ''} No library records will be changed.`;
        }, null, { readOnly: true, readPurchaseLabels: true });
        if (!diagnosticsEnabled) {
          exportContext.outcome = 'checked-without-diagnostics';
          status.textContent = 'Listing check finished. No library records were changed. Detailed diagnostics were cleared when you disabled them.';
          return;
        }
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
      const recovering = state.syncState?.listingIncomplete === true;
      const { items, snapshot, completionStatus, unreadableCards } = await globalThis.GalacticAmazonVideo.fetchAmazonVideoLibrary(({ passes, movies, tv, phase }) => {
        refreshTrace();
        if (phase === 'paused-hidden') {
          status.textContent = 'Scan paused. Return to this Amazon Video tab within a minute to continue. Your saved library is unchanged.';
          return;
        }
        status.textContent = `Reading Amazon Video library: ${movies} movies and ${tv} TV titles found.${phase === 'verification' ? ' Confirming the listing.' : phase === 'boundary-probe' ? ' Confirming the listing.' : phase === 'purchase-labels' ? ' Checking purchase information.' : ''}`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? [], { readPurchaseLabels: true, recoverIncomplete: recovering && !fullRescan });
      if (fullRescan) {
        const found = new Set(items.map(item => item.providerItemId));
        const known = new Set(state.syncState?.knownProviderItemIds ?? []);
        const missing = [...known].filter(id => !found.has(id)).length;
        exportContext.baselineComparison = { previousItems: known.size, foundItems: found.size, missingPreviousItems: missing };
        if (missing && !['inferred', 'partial'].includes(completionStatus) && snapshot?.scopes?.[0]?.expectedCount === null) throw new Error(`The listing did not include ${missing} previously saved title${missing === 1 ? '' : 's'}, and Amazon did not provide a total to confirm completeness. No library changes were saved. Reload the Amazon library after it finishes loading, then retry Full rescan.`);
      }
      status.textContent = items.length ? `Saving ${items.length} Amazon Video title${items.length === 1 ? '' : 's'} locally...` : 'No new Amazon Video titles; recording the completed check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-video', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Video import did not complete.');
      exportContext.outcome = 'saved';
      if (completionStatus === 'partial') {
        exportContext.outcome = 'saved-partial';
        status.textContent = `Saved ${response.savedCount ?? items.length} readable Amazon Video titles. ${unreadableCards} observed card${unreadableCards === 1 ? '' : 's'} could not be read; the scan is incomplete. Earlier records were kept. Retry with Quick update to check the remaining listing.`;
        return;
      }
      if (recovering && !fullRescan) {
        status.textContent = `Amazon Video update complete. Checked ${items.length} readable titles while retrying the incomplete listing. Earlier saved titles were kept.`;
        return;
      }
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
      refreshTrace();
      delete status.dataset.busy;
    }
  }
  exportButton?.addEventListener('click', () => {
    if (!diagnosticsEnabled) return;
    const diagnostics = globalThis.GalacticAmazonVideo.getDiagnostics?.();
    if (!diagnostics) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...diagnostics, operation: exportContext }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'GL-amazon-video-scan.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  globalThis.GalacticFloatingPanel?.attach(shadow, 'amazon-video');
  document.documentElement.append(host);
}());
