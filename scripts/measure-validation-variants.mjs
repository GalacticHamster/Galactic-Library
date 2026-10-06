// One process per ablation keeps cold RegExp compilation comparable.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
const args=process.argv.slice(2),runtime=args.find(x=>x.startsWith('--runtime='))?.slice(10),variant=args.find(x=>x.startsWith('--variant='))?.slice(10)??'all';
const path=args.find(x=>!x.startsWith('--')),input=JSON.parse(await readFile(requireBackup(path),'utf8')),db=input.database??input;
const {validateDatabase}=await import(runtime?pathToFileURL(resolve(runtime,'src/lib/models.js')):new URL('../src/lib/models.js',import.meta.url));
const keep=variant.startsWith('keep-')?Number(variant.slice(5)):Infinity;let retained=0;const retainedRefs=new Set();
for(const item of Object.values(db.providerItems))if(item.metadata?.enrichment?.kindleProductComicContents?.manifest){
 if(retained++<keep)retainedRefs.add(item.recordRef);
 if(variant==='no-current'||variant==='no-manifests'||!retainedRefs.has(item.recordRef))delete item.metadata.enrichment.kindleProductComicContents.manifest;
}
for(const entry of Object.values(db.enrichmentHistory??{}))if(entry.kind==='kindleProductComicContents'&&entry.previous?.manifest&&(variant==='no-historical'||variant==='no-manifests'||!retainedRefs.has(entry.recordRef)))delete entry.previous.manifest;
if(variant==='no-history'){db.enrichmentHistory={};db.kindleContentsObservations={};}
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const times=[];for(let n=0;n<4;n++){const start=performance.now();validateDatabase(db);times.push(performance.now()-start);}
const output={variant,runtime:runtime?'baseline':'fix',bytes:bytes(db),records:Object.keys(db.providerItems).length,currentManifests:Object.values(db.providerItems).filter(x=>x.metadata?.enrichment?.kindleProductComicContents?.manifest).length,historicalManifests:Object.values(db.enrichmentHistory??{}).filter(x=>x.previous?.manifest).length,historyBytes:bytes(db.enrichmentHistory),observationBytes:bytes(db.kindleContentsObservations??{}),timesMs:times};
console.log(JSON.stringify(output));await writeFile(await outputPath('audit-artifacts/checkpoint-query-performance/validation-'+output.runtime+'-'+variant+'.json'),JSON.stringify(output,null,2));
