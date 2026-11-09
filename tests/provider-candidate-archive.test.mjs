import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {webcrypto,createHash} from 'node:crypto';
import {createRelease,runtimeZip,readRuntimeZip} from '../../Fanatical/scripts/release.mjs';
import {createRelease as glRelease,runtimeZip as glZip,readRuntimeZip as glReadZip} from '../scripts/release.mjs';
import {candidateFiles,candidateSidecar,verifyCandidateBundle,buildCandidateFiles} from './provider-candidate-build.mjs';
const production=await createRelease(),productionGL=await glRelease(),files=await candidateFiles('FAN',production.files),sidecar=candidateSidecar(files),zip=runtimeZip(files);
const sources={};for(const [key,path]of [['engine','../shared/fanatical-acquisition.js'],['adapter','../src/providers/fanatical-acquisition-adapter.js'],['contract','../shared/provider-acquisition-contract.js']])sources[key]=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/\r\n/g,'\n');sources.pin=sidecar.pin;
test('FAN original and candidate archives pass the actual FAN writer/reader with no build metadata',()=>{
  assert.equal(readRuntimeZip(production.zip).size,production.files.size);const extracted=readRuntimeZip(zip);assert(verifyCandidateBundle('FAN',extracted,sidecar.pin,sidecar));
  assert(![...extracted.keys()].some(path=>path.includes('provider-engine-lock')||path.endsWith('sidecar.json')));
  assert(extracted.has('src/acquisition-contract.mjs'));assert(extracted.get('src/service-worker.js').toString().includes('assertFanaticalAcquisitionContract'));
});
test('the engine and validator from the admitted FAN archive execute together',async()=>{
  const extracted=readRuntimeZip(zip),engine=extracted.get('src/order-importer.mjs').toString().replace('export async function','async function');
  const context=vm.createContext({URL,TextEncoder,AbortController,setTimeout,clearTimeout,crypto:webcrypto,localStorage:{getItem:()=>'{"token":"SYNTHETIC"}'},fetch:async()=>({status:200,headers:new Headers({'x-total-count':'0'}),json:async()=>[]})});
  const receipt=await vm.runInContext(engine+';importFanaticalOrdersInPage;',context)({fullScan:true,allowPartial:true});
  const validator=await import('data:text/javascript;base64,'+extracted.get('src/acquisition-contract.mjs').toString('base64'));
  assert.equal(validator.assertFanaticalAcquisitionContract(receipt,{fullScan:true}).finished,true);
});
test('unexpected archive paths remain forbidden and required contract files cannot disappear',()=>{
  const extra=new Map(files);extra.set('shared/provider-engine-lock.json',Buffer.from('{}'));assert.throws(()=>readRuntimeZip(runtimeZip(extra)),/Invalid ZIP runtime path/);
  const missing=new Map(files);missing.delete('src/acquisition-contract.mjs');assert.throws(()=>readRuntimeZip(runtimeZip(missing)),/Missing runtime dependency/);
  assert.throws(()=>verifyCandidateBundle('FAN',missing,sidecar.pin,sidecar),/inventory modified|required runtime/);
});
for(const name of ['src/order-importer.mjs','src/acquisition-contract.mjs','manifest.json'])test('exact archive sidecar rejects modified '+name,()=>{
  const changed=new Map(files);changed.set(name,Buffer.concat([files.get(name),Buffer.from('\n')]));
  const extracted=readRuntimeZip(runtimeZip(changed));assert.throws(()=>verifyCandidateBundle('FAN',extracted,sidecar.pin,sidecar),/mirror modified/);
});
for(const name of ['src/order-importer.mjs','src/acquisition-contract.mjs'])test('sidecar cannot relabel modified authoritative source as the pinned revision: '+name,()=>{
  const changed=new Map(files);changed.set(name,Buffer.concat([files.get(name),Buffer.from('\n')]));const declaration=structuredClone(sidecar);declaration.files[name]=createHash('sha256').update(changed.get(name)).digest('hex');
  assert.throws(()=>verifyCandidateBundle('FAN',readRuntimeZip(runtimeZip(changed)),sidecar.pin,declaration),/authoritative.*modified/);
});
test('incorrect revision and source pins cannot construct or validate a candidate',()=>{
  for(const patch of [{pin:{...sources.pin,revision:'incorrect'}},{engine:sources.engine+'\n'},{contract:sources.contract+'\n'}])assert.throws(()=>buildCandidateFiles('FAN',production.files,{...sources,...patch}),/revision\/digest/);
  assert.throws(()=>verifyCandidateBundle('FAN',readRuntimeZip(zip),sources.pin,{...sidecar,pin:{...sidecar.pin,revision:'incorrect'}}),/revision/);
});
test('independent offline construction needs only the consumer inputs and pinned source bundle',async()=>{
  // Loaded from a data URL: relative checkout discovery cannot work. All
  // build inputs are explicit; no network or sibling imports are available.
  const helper=await import('data:text/javascript;base64,'+(await readFile(new URL('../scripts/provider-engine-build.mjs',import.meta.url))).toString('base64'));
  for(const consumer of ['FAN','GL']){
    const input=consumer==='FAN'?production.files:productionGL.files;const offline=helper.buildCandidateFiles(consumer,input,sources),lock=helper.candidateSidecar(offline);
    const writer=consumer==='FAN'?runtimeZip:glZip,reader=consumer==='FAN'?readRuntimeZip:glReadZip,archive=writer(offline),extracted=reader(archive);
    if(consumer==='FAN')assert.deepEqual(archive,zip);
    assert(helper.verifyCandidateBundle(consumer,extracted,sources.pin,lock));
    // Rebuilding from the consumer's own generated source must not depend on
    // a pristine sibling checkout or inject the worker boundary a second time.
    const rebuilt=helper.buildCandidateFiles(consumer,extracted,sources);assert.deepEqual(writer(rebuilt),archive);
  }
});
