// Synthetic compatibility cases. These do not establish the real A/B/C schema.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {webcrypto,createHash} from 'node:crypto';
import {importFanaticalOrdersInPage as canonical} from '../shared/fanatical-acquisition.js';
import {importFanaticalOrdersInPage as fan} from '../../Fanatical/src/order-importer.mjs';
import {readFanaticalOrdersInPage as gl} from '../src/providers/fanatical-scan.js';
import {fanaticalCompatibilityReport,assertFanaticalAcquisitionContract} from '../shared/provider-acquisition-contract.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const order=i=>({_id:`synthetic-order-${i}`,status:'COMPLETE',items:[{_id:'synthetic-bundle',name:'Bundle',bundles:[{games:[{_id:`synthetic-product-${i}`,name:`Book ${i}`,type:'book'}]}]}]});
const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,v])=>[k,reorder(v)])):v;
async function run(engine,{list=[order(0)],details=list,known=[],fullScan=true,headers={},detailStatus=200}={}){
 const paths=[],scope={URL,Headers,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:webcrypto,localStorage:{getItem:()=>JSON.stringify({token:'PRIVATE_TOKEN'})},fetch:async path=>{paths.push(path);const listing=path==='/api/user/orders',status=listing?200:detailStatus;return {ok:status===200,status,headers:new Headers(listing?headers:{}),json:async()=>structuredClone(listing?list:details.find(o=>path.endsWith(o._id)))};}};
 const result=structuredClone(await vm.runInNewContext('('+engine.toString()+')',scope)({fullScan,knownOrderFingerprints:known,accountOrderFingerprints:known,allowPartial:true,returnFailure:true,diagnostics:true}));
 const diagnostic=engine===gl?result.diagnostic?.compatibility:result.coverage?.compatibility??result.diagnostic?.compatibility;
 assert(diagnostic);assert(!/PRIVATE_TOKEN|synthetic-order-|Book |synthetic-product-/.test(JSON.stringify(diagnostic)));
 return {result,compatibility:diagnostic,counts:diagnostic.counts,paths};
}
for(const [name,engine]of [['canonical',canonical],['FAN mirror',fan],['GL callable',gl]]){
 test(name+': rejected bundle containers export shapes, never alternate ownership or private values',async()=>{
  const leaf={_id:'PRIVATE_ID',name:'PRIVATE_TITLE',token:'PRIVATE_TOKEN'};
  for(const [bundles,type,size,reason]of [[[], 'array','empty','empty-array'],[{},'object','empty','non-array'],[{games:[leaf]},'object','one','non-array'],[{PRIVATE_KEY:{games:[leaf]}},'object','one','non-array'],[{PRIVATE_KEY:{games:[leaf]},PRIVATE_SECOND:{games:[leaf]}},'object','many','non-array'],['PRIVATE_STRING','string','not-container','non-array'],[42,'number','not-container','non-array'],[false,'boolean','not-container','non-array'],[null,'null','not-container','missing'],[undefined,'missing','not-container','missing']]){
   const bad=order(1);Object.assign(bad.items[0],{name:'PRIVATE_TITLE',bundles,products:[leaf],tiers:[{token:'PRIVATE_TOKEN'}]});
   const r=await run(engine,{list:[order(0),bad]});const shapes=r.compatibility.bundleShapes,record=shapes.records[0];
   assert.equal(shapes.version,1);assert.equal(shapes.truncated,false);assert.equal(shapes.records.length,1);assert.equal(record.stage,'summaries');assert.equal(record.reason,reason);assert.equal(record.bundlesType,type);assert.equal(record.bundlesSize,size);assert.equal(record.parentProducts,'array');assert.equal(record.parentTiers,'array');assert.equal(record.parentName,'string');
   assert.equal(r.result.items.length,1);assert.equal(r.counts.scheduled,1);assert.equal(r.paths.length,2);assert.equal(r.result.coverage.complete,false);assert.equal(r.counts[reason==='missing'?'missingBundles':'invalidBundles'],1);assert(!/PRIVATE|42/.test(JSON.stringify(shapes)));
   if(bundles?.games)assert.equal(record.bundleGames,'array');if(bundles?.PRIVATE_KEY)assert.equal(record.childGames,'array');
   if(engine===gl)assert(!r.result.coverage.compatibility,'diagnostics cannot enter GL stored coverage');
  }
 });
 test(name+': shape collection is capped and detail failures retain their own stage',async()=>{
  const bad=Array.from({length:10},(_,i)=>{const o=order(i+1);o.items[0].bundles=[];return o;});
  const r=await run(engine,{list:[order(0),...bad]});assert.equal(r.compatibility.bundleShapes.records.length,8);assert.equal(r.compatibility.bundleShapes.truncated,true);assert.equal(r.counts.invalidBundles,10);assert.equal(r.result.items.length,1);
  const detail=order(1);detail.items[0].bundles={games:[{name:'PRIVATE_TITLE'}]};const d=await run(engine,{list:[order(0),order(1)],details:[order(0),detail]});assert.equal(d.compatibility.bundleShapes.records[0].stage,'details');assert.equal(d.compatibility.bundleShapes.records[0].bundleGames,'array');assert.equal(d.counts.detailStructure,1);assert.equal(d.result.items.length,1);
 });
 test(name+': reordered identical JSON summaries do not quarantine a legitimate purchase',async()=>{
  const a=order(0),r=await run(engine,{list:[a,reorder(a)]});assert.equal(r.result.items.length,1);assert.equal(r.counts.summaryConflict,0);assert.equal(r.counts.scheduled,1);assert.equal(r.result.coverage.complete,false);
 });
 test(name+': changed status, arbitrary gift metadata, multiplicity and array order remain conflicts',async()=>{
  for(const mutate of [o=>{o.status='REFUNDED';},o=>{o.gift={sent:true};},o=>{o.items[0].bundles[0].games.push({...o.items[0].bundles[0].games[0]});},o=>{o.items.reverse();}]){
   const a=order(0);a.items.push({...structuredClone(a.items[0]),name:'Other bundle'});const b=structuredClone(a);mutate(b);const r=await run(engine,{list:[a,b]});assert.equal(r.counts.summaryConflict,1);assert.equal(r.counts.scheduled,0);assert.equal(r.paths.length,1);assert(!r.result.items?.length);
  }
 });
 test(name+': A/B-like Full patterns distinguish unsupported statuses from malformed structures',async()=>{
  const a=order(0),bad=[{...order(1),status:'UNKNOWN_GIFT_STATUS'},{...order(2),status:null},{...order(3),items:null},{...order(4),items:[]},order(5),order(6),order(7),order(8)];
  delete bad[4].items[0].bundles;bad[5].items[0].bundles={};delete bad[6].items[0].bundles[0].games;bad[7].items[0].bundles[0].games=[{name:''}];
  const r=await run(engine,{list:[a,...bad]});assert.equal(r.result.items.length,1);for(const key of ['unsupportedStatus','invalidStatus','missingItems','invalidItems','missingBundles','invalidBundles','missingGames','missingNames'])assert.equal(r.counts[key],1,key);assert.equal(r.counts.scheduled,1);assert.equal(r.counts.knownSkipped,0);assert.equal(r.result.coverage.complete,false);
 });
 test(name+': C-like Quick checks validated summaries, skips four known purchases, retries four unresolved',async()=>{
  const good=Array.from({length:4},(_,i)=>order(i)),bad=Array.from({length:4},(_,i)=>({...order(i+4),status:'UNKNOWN_STATUS'})),known=good.map(o=>hash(o._id));
  const r=await run(engine,{list:[...good,...bad],known,fullScan:false});assert.equal(r.counts.knownSkipped,4);assert.equal(r.counts.unsupportedStatus,4);assert.equal(r.counts.scheduled,0);assert.equal(r.paths.length,1);assert.equal(r.result.coverage?.complete??false,false);
  const repaired=await run(engine,{list:[...good,...bad.map(o=>({...o,status:'COMPLETE'}))],known,fullScan:false});assert.equal(repaired.counts.scheduled,4);assert.equal(repaired.paths.length,5);assert.equal(repaired.result.items.length,4);
 });
 test(name+': separate copies retain purchase occurrences without creating duplicate catalog identities',async()=>{
  const a=order(0);a.items[0].bundles[0].games.push(structuredClone(a.items[0].bundles[0].games[0]));const b={...structuredClone(a),_id:'synthetic-order-second'};
  const r=await run(engine,{list:[a,b]});assert.equal(r.counts.multipleCopies,2);assert.equal(r.result.items.length,1);const origins=r.result.items[0].occurrences??r.result.items[0].purchaseOrigins;assert.equal(origins.length,4);assert.equal(new Set(origins.map(o=>o.orderRef)).size,2);assert.equal(new Set(origins.map(o=>o.occurrenceRef)).size,4);
 });
 test(name+': detail transport, structure, status and product mismatch remain separate',async()=>{
  for(const [key,options]of [['detailRequest',{detailStatus:404}],['detailStructure',{details:[{...order(0),items:[]}]}],['detailStatus',{details:[{...order(0),status:'PENDING'}]}],['detailProductMismatch',{details:[{...order(0),items:order(1).items}]}]]){
   const r=await run(engine,options);assert.equal(r.counts[key],1,key);assert.equal(r.counts.scheduled,1);assert(!r.result.items?.length);
  }
 });
}
test('optional aggregate diagnostic contract remains backward compatible and rejects unsafe values',async()=>{
 const {result}=await run(canonical);assert(assertFanaticalAcquisitionContract(result).compatibility);const legacy=structuredClone(result);delete legacy.coverage.compatibility;assert.equal(assertFanaticalAcquisitionContract(legacy).compatibility,undefined);
 const clean=result.coverage.compatibility;
 const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../src/providers/fanatical.js',import.meta.url),'utf8'),context);
 const ui=context.GalacticFanatical,report=ui.failureReport('unknown');
 assert.deepEqual(structuredClone(ui.scanReport({...report,compatibility:clean})).compatibility,clean);
 for(const alter of [v=>v.counts.unsupportedStatus=-1,v=>v.counts.scheduled=100001,v=>v.counts.missingItems='PRIVATE_TITLE',v=>v.counts.rawStatus='PRIVATE_STATUS',v=>v.raw='PRIVATE_ORDER',v=>v.version=2]){
  const unsafe=structuredClone(clean);alter(unsafe);assert.equal(fanaticalCompatibilityReport(unsafe),null);assert(!ui.scanReport({...report,compatibility:unsafe}).compatibility);
  const receipt=structuredClone(result);receipt.coverage.compatibility=unsafe;assert.throws(()=>assertFanaticalAcquisitionContract(receipt),/Invalid or contradictory/);
 }
});

