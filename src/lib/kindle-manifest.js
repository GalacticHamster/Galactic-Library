import {proposeContentsForReview,contentKey} from './contents.js';
import {assessContentsQuality,naturalContentsClaims,recoveredNaturalContents} from './contents-quality.js';

// Source acquisition stays in the classic adapter. Assessment stays beside the
// existing review parser in the worker; no page-side module/permission changes.
export const MANIFEST_LIMITS=Object.freeze({blocks:8,total:24000,block:12000,candidates:32,window:2000,evidence:16000});
// Interpretation of existing source, independent of capture/parser generations.
export const MANIFEST_INTERPRETATION_VERSION=3;
const trigger=/\b(?:collects?|collecting|contains?|containing|includes?|including|comprises?|comprising|reprints?|reprinting)\b/giu;
const semanticClaim=new RegExp(trigger.source,'iu');
const clean=value=>String(value??'').replace(/\s+/gu,' ').trim();
// UI textareas/list summaries compact whitespace. That changes presentation,
// not captured-source identity; substantive edits still need independent parsing.
const sameSourceText=(a,b)=>typeof a==='string'&&typeof b==='string'&&Boolean(clean(a))&&clean(a)===clean(b);

export function validateDescriptionBlocks(value) {
  if(!Array.isArray(value)||value.length>MANIFEST_LIMITS.blocks)throw Error('Invalid description blocks.');
  let total=0;
  return value.map(block=>{
    if(!block||typeof block.text!=='string'||typeof block.selector!=='string'||block.selector.length>100||block.text.length>MANIFEST_LIMITS.block||(total+=block.text.length)>MANIFEST_LIMITS.total)throw Error('Description exceeds manifest bounds.');
    // Source evidence retains captured DOM lines. Candidate/parser copies still
    // use their existing whitespace normalization; no new grammar or guessed
    // constituent separators are introduced by a visual line break.
    return {selector:block.selector,text:block.text.replace(/\r\n?/gu,'\n').split('\n').map(clean).join('\n').replace(/\n{2,}/gu,'\n').trim()};
  });
}

