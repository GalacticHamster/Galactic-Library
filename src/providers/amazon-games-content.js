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
    <div class="panel"><p><strong>Galactic Library</strong><br>Import games delivered to this signed-in Amazon Games collection. A game can also appear in another store library; Galactic Library keeps each provider's ownership record. Rotating Luna subscription titles are not included.</p><button type="button">Sync Amazon Games library</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const { items, diagnostics } = await globalThis.GalacticAmazonGames.fetchAmazonGames(({ timeWindow, windowsRead, windowsTotal, passes, games, cardsRead, otherLibraryClaims, productKeyClaims, duplicateAmazonClaims, loadMoreActivations }) => {
        status.textContent = `Reading Amazon Games collection: ${timeWindow} (${windowsRead}/${windowsTotal} date ranges); ${passes} scan pass${passes === 1 ? '' : 'es'}; ${games} direct Amazon Games title${games === 1 ? '' : 's'} found from ${cardsRead} checked claim${cardsRead === 1 ? '' : 's'}${otherLibraryClaims ? `; ${otherLibraryClaims} sent to another store` : ''}${productKeyClaims ? `; ${productKeyClaims} product-key claim${productKeyClaims === 1 ? '' : 's'}` : ''}${duplicateAmazonClaims ? `; ${duplicateAmazonClaims} duplicate card${duplicateAmazonClaims === 1 ? '' : 's'} collapsed` : ''}${loadMoreActivations ? `; opened ${loadMoreActivations} more batch${loadMoreActivations === 1 ? '' : 'es'}` : ''}.`;
      });
      if (!items.length) throw new Error('No delivered Amazon Games claims were found. Open My Collection, select Games, and wait for it to load.');
      status.textContent = `Saving ${items.length} Amazon Games claim${items.length === 1 ? '' : 's'} locally...`;
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-games', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Games import did not complete.');
      status.textContent = `Saved ${response.gameCount} direct Amazon Games title${response.gameCount === 1 ? '' : 's'} locally from ${diagnostics.windowsRead} date range${diagnostics.windowsRead === 1 ? '' : 's'}.${diagnostics.emptyRanges ? ` ${diagnostics.emptyRanges} date range${diagnostics.emptyRanges === 1 ? ' had' : 's had'} no claims.` : ''}${diagnostics.otherLibraryClaims ? ` ${diagnostics.otherLibraryClaims} claim${diagnostics.otherLibraryClaims === 1 ? ' was' : 's were'} sent directly to another game library, such as Epic, so ${diagnostics.otherLibraryClaims === 1 ? 'it is' : 'they are'} not Amazon Games titles.` : ''}${diagnostics.productKeyClaims ? ` ${diagnostics.productKeyClaims} claim${diagnostics.productKeyClaims === 1 ? ' used' : 's used'} a product key, such as GOG; sync that store after redemption to track ${diagnostics.productKeyClaims === 1 ? 'it' : 'them'}.` : ''}${diagnostics.duplicateAmazonClaims + diagnostics.crossWindowDuplicates ? ` ${diagnostics.duplicateAmazonClaims + diagnostics.crossWindowDuplicates} repeated Amazon claim card${diagnostics.duplicateAmazonClaims + diagnostics.crossWindowDuplicates === 1 ? ' was' : 's were'} the same title and ${diagnostics.duplicateAmazonClaims + diagnostics.crossWindowDuplicates === 1 ? 'was' : 'were'} combined.` : ''}${diagnostics.unreadableCards ? ` ${diagnostics.unreadableCards} claim${diagnostics.unreadableCards === 1 ? ' used' : 's used'} another delivery method that Amazon does not identify as a direct Amazon Games library title, so ${diagnostics.unreadableCards === 1 ? 'it was' : 'they were'} left out.` : ''}`;
    } catch (error) {
      status.textContent = `Amazon Games import failed: ${error.message}`;
    } finally {
      button.disabled = false;
      delete status.dataset.busy;
    }
  });
  document.documentElement.append(host);
}());
