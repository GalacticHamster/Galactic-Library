import {providerLabel,formatDate} from './formatters.js';
import {libraryReminders} from '../lib/reminders.js';

export function requestReminderPermissions(browser){
  const optional=browser.runtime.getManifest().optional_permissions??[];
  return browser.permissions.request({permissions:['alarms','notifications'].filter(name=>optional.includes(name))});
}

const labels={'activation':'Destination activation unconfirmed','key-expiry':'Reported key expiry','key-unavailable':'Key expired or unavailable','access-expiry':'Temporary access expiry','temporary-access':'Temporary access; expiry unknown'};
function node(tag,text=''){const element=document.createElement(tag);element.textContent=text;return element;}
export function createRemindersView(database,actions){
  const root=node('details');root.id='entitlement-reminders';root.className='tool-card';root.append(node('summary','Keys and access reminders'));
  root.addEventListener('toggle',()=>{if(!root.open||root.dataset.loaded)return;root.dataset.loaded='true';
    root.append(node('p','Purchase and revealed keys do not prove destination activation. Expiry dates are reported evidence; unknown deadlines stay unknown. Dismissing a reminder never changes ownership.'));
    const status=node('p');status.setAttribute('role','status');root.append(status);
    const enable=node('button','Enable desktop reminders'),disable=node('button','Disable desktop reminders');enable.type=disable.type='button';
    enable.addEventListener('click',async()=>{try{const granted=await actions.requestPermission();if(!granted){status.textContent='Desktop reminders remain disabled.';return;}await actions.notifications(true);status.textContent='Desktop reminders enabled; only an aggregate count is shown.';}catch(error){status.textContent=error.message;}});
    disable.addEventListener('click',async()=>{try{await actions.notifications(false);status.textContent='Desktop reminders disabled.';}catch(error){status.textContent=error.message;}});
    root.append(node('p','Desktop reminders are off by default. If enabled, the browser checks hourly while running and shows at most one aggregate notification per day.'),enable,disable);
    actions.notificationSettings().then(settings=>{status.textContent=`Desktop reminders ${settings.enabled?'enabled':'disabled'}.`;}).catch(error=>{status.textContent=error.message;});
    for(const [clientId,feed]of Object.entries(database.companionFeeds??{})){
      const remove=node('button','Remove Humble companion feed');remove.type='button';remove.addEventListener('click',async()=>{try{await actions.removeFeed(clientId);actions.refresh();}catch(error){status.textContent=error.message;}});root.append(node('p',`Companion feed: ${feed.entries.length} key/access entries received ${formatDate(feed.receivedAt)}; ${feed.coverage==='complete'?'older purchases checked':'older purchases have not all been checked'}; ${database.providerProfiles?.[feed.profileId]?.nickname||'account not linked to a saved Humble account'}.`),remove);
    }
    const filter=node('select');filter.setAttribute('aria-label','Reminder filter');for(const [value,label]of [['all','All active reminders'],['attention','Needs attention or due within 7 days'],['hidden','Dismissed and snoozed']]){const option=node('option',label);option.value=value;filter.append(option);}root.append(filter);
    const list=node('div'),count=node('p'),previous=node('button','Previous reminders'),next=node('button','Next reminders');previous.type=next.type='button';let page=0;
    const render=()=>{
      const all=libraryReminders(database,Date.now(),filter.value==='hidden').filter(entry=>filter.value==='hidden'?entry.hidden:filter.value==='attention'?entry.severity!=='information':true);
      page=Math.min(page,Math.max(0,Math.ceil(all.length/50)-1));count.textContent=`${all.length} reminders; page ${page+1} of ${Math.max(1,Math.ceil(all.length/50))}.`;previous.disabled=page===0;next.disabled=(page+1)*50>=all.length;list.replaceChildren();
      for(const entry of all.slice(page*50,page*50+50)){
        const row=node('article');row.dataset.reminderRef=entry.reminderRef;row.append(node('strong',entry.title),node('p',`${providerLabel(entry.provider)}: ${labels[entry.kind]}; ${entry.dueAt?formatDate(entry.dueAt):'no reported deadline'}; ${entry.severity==='information'?'For information':'Needs attention'}.`));
        if(entry.sourceClientId)row.append(node('p',`Humble Bundle extension report; checked ${formatDate(entry.checkedAt)}; ${entry.coverage==='complete'?'older purchases checked':'older purchases have not all been checked'}. Separate from GL imports; does not confirm ownership.`));
        const inspect=node('button',entry.sourceClientId?'Review in Humble Comic Library':'Review library item');inspect.type='button';inspect.addEventListener('click',async()=>{try{if(entry.sourceClientId)await actions.reviewSource(entry.sourceClientId);else await actions.inspect(entry.itemRef);}catch(error){status.textContent=error.message;}});row.append(inspect);
        const act=(label,action,until=null)=>{const button=node('button',label);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{await actions.review(entry.reminderRef,action,entry.basis,until);actions.refresh();}catch(error){status.textContent=error.message;button.disabled=false;}});row.append(button);};
        if(entry.hidden)act('Restore reminder','restore');else{act('Dismiss reminder','dismissed');act('Snooze 7 days','snoozed',new Date(Date.now()+7*86400000).toISOString());}list.append(row);
      }
    };filter.addEventListener('change',()=>{page=0;render();});previous.addEventListener('click',()=>{page--;render();});next.addEventListener('click',()=>{page++;render();});root.append(count,previous,next,list);render();
  });return root;
}
