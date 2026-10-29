(function attachHumbleSync() {
  'use strict';
  if (document.querySelector('#galactic-library-humble-importer') || !globalThis.GalacticHumble) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-humble-importer';

  const shadow = host.attachShadow({ mode: 'closed' });
  globalThis.GalacticFloatingPanel.render(shadow,'humble',{onImport:sync});
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'humble' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Humble sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Humble baseline yet; scanning every purchase once…';
      const result = await globalThis.GalacticHumble.fetchHumblePurchases(({ purchasesRead: read, purchasesTotal, items: found, skippedKnown }) => {
        status.textContent = purchasesTotal
          ? `Reading Humble purchase ${read}/${purchasesTotal}; ${found} supported entitlements found${skippedKnown ? `; ${skippedKnown} already known` : ''}.`
          : 'Loading your Humble purchases…';
      }, fullRescan ? null : state.syncState?.knownPurchaseIds ?? [], state.syncState?.refreshPurchaseIds ?? []);
      status.textContent = result.items.length ? `Saving ${result.items.length} Humble entitlement${result.items.length === 1 ? '' : 's'} locally…` : 'No new supported Humble entitlements; recording the completed purchase check…';
      const response = await globalThis.GalacticSync.send({
        type: 'IMPORT_PROVIDER_ITEMS', provider: 'humble', mode: fullRescan ? 'full' : 'incremental', items: result.items,
        scanDiagnostics:{failedRequestCount:result.failures.length},
        syncState: { knownPurchaseIds: result.knownPurchaseIds }, snapshot: result.snapshot
      });
      if (!response?.ok) throw new Error(response?.error ?? 'Humble import did not complete.');
      const scope = fullRescan
        ? `Full rescan read ${result.purchasesRead} purchase${result.purchasesRead === 1 ? '' : 's'}`
        : `Quick update read ${result.purchasesRead} purchase${result.purchasesRead === 1 ? '' : 's'} and skipped ${result.skippedKnown} already checked`;
      status.textContent = `${scope}. Saved ${response.gameCount} Humble game${response.gameCount === 1 ? '' : 's'}, ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'}, and ${response.bookCount} book${response.bookCount === 1 ? '' : 's'} locally.${result.failures.length ? ` ${result.failures.length} purchase${result.failures.length === 1 ? ' will' : 's will'} be retried next quick update.` : ''}`;
    } catch (error) {
      await globalThis.GalacticSync.failed('humble',error);
      status.textContent = `Humble import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }

  globalThis.GalacticFloatingPanel?.attach(shadow, 'humble');
  document.documentElement.append(host);
}());
