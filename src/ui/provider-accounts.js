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
 ['humble','Humble Bundle','https://www.humblebundle.com/home/purchases']
].map(([provider,name,url])=>({provider,name,url}));

export function providerAccounts(database){
 const profiles=enumerateProviderProfiles(database);
 return PROVIDER_SITES.map(site=>({...site,accounts:profiles.filter(p=>p.provider===site.provider)}));
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
