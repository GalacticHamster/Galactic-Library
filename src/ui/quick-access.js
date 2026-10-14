import {OWNERSHIP_STATES} from '../lib/constants.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {accessLabel,accountLabel} from './formatters.js';

const node=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(text,run)=>{const b=node('button',text);b.type='button';b.addEventListener('click',run);return b;};
export const ownershipCorrectionTarget=(record,database)=>({recordRef:record.recordRef,provider:record.provider,profileId:record.profileId,expectedReviewRef:database.ownershipReviews?.[record.recordRef]?.reviewRef??null});

export function openQuickAccessEditor(records,database,{save,saved,selectedRefs=records.length===1?records.map(r=>r.recordRef):[]}={}){
  const dialog=node('dialog');dialog.className='account-dialog quick-access-editor';dialog.setAttribute('aria-label','Change access');
  const fieldset=node('fieldset'),preview=node('div'),status=node('p'),choice=node('select'),note=node('textarea');
  fieldset.style.border='0';preview.className='quick-access-preview';status.setAttribute('role','status');choice.setAttribute('aria-label','Access status');note.setAttribute('aria-label','Access note (optional)');note.maxLength=2000;note.rows=2;
  const selected=new Set(selectedRefs);let busy=false;
  choice.append(Object.assign(node('option','Choose access'),{value:''}));
  for(const state of OWNERSHIP_STATES)choice.append(Object.assign(node('option',accessLabel(state)),{value:state}));
  choice.append(Object.assign(node('option','Use provider status (clear correction)'),{value:'provider'}));
  if(records.length===1){choice.value=effectiveOwnershipRecord(records[0],database).ownership;note.value=database.ownershipReviews?.[records[0].recordRef]?.note??'';}
  const targets=new Map(records.map(record=>[record.recordRef,ownershipCorrectionTarget(record,database)]));
  for(const record of records){
    const row=node('label'),check=node('input');check.type='checkbox';check.checked=selected.has(record.recordRef);check.setAttribute('aria-label','Change '+record.title+' — '+accountLabel(record,database));check.dataset.accessRecord=record.recordRef;
    check.addEventListener('change',()=>{check.checked?selected.add(record.recordRef):selected.delete(record.recordRef);validate();});
    const text=node('span',record.title+' — '+accountLabel(record,database)+' · Current: '+accessLabel(effectiveOwnershipRecord(record,database).ownership));
    if(records.length>1)row.append(check);row.append(text);preview.append(row);
  }
  function close(){dialog.close();dialog.remove();}
  const cancel=button('Cancel',close),apply=button('Save',async()=>{
    if(busy||apply.disabled)return;busy=true;fieldset.disabled=true;status.textContent='Saving access changes…';
    const selection=[...selected].map(ref=>targets.get(ref));
    try{const result=await save(selection,{ownership:choice.value==='provider'?null:choice.value,note:note.value});close();saved?.(result,selection.length,choice.value==='provider');}
    catch(error){busy=false;fieldset.disabled=false;validate();status.textContent='Could not save access changes. '+error.message;}
  });
  function validate(){apply.disabled=busy||!selected.size||!choice.value;}
  choice.addEventListener('change',validate);
  const access=node('label','Access '),notes=node('label','Note (optional) ');access.append(choice);notes.append(note);
  fieldset.append(preview,access,notes,cancel,apply);dialog.append(node('h3',records.length>1?'Change access for '+records.length+' copies':'Change access'),node('p',records.length>1?'Choose the account copies to change. Original provider information and contents stay unchanged.':'Your correction changes access for this account copy. Original provider information and contents stay unchanged.'),fieldset,status);
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else dialog.remove();});
  validate();document.body.append(dialog);dialog.showModal();choice.focus();return dialog;
}

export function createAccessCardControls(records,database,{selected,onSelect,change}){
  const root=node('div');root.className='library-access-actions';
  root.append(node('span',[...new Set(records.map(r=>accessLabel(effectiveOwnershipRecord(r,database).ownership)))].join(' / ')),button('Change access',()=>change(records)));
  const choices=records.length>1?node('details'):root;
  if(records.length>1){choices.append(node('summary','Select account copies'));root.append(choices);}
  for(const record of records){
    const label=node('label'),check=node('input');check.type='checkbox';check.checked=selected.has(record.recordRef);check.dataset.selectAccess=record.recordRef;
    check.setAttribute('aria-label','Select '+record.title+' — '+accountLabel(record,database)+' for access change');
    check.addEventListener('change',()=>{onSelect(record,check.checked);check.checked=selected.has(record.recordRef);});
    label.append(check,document.createTextNode(records.length===1?'Select':accountLabel(record,database)+' · '+accessLabel(effectiveOwnershipRecord(record,database).ownership)));choices.append(label);
  }return root;
}
