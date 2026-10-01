/** Identity evidence is separate from title similarity and entitlement. */
export const compact = (value, max = 500) => typeof value === 'string' || typeof value === 'number'
  ? String(value).normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, max) : '';
export const names = (value) => [...new Set((Array.isArray(value) ? value : [value]).map((entry) => compact(typeof entry === 'object' ? entry?.name : entry)).filter(Boolean))].slice(0, 50);
export const identityKey = (value) => compact(value).toLocaleLowerCase().replace(/&/gu, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function validIsbn(value) {
  const isbn = compact(value).toUpperCase().replace(/[-\s]/gu, '');
  if (/^\d{9}[\dX]$/u.test(isbn)) {
    if ([...isbn].reduce((sum, digit, index) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0) % 11) return '';
    const base = `978${isbn.slice(0, 9)}`;
    const check = (10 - [...base].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10) % 10;
    return `${base}${check}`;
  }
  if (!/^97[89]\d{10}$/u.test(isbn)) return '';
  return [...isbn].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10 === 0 ? isbn : '';
}

export function titleIdentity(title, mediaType = 'book') {
  let base = compact(title);
  // Provider presentation labels are candidates, never edition identity.
  base = base.replace(/\s*:\s*[^:]*\b(?:book|volume|vol\.?)\s*\d+\s*$/iu, (suffix, offset) => /\b(?:vol(?:ume)?\.?|book)\s*\d+/iu.test(base.slice(0, offset)) ? '' : suffix);
  let edition = '';
  const bookEdition = /(?:\s*[,;:\u2013\u2014-]\s*|\s+\(?|\s*\()((?:(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:(?:revised|updated|anniversary)\s+)?|(?:revised|updated|expanded|annotated|deluxe|definitive|anniversary|limited)\s+)?(?:edition|ed\.?))\)?\s*$/iu;
  if (mediaType === 'game') {
    const suffix = /(?:\s*[:\u2013\u2014-]?\s+)((?:game of the year|digital deluxe|deluxe|gold|platinum|ultimate|complete|standard|premium|definitive|legendary|anniversary|collector['’]?s|enhanced)(?:\s+edition)?|(?:[\p{L}\p{N}]+\s+)?edition|remastered|remake|goty)\s*$/iu.exec(base);
    if (suffix) { edition = identityKey(suffix[1]).replace(/\s+edition$/u, ''); base = base.slice(0, suffix.index); }
  } else {
    const suffix = bookEdition.exec(base);
    if (suffix && suffix.index > 0) { edition = identityKey(suffix[1]); base = base.slice(0, suffix.index); }
  }
  base = base.replace(/\s*\((?:pdf|epub|digital|paperback|hardcover)[^)]*\)\s*$/iu, '').replace(/\s+(?:tpb|trade paperback)\s*$/iu, '');
  const unitMatch = /^(.*?)\s*(?:[:,-]\s*)?(?:(vol(?:ume)?s?\.?|books?)\s*|(#)\s*)([\d]+(?:\.\d+)?|\d+\/\d+)(?:\s*[:,-].*)?$/iu.exec(base);
  return {
    base: identityKey(base), edition,
    series: unitMatch ? compact(unitMatch[1]) : '',
    unitType: unitMatch ? (unitMatch[3] ? 'issue' : 'volume') : '',
    unit: unitMatch?.[4] ?? ''
  };
}

export function identityEvidence(item) {
  const metadata = item?.metadata ?? {};
  const google = metadata.enrichment?.googleBooks ?? {};
  const open = metadata.enrichment?.openLibrary ?? {};
  const local = metadata.enrichment?.localMetadata?.approved===true?metadata.enrichment.localMetadata:{};
  const parts = titleIdentity(item?.title, item?.mediaType);
  // Work-level Open Library ISBN lists must never identify the owned edition.
  const isbn = names([...(names(metadata.isbn)), ...(names(metadata.isbns)), ...(names(google.isbn)),...names(local.isbn)]).map(validIsbn).filter(Boolean);
  return {
    isbn: [...new Set(isbn)],
    asin: compact(metadata.asin || (item?.provider === 'kindle' ? item.providerItemId : ''), 32),
    steamAppId: /^\d+$/u.test(String(metadata.steamAppId ?? '')) ? String(metadata.steamAppId) : '',
    workIds: names([metadata.workId, open.workKey,local.workKey]),
    authors: names(metadata.authors?.length ? metadata.authors : google.authors?.length ? google.authors :local.authors?.length?local.authors:open.approved===true?open.authors:[]),
    contributors: (Array.isArray(metadata.contributors)&&metadata.contributors.length ? metadata.contributors : local.contributors??[]).slice(0, 50).map((entry) => ({name: compact(entry?.name), role: compact(entry?.role, 80)})).filter((entry) => entry.name),
    language: compact(metadata.language || google.language||local.language, 80).toLowerCase(),
    publisher: compact(metadata.publisher || google.publisher||local.publisher),
    series: names(metadata.series?.length ? metadata.series : local.series?.length?local.series:parts.series),
    run: compact(metadata.run || metadata.seriesYear||local.run, 100),
    unitType: compact(metadata.unitType || parts.unitType||local.unitType, 20),
    unit: compact(metadata.volume ?? metadata.issue ?? (parts.unit||local.volume||local.issue), 40),
    edition: compact(metadata.edition || parts.edition||local.edition),
    candidateKey: parts.base,
    source: compact(metadata.source || item?.provider, 100)
  };
}

const overlap = (left, right) => left.some((value) => right.includes(value));
export function identityConflicts(left, right, { edition = true } = {}) {
  const a = identityEvidence(left); const b = identityEvidence(right); const conflicts = [];
  if (left.mediaType !== right.mediaType) conflicts.push('media type');
  if (a.authors.length && b.authors.length && !overlap(a.authors.map(identityKey), b.authors.map(identityKey))) conflicts.push('authors');
  for (const key of ['language', 'run', 'unitType', 'unit']) if (a[key] && b[key] && identityKey(a[key]) !== identityKey(b[key])) conflicts.push(key);
  if (edition && a.edition !== b.edition && (a.edition || b.edition)) conflicts.push('edition');
  if (edition && a.isbn.length && b.isbn.length && !overlap(a.isbn, b.isbn)) conflicts.push('ISBN');
  if (edition && a.asin && b.asin && a.asin!==b.asin) conflicts.push('ASIN');
  return conflicts;
}

export function sameEditionEvidence(left, right) {
  if (identityConflicts(left, right).length) return '';
  const a = identityEvidence(left); const b = identityEvidence(right);
  if (a.isbn.length && overlap(a.isbn, b.isbn)) return 'shared validated ISBN';
  if (a.asin && a.asin === b.asin) return 'shared ASIN';
  if (left.normalizedTitle !== right.normalizedTitle) return '';
  if (left.mediaType === 'game') return 'matching game title and compatible edition';
  if (a.authors.length && overlap(a.authors.map(identityKey), b.authors.map(identityKey))) return 'matching title and author';
  return '';
}

/** Compare sources individually: a union of two conflicting ISBN lists must not
 * conceal a disagreement with the provider or an already selected edition. */
export function editionEnrichmentConflicts(record,candidate){
  const provider={...record,metadata:{...record.metadata,enrichment:{}}};
  const evidence=[provider,record];
  for(const [kind,entry]of Object.entries(record.metadata?.enrichment??{})){
    if(kind!=='googleBooks'&&!(kind==='localMetadata'&&entry.approved===true))continue;
    evidence.push({title:[entry.title||record.title,entry.subtitle].filter(Boolean).join(': '),mediaType:record.mediaType,metadata:entry});
  }
  return [...new Set(evidence.flatMap(source=>identityConflicts(source,candidate)))];
}

export function relationshipReason(left, right) {
  if (left.mediaType !== right.mediaType) return '';
  const a = identityEvidence(left); const b = identityEvidence(right);
  if (identityConflicts(left, right, {edition:false}).some((key) => ['authors', 'unit', 'unitType', 'run'].includes(key))) return '';
  if (a.workIds.length && overlap(a.workIds, b.workIds)) return 'Shared work identity; edition ownership is not established.';
  if (a.candidateKey && a.candidateKey === b.candidateKey) return 'Related title or edition; compare the owned and offered titles.';
  return '';
}
