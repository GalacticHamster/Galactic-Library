import './matching-policy.js';
/** Narrow presentation equality, plus separate review-only title discovery. */
function normalizeTitle(value) { return presentationTitle(value, 'other'); }
// Presentation equality is deliberately narrower than the discovery key:
// Keep articles, general Roman numerals, preview labels and +/# symbols.
// Roman numbers after an explicit volume/issue label are unit numbers.
export function presentationTitle(value, kind = 'book') { return globalThis.LibraryMatchingPolicy.presentationTitle(value, kind); }

function relationTitleParts(value, kind) {
  let title = String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const revision = globalThis.LibraryMatchingPolicy.revisionTitleParts(title, kind);
  if (revision.qualifier) title = revision.base;
  const edition = /\s*(?:[,;:\-\u2013\u2014]\s*)?((?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|revised|updated|expanded|annotated|new|deluxe)(?:\s+(?:revised|updated))?\s+(?:edition|ed\.?))\s*$/iu;
  let hasEdition = Boolean(revision.qualifier);
  if (kind === 'software') {
    const version = /^(.*?)\s*(?:[,;:\-\u2013\u2014]\s*)?(?:v(?:ersion)?\.?\s*\d+(?:\.\d+){0,3}|(?:19|20)\d{2})\s*$/iu.exec(title);
    return { primary: normalizeTitle(version?.[1]?.trim() || title), hasVersion: Boolean(revision.qualifier || version?.[1]?.trim()), subtitle: false, qualifier: false, hasEdition: false };
  }
  const stripEdition = () => {
    const found = edition.exec(title);
    if (found && found.index > 0) { title = title.slice(0, found.index).trim(); hasEdition = true; }
  };
  stripEdition();
  const qualifier = /^(.*?)\s*\(([^()]*)\)\s*$/u.exec(title);
  if (qualifier?.[1]?.trim()) {
    hasEdition ||= edition.test(' ' + qualifier[2]);
    title = qualifier[1].trim(); stripEdition();
  }
  const subtitle = /^(.*?)\s*:\s+(.+)$/u.exec(title);
  return { primary: normalizeTitle(subtitle?.[1]?.trim() || title), subtitle: Boolean(subtitle),
    qualifier: Boolean(qualifier), hasEdition, hasVersion: false };
}

const CANDIDATE_STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'for', 'with', 'by', 'vol', 'volume', 'edition', 'book', 'game', 'software']);
export function candidateTitleKeys(title, kind) {
  const words = normalizeTitle(title).split(' ').filter(word => word.length > 1 && !CANDIDATE_STOP_WORDS.has(word));
  const keys = [...words.map(word => 'word:' + word), ...globalThis.LibraryMatchingPolicy.relatedTitleKeys(title, kind)];
  for (const word of words) if (word.length >= 7 && !/\p{N}/u.test(word)) {
    keys.push('start:' + word.slice(0, 3), 'end:' + word.slice(-3));
  }
  keys.push('primary:' + relationTitleParts(title, kind).primary);
  return [...new Set(keys)];
}

function closeTitleSpelling(left, right) {
  const a = Array.from(left); const b = Array.from(right);
  const limit = Math.min(a.length, b.length) >= 16 ? 2 : 1;
  if (Math.min(a.length, b.length) < 8 || Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > limit) return false;
    previous = row;
  }
  return previous[b.length] <= limit;
}

// Candidate rules never prove ownership. Callers must still check media,
// known authors, runs and numbered units before presenting these warnings.
export function possibleTitleRelation(left, right, kind = 'book') {
  const a = normalizeTitle(left); const b = normalizeTitle(right);
  if (!a || !b) return '';
  const numbered = globalThis.LibraryMatchingPolicy.numberedCollectionRelation(left, right, kind);
  if (numbered !== null) return numbered;
  const presentation = globalThis.LibraryMatchingPolicy.relatedPresentationReason(left, right, kind);
  if (presentation) return presentation;
  if (a === b || presentationTitle(left, kind) === presentationTitle(right, kind)) return 'Related title presentation; identity needs review.';
  if (globalThis.LibraryMatchingPolicy.revisionWordingConflict(left, right, kind)) return 'Related complete base title with revision or version wording; identity needs review.';
  const access = value => value.replace(/\s+(?:preview|sample|excerpt|read now|demo|trial)$/iu, '').trim();
  if (access(a) === access(b)) return 'Related title, but preview/sample access does not establish the full product.';
  const numbers = value => (value.match(/\d+(?:\.\d+|\/\d+)?/gu) ?? []).join('|');
  const l = relationTitleParts(left, kind); const r = relationTitleParts(right, kind);
  if (l.primary && l.primary === r.primary) {
    if (kind === 'software' && (l.hasVersion || r.hasVersion) && l.primary.replace(/\s/gu, '').length >= 8) return 'Related software title with different version labels.';
    if (kind === 'book' || kind === 'audiobook') {
      if (l.hasEdition || r.hasEdition) return 'Related main title with different edition or subtitle wording.';
      // A bare title may have a longer store presentation, even if short.
      // Independently subtitled works are not inferred from a shared prefix.
      if (!(l.subtitle && r.subtitle) && (l.subtitle || r.subtitle || l.qualifier || r.qualifier)
        && l.primary.replace(/\s/gu, '').length >= 4) return 'One title is a shortened or qualified presentation of the other.';
      if (l.subtitle && r.subtitle) return '';
    }
  }
  if (kind === 'game') {
    const collection = value => {
      if (!/\b(?:collection|trilogy|complete pack|ultimate collection)\b/iu.test(value)) return '';
      return normalizeTitle(value).replace(/\b(?:the|complete|ultimate|collection|trilogy|pack)\b/gu, ' ').replace(/\s+/gu, ' ').trim();
    };
    for (const [base, other] of [[collection(left), b], [collection(right), a]]) {
      if (base.length >= 4 && (other === base || other.startsWith(base + ' '))) return 'This game may be included in the named library collection; contents need review.';
    }
  }
  // Do not turn different numbered releases/units into typo warnings.
  if (numbers(a) !== numbers(b)) return '';
  if (closeTitleSpelling(a, b)) return 'The titles have a small spelling difference; review the library item.';
  const words = value => new Set(value.split(' ').filter(word => !CANDIDATE_STOP_WORDS.has(word)));
  const aw = words(a); const bw = words(b);
  const overlap = [...aw].filter(word => bw.has(word)).length;
  if (Math.min(aw.size, bw.size) >= 3 && overlap / new Set([...aw, ...bw]).size >= 0.8) return 'The titles have a close word match; identity needs review.';
  return '';
}
