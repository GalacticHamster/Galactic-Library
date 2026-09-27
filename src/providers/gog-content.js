(function attachGogSync() {
  'use strict';
  if (document.querySelector('#galactic-library-gog-importer') || !globalThis.GalacticGog) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-gog-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#262626; border:1px solid #86328c; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#86328c; color:#fff; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#e9d5ff; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads GOG's newest-first purchase-date pages until it reaches a page already in your local baseline. <strong>Full rescan</strong> reads every visible and hidden-games page.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'gog' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local GOG sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full GOG baseline yet; reading every library page once…';
      const { items } = await globalThis.GalacticGog.fetchGogGames(({ pagesRead, pagesExpected, games, hidden }) => {
        status.textContent = `Reading ${hidden ? 'hidden ' : ''}GOG library: ${pagesRead}/${pagesExpected} page${pagesExpected === 1 ? '' : 's'} checked; ${games} games found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      status.textContent = items.length ? `Saving ${items.length} GOG game${items.length === 1 ? '' : 's'} locally...` : 'No new GOG titles; recording the completed check...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'gog', mode: fullRescan ? 'full' : 'incremental', items });
      if (!response?.ok) throw new Error(response?.error ?? 'GOG import did not complete.');
      status.textContent = `${fullRescan ? 'Full rescan complete' : `Quick update added ${items.length} GOG game${items.length === 1 ? '' : 's'}`}. ${response.gameCount} GOG game${response.gameCount === 1 ? '' : 's'} stored locally.`;
    } catch (error) {
      status.textContent = `GOG import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  document.documentElement.append(host);
}());
