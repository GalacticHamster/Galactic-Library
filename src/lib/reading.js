import {object,text,date} from './validation.js';
import {effectiveOwnershipRecord} from './ownership.js';

export const READING_MEDIA=['book','audiobook'];
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
export function validateReadingState(entry){
  object(entry,'Reading state');if(!uuid.test(entry.revisionRef)||!['unread','reading','completed'].includes(entry.status)||!['unknown','accessible','unavailable'].includes(entry.access)||typeof entry.downloaded!=='boolean')throw new Error('Invalid reading state.');
  if(!Number.isInteger(entry.progress)||entry.progress<0||entry.progress>100||entry.status==='unread'&&entry.progress!==0||entry.status==='completed'&&entry.progress!==100||entry.status==='reading'&&entry.progress===100)throw new Error('Reading progress does not agree with its status.');
  const accessCheckedAt=date(entry.accessCheckedAt),updatedAt=date(entry.updatedAt);if(!updatedAt||entry.access!=='unknown'&&!accessCheckedAt)throw new Error('Reading/access state needs its review date.');
  return {revisionRef:entry.revisionRef,status:entry.status,progress:entry.progress,downloaded:entry.downloaded,access:entry.access,accessCheckedAt,updatedAt};
}
export function validateReadingStates(value={}){
  object(value,'Reading states');if(Object.keys(value).length>100000)throw new Error('Too many reading states.');
  return Object.fromEntries(Object.entries(value).map(([ref,entry])=>{if(!uuid.test(ref))throw new Error('Invalid reading record reference.');return [ref,validateReadingState(entry)];}));
}
export function validateReadingOrder(entry){
  object(entry,'Reading order');const title=text(entry.title,200,'Reading order title');
  if(!title||!uuid.test(entry.revisionRef)||!Array.isArray(entry.recordRefs)||entry.recordRefs.length>500||entry.recordRefs.some(ref=>!uuid.test(ref))||new Set(entry.recordRefs).size!==entry.recordRefs.length)throw new Error('Invalid reading order.');
  const updatedAt=date(entry.updatedAt);if(!updatedAt)throw new Error('Reading order needs its review date.');
  return {title,revisionRef:entry.revisionRef,recordRefs:[...entry.recordRefs],updatedAt};
}
export function validateReadingOrders(value={}){
  object(value,'Reading orders');if(Object.keys(value).length>1000)throw new Error('Too many reading orders.');
  const result=Object.fromEntries(Object.entries(value).map(([ref,entry])=>{if(!uuid.test(ref))throw new Error('Invalid reading order reference.');return [ref,validateReadingOrder(entry)];}));
  if(Object.values(result).reduce((sum,entry)=>sum+entry.recordRefs.length,0)>100000)throw new Error('Reading orders contain too many entries.');return result;
}
export function readingEvidence(item,database){
  const saved=database.readingStates?.[item.recordRef],effective=effectiveOwnershipRecord(item,database);
  return {ownership:effective.ownership,access:saved?.access??'unknown',accessCheckedAt:saved?.accessCheckedAt??null,downloaded:saved?.downloaded??false,status:saved?.status??'unread',progress:saved?.progress??0};
}
export function readingLabel(item,database){
  const entry=readingEvidence(item,database);return `Ownership: ${entry.ownership}; access: ${entry.access}${entry.accessCheckedAt?` (checked ${entry.accessCheckedAt})`:''}; downloaded: ${entry.downloaded?'yes':'not confirmed'}; reading: ${entry.status} (${entry.progress}%).`;
}
