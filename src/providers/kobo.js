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
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  }

  async function fetchKoboLinkedSection(itemsById, reportProgress, rootDocument, linkLabel, librarySection) {
    const sectionLink = librarySectionLinkFromDocument(rootDocument, linkLabel);
    if (!sectionLink) return { pagesRead: 0, available: false, document: null };
    let url = absoluteUrl(sectionLink.getAttribute('href'));
    if (!url) return { pagesRead: 0, available: false, document: null };
    const seenUrls = new Set();
    let pagesRead = 0;
    let firstDocument = null;
    while (url && !seenUrls.has(url) && pagesRead < MAX_PAGES) {
      seenUrls.add(url);
      const document = await fetchLibraryDocument(url);
      if (!firstDocument) firstDocument = document;
      addItems(itemsById, koboItemsFromDocument(document), librarySection);
      pagesRead += 1;
      reportCounts(itemsById, reportProgress, { pagesRead: null, sectionPagesRead: pagesRead, section: linkLabel });
      const next = nextPageControl(document);
      url = next?.tagName === 'A' ? absoluteUrl(next.getAttribute('href')) : '';
    }
    return { pagesRead, available: true, document: firstDocument };
  }

  async function fetchKoboLibrary(reportProgress = () => {}) {
    const itemsById = new Map();
    const initialUrl = new URL(global.location.href);
    initialUrl.searchParams.set('pageNumber', '1');
    const firstDocument = await fetchLibraryDocument(initialUrl.toString());
    const totalPages = Math.min(MAX_PAGES, pageCountFromDocument(firstDocument));
    for (let page = 1; page <= totalPages; page += 1) {
      const pageUrl = new URL(initialUrl);
      pageUrl.searchParams.set('pageNumber', String(page));
      const document = page === 1 ? firstDocument : await fetchLibraryDocument(pageUrl.toString());
      addItems(itemsById, koboItemsFromDocument(document), 'my-books');
      reportCounts(itemsById, reportProgress, { pagesRead: page, archivePagesRead: 0, section: 'My Books' });
    }
    if (!itemsById.size) {
      throw new Error('Kobo showed no readable book or audiobook cards. Open My Books, wait for the library to load, then try again.');
    }
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
      audiobookAvailable: audiobooks.available
    };
  }

  global.GalacticKobo = { koboItemIdFromValue, koboItemFromCardData, koboItemsFromDocument, fetchKoboLibrary };
}(globalThis));
