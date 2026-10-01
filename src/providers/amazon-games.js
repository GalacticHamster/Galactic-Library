/* Amazon Games importer. It reads rendered, delivered Prime Gaming claim rows
 * after the user starts a sync. A claim may also exist in GOG, Epic, or
 * another library; Galactic Library retains that Amazon claim provenance and
 * lets normal canonical matching keep the provider records together. */
(function attachAmazonGamesImporter(global) {
  'use strict';

  const MAX_SCROLL_PASSES = 180;
  const SCROLL_PAUSE_MS = 700;

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function amazonGamesTitleKey(value) {
    return compactText(value)
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function absoluteUrl(value) {
    if (!compactText(value)) return '';
    try {
      const url = new URL(value, global.location?.origin ?? 'https://luna.amazon.com');
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }

  function claimEntryId(value) {
    return compactText(value).match(/^([a-z0-9-]+)-body$/iu)?.[1] ?? '';
  }

  function amazonGamesItemFromCardData(card) {
    const providerItemId = claimEntryId(card?.providerItemId);
    const title = compactText(card?.title);
    const delivery = compactText(card?.deliveryText);
    const deliveryTarget = compactText(card?.deliveryTarget);
    if (!providerItemId || !title || !/\bdelivered\b/iu.test(delivery) || !/\bamazon games library\b/iu.test(deliveryTarget)) return null;
    return {
      providerItemId,
      title,
      mediaType: 'game',
      ownership: 'claimed',
      metadata: {
        source: 'amazon-games-collection',
        detailUrl: '',
        imageUrl: absoluteUrl(card?.imageUrl),
        delivery: deliveryTarget
      }
    };
  }

  function firstText(values) {
    for (const value of values) {
      const text = compactText(value?.textContent ?? value?.getAttribute?.('title') ?? value);
      if (text) return text;
    }
    return '';
  }

  function titleFromImage(image) {
    return compactText(image?.getAttribute('alt')).replace(/^image of\s+/iu, '');
  }

  function cardDataFromClaimHeader(header) {
    const button = header.querySelector('button[aria-controls]');
    const image = header.querySelector('img.claim-entry-image, img');
    const titleElement = [...header.querySelectorAll('h3[title], [data-a-target*="title" i]')]
      .find((element) => compactText(element.getAttribute('title') ?? element.textContent));
    return {
      providerItemId: button?.getAttribute('aria-controls'),
      title: compactText(titleElement?.getAttribute('title') ?? titleElement?.textContent) || titleFromImage(image),
      imageUrl: image?.currentSrc ?? image?.getAttribute('src'),
      deliveryText: firstText([
        header.querySelector('[data-a-target="claim-entry-list_label-text"]'),
        header.querySelector('[data-a-target="claim-entry-list_label"]')
      ])
    };
  }

  function claimCardsFromDocument(document) {
    const cards = [];
    for (const header of document.querySelectorAll('[data-a-target="accordion-header"]')) {
      cards.push({ header, card: cardDataFromClaimHeader(header) });
    }
    return { cards, diagnostics: { cardsRead: cards.length } };
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function isLoadMoreText(value) {
    return /^see(?:\s+\d+)?\s+more$/iu.test(compactText(value));
  }

  function loadMoreControl(document) {
    return [...document.querySelectorAll('button, [role="button"], a')]
      .find((element) => !element.disabled && isLoadMoreText(element.textContent ?? element.getAttribute('aria-label')));
  }

  function deliveryTargetFromText(value) {
    const text = String(value ?? '');
    const sentTo = text.match(/(?:^|\r?\n)\s*Sent to\s*(?:\r?\n)+\s*([^\r\n]+)/iu)?.[1];
    if (sentTo) return compactText(sentTo);
    return compactText(text.match(/\bDelivered to your\s+(.+?)(?:\s+on\s+|\.)/iu)?.[1]);
  }

  async function deliveryTargetFromClaimHeader(header) {
    const button = header.querySelector('button[aria-controls]');
    const bodyId = button?.getAttribute('aria-controls');
    let body = bodyId ? header.ownerDocument.getElementById(bodyId) : null;
    if (!body || button?.getAttribute('aria-expanded') !== 'true') {
      button?.click();
      await wait(250);
      body = bodyId ? header.ownerDocument.getElementById(bodyId) : null;
    }
    return deliveryTargetFromText(body?.innerText || body?.textContent);
  }

  async function amazonGamesItemFromClaimHeader(header, card) {
    if (!claimEntryId(card.providerItemId) || !compactText(card.title) || !/\bdelivered\b/iu.test(compactText(card.deliveryText))) {
      const cardText = compactText(header.textContent);
      return { item: null, reason: /\bproduct\s+key\b/iu.test(`${card.deliveryText} ${cardText}`) ? 'product-key' : /\b(?:pending|not delivered|processing|awaiting delivery)\b/iu.test(compactText(card.deliveryText)) ? 'not-delivered' : 'unclassified' };
    }
    const deliveryTarget = await deliveryTargetFromClaimHeader(header);
    const item = amazonGamesItemFromCardData({ ...card, deliveryTarget });
    return { item, reason: deliveryTarget ? 'other-library' : 'unreadable' };
  }

  function allTimeWindowOptionsFromDocument(document) {
    return [...document.querySelectorAll('[data-a-target="time-window-filter-flyout"] button[data-type]')]
      .map((button) => ({ id: compactText(button.getAttribute('data-type')), label: compactText(button.textContent) }))
      .filter((option) => option.id && option.label);
  }

  function timeWindowOptionsFromDocument(document) {
    const options = allTimeWindowOptionsFromDocument(document);
    const years = options.filter((option) => /^\d{4}$/u.test(option.id));
    return years.length ? years : options;
  }

  function timeWindowHeaderFromDocument(document) {
    return [...document.querySelectorAll('button[data-a-target="amazon-dropdown-header-interactable"]')]
      .find((button) => button.querySelector('[data-a-target="time-window-filter-dropdown"]')) ?? null;
  }

  async function openTimeWindowMenu(document, includeRecent = false) {
    let options = allTimeWindowOptionsFromDocument(document);
    if (options.length) return includeRecent ? options : timeWindowOptionsFromDocument(document);
    const header = timeWindowHeaderFromDocument(document);
    if (!header) return [];
    header.click();
    await wait(150);
    options = allTimeWindowOptionsFromDocument(document);
    return includeRecent ? options : timeWindowOptionsFromDocument(document);
  }

  async function selectTimeWindow(document, option) {
    const options = await openTimeWindowMenu(document);
    const control = [...document.querySelectorAll('[data-a-target="time-window-filter-flyout"] button[data-type]')]
      .find((button) => compactText(button.getAttribute('data-type')) === option.id);
    if (!options.length || !control) throw new Error(`Amazon's collection date range “${option.label}” could not be selected.`);
    control.click();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await wait(250);
      const selected = compactText(document.querySelector('[data-a-target="time-window-filter-dropdown"] p')?.getAttribute('title')
        ?? document.querySelector('[data-a-target="time-window-filter-dropdown"]')?.textContent);
      if (selected.toLocaleLowerCase() === option.label.toLocaleLowerCase()) {
        await wait(650);
        return;
      }
    }
    throw new Error(`Amazon's collection did not finish opening the ${option.label} date range.`);
  }

  async function fetchAmazonGamesInCurrentWindow(reportProgress = () => {}, timeWindow = '', strict = true) {
    const itemsById = new Map();
    const itemIdsByTitle = new Map();
    const processedCardIds = new Set();
    let otherLibraryClaims = 0;
    let productKeyClaims = 0;
    let duplicateAmazonClaims = 0;
    let unreadableCards = 0;
    let unchangedPasses = 0;
    let priorSignature = '';
    let sawCards = false;
    let loadMoreActivations = 0;
    let passesRead = 0;
    for (let pass = 0; pass < MAX_SCROLL_PASSES && unchangedPasses < 4; pass += 1) {
      passesRead = pass + 1;
      const scan = claimCardsFromDocument(global.document);
      sawCards ||= scan.diagnostics.cardsRead > 0;
      for (const { header, card } of scan.cards) {
        const cardId = claimEntryId(card.providerItemId);
        if (!cardId || !compactText(card.title)) throw new Error('Amazon Games showed a claim without a readable ID or title. No library changes were saved.');
        if (processedCardIds.has(cardId)) continue;
        processedCardIds.add(cardId);
        const result = await amazonGamesItemFromClaimHeader(header, card);
        if (result.item) {
          const titleKey = amazonGamesTitleKey(result.item.title);
          if (itemIdsByTitle.has(titleKey)) duplicateAmazonClaims += 1;
          else {
            itemIdsByTitle.set(titleKey, result.item.providerItemId);
            itemsById.set(result.item.providerItemId, result.item);
          }
        }
        else if (result.reason === 'other-library') otherLibraryClaims += 1;
        else if (result.reason === 'product-key') productKeyClaims += 1;
        else {
          if (strict && (result.reason === 'unreadable' || result.reason === 'unclassified')) throw new Error('Amazon Games could not identify a claim delivery method. A full snapshot cannot safely exclude that claim.');
          unreadableCards += 1;
        }
      }
      const cardsRead = processedCardIds.size;
      const signature = `${[...itemsById.keys()].sort().join('\u0000')}|${cardsRead}|${otherLibraryClaims}|${productKeyClaims}|${unreadableCards}`;
      const root = global.document.scrollingElement ?? global.document.documentElement;
      const atBottom = root.scrollTop + global.innerHeight >= root.scrollHeight - 4;
      const loading = global.document.querySelector('[aria-busy="true"], [role="progressbar"]');
      unchangedPasses = atBottom && !loading && signature === priorSignature ? unchangedPasses + 1 : 0;
      priorSignature = signature;
      const loadMore = loadMoreControl(global.document);
      reportProgress({ timeWindow, passes: pass + 1, games: itemsById.size, cardsRead, otherLibraryClaims, productKeyClaims, duplicateAmazonClaims, loadMoreActivations });
      if (loadMore) {
        loadMore.scrollIntoView?.({ block: 'center', behavior: 'auto' });
        loadMore.click();
        loadMoreActivations += 1;
        unchangedPasses = 0;
        await wait(900);
        continue;
      }
      const maximum = Math.max(0, root.scrollHeight - global.innerHeight);
      global.scrollTo({ top: Math.min(maximum, global.scrollY + Math.max(360, Math.floor(global.innerHeight * 0.82))), behavior: 'auto' });
      await wait(SCROLL_PAUSE_MS);
    }
    if (unchangedPasses < 4 || loadMoreControl(global.document)) throw new Error(`Amazon Games reached its ${MAX_SCROLL_PASSES}-pass limit before finishing ${timeWindow}.`);
    if (!sawCards && !/\b(?:no (?:games|items|claims|collected)|haven['’]?t collected|have not collected|nothing (?:collected|claimed)|no content)\b/iu.test(global.document.body?.textContent ?? '')) throw new Error(`Amazon Games did not expose claim cards or an explicit empty state for ${timeWindow}.`);
    return { items: [...itemsById.values()], scope: global.GalacticProviderSnapshot.completedScope(timeWindow || 'collection', processedCardIds.size, sawCards ? null : 0, 'scroll-end', passesRead), diagnostics: { sawCards, cardsRead: processedCardIds.size, otherLibraryClaims, productKeyClaims, duplicateAmazonClaims, unreadableCards, loadMoreActivations } };
  }

  async function fetchAmazonGames(reportProgress = () => {}, quickUpdate = false) {
    const windows = await openTimeWindowMenu(global.document, quickUpdate);
    if (!quickUpdate && !windows.some((window) => /^\d{4}$/u.test(window.id))) throw new Error('Amazon Games did not expose the complete collection year list. No full replacement was saved.');
    const recentWindow = windows.find((window) => window.id === 'past-3-months');
    const selectedWindows = quickUpdate && recentWindow ? [recentWindow] : windows.length ? windows : [{ id: '', label: 'current selection' }];
    const itemsByTitle = new Map();
    const totals = { cardsRead: 0, otherLibraryClaims: 0, productKeyClaims: 0, duplicateAmazonClaims: 0, unreadableCards: 0, loadMoreActivations: 0, crossWindowDuplicates: 0 };
    let rangesWithClaims = 0;
    const scopes = [];
    for (let index = 0; index < selectedWindows.length; index += 1) {
      const timeWindow = selectedWindows[index];
      if (timeWindow.id) await selectTimeWindow(global.document, timeWindow);
      global.scrollTo({ top: 0, behavior: 'auto' });
      const result = await fetchAmazonGamesInCurrentWindow((progress) => reportProgress({
        ...progress,
        windowsRead: index + 1,
        windowsTotal: selectedWindows.length,
        totalGames: itemsByTitle.size + progress.games
      }), timeWindow.label, !quickUpdate);
      if (result.diagnostics.sawCards) rangesWithClaims += 1;
      scopes.push({ ...result.scope, id: timeWindow.id || result.scope.id });
      for (const item of result.items) {
        const titleKey = amazonGamesTitleKey(item.title);
        if (itemsByTitle.has(titleKey)) totals.crossWindowDuplicates += 1;
        else itemsByTitle.set(titleKey, item);
      }
      for (const key of ['cardsRead', 'otherLibraryClaims', 'productKeyClaims', 'duplicateAmazonClaims', 'unreadableCards', 'loadMoreActivations']) {
        totals[key] += result.diagnostics[key];
      }
    }
    if (!rangesWithClaims) throw new Error('No readable claim cards were found in any selected date range. Open My Collection, select Games, and wait for it to load.');
    return {
      items: [...itemsByTitle.values()],
      diagnostics: { ...totals, windowsRead: selectedWindows.length, windowsTotal: selectedWindows.length, rangesWithClaims, emptyRanges: selectedWindows.length - rangesWithClaims, timeWindows: selectedWindows.map((window) => window.label) },
      snapshot: quickUpdate ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('amazon-games', [...itemsByTitle.values()], scopes)
    };
  }

  global.GalacticAmazonGames = { amazonGamesItemFromCardData, amazonGamesTitleKey, isLoadMoreText, deliveryTargetFromText, allTimeWindowOptionsFromDocument, timeWindowOptionsFromDocument, timeWindowHeaderFromDocument, claimCardsFromDocument, fetchAmazonGames };
}(globalThis));
