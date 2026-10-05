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
        ...(global.GalacticProviderMetadata?.extract(item) ?? {}),
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
    const match = text.match(/\bcollects?\b\s*(?::|-)?\s*.{2,700}/iu);
    const statement=compactText(match?.[0]);
    for(const boundary of statement.matchAll(/[.!?](?=\s+[A-Z])/gu)){
      const before=statement.slice(0,boundary.index);
      if(boundary[0]==='.'&&(/\b(?:vols?|no|nos|ed|pt|pts|mr|mrs|dr|st|vs)$/iu.test(before)||/\b(?:[A-Z]\.)*[A-Z]$/u.test(before)))continue;
      return statement.slice(0,boundary.index).trim();
    }
    return statement.replace(/[.!?]+$/u, '');
  }

  const contentsExtractorVersion = 3;
  function explicitContentsStatement(value) {
    const text = compactText(value);
    const match = text.match(/\b(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b\s*(?::|-)?\s*.{2,10000}/iu);
    if (!match) return '';
    const statement = match[0];
    for (const boundary of statement.matchAll(/[.!?](?=\s+[A-Z])|(?<=\d)[.!?](?=[A-Z])/gu)) {
      const before = statement.slice(0,boundary.index);
      if (boundary[0] === '.' && (/\b(?:vols?|no|nos|ed|pt|pts|mr|mrs|ms|sgt|gen|ft|dr|st|vs)$/iu.test(before) || /\b(?:[A-Z]\.)*[A-Z]$/u.test(before))) continue;
      if(boundary[0]!=='.' && !/^\s+(?:a|the|more|also|read|this)\b/iu.test(statement.slice(boundary.index+1)))continue;
      return statement.slice(0,boundary.index).trim();
    }
    return statement.replace(/[.!?]+$/u,'');
  }

  function kindleContentsStatementFromDocument(document) {
    for (const selector of ['#bookDescription_feature_div','#productDescription','#featurebullets_feature_div','#productOverview_feature_div','[data-feature-name="bookDescription"]']) {
      for (const element of document.querySelectorAll(selector)) {
        const statement = explicitContentsStatement(element.textContent);
        if (statement) return statement;
      }
    }
    return '';
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

  async function fetchKindleProductComicContents(detailUrl, {signal,timing} = {}) {
    const url = new URL(detailUrl, global.location?.origin ?? 'https://www.amazon.com');
    if (url.origin !== (global.location?.origin ?? 'https://www.amazon.com') || !/^\/dp\//u.test(url.pathname)) throw new Error('Kindle did not provide a usable Amazon product-page URL.');
    const headersEnd=timing?.begin('fetch_headers',timing.attempts);
    let response;try{response=await fetch(url.toString(), { credentials: 'include', cache: 'no-store', signal });}finally{headersEnd?.();}
    // Older Comixology/Comics Unlimited entitlements can remain in a Kindle
    // library after Amazon removes their public retail listing. That is a
    // "no page to inspect" result for this lookup; an explicit rescan can revisit it.
    if (response.status === 404) return { sourceUrl: `${url.origin}${url.pathname}`, statement: '', availability: 'unavailable', extractorVersion:contentsExtractorVersion };
    if (!response.ok) throw new Error(`Amazon returned ${response.status} while loading a Kindle product page.`);
    const bodyEnd=timing?.begin('response_body',timing.attempts);
    let body;try{body=await response.text();}finally{bodyEnd?.();}
    const domEnd=timing?.begin('dom_parse',timing.attempts);
    let document;try{document=new DOMParser().parseFromString(body, 'text/html');}finally{domEnd?.();}
    const checksEnd=timing?.begin('page_checks',timing.attempts);
    try{
    if (document.querySelector('#captchacharacters, form[action*="validateCaptcha" i]')) throw new Error('Amazon requested a CAPTCHA; wait before continuing the Kindle contents scan.');
    if(document.querySelector('#ap_email,form[name="signIn"]'))throw new Error('Sign in again before retrying the Kindle contents lookup.');
    }finally{checksEnd?.();}
    const extractEnd=timing?.begin('extraction',timing.attempts);
    let statement;try{statement=kindleContentsStatementFromDocument(document);}finally{extractEnd?.();}
    return { sourceUrl: `${url.origin}${url.pathname}`, statement, availability: statement?'statement-found':'no-statement', extractorVersion:contentsExtractorVersion };
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
    if (payload?.success !== true || !payload?.GetContentOwnershipData || !Array.isArray(payload.GetContentOwnershipData.items)) {
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
      reportedCount: null, rawCount: 0, readableCount: 0, duplicateCount: 0, pagesRead: 0
    }]));
    let pagesRead = 0;
    for (const category of LIBRARY_CATEGORIES) {
      let finished = false;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        reportProgress({ pagesRead, books: booksById.size, categoryCounts });
        const payload = await fetchKindleLibraryPage(page * PAGE_SIZE, csrfToken, category);
        const rawItems = ownershipItemsFromResponse(payload);
        if (rawItems.some((item) => !item || typeof item.title !== 'string' || !['string', 'number'].includes(typeof (item.asin ?? item.contentId ?? item.id)))) throw new Error(`Amazon returned malformed ${category.id} entries. No library changes were saved.`);
        const readableItems = kindleItemEntriesFromOwnershipItems(rawItems, global.location?.origin, category.id);
        const pageBooks = kindleItemsFromOwnershipResponse(payload, global.location?.origin, category.id);
        const countValue = payload.GetContentOwnershipData.numberOfItems;
        const reportedCount = countValue === undefined || countValue === null || countValue === '' ? null : Number(countValue);
        if (reportedCount !== null && (!Number.isSafeInteger(reportedCount) || reportedCount < 0)) throw new Error(`Amazon returned an invalid ${category.id} item count. No library changes were saved.`);
        const diagnostic = diagnostics[category.id];
        if (page > 0 && reportedCount !== diagnostic.reportedCount) throw new Error(`Amazon changed the ${category.id} total during the scan. Please retry; no library changes were saved.`);
        diagnostic.reportedCount = reportedCount;
        diagnostic.pagesRead += 1;
        if (readableItems.length !== rawItems.length) throw new Error(`Amazon returned unreadable ${category.id} entries. No library changes were saved.`);
        diagnostic.rawCount += rawItems.length;
        diagnostic.readableCount += readableItems.length;
        diagnostic.duplicateCount += readableItems.length - pageBooks.length;
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
        if (incremental && pageBooks.length > 0 && booksToSave.length === 0) { finished = true; break; }
        const reachedReportedEnd = reportedCount !== null && (page + 1) * PAGE_SIZE >= reportedCount;
        const reachedUnreportedEnd = reportedCount === null && rawItems.length < PAGE_SIZE;
        if (rawItems.length === 0 || reachedReportedEnd || reachedUnreportedEnd) {
          if (!incremental && reportedCount !== null && diagnostic.rawCount !== reportedCount) throw new Error(`Amazon reported ${reportedCount} ${category.id} items but returned ${diagnostic.rawCount}. No library changes were saved.`);
          finished = true;
          break;
        }
        await wait(BETWEEN_PAGES_MS);
      }
      if (!finished) throw new Error(`Kindle reached its ${MAX_PAGES}-page limit in ${category.id} before completing the scan. No library changes were saved.`);
    }
    if (!booksById.size && !incremental) throw new Error('Amazon returned no readable Kindle books. Please try again later.');
    const items = [...booksById.values()];
    const snapshot = incremental ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('kindle', items,
      Object.entries(diagnostics).map(([id, detail]) => ({ ...global.GalacticProviderSnapshot.completedScope(id, detail.rawCount, detail.reportedCount, detail.reportedCount === null ? 'pagination-end' : 'reported-count', detail.pagesRead), duplicateCount: detail.duplicateCount })));
    return { items, diagnostics, snapshot };
  }

  global.GalacticKindle = { kindleItemsFromOwnershipResponse, kindleItemFromOwnershipItem, ownershipFromOriginType, newKindleItems, explicitCollectsStatement, kindleCollectsStatementFromDocument, explicitContentsStatement, kindleContentsStatementFromDocument, contentsExtractorVersion, fetchKindleProductComicContents, fetchKindleBooks };
}(globalThis));
