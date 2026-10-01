import { matchItems } from '../lib/matcher.js';
import { handleExternalApiRequest } from '../lib/external-api.js';
import { googleBooksCandidatesFromSearch, googleBooksSearchUrl } from '../lib/google-books.js';
import { openLibraryCandidatesFromSearch, openLibrarySearchUrl } from '../lib/open-library.js';
import { isConfirmedComicManga } from '../lib/genre-hints.js';
import { createStorageWriter } from './storage-writer.js';
import { createStorageMessageHandler } from './storage-messages.js';
import { completeProviderSnapshot, completedScope } from '../lib/provider-snapshot.js';

const storageWriter = createStorageWriter(chrome.storage.local);
const { getAllowedExternalClientIds, getDatabase, getGoogleBooksApiKey, mergeProviderItems, replaceProviderItems, saveKindleComicContents } = storageWriter;
chrome.runtime.onMessage.addListener(createStorageMessageHandler(storageWriter, chrome.runtime));

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
      || (provider === 'fanatical' && page.origin === 'https://www.fanatical.com' && /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?orders\/?$/iu.test(page.pathname))
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
  return ['steam', 'gog', 'epic', 'amazon-games', 'audible', 'kindle', 'amazon-video', 'fandango-at-home', 'kobo', 'fanatical', 'humble'].includes(provider);
}

function humbleSyncState(value) {
  const knownPurchaseIds = [...new Set((Array.isArray(value?.knownPurchaseIds) ? value.knownPurchaseIds : [])
    .map((id) => String(id ?? '').trim())
    .filter((id) => id.length > 0 && id.length <= 256))].slice(0, 50000);
  return { knownPurchaseIds };
}

function fanaticalSyncState(value) {
  const knownOrderFingerprints = [...new Set((Array.isArray(value?.knownOrderFingerprints) ? value.knownOrderFingerprints : [])
    .map((fingerprint) => String(fingerprint ?? '').toLocaleLowerCase())
    .filter((fingerprint) => /^[a-f0-9]{64}$/u.test(fingerprint)))].slice(0, 50000);
  return { knownOrderFingerprints };
}

