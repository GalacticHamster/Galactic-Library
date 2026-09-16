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
    <div class="panel"><p><strong>Galactic Library</strong><br>Import Humble games, audiobooks, and DRM-free books from this signed-in purchase history. Redemption values are redacted before the purchase details are parsed, and are never saved.</p><button type="button">Sync Humble purchases</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.busy = 'true';
    try {
      const { items, purchasesRead } = await globalThis.GalacticHumble.fetchHumblePurchases(({ purchasesRead: read, purchasesTotal, items: found }) => {
        status.textContent = purchasesTotal ? `Reading Humble purchase ${read}/${purchasesTotal}; ${found} supported entitlements found.` : 'Loading your Humble purchases…';
      });
      status.textContent = `Saving ${items.length} Humble entitlements locally…`;
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'humble', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Humble import did not complete.');
      status.textContent = `Saved ${response.gameCount} Humble game${response.gameCount === 1 ? '' : 's'}, ${response.audiobookCount} audiobook${response.audiobookCount === 1 ? '' : 's'}, and ${response.bookCount} book${response.bookCount === 1 ? '' : 's'} from ${purchasesRead} purchase${purchasesRead === 1 ? '' : 's'}.`;
    } catch (error) {
      status.textContent = `Humble import failed: ${error.message}`;
    } finally {
      button.disabled = false;
      delete status.dataset.busy;
    }
  });
  document.documentElement.append(host);
}());
