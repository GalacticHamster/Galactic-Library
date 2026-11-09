import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {candidateFiles,verifyCandidateBundle,candidateSidecar} from './provider-candidate-build.mjs';
import {assertFanaticalAcquisitionContract as check} from '../shared/provider-acquisition-contract.js';
import {importFanaticalOrdersInPage} from '../shared/fanatical-acquisition.js';
import {fanaticalAcquisitionForGL} from '../src/providers/fanatical-acquisition-adapter.js';
const pin=JSON.parse(await readFile(new URL('../shared/fanatical-acquisition-pin.json',import.meta.url)));
const order={_id:'synthetic-order',status:'COMPLETE',items:[{_id:'synthetic-bundle',name:'Synthetic',bundles:[{games:[{_id:'synthetic-product',name:'Synthetic book',type:'book'}]}]}]};
const context=vm.createContext({URL,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,localStorage:{getItem:()=>'{"token":"SYNTHETIC"}'},fetch:async path=>({status:200,headers:new Headers({'x-total-count':'1'}),json:async()=>path==='/api/user/orders'?[order]:order})});
const valid=structuredClone(await vm.runInContext('('+importFanaticalOrdersInPage.toString()+')',context)({allowPartial:true,fullScan:true}));
test('boundary accepts actual candidate evidence with no persistence authority',()=>{assert.equal(check(valid,{fullScan:true}).finished,true);assert.equal(fanaticalAcquisitionForGL(valid,{fullScan:true}).coverage.complete,true);});
test('corrupt checkpoints confer no account authority; valid foreign provenance still rejects',()=>{
  for(const knownOrderFingerprints of [null,['damaged'],[42,null,'not-a-fingerprint']]){
    assert.equal(check(valid,{fullScan:true,knownOrderFingerprints}).finished,true);
  }
  assert.throws(()=>check(valid,{fullScan:true,knownOrderFingerprints:['a'.repeat(64),'damaged']}),/contract/);
  assert.throws(()=>check(valid,{fullScan:true,accountOrderFingerprints:['a'.repeat(64)]}),/contract/);
  const matching=structuredClone(valid);matching.acquisitionContract.scope.authority=matching.coverage.accountAffinity='saved-order-match';
  assert.equal(check(matching,{fullScan:true,knownOrderFingerprints:[matching.observedOrderFingerprints[0].toUpperCase()]}).scope,'saved-order-match');
});
for(const [name,mutate]of [
  ['missing contract',r=>delete r.acquisitionContract],['version',r=>r.acquisitionContract.version=2],['provider',r=>r.acquisitionContract.provider='humble'],
  ['extra field',r=>r.acquisitionContract.rawResponse='PRIVATE'],['diagnostic authority',r=>r.diagnostic={acquisitionComplete:true}],
  ['false acquisition',r=>r.acquisitionContract.acquisition.outcome='interrupted'],['false coverage',r=>r.acquisitionContract.coverage.status='unverified'],
  ['false scope',r=>r.acquisitionContract.scope.authority='saved-order-match'],['persistence',r=>r.acquisitionContract.persistence.outcome='committed'],
  ['reconciliation',r=>r.acquisitionContract.reconciliation.authority='replace'],['partition',r=>r.acquisitionContract.unresolved=r.acquisitionContract.verified],
  ['retry',r=>r.acquisitionContract.retry=r.acquisitionContract.verified],['foreign scope',r=>{}],['false counts',r=>r.ordersScanned=0]
])test('boundary rejects '+name,()=>{const raw=structuredClone(valid);mutate(raw);const options=name==='foreign scope'?{accountOrderFingerprints:['a'.repeat(64)]}:{fullScan:true};assert.throws(()=>check(raw,options),/contract/);assert.throws(()=>fanaticalAcquisitionForGL(raw,options),/contract/);});

for(const consumer of ['GL','FAN'])test('pinned '+consumer+' candidate verifies offline and detects modified mirrors and mislabeled skew',async()=>{
  const input=new Map();if(consumer==='FAN')input.set('src/service-worker.js',await readFile(new URL('../../Fanatical/src/service-worker.js',import.meta.url)));
  const files=await candidateFiles(consumer,input);assert(verifyCandidateBundle(consumer,files,pin));
  if(consumer==='FAN')assert.equal(files.get('src/order-importer.mjs').toString(),(await readFile(new URL('../shared/fanatical-acquisition.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n'));
  const name=consumer==='GL'?'src/providers/fanatical-scan.js':'src/order-importer.mjs',changed=new Map(files);changed.set(name,Buffer.concat([files.get(name),Buffer.from('\n// modified')]));
  const sidecar=candidateSidecar(files);
  assert.throws(()=>verifyCandidateBundle(consumer,changed,pin,sidecar),/modified/);assert.throws(()=>verifyCandidateBundle(consumer,files,{...pin,revision:'incorrectly-labeled'}),/revision/);
  // The peer's revision is deliberately not consulted: independently built
  // extensions retain their own pin. Purchase sync remains protocol v1.
  assert(verifyCandidateBundle(consumer,new Map(files),pin,sidecar));
});
