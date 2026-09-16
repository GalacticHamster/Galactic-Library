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

  async function fetchLibraryPage(hiddenFlag, page) {
    const parameters = new URLSearchParams({
      mediaType: '1',
      hiddenFlag: String(hiddenFlag),
      isUpdated: '0',
      page: String(page),
      sortBy: 'title'
    });
    const response = await fetch(`/account/getFilteredProducts?${parameters}`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`GOG returned ${response.status} while loading your library. Confirm that you are signed in to GOG.`);
    try {
      return await response.json();
    } catch {
      throw new Error('GOG returned an unreadable library response. Confirm that you are signed in to GOG.');
    }
  }

  async function fetchGogGames(reportProgress = () => {}) {
    const itemsById = new Map();
    let pagesRead = 0;
    let pagesExpected = 0;
    const fetchPageSet = async (hiddenFlag) => {
      let page = 1;
      let totalPages = 1;
      do {
        reportProgress({ pagesRead, pagesExpected: Math.max(pagesExpected, pagesRead + 1), games: itemsById.size, hidden: Boolean(hiddenFlag) });
        const response = await fetchLibraryPage(hiddenFlag, page);
        totalPages = pageCount(response);
        if (page === 1) pagesExpected += totalPages;
        for (const item of gogItemsFromProducts(response)) itemsById.set(item.providerItemId, item);
        pagesRead += 1;
        reportProgress({ pagesRead, pagesExpected, games: itemsById.size, hidden: Boolean(hiddenFlag) });
        page += 1;
      } while (page <= totalPages);
    };

    // GOG's normal library response tells us whether a second hidden-products
    // pass is necessary. Keep it user-initiated and do not assume hidden games
    // should be omitted from an ownership library.
    let responseHasHiddenProducts = false;
    let page = 1;
    let totalPages = 1;
    do {
      reportProgress({ pagesRead, pagesExpected: Math.max(pagesExpected, pagesRead + 1), games: itemsById.size, hidden: false });
      const response = await fetchLibraryPage(0, page);
      totalPages = pageCount(response);
      if (page === 1) {
        pagesExpected += totalPages;
        responseHasHiddenProducts = Boolean(response?.hasHiddenProducts);
      }
      for (const item of gogItemsFromProducts(response)) itemsById.set(item.providerItemId, item);
      pagesRead += 1;
      reportProgress({ pagesRead, pagesExpected, games: itemsById.size, hidden: false });
      page += 1;
    } while (page <= totalPages);

    if (responseHasHiddenProducts) await fetchPageSet(1);
    if (!itemsById.size) throw new Error('GOG returned no readable games. Confirm that this signed-in account has games in its library.');
    return { items: [...itemsById.values()] };
  }

  global.GalacticGog = { gogItemsFromProducts, pageCount, fetchGogGames };
}(globalThis));
