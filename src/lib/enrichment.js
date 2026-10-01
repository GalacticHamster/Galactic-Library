import {identityEvidence} from './identity.js';

export function enrichmentQuery(canonical,records){
  const evidence=records.map(identityEvidence);const first=evidence[0]??{};
  const approvedOpen=records.map(record=>record.metadata?.enrichment?.openLibrary).find(entry=>entry?.approved===true);
  const publisher=first.publisher||approvedOpen?.publishers?.[0]||'';
  return {title:canonical.title,authors:[...new Set(evidence.flatMap(record=>record.authors))],isbn:[...new Set(evidence.flatMap(record=>record.isbn))],series:first.series??[],volume:first.unitType==='volume'?first.unit:'',issue:first.unitType==='issue'?first.unit:'',language:first.language,edition:first.edition,run:first.run,publisher,bundleTitle:records.map(record=>record.metadata?.sourceBundle||record.metadata?.bundleTitle).find(Boolean)??''};
}

export function enrichmentStages(records,database={}){
  const entries=records.map(record=>record.metadata?.enrichment??{});
  const approved=entry=>entry?.approved===true;
  return {
    genre:entries.some(entry=>entry.googleBooks?.categories?.length||entry.googleBooksGenreHint?.categories?.length||entry.openLibrary?.subjects?.length||(approved(entry.localMetadata)&&entry.localMetadata.categories?.length)),
    work:entries.some(entry=>approved(entry.openLibrary)),
    edition:entries.some(entry=>entry.googleBooks?.volumeId||approved(entry.localMetadata)),
    creators:records.some(record=>identityEvidence(record).authors.length||identityEvidence(record).contributors.length),
    contents:records.some(record=>database.contentReviews?.[record.id]),
    contentsLookup:entries.some(entry=>entry.kindleProductComicContents),
  };
}

export function needsGoogleBooksEnrichment(records){return !records.some(record=>record.metadata?.enrichment?.googleBooks?.volumeId);}
