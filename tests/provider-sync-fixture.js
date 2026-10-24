import {createEmptyDatabase,validateDatabase,normalizeProviderItem} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {PROVIDER_SOURCES} from '../src/lib/metadata-validation.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import '../src/providers/amazon-games-identity.js';
const amazonValue=await globalThis.GalacticAmazonGamesIdentity.identify({provider:'amazon-games',providerItemId:'transient-example',title:'Synthetic parity record',mediaType:'game',ownership:'owned',metadata:{source:PROVIDER_SOURCES['amazon-games']}});

export const providerSyncModes=p=>p==='epic'||p==='nintendo'?['full']:['full','incremental'];
export const consoleProvider=p=>['nintendo','playstation','xbox'].includes(p);
export const fingerprint='a'.repeat(64),oldObservation='2020-01-01T00:00:00.000Z';
export function providerSyncValue(provider){
 if(provider==='amazon-games')return structuredClone(amazonValue);
 const mediaType=['kindle','kobo','humble','fanatical'].includes(provider)?'book':provider==='audible'?'audiobook':['amazon-video','fandango-at-home'].includes(provider)?'movie':'game';
 return {provider,providerItemId:provider==='xbox'?'9N0000000001':'synthetic-1',title:'Synthetic parity record',mediaType,ownership:'owned',metadata:{source:PROVIDER_SOURCES[provider],
  ...(provider==='xbox'?{productId:'9N0000000001',accessBasis:'personal-owned-web-catalog',accessTypes:[1]}:{})}};
}
export function providerSyncSnapshot(provider,items){
 if(!consoleProvider(provider)){
  const scopes=provider==='kindle'?['books','personal-documents'].map(id=>{const n=items.filter(item=>(item.metadata?.libraryCategory??'books')===id).length;return {...completedScope(id,n,n,'reported-count'),duplicateCount:0};})
   :provider==='fandango-at-home'?['movie','tv'].map(type=>{const n=items.filter(item=>item.mediaType===type).length;return completedScope(type,n,n,'reported-count');})
   :[completedScope('library',items.length,items.length,'reported-count')];
  return completeProviderSnapshot(provider,items,scopes);
 }
 return completeProviderSnapshot(provider,items,[completedScope(provider==='nintendo'?'non-hidden-virtual-cards':provider==='playstation'?'ps4-ps5-purchased':'owned-web-library',items.length,provider==='playstation'?null:items.length,provider==='playstation'?'pagination-end':'reported-count')]);
}
export function providerSyncLibrary(provider,values=[providerSyncValue(provider)]){
 const database=createEmptyDatabase(),profile=newProviderProfile(provider,'Personal');
 if(consoleProvider(provider))profile.sourceAccountFingerprint=fingerprint;
 profile.state={connected:true,lastSync:oldObservation,fullSyncAt:oldObservation,syncMode:'full',recordCount:values.length,...(provider==='humble'?{syncState:{knownPurchaseIds:[]}}:provider==='fanatical'?{syncState:{knownOrderFingerprints:[]}}:{})};
 database.providerProfiles[profile.profileId]=profile;database.providers[provider]={...profile.state,activeProfileId:profile.profileId};
 for(const value of values){const item=normalizeProviderItem({...value,profileId:profile.profileId},oldObservation,{profileKeySpace:profile.keySpace});database.providerItems[item.id]=item;}
 return validateDatabase(database);
}
