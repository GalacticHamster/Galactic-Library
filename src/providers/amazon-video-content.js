(function attachAmazonVideoSync() {
  'use strict';
  if (!location.pathname.includes('/gp/video/') || document.querySelector('#galactic-library-amazon-video-importer') || !globalThis.GalacticAmazonVideo) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-amazon-video-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#1f2937; border:1px solid #38bdf8; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#38bdf8; color:#082f49; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#bae6fd; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br>Import movies and TV shows visible in this signed-in Purchases & Rentals library. The page may scroll while it reads every loaded title card.</p><button type="button">Sync Amazon Video library</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const { items } = await globalThis.GalacticAmazonVideo.fetchAmazonVideoLibrary(({ passes, movies, tv }) => {
        status.textContent = `Reading Amazon Video library: ${passes} scroll pass${passes === 1 ? '' : 'es'} checked; ${movies} movies and ${tv} TV titles found.`;
      });
      status.textContent = `Saving ${items.length} Amazon Video title${items.length === 1 ? '' : 's'} locally...`;
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'amazon-video', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Amazon Video import did not complete.');
      status.textContent = `Saved ${response.movieCount} Amazon Video movie${response.movieCount === 1 ? '' : 's'} and ${response.tvCount} TV title${response.tvCount === 1 ? '' : 's'} locally.`;
    } catch (error) {
      status.textContent = `Amazon Video import failed: ${error.message}`;
    } finally {
      button.disabled = false;
      delete status.dataset.busy;
    }
  });
  document.documentElement.append(host);
}());
