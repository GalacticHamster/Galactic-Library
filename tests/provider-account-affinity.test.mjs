// Synthetic transition checks against original acquisition functions and real writers.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {readFanaticalOrdersInPage as gl} from './fixtures/fanatical-pre-adoption-gl.mjs';
import {importFanaticalOrdersInPage as fan} from './fixtures/fanatical-pre-adoption-fan.mjs';
import {importFanaticalOrdersInPage as productionFan} from '../../Fanatical/src/order-importer.mjs';
import {importFanaticalOrdersInPage as candidate} from '../shared/fanatical-acquisition.js';
import {candidateFiles} from './provider-candidate-build.mjs';
import {fanaticalWorker,fanaticalOrder} from './fanatical-coverage.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';

const a=fanaticalOrder(1),b=fanaticalOrder(2),foreign=fanaticalOrder(3);
const hash=id=>createHash('sha256').update(id).digest('hex');
const known=[hash(a._id),hash(b._id)];
const cases=[
  ['new empty',{list:[],known:[],headers:{'x-total-count':'0'}},'complete'],
  ['existing empty Full',{list:[],fullScan:true},'empty'],
  ['existing empty Quick',{list:[],fullScan:false},'empty'],
  ['populated then verified empty',{list:[],headers:{'x-total-count':'0'}},'withhold'],
  ['populated then unverified empty',{list:[]},'empty'],
  ['partial overlap',{list:[a]},'withhold'],
  ['disjoint listing',{list:[foreign]},'conflict'],
  ['conflicting saved account evidence',{list:[a],known:[],accountKnown:[hash(foreign._id)]},'conflict'],
  ['session changed',{list:[a,b],sessionChange:true},'session'],
  ['missing known incomplete',{list:[a],headers:{'x-total-count':'2'}},'withhold'],
  ['missing known complete',{list:[a],headers:{'x-total-count':'1'}},'withhold'],
  ['later page failed',{list:[a],headers:{link:'</api/user/orders?page=2>; rel="next"'},next:{status:404}},'withhold'],
  ['restored checkpoint empty',{list:[]},'empty'],
  ['restored checkpoint incomplete',{list:[a],headers:{'x-total-count':'2'},fullScan:false},'withhold']
];
async function acquire(engine,input={}){
  let reads=0;const paths=[];
  const context=vm.createContext({URL,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,
    localStorage:{getItem:()=>JSON.stringify({token:input.sessionChange&&reads++?'CHANGED':'SYNTHETIC'})},
    fetch:async path=>{paths.push(path);const response=path==='/api/user/orders'?{data:input.list??[a,b],headers:input.headers??{}}:path.includes('?')?input.next:{data:[a,b,foreign].find(o=>path.endsWith(o._id))};return {status:response?.status??200,headers:new Headers(response?.headers??{}),json:async()=>structuredClone(response?.data)};}});
  const result=await vm.runInContext('('+engine.toString()+')',context)({fullScan:input.fullScan??true,knownOrderFingerprints:input.known??known,accountOrderFingerprints:input.accountKnown??input.known??known,allowPartial:true,returnFailure:true,diagnostics:true});
  return {result:structuredClone(result),paths};
}
for(const [name,input,policy]of cases)test('account transition: '+name,async()=>{
  for(const engine of [gl,fan,candidate]){
    const {result:r}=await acquire(engine,input),fatal=Boolean(r.fanaticalFailure||r.fanaticalImportFailure);
    if(engine===candidate){
      if(['conflict','session'].includes(policy)){assert(fatal);assert.equal(r.code,policy==='session'?'session-changed':'account-scope-conflict');continue;}
      assert(!fatal,JSON.stringify(r));assert.equal(r.acquisitionContract.reconciliation.authority,'none');assert.equal(r.acquisitionContract.persistence.outcome,'not-attempted');
      if(policy==='empty'){assert.equal(r.acquisitionContract.acquisition.outcome,'finished');assert.equal(r.acquisitionContract.coverage.status,'unverified');assert.equal(r.coverage.accountAffinity,'declared-scope');assert.deepEqual(r.orderFingerprints,[]);assert.deepEqual(r.items,[]);assert.deepEqual(r.acquisitionContract.verified,[]);assert.deepEqual(r.acquisitionContract.retry,[]);}
      if(policy==='complete')assert.equal(r.coverage.complete,true);
      if(policy==='withhold'){assert.equal(r.coverage.complete,false);assert.equal(r.acquisitionContract.acquisition.outcome,'interrupted');}
    }else if(policy==='empty'){
      // Original FAN rejects absent affinity; original GL accepts headerless empty.
      assert.equal(fatal,engine===fan);
    }else if(policy==='conflict'&&name==='conflicting saved account evidence'&&engine===gl){
      // GL's original API has only knownOrderFingerprints, not FAN's separate
      // retained provenance affinity input. Its worker supplies that authority.
      assert(!fatal);
    }else if(policy==='session'||policy==='conflict')assert(fatal);
    else if(policy==='complete')assert.equal(r.coverage.complete,true);
    else if(engine===fan){if(name==='populated then verified empty')assert(fatal);else assert.equal(r.coverage.complete,false);}
    else assert(fatal||r.coverage.complete===false);
  }
});

