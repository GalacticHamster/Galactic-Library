import '../providers/kindle.js';
import {contentsStatement, proposeContentsForReview, CONTENTS_PARSER_VERSION} from './contents.js';
import {isConfirmedComicManga} from './genre-hints.js';
import {CONTENTS_FILTER_VERSION} from './contents-quality.js';
import {manifestReviewProposal} from './kindle-manifest.js';

export const KINDLE_CONTENTS_EXTRACTOR_VERSION = globalThis.GalacticKindle.contentsExtractorVersion;
export const supportedKindleContentsBook = item => item?.provider === 'kindle' && item.mediaType === 'book'
  && /^https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]+$/u.test(item.metadata?.detailUrl ?? '');

export function contentsParseState(item) {
  const statement = item.metadata?.enrichment?.kindleProductComicContents?.statement?.trim() ?? '';
  if (!statement) return {parseStatus:'not-attempted',parseOutcome:'not-attempted',parserVersion:CONTENTS_PARSER_VERSION,filterVersion:CONTENTS_FILTER_VERSION};
  const proposal = manifestReviewProposal(item.metadata.enrichment.kindleProductComicContents, item.title,statement,{series:item.metadata?.series});
  const parseOutcome = proposal.outcome;
  return {parseStatus:parseOutcome === 'full' ? 'parsed' : 'unparsed',parseOutcome,parserVersion:CONTENTS_PARSER_VERSION,
    filterVersion:proposal.filterVersion,quality:proposal.quality,qualityReason:proposal.qualityReason,descriptionMayBeIncomplete:proposal.descriptionMayBeIncomplete,
    parseBinding:proposal.parseBinding,parseInput:proposal.parseInput};
}

export function kindleContentsState(item, database = {}) {
  const saved = item.metadata?.enrichment?.kindleProductComicContents;
  const statement = saved?.statement?.trim() ?? '';
  const fetchOutcome = !saved ? 'never-checked' : saved.availability === 'temporary-failure' ? 'temporary-failure'
    : saved.availability === 'unavailable' ? 'unavailable' : statement ? 'statement-found'
    : saved.availability === 'no-statement' ? 'no-statement' : 'legacy-unknown';
  const parse = contentsParseState(item);
  const review = database.contentReviews?.[item.id];
  return {fetchOutcome,...parse,reviewStatus:review ? 'verified' : statement ? 'unverified' : 'none',
    reviewChanged:Boolean(review && statement && statement !== review.statement),
    needsReparse:Boolean(statement && (saved.parserVersion !== CONTENTS_PARSER_VERSION || saved.filterVersion !== CONTENTS_FILTER_VERSION || saved.parseOutcome !== parse.parseOutcome)),
    extractorOutdated:Boolean(saved?.extractorVersion && saved.extractorVersion < KINDLE_CONTENTS_EXTRACTOR_VERSION)};
}

export function kindleContentsPlan(database, mode = 'scan') {
  if (!['scan','retry','rescan','reparse'].includes(mode)) throw new Error('Invalid contents discovery mode.');
  const candidates = [], reprocess = [];
  let eligible = 0, skipped = 0;
  for (const item of Object.values(database.providerItems)) {
    if (!supportedKindleContentsBook(item)) continue;
    eligible++;
    const state = kindleContentsState(item, database);
    const saved = item.metadata?.enrichment?.kindleProductComicContents;
    const target = {id:item.id,recordRef:item.recordRef,title:item.title,detailUrl:item.metadata.detailUrl};
    if (state.needsReparse || mode === 'reparse' && saved?.statement) reprocess.push(target);
    const incomplete = ['temporary-failure','legacy-unknown'].includes(state.fetchOutcome);
    // A legacy statement can be reparsed locally. Unknown blank outcomes need
    // another page check; legacy unavailable pages wait for an explicit rescan.
    const outdatedEmpty = state.fetchOutcome === 'no-statement' && !saved.extractorVersion;
    const legacyExtractorEmpty = state.extractorOutdated && !saved?.statement && saved?.extractorVersion < 2;
    const fetch = mode === 'rescan' || mode === 'retry' && incomplete
      || mode === 'scan' && (state.fetchOutcome === 'never-checked' || incomplete || legacyExtractorEmpty || outdatedEmpty);
    if (fetch) candidates.push({...target,priority:contentsStatement(item) || isConfirmedComicManga(item)
      || /\b(?:omnibus|epic collection|masterworks|compendium|complete collection|box set|antholog(?:y|ies)|collection)\b/iu.test(item.title) ? 0 : 1});
    else skipped++;
  }
  candidates.sort((a,b) => a.priority - b.priority || a.title.localeCompare(b.title));
  return {candidates:candidates.map(({priority,...item}) => item),reprocess,eligible,skipped};
}
