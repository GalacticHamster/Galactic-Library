import {reviewedContents} from './contents.js';
import {enrichmentStages} from './enrichment.js';
import {editionEnrichmentConflicts} from './identity.js';
import {contentsStatement,contentsReviewChanged,proposeContentsForReview} from './contents.js';
import {manifestReviewProposal} from './kindle-manifest.js';
import {contentsReviewSummary} from './contents-review-summary.js';
import {contentsConfirmation} from './contents-confirmation.js';

export function candidateConflicts(records,source,candidate){
  if(source==='openLibrary')return [];
  return [...new Set(records.flatMap(record=>editionEnrichmentConflicts(record,{title:[candidate.title,candidate.subtitle].filter(Boolean).join(': '),mediaType:'book',metadata:candidate})))];
}

export function enrichmentWorkbenchRows(database,{recordRefs=null,includeContents=true,includeMissing=true}={}){
  const scope=recordRefs?new Set(recordRefs):null;
  const records=new Map(Object.values(database.providerItems).filter(item=>item.mediaType==='book'&&(!scope||scope.has(item.recordRef))).map(item=>[item.recordRef,item]));
  const rows=[];
  for(const [id,review]of Object.entries(database.enrichmentReviews)){
    const current=review.recordRefs.map(ref=>records.get(ref));if(current.some(item=>!item))continue;
    const conflicts=review.candidates.map(candidate=>candidateConflicts(current,review.source,candidate));
    const category=review.status==='failed'||review.status==='no-results'?'failed':review.status==='conflict'||conflicts.some(fields=>fields.length)?'conflicts':'candidates';
    rows.push({id,category,title:review.title||current[0].title,recordRefs:review.recordRefs,review,conflicts,reason:review.reason});
  }
  for(const canonical of includeMissing?Object.values(database.canonicalItems):[]){
    if(canonical.mediaType!=='book')continue;
    const current=canonical.providerItemIds.map(id=>database.providerItems[id]);if(scope&&current.some(item=>!records.has(item.recordRef)))continue;const stages=enrichmentStages(current,database);
    const missing=['genre','work','edition','creators'].filter(stage=>!stages[stage]);
    if(missing.length)rows.push({id:`missing:${canonical.id}`,category:'missing',title:canonical.title,recordRefs:current.map(item=>item.recordRef),reason:`Missing: ${missing.map(stage=>({genre:'genre',work:'work information',edition:'edition details',creators:'creators'})[stage]).join(', ')}`});
  }
  for(const record of records.values()){
    const statement=contentsStatement(record);
    const review = reviewedContents(database.contentReviews[record.id]);
    if (includeContents && statement && (!review || contentsReviewChanged(record,review))) {
      const saved=record.metadata.enrichment?.kindleProductComicContents;
      const proposal = saved?manifestReviewProposal(saved,record.title,statement,{series:record.metadata.series}):proposeContentsForReview(statement,record.title);
      const presentation=contentsReviewSummary(record,proposal,review);
      if(proposal.outcome!=='filtered' || review || proposal.descriptionMayBeIncomplete)rows.push({id:`contents:${record.recordRef}`,category:'unparsed',title:record.title,recordRefs:[record.recordRef],
        contentsState:presentation.kind,contentsConfirmation:contentsConfirmation(record,database,proposal),reason:`${presentation.summary} ${presentation.statement}`});
    }
    if(includeContents&&review)rows.push({id:`contents-history:${record.recordRef}`,category:'review-history',title:record.title,recordRefs:[record.recordRef],itemId:record.id,contentsReview:review,reason:review.status==='rejected'?'Contents rejected. Undo restores source-derived suggestions.':'Reviewed contents saved. Undo restores source-derived suggestions, which may change inferred issue coverage.'});
    for(const [kind,entry]of Object.entries(record.metadata.enrichment??{})){
      if(entry.selectionRef&&database.enrichmentHistory[entry.selectionRef])rows.push({id:entry.selectionRef,category:'undo',title:record.title,recordRefs:[record.recordRef],history:{kind,previous:database.enrichmentHistory[entry.selectionRef].previous!==null,selectedAt:entry.retrievedAt||entry.checkedAt||'',technical:entry},reason:'A saved source choice can be undone. Purchases and saved contents reviews are kept; source-derived suggestions and inferred coverage may change.'});
      if(!['googleBooks','localMetadata'].includes(kind))continue;
      const conflicts=candidateConflicts([{...record,metadata:{...record.metadata,enrichment:{}}}],kind,entry);
      if(conflicts.length)rows.push({id:`conflict:${record.recordRef}:${kind}`,category:'conflicts',title:record.title,recordRefs:[record.recordRef],reason:`Selected ${kind==='googleBooks'?'Google Books':'Local metadata'} differs from provider evidence: ${conflicts.join(', ')}. Inspect the sources or undo the selection.`});
    }
    if(record.metadata.enrichment?.kindleProductComicContents?.availability==='temporary-failure')rows.push({id:`kindle-failure:${record.recordRef}`,category:'failed',title:record.title,recordRefs:[record.recordRef],reason:'Temporary Kindle contents failure. Retry from the Galactic Library panel on the Kindle library page.'});
  }
  return rows;
}
