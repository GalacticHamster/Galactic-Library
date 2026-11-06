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
  let sections;
  if(value.sections!==undefined){
    if(!Array.isArray(value.sections)||value.sections.length!==1||value.phase!=='tv')throw Error('Invalid Fandango section progress.');
    sections=value.sections.map(section=>{
      if(section?.id!=='movie'||typeof section.incomplete!=='boolean')throw Error('Invalid Fandango section progress.');
      if(section.limitReached!==undefined&&(typeof section.limitReached!=='boolean'||section.limitReached&&(!section.incomplete||section.passes!==300)))throw Error('Invalid Fandango scan limit.');
      if(section.unavailable!==undefined&&section.unavailable!==true)throw Error('Invalid Fandango unavailable section.');
      return {id:section.id,incomplete:section.incomplete,failedItems:count(section.failedItems,'Unreadable Fandango cards',50000),passes:count(section.passes,'Fandango passes',300),...(section.limitReached?{limitReached:true}:{}),...(section.unavailable?{unavailable:true}:{})};
    });
    if(sections.some(section=>section.unavailable?!section.incomplete||section.passes!==0||section.failedItems!==0:section.passes<1))throw Error('Invalid Fandango section progress.');
  }
  const missingSections=strings(value.missingSections,2,5,'Unavailable Fandango sections');
  if(missingSections.some(id=>!['movie','tv'].includes(id))||missingSections.length>1)throw Error('Invalid unavailable Fandango sections.');
  return {phase:value.phase,fullRescan:value.fullRescan,expected,urls,items,knownItemIds:strings(value.knownItemIds,50000,500,'Known Fandango IDs'),scanContext,...(missingSections.length?{missingSections}:{}),...(sections?{sections}:{})};
}
