/* Amazon Video importer. It reads title cards already rendered in the signed-
 * in Purchases & Rentals view. It does not call undocumented video APIs or
 * handle an Amazon password, cookie, or token. */
(function attachAmazonVideoImporter(global) {
  'use strict';

  const MAX_SCROLLS = 250;
  const SCROLL_PAUSE_MS = 700;
  const CARD_SELECTOR = '[data-card-entity-type], [data-entity-type], [data-testid="card"]';
  let diagnostics = null;

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function absoluteUrl(value) {
    try {
      const url = new URL(value ?? '', global.location?.origin ?? 'https://www.amazon.com');
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }

  function titleIdFromValue(value) {
    const text = String(value ?? '');
    const globalTitleId = text.match(/amzn1\.dv\.gti\.[a-z0-9-]+/iu)?.[0];
    if (globalTitleId) return globalTitleId.toLowerCase();
    const detailId = text.match(/\/detail\/([a-z0-9]{10,32})(?:[/?]|$)/iu)?.[1];
    return detailId ? detailId.toUpperCase() : '';
  }

  function mediaTypeFromEntityType(value) {
    const entityType = compactText(value).toUpperCase();
    if (/MOVIE|FEATURE|FILM/u.test(entityType)) return 'movie';
    if (/TV|SERIES|SEASON|SHOW/u.test(entityType)) return 'tv';
    return null;
  }

  function ownershipFromCardText(value) {
    const text = compactText(value).toLocaleLowerCase();
    if (/\b(rental|rent until|rented)\b/u.test(text)) return 'rental';
    if (/\b(purchased|purchase|owned)\b/u.test(text)) return 'owned';
    return 'unknown';
  }

  function amazonVideoItemFromCardData(card) {
    const title = compactText(card?.title);
    const detailUrl = absoluteUrl(card?.detailUrl);
    const providerItemId = titleIdFromValue(card?.providerItemId)
      || titleIdFromValue(detailUrl)
      || compactText(card?.providerItemId);
    const mediaType = mediaTypeFromEntityType(card?.entityType);
    if (!providerItemId || !title || !mediaType) return null;
    const ownershipEvidence = compactText(card?.ownershipEvidence);
    return {
      providerItemId,
      title,
      mediaType,
      ownership: ownershipFromCardText(ownershipEvidence),
      metadata: {
        source: 'amazon-prime-video-purchases-library',
        detailUrl,
        entityType: compactText(card?.entityType),
        imageUrl: absoluteUrl(card?.imageUrl),
        libraryView: 'purchases-and-rentals',
        ownershipEvidence: ownershipEvidence ? (ownershipFromCardText(ownershipEvidence) === 'unknown' ? '' : ownershipEvidence) : ''
      }
    };
  }

  function firstAttribute(element, names) {
    for (const name of names) {
      const value = compactText(element?.getAttribute?.(name));
      if (value) return value;
    }
    return '';
  }

  function cardDataFromElement(card) {
    const detailLink = card.querySelector('a[href*="/detail/"]');
    const image = card.querySelector('img');
    const entityType = firstAttribute(card, ['data-card-entity-type', 'data-entity-type', 'data-title-type', 'data-type']);
    return {
      providerItemId: firstAttribute(card, ['data-card-entity-id', 'data-entity-id', 'data-card-id', 'data-title-id', 'data-gti']) || detailLink?.getAttribute('href'),
      title: firstAttribute(card, ['data-card-title', 'data-title', 'aria-label']) || compactText(image?.getAttribute('alt')) || compactText(detailLink?.getAttribute('aria-label')),
      entityType,
      detailUrl: detailLink?.getAttribute('href'),
      imageUrl: image?.currentSrc ?? image?.getAttribute('src'),
      ownershipEvidence: compactText(card.textContent)
    };
  }

  function amazonVideoItemsFromDocument(document) {
    const cards = [...document.querySelectorAll(CARD_SELECTOR)];
    const itemsById = new Map();
    for (const card of cards) {
      const item = amazonVideoItemFromCardData(cardDataFromElement(card));
      if (item) itemsById.set(item.providerItemId, item);
    }
    return [...itemsById.values()];
  }

  function newAmazonVideoItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => String(id ?? '').trim()).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(String(item?.providerItemId ?? '').trim()));
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // Scope continuation controls to the content region, never the page chrome.
  // Geometry must come from the actual vertical scroller, not always window.
  function listingContext(document) {
    const cards = [...document.querySelectorAll(CARD_SELECTOR)];
    const first = cards[0];
    const main = first?.closest('main, [role="main"]');
    const root = main && cards.every(card => main.contains(card)) ? main : document.body;
    let common = first;
    while (common && !cards.every(card => common.contains(card))) common = common.parentElement;
    let scroller = document.scrollingElement ?? document.documentElement;
    for (let node = common; node && node !== document.documentElement; node = node.parentElement) {
      if (/^(?:auto|scroll|overlay)$/u.test(global.getComputedStyle(node).overflowY)
          && node.scrollHeight > node.clientHeight) { scroller = node; break; }
    }
    // Independent vertical lists need separate visits even when their common
    // parent is the document. The document bottom cannot certify those lists.
    const unfinished = scrollableContainers({ root, cards }).find(([node]) => node !== scroller
      && !node.contains(scroller) && node.scrollTop + node.clientHeight < node.scrollHeight - 4);
    if (unfinished) scroller = unfinished[0];
    return { root, scroller, cards, nested: scroller !== (document.scrollingElement ?? document.documentElement) };
  }

  function visible(element) {
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = global.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }

  function continuationControls(document, root) {
    const inListing = element => {
      // An explicitly associated pager can legitimately sit outside <main>.
      const associated = compactText(element.getAttribute('aria-controls')).split(' ').some(id => {
        const target = id && document.getElementById(id);
        return target && (root.contains(target) || target.contains(root));
      });
      return (root.contains(element) || element.contains(root) || associated) && visible(element);
    };
    const loading = [...document.querySelectorAll('[aria-busy="true"], [role="progressbar"]')];
    const more = [...document.querySelectorAll('button, a')].filter(element => !element.disabled
      && element.getAttribute('aria-disabled') !== 'true'
      && /^(?:load|show|see)\s+more$/iu.test(compactText(element.textContent)));
    return {
      loading: loading.filter(inListing), more: more.filter(inListing),
      ignoredLoading: loading.filter(element => !inListing(element)).length,
      ignoredMore: more.filter(element => !inListing(element)).length
    };
  }

  function scrollListing(context, top) {
    if (context.nested) context.scroller.scrollTo({ top, behavior: 'instant' });
    else global.scrollTo({ top, behavior: 'instant' });
  }

  function geometry(context) {
    const { scroller, nested } = context;
    const height = scroller.clientHeight || (!nested ? global.innerHeight : 0);
    return { top: scroller.scrollTop, height, extent: scroller.scrollHeight };
  }

  function scrollableContainers(context) {
    const containers = new Map();
    for (const card of context.cards) {
      for (let node = card.parentElement; node && context.root.contains(node); node = node.parentElement) {
        if (!containers.has(node)) containers.set(node, 0);
        containers.set(node, containers.get(node) + 1);
        if (node === context.root) break;
      }
    }
    return [...containers].filter(([node, cards]) => cards > 1 && node.clientHeight > 0
      && /^(?:auto|scroll|overlay)$/u.test(global.getComputedStyle(node).overflowY)
      && node.scrollHeight > node.clientHeight);
  }

  function reportedTotal(context) {
    // Whole-list labels only: never join body text or turn grid row counts or
    // a user's manual count into a provider-reported total.
    if (context.root === global.document.body) return null;
    const totals = new Set();
    for (const node of context.root.querySelectorAll('p, h1, h2, h3, [role="status"]')) {
      if (node.closest(CARD_SELECTOR) || node.closest('aside, nav, footer') || !visible(node)) continue;
      const match = compactText(node.textContent).match(/^(?:all items|purchases\s*&\s*rentals)\s*\(([\d,]+)\)$/iu);
      if (!match) continue;
      const value = Number(match[1].replace(/,/gu, ''));
      if (Number.isSafeInteger(value) && value >= 0) totals.add(value);
    }
    if (totals.size > 1) throw new Error('Amazon Video showed conflicting whole-library totals. No library changes were saved.');
    return totals.size ? [...totals][0] : null;
  }

  function observeTotal(context) {
    const expected = reportedTotal(context);
    if (expected !== null) {
      if (diagnostics.expectedCount !== null && diagnostics.expectedCount !== expected) {
        diagnostics.reason = 'reported-total-changed';
        throw new Error('Amazon Video changed its whole-library total during the scan. No library changes were saved.');
      }
      diagnostics.expectedCount = expected;
      diagnostics.countEvidence = 'whole-list-label';
    }
    return expected;
  }

  function inspectListing() {
    const context = listingContext(global.document);
    const scrollable = scrollableContainers(context);
    const remaining = scrollable.filter(([node]) => node !== context.scroller && !node.contains(context.scroller)
      && node.scrollTop + node.clientHeight < node.scrollHeight - 4);
    const nextControls = [...global.document.querySelectorAll('button, a')].filter(node => !node.disabled
      && node.getAttribute('aria-disabled') !== 'true' && visible(node)
      && /^(?:next(?:\s+page)?|load\s+more|show\s+more|see\s+more)$/iu.test(compactText(node.getAttribute('aria-label') || node.textContent)));
    const types = { movie: 0, tv: 0, unreadable: 0 };
    for (const card of context.cards) {
      const item = amazonVideoItemFromCardData(cardDataFromElement(card));
      types[item?.mediaType ?? 'unreadable'] += 1;
    }
    return {
      renderedCards: context.cards.length, readableDistinctItems: amazonVideoItemsFromDocument(global.document).length,
      cardTypes: types, controlScope: context.root === global.document.body ? 'page' : 'main',
      selectedScrollTarget: context.nested ? 'nested' : 'document', ...geometry(context),
      visibleNextLikeControls: nextControls.length,
      nextLikeControlsInMain: nextControls.filter(node => context.root.contains(node)).length,
      scrollableContainers: scrollable.length, remainingOtherScrollers: remaining.length,
      containers: scrollable.slice(0, 20).map(([node, cards]) => ({ cards, selected: node === context.scroller,
        top: node.scrollTop, height: node.clientHeight, extent: node.scrollHeight,
        atEnd: node.scrollTop + node.clientHeight >= node.scrollHeight - 4 }))
    };
  }

  async function fetchAmazonVideoLibrary(reportProgress = () => {}, knownItemIds = null, { readOnly = false } = {}) {
    diagnostics = { format: 4, provider: 'amazon-video', readOnly: true, state: 'scanning', itemCount: 0,
      completionConfirmed: false, expectedCount: null, countEvidence: 'unavailable',
      discoveredItems: 0, mediaTypes: { movie: 0, tv: 0 }, passes: [] };
    try {
      return await scanLibrary(reportProgress, knownItemIds, readOnly);
    } catch (error) {
      if (diagnostics.state === 'scanning') {
        diagnostics.state = 'failed'; diagnostics.completionStatus = 'failed'; diagnostics.completionConfirmed = false;
      }
      // Only fixed reason codes/numeric page structure, never page text or IDs.
      diagnostics.reason ??= 'scan-rejected';
      throw error;
    }
  }

  function resetTraversal(context) {
    for (const [node] of scrollableContainers(context)) node.scrollTo({ top: 0, behavior: 'instant' });
    global.scrollTo({ top: 0, behavior: 'instant' });
    scrollListing(listingContext(global.document), 0);
  }

  function boundaryEvidence(context) {
    const nodes = [...new Set([global.document.scrollingElement ?? global.document.documentElement,
      ...scrollableContainers(context).map(([node]) => node)])];
    return nodes.map(node => ({ node, height: node.clientHeight || global.innerHeight, extent: node.scrollHeight }));
  }

  function sameBoundary(before, after) {
    return before.length === after.length && before.every(entry => after.some(other => other.node === entry.node
      && Math.abs(other.height - entry.height) <= 4 && Math.abs(other.extent - entry.extent) <= 4));
  }

  async function scanLibrary(reportProgress, knownItemIds, readOnly) {
    const itemsById = new Map(), discovered = new Set(), observedCards = new Set();
    const incremental = Array.isArray(knownItemIds);
    let phase = 'discovery', quiet = 0, candidate = null, passesRead = 0;
    let sweepSeen = new Set();
    diagnostics.completionStatus = 'uncertain';
    diagnostics.verification = { attempts: 0, completed: false, revisitedItems: 0, missingItems: 0 };
    resetTraversal(listingContext(global.document));
    await wait(SCROLL_PAUSE_MS);
    for (let pass = 0; pass < MAX_SCROLLS; pass += 1) {
      passesRead = pass + 1;
      const context = listingContext(global.document), before = geometry(context);
      for (const card of context.cards) observedCards.add(card);
      const rendered = amazonVideoItemsFromDocument(global.document);
      const fresh = rendered.filter(item => !discovered.has(item.providerItemId));
      for (const item of fresh) { discovered.add(item.providerItemId); diagnostics.mediaTypes[item.mediaType] += 1; }
      const save = incremental ? newAmazonVideoItems(fresh, knownItemIds) : fresh;
      for (const item of save) itemsById.set(item.providerItemId, item);
      diagnostics.itemCount = itemsById.size; diagnostics.discoveredItems = discovered.size;
      observeTotal(context);
      if (candidate && fresh.length) { candidate = null; phase = 'discovery'; quiet = 0; }
      if (phase === 'verification') for (const item of rendered) sweepSeen.add(item.providerItemId);
      reportProgress({ passes: pass, movies: diagnostics.mediaTypes.movie, tv: diagnostics.mediaTypes.tv,
        phase: phase === 'verification' ? 'verification' : phase.startsWith('probe') ? 'boundary-probe' : 'reading' });
      if (incremental && fresh.length && !save.length) {
        diagnostics.state = 'bounded'; diagnostics.reason = 'known-newest-group'; diagnostics.completionStatus = 'bounded';
        diagnostics.passes.push({ pass: passesRead, phase, newlyDiscoveredItems: fresh.length, distinctItems: discovered.size,
          ...before, completionConfirmed: false, stop: 'known-newest-group' });
        break;
      }
      const controlsBefore = continuationControls(global.document, context.root), action = phase;
      const target = action === 'probe-back' ? Math.max(0, before.top - before.height)
        : action === 'probe-forward' ? before.extent + before.height
        : Math.min(before.extent, before.top + Math.max(1, before.height * 0.8));
      scrollListing(context, target);
      if (!controlsBefore.loading.length) controlsBefore.more[0]?.click();
      await wait(SCROLL_PAUSE_MS);
      const afterContext = listingContext(global.document), after = geometry(afterContext);
      const currentExpected = observeTotal(afterContext);
      const controls = continuationControls(global.document, afterContext.root);
      const afterRendered = amazonVideoItemsFromDocument(global.document);
      const sameCards = rendered.length === afterRendered.length
        && rendered.every((item, index) => item.providerItemId === afterRendered[index].providerItemId);
      const atEnd = after.height > 0 && after.top + after.height >= after.extent - 4;
      const stableGeometry = context.scroller === afterContext.scroller && sameCards && atEnd
        && Math.abs(before.extent - after.extent) <= 4 && before.height === after.height;
      const clear = !controls.loading.length && !controls.more.length
        && !controlsBefore.loading.length && !controlsBefore.more.length;
      quiet = stableGeometry ? quiet + 1 : 0;
      const row = { pass: passesRead, phase: action, cards: context.cards.length, newlyDiscoveredItems: fresh.length,
        distinctItems: discovered.size, scrollTarget: afterContext.nested ? 'nested' : 'document',
        controlScope: afterContext.root === global.document.body ? 'page' : 'main', ...after,
        requestedTop: target, beforeTop: before.top, beforeExtent: before.extent, renderedListingStable: sameCards,
        movement: afterContext.scroller === context.scroller ? after.top - before.top : null,
        rangeChange: after.extent - before.extent, atEnd, loading: controls.loading.length, loadMore: controls.more.length,
        ignoredLoading: controls.ignoredLoading, ignoredLoadMore: controls.ignoredMore, unchangedPasses: quiet,
        expectedCount: diagnostics.expectedCount, currentReportedCount: currentExpected, completionConfirmed: false };
      diagnostics.passes.push(row);
      if (quiet >= 3 && clear && currentExpected !== null && currentExpected === discovered.size
          && !inspectListing().remainingOtherScrollers) {
        diagnostics.completionStatus = 'confirmed'; diagnostics.completionConfirmed = true;
        diagnostics.reason = 'reported-count-reconciled'; row.completionConfirmed = true; break;
      }
      if (action === 'probe-back') {
        diagnostics.boundaryProbe.backMoved = row.movement !== null && row.movement < -4;
        diagnostics.boundaryProbe.backPossible = before.top > 4;
        phase = 'probe-forward'; quiet = 0; continue;
      }
      if (action === 'probe-forward') {
        diagnostics.boundaryProbe.beyondAttempted = true;
        diagnostics.boundaryProbe.rangeExtended = !sameBoundary(candidate.ranges, boundaryEvidence(afterContext));
        diagnostics.boundaryProbe.returnedToBoundary = atEnd;
        const returnedTail = candidate.tail.length === afterRendered.length
          && candidate.tail.every((id, index) => id === afterRendered[index].providerItemId);
        if (!returnedTail || !atEnd || diagnostics.boundaryProbe.rangeExtended) {
          candidate = null; phase = 'discovery'; quiet = 0; continue;
        }
        if (diagnostics.boundaryProbe.backPossible && !diagnostics.boundaryProbe.backMoved) {
          diagnostics.reason = 'boundary-probe-did-not-move'; break;
        }
        sweepSeen = new Set(); phase = 'verification'; quiet = 0;
        diagnostics.verification.startedAtPass = passesRead + 1;
        resetTraversal(afterContext); await wait(SCROLL_PAUSE_MS); continue;
      }
      if (quiet < 3) continue;
      if (!rendered.length) { diagnostics.reason = 'no-readable-listing'; break; }
      if (phase === 'discovery') {
        candidate = { ids: new Set(discovered), ranges: boundaryEvidence(afterContext),
          tail: afterRendered.map(item => item.providerItemId) };
        diagnostics.verification.attempts += 1;
        diagnostics.boundaryProbe = { backMoved: false, beyondAttempted: false, rangeExtended: false };
        phase = 'probe-back'; quiet = 0; continue;
      }
      if (phase === 'verification') {
        const missing = [...candidate.ids].filter(id => !sweepSeen.has(id)).length;
        const rangesStable = sameBoundary(candidate.ranges, boundaryEvidence(afterContext));
        const sameTail = candidate.tail.length === afterRendered.length
          && candidate.tail.every((id, index) => id === afterRendered[index].providerItemId);
        diagnostics.verification = { ...diagnostics.verification, completed: true, finishedAtPass: passesRead, revisitedItems: sweepSeen.size,
          missingItems: missing, newItems: discovered.size - candidate.ids.size, rangesStable, sameTail, clear,
          allListsExhausted: !inspectListing().remainingOtherScrollers };
        if (missing || !rangesStable || !sameTail || !clear || !diagnostics.verification.allListsExhausted
            || diagnostics.expectedCount !== null) {
          diagnostics.reason = !clear ? 'continuation-unresolved' : missing ? 'verification-membership-mismatch'
            : diagnostics.expectedCount !== null ? 'reported-count-unreached' : 'verification-boundary-conflict';
          break;
        }
        diagnostics.completionStatus = 'inferred'; diagnostics.reason = 'verified-traversal-converged'; break;
      }
    }
    for (const card of observedCards) {
      if (!amazonVideoItemFromCardData(cardDataFromElement(card))) {
        diagnostics.reason = 'unreadable-card';
        throw new Error('Amazon Video showed unreadable library cards. No library changes were saved.');
      }
    }
    const items = [...itemsById.values()];
    if (!items.length && !incremental) throw new Error(`Amazon Video showed no readable movie or TV cards${passesRead === MAX_SCROLLS ? ` within its ${MAX_SCROLLS}-pass limit` : ''}. No library changes were saved.`);
    if (['confirmed', 'inferred'].includes(diagnostics.completionStatus)) {
      const confirmed = diagnostics.completionStatus === 'confirmed';
      const snapshot = global.GalacticProviderSnapshot.completeProviderSnapshot('amazon-video', items,
        [global.GalacticProviderSnapshot.completedScope('library', items.length, confirmed ? diagnostics.expectedCount : null,
          confirmed ? 'reported-count' : 'scroll-end', passesRead)]);
      diagnostics.state = confirmed ? 'complete' : 'inferred';
      diagnostics.stop = confirmed ? 'reported-count' : 'verification-converged';
      return { items, snapshot, completionConfirmed: confirmed, completionStatus: diagnostics.completionStatus };
    }
    if (diagnostics.completionStatus === 'bounded') return { items, completionConfirmed: false, completionStatus: 'bounded' };
    diagnostics.state = 'uncertain'; diagnostics.reason ??= 'traversal-budget';
    diagnostics.stop = passesRead === MAX_SCROLLS ? 'emergency-budget' : 'verification-not-converged';
    if (!readOnly) throw new Error(`Amazon Video read ${items.length} titles but could not establish a stable complete traversal. No library changes were saved. Export scan diagnostics and retry after the listing finishes loading.`);
    return { items, completionConfirmed: false, completionStatus: 'uncertain' };
  }

  global.GalacticAmazonVideo = {
    getDiagnostics: () => diagnostics ? { ...JSON.parse(JSON.stringify(diagnostics)), currentPage: inspectListing() } : null,
    amazonVideoItemFromCardData,
    amazonVideoItemsFromDocument,
    newAmazonVideoItems,
    ownershipFromCardText,
    fetchAmazonVideoLibrary
  };
}(globalThis));
