(function attachAmazonGamesSync() {
  'use strict';
  const isCollectionPage = location.pathname.startsWith('/my-collection') || location.pathname.startsWith('/claims/my-collection');
  if (!isCollectionPage || document.querySelector('#galactic-library-amazon-games-importer') || !globalThis.GalacticAmazonGames) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-amazon-games-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:360px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>.panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }</style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> scans Amazon's past-three-month claims window. <strong>Full rescan</strong> scans every available calendar year. Code claims and deliveries to other stores are excluded. Unclear delivery details are kept unconfirmed.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><button type="button" data-export-report hidden>Export scan report</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const status = shadow.querySelector('.status');
  const exportButton = shadow.querySelector('[data-export-report]');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
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
      const { items, diagnostics, snapshot } = await globalThis.GalacticAmazonGames.fetchAmazonGames(({ totalGames }) => {
        status.textContent = `Checking your Amazon Games collection: ${totalGames} game entries found.`;
      }, !fullRescan);
      if (!items.length && fullRescan) throw new Error('No Amazon Games library entries were found. Code claims and deliveries to other stores are excluded. Select Games in My Collection and wait for it to load before retrying. No library records were replaced.');
      status.textContent = items.length ? `Saving ${items.length} Amazon Games claim${items.length === 1 ? '' : 's'} locally...` : 'Recording the completed Amazon Games check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-games', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Games import did not complete.');
      const scope = fullRescan ? `Full import complete. ${response.gameCount} Amazon Games entries saved.`
        : `Recent claims checked. ${items.length} Amazon Games entries refreshed; earlier entries were kept.`;
      status.textContent = `${scope}${diagnostics.otherLibraryClaims || diagnostics.productKeyClaims ? ' Code claims and deliveries to other stores were not added.' : ''}${diagnostics.unreadableCards ? ` ${diagnostics.unreadableCards} entries lacked clear delivery details; earlier confirmed access and your corrections were kept.` : ''}`;
    } catch (error) {
      await globalThis.GalacticSync.failed('amazon-games',error);
      exportButton.hidden = !(scanStarted && globalThis.GalacticAmazonGames.getDiagnostics?.());
      status.textContent = `Amazon Games import failed: ${error.message}${exportButton.hidden ? '' : ' Export the scan report if you need help; it contains no titles or redemption codes.'}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  exportButton.addEventListener('click', () => {
    const report = globalThis.GalacticAmazonGames.getDiagnostics?.();
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'GL-amazon-games-scan.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow, 'amazon-games');
  document.documentElement.append(host);
}());
