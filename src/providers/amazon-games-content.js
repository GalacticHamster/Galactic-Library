(function attachAmazonGamesSync() {
  'use strict';
  const isCollectionPage = location.pathname.startsWith('/my-collection') || location.pathname.startsWith('/claims/my-collection');
  if (!isCollectionPage || document.querySelector('#galactic-library-amazon-games-importer') || !globalThis.GalacticAmazonGames) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-amazon-games-importer';

  const shadow = host.attachShadow({ mode: 'closed' });
  globalThis.GalacticFloatingPanel.render(shadow,'amazon-games',{onImport:sync,diagnostics:"<details><summary>Scan diagnostics</summary><button type=\"button\" data-check-dates>Check acquisition dates (no import)</button><button type=\"button\" data-export-report hidden>Export scan report</button></details>"});
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const dateCheckButton = shadow.querySelector('[data-check-dates]');
  const busyButtons = [...buttons, dateCheckButton];
  // Explicit troubleshooting entry only; keep developer diagnostics out of the
  // normal release panel. The URL flag grants no import or account permission.
  const status = shadow.querySelector('.status');
  const exportButton = shadow.querySelector('[data-export-report]');

  async function sync(mode) {
    busyButtons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    exportButton.hidden = true;
    let scanStarted = false;
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'amazon-games' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Amazon Games sync state.');
      const ageMs = Date.now() - Date.parse(state.lastSuccessfulSyncAt || '');
      const fullRescan = mode === 'full' || !state.hasFullBaseline || !Number.isFinite(ageMs) || ageMs > 70 * 24 * 60 * 60 * 1000;
      if (fullRescan && mode !== 'full') status.textContent = state.hasFullBaseline ? 'Your last Amazon Games sync is over 70 days old; scanning all years to avoid a gap…' : 'No complete Amazon Games import yet; checking all years…';
      scanStarted = true;
      const { items, diagnostics, snapshot, incomplete } = await globalThis.GalacticAmazonGames.fetchAmazonGames(progress => {
        status.textContent = `Checking Amazon Games${progress.timeWindow ? ` ${progress.timeWindow}` : ''}${progress.windowsTotal ? ` (${progress.windowsRead} of ${progress.windowsTotal} windows)` : ''}: ${progress.totalGames ?? progress.games ?? 0} readable entries found.`;
      }, !fullRescan, { retryWindows: fullRescan ? state.syncState?.pendingWindows ?? [] : [] });
      if (!items.length && fullRescan) throw new Error('No Amazon Games library entries were found. Code claims and deliveries to other stores are excluded. Select Games in My Collection and wait for it to load before retrying. No library records were replaced.');
      status.textContent = items.length ? `Saving ${items.length} Amazon Games claim${items.length === 1 ? '' : 's'} locally...` : 'Recording the completed Amazon Games check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-games', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Games import did not complete.');
      if (incomplete) {
        status.textContent = `Saved ${response.savedCount ?? items.length} readable Amazon Games entries; the scan is incomplete. ${diagnostics.failedClaims} observed claim${diagnostics.failedClaims === 1 ? '' : 's'} could not be read; ${diagnostics.failedWindows} window${diagnostics.failedWindows === 1 ? '' : 's'} did not finish. Earlier records were kept. Retry with Full rescan to check all years.`;
        exportButton.hidden = !globalThis.GalacticAmazonGames.getDiagnostics?.();
        return;
      }
      const scope = fullRescan ? `Full import complete. ${new Set(items.map(item=>item.title)).size} games found. ${response.gameCount} library entries saved.`
        : `Recent claims checked. ${items.length} Amazon Games entries refreshed; earlier entries were kept.`;
      status.textContent = `${scope}${diagnostics.otherLibraryClaims || diagnostics.productKeyClaims ? ' Code claims and deliveries to other stores were not added.' : ''}${diagnostics.unreadableCards ? ` ${diagnostics.unreadableCards} entries lacked clear delivery details; earlier confirmed access and your corrections were kept.` : ''}`;
      if (!fullRescan && (response.listingIncomplete ?? state.syncState?.listingIncomplete)) status.textContent += ' An earlier scan is still incomplete. Use Full rescan to retry older years.';
    } catch (error) {
      await globalThis.GalacticSync.failed('amazon-games',error);
      exportButton.hidden = !(scanStarted && globalThis.GalacticAmazonGames.getDiagnostics?.());
      const reportHelp=exportButton.hidden?'':shadow.querySelector('.panel').dataset.providerDiagnostics==='disabled'
        ?' To collect a scan report, enable provider diagnostics in GL Settings, reload this page and retry.'
        :' Export the scan report if you need help; it contains no titles or redemption codes.';
      status.textContent = `Amazon Games import failed: ${error.amazonGamesEntryTitle ? `Could not read the claim details for “${error.amazonGamesEntryTitle}”. ` : ''}${error.message}${reportHelp}`;
    } finally {
      busyButtons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  dateCheckButton.addEventListener('click', async () => {
    busyButtons.forEach(button => { button.disabled = true; });
    status.dataset.busy = 'true';
    exportButton.hidden = true;
    status.textContent = 'Checking dates on up to three delivered entries on this page. No library data will change...';
    try {
      const report = await globalThis.GalacticAmazonGames.checkAcquisitionDates();
      const recognized = report.samples.filter(sample => sample.dateRecognized).length;
      status.textContent = report.samples.length
        ? `Date check complete. ${recognized} of ${report.samples.length} entries had a readable acquisition date. No library data changed. Export the scan report to share the result.`
        : 'No delivered entries are visible. Open a year containing delivered games, then check again. No library data changed.';
    } catch {
      status.textContent = 'The date check could not finish. No library data changed. Export the scan report to share the result.';
    } finally {
      exportButton.hidden = !globalThis.GalacticAmazonGames.getDiagnostics?.();
      busyButtons.forEach(button => { button.disabled = false; });
      delete status.dataset.busy;
    }
  });
  exportButton.addEventListener('click', () => {
    const report = globalThis.GalacticAmazonGames.getDiagnostics?.();
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'GL-amazon-games-scan.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  globalThis.GalacticFloatingPanel?.attach(shadow, 'amazon-games');
  // Page CSP can block <style> elements inside a content-script shadow root.
  // Construct the existing local rules (including the shared account controls)
  // through CSSOM instead; no page permissions or policy changes are required.
  const styles = [...shadow.querySelectorAll('style')];
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles.map(style => style.textContent).join('\n') + `
    :host { width:360px; max-width:calc(100vw - 36px); }
    .panel { box-sizing:border-box; max-height:calc(100vh - 36px); overflow:auto; color:var(--gh-text); }
    .panel > p:first-child { padding-right:72px; }
    button { margin:3px 2px 3px 0; }
    .status { overflow-wrap:anywhere; }
  `);
  shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
  styles.forEach(style => style.remove());
  document.documentElement.append(host);
}());