// This function is serialized into Fanatical's MAIN world. It is the only
// code allowed to read the signed-in page's session token, and returns a
// strict ownership projection rather than a token or raw order response.
async function readFanaticalOrdersInPage({ fullScan = false, knownOrderFingerprints = [] } = {}) {
  const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const id = (value) => /^[a-zA-Z0-9_-]{6,128}$/u.test(String(value ?? '')) ? String(value) : '';
  const list = (value, max = 30) => [...new Set((Array.isArray(value) ? value : []).map((entry) => text(entry, 40)).filter(Boolean))].slice(0, max);
  const mediaType = (value) => {
    const type = text(value).toLocaleLowerCase();
    if (type === 'game') return 'game';
    if (type.includes('comic') || type === 'book') return 'book';
    if (type === 'audiobook' || (type.includes('audio') && type.includes('book'))) return 'audiobook';
    return 'other';
  };
  const fingerprint = async (orderId) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(orderId)));
    return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
  };
  let token = '';
  try { token = String(JSON.parse(localStorage.getItem('bsauth') || '{}')?.token || ''); } catch { /* signed-out or changed page state */ }
  if (!token) throw new Error('Sign in to Fanatical before importing purchases.');
  const request = async (path) => {
    const response = await fetch(path, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json', authorization: token } });
    if (!response.ok) throw new Error(response.status === 401 ? 'Fanatical session expired. Sign in and try again.' : `Fanatical returned ${response.status} while reading your orders.`);
    return response.json();
  };
  const summaries = await request('/api/user/orders');
  if (!Array.isArray(summaries) || summaries.some((order) => !order || !id(order._id) || typeof order.status !== 'string')) throw new Error('Fanatical returned a malformed order index.');
  const completed = (Array.isArray(summaries) ? summaries : []).filter((order) => order?.status === 'COMPLETE' && id(order?._id));
  const orders = await Promise.all(completed.map(async (order) => ({ order, fingerprint: await fingerprint(order._id) })));
  const known = new Set((Array.isArray(knownOrderFingerprints) ? knownOrderFingerprints : [])
    .map((value) => String(value ?? '').toLocaleLowerCase()).filter((value) => /^[a-f0-9]{64}$/u.test(value)));
  const selected = fullScan ? orders : orders.filter((entry) => !known.has(entry.fingerprint));
  const details = await Promise.all(selected.map(async ({ order }) => request(`/api/user/orders/${encodeURIComponent(order._id)}`)));
  const itemsById = new Map();
  for (const order of details) {
    if (order?.status !== 'COMPLETE' || !Array.isArray(order.items)) throw new Error('Fanatical returned an incomplete or malformed completed order.');
    for (const parent of Array.isArray(order?.items) ? order.items : []) {
      if (!Array.isArray(parent?.bundles)) throw new Error('Fanatical returned malformed order groups.');
      for (const group of Array.isArray(parent?.bundles) ? parent.bundles : []) {
        if (!Array.isArray(group?.games)) throw new Error('Fanatical returned a malformed product list.');
        for (const leaf of Array.isArray(group?.games) ? group.games : []) {
          const sourceItemId = id(leaf?._id);
          const title = text(leaf?.name);
          const kind = mediaType(leaf?.display_type ?? leaf?.type);
          if (!sourceItemId || !title) throw new Error('Fanatical returned an unreadable order product.');
          if (kind === 'other') continue;
          const steamAppId = /^\d{1,16}$/u.test(String(leaf?.steam?.id ?? '')) ? String(leaf.steam.id) : '';
          const isbn = text(leaf?.isbn, 32).replace(/[^0-9X]/giu, '');
          const purchaseDate = typeof order?.date === 'string' && !Number.isNaN(Date.parse(order.date)) ? order.date : null;
          itemsById.set(sourceItemId, {
            sourceItemId, title, mediaType: kind,
            slug: text(leaf?.slug, 300),
            externalIds: { ...(steamAppId ? { steamAppId } : {}), ...(isbn ? { isbn } : {}) },
            drm: list(Object.entries(leaf?.drm && typeof leaf.drm === 'object' ? leaf.drm : {}).filter(([, enabled]) => enabled === true).map(([name]) => name)),
            platforms: list(Object.entries(leaf?.platforms ?? leaf?.os ?? {}).filter(([, enabled]) => enabled === true).map(([name]) => name)),
            formats: list((Array.isArray(leaf?.downloads) ? leaf.downloads : []).flatMap((download) => (Array.isArray(download?.files) ? download.files : []).map((file) => text(file?.format, 32).toLocaleLowerCase()))),
            bundle: { sourceItemId: id(parent?._id), title: text(parent?.name), slug: text(parent?.slug, 300) },
            purchaseDate
          });
        }
      }
    }
  }
  // Raw order records and `token` never cross this MAIN-world boundary.
  return { ordersScanned: selected.length, ordersAvailable: orders.length, orderFingerprints: orders.map((entry) => entry.fingerprint), items: [...itemsById.values()], fullScan, complete: true };
}

