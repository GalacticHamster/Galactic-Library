import { normalizeGameTitle } from './normalization.js';
import { identityConflicts, identityEvidence, validIsbn } from './identity.js';

function compactText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function stringValues(value, limit = 30) {
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : [value]) {
    const text = compactText(entry);
    if (text) seen.add(text);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

function personKey(value) {
  return compactText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function personTokens(value) {
  return personKey(value).split(' ').filter(Boolean);
}

const BOOK_NUMBER_WORDS = new Map([
  ['one', '1'], ['two', '2'], ['three', '3'], ['four', '4'], ['five', '5'],
  ['six', '6'], ['seven', '7'], ['eight', '8'], ['nine', '9'], ['ten', '10'],
  ['eleven', '11'], ['twelve', '12'], ['thirteen', '13'], ['fourteen', '14'], ['fifteen', '15'],
  ['sixteen', '16'], ['seventeen', '17'], ['eighteen', '18'], ['nineteen', '19'], ['twenty', '20']
]);

function bookTitleFormatVariant(value) {
  return compactText(value)
    // Publisher metadata alternates between an initialism (JMS) and its
    // punctuated form (J.M.S.). Keep this separate from general ownership
    // matching, where that looser rule would be inappropriate.
    .replace(/(?:\b[A-Za-z]\.[\s]*){2,}/gu, (initialism) => `${initialism.replace(/[^A-Za-z]/gu, '')}${/\s$/u.test(initialism) ? ' ' : ''}`)
    // A collection's stated volume number is semantically identical whether
    // the publisher spelled it out or supplied a digit.
    .replace(/\b(book|vol(?:ume)?)\.?\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/giu, (match, label, number) => `${label} ${BOOK_NUMBER_WORDS.get(number.toLocaleLowerCase()) ?? number}`);
}

function titleKeys(value) {
  const title = compactText(value);
  const variants = [
    title,
    title.replace(/\s*\(([^)]*)\)\s*$/u, (suffix,label)=>protectedTitle(label)?suffix:''),
    // Some provider series labels contain parentheses themselves. Retain the
    // original too, but offer a variant with the entire trailing label gone.
    title.replace(/\s+\((.*)\)\s*$/u, (suffix,label)=>protectedTitle(label)?suffix:''),
    title.replace(/\s*\(([^)]*)\)/gu, (suffix,label)=>protectedTitle(label)?suffix:' ')
  ];
  return [...new Set(variants.map(bookTitleFormatVariant).map((entry) => normalizeGameTitle(entry).normalizedTitle).filter(Boolean))];
}

function protectedTitle(value){return /\d|\b(?:edition|ed\.?|vol(?:ume)?|book|issue|annual|special|omnibus|deluxe|ultimate|complete|integral|collector|revised|expanded)\b/iu.test(bookTitleFormatVariant(value));}

