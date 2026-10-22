import {contentsStatement,contentsSourceBaseline,validateContents} from './contents.js';
import {manifestReviewProposal} from './kindle-manifest.js';
import {independentContentsClaims} from './kindle-evidence-review.js';
import {strictDatabaseSerialization} from './validation-certificate.js';

// Only a shortcut for an inspectable existing list. No parsing or ownership
// semantics change; less certain proposals keep the full review workflow.
export function contentsConfirmation(record,database,proposal){
  const saved=record.metadata?.enrichment?.kindleProductComicContents;
  proposal??=manifestReviewProposal(saved,record.title,contentsStatement(record),{series:record.metadata?.series});
  const no=reason=>({eligible:false,reason});
  if(record.mediaType!=='book'||database.contentReviews?.[record.id])return no('A saved review or coverage correction already exists. Use Review details to preserve it.');
  if(!proposal.entries?.length)return no('No issue list is available to confirm.');
  if(proposal.outcome!=='full'||proposal.unparsed?.length||proposal.provisionalRanges?.length)return no('Some contents still need interpretation. Review the full description and any supplementary material.');
  // A page-wide Read more marker does not truncate a proven complete selected
  // clause. Confirming that clause is never a claim of complete book contents.
  const selected=saved?.manifest?.candidates?.[saved.manifest.selected];
  if(proposal.manifestCoverage==='bounded'||selected?.truncated||!saved?.manifest&&(proposal.descriptionMayBeIncomplete||saved?.descriptionMayBeIncomplete))return no('The selected statement may be cut short. Review details before confirming.');
  if(proposal.entries.some(e=>!['issue','annual','special'].includes(e.unitType)||!e.run||!/^(?:\d+(?:\.\d+)?|\d+\/\d+)$/u.test(e.number)||e.completeness!=='full'))return no('Check the publication run, named works or excerpt scope in Review details.');
  if(proposal.contextualEvidence?.some(e=>['implicit-series','complete-series-count','unresolved-series-range'].includes(e.kind))||proposal.parseBinding?.includes('product-series'))return no('This list depends on contextual series interpretation. Check it in Review details.');
  const statement=proposal.manifestEvidence||contentsStatement(record);
  if(!/#\s*\d|\bissues?\s+\d/iu.test(statement))return no('The description does not explicitly enumerate issue numbers. Use Review details.');
  if(proposal.publicationResolutions?.length)return no('Named publications need individual review. Use Review details.');
  if(proposal.supportingStatements?.length)return no('Supplementary source statements need closer review. Use Review details.');
  if(saved&&independentContentsClaims(saved,record.title).claims.length)return no('Other captured statements need review. Open Review details so they are not lost.');
  const value={entries:validateContents(proposal.entries),statement,sourceUrl:saved?.sourceUrl||record.metadata?.enrichment?.localMetadata?.sourceUrl||record.metadata?.detailUrl||'',source:'manual-review'};
  return {eligible:true,value,reason:'Check the displayed list before confirming. This does not establish that it lists everything in the book.'};
}

// Hash only this exact provider/account record, not the whole library. Source,
// title, publication context, access and the exact displayed list invalidate
// the preview when they change.
export async function contentsConfirmationToken(record,value=contentsConfirmation(record,{contentReviews:{}}).value??null){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(strictDatabaseSerialization([record,value])));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function sameConfirmedContents(review,record,value){
  return Boolean(review&&!review.status&&!review.referenceOnly&&!review.coverageResolutions?.length&&!review.referenceDecisions?.length&&review.source==='manual-review'
    &&strictDatabaseSerialization(review.entries)===strictDatabaseSerialization(value.entries)
    &&review.statement===value.statement&&(review.sourceUrl||'')===value.sourceUrl
    &&strictDatabaseSerialization(review.sourceBaseline??null)===strictDatabaseSerialization(contentsSourceBaseline(record)));
}
