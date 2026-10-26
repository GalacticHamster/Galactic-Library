(function attachKoboSync() {
  'use strict';
  if (!location.pathname.includes('/library') || document.querySelector('#galactic-library-kobo-importer') || !globalThis.GalacticKobo) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-kobo-importer';

  const shadow = host.attachShadow({ mode: 'closed' });
  globalThis.GalacticFloatingPanel.render(shadow,'kobo',{onImport:sync,diagnostics:"<details><summary>Scan diagnostics</summary><p>Inspect this My Books page and, if linked here, the first purchase-history page. No books or access states will change. Reports contain counts only, not titles, dates, identifiers or account details.</p><button type=\"button\" data-check-evidence>Check ownership evidence (no import)</button> <button type=\"button\" data-export-evidence hidden>Export check report</button></details>"});

  const buttons = [...shadow.querySelectorAll('button[data-mode], [data-check-evidence]')];
  const exportButton = shadow.querySelector('[data-export-evidence]');
  let evidenceReport = null;
  const status = shadow.querySelector('.status');
  const performanceApi=globalThis.GalacticContentsPerformance;
  const prefix=crypto.randomUUID().replace(/-/gu,'').slice(0,12);let sequence=100;

  async function sync(mode) {
    const timing=performanceApi?.trace(`lookup-${prefix}-${sequence++}`,'provider');
    if(timing)timing.providerPhase='scan';let completed=false;
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    status.textContent='Checking saved account before reading Kobo...';
    try {
      const startEnd=timing?.begin('request_dispatch');
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'kobo',diagnosticLookupId:timing?.id });
      startEnd?.();performanceApi?.merge(timing,state?.performance);
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Kobo sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Kobo baseline yet; reading every library page once…';
      status.textContent='Reading Kobo newest-first My Books page...';
      const fetchEnd=timing?.begin('provider_fetch');
      const { items, archivePagesRead, archiveAvailable, audiobookPagesRead, audiobookAvailable, snapshot } = await globalThis.GalacticKobo.fetchKoboLibrary(({ pagesRead, sectionPagesRead, books, audiobooks, section }) => {
        const scanText = pagesRead === null ? `${sectionPagesRead} page${sectionPagesRead === 1 ? '' : 's'} checked` : `${pagesRead} My Books scan pass${pagesRead === 1 ? '' : 'es'} checked`;
        status.textContent = `Reading Kobo ${section ?? 'library'}: ${scanText}; ${books} books and ${audiobooks} audiobooks found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? [],timing);
      fetchEnd?.();
      status.textContent = items.length ? `Checking ${items.length} Kobo item${items.length === 1 ? '' : 's'} against saved books...` : 'No new Kobo titles; finishing the check...';
      const finishEnd=timing?.begin('save_message');
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kobo', mode: fullRescan ? 'full' : 'incremental', items, snapshot,diagnosticLookupId:timing?.id });
      finishEnd?.();performanceApi?.merge(timing,response?.performance);
      if (!response?.ok) throw new Error(response?.error ?? 'Kobo import did not complete.');
      completed=true;
      const ownership=response.ownership;
      const ownershipNote=ownership?`${ownership.covered?' Ownership preference applied.':''}${ownership.review?` ${ownership.review} need ownership review.`:''}${ownership.subscriptions?` ${ownership.subscriptions} subscription item(s).`:''}`:'';
      if (!fullRescan) {
        const changes=response.changes;
        const summary=changes?`${items.length} checked · ${changes.added} new · ${changes.updated} updated.`:`${items.length} checked.`;
        status.textContent = `${summary}${ownershipNote}`;
        return;
      }
      const archiveText = archiveAvailable ? ` Included ${archivePagesRead} Archive page${archivePagesRead === 1 ? '' : 's'}.` : ' Kobo did not expose an Archive link in this view.';
      const audiobookText = audiobookAvailable ? ` Read ${audiobookPagesRead} Audiobooks page${audiobookPagesRead === 1 ? '' : 's'}.` : ' Kobo did not expose a separate Audiobooks view in this page.';
      status.textContent = `Saved ${response.bookCount} Kobo book${response.bookCount === 1 ? '' : 's'} and ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'} locally.${archiveText}${audiobookText}${ownershipNote}`;
    } catch (error) {
      await globalThis.GalacticSync.failed('kobo',error);
      status.textContent = `Kobo import failed: ${error.message}`;
    } finally {
      if(timing)globalThis.GalacticSync.send({type:'GL_PROVIDER_UI_TIMING',provider:'kobo',timing:performanceApi.clean(timing.finish(completed?'prepared':'failed'))}).catch(()=>{});
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  shadow.querySelector('[data-check-evidence]').addEventListener('click', async () => {
    buttons.forEach(button => { button.disabled = true; });
    exportButton.hidden = true; evidenceReport = null;
    status.dataset.busy = 'true';
    status.textContent = 'Checking visible Kobo evidence and one linked history page. No library data will change...';
    try {
      // Bypass the scan-start wrapper: this is a read, with no lease or save.
      let savedIds = null;
      try {
        const state = await chrome.runtime.sendMessage({type: 'GET_PROVIDER_SYNC_STATE', provider: 'kobo', beginScan: false});
        if (state?.ok && Array.isArray(state.syncState?.knownProviderItemIds)) savedIds = state.syncState.knownProviderItemIds;
      } catch { /* Evidence inspection is still possible without saved IDs. */ }
      evidenceReport = await globalThis.GalacticKoboDiagnostics.check(document, location.href, savedIds);
      status.textContent = `Evidence check finished. ${evidenceReport.library.parsedLibraryItems} readable library items on this page. Purchase history: ${evidenceReport.purchaseHistory.state === 'link-not-exposed' ? 'no link exposed here' : evidenceReport.purchaseHistory.state === 'content-observed' ? 'first page readable' : evidenceReport.purchaseHistory.state === 'explicit-empty' ? 'an explicit empty list was shown' : 'not verified'}. No library data changed. Export the check report; this does not verify complete history or ownership.`;
    } catch {
      status.textContent = 'The evidence check could not finish. No library data changed. Open My Books, let it finish loading, then retry.';
    } finally {
      exportButton.hidden = !evidenceReport;
      buttons.forEach(button => { button.disabled = false; });
      delete status.dataset.busy;
    }
  });
  exportButton.addEventListener('click', () => {
    if (!evidenceReport) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidenceReport, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'GL-kobo-evidence-check.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  globalThis.GalacticFloatingPanel?.attach(shadow, 'kobo');
  document.documentElement.append(host);
}());
