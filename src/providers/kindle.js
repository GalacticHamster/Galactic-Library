/* Kindle importer. It calls the same Content & Devices library endpoint used
 * by a signed-in Amazon tab. It never handles a password, cookie, or token. */
(function attachKindleImporter(global) {
  'use strict';

  const PAGE_SIZE = 100;
  const MAX_PAGES = 500;
  const BETWEEN_PAGES_MS = 300;
  const ORIGIN_TYPES = [
    'Purchase', 'PublicLibraryLending', 'PersonalLending', 'Sample',
    'ComicsUnlimited', 'KOLL', 'RFFLending', 'Pottermore', 'Prime',
    'Rental', 'DeviceRegistration', 'FreeTrial', 'KindleUnlimited', 'Comixology'
  ];
  const LIBRARY_CATEGORIES = [
    { id: 'books', contentType: 'Ebook', contentCategoryReference: 'booksAll', includesOriginTypes: true },
    { id: 'personal-documents', contentType: 'KindlePDoc', contentCategoryReference: 'pdocs', includesOriginTypes: false, itemStatusList: ['Active'] }
  ];

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function decodeHtml(value) {
    const text = compactText(value);
    if (!text) return '';
    if (!global.document) return text.replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#39;/gu, "'");
    const element = global.document.createElement('textarea');
    element.innerHTML = text;
    return compactText(element.value);
  }

  function stringValues(value) {
    if (Array.isArray(value)) return value.flatMap(stringValues).filter(Boolean);
    if (value && typeof value === 'object') return stringValues(value.name ?? value.title ?? value.value);
    const text = decodeHtml(value);
    return text ? [text] : [];
  }

  function firstText(...values) {
    for (const value of values) {
      const text = compactText(value);
      if (text) return decodeHtml(text);
    }
    return '';
  }

  function acquiredAtFromValue(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const numericValue = Number(value);
    const date = Number.isFinite(numericValue)
      ? new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue)
      : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function ownershipFromOriginType(originType) {
    const origin = compactText(originType).toLocaleLowerCase();
    if (origin === 'purchase') return 'owned';
    if (origin === 'rental') return 'rental';
    if (/(publiclibrarylending|personallending|rfflending)/u.test(origin)) return 'borrowed';
    if (/(kindleunlimited|comicsunlimited|prime|koll|freetrial)/u.test(origin)) return 'subscription';
    // Comixology records need purchase evidence before they can be treated as owned.
    return 'unknown';
  }

  function kindleItemFromOwnershipItem(item, origin = global.location?.origin ?? 'https://www.amazon.com', libraryCategory = 'books') {
    const providerItemId = compactText(item?.asin ?? item?.contentId ?? item?.id).toUpperCase();
    const title = decodeHtml(item?.title);
    if (!providerItemId || !title) return null;
    const originType = firstText(item?.originType, item?.ownershipType, item?.sourceType);
    const contentType = firstText(item?.contentType, item?.contentTypeName, item?.type);
    const itemStatus = firstText(item?.itemStatus, item?.status);
    const publisher = firstText(item?.publisher, item?.publisherName);
    const publicationDate = firstText(item?.publicationDate, item?.publishedDate, item?.publication_date);
    const format = firstText(item?.format, item?.fileFormat, item?.fileExtension);
    return {
      providerItemId,
      title,
      mediaType: 'book',
      ownership: ownershipFromOriginType(originType),
      acquiredAt: acquiredAtFromValue(item?.acquiredDate ?? item?.acquisitionDate ?? item?.dateAcquired ?? item?.purchaseDate),
      metadata: {
        source: 'amazon-kindle-content-library',
        detailUrl: libraryCategory === 'books' ? `${origin}/dp/${encodeURIComponent(providerItemId)}` : '',
        libraryCategory,
        authors: stringValues(item?.authors ?? item?.author),
        series: stringValues(item?.series ?? item?.seriesName),
        collections: stringValues(item?.collections ?? item?.collectionNames ?? item?.collection),
        originType,
        contentType,
        itemStatus,
        publisher,
        publicationDate,
        format
      }
    };
  }

  function kindleItemEntriesFromOwnershipItems(items, origin, libraryCategory) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => kindleItemFromOwnershipItem(item, origin, libraryCategory)).filter(Boolean);
  }

  function kindleItemsFromOwnershipResponse(response, origin, libraryCategory) {
    const entries = kindleItemEntriesFromOwnershipItems(ownershipItemsFromResponse(response), origin, libraryCategory);
    const itemsById = new Map();
    for (const item of entries) itemsById.set(item.providerItemId, item);
    return [...itemsById.values()];
  }

  function newKindleItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => compactText(id).toUpperCase()).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(compactText(item?.providerItemId).toUpperCase()));
  }

  function explicitCollectsStatement(value) {
    const text = compactText(value);
    const match = text.match(/\bcollects?\b\s*(?::|-)?\s*[^.!?]{2,700}(?:[.!?]|$)/iu);
    return compactText(match?.[0]).replace(/[.!?]+$/u, '');
  }

  function kindleCollectsStatementFromDocument(document) {
    const selectors = [
      '#bookDescription_feature_div', '#productDescription', '#featurebullets_feature_div',
      '#productOverview_feature_div', '[data-feature-name="bookDescription"]'
    ];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const statement = explicitCollectsStatement(element.textContent);
        if (statement) return statement;
      }
    }
    return '';
  }

  async function fetchKindleProductComicContents(detailUrl) {
    const url = new URL(detailUrl, global.location?.origin ?? 'https://www.amazon.com');
    if (url.origin !== (global.location?.origin ?? 'https://www.amazon.com') || !/^\/dp\//u.test(url.pathname)) throw new Error('Kindle did not provide a usable Amazon product-page URL.');
    const response = await fetch(url.toString(), { credentials: 'include', cache: 'no-store' });
    // Older Comixology/Comics Unlimited entitlements can remain in a Kindle
    // library after Amazon removes their public retail listing. That is a
    // permanent "no page to inspect" result, not a transient import failure.
    if (response.status === 404) return { sourceUrl: `${url.origin}${url.pathname}`, statement: '', availability: 'unavailable' };
    if (!response.ok) throw new Error(`Amazon returned ${response.status} while loading a Kindle product page.`);
    const document = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (document.querySelector('#captchacharacters, form[action*="validateCaptcha" i]')) throw new Error('Amazon requested a CAPTCHA; wait before continuing the Kindle contents scan.');
    return { sourceUrl: `${url.origin}${url.pathname}`, statement: kindleCollectsStatementFromDocument(document), availability: 'available' };
  }

  function ownershipItemsFromResponse(response) {
    const items = response?.GetContentOwnershipData?.items ?? response?.items ?? [];
    return Array.isArray(items) ? items : [];
  }

  function csrfTokenFromDocument(document) {
    const input = document.querySelector('[name="csrfToken"], [name="csrf-token"], input[data-csrf-token]');
    const fromInput = compactText(input?.value ?? input?.getAttribute('data-csrf-token'));
    if (fromInput) return fromInput;
    const scripts = [...document.scripts].map((script) => script.textContent ?? '').join('\n');
    return scripts.match(/(?:csrfToken|csrf-token)\s*[:=]\s*["']([^"']+)["']/u)?.[1] ?? '';
  }

  async function fetchKindleLibraryPage(startIndex, csrfToken, category) {
    const activityInput = {
      // Household-shared content is readable access, not proof of purchase.
      showSharedContent: false,
      fetchCriteria: { sortOrder: 'DESCENDING', sortIndex: 'DATE', startIndex, batchSize: PAGE_SIZE, totalContentCount: -1 },
      surfaceType: 'LargeDesktop',
      contentType: category.contentType,
      contentCategoryReference: category.contentCategoryReference,
      ...(category.itemStatusList ? { itemStatusList: category.itemStatusList } : {}),
      ...(category.includesOriginTypes ? { originTypes: ORIGIN_TYPES } : {})
    };
    const body = new URLSearchParams({
      activity: 'GetContentOwnershipData',
      activityInput: JSON.stringify(activityInput),
      csrfToken
    });
    const response = await fetch('/hz/mycd/digital-console/ajax', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      credentials: 'include',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Amazon returned ${response.status} while loading your Kindle library. Confirm that you are signed in.`);
    const payload = await response.json().catch(() => null);
    if (!payload?.success || !payload?.GetContentOwnershipData) {
      throw new Error('Amazon returned an unreadable Kindle library response. Open Manage Your Content and Devices, then try again.');
    }
    return payload;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function fetchKindleBooks(reportProgress = () => {}, knownItemIds = null) {
    const csrfToken = csrfTokenFromDocument(global.document);
    if (!csrfToken) throw new Error('Amazon did not expose the library page token. Open Manage Your Content and Devices, wait for it to finish loading, then try again.');
    const booksById = new Map();
    const incremental = Array.isArray(knownItemIds);
    const categoryCounts = Object.fromEntries(LIBRARY_CATEGORIES.map((category) => [category.id, 0]));
    const diagnostics = Object.fromEntries(LIBRARY_CATEGORIES.map((category) => [category.id, {
      reportedCount: null, rawCount: 0, readableCount: 0, duplicateCount: 0
    }]));
    let pagesRead = 0;
    for (const category of LIBRARY_CATEGORIES) {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        reportProgress({ pagesRead, books: booksById.size, categoryCounts });
        const payload = await fetchKindleLibraryPage(page * PAGE_SIZE, csrfToken, category);
        const rawItems = ownershipItemsFromResponse(payload);
        const readableItems = kindleItemEntriesFromOwnershipItems(rawItems, global.location?.origin, category.id);
        const pageBooks = kindleItemsFromOwnershipResponse(payload, global.location?.origin, category.id);
        const reportedCount = Number(payload.GetContentOwnershipData.numberOfItems);
        const diagnostic = diagnostics[category.id];
        diagnostic.reportedCount = Number.isFinite(reportedCount) ? reportedCount : diagnostic.reportedCount;
        diagnostic.rawCount += rawItems.length;
        diagnostic.readableCount += readableItems.length;
        diagnostic.duplicateCount += readableItems.length - pageBooks.length;
        if (!pageBooks.length) break;
        const booksToSave = incremental ? newKindleItems(pageBooks, knownItemIds) : pageBooks;
        for (const book of booksToSave) {
          if (!booksById.has(book.providerItemId)) {
            categoryCounts[category.id] += 1;
          }
          else diagnostic.duplicateCount += 1;
          booksById.set(book.providerItemId, book);
        }
        pagesRead += 1;
        reportProgress({ pagesRead, books: booksById.size, categoryCounts });
        // Amazon returns this endpoint newest first. Once a whole page is
        // already in the local full baseline, older pages cannot add a new
        // entitlement. Full rescan remains available for reconciliation.
        if (incremental && booksToSave.length === 0) break;
        const reachedReportedEnd = Number.isFinite(reportedCount) && (page + 1) * PAGE_SIZE >= reportedCount;
        const reachedUnreportedEnd = !Number.isFinite(reportedCount) && rawItems.length < PAGE_SIZE;
        if (rawItems.length === 0 || reachedReportedEnd || reachedUnreportedEnd) break;
        await wait(BETWEEN_PAGES_MS);
      }
    }
    if (!booksById.size && !incremental) throw new Error('Amazon returned no readable Kindle books. Please try again later.');
    return { items: [...booksById.values()], diagnostics };
  }

  global.GalacticKindle = { kindleItemsFromOwnershipResponse, kindleItemFromOwnershipItem, ownershipFromOriginType, newKindleItems, explicitCollectsStatement, kindleCollectsStatementFromDocument, fetchKindleProductComicContents, fetchKindleBooks };
}(globalThis));