// Reuse the existing FAN safety fixture without importing/registering its tests.
// No application source substitutions except the chosen acquisition function.
async function fanHarness(engine){
  const url=new URL('../../Fanatical/tests/import-safety.test.mjs',import.meta.url);
  const original=await readFile(url,'utf8'),start=original.indexOf('function harness('),end=original.indexOf('\ntest(',start);
  let fixture=original.slice(0,original.indexOf('\ntest('))+original.slice(start,end)+'\nexport {harness};';
  fixture=fixture.replace(/import \{importFanaticalOrdersInPage\} from '[^']+';/u,`const importFanaticalOrdersInPage=${engine.toString()};`);
  fixture=fixture.replace('await prepareWorker({url:workerSourceURL()})',"await prepareWorker({url:workerSourceURL(),load:async target=>target.endsWith('/order-importer.mjs')?{importFanaticalOrdersInPage}:import(target)})");
  fixture=fixture.replace(/from '(\.\.?\/[^']+)'/gu,(_,path)=>`from '${new URL(path,url).href}'`).replaceAll('import.meta.url',JSON.stringify(url.href));
  return (await import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'))).harness;
}
const candidateGL=vm.runInNewContext((await candidateFiles('GL',new Map())).get('src/providers/fanatical-scan.js').toString().replace('export async function','async function')+';readFanaticalOrdersInPage;');

for(const useCandidate of [false,true])test('GL real writer: Full empty then Quick empty preserves purchases/history/corrections/checkpoint '+useCandidate,()=>fanaticalWorker(async h=>{
  if(useCandidate){const execute=chrome.scripting.executeScript;chrome.scripting.executeScript=args=>execute({...args,func:candidateGL});}
  h.setOrders([a,b]);h.setHeaders({'x-total-count':'2'});assert((await h.commit(await h.acquire())).result.ok);
  h.setOrders([a]);h.setHeaders({'x-total-count':'1'});assert((await h.commit(await h.acquire())).result.ok);
  let db=await h.pageA.getDatabase();const item=Object.values(db.providerItems)[0];
  await h.pageA.saveOwnershipCorrections([ownershipCorrectionTarget(item,db)],{ownership:'returned',note:'Synthetic correction'});
  db=await h.pageA.getDatabase();await h.pageA.restoreDatabase(parseBackup(createBackup(db)));
  const before=await h.pageA.getDatabase();h.setOrders([]);h.setHeaders({});
  for(const mode of ['full','incremental']){
    const acquired=await h.acquire(mode);assert(acquired.projection.ok,acquired.projection.error);assert.equal(acquired.projection.result.acquisitionComplete,true);assert.equal(acquired.projection.result.coverage.complete,false);assert((await h.commit(acquired)).result.ok);
    db=await h.pageB.getDatabase();for(const key of ['providerItems','providerHistory','ownershipReviews'])assert.deepEqual(db[key],before[key]);
    assert.equal(Object.keys(db.providerItems).length,47);assert.equal(Object.keys(db.providerHistory).length,47);
    assert.equal(db.providers.fanatical.fullSyncAt,before.providers.fanatical.fullSyncAt);assert.deepEqual(db.providers.fanatical.syncState.knownOrderFingerprints,before.providers.fanatical.syncState.knownOrderFingerprints);
  }
  h.setOrders([foreign]);const rejected=await h.acquire('incremental');assert.equal(rejected.projection.ok,false);db=await h.pageA.getDatabase();assert.deepEqual(db.providerItems,before.providerItems);assert.deepEqual(db.providerHistory,before.providerHistory);
}));

for(const engine of [productionFan,candidate])test('FAN real worker/writer: empty Full/Quick, conflict and retry '+(engine===candidate?'canonical':'production'),async()=>{
  const harness=await fanHarness(engine);let listing=[a,b],headers={'x-total-count':'2'},fail=false;
  const h=harness({partial:true,initial:{fanaticalLibraryItems:[],fanaticalImportSummary:null},respond:async path=>path==='/api/user/orders'?{status:200,data:listing,headers}:{status:fail&&path.endsWith(b._id)?404:200,data:[a,b,foreign].find(o=>path.endsWith(o._id))}});
  // The listener replies before its finally handler releases the in-process
  // lease. Drain that microtask chain, as the existing FAN harness tests do.
  const send=async full=>{const reply=await h.send(full);await new Promise(resolve=>setImmediate(resolve));return reply;};
  assert.equal((await send(true)).ok,true);const before=structuredClone(h.stored);
  listing=[];headers={};
  for(const full of [true,false]){const reply=await send(full);assert.equal(reply.ok,true,reply.error);assert.equal(reply.summary.acquisitionComplete,true);assert.equal(reply.summary.coverage.complete,false);
    for(const key of ['fanaticalLibraryItems','fanaticalHistoricalItems','fanaticalScannedOrderFingerprints','fanaticalImportSummary','fanaticalAccountId'])assert.deepEqual(h.stored[key],before[key]);}
  listing=[foreign];assert.equal((await send(false)).ok,false);assert.deepEqual(h.stored.fanaticalLibraryItems,before.fanaticalLibraryItems);
  listing=[a,b];headers={'x-total-count':'2'};fail=true;const interrupted=await send(true);assert(interrupted.ok,interrupted.error);assert.equal(interrupted.summary.acquisitionComplete,false);assert.equal(h.stored.fanaticalScannedOrderFingerprints.includes(hash(b._id)),false);assert.deepEqual(h.stored.fanaticalLibraryItems,before.fanaticalLibraryItems);
  fail=false;const recovered=await send(false);assert(recovered.ok,recovered.error);assert.equal(recovered.summary.acquisitionComplete,true);assert(h.stored.fanaticalScannedOrderFingerprints.includes(hash(b._id)));assert.deepEqual(h.stored.fanaticalLibraryItems,before.fanaticalLibraryItems);
});

