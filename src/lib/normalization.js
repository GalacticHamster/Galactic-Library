const EDITION_SUFFIXES = [
  ['game of the year edition', 'game of the year'],
  ['game of the year', 'game of the year'],
  ['ultimate edition', 'ultimate'],
  ['complete edition', 'complete'],
  ['definitive edition', 'definitive'],
  ['deluxe edition', 'deluxe'],
  ['remastered', 'remastered'],
  ['remake', 'remake']
];

const ROMAN_NUMERALS = new Map([
  ['i', '1'], ['ii', '2'], ['iii', '3'], ['iv', '4'], ['v', '5'],
  ['vi', '6'], ['vii', '7'], ['viii', '8'], ['ix', '9'], ['x', '10']
]);

/**
 * Produces a stable comparison key without guessing that separate editions
 * are the same product. `baseTitle` is useful for future review candidates;
 * `normalizedTitle` is the only automatic V0.1 match key.
 */
export function normalizeGameTitle(value) {
  let title = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[®™©]/gu, ' ')
    .replace(/[’'`]/gu, '')
    .replace(/&/gu, ' and ')
    // These are provider presentation/format labels, not a different comic.
    // Keep substantive editions (for example Deluxe Edition) distinct.
    .replace(/\(\s*plus\s+extra\s+content\s*\)\s*$/giu, ' ')
    .replace(/\b(?:tpb|trade\s+paperback)\s*$/giu, ' ')
    .replace(/\bvolume\b/giu, 'vol')
    .replace(/\b(?:the|a|an)\s+/u, '')
    .replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/gu, (match) => ROMAN_NUMERALS.get(match) ?? match)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  let edition = null;
  for (const [suffix, normalizedEdition] of EDITION_SUFFIXES) {
    if (!title.endsWith(` ${suffix}`) && title !== suffix) continue;
    title = title === suffix ? '' : title.slice(0, -suffix.length).trim();
    edition = normalizedEdition;
    break;
  }

  return {
    normalizedTitle: [title, edition].filter(Boolean).join(' ').trim(),
    baseTitle: title,
    edition
  };
}

export function titleKey(value) {
  return normalizeGameTitle(value).normalizedTitle;
}
