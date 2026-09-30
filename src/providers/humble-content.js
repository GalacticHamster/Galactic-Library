(function attachHumbleSync() {
  'use strict';
  if (document.querySelector('#galactic-library-humble-importer') || !globalThis.GalacticHumble) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-humble-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:#f9fafb;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#24211d; border:1px solid #f59e0b; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#f59e0b; color:#1c1917; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#fde68a; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads details only for purchases not already recorded locally. <strong>Full rescan</strong> rebuilds the Humble snapshot and is useful after a parser update. Redemption values are redacted before purchase details are parsed and are never saved.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'humble' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Humble sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Humble baseline yet; scanning every purchase once…';
      const result = await globalThis.GalacticHumble.fetchHumblePurchases(({ purchasesRead: read, purchasesTotal, items: found, skippedKnown }) => {
        status.textContent = purchasesTotal
          ? `Reading Humble purchase ${read}/${purchasesTotal}; ${found} supported entitlements found${skippedKnown ? `; ${skippedKnown} already known` : ''}.`
          : 'Loading your Humble purchases…';
      }, fullRescan ? null : state.syncState?.knownPurchaseIds ?? []);
      status.textContent = result.items.length ? `Saving ${result.items.length} Humble entitlement${result.items.length === 1 ? '' : 's'} locally…` : 'No new supported Humble entitlements; recording the completed purchase check…';
      const response = await chrome.runtime.sendMessage({
        type: 'IMPORT_PROVIDER_ITEMS', provider: 'humble', mode: fullRescan ? 'full' : 'incremental', items: result.items,
        syncState: { knownPurchaseIds: result.knownPurchaseIds }
      });
      if (!response?.ok) throw new Error(response?.error ?? 'Humble import did not complete.');
      const scope = fullRescan
        ? `Full rescan read ${result.purchasesRead} purchase${result.purchasesRead === 1 ? '' : 's'}`
        : `Quick update read ${result.purchasesRead} new purchase${result.purchasesRead === 1 ? '' : 's'} and skipped ${result.skippedKnown} already checked`;
      status.textContent = `${scope}. Saved ${response.gameCount} Humble game${response.gameCount === 1 ? '' : 's'}, ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'}, and ${response.bookCount} book${response.bookCount === 1 ? '' : 's'} locally.${result.failures.length ? ` ${result.failures.length} new purchase${result.failures.length === 1 ? ' will' : 's will'} be retried next quick update.` : ''}`;
    } catch (error) {
      status.textContent = `Humble import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow);
  document.documentElement.append(host);
}());
