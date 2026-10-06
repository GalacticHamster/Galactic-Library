// Narrow private-input invariant comparison, not a release/corpus battery.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validateDatabase,validateDatabaseAsync} from '../src/lib/models.js';
import {equalDatabaseData} from '../src/lib/data-equality.js';
import {handleExternalApiRequest,handleExternalApiRequestAsync} from '../src/lib/external-api.js';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
const [baselinePath,backupPath]=process.argv.slice(2);if(!baselinePath)throw Error('Supply a baseline checkout and private backup path.');
const baseline=await import(pathToFileURL(resolve(baselinePath,'src/lib/models.js'))),api=await import(pathToFileURL(resolve(baselinePath,'src/lib/external-api.js')));
const input=JSON.parse(await readFile(requireBackup(backupPath),'utf8')),raw=input.database??input;
const expected=baseline.validateDatabase(raw),sync=validateDatabase(raw),asyncResult=await validateDatabaseAsync(raw);
assert.ok(equalDatabaseData(expected,sync),'Synchronous normalized database differs');assert.ok(equalDatabaseData(expected,asyncResult),'Cooperative normalized database differs');
const books=Object.values(expected.providerItems).filter(x=>x.provider==='kindle').slice(0,40);
for(const excluded of ['humble','fanatical']){
 const request={type:'MATCH_ITEMS',apiVersion:1,items:books.flatMap(x=>[{title:x.title,mediaType:'book',excludeProviders:[excluded]},{title:x.title+', 2nd Edition',mediaType:'book',excludeProviders:[excluded]}])};
 const result=api.handleExternalApiRequest(expected,request);assert.deepEqual(handleExternalApiRequest(sync,request),result);assert.deepEqual(await handleExternalApiRequestAsync(asyncResult,request),result);
}
const result={records:Object.keys(expected.providerItems).length,canonical:Object.keys(expected.canonicalItems).length,history:Object.keys(expected.enrichmentHistory).length,observations:Object.keys(expected.kindleContentsObservations??{}).length,databaseEqual:true,companionComparisons:160,matchingEqual:true};
console.log(JSON.stringify(result));await writeFile(await outputPath('audit-artifacts/checkpoint-query-performance/equivalence.json'),JSON.stringify(result,null,2));
