import {providerLabel,mediaLabel,accountLabel,accessLabel} from './formatters.js';
export {providerLabel,mediaLabel,accountLabel,accessLabel} from './formatters.js';
import {identityEvidence} from '../lib/identity.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {contentsSummary} from './contents-overview.js';
export function artworkUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function itemPresentation(canonical,records,database){
  const identities=records.map(identityEvidence);
  const values=key=>[...new Set(identities.flatMap(identity=>Array.isArray(identity[key])?identity[key]:identity[key]?[identity[key]]:[]))];
  const details=[];
  for(const [key,label] of [['series','Series'],['unit','Volume / issue'],['edition','Edition'],['run','Series version'],['language','Language'],['publisher','Publisher'],['isbn','ISBN']]){const known=values(key);if(known.length)details.push({label,values:known});}
  if(canonical.mediaType==='audiobook'){const narrators=[...new Set(records.flatMap(record=>record.metadata?.narrators??[]))];if(narrators.length)details.push({label:'Narrated by',values:narrators});}
  const dates=[...new Set(records.flatMap(record=>[record.metadata?.publicationDate,record.metadata?.enrichment?.googleBooks?.publishedDate,record.metadata?.enrichment?.localMetadata?.approved?record.metadata.enrichment.localMetadata.publishedDate:null]).filter(Boolean))];
  if(dates.length)details.push({label:'Publication',values:dates});
  return {title:canonical.title,media:mediaLabel(canonical.mediaType),creators:values('authors'),details,
    cover:records.map(record=>artworkUrl(record.metadata?.imageUrl)).find(Boolean)||'',
    records:records.map(record=>{
      const effective=effectiveOwnershipRecord(record,database),review=database.ownershipReviews?.[record.recordRef],reading=database.readingStates?.[record.recordRef];
      return {record,label:accountLabel(record,database),access:accessLabel(effective.ownership),observedAccess:accessLabel(record.ownership),override:Boolean(effective.ownershipOverride),inferred:Boolean(effective.ownershipInference),reviewed:Boolean(review),
        acquiredAt:record.acquiredAt||'',observedAt:record.observedAt||'',
        accessCheckedAt:reading?.accessCheckedAt||'',readingAccess:reading?.access??'unknown',reviewExpiresAt:review?.expiresAt||'',
        reading:['book','audiobook'].includes(record.mediaType)?reading?`${reading.status} · ${reading.progress}%${reading.downloaded?' · downloaded locally':''}`:'Reading status not saved':null,
        contents:record.mediaType==='book'?contentsSummary(record,database):null};
    })};
}
