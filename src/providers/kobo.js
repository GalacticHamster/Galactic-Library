/* Kobo importer. It reads only title cards rendered in a signed-in Kobo My
 * Books page. It never emulates an eReader or uses Kobo's device protocol. */
(function attachKoboImporter(global) {
  'use strict';

  const MAX_PAGES = 500;

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function absoluteUrl(value) {
    if (!compactText(value)) return '';
    try {
      const url = new URL(value ?? '', global.location?.origin ?? 'https://www.kobo.com');
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }

  function koboItemIdFromValue(value) {
    const text = String(value ?? '');
    const uuid = text.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/iu)?.[0];
    if (uuid) return uuid.toLowerCase();
    const productId = text.match(/(?:product|book|content)[_/-]?id[=:/]([a-z0-9_-]+)/iu)?.[1];
    if (productId) return productId;
    const route = text.match(/\/(?:ebook|audiobook)\/([^/?#]+)/iu)?.[1];
    return route ? route.toLocaleLowerCase() : '';
  }

  function mediaTypeFromUrlAndText(url, typeText) {
    const text = `${url} ${typeText}`.toLocaleLowerCase();
    if (/\/audiobook\b|\baudio\s*book\b/u.test(text)) return 'audiobook';
    if (/readnow\.kobo\.com\b|\/ebook\b|\/readnow\b|\be[- ]?book\b|\bbook\b/u.test(text)) return 'book';
    return null;
  }

  function stringValues(value) {
    if (Array.isArray(value)) return value.flatMap(stringValues).filter(Boolean);
    if (value && typeof value === 'object') return stringValues(value.name ?? value.title);
    const text = compactText(value);
    return text ? [text] : [];
  }

  function koboItemFromCardData(card) {
    const title = compactText(card?.title);
    const detailUrl = absoluteUrl(card?.detailUrl);
    const providerItemId = koboItemIdFromValue(card?.providerItemId) || koboItemIdFromValue(detailUrl);
    const mediaType = mediaTypeFromUrlAndText(detailUrl, card?.typeText);
    if (!providerItemId || !title || !mediaType) return null;
    return {
      providerItemId,
      title,
      mediaType,
      ownership: 'owned',
      metadata: {
        ...(global.GalacticProviderMetadata?.extract(card) ?? {}),
        source: 'kobo-my-books-library',
        detailUrl,
        imageUrl: absoluteUrl(card?.imageUrl),
        authors: stringValues(card?.authors),
        series: stringValues(card?.series),
        format: mediaType === 'audiobook' ? 'audiobook' : 'ebook'
      }
    };
  }

  function firstText(elements) {
    for (const element of elements) {
      const text = compactText(element?.textContent ?? element?.getAttribute?.('content') ?? element?.getAttribute?.('aria-label'));
      if (text) return text;
    }
    return '';
  }

  function namedTexts(container, selectors) {
    return [...container.querySelectorAll(selectors)]
      .map((element) => compactText(element.textContent ?? element.getAttribute('aria-label')))
      .filter((value, index, values) => value && values.indexOf(value) === index);
  }

  function cardDataFromLink(link) {
    const container = link.closest('[data-book-title], article, li, [data-testid*="book" i], [data-testid*="item" i], [class*="book" i], [class*="tile" i], [class*="item" i]') ?? link.parentElement ?? link;
    const image = container.querySelector('img');
    const title = firstText([
      container.querySelector('[data-testid*="title" i], [class*="title" i], h1, h2, h3, h4'),
      { textContent: container.getAttribute('data-book-title') },
      { textContent: container.getAttribute('data-title') },
      { textContent: image?.getAttribute('alt') },
      { textContent: link.getAttribute('aria-label') }
    ]);
    return {
      providerItemId: container.getAttribute('data-product-id') ?? container.getAttribute('data-content-id') ?? container.getAttribute('data-id') ?? link.getAttribute('data-product-id') ?? link.getAttribute('href'),
      title,
      detailUrl: link.getAttribute('href'),
      imageUrl: image?.currentSrc ?? image?.getAttribute('src'),
      typeText: `${container.getAttribute('data-format') ?? ''} ${container.getAttribute('data-type') ?? ''} ${container.textContent ?? ''}`,
      authors: stringValues(container.getAttribute('data-contributors')).length ? compactText(container.getAttribute('data-contributors')).split(/\s*,\s*/u) : namedTexts(container, '[data-testid*="author" i], [class*="author" i]'),
      series: stringValues(container.getAttribute('data-series-name')).length ? [compactText(container.getAttribute('data-series-name'))] : namedTexts(container, '[data-testid*="series" i], [class*="series" i]')
    };
  }

  function koboItemsFromDocument(document) {
    const readNowLinks = [...document.querySelectorAll('a[data-book-title][href]')];
    // Current Kobo My Books cards each carry a Read Now URL with the stable
    // library UUID. Store-detail links on the same cards are merely another
    // presentation path, not another entitlement.
    const links = readNowLinks.length
      ? readNowLinks
      : [...document.querySelectorAll('a[href*="/ebook/" i], a[href*="/audiobook/" i], a[href*="/ReadNow/" i]')];
    const itemsById = new Map();
    for (const link of links) {
      const item = koboItemFromCardData(cardDataFromLink(link));
      if (item) itemsById.set(item.providerItemId, item);
    }
    return [...itemsById.values()];
  }

  function newKoboItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => compactText(id).toLocaleLowerCase()).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(compactText(item?.providerItemId).toLocaleLowerCase()));
  }

  function nextPageControl(document) {
    const controls = [...document.querySelectorAll('button, a')];
    const enabled = (element) => !element.hasAttribute('disabled')
      && element.getAttribute('aria-disabled') !== 'true'
      && !/(?:^|\s)(?:disabled|is-disabled)(?:\s|$)/u.test(String(element.className ?? ''));
    const isPagerControl = (element) => Boolean(element.closest('[class*="pagination" i], [data-testid*="pagination" i], nav[aria-label*="page" i]'));
    const nextControls = controls.filter((element) => {
      const controlText = [
        element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('rel'),
        element.getAttribute('data-testid'), element.getAttribute('data-test-id'), element.getAttribute('data-page'),
        element.className, element.textContent
      ].map(compactText).join(' ').toLocaleLowerCase();
      return enabled(element) && (element.getAttribute('rel') === 'next' || /\bnext\b|pagination[-_ ]?next/u.test(controlText));
    });
    const next = nextControls.find(isPagerControl) ?? nextControls[0];
    if (next) return next;

    // Some Kobo storefronts render only numbered page buttons. Restrict this
    // fallback to a pager-like ancestor so a number in a title card is never
    // mistaken for navigation.
    const pageControls = controls.flatMap((element) => {
      if (!isPagerControl(element)) return [];
      const number = Number(compactText(element.getAttribute('data-page') ?? element.textContent));
      return Number.isInteger(number) && number > 0 ? [{ element, number }] : [];
    });
    const activePage = pageControls.find(({ element }) => element.getAttribute('aria-current') === 'page' || /(?:^|\s)(?:active|current|selected)(?:\s|$)/u.test(String(element.className ?? '')))?.number;
    const pageParameters = new URL(global.location?.href ?? 'https://www.kobo.com').searchParams;
    const locationPage = Number(pageParameters.get('pageNumber') ?? pageParameters.get('page'));
    const current = activePage ?? (Number.isInteger(locationPage) && locationPage > 0 ? locationPage : 1);
    return pageControls.filter(({ element, number }) => enabled(element) && number > current).sort((left, right) => left.number - right.number)[0]?.element ?? null;
  }

  function pageCountFromDocument(document) {
    const numbers = [...document.querySelectorAll('.page-link, [class*="page-link" i], [data-page]')]
      .map((element) => Number(compactText(element.getAttribute('data-page') ?? element.textContent)))
      .filter((value) => Number.isInteger(value) && value > 0);
    return Math.max(1, ...numbers);
  }

  function librarySectionLinkFromDocument(document, sectionName) {
    return [...document.querySelectorAll('a[href]')].find((element) => {
      const label = compactText(element.getAttribute('aria-label') ?? element.textContent).toLocaleLowerCase();
      return label === sectionName.toLocaleLowerCase() && !element.closest('article, [class*="book" i], [class*="tile" i], [class*="item" i]');
    }) ?? null;
  }

  function addItems(itemsById, pageItems, librarySection) {
    for (const item of pageItems) {
      itemsById.set(item.providerItemId, {
        ...item,
        metadata: { ...item.metadata, librarySection }
      });
    }
  }

  function reportCounts(itemsById, reportProgress, progress) {
    const books = [...itemsById.values()].filter((item) => item.mediaType === 'book').length;
    const audiobooks = itemsById.size - books;
    reportProgress({ ...progress, books, audiobooks });
  }

  async function fetchLibraryDocument(url) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`Kobo returned ${response.status} while loading your Archive.`);
    const document = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!document.querySelector('.filter-btn, [data-kobo-sort], a[data-book-title]') && !/\b(?:no books|no audiobooks|archive is empty|no items)\b/iu.test(document.body?.textContent ?? '')) throw new Error('Kobo returned a page without readable library structure. No library changes were saved.');
    for (const link of document.querySelectorAll('a[data-book-title][href]')) {
      if (!koboItemFromCardData(cardDataFromLink(link))) throw new Error('Kobo returned an unreadable library card. No library changes were saved.');
    }
    return document;
  }

  function expectedCountFromDocument(document) {
    for (const control of document.querySelectorAll('button, a, h1, h2')) {
      const match = compactText(control.textContent).match(/^All Items\s*\(([\d,]+)\)/iu);
      if (match) return Number(match[1].replace(/,/gu, ''));
    }
    return /\b(?:no books|no audiobooks|archive is empty|no items)\b/iu.test(document.body?.textContent ?? '') ? 0 : null;
  }

  async function fetchKoboLinkedSection(itemsById, reportProgress, rootDocument, linkLabel, librarySection) {
    const sectionLink = librarySectionLinkFromDocument(rootDocument, linkLabel);
    if (!sectionLink) return { pagesRead: 0, available: false, document: null };
    let url = absoluteUrl(sectionLink.getAttribute('href'));
    if (!url) throw new Error(`Kobo exposed an unreadable ${linkLabel} link.`);
    const seenUrls = new Set();
    let pagesRead = 0;
    let firstDocument = null;
    const sectionIds = new Set();
    let expectedCount;
    while (url) {
      if (seenUrls.has(url)) throw new Error(`Kobo repeated a ${linkLabel} page before reaching its end.`);
      if (pagesRead >= MAX_PAGES) throw new Error(`Kobo reached the ${MAX_PAGES}-page limit in ${linkLabel}.`);
      seenUrls.add(url);
      const document = await fetchLibraryDocument(url);
      if (!firstDocument) firstDocument = document;
      const count = expectedCountFromDocument(document);
      if (pagesRead > 0 && count !== expectedCount) throw new Error(`Kobo changed the ${linkLabel} total during the scan.`);
      expectedCount = count;
      const pageItems = koboItemsFromDocument(document);
      if (!pageItems.length && expectedCount !== 0) throw new Error(`Kobo returned an unreadable ${linkLabel} page without an explicit zero count.`);
      if (pageItems.length && pageItems.every((item) => sectionIds.has(item.providerItemId))) throw new Error(`Kobo repeated ${linkLabel} cards before reaching the end.`);
      pageItems.forEach((item) => sectionIds.add(item.providerItemId));
      addItems(itemsById, pageItems, librarySection);
      pagesRead += 1;
      reportCounts(itemsById, reportProgress, { pagesRead: null, sectionPagesRead: pagesRead, section: linkLabel });
      const next = nextPageControl(document);
      if (next && next.tagName !== 'A') throw new Error(`Kobo exposed unsupported ${linkLabel} pagination; the snapshot was kept.`);
      url = next?.tagName === 'A' ? absoluteUrl(next.getAttribute('href')) : '';
      if (next && !url) throw new Error(`Kobo exposed an unreadable ${linkLabel} page link.`);
      if (!next && pagesRead < pageCountFromDocument(document)) throw new Error(`Kobo stopped before the reported last ${linkLabel} page.`);
    }
    return { pagesRead, available: true, document: firstDocument, scope: global.GalacticProviderSnapshot.completedScope(librarySection, sectionIds.size, expectedCount, 'pagination-end', pagesRead) };
  }

  async function fetchKoboLibrary(reportProgress = () => {}, knownItemIds = null) {
    const itemsById = new Map();
    const incremental = Array.isArray(knownItemIds);
    const initialUrl = new URL(global.location.href);
    initialUrl.searchParams.set('pageNumber', '1');
    initialUrl.searchParams.set('sort', 'DateAddedDesc');
    const firstDocument = await fetchLibraryDocument(initialUrl.toString());
    const totalPages = pageCountFromDocument(firstDocument);
    if (totalPages > MAX_PAGES) throw new Error(`Kobo reported ${totalPages} pages, exceeding the ${MAX_PAGES}-page scan limit.`);
    const expectedCount = expectedCountFromDocument(firstDocument);
    const pageSignatures = new Set();
    for (let page = 1; page <= totalPages; page += 1) {
      const pageUrl = new URL(initialUrl);
      pageUrl.searchParams.set('pageNumber', String(page));
      const document = page === 1 ? firstDocument : await fetchLibraryDocument(pageUrl.toString());
      const pageItems = koboItemsFromDocument(document);
      if (expectedCountFromDocument(document) !== expectedCount || pageCountFromDocument(document) > totalPages) throw new Error('Kobo changed its library totals during the scan. Please retry.');
      if (!pageItems.length && (page < totalPages || expectedCount !== 0)) throw new Error('Kobo returned an empty or unreadable library page before completing the scan.');
      const signature = pageItems.map((item) => item.providerItemId).sort().join('|');
      if (pageItems.length && pageSignatures.has(signature)) throw new Error('Kobo repeated a library page before completing the scan.');
      pageSignatures.add(signature);
      const itemsToSave = incremental ? newKoboItems(pageItems, knownItemIds) : pageItems;
      addItems(itemsById, itemsToSave, 'my-books');
      reportCounts(itemsById, reportProgress, { pagesRead: page, archivePagesRead: 0, section: 'My Books' });
      // Kobo explicitly orders this view Date Added descending. A complete
      // known page is therefore a safe quick-update stopping point.
      if (incremental && itemsToSave.length === 0) break;
    }
    if (!itemsById.size) {
      if (incremental) return { items: [], archivePagesRead: 0, archiveAvailable: false, audiobookPagesRead: 0, audiobookAvailable: false, quick: true };
      throw new Error('Kobo showed no readable book or audiobook cards. Open My Books, wait for the library to load, then try again.');
    }
    if (incremental) return { items: [...itemsById.values()], archivePagesRead: 0, archiveAvailable: false, audiobookPagesRead: 0, audiobookAvailable: false, quick: true };
    const scopes = [global.GalacticProviderSnapshot.completedScope('my-books', itemsById.size, expectedCount, 'pagination-end', totalPages)];
    const myBooksArchive = await fetchKoboLinkedSection(itemsById, reportProgress, firstDocument, 'Archive', 'archive');
    const audiobooks = await fetchKoboLinkedSection(itemsById, reportProgress, firstDocument, 'Audiobooks', 'audiobooks');
    const audiobookArchive = audiobooks.document
      ? await fetchKoboLinkedSection(itemsById, reportProgress, audiobooks.document, 'Archive', 'audiobooks-archive')
      : { pagesRead: 0, available: false };
    return {
      items: [...itemsById.values()],
      archivePagesRead: myBooksArchive.pagesRead + audiobookArchive.pagesRead,
      archiveAvailable: myBooksArchive.available || audiobookArchive.available,
      audiobookPagesRead: audiobooks.pagesRead,
      audiobookAvailable: audiobooks.available,
      snapshot: global.GalacticProviderSnapshot.completeProviderSnapshot('kobo', [...itemsById.values()], [...scopes, ...[myBooksArchive, audiobooks, audiobookArchive].flatMap((section) => section.scope ? [section.scope] : [])])
    };
  }

  global.GalacticKobo = { koboItemIdFromValue, koboItemFromCardData, koboItemsFromDocument, newKoboItems, fetchKoboLibrary };
}(globalThis));
