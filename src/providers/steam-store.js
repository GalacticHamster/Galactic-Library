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

  function gamesFromStoreItems(value, allowedIds) {
    const games = [];
    for (const item of value?.response?.store_items ?? []) {
      const providerItemId = String(item?.appid ?? '').trim();
      const title = String(item?.name ?? '').replace(/\s+/gu, ' ').trim();
      // Steam's StoreBrowse protocol defines app type 0 as a full game and
      // type 4 as DLC. Deliberately exclude demos, tools, videos, and DLC.
      if (!allowedIds.has(providerItemId) || Number(item?.type) !== 0 || !title) continue;
      games.push({
        providerItemId,
        title,
        mediaType: 'game',
        ownership: 'owned',
        metadata: { source: 'steam-store-browse-items' }
      });
    }
    return games;
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

    const gamesById = new Map();
    const unresolvedApps = [];
    for (let offset = 0; offset < appIds.length; offset += STORE_ITEMS_BATCH_SIZE) {
      const batch = appIds.slice(offset, offset + STORE_ITEMS_BATCH_SIZE);
      reportProgress({ completed: offset, total: appIds.length, games: gamesById.size });
      try {
        const items = await fetchStoreItems(batch);
        const returnedIds = new Set((items?.response?.store_items ?? []).map((item) => String(item?.appid ?? '')).filter(Boolean));
        for (const appId of batch) if (!returnedIds.has(appId)) unresolvedApps.push({ appId, status: 'not returned by Steam' });
        for (const game of gamesFromStoreItems(items, new Set(batch))) gamesById.set(game.providerItemId, game);
      } catch (error) {
        unresolvedApps.push(...batch.map((appId) => ({ appId, status: error.message })));
      }
      reportProgress({ completed: offset + batch.length, total: appIds.length, games: gamesById.size });
      if (offset + STORE_ITEMS_BATCH_SIZE < appIds.length) await wait(BETWEEN_BATCHES_MS);
    }
    if (!gamesById.size) throw new Error('Steam returned owned apps but no game titles. Please try again later.');
    return { items: [...gamesById.values()], unresolvedApps };
  }

  global.GalacticSteamStore = { ownedAppIdsFromDynamicStore, gamesFromStoreItems, fetchOwnedSteamGames };
}(globalThis));