function sentences(text) {
  const out=[];let start=0;
  for(const m of text.matchAll(/[.!?](?=\s+[A-Z“"]|Read more\b)|(?<=\d)[.!?](?=[A-Z])/gu)){
    const before=text.slice(start,m.index);
    if(m[0]==='.'&&(/\b(?:vols?|no|nos|ed|pt|pts|mr|mrs|ms|dr|st|vs)$/iu.test(before)||/\b(?:[A-Z]\.)*[A-Z]$/u.test(before)))continue;
    out.push({start,end:m.index+1});start=m.index+1;
  }
  if(start<text.length)out.push({start,end:text.length});return out;
}

// Bind elliptical issue claims only to an explicit title anchor. Matching an
// anchor supplies review context, never bibliographic identity or ownership.
function contextAnchor(title,context) {
  const base=clean(title).split(/\s*[:,-]?\s+\b(?:vol(?:ume)?\.?|book)\s+(?:\d+|one|two|three|four|five)\b/iu)[0].replace(/[:,-]+$/u,'').trim();
  const words=base.split(/\s+/u);
  for(let n=Math.min(words.length,12);n>=2;n--){
    if(n<words.length&&n<3)continue;
    const anchor=words.slice(0,n).join(' ').replace(/[:,-]+$/u,''),escaped=anchor.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    if(new RegExp('(?<![\\p{L}\\d])'+escaped+'(?![\\p{L}\\d])','iu').test(context))return {series:anchor,basis:'explicit-description-title-anchor'};
  }
  if(base!==clean(title)&&base.length>1)return {series:base,basis:'explicit-product-series-volume-title'};
  return null;
}

function parserInput(raw,context,title) {
  let input=clean(raw).replace(/(?<=\d)\s*[–—]\s*(?=#?\d)/gu,'-').replace(/[.!]+$/u,'');
  // Segmentation before a containment verb can leave the product's own volume
  // looking like the last listed child. Carry its literal predicate into the
  // parsing copy, without absorbing the next claim or any of its numbers.
  const subject=/[,;]\s*([^,;]+\b(?:vol(?:ume)?\.?|book)\s+\d+)$/iu.exec(input);
  if(subject&&clean(subject[1]).toLowerCase()===clean(title).toLowerCase()){
    const source=clean(context),position=source.indexOf(clean(raw));
    const predicate=position<0?null:/^\s+(includes?|contains?|collects?|collecting)\b/iu.exec(source.slice(position+clean(raw).length));
    if(predicate)input+=' '+predicate[1];
  }
  const hit=[...input.matchAll(trigger)][0];
  if(hit)input=input.slice(hit.index);
  input=input.replace(/^(?:reprints?|reprinting|comprising)\b/iu,'Collects').replace(/^Contents\s*:\s*/iu,'Includes ');
  if(/\bof this (?:seminal |classic |original |comic(?: book)? )?series\b|\bthrough\s+\d|\bthe first\s+(?:\w+|\d+)\s+issues of (?:this|the) series\b/iu.test(input)){
    const contextual=proposeContentsForReview(input,title,{allowTitleBinding:true});
    if(contextual.parseBinding==='explicit-product-series-volume-title')return {input:contextual.parseInput,binding:contextual.parseBinding};
  }
  const collecting=/^collecting\b/iu.test(input);
  const start=input.replace(/^(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b\s*/iu,'');
  const elliptical=/^(?:the\s+)?(?:final\s+\d+\s+)?issues?\s*,?\s*(#?\d+(?:\s*[-–—]\s*#?\d+)?(?:\s*(?:,|and)\s*#?\d+(?:\s*[-–—]\s*#?\d+)?)*)/iu.exec(start);
  const anchor=contextAnchor(title,context);
  if(elliptical&&anchor){
    // This newly enabled prefix path must retain an explicit run already in
    // the product's series title, rather than reducing it to a shorter anchor.
    if(collecting){
      const productSeries=clean(title).split(/\s*[:,-]?\s+\b(?:vol(?:ume)?\.?|book)\s+(?:\d+|one|two|three|four|five)\b/iu)[0];
      const run=/\s+(\(\d{4}(?:[-–—]\d{0,4})?\))$/u.exec(productSeries);
      if(run&&clean(productSeries.slice(0,run.index)).toLowerCase()===anchor.series.toLowerCase())anchor.series+=' '+run[1];
    }
    const tail=start.slice(elliptical[0].length);
    // An explicit "of OTHER SERIES" is not an elliptical attribution.
    // Let the existing parser interpret that label instead of substituting the
    // product's series. Likewise retain unrecognized trailing prose for review.
    if(/^\s+of\s+(?!(?:their|the|creator)\b)/iu.test(tail))return {input,binding:'explicit-clause'};
    // Attribution/'of the series' is context, not a constituent. Preserve
    // actual supplements as unresolved text rather than silently dropping them.
    const supplement=/[,;]\s*(?:and\s+)?(?:also\s+)?(?:includes?|contains?)\s+(.+)$/iu.exec(tail);
    const attribution=/^\s*[,]?\s*(?:of\s+(?:their|the|creator)\b|in\s+[^,;]{1,100}['’]s\b)/iu.test(tail);
    // Keep a literal supplementary work clause when the prefix fix enables
    // attribution normalization. Do not discard it with the series/credits,
    // or invent delimiters/names inside it; the existing parser owns scope.
    const addedWork=collecting&&attribution?/[,;]\s*plus\b|\s+(?:together with|as well as)\b|[,;]\s*(?:and\s+)?(?:material|stories|a\s+story|excerpts?)\s+from\b/iu.exec(tail):null;
    const other=addedWork?'; '+tail.slice(addedWork.index).replace(/^[,;]\s*/u,'').trim():tail&&!attribution?tail:'';
    return {input:separateNamedSupplement(`Collects ${anchor.series} issues ${elliptical[1]}${supplement?'; '+supplement[1]:other}`),binding:anchor.basis};
  }
  if(!hit&&anchor){
    const numbered=/\bissues?\s*(#?\d+(?:\s*[-–—]\s*\d+)?)/iu.exec(input);
    if(numbered){
      const tail=input.slice(numbered.index+numbered[0].length).replace(/^[,;]\s*/u,'');
      const extent=/\b(?:material from|excerpts? from|selections? from|partial)\b/iu.test(input)?'material from ':'';
      return {input:`Collects ${extent}${anchor.series} issues ${numbered[1]}${tail?'; '+tail:''}`,binding:anchor.basis};
    }
  }
  return {input:separateNamedSupplement(input),binding:'explicit-clause'};
}

function separateNamedSupplement(input){
  // An explicit ", and" after an unnumbered supplement is a new clause,
  // not part of the next numbered title's label. Keep the named supplement
  // unresolved while letting the existing parser handle the explicit unit.
  return input.replace(/(#\s*\d+(?:\s*-\s*\d+)?\s*,\s*[^#;]{1,300}?),\s+and\s+(?=[^#;]{1,150}#\s*\d)/giu,'$1; ');
}

function wholeManifestRange(text,sentence,starts,index,title) {
  const first=starts[index];if(first.structural)return null;
  const start=sentence.start+first.index;
  // Another containment verb is a new semantic claim, never an implicit child.
  const next=starts.slice(index+1).find(s=>!s.structural);
  const end=sentence.start+(next?.index??sentence.end-sentence.start);
  const children=starts.slice(index+1).filter(s=>s.structural&&sentence.start+s.index<end);
  if(!children.length)return null;
  const raw=text.slice(start,end).trim().replace(/;\s*$/u,'');
  const parts=raw.split(';').map(clean).filter(Boolean);
  // A finite numbered first segment grounds the collection relationship. An
  // incidental number or a plot/credit/feature claim cannot introduce a parent.
  const head=parserInput(parts[0],text.slice(Math.max(0,start-600),end),title);
  const firstProposal=proposeContentsForReview(head.input,title);
  if(firstProposal.quality!=='containment'||!firstProposal.entries.some(e=>e.unitType!=='component'))return null;
  // Unresolved named supplements remain literal evidence. Reject intervening
  // narrative/promotional context rather than linking everything after a ';'.
  // A singular Feature can be a numbered title; hyphenated pronouns can be
  // part of a work name. Keep actual predicates and contributor prose blocked.
  const prose=/\b(?:is|are|was|were|will|would|can|could|(?<!-)he(?!-)|(?<!-)she(?!-)|they|you|authors?|creators?|contributors?|artists?|writers?|interviews?|praise|critics?|reviews?|synopsis|available|recommended|following|features|follows?|explores?|encounters?|travels?|discover(?:s|ed)?|drawn|written|illustrated|published|bestsell\w*)\b/iu;
  const continuation=parts.slice(1).every(part=>{
    const value=part.replace(/^(?:and|plus)\s+/iu,'');
    // The finite numbered head establishes one collection span. Comma issue
    // lists, excerpt qualifiers and unresolved named tails need not end in a
    // bare range. They remain within this sentence and before the next claim;
    // narrative/contributor prose still prevents a parent from forming.
    return !prose.test(value)&&!semanticClaim.test(value)
      && (/^[\p{Lu}\d"“]/u.test(value)||/^(?:material|excerpts?|selections?|stories)\s+from\b/iu.test(value));
  });
  return continuation?{start,end}:null;
}

export function discoverManifestCandidates(blocks,title='') {
  blocks=validateDescriptionBlocks(blocks);const windows=[],candidates=[],seen=new Set();let evidenceSize=0;
  for(let block=0;block<blocks.length;block++){
    const text=blocks[block].text;
    for(const claim of naturalContentsClaims(text)){
      if(seen.has(claim.raw))continue;seen.add(claim.raw);
      windows.push({block,start:claim.start,end:claim.end,raw:claim.raw,structural:false,natural:true,syntax:3,contextStart:Math.max(0,claim.start-600),contextEnd:claim.end});
    }
    for(const sentence of sentences(text)){
      const body=text.slice(sentence.start,sentence.end);
      const verbs=[...body.matchAll(trigger)];
      const starts=verbs.map(m=>({index:m.index,structural:false}));
      const explicitUnits=/\b(?:issues?|volumes?|books?)\s*(?:#?\s*\d|,\s*#\d)/iu.test(body);
      const finiteNumbered=/^\s*[^.!?]{1,150}#\s*\d+(?:\s*[-–—]\s*#?\d+)?\s*[.!]?\s*$/u.test(body);
      if(!verbs.length&&(explicitUnits||finiteNumbered||/^\s*Contents\s*:/iu.test(body)))starts.push({index:0,structural:true});
      // A structurally explicit clause after a semicolon can coexist with an
      // unrelated semantic clause in the same sentence.
      for(const m of body.matchAll(/;\s*(?=(?:[\p{Lu}][^;]{0,120}#\d|issues?\s*#?\d|Contents\s*:))/gu))starts.push({index:m.index+m[0].length,structural:true});
      starts.sort((a,b)=>a.index-b.index);
      const parents=starts.map((_,index)=>wholeManifestRange(text,sentence,starts,index,title)).filter(Boolean);
      for(let i=0;i<starts.length;i++){
        const start=sentence.start+starts[i].index,end=Math.min(sentence.start+(starts[i+1]?.index??body.length),start+MANIFEST_LIMITS.window);
        const raw=text.slice(start,end).trim().replace(/[,;]\s*(?:and\s+)?(?:also\s+)?$/iu,'').replace(/,?\s+(?:and\s+)?also$/iu,'').replace(/,\s+and$/iu,'').trim();
        if(!raw||seen.has(raw))continue;seen.add(raw);
        // Scan every bounded block before applying the assessment budget. A
        // long run of early prose cannot exhaust the budget before a later
        // numbered/enumerated manifest is even examined. This is capacity
        // allocation by structural syntax, not semantic quality or verb rank.
        const syntax=/#\s*\d|\b(?:issues?|volumes?|books?)\s*#?\d/iu.test(raw)?2:/["“][^"”]+["”].*(?:,|\band\b)|^Contents\s*:/iu.test(raw)?1:0;
        const manifestRange=parents.find(p=>start>=p.start&&end<=p.end);
        windows.push({block,start,end,raw,structural:starts[i].structural,syntax,contextStart:Math.max(0,start-600),contextEnd:Math.min(sentence.end,start+1400),...(manifestRange?{manifestRange}: {})});
      }
      for(const manifestRange of parents){
        const {start}=manifestRange;let end=Math.min(manifestRange.end,start+MANIFEST_LIMITS.window);
        if(end<manifestRange.end){const separator=text.lastIndexOf(';',end);if(separator>start)end=separator;}
        const raw=text.slice(start,end).trim();
        if(!raw||seen.has(raw))continue;seen.add(raw);
        windows.push({block,start,end,raw,structural:false,syntax:3,contextStart:Math.max(0,start-600),contextEnd:manifestRange.end,manifestRange,whole:true,truncated:end<manifestRange.end});
      }
    }
  }
  windows.sort((a,b)=>b.syntax-a.syntax||a.block-b.block||a.start-b.start);
  for(const window of windows.slice(0,MANIFEST_LIMITS.candidates)){
        const {block,start,end,raw,structural,contextStart,contextEnd,manifestRange,whole,truncated}=window,text=blocks[block].text;
        const context=text.slice(contextStart,contextEnd);
        const normalized=parserInput(raw,context,title),contextual=assessContentsQuality(raw,title);
        const proposal=proposeContentsForReview(contextual.quality==='filtered'?raw:normalized.input,title);
        if(contextual.quality==='filtered')normalized.input=raw;
        if(evidenceSize+raw.length+normalized.input.length>MANIFEST_LIMITS.evidence)continue;
        evidenceSize+=raw.length+normalized.input.length;
        // Existing contextual quality gates first, then parse structure. No
        // independent semantic scorer or verb-priority hierarchy.
        const quality=proposal.quality==='containment'?2:proposal.quality==='uncertain'?1:0;
        const numeric=proposal.entries.filter(e=>e.unitType!=='component').length;
        const rank=[quality,numeric?2:proposal.entries.length?1:0,Math.min(proposal.entries.length,500),proposal.outcome==='full'?1:0,-proposal.unparsed.length];
        candidates.push({block,start,end,contextStart,contextEnd,raw,parserInput:normalized.input,binding:window.natural?'natural-reprint':normalized.binding,structural,position:start/Math.max(1,text.length),rank,quality:proposal.quality,outcome:proposal.outcome,entries:proposal.entries.length,unresolved:proposal.unparsed.length,proposal,...(manifestRange?{manifestRange,...(whole?{whole:true,truncated}: {})}: {})});
  }
  return candidates.sort((a,b)=>a.block-b.block||a.start-b.start||a.end-b.end);
}

export function selectManifest(blocks,title='') {
  blocks=validateDescriptionBlocks(blocks);const candidates=discoverManifestCandidates(blocks,title);
  const ranked=candidates.map((c,index)=>({...c,index})).sort((a,b)=>{
    for(let i=0;i<a.rank.length;i++)if(a.rank[i]!==b.rank[i])return b.rank[i]-a.rank[i];
    return a.position-b.position||a.index-b.index; // weak, deterministic early tie break
  });
  // Children are diagnostic pieces of their source-backed parent, not competing
  // complete manifests. Ranking among independent source claims is unchanged.
  const winner=ranked.find(c=>!c.manifestRange||c.whole||!ranked.some(p=>p.whole&&p.block===c.block&&p.manifestRange.start===c.manifestRange.start&&p.manifestRange.end===c.manifestRange.end)),selected=winner?.index??-1;
  // Do not join free prose across sentences or guess that separate claims refer
  // to the same edition. Keep useful secondary evidence for explicit review.
  const keys=new Set(winner?.proposal.entries.map(contentKey)??[]);
  const secondary=ranked.filter(c=>c.index!==selected&&c.quality!=='filtered'&&(c.manifestRange||c.proposal.entries.some(e=>!keys.has(contentKey(e)))||!c.entries)).map(c=>c.index);
  return {statement:winner?.raw??'',manifest:{interpretationVersion:MANIFEST_INTERPRETATION_VERSION,title:clean(title).slice(0,500),blocks,candidates:candidates.map(({proposal,...c})=>c),selected,secondary,descriptionMayBeIncomplete:blocks.some(b=>/\s+Read more\s*$/iu.test(b.text))}};
}

export function manifestReviewProposal(saved,title,statement=saved?.statement??'',context={}) {
  const subjects=[...new Set((saved?.productDetailsEvidence?.observations??[]).filter(o=>o.field==='series'&&o.status==='observed'&&/^Part of:\s*/iu.test(o.value??o.raw??'')).map(o=>(o.value??o.raw).replace(/^Part of:\s*/iu,'')))];
  if(subjects.length===1)context={...context,subjectSeries:subjects[0]};
  const recovered=recoveredNaturalContents(saved);
  if(recovered&&(!statement||sameSourceText(statement,recovered.raw))){
    const proposal=proposeContentsForReview(recovered.raw,title,{...context,allowTitleBinding:true});
    return {...proposal,manifestEvidence:recovered.raw,recoveredFromDescription:true,descriptionMayBeIncomplete:Boolean(saved.manifest?.descriptionMayBeIncomplete)};
  }
  // Old selections remain source history. Reinterpret only a proven parent of
  // that exact saved child, never a better-ranked unrelated secondary claim.
  const manifest=saved?.manifest?.interpretationVersion===MANIFEST_INTERPRETATION_VERSION?saved.manifest:saved?.manifest?validateManifest(saved.manifest):null;
  let reviewContext={...context,allowTitleBinding:sameSourceText(statement,saved?.statement)};
  if(manifest){
    const candidate=manifest.candidates[manifest.selected];
    if(candidate&&sameSourceText(candidate.raw,saved.statement)){
      const parent=candidate.manifestRange&&!candidate.whole?manifest.candidates.find(c=>c.whole&&c.block===candidate.block&&c.manifestRange.start===candidate.manifestRange.start&&c.manifestRange.end===candidate.manifestRange.end):null;
      if(!sameSourceText(statement,saved.statement)&&!sameSourceText(statement,parent?.raw))return proposeContentsForReview(statement,title,reviewContext);
      reviewContext={...context,allowTitleBinding:true};
      const interpreted=parent??candidate,proposal=proposeContentsForReview(interpreted.parserInput,title,reviewContext);
      const incomplete=interpreted.truncated||candidate.manifestRange&&!candidate.whole&&!parent;
      const remainder=interpreted.whole?manifest.blocks[interpreted.block].text.slice(interpreted.end,interpreted.manifestRange.end):incomplete?manifest.blocks[candidate.block].text.slice(candidate.manifestRange.start,candidate.manifestRange.end):'';
      const unparsed=incomplete?[...proposal.unparsed,remainder]:proposal.unparsed;
      return {...proposal,unparsed,outcome:incomplete&&proposal.outcome==='full'?'partial':proposal.outcome,parseBinding:proposal.parseBinding==='explicit-statement'?interpreted.binding:proposal.parseBinding,descriptionMayBeIncomplete:manifest.descriptionMayBeIncomplete,...(interpreted.whole?{manifestEvidence:interpreted.raw,manifestCoverage:incomplete?'bounded':'whole-clause'}: {})};
    }
  }
  return proposeContentsForReview(statement,title,reviewContext);
}

// Recompute inputs/ranks from bounded source. A parser upgrade must not replace
// an existing selected source clause simply because its rank changes. Only an
// exact source-backed window (including offsets) can retain that selection.
function recomputeManifest(value,title='') {
  if(!value||typeof value!=='object')throw Error('Invalid manifest evidence.');
  if(typeof value.title!=='string'||value.title.length>500)throw Error('Invalid manifest title context.');
  const result=selectManifest(value.blocks,title||value.title).manifest;
  const saved=Array.isArray(value.candidates)&&Number.isInteger(value.selected)?value.candidates[value.selected]:null;
  const selected=saved?result.candidates.findIndex(c=>c.block===saved.block&&c.start===saved.start&&c.end===saved.end&&c.raw===saved.raw):-1;
  if(selected>=0 && selected!==result.selected){
    result.selected=selected;
    const winner=proposeContentsForReview(result.candidates[selected].parserInput,result.title),keys=new Set(winner.entries.map(contentKey));
    result.secondary=result.candidates.flatMap((c,index)=>{
      if(index===selected||c.quality==='filtered')return [];
      const proposal=proposeContentsForReview(c.parserInput,result.title);
      return !proposal.entries.length||proposal.entries.some(e=>!keys.has(contentKey(e)))?[index]:[];
    });
  }
  return result;
}

// A cache hit reuses only a deterministic source interpretation, never input
// validation or caller-supplied candidates/ranks. Every output is detached.
// Source text, title and saved selection coordinates are the complete inputs.
export function createManifestValidator({maxBytes=16*1024*1024,maxEntries=4096,compute=recomputeManifest}={}){
  const cache=new Map();let bytes=0;
  return (value,title='')=>{
    if(!value||typeof value!=='object')throw Error('Invalid manifest evidence.');
    if(typeof value.title!=='string'||value.title.length>500)throw Error('Invalid manifest title context.');
    const blocks=validateDescriptionBlocks(value.blocks);
    const saved=Array.isArray(value.candidates)&&Number.isInteger(value.selected)?value.candidates[value.selected]:null;
    const selection=saved&&Number.isInteger(saved.block)&&Number.isInteger(saved.start)&&Number.isInteger(saved.end)&&typeof saved.raw==='string'&&saved.raw.length<=MANIFEST_LIMITS.window?[saved.block,saved.start,saved.end,saved.raw]:null;
    const key=JSON.stringify([String(title||value.title),blocks,selection]);
    const hit=cache.get(key);
    if(hit){cache.delete(key);cache.set(key,hit);return structuredClone(hit.value);}
    const result=compute({...value,blocks},title),size=2*(key.length+JSON.stringify(result).length);
    if(size<=maxBytes&&maxEntries>0){
      const entry={value:structuredClone(result),size};cache.set(key,entry);bytes+=size;
      while(bytes>maxBytes||cache.size>maxEntries){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).size;cache.delete(oldest);}
    }
    return result;
  };
}
export const validateManifest=createManifestValidator();
