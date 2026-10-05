import {object,text,strings} from './validation.js';
import {validateEnrichment} from './metadata-validation.js';
import {validateDescriptionBlocks} from './kindle-manifest.js';

const reference=value=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value??''))throw Error('Invalid contents observation reference.');return value;};
const rawText=(value,max)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))throw Error('Invalid bounded source text.');return value;};

// Historical source is immutable evidence, not a manifest to rerank whenever
// the current parser changes. Keep blocks and original selection coordinates;
// derived ranks/candidate counts can be reconstructed offline when needed.
export function contentsObservation(item,saved) {
  if(!saved)return null;
  const {manifest,...fields}=saved;
  const selected=manifest?.candidates?.[manifest.selected];
  return validateContentsObservation({...fields,titleContext:item.title,seriesContext:item.metadata?.series??[],
    ...(manifest?.descriptionMayBeIncomplete!==undefined?{descriptionMayBeIncomplete:Boolean(fields.descriptionMayBeIncomplete||manifest.descriptionMayBeIncomplete)}:{}),
    ...(manifest?{evidence:{blocks:manifest.blocks,...(selected?{selected:{block:selected.block,start:selected.start,end:selected.end,raw:selected.raw,parserInput:selected.parserInput,binding:selected.binding}}:{})}}:{})});
}

export function validateContentsObservation(value) {
  object(value,'Contents source observation');
  const {manifest,evidence,statement,...fields}=value;
  const result={...validateEnrichment('kindleProductComicContents',fields),statement:rawText(statement??'',10000),
    titleContext:text(value.titleContext,500,'Observation title'),seriesContext:strings(value.seriesContext,50,500,'Observation series')};
  if(value.sourceUrl&&value.sourceUrl!==result.sourceUrl||result.sourceUrl&&!/^https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]+$/u.test(result.sourceUrl))throw Error('Invalid observation product URL.');
  if(evidence!==undefined){
    object(evidence,'Observation evidence');const blocks=validateDescriptionBlocks(evidence.blocks);result.evidence={blocks};
    if(evidence.selected!==undefined){
      const s=evidence.selected;object(s,'Observation selection');
      if(!Number.isInteger(s.block)||!blocks[s.block]||!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end<=s.start||s.end>blocks[s.block].text.length)throw Error('Invalid observation source coordinates.');
      const raw=rawText(s.raw,10000);
      if(!raw||!blocks[s.block].text.slice(s.start,s.end).includes(raw))throw Error('Observation selection is not source-backed.');
      result.evidence.selected={block:s.block,start:s.start,end:s.end,raw,parserInput:rawText(s.parserInput??'',10000),binding:text(s.binding,100,'Observation binding')};
    }
  }
  return result;
}

export function validateKindleContentsObservations(value,records=[]) {
  object(value,'Kindle contents observations');if(Object.keys(value).length>50000)throw Error('Too many contents observation records.');
  const owners=new Map(records.map(item=>[item.recordRef,item]));
  return Object.fromEntries(Object.entries(value).map(([ref,entry])=>{
    reference(ref);object(entry,'Contents observation record');
    const providerItemId=text(entry.providerItemId,550,'Observation provider item');
    if(!/^kindle:[A-Z0-9]+$/u.test(providerItemId))throw Error('Invalid observation provider item.');
    const owner=owners.get(ref);
    if(owner&&(owner.provider!=='kindle'||owner.id!==providerItemId))throw Error('Contents history belongs to another provider record.');
    return [ref,{providerItemId,baseline:entry.baseline===null?null:validateContentsObservation(entry.baseline),
      ...(entry.latestAttempt?{latestAttempt:validateContentsObservation(entry.latestAttempt)}:{}),
      ...(entry.undoRef?{undoRef:reference(entry.undoRef)}:{})}];
  }));
}
