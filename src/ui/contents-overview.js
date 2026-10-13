import {compareTitles} from '../lib/title-sort.js';
import {contentsStatement,contentsReviewChanged} from '../lib/contents.js';
// A presentation projection of committed evidence. No parsing, fetching or writes.
export const CONTENTS_STATUSES = {
  rejected:'Contents rejected', reviewed:'Contents reviewed', identified:'Contents found · Not reviewed',
  partial:'Some contents found · Not reviewed', uncertain:'Contents need review',
  missing:'Contents not extracted', unattempted:'Not checked yet',
  failed:"Couldn't retrieve description"
};
const failed = value => ['unavailable','temporary-failure'].includes(value);
export function contentsSummary(record, database) {
  const saved=record.metadata?.enrichment?.kindleProductComicContents;
  const local=record.metadata?.enrichment?.localMetadata;
  const statement=contentsStatement(record);
  const review=database.contentReviews?.[record.id];
  const attempt=database.kindleContentsObservations?.[record.recordRef]?.latestAttempt ?? saved;
  const candidate=saved?.manifest?.candidates?.[saved.manifest.selected];
  const changed=contentsReviewChanged(record,review);
  const incomplete=Boolean(saved?.descriptionMayBeIncomplete || saved?.manifest?.descriptionMayBeIncomplete || candidate?.truncated);
  const outcome=statement&&!saved?.statement&&candidate?.binding==='natural-reprint'?candidate.outcome:saved?.parseOutcome;
  const status=review?review.status==='rejected'?'rejected':'reviewed':statement
    ? incomplete||outcome==='partial'?'partial':outcome==='full'?'identified':'uncertain'
    :failed(attempt?.availability)?'failed':saved?'missing':'unattempted';
  const needsReview=review?.status==='rejected'?false:changed || !review&&Boolean(statement);
  const updatedAt=[attempt?.checkedAt,review?.verifiedAt,saved?.checkedAt,local?.appliedAt||local?.retrievedAt]
    .filter(value=>Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??'';
  // A saved candidate's count may describe a child span, not the review input.
  // Count reviewed entries only; obtain exact proposed counts lazily in the editor.
  return {id:record.id,recordRef:record.recordRef,title:record.title,provider:record.provider,
    nickname:database.providerProfiles?.[record.profileId]?.nickname || 'Unnamed account',
    status,label:CONTENTS_STATUSES[status],needsReview,changed,incomplete,
    failed:failed(attempt?.availability),retained:Boolean(failed(attempt?.availability)&&(statement||review)),
    attempt:attempt?.availability??'never-checked',count:review?.entries?.length??null,
    updatedAt,
    reviewedAt:review?.verifiedAt||'',hasStatement:Boolean(statement)};
}
export function createContentsProjection() {
  let current,rows=[];
  return database=>{
    if(database===current)return rows;
    current=database;
    rows=Object.values(database.providerItems??{}).filter(record=>record.mediaType==='book')
      .map(record=>contentsSummary(record,database)).sort((a,b)=>compareTitles(a.title,b.title)||a.id.localeCompare(b.id));
    return rows;
  };
}
export function contentsPage(rows,{query='',status='all',provider='all',page=0,size=50}={}) {
  const text=query.trim().toLocaleLowerCase();
  const filtered=rows.filter(row=>(status==='all'?true:status==='review'?row.needsReview:status==='failure'?row.failed:row.status===status)
    && (provider==='all'||row.provider===provider)
    && `${row.title} ${row.nickname}`.toLocaleLowerCase().includes(text));
  const pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.max(0,Math.min(page,pages-1));
  return {rows:filtered.slice(page*size,(page+1)*size),total:filtered.length,page,pages};
}
