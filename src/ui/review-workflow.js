import {countLabel} from './formatters.js';
export const REVIEW_LABELS={all:'All review records',attention:'Metadata suggestions needing a decision',missing:'Missing optional book details',candidates:'Book information suggestions',conflicts:'Conflicting sources',failed:'Failed lookups / no results',unparsed:'All contents descriptions and suggestions','contents-suggestions':'Issue lists ready to confirm','contents-check':'Issue lists needing more context','contents-information':'Descriptions without an issue list','contents-changed':'Descriptions changed since review',undo:'Source choice history','review-history':'Contents review history'};
export const REVIEW_TASKS={ready:{label:'Ready to confirm',categories:['contents-suggestions','candidates']},information:{label:'Needs more information',categories:['contents-information','contents-check','missing','failed']},conflicts:{label:'Conflicts and changes',categories:['conflicts','contents-changed']},history:{label:'Review history / Undo',categories:['undo','review-history']},all:{label:'All review tasks',categories:['all','attention','unparsed']}};
export function reviewCategory(row){return row.category==='unparsed'?(row.contentsState==='suggestions'?(row.contentsConfirmation?.eligible?'contents-suggestions':'contents-check'):'contents-'+row.contentsState):row.category;}
export function reviewTaskForCategory(category){return Object.keys(REVIEW_TASKS).find(key=>REVIEW_TASKS[key].categories.includes(category))??'all';}
export function matchesReviewCategory(row,category){return category==='all'||category==='attention'&&row.review&&['candidates','conflicts'].includes(row.category)||category==='unparsed'&&row.category==='unparsed'||reviewCategory(row)===category;}
export function reviewWorkflowCounts(rows){
 const count=category=>rows.filter(row=>reviewCategory(row)===category).length;
 return {readyBooks:count('contents-suggestions'),metadataSuggestions:count('candidates'),decisions:count('conflicts')+count('contents-changed'),optionalGaps:count('missing')+count('contents-information')+count('contents-check'),failedLookups:count('failed'),history:count('undo')+count('review-history')};
}

export function reviewWorkflowSummary(counts){
 return [countLabel(counts.readyBooks,'book list ready to confirm','book lists ready to confirm'),countLabel(counts.metadataSuggestions,'book information suggestion'),countLabel(counts.decisions,'record needing a closer decision','records needing a closer decision'),countLabel(counts.optionalGaps,'optional information gap'),countLabel(counts.failedLookups,'lookup failure / no results','lookup failures / no results'),countLabel(counts.history,'history record')].join(' / ');
}
