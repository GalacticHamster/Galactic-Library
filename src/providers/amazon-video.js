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
    diagnostics = { format: 3, provider: 'amazon-video', readOnly: true, state: 'scanning', itemCount: 0,
      completionConfirmed: false, expectedCount: null, countEvidence: 'unavailable',
      discoveredItems: 0, mediaTypes: { movie: 0, tv: 0 }, passes: [] };
    try {
      return await scanLibrary(reportProgress, knownItemIds, readOnly);
    } catch (error) {
      if (diagnostics.state === 'scanning') diagnostics.state = 'failed';
      // Only fixed reason codes/numeric page structure, never page text or IDs.
      diagnostics.reason ??= 'scan-rejected';
      throw error;
    }
  }

  async function scanLibrary(reportProgress, knownItemIds, readOnly) {
    const itemsById = new Map();
    const incremental = Array.isArray(knownItemIds);
    const renderedItemIds = new Set();
    const observedCards = new Set();
    let unchangedPasses = 0;
    let finished = false;
    let passesRead = 0;
    let previousContext = listingContext(global.document);
    // Reset all visible list scrollers, not just the one chosen for this pass.
    for (const [node] of scrollableContainers(previousContext)) node.scrollTo({ top: 0, behavior: 'instant' });
    global.scrollTo({ top: 0, behavior: 'instant' });
    scrollListing(previousContext, 0);
    await wait(SCROLL_PAUSE_MS);
    for (let pass = 0; pass < MAX_SCROLLS; pass += 1) {
      passesRead = pass + 1;
      const context = listingContext(global.document);
      const beforeGeometry = geometry(context);
      for (const card of context.cards) observedCards.add(card);
      const rendered = amazonVideoItemsFromDocument(global.document);
      const newlyRenderedItems = rendered.filter(item => !renderedItemIds.has(item.providerItemId));
      for (const item of newlyRenderedItems) renderedItemIds.add(item.providerItemId);
      const itemsToSave = incremental ? newAmazonVideoItems(newlyRenderedItems, knownItemIds) : newlyRenderedItems;
      for (const item of itemsToSave) itemsById.set(item.providerItemId, item);
      for (const item of newlyRenderedItems) diagnostics.mediaTypes[item.mediaType] += 1;
      diagnostics.itemCount = itemsById.size;
      diagnostics.discoveredItems = renderedItemIds.size;
      observeTotal(context);
      const movies = [...itemsById.values()].filter(item => item.mediaType === 'movie').length;
      reportProgress({ passes: pass, movies, tv: itemsById.size - movies,
        phase: unchangedPasses >= 3 ? 'awaiting-confirmation' : 'reading' });
      if (incremental && newlyRenderedItems.length && !itemsToSave.length) {
        diagnostics.passes.push({ pass: passesRead, cards: context.cards.length,
          newlyDiscoveredItems: newlyRenderedItems.length, distinctItems: renderedItemIds.size,
          scrollTarget: context.nested ? 'nested' : 'document', ...beforeGeometry,
          completionConfirmed: false, stop: 'known-newest-group' });
        diagnostics.state = 'bounded';
        diagnostics.reason = 'known-newest-group';
        finished = true; break;
      }
      const controlsBefore = continuationControls(global.document, context.root);
      // Visit overlapping viewports so a virtualized list cannot skip middle
      // groups merely because its full scroll range is already allocated.
      scrollListing(context, Math.min(context.scroller.scrollHeight,
        beforeGeometry.top + Math.max(1, beforeGeometry.height * 0.8)));
      // Give an already-running request time; do not repeatedly activate its button.
      if (!controlsBefore.loading.length) controlsBefore.more[0]?.click();
      await wait(SCROLL_PAUSE_MS);
      const afterContext = listingContext(global.document);
      const currentExpected = observeTotal(afterContext);
      const afterGeometry = geometry(afterContext);
      const controls = continuationControls(global.document, afterContext.root);
      const afterRendered = amazonVideoItemsFromDocument(global.document);
      const sameCards = rendered.length === afterRendered.length
        && rendered.every((item, index) => item.providerItemId === afterRendered[index].providerItemId);
      const sameContext = previousContext.scroller === context.scroller
        && context.scroller === afterContext.scroller && context.root === afterContext.root;
      const atEnd = afterGeometry.height > 0 && afterGeometry.top + afterGeometry.height >= afterGeometry.extent - 4;
      // A newly arrived batch, changed viewport/scroll range or active library
      // continuation resets the quiet period, even if all IDs were seen before.
      const stable = (afterContext.cards.length > 0 || renderedItemIds.size === 0) && sameContext && sameCards && beforeGeometry.extent === afterGeometry.extent
        && beforeGeometry.height === afterGeometry.height && atEnd
        && !controls.loading.length && !controls.more.length
        && !controlsBefore.loading.length && !controlsBefore.more.length;
      unchangedPasses = stable ? unchangedPasses + 1 : 0;
      diagnostics.passes.push({ pass: passesRead, cards: context.cards.length,
        newlyDiscoveredItems: newlyRenderedItems.length, distinctItems: renderedItemIds.size,
        scrollTarget: afterContext.nested ? 'nested' : 'document', controlScope: afterContext.root === global.document.body ? 'page' : 'main',
        ...afterGeometry, atEnd, loading: controls.loading.length, loadMore: controls.more.length,
        ignoredLoading: controls.ignoredLoading, ignoredLoadMore: controls.ignoredMore, unchangedPasses,
        expectedCount: diagnostics.expectedCount, currentReportedCount: currentExpected, completionConfirmed: false });
      previousContext = afterContext;
      // Quiet bottom geometry is only a candidate boundary. A separately
      // declared full-list total must agree with the distinct observed IDs.
      // Otherwise keep traversing within the budget; idle passes never certify
      // completeness, however many there have been.
      if (unchangedPasses >= 3 && currentExpected !== null
          && diagnostics.expectedCount === renderedItemIds.size && !inspectListing().remainingOtherScrollers) {
        diagnostics.completionConfirmed = true;
        diagnostics.passes.at(-1).completionConfirmed = true;
        finished = true; break;
      }
    }
    if (!itemsById.size && !incremental) {
      throw new Error(`Amazon Video showed no readable movie or TV cards${finished ? '' : ` within its ${MAX_SCROLLS}-pass limit`}. Open My Stuff > Purchases & Rentals, wait for titles to load, then try again.`);
    }
    for (const card of observedCards) {
      if (!amazonVideoItemFromCardData(cardDataFromElement(card))) throw new Error('Amazon Video showed unreadable library cards. No library changes were saved.');
    }
    const items = [...itemsById.values()];
    if (!finished) {
      diagnostics.state = 'uncertain';
      diagnostics.reason = diagnostics.expectedCount === null ? 'completion-unconfirmed'
        : diagnostics.expectedCount !== renderedItemIds.size ? 'reported-count-unreached' : 'continuation-unresolved';
      diagnostics.stop = 'traversal-budget';
      const countDetail = diagnostics.reason === 'reported-count-unreached'
        ? `It reported ${diagnostics.expectedCount} items but returned ${items.length}. ` : '';
      if (!readOnly) throw new Error(`Amazon Video read ${items.length} titles but could not confirm the entire library was loaded within its ${MAX_SCROLLS}-pass limit. ${countDetail}No library changes were saved. Use Scan diagnostics to inspect the listing without importing.`);
      return { items, completionConfirmed: false };
    }
    const snapshot = incremental ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('amazon-video', items,
      [global.GalacticProviderSnapshot.completedScope('library', items.length, diagnostics.expectedCount, 'reported-count', passesRead)]);
    if (!incremental) {
      diagnostics.state = 'complete';
      diagnostics.reason = 'reported-count-reconciled';
    }
    return { items, snapshot, completionConfirmed: diagnostics.completionConfirmed };
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
