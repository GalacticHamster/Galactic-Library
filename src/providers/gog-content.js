(function attachGogSync() {
  'use strict';
  if (document.querySelector('#galactic-library-gog-importer') || !globalThis.GalacticGog) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-gog-importer';

  const shadow = host.attachShadow({ mode: 'closed' });
  globalThis.GalacticFloatingPanel.render(shadow,'gog',{onImport:sync});
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'gog' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local GOG sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline && !state.hasAcquisitionBaseline;
      if (!state.hasFullBaseline && !state.hasAcquisitionBaseline && mode !== 'full') status.textContent = 'No full GOG baseline yet; reading every library page once…';
      const { items, snapshot, incomplete, failedItems } = await globalThis.GalacticGog.fetchGogGames(({ pagesRead, pagesExpected, games, hidden }) => {
        status.textContent = `Reading ${hidden ? 'hidden ' : ''}GOG library: ${pagesRead}/${pagesExpected} page${pagesExpected === 1 ? '' : 's'} checked; ${games} games found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? [],state.syncState?.listingIncomplete===true);
      status.textContent = items.length ? `Saving ${items.length} GOG game${items.length === 1 ? '' : 's'} locally...` : 'No new GOG titles; recording the completed check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'gog', mode: fullRescan ? 'full' : 'incremental', items, snapshot,scanDiagnostics:{incomplete:incomplete===true} });
      if (!response?.ok) throw new Error(response?.error ?? 'GOG import did not complete.');
      status.textContent = incomplete?`Saved ${response.gameCount} GOG games. ${failedItems?`${failedItems} entries could not be read. `:''}Some library pages or entries could not be checked. Quick update will retry them. Earlier games were kept.`:`${fullRescan ? 'Full rescan complete' : `Quick update added ${items.length} GOG game${items.length === 1 ? '' : 's'}`}. ${response.gameCount} GOG game${response.gameCount === 1 ? '' : 's'} stored locally.`;
    } catch (error) {
      await globalThis.GalacticSync.failed('gog',error);
      status.textContent = `GOG import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }

  globalThis.GalacticFloatingPanel?.attach(shadow, 'gog');
  document.documentElement.append(host);
}());
