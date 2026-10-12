import {contentsStatement,contentKey,ownedContentIndex,contentCoverage,seriesCoverage,proposeContentsForReview,CONTENTS_PARSER_VERSION} from './contents.js';
import {manifestReviewProposal} from './kindle-manifest.js';
import {effectiveOwnershipRecord} from './ownership.js';

// Local collection tools only. Companion matching retains its reviewed-only
// index. Proposals are derived from current selected source, never history or
// a union of independent claims. No ownership/source/review is written here.
export function collectionContents(record,database) {
  const review=database.contentReviews?.[record.id];
  if(review)return {entries:review.entries,unparsed:[],confidence:review.status==='rejected'?'rejected':'verified',review};
  const statement=contentsStatement(record);
  if(!statement)return {entries:[],unparsed:[],confidence:'unresolved'};
  const source=record.metadata?.enrichment?.kindleProductComicContents;
  const proposal=manifestReviewProposal(source,record.title,statement,{series:record.metadata?.series});
  return {...proposal,confidence:'inferred',parserVersion:CONTENTS_PARSER_VERSION};
}

function standaloneContents(record) {
  if(record.mediaType!=='book'||/\bchapters?\b/iu.test(record.title)||/\b(?:vol(?:ume)?\.?|book|omnibus|collection|collects)\s*\d/iu.test(record.title))return [];
  // Only an explicit standalone issue/annual/special, not a volume or title
  // containing arbitrary numbers. Do not create publication-run aliases.
  if(!/^.+?\s+#\s*\d+(?:\/\d+|\.\d+)?\s*$/u.test(record.title))return [];
  return proposeContentsForReview('Collects '+record.title).entries.map(entry=>({...entry,language:record.metadata?.language||entry.language}));
}

export function libraryCoverageIndex(database,{excludeProviders=[],excludeItemIds=[]}={}) {
  const index=new Map(),unresolved=[];
  const add=(item,entry,confidence,review)=>{
    if(entry.completeness!=='full')return;
    if(!['issue','annual','special'].includes(entry.unitType))return;
    const provisional=!entry.run||!entry.language;
    const key=contentKey(entry)+(provisional?':parent:'+item.id:'');
    const evidence=index.get(key)??[];
    evidence.push({item,entry,confidence,provisional,...(review?{review}:{})});index.set(key,evidence);
  };
  for(const original of Object.values(database.providerItems??{})){
    const item=effectiveOwnershipRecord(original,database);
    if(item.mediaType!=='book'||!['owned','claimed'].includes(item.ownership)||excludeProviders.includes(item.provider)||excludeItemIds.includes(item.id))continue;
    const contents=collectionContents(original,database);
    for(const entry of contents.entries){
      // Language belongs to the source parent, never invented defaults.
      const scoped={...entry,language:entry.language||original.metadata?.language||''};
      add(item,scoped,contents.confidence,contents.review);
      if(scoped.completeness!=='full'||!['issue','annual','special'].includes(scoped.unitType))unresolved.push({item,entry:scoped,reason:scoped.completeness==='excerpt'?'excerpt':'unsupported or named material'});
    }
    for(const fragment of contents.unparsed??[])unresolved.push({item,fragment,reason:'unparsed source'});
    if(contents.confidence!=='rejected')for(const entry of standaloneContents(original))add(item,entry,'direct');
  }
  // Preserve the existing verified volume and parent-local component tools.
  for(const [key,evidence]of ownedContentIndex(database,{excludeProviders,excludeItemIds})){
    const retained=evidence.filter(value=>!['issue','annual','special'].includes(value.entry.unitType)).map(value=>({...value,confidence:'verified'}));
    if(retained.length)index.set(key,retained);
  }
  return {index,unresolved};
}

export function libraryContentCoverage(database,requested,options={}) {
  const {index,unresolved}=libraryCoverageIndex(database,options);
  const result=contentCoverage(database,requested,{...options,contentIndex:index,requireIdentityScope:true});
  return {...result,verified:result.covered.filter(value=>value.evidence.some(e=>e.confidence==='verified')).length,
    direct:result.covered.filter(value=>value.evidence.some(e=>e.confidence==='direct')&&!value.evidence.some(e=>e.confidence==='verified')).length,
    inferred:result.covered.filter(value=>value.evidence.every(e=>e.confidence==='inferred')).length,unresolved};
}

export function librarySeriesCoverage(database,options={}) {
  const {index,unresolved}=libraryCoverageIndex(database,options);
  const groups=seriesCoverage(database,{contentIndex:index,requireIdentityScope:true});
  for(const group of groups){
    group.provisional=group.entries.some(entry=>entry.provisional);
    group.verified=group.entries.filter(entry=>entry.confidence==='verified').length;
    group.direct=group.entries.filter(entry=>entry.confidence==='direct').length;
    group.inferred=group.entries.length-group.verified-group.direct;
    // Unknown runs/languages cannot establish cross-parent overlap or definite
    // missing issues. Keep the source-local numerical holes explicitly possible.
    if(group.provisional){group.possibleGaps=group.gaps;group.gaps=[];group.overlap=[];}
  }
  return {groups,unresolved};
}
