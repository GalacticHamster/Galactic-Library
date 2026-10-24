// Minimal synthetic My Collection rows. No account, provider session or real key.
import {createStorageWriter} from '../src/background/storage-writer.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const checks=[];
const assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
const codes=await Promise.all(['provider-snapshot','amazon-games','amazon-games-content'].map(async name=>(await fetch(`/src/providers/${name}.js`)).text()));
const nativeTimeout=setTimeout;
let frame;
async function setup(windows){
 frame?.remove();frame=document.createElement('iframe');frame.style.cssText='width:800px;height:500px';
 const loaded=new Promise(resolve=>frame.onload=resolve);
 frame.srcdoc='<main><div data-a-target="time-window-filter-dropdown"><p title="2026">2026</p></div><div id="rows"></div></main><aside><div data-a-target="accordion-header">Unrelated card</div><button>See 10 more</button></aside><div data-a-target="time-window-filter-flyout"></div>';
 document.body.append(frame);await loaded;
 const win=frame.contentWindow,doc=win.document;let pending=[],expansions=0,redemptions=0,selected=[];
 const render=id=>{
  selected.push(id);doc.querySelector('[data-a-target="time-window-filter-dropdown"] p').title=id==='past-3-months'?'Past 3 months':id;
  doc.querySelector('[data-a-target="time-window-filter-dropdown"] p').textContent=id;
  doc.querySelector('#rows').innerHTML='';pending=[];
  const rows=windows[id]??[];
  if(!rows.length)doc.querySelector('#rows').textContent='No games collected';
  for(const row of rows){
   const header=doc.createElement('section');header.dataset.aTarget='accordion-header';
   const button=doc.createElement('button');button.setAttribute('aria-controls',`${row.id}-body`);button.setAttribute('aria-expanded','false');button.textContent=row.actionButton?'Claim Code':'Details';
   const title=doc.createElement('h3');title.title=row.title??'Synthetic game';title.textContent=title.title;
   const label=doc.createElement('span');label.dataset.aTarget='claim-entry-list_label-text';label.textContent=row.label;
   const body=doc.createElement('pre');body.id=`${row.id}-body`;body.textContent=row.delayed?'Collected on\n2026-01-01':row.body;
   button.onclick=()=>{if(row.actionButton){redemptions++;return;}expansions++;button.setAttribute('aria-expanded','true');if(row.delayed)pending.push({left:2,body,text:row.body});};
   const redeem=doc.createElement('button');redeem.textContent='Claim Code';redeem.onclick=()=>{redemptions++;};body.append(doc.createTextNode('\n'),redeem);
   header.append(button,title,label,body);doc.querySelector('#rows').append(header);
  }
 };
 for(const id of Object.keys(windows)){
  const button=doc.createElement('button');button.dataset.type=id;button.textContent=id==='past-3-months'?'Past 3 months':id;button.onclick=()=>render(id);doc.querySelector('[data-a-target="time-window-filter-flyout"]').append(button);
 }
 render(Object.keys(windows)[0]);
 win.setTimeout=(callback,ms)=>nativeTimeout(()=>{if(ms===150)for(const p of pending)if(--p.left===0)p.body.textContent=p.text;callback();},0);
 win.scrollTo=()=>{};
 Object.defineProperty(doc.documentElement,'scrollHeight',{get:()=>500});Object.defineProperty(win,'innerHeight',{value:500});
 win.eval(codes[0]);win.eval(codes[1]);
 return {win,doc,api:win.GalacticAmazonGames,selected,redemptions:()=>redemptions,expansions:()=>expansions};
}
const direct={id:'direct-a',label:'Delivered',body:'Collected on\n2026-01-01\nSent to\nAmazon Games library',delayed:true};
const code={id:'code-a',label:'Claim Code',body:'Collected on\n2026-01-01\nInstructions\nRedeem through GOG\nSYNTHETIC_SECRET_DO_NOT_EXPORT'};
const external={id:'external-a',label:'Delivered',body:'Collected on\n2026-01-01\nSent to\nEpic Games Store library'};
const mystery={id:'unknown-a',label:'Unfamiliar route',body:'Collected on\n2026-01-01'};
const pending={id:'pending-a',label:'Not delivered',body:'Collected on\n2026-01-01\nSent to\nAmazon Games library'};
const unavailable={id:'destination-a',label:'Delivered',body:'Collected on\n2026-01-01'};
const offered={id:'offer-a',label:'Claim now',body:'Available to claim'};
try{
 const windows={'2026':[direct,code,external,mystery,pending,unavailable,offered],'2025':[{...direct,delayed:false},{...direct,id:'direct-b',delayed:false}],'past-3-months':[direct,code,external]};
 let page=await setup(windows),result=await page.api.fetchAmazonGames();
 assert(result.items.length===5&&result.items.filter(item=>item.ownership==='claimed').length===2,'Mixed full import retains direct deliveries and valid unconfirmed claims while excluding code and external-store entries');
 assert(result.diagnostics.productKeyClaims===1&&result.diagnostics.otherLibraryClaims===1,'Claim Code without Sent to and external Delivered rows are accounted for without a fatal unknown-delivery error');
 assert(result.items.filter(item=>item.ownership==='unknown').length===3&&!result.items.some(item=>item.providerItemId==='offer-a'),'Unknown routes, pending delivery and missing destinations do not become owned; unclaimed offers are excluded');
 assert(result.items.some(item=>item.providerItemId==='direct-b')&&result.diagnostics.crossWindowDuplicates===1,'Stable IDs deduplicate repeated observations across years without collapsing independent same-title claims');
 assert(page.redemptions()===0&&page.expansions()>0,'Only read-only accordions are expanded; Claim Code or redemption actions are never clicked');
 assert(!/SYNTHETIC_SECRET|GOG|Synthetic game|direct-a/.test(JSON.stringify(page.api.getDiagnostics())),'Sanitized diagnostics retain counters without titles, claim IDs, account details or redemption codes');
 const data={},area={get:async defaults=>structuredClone({...defaults,...data}),set:async patch=>Object.assign(data,structuredClone(patch))};let writer=createStorageWriter(area);
 const save=async value=>writer.replaceProviderItems('amazon-games',JSON.parse(JSON.stringify(value.items)),{},JSON.parse(JSON.stringify(value.snapshot)));
 await save(result);let db=await writer.getDatabase();const originals=Object.values(db.providerItems);
 assert(originals.length===5&&originals.filter(item=>item.ownership==='claimed').length===2&&originals.filter(item=>item.ownership==='unknown').length===3,'Persisted source records keep confirmed Amazon delivery separate from unconfirmed claim access');
 assert(!Object.values(db.providerItems).some(item=>item.provider==='gog'||item.provider==='epic')&&!JSON.stringify(db).includes('SYNTHETIC_SECRET'),'Import never invents downstream storefront ownership or saves secret code contents');
 result=await page.api.fetchAmazonGames();await save(result);db=await writer.getDatabase();
 assert(Object.values(db.providerItems).length===5&&originals.every(item=>db.providerItems[item.id]?.recordRef===item.recordRef),'An unchanged full repeat preserves every source identity with no duplicate records');
 const saved=Object.values(db.providerItems).find(item=>item.providerItemId==='direct-a');
 await writer.saveOwnershipCorrections([{recordRef:saved.recordRef,provider:saved.provider,profileId:saved.profileId,expectedReviewRef:null}],{ownership:'returned'});
 const sparse={...windows,'2026':[{...mystery,id:'direct-a'},code,external,mystery,pending,unavailable,offered],'2025':[{...direct,id:'direct-b',delayed:false}]};
 page=await setup(sparse);await save(await page.api.fetchAmazonGames());db=await writer.getDatabase();
 assert(db.providerItems[saved.id].ownership==='claimed'&&db.providerItems[saved.id].metadata.delivery.includes('Amazon Games library')&&effectiveOwnershipRecord(db.providerItems[saved.id],db).ownership==='returned','A later uncertain delivery preserves earlier direct evidence and authoritative manual corrections');
 await writer.restoreDatabase(parseBackup(createBackup(db)));writer=createStorageWriter(area);db=await writer.getDatabase();
 assert(effectiveOwnershipRecord(db.providerItems[saved.id],db).ownership==='returned','Delivery evidence and separate ownership corrections survive backup restore and writer reload');
 page=await setup(windows);const quick=await page.api.fetchAmazonGames(()=>{},true);
 assert(page.selected.slice(1).join(',')==='past-3-months'&&quick.snapshot===undefined&&quick.items.length===1&&quick.diagnostics.productKeyClaims===1,'Quick update uses only the recent window and handles code/external claims with the same semantics');
 await writer.mergeProviderItems('amazon-games',JSON.parse(JSON.stringify(quick.items)));assert(Object.keys((await writer.getDatabase()).providerItems).length===5,'Quick reconciliation retains the previously saved historical library');
 page=await setup({'2026':[{...direct,delayed:false},{id:'unsafe-code',label:'Claim Code',body:'',actionButton:true}]});
 const noRedemption=await page.api.fetchAmazonGames();
 assert(page.redemptions()===0&&noRedemption.items.length===1&&noRedemption.diagnostics.productKeyClaims===1,'Even a Claim Code action with aria-controls cannot be clicked as though it were an accordion');
 page=await setup({'2026':[{id:'broken',label:'Unknown',body:''}]});let error;
 try{await page.api.fetchAmazonGames();}catch(value){error=value;}
 assert(error&&/claim information/.test(error.message),'An unfamiliar label without collected or delivered evidence remains a safe failure, not guessed ownership');
 page=await setup({'2026':[{id:'broken',title:'',label:'Delivered',body:'Collected on\n2026-01-01'}]});error=null;
 try{await page.api.fetchAmazonGames();}catch(value){error=value;}
 assert(error&&/ID or title/.test(error.message),'Malformed identities still stop a full scan before saving');
 const before=JSON.stringify(await writer.getDatabase());let shadow,imports=0;
 const attach=page.win.Element.prototype.attachShadow;page.win.Element.prototype.attachShadow=function(options){shadow=attach.call(this,options);return shadow;};
 page.win.GalacticSync={send:async request=>{if(request.type==='GET_PROVIDER_SYNC_STATE')return {ok:true,hasFullBaseline:true,lastSuccessfulSyncAt:new Date().toISOString()};if(request.type==='IMPORT_PROVIDER_ITEMS'){imports++;throw Error('Invalid scan reached persistence');}},failed:async()=>{}};
 page.win.eval(codes[2].replace('if (!isCollectionPage','if (false'));
 assert(shadow.querySelector('[data-export-report]').hidden,'The normal importer has no permanent diagnostics panel or visible export control');
 shadow.querySelector('[data-mode="full"]').click();for(let n=0;n<500&&shadow.querySelector('.status').dataset.busy;n++)await new Promise(resolve=>nativeTimeout(resolve,5));
 assert(imports===0&&JSON.stringify(await writer.getDatabase())===before&&!shadow.querySelector('[data-export-report]').hidden,'Failed full import preserves stored records and offers a report without requiring another scan');
 let exported;page.win.URL.createObjectURL=blob=>{exported=blob;return 'blob:synthetic';};page.win.URL.revokeObjectURL=()=>{};page.win.HTMLAnchorElement.prototype.click=function(){};
 shadow.querySelector('[data-export-report]').click();
 assert(exported&&JSON.parse(await exported.text()).state==='failed'&&!/Synthetic|SYNTHETIC_SECRET|broken/.test(await exported.text()),'Failure export works through ordinary UI and contains only sanitized scan evidence');
 page=await setup(windows);const successAttach=page.win.Element.prototype.attachShadow;
 page.win.Element.prototype.attachShadow=function(options){shadow=successAttach.call(this,options);return shadow;};
 page.win.GalacticSync={send:async request=>{
  if(request.type==='GET_PROVIDER_SYNC_STATE')return {ok:true,hasFullBaseline:true,lastSuccessfulSyncAt:new Date().toISOString()};
  if(request.type==='IMPORT_PROVIDER_ITEMS'){imports++;const db=await writer.replaceProviderItems('amazon-games',JSON.parse(JSON.stringify(request.items)),{},JSON.parse(JSON.stringify(request.snapshot)));return {ok:true,gameCount:Object.values(db.providerItems).length};}
 },failed:async()=>{throw Error('A valid mixed import unexpectedly failed');}};
 page.win.eval(codes[2].replace('if (!isCollectionPage','if (false'));
 shadow.querySelector('[data-mode="full"]').click();for(let n=0;n<500&&shadow.querySelector('.status').dataset.busy;n++)await new Promise(resolve=>nativeTimeout(resolve,5));
 assert(imports===1&&shadow.querySelector('.status').textContent.includes('Full import complete. 5 Amazon Games entries saved.')&&shadow.querySelector('[data-export-report]').hidden,'A normal mixed-delivery Full import saves successfully and hides development reporting after success');
 assert(!/scan pass|loadMore|parser|reconciliation/.test(shadow.querySelector('.status').textContent),'Normal completion explains saved entries and excluded stores without internal parser or traversal counters');
 await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
finally{frame?.remove();}
