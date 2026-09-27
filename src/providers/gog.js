/* GOG importer. It makes user-initiated requests from a tab where the user is
 * already signed in; no password, cookie copying, or OAuth token is handled. */
(function attachGogImporter(global) {
  'use strict';

  function gogItemsFromProducts(value) {
    const items = [];
    for (const product of value?.products ?? []) {
      const providerItemId = String(product?.id ?? '').trim();
      const title = String(product?.title ?? '').replace(/\s+/gu, ' ').trim();
      // The games endpoint can also include atypical account entries. Do not
      // import movies or entries GOG does not identify as games.
      if (!/^\d+$/u.test(providerItemId) || !title || product?.isMovie || product?.isGame === false) continue;
      const platform = Object.entries(product?.worksOn ?? {})
        .filter(([, supported]) => Boolean(supported))
        .map(([name]) => name.toLowerCase());
      items.push({
        providerItemId,
        title,
        mediaType: 'game',
        ownership: 'owned',
        platform,
        metadata: { source: 'gog-account-library' }
      });
    }
    return items;
  }

  function pageCount(value) {
    const parsed = Number(value?.totalPages);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  function newGogItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => String(id ?? '').trim()).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(String(item?.providerItemId ?? '').trim()));
  }

  async function fetchLibraryPage(hiddenFlag, page) {
    const parameters = new URLSearchParams({
      mediaType: '1',
      hiddenFlag: String(hiddenFlag),
      isUpdated: '0',
      page: String(page),
      sortBy: 'date_purchased'
    });
    const response = await fetch(`/account/getFilteredProducts?${parameters}`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`GOG returned ${response.status} while loading your library. Confirm that you are signed in to GOG.`);
    try {
      return await response.json();
    } catch {
      throw new Error('GOG returned an unreadable library response. Confirm that you are signed in to GOG.');
    }
  }

  async function fetchGogGames(reportProgress = () => {}, knownItemIds = null) {
    const itemsById = new Map();
    const incremental = Array.isArray(knownItemIds);
    let pagesRead = 0;
    let pagesExpected = 0;
    const fetchPageSet = async (hiddenFlag) => {
      let page = 1;
      let totalPages = 1;
      let hasHiddenProducts = false;
      do {
        reportProgress({ pagesRead, pagesExpected: Math.max(pagesExpected, pagesRead + 1), games: itemsById.size, hidden: Boolean(hiddenFlag) });
        const response = await fetchLibraryPage(hiddenFlag, page);
        totalPages = pageCount(response);
        if (page === 1) {
          pagesExpected += totalPages;
          hasHiddenProducts = Boolean(response?.hasHiddenProducts);
        }
        const pageItems = gogItemsFromProducts(response);
        const itemsToSave = incremental ? newGogItems(pageItems, knownItemIds) : pageItems;
        for (const item of itemsToSave) itemsById.set(item.providerItemId, item);
        pagesRead += 1;
        reportProgress({ pagesRead, pagesExpected, games: itemsById.size, hidden: Boolean(hiddenFlag) });
        // GOG's purchase-date order is newest first. Once an entire
        // readable page is known, older pages cannot add a new entitlement.
        if (incremental && pageItems.length && !itemsToSave.length) break;
        page += 1;
      } while (page <= totalPages);
      return { hasHiddenProducts };
    };

    // GOG's normal library response tells us whether a second hidden-products
    // pass is necessary. Keep it user-initiated and do not assume hidden games
    // should be omitted from an ownership library.
    const normalLibrary = await fetchPageSet(0);
    if (normalLibrary.hasHiddenProducts) await fetchPageSet(1);
    if (!itemsById.size && !incremental) throw new Error('GOG returned no readable games. Confirm that this signed-in account has games in its library.');
    return { items: [...itemsById.values()] };
  }

  global.GalacticGog = { gogItemsFromProducts, newGogItems, pageCount, fetchGogGames };
}(globalThis));
