import {performAction} from './operation-feedback.js';
import {labeledControl,presentAction} from './form-presentation.js';
import {providerLabel,accessLabel,formatDate} from './formatters.js';
import {parsePurchaseEvidence} from '../lib/ownership-review.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {accountLabel} from './item-presentation.js';
import {OWNERSHIP_STATES} from '../lib/constants.js';
import {receiptReviewCounts} from './review-status.js';

const node=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const input=(label,type='text')=>{const field=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')field.type=type;field.setAttribute('aria-label',label);return field;};
const button=(title,run)=>{const result=node('button',title);result.type='button';result.addEventListener('click',run);return presentAction(result);};

export function createOwnershipReviewTools(records,database,actions){
  const root=node('details');root.className='ownership-review-tools';root.append(node('summary','Confirm ownership with dated evidence'));let ready=false;
  root.addEventListener('toggle',()=>{
    if(!root.open||ready)return;ready=true;
    root.append(node('p','Record a purchase, temporary access, return or refund with its evidence date. Returned, revoked and expired books stay in your library but do not count as owned. This keeps the provider observation intact. Reseller key status still cannot establish destination activation.'));
    for(const record of records){
      const prior=database.ownershipReviews[record.recordRef],section=node('div'),effective=effectiveOwnershipRecord(record,database);section.dataset.ownershipRecord=record.recordRef;section.append(node('strong',`${record.title} — ${accountLabel(record,database)}`),node('p',`Provider reports: ${accessLabel(record.ownership)}; shown as: ${accessLabel(effective.ownership)}${effective.ownershipOverride?' — your ownership preference':''}${prior?`; confirmed ${formatDate(prior.confirmedAt)}`:''}.`));
      const ownership=node('select');ownership.setAttribute('aria-label','Confirmed ownership');for(const state of OWNERSHIP_STATES)ownership.append(Object.assign(node('option',accessLabel(state)),{value:state}));ownership.value=prior?.ownership??(['returned','revoked','expired'].includes(effective.ownership)?effective.ownership:'owned');
      const evidence=input('Ownership evidence','textarea');evidence.maxLength=2000;evidence.placeholder='Receipt, order history or another checked source';evidence.value=prior?.note??'';
      const date=input('Ownership evidence date','date');date.value=(prior?.evidenceDate??new Date().toISOString()).slice(0,10);
      const source=input('Ownership evidence URL','url');source.placeholder='Optional source URL';source.value=prior?.sourceUrl??'';
      const expiry=input('Temporary access expiry','datetime-local');expiry.value=prior?.expiresAt?new Date(Date.parse(prior.expiresAt)-new Date(prior.expiresAt).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
      const updateExpiry=()=>{expiry.disabled=['returned','revoked','expired'].includes(ownership.value);if(expiry.disabled)expiry.value='';};ownership.addEventListener('change',updateExpiry);updateExpiry();
      const label=node('label'),confirm=input('Confirm checked ownership evidence','checkbox');label.append(confirm,' I checked this evidence for this record and account.');
      const status=node('p');status.setAttribute('role','status');
      const save=button('Save ownership confirmation',async()=>{if(!confirm.checked){status.textContent='Check the evidence confirmation first.';return;}save.disabled=true;try{await performAction({status,name:'Saving ownership confirmation...',task:()=>actions.save(record.recordRef,{ownership:ownership.value,note:evidence.value,evidenceDate:date.value,sourceUrl:source.value,expiresAt:expiry.value?new Date(expiry.value).toISOString():null},prior?.reviewRef??null)});actions.refresh();}catch(error){status.textContent=error.message;save.disabled=false;}});
      section.append(labeledControl('Confirmed access',ownership),labeledControl('Evidence you checked',evidence),labeledControl('Evidence date',date),labeledControl('Evidence URL (optional)',source),labeledControl('Temporary access expiry (blank for permanent ownership)',expiry),label,save,status);
      if(prior)section.append(button('Undo ownership confirmation',async()=>{try{await performAction({status,name:'Removing ownership confirmation...',task:()=>actions.remove(record.recordRef,prior.reviewRef)});actions.refresh();}catch(error){status.textContent=error.message;}}));root.append(section);
    }
  });return root;
}

export function createPurchaseEvidenceWorkbench(database,actions){
  const counts=receiptReviewCounts(database);
  const records=new Map(Object.values(database.providerItems).map(record=>[record.recordRef,record]));
  const root=node('details');root.id='purchase-evidence-workbench';root.className='tool-card';root.append(node('summary',`Receipt files — ${counts.attention} ready to match · ${counts.waiting} waiting for an account copy`));let ready=false;
  root.addEventListener('toggle',()=>{
    if(!root.open||ready)return;ready=true;
    root.append(node('p','Import a local CSV/JSON export with title, purchase date and optional ASIN/ISBN/catalog ID. Choose Kindle for Comixology receipts or Audible for audiobooks. Customer, payment and redemption fields are discarded. Every candidate needs review. Unmatched receipts stay pending; sync the relevant provider and refresh candidates.'));
    const provider=node('select');provider.setAttribute('aria-label','Receipt provider');for(const value of ['kindle','audible','humble','fanatical','kobo'])provider.append(Object.assign(node('option',value==='kindle'?'Kindle / Comixology':providerLabel(value)),{value}));
    const source=input('Purchase evidence source label');source.maxLength=100;source.value='Local purchase history';
    const file=input('Local purchase history file','file');file.accept='.json,.csv,application/json,text/csv';const status=node('p');status.setAttribute('role','status');
    file.addEventListener('change',async()=>{const selected=file.files?.[0];if(!selected)return;file.disabled=true;try{if(selected.size>5*1024*1024)throw new Error('Choose a file under 5 MB.');await performAction({status,name:'Reading and importing receipt evidence...',task:async()=>actions.import(parsePurchaseEvidence(await selected.text(),{provider:provider.value,sourceLabel:source.value}))});actions.refresh();}catch(error){status.textContent=error.message;file.disabled=false;}});
    root.append(labeledControl('Store / provider',provider),labeledControl('Source label',source),labeledControl('Purchase history file',file),button('Refresh receipt candidates',async()=>{try{await performAction({status,name:'Refreshing receipt candidates...',task:()=>actions.retry()});actions.refresh();}catch(error){status.textContent=error.message;}}),status);
    const filter=input('Filter receipt titles','search'),state=node('select');state.setAttribute('aria-label','Receipt status');for(const [value,label]of [['all','All saved receipts'],['ready','Ready to match'],['waiting','Waiting for an account copy']])state.append(Object.assign(node('option',label),{value}));root.append(labeledControl('Find a receipt',filter),labeledControl('Receipt status',state));const list=node('ol');list.className='review-items';root.append(list);let page=0;
    const paging=node('p'),previous=button('Previous receipt page',()=>{page--;render();}),next=button('Next receipt page',()=>{page++;render();});paging.append(previous,next);root.append(paging);
    function render(){
      const entries=Object.entries(database.ownershipProposals).filter(([,proposal])=>{const ready=proposal.recordRefs.some(ref=>records.get(ref)?.profileId===proposal.profileId&&records.has(ref));return (state.value==='all'||(state.value==='ready'?ready:!ready))&&proposal.evidence.title.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase());});page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(entries.length/50)-1)));previous.disabled=page===0;next.disabled=(page+1)*50>=entries.length;list.replaceChildren();
      if(!entries.length)list.append(node('li',filter.value?'No saved receipts match this title.':'No saved receipt suggestions. Import a file only if you want to document a purchase.'));
      for(const [id,proposal]of entries.slice(page*50,(page+1)*50)){
        const entry=node('li'),evidence=proposal.evidence;entry.append(node('strong',evidence.title),node('p',`${providerLabel(evidence.provider)} · ${database.providerProfiles?.[proposal.profileId]?.nickname||proposal.profileLabel||'Account not assigned'} · ${formatDate(evidence.acquiredAt)} · ${evidence.asin||evidence.isbn||evidence.providerItemId||'title-only evidence'}`));
        const current=Object.values(database.providerItems).filter(item=>proposal.recordRefs.includes(item.recordRef)&&item.profileId===proposal.profileId);
        if(current.length){
          const choice=node('select');choice.setAttribute('aria-label','Receipt library candidate');choice.append(Object.assign(node('option','Choose the matching account copy'),{value:''}));for(const item of current)choice.append(Object.assign(node('option',`${item.title} — ${accountLabel(item,database)}`),{value:item.recordRef}));
          const label=node('label'),confirm=input('Confirm receipt matches record','checkbox');label.append(confirm,' This receipt proves purchase of this edition in this account.');
          entry.append(labeledControl('Matching account copy',choice),label,button('Confirm receipt ownership',async()=>{try{const selected=current.find(item=>item.recordRef===choice.value);if(!selected||!confirm.checked)throw new Error('Choose and confirm the matching edition.');await performAction({status,name:'Saving receipt confirmation...',task:()=>actions.apply(id,selected.recordRef,true,database.ownershipReviews[selected.recordRef]?.reviewRef??null)});actions.refresh();}catch(error){status.textContent=error.message;}}));
        }else entry.append(node('p','No matching copy is available in this saved account, or the receipt has no assigned account. Check the selected provider account, update it if needed, then refresh receipt suggestions. Evidence without an account stays pending; a title match alone cannot confirm it.'));
        entry.append(button('Dismiss receipt proposal',async()=>{try{await performAction({status,name:'Dismissing receipt proposal...',task:()=>actions.dismiss(id)});actions.refresh();}catch(error){status.textContent=error.message;}}));list.append(entry);
      }
    }
    filter.addEventListener('input',()=>{page=0;render();});state.addEventListener('change',()=>{page=0;render();});render();
  });return root;
}
