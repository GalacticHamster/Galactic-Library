(function attachKoboSync() {
  'use strict';
  if (!location.pathname.includes('/library') || document.querySelector('#galactic-library-kobo-importer') || !globalThis.GalacticKobo) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-kobo-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads Kobo's newest-first My Books pages until it reaches a page already in your local baseline. <strong>Full rescan</strong> also checks Archive and Audiobooks when Kobo exposes them.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
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
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow, 'kobo');
  document.documentElement.append(host);
}());
