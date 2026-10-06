import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {validateDatabase,normalizeProviderItem,rebuildCanonicalItems} from '../src/lib/models.js';
import {selectManifest} from '../src/lib/kindle-manifest.js';
import {contentsObservation,validateKindleContentsObservations} from '../src/lib/kindle-contents-observations.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
const input=JSON.parse(await readFile(requireBackup(process.argv[2]),'utf8')),base=validateDatabase(input.database??input);
const fixtures=JSON.parse(await readFile(new URL('../tests/fixtures/kindle/kindle-manifest-fixtures.json',import.meta.url),'utf8'));
const complex=JSON.parse(await readFile(new URL('../tests/fixtures/kindle/kindle-whole-manifest.json',import.meta.url),'utf8'));
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const time=fn=>{const start=performance.now(),value=fn();return {ms:performance.now()-start,value};};
const kindle=Object.values(base.providerItems).filter(x=>x.provider==='kindle');
const rows=[];
for(const count of [0,50,200,500,1000,2000,3194]){
 const db=structuredClone(base);db.kindleContentsObservations={};
 for(let i=0;i<count;i++){
  const item=db.providerItems[kindle[i].id],fixture=i%10===0?complex:fixtures[i%fixtures.length];
  const blocks=fixture.blocks??[{selector:'#bookDescription_feature_div',text:fixture.text}];
  const selected=selectManifest(blocks,item.title);
  const previous=item.metadata.enrichment?.kindleProductComicContents;
  db.kindleContentsObservations[item.recordRef]={providerItemId:item.id,baseline:contentsObservation(item,previous)};
  item.metadata.enrichment={...item.metadata.enrichment,kindleProductComicContents:{source:'amazon-product-page',sourceUrl:item.metadata.detailUrl,...selected,extractorVersion:5,parserVersion:5,availability:selected.statement?'statement-found':'no-statement',checkedAt:new Date().toISOString()}};
 }
 const validation=time(()=>validateDatabase(db));
 const normalize=time(()=>Object.values(db.providerItems).map(item=>normalizeProviderItem({...item,observedAt:item.observedAt??null},item.updatedAt)));
 const canonical=time(()=>rebuildCanonicalItems(validation.value.providerItems,db.manualMatchDecisions,db.canonicalItems,db.editionSeparations));
 const observations=time(()=>validateKindleContentsObservations(db.kindleContentsObservations,Object.values(db.providerItems)));
 const noHistory=structuredClone(db);noHistory.enrichmentHistory={};noHistory.kindleContentsObservations={};const withoutHistory=time(()=>validateDatabase(noHistory));
 const clone=time(()=>structuredClone(validation.value));const stringify=time(()=>JSON.stringify(validation.value));
 const request={type:'MATCH_ITEMS',apiVersion:1,items:kindle.slice(0,40).map(x=>({title:x.title,mediaType:'book',excludeProviders:['humble']}))};
 const matching=time(()=>handleExternalApiRequest(validation.value,request));
 const row={g5:count,records:kindle.length,bytes:bytes(db),manifestBytes:bytes(Object.values(db.providerItems).filter(x=>x.provider==='kindle').map(x=>x.metadata.enrichment?.kindleProductComicContents?.manifest??null)),historyBytes:bytes(db.enrichmentHistory),observationBytes:bytes(db.kindleContentsObservations),ms:{validation:validation.ms,normalize:normalize.ms,canonical:canonical.ms,observations:observations.ms,withoutHistory:withoutHistory.ms,clone:clone.ms,stringify:stringify.ms,match40:matching.ms}};rows.push(row);console.log(JSON.stringify(row));
}
await writeFile(await outputPath('audit-artifacts/checkpoint-query-performance/growth-before.json'),JSON.stringify(rows,null,2));
