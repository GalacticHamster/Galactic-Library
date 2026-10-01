import { names, validIsbn } from './identity.js';

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

function workKey(value) {
  const key = compactText(value);
  return /^\/works\/OL\d+W$/iu.test(key) ? key : '';
}

export function openLibrarySearchUrl({ title, authors = [], isbn = [] }) {
  const url = new URL('https://openlibrary.org/search.json');
  const identifier=names(isbn).map(validIsbn).find(Boolean);
  if(identifier)url.searchParams.set('q',`isbn:${identifier}`);
  else url.searchParams.set('title', compactText(title));
  const author = stringValues(authors, 1)[0];
  if (author&&!identifier) url.searchParams.set('author', author);
  url.searchParams.set('fields', 'key,title,author_name,subject,first_publish_year,isbn,edition_key');
  url.searchParams.set('limit', '5');
  return url.toString();
}

export function openLibraryCandidatesFromSearch(value) {
  const seen = new Set();
  const candidates = [];
  for (const document of Array.isArray(value?.docs) ? value.docs : []) {
    const key = workKey(document?.key);
    const title = compactText(document?.title);
    if (!key || !title || seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      workKey: key,
      title,
      authors: stringValues(document?.author_name, 12),
      subjects: stringValues(document?.subject, 30),
      firstPublishYear: Number.isInteger(document?.first_publish_year) ? document.first_publish_year : null,
      isbn: stringValues(document?.isbn, 12),
      editionKeys: stringValues(document?.edition_key, 12),
      sourceUrl: `https://openlibrary.org${key}`
    });
    if (candidates.length === 5) break;
  }
  return candidates;
}

export function openLibraryEnrichment(candidate, appliedAt = new Date().toISOString()) {
  if (!candidate?.workKey || !candidate?.title) throw new Error('Open Library result is missing its work identity.');
  return {
    source: 'open-library',
    workKey: candidate.workKey,
    sourceUrl: candidate.sourceUrl,
    title: compactText(candidate.title),
    authors: stringValues(candidate.authors, 12),
    subjects: stringValues(candidate.subjects, 30),
    firstPublishYear: Number.isInteger(candidate.firstPublishYear) ? candidate.firstPublishYear : null,
    isbn: stringValues(candidate.isbn, 12),
    editionKeys: stringValues(candidate.editionKeys, 12),
    appliedAt
  };
}
