/* Shared allowlist for bibliographic data exposed by provider responses. */
(function attachProviderMetadata(global) {
  const text = (value, max = 500) => typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/gu, ' ').trim().slice(0, max) : '';
  const list = (value) => [...new Set((Array.isArray(value) ? value : [value]).map((entry) => text(typeof entry === 'object' ? entry?.name ?? entry?.title : entry)).filter(Boolean))].slice(0, 50);
  function extract(value) {
    if (!value || typeof value !== 'object') return {};
    const result = {};
    const fields = {
      authors: list(value.authors ?? value.author), series: list(value.series ?? value.seriesName),
      isbn: list(value.isbn ?? value.isbns ?? value.isbn13 ?? value.isbn10 ?? value.externalIds?.isbn),
      contributors: (Array.isArray(value.contributors) ? value.contributors : []).slice(0, 50).map((entry) => ({name:text(entry?.name),role:text(entry?.role, 80)})).filter((entry) => entry.name)
    };
    for (const [key, entries] of Object.entries(fields)) if (entries.length) result[key] = entries;
    for (const key of ['asin', 'publisher', 'language', 'edition', 'volume', 'issue', 'unitType', 'run', 'seriesYear', 'publicationDate', 'format', 'collects', 'contentsStatement']) {
      const entry = text(value[key]); if (entry) result[key] = entry;
    }
    return result;
  }
  global.GalacticProviderMetadata = {extract};
}(globalThis));
