import {createStorageWriter} from '../src/background/storage-writer.js';
import {activeObservationEnvelope,OBSERVATION_REGISTRATION} from '../src/lib/observation-transactions.js';
import {OBSERVATION_KEY,OBSERVATION_HEAD_KEY} from '../src/lib/observation-overlays.js';
import {providerCheckDigest} from '../src/lib/provider-scan-checks.js';
import {mountLibraryRow,compactAccessStatus} from '../src/ui/library-layout.js';
import {accessLabel} from '../src/ui/item-presentation.js';
import {UI_PREFERENCES_KEY} from '../src/lib/ui-preferences.js';
import {checkCompactProviderLogos} from './compact-provider-logos-fixture.js';

const checks=[],values=JSON.parse(sessionStorage.getItem('compact-fixture')||'{}'),listeners=[];
const assert=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
const wait=async(test,message)=>{for(let n=0;n<300;n++){if(test())return;await new Promise(r=>setTimeout(r,20));}throw Error(message);};
const change=(node,value,event='change')=>{node.value=String(value);node.dispatchEvent(new Event(event,{bubbles:true}));};
const click=(root,label)=>{const button=[...root.querySelectorAll('button')].find(b=>b.textContent===label);if(!button)throw Error('Missing '+label);button.click();};
const area={get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates)),remove:async keys=>{for(const k of [keys].flat())delete values[k];}};
let writer=createStorageWriter(area);
globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener(){}},sendMessage:async message=>{
 if(message.type!=='LIBRARY_STORAGE_OPERATION')return {ok:false};
 try{return {ok:true,result:await writer.execute(message.operation,message.args)};}catch(error){return {ok:false,error:error.message};}
}},storage:{onChanged:{addListener:fn=>listeners.push(fn)}},tabs:{create:async()=>{}}};
const open=row=>{const details=row.querySelector('.library-compact-entry');details.open=true;details.dispatchEvent(new Event('toggle'));};
const rows=()=>[...document.querySelectorAll('#library-items > li')];
const find=title=>rows().find(row=>row.querySelector('.library-compact-title')?.textContent===title);
try{
 if(!sessionStorage.getItem('compact-fixture'))await checkCompactProviderLogos(assert);
 for(const [states,expected,label] of [
  [['owned','unknown'],'owned','Owned'],[['owned','subscription'],'owned','Owned'],
  [['subscription','unknown'],'subscription','Subscription'],[['unknown'],'unknown','Ownership unconfirmed'],
  [['returned','borrowed'],'borrowed','Borrowed'],[['expired','revoked'],'revoked','Access revoked'],
  [['claimed'],'owned','Owned']
 ]){
  const records=states.map((ownership,n)=>({record:{provider:n?'kobo':'humble',ownership,metadata:{},recordRef:'compact-'+n}}));
  const before=JSON.stringify(records),host=document.createElement('li');document.body.append(host);
  mountLibraryRow(host,{canonical:{title:'Mixed sources',mediaType:'book'},records,qualifying:records.slice(-1)}, {},{layout:'compact',onToggle(){}},body=>{
   for(const {record} of records){const p=document.createElement('p');p.textContent=record.provider+': '+accessLabel(record.ownership);body.append(p);}
  });
  const summary=host.querySelector('summary'),badge=summary.querySelectorAll('.library-compact-access');
  assert(badge.length===1&&badge[0].dataset.access===expected&&badge[0].textContent===label,states.join(' + ')+' has one effective compact status independent of filtered sources');
  assert(summary.querySelectorAll('.library-compact-provider').length===new Set(records.map(r=>r.record.provider)).size,'Every provider badge remains visible for '+states.join(' + '));
  const collapsed=getComputedStyle(summary,'::before');
  assert(collapsed.content==='\"\"'&&parseFloat(collapsed.borderRightWidth)>0,'Disclosure is a drawn chevron, not a question-mark glyph');
  const transform=collapsed.transform;open(host);
  assert(getComputedStyle(summary,'::before').transform!==transform,'Expanded disclosure chevron changes direction');
  assert(records.every(({record})=>host.querySelector('.library-compact-body').textContent.includes(record.provider+': '+accessLabel(record.ownership))),'Expansion preserves each individual provider access state');
  assert(JSON.stringify(records)===before,'Compact aggregation does not mutate source records');host.remove();
 }
 assert(compactAccessStatus([{record:{provider:'humble',ownership:'owned',recordRef:'corrected'}}],{ownershipReviews:{corrected:{source:'user-correction',ownership:'returned'}}})==='returned','Compact summary respects effective ownership corrections');
 if(!sessionStorage.getItem('compact-fixture')){
  await writer.mergeProviderItems('kindle',[
   {providerItemId:'a',title:'A Owned book',mediaType:'book',ownership:'owned',metadata:{authors:['Synthetic Author']}},
   {providerItemId:'b',title:'B Subscription book',mediaType:'book',ownership:'subscription'},
   {providerItemId:'c',title:'C Unknown book',mediaType:'book',ownership:'unknown'},
   {providerItemId:'justice',title:'Justice League Dark (2018) Vol. 1: The Last Age of Magic',mediaType:'book',ownership:'owned'},
   ...Array.from({length:60},(_,n)=>({providerItemId:'fixture-'+n,title:'Fixture Book '+String(n).padStart(2,'0'),mediaType:'book',ownership:'owned'}))
  ]);
  await writer.mergeProviderItems('steam',[{providerItemId:'123',title:'Z Game',mediaType:'game',ownership:'owned'}]);
  const db=await writer.getDatabase(),target=Object.values(db.providerItems).find(r=>r.providerItemId==='justice');
  await writer.saveEnrichmentReview({source:'openLibrary',recordRefs:[target.recordRef],status:'no-results',title:target.title,reason:'No matching work was found.',candidates:[]});
 }
 await import('../src/ui/options.js');
 await wait(()=>document.querySelector('#library-load-status').hidden&&rows().length,'Library did not load');
 const layout=document.querySelector('#library-layout');
 if(sessionStorage.getItem('compact-fixture')){
  const expected=sessionStorage.getItem('layout-reload-stage')||'compact';
  assert(layout.value===expected,expected+' preference survives a real document reload');
  assert(rows().length>0&&rows().length<=20&&rows().every(row=>expected==='compact'?row.querySelector('.library-compact-entry'):row.querySelector('.library-result-summary')&&!row.querySelector('.library-compact-entry')),'Reload keeps the selected layout bounded and honors existing record navigation');
  assert(!document.querySelector('#library-alerts').textContent.includes('lookup failure'),'Dismissed failure indicator stays gone after reload');
  if(expected==='compact'){
   change(layout,'detailed');await wait(()=>values[UI_PREFERENCES_KEY]?.libraryLayout==='detailed','Detailed preference did not persist');
   sessionStorage.setItem('compact-fixture',JSON.stringify(values));sessionStorage.setItem('compact-checks',JSON.stringify([...JSON.parse(sessionStorage.getItem('compact-checks')),...checks]));sessionStorage.setItem('layout-reload-stage','detailed');location.reload();
  }else await fetch('/test-result',{method:'POST',body:JSON.stringify({checks:[...JSON.parse(sessionStorage.getItem('compact-checks')), ...checks]})});
 }else{
  assert(layout.value==='compact'&&rows().every(row=>row.querySelector('.library-compact-entry')),'Fresh Library defaults to Compact');
  change(layout,'detailed');
  assert(document.querySelector('#library-items .library-result-summary'),'Detailed keeps the existing card view');
  assert(document.querySelector('#library-items .library-result-summary .library-item-providers')?.textContent.includes('Kindle')&&!document.querySelector('#library-items .provider-logo'),'Detailed keeps provider names instead of logos');
  const detailedHeight=rows()[0].getBoundingClientRect().height;
  change(layout,'compact');
  assert(rows().length===50&&rows().every(row=>row.querySelector('.library-compact-entry')),'Compact preserves page size and renders expandable rows');
  assert(rows()[0].getBoundingClientRect().height<detailedHeight,'Collapsed compact rows are visibly shorter than Detailed cards');
  assert(!document.querySelector('#library-items .item-details'),'Collapsed rows do not build full details or actions');
  assert(find('A Owned book').textContent.includes('Owned'),'Owned stays explicit in compact rows');
  assert(find('B Subscription book').querySelector('.library-compact-access').textContent==='Subscription','Subscription access stays distinct');
  assert(find('C Unknown book').textContent.includes('Ownership unconfirmed'),'Unconfirmed ownership stays distinct');
  const owned=find('A Owned book');open(owned);
  assert(owned.textContent.includes('Synthetic Author')&&owned.querySelector('.item-details'),'Expansion retains metadata and Details');
  assert([...owned.querySelectorAll('button')].some(b=>b.textContent==='Change access'),'Expansion retains access corrections');
  assert(owned.querySelector('input[data-select-access]'),'Expansion retains selection');
  const check=owned.querySelector('input[data-select-access]');check.checked=true;check.dispatchEvent(new Event('change'));
  assert(!document.querySelector('[aria-label="Selected access changes"]').hidden,'Compact selection exposes bulk actions');
  click(document.querySelector('[aria-label="Selected access changes"]'),'Change access for selected');
  await wait(()=>document.querySelector('.quick-access-editor[open]'),'Access editor did not open');click(document.querySelector('.quick-access-editor'),'Cancel');
  owned.querySelector('.library-compact-entry').open=false;owned.querySelector('.library-compact-entry').dispatchEvent(new Event('toggle'));
  assert(!owned.querySelector('.library-compact-entry').open,'Expanded rows collapse using their native disclosure');
  change(layout,'detailed');assert(document.querySelector('input[data-select-access]').checked,'Selection persists when switching to Detailed');
  change(layout,'compact');
  click(document.querySelector('#library-alerts'),'1 lookup failure / no results');
  await wait(()=>document.querySelector('#enrichment-workbench [aria-label="Select book information review"]'),'Failed lookup did not appear');
  click(document.querySelector('#enrichment-workbench'),'Review library item');
  await wait(()=>document.querySelector('#library-items .library-compact-entry[open] .item-details[open]'),'Contextual review link did not expand the compact item');
  assert(true,'Existing record links open the compact row and its full Details');
  click(document.querySelector('#library-alerts'),'1 lookup failure / no results');
  // Keep the displayed review, then simulate a worker restarting after idle.
  const sources=JSON.stringify(values.galacticLibraryDatabase.providerItems);
  values[OBSERVATION_KEY]=activeObservationEnvelope(await providerCheckDigest(values.galacticLibraryDatabase));values[OBSERVATION_HEAD_KEY]=OBSERVATION_REGISTRATION;
  writer=createStorageWriter(area);
  const failure=document.querySelector('#enrichment-workbench [aria-label="Select book information review"]');failure.checked=true;failure.dispatchEvent(new Event('change'));
  click(document.querySelector('#enrichment-workbench'),'Dismiss selected reviews');
  await wait(()=>!document.querySelector('#library-alerts').textContent.includes('lookup failure'),'Failure alert did not disappear');
  assert(Object.keys(values.galacticLibraryDatabase.enrichmentReviews).length===0,'Cold-worker UI dismissal commits the selected lookup');
  assert(JSON.stringify(values.galacticLibraryDatabase.providerItems)===sources,'Lookup dismissal preserves provider source records');
  click(document.querySelector('#workspace-navigation'),'Library');
  document.querySelector('#clear-filters').click();
  const unknown=find('C Unknown book');open(unknown);click(unknown,'Change access');
  change(document.querySelector('[aria-label="Access status"]'),'borrowed');click(document.querySelector('.quick-access-editor'),'Save');
  await wait(()=>find('C Unknown book')?.querySelector('[data-access="borrowed"]'),'Access correction did not update compact badge');
  assert(true,'Compact actions immediately refresh effective access');
  change(document.querySelector('#search'),'Fixture','input');
  change(document.querySelector('#provider-filter'),'kindle');change(document.querySelector('#library-sort'),'title-desc');
  change(document.querySelector('#library-items-per-page'),20);document.querySelector('#library-next').click();
  const page=document.querySelector('#library-page-status').textContent;
  change(layout,'detailed');change(layout,'compact');
  assert(document.querySelector('#library-page-status').textContent===page&&rows().length===20,'View changes retain pagination');
  assert(document.querySelector('#search').value==='Fixture'&&document.querySelector('#provider-filter').value==='kindle'&&document.querySelector('#library-sort').value==='title-desc','View changes retain search, provider and sorting');
  for(const mode of ['detailed','compact']){
   change(layout,mode);assert(rows().length===20&&rows().every(row=>row.querySelector('strong').textContent.startsWith('Fixture Book')),'Filtered second page remains correct in '+mode);
   document.querySelector('#library-next').click();assert(rows().length===20&&rows().every(row=>row.querySelector('strong').textContent.startsWith('Fixture Book')),'Filtered third page remains bounded in '+mode);
   document.querySelector('#library-previous').click();assert(document.querySelector('#library-page-status').textContent===page,'Returning preserves filtered page in '+mode);
  }
  await wait(()=>values[UI_PREFERENCES_KEY]?.libraryLayout==='compact'&&values[UI_PREFERENCES_KEY]?.browse?.search==='Fixture','Final layout and search preferences did not persist');
  sessionStorage.setItem('compact-fixture',JSON.stringify(values));sessionStorage.setItem('compact-checks',JSON.stringify(checks));location.reload();
 }
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
