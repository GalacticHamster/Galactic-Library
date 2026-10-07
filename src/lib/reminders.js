import {object,text,date} from './validation.js';
import {effectiveOwnershipRecord} from './ownership.js';

export const REMINDER_KINDS=['activation','key-expiry','key-unavailable','access-expiry','temporary-access'];
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
export function validateReminderReviews(value={}){
  object(value,'Reminder reviews');if(Object.keys(value).length>100000)throw new Error('Too many reminder reviews.');
  return Object.fromEntries(Object.entries(value).map(([id,entry])=>{
    const [ref,kind,...extra]=id.split(':');if(!uuid.test(ref)||!REMINDER_KINDS.includes(kind)||extra.length)throw new Error('Invalid reminder reference.');
    object(entry,'Reminder review');if(!['dismissed','snoozed'].includes(entry.action))throw new Error('Invalid reminder action.');
    const until=date(entry.until);if(entry.action==='snoozed'&&!until)throw new Error('Snooze needs a date.');
    return [id,{action:entry.action,basis:text(entry.basis,250,'Reminder evidence'),until,updatedAt:date(entry.updatedAt)}];
  }));
}
/** Current records only. Dates are reported evidence, never estimated deadlines. */
export function libraryReminders(database,now=Date.now(),includeHidden=false){
  const reminders=[];
  for(const item of Object.values(database.providerItems)){
    const metadata=item.metadata??{},review=database.ownershipReviews?.[item.recordRef],effective=effectiveOwnershipRecord(item,database,now,{ignoreOverride:true});
    const key=metadata.entitlement==='third-party-key'||item.provider==='fanatical'&&['game','software'].includes(item.mediaType);
    const add=(kind,dueAt=null)=>{
      const overdue=dueAt&&Date.parse(dueAt)<=now,soon=dueAt&&Date.parse(dueAt)<=now+7*86400000;
      const severity=overdue||kind==='key-unavailable'?'attention':soon?'due-soon':'information';
      const basis=JSON.stringify([kind,dueAt,metadata.keyStatus??'',review?.reviewRef??'']);
      const reminderRef=`${item.recordRef}:${kind}`,saved=database.reminderReviews?.[reminderRef];
      const hidden=saved?.basis===basis&&(saved.action==='dismissed'||saved.action==='snoozed'&&Date.parse(saved.until)>now);
      if(!hidden||includeHidden)reminders.push({reminderRef,itemRef:item.recordRef,title:item.title,provider:item.provider,mediaType:item.mediaType,kind,dueAt,severity,basis,hidden:Boolean(hidden)});
    };
    if(key){
      if(['expired','unavailable'].includes(metadata.keyStatus))add('key-unavailable',metadata.expiresAt??null);
      else{add('activation');if(metadata.expiresAt)add('key-expiry',metadata.expiresAt);}
    }
    const accessExpiry=review?.expiresAt??(['rental','borrowed','subscription'].includes(effective.ownership)?metadata.expiresAt:null);
    if(accessExpiry)add('access-expiry',accessExpiry);
    else if(['rental','borrowed','subscription'].includes(effective.ownership))add('temporary-access');
  }

  for(const [clientId,feed]of Object.entries(database.companionFeeds??{})){
    if(feed.profileId?!database.providerProfiles?.[feed.profileId]:feed.profileLabel!==database.providers.humble?.profileLabel)continue;
    for(const entry of feed.entries){
      const add=kind=>{
        const dueAt=kind==='activation'?null:entry.expiresAt,severity=kind==='key-unavailable'||dueAt&&Date.parse(dueAt)<=now?'attention':dueAt&&Date.parse(dueAt)<=now+7*86400000?'due-soon':'information';
        const basis=JSON.stringify([kind,dueAt,entry.keyStatus,entry.checkedAt,clientId]),reminderRef=`${entry.localRef}:${kind}`,saved=database.reminderReviews?.[reminderRef];
        const hidden=saved?.basis===basis&&(saved.action==='dismissed'||saved.action==='snoozed'&&Date.parse(saved.until)>now);
        if(!hidden||includeHidden)reminders.push({reminderRef,itemRef:entry.localRef,title:entry.title,provider:'humble',mediaType:entry.mediaType,kind,dueAt,severity,basis,hidden:Boolean(hidden),sourceClientId:clientId,source:'humble-companion',checkedAt:entry.checkedAt,coverage:feed.coverage});
      };
      if(['expired','unavailable'].includes(entry.keyStatus))add('key-unavailable');else{add('activation');if(entry.expiresAt)add('key-expiry');}
    }
  }
  return reminders.sort((a,b)=>(a.dueAt??'9999').localeCompare(b.dueAt??'9999')||a.reminderRef.localeCompare(b.reminderRef));
}
export function companionReminder({reminderRef,itemRef,title,provider,mediaType,kind,dueAt,severity,source}){
  return {reminderRef,itemRef,title,provider,mediaType,kind,dueAt,severity,...(source?{source,reviewAvailable:false}:{})};
}
