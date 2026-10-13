import { compact, identityKey } from './identity.js';
import { object, text, date, url } from './validation.js';
import {effectiveOwnershipRecord} from './ownership.js';
import {assessContentsQuality} from './contents-quality.js';

const UNIT_TYPES = new Set(['issue', 'volume', 'annual', 'special', 'component']);
export const CONTENTS_PARSER_VERSION = 8;
export function seriesDescriptor(series, run = '') {
  const text = compact(series); const year = /\s*\((\d{4})\)\s*$/u.exec(text);
  return {series: year ? text.slice(0, year.index).trim() : text, run: compact(run || year?.[1], 100)};
}

export function validateContents(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 2000) throw new Error('Contents must contain 1–2,000 entries.');
  const result = entries.map((entry) => {
    object(entry,'Contents entry');
    const {series, run} = seriesDescriptor(text(entry.series,500,'Series'), text(entry.run,100,'Run'));
    const unitType = text(entry.unitType,20,'Unit type'); const number = text(entry.number,80,'Unit number');
    const completeness = entry?.completeness ?? 'full';
    if (!series || !UNIT_TYPES.has(unitType) || !number || !['full','excerpt'].includes(completeness)) throw new Error('Each contents entry needs a series, unit type, number, and full/excerpt scope.');
    if (['issue','volume','annual'].includes(unitType) && (!/^(?:\d{1,6}\/\d{1,6}|\d{1,6}(?:\.\d{1,6})?)$/u.test(number) || /\/0+$/u.test(number))) throw new Error('Issue/volume/annual numbers must be numeric, decimal, or fractional.');
    return {series,run,unitType,number,language:text(entry.language,80,'Language').toLowerCase(),completeness};
  });
  return [...new Map(result.map((entry) => [`${contentKey(entry)}:${entry.completeness}`, entry])).values()];
}

export function contentKey(entry) {
  const fraction=/^(\d+)\/(\d+)$/u.exec(entry.number);
  const number=entry.unitType==='component'?entry.number:fraction?String(Number(fraction[1])/Number(fraction[2])):/^\d+(?:\.\d+)?$/u.test(entry.number)?String(Number(entry.number)):entry.number;
  return JSON.stringify([identityKey(entry.series),identityKey(entry.run),entry.unitType,number,identityKey(entry.language)]);
}

// contentKey is an entry/dedup key, never global named-work identity. Verified
// component keys derive scope from the review owner and stored parent media.
function componentContentKey(entry,parentItemId,mediaType) {
  return JSON.stringify(['parent-component',parentItemId,mediaType,identityKey(entry.run),entry.number,identityKey(entry.language)]);
}

