// Diagnostics are emitted at the same decision point that admits coverage.
// These codes describe a projection; none changes source, access or identity.
export const COVERAGE_REASONS=Object.freeze({
 'run-ambiguous':'More than one publication run is plausible.',
 'run-conflict':'The saved publication context contains conflicting runs.',
 'run-unresolved':'The publication run or series context is not established.',
 'annual-run-unresolved':'The annual label has not been linked to its parent publication run.',
 'publication-unresolved':'The publication identity is not established.',
 'containment-unresolved':'The source does not establish that this issue is included.',
 'partial-only':'Some material is included; this is not a complete copy of the issue.',
 'named-publication-unresolved':'This named work has not been linked to an independent comic publication.',
 'enumeration-incomplete':'Issue numbers or the series are not sufficiently established.',
 'unsupported-source':'This source fragment is retained but is not an enumerated comic issue.',
 'manual-exclusion':'Contents suggestions were explicitly rejected.',
 'view-exclusion':'This source is excluded from the current comparison.',
 'not-comic-unit':'This included work is not an issue, annual or special.',
 'projection-inconsistency':'An eligible observation was not admitted to the coverage index.'
});
export function coverageIdentityDecision(entry,{context,named,knownRunCount,unresolvedAnnual}){
 const provisional=unresolvedAnnual||entry.containmentUncertain===true||entry.runContextConflict===true||!entry.run&&(context.conflict||!context.strong&&!named||knownRunCount>1);
 let reason;
 if(provisional)reason=entry.containmentUncertain?'containment-unresolved':entry.runContextConflict||!entry.run&&context.conflict?'run-conflict':unresolvedAnnual?'annual-run-unresolved':!entry.run&&knownRunCount>1?'run-ambiguous':!named&&!context.strong?'publication-unresolved':'run-unresolved';
 return {provisional:Boolean(provisional),reason};
}
export function dispositionObservation({entry,extracted=entry,entryIndex,origin='contents',decision,access,viewExcluded,indexed=false,indexKey,protectedMerge=false}){
 const parsed=['issue','annual','special'].includes(entry.unitType),reasons=[];
 if(access)reasons.push({code:'access-'+access.reason,explanation:access.explanation});
 if(viewExcluded)reasons.push({code:'view-exclusion',explanation:COVERAGE_REASONS['view-exclusion']});
 if(!parsed)reasons.push({code:'not-comic-unit',explanation:COVERAGE_REASONS['not-comic-unit']});
 if(decision.reason)reasons.push({code:decision.reason,explanation:COVERAGE_REASONS[decision.reason]});
 if(entry.completeness==='excerpt')reasons.push({code:'partial-only',explanation:COVERAGE_REASONS['partial-only']});
 const actionable=parsed&&!access&&!viewExcluded&&Boolean(decision.reason),canAssignRun=parsed&&!['containment-unresolved'].includes(decision.reason)&&!protectedMerge;
 return {id:origin+':'+entryIndex,entryIndex,origin,parsed,extracted,resolved:entry,extent:entry.completeness,accessEligible:!access,provisional:decision.provisional,indexed,indexKey,countedFull:parsed&&indexed&&!decision.provisional&&entry.completeness==='full',countedPartial:parsed&&indexed&&!decision.provisional&&entry.completeness==='excerpt',protectedMerge,reasons,actionable,actions:[...(canAssignRun?['assign-run']:[]),'edit-contents',...(access?['change-access']:[])]};
}
export function includedPublicationTitle(fragment,contents){
 const input=contents.parseInput||contents.manifestEvidence||'';
 if(!/^\s*(?:collects?|collecting|includes?|contains?|reprints?)\b/iu.test(input)||!['explicit-clause','explicit-statement','natural-reprint'].includes(contents.parseBinding))return null;
 const match=/^([\p{L}\p{N}][\p{L}\p{N}\s:'’/&!,.-]{1,240}?)\s*\((\d{4})\)[.!]?$/u.exec(fragment.trim());
 if(!match||/^(?:of|in|from|by|with|featuring|presented|published|originally|including|the first)\b/iu.test(match[1])||/\b(?:material|selected|excerpts?|portions?|pages|chapters?|stories|story|preview|appears?|mentioned|advertis\w*|inspired)\b/iu.test(match[1]))return null;
 return {title:match[1].trim(),run:match[2]};
}
export function dispositionReferences(contents,decisions=[]){
 const source=contents.referenceSource??contents;
 const occurrences=new Map();const references=[
  ...(source.provisionalRanges??[]).map(range=>({fragment:'#'+range.first+(range.last!==range.first?'–'+range.last:''),code:'enumeration-incomplete',explanation:range.reason,actionable:true,actions:['edit-contents']})),
  ...(source.unparsed??[]).map(fragment=>{
   const known=(source.publicationResolutions??[]).find(r=>r.sourceFragment===fragment&&r.enumeration==='unresolved');
   // A trailing description of an already enumerated event is not a named work.
   // Keep it as inspectable source text; do not discard genuine titled miniseries.
   const promotional=/^of the (?:thrilling |exciting |acclaimed |hit )?(?:mini-?series|crossover) event presented by\b/iu.test(fragment.trim());
   const named=!promotional&&(/\b(?:mini-?series|one-shots?|crossovers?|micro-series|macro-series)\b/iu.test(fragment)||includedPublicationTitle(fragment,source))&&!/^including one-shots, crossovers, and event series\.?$/iu.test(fragment.trim());
   const code=known?'enumeration-incomplete':named?'named-publication-unresolved':'unsupported-source';
   return {fragment,code,explanation:known?.reason??COVERAGE_REASONS[code],actionable:Boolean(known||named),actions:['edit-contents']};
  })
 ].map(reference=>{
  const base=JSON.stringify([reference.code,reference.fragment.replace(/\s+/gu,' ').trim()]),occurrence=occurrences.get(base)??0;occurrences.set(base,occurrence+1);
  const key=JSON.stringify([base,occurrence]),legacyKey=JSON.stringify([JSON.stringify(['unsupported-source',reference.fragment.replace(/\s+/gu,' ').trim()]),occurrence]),decision=decisions.find(d=>d.key===key||reference.code==='named-publication-unresolved'&&d.key===legacyKey);
  return {...reference,key:decision?.key??key,...((contents.resolvedReferenceKeys??[]).includes(key)?{resolved:true,actionable:false,explanation:'Included publication confirmed for this collection.'}:{}),...(decision?{ignored:true,decision,actionable:false}:{})};
 });
 // Retain reversible decisions even if a later extraction omits the fragment.
 for(const decision of decisions)if(!references.some(r=>r.key===decision.key))references.push({key:decision.key,fragment:decision.fragment,code:'ignored-reference',explanation:'Previously ignored source reference.',ignored:true,decision,actionable:false,actions:[]});
 return references;
}
export function summarizeDisposition(collection){
 const observations=collection.observations.filter(o=>o.parsed),references=collection.references??[];
 return {parsed:observations.length,full:observations.filter(o=>o.countedFull).length,partial:observations.filter(o=>o.countedPartial).length,provisional:observations.filter(o=>o.provisional).length,excluded:observations.filter(o=>!o.accessEligible).length,actionable:observations.filter(o=>o.actionable).length+references.filter(r=>r.actionable&&collection.accessEligible).length};
}
