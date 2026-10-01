import { compact, identityKey } from './identity.js';
import { object, text, date, url } from './validation.js';

const UNIT_TYPES = new Set(['issue', 'volume', 'annual', 'special', 'component']);
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
  const number=fraction?String(Number(fraction[1])/Number(fraction[2])):/^\d+(?:\.\d+)?$/u.test(entry.number)?String(Number(entry.number)):entry.number;
  return JSON.stringify([identityKey(entry.series),identityKey(entry.run),entry.unitType,number,identityKey(entry.language)]);
}

/** Parse explicit number statements into a proposal. Only review makes it evidence. */
export function proposeContents(statement) {
  const text = compact(statement, 10000).replace(/^collects?\s*:?\s*/iu, '');
  const entries=[]; const unparsed=[];
  // A partial reprint statement never silently becomes a full issue.
  const completeness = /\b(?:material from|excerpts? from|selections? from|partial)\b/iu.test(text) ? 'excerpt' : 'full';
  const chunks = text.split(/\s*;\s*|\s*,\s*(?=[\p{L}]|#)|\s+and\s+(?=[\p{L}]|#)/u);
  let lastSeries=''; let lastRun='';
  for (const chunk of chunks) {
    const match=/^(.*?)\s*(?:(vol(?:ume)?s?\.?|books?)\s*|(#)\s*)(\d+\/\d+|\d+(?:\.\d+)?)(?:\s*[-\u2013\u2014]\s*#?(\d+(?:\.\d+)?))?\s*[.!]?$/iu.exec(chunk.replace(/\b(?:material from|excerpts? from|selections? from)\s*/giu,''));
    if (!match) { if (chunk) unparsed.push(chunk); continue; }
    let label=match[1].replace(/^(?:and|,)\s*/iu,'').trim();
    let unitType=match[3]?'issue':'volume';
    if (/\bannuals?$/iu.test(label)) {unitType='annual';label=label.replace(/\s*annuals?$/iu,'').trim();}
    if (/\bspecials?$/iu.test(label)) {unitType='special';label=label.replace(/\s*specials?$/iu,'').trim();}
    const descriptor=seriesDescriptor(label||lastSeries,label? '':lastRun);
    if (!descriptor.series) {unparsed.push(chunk);continue;}
    lastSeries=descriptor.series;lastRun=descriptor.run;
    const first=match[4];const last=match[5];
    if (last && (!/^\d+$/u.test(first)||!/^\d+$/u.test(last)||Number(last)<Number(first)||Number(last)-Number(first)>499)) {unparsed.push(chunk);continue;}
    for (const number of last?Array.from({length:Number(last)-Number(first)+1},(_,index)=>String(Number(first)+index)):[first]) entries.push({...descriptor,unitType,number,language:'',completeness});
  }
  return {entries:entries.length?validateContents(entries):[],unparsed};
}

export function contentsStatement(item) {
  return compact(item?.metadata?.enrichment?.kindleProductComicContents?.statement || item?.metadata?.contentsStatement || item?.metadata?.collects, 10000);
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
    const item=database.providerItems[itemId];
    if (!item || !['owned','claimed'].includes(item.ownership) || excludeProviders.includes(item.provider) || excludeItemIds.includes(itemId)) continue;
    for (const entry of review.entries) {
      if (entry.completeness!=='full') continue;
      const key=contentKey(entry);const matches=byKey.get(key)??[];
      matches.push({item,entry,review});byKey.set(key,matches);
    }
  }
  return byKey;
}

export function contentCoverage(database, requested, options = {}) {
  const entries=validateContents(requested).filter((entry)=>entry.completeness==='full');
  const index=ownedContentIndex(database, options);
  const byUnit=new Map();
  for(const evidence of index.values()){
    const [series,,type,number]=JSON.parse(contentKey(evidence[0].entry));const key=JSON.stringify([series,type,number]);
    const matches=byUnit.get(key)??[];matches.push(...evidence);byUnit.set(key,matches);
  }
  const covered=[]; const missing=[]; const possibleCovered=[];
  for (const entry of entries) {
    const evidence=index.get(contentKey(entry))??[];
    (evidence.length?covered:missing).push({...entry, ...(evidence.length?{evidence}: {})});
    if (!evidence.length) {
      const [series,run,type,number,language]=JSON.parse(contentKey(entry));
      const possible=(byUnit.get(JSON.stringify([series,type,number]))??[]).filter(({entry:owned}) => {
        const other=JSON.parse(contentKey(owned));
        return series===other[0] && type===other[2] && number===other[3] && (!run||!other[1]||run===other[1]) && (!language||!other[4]||language===other[4]);
      });
      if(possible.length)possibleCovered.push({...entry,evidence:possible});
    }
  }
  const scopeUncertain=entries.some((entry)=>!entry.run || !entry.language);
  return {total:entries.length,owned:covered.length,complete:entries.length>0&&!missing.length&&!scopeUncertain,scopeUncertain:scopeUncertain||possibleCovered.length>0,covered,possibleCovered,missing};
}

export function seriesCoverage(database) {
  const index=ownedContentIndex(database);const groups=new Map();
  for (const evidence of index.values()) {
    const entry=evidence[0].entry; const key=JSON.stringify([identityKey(entry.series),identityKey(entry.run),entry.unitType,identityKey(entry.language)]);
    const group=groups.get(key)??{series:entry.series,run:entry.run,language:entry.language,unitType:entry.unitType,entries:[]};
    group.entries.push({number:entry.number,sources:evidence.map(({item})=>({id:item.id,title:item.title,provider:item.provider}))});groups.set(key,group);
  }
  return [...groups.values()].map((group)=>{
    const numeric=group.entries.map((entry)=>/^\d+$/u.test(entry.number)?Number(entry.number):null).filter((number)=>number!==null).sort((a,b)=>a-b);
    const gaps=[];
    if (numeric.length && numeric.at(-1)-numeric[0]<=2000) for(let n=numeric[0];n<=numeric.at(-1);n++) if(!numeric.includes(n)) gaps.push(String(n));
    return {...group,gaps,overlap:group.entries.filter((entry)=>new Set(entry.sources.map((source)=>source.id)).size>1)};
  }).sort((a,b)=>a.series.localeCompare(b.series));
}
