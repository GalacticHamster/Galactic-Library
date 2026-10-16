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

  function newOwnedAppIds(appIds, knownAppIds = []) {
    const known = new Set((Array.isArray(knownAppIds) ? knownAppIds : []).map((id) => String(id).trim()).filter(Boolean));
    return (Array.isArray(appIds) ? appIds : []).filter((appId) => !known.has(String(appId)));
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

  async function fetchOwnedSteamGames(reportProgress = () => {}, knownAppIds = null) {
    const ownedResponse = await fetch('/dynamicstore/userdata/', { credentials: 'same-origin', cache: 'no-store' });
    if (!ownedResponse.ok) throw new Error(`Steam Store returned ${ownedResponse.status} while loading your library. Please wait before retrying; Steam temporarily limits rapid requests.`);
    const account = await ownedResponse.json();
    if (!Array.isArray(account?.rgOwnedApps) || account.rgOwnedApps.some((id) => !/^\d+$/u.test(String(id)))) throw new Error('Steam returned a malformed owned-App-ID list. No library changes were saved.');
    const appIds = ownedAppIdsFromDynamicStore(account);
    if (!appIds.length) throw new Error('Steam Store did not return owned apps. Confirm you are signed in to Steam Store in this tab.');
    const incremental = Array.isArray(knownAppIds);
    const appIdsToResolve = incremental ? newOwnedAppIds(appIds, knownAppIds) : appIds;

    const itemsById = new Map();
    const unresolvedById = new Map(),unsupportedIds=new Set();let failedRequestCount=0;
    for (let offset = 0; offset < appIdsToResolve.length; offset += STORE_ITEMS_BATCH_SIZE) {
      const batch = appIdsToResolve.slice(offset, offset + STORE_ITEMS_BATCH_SIZE);
      reportProgress({ completed: offset, total: appIdsToResolve.length, ownedApps: appIds.length, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      try {
        const items = await fetchStoreItems(batch);
        if (!Array.isArray(items?.response?.store_items)) throw new Error('Steam returned a malformed title-service response.');
        const returnedIds = new Set((items?.response?.store_items ?? []).map((item) => String(item?.appid ?? '')).filter(Boolean));
        for (const appId of batch) if (!returnedIds.has(appId)) unresolvedById.set(appId,{ appId, status: 'not returned by Steam' });
        const parsed = libraryItemsFromStoreItems(items, new Set(batch));
        const parsedIds = new Set(parsed.map((item) => item.providerItemId));
        for (const item of items.response.store_items) {
          const id = String(item?.appid ?? '');
          if (!/^\d+$/u.test(id) || !Number.isInteger(Number(item.type))) throw new Error('Steam returned a malformed catalog entry.');
          if (batch.includes(id) && [0, 4].includes(Number(item.type)) && !parsedIds.has(id)) unresolvedById.set(id,{ appId: id, status: 'unreadable title' });
        }
        for (const item of parsed) itemsById.set(item.providerItemId, item);
        for(const item of items.response.store_items)if(batch.includes(String(item.appid))&&![0,4].includes(Number(item.type)))unsupportedIds.add(String(item.appid));
      } catch (error) {
        if (!incremental) throw new Error(`${error.message} The full Steam snapshot was not replaced.`);
        failedRequestCount++;
        for(const appId of batch)unresolvedById.set(appId,{appId,status:error.message});
      }
      reportProgress({ completed: offset + batch.length, total: appIdsToResolve.length, ownedApps: appIds.length, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      if (offset + STORE_ITEMS_BATCH_SIZE < appIdsToResolve.length) await wait(BETWEEN_BATCHES_MS);
    }
    if (!incremental && ![...itemsById.values()].some((item) => item.mediaType === 'game')) throw new Error('Steam returned owned apps but no game titles. Please try again later.');
    const unresolvedApps=[...unresolvedById.values()];
    if (!incremental && unresolvedApps.length) throw new Error(`Steam could not resolve ${unresolvedApps.length} owned apps. A complete full replacement is unavailable; previous records were kept. Quick update can still add readable new apps.`);
    const items = [...itemsById.values()];
    return { items, unresolvedApps, failedRequestCount,unsupportedAppCount:unsupportedIds.size,ownedAppIds: appIds, newAppCount: appIdsToResolve.length, snapshot: incremental ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('steam', items, [global.GalacticProviderSnapshot.completedScope('library', appIds.length, appIds.length, 'index-complete', Math.max(1, Math.ceil(appIds.length / STORE_ITEMS_BATCH_SIZE)))]) };
  }

  global.GalacticSteamStore = { ownedAppIdsFromDynamicStore, newOwnedAppIds, libraryItemsFromStoreItems, fetchOwnedSteamGames };
}(globalThis));
