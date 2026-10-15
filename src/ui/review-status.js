// Presentation counts only. Never resolves or discards saved evidence.
export function bookReviewCounts(database) {
  const counts={attention:0,lookups:0};
  const records=new Map(Object.values(database.providerItems??{}).map(record=>[record.recordRef,record]));
  for(const review of Object.values(database.enrichmentReviews??{})){
    if(!review.recordRefs?.length||!review.recordRefs.every(ref=>records.get(ref)?.mediaType==='book'))continue;
    if(['failed','no-results'].includes(review.status))counts.lookups++;
    else counts.attention++;
  }
  // The book-information queue also exposes retryable saved Kindle lookups.
  // Count the same result rows without parsing any captured descriptions.
  counts.lookups += [...records.values()].filter(record=>record.mediaType==='book'&&record.metadata?.enrichment?.kindleProductComicContents?.availability==='temporary-failure').length;
  return counts;
}
export function receiptReviewCounts(database) {
  const counts={attention:0,waiting:0};
  const records=new Map(Object.values(database.providerItems??{}).map(record=>[record.recordRef,record]));
  for(const proposal of Object.values(database.ownershipProposals??{})){
    const selectable=proposal.recordRefs.some(ref=>{const record=records.get(ref);return record&&record.profileId===proposal.profileId;});
    counts[selectable?'attention':'waiting']++;
  }
  return counts;
}
export function workbenchReviewCounts(rows) {
  return {attention:rows.filter(row=>row.review&&['candidates','conflicts'].includes(row.category)).length,
    sourceConflicts:rows.filter(row=>!row.review&&row.category==='conflicts').length,
    lookups:rows.filter(row=>row.category==='failed').length,
    contents:rows.filter(row=>row.category==='unparsed').length,
    saved:rows.filter(row=>row.category==='undo').length};
}
