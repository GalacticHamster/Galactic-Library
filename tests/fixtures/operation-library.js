// Generated synthetic source, not an inventory or frozen audit output.
import {createStorageWriter} from '../../src/background/storage-writer.js';
import {createBackup} from '../../src/lib/storage.js';
import {validateEnrichment} from '../../src/lib/metadata-validation.js';
import {selectManifest} from '../../src/lib/kindle-manifest.js';
import {contentsObservation} from '../../src/lib/kindle-contents-observations.js';
export async function operationLibrary(size){
 const values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
 let database=await writer.getDatabase();
 const specs=[['kindle',3300],['kobo',4000],['humble',3700],['fanatical',3000]];
 for(const [provider,portion]of specs){const count=Math.floor(size*portion/14000);if(!count)continue;
  database=await writer.mergeProviderItems(provider,Array.from({length:count},(_,n)=>({providerItemId:provider==='kindle'?'B'+String(n).padStart(9,'0'):String(n),title:(provider==='kindle'||provider==='kobo'&&n<Math.floor(size/14)?'Synthetic Work ':provider+' Work ')+String(n).padStart(5,'0'),mediaType:'book',ownership:n%10?'owned':'borrowed',metadata:{authors:['Synthetic Author'],series:['Synthetic series '+(n%100)],...(provider==='kindle'?{detailUrl:'https://www.amazon.com/dp/B'+String(n).padStart(9,'0')}:{} )}})),{profileLabel:'Synthetic '+provider});
 }
 // Account for rounding for the smaller fixtures.
 const remaining=size-Object.keys(database.providerItems).length;
 if(remaining)database=await writer.mergeProviderItems('steam',Array.from({length:remaining},(_,n)=>({providerItemId:'extra-'+n,title:'Synthetic Game '+n,mediaType:'game',ownership:'owned'})),{profileLabel:'Synthetic games'});
 const now='2026-10-09T00:00:00.000Z';
 database.kindleContentsObservations??={};
 for(const record of Object.values(database.providerItems).filter(value=>value.provider==='kindle').slice(0,Math.floor(size*3000/14000))){
  const statement='Collects Synthetic Series #1-6; Synthetic Annual #1.',selection=selectManifest([{selector:'#bookDescription_feature_div',text:statement}],record.title);
  const saved=validateEnrichment('kindleProductComicContents',{source:'amazon-product-page',sourceUrl:record.metadata.detailUrl,...selection,availability:'statement-found',extractorVersion:5,parserVersion:5,checkedAt:now});
  record.metadata.enrichment={kindleProductComicContents:saved,googleBooks:{source:'google-books',categories:['Comics & Graphic Novels','Fiction'],sourceUrl:'https://books.google.com/books?id=synthetic'}};
  database.kindleContentsObservations[record.recordRef]={providerItemId:record.id,baseline:contentsObservation(record,saved)};
  if(Number(record.providerItemId.slice(1))%5===0)database.contentReviews[record.id]={entries:[{series:'Synthetic Series',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'}],statement,source:'manual-review',sourceUrl:record.metadata.detailUrl,verifiedAt:now};
 }
 return createBackup(database).database;
}
