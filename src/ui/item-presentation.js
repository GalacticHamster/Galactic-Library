import {identityEvidence} from '../lib/identity.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {contentsSummary} from './contents-overview.js';
export const providerLabel=id=>({steam:'Steam',gog:'GOG',epic:'Epic',kindle:'Kindle',audible:'Audible',kobo:'Kobo',humble:'Humble Bundle',fanatical:'Fanatical','amazon-games':'Amazon Games','amazon-video':'Amazon Video','fandango-at-home':'Fandango at Home'}[id]??id);
export const mediaLabel=id=>({book:'Book',audiobook:'Audiobook',game:'Game',software:'Software',movie:'Movie',tv:'TV show'}[id]??id);
export const accountLabel=(record,db)=>`${providerLabel(record.provider)} — ${db.providerProfiles?.[record.profileId]?.nickname||'Unnamed account'}`;
export const accessLabel=value=>({owned:'Owned',claimed:'Permanently claimed',borrowed:'Borrowed',subscription:'Subscription access',rental:'Rented',unknown:'Ownership unconfirmed'}[value]??'Access unconfirmed');
export function artworkUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function itemPresentation(canonical,records,database){
  const identities=records.map(identityEvidence);
  const values=key=>[...new Set(identities.flatMap(identity=>Array.isArray(identity[key])?identity[key]:identity[key]?[identity[key]]:[]))];
  const details=[];
  for(const [key,label] of [['series','Series'],['unit','Volume / issue'],['edition','Edition'],['run','Series version'],['language','Language'],['publisher','Publisher']]){const known=values(key);if(known.length)details.push({label,values:known});}
  const dates=[...new Set(records.flatMap(record=>[record.metadata?.publicationDate,record.metadata?.enrichment?.googleBooks?.publishedDate,record.metadata?.enrichment?.localMetadata?.approved?record.metadata.enrichment.localMetadata.publishedDate:null]).filter(Boolean))];
  if(dates.length)details.push({label:'Publication',values:dates});
  return {title:canonical.title,media:mediaLabel(canonical.mediaType),creators:values('authors'),details,
    cover:records.map(record=>artworkUrl(record.metadata?.imageUrl)).find(Boolean)||'',
    records:records.map(record=>{
      const effective=effectiveOwnershipRecord(record,database),review=database.ownershipReviews?.[record.recordRef],reading=database.readingStates?.[record.recordRef];
      return {record,label:accountLabel(record,database),access:accessLabel(effective.ownership),observedAccess:accessLabel(record.ownership),override:Boolean(effective.ownershipOverride),reviewed:Boolean(review),
        acquiredAt:record.acquiredAt||'',observedAt:record.observedAt||'',
        reading:['book','audiobook'].includes(record.mediaType)?reading?`${reading.status} · ${reading.progress}%${reading.downloaded?' · downloaded locally':''}`:'Reading status not saved':null,
        contents:record.mediaType==='book'?contentsSummary(record,database):null};
    })};
}
