import {validateManifest,manifestReviewProposal} from './kindle-manifest.js';

// Review presentation only, separate from same-clause manifest interpretation.
// No persisted field, selection/ranking change, proposal union or refresh.
export const CONTENTS_EVIDENCE_REVIEW_VERSION=1;
export function independentContentsClaims(saved,title='') {
 if(!saved?.manifest)return {version:CONTENTS_EVIDENCE_REVIEW_VERSION,claims:[]};
 const manifest=validateManifest(saved.manifest,title),selected=manifest.candidates[manifest.selected];
 // A legacy selected child is interpreted through its parent. Neither its
 // parent nor siblings are independent review claims.
 const parent=selected?.manifestRange&&!selected.whole?manifest.candidates.find(c=>c.whole&&c.block===selected.block&&c.manifestRange.start===selected.manifestRange.start&&c.manifestRange.end===selected.manifestRange.end):null;
 const claims=manifest.secondary.flatMap(index=>{
  const candidate=manifest.candidates[index];
  if(!candidate||candidate===parent||candidate.manifestRange&&!candidate.whole)return [];
  const proposal=manifestReviewProposal({statement:candidate.raw,manifest:{...manifest,selected:index}},title);
  // Literal qualifiers are review hints, not a new semantic quality scorer or
  // a supplement-to-component conversion. Keep unsupported scope unresolved.
  const qualifiers=[...candidate.raw.matchAll(/\b(?:excerpts? from|material from|selections? from|stories from|original script|sketchbooks?|bonus material)\b/giu)].map(m=>m[0]);
  return [{index,block:candidate.block,start:candidate.start,end:candidate.end,raw:candidate.raw,parserInput:candidate.parserInput,binding:candidate.binding,quality:candidate.quality,qualifiers,proposal}];
 });
 return {version:CONTENTS_EVIDENCE_REVIEW_VERSION,claims};
}
