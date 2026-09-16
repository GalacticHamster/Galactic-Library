/* Epic Games Store importer. It runs only after a user selects sync in an
 * already signed-in Epic Store tab; passwords, cookies, and tokens are never
 * read, copied, or stored by this extension. */
(function attachEpicImporter(global) {
  'use strict';

  const USER_LIBRARY_QUERY = `query getUserLibrary($cursor: String, $locale: String) {
    Library {
      libraryItems(cursor: $cursor, params: {includeMetadata: true}) {
        records {
          catalogItemId
          namespace
          sandboxType
          product { supportedTypes }
          catalogItem(locale: $locale) {
            id
            title
            categories { path }
            mainGameItem { id }
            releaseInfo { platform }
          }
        }
        responseMetadata { nextCursor }
      }
    }
  }`;

  function platformsFromRecord(record) {
    const releaseInfo = Array.isArray(record?.catalogItem?.releaseInfo) ? record.catalogItem.releaseInfo : [];
    return [...new Set(releaseInfo.map((item) => String(item?.platform ?? '').trim().toLowerCase()).filter(Boolean))];
  }

  function epicItemsFromLibraryPage(value) {
    const items = [];
    const skipped = [];
    const records = value?.data?.Library?.libraryItems?.records ?? value?.Library?.libraryItems?.records ?? [];
    for (const record of records) {
      const providerItemId = String(record?.catalogItem?.id ?? record?.catalogItemId ?? '').trim();
      const title = String(record?.catalogItem?.title ?? '').replace(/\s+/gu, ' ').trim();
      const parentProviderItemId = String(record?.catalogItem?.mainGameItem?.id ?? '').trim();
      const supportedTypes = (Array.isArray(record?.product?.supportedTypes) ? record.product.supportedTypes : []).map((type) => String(type).toUpperCase());
      const categoryPaths = (Array.isArray(record?.catalogItem?.categories) ? record.catalogItem.categories : [])
        .map((category) => String(category?.path ?? '').toLowerCase())
        .filter(Boolean);
      // Unreal Engine assets and private/testing entries are not Epic Games
      // Store games. Other unknown items stay out of the game count unless
      // Epic identifies them as a game or an add-on for a main game.
      if (!providerItemId || !title || record?.namespace === 'ue' || record?.sandboxType === 'PRIVATE') {
        skipped.push(providerItemId || '(missing ID)');
        continue;
      }
      const hasGameCategory = categoryPaths.some((path) => path === 'games' || path.startsWith('games/') || path === 'bundles/games');
      const isAddOn = Boolean(parentProviderItemId) || supportedTypes.includes('DLC') || categoryPaths.some((path) => path.includes('/dlc'));
      const hasExplicitNonGameType = supportedTypes.length > 0 && !supportedTypes.includes('GAME') && !supportedTypes.includes('DLC');
      // Some current Epic library records omit supportedTypes even for normal
      // games. A public catalog record with a title is then a safer fallback
      // than dropping the entire owned library; known non-game sources above
      // remain excluded.
      const isGame = supportedTypes.includes('GAME') || hasGameCategory || supportedTypes.length === 0;
      if (!isAddOn && (!isGame || hasExplicitNonGameType && !hasGameCategory)) {
        skipped.push(providerItemId);
        continue;
      }
      items.push({
        providerItemId,
        title,
        mediaType: isAddOn ? 'game-addon' : 'game',
        ownership: 'owned',
        platform: platformsFromRecord(record),
        metadata: {
          source: 'epic-store-library',
          ...(isAddOn ? { parentProviderItemId } : {})
        }
      });
    }
    return { items, skipped };
  }

  function nextCursorFromPage(value) {
    return value?.data?.Library?.libraryItems?.responseMetadata?.nextCursor
      ?? value?.Library?.libraryItems?.responseMetadata?.nextCursor
      ?? null;
  }

  async function fetchLibraryPage(cursor) {
    const response = await fetch('/graphql', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ operationName: 'getUserLibrary', query: USER_LIBRARY_QUERY, variables: { cursor, locale: 'en-US' } })
    });
    if (!response.ok) throw new Error(`Epic Games Store returned ${response.status} while loading your library. Confirm that you are signed in.`);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error('Epic Games Store returned an unreadable library response. Confirm that you are signed in.');
    }
    if (Array.isArray(body?.errors) && body.errors.length) throw new Error(`Epic Games Store could not read the library: ${body.errors[0]?.message ?? 'unknown error'}`);
    return body;
  }

  async function fetchEpicGames(reportProgress = () => {}) {
    const itemsById = new Map();
    const skippedIds = new Set();
    const seenCursors = new Set();
    let cursor = null;
    let pagesRead = 0;
    do {
      if (cursor && seenCursors.has(cursor)) throw new Error('Epic Games Store repeated a library page. Please try again later.');
      if (cursor) seenCursors.add(cursor);
      reportProgress({ pagesRead, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      const page = await fetchLibraryPage(cursor);
      const { items, skipped } = epicItemsFromLibraryPage(page);
      for (const item of items) itemsById.set(item.providerItemId, item);
      for (const id of skipped) skippedIds.add(id);
      pagesRead += 1;
      reportProgress({ pagesRead, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      cursor = nextCursorFromPage(page);
    } while (cursor);
    if (![...itemsById.values()].some((item) => item.mediaType === 'game')) throw new Error('Epic Games Store returned no readable games. Confirm that this signed-in account has games in its library.');
    return { items: [...itemsById.values()], skippedCount: skippedIds.size };
  }

  global.GalacticEpic = { epicItemsFromLibraryPage, nextCursorFromPage, fetchEpicGames };
}(globalThis));
