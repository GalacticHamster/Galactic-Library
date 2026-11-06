import {normalizeProviderItem} from './models.js';
import '../providers/kobo-ownership.js';
import '../providers/kobo.js';

// Read-only admission uses the same model and entitlement rules as persistence.
export function koboItemStatuses(items){
  if(!Array.isArray(items)||items.length>100)throw Error('Kobo validation needs a bounded page.');
  return items.map(item=>{try{return globalThis.GalacticKobo.validLibraryItem(item)&&globalThis.GalacticKobo.validLibraryItem(normalizeProviderItem({...item,provider:'kobo'},undefined,{allowEnrichment:false}));}catch{return false;}});
}
