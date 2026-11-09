// Reversible Gate 4 test bundles. Does not write runtime mirrors or dist artifacts.
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const read=async path=>(await readFile(new URL(path,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const digest=value=>createHash('sha256').update(value).digest('hex');
const sidecars=new WeakMap();
export function candidateSidecar(files){const sidecar=sidecars.get(files);if(!sidecar)throw Error('Candidate build sidecar is missing.');return structuredClone(sidecar);}
export function verifyCandidateBundle(consumer,files,expectedPin,lock=candidateSidecar(files)){
  if(lock.consumer!==consumer||JSON.stringify(lock.pin)!==JSON.stringify(expectedPin))throw Error('Candidate source revision differs from the intended offline pin.');
  if(Object.keys(lock.files).length!==files.size)throw Error('Candidate archive file inventory modified.');
  const names=consumer==='GL'?['src/providers/fanatical-scan.js']:['src/order-importer.mjs','src/acquisition-contract.mjs','src/service-worker.js'];
  for(const name of names)if(!files.has(name))throw Error('Candidate required runtime file missing: '+name);
  for(const [name,bytes]of files)if(lock.files[name]!==digest(bytes))throw Error('Candidate mirror modified: '+name);
  const primary=consumer==='GL'?'src/providers/fanatical-scan.js':'src/order-importer.mjs';
  if(digest(files.get(primary))!==(consumer==='GL'?expectedPin.consumers?.GL:expectedPin.engine))throw Error('Candidate authoritative source modified: '+primary);
  if(consumer==='FAN'&&digest(files.get('src/acquisition-contract.mjs'))!==expectedPin.contract)throw Error('Candidate authoritative validator modified.');
  return true;
}
export async function candidateFiles(consumer,input){
  const engine=await read('../shared/fanatical-acquisition.js'),adapter=await read('../src/providers/fanatical-acquisition-adapter.js');
  const contract=await read('../shared/provider-acquisition-contract.js');
  const pin=JSON.parse(await read('../shared/fanatical-acquisition-pin.json'));
  return buildCandidateFiles(consumer,input,{engine,adapter,contract,pin});
}
// Pure offline construction: each consumer can use a pinned source bundle,
// independently of another checkout, filesystem discovery or network access.
export function buildCandidateFiles(consumer,input,{engine,adapter,contract,pin}){
  if(pin.contractVersion!==1||pin.engine!==digest(engine)||pin.adapter!==digest(adapter)||pin.contract!==digest(contract)||pin.revision!==`fanatical-v1-${digest(pin.engine+pin.adapter+pin.contract).slice(0,16)}`)throw Error('Candidate revision/digest mismatch; do not relabel or regenerate a pin automatically.');
  const files=new Map(input);
  const validator=contract.slice(contract.indexOf('export function fanaticalCompatibilityReport')).replaceAll('export function','function');
  if(consumer==='GL')files.set('src/providers/fanatical-scan.js',Buffer.from(`// Pinned acquisition ${pin.revision}; contract 1; SHA-256 ${pin.engine}\nexport async function readFanaticalOrdersInPage(options={}){\n${engine.replace('export async function','async function')}\n${validator}\n${adapter.replace(/^import .*;\r?\n/gmu,'').replace('export function','function')}\nreturn fanaticalAcquisitionForGL(await importFanaticalOrdersInPage({...options,allowPartial:true,returnFailure:true,progressFormat:'gl'}),options);\n}\n`));
  else if(consumer==='FAN'){
    files.set('src/order-importer.mjs',Buffer.from(engine));
    files.set('src/acquisition-contract.mjs',Buffer.from(contract));
    if(files.has('src/service-worker.js')){
      const worker=files.get('src/service-worker.js').toString(),needle='  const projected = validateScanResult(result[0]?.result, { fullScan, knownOrderFingerprints });';
      if(!worker.includes(needle))throw Error('Candidate FAN worker boundary changed.');
      const boundaryImport="import {assertFanaticalAcquisitionContract,fanaticalCompatibilityReport} from './acquisition-contract.mjs';\n";
      const admission="  const authority=assertFanaticalAcquisitionContract(result[0]?.result,{fullScan,knownOrderFingerprints,accountOrderFingerprints});\n";
      const consistency="\n  if(authority.finished!==(projected.acquisitionComplete??true))throw Error('Fanatical acquisition/writer completeness disagreement.');";
      if(worker.includes(boundaryImport)){
        if(!worker.includes(admission+needle+consistency)||worker.split(boundaryImport).length!==2)throw Error('Candidate FAN boundary is inconsistent.');
      }else files.set('src/service-worker.js',Buffer.from(boundaryImport+worker.replace(needle,admission+needle+consistency)));
    }
  }
  else throw Error('Unknown candidate consumer');
  const primary=consumer==='GL'?'src/providers/fanatical-scan.js':'src/order-importer.mjs';
  if(digest(files.get(primary))!==pin.consumers?.[consumer])throw Error('Candidate generated consumer digest mismatch.');
  // Build provenance is a sidecar, never an extension runtime resource. The
  // exact inventory covers every archive file, including untouched resources.
  sidecars.set(files,{consumer,pin:structuredClone(pin),files:Object.fromEntries([...files].map(([name,bytes])=>[name,digest(bytes)]))});
  return files;
}
