/* Audible importer. It reads only the paginated library pages available in an
 * already signed-in Audible tab. It never handles a password, cookie, token,
 * or Audible device authorization. */
(function attachAudibleImporter(global) {
  'use strict';

  const PAGE_SIZE = 50;
  const MAX_PAGES = 500;
  const BETWEEN_PAGES_MS = 250;

  function textOf(element) {
    return String(element?.getAttribute?.('aria-label') ?? element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  }

  function audibleItemIdFromUrl(value) {
    try {
      const url = new URL(value, global.location?.origin ?? 'https://www.audible.com');
      const asin = url.pathname.match(/\/([A-Z0-9]{10})(?:\/|$)/iu)?.[1];
      return asin ? asin.toUpperCase() : url.pathname.replace(/^\/+|\/+$/gu, '');
    } catch {
      return '';
    }
  }

  function audibleItemFromLibraryEntry(entry) {
    let detailUrl;
    try {
      const url = new URL(entry?.url, global.location?.origin ?? 'https://www.audible.com');
      detailUrl = `${url.origin}${url.pathname}`;
    } catch {
      detailUrl = '';
    }
    const providerItemId = audibleItemIdFromUrl(detailUrl);
    const title = String(entry?.title ?? '').replace(/\s+/gu, ' ').trim();
    if (!providerItemId || !title) return null;
    return {
      providerItemId,
      title,
      mediaType: 'audiobook',
      ownership: entry?.ownership === 'subscription' ? 'subscription' : 'unknown',
      metadata: {
        ...(global.GalacticProviderMetadata?.extract(entry) ?? {}),
        source: 'audible-library-page',
        detailUrl,
        authors: Array.isArray(entry.authors) ? entry.authors.filter(Boolean) : [],
        narrators: Array.isArray(entry.narrators) ? entry.narrators.filter(Boolean) : [],
        series: Array.isArray(entry.series) ? entry.series.filter(Boolean) : [],
        libraryAction: String(entry?.libraryAction ?? '')
      }
    };
  }

  function ownershipFromLibraryAction(actionText) {
    return /\bremove\b/iu.test(String(actionText ?? '')) ? 'subscription' : 'unknown';
  }

  function newAudibleItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => String(id).trim().toUpperCase()).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(String(item?.providerItemId ?? '').trim().toUpperCase()));
  }

  function libraryActionFromContainer(container) {
    return [...container.querySelectorAll('button, [role="button"], a')]
      .map((element) => textOf(element))
      .find((text) => /\bremove\b/iu.test(text)) ?? '';
  }

  function namedLinks(container, selector) {
    return [...container.querySelectorAll(selector)]
      .map((element) => textOf(element))
      .filter((name, index, values) => name.length > 1 && values.indexOf(name) === index);
  }

  function entriesFromLibraryDocument(document) {
    const links = [...document.querySelectorAll('a[href*="/pd/"]')];
    const entriesById = new Map();
    for (const link of links) {
      const url = new URL(link.getAttribute('href') ?? '', global.location?.origin ?? 'https://www.audible.com').toString();
      const title = textOf(link);
      const container = link.closest('li, [data-testid*="library"], [class*="library"], [class*="tile"], [class*="item"]') ?? link.parentElement ?? link;
      const libraryAction = libraryActionFromContainer(container);
      const item = audibleItemFromLibraryEntry({
        url,
        title,
        ownership: ownershipFromLibraryAction(libraryAction),
        libraryAction,
        authors: namedLinks(container, 'a[href^="/author/"], a[href*="searchAuthor="], a[href*="libItem_author"]'),
        narrators: namedLinks(container, 'a[href*="searchNarrator="], a[href*="libItem_narrator"]'),
        series: namedLinks(container, 'a[href^="/series/"], a[href*="libItem_series"]')
      });
      if (item) entriesById.set(item.providerItemId, item);
    }
    return [...entriesById.values()];
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function fetchAudibleLibraryPage(page) {
    const url = new URL('/library/titles', location.origin);
    url.searchParams.set('pageSize', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sortBy', 'PURCHASE_DATE.dsc');
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`Audible returned ${response.status} while loading your library. Confirm that you are signed in to Audible.`);
    const document = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!document.querySelector('select[name="sortBy"], .adbl-library-content-row, #library-content, [data-testid="library-titles"]')) throw new Error('Audible returned a page without its library structure. No library changes were saved.');
    const items = entriesFromLibraryDocument(document);
    const readableIds = new Set(items.map((item) => item.providerItemId));
    for (const link of document.querySelectorAll('a[href*="/pd/"]')) {
      const id = audibleItemIdFromUrl(link.getAttribute('href'));
      if (!id || !readableIds.has(id)) throw new Error('Audible returned unreadable library entries. No library changes were saved.');
    }
    const countMatch = String(document.body?.textContent ?? '').match(/\b([\d,]+)\s+(?:titles|audiobooks)\b/iu);
    const expectedCount = countMatch ? Number(countMatch[1].replace(/,/gu, '')) : null;
    const next = [...document.querySelectorAll('a, button')].some((control) => {
      if (control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true' || control.closest('[class*="disabled" i]')) return false;
      const label = `${control.textContent ?? ''} ${control.getAttribute('aria-label') ?? ''} ${control.className ?? ''}`;
      const href = control.getAttribute('href');
      const targetPage = href ? Number(new URL(href, global.location.origin).searchParams.get('page')) : 0;
      return /\bnext\b|pagingNext|pagination-next/iu.test(label) || targetPage > page;
    });
    if (!items.length && expectedCount !== 0) throw new Error('Audible returned an empty or unreadable library page without an explicit zero count. No library changes were saved.');
    return { items, expectedCount, next };
  }

  async function fetchAudibleAudiobooks(reportProgress = () => {}, knownItemIds = null) {
    const itemsById = new Map();
    const incremental = Array.isArray(knownItemIds);
    let finished = false;
    let pagesRead = 0;
    let expectedCount;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      reportProgress({ pagesRead: page - 1, audiobooks: itemsById.size });
      const pageData = await fetchAudibleLibraryPage(page);
      const pageItems = pageData.items;
      if (page > 1 && pageData.expectedCount !== expectedCount) throw new Error('Audible changed its reported library total during the scan. Please retry.');
      expectedCount = pageData.expectedCount;
      pagesRead = page;
      const itemsToSave = incremental ? newAudibleItems(pageItems, knownItemIds) : pageItems;
      let added = 0;
      for (const item of itemsToSave) {
        if (!itemsById.has(item.providerItemId)) added += 1;
        itemsById.set(item.providerItemId, item);
      }
      reportProgress({ pagesRead: page, audiobooks: itemsById.size });
      if (incremental && pageItems.length && !itemsToSave.length) { finished = true; break; }
      if (!pageData.next) { finished = true; break; }
      if (added === 0) throw new Error('Audible repeated a page before the library ended; no library changes were saved.');
      await wait(BETWEEN_PAGES_MS);
    }
    if (!finished) throw new Error(`Audible reached its ${MAX_PAGES}-page limit before the end of the library.`);
    if (!itemsById.size && !incremental) throw new Error('Audible returned no readable library titles. Please try again later.');
    const items = [...itemsById.values()];
    return { items, snapshot: incremental ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('audible', items, [global.GalacticProviderSnapshot.completedScope('library', items.length, expectedCount, 'pagination-end', pagesRead)]) };
  }

  global.GalacticAudible = { audibleItemIdFromUrl, audibleItemFromLibraryEntry, ownershipFromLibraryAction, newAudibleItems, fetchAudibleAudiobooks };
}(globalThis));
