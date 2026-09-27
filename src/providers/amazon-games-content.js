(function attachAmazonGamesSync() {
  'use strict';
  const isCollectionPage = location.pathname.startsWith('/my-collection') || location.pathname.startsWith('/claims/my-collection');
  if (!isCollectionPage || document.querySelector('#galactic-library-amazon-games-importer') || !globalThis.GalacticAmazonGames) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-amazon-games-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:360px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>.panel { background:#1f2937; border:1px solid #38bdf8; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#38bdf8; color:#082f49; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#bae6fd; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }</style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> scans Amazon's past-three-month claims window. <strong>Full rescan</strong> scans every available calendar year. Only games delivered to the Amazon Games library are recorded.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'amazon-games' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Amazon Games sync state.');
      const ageMs = Date.now() - Date.parse(state.lastSuccessfulSyncAt || '');
      const fullRescan = mode === 'full' || !state.hasFullBaseline || !Number.isFinite(ageMs) || ageMs > 70 * 24 * 60 * 60 * 1000;
      if (fullRescan && mode !== 'full') status.textContent = state.hasFullBaseline ? 'Your last Amazon Games sync is over 70 days old; scanning all years to avoid a gap…' : 'No full Amazon Games baseline yet; scanning every year once…';
      const { items, diagnostics } = await globalThis.GalacticAmazonGames.fetchAmazonGames(({ timeWindow, windowsRead, windowsTotal, passes, games, cardsRead, otherLibraryClaims, productKeyClaims, duplicateAmazonClaims, loadMoreActivations }) => {
        status.textContent = `Reading Amazon Games collection: ${timeWindow} (${windowsRead}/${windowsTotal} date ranges); ${passes} scan pass${passes === 1 ? '' : 'es'}; ${games} direct Amazon Games title${games === 1 ? '' : 's'} found from ${cardsRead} checked claim${cardsRead === 1 ? '' : 's'}${otherLibraryClaims ? `; ${otherLibraryClaims} sent to another store` : ''}${productKeyClaims ? `; ${productKeyClaims} product-key claim${productKeyClaims === 1 ? '' : 's'}` : ''}${duplicateAmazonClaims ? `; ${duplicateAmazonClaims} duplicate card${duplicateAmazonClaims === 1 ? '' : 's'} collapsed` : ''}${loadMoreActivations ? `; opened ${loadMoreActivations} more batch${loadMoreActivations === 1 ? '' : 'es'}` : ''}.`;
      }, !fullRescan);
      if (!items.length && fullRescan) throw new Error('No delivered Amazon Games claims were found. Open My Collection, select Games, and wait for it to load.');
      status.textContent = items.length ? `Saving ${items.length} Amazon Games claim${items.length === 1 ? '' : 's'} locally...` : 'No new direct Amazon Games titles; recording the completed check...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-games', mode: fullRescan ? 'full' : 'incremental', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Games import did not complete.');
      const scope = fullRescan ? `Full rescan saved ${response.gameCount} direct Amazon Games title${response.gameCount === 1 ? '' : 's'} from ${diagnostics.windowsRead} date range${diagnostics.windowsRead === 1 ? '' : 's'}` : `Quick update checked Amazon's past-three-month window and found ${items.length} new direct title${items.length === 1 ? '' : 's'}`;
      status.textContent = `${scope}.${diagnostics.emptyRanges ? ` ${diagnostics.emptyRanges} date range${diagnostics.emptyRanges === 1 ? ' had' : 's had'} no claims.` : ''}${diagnostics.otherLibraryClaims ? ` ${diagnostics.otherLibraryClaims} claim${diagnostics.otherLibraryClaims === 1 ? ' was' : 's were'} sent directly to another game library, such as Epic, so ${diagnostics.otherLibraryClaims === 1 ? 'it is' : 'they are'} not Amazon Games titles.` : ''}${diagnostics.productKeyClaims ? ` ${diagnostics.productKeyClaims} claim${diagnostics.productKeyClaims === 1 ? ' used' : 's used'} a product key, such as GOG; sync that store after redemption to track ${diagnostics.productKeyClaims === 1 ? 'it' : 'them'}.` : ''}${diagnostics.duplicateAmazonClaims + diagnostics.crossWindowDuplicates ? ` ${diagnostics.duplicateAmazonClaims + diagnostics.crossWindowDuplicates} repeated Amazon claim card${diagnostics.duplicateAmazonClaims + diagnostics.crossWindowDuplicates === 1 ? ' was' : 's were'} the same title and ${diagnostics.duplicateAmazonClaims + diagnostics.crossWindowDuplicates === 1 ? 'was' : 'were'} combined.` : ''}${diagnostics.unreadableCards ? ` ${diagnostics.unreadableCards} claim${diagnostics.unreadableCards === 1 ? ' used' : 's used'} another delivery method that Amazon does not identify as a direct Amazon Games library title, so ${diagnostics.unreadableCards === 1 ? 'it was' : 'they were'} left out.` : ''}`;
    } catch (error) {
      status.textContent = `Amazon Games import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  document.documentElement.append(host);
}());
