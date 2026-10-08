// A presentation projection of committed evidence. No parsing, fetching or writes.
export const CONTENTS_STATUSES = {
  reviewed:'Reviewed contents', identified:'Contents identified — not reviewed',
  partial:'Contents partially identified', uncertain:'Contents need review',
  missing:'No usable contents in captured source', unattempted:'Acquisition not attempted',
  failed:'Source failed or unavailable'
};
const failed = value => ['unavailable','temporary-failure'].includes(value);
export function contentsSummary(record, database) {
  const saved=record.metadata?.enrichment?.kindleProductComicContents;
  const local=record.metadata?.enrichment?.localMetadata;
  const statement=saved?.statement?.trim() || local?.statement?.trim() || '';
  const review=database.contentReviews?.[record.id];
  const attempt=database.kindleContentsObservations?.[record.recordRef]?.latestAttempt ?? saved;
  const candidate=saved?.manifest?.candidates?.[saved.manifest.selected];
  const changed=Boolean(review && statement && statement!==review.statement);
  const incomplete=Boolean(saved?.descriptionMayBeIncomplete || saved?.manifest?.descriptionMayBeIncomplete || candidate?.truncated);
  const outcome=saved?.parseOutcome;
  let status=review?'reviewed':statement
    ? incomplete||outcome==='partial'?'partial':outcome==='full'?'identified':'uncertain'
    :failed(attempt?.availability)?'failed':saved?'missing':'unattempted';
  const needsReview=changed || !review&&Boolean(statement);
  // A saved candidate's count may describe a child span, not the review input.
  // Count reviewed entries only; obtain exact proposed counts lazily in the editor.
  return {id:record.id,recordRef:record.recordRef,title:record.title,provider:record.provider,
    nickname:database.providerProfiles?.[record.profileId]?.nickname || 'Unnamed account',
    status,label:CONTENTS_STATUSES[status],needsReview,changed,incomplete,
    failed:failed(attempt?.availability),retained:Boolean(failed(attempt?.availability)&&(statement||review)),
    attempt:attempt?.availability??'never-checked',count:review?.entries?.length??null,
    updatedAt:attempt?.checkedAt||review?.verifiedAt||saved?.checkedAt||local?.retrievedAt||'',
    reviewedAt:review?.verifiedAt||'',hasStatement:Boolean(statement)};
}
export function createContentsProjection() {
  let current,rows=[];
  return database=>{
    if(database===current)return rows;
    current=database;
    rows=Object.values(database.providerItems??{}).filter(record=>record.mediaType==='book')
      .map(record=>contentsSummary(record,database)).sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true})||a.id.localeCompare(b.id));
    return rows;
  };
}
export function contentsPage(rows,{query='',status='all',provider='all',page=0,size=50}={}) {
  const text=query.trim().toLocaleLowerCase();
  const filtered=rows.filter(row=>(status==='all'||status==='review'?row.needsReview||status==='all':status==='failure'?row.failed:row.status===status)
    && (provider==='all'||row.provider===provider)
    && `${row.title} ${row.nickname}`.toLocaleLowerCase().includes(text));
  const pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.max(0,Math.min(page,pages-1));
  return {rows:filtered.slice(page*size,(page+1)*size),total:filtered.length,page,pages};
}
