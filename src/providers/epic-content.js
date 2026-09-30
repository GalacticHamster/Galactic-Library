(function attachEpicSync() {
  'use strict';
  if (document.querySelector('#galactic-library-epic-importer') || !globalThis.GalacticEpic) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-epic-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#202020; border:1px solid #0078f2; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#0078f2; color:#fff; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#bfdbfe; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br>Import games Epic Games Store reports as owned by this signed-in account. Only game IDs, titles, platforms, and add-on links are saved locally.</p><button type="button">Sync Epic library</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const { items, skippedCount } = await globalThis.GalacticEpic.fetchEpicGames(({ pagesRead, games }) => {
        status.textContent = `Reading Epic library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${games} games found.`;
      });
      status.textContent = 'Saving Epic games and add-ons locally...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'epic', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Epic import did not complete.');
      const unlinkedAddOnCount = response.addOnCount - response.linkedAddOnCount;
      status.textContent = `Saved ${response.gameCount} Epic game${response.gameCount === 1 ? '' : 's'} locally.${response.addOnCount ? ` Saved ${response.addOnCount} Epic add-on${response.addOnCount === 1 ? '' : 's'}; ${response.linkedAddOnCount} linked to a game${unlinkedAddOnCount ? ` and ${unlinkedAddOnCount} shown as unlinked` : ''}.` : ''}${skippedCount ? ` ${skippedCount} non-game account item${skippedCount === 1 ? ' was' : 's were'} excluded.` : ''}`;
    } catch (error) {
      status.textContent = `Epic import failed: ${error.message}`;
    } finally {
      button.disabled = false;
      delete status.dataset.busy;
    }
  });
  globalThis.GalacticFloatingPanel?.attach(shadow);
  document.documentElement.append(host);
}());
