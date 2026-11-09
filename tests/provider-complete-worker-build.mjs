// Disposable test source overlay only. Does not change active source or dist.
import {readFile,readdir,copyFile,writeFile} from 'node:fs/promises';
import {dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {candidateFiles,verifyCandidateBundle} from '../scripts/provider-engine-build.mjs';
import {outputPath} from '../scripts/audit-artifacts.mjs';

export async function completeWorkerOverlay(){
  const root=dirname(await outputPath(new URL('../audit-artifacts/gate5a-candidate/src/service-worker.js',import.meta.url)));
  const source=new URL('../../Fanatical/src/',import.meta.url);
  for(const entry of await readdir(source,{withFileTypes:true}))if(entry.isFile())await copyFile(new URL(entry.name,source),`${root}/${entry.name}`);
  const worker=(await readFile(new URL('service-worker.js',source),'utf8')).replace(/\r\n/g,'\n');
  const files=await candidateFiles('FAN',new Map([['src/service-worker.js',Buffer.from(worker)]]));
  const pin=JSON.parse(await readFile(new URL('../shared/fanatical-acquisition-pin.json',import.meta.url),'utf8'));
  verifyCandidateBundle('FAN',files,pin);
  for(const [name,bytes]of files)await writeFile(`${root}/${basename(name)}`,bytes);
  const evidence={revision:pin.revision,contractVersion:pin.contractVersion,sourceRoot:root,files:Object.fromEntries([...files].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')]))};
  await writeFile(await outputPath(new URL('../audit-artifacts/gate5a-overlay.json',import.meta.url)),JSON.stringify(evidence,null,2));
  return evidence;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await completeWorkerOverlay(),null,2));
