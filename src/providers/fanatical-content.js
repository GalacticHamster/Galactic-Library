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
    globalThis.GalacticFloatingPanel.render(shadow,'fanatical',{onImport:sync,diagnostics:'<details><summary>Scan diagnostics</summary><p>Aggregate counts only; no titles, account details or order identifiers. Available after a check, until this page is reloaded.</p><button type="button" data-export-scan disabled>Export scan report</button></details>'});
    const buttons = [...shadow.querySelectorAll('button[data-mode]')];
    const status = shadow.querySelector('.status');
    const tools=globalThis.GalacticFanatical,exportButton=shadow.querySelector('[data-export-scan]');
    let report=null;
    exportButton.addEventListener('click',()=>{
      if(!report)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='GL-fanatical-scan.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });

    async function sync(mode) {
      if(!active())return;
      buttons.forEach((button) => { button.disabled = true; });
      status.dataset.busy = 'true';
      report={provider:'fanatical',format:1,diagnostic:null,validatedDataReturned:false,saveAttempted:false,committed:false,persistence:'not-attempted',retry:'retry'};
      exportButton.disabled=true;
      let phase='account';
      try {
        const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'fanatical' });
        if(!active())return;
        if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Fanatical sync state.');
        const fullRescan = mode === 'full' || !(state.hasAcquisitionBaseline ?? state.hasFullBaseline);
        status.textContent = fullRescan ? 'Reading your completed Fanatical order history...' : 'Checking Fanatical for newly completed orders...';
        phase='acquisition';report.diagnostic=tools.failureReport();
        const projection = await globalThis.GalacticSync.send({
          type: 'FETCH_FANATICAL_ORDERS',
          fullScan: fullRescan,
          knownOrderFingerprints: fullRescan ? [] : state.syncState?.knownOrderFingerprints ?? []
        });
        if(!active())return;
        report.diagnostic=tools.scanReport(projection?.diagnostic)??tools.failureReport();
        if (!projection?.ok) throw new Error(tools.failureMessage(report.diagnostic.category));
        report.validatedDataReturned=true;
        const items = globalThis.GalacticFanatical.fanaticalItemsFromProjection(projection.result);
        status.textContent = items.length ? `Saving ${items.length} Fanatical item${items.length === 1 ? '' : 's'} locally...` : 'No new supported Fanatical items; recording the completed check...';
        phase='save';report.saveAttempted=true;report.persistence='unconfirmed';
        const response = await globalThis.GalacticSync.send({
          type: 'IMPORT_PROVIDER_ITEMS', provider: 'fanatical', mode: fullRescan ? 'full' : 'incremental', items,
          scanDiagnostics:{incomplete:projection.result?.acquisitionComplete===false,failedRequestCount:(projection.result?.recovery?.failedOrders??0)+(projection.result?.recovery?.listingIncomplete?1:0),retries:projection.result?.coverage?.retries??0,arrayOnly:projection.result?.coverage?.paginationEvidence==='array-only'},
          syncState: { knownOrderFingerprints: projection.result?.orderFingerprints ?? [],...(projection.result?.recovery?{failedOrderFingerprints:projection.result.recovery.failedOrderFingerprints,listingIncomplete:projection.result.recovery.listingIncomplete}:{}) }, snapshot: projection.result?.snapshot
        });
        if(!active())return;
        if (!response?.ok) throw new Error(response?.error ?? 'Fanatical import did not complete.');
        report.committed=true;report.persistence='committed';
        const stats = projection.result ?? {};
        if(stats.recovery){status.textContent=`Saved ${stats.ordersScanned} Fanatical purchase${stats.ordersScanned===1?'':'s'}. ${stats.recovery.failedOrders?`${stats.recovery.failedOrders} purchase${stats.recovery.failedOrders===1?" couldn't":"s couldn't"} be loaded and will be retried by Quick update. `:''}${stats.recovery.listingIncomplete?'Some purchase history could not be checked and will be retried by Quick update. ':''}Earlier purchases were kept.`;return;}
        const scope = fullRescan
          ? `Full rescan read ${stats.ordersScanned ?? 0} completed order${stats.ordersScanned === 1 ? '' : 's'}`
          : `Quick update read ${stats.ordersScanned ?? 0} new completed order${stats.ordersScanned === 1 ? '' : 's'} and skipped ${Math.max(0, (stats.ordersAvailable ?? 0) - (stats.ordersScanned ?? 0))} already checked`;
        status.textContent = `${scope}. ${response.gameCount} Fanatical game${response.gameCount === 1 ? '' : 's'}, ${response.bookCount} book${response.bookCount === 1 ? '' : 's'}, and ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'} stored locally.`;
      } catch (error) {
        if(!active())return;
        if(phase!=='acquisition')report.diagnostic=tools.failureReport(phase==='account'||/account|profile|lease|stale|authorization|receipt/iu.test(error?.message??'')?'scope':'storage',phase==='account'?'execution':'save');
        const message=phase==='save'?'GL could not confirm that these purchases were saved. Earlier records were kept. Check the selected account and available browser storage, then retry. Export the scan report if this continues.':tools.failureMessage(report.diagnostic?.category);
        await globalThis.GalacticSync.failed('fanatical',new Error(message));
        if(!active())return;
        status.textContent = `Fanatical import failed: ${message} For a scan report, enable provider diagnostics in GL Settings, reload this page and retry.`;
      } finally {
        if(active()){
          report.retry=report.committed?(report.diagnostic?.acquisitionFinished?'none':'quick'):report.diagnostic?.category==='authentication'?'sign-in':report.diagnostic?.category==='scope'?'check-account':'retry';
          exportButton.disabled=false;
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
