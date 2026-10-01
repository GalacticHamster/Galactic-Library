import {enrichmentStages} from './enrichment.js';
import {editionEnrichmentConflicts} from './identity.js';
import {contentsStatement,proposeContents} from './contents.js';

export function candidateConflicts(records,source,candidate){
  if(source==='openLibrary')return [];
  return [...new Set(records.flatMap(record=>editionEnrichmentConflicts(record,{title:[candidate.title,candidate.subtitle].filter(Boolean).join(': '),mediaType:'book',metadata:candidate})))];
}

export function enrichmentWorkbenchRows(database){
  const records=new Map(Object.values(database.providerItems).filter(item=>item.mediaType==='book').map(item=>[item.recordRef,item]));
  const rows=[];
  for(const [id,review]of Object.entries(database.enrichmentReviews)){
    const current=review.recordRefs.map(ref=>records.get(ref));if(current.some(item=>!item))continue;
    const conflicts=review.candidates.map(candidate=>candidateConflicts(current,review.source,candidate));
    const category=review.status==='failed'||review.status==='no-results'?'failed':review.status==='conflict'||conflicts.some(fields=>fields.length)?'conflicts':'candidates';
    rows.push({id,category,title:review.title||current[0].title,recordRefs:review.recordRefs,review,conflicts,reason:review.reason});
  }
  for(const canonical of Object.values(database.canonicalItems)){
    if(canonical.mediaType!=='book')continue;
    const current=canonical.providerItemIds.map(id=>database.providerItems[id]);const stages=enrichmentStages(current,database);
    const missing=['genre','work','edition','creators'].filter(stage=>!stages[stage]);
    if(missing.length)rows.push({id:`missing:${canonical.id}`,category:'missing',title:canonical.title,recordRefs:current.map(item=>item.recordRef),reason:`Missing: ${missing.join(', ')}`});
  }
  for(const record of records.values()){
    const statement=contentsStatement(record);
    if(statement&&!database.contentReviews[record.id]&&proposeContents(statement).unparsed.length)rows.push({id:`contents:${record.recordRef}`,category:'unparsed',title:record.title,recordRefs:[record.recordRef],reason:statement});
    for(const [kind,entry]of Object.entries(record.metadata.enrichment??{})){
      if(entry.selectionRef&&database.enrichmentHistory[entry.selectionRef])rows.push({id:entry.selectionRef,category:'undo',title:record.title,recordRefs:[record.recordRef],reason:`${kind}: ${entry.matchBasis||'source evidence'}; retrieved ${entry.retrievedAt||entry.checkedAt||'unknown'}`});
      if(!['googleBooks','localMetadata'].includes(kind))continue;
      const conflicts=candidateConflicts([{...record,metadata:{...record.metadata,enrichment:{}}}],kind,entry);
      if(conflicts.length)rows.push({id:`conflict:${record.recordRef}:${kind}`,category:'conflicts',title:record.title,recordRefs:[record.recordRef],reason:`Selected ${kind} differs from provider evidence: ${conflicts.join(', ')}. Inspect the sources or undo the selection.`});
    }
    if(record.metadata.enrichment?.kindleProductComicContents?.availability==='temporary-failure')rows.push({id:`kindle-failure:${record.recordRef}`,category:'failed',title:record.title,recordRefs:[record.recordRef],reason:'Temporary Kindle contents failure. Retry from the Kindle library sync panel.'});
  }
  return rows;
}
