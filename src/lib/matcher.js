import { titleKey } from './normalization.js';

/** Exact normalized matches only. Near matches remain absent until a review
 * workflow exists; claiming ownership incorrectly is worse than missing it. */
function gameEditionBase(title) {
  const key = titleKey(title);
  // Named store editions such as "Bastille Edition" describe a release
  // variant. They are useful review candidates but must never be exact matches.
  return key.replace(/\b[a-z0-9]+\s+edition$/u, '').trim();
}

function publicMatch(item) {
  return {
    provider: item.provider,
    providerItemId: item.providerItemId,
    title: item.title,
    ownership: item.ownership,
    confidence: 1
  };
}

export function matchItems(items, requestedItems) {
  const byTitle = new Map();
  const byGameEditionBase = new Map();
  for (const item of Object.values(items)) {
    const key = `${item.mediaType}:${item.normalizedTitle}`;
    const matches = byTitle.get(key) ?? [];
    matches.push(item);
    byTitle.set(key, matches);
    if (item.mediaType === 'game') {
      const base = gameEditionBase(item.title);
      if (!base) continue;
      const editionMatches = byGameEditionBase.get(base) ?? [];
      editionMatches.push(item);
      byGameEditionBase.set(base, editionMatches);
    }
  }

  return requestedItems.map((request) => {
    const mediaType = String(request?.mediaType ?? 'game').trim().toLowerCase();
    const normalizedTitle = titleKey(request?.title);
    const matches = normalizedTitle ? (byTitle.get(`${mediaType}:${normalizedTitle}`) ?? []) : [];
    const editionBase = mediaType === 'game' ? gameEditionBase(request?.title) : '';
    const possibleMatches = !matches.length && editionBase
      ? (byGameEditionBase.get(editionBase) ?? []).filter((item) => item.normalizedTitle !== normalizedTitle)
      : [];
    return {
      requestId: request?.requestId ?? null,
      owned: matches.some((item) => item.ownership === 'owned' || item.ownership === 'claimed'),
      confidence: matches.length ? 1 : 0,
      matches: matches.map(publicMatch),
      possibleMatches: possibleMatches.map(publicMatch)
    };
  });
}
