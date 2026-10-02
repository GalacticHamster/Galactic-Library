import {libraryReminders} from '../lib/reminders.js';

export const REMINDER_ALARM='galactic-library-reminders';
const permissions={permissions:['alarms','notifications']};
/** Serialized with the storage writer; persisted daily dedup survives worker restarts. */
export async function reconcileReminderNotifications(writer,browser,notify=false,now=Date.now()){
  const settings=await writer.getReminderNotificationSettings();
  if(!settings.enabled){await browser.alarms?.clear(REMINDER_ALARM);return;}
  if(!await browser.permissions.contains(permissions)){
    await writer.saveReminderNotificationSettings(false);await browser.alarms?.clear(REMINDER_ALARM);return;
  }
  if(!await browser.alarms.get(REMINDER_ALARM))await browser.alarms.create(REMINDER_ALARM,{delayInMinutes:1,periodInMinutes:60});
  if(!notify)return;
  const count=libraryReminders(await writer.getDatabase(),now).filter(entry=>entry.severity!=='information').length;
  if(!count)return;
  const day=new Date(now).toISOString().slice(0,10);
  if(!await writer.reserveReminderNotification(day))return;
  try{
    await new Promise((resolve,reject)=>browser.notifications.create('galactic-library-reminder',{type:'basic',iconUrl:browser.runtime.getURL('src/ui/library-icon.png'),title:'Galactic Library',message:`${count} entitlement reminder${count===1?'':'s'} need attention. Open Galactic Library to review.`,priority:0},()=>{const error=browser.runtime.lastError;if(error)reject(new Error('Desktop notification was not delivered.'));else resolve();}));
  }catch{
    // OS suppression/API errors do not change ownership or interrupt sync.
    await writer.releaseReminderNotification(day);
  }
}