function titleUnits(value){
  const title=bookTitleFormatVariant(value);
  return [...title.matchAll(/(?:\b(vol(?:ume)?s?\.?|books?|issues?)\s*|(#)\s*)(\d+(?:\.\d+)?|\d+\/\d+)/giu)].filter(match=>!match[2]||!title.slice(0,match.index).includes(':')).map(match=>`${match[2]||/^issue/iu.test(match[1]??'')?'issue':'volume'}:${match[3]}`).sort();
}
function editionQualifiers(value){return [...new Set((bookTitleFormatVariant(value).toLowerCase().match(/\b(?:omnibus|deluxe|ultimate|complete|integral|collector|revised|expanded|anniversary)\b/gu)??[]))].sort();}

function hasIssueMarker(value) {
  // A provider subtitle often contains sales copy such as "#1 New York Times
  // Bestseller". It is not an issue number and must not prevent an otherwise
  // exact main-title match. Only the portion before the first subtitle colon
  // determines whether this is an issue title.
  const mainTitle = compactText(value).split(':', 1)[0];
  return /(?:\s#\s*\d+\b|\bissue\s+\d+\b)/iu.test(mainTitle);
}

function titleMatchKind(queryTitle, candidateTitle) {
  const queryKeys = titleKeys(queryTitle);
  const candidateKeys = titleKeys(candidateTitle);
  if (queryKeys.some((title) => candidateKeys.includes(title))) return 'exact';
  const query = compactText(queryTitle);
  if (!hasIssueMarker(query)) {
    const extended = queryKeys.some((queryKey) => candidateKeys.some((candidateKey) => {
      const shorter = queryKey.length <= candidateKey.length ? queryKey : candidateKey;
      const longer = queryKey.length <= candidateKey.length ? candidateKey : queryKey;
      const shorterWords = shorter.split(' ').filter(Boolean).length;
      return shorterWords >= 4 && shorter.length / longer.length >= 0.65 && (longer.startsWith(`${shorter} `) || longer.endsWith(` ${shorter}`));
    }));
    if (extended) return 'extended';
  }
  if (hasIssueMarker(query) || !query.includes(':')) return '';
  const beforeSubtitle = compactText(query.split(':', 1)[0]);
  const baseKeys = titleKeys(beforeSubtitle);
  return baseKeys.some((title) => candidateKeys.includes(title)) ? 'subtitle' : '';
}

function isbnValues(value) {
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : [value]) {
    const isbn = validIsbn(entry?.identifier ?? entry);
    if (isbn) seen.add(isbn);
    if (seen.size >= 20) break;
  }
  return [...seen];
}

export function googleBooksSearchUrl({ title, authors = [], isbn = [], publisher='',volume='',issue='',apiKey }) {
  const bookTitle = compactText(title);
  const key = compactText(apiKey);
  if (!bookTitle || !key) throw new Error('Google Books needs a book title and API key.');
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  const author = stringValues(authors, 1)[0];
  const identifier=isbnValues(isbn)[0];
  const searchTitle=titleUnits(bookTitle).length?bookTitle:`${bookTitle}${volume?` Vol. ${volume}`:issue?` #${issue}`:''}`;
  url.searchParams.set('q', identifier?`isbn:${identifier}`:[`intitle:${searchTitle}`, author ? `inauthor:${author}` : '',publisher?`inpublisher:${compactText(publisher)}`:''].filter(Boolean).join(' '));
  url.searchParams.set('printType', 'books');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('projection', 'full');
  url.searchParams.set('key', key);
  return url.toString();
}

export function googleBooksCandidatesFromSearch(value) {
  const seen = new Set();
  const candidates = [];
  for (const entry of Array.isArray(value?.items) ? value.items : []) {
    const volumeId = compactText(entry?.id);
    const info = entry?.volumeInfo ?? {};
    const title = compactText(info.title);
    if (!volumeId || !title || seen.has(volumeId)) continue;
    seen.add(volumeId);
    candidates.push({
      volumeId,
      title,
      subtitle: compactText(info.subtitle),
      authors: stringValues(info.authors, 12),
      categories: stringValues(info.categories, 20),
      isbn: isbnValues(info.industryIdentifiers),
      publisher: compactText(info.publisher),
      publishedDate: compactText(info.publishedDate),
      pageCount: Number.isInteger(info.pageCount) ? info.pageCount : null,
      language: compactText(info.language),
      sourceUrl: `https://books.google.com/books?id=${encodeURIComponent(volumeId)}`
    });
    if (candidates.length === 5) break;
  }
  return candidates;
}

export function isHighConfidenceGoogleBooksMatch(query, candidate) {
  const identifiers=isbnValues(query?.isbn);
  const matchingIdentifier=identifiers.some(isbn=>isbnValues(candidate?.isbn).includes(isbn));
  const left={title:query?.title,mediaType:'book',metadata:query};
  const candidateTitle=[candidate?.title,candidate?.subtitle].filter(Boolean).join(': ');
  const right={title:candidateTitle,mediaType:'book',metadata:candidate};
  const conflicts=identityConflicts(left,right).filter(key=>key!=='authors'&&!(key==='edition'&&matchingIdentifier&&!identityEvidence(left).edition));
  if(conflicts.length)return false;
  const a=titleUnits(query?.title);const b=titleUnits(candidateTitle);
  if(!a.length&&query?.volume)a.push(`volume:${query.volume}`);if(!a.length&&query?.issue)a.push(`issue:${query.issue}`);
  if(a.length&&b.length&&JSON.stringify(a)!==JSON.stringify(b))return false;
  if(!matchingIdentifier&&(JSON.stringify(a)!==JSON.stringify(b)||JSON.stringify(editionQualifiers(query?.title))!==JSON.stringify(editionQualifiers(candidateTitle))))return false;
  if(identifiers.length){
    if(!matchingIdentifier)return false;
    return !query.authors?.length||!candidate.authors?.length||isGoogleBooksAuthorMatch(query,candidate);
  }
  if (!titleMatchKind(query?.title, candidateTitle)&&!titleMatchKind(query?.title,candidate?.title)) return false;
  return isGoogleBooksAuthorMatch(query, candidate);
}

function isGoogleBooksAuthorMatch(query, candidate) {
  const queryAuthors = stringValues(query?.authors, 12).map(personKey).filter(Boolean);
  const queryAuthorTokens = stringValues(query?.authors, 12).map(personTokens);
  const candidateAuthors = stringValues(candidate?.authors, 12).map(personKey).filter(Boolean);
  return queryAuthors.length > 0 && candidateAuthors.some((author) => {
    if (queryAuthors.includes(author)) return true;
    const candidateTokens = personTokens(author);
    return candidateTokens.length >= 2 && queryAuthorTokens.some((tokens) => candidateTokens.every((token) => tokens.includes(token)));
  });
}

export function googleBooksMatchClassification(query, candidates) {
  const values = Array.isArray(candidates) ? candidates : [];
  if (!values.length) return 'no-results';
  const titleMatches = values.filter((candidate) => titleMatchKind(query?.title, candidate?.title));
  if (!titleMatches.length) return 'title-variant';
  return titleMatches.some((candidate) => isGoogleBooksAuthorMatch(query, candidate)) ? 'exact' : 'author-variant';
}

export function highConfidenceGoogleBooksCandidate(query, candidates) {
  const matches=(Array.isArray(candidates)?candidates:[]).filter(candidate=>isHighConfidenceGoogleBooksMatch(query,candidate));
  const distinct=new Map(matches.map(candidate=>[candidate.volumeId,candidate]));
  return distinct.size===1?[...distinct.values()][0]:null;
}

function isGoogleBooksTitleStemMatch(queryTitle, candidateTitle) {
  const queryKeys = titleKeys(queryTitle);
  const candidateKeys = titleKeys(candidateTitle);
  return candidateKeys.some((candidateKey) => candidateKey.length >= 5 && queryKeys.some((queryKey) => (
    queryKey !== candidateKey && queryKey.startsWith(`${candidateKey} `)
  )));
}

// This is deliberately not an identity match. A series or collection title
// can be enough to borrow a broad category after its author also matches, but
// it is never enough to borrow edition-specific metadata from the result.
export function googleBooksGenreHintCandidate(query, candidates) {
  return (Array.isArray(candidates) ? candidates : []).find((candidate) => (
    stringValues(candidate?.categories, 20).length > 0
    && isGoogleBooksAuthorMatch(query, candidate)
    && isGoogleBooksTitleStemMatch(query?.title, candidate?.title)
  )) ?? null;
}

export function googleBooksEnrichment(candidate, appliedAt = new Date().toISOString()) {
  if (!candidate?.volumeId || !candidate?.title) throw new Error('Google Books result is missing its volume identity.');
  return {
    source: 'google-books',
    volumeId: candidate.volumeId,
    sourceUrl: `https://books.google.com/books?id=${encodeURIComponent(candidate.volumeId)}`,
    title: compactText(candidate.title),
    subtitle: compactText(candidate.subtitle),
    authors: stringValues(candidate.authors, 12),
    categories: stringValues(candidate.categories, 20),
    isbn: isbnValues(candidate.isbn),
    publisher: compactText(candidate.publisher),
    publishedDate: compactText(candidate.publishedDate),
    pageCount: Number.isInteger(candidate.pageCount) ? candidate.pageCount : null,
    language: compactText(candidate.language),
    appliedAt
  };
}

export function googleBooksGenreHint(candidate, appliedAt = new Date().toISOString()) {
  const categories = stringValues(candidate?.categories, 20);
  if (!candidate?.volumeId || !candidate?.title || !categories.length) throw new Error('Google Books result is missing usable genre categories.');
  return {
    source: 'google-books',
    confidence: 'author-and-title-stem',
    candidateVolumeId: candidate.volumeId,
    candidateTitle: compactText(candidate.title),
    sourceUrl: `https://books.google.com/books?id=${encodeURIComponent(candidate.volumeId)}`,
    categories,
    appliedAt
  };
}
