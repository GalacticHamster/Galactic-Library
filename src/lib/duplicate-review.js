import { titleKey } from './normalization.js';
import { identityEvidence, sameEditionEvidence } from './identity.js';

function compactText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function authorNames(item) {
  const authors = Array.isArray(item?.metadata?.authors) ? item.metadata.authors : [];
  return new Set(authors.map((author) => compactText(author).toLocaleLowerCase()).filter(Boolean));
}

function sharedAuthors(left, right) {
  const leftAuthors = authorNames(left);
  const rightAuthors = authorNames(right);
  return [...leftAuthors].filter((author) => rightAuthors.has(author));
}

/** Audible and Kindle commonly append a provider presentation label such as
 * `: Series Name, Book 1`. This is safe only as a review candidate signal;
 * it never changes an automatic ownership match. */
function titleWithoutProviderSeriesLabel(item) {
  if (!['audible', 'kindle'].includes(item.provider)) return null;
  const title = compactText(item.title);
  const withoutColonSuffix = title.replace(/\s*:\s*[^:]*?\b(?:book|volume|vol\.?)\s*\d+\s*$/iu, '').trim();
  const withoutParentheticalSuffix = withoutColonSuffix.replace(/\s*\([^)]*?\b(?:book|volume|vol\.?)\s*\d+\)\s*$/iu, '').trim();
  if (!withoutParentheticalSuffix || withoutParentheticalSuffix === title) return null;
  const key = titleKey(withoutParentheticalSuffix);
  return key && key !== item.normalizedTitle ? key : null;
}

function candidateId(left, right) {
  return [left.id, right.id].sort().join('\u0000');
}

function candidateForPair(left, right, reasons) {
  const authorOverlap = sharedAuthors(left, right);
  const confidence = reasons.some((reason) => reason.code === 'provider-series-label') ? 0.98 : 0.9;
  if (authorOverlap.length) {
    reasons.push({ code: 'shared-author', text: `Shared author: ${authorOverlap.join(', ')}.` });
  }
  return {
    id: candidateId(left, right),
    itemIds: [left.id, right.id].sort(),
    mediaType: left.mediaType,
    confidence: Math.min(0.99, confidence + (authorOverlap.length ? 0.01 : 0)),
    reasons
  };
}

function addCandidate(candidates, left, right, reason) {
  if (left.id === right.id || left.mediaType !== right.mediaType || sameEditionEvidence(left,right)) return;
  const id = candidateId(left, right);
  const existing = candidates.get(id);
  if (existing) {
    if (!existing.reasons.some((item) => item.code === reason.code)) existing.reasons.push(reason);
    if(reason.code==='provider-series-label')existing.confidence=sharedAuthors(left,right).length?0.99:0.98;
    return;
  }
  candidates.set(id, candidateForPair(left, right, [reason]));
}

function pairsInGroup(items, candidates, reason) {
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      addCandidate(candidates, items[leftIndex], items[rightIndex], reason);
    }
  }
}

export function findDuplicateCandidates(providerItems, manualMatchDecisions = {}) {
  const records = Object.values(providerItems).filter((item) => item.mediaType !== 'game-addon');
  const candidates = new Map();
  const byBaseTitle = new Map();
  const byPresentationTitle = new Map();
  for (const item of records) {
    const baseKey = `${item.mediaType}\u0000${identityEvidence(item).candidateKey || item.baseTitle}`;
    // A plain title can still be compared with another provider's edition.
    const group = byBaseTitle.get(baseKey) ?? [];
    group.push(item);
    byBaseTitle.set(baseKey, group);
    const presentationKey = titleWithoutProviderSeriesLabel(item);
    if (presentationKey) {
      const group = byPresentationTitle.get(`${item.mediaType}\u0000${presentationKey}`) ?? [];
      group.push(item);
      byPresentationTitle.set(`${item.mediaType}\u0000${presentationKey}`, group);
    }
  }
  for (const group of byBaseTitle.values()) {
    pairsInGroup(group, candidates, { code: 'base-title', text: 'Same base title; edition or work identity needs review.' });
  }
  // Compare a provider-stripped title to all records with that same normal
  // title, including the unadorned Humble title.
  const byNormalizedTitle = new Map();
  for (const item of records) {
    const group = byNormalizedTitle.get(`${item.mediaType}\u0000${item.normalizedTitle}`) ?? [];
    group.push(item);
    byNormalizedTitle.set(`${item.mediaType}\u0000${item.normalizedTitle}`, group);
  }
  for (const [key, presentationItems] of byPresentationTitle) {
    pairsInGroup(presentationItems, candidates, { code: 'provider-series-label', text: 'A provider-added series or book-number label differs.' });
    for (const item of presentationItems) {
      for (const match of byNormalizedTitle.get(key) ?? []) {
        addCandidate(candidates, item, match, { code: 'provider-series-label', text: 'A provider-added series or book-number label differs.' });
      }
    }
  }
  for(const decision of Object.values(manualMatchDecisions)){
    const [left,right]=(decision.itemIds??[]).map(id=>providerItems[id]);
    if(!left||!right||left.mediaType!==right.mediaType)continue;
    const id=candidateId(left,right);
    if(!candidates.has(id))candidates.set(id,candidateForPair(left,right,[{code:'reviewed',text:'Previously reviewed relationship.'}]));
  }
  return [...candidates.values()]
    .map((candidate) => ({ ...candidate, decision: manualMatchDecisions[candidate.id]?.decision ?? null }))
    .sort((left, right) => Number(right.confidence - left.confidence) || left.id.localeCompare(right.id));
}
