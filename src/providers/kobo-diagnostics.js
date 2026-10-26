/* Read-only evidence inventory, not an order parser or ownership decision.
 * Only aggregate, fixed-schema results leave this module. Never export HTML,
 * arbitrary labels, URLs, identifiers, dates or exception messages. */
(function attachKoboDiagnostics(global) {
  'use strict';
  const LIMIT = 500;
  const text = node => String(node?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  function inspect(doc, savedIds = [], kind = 'library') {
    const known = new Set(savedIds);
    const items = global.GalacticKobo.koboItemsFromDocument(doc);
    const allLinks = [...doc.querySelectorAll('a[href]')].filter(link => /\/ebook\/|\/audiobook\/|readnow\.kobo\.com/iu.test(link.getAttribute('href')));
    const links = allLinks.slice(0, LIMIT);
    const ids = new Set(links.map(link => global.GalacticKobo.koboItemIdFromValue(link.getAttribute('href'))).filter(Boolean));
    const uuid = id => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id);
    const categories = {};
    for (const item of items.slice(0, LIMIT)) categories[item.metadata.ownershipBasis] = (categories[item.metadata.ownershipBasis] ?? 0) + 1;
    // These are structural hints only: a nearby date is not yet a verified
    // acquisition date, nor is a storefront slug a validated library UUID.
    const rows = [...new Set(links.map(link => link.closest('tr, article, li, .book-card, .book-item, .library-item') ?? link))];
    const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/iu;
    const visibleSource = doc.body?.cloneNode(true);
    visibleSource?.querySelectorAll('script, style, template, noscript, [hidden], [aria-hidden="true"]').forEach(node => node.remove());
    const body = text(visibleSource);
    const login = Boolean(doc.querySelector('input[type="password"]'));
    const empty = /(?:your (?:library|purchase history|order history) is empty|you (?:have no|haven't made any) (?:purchases|orders)|no (?:books|purchases|orders) (?:found|yet))/iu.test(body);
    const pagination = [...doc.querySelectorAll('a, button')].some(node => /^(?:next|next page|load more|show more|[2-9])$/iu.test(text(node) || node.getAttribute('aria-label') || ''));
    return {
      state: login ? 'sign-in-required' : empty && !links.length ? 'explicit-empty' : links.length ? 'content-observed' : 'unrecognized',
      scope: kind, completeness: 'not-established', boundReached: allLinks.length > LIMIT || items.length > LIMIT,
      parsedLibraryItems: Math.min(items.length, LIMIT), evidenceCategories: categories,
      productLinks: links.length, distinctLinkIdentities: ids.size,
      uuidLinkIdentities: [...ids].filter(uuid).length, otherLinkIdentities: [...ids].filter(id => !uuid(id)).length,
      exactSavedIdMatches: [...ids].filter(id => known.has(id)).length,
      parsedSavedIdMatches: items.slice(0, LIMIT).filter(item => known.has(item.providerItemId)).length,
      rowsWithDateHints: rows.filter(row => datePattern.test(text(row)) || row.querySelector('time[datetime], [data-purchase-date], [data-acquired-at]')).length,
      rowsWithExplicitPurchaseAttributes: rows.filter(row => row.matches('[data-is-purchased], [data-ownership-type], [data-entitlement-type]') || row.querySelector('[data-is-purchased], [data-ownership-type], [data-entitlement-type]')).length,
      rowsWithSubscriptionWording: rows.filter(row => /\bkobo plus\b/iu.test(text(row))).length,
      rowsWithTemporaryAccessWording: rows.filter(row => /\b(?:borrowed|loan|rental|expired|revoked|refunded|cancelled)\b/iu.test(text(row))).length,
      paginationObserved: pagination
    };
  }
  function historyLink(doc, base) {
    for (const link of doc.querySelectorAll('a[href]')) {
      if (!/^(?:purchase|order) history$/iu.test(text(link))) continue;
      try {
        const url = new URL(link.getAttribute('href'), base);
        if (url.origin === new URL(base).origin && /^https:$/u.test(url.protocol) && !url.username && !url.password && !url.hash && url.pathname !== new URL(base).pathname) return url.href;
      } catch { /* Unreadable or foreign links are not fetched. */ }
    }
    return null;
  }
  async function check(doc, base, savedIds = null, fetcher = global.fetch) {
    const report = {format: 1, provider: 'kobo', readOnly: true, libraryChanges: false,
      savedComparison: Array.isArray(savedIds) ? 'active-saved-profile-only-not-account-verification' : 'unavailable',
      library: inspect(doc, savedIds ?? [], 'library'), purchaseHistory: {state: 'link-not-exposed', completeness: 'not-established'}, requestsMade: 0};
    const url = historyLink(doc, base);
    if (!url) return report;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      report.requestsMade = 1;
      const response = await fetcher(url, {credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal});
      if (!response.ok) { report.purchaseHistory = {state: response.status === 401 || response.status === 403 ? 'access-denied' : 'request-failed', completeness: 'not-established'}; return report; }
      // Bound decoded bytes as well as page/row count. Do not retain the body.
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) { const {value, done} = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); report.purchaseHistory = {state: 'size-limit', completeness: 'not-established'}; return report; } chunks.push(value); }
      } finally { reader.releaseLock(); }
      const html = await new Blob(chunks).text();
      report.purchaseHistory = inspect(new DOMParser().parseFromString(html, 'text/html'), savedIds ?? [], 'purchase-history-first-page');
    } catch { report.purchaseHistory = {state: controller.signal.aborted ? 'timed-out' : 'inaccessible-or-redirected', completeness: 'not-established'}; }
    finally { clearTimeout(timeout); }
    return report;
  }
  global.GalacticKoboDiagnostics = {inspect, check};
}(globalThis));
