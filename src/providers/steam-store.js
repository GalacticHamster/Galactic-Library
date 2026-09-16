/* Steam Store importer. It makes user-initiated authenticated requests from a
 * tab where Steam is already signed in; no password, cookie copying, or API
 * key is involved. */
(function attachSteamStoreImporter(global) {
  'use strict';

  const STORE_ITEMS_BATCH_SIZE = 100;
  const BETWEEN_BATCHES_MS = 500;

  function ownedAppIdsFromDynamicStore(value) {
    const values = Array.isArray(value?.rgOwnedApps) ? value.rgOwnedApps : [];
    return [...new Set(values.map((value) => String(value).trim()).filter((value) => /^\d+$/u.test(value)))];
  }

  function libraryItemsFromStoreItems(value, allowedIds) {
    const libraryItems = [];
    for (const item of value?.response?.store_items ?? []) {
      const providerItemId = String(item?.appid ?? '').trim();
      const title = String(item?.name ?? '').replace(/\s+/gu, ' ').trim();
      const type = Number(item?.type);
      if (!allowedIds.has(providerItemId) || !title || (type !== 0 && type !== 4)) continue;
      const parentAppId = String(item?.related_items?.parent_appid ?? '').trim();
      libraryItems.push({
        providerItemId,
        title,
        mediaType: type === 4 ? 'game-addon' : 'game',
        ownership: 'owned',
        metadata: {
          source: 'steam-store-browse-items',
          ...(type === 4 && /^\d+$/u.test(parentAppId) ? { parentProviderItemId: parentAppId } : {})
        }
      });
    }
    return libraryItems;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function fetchStoreItems(batch) {
    const input = {
      ids: batch.map((appid) => ({ appid: Number(appid) })),
      context: { language: 'english', country_code: 'US', steam_realm: 1 },
      data_request: { include_basic_info: true }
    };
    const response = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Steam's title service returned ${response.status}.`);
    return response.json();
  }

  async function fetchOwnedSteamGames(reportProgress = () => {}) {
    const ownedResponse = await fetch('/dynamicstore/userdata/', { credentials: 'same-origin', cache: 'no-store' });
    if (!ownedResponse.ok) throw new Error(`Steam Store returned ${ownedResponse.status} while loading your library. Please wait before retrying; Steam temporarily limits rapid requests.`);
    const appIds = ownedAppIdsFromDynamicStore(await ownedResponse.json());
    if (!appIds.length) throw new Error('Steam Store did not return owned apps. Confirm you are signed in to Steam Store in this tab.');

    const itemsById = new Map();
    const unresolvedApps = [];
    for (let offset = 0; offset < appIds.length; offset += STORE_ITEMS_BATCH_SIZE) {
      const batch = appIds.slice(offset, offset + STORE_ITEMS_BATCH_SIZE);
      reportProgress({ completed: offset, total: appIds.length, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      try {
        const items = await fetchStoreItems(batch);
        const returnedIds = new Set((items?.response?.store_items ?? []).map((item) => String(item?.appid ?? '')).filter(Boolean));
        for (const appId of batch) if (!returnedIds.has(appId)) unresolvedApps.push({ appId, status: 'not returned by Steam' });
        for (const item of libraryItemsFromStoreItems(items, new Set(batch))) itemsById.set(item.providerItemId, item);
      } catch (error) {
        unresolvedApps.push(...batch.map((appId) => ({ appId, status: error.message })));
      }
      reportProgress({ completed: offset + batch.length, total: appIds.length, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      if (offset + STORE_ITEMS_BATCH_SIZE < appIds.length) await wait(BETWEEN_BATCHES_MS);
    }
    if (![...itemsById.values()].some((item) => item.mediaType === 'game')) throw new Error('Steam returned owned apps but no game titles. Please try again later.');
    return { items: [...itemsById.values()], unresolvedApps };
  }

  global.GalacticSteamStore = { ownedAppIdsFromDynamicStore, libraryItemsFromStoreItems, fetchOwnedSteamGames };
}(globalThis));
