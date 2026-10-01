(function attachKoboSync() {
  'use strict';
  if (!location.pathname.includes('/library') || document.querySelector('#galactic-library-kobo-importer') || !globalThis.GalacticKobo) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-kobo-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#1f2937; border:1px solid #60a5fa; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#60a5fa; color:#172554; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#bfdbfe; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads Kobo's newest-first My Books pages until it reaches a page already in your local baseline. <strong>Full rescan</strong> also checks Archive and Audiobooks when Kobo exposes them.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button')];
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'kobo' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Kobo sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Kobo baseline yet; reading every library page once…';
      const { items, archivePagesRead, archiveAvailable, audiobookPagesRead, audiobookAvailable, snapshot } = await globalThis.GalacticKobo.fetchKoboLibrary(({ pagesRead, sectionPagesRead, books, audiobooks, section }) => {
        const scanText = pagesRead === null ? `${sectionPagesRead} page${sectionPagesRead === 1 ? '' : 's'} checked` : `${pagesRead} My Books scan pass${pagesRead === 1 ? '' : 'es'} checked`;
        status.textContent = `Reading Kobo ${section ?? 'library'}: ${scanText}; ${books} books and ${audiobooks} audiobooks found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      status.textContent = items.length ? `Saving ${items.length} Kobo item${items.length === 1 ? '' : 's'} locally...` : 'No new Kobo titles; recording the completed check...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kobo', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Kobo import did not complete.');
      if (!fullRescan) {
        status.textContent = `Quick update added ${items.length} Kobo item${items.length === 1 ? '' : 's'}. ${response.bookCount} Kobo book${response.bookCount === 1 ? '' : 's'} and ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'} stored locally. Use Full rescan to check Archive and Audiobooks.`;
        return;
      }
      const archiveText = archiveAvailable ? ` Included ${archivePagesRead} Archive page${archivePagesRead === 1 ? '' : 's'}.` : ' Kobo did not expose an Archive link in this view.';
      const audiobookText = audiobookAvailable ? ` Read ${audiobookPagesRead} Audiobooks page${audiobookPagesRead === 1 ? '' : 's'}.` : ' Kobo did not expose a separate Audiobooks view in this page.';
      status.textContent = `Saved ${response.bookCount} Kobo book${response.bookCount === 1 ? '' : 's'} and ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'} locally.${archiveText}${audiobookText}`;
    } catch (error) {
      status.textContent = `Kobo import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow);
  document.documentElement.append(host);
}());
