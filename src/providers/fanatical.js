/* Fanatical import projection. Authentication happens only in the page's MAIN
 * world; this isolated-world code sees the already allowlisted DTO. */
(function attachFanaticalImporter(global) {
  'use strict';

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function safeList(value, max = 30) {
    return [...new Set((Array.isArray(value) ? value : []).map((entry) => compactText(entry)).filter(Boolean))].slice(0, max);
  }

  function fanaticalMediaType(value) {
    const type = compactText(value).toLocaleLowerCase();
    if (type === 'game') return 'game';
    if(type==='software'||type==='asset')return 'software';
    if (type === 'book' || type.includes('comic')) return 'book';
    if (type === 'audiobook' || (type.includes('audio') && type.includes('book'))) return 'audiobook';
    return null;
  }

  function fanaticalItemsFromProjection(value) {
    const itemsById = new Map();
    for (const source of Array.isArray(value?.items) ? value.items : []) {
      const providerItemId = compactText(source?.sourceItemId);
      const title = compactText(source?.title);
      const mediaType = fanaticalMediaType(source?.mediaType);
      if (!providerItemId || !title || !mediaType) continue;
      const steamAppId = compactText(source?.externalIds?.steamAppId);
      const isbn = compactText(source?.externalIds?.isbn);
      itemsById.set(providerItemId, {
        providerItemId,
        title,
        mediaType,
        ownership: 'owned',
        platform: safeList(source?.platforms),
        acquiredAt: typeof source?.purchaseDate === 'string' && !Number.isNaN(Date.parse(source.purchaseDate)) ? source.purchaseDate : null,
        metadata: {
          ...(global.GalacticProviderMetadata?.extract(source?.bibliographic) ?? {}),
          source: 'fanatical-order-history',
          bundleId: compactText(source?.bundle?.sourceItemId),
          bundleTitle: compactText(source?.bundle?.title),
          bundleSlug: compactText(source?.bundle?.slug),
          slug: compactText(source?.slug),
          drm: safeList(source?.drm),
          formats: safeList(source?.formats),
          ...(steamAppId ? { steamAppId } : {}),
          ...(isbn ? { isbn } : {})
        }
      });
    }
    return [...itemsById.values()];
  }

  global.GalacticFanatical = { fanaticalMediaType, fanaticalItemsFromProjection };
}(globalThis));
