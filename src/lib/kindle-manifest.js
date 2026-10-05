import {proposeContentsForReview,contentKey} from './contents.js';
import {assessContentsQuality} from './contents-quality.js';

// Source acquisition stays in the classic adapter. Assessment stays beside the
// existing review parser in the worker; no page-side module/permission changes.
export const MANIFEST_LIMITS=Object.freeze({blocks:8,total:24000,block:12000,candidates:32,window:2000,evidence:16000});
const trigger=/\b(?:collects?|collecting|contains?|containing|includes?|including|comprises?|comprising|reprints?|reprinting)\b/giu;
const clean=value=>String(value??'').replace(/\s+/gu,' ').trim();

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
  const hit=[...input.matchAll(trigger)][0];
  if(hit)input=input.slice(hit.index);
  input=input.replace(/^(?:reprints?|reprinting|comprising)\b/iu,'Collects').replace(/^Contents\s*:\s*/iu,'Includes ');
  const start=input.replace(/^(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\s*/iu,'');
  const elliptical=/^(?:the\s+)?(?:final\s+\d+\s+)?issues?\s*,?\s*(#?\d+(?:\s*[-–—]\s*#?\d+)?(?:\s*(?:,|and)\s*#?\d+(?:\s*[-–—]\s*#?\d+)?)*)/iu.exec(start);
  const anchor=contextAnchor(title,context);
  if(elliptical&&anchor){
    const tail=start.slice(elliptical[0].length);
    // An explicit "of OTHER SERIES" is not an elliptical attribution.
    // Let the existing parser interpret that label instead of substituting the
    // product's series. Likewise retain unrecognized trailing prose for review.
    if(/^\s+of\s+(?!(?:their|the|creator)\b)/iu.test(tail))return {input,binding:'explicit-clause'};
    // Attribution/'of the series' is context, not a constituent. Preserve
    // actual supplements as unresolved text rather than silently dropping them.
    const supplement=/[,;]\s*(?:and\s+)?(?:also\s+)?(?:includes?|contains?)\s+(.+)$/iu.exec(tail);
    const attribution=/^\s*[,]?\s*(?:of\s+(?:their|the|creator)\b|in\s+[^,;]{1,100}['’]s\b)/iu.test(tail);
    const other=tail&&!attribution?tail:'';
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

export function discoverManifestCandidates(blocks,title='') {
  blocks=validateDescriptionBlocks(blocks);const windows=[],candidates=[],seen=new Set();let evidenceSize=0;
  for(let block=0;block<blocks.length;block++){
    const text=blocks[block].text;
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
      for(let i=0;i<starts.length;i++){
        const start=sentence.start+starts[i].index,end=Math.min(sentence.start+(starts[i+1]?.index??body.length),start+MANIFEST_LIMITS.window);
        const raw=text.slice(start,end).trim().replace(/[,;]\s*(?:and\s+)?(?:also\s+)?$/iu,'').replace(/,?\s+(?:and\s+)?also$/iu,'').replace(/,\s+and$/iu,'').trim();
        if(!raw||seen.has(raw))continue;seen.add(raw);
        // Scan every bounded block before applying the assessment budget. A
        // long run of early prose cannot exhaust the budget before a later
        // numbered/enumerated manifest is even examined. This is capacity
        // allocation by structural syntax, not semantic quality or verb rank.
        const syntax=/#\s*\d|\b(?:issues?|volumes?|books?)\s*#?\d/iu.test(raw)?2:/["“][^"”]+["”].*(?:,|\band\b)|^Contents\s*:/iu.test(raw)?1:0;
        windows.push({block,start,end,raw,structural:starts[i].structural,syntax,contextStart:Math.max(0,start-600),contextEnd:Math.min(sentence.end,start+1400)});
      }
    }
  }
  windows.sort((a,b)=>b.syntax-a.syntax||a.block-b.block||a.start-b.start);
  for(const window of windows.slice(0,MANIFEST_LIMITS.candidates)){
        const {block,start,end,raw,structural,contextStart,contextEnd}=window,text=blocks[block].text;
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
        candidates.push({block,start,end,contextStart,contextEnd,raw,parserInput:normalized.input,binding:normalized.binding,structural,position:start/Math.max(1,text.length),rank,quality:proposal.quality,outcome:proposal.outcome,entries:proposal.entries.length,unresolved:proposal.unparsed.length,proposal});
  }
  return candidates.sort((a,b)=>a.block-b.block||a.start-b.start);
}

export function selectManifest(blocks,title='') {
  blocks=validateDescriptionBlocks(blocks);const candidates=discoverManifestCandidates(blocks,title);
  const ranked=candidates.map((c,index)=>({...c,index})).sort((a,b)=>{
    for(let i=0;i<a.rank.length;i++)if(a.rank[i]!==b.rank[i])return b.rank[i]-a.rank[i];
    return a.position-b.position||a.index-b.index; // weak, deterministic early tie break
  });
  const winner=ranked[0],selected=winner?.index??-1;
  // Do not join free prose across sentences or guess that separate claims refer
  // to the same edition. Keep useful secondary evidence for explicit review.
  const keys=new Set(winner?.proposal.entries.map(contentKey)??[]);
  const secondary=ranked.filter(c=>c.index!==selected&&c.quality!=='filtered'&&(c.proposal.entries.some(e=>!keys.has(contentKey(e)))||!c.entries)).map(c=>c.index);
  return {statement:winner?.raw??'',manifest:{title:clean(title).slice(0,500),blocks,candidates:candidates.map(({proposal,...c})=>c),selected,secondary,descriptionMayBeIncomplete:blocks.some(b=>/\s+Read more\s*$/iu.test(b.text))}};
}

export function manifestReviewProposal(saved,title,statement=saved?.statement??'',context={}) {
  const reviewContext={...context,allowTitleBinding:statement===saved?.statement};
  const manifest=saved?.manifest;
  if(manifest&&statement===saved.statement){
    const candidate=manifest.candidates[manifest.selected];
    if(candidate&&candidate.raw===statement){
      const proposal=proposeContentsForReview(candidate.parserInput,title,reviewContext);
      return {...proposal,parseBinding:proposal.parseBinding==='explicit-statement'?candidate.binding:proposal.parseBinding,descriptionMayBeIncomplete:manifest.descriptionMayBeIncomplete};
    }
  }
  return proposeContentsForReview(statement,title,reviewContext);
}

// Recompute inputs/ranks from bounded source. A parser upgrade must not replace
// an existing selected source clause simply because its rank changes. Only an
// exact source-backed window (including offsets) can retain that selection.
export function validateManifest(value,title='') {
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