for(const useCandidate of [false,true])test('GL real writer: unknown statuses, stale leases, failed storage and restored history retain authority boundaries '+useCandidate,()=>fanaticalWorker(async h=>{
  if(useCandidate){const execute=chrome.scripting.executeScript;chrome.scripting.executeScript=args=>execute({...args,func:candidateGL});}
  h.setOrders([a,b]);h.setHeaders({'x-total-count':'2'});assert((await h.commit(await h.acquire())).result.ok);
  let before=await h.pageA.getDatabase();const item=Object.values(before.providerItems)[0];
  await h.pageA.saveOwnershipCorrections([ownershipCorrectionTarget(item,before)],{ownership:'returned',note:'Synthetic correction'});before=await h.pageA.getDatabase();
  h.setOrders([a,{...b,status:'UNKNOWN_PROVIDER_STATUS'}]);const partial=await h.acquire();assert(partial.projection.ok,partial.projection.error);assert.equal(partial.projection.result.coverage.complete,false);assert.equal(partial.projection.result.recovery.failedOrders,1);assert((await h.commit(partial)).result.ok);
  let after=await h.pageA.getDatabase();assert.deepEqual(Object.keys(after.providerItems),Object.keys(before.providerItems));
  for(const [id,previous]of Object.entries(before.providerItems)){
    const actual=after.providerItems[id];
    if(previous.providerItemId.startsWith('product-2-'))assert.deepEqual(actual,previous,'Unresolved purchase changed');
    else{
      // The independently reread order legitimately advances observation
      // timestamps. Preserve every identity, ownership and provenance field.
      assert(actual.observedAt>=previous.observedAt);assert(actual.updatedAt>=previous.updatedAt);
      const expected=structuredClone(previous);expected.observedAt=actual.observedAt;expected.updatedAt=actual.updatedAt;
      for(const origin of expected.metadata.purchaseOrigins){const current=actual.metadata.purchaseOrigins.find(row=>row.occurrenceRef===origin.occurrenceRef);assert(current);assert(current.observedAt>=origin.observedAt);origin.observedAt=current.observedAt;}
      assert.deepEqual(actual,expected);
    }
  }
  assert.deepEqual(after.providerHistory,before.providerHistory);assert.deepEqual(after.ownershipReviews,before.ownershipReviews);assert.equal(after.providers.fanatical.fullSyncAt,before.providers.fanatical.fullSyncAt);
  h.setOrders([a,b]);assert((await h.commit(await h.acquire('incremental'))).result.ok);
  before=await h.pageA.getDatabase();const stale=await h.acquire();const fresh=await h.acquire();assert.equal((await h.commit(stale)).result.ok,false);assert.deepEqual((await h.pageA.getDatabase()).providerItems,before.providerItems);assert((await h.commit(fresh)).result.ok);
  h.setOrders([a,b,foreign]);h.setHeaders({'x-total-count':'3'});const pending=await h.acquire(),baseline=await h.pageA.getDatabase(),set=h.memory.area.set;
  h.memory.area.set=async patch=>{if(patch.galacticLibraryDatabase)throw Error('Synthetic storage rejection');return set(patch);};
  try{assert.equal((await h.commit(pending)).result.ok,false);}finally{h.memory.area.set=set;}
  after=await h.pageA.getDatabase();assert.deepEqual(after.providerItems,baseline.providerItems);assert.deepEqual(after.providerHistory,baseline.providerHistory);assert.deepEqual(after.ownershipReviews,baseline.ownershipReviews);assert.deepEqual(after.providers.fanatical.syncState,baseline.providers.fanatical.syncState);
  await h.pageA.restoreDatabase(parseBackup(createBackup(before)));h.setOrders([]);h.setHeaders({});assert((await h.commit(await h.acquire())).result.ok);after=await h.pageB.getDatabase();assert.deepEqual(after.providerItems,before.providerItems);assert.deepEqual(after.ownershipReviews,before.ownershipReviews);
}));
