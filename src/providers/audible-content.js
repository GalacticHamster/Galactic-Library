(function attachAudibleSync() {
  'use strict';
  if (document.querySelector('#galactic-library-audible-importer') || !globalThis.GalacticAudible) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-audible-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#24211d; border:1px solid #f59e0b; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#f59e0b; color:#1c1917; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#fde68a; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br>Import audiobooks visible in this signed-in Audible Library. Titles and available author, narrator, and series metadata are saved locally.</p><button type="button">Sync Audible library</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const { items } = await globalThis.GalacticAudible.fetchAudibleAudiobooks(({ pagesRead, audiobooks }) => {
        status.textContent = `Reading Audible library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${audiobooks} audiobooks found.`;
      });
      status.textContent = `Saving ${items.length} Audible audiobook${items.length === 1 ? '' : 's'} locally...`;
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'audible', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Audible import did not complete.');
      status.textContent = `Saved ${response.audiobookCount} Audible audiobook${response.audiobookCount === 1 ? '' : 's'} locally.`;
    } catch (error) {
      status.textContent = `Audible import failed: ${error.message}`;
    } finally {
      button.disabled = false;
      delete status.dataset.busy;
    }
  });
  document.documentElement.append(host);
}());
