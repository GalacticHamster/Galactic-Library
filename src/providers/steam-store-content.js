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
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads Steam's owned App-ID list and resolves titles only for new apps. <strong>Full rescan</strong> rebuilds the Steam snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'steam' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Steam sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Steam baseline yet; resolving every owned app once…';
      const result = await globalThis.GalacticSteamStore.fetchOwnedSteamGames(({ completed, total, ownedApps, games, phase }) => {
        const retryingTitles = phase === 'retrying-titles';
        status.textContent = retryingTitles
          ? `Steam is checking titles one at a time: ${completed}/${total} apps checked; ${games} games found so far.`
          : `Reading Steam titles: ${completed}/${total} new apps checked from ${ownedApps} owned apps; ${games} games found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      const { items, unresolvedApps } = result;
      status.textContent = items.length ? 'Saving Steam games and DLC locally...' : 'No new Steam apps; recording the completed check...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'steam', mode: fullRescan ? 'full' : 'incremental', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Steam import did not complete.');
      const unlinkedAddOnCount = response.addOnCount - response.linkedAddOnCount;
      const scope = fullRescan ? `Full rescan checked ${result.newAppCount} apps` : `Quick update checked ${result.newAppCount} new app${result.newAppCount === 1 ? '' : 's'}`;
      status.textContent = `${scope}. Saved ${response.gameCount} Steam game${response.gameCount === 1 ? '' : 's'} locally.${response.addOnCount ? ` Saved ${response.addOnCount} DLC add-on${response.addOnCount === 1 ? '' : 's'}; ${response.linkedAddOnCount} linked to a game${unlinkedAddOnCount ? ` and ${unlinkedAddOnCount} shown as unlinked` : ''}.` : ''}${unresolvedApps.length ? ` ${unresolvedApps.length} app${unresolvedApps.length === 1 ? '' : 's'} could not be resolved and will be retried next quick update.` : ''}`;
    } catch (error) {
      status.textContent = `Steam import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  document.documentElement.append(host);
}());