test('both export boundaries accept bounded bundle shapes and reject injected keys, types and oversized lists',async()=>{
 const bad=order(1);bad.items[0].bundles=[];const {compatibility:clean,result}=await run(canonical,{list:[order(0),bad]});
 const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../src/providers/fanatical.js',import.meta.url),'utf8'),context);const ui=context.GalacticFanatical,report=ui.failureReport('unknown');
 assert.deepEqual(fanaticalCompatibilityReport(clean),clean);assert.deepEqual(structuredClone(ui.scanReport({...report,compatibility:clean})).compatibility,clean);
 for(const mutate of [v=>v.bundleShapes.records[0].raw='PRIVATE',v=>v.bundleShapes.records[0].parentName='PRIVATE_TITLE',v=>v.bundleShapes.records[0].stage='PRIVATE_URL',v=>v.bundleShapes.records=Array(9).fill(v.bundleShapes.records[0]),v=>v.bundleShapes.truncated='PRIVATE',v=>v.bundleShapes.raw='PRIVATE_TOKEN',v=>v.bundleShapes.version=2]){
  const unsafe=structuredClone(clean);mutate(unsafe);assert.equal(fanaticalCompatibilityReport(unsafe),null);assert(!ui.scanReport({...report,compatibility:unsafe}).compatibility);const receipt=structuredClone(result);receipt.coverage.compatibility=unsafe;assert.throws(()=>assertFanaticalAcquisitionContract(receipt),/Invalid or contradictory/);
 }
 const old=structuredClone(clean);delete old.bundleShapes;assert(fanaticalCompatibilityReport(old),'old counter-only reports remain valid');
});
