import { matchItems } from '../lib/matcher.js';
import { getDatabase, replaceProviderItems } from '../lib/storage.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage().catch(() => {});
});

// This is intentionally internal for now. The later external API will use the
// same handler, after both published extension IDs are fixed and allow-listed.
function isSteamImportPage(url) {
  try {
    const page = new URL(url);
    return page.origin === 'https://store.steampowered.com';
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === 'MATCH_ITEMS') {
    getDatabase()
      .then((database) => sendResponse({ ok: true, results: matchItems(database.providerItems, request.items ?? []) }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.type !== 'IMPORT_PROVIDER_ITEMS') return undefined;
  if (request.provider !== 'steam' || !isSteamImportPage(sender.url)) {
    sendResponse({ ok: false, error: 'Steam imports are accepted only from the signed-in Steam Store.' });
    return undefined;
  }
  if (!Array.isArray(request.items) || request.items.length === 0 || request.items.length > 50000) {
    sendResponse({ ok: false, error: 'Steam did not provide a valid game list.' });
    return undefined;
  }
  replaceProviderItems('steam', request.items, { source: 'steam-store-browse-items' })
    .then((database) => sendResponse({
      ok: true,
      gameCount: database.providers.steam.itemCount,
      addOnCount: database.providers.steam.addOnCount ?? 0,
      linkedAddOnCount: database.providers.steam.linkedAddOnCount ?? 0,
      syncedAt: database.providers.steam.lastSync
    }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
