import { matchItems } from '../lib/matcher.js';
import { handleExternalApiRequest } from '../lib/external-api.js';
import { getAllowedExternalClientIds, getDatabase, replaceProviderItems } from '../lib/storage.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage().catch(() => {});
});

function isProviderImportPage(provider, url) {
  try {
    const page = new URL(url);
    return (provider === 'steam' && page.origin === 'https://store.steampowered.com')
      || (provider === 'gog' && page.origin === 'https://www.gog.com')
      || (provider === 'epic' && page.origin === 'https://store.epicgames.com')
      || (provider === 'audible' && page.origin === 'https://www.audible.com')
      || (provider === 'kindle' && page.origin === 'https://www.amazon.com')
      || (provider === 'humble' && page.origin === 'https://www.humblebundle.com' && page.pathname.startsWith('/home/purchases'));
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
  if (!['steam', 'gog', 'epic', 'audible', 'kindle', 'humble'].includes(request.provider) || !isProviderImportPage(request.provider, sender.url)) {
    sendResponse({ ok: false, error: 'Imports are accepted only from the matching signed-in provider site.' });
    return undefined;
  }
  if (!Array.isArray(request.items) || request.items.length === 0 || request.items.length > 50000) {
    sendResponse({ ok: false, error: 'The provider did not provide a valid game list.' });
    return undefined;
  }
  const source = request.provider === 'steam'
    ? 'steam-store-browse-items'
    : request.provider === 'gog'
      ? 'gog-account-library'
      : request.provider === 'epic'
        ? 'epic-store-library'
    : request.provider === 'audible'
      ? 'audible-library-page'
      : request.provider === 'kindle'
        ? 'amazon-kindle-content-library'
        : 'humble-purchase-library';
  replaceProviderItems(request.provider, request.items, { source })
    .then((database) => sendResponse({
      ok: true,
      gameCount: database.providers[request.provider].itemCount,
      addOnCount: database.providers[request.provider].addOnCount ?? 0,
      audiobookCount: database.providers[request.provider].audiobookCount ?? 0,
      bookCount: database.providers[request.provider].bookCount ?? 0,
      linkedAddOnCount: database.providers[request.provider].linkedAddOnCount ?? 0,
      syncedAt: database.providers[request.provider].lastSync
    }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  getAllowedExternalClientIds()
    .then((allowedIds) => {
      if (!sender.id || !allowedIds.includes(sender.id)) {
        sendResponse({ ok: false, error: 'This extension is not allowed to use the Galactic Library API.' });
        return null;
      }
      return getDatabase().then((database) => sendResponse(handleExternalApiRequest(database, request)));
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
