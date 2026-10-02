import { titleKey } from './normalization.js';
import { identityConflicts, identityEvidence, relationshipReason, sameEditionEvidence } from './identity.js';
import { contentCoverage, proposeContents } from './contents.js';
import { rebuildCanonicalItems } from './models.js';
import { editionBarriers, pairKey } from './relationships.js';
import { entitlementEvidence,effectiveOwnershipRecord } from './ownership.js';
import { candidateTitleKeys, possibleTitleRelation } from './title-candidates.js';

const owned=(item)=>['owned','claimed'].includes(item.ownership);
export function publicMatch(item, relationship='same-edition', reason='Exact normalized title.', confidence=1) {
  const identity=identityEvidence(item);
  return {provider:item.provider,itemRef:item.recordRef,title:String(item.title).slice(0,500),ownership:item.ownership,confidence,relationship,reason,
    evidence:{isbn:identity.isbn,authors:identity.authors,language:identity.language,edition:identity.edition,series:identity.series,run:identity.run,unit:identity.unit,source:identity.source,checkedAt:item.observedAt??null,...entitlementEvidence(item),...(item.manualOwnershipEvidence?{ownershipBasis:'dated-manual-confirmation',ownershipConfirmedAt:item.manualOwnershipEvidence.confirmedAt,accessExpiresAt:item.manualOwnershipEvidence.expiresAt}:{})}};
}

function requestRecord(request) {
  return {title:request.title,mediaType:String(request.mediaType??'game').trim().toLowerCase(),normalizedTitle:titleKey(request.title),metadata:{
    ...(request.identifiers??{}),authors:request.authors,language:request.language,edition:request.edition,series:request.series,run:request.run,volume:request.volume,issue:request.issue
  }};
}

