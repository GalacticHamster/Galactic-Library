import {PUBLICATION_REFERENCES,PUBLICATION_REFERENCE_VERSION} from './publication-reference-data.js';
import {contentKey} from './contents.js';

// Literal bibliographic aliases, not product matching or fuzzy title aliases.
// Punctuation and conjunction spelling may vary; subtitles/numbers never vanish.
const key=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[’‘]/gu,"'").replace(/\b(and)\b|[&/]/gu,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ');
const clean=value=>String(value??'').trim().replace(/\s+/gu,' ');
const listKey=e=>contentKey(e)+':'+e.completeness;
export function validatePublicationReferences(values){
 if(!Array.isArray(values)||values.length>200)throw Error('Invalid publication references.');
 const ids=new Set();
 for(const p of values){
  if(!p||!/^[-a-z0-9]{1,100}$/u.test(p.id)||ids.has(p.id)||typeof p.title!=='string'||!p.title.trim()||p.title.length>250||typeof p.complete!=='boolean'||!/^\d{4}(?:-\d{4})?$/u.test(p.run)||!['miniseries','installment','one-shot','ongoing'].includes(p.kind))throw Error('Invalid publication identity.');
  ids.add(p.id);
  if(!Array.isArray(p.numbers)||p.numbers.length>500||new Set(p.numbers).size!==p.numbers.length||p.numbers.some(n=>! /^(?:\d+(?:\/\d+|\.\d+)?|unnumbered)$/u.test(n)))throw Error('Invalid publication enumeration.');
  if(p.numbers.includes('unnumbered')&&(p.kind!=='one-shot'||p.numbers.length!==1))throw Error('Invalid unnumbered publication.');
  if(p.complete&&(!p.numbers.length||p.kind==='ongoing'))throw Error('Unproved complete publication.');
  if(!Array.isArray(p.publishers)||!p.publishers.length||!Array.isArray(p.contexts)||!Array.isArray(p.aliases)||[p.publishers,p.contexts,p.aliases].some(values=>values.length>20||values.some(v=>typeof v!=='string'||!v.trim()||v.length>250))||!Array.isArray(p.sources)||!p.sources.length||p.sources.length>10||p.sources.some(url=>!/^https:\/\/[^\s]+$/u.test(url)))throw Error('Missing publication evidence.');
 }
 return values;
}
const references=validatePublicationReferences(PUBLICATION_REFERENCES);
export function publicationContext(saved){
 const observed=(saved?.productDetailsEvidence?.observations??[]).filter(o=>o.status==='observed');
 return {publishers:observed.filter(o=>o.field==='publisher').map(o=>o.value??o.raw),contexts:observed.filter(o=>o.field==='series'&&/^Part of:\s*/iu.test(o.value??o.raw??'')).map(o=>(o.value??o.raw).replace(/^Part of:\s*/iu,''))};
}
function scoped(p,context){
 const publishers=new Set(context.publishers.map(key)),contexts=new Set(context.contexts.map(key));
 // Conflicting captured values are not permission to choose a convenient one.
 return publishers.size===1&&p.publishers.some(v=>publishers.has(key(v)))&&(!p.contexts.length||contexts.size===1&&p.contexts.some(v=>contexts.has(key(v))));
}
const aliases=p=>[p.title,...p.aliases].map(key);
const padding=value=>!key(value.replace(/\b(?:the|and|plus|as well as|special|one[- ]shots?|mini[- ]?series|crossovers?|complete|entire)\b/giu,''));
const unsafe=/\b(?:material|selected|excerpts?|portions?|pages|chapters?|stories|story|sketchbook|preview|inspired|following|appears?|featuring|not|except)\b/iu;
// Compressed lists share an explicit publication-family suffix, not a guessed
// character alias. Resolve the resulting literal names through the same table.
function familyList(fragment){
 const m=/^(.+?)\s+(Micro-Series|Macro-Series)\s+one-shots?[.!]?$/iu.exec(clean(fragment).replace(/^(?:and\s+)?the\s+/iu,''));
 if(!m)return [fragment];
 return m[1].split(/,\s*(?:and\s+)?|\s+and\s+(?=[^,]+$)/u).map(s=>s+' '+m[2]);
}
function find(fragment,catalog,context){
 const text=key(fragment),hits=[];
 for(const p of catalog.filter(p=>scoped(p,context))){
  for(const alias of aliases(p)){
   const start=(' '+text+' ').indexOf(' '+alias+' ');if(start<0)continue;
   hits.push({p,alias,start,end:start+alias.length});
  }
 }
 // Full sequel/subtitle wins. Identical literal names with conflicting runs
 // stay ambiguous; the source must supply more evidence instead of guessing.
 const maximal=hits.filter(h=>!hits.some(other=>other!==h&&other.start<=h.start&&other.end>=h.end&&other.alias.length>h.alias.length));
 const unique=[...new Map(maximal.map(h=>[h.p.id,h])).values()];
 const occupied=unique.some((h,i)=>unique.slice(i+1).some(other=>other.start<h.end&&other.end>h.start));
 if(occupied)return {hits:[],reason:'Conflicting publication identities'};
 let remainder=text;
 for(const h of [...unique].sort((a,b)=>b.start-a.start))remainder=remainder.slice(0,h.start)+' '.repeat(h.alias.length)+remainder.slice(h.end);
 // A fragment must be a list of whole publications, not plot/credit prose or
 // an unspecified subset. Unrecognized words stay unresolved in their entirety.
 return padding(remainder)?{hits:unique}: {hits:[],reason:'Not a complete publication reference'};
}
export function resolveNamedPublications(proposal,saved,statement,{catalog=references}={}){
 if(catalog!==references)validatePublicationReferences(catalog);
 if(!/^\s*(?:collects?|collecting|includes?|contains?|reprints?)\b/iu.test(statement??''))return proposal;
 const context=publicationContext(saved),entries=[...proposal.entries],unparsed=[],resolutions=[];
 const fragments=[...(proposal.unparsed??[]),...entries.filter(e=>e.unitType==='component').map(e=>e.number)];
 const resolvedComponents=new Set();
 for(const fragment of [...new Set(fragments)]){
  if(unsafe.test(fragment)){if((proposal.unparsed??[]).includes(fragment))unparsed.push(fragment);continue;}
  const parts=familyList(fragment),matches=parts.map(part=>find(part,catalog,context));
  if(matches.some(m=>!m.hits.length)){if((proposal.unparsed??[]).includes(fragment))unparsed.push(fragment);continue;}
  const publications=[...new Map(matches.flatMap(m=>m.hits).map(h=>[h.p.id,h.p])).values()];
  let unresolved=false;
  for(const p of publications){
   // "Selected issues of X" cannot establish the complete miniseries. A
   // leading partial qualifier also scopes later unresolved list fragments.
   const partial=unsafe.test(statement)||proposal.entries.some(e=>e.unitType==='component'&&e.number===fragment&&e.completeness!=='full');
   const enumerable=p.kind!=='ongoing'&&p.numbers.length&&(p.kind!=='miniseries'||p.complete)&&(!p.requiresType||/\b(?:one-shot|special)\b/iu.test(fragment));
   const resolution={referenceId:p.id,title:p.title,run:p.run,kind:p.kind,sourceFragment:fragment,sources:p.sources,referenceVersion:PUBLICATION_REFERENCE_VERSION,enumeration:enumerable&&!partial?'supported':'unresolved',...(partial?{reason:'The source does not establish complete publication coverage'}:!enumerable?{reason:'The complete issue enumeration is not established'}:{})};
   resolutions.push(resolution);
   if(!enumerable||partial){unresolved=true;continue;}
   for(const number of p.numbers)entries.push({series:p.title,run:p.run,unitType:number==='unnumbered'?'special':'issue',number,language:'',completeness:'full',publicationResolution:resolution});
  }
  if(unresolved){if((proposal.unparsed??[]).includes(fragment))unparsed.push(fragment);}else resolvedComponents.add(fragment);
 }
 if(!resolutions.length)return proposal;
 const unique=new Map();
 for(const e of entries.filter(e=>e.unitType!=='component'||!resolvedComponents.has(e.number))){
  const k=listKey(e);if(!unique.has(k))unique.set(k,e);
 }
 return {...proposal,entries:[...unique.values()],unparsed,publicationResolutions:[...new Map(resolutions.map(r=>[r.referenceId+':'+r.enumeration,r])).values()],outcome:unparsed.length?'partial':'full'};
}

// A literal, captured publication-family context can date an already enumerated
// series. Never change explicit runs, reviewed entries, numbers or extents.
export function resolvePublicationRun(entry,saved){
 if(entry.run||entry.runContextConflict||entry.containmentUncertain||entry.unitType!=='issue')return entry;
 const context=publicationContext(saved),matches=references.filter(p=>p.kind==='ongoing'&&scoped(p,context)&&aliases(p).includes(key(entry.series))&&p.numbers.includes(entry.number));
 if(matches.length!==1)return entry;
 const p=matches[0];return {...entry,run:p.run,publicationResolution:{referenceId:p.id,title:p.title,run:p.run,kind:p.kind,sources:p.sources,referenceVersion:PUBLICATION_REFERENCE_VERSION,enumeration:'already explicit',sourceFragment:entry.series+' #'+entry.number}};
}
