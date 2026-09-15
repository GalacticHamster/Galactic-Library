import { titleKey } from './normalization.js';

/** Exact normalized matches only. Near matches remain absent until a review
 * workflow exists; claiming ownership incorrectly is worse than missing it. */
export function matchItems(items, requestedItems) {
  const byTitle = new Map();
  for (const item of Object.values(items)) {
    const key = `${item.mediaType}:${item.normalizedTitle}`;
    const matches = byTitle.get(key) ?? [];
    matches.push(item);
    byTitle.set(key, matches);
  }

  return requestedItems.map((request) => {
    const mediaType = String(request?.mediaType ?? 'game').trim().toLowerCase();
    const normalizedTitle = titleKey(request?.title);
    const matches = normalizedTitle ? (byTitle.get(`${mediaType}:${normalizedTitle}`) ?? []) : [];
    return {
      requestId: request?.requestId ?? null,
      owned: matches.some((item) => item.ownership === 'owned' || item.ownership === 'claimed'),
      confidence: matches.length ? 1 : 0,
      matches: matches.map((item) => ({
        provider: item.provider,
        providerItemId: item.providerItemId,
        title: item.title,
        ownership: item.ownership,
        confidence: 1
      }))
    };
  });
}
