import { matchItems } from '../lib/matcher.js';
import { handleExternalApiRequest } from '../lib/external-api.js';
import { googleBooksCandidatesFromSearch, googleBooksSearchUrl } from '../lib/google-books.js';
import { openLibraryCandidatesFromSearch, openLibrarySearchUrl } from '../lib/open-library.js';
import { getAllowedExternalClientIds, getDatabase, getGoogleBooksApiKey, mergeProviderItems, replaceProviderItems } from '../lib/storage.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage().catch(() => {});
});

function isProviderImportPage(provider, url) {
  try {
    const page = new URL(url);
    return (provider === 'steam' && page.origin === 'https://store.steampowered.com')
      || (provider === 'gog' && page.origin === 'https://www.gog.com')
      || (provider === 'epic' && page.origin === 'https://store.epicgames.com')
      || (provider === 'amazon-games' && ((page.origin === 'https://gaming.amazon.com' && page.pathname.startsWith('/my-collection')) || (page.origin === 'https://luna.amazon.com' && page.pathname.startsWith('/claims/my-collection'))))
      || (provider === 'audible' && page.origin === 'https://www.audible.com')
      || (provider === 'kindle' && page.origin === 'https://www.amazon.com')
      || (provider === 'amazon-video' && page.origin === 'https://www.amazon.com' && page.pathname.includes('/gp/video/'))
      || (provider === 'fandango-at-home' && page.origin === 'https://athome.fandango.com')
      || (provider === 'kobo' && page.origin === 'https://www.kobo.com' && page.pathname.includes('/library'))
      || (provider === 'humble' && page.origin === 'https://www.humblebundle.com' && page.pathname.startsWith('/home/purchases'));
  } catch {
    return false;
  }
}

function isFandangoPage(url) {
  try {
    return new URL(url).origin === 'https://athome.fandango.com';
  } catch {
    return false;
  }
}

function fandangoImportKey(sender) {
  return sender.tab?.id === undefined ? '' : `fandango-import-${sender.tab.id}`;
}

function isOwnExtensionPage(url) {
  return typeof url === 'string' && url.startsWith(chrome.runtime.getURL(''));
}

function isKnownProvider(provider) {
  return ['steam', 'gog', 'epic', 'amazon-games', 'audible', 'kindle', 'amazon-video', 'fandango-at-home', 'kobo', 'humble'].includes(provider);
}

function humbleSyncState(value) {
  const knownPurchaseIds = [...new Set((Array.isArray(value?.knownPurchaseIds) ? value.knownPurchaseIds : [])
    .map((id) => String(id ?? '').trim())
    .filter((id) => id.length > 0 && id.length <= 256))].slice(0, 50000);
  return { knownPurchaseIds };
}

