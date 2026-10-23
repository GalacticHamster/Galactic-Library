(function attachAmazonVideoSync() {
  'use strict';
  if (!location.pathname.includes('/gp/video/') || document.querySelector('#galactic-library-amazon-video-importer') || !globalThis.GalacticAmazonVideo) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-amazon-video-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> starts at Amazon Video's newest-first Most recent addition order and stops at a rendered group already in your local baseline. <strong>Full rescan</strong> reads the complete library.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p><button type="button" data-export-diagnostics hidden>Export scan diagnostics</button></div>`;
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const exportButton = shadow.querySelector('[data-export-diagnostics]');
  const status = shadow.querySelector('.status');

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    exportButton.hidden = true;
    let scanStarted = false;
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'amazon-video' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Amazon Video sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Amazon Video baseline yet; reading the complete library once…';
      scanStarted = true;
      const { items, snapshot } = await globalThis.GalacticAmazonVideo.fetchAmazonVideoLibrary(({ passes, movies, tv }) => {
        status.textContent = `Reading Amazon Video library: ${passes} scroll pass${passes === 1 ? '' : 'es'} checked; ${movies} movies and ${tv} TV titles found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      status.textContent = items.length ? `Saving ${items.length} Amazon Video title${items.length === 1 ? '' : 's'} locally...` : 'No new Amazon Video titles; recording the completed check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-video', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Video import did not complete.');
      status.textContent = `${fullRescan ? 'Full rescan complete' : `Quick update added ${items.length} Amazon Video title${items.length === 1 ? '' : 's'}`}. ${response.movieCount} Amazon Video movie${response.movieCount === 1 ? '' : 's'} and ${response.tvCount} TV title${response.tvCount === 1 ? '' : 's'} stored locally.`;
    } catch (error) {
      await globalThis.GalacticSync.failed('amazon-video',error);
      status.textContent = `Amazon Video import failed: ${error.message}`;
      exportButton.hidden = !scanStarted || !globalThis.GalacticAmazonVideo.getDiagnostics?.();
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  exportButton.addEventListener('click', () => {
    const diagnostics = globalThis.GalacticAmazonVideo.getDiagnostics?.();
    if (!diagnostics) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'GL-amazon-video-scan.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow, 'amazon-video');
  document.documentElement.append(host);
}());
