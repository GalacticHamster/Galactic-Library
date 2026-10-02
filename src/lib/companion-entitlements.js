import {object,text,date} from './validation.js';

export const FEED_UPLOAD_KEY='galacticLibraryCompanionFeedUploads';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
export function validateEntitlementEntry(value){
  object(value,'Companion entitlement');const fields=['itemRef','title','mediaType','keyStatus','expiresAt','checkedAt','purchaseEvidence','activationStatus'];
  if(Object.keys(value).some(key=>!fields.includes(key))||!uuid.test(value.itemRef)||!['game','software','book','audiobook','unknown'].includes(value.mediaType)||!['unknown','unrevealed','revealed','expired','unavailable'].includes(value.keyStatus)||value.purchaseEvidence!=='confirmed'||value.activationStatus!=='unknown')throw new Error('Invalid companion entitlement DTO.');
  const title=text(value.title,500,'Entitlement title'),checkedAt=date(value.checkedAt);if(!title||!checkedAt)throw new Error('Entitlement needs its title and observation date.');
  return {itemRef:value.itemRef,title,mediaType:value.mediaType,keyStatus:value.keyStatus,expiresAt:date(value.expiresAt),checkedAt,purchaseEvidence:'confirmed',activationStatus:'unknown'};
}
export function validateCompanionFeeds(value={}){
  object(value,'Companion reminder feeds');if(Object.keys(value).length>64)throw new Error('Too many companion reminder feeds.');let count=0;const refs=new Set();
  return Object.fromEntries(Object.entries(value).map(([clientId,feed])=>{
    object(feed,'Companion feed');const profileLabel=text(feed.profileLabel,100,'Feed profile');
    if(!/^[a-p]{32}$/u.test(clientId)||!profileLabel||!['complete','partial'].includes(feed.coverage)||!Array.isArray(feed.entries)||feed.entries.length>100000||!uuid.test(feed.revisionRef))throw new Error('Invalid companion reminder feed.');
    const entries=feed.entries.map(entry=>{const {localRef,...dto}=entry;if(!uuid.test(localRef)||refs.has(localRef))throw new Error('Invalid central reminder reference.');refs.add(localRef);return {...validateEntitlementEntry(dto),localRef};});count+=entries.length;if(count>100000||new Set(entries.map(entry=>entry.itemRef)).size!==entries.length)throw new Error('Companion reminder entries exceed bounds or contain duplicates.');
    const sentAt=date(feed.sentAt),receivedAt=date(feed.receivedAt);if(!sentAt||!receivedAt)throw new Error('Feed needs its observation dates.');
    return [clientId,{profileLabel,coverage:feed.coverage,revisionRef:feed.revisionRef,sentAt,receivedAt,entries}];
  }));
}
