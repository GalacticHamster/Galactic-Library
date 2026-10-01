(function attachAudibleSync() {
  'use strict';
  if (document.querySelector('#galactic-library-audible-importer') || !globalThis.GalacticAudible) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-audible-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#24211d; border:1px solid #f59e0b; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#f59e0b; color:#1c1917; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#fde68a; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads Audible's Date added pages until it reaches titles already in your local baseline. <strong>Full rescan</strong> rebuilds the Audible snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'audible' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Audible sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Audible baseline yet; reading every library page once…';
      const { items, snapshot } = await globalThis.GalacticAudible.fetchAudibleAudiobooks(({ pagesRead, audiobooks }) => {
        status.textContent = `Reading Audible library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${audiobooks} audiobooks found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      const subscriptionCount = items.filter((item) => item.ownership === 'subscription').length;
      status.textContent = items.length ? `Saving ${items.length} Audible audiobook${items.length === 1 ? '' : 's'} locally...` : 'No new Audible titles; recording the completed check...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'audible', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Audible import did not complete.');
      status.textContent = `${fullRescan ? 'Full rescan complete' : `Quick update added ${items.length} audiobook${items.length === 1 ? '' : 's'}`}. ${response.audiobookCount} Audible audiobook${response.audiobookCount === 1 ? '' : 's'} stored locally; ${subscriptionCount} new cards exposed a membership-remove action.`;
    } catch (error) {
      status.textContent = `Audible import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow);
  document.documentElement.append(host);
}());
