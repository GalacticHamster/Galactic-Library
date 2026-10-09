(function attachEpicSync() {
  'use strict';
  if (document.querySelector('#galactic-library-epic-importer') || !globalThis.GalacticEpic) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-epic-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br>Import games Epic Games Store reports as owned by this signed-in account. Only game IDs, titles, platforms, and add-on links are saved locally.</p><button type="button">Sync Epic library</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const scan = await globalThis.GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider:'epic'});
      if(!scan?.ok)throw new Error(scan?.error??'Could not start scan.');
      const { items, skippedCount, snapshot } = await globalThis.GalacticEpic.fetchEpicGames(({ pagesRead, games }) => {
        status.textContent = `Reading Epic library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${games} games found.`;
      });
      status.textContent = 'Saving Epic games and add-ons locally...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'epic', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Epic import did not complete.');
      const unlinkedAddOnCount = response.addOnCount - response.linkedAddOnCount;
      status.textContent = `Saved ${response.gameCount} Epic game${response.gameCount === 1 ? '' : 's'} locally.${response.addOnCount ? ` Saved ${response.addOnCount} Epic add-on${response.addOnCount === 1 ? '' : 's'}; ${response.linkedAddOnCount} linked to a game${unlinkedAddOnCount ? ` and ${unlinkedAddOnCount} shown as unlinked` : ''}.` : ''}${skippedCount ? ` ${skippedCount} non-game account item${skippedCount === 1 ? ' was' : 's were'} excluded.` : ''}`;
    } catch (error) {
      await globalThis.GalacticSync.failed('epic',error);
      status.textContent = `Epic import failed: ${error.message}`;
    } finally {
      button.disabled = false;
      delete status.dataset.busy;
    }
  });
  globalThis.GalacticFloatingPanel?.attach(shadow, 'epic');
  document.documentElement.append(host);
}());
