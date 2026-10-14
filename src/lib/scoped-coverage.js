import {contentKey,contentsSourceBaseline} from './contents.js';
import {dispositionReferences} from './coverage-disposition.js';
export function scopedEntryKeys(entries){const seen=new Map();return entries.map(entry=>{const base=contentKey(entry)+':'+entry.completeness,n=seen.get(base)??0;seen.set(base,n+1);return 'entry:'+JSON.stringify([base,n]);});}
export const sameCoverageBasis=(record,review)=>JSON.stringify(contentsSourceBaseline(record))===JSON.stringify(review?.coverageResolutionBaseline);
// Apply after cross-book run inference when constructing the coverage index.
// Corrections must never become seeds that change another observation's run.
export function scopedContents(contents,record,review,{sourceEntries=contents.entries}={}){
 if(!review?.coverageResolutions?.length||!sameCoverageBasis(record,review)||contents.confidence==='rejected')return contents;
 const references=dispositionReferences(contents,review.referenceDecisions),resolvedReferenceKeys=[],entries=[...contents.entries],unparsed=[...(contents.unparsed??[])];
 const positions=new Map(scopedEntryKeys(sourceEntries).map((key,index)=>[key,index]));
 for(const resolution of review.coverageResolutions){
  const scopedResolution={key:resolution.key,verifiedAt:resolution.verifiedAt,...(resolution.referenceKey?{referenceKey:resolution.referenceKey}:{})};
  if(resolution.referenceKey){
   const reference=references.find(r=>r.key===resolution.referenceKey&&!r.ignored);if(!reference)continue;
   resolvedReferenceKeys.push(reference.key);const index=unparsed.indexOf(reference.fragment);if(index>=0)unparsed.splice(index,1);
   entries.push({...resolution.entry,scopedResolution});
  }else{
   const index=positions.get(resolution.key);if(index===undefined)continue;
   entries[index]={...resolution.entry,scopedResolution};
  }
 }
 return {...contents,entries,unparsed,referenceSource:contents,resolvedReferenceKeys};
}
