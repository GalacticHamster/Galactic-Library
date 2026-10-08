import {createContentsReadOnly} from './contents-display.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {providerLabel,accountLabel,mediaLabel,accessLabel} from './item-presentation.js';
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const unique=values=>[...new Set(values.filter(Boolean))];
export function resultProviderSummary(values){
  const groups=new Map();for(const {record}of values){const accounts=groups.get(record.provider)??new Set();accounts.add(record.profileId??record.recordRef);groups.set(record.provider,accounts);}
  return [...groups].map(([provider,accounts])=>providerLabel(provider)+(accounts.size>1?` (${accounts.size} accounts)`:'')).join(' · ');
}
export function createLibraryResultSummary(row,database,{series:visitSeries,filtered=false,information='all'}={}){
  const root=text('div','');root.className='library-result-summary';
  const header=text('div','');header.className='library-item-header';header.append(text('strong',row.canonical.title),text('span',mediaLabel(row.canonical.mediaType)));root.append(header);
  const values=row.qualifying;
  const editions=unique(values.map(value=>value.identity.edition)),units=['book','audiobook'].includes(row.canonical.mediaType)?unique(values.map(value=>value.identity.unit?`${value.unitType||'Volume / issue'} ${value.identity.unit}`:'')):[];
  if(editions.length||units.length)root.append(Object.assign(text('p',[...units,...editions].join(' · ')),{className:'library-result-identity'}));
  const series=unique(values.flatMap(value=>value.series));
  if(series.length){const links=text('p','');links.className='library-result-series';for(const value of series.slice(0,3)){const link=text('button','Series: '+value);link.type='button';link.addEventListener('click',()=>visitSeries?.(value));links.append(link);}if(series.length>3)links.append(text('small',`+${series.length-3} series in Details`));root.append(links);}
  const creators=unique(values.flatMap(value=>value.identity.authors));if(creators.length)root.append(Object.assign(text('p','By '+creators.slice(0,3).join(', ')+(creators.length>3?` +${creators.length-3} in Details`:'')),{className:'library-result-creators'}));
  root.append(Object.assign(text('p',resultProviderSummary(row.records)),{className:'library-item-providers'}));
  if(row.canonical.mediaType==='book'){const ordered=[...values].sort((a,b)=>Boolean(database.contentReviews?.[b.record.id])-Boolean(database.contentReviews?.[a.record.id]));for(const value of ordered){const preview=createContentsReadOnly(value.record,database,{compact:true});if(preview){root.append(preview);if(values.length>1)root.append(text('small','Other copies: see account contents in Details.'));break;}}}
  if(filtered)root.append(Object.assign(text('p','Matching accounts: '+unique(values.map(value=>accountLabel(value.record,database))).join('; ')),{className:'library-result-scope'}));
  const exceptions=[];
  for(const value of values){const effective=effectiveOwnershipRecord(value.record,database);if(!['owned','claimed'].includes(effective.ownership))exceptions.push(accountLabel(value.record,database)+': '+accessLabel(effective.ownership));else if(effective.ownershipOverride)exceptions.push(accountLabel(value.record,database)+': ownership preference applied');}
  if(exceptions.length)root.append(Object.assign(text('p',exceptions.slice(0,3).join('; ')+(exceptions.length>3?` +${exceptions.length-3} access exceptions in Details`:'')),{className:'library-result-access'}));
  if(information==='missing')root.append(Object.assign(text('p','Book information is missing a creator or edition identifier. See Details.'),{className:'library-result-scope'}));
  if(information==='review')root.append(Object.assign(text('p','Saved suggestions or contents await review. See Details.'),{className:'library-result-scope'}));
  return root;
}
