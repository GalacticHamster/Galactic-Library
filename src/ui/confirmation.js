// A cancellable UI decision. No storage work happens in this component.
export function createConfirmation({title,message,confirmLabel,extraLabel,extraAction}) {
  const node=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
  const dialog=node('dialog');dialog.className='account-dialog confirmation-dialog';dialog.setAttribute('aria-label',title);
  const status=node('p');status.setAttribute('role','status');
  const actions=node('p');actions.className='actions';
  const cancel=node('button','Cancel'),confirm=node('button',confirmLabel);cancel.type=confirm.type='button';cancel.className='secondary';confirm.className='danger';
  let finish,settled=false;const result=new Promise(resolve=>{finish=resolve;});
  const close=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();finish(value);};
  cancel.addEventListener('click',()=>close(false));confirm.addEventListener('click',()=>close(true));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close(false);});
  dialog.addEventListener('close',()=>close(false));
  actions.append(cancel);
  if(extraAction){const extra=node('button',extraLabel);extra.type='button';extra.className='secondary';extra.addEventListener('click',async()=>{extra.disabled=true;try{await extraAction();status.textContent='Current backup downloaded. You can still cancel restoration.';}catch{status.textContent='Could not export the current backup. Cancel restoration and try exporting again.';}finally{extra.disabled=false;}});actions.append(extra);}
  actions.append(confirm);dialog.append(node('h3',title),node('p',message),status,actions);document.body.append(dialog);dialog.showModal();cancel.focus();
  return {result,cancel:()=>close(false)};
}
