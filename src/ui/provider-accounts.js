import {enumerateProviderProfiles} from '../lib/profile-management.js';

export const PROVIDER_SITES=[
 ['steam','Steam','https://store.steampowered.com/'],
 ['gog','GOG','https://www.gog.com/account'],
 ['epic','Epic Games','https://store.epicgames.com/'],
 ['amazon-games','Amazon Games','https://luna.amazon.com/claims/my-collection?g=s&offerType=games'],
 ['audible','Audible','https://www.audible.com/library/titles'],
 ['kindle','Kindle','https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/'],
 ['amazon-video','Amazon Video','https://www.amazon.com/gp/video/mystuff/library/all'],
 ['fandango-at-home','Fandango at Home','https://athome.fandango.com/content/browse/mylibrary'],
 ['kobo','Kobo','https://www.kobo.com/us/en/library/books'],
 ['fanatical','Fanatical','https://www.fanatical.com/en/orders'],
 ['humble','Humble Bundle','https://www.humblebundle.com/home/purchases'],
 ['playstation','PlayStation ? PS4/PS5 Purchased Library','https://library.playstation.com/recently-purchased'],
 ['nintendo','Nintendo — Switch Virtual Game Cards','https://accounts.nintendo.com/portal/vgcs']
].map(([provider,name,url])=>({provider,name,url}));

export function providerAccounts(database){
 const profiles=enumerateProviderProfiles(database);
 return PROVIDER_SITES.map(site=>({...site,accounts:profiles.filter(p=>p.provider===site.provider)}));
}
export function updateEligibility(profile,state={},now=Date.now()){
 const fullReason=!profile.active?'Select this account for updates first.':!profile.nickname?'Name this saved account before updating it.':profile.syncHealth?.status==='running'?'Check the provider tab for the current update.':'';
 let quickReason=fullReason;
 if(!quickReason&&profile.provider==='epic')quickReason='Epic supports complete imports only. Use Full Rescan.';
 if(!quickReason&&profile.provider==='nintendo')quickReason='Nintendo imports the complete loaded card list. Use Full Rescan.';
 if(!quickReason&&!state.fullSyncAt)quickReason='Run a first Full Rescan to establish this account’s import history.';
 if(!quickReason&&profile.provider==='amazon-games'){
   const age=now-Date.parse(state.quickSyncAt??state.fullSyncAt??'');
   if(!Number.isFinite(age)||age>70*24*60*60*1000)quickReason='Amazon Games needs a Full Rescan after more than 70 days without an update.';
 }
 return {quick:!quickReason,full:!fullReason,quickReason,fullReason};
}
export function createProfileManagementActions({read,preview,remove,reset}){
 return {
   preview:profileId=>preview(profileId),
   async remove(profileId,dependencyStamp,confirmed){
     if(confirmed!==true)throw Error('Confirm removal of this account and its saved evidence.');
     if(!read().providerProfiles[profileId])throw Error('This account is no longer available.');
     return remove(profileId,dependencyStamp,true);
   },
   async reset(profileId,confirmed){if(confirmed!==true)throw Error('Confirm resetting this account’s import history.');return reset(profileId,true);}
 };
}
// This controller carries no account storage. Every operation uses the
// privileged writer and its immutable identity/stale-selection checks.
export function createAccountActions({read,select,rename}){
 return {
   async select(profileId,expectedActiveId,confirmed){
     const d=read(),p=d.providerProfiles[profileId];if(!p)throw Error('This saved account is no longer available.');
     if(d.providers[p.provider]?.activeProfileId!==expectedActiveId)throw Error('The selected account changed. Review the selection again.');
     if(confirmed!==true)throw Error('Confirm the account you intend to update.');
     return select(profileId,expectedActiveId,true);
   },
   async rename(profileId,nickname){if(!read().providerProfiles[profileId])throw Error('This saved account is no longer available.');return rename(profileId,nickname.trim());}
 };
}
