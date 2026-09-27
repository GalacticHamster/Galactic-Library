(function attachKindleSync() {
  'use strict';
  if (!location.pathname.includes('/hz/mycd/') || document.querySelector('#galactic-library-kindle-importer') || !globalThis.GalacticKindle) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-kindle-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#1f2937; border:1px solid #f59e0b; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#f59e0b; color:#1c1917; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#fde68a; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads the newest Kindle pages until it reaches a page already in your local baseline. <strong>Full rescan</strong> rebuilds the Kindle snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'kindle' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Kindle sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Kindle baseline yet; reading every library page once…';
      const { items, diagnostics } = await globalThis.GalacticKindle.fetchKindleBooks(({ pagesRead, books, categoryCounts }) => {
        const documents = categoryCounts?.['personal-documents'] ?? 0;
        status.textContent = `Reading Kindle library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${books} items found (${documents} personal document${documents === 1 ? '' : 's'}).`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      status.textContent = items.length ? `Saving ${items.length} Kindle item${items.length === 1 ? '' : 's'} locally...` : 'No new Kindle items; recording the completed check...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kindle', mode: fullRescan ? 'full' : 'incremental', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Kindle import did not complete.');
      const categoryDetails = Object.entries(diagnostics).map(([category, detail]) => {
        const name = category === 'books' ? 'Books' : 'Personal Documents';
        const reported = detail.reportedCount === null ? 'unknown' : detail.reportedCount;
        return `${name}: Amazon reported ${reported}, returned ${detail.rawCount}, usable ${detail.readableCount}, duplicate IDs ${detail.duplicateCount}`;
      }).join('; ');
      const scope = fullRescan ? 'Full rescan complete' : `Quick update added ${items.length} Kindle item${items.length === 1 ? '' : 's'}`;
      status.textContent = `${scope}. ${response.bookCount} Kindle item${response.bookCount === 1 ? '' : 's'} stored locally. ${categoryDetails}.`;
    } catch (error) {
      status.textContent = `Kindle import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  document.documentElement.append(host);
}());
