import {object,text,strings,date} from './validation.js';
import {validateEnrichment} from './metadata-validation.js';

export const ENRICHMENT_KINDS=['openLibrary','googleBooks','googleBooksGenreHint','kindleProductComicContents','localMetadata'];
export function recordReference(value){const ref=text(value,36,'Record reference');if(!/^[a-f0-9-]{36}$/iu.test(ref))throw new Error('Invalid enrichment record reference.');return ref;}
export function validateEnrichmentHistory(value={}){
  object(value,'Enrichment history');if(Object.keys(value).length>100000)throw new Error('Too much enrichment history.');
  return Object.fromEntries(Object.entries(value).map(([id,entry])=>{
    recordReference(id);object(entry,'Enrichment change');if(!ENRICHMENT_KINDS.includes(entry.kind))throw new Error('Invalid enrichment history source.');
    return [id,{recordRef:recordReference(entry.recordRef),kind:entry.kind,selectionRef:recordReference(entry.selectionRef),previous:entry.previous===null?null:validateEnrichment(entry.kind,entry.previous),changedAt:date(entry.changedAt)}];
  }));
}
export function validateEnrichmentReviews(value={}){
  object(value,'Enrichment review queue');if(Object.keys(value).length>50000)throw new Error('Too many enrichment reviews.');
  return Object.fromEntries(Object.entries(value).map(([id,entry])=>{
    recordReference(id);object(entry,'Enrichment review');
    if(!['googleBooks','openLibrary','localMetadata'].includes(entry.source)||!['candidates','ambiguous','no-results','failed','conflict'].includes(entry.status))throw new Error('Invalid enrichment review outcome.');
    const recordRefs=strings(entry.recordRefs,50,36,'Review record references').map(recordReference);
    if(!recordRefs.length||!Array.isArray(entry.candidates)||entry.candidates.length>20)throw new Error('Invalid enrichment candidates.');
    return [id,{recordRefs,source:entry.source,status:entry.status,reason:text(entry.reason??'',600,'Review reason'),title:text(entry.title??'',500,'Review title'),checkedAt:date(entry.checkedAt),candidates:entry.candidates.map(candidate=>validateEnrichment(entry.source,candidate))}];
  }));
}
