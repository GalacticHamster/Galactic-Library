// Presentation comparisons never establish contents or publication identity.
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const captureFields=source=>{
  const copy=structuredClone(source);
  for(const key of ['selectionRef','checkedAt','retrievedAt','appliedAt','categoriesCheckedAt'])delete copy[key];
  if(copy.productDetailsEvidence){delete copy.productDetailsEvidence.capturedAt;for(const entry of copy.productDetailsEvidence.observations??[])delete entry.capturedAt;}
  return copy;
};
// Only routine Kindle acquisitions use this guard. Explicit source choices,
// reviews and undo keep their existing paths. All evidence and parser fields
// must match; only known retrieval/selection bookkeeping is disregarded.
export function identicalCapture(a,b){return Boolean(a&&b)&&JSON.stringify(ordered(captureFields(a)))===JSON.stringify(ordered(captureFields(b)));}
export function sourceDifference(previous,current){
  if(!previous)return 'No earlier source was selected.';
  if(!current)return 'The later selected source is not available for comparison.';
  if(previous.source!==current.source||previous.sourceUrl!==current.sourceUrl)return 'Different source; identical wording would not establish identical evidence.';
  if(previous.statement===current.statement)return 'Same displayed statement. Other evidence or parser information may differ.';
  const a=previous.statement,b=current.statement;
  if(typeof a==='string'&&typeof b==='string'&&a.replace(/\s+/gu,' ').trim()===b.replace(/\s+/gu,' ').trim())return 'Only whitespace differs in the displayed statement. Original evidence is retained.';
  if(typeof a==='string'&&typeof b==='string'&&a.replace(/[.!]$/u,'')===b.replace(/[.!]$/u,''))return 'Only final sentence punctuation differs in the displayed statement. This does not establish equivalent contents; original evidence is retained.';
  return 'The displayed statement changed. Compare the original wording below.';
}
export function sourceHistory(database,recordRef){
  const timestamp=value=>typeof value==='string'&&value.trim()&&Number.isFinite(Date.parse(value))?Date.parse(value):Number.NEGATIVE_INFINITY;
  return Object.entries(database.enrichmentHistory??{}).filter(([,entry])=>entry.recordRef===recordRef).map(([id,entry])=>({id,...entry})).sort((a,b)=>{
    const x=timestamp(a.changedAt),y=timestamp(b.changedAt);
    return x===y?(a.id<b.id?-1:a.id>b.id?1:0):x>y?-1:1;
  });
}
export const sourceName=kind=>({kindleProductComicContents:'Kindle description',googleBooks:'Google Books edition',openLibrary:'Open Library work',googleBooksGenreHint:'Google Books category suggestion',localMetadata:'File or publisher metadata'}[kind]??'Saved source');
