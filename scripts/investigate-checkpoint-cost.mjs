// Offline private-input investigation. Never contacts a browser or provider.
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {Session} from 'node:inspector';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {outputPath} from './audit-artifacts.mjs';

const args=process.argv.slice(2),runtime=args.find(x=>x.startsWith('--runtime='))?.slice(10),files=args.filter(x=>!x.startsWith('--runtime='));if(!files.length)throw Error('Supply private backup JSON paths; no source acquisition is performed.');
const modulePath=name=>runtime?pathToFileURL(resolve(runtime,'src/lib',name)):new URL('../src/lib/'+name,import.meta.url);
const {validateDatabase,normalizeProviderItem,rebuildCanonicalItems}=await import(modulePath('models.js'));
const {validateKindleContentsObservations}=await import(modulePath('kindle-contents-observations.js'));
const {handleExternalApiRequest}=await import(modulePath('external-api.js'));
const time=(fn)=>{const start=performance.now(),value=fn();return {ms:performance.now()-start,value};};
const bytes=value=>Buffer.byteLength(JSON.stringify(value??{}));
const session=new Session();session.connect();const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
const rows=[];
for(const file of files){
 const input=JSON.parse(await readFile(file,'utf8')),db=input.database??input;
 const records=Object.values(db.providerItems),history=db.kindleContentsObservations??{};
 const dimensions={bytes:bytes(db),records:records.length,canonical:Object.keys(db.canonicalItems??{}).length,providers:Object.fromEntries([...new Set(records.map(x=>x.provider))].map(provider=>[provider,records.filter(x=>x.provider===provider).length])),g5:records.filter(x=>x.metadata?.enrichment?.kindleProductComicContents?.extractorVersion===5).length,manifests:records.filter(x=>x.metadata?.enrichment?.kindleProductComicContents?.manifest).length,observationRecords:Object.keys(history).length,observationBytes:bytes(history),providerHistoryBytes:bytes(db.providerHistory),enrichmentHistoryBytes:bytes(db.enrichmentHistory)};
 await post('Profiler.enable');await post('Profiler.start');
 const validation=time(()=>validateDatabase(db));const {profile}=await post('Profiler.stop');
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),samples={};for(let i=0;i<(profile.samples??[]).length;i++){const node=nodes.get(profile.samples[i]),name=node.callFrame.functionName||'(anonymous)';samples[name]=(samples[name]??0)+(profile.timeDeltas[i]??0)/1000;}
 const normalize=time(()=>records.map(item=>normalizeProviderItem({...item,observedAt:item.observedAt??null},item.updatedAt)));
 const canonical=time(()=>rebuildCanonicalItems(validation.value.providerItems,db.manualMatchDecisions,db.canonicalItems,db.editionSeparations));
 const observations=time(()=>validateKindleContentsObservations(history,[...Object.values(validation.value.providerItems),...Object.values(validation.value.providerHistory).map(x=>x.item)]));
 const clone=time(()=>structuredClone(validation.value));const serialization=time(()=>JSON.stringify(validation.value));
 const kindle=records.filter(x=>x.provider==='kindle').slice(0,40),query={type:'MATCH_ITEMS',apiVersion:1,items:kindle.map(item=>({title:item.title,mediaType:item.mediaType,excludeProviders:['humble']}))};
 const matching=time(()=>handleExternalApiRequest(validation.value,query));
 const variants=[];
 for(const fraction of [0,.25,.5,1]){
  const variant=structuredClone(db);let retained=0;const limit=Math.round(dimensions.manifests*fraction);
  for(const item of Object.values(variant.providerItems))if(item.metadata?.enrichment?.kindleProductComicContents?.manifest){if(retained++>=limit)delete item.metadata.enrichment.kindleProductComicContents.manifest;}
  const validation=time(()=>validateDatabase(variant));variants.push({manifestFraction:fraction,bytes:bytes(variant),validationMs:validation.ms});
 }
 const row={inputName:file.split(/[\\/]/).at(-1),dimensions,ms:{validation:validation.ms,normalize:normalize.ms,canonical:canonical.ms,observations:observations.ms,clone:clone.ms,serialization:serialization.ms,match40:matching.ms},cpuSelfMs:Object.fromEntries(Object.entries(samples).sort((a,b)=>b[1]-a[1]).slice(0,25)),variants};
 rows.push(row);console.log(JSON.stringify(row));
}
session.disconnect();await writeFile(await outputPath('audit-artifacts/checkpoint-query-performance/offline-'+(runtime?'before':'after')+'.json'),JSON.stringify(rows,null,2));
