import {normalizeProviderItem} from './models.js';
import '../providers/audible.js';

// Read-only row admission; the writer still validates every complete model.
export function audibleItemStatuses(items){
  if(!Array.isArray(items)||items.length>100)throw Error('Audible validation needs a bounded item list.');
  return items.map(value=>{
    try{return globalThis.GalacticAudible.validLibraryItem(normalizeProviderItem({...value,provider:'audible',recordRef:undefined,observedAt:null},undefined,{allowEnrichment:false}));}
    catch{return false;}
  });
}
