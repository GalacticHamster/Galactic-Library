import {profileRef} from '../lib/provider-profiles.js';
import { normalizeProviderItem } from '../lib/models.js';
import { object, strings, count, url, text } from '../lib/validation.js';

/** Only the minimum state needed to resume this tab's Fandango scan. */
export function validateFandangoState(value) {
  object(value,'Fandango import state');
  const scanContext=value.scanContext?{...(value.scanContext.profileId?{profileId:profileRef(value.scanContext.profileId)}:{}),profileLabel:text(value.scanContext.profileLabel,100,'Profile label'),confirmed:value.scanContext.confirmed===true,switchProfile:value.scanContext.switchProfile===true,mode:value.scanContext.mode==='incremental'?'incremental':'full',scanToken:/^[a-f0-9-]{36}$/u.test(value.scanContext.scanToken??'')?value.scanContext.scanToken:null}:undefined;
  if(value.phase==='start'){
    if(!['full','incremental'].includes(value.mode))throw new Error('Invalid Fandango scan mode.');
    return {phase:'start',mode:value.mode,scanContext};
  }
  if(!['movie','tv'].includes(value.phase)||typeof value.fullRescan!=='boolean')throw new Error('Invalid Fandango scan phase.');
  object(value.expected,'Fandango counts');object(value.urls,'Fandango section URLs');
  const expected=Object.fromEntries(['movies','tv'].map(key=>[key,value.expected[key]===null?null:count(value.expected[key],key,50000)]));
  const urls=Object.fromEntries(['movie','tv'].map(key=>{
    const page=url(value.urls[key],{hosts:['athome.fandango.com']});
    if(!page||new URL(page).origin!=='https://athome.fandango.com')throw new Error('Invalid Fandango section URL.');
    return [key,page];
  }));
  if(!Array.isArray(value.items)||value.items.length>50000)throw new Error('Invalid Fandango scan items.');
  const items=value.items.map(entry=>{
    const item=normalizeProviderItem({...entry,provider:'fandango-at-home',recordRef:undefined,observedAt:null},undefined,{allowEnrichment:false});
    if(!['movie','tv'].includes(item.mediaType))throw new Error('Invalid Fandango media type.');
    return {providerItemId:item.providerItemId,title:item.title,mediaType:item.mediaType,ownership:item.ownership,metadata:item.metadata,platform:item.platform,acquiredAt:item.acquiredAt};
  });
  return {phase:value.phase,fullRescan:value.fullRescan,expected,urls,items,knownItemIds:strings(value.knownItemIds,50000,500,'Known Fandango IDs'),scanContext};
}
