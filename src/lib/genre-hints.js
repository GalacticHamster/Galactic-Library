function compactText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

/**
 * Humble's purchase name is preserved with each entitlement. When it plainly
 * identifies a book/comic bundle, it is stronger evidence for a broad genre
 * than a partial title match from an outside catalogue. This is derived at
 * display time, so existing imports gain the hint without another sync.
 */
export function humbleBundleGenreHints(record) {
  if (record?.provider !== 'humble' || record?.mediaType !== 'book') return [];
  const bundle = compactText(record.metadata?.sourceBundle);
  if (!bundle || !/\b(?:comic(?:s| books?)?|manga|graphic novels?)\b/iu.test(bundle)) return [];
  return [{
    source: 'humble-bundle-name',
    confidence: 'explicit-bundle-name',
    category: 'Comics & Graphic Novels',
    evidence: bundle
  }];
}

function distinctText(values) {
  const seen = new Set();
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).flatMap((value) => {
    const text = compactText(value);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

export function libraryGenreSubjectValues(record) {
  return distinctText([
    record?.metadata?.enrichment?.openLibrary?.subjects,
    record?.metadata?.enrichment?.googleBooks?.categories,
    record?.metadata?.enrichment?.googleBooksGenreHint?.categories,
    humbleBundleGenreHints(record).map((hint) => hint.category)
  ]);
}

const BROAD_GENRE_RULES = [
  ['Comics & Graphic Novels', /\b(?:comics?|manga|graphic novels?|batman|superman|spider[ -]?man|x[ -]?men|aquaman|animal man|marvel|dc comics)\b/iu],
  ['Science Fiction & Fantasy', /\b(?:science fiction|sci[ -]?fi|fantasy|space opera|cyberpunk|dystopi[acn])\b/iu],
  ['History', /\b(?:history|historical|military history|world war|ancient history|medieval)\b/iu],
  ['Mystery & Thriller', /\b(?:mystery|thriller|crime|detective|suspense)\b/iu],
  ['Romance', /\b(?:romance|love stories?)\b/iu],
  ['Horror', /\b(?:horror|ghost stories?|occult)\b/iu],
  ['Biography & Memoir', /\b(?:biograph(?:y|ies)|memoir|autobiograph(?:y|ies))\b/iu],
  ['Business & Finance', /\b(?:business|finance|economics|investing|management)\b/iu],
  ['Technology & Computing', /\b(?:computers?|programming|software|technology|internet)\b/iu],
  ['Cooking & Food', /\b(?:cook(?:ing|books?)?|food|recipes?|culinary)\b/iu],
  ['Health & Fitness', /\b(?:health|fitness|diet|nutrition|wellness)\b/iu],
  ['Religion & Spirituality', /\b(?:religion|spirituality|christian|bible|theology)\b/iu],
  ['Children & Young Adult', /\b(?:juvenile|young adult|children|kids)\b/iu],
  ['Arts & Photography', /\b(?:art|photography|music|performing arts)\b/iu],
  ['Fiction & Literature', /\b(?:fiction|literature|literary)\b/iu],
  ['Nonfiction', /\b(?:nonfiction|non-fiction)\b/iu]
];

export function libraryBroadGenreValues(record) {
  const evidence = libraryGenreSubjectValues(record).join(' · ');
  const genres = BROAD_GENRE_RULES.filter(([, pattern]) => pattern.test(evidence)).map(([genre]) => genre);
  const specific = genres.filter((genre) => genre !== 'Fiction & Literature' && genre !== 'Nonfiction');
  return specific.length ? specific : genres;
}
