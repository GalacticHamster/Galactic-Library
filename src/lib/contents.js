import { compact, identityKey } from './identity.js';
import { object, text, date, url } from './validation.js';
import {effectiveOwnershipRecord} from './ownership.js';
import {assessContentsQuality} from './contents-quality.js';

const UNIT_TYPES = new Set(['issue', 'volume', 'annual', 'special', 'component']);
export const CONTENTS_PARSER_VERSION = 4;
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
    if (/\bspecials?$/iu.test(label)) {unitType='special';label=label.replace(/\s*specials?$/iu,'').trim();}
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
  const proposal=discoveryNumberedContents(input,collectionTitle);
  if(proposal.entries.length || /#|\b(?:issues?|volumes?|vols?\.?|books?|chapters?)\s*#?\d|\d+\s*[-–—]\s*\d+/iu.test(body))return finish(proposal.entries,proposal.unparsed);
  // This fallback is discovery/editor-only; ordinary matching still uses
  // proposeContents above. Unsupported numeric syntax never becomes a name.
  const names=containedNames(body);
  if(!collectionTitle || !names)return finish([],proposal.unparsed);
  try{return finish(validateContents(names.map(number=>({series:collectionTitle,run:'',unitType:'component',number,language:'',completeness:extentPrefix.test(body)?'excerpt':'full'}))),[]);}
  catch{return finish([],proposal.unparsed);}
}

const extentPrefix=/^(?:(?:backup|short|selected)\s+)?(?:material|pages|excerpts?|selections?|stories?|a (?:short |backup )?story)\s+(?:from|selected from)\s+|^selected\s+from\s+/iu;
const numericMarker=/#\s*\d|\b(?:issues?|vol(?:ume)?s?\.?|books?|chapters?)\s*#?\d|\b\d+(?:\/\d+|\.\d+)?\s*[-–—]\s*\d+/iu;