async function searchOpenLibrary(query) {
  const title = String(query?.title ?? '').trim();
  if (!title) throw new Error('Choose a book with a title before searching Open Library.');
  const response = await fetch(openLibrarySearchUrl({ title, authors: query?.authors }), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Open Library returned ${response.status}.`);
  return openLibraryCandidatesFromSearch(await response.json());
}

async function searchGoogleBooks(query) {
  const title = String(query?.title ?? '').trim();
  const apiKey = await getGoogleBooksApiKey();
  if (!title) throw new Error('Choose a book with a title before searching Google Books.');
  if (!apiKey) throw new Error('Save your Google Books API key before starting enrichment.');
  const response = await fetch(googleBooksSearchUrl({ title, authors: query?.authors, apiKey }), { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = String(body?.error?.message ?? '').replace(/\s+/gu, ' ').trim();
    throw new Error(`Google Books returned ${response.status}${detail ? `: ${detail}` : '.'}`);
  }
  return googleBooksCandidatesFromSearch(body);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === 'SEARCH_GOOGLE_BOOKS') {
    if (!isOwnExtensionPage(sender.url)) {
      sendResponse({ ok: false, error: 'Google Books searches are accepted only from Galactic Library.' });
      return undefined;
    }
    searchGoogleBooks(request.query)
      .then((candidates) => sendResponse({ ok: true, candidates }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.type === 'SEARCH_OPEN_LIBRARY') {
    if (!isOwnExtensionPage(sender.url)) {
      sendResponse({ ok: false, error: 'Open Library searches are accepted only from Galactic Library.' });
      return undefined;
    }
    searchOpenLibrary(request.query)
      .then((candidates) => sendResponse({ ok: true, candidates }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.type === 'FANDANGO_IMPORT_STATE') {
    const key = fandangoImportKey(sender);
    if (!key || !isFandangoPage(sender.url)) {
      sendResponse({ ok: false, error: 'Fandango import state is available only in the signed-in Fandango tab.' });
      return undefined;
    }
    if (request.action === 'get') {
      chrome.storage.session.get(key)
        .then((values) => sendResponse({ ok: true, state: values[key] ?? null }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (request.action === 'set' && request.state && typeof request.state === 'object') {
      chrome.storage.session.set({ [key]: request.state })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (request.action === 'clear') {
      chrome.storage.session.remove(key)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    sendResponse({ ok: false, error: 'Invalid Fandango import-state request.' });
    return undefined;
  }

  if (request?.type === 'MATCH_ITEMS') {
    getDatabase()
      .then((database) => sendResponse({ ok: true, results: matchItems(database.providerItems, request.items ?? []) }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.type === 'GET_PROVIDER_SYNC_STATE') {
    if (!isKnownProvider(request.provider) || !isProviderImportPage(request.provider, sender.url)) {
      sendResponse({ ok: false, error: 'Sync state is available only from the matching signed-in provider site.' });
      return undefined;
    }
    getDatabase()
      .then((database) => {
        const state = database.providers?.[request.provider] ?? {};
        const knownProviderItemIds = Object.values(database.providerItems)
          .filter((item) => item.provider === request.provider)
          .map((item) => item.providerItemId)
          .filter(Boolean)
          .slice(0, 50000);
        sendResponse({
          ok: true,
          hasFullBaseline: Boolean(state.fullSyncAt),
          lastSuccessfulSyncAt: String(state.quickSyncAt ?? state.fullSyncAt ?? ''),
          syncState: request.provider === 'humble'
            ? humbleSyncState(state.syncState)
            : { knownProviderItemIds }
        });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.type !== 'IMPORT_PROVIDER_ITEMS') return undefined;
  if (!isKnownProvider(request.provider) || !isProviderImportPage(request.provider, sender.url)) {
    sendResponse({ ok: false, error: 'Imports are accepted only from the matching signed-in provider site.' });
    return undefined;
  }
  const incrementalProvider = request.mode === 'incremental' && ['humble', 'steam', 'kindle', 'amazon-games', 'audible', 'kobo'].includes(request.provider);
  if (!Array.isArray(request.items) || request.items.length > 50000 || (!request.items.length && !incrementalProvider)) {
    sendResponse({ ok: false, error: 'The provider did not provide a valid game list.' });
    return undefined;
  }
  const source = request.provider === 'steam'
    ? 'steam-store-browse-items'
    : request.provider === 'gog'
      ? 'gog-account-library'
      : request.provider === 'epic'
        ? 'epic-store-library'
        : request.provider === 'amazon-games'
          ? 'amazon-games-collection'
    : request.provider === 'audible'
      ? 'audible-library-page'
        : request.provider === 'kindle'
          ? 'amazon-kindle-content-library'
          : request.provider === 'amazon-video'
            ? 'amazon-prime-video-purchases-library'
            : request.provider === 'fandango-at-home'
              ? 'fandango-at-home-library'
            : request.provider === 'kobo'
              ? 'kobo-my-books-library'
        : 'humble-purchase-library';
  const now = new Date().toISOString();
  const syncDetails = request.provider === 'humble'
    ? {
        source,
        syncMode: incrementalProvider ? 'incremental' : 'full',
        ...(incrementalProvider ? { quickSyncAt: now } : { fullSyncAt: now }),
        syncState: humbleSyncState(request.syncState)
      }
    : {
        source,
        syncMode: incrementalProvider ? 'incremental' : 'full',
        ...(incrementalProvider ? { quickSyncAt: now } : { fullSyncAt: now })
      };
  (incrementalProvider ? mergeProviderItems : replaceProviderItems)(request.provider, request.items, syncDetails)
    .then((database) => sendResponse({
      ok: true,
      gameCount: database.providers[request.provider].itemCount,
      addOnCount: database.providers[request.provider].addOnCount ?? 0,
      audiobookCount: database.providers[request.provider].audiobookCount ?? 0,
      bookCount: database.providers[request.provider].bookCount ?? 0,
      movieCount: database.providers[request.provider].movieCount ?? 0,
      tvCount: database.providers[request.provider].tvCount ?? 0,
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
