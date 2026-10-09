import {createEmptyDatabase,normalizeProviderItem,rebuildCanonicalItems} from '../../../src/lib/models.js';
import {handleExternalApiRequest} from '../../../src/lib/external-api.js';
export const original='Beneath the Trees Where Nobody Sees';
export const sequel=original+': Rite of Spring';
export const deluxe=n=>'30 Days of Night Deluxe Edition: Book '+['One','Two','Three'][n-1];
export const unit=(series,number)=>({series,run:'synthetic-run',language:'en',unitType:'issue',number:String(number),completeness:'full'});
// HB receives reviewed offer contents through its existing mapping interface.
export const offerMappings=offers=>offers.filter(offer=>offer.contents).map((offer,index)=>({id:'synthetic-'+index,collectionTitle:offer.title,contains:offer.contents,contentsComplete:offer.contentsComplete,sourceLabel:'Synthetic reviewed control'}));
export const localFor=(scenario,provider)=>scenario.local.filter(item=>item.source===provider);
let ref=0;
export function book(provider,title,ownership='owned',metadata={},extra={}) {const n=++ref;return normalizeProviderItem({provider,providerItemId:'synthetic-'+n,title,mediaType:'book',ownership,metadata,recordRef:'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),...extra},'2026-10-08T12:00:00.000Z');}
export function database(items,reviews={},decisions={}){const db={...createEmptyDatabase(),providerItems:Object.fromEntries(items.map(item=>[item.id,item])),contentReviews:reviews,manualMatchDecisions:decisions};db.canonicalItems=rebuildCanonicalItems(db.providerItems,decisions);return db;}
export function scenarios(){
 ref=0;
 const hb=book('humble',original),kindle=book('kindle',original,'subscription'),issues=[1,2].map(n=>book('kindle',sequel+' #'+n,'subscription'));
 const generic=book('humble','30 Days of Night'),one=book('kindle',deluxe(1),'subscription');
 const review=(entries)=>({entries,statement:'Synthetic explicitly reviewed contents. Not reference facts about these books.',source:'manual-review',sourceUrl:'',verifiedAt:'2026-10-08T12:00:00.000Z'});
 const ownedIssue=book('kindle',sequel+' #1','owned'),collection=book('kindle',sequel,'subscription');
 return [
  {name:'trees-unknown',offers:[{title:original},{title:sequel}],local:[{title:original,source:'humble',sourceBundle:'Synthetic purchase',bundle:{title:'Synthetic purchase'}}],db:database([hb,kindle,...issues]),unknown:['collection extent','run','language','edition','authors']},
  {name:'trees-alone',offers:[{title:sequel}],local:[],db:database([hb,kindle,...issues]),unknown:['collection extent','run','language','edition','authors']},
  {name:'deluxe-unknown',offers:[1,2,3].map(n=>({title:deluxe(n)})),local:[{title:'30 Days of Night',source:'humble',sourceBundle:'Synthetic purchase',bundle:{title:'Synthetic purchase'}}],db:database([generic,one]),unknown:['generic record contents','volume/edition metadata','authors']},
  ...[1,2,3].map(n=>({name:'deluxe-alone-'+n,offers:[{title:deluxe(n)}],local:[{title:'30 Days of Night',source:'humble',sourceBundle:'Synthetic purchase',bundle:{title:'Synthetic purchase'}}],db:database([generic,one]),unknown:['generic record contents']})),
  {name:'trees-explicit-contents-subscription',offers:[{title:original},{title:sequel,contents:[1,2,3].map(n=>unit(sequel,n)),contentsComplete:true,run:'synthetic-run',language:'en'}],local:[],db:database([hb,kindle,...issues],Object.fromEntries(issues.map((item,i)=>[item.id,review([unit(sequel,i+1)])]))),unknown:['Synthetic 3-issue extent is a control, not a claim about the real volume']},
  {name:'trees-owned-reviewed-overlap',offers:[{title:sequel,contents:[1,2,3].map(n=>unit(sequel,n)),contentsComplete:true,run:'synthetic-run',language:'en'}],local:[],db:database([kindle,ownedIssue,collection],{[ownedIssue.id]:review([unit(sequel,1)])}),unknown:['Synthetic 3-issue extent is a control']},
  {name:'deluxe-reviewed-overlap',offers:[{title:deluxe(2),contents:[unit('Synthetic Contents',1),unit('Synthetic Contents',2)],contentsComplete:true}],local:[],db:(()=>{const copy=book('kindle','30 Days of Night','owned');return database([copy,one],{[copy.id]:review([unit('Synthetic Contents',1)])});})(),unknown:['Synthetic verified contents are not real bibliographic claims']},
  {name:'same-edition-multiple-providers',offers:[{title:original},{title:sequel}],local:[],db:database([hb,kindle,...issues],{},{review:{itemIds:[hb.id,kindle.id],decision:'same-edition'}}),unknown:['Actual user canonical decision is unknown']},
 ];
}
export function centralResults(db,offers,provider,api=handleExternalApiRequest){const requests=offers.map((offer,index)=>({requestId:String(index),title:offer.title,mediaType:'book',excludeProviders:[provider],...(offer.contents?{contents:offer.contents,contentsComplete:offer.contentsComplete}:{}),...(offer.run?{run:offer.run}:{}),...(offer.language?{language:offer.language}:{})}));const response=api(db,{type:'MATCH_ITEMS',apiVersion:1,items:requests});if(!response.ok)throw Error(response.error);return Object.fromEntries(offers.map((offer,index)=>[offer.title,response.results[index]]));}
