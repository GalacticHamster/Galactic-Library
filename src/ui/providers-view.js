import {providerAccounts,createAccountActions,updateEligibility,createProfileManagementActions} from './provider-accounts.js';

const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const date=value=>value?new Date(value).toLocaleString():'Not yet';
const nickname=p=>p.nickname||'Unnamed account';
const health=p=>({running:'Update in progress',succeeded:'Last update completed',failed:'Last update failed',partial:'Last update incomplete',cancelled:'Update cancelled'})[p.syncHealth?.status]??'No recent update details';

export function createProvidersView({select,rename,preview,remove,reset,openProvider,onDatabase}){
 let database=null,busy=false;
 const element=node('div');element.id='provider-accounts';
 const status=node('p');status.setAttribute('role','status');
 const cards=node('div');cards.className='provider-cards';element.append(status,cards);
 const openCards=new Set();
 const actions=createAccountActions({read:()=>database,select,rename});
 const management=createProfileManagementActions({read:()=>database,preview,remove,reset});
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
 function updateAccount(site,p,mode){
   const permission=updateEligibility(p,database.providerProfiles[p.profileId]?.state);
   const allowed=mode==='quick'?permission.quick:permission.full;
   if(!allowed){status.textContent=mode==='quick'?permission.quickReason:permission.fullReason;return;}
   const label=mode==='quick'?'Quick Update':'Full Rescan',d=dialog(label+' · '+site.name);
   d.root.insertBefore(node('p',mode==='quick'?'Check for new items using this account’s saved import history.':'Check the complete inventory for this account. Missing items may move to earlier imports; acquired contents, reviews and other saved accounts are retained.'),d.feedback);
   d.root.insertBefore(node('p',`On ${site.name}, sign in to ${nickname(p)}, check the account nickname on the Galactic Library panel and confirm the signed-in account. Then choose ${site.provider==='epic'?'Sync library':mode==='quick'?'Quick update':'Full rescan'}. Opening the site does not start an import.`),d.feedback);
   if(site.provider==='fandango-at-home'&&mode==='quick')d.root.insertBefore(node('p','Fandango Quick Update runs from its Recently Purchased View All grids. Full Rescan checks the complete My Library grids.'),d.feedback);
   const open=button('Open '+site.name+' for '+label,async()=>{try{await openProvider(site.url);d.feedback.textContent='Provider page opened. Confirm the signed-in account and start the update there.';}catch(error){d.feedback.textContent=error.message;}});d.controls.append(open);d.root.showModal();
 }
 function resetAccount(site,p){
   const d=dialog('Reset import history · '+nickname(p));
   d.root.insertBefore(node('p',`Recovery only: forget the saved update position and coverage for this ${site.name} account. Imported items, acquired contents, source history and your reviews stay saved. The next import must be a Full Rescan. No scan starts now.`),d.feedback);
   const label=node('label');label.className='ownership-choice';const confirm=node('input');confirm.type='checkbox';label.append(confirm,document.createTextNode('I understand the next import requires a complete scan.'));d.root.insertBefore(label,d.feedback);
   d.controls.append(button('Reset import history',()=>{if(!confirm.checked){d.feedback.textContent='Confirm the reset before continuing.';return;}commit(d,()=>management.reset(p.profileId,true));}));d.root.showModal();
 }
 async function removeAccount(site,p){
   const d=dialog('Remove saved account · '+nickname(p));d.root.insertBefore(node('p','Loading the current removal preview…'),d.feedback);d.root.showModal();
   try{
     const plan=await management.preview(p.profileId);if(!d.root.isConnected)return;
     const intro=d.root.querySelector('p');intro.textContent=`Permanently remove ${nickname(p)} from ${site.name}: ${plan.records} imported items and ${plan.historicalRecords} earlier records. Other accounts remain saved. This is not disconnecting or temporarily hiding an account.`;
     const deps=node('ul');
     const labels={contentReviews:'contents reviews',manualMatchDecisions:'saved title relationships',editionSeparations:'edition separations',enrichmentHistory:'source/history entries',enrichmentReviews:'book reviews',titleAliases:'alternate-title records',ownershipReviews:'ownership confirmations',ownershipProposals:'purchase proposals',readingStates:'reading states',readingOrders:'reading orders affected',reminderReviews:'reminder decisions',kindleContentsObservations:'Kindle source-observation records',companionFeeds:'companion reminder feeds'};
     for(const [key,n]of Object.entries(plan.dependencies))if(n)deps.append(node('li',`${n} ${labels[key]??'related saved entries'}`));
     deps.append(node('li',`${plan.canonicalGroups} Library groups affected; shared groups retain other accounts’ records.`));
     if(plan.jobs.kindle)deps.append(node('li',`Kindle contents progress will be removed: ${plan.jobs.kindle.cursor}/${plan.jobs.kindle.total} completed.`));
     if(plan.jobs.googleAffectedTargets)deps.append(node('li',`${plan.jobs.googleAffectedTargets} book lookup targets affected.`));
     if(plan.jobs.scan)deps.append(node('li','A dependent in-progress import will lose permission to save.'));
     if(plan.jobs.fandangoNavigationContexts||plan.jobs.pendingCompanionUploads)deps.append(node('li','Related pending provider/companion work will be cancelled.'));
     d.root.insertBefore(deps,d.feedback);d.root.insertBefore(node('p','This deletes the account’s acquired source evidence and reviews listed above. Export a backup in Settings first if you may need them. Changes since this preview require a fresh preview.'),d.feedback);
     const label=node('label');label.className='ownership-choice';const confirm=node('input');confirm.type='checkbox';label.append(confirm,document.createTextNode('Permanently remove this account and its affected saved evidence.'));d.root.insertBefore(label,d.feedback);
     const submit=button('Remove account permanently',()=>{if(!confirm.checked){d.feedback.textContent='Confirm permanent removal before continuing.';return;}commit(d,()=>management.remove(p.profileId,plan.dependencyStamp,true));});submit.className='danger';d.controls.append(submit);
   }catch(error){d.feedback.textContent='Could not load the removal preview: '+error.message;}
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
     else card.append(node('p','To import another account, open the website, sign in to that account, enter a new nickname and explicitly confirm switching on the Galactic Library panel. Start a Full Rescan; these remembered accounts remain saved.'));
     for(const p of site.accounts){
       const account=node('article');account.className='saved-account';account.dataset.account=p.profileId;
       account.append(node('h4',nickname(p)+(p.active?' · Selected for updates':'')),node('p',`${p.recordCount} imported items · Last updated: ${date(p.lastSuccessfulUpdate)} · Last full scan: ${date(p.lastCompleteScan)}`),node('p',health(p)),node('p',p.baselineComplete?'Complete import and coverage recorded.':p.lastCompleteScan?'A previous full import is saved; coverage details were not recorded.':'A first complete import is needed before quick updates.'));
       const controls=node('p');controls.className='actions';if(!p.active)controls.append(button('Select for updates',()=>selectAccount(site,p)));controls.append(button(p.nickname?'Rename account':'Name this account',()=>renameAccount(site,p)));account.append(controls);card.append(account);
       const eligibility=updateEligibility(p,database.providerProfiles[p.profileId].state),updates=node('p');updates.className='actions';
       const quick=button('Quick Update',()=>updateAccount(site,p,'quick')),full=button('Full Rescan',()=>updateAccount(site,p,'full'));
       quick.disabled=!eligibility.quick;full.disabled=!eligibility.full;updates.append(quick,full);account.append(updates);
       if(eligibility.quickReason)account.append(node('p',eligibility.quickReason));
       const advanced=node('details');advanced.append(node('summary','Advanced account recovery and removal'),node('p','Reset import history keeps saved evidence. Remove account deletes its records and related evidence. Neither starts an import.'));
       const managementButtons=node('p');managementButtons.className='actions';managementButtons.append(button('Reset import history',()=>resetAccount(site,p)),button('Remove saved account',()=>removeAccount(site,p)));advanced.append(managementButtons);account.append(advanced);
     }
     return card;
   }));
 }
 return {element,update,get busy(){return busy;}};
}
