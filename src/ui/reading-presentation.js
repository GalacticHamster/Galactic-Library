import {readingEvidence} from '../lib/reading.js';
export const readingStatusLabel=value=>({unread:'Unread',reading:'Reading',completed:'Completed'}[value]??'Reading status not saved');
export function readingSummary(item,database){
  const saved=database.readingStates?.[item.recordRef],entry=readingEvidence(item,database);
  const reading=saved?`${readingStatusLabel(saved.status)} (${saved.progress}%)`:'Reading status not saved';
  return `Ownership: ${entry.ownership}; access: ${entry.access}${entry.accessCheckedAt?` (checked ${entry.accessCheckedAt})`:''}; downloaded: ${entry.downloaded?'yes':'not confirmed'}; ${reading}.`;
}
