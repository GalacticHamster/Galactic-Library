import {proposeContentsForReview,validateContents,contentKey} from './contents.js';

// User-authored draft only: no captured-source context, inferred series aliases
// or writes. Keep all unsupported fragments visible before users append rows.
export function previewQuickContents(input){
  const text=String(input??'').trim();
  if(text.length>10000)throw Error('Use at most 10,000 characters. Add a long list in smaller sections.');
  const parsingText=text.split(/\r?\n/u).map(line=>line.trim()).filter(Boolean).join('; ');
  const proposal=proposeContentsForReview(parsingText),groups=new Map(),unparsed=[...proposal.unparsed];
  // Discovery may shorten provider-style trailing text. In a manual draft,
  // expose that tail too; never silently lose another user-entered clause.
  const compact=parsingText.replace(/\s+/gu,' ').trim(),normalized=proposal.normalizedInput;
  if(normalized.length<compact.length&&compact.startsWith(normalized)){
    const tail=compact.slice(normalized.length).replace(/^[.!?\s]+/u,'').replace(/^["”]+$/u,'').trim();
    if(tail&&!unparsed.includes(tail))unparsed.push(tail);
  }
  for(const entry of proposal.entries){
    const key=JSON.stringify([entry.series,entry.run,entry.unitType,entry.completeness]);
    const group=groups.get(key)??{series:entry.series,run:entry.run,unitType:entry.unitType,completeness:entry.completeness,numbers:[]};group.numbers.push(entry.number);groups.set(key,group);
  }
  return {text,entries:proposal.entries,groups:[...groups.values()],unparsed,annualRunHints:proposal.annualRunHints??[]};
}
export function quickContentsToAppend(existing,proposed){
  const seen=new Set();
  const key=entry=>contentKey(entry)+':'+entry.completeness;
  // Incomplete/corrected draft rows stay untouched. Only valid identities can
  // establish duplicates; full and excerpt support remain different entries.
  for(const entry of existing)try{seen.add(key(validateContents([entry])[0]));}catch{}
  const added=[];
  for(const entry of validateContents(proposed)){const id=key(entry);if(seen.has(id))continue;seen.add(id);added.push(entry);}
  if(existing.length+added.length>2000)throw Error('A review can hold at most 2,000 entries. Remove entries or add a smaller section.');
  return added;
}
export function quickContentsNumbers(numbers){
  const ranges=[];
  for(let i=0;i<numbers.length;i++){
    const first=numbers[i];let last=first;
    while(/^\d+$/u.test(last)&&/^\d+$/u.test(numbers[i+1]??'')&&Number(numbers[i+1])===Number(last)+1)last=numbers[++i];
    ranges.push(first===last?'#'+first:'#'+first+'–'+last);
  }return ranges.join(', ');
}