/** Parse explicit number statements into a proposal. Only review makes it evidence. */
export function proposeContents(statement) {
  const text = compact(statement, 10000).replace(/^collects?\s*:?\s*/iu, '');
  const entries=[]; const unparsed=[];
  // A partial reprint statement never silently becomes a full issue.
  const completeness = /\b(?:material from|excerpts? from|selections? from|partial)\b/iu.test(text) ? 'excerpt' : 'full';
  const chunks = [];
  const marker = /#\s*\d|\b(?:vol(?:ume)?s?\.?|books?)\s*\d/iu;
  for (const part of text.split(/\s*;\s*/u)) {
    let start = 0;
    for (const separator of part.matchAll(/\s*,\s*(?=[\p{L}]|#)|\s+and\s+(?=[\p{L}]|#)/gu)) {
      // Conjunctions inside a series name (Black and White) are not separators.
      if (!separator[0].includes(',') && !marker.test(part.slice(start, separator.index))) continue;
      chunks.push(part.slice(start, separator.index).trim());start = separator.index + separator[0].length;
    }
    chunks.push(part.slice(start).trim());
  }
  let lastSeries=''; let lastRun='';
  for (const chunk of chunks) {
    const match=/^(.*?)\s*(?:(vol(?:ume)?s?\.?|books?)\s*|(#)\s*)(\d+\/\d+|\d+(?:\.\d+)?)(?:\s*[-\u2013\u2014]\s*#?(\d+(?:\.\d+)?))?\s*[.!]?$/iu.exec(chunk.replace(/\b(?:material from|excerpts? from|selections? from)\s*/giu,''));
    if (!match) { if (chunk) unparsed.push(chunk); continue; }
    let label=match[1].replace(/^(?:and|,)\s*/iu,'').trim();
    let unitType=match[3]?'issue':'volume';
    if (/\bannuals?$/iu.test(label)) {unitType='annual';label=label.replace(/\s*annuals?$/iu,'').trim();}
    if (/\bspecials?$/iu.test(label)&&!/\bsuper\s+special$/iu.test(label)) {unitType='special';label=label.replace(/\s*specials?$/iu,'').trim();}
    if (/^(?:issues?|volumes?|vols?\.?|books?)$/iu.test(label)) {unparsed.push(chunk);continue;}
    const descriptor=seriesDescriptor(label||lastSeries,label? '':lastRun);
    if (!descriptor.series) {unparsed.push(chunk);continue;}
    lastSeries=descriptor.series;lastRun=descriptor.run;
    const first=match[4];const last=match[5];
    if (last && (!/^\d+$/u.test(first)||!/^\d+$/u.test(last)||Number(last)<Number(first)||Number(last)-Number(first)>499)) {unparsed.push(chunk);continue;}
    for (const number of last?Array.from({length:Number(last)-Number(first)+1},(_,index)=>String(Number(first)+index)):[first]) entries.push({...descriptor,unitType,number,language:'',completeness});
  }
  return {entries:entries.length?validateContents(entries):[],unparsed};
}

/** Discovery/editor-only proposals. Never used to index ordinary title matches. */
export function proposeContentsForReview(statement, collectionTitle = '', context = {}) {
  const quality=assessContentsQuality(compact(statement,10000),collectionTitle);
  const body=quality.normalizedInput.replace(/^(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b\s*[:\-]?\s*/iu,'');
  let parseBinding='explicit-statement',parseInput=quality.normalizedInput;
  const finish=(entries,unparsed)=>({...quality,parseBinding,parseInput,entries,unparsed,outcome:quality.quality==='filtered'?'filtered':quality.quality==='uncertain'?'uncertain':!entries.length?'failed':unparsed.length?'partial':'full'});
  if(quality.quality!=='containment')return finish([],body?[body]:[]);
  const anchor=reviewSeriesAnchor(collectionTitle,context);
  let input=body;
  if(anchor && /^(?:issues?\s*#?\s*|#\s*)\d/iu.test(body) && !/^issues?\s*#?\s*\d+(?:\s*[-–—]\s*\d+)?\s+of\s+/iu.test(body)){
    input=anchor.series+' '+body;parseBinding=anchor.basis;parseInput='Collects '+input;
  }
  const proposal=discoveryNumberedContents(input,collectionTitle,/^(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b/iu.test(quality.normalizedInput),context);
  if(proposal.entries.length || /#|\b(?:issues?|volumes?|vols?\.?|books?|chapters?)\s*#?\d|\d+\s*[-–—]\s*\d+/iu.test(body))return {...finish(proposal.entries,proposal.unparsed),...(proposal.annualRunHints?.length?{annualRunHints:proposal.annualRunHints}:{})};
  // This fallback is discovery/editor-only; ordinary matching still uses
  // proposeContents above. Unsupported numeric syntax never becomes a name.
  const names=containedNames(body);
  if(!collectionTitle || !names)return finish([],proposal.unparsed);
  try{return finish(validateContents(names.map(number=>({series:collectionTitle,run:'',unitType:'component',number,language:'',completeness:extentPrefix.test(body)?'excerpt':'full'}))),[]);}
  catch{return finish([],proposal.unparsed);}
}

const extentPrefix=/^(?:(?:backup|short|selected)\s+)?(?:material|pages|excerpts?|selections?|stories?|a (?:short |backup )?story)\s+(?:from|selected from)\s+|^selected\s+from\s+/iu;
const numericMarker=/#\s*\d|\b(?:issues?|vol(?:ume)?s?\.?|books?|chapters?)\s*#?\d|\b\d+(?:\/\d+|\.\d+)?\s*[-–—]\s*\d+/iu;

// Discovery ranges only: omit a multi-digit suffix's leading digits, never
// roll into another prefix or guess a single-digit abbreviation. Identity and
// the ordinary proposal parser retain their existing numeric semantics.
function reviewRangeEnd(first,last) {
  if(!last)return null;
  if(!/^\d+$/u.test(first)||!/^\d+$/u.test(last))return NaN;
  let end=Number(last);
  if(end<Number(first)&&last.length>=2&&last.length<first.length){
    end=Number(first.slice(0,-last.length)+last);
    if(end<=Number(first))return NaN;
  }
  return end>=Number(first)&&end-Number(first)<=499?end:NaN;
}

/** Bounded discovery grammar. Arbitrary prose must not become a series label. */
function discoveryNumberedContents(body,collectionTitle,collectionClaim=false,context={}) {
  const entries=[],unparsed=[],chunks=[],annualRunHints=[],annualBindings=[];
  // Parallel digital numbering is not a print-issue conversion. Retain a
  // finite, explicitly labelled aside separately so the print clause survives.
  body=body.replace(/\(\s*digital\s+(?:chapters?\s*)?#?\s*\d+(?:\s*[-–—]\s*#?\d+)?(?:\s*,\s*#?\d+(?:\s*[-–—]\s*#?\d+)?)*\s*\)/giu,raw=>{unparsed.push(raw);return '';});
  for(const part of body.split(/\s*;\s*/u)){
    let start=0;
    for(const separator of part.matchAll(/\s*,\s*(?:and\s+)?(?=["“\p{L}\d#])|\s+(?:and|plus|&|as well as|together with|along with)\s+(?=["“\p{L}\d#])/giu)){
      const prefix=part.slice(start,separator.index),next=part.slice(separator.index+separator[0].length);
      const prefixStem=/^\s*([\p{L}\d-]+)/u.exec(prefix)?.[1],nextStem=/^([\p{L}\d-]+)/u.exec(next)?.[1];
      const repeatedTitle=prefix.includes(':') && prefixStem && prefixStem.toLowerCase()===nextStem?.toLowerCase()
        || separator[0].includes(',') && prefixStem && prefixStem.toLowerCase()===nextStem?.toLowerCase();
      // Commas/conjunctions before a numeric anchor belong to the title. A
      // new extent qualifier must still start its own clause after named prose.
      const typedWork=/\b(?:one-shots?|specials?|annuals?)\s*$/iu.test(prefix);
      const postposed=/^\s*issues?\s*#?\s*\d+(?:\s*[-–—]\s*\d+)?\s+of\s+(.+)/iu.exec(prefix);
      const postTail=/^(?:part of\b|the (?:new |classic |acclaimed )?(?:ongoing )?series\b|features?\b|featuring\b|includes?\b|including\b|(?:written|drawn|illustrated) by\b)/iu.test(next);
      // Numbering before "of" is not a completed title. Keep title-internal
      // commas/conjunctions until a genuinely new numbered clause appears.
      const postLabel=postposed&&!/^(?:all|the|a|an|this|these|his|her|their)\s/u.test(postposed[1]);
      if(postLabel&&!numericMarker.test(next)&&!postTail)continue;
      const laterCollection=/^collects?\s+/iu.test(next);
      if(!numericMarker.test(prefix) && !/\d+(?:\/\d+|\.\d+)?\s*$/u.test(prefix) && !extentPrefix.test(next) && !repeatedTitle && !typedWork && !laterCollection)continue;
      chunks.push({raw:part.slice(start,separator.index).trim(),following:part.slice(start).trim(),reset:start===0});start=separator.index+separator[0].length;
    }
    chunks.push({raw:part.slice(start).trim(),following:part.slice(start).trim(),reset:start===0});
  }
  let previous=null;
  const headingExtent=extentPrefix.test(body)?'excerpt':'full';
  let clauseExtent=headingExtent;
  for(const {raw,following,reset} of chunks){
    if(!raw)continue;
    if(reset)clauseExtent=clauseExtent!=='full' && headingExtent==='full'?'uncertain':headingExtent;
    if(/^collects?\s+/iu.test(raw))clauseExtent='full';
    let chunk=raw.replace(/^(?:and|plus|as well as|together with|along with|collects?|collecting)\s+/iu,'');
    // Chapters have no supported unit type. Never let their numbers establish
    // issue entries or supply a series/type to a following bare continuation.
    if(/\bchapters?\s*#?\s*\d/iu.test(chunk)){unparsed.push(raw);previous=null;continue;}
    if(/\b(?:recommendations? for|reviews? of|description of|synopsis of|plot summary|scripts? from)\b/iu.test(chunk)){unparsed.push(raw);previous=null;continue;}
    if(/^(?:a|an|the)\s+(?:hero|character|villain)\s+(?:travels?|escapes?|fights?|meets?|is|will)\b/iu.test(chunk)||/^(?:[\p{Lu}][\p{L}'’\-]+\s+){1,4}(?:writes|draws|illustrates)\s+/u.test(chunk)){unparsed.push(raw);previous=null;continue;}
    // Sentence punctuation can terminate a range; an abbreviation at the end
    // of a postposed title remains part of its literal label.
    if(!/^issues?\s*#?\s*\d+(?:\s*[-–—]\s*\d+)?\s+of\s+/iu.test(chunk))chunk=chunk.replace(/[.!]+$/u,'');
    if(/\bstories?\s+(?:["“][^"”]{1,80}["”]\s+)?from\s+/iu.test(chunk))clauseExtent='excerpt';
    // A bounded grammatical run qualifier precedes a title, not an issue.
    chunk=chunk.replace(/^[^#;,]{1,80}['’]s\s+run\s+on\s+/iu,'');
    if(/^[^#;,]{1,80}\s+(?:backup\s+)?stories\s+from\s+/iu.test(chunk)){
      chunk=chunk.replace(/^[^#;,]{1,80}\s+(?:backup\s+)?stories\s+from\s+/iu,'stories from ');
    }
    const qualified=extentPrefix.test(chunk);chunk=chunk.replace(extentPrefix,'').replace(/^the (?:entire|complete) miniseries\s+/iu,'');
    // A demonstrated collection wrapper, not a general prose-prefix stripper.
    chunk=chunk.replace(/^adventures from\s+/iu,'');
    chunk=chunk.replace(/^in single magazine form as\s+/iu,'');
    // Interpret only bounded collection/attribution grammar, not arbitrary
    // words preceding '#'. Keep the literal wrappers as unresolved evidence.
    const wrapped=numberedCollectionPayload(chunk,collectionTitle,collectionClaim||/\bare collected here in\b/iu.test(body));
    if(wrapped){chunk=wrapped.payload;unparsed.push(wrapped.prefix);if(wrapped.excerpt)clauseExtent='excerpt';}
    if(/\bare collected here in\b/iu.test(chunk)){unparsed.push(raw);previous=null;continue;}
    if(qualified)clauseExtent='excerpt';
    // A semicolon after partial material may continue that heading or start
    // a new full list. Without an explicit qualifier, do not choose for users.
    if(clauseExtent==='uncertain'){unparsed.push(raw);previous=null;continue;}
    // Explicit novel-title attribution is a contained excerpt, not a creator
    // catalogue. Retain only a finite, delimited title after the work type.
    const novel=/^(?:an?\s+)?excerpts? from [^#;,]{1,100}\bnovel,\s*([^#;,]{1,80})$/iu.exec(raw.replace(/[.!]+$/u,''));
    const named=novel?.[1] ?? (/^["“]([^"”]{1,80})["”]$/u.exec(chunk)?.[1]);
    if(named && collectionTitle){entries.push(...validateContents([{series:collectionTitle,unitType:'component',number:named,run:'',language:'',completeness:novel?'excerpt':clauseExtent}]));previous=null;continue;}
    let label='',numbers='',type='issue',after='',annualYear='';
    const post=/^issues?\s*#?\s*(\d+(?:\s*[-–—]\s*\d+)?)\s+of\s+(.+)$/iu.exec(chunk);
    const runIssue=/^(.+?)\s+\(?vol(?:ume)?\.?\s*(\d+)\)?\s+(?:issues?\s*)?#\s*(\d+(?:\/\d+|\.\d+)?(?:\s*[-–—]\s*#?\d+)?)\s*(.*)$/iu.exec(chunk);
    const numbered=/^(.*?)\s*(#|\bissues?\b\s*#?|\bvol(?:ume)?s?\b\.?\s*#?|\bbooks?\b\s*#?)\s*(\d+(?:\/\d+|\.\d+)?(?:\s*[-–—]\s*#?\d+)?)\s*(.*)$/iu.exec(chunk);
    const bare=/^(.*?)\s+(\d+(?:\/\d+|\.\d+)?(?:\s*[-–—]\s*\d+)?)$/u.exec(chunk);
    const continuation=/^#?\s*(\d+(?:\/\d+|\.\d+)?(?:\s*[-–—]\s*#?\d+)?)(\s*[.;—–]\s*.+)?$/u.exec(chunk);
    if(runIssue){label=runIssue[1];numbers=runIssue[3];after=runIssue[4];}
    else if(post){
      label=post[2];numbers=post[1];
      const boundary=/,\s*(?=part of\b|(?:written|drawn|illustrated) by\b)/iu.exec(label);
      if(boundary){after=label.slice(boundary.index);label=label.slice(0,boundary.index);}
    }
    else if(numbered){label=numbered[1].replace(/^issues?\s+/iu,'');numbers=numbered[3];after=numbered[4];type=/^(?:vol|book)/iu.test(numbered[2])?'volume':'issue';}
    else if(continuation && previous){numbers=continuation[1];type=previous.unitType;after=continuation[2]??'';annualYear=previous.annualYear??'';}
    else if(bare && !/\b(?:first|all|five|six|years?|chapter|parts?|script|story|stories|novels?|books?)\b/iu.test(bare[1]) && !/^(?:19|20)\d{2}$/u.test(bare[2])){label=bare[1];numbers=bare[2];}
    else {unparsed.push(raw);previous=null;continue;}
    label=label.replace(/,\s*$/u,'');
    const labelDescriptor=reviewSeriesDescriptor(label);let explicitRun=runIssue?'volume '+runIssue[2]:labelDescriptor.run;label=labelDescriptor.series;
    label=label.replace(/\.["”]$/u,'');
    // Literal source series metadata or the exact subject title can establish
    // that a suffix belongs to the name. Super Special is a compound title,
    // not a generic Special qualifier. Keep ordinary typed annuals/specials.
    const literalName=[collectionTitle,...(Array.isArray(context.series)?context.series:context.series?[context.series]:[])].some(value=>identityKey(reviewSeriesDescriptor(compact(value)).series)===identityKey(label));
    if(/\bannuals?$/iu.test(label)&&!literalName){
      type='annual';label=label.replace(/\s*annuals?$/iu,'').trim();if(/^the$/iu.test(label)&&previous)label='';
      // A bare Annual (year) is contextual. Its date is the annual's
      // publication year, not a replacement for the preceding series run.
      if(!label&&previous&&['issue','annual'].includes(previous.unitType)){explicitRun=previous.run;annualYear=previous.annualYear??'';}
      else if(label&&/^\d{4}$/u.test(explicitRun)){annualYear=explicitRun;explicitRun='';}
      else if(!explicitRun&&previous&&identityKey(label)===identityKey(previous.series))explicitRun=previous.run;
    }
    if(/\bspecials?$/iu.test(label)&&!literalName&&!/\bsuper\s+special$/iu.test(label)){type='special';label=label.replace(/\s*specials?$/iu,'').trim();}
    const commaParts=label.split(/,\s*/u);
    const ambiguousComma=commaParts.length===2 && commaParts[0].split(/\s+/u).length>1
      && !/^(?:the|a|an)\b|&/iu.test(commaParts[1]) && !/['’]s\b/u.test(commaParts[0])
      && !(' '+identityKey(collectionTitle)+' ').includes(' '+identityKey(label)+' ');
    const ambiguousConjunction=!label.includes(':') && /['’]s\b/iu.test(label)&&/\band\b/iu.test(label);
    // A marker/qualifier inside a label exposes greedy last-marker parsing.
    const creditTail=/^from\s+(?!(?:pages?|material|excerpts?|selections?|stories?|issues?|chapters?)\b)[^#;]{1,250}\b(?:creators?|writers?|artists?)\b/iu.test(after+following.slice(raw.length));
    const seriesTail=/^of (?:the|a) [^#;]{0,100}\bseries\b/iu.test(after);
    const boundedTail=/^\s*(?:[,;]|\.(?=\s+|["“])|[—–](?!\s*#?\d)|and\b|plus\b|(?:written|drawn|illustrated|pencilled|penciled|art) by\b|with (?:bonus|additional|supplemental|extra) (?:material|content)\b|of\s+[^#;]{1,180}\brun\b)/iu.test(after)||creditTail||seriesTail;
    const attachedTail=after&&/^\p{L}/u.test(after)&&/\d$/u.test(chunk.slice(0,chunk.length-after.length));
    if(ambiguousComma || ambiguousConjunction || attachedTail || (label.match(/,/gu)?.length??0)>1 || /["“”]|\(\d{4}\)/u.test(label) || /\d#/u.test(chunk) || /^(?:all|the|a|an|this|these|his|her|their)\s/u.test(label) || /^(?:all|the|this|these|his|her|their)$/iu.test(label) || /#|\b(?:issues?|volumes?|vols?|chapters?|scripts?|bonus|extras?|complete script|written|artistry|creators?|featuring|starring|plus|material|excerpts?|selections?|stories from|recommendations? for|run on|reprinting|storyline|description|characters|meet|more than|and more|present|was|were|published|you)\b|(?<![\p{L}\d-])(?:he|she|they)(?![\p{L}\d-])|\bbooks?\s*#?\d/iu.test(label)
      || type==='annual' && /^\d{4}$/u.test(numbers) && !/#/u.test(chunk)
      || (!label && !previous) || (after && !boundedTail)){unparsed.push(raw);previous=null;continue;}
    if(after){unparsed.push(after.trim());}
    const descriptor=label?reviewSeriesDescriptor(label,explicitRun):{...previous,run:explicitRun||previous.run};
    const completeness=clauseExtent;
    const base={series:descriptor.series,run:descriptor.run,unitType:type,language:'',completeness,...(annualYear?{annualYear}:{})};
    const match=/^(\d+(?:\/\d+|\.\d+)?)(?:\s*[-–—]\s*#?(\d+))?$/u.exec(numbers);
    const end=match?reviewRangeEnd(match[1],match[2]):NaN;
    if(!match || Number.isNaN(end)) {unparsed.push(raw);previous=null;continue;}
    const values=end!==null?Array.from({length:end-Number(match[1])+1},(_,n)=>String(Number(match[1])+n)):[match[1]];
    try{const validated=validateContents(values.map(number=>({...base,number})));entries.push(...validated);if(annualYear){annualRunHints.push({series:base.series,year:annualYear,numbers:values});annualBindings.push(validated);}previous=base;}
    catch{unparsed.push(raw);previous=null;}
    if(entries.length>2000)return {entries:[],unparsed:[body]};
  }
  // A named annual's year dates that annual, not its parent run. Resolve only
  // from one compatible explicit regular-series run. Never subtract a year
  // or choose the nearest of competing runs. Hints remain transient evidence.
  const regular=[...entries.filter(entry=>entry.unitType==='issue'),...(context.annualParentRuns??[])];
  for(const [index,hint]of annualRunHints.entries()){
    const candidates=new Set(regular.filter(entry=>identityKey(entry.series)===identityKey(hint.series)&&annualParentRunEligible(entry.run,hint.year)).map(entry=>entry.run));
    if(candidates.size!==1)continue;
    const run=[...candidates][0];hint.resolvedRun=run;
    for(const entry of annualBindings[index])entry.run=run;
  }
  return {entries:entries.length?validateContents(entries):[],unparsed,annualRunHints};
}

export function annualParentRunEligible(run,year){
  const match=/^(\d{4})(?:-(\d{4})?)?$/u.exec(run??'');
  return Boolean(match&&Number(match[1])<=Number(year)&&(!match[2]||Number(match[2])>=Number(year)));
}

function numberedCollectionPayload(chunk,title,collectionClaim){
  const numbered=/^[\p{Lu}][^#;]{0,180}#\s*\d/u;
  const result=(hit,excerpt=false)=>hit&&numbered.test(hit[2])?{prefix:hit[1].trim(),payload:hit[2],excerpt}:null;
  if(collectionClaim){
    if(/\b(?:recommendations?|reviews?|synopsis|plot summary|descriptions? of|scripts? from|reading guide)\b/iu.test(chunk))return null;
    const entire=/^(the (?:entire|complete) series\s*,?\s+)(.+)$/iu.exec(chunk);
    if(entire)return result(entire);
    // Grammatical adventures/exploits wrappers identify the listed series.
    // The prefix stays unresolved; ordinary plot 'from/in' is not supported.
    const adventures=/^((?:(?:all of )?the|their|featuring the)\s+[^#;]{0,240}\b(?:adventures|exploits|super[ -]?team-ups)\b[^#;]{0,240}\s+(?:from|in)\s+)(.+)$/iu.exec(chunk);
    if(adventures)return result(adventures);
    const seriesRun=/^(the\s+[^#;]{1,150}\brun on the series\s*[—–]\s*)(.+)$/iu.exec(chunk);
    if(seriesRun)return result(seriesRun,true);
    const story=/^((?:(?:the|a|an)\s+)?(?:[^#;]{0,100}\b(?:story|stories|tale|tales|segment)\b[^#;]{0,160}?\s+|(?:the two-part\s+)?["“][^"”]{1,140}["”]\s*)from\s+)(.+)$/iu.exec(chunk);
    const storyProse=story?.[1].replace(/["“][^"”]*["”]/gu,'');
    if(story&&!/\b(?:says?|escapes?|fights?|travels?|meets?|was|were|is|are|will|would|can|could)\b/iu.test(storyProse))return result(story,true);
    // A lowercase grammatical article before a numbered annual/special is
    // different from stripping articles from arbitrary series titles.
    const typed=/^(the\s+)([\p{Lu}][^#;]{1,150}\b(?:annual|special)\s*#\s*\d.*)$/iu.exec(chunk);
    if(typed&&typed[1].startsWith('the '))return result(typed);
    // A possessive creator credit can be removed only when the product title
    // independently states exactly that series and those creators using 'by'.
    const credit=/^(.{1,120}['’]s\s+)([^#;]{1,150}#\s*\d.*)$/u.exec(chunk),by=/^(.{1,150}?)\s+by\s+(.+?)(?:\s+\(|$)/iu.exec(title);
    const literal=s=>s.replace(/\s+(?:and|&)\s+/giu,' and ').trim().toLowerCase();
    if(credit&&by&&literal(credit[1].replace(/['’]s\s+$/u,''))===literal(by[2])&&literal(credit[2].split('#')[0])===literal(by[1]))return result(credit);
  }
  // Explicit 'these tales' framing survives a narrative lead; it never turns
  // arbitrary plot summaries into numbered products or confirms full issues.
  const tales=/^((?:Find out|[^#;]{0,160}\brun\b[^#;]{0,80}\bcontinues)\s+in these tales from\s+)(.+)$/iu.exec(chunk);
  return result(tales,true);
}

function reviewSeriesDescriptor(label,run='') {
  const match=/\s*\((\d{4}(?:[-–—]\d{0,4})?)\)\s*$/u.exec(label);
  return match?{series:label.slice(0,match.index).trim(),run:run||match[1].replace(/[–—]/gu,'-')}:seriesDescriptor(label,run);
}

/** Only explicit product-series context can supply an otherwise missing label. */
function reviewSeriesAnchor(title,context) {
  const metadata=Array.isArray(context.series)?[...new Set(context.series.map(s=>compact(s,500)).filter(Boolean))]:[];
  const hit=context.allowTitleBinding && /^(.{2,200}?)\s*[:,-]?\s+\b(?:vol(?:ume)?\.?|book)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/iu.exec(compact(title));
  const titleSeries=hit?.[1]?.replace(/[:,-]+$/u,'').trim();
  if(metadata.length>1 || metadata.length===1 && titleSeries && identityKey(reviewSeriesDescriptor(metadata[0]).series)!==identityKey(reviewSeriesDescriptor(titleSeries).series))return null;
  if(metadata.length===1 && titleSeries){
    const a=reviewSeriesDescriptor(metadata[0]).run,b=reviewSeriesDescriptor(titleSeries).run;
    if(a&&b&&a!==b)return null;
  }
  const series=metadata[0]||titleSeries;
  if(!series || /^(?:a|an|the)\s+(?:collection|omnibus|anthology)|\b(?:box set|complete collection|epic collection|deluxe|edition|anniversary|ultimate collection|by)\b/iu.test(series))return null;
  if(/^(?:(?:a|an|the)\s+)?(?:collection|omnibus|anthology|collected (?:works|stories|novels|essays))$/iu.test(series))return null;
  return {series,basis:metadata.length?'explicit-product-series-metadata':'explicit-product-series-volume-title'};
}

function containedNames(body) {
  if(/#|\b(?:chapters?|essays?|foreword|afterword|appendix|bibliography|bonus|extras?|issues?|volumes?|vols?\.?|books?|by|creators?|artists?|writers?|present|reviews?|ratings?|all \d+)\b/iu.test(body))return null;
  let text=body.replace(/[.!?]+$/u,'').replace(extentPrefix,'');
  // Quoted contents preserve internal commas/conjunctions. Mixed commentary
  // cannot be ignored merely because some quoted names were found.
  const quoted=[...text.matchAll(/["“]([^"”]+)["”]/gu)];
  let names;
  if(quoted.length){
    const remaining=text.replace(/["“][^"”]+["”]/gu,'').replace(/[,;\s]+|\band\b/gu,'');
    if(remaining)return null;names=quoted.map(match=>match[1]);
  }else{
    // INC. is title punctuation, not a new component. An ampersand is a
    // separator only when the next title repeats the explicit title stem.
    text=text.replace(/,\s+(?=INC\.?(?:\s|$))/giu,'\u0001 ');
    const stem=/^([\p{Lu}][\p{L}\d-]*):/u.exec(text)?.[1];
    if(stem)text=text.replace(new RegExp('\\s+&\\s+(?='+stem+'\\b)','gu'),'; ');
    names=text.split(/\s*;\s*|\s*,\s*(?:and\s+)?|\s+and\s+/u).map(name=>name.replace(/\u0001/gu,',').trim());
  }
  if(names.length<2 || names.length>100 || names.some(name=>name.length>80 || !/^[\p{Lu}\d]/u.test(name) || name.split(/\s+/u).length>12 || /[.!?](?=\s+[\p{Lu}])/u.test(name)))return null;
  return names;
}

export function contentsStatement(item) {
  const captured=item?.metadata?.enrichment?.kindleProductComicContents?.statement;
  // Keep source characters intact during UI handoff (e.g. an ellipsis must
  // not become three periods). Parsing applies its own normalization later.
  if(captured)return String(captured).replace(/\s+/gu,' ').trim().slice(0,10000);
  return compact(item?.metadata?.contentsStatement || item?.metadata?.collects || item?.metadata?.enrichment?.localMetadata?.statement, 10000);
}

export function validateContentReview(value) {
  object(value,'Contents review');
  const sourceUrl=url(value.sourceUrl);
  if(value.sourceUrl && !sourceUrl)throw new Error('Contents source must be an HTTP(S) page without credentials.');
  const rejected=value.status==='rejected';
  if(value.status!==undefined&&!rejected)throw Error('Invalid contents review status.');
  if(rejected&&(!Array.isArray(value.entries)||value.entries.length))throw Error('Rejected contents must have an empty entry list.');
  return {entries:rejected?[]:validateContents(value.entries),...(rejected?{status:'rejected'}:{}),statement:text(value.statement,10000,'Contents statement'),sourceUrl,source:text(value.source || 'manual-review',100,'Contents source'),verifiedAt:date(value.verifiedAt,'Contents review date')};
}

export function ownedContentIndex(database, {excludeProviders = [], excludeItemIds = []} = {}) {
  const byKey=new Map();
  for (const [itemId,review] of Object.entries(database.contentReviews ?? {})) {
    const item=effectiveOwnershipRecord(database.providerItems[itemId],database);
    if (!item || !['owned','claimed'].includes(item.ownership) || excludeProviders.includes(item.provider) || excludeItemIds.includes(itemId)) continue;
    for (const entry of review.entries) {
      if (entry.completeness!=='full') continue;
      const key=entry.unitType==='component'?componentContentKey(entry,itemId,item.mediaType):contentKey(entry);const matches=byKey.get(key)??[];
      matches.push({item,entry,review,...(entry.unitType==='component'?{parentItemId:itemId}:{})});byKey.set(key,matches);
    }
  }
  return byKey;
}

export function contentCoverage(database, requested, options = {}) {
  return evaluateContentCoverage(database,requested,options,null);
}

/** Trusted local parent comparison. This context is never read from entries or
 * external requests; the review owner must be an actual current stored record. */
export function parentContentCoverage(database,parentItemId,requested,options = {}) {
  const parent=typeof parentItemId==='string'&&Object.hasOwn(database.providerItems,parentItemId)?database.providerItems[parentItemId]:null;
  return evaluateContentCoverage(database,requested,{...options,mediaType:options.mediaType??parent?.mediaType},
    {parentItemId,mediaType:parent?.mediaType,valid:Boolean(parent)});
}

function evaluateContentCoverage(database, requested, options, parentScope) {
  const entries=validateContents(requested).filter((entry)=>entry.completeness==='full');
  const index=options.contentIndex??ownedContentIndex(database, options);
  const byUnit=new Map(),byComponent=new Map(),needsComponents=entries.some(entry=>entry.unitType==='component');
  const add=(map,key,evidence)=>{const matches=map.get(key)??[];matches.push(...evidence);map.set(key,matches);};
  for(const evidence of index.values()){
    const first=evidence[0],entry=first.entry;
    if(entry.unitType==='component'){
      if(!needsComponents)continue;
      // Explicit parent comparisons never borrow another parent's candidates.
      if(parentScope){
        if(parentScope.valid&&parentScope.mediaType===options.mediaType&&first.parentItemId===parentScope.parentItemId)add(byComponent,JSON.stringify([options.mediaType,entry.number]),evidence);
      }else add(byComponent,JSON.stringify([first.item.mediaType,identityKey(entry.series),entry.number]),evidence);
    }else{
      const [series,,type,number]=JSON.parse(contentKey(entry));add(byUnit,JSON.stringify([series,type,number]),evidence);
    }
  }
  const covered=[]; const missing=[]; const possibleCovered=[];
  const unspecifiedRunAllowed=entry=>options.allowUnspecifiedRun&&['issue','annual','special'].includes(entry.unitType);
  for (const entry of entries) {
    const component=entry.unitType==='component';
    const scoped=component&&parentScope?.valid&&parentScope.mediaType===options.mediaType;
    const key=component?(scoped?componentContentKey(entry,parentScope.parentItemId,parentScope.mediaType):null):contentKey(entry);
    const evidence=key&&(!options.requireIdentityScope||entry.language&&(entry.run||unspecifiedRunAllowed(entry)))?index.get(key)??[]:[];
    (evidence.length?covered:missing).push({...entry, ...(evidence.length?{evidence}: {})});
    if (!evidence.length) {
      const [series,run,type,number,language]=JSON.parse(contentKey(entry));
      const candidates=component?byComponent.get(JSON.stringify(parentScope?[options.mediaType,number]:[options.mediaType,series,number])):byUnit.get(JSON.stringify([series,type,number]));
      const possible=(candidates??[]).filter(({entry:owned}) => {
        const other=JSON.parse(contentKey(owned));
        return (component&&parentScope||series===other[0]) && type===other[2] && number===other[3] && (!run||!other[1]||run===other[1]) && (!language||!other[4]||language===other[4]);
      });
      if(possible.length)possibleCovered.push({...entry,evidence:possible});
    }
  }
  const coveredKeys=new Set(covered.map(contentKey));
  const scopeUncertain=entries.some((entry)=>(!entry.run&&!(unspecifiedRunAllowed(entry)&&coveredKeys.has(contentKey(entry)))) || !entry.language || entry.unitType==='component'&&(!parentScope?.valid||parentScope.mediaType!==options.mediaType));
  return {total:entries.length,owned:covered.length,complete:entries.length>0&&!missing.length&&!scopeUncertain,scopeUncertain:scopeUncertain||possibleCovered.length>0,covered,possibleCovered,missing};
}

export function seriesCoverage(database,options={}) {
  const index=options.contentIndex??ownedContentIndex(database);const groups=new Map();
  for (const evidence of index.values()) {
    const entry=evidence[0].entry,parent=evidence[0].item,component=entry.unitType==='component',parentItemId=evidence[0].parentItemId;
    const provisional=options.resolvedScope&&Object.hasOwn(evidence[0],'provisional')?Boolean(evidence[0].provisional):Boolean(options.requireIdentityScope&&(!entry.run||!entry.language));
    const key=JSON.stringify([identityKey(entry.series),identityKey(entry.run),entry.unitType,identityKey(entry.language),...(component?[parentItemId,parent.mediaType]:provisional?[parent.id]:[])]);
    const group=groups.get(key)??{series:entry.series,run:entry.run,language:entry.language,unitType:entry.unitType,entries:[],...(component?{parentItemId,parentTitle:parent.title,mediaType:parent.mediaType}:{})};
    const supporting=provisional?evidence.filter(value=>value.item.id===parent.id):evidence;
    const complete=supporting.filter(value=>value.entry.completeness==='full'),primary=complete.length?complete:supporting;
    group.entries.push({number:entry.number,confidence:primary.some(value=>value.review)?'verified':primary.some(value=>value.confidence==='direct')?'direct':'inferred',provisional,...(options.includeExcerpts?{partial:!complete.length}:{}),sources:supporting.map(({item,confidence,entry,statement})=>({id:item.id,title:item.title,provider:item.provider,confidence,...(options.includeExcerpts?{completeness:entry.completeness,statement}: {})}))});groups.set(key,group);
  }
  return [...groups.values()].map((group)=>{
    const numeric=group.unitType==='component'?[]:group.entries.map((entry)=>/^\d+$/u.test(entry.number)?Number(entry.number):null).filter((number)=>number!==null).sort((a,b)=>a-b);
    const gaps=[];
    if (numeric.length && numeric.at(-1)-numeric[0]<=2000) for(let n=numeric[0];n<=numeric.at(-1);n++) if(!numeric.includes(n)) gaps.push(String(n));
    return {...group,gaps,overlap:group.entries.filter((entry)=>new Set(entry.sources.map((source)=>source.id)).size>1)};
  }).sort((a,b)=>a.series.localeCompare(b.series));
}
