import { PROVIDERS } from './constants.js';
import { object, text, strings, date, count } from './validation.js';

export function validateProviderStates(value = {}) {
  object(value,'Provider states');
  return Object.fromEntries(PROVIDERS.filter(provider=>Object.hasOwn(value,provider)).map(provider=>{
    const state=object(value[provider],'Provider state');const result={};
    for(const key of ['connected','itemCount','addOnCount','audiobookCount','bookCount','movieCount','tvCount','linkedAddOnCount','recordCount','lastSync','lastError','source','syncMode','quickSyncAt','fullSyncAt','accountLabel','profileLabel']){
      if(!Object.hasOwn(state,key))continue;
      if(key==='connected'){if(typeof state[key]!=='boolean')throw new Error('Provider connected must be boolean.');result[key]=state[key];}
      else if(key.endsWith('Count'))result[key]=count(state[key],key);
      else if(['lastSync','quickSyncAt','fullSyncAt'].includes(key))result[key]=date(state[key],key);
      else result[key]=state[key]===null?null:text(state[key],key==='lastError'?600:500,key);
    }
    if(result.syncMode && !['full','incremental'].includes(result.syncMode))throw new Error('Invalid provider scan mode.');
    if(state.syncState!==undefined){
      object(state.syncState,'Provider sync state');result.syncState={};
      if(provider==='humble')result.syncState.knownPurchaseIds=strings(state.syncState.knownPurchaseIds,50000,256,'Purchase IDs');
      if(provider==='fanatical'){
        const fingerprints=strings(state.syncState.knownOrderFingerprints,50000,64,'Order fingerprints');
        if(fingerprints.some(entry=>!/^[a-f0-9]{64}$/iu.test(entry)))throw new Error('Invalid order fingerprint.');
        result.syncState.knownOrderFingerprints=fingerprints.map(entry=>entry.toLowerCase());
      }
    }
    if(state.snapshotValidation!==undefined){
      const snapshot=object(state.snapshotValidation,'Snapshot validation');
      if(snapshot.version!==1||snapshot.provider!==provider||snapshot.complete!==true||!Array.isArray(snapshot.scopes)||!snapshot.scopes.length||snapshot.scopes.length>100)throw new Error('Invalid saved snapshot.');
      result.snapshotValidation={version:1,provider,complete:true,itemCount:count(snapshot.itemCount),validatedAt:date(snapshot.validatedAt),scopes:snapshot.scopes.map(entry=>{
        object(entry,'Snapshot section');
        if(entry.complete!==true||entry.limitReached!==false||!['reported-count','pagination-end','scroll-end','index-complete'].includes(entry.end))throw new Error('Invalid saved snapshot section.');
        const section={id:text(entry.id,80,'Snapshot section ID'),readCount:count(entry.readCount),expectedCount:entry.expectedCount===null?null:count(entry.expectedCount),end:entry.end,pagesRead:count(entry.pagesRead),complete:true,limitReached:false,...(entry.duplicateCount!==undefined?{duplicateCount:count(entry.duplicateCount)}:{})};
        if(!section.id || !section.pagesRead || (section.expectedCount!==null && section.expectedCount!==section.readCount) || (section.expectedCount===null && (!section.readCount || section.end==='reported-count')) || (section.duplicateCount??0)>section.readCount)throw new Error('Inconsistent saved snapshot section.');
        return section;
      })};
      const sections=result.snapshotValidation.scopes.map(section=>section.id);
      if(new Set(sections).size!==sections.length || (provider==='kindle'?['books','personal-documents']:provider==='fandango-at-home'?['movie','tv']:[]).some(id=>!sections.includes(id)))throw new Error('Missing or duplicate saved snapshot sections.');
    }
    return [provider,result];
  }));
}
