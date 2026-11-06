import {normalizeProviderItem} from './models.js';

// Local preflight only. This never stores data or grants a scan receipt.
export function kindleItemStatuses(items) {
  if(!Array.isArray(items)||items.length>100)throw Error('Kindle validation needs a bounded page.');
  return items.map(item=>{try{normalizeProviderItem({...item,provider:'kindle'});return true;}catch{return false;}});
}
