import {contentsStatement,contentKey,ownedContentIndex,contentCoverage,seriesCoverage,proposeContentsForReview,CONTENTS_PARSER_VERSION} from './contents.js';
import {manifestReviewProposal} from './kindle-manifest.js';
import {effectiveOwnershipRecord} from './ownership.js';
import {identityEvidence,identityKey,titleIdentity,compact} from './identity.js';

// Local collection tools only. Companion matching retains its reviewed-only
// index. Proposals are derived from current selected source, never history or
// a union of independent claims. No ownership/source/review is written here.
export function collectionContents(record,database,context={}) {
  const review=database.contentReviews?.[record.id];
  if(review)return {entries:review.entries,unparsed:[],confidence:review.status==='rejected'?'rejected':'verified',review};
  const statement=contentsStatement(record,{recoverNatural:true});
  if(!statement)return {entries:[],unparsed:[],confidence:'unresolved'};
  const source=record.metadata?.enrichment?.kindleProductComicContents;
  const proposal=manifestReviewProposal(source,record.title,statement,{series:record.metadata?.series,...context});
  return {...proposal,confidence:'inferred',parserVersion:CONTENTS_PARSER_VERSION};
}

function standaloneContents(record) {
  if(record.mediaType!=='book'||/\bchapters?\b/iu.test(record.title)||/\b(?:vol(?:ume)?\.?|book|omnibus|collection|collects)\s*\d/iu.test(record.title))return [];
  // Only an explicit standalone issue/annual/special, not a volume or title
  // containing arbitrary numbers. Do not create publication-run aliases.
  if(!/^.+?\s+#\s*\d+(?:\/\d+|\.\d+)?\s*$/u.test(record.title))return [];
  return proposeContentsForReview('Collects '+record.title).entries.map(entry=>({...entry,language:record.metadata?.language||entry.language}));
}

const comicUnit=entry=>['issue','annual','special'].includes(entry.unitType);
// Coverage defaults are projections, never source metadata or parser repairs.
export const coverageLanguage=value=>{
  const language=compact(value,80).toLowerCase();
  return !language||language==='english'?'en':language;
};
function descriptor(value){
  const text=compact(value),match=/\s*\((\d{4}(?:[-–—]\d{0,4})?)\)\s*$/u.exec(text);
  return {series:match?text.slice(0,match.index).trim():text,run:match?match[1].replace(/[–—]/gu,'-'):''};
}
const meaningfulSeries=series=>series&&!/^(?:comics?|issues?|books?|volumes?|collections?|stories|collected works|anthology)$/u.test(series);
function parentSeriesContext(entry,parent,allowSubjectAlias=true){
  if(!parent)return {strong:false,run:''};
  const identity=identityEvidence(parent),series=identityKey(entry.series);
  if(!meaningfulSeries(series))return {strong:false,run:''};
  const parentDescriptor=value=>{
    const part=descriptor(value);
    // The parser already distinguishes typed annuals/specials from issues.
    // Their explicit type word is presentation, not a different series alias.
    if(['annual','special'].includes(entry.unitType)&&identityKey(part.series)!==series)part.series=part.series.replace(new RegExp('\\s+'+entry.unitType+'s?$','iu'),'');
    return part;
  };
  const descriptors=identity.series.map(parentDescriptor);
  const title=parentDescriptor(titleIdentity(parent.title,parent.mediaType).series);
  // Amazon's captured product-series label is evidence for this product only.
  // It can resolve a literal contained series or the subject's own title-based
  // series variant, never assign its run to unrelated anthology constituents.
  const captured=parent.metadata?.enrichment?.kindleProductComicContents?.productDetailsEvidence?.observations??[];
  const productSeries=captured.filter(value=>value.field==='series'&&value.status==='observed'&&/^Part of:\s*/iu.test(value.value??value.raw??'')).map(value=>descriptor((value.value??value.raw).replace(/^Part of:\s*/iu,'')));
  const sourceMatches=productSeries.filter(value=>identityKey(value.series)===series);
  const subjectAlias=allowSubjectAlias&&identityKey(title.series)===series&&productSeries.length===1&&productSeries[0].run&&(!entry.run||identityKey(entry.run)===identityKey(productSeries[0].run))?productSeries[0]:null;
  const sourceContext=sourceMatches.length?sourceMatches:subjectAlias?[subjectAlias]:[];
  // A nested, explicitly named source-title qualifier can describe a contained
  // series rather than the collected book's main title. Match the literal name;
  // never distribute its run to other series in a mixed collection.
  const qualified=[];
  for(const match of parent.title.matchAll(/\(([^()]+?)\s*\((\d{4}(?:[-–—]\d{0,4})?)\)\)/gu)){
    if(identityKey(match[1])===series)qualified.push(match[2].replace(/[–—]/gu,'-'));
  }
  if(sourceContext.length){
    const matching=descriptors.filter(value=>identityKey(value.series)===series),runs=new Set([...sourceContext.map(value=>value.run),...qualified,...matching.map(value=>value.run),...(identityKey(title.series)===series?[title.run]:[])].filter(Boolean));
    if(descriptors.length===1&&matching.length&&identity.run)runs.add(identity.run);
    return {strong:runs.size<=1,run:runs.size===1?[...runs][0]:'',conflict:runs.size>1,series:runs.size<=1?(subjectAlias?.series??entry.series):entry.series};
  }
  if(qualified.length){
    const matching=descriptors.filter(value=>identityKey(value.series)===series),runs=new Set([...qualified,...matching.map(value=>value.run).filter(Boolean)]);
    if(descriptors.length===1&&matching.length&&identity.run)runs.add(identity.run);
    return {strong:runs.size===1,run:runs.size===1?[...runs][0]:'',conflict:runs.size>1};
  }
  if(title.series&&descriptors.length===1&&identityKey(descriptors[0].series)!==identityKey(title.series))return {strong:false,run:'',conflict:[identityKey(descriptors[0].series),identityKey(title.series)].includes(series)};
  const matching=descriptors.filter(value=>identityKey(value.series)===series);
  if(identityKey(title.series)===series)matching.push(title);
  const runs=new Set(matching.map(value=>value.run).filter(Boolean));
  // A parent-level run belongs only to its unambiguous literal series, not
  // every constituent series in an anthology or mixed-series collection.
  if(descriptors.length===1&&identityKey(descriptors[0].series)===series&&identity.run)runs.add(identity.run);
  return {strong:matching.length>0&&runs.size<=1,run:runs.size===1?[...runs][0]:'',conflict:runs.size>1};
}
export function resolveCoverageEntry(entry,parent,allowSubjectAlias=true){
  if(!comicUnit(entry))return {...entry};
  const context=parentSeriesContext(entry,parent,allowSubjectAlias);
  return {...entry,series:context.series||entry.series,run:entry.run||context.run,
    language:coverageLanguage(entry.language||identityEvidence(parent).language)};
}

export function libraryCoverageIndex(database,{excludeProviders=[],excludeItemIds=[],includeExcerpts=false}={}) {
  const index=new Map(),unresolved=[];
  const rows=[],knownRuns=new Map();
  const scopeKey=entry=>JSON.stringify([identityKey(entry.series),identityKey(entry.language)]);
  // Contradictions remain visible when the caller excludes a provider/parent.
  // Access gates participation, not the identity evidence available locally.
  for(const original of Object.values(database.providerItems??{})){
    if(original.mediaType!=='book')continue;
    const contents=collectionContents(original,database),entries=contents.entries.map(entry=>resolveCoverageEntry(entry,original,!contents.review));
    const standalone=contents.confidence==='rejected'?[]:standaloneContents(original).map(entry=>resolveCoverageEntry(entry,original));
    rows.push({original,contents,entries,standalone});
    for(const entry of [...entries,...standalone]){
      if(!comicUnit(entry)||entry.completeness!=='full'||!entry.run)continue;
      const key=scopeKey(entry),runs=knownRuns.get(key)??new Set();runs.add(identityKey(entry.run));knownRuns.set(key,runs);
    }
  }
  const regularRuns=[...new Map(rows.flatMap(row=>[...row.entries,...row.standalone]).filter(entry=>entry.unitType==='issue'&&entry.run).map(entry=>[JSON.stringify([identityKey(entry.series),entry.run]),{series:entry.series,run:entry.run}])).values()];
  for(const row of rows)if(row.contents.annualRunHints?.some(hint=>!hint.resolvedRun)){
    row.contents=collectionContents(row.original,database,{annualParentRuns:regularRuns});row.entries=row.contents.entries.map(entry=>resolveCoverageEntry(entry,row.original));
  }
  const add=(item,entry,confidence,review,explicitSeries=false,statement='',unresolvedAnnual=false)=>{
    if(entry.completeness!=='full'&&!(includeExcerpts&&entry.completeness==='excerpt'))return;
    if(!['issue','annual','special'].includes(entry.unitType))return;
    const context=parentSeriesContext(entry,item);
    const named=explicitSeries&&meaningfulSeries(identityKey(entry.series));
    const provisional=unresolvedAnnual||!entry.run&&(context.conflict||!context.strong&&!named||(knownRuns.get(scopeKey(entry))?.size??0)>1);
    const key=contentKey(entry)+(provisional?':parent:'+item.id:'');
    const evidence=index.get(key)??[];
    evidence.push({item,entry,confidence,provisional,...(includeExcerpts?{statement}:{}),...(review?{review}:{})});index.set(key,evidence);
  };
  for(const {original,contents,entries,standalone} of rows){
    const item=effectiveOwnershipRecord(original,database);
    if(item.mediaType!=='book'||!['owned','claimed'].includes(item.ownership)||excludeProviders.includes(item.provider)||excludeItemIds.includes(item.id))continue;
    for(const entry of entries){
      const unresolvedAnnual=entry.unitType==='annual'&&!entry.run&&contents.annualRunHints?.some(hint=>!hint.resolvedRun&&identityKey(hint.series)===identityKey(entry.series)&&hint.numbers.includes(entry.number));
      add(item,entry,contents.confidence,contents.review,Boolean(contents.review)||['explicit-statement','explicit-clause','natural-reprint'].includes(contents.parseBinding),contents.review?.statement||contents.manifestEvidence||contentsStatement(original),unresolvedAnnual);
      if((entry.completeness!=='full'&&!includeExcerpts)||!comicUnit(entry))unresolved.push({item,entry,reason:entry.completeness==='excerpt'?'excerpt':'unsupported or named material'});
    }
    for(const fragment of contents.unparsed??[])unresolved.push({item,fragment,reason:'unparsed source'});
    for(const entry of standalone)add(item,entry,'direct',undefined,true);
  }
  // Preserve the existing verified volume and parent-local component tools.
  for(const [key,evidence]of ownedContentIndex(database,{excludeProviders,excludeItemIds})){
    const retained=evidence.filter(value=>!['issue','annual','special'].includes(value.entry.unitType)).map(value=>({...value,confidence:'verified'}));
    if(retained.length)index.set(key,retained);
  }
  return {index,unresolved};
}

export function libraryContentCoverage(database,requested,options={}) {
  const {index,unresolved}=libraryCoverageIndex(database,{...options,includeExcerpts:false});
  const entries=requested.map(entry=>resolveCoverageEntry(entry,options.parent));
  const result=contentCoverage(database,entries,{...options,contentIndex:index,requireIdentityScope:true,allowUnspecifiedRun:true});
  return {...result,verified:result.covered.filter(value=>value.evidence.some(e=>e.confidence==='verified')).length,
    direct:result.covered.filter(value=>value.evidence.some(e=>e.confidence==='direct')&&!value.evidence.some(e=>e.confidence==='verified')).length,
    inferred:result.covered.filter(value=>value.evidence.every(e=>e.confidence==='inferred')).length,unresolved};
}

export function librarySeriesCoverage(database,options={}) {
  const {index,unresolved}=libraryCoverageIndex(database,options);
  const groups=seriesCoverage(database,{contentIndex:index,requireIdentityScope:true,resolvedScope:true,includeExcerpts:options.includeExcerpts});
  for(const group of groups){
    group.provisional=group.entries.some(entry=>entry.provisional);
    group.verified=group.entries.filter(entry=>entry.confidence==='verified').length;
    group.direct=group.entries.filter(entry=>entry.confidence==='direct').length;
    group.inferred=group.entries.length-group.verified-group.direct;
    // Insufficient/conflicting series context remains source-local. Supported
    // run-unspecified groups have useful overlap/gaps without inventing a run.
    if(group.provisional){group.possibleGaps=group.gaps;group.gaps=[];group.overlap=[];}
  }
  return {groups,unresolved};
}
