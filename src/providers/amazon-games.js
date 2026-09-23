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
      return { item: null, reason: /\bproduct\s+key\b/iu.test(`${card.deliveryText} ${cardText}`) ? 'product-key' : 'unclassified' };
    }
    const deliveryTarget = await deliveryTargetFromClaimHeader(header);
    const item = amazonGamesItemFromCardData({ ...card, deliveryTarget });
    return { item, reason: deliveryTarget ? 'other-library' : 'unreadable' };
  }

  async function fetchAmazonGames(reportProgress = () => {}) {
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
    for (let pass = 0; pass < MAX_SCROLL_PASSES && unchangedPasses < 4; pass += 1) {
      const scan = claimCardsFromDocument(global.document);
      sawCards ||= scan.diagnostics.cardsRead > 0;
      for (const { header, card } of scan.cards) {
        const cardId = claimEntryId(card.providerItemId);
        if (!cardId || processedCardIds.has(cardId)) continue;
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
        else unreadableCards += 1;
      }
      const cardsRead = processedCardIds.size;
      const signature = `${[...itemsById.keys()].sort().join('\u0000')}|${cardsRead}|${otherLibraryClaims}|${productKeyClaims}|${unreadableCards}`;
      unchangedPasses = signature === priorSignature ? unchangedPasses + 1 : 0;
      priorSignature = signature;
      const loadMore = loadMoreControl(global.document);
      reportProgress({ passes: pass + 1, games: itemsById.size, cardsRead, otherLibraryClaims, productKeyClaims, duplicateAmazonClaims, loadMoreActivations });
      if (loadMore) {
        loadMore.scrollIntoView?.({ block: 'center', behavior: 'auto' });
        loadMore.click();
        loadMoreActivations += 1;
        unchangedPasses = 0;
        await wait(900);
        continue;
      }
      const root = global.document.scrollingElement ?? global.document.documentElement;
      const maximum = Math.max(0, root.scrollHeight - global.innerHeight);
      global.scrollTo({ top: Math.min(maximum, global.scrollY + Math.max(360, Math.floor(global.innerHeight * 0.82))), behavior: 'auto' });
      await wait(SCROLL_PAUSE_MS);
    }
    if (!sawCards) throw new Error('No readable claim cards were found. Open My Collection, select Games, and wait for it to load.');
    return { items: [...itemsById.values()], diagnostics: { cardsRead: processedCardIds.size, otherLibraryClaims, productKeyClaims, duplicateAmazonClaims, unreadableCards, loadMoreActivations } };
  }

  global.GalacticAmazonGames = { amazonGamesItemFromCardData, amazonGamesTitleKey, isLoadMoreText, deliveryTargetFromText, claimCardsFromDocument, fetchAmazonGames };
}(globalThis));
