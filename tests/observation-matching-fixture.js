import {syntheticProviderLibrary} from './provider-performance-fixture.js';
import {validateDatabase,normalizeProviderItem} from '../src/lib/models.js';

export function observationMatchingLibrary(size){
 let db=syntheticProviderLibrary(size);const steam=db.providerProfiles[db.providers.steam.activeProfileId],kindle=db.providerProfiles[db.providers.kindle.activeProfileId];
 // Avoid synthetic shared-prefix candidate explosions; retain real-title and
 // reviewed-contents controls within a varied multi-provider/account library.
 for(const [n,item]of Object.values(db.providerItems).entries()){
  const title='tk'+n.toString(36).padStart(4,'a'),p=db.providerProfiles[item.profileId];db.providerItems[item.id]=normalizeProviderItem({...item,title},item.updatedAt,{allowEnrichment:true,profileKeySpace:p.keySpace});
 }db.canonicalItems={};
 const add=(profile,native,title,mediaType,metadata={})=>{const item=normalizeProviderItem({provider:profile.provider,profileId:profile.profileId,providerItemId:native,title,mediaType,ownership:'owned',metadata},'2020-01-01',{profileKeySpace:profile.keySpace});db.providerItems[item.id]=item;return item;};
 const exact=add(steam,'benchmark-exact','Benchmark Exact Product','game');add(db.providerProfiles[db.providers.gog.activeProfileId],'benchmark-exact','Benchmark Exact Product','game');
 add(kindle,'benchmark-possible','Astro City (1995–1996) Vol. 1: Life in the Big City: New Edition','book');
 const book=add(kindle,'benchmark-collection','Benchmark Collection','book',{language:'en'}),issues=[1,2].map(n=>({series:'Benchmark Comics',run:'2000',unitType:'issue',number:String(n),language:'en',completeness:'full'}));
 db.contentReviews[book.id]={entries:issues,statement:'Collects Benchmark Comics (2000) #1-2',verifiedAt:'2026-01-01'};db=validateDatabase(db);
 const cases={exact:[{title:exact.title,mediaType:'game'}],possible:[{title:'ASTRO CITY, VOL. 1 TP (Digital)',mediaType:'book'}],partial:[{title:'Benchmark Comics Collection',mediaType:'book',contents:[...issues,{...issues[0],number:'3'}],contentsComplete:true}],bundle:Object.values(db.providerItems).filter(i=>i.mediaType==='game').slice(0,40).map(i=>({title:i.title,mediaType:i.mediaType})),aggregation:[{title:exact.title,mediaType:'game',excludeProviders:['humble']}]};
 return {db,cases,exact};
}
