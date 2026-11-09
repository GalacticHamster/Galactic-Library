// Read-only canonical generation and adopted-source check. No dist writes.
import {resolve,dirname} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {candidateFiles,candidateSidecar,verifyCandidateBundle} from './provider-engine-build.mjs';
const args=process.argv.slice(2),selected=args.find(arg=>arg.startsWith('--consumer='))?.split('=')[1];
if(!args.includes('--check')||args.some(arg=>arg!=='--check'&&!/^--consumer=(GL|FAN)$/u.test(arg)))throw Error('Usage: node scripts/sync-provider-engines.mjs --check [--consumer=GL|FAN]. Verification writes no runtime source.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const consumer of selected?[selected]:['GL','FAN']){
  const consumerRoot=consumer==='GL'?root:resolve(root,'../Fanatical');
  const builder=await import(pathToFileURL(resolve(consumerRoot,'scripts/release.mjs')));
  for(const target of ['chrome','firefox']){
    const input=await builder.createRelease(consumerRoot,undefined,target),files=await candidateFiles(consumer,input.files),sidecar=candidateSidecar(files);
    const required=consumer==='GL'?['src/providers/fanatical-scan.js']:['src/order-importer.mjs','src/acquisition-contract.mjs','src/service-worker.js'];
    for(const name of required)if(!input.files.get(name)?.equals(files.get(name)))throw Error('Active provider mirror differs from canonical source: '+name);
    const archive=builder.runtimeZip(input.files);verifyCandidateBundle(consumer,builder.readRuntimeZip(archive),sidecar.pin,sidecar);
    console.log(`${consumer} ${target}: authoritative revision ${sidecar.pin.revision}; active source and archive verified; no files changed.`);
  }
}