function sanitizeFanaticalProjection(value) {
  const input = value && typeof value === 'object' ? value : {};
  if (!Array.isArray(input.items) || input.complete !== true || !Number.isSafeInteger(input.ordersScanned) || !Number.isSafeInteger(input.ordersAvailable) || input.ordersScanned < 0 || input.ordersScanned > input.ordersAvailable || (input.fullScan === true && input.ordersScanned !== input.ordersAvailable)) throw new Error('Fanatical did not return a complete validated order projection.');
  const knownOrderFingerprints = fanaticalSyncState({ knownOrderFingerprints: input.orderFingerprints }).knownOrderFingerprints;
  const items = [];
  for (const candidate of Array.isArray(input.items) ? input.items : []) {
    const sourceItemId = String(candidate?.sourceItemId ?? '').trim();
    const title = String(candidate?.title ?? '').trim().slice(0, 500);
    const mediaType = ['game', 'book', 'audiobook'].includes(candidate?.mediaType) ? candidate.mediaType : '';
    if (!/^[a-zA-Z0-9_-]{6,128}$/u.test(sourceItemId) || !title || !mediaType) throw new Error('Fanatical returned an unreadable projected product.');
    const safeList = (entries) => [...new Set((Array.isArray(entries) ? entries : []).map((entry) => String(entry ?? '').trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
    const safeText = (entry, max = 300) => String(entry ?? '').trim().slice(0, max);
    const steamAppId = /^\d{1,16}$/u.test(String(candidate?.externalIds?.steamAppId ?? '')) ? String(candidate.externalIds.steamAppId) : '';
    const isbn = /^[0-9X]{10,17}$/iu.test(String(candidate?.externalIds?.isbn ?? '')) ? String(candidate.externalIds.isbn).toUpperCase() : '';
    items.push({
      sourceItemId, title, mediaType, slug: safeText(candidate?.slug),
      externalIds: { ...(steamAppId ? { steamAppId } : {}), ...(isbn ? { isbn } : {}) },
      drm: safeList(candidate?.drm), platforms: safeList(candidate?.platforms), formats: safeList(candidate?.formats),
      bundle: { sourceItemId: /^[a-zA-Z0-9_-]{6,128}$/u.test(String(candidate?.bundle?.sourceItemId ?? '')) ? String(candidate.bundle.sourceItemId) : '', title: safeText(candidate?.bundle?.title, 500), slug: safeText(candidate?.bundle?.slug) },
      purchaseDate: typeof candidate?.purchaseDate === 'string' && !Number.isNaN(Date.parse(candidate.purchaseDate)) ? candidate.purchaseDate : null
    });
  }
  return {
    ordersScanned: Math.max(0, Math.floor(Number(input.ordersScanned) || 0)),
    ordersAvailable: Math.max(0, Math.floor(Number(input.ordersAvailable) || 0)),
    orderFingerprints: knownOrderFingerprints,
    items: [...new Map(items.map((item) => [item.sourceItemId, item])).values()],
    snapshot: input.fullScan === true ? completeProviderSnapshot('fanatical', items.map((item) => ({ providerItemId: item.sourceItemId })), [completedScope('orders', input.ordersScanned, input.ordersAvailable, 'index-complete', Math.max(1, input.ordersScanned))]) : undefined
  };
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

  if (request?.type === 'FETCH_FANATICAL_ORDERS') {
    if (!isProviderImportPage('fanatical', sender.url) || !sender.tab?.id) {
      sendResponse({ ok: false, error: 'Fanatical orders can be read only from a signed-in Fanatical tab.' });
      return undefined;
    }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: readFanaticalOrdersInPage,
      args: [{ fullScan: request.fullScan === true, knownOrderFingerprints: fanaticalSyncState({ knownOrderFingerprints: request.knownOrderFingerprints }).knownOrderFingerprints }]
    })
      .then((results) => sendResponse({ ok: true, result: sanitizeFanaticalProjection(results?.[0]?.result) }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.type === 'GET_KINDLE_COMIC_CONTENT_CANDIDATES') {
    if (!isProviderImportPage('kindle', sender.url)) {
      sendResponse({ ok: false, error: 'Kindle comic candidates are available only from the signed-in Kindle library page.' });
      return undefined;
    }
    getDatabase()
      .then((database) => {
        const candidates = Object.values(database.providerItems)
          .filter((item) => item.provider === 'kindle' && item.mediaType === 'book' && isConfirmedComicManga(item) && !item.metadata?.enrichment?.kindleProductComicContents)
          .flatMap((item) => {
            const detailUrl = String(item.metadata?.detailUrl ?? '');
            return /^https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]+$/u.test(detailUrl) ? [{ id: item.id, title: item.title, detailUrl }] : [];
          })
          .sort((left, right) => left.title.localeCompare(right.title));
        sendResponse({ ok: true, candidates });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.type === 'SAVE_KINDLE_COMIC_CONTENTS') {
    if (!isProviderImportPage('kindle', sender.url)) {
      sendResponse({ ok: false, error: 'Kindle comic contents can be saved only from the signed-in Kindle library page.' });
      return undefined;
    }
    saveKindleComicContents(request.entries)
      .then(() => sendResponse({ ok: true }))
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
            : request.provider === 'fanatical'
              ? fanaticalSyncState(state.syncState)
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
  const incrementalProvider = request.mode === 'incremental' && ['humble', 'fanatical', 'steam', 'gog', 'kindle', 'amazon-games', 'audible', 'kobo', 'amazon-video', 'fandango-at-home'].includes(request.provider);
  if (!Array.isArray(request.items) || request.items.length > 50000) {
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
              : request.provider === 'fanatical'
                ? 'fanatical-order-history'
                : 'humble-purchase-library';
  const now = new Date().toISOString();
  const syncDetails = request.provider === 'humble'
    ? {
        source,
        syncMode: incrementalProvider ? 'incremental' : 'full',
        ...(incrementalProvider ? { quickSyncAt: now } : { fullSyncAt: now }),
        syncState: humbleSyncState(request.syncState)
      }
    : request.provider === 'fanatical'
      ? {
        source,
        syncMode: incrementalProvider ? 'incremental' : 'full',
        ...(incrementalProvider ? { quickSyncAt: now } : { fullSyncAt: now }),
        syncState: fanaticalSyncState(request.syncState)
      }
    : {
        source,
        syncMode: incrementalProvider ? 'incremental' : 'full',
        ...(incrementalProvider ? { quickSyncAt: now } : { fullSyncAt: now })
      };
  (incrementalProvider ? mergeProviderItems : replaceProviderItems)(request.provider, request.items, syncDetails, request.snapshot)
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
