import {providerAccounts,createAccountActions} from './provider-accounts.js';

const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const date=value=>value?new Date(value).toLocaleString():'Not yet';
const nickname=p=>p.nickname||'Unnamed account';
const health=p=>({running:'Update in progress',succeeded:'Last update completed',failed:'Last update failed',partial:'Last update incomplete',cancelled:'Update cancelled'})[p.syncHealth?.status]??'No recent update details';

export function createProvidersView({select,rename,onDatabase}){
 let database=null,busy=false;
 const element=node('div');element.id='provider-accounts';
 const status=node('p');status.setAttribute('role','status');
 const cards=node('div');cards.className='provider-cards';element.append(status,cards);
 const openCards=new Set();
 const actions=createAccountActions({read:()=>database,select,rename});
 function button(label,run){const b=node('button',label);b.type='button';b.disabled=busy;b.addEventListener('click',()=>{if(!busy)run();});return b;}
 function dialog(title){
   const root=node('dialog');root.className='account-dialog';const heading=node('h3',title);root.setAttribute('aria-label',title);root.append(heading);
   const feedback=node('p');feedback.setAttribute('role','status');
   const controls=node('p');controls.className='actions';const cancel=button('Cancel',()=>{root.close();root.remove();});controls.append(cancel);
   root.append(feedback,controls);element.append(root);
   root.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
   return {root,feedback,controls,cancel};
 }
 async function commit(d,run){
   if(busy)return;busy=true;for(const b of d.root.querySelectorAll('button,input'))b.disabled=true;
   try{const next=await run();database=next;d.root.close();d.root.remove();busy=false;onDatabase(next);status.textContent='Saved. All remembered accounts remain in Library.';}
   catch(error){d.feedback.textContent=error.message;for(const b of d.root.querySelectorAll('button,input'))b.disabled=false;}
   finally{busy=false;}
 }
 function selectAccount(site,p){
   const expected=database.providers[site.provider]?.activeProfileId;
   const d=dialog('Select '+nickname(p)+' for updates');
   const description=node('p',`Select this ${site.name} account for future updates. Its saved import progress will be restored. No scan starts, and other accounts stay in Library.`);
   const label=node('label');label.className='ownership-choice';const confirm=node('input');confirm.type='checkbox';label.append(confirm,document.createTextNode('I will verify this is the account signed in on the provider website before updating.'));
   d.root.insertBefore(description,d.feedback);d.root.insertBefore(label,d.feedback);
   const submit=button('Select account',()=>{if(!confirm.checked){d.feedback.textContent='Confirm which account you intend to update.';return;}commit(d,()=>actions.select(p.profileId,expected,true));});
   d.controls.append(submit);d.root.showModal();
 }
 function renameAccount(site,p){
   const d=dialog(p.nickname?'Rename account':'Name this account');
   const label=node('label','Account nickname');label.className='stacked-label';const input=node('input');input.maxLength=100;input.value=p.nickname;input.placeholder='For example, Personal';label.append(input);
   d.root.insertBefore(node('p','Choose a name you recognize for this '+site.name+' account. This is your label, not a verified website login. Naming does not reimport items or change their ownership.'),d.feedback);d.root.insertBefore(label,d.feedback);
   d.controls.append(button('Save nickname',()=>{if(!input.value.trim()){d.feedback.textContent='Enter an account nickname.';return;}commit(d,()=>actions.rename(p.profileId,input.value));}));d.root.showModal();input.focus();
 }
 function update(next){
   database=next;if(busy)return;
   cards.replaceChildren(...providerAccounts(database).map(site=>{
     const card=node('details');card.className='tool-card provider-card';card.dataset.provider=site.provider;card.open=openCards.has(site.provider);
     const selected=site.accounts.find(p=>p.active),summary=node('summary');summary.append(node('strong',site.name),node('span',site.accounts.length?`${site.accounts.length} saved account${site.accounts.length===1?'':'s'} · ${site.accounts.reduce((n,p)=>n+p.recordCount,0)} items`:'Not imported'));card.append(summary);
     card.addEventListener('toggle',()=>{if(card.open)openCards.add(site.provider);else openCards.delete(site.provider);});
     card.append(node('p',selected?`Selected for updates: ${nickname(selected)}.`:'No account selected for updates.'));
     const link=node('a',site.accounts.length?'Open provider website':'Open '+site.name+' to import');link.href=site.url;link.target='_blank';link.rel='noreferrer';card.append(link);
     if(!site.accounts.length)card.append(node('p','Sign in, enter an account nickname on the Galactic Library panel, confirm the signed-in account, then start its first full import.'));
     for(const p of site.accounts){
       const account=node('article');account.className='saved-account';account.dataset.account=p.profileId;
       account.append(node('h4',nickname(p)+(p.active?' · Selected for updates':'')),node('p',`${p.recordCount} imported items · Last updated: ${date(p.lastSuccessfulUpdate)} · Last full scan: ${date(p.lastCompleteScan)}`),node('p',health(p)),node('p',p.baselineComplete?'Complete import and coverage recorded.':p.lastCompleteScan?'A previous full import is saved; coverage details were not recorded.':'A first complete import is needed before quick updates.'));
       const controls=node('p');controls.className='actions';if(!p.active)controls.append(button('Select for updates',()=>selectAccount(site,p)));controls.append(button(p.nickname?'Rename account':'Name this account',()=>renameAccount(site,p)));account.append(controls);card.append(account);
     }
     return card;
   }));
 }
 return {element,update,get busy(){return busy;}};
}