export function matchItems(items, requestedItems, context = {}) {
  items=Object.fromEntries(Object.entries(items).map(([id,item])=>[id,effectiveOwnershipRecord(item,context)]));
  const database={...context,providerItems:items};
  const all=Object.values(items);const byTitle=new Map();const byBase=new Map();const byIdentifier=new Map();const byAlias=new Map();
  const add=(index,key,item)=>{const group=index.get(key)??[];group.push(item);index.set(key,group);};
  const byCandidateTitle = new Map();
  for(const item of all){
    for (const key of candidateTitleKeys(item.title, item.mediaType)) add(byCandidateTitle, item.mediaType + ':' + key, item);
    const identity=identityEvidence(item);add(byTitle,`${item.mediaType}:${item.normalizedTitle}`,item);add(byBase,`${item.mediaType}:${identity.candidateKey}`,item);
    for(const alias of context.titleAliases?.[item.recordRef]?.titles??[])add(byAlias,`${item.mediaType}:${titleKey(alias)}`,item);
    for(const isbn of identity.isbn)add(byIdentifier,`${item.mediaType}:isbn:${isbn}`,item);
    if(identity.asin)add(byIdentifier,`${item.mediaType}:asin:${identity.asin}`,item);
    for(const work of identity.workIds)add(byBase,`${item.mediaType}:work:${work}`,item);
  }
  const barriers=editionBarriers(context.manualMatchDecisions,context.editionSeparations);
  const canonical=Object.values(barriers.size?rebuildCanonicalItems(items,context.manualMatchDecisions,context.canonicalItems,context.editionSeparations):context.canonicalItems??rebuildCanonicalItems(items,context.manualMatchDecisions));
  const editionByRecord=new Map(canonical.flatMap(group=>group.providerItemIds.map(id=>[id,group])));
  const graph=new Map();const negative=new Set();
  for(const decision of Object.values(context.manualMatchDecisions??{})){
    const [a,b]=decision.itemIds??[];if(!items[a]||!items[b]||items[a].mediaType!==items[b].mediaType)continue;
    if(decision.decision==='different'){negative.add([a,b].sort().join('\u0000'));continue;}
    if(!['same','same-work','same-edition'].includes(decision.decision))continue;
    for(const [left,right]of[[a,b],[b,a]]){const edges=graph.get(left)??[];edges.push({id:right,decision:decision.decision==='same-edition'&&barriers.has(pairKey(a,b))?'same-work':decision.decision});graph.set(left,edges);}
  }
  for(const separation of Object.values(context.editionSeparations??{}))for(const other of separation.otherItemIds){
    if(!items[separation.itemId]||!items[other])continue;
    for(const [left,right]of[[separation.itemId,other],[other,separation.itemId]]){const edges=graph.get(left)??[];edges.push({id:right,decision:'same-work'});graph.set(left,edges);}
  }
  const history=Object.values(context.providerHistory??{}).filter(entry=>entry.reason==='missing-from-complete-scan'
    &&entry.profileLabel===(context.providers?.[entry.item.provider]?.profileLabel??'')&&!items[entry.item.id]);
  const historicalResults=history.length?matchItems(Object.fromEntries(history.map(entry=>[entry.item.id,{...entry.item,ownership:'unknown'}])),requestedItems,{manualMatchDecisions:context.manualMatchDecisions}):[];
  return requestedItems.map((request,index)=>{
    const query=requestRecord(request);const evidence=identityEvidence(query);const exclude=new Set(request.excludeProviders??[]);
    const titled=byTitle.get(`${query.mediaType}:${query.normalizedTitle}`)??[];
    const identified=[...evidence.isbn.flatMap(isbn=>byIdentifier.get(`${query.mediaType}:isbn:${isbn}`)??[]),...(evidence.asin?byIdentifier.get(`${query.mediaType}:asin:${evidence.asin}`)??[]:[])];
    const identifierRequired=evidence.isbn.length>0||Boolean(evidence.asin);
    const anchors=[...new Set(identifierRequired?identified:titled)];
    const compatible=anchors.filter(item=>!identityConflicts(query,item).length);
    const editionGroups=new Set(compatible.map(item=>editionByRecord.get(item.id)?.id??item.id));
    const ambiguous=editionGroups.size>1;
    const exact=new Map();const possible=new Map();
    const candidate=(item,reason,relationship='same-work')=>{
      if(compatible.length && compatible.every(anchor=>negative.has([anchor.id,item.id].sort().join('\u0000'))))return;
      if(!exclude.has(item.provider)&&!exact.has(item.id))possible.set(item.id,publicMatch(item,relationship,reason,0.8));
    };
    for(const item of compatible){
      if(ambiguous){candidate(item,'Matching signals refer to multiple distinct editions or works.');continue;}
      const editionGroup=editionByRecord.get(item.id);
      const reviewedEdition=(graph.get(item.id)??[]).some(edge=>edge.decision==='same-edition'&&editionGroup?.providerItemIds.includes(edge.id));
      if(!['game','software'].includes(query.mediaType)&&!identifierRequired&&!sameEditionEvidence(query,item)&&!reviewedEdition){
        candidate(item,'Title-only book identity needs an identifier, compatible author evidence, or a reviewed same-edition relationship.');continue;
      }
      if(!exclude.has(item.provider))exact.set(item.id,publicMatch(item,'same-edition',identifierRequired?'Matching validated edition identifier.':'Exact normalized title with no conflicting edition evidence.'));
      for(const id of editionByRecord.get(item.id)?.providerItemIds??[])if(items[id]&&!exclude.has(items[id].provider))exact.set(id,publicMatch(items[id],'same-edition','Verified same-edition relationship.'));
    }
    const related=[...titled,...(byBase.get(`${query.mediaType}:${evidence.candidateKey}`)??[]),...evidence.workIds.flatMap(work=>byBase.get(`${query.mediaType}:work:${work}`)??[])];
    for(const item of new Set(related)){
      if(exact.has(item.id))continue;
      const reason=relationshipReason(query,item);
      if(reason)candidate(item,reason);
    }
    for(const item of byAlias.get(`${query.mediaType}:${query.normalizedTitle}`)??[]){
      if(!identityConflicts(query,item,{edition:false}).some(field=>['authors','run','unit','unitType'].includes(field)))candidate(item,'User-supplied alternate title; edition ownership still needs identifier or relationship evidence.');
    }
    const discovered = new Set(candidateTitleKeys(query.title, query.mediaType).flatMap(key => byCandidateTitle.get(query.mediaType + ':' + key) ?? []));
    for (const item of discovered) {
      if (exact.has(item.id) || possible.has(item.id) || identityConflicts(query, item, { edition: false }).some(field => ['media type', 'authors', 'run', 'unit', 'unitType'].includes(field))) continue;
      const reason = possibleTitleRelation(query.title, item.title, query.mediaType);
      if (reason) {
        const differences = identityConflicts(query, item);
        candidate(item, reason + (differences.length ? ' Differences: ' + differences.join(', ') + '.' : ''));
      }
    }
    for(const anchor of anchors){
      const visited=new Set([anchor.id]);const queue=[anchor.id];
      while(queue.length){const id=queue.shift();for(const edge of graph.get(id)??[]){
        if(visited.has(edge.id)||negative.has([anchor.id,edge.id].sort().join('\u0000')))continue;
        visited.add(edge.id);queue.push(edge.id);
        candidate(items[edge.id],`Reviewed ${edge.decision==='same-edition'?'same-edition':'same-work'} relationship.`,edge.decision==='same-edition'?'same-edition':'same-work');
      }}
    }
    let requested=request.contents;
    if(!requested&&query.mediaType==='book'){
      const proposal=proposeContents(query.title);
      if(!proposal.unparsed.length&&proposal.entries.length)requested=proposal.entries.map(entry=>({...entry,run:request.run??entry.run,language:request.language??entry.language}));
    }
    let coverage=null;const partialMatches=new Map();
    if(requested?.length){
      const result=contentCoverage(database,requested,{excludeProviders:[...exclude]});
      const exposed=entries=>entries.map(entry=>({...entry,evidence:entry.evidence.map(({item,review})=>({...publicMatch(item,'contains','Reviewed collected contents.'),verifiedAt:review.verifiedAt}))}));
      coverage={...result,covered:exposed(result.covered),possibleCovered:exposed(result.possibleCovered)};
      for(const entry of result.covered)for(const {item}of entry.evidence)partialMatches.set(item.id,publicMatch(item,'contains','Verified coverage of requested contents.'));
      for(const entry of result.possibleCovered)for(const {item}of entry.evidence)candidate(item,'Reviewed contents may overlap; the series/run or language needs confirmation.','contains');
      if(result.complete&&request.contentsComplete===true)for(const [id,item]of partialMatches)exact.set(id,{...item,reason:'All explicitly enumerated requested contents are verified owned.'});
    }
    for(const id of exact.keys())possible.delete(id);
    for(const match of [...(historicalResults[index]?.matches??[]),...(historicalResults[index]?.possibleMatches??[])])possible.set(`history:${match.itemRef}`,{
      ...match,reason:'Previously recorded; not observed in the last complete scan. Current access needs review.',
      evidence:{...match.evidence,availability:'not-observed-in-last-full-scan'}});
    return {requestId:request.requestId??null,owned:[...exact.keys()].some(id=>owned(items[id])),confidence:exact.size?1:0,
      matches:[...exact.values()],possibleMatches:[...possible.values()],partialMatches:[...partialMatches.values()],coverage};
  });
}
