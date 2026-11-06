(function attachFanaticalSync() {
  'use strict';
  if (!globalThis.GalacticFanatical) return;
  if (globalThis.GalacticFanaticalRouteUI) { globalThis.GalacticFanaticalRouteUI.refresh(); return; }
  const isOrders=()=>/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?orders\/?$/iu.test(location.pathname);
  let routeUrl=location.href,generation=0,currentHost=null;
  function mount() {
    const epoch=generation;
    const host = document.createElement('div');
    host.id = 'galactic-library-fanatical-importer';
    currentHost=host;
    const active=()=>epoch===generation&&isOrders()&&host.isConnected;

    const shadow = host.attachShadow({ mode: 'closed' });
    globalThis.GalacticFloatingPanel.render(shadow,'fanatical',{onImport:sync});
    const buttons = [...shadow.querySelectorAll('button[data-mode]')];
    const status = shadow.querySelector('.status');

    async function sync(mode) {
      if(!active())return;
      buttons.forEach((button) => { button.disabled = true; });
      status.dataset.busy = 'true';
      try {
        const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'fanatical' });
        if(!active())return;
        if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Fanatical sync state.');
        const fullRescan = mode === 'full' || !(state.hasAcquisitionBaseline ?? state.hasFullBaseline);
        status.textContent = fullRescan ? 'Reading your completed Fanatical order history...' : 'Checking Fanatical for newly completed orders...';
        const projection = await globalThis.GalacticSync.send({
          type: 'FETCH_FANATICAL_ORDERS',
          fullScan: fullRescan,
          knownOrderFingerprints: fullRescan ? [] : state.syncState?.knownOrderFingerprints ?? []
        });
        if(!active())return;
        if (!projection?.ok) throw new Error(projection?.error ?? 'Fanatical orders could not be read.');
        const items = globalThis.GalacticFanatical.fanaticalItemsFromProjection(projection.result);
        status.textContent = items.length ? `Saving ${items.length} Fanatical item${items.length === 1 ? '' : 's'} locally...` : 'No new supported Fanatical items; recording the completed check...';
        const response = await globalThis.GalacticSync.send({
          type: 'IMPORT_PROVIDER_ITEMS', provider: 'fanatical', mode: fullRescan ? 'full' : 'incremental', items,
          scanDiagnostics:{retries:projection.result?.coverage?.retries??0,arrayOnly:projection.result?.coverage?.paginationEvidence==='array-only'},
          syncState: { knownOrderFingerprints: projection.result?.orderFingerprints ?? [] }, snapshot: projection.result?.snapshot
        });
        if(!active())return;
        if (!response?.ok) throw new Error(response?.error ?? 'Fanatical import did not complete.');
        const stats = projection.result ?? {};
        const scope = fullRescan
          ? `Full rescan read ${stats.ordersScanned ?? 0} completed order${stats.ordersScanned === 1 ? '' : 's'}`
          : `Quick update read ${stats.ordersScanned ?? 0} new completed order${stats.ordersScanned === 1 ? '' : 's'} and skipped ${Math.max(0, (stats.ordersAvailable ?? 0) - (stats.ordersScanned ?? 0))} already checked`;
        status.textContent = `${scope}. ${response.gameCount} Fanatical game${response.gameCount === 1 ? '' : 's'}, ${response.bookCount} book${response.bookCount === 1 ? '' : 's'}, and ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'} stored locally.`;
      } catch (error) {
        if(!active())return;
        await globalThis.GalacticSync.failed('fanatical',error);
        if(!active())return;
        status.textContent = `Fanatical import failed: ${error.message}`;
      } finally {
        if(active()){
          buttons.forEach((button) => { button.disabled = false; });
          delete status.dataset.busy;
        }
      }
    }

    globalThis.GalacticFloatingPanel?.attach(shadow, 'fanatical');
    document.documentElement.append(host);
  }
  function refresh() {
    if(routeUrl!==location.href){routeUrl=location.href;generation++;currentHost?.remove();currentHost=null;}
    if(!isOrders()){if(currentHost){generation++;currentHost.remove();currentHost=null;}return;}
    if(!currentHost?.isConnected){generation++;mount();}
  }
  globalThis.GalacticFanaticalRouteUI={refresh};
  new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});
  globalThis.addEventListener?.('popstate',refresh);
  globalThis.addEventListener?.('hashchange',refresh);
  globalThis.navigation?.addEventListener?.('currententrychange',refresh);
  // SPA history calls execute in MAIN, not necessarily in this isolated world.
  // Cover URL-only push/replace transitions without wrapping the website API.
  globalThis.setInterval?.(()=>{if(routeUrl!==location.href)refresh();},250);
  refresh();
}());
