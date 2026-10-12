import {manifestReviewProposal,selectManifest} from '../src/lib/kindle-manifest.js';
import {precisionRecord} from './contents-precision-context-fixture.js';

export function verifyNumberedWrapper(c,assert){
 const record=precisionRecord(c),saved=record.metadata.enrichment.kindleProductComicContents,before=JSON.stringify(saved);
 const p=manifestReviewProposal(saved,c.title),expected=c.expected.flatMap(({numbers,...entry})=>numbers.map(number=>({...entry,number})));
 const keys=entries=>entries.map(e=>JSON.stringify([e.series,e.run,e.unitType,e.number,e.language,e.completeness])).sort();
 assert(JSON.stringify(keys(p.entries))===JSON.stringify(keys(expected)),'Numbered wrapper entries differ: '+c.title);
 assert(JSON.stringify(p.unparsed)===JSON.stringify(c.unresolved),'Wrapper/named evidence lost: '+c.title);
 assert(p.outcome===c.outcome,'Wrapper review state differs: '+c.title);
 assert(JSON.stringify(saved)===before,'Parsing modified captured evidence');
 return {record,proposal:p};
}
export function verifyIndependentWrappers(assert){
 for(const text of ['Collects Alpha #1-3. Contains the adventures of a hero from Beta #4-8.','Collects Alpha #1-3; Contains the entire series Beta #4-8.']){
   const saved=selectManifest([{selector:'#description',text}], 'Collection'),p=manifestReviewProposal(saved,'Collection');
   assert(new Set(p.entries.map(e=>e.series)).size===1,'Independent claims were combined');
 }
}
