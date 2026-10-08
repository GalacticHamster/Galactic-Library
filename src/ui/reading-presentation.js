import {accessLabel,readingAccessLabel,formatDate} from './formatters.js';
import {readingEvidence} from '../lib/reading.js';
export const readingStatusLabel=value=>({unread:'Unread',reading:'Reading',completed:'Completed'}[value]??'Reading status not saved');
export function readingSummary(item,database){
  const saved=database.readingStates?.[item.recordRef],entry=readingEvidence(item,database);
  const reading=saved?`${readingStatusLabel(saved.status)} (${saved.progress}%)`:'Reading status not saved';
  return `Ownership: ${accessLabel(entry.ownership)}; access: ${readingAccessLabel(entry.access)}${entry.accessCheckedAt?` (checked ${formatDate(entry.accessCheckedAt)})`:''}; downloaded: ${entry.downloaded?'yes':'not confirmed'}; ${reading}.`;
}
