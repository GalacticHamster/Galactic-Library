(function attachFanaticalSync() {
  'use strict';
  // The order-history API is the sync source. Do not place an inert Galactic
  // Library panel over Fanatical's bundle pages, where Fanatical Library's
  // ownership summary is the relevant UI.
  if (!/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?orders\/?$/iu.test(location.pathname)) return;
  if (document.querySelector('#galactic-library-fanatical-importer') || !globalThis.GalacticFanatical) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-fanatical-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:355px;font:14px/1.4 system-ui,sans-serif;color:#f9fafb;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>.panel { background:#202438; border:1px solid #fb923c; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#fb923c; color:#431407; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#fed7aa; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }</style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads details only for Fanatical orders not previously checked. <strong>Full rescan</strong> rebuilds the Fanatical library. Fanatical's session token is used only inside this signed-in page to make its read-only order requests; it is never stored or sent to Galactic Library.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'fanatical' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Fanatical sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      status.textContent = fullRescan ? 'Reading your completed Fanatical order history...' : 'Checking Fanatical for newly completed orders...';
      const projection = await chrome.runtime.sendMessage({
        type: 'FETCH_FANATICAL_ORDERS',
        fullScan: fullRescan,
        knownOrderFingerprints: fullRescan ? [] : state.syncState?.knownOrderFingerprints ?? []
      });
      if (!projection?.ok) throw new Error(projection?.error ?? 'Fanatical orders could not be read.');
      const items = globalThis.GalacticFanatical.fanaticalItemsFromProjection(projection.result);
      status.textContent = items.length ? `Saving ${items.length} Fanatical item${items.length === 1 ? '' : 's'} locally...` : 'No new supported Fanatical items; recording the completed check...';
      const response = await chrome.runtime.sendMessage({
        type: 'IMPORT_PROVIDER_ITEMS', provider: 'fanatical', mode: fullRescan ? 'full' : 'incremental', items,
        syncState: { knownOrderFingerprints: projection.result?.orderFingerprints ?? [] }
      });
      if (!response?.ok) throw new Error(response?.error ?? 'Fanatical import did not complete.');
      const stats = projection.result ?? {};
      const scope = fullRescan
        ? `Full rescan read ${stats.ordersScanned ?? 0} completed order${stats.ordersScanned === 1 ? '' : 's'}`
        : `Quick update read ${stats.ordersScanned ?? 0} new completed order${stats.ordersScanned === 1 ? '' : 's'} and skipped ${Math.max(0, (stats.ordersAvailable ?? 0) - (stats.ordersScanned ?? 0))} already checked`;
      status.textContent = `${scope}. ${response.gameCount} Fanatical game${response.gameCount === 1 ? '' : 's'}, ${response.bookCount} book${response.bookCount === 1 ? '' : 's'}, and ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'} stored locally.`;
    } catch (error) {
      status.textContent = `Fanatical import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow);
  document.documentElement.append(host);
}());
