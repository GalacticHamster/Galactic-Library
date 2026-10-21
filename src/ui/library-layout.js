import {providerLabel,mediaLabel,accessLabel} from './item-presentation.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';

const text=(tag,value,className)=>Object.assign(document.createElement(tag),{textContent:value,className});

// Display only: summarize every source, independently of the active filters.
// Other states retain their existing labels, preferring current access over loss
// of access. No state here creates purchase evidence or changes provider records.
export function compactAccessStatus(records,database){
  const states=new Set(records.map(({record})=>effectiveOwnershipRecord(record,database).ownership));
  return ['owned','subscription','unknown','claimed','borrowed','rental','returned','revoked','expired'].find(state=>states.has(state))??'unknown';
}

// The existing card/actions are constructed once, only when this page's row
// opens. Layout never changes catalog records, filtering or acquisition counts.
export function mountLibraryRow(node,row,database,{layout,expanded,onToggle},build){
  if(layout!=='compact'){build(node);return;}
  node.classList.add('library-item-compact');
  const disclosure=document.createElement('details');disclosure.className='library-compact-entry';
  const summary=document.createElement('summary');
  summary.append(text('strong',row.canonical.title,'library-compact-title'),text('span',mediaLabel(row.canonical.mediaType),'library-compact-media'));
  for(const provider of new Set(row.records.map(value=>value.record.provider)))summary.append(text('span',providerLabel(provider),'library-compact-provider'));
  const status=compactAccessStatus(row.records,database);
  const badge=text('span',status==='subscription'?'Subscription':accessLabel(status),'library-compact-access');badge.dataset.access=status;summary.append(badge);
  const body=document.createElement('div');body.className='library-compact-body';let built=false;
  const prepare=()=>{if(!built){built=true;build(body);}};
  disclosure.append(summary,body);node.append(disclosure);
  disclosure.addEventListener('toggle',()=>{if(!disclosure.isConnected)return;if(disclosure.open)prepare();onToggle(disclosure.open);});
  if(expanded){disclosure.open=true;prepare();}
}

export function expandCompactLibraryRow(node){
  const disclosure=node.querySelector('.library-compact-entry');
  if(disclosure&&!disclosure.open){disclosure.open=true;disclosure.dispatchEvent(new Event('toggle'));}
}
