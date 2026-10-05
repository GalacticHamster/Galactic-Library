import {proposeContentsForReview,contentKey} from './contents.js';

// Source acquisition stays in the classic adapter. Assessment stays beside the
// existing review parser in the worker; no page-side module/permission changes.
export const MANIFEST_LIMITS=Object.freeze({blocks:8,total:24000,block:12000,candidates:32,window:2000,evidence:16000});
const trigger=/\b(?:collects?|collecting|contains?|containing|includes?|including|comprises?|comprising|reprints?|reprinting)\b/giu;
const structure=/\bissues?\s*(?:#?\s*\d|,\s*#\d)|#\s*\d+(?:\s*[-–—]\s*\d+)?|\b(?:volumes?|books?)\s+\d+\s*[-–—]\s*\d+/giu;
const clean=value=>String(value??'').replace(/\s+/gu,' ').trim();

export function validateDescriptionBlocks(value) {
  if(!Array.isArray(value)||value.length>MANIFEST_LIMITS.blocks)throw Error('Invalid description blocks.');
  let total=0;
  return value.map(block=>{
    if(!block||typeof block.text!=='string'||typeof block.selector!=='string'||block.selector.length>100||block.text.length>MANIFEST_LIMITS.block||(total+=block.text.length)>MANIFEST_LIMITS.total)throw Error('Description exceeds manifest bounds.');
    return {selector:block.selector,text:clean(block.text)};
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
    // Attribution/'of the series' is context, not a constituent. Preserve
    // actual supplements as unresolved text rather than silently dropping them.
    const supplement=/[,;]\s*(?:and\s+)?(?:also\s+)?(?:includes?|contains?)\s+(.+)$/iu.exec(tail);
    const other=tail&&!/^\s*(?:of\s+(?:their|the|creator|[\p{Lu}])|in\s+[\p{Lu}])/u.test(tail)?tail:'';
    return {input:`Collects ${anchor.series} issues ${elliptical[1]}${supplement?'; '+supplement[1]:other}`,binding:anchor.basis};
  }
  if(!hit&&anchor){
    const numbered=/\bissues?\s*(#?\d+(?:\s*[-–—]\s*\d+)?)/iu.exec(input);
    if(numbered){
      const tail=input.slice(numbered.index+numbered[0].length).replace(/^[,;]\s*/u,'');
      return {input:`Collects ${anchor.series} issues ${numbered[1]}${tail?'; '+tail:''}`,binding:anchor.basis};
    }
  }
  return {input,binding:'explicit-clause'};
}

export function discoverManifestCandidates(blocks,title='') {
  blocks=validateDescriptionBlocks(blocks);const candidates=[],seen=new Set();let evidenceSize=0;
  for(let block=0;block<blocks.length;block++){
    const text=blocks[block].text;
    for(const sentence of sentences(text)){
      const context=text.slice(Math.max(0,sentence.start-600),sentence.end).slice(-MANIFEST_LIMITS.window);
      const body=text.slice(sentence.start,sentence.end);
      const verbs=[...body.matchAll(trigger)];
      const starts=verbs.map(m=>({index:m.index,structural:false}));
      if(!verbs.length&&(structure.test(body)||/^\s*Contents\s*:/iu.test(body)))starts.push({index:0,structural:true});
      structure.lastIndex=0;
      // A structurally explicit clause after a semicolon can coexist with an
      // unrelated semantic clause in the same sentence.
      for(const m of body.matchAll(/;\s*(?=(?:[\p{Lu}][^;]{0,120}#\d|issues?\s*#?\d|Contents\s*:))/gu))starts.push({index:m.index+m[0].length,structural:true});
      starts.sort((a,b)=>a.index-b.index);
      for(let i=0;i<starts.length;i++){
        if(candidates.length>=MANIFEST_LIMITS.candidates)return candidates;
        const start=sentence.start+starts[i].index,end=Math.min(sentence.start+(starts[i+1]?.index??body.length),start+MANIFEST_LIMITS.window);
        const raw=text.slice(start,end).trim().replace(/[,;]\s*(?:and\s+)?(?:also\s+)?$/iu,'').replace(/,?\s+(?:and\s+)?also$/iu,'').replace(/,\s+and$/iu,'').trim();
        if(!raw||seen.has(raw))continue;seen.add(raw);
        const normalized=parserInput(raw,context,title),proposal=proposeContentsForReview(normalized.input,title);
        if(evidenceSize+raw.length+normalized.input.length>MANIFEST_LIMITS.evidence)return candidates;
        evidenceSize+=raw.length+normalized.input.length;
        // Existing contextual quality gates first, then parse structure. No
        // independent semantic scorer or verb-priority hierarchy.
        const quality=proposal.quality==='containment'?2:proposal.quality==='uncertain'?1:0;
        const numeric=proposal.entries.filter(e=>e.unitType!=='component').length;
        const rank=[quality,numeric?2:proposal.entries.length?1:0,Math.min(proposal.entries.length,500),proposal.outcome==='full'?1:0,-proposal.unparsed.length];
        candidates.push({block,start,end,raw,parserInput:normalized.input,binding:normalized.binding,structural:starts[i].structural,position:start/Math.max(1,text.length),rank,quality:proposal.quality,outcome:proposal.outcome,entries:proposal.entries.length,unresolved:proposal.unparsed.length,proposal});
      }
    }
  }
  return candidates;
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

export function manifestReviewProposal(saved,title,statement=saved?.statement??'') {
  const manifest=saved?.manifest;
  if(manifest&&statement===saved.statement){
    const candidate=manifest.candidates[manifest.selected];
    if(candidate&&candidate.raw===statement)return {...proposeContentsForReview(candidate.parserInput,title),descriptionMayBeIncomplete:manifest.descriptionMayBeIncomplete};
  }
  return proposeContentsForReview(statement,title);
}

// Backup metadata is recomputed from bounded source, never trusted arbitrary
// parser input or a caller-supplied rank/selection. This also validates offsets.
export function validateManifest(value,title='') {
  if(!value||typeof value!=='object')throw Error('Invalid manifest evidence.');
  if(typeof value.title!=='string'||value.title.length>500)throw Error('Invalid manifest title context.');
  return selectManifest(value.blocks,title||value.title).manifest;
}
