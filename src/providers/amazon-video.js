/* Amazon Video importer. It reads title cards already rendered in the signed-
 * in Purchases & Rentals view. It does not call undocumented video APIs or
 * handle an Amazon password, cookie, or token. */
(function attachAmazonVideoImporter(global) {
  'use strict';

  const MAX_SCROLLS = 250;
  const SCROLL_PAUSE_MS = 700;

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
    const cards = [...document.querySelectorAll('[data-card-entity-type], [data-entity-type], [data-testid="card"]')];
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

  async function fetchAmazonVideoLibrary(reportProgress = () => {}, knownItemIds = null) {
    const itemsById = new Map();
    const incremental = Array.isArray(knownItemIds);
    const renderedItemIds = new Set();
    let unchangedPasses = 0;
    const scrollingElement = global.document.scrollingElement ?? global.document.documentElement;
    // The signed-in library's Most recent addition order is only useful if
    // the scan starts at its first rendered group, not the user's scroll spot.
    if (incremental) {
      global.scrollTo({ top: 0, behavior: 'auto' });
      await wait(SCROLL_PAUSE_MS);
    }
    for (let pass = 0; pass < MAX_SCROLLS && unchangedPasses < 3; pass += 1) {
      const before = itemsById.size;
      const newlyRenderedItems = amazonVideoItemsFromDocument(global.document)
        .filter((item) => !renderedItemIds.has(item.providerItemId));
      for (const item of newlyRenderedItems) renderedItemIds.add(item.providerItemId);
      const itemsToSave = incremental ? newAmazonVideoItems(newlyRenderedItems, knownItemIds) : newlyRenderedItems;
      for (const item of itemsToSave) itemsById.set(item.providerItemId, item);
      const movies = [...itemsById.values()].filter((item) => item.mediaType === 'movie').length;
      const tv = itemsById.size - movies;
      reportProgress({ passes: pass, movies, tv });
      // Cards are rendered newest first. A complete newly rendered group with
      // no unknown title is a safe stopping point for a quick update.
      if (incremental && newlyRenderedItems.length && !itemsToSave.length) break;
      unchangedPasses = itemsById.size === before ? unchangedPasses + 1 : 0;
      const beforeScroll = scrollingElement.scrollTop;
      global.scrollTo({ top: scrollingElement.scrollHeight, behavior: 'auto' });
      await wait(SCROLL_PAUSE_MS);
      const atEnd = scrollingElement.scrollTop === beforeScroll || scrollingElement.scrollTop + global.innerHeight >= scrollingElement.scrollHeight - 4;
      if (atEnd && unchangedPasses >= 2) break;
    }
    if (!itemsById.size && !incremental) {
      throw new Error('Amazon Video showed no readable movie or TV cards. Open My Stuff > Purchases & Rentals, wait for titles to load, then try again.');
    }
    return { items: [...itemsById.values()] };
  }

  global.GalacticAmazonVideo = {
    amazonVideoItemFromCardData,
    amazonVideoItemsFromDocument,
    newAmazonVideoItems,
    ownershipFromCardText,
    fetchAmazonVideoLibrary
  };
}(globalThis));
