(function attachSteamStoreSync() {
  'use strict';
  if (document.querySelector('#galactic-library-steam-store-importer') || !globalThis.GalacticSteamStore) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-steam-store-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:#f9fafb;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#1f2937; border:1px solid #7c3aed; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#7c3aed; color:#fff; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#ddd6fe; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br>Import the games Steam Store reports as owned by this signed-in account. Only app IDs and titles are saved locally.</p><button type="button">Sync Steam library</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const result = await globalThis.GalacticSteamStore.fetchOwnedSteamGames(({ completed, total, games, phase }) => {
        const retryingTitles = phase === 'retrying-titles';
        status.textContent = retryingTitles
          ? `Steam is checking titles one at a time: ${completed}/${total} apps checked; ${games} games found so far.`
          : `Reading Steam titles: ${completed}/${total} apps checked; ${games} games found.`;
      });
      const { items, unresolvedApps } = result;
      status.textContent = 'Saving Steam games and DLC locally...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'steam', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Steam import did not complete.');
      const unlinkedAddOnCount = response.addOnCount - response.linkedAddOnCount;
      status.textContent = `Saved ${response.gameCount} Steam game${response.gameCount === 1 ? '' : 's'} locally.${response.addOnCount ? ` Saved ${response.addOnCount} DLC add-on${response.addOnCount === 1 ? '' : 's'}; ${response.linkedAddOnCount} linked to a game${unlinkedAddOnCount ? ` and ${unlinkedAddOnCount} shown as unlinked` : ''}.` : ''}${unresolvedApps.length ? ` ${unresolvedApps.length} app${unresolvedApps.length === 1 ? '' : 's'} could not be resolved and were not imported.` : ''}`;
    } catch (error) {
      status.textContent = `Steam import failed: ${error.message}`;
    } finally {
      button.disabled = false;
      delete status.dataset.busy;
    }
  });
  document.documentElement.append(host);
}());
