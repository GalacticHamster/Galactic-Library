import { PROVIDERS, OWNERSHIP_STATES } from './constants.js';
import { compact, names, validIsbn } from './identity.js';
import { date } from './validation.js';

const SOURCES = new Set(['steam-store-browse-items', 'gog-account-library', 'epic-store-library', 'amazon-games-collection', 'audible-library-page', 'amazon-kindle-content-library', 'amazon-prime-video-purchases-library', 'fandango-at-home-library', 'kobo-my-books-library', 'fanatical-order-history', 'humble-purchase-library', 'nintendo-virtual-game-cards', 'playstation-web-purchased-library', 'xbox-web-library']);
export const recordReference = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value) ? value : null;
export const publicDate = value => {try{return date(value);}catch{return null;}};
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

// One explicit output projection for every match path, including contents.
// Never serialize internal records, provider IDs, URLs, account or sync state.
export function companionMatch(value) {
  const evidence = value.evidence ?? {};
  const provider = PROVIDERS.includes(value.provider) ? value.provider : 'unknown';
  return {
    provider, itemRef: recordReference(value.itemRef), title: compact(value.title),
    ownership: OWNERSHIP_STATES.includes(value.ownership) ? value.ownership : 'unknown',
    confidence: Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0,
    relationship: ['same-work', 'same-edition', 'contains'].includes(value.relationship) ? value.relationship : 'same-work',
    reason: compact(value.reason),
    evidence: {
      isbn: [...new Set(names(evidence.isbn).map(validIsbn).filter(Boolean))], authors: names(evidence.authors),
      language: compact(evidence.language, 80), edition: compact(evidence.edition), series: names(evidence.series),
      run: compact(evidence.run, 100), unit: compact(evidence.unit, 80),
      source: SOURCES.has(evidence.source) ? evidence.source : provider, checkedAt: publicDate(evidence.checkedAt),
      ...(evidence.ownershipBasis==='dated-manual-confirmation'?{ownershipBasis:evidence.ownershipBasis,ownershipConfirmedAt:publicDate(evidence.ownershipConfirmedAt),accessExpiresAt:publicDate(evidence.accessExpiresAt)}:{}),
      ...(evidence.ownershipBasis==='user-assumed-owned'?{ownershipBasis:evidence.ownershipBasis,
        observedOwnership:OWNERSHIP_STATES.includes(evidence.observedOwnership)?evidence.observedOwnership:'unknown'}:{}),
      ...(evidence.availability==='not-observed-in-last-full-scan'?{availability:evidence.availability}:{}),
      ...(['humble','fanatical'].includes(provider)?{
        purchaseEvidence:evidence.purchaseEvidence==='confirmed'?'confirmed':'unknown',
        activationStatus:evidence.activationStatus==='not-applicable'?'not-applicable':'unknown',
        ...(Object.hasOwn(evidence,'keyStatus')?{keyStatus:['unrevealed','revealed','expired','unavailable'].includes(evidence.keyStatus)?evidence.keyStatus:'unknown',expiresAt:publicDate(evidence.expiresAt)}:{})
      }:{})
    },
    ...(Object.hasOwn(value, 'verifiedAt') ? { verifiedAt: publicDate(value.verifiedAt) } : {})
  };
}

const unit = value => ({series:compact(value.series), run:compact(value.run,100), unitType:compact(value.unitType,20), number:compact(value.number,80), language:compact(value.language,80), completeness:value.completeness === 'excerpt' ? 'excerpt' : 'full'});
export function companionResult(value) {
  const coverage = value.coverage;
  const covered = entries => entries.map(entry => ({...unit(entry), evidence:entry.evidence.map(companionMatch)}));
  return {
    requestId: typeof value.requestId === 'string' ? value.requestId : null,
    owned: value.owned === true, confidence: value.confidence === 1 ? 1 : 0,
    matches:value.matches.map(companionMatch), possibleMatches:value.possibleMatches.map(companionMatch), partialMatches:value.partialMatches.map(companionMatch),
    coverage: coverage ? {total:count(coverage.total), owned:count(coverage.owned), complete:coverage.complete === true, scopeUncertain:coverage.scopeUncertain === true,
      covered:covered(coverage.covered), possibleCovered:covered(coverage.possibleCovered), missing:coverage.missing.map(unit)} : null
  };
}
