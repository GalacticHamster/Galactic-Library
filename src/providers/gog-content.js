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
    <div class="panel"><p><strong>Galactic Library</strong><br>Import games GOG reports as owned by this signed-in account. Only game IDs and titles are saved locally.</p><button type="button">Sync GOG library</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const { items } = await globalThis.GalacticGog.fetchGogGames(({ pagesRead, pagesExpected, games, hidden }) => {
        status.textContent = `Reading ${hidden ? 'hidden ' : ''}GOG library: ${pagesRead}/${pagesExpected} page${pagesExpected === 1 ? '' : 's'} checked; ${games} games found.`;
      });
      status.textContent = `Saving ${items.length} GOG game${items.length === 1 ? '' : 's'} locally...`;
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'gog', items });
      if (!response?.ok) throw new Error(response?.error ?? 'GOG import did not complete.');
      status.textContent = `Saved ${response.gameCount} GOG game${response.gameCount === 1 ? '' : 's'} locally.`;
    } catch (error) {
      status.textContent = `GOG import failed: ${error.message}`;
    } finally {
      button.disabled = false;
      delete status.dataset.busy;
    }
  });
  document.documentElement.append(host);
}());