/** Bounded discovery grammar. Arbitrary prose must not become a series label. */
function discoveryNumberedContents(body,collectionTitle) {
  const entries=[],unparsed=[],chunks=[];
  for(const part of body.split(/\s*;\s*/u)){
    let start=0;
    for(const separator of part.matchAll(/\s*,\s*(?:and\s+)?(?=[\p{L}\d#])|\s+(?:and|plus|&)\s+(?=[\p{L}\d#])/giu)){
      const prefix=part.slice(start,separator.index),next=part.slice(separator.index+separator[0].length);
      const prefixStem=/^\s*([\p{L}\d-]+)/u.exec(prefix)?.[1],nextStem=/^([\p{L}\d-]+)/u.exec(next)?.[1];
      const repeatedTitle=prefix.includes(':') && prefixStem && prefixStem.toLowerCase()===nextStem?.toLowerCase()
        || separator[0].includes(',') && prefixStem && prefixStem.toLowerCase()===nextStem?.toLowerCase();
      // Commas/conjunctions before a numeric anchor belong to the title. A
      // new extent qualifier must still start its own clause after named prose.
      const typedWork=/\b(?:one-shot|specials?|annuals?)\s*$/iu.test(prefix);
      if(!numericMarker.test(prefix) && !/\d+(?:\/\d+|\.\d+)?\s*$/u.test(prefix) && !extentPrefix.test(next) && !repeatedTitle && !typedWork)continue;
      chunks.push({raw:part.slice(start,separator.index).trim(),reset:start===0});start=separator.index+separator[0].length;
    }
    chunks.push({raw:part.slice(start).trim(),reset:start===0});
  }
  let previous=null;
  const headingExtent=extentPrefix.test(body)?'excerpt':'full';
  let clauseExtent=headingExtent;
  for(const {raw,reset} of chunks){
    if(!raw)continue;
    if(reset)clauseExtent=clauseExtent!=='full' && headingExtent==='full'?'uncertain':headingExtent;
    if(/^collects?\s+/iu.test(raw))clauseExtent='full';
    let chunk=raw.replace(/^(?:and|plus|as well as|along with|collects?|collecting)\s+/iu,'').replace(/[.!]+$/u,'');
    if(/\bstories?\s+(?:["“][^"”]{1,80}["”]\s+)?from\s+/iu.test(chunk))clauseExtent='excerpt';
    // A bounded grammatical run qualifier precedes a title, not an issue.
    chunk=chunk.replace(/^[^#;,]{1,80}['’]s\s+run\s+on\s+/iu,'');
    if(/^[^#;,]{1,80}\s+(?:backup\s+)?stories\s+from\s+/iu.test(chunk)){
      chunk=chunk.replace(/^[^#;,]{1,80}\s+(?:backup\s+)?stories\s+from\s+/iu,'stories from ');
    }
    const qualified=extentPrefix.test(chunk);chunk=chunk.replace(extentPrefix,'').replace(/^the (?:entire|complete) miniseries\s+/iu,'');
    if(qualified)clauseExtent='excerpt';
    // A semicolon after partial material may continue that heading or start
    // a new full list. Without an explicit qualifier, do not choose for users.
    if(clauseExtent==='uncertain'){unparsed.push(raw);previous=null;continue;}
    // Explicit novel-title attribution is a contained excerpt, not a creator
    // catalogue. Retain only a finite, delimited title after the work type.
    const novel=/^(?:an?\s+)?excerpts? from [^#;,]{1,100}\bnovel,\s*([^#;,]{1,80})$/iu.exec(raw.replace(/[.!]+$/u,''));
    const named=novel?.[1] ?? (/^["“]([^"”]{1,80})["”]$/u.exec(chunk)?.[1]);
    if(named && collectionTitle){entries.push(...validateContents([{series:collectionTitle,unitType:'component',number:named,run:'',language:'',completeness:novel?'excerpt':clauseExtent}]));previous=null;continue;}
    let label='',numbers='',type='issue',after='';
    const post=/^issues?\s*#?\s*(\d+(?:\s*[-–—]\s*\d+)?)\s+of\s+(.+)$/iu.exec(chunk);
    const runIssue=/^(.+?)\s+\(?vol(?:ume)?\.?\s*(\d+)\)?\s+(?:issues?\s*)?#\s*(\d+(?:\/\d+|\.\d+)?(?:\s*[-–—]\s*#?\d+)?)\s*(.*)$/iu.exec(chunk);
    const numbered=/^(.*?)\s*(#|issues?\s*#?|vol(?:ume)?s?\.?\s*#?|books?\s*#?|chapters?\s*#?)\s*(\d+(?:\/\d+|\.\d+)?(?:\s*[-–—]\s*#?\d+)?)\s*(.*)$/iu.exec(chunk);
    const bare=/^(.*?)\s+(\d+(?:\/\d+|\.\d+)?(?:\s*[-–—]\s*\d+)?)$/u.exec(chunk);
    const continuation=/^#?\s*(\d+(?:\/\d+|\.\d+)?(?:\s*[-–—]\s*#?\d+)?)$/u.exec(chunk);
    if(runIssue){label=runIssue[1];numbers=runIssue[3];after=runIssue[4];}
    else if(post){label=post[2];numbers=post[1];}
    else if(numbered){label=numbered[1].replace(/^issues?\s+/iu,'');numbers=numbered[3];after=numbered[4];type=/^(?:vol|book)/iu.test(numbered[2])?'volume':'issue';}
    else if(continuation && previous){numbers=continuation[1];type=previous.unitType;}
    else if(bare && !/\b(?:first|all|five|six|years?|chapter|parts?|script|story|stories|novels?|books?)\b/iu.test(bare[1]) && !/^(?:19|20)\d{2}$/u.test(bare[2])){label=bare[1];numbers=bare[2];}
    else {unparsed.push(raw);previous=null;continue;}
    label=label.replace(/,\s*$/u,'');
    const labelDescriptor=reviewSeriesDescriptor(label);let explicitRun=runIssue?'volume '+runIssue[2]:labelDescriptor.run;label=labelDescriptor.series;
    label=label.replace(/\.["”]$/u,'');
    if(/\bannuals?$/iu.test(label)){type='annual';label=label.replace(/\s*annuals?$/iu,'').trim();if(/^the$/iu.test(label)&&previous)label='';}
    if(/\bspecials?$/iu.test(label)){type='special';label=label.replace(/\s*specials?$/iu,'').trim();}
    const commaParts=label.split(/,\s*/u);
    const ambiguousComma=commaParts.length===2 && commaParts[0].split(/\s+/u).length>1
      && !/^(?:the|a|an)\b|&/iu.test(commaParts[1]) && !/['’]s\b/u.test(commaParts[0])
      && !(' '+identityKey(collectionTitle)+' ').includes(' '+identityKey(label)+' ');
    const ambiguousConjunction=!label.includes(':') && /['’]s\b/iu.test(label)&&/\band\b/iu.test(label);
    // A marker/qualifier inside a label exposes greedy last-marker parsing.
    if(ambiguousComma || ambiguousConjunction || (label.match(/,/gu)?.length??0)>1 || /["“”]|\(\d{4}\)/u.test(label) || /\d#/u.test(chunk) || /^(?:all|the|a|an|this|these|his|her|their)\s/u.test(label) || /^(?:all|the|this|these|his|her|their)$/iu.test(label) || /#|\b(?:issues?|volumes?|vols?|books?|chapters?|script|bonus|extras?|complete script|written|artistry|creators?|featuring|starring|plus|material|excerpts?|selections?|stories from|run on|reprinting|storyline|description|characters|meet|more|present|was|were|published|you|he|she|they)\b/iu.test(label)
      || type==='annual' && /^\d{4}$/u.test(numbers) && !/#/u.test(chunk)
      || (!label && !previous) || (after && !/^\s*(?:[,;]|and\b|plus\b)/iu.test(after))){unparsed.push(raw);previous=null;continue;}
    if(after){unparsed.push(after.trim());}
    const descriptor=label?reviewSeriesDescriptor(label,explicitRun):{...previous,run:explicitRun||previous.run};
    const completeness=clauseExtent;
    const base={series:descriptor.series,run:descriptor.run,unitType:type,language:'',completeness};
    const match=/^(\d+(?:\/\d+|\.\d+)?)(?:\s*[-–—]\s*#?(\d+))?$/u.exec(numbers);
    if(!match || match[2] && (!/^\d+$/u.test(match[1]) || Number(match[2])<Number(match[1]) || Number(match[2])-Number(match[1])>499)) {unparsed.push(raw);previous=null;continue;}
    const values=match[2]?Array.from({length:Number(match[2])-Number(match[1])+1},(_,n)=>String(Number(match[1])+n)):[match[1]];
    try{const validated=validateContents(values.map(number=>({...base,number})));entries.push(...validated);previous=base;}
    catch{unparsed.push(raw);previous=null;}
    if(entries.length>2000)return {entries:[],unparsed:[body]};
  }
  return {entries:entries.length?validateContents(entries):[],unparsed};
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
  return compact(item?.metadata?.enrichment?.kindleProductComicContents?.statement || item?.metadata?.contentsStatement || item?.metadata?.collects || item?.metadata?.enrichment?.localMetadata?.statement, 10000);
}

export function validateContentReview(value) {
  object(value,'Contents review');
  const sourceUrl=url(value.sourceUrl);
  if(value.sourceUrl && !sourceUrl)throw new Error('Contents source must be an HTTP(S) page without credentials.');
  return {entries:validateContents(value.entries),statement:text(value.statement,10000,'Contents statement'),sourceUrl,source:text(value.source || 'manual-review',100,'Contents source'),verifiedAt:date(value.verifiedAt,'Contents review date')};
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
  const index=ownedContentIndex(database, options);
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
  for (const entry of entries) {
    const component=entry.unitType==='component';
    const scoped=component&&parentScope?.valid&&parentScope.mediaType===options.mediaType;
    const key=component?(scoped?componentContentKey(entry,parentScope.parentItemId,parentScope.mediaType):null):contentKey(entry);
    const evidence=key?index.get(key)??[]:[];
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
  const scopeUncertain=entries.some((entry)=>!entry.run || !entry.language || entry.unitType==='component'&&(!parentScope?.valid||parentScope.mediaType!==options.mediaType));
  return {total:entries.length,owned:covered.length,complete:entries.length>0&&!missing.length&&!scopeUncertain,scopeUncertain:scopeUncertain||possibleCovered.length>0,covered,possibleCovered,missing};
}

export function seriesCoverage(database) {
  const index=ownedContentIndex(database);const groups=new Map();
  for (const evidence of index.values()) {
    const entry=evidence[0].entry,parent=evidence[0].item,component=entry.unitType==='component',parentItemId=evidence[0].parentItemId;
    const key=JSON.stringify([identityKey(entry.series),identityKey(entry.run),entry.unitType,identityKey(entry.language),...(component?[parentItemId,parent.mediaType]:[])]);
    const group=groups.get(key)??{series:entry.series,run:entry.run,language:entry.language,unitType:entry.unitType,entries:[],...(component?{parentItemId,parentTitle:parent.title,mediaType:parent.mediaType}:{})};
    group.entries.push({number:entry.number,sources:evidence.map(({item})=>({id:item.id,title:item.title,provider:item.provider}))});groups.set(key,group);
  }
  return [...groups.values()].map((group)=>{
    const numeric=group.unitType==='component'?[]:group.entries.map((entry)=>/^\d+$/u.test(entry.number)?Number(entry.number):null).filter((number)=>number!==null).sort((a,b)=>a-b);
    const gaps=[];
    if (numeric.length && numeric.at(-1)-numeric[0]<=2000) for(let n=numeric[0];n<=numeric.at(-1);n++) if(!numeric.includes(n)) gaps.push(String(n));
    return {...group,gaps,overlap:group.entries.filter((entry)=>new Set(entry.sources.map((source)=>source.id)).size>1)};
  }).sort((a,b)=>a.series.localeCompare(b.series));
}
