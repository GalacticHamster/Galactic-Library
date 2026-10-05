import {writeFile} from 'node:fs/promises';
import {wholeManifestEvidence,independentBaseline,sentenceRanges,secondarySemanticReview} from './independent-secondary-evidence.mjs';
import {proposeContentsForReview,contentKey} from '../src/lib/contents.js';
let requests=0;globalThis.fetch=()=>{requests++;throw Error('Network forbidden');};
const {corpus,observations}=await wholeManifestEvidence(process.argv[2]),baseline=await independentBaseline();
const key=e=>contentKey(e)+':'+e.completeness;
const rows=observations.map(row=>{
 const selected=baseline.module.selectManifest(row.blocks,row.title),m=selected.manifest,primary=m.candidates[m.selected];
 const provider=Object.values(corpus.db.providerItems).find(i=>i.metadata.detailUrl===row.url);
 const describe=(c,index)=>{
  const p=proposeContentsForReview(c.parserInput,row.title),text=m.blocks[c.block].text,sentence=sentenceRanges(text).find(s=>c.start>=s.start&&c.start<s.end);
  const paragraph={start:text.lastIndexOf('\n',c.start-1)+1,end:text.indexOf('\n',c.start)};if(paragraph.end<0)paragraph.end=text.length;
  const relation=c.manifestRange&&!c.whole?'same-manifest-child':'independent';
  const main=primary?proposeContentsForReview(primary.parserInput,row.title):{entries:[]},keys=new Set(main.entries.map(key));
  return {...c,index,sourceBlock:m.blocks[c.block],sourceSentence:sentence,sourceParagraph:paragraph,semanticTrigger:/\b(?:collects?|collecting|contains?|containing|includes?|including|comprises?|comprising|reprints?|reprinting)\b/iu.exec(c.raw)?.[0]??null,
   sourceContext:text.slice(c.contextStart,c.contextEnd),scopeQualifiers:[...c.raw.matchAll(/\b(?:material from|excerpts?|selections?|stories from|original script|sketches|bonus|supplement|classic tales|story arcs|novels|stories)\b/giu)].map(m=>m[0]),relation,
   retainedSecondary:m.secondary.includes(index),sameSentenceAsPrimary:primary?.block===c.block&&sentence?.start===sentenceRanges(text).find(s=>primary.start>=s.start&&primary.start<s.end)?.start,
   sameParagraphAsPrimary:primary?.block===c.block&&primary.start>=paragraph.start&&primary.start<paragraph.end,
   proposal:p,additionalEntries:p.entries.filter(e=>!keys.has(key(e))),duplicateEntries:p.entries.filter(e=>keys.has(key(e))),scopeConflicts:p.entries.filter(e=>main.entries.some(a=>contentKey(a)===contentKey(e)&&a.completeness!==e.completeness))};
 };
 return {id:row.id,title:row.title,url:row.url,providerId:provider?.id??null,sourceGeneration:row.sourceGeneration,blocks:m.blocks,selectedIndex:m.selected,primary:primary?describe(primary,m.selected):null,
  secondaries:m.candidates.flatMap((c,i)=>i!==m.selected&&c.quality!=='filtered'?[describe(c,i)]:[]),allCandidateCount:m.candidates.length,selection:selected};
});
for(const r of rows)for(const c of r.secondaries)c.semanticReview=secondarySemanticReview(r,c);
const population=rows.filter(r=>r.secondaries.length),secondaries=population.flatMap(r=>r.secondaries);
const result={networkRequests:requests,baselineHash:baseline.hash,sourceHash:corpus.sourceHash,sourceGeneration:5,parserVersion:4,filterVersion:1,schema:12,manifestInterpretationVersion:1,observations:rows.length,recordsWithSecondary:population.length,secondaryObservations:secondaries.length,retainedSecondaryObservations:secondaries.filter(c=>c.retainedSecondary).length,uniqueRealTitles:new Set(population.filter(r=>r.url).map(r=>r.title)).size,categories:Object.fromEntries([...new Set(secondaries.map(c=>c.semanticReview.category))].map(k=>[k,secondaries.filter(c=>c.semanticReview.category===k).length])),rows};
await writeFile(new URL('../docs/kindle-independent-secondary-frozen.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,rows:undefined},null,2));
for(const r of population){console.log('\n'+r.id+' | '+r.title+' | PRIMARY '+JSON.stringify({raw:r.primary.raw,rank:r.primary.rank,outcome:r.primary.outcome,unparsed:r.primary.proposal.unparsed}));for(const c of r.secondaries)console.log(' SECONDARY '+JSON.stringify({index:c.index,raw:c.raw,rank:c.rank,quality:c.quality,outcome:c.outcome,entries:c.proposal.entries,unparsed:c.proposal.unparsed,relation:c.relation,retained:c.retainedSecondary}));}
