// Synthetic compatibility cases. These do not establish the real A/B/C schema.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {webcrypto,createHash} from 'node:crypto';
import {importFanaticalOrdersInPage as canonical} from '../shared/fanatical-acquisition.js';
import {importFanaticalOrdersInPage as fan} from '../../Fanatical/src/order-importer.mjs';
import {readFanaticalOrdersInPage as gl} from '../src/providers/fanatical-scan.js';
import {fanaticalCompatibilityReport,assertFanaticalAcquisitionContract} from '../shared/provider-acquisition-contract.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const order=i=>({_id:`synthetic-order-${i}`,status:'COMPLETE',items:[{_id:'synthetic-bundle',name:'Bundle',bundles:[{games:[{_id:`synthetic-product-${i}`,name:`Book ${i}`,type:'book'}]}]}]});
const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,v])=>[k,reorder(v)])):v;
async function run(engine,{list=[order(0)],details=list,detailResponses={},known=[],fullScan=true,headers={},detailStatus=200,sessionChange=false}={}){
 let reads=0;const paths=[],scope={URL,Headers,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:webcrypto,localStorage:{getItem:()=>JSON.stringify({token:sessionChange&&reads++?'CHANGED_TOKEN':'PRIVATE_TOKEN'})},fetch:async path=>{paths.push(path);const listing=path==='/api/user/orders',status=listing?200:detailStatus;return {ok:status===200,status,headers:new Headers(listing?headers:{}),json:async()=>structuredClone(listing?list:Object.hasOwn(detailResponses,path.split('/').at(-1))?detailResponses[path.split('/').at(-1)]:details.find(o=>path.endsWith(o._id)))};}};
 const result=structuredClone(await vm.runInNewContext('('+engine.toString()+')',scope)({fullScan,knownOrderFingerprints:known,accountOrderFingerprints:known,allowPartial:true,returnFailure:true,diagnostics:true}));
 const diagnostic=engine===gl?result.diagnostic?.compatibility:result.coverage?.compatibility??result.diagnostic?.compatibility;
 assert(diagnostic);assert(!/PRIVATE_TOKEN|synthetic-order-|Book |synthetic-product-/.test(JSON.stringify(diagnostic)));
 return {result,compatibility:diagnostic,counts:diagnostic.counts,paths};
}
for(const [name,engine]of [['canonical',canonical],['FAN mirror',fan],['GL callable',gl]]){
 test(name+': detail failure branch survives ten sparse summary observations without leaking selected titles',async()=>{
  const sparse={_id:order(1)._id,status:'COMPLETE',items:Array.from({length:10},(_,i)=>({name:'PRIVATE_SELECTION_'+i,bundles:[]}))};
  for(const reason of ['invalidGames','missing-parent-name','missing-leaf-name']){
   const detail={...sparse,items:sparse.items.map((p,i)=>({_id:'private-parent-'+i,name:p.name,bundles:[{games:[{_id:'private-leaf-'+i,name:'PRIVATE_LEAF',type:'game'}]}]}))};
   if(reason==='invalidGames')detail.items[9].bundles[0].games={PRIVATE_TOKEN:'PRIVATE_TOKEN'};
   if(reason==='missing-parent-name')delete detail.items[9].name;
   if(reason==='missing-leaf-name')delete detail.items[9].bundles[0].games[0].name;
   const r=await run(engine,{list:[order(0),sparse],details:[order(0),detail]}),shapes=r.compatibility.bundleShapes;
   assert.equal(r.counts.detailStructure,1);assert.equal(r.result.items.length,1);assert.equal(shapes.records.length,8);assert.equal(shapes.truncated,true);const failure=shapes.records.find(s=>s.stage==='details');assert(failure);assert.equal(failure.reason,reason);assert(!/PRIVATE|private-/.test(JSON.stringify(shapes)));
   if(reason==='invalidGames')assert.equal(failure.childGames,'object');if(reason==='missing-parent-name')assert.equal(failure.parentName,'missing');if(reason==='missing-leaf-name'){assert.equal(failure.childName,'missing');assert.equal(failure.childId,'string');}
  }
 });
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
  const bad=Array.from({length:10},(_,i)=>{const o=order(i+1);o.items[0].bundles=[];o.items[0].products=[];return o;});
  const r=await run(engine,{list:[order(0),...bad]});assert.equal(r.compatibility.bundleShapes.records.length,8);assert.equal(r.compatibility.bundleShapes.truncated,true);assert.equal(r.counts.invalidBundles,10);assert.equal(r.result.items.length,1);
  const detail=order(1);detail.items[0].bundles={games:[{name:'PRIVATE_TITLE'}]};const d=await run(engine,{list:[order(0),order(1)],details:[order(0),detail]});assert.equal(d.compatibility.bundleShapes.records[0].stage,'details');assert.equal(d.compatibility.bundleShapes.records[0].bundleGames,'array');assert.equal(d.counts.detailStructure,1);assert.equal(d.result.items.length,1);
 });
 test(name+': identity-bearing sparse summaries recover only from validated details, including known Quick orders',async()=>{
  const detail=order(1),sparse={_id:detail._id,status:'COMPLETE',items:[{name:'Bundle',bundles:[]}]};
  for(const options of [{},{known:[hash(order(0)._id),hash(detail._id)],fullScan:false}]){
   const r=await run(engine,{list:[order(0),sparse],details:[order(0),detail],...options}),d=r.compatibility.summaryRecovery;
   assert.equal(r.result.items.length,options.fullScan===false?1:2);assert.equal(d.eligible,1);assert.equal(d.scheduled,1);assert.equal(d.recovered,1);assert.equal(d.unresolved,0);assert.equal(d.detailItemTypes.array,1);assert.equal(r.counts.invalidBundles,0);assert(r.paths.some(p=>p.endsWith(detail._id)));assert.equal(r.result.coverage.complete,false);
  }
  const covered=await run(engine,{list:[sparse],details:[detail],headers:{'x-total-count':'1'}});assert.equal(covered.result.coverage.complete,true);
 });
 test(name+': missing detail products, changed parents, wrong identities and ineligible statuses cannot recover sparse summaries',async()=>{
  const detail=order(1),sparse={_id:detail._id,status:'COMPLETE',items:[{name:'Bundle',bundles:[]}]};
  for(const bad of [{...detail,items:[]},{...detail,items:null},{...detail,items:{}},{...detail,status:'PENDING'},{...detail,status:'UNRECOGNIZED'}, {...detail,_id:'foreign-order'}, {...detail,items:[{name:'Different',_id:'other-bundle',bundles:detail.items[0].bundles}]},{...detail,items:[{...detail.items[0],bundles:[]}]},{...detail,items:[{...detail.items[0],bundles:[{games:[{name:'No ID'}]}]}]}]){
   const r=await run(engine,{list:[order(0),sparse],detailResponses:{[detail._id]:bad}});assert.equal(r.compatibility.summaryRecovery.recovered,0);assert.equal(r.compatibility.summaryRecovery.unresolved,1);assert.equal(r.result.coverage?.complete??false,false);if(bad._id!==detail._id)assert(!r.result.items);else assert.equal(r.result.items.length,1);
  }
  const withId={...sparse,items:[{...sparse.items[0],_id:'different-bundle'}]},r=await run(engine,{list:[order(0),withId],details:[order(0),detail]});assert.equal(r.result.items.length,1);assert.equal(r.counts.detailProductMismatch,1);
 });
 test(name+': sparse recovery retains summary conflicts, scope/session guards and ordinary product-mismatch validation',async()=>{
  const detail=order(1),sparse={_id:detail._id,status:'COMPLETE',items:[{name:'Bundle',bundles:[]}]};
  for(const bad of [{...sparse,status:'UNKNOWN'},{...sparse,items:[{name:'Bundle',bundles:[],products:[]}]},{...sparse,items:[{name:'Bundle',bundles:{}}]},{...sparse,items:[{name:'Bundle',bundles:[],_id:'bad'}]},{...sparse,items:[...sparse.items,order(2).items[0]]}]){
   const r=await run(engine,{list:[order(0),bad],details:[order(0),detail]});assert(!r.compatibility.summaryRecovery);assert.equal(r.paths.length,2);assert.equal(r.result.items.length,1);
  }
  const conflict=await run(engine,{list:[order(0),sparse,{...sparse,status:'REFUNDED'}]});assert.equal(conflict.counts.summaryConflict,1);assert.equal(conflict.paths.length,2);
  for(const options of [{known:[hash('other-account')]},{sessionChange:true}]){const r=await run(engine,{list:[order(0),sparse],details:[order(0),detail],...options});assert(!r.result.items);if(options.known)assert.equal(r.paths.length,1);}
  const ordinary=await run(engine,{list:[order(0),detail],detailResponses:{[detail._id]:{...detail,items:order(2).items}}});assert.equal(ordinary.result.items.length,1);assert.equal(ordinary.counts.detailProductMismatch,1);
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

test('recovery diagnostics are allowlisted, bounded and independent from persisted purchase authority',async()=>{
 const detail=order(1),sparse={_id:detail._id,status:'COMPLETE',items:[{name:'Bundle',bundles:[]}]},r=await run(canonical,{list:[sparse],details:[detail]}),clean=r.compatibility;
 const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../src/providers/fanatical.js',import.meta.url),'utf8'),context);const ui=context.GalacticFanatical,report=ui.failureReport('unknown');assert.deepEqual(fanaticalCompatibilityReport(clean),clean);assert.deepEqual(structuredClone(ui.scanReport({...report,compatibility:clean})).compatibility,clean);
 for(const mutate of [v=>v.summaryRecovery.raw='PRIVATE',v=>v.summaryRecovery.eligible=-1,v=>v.summaryRecovery.scheduled=100001,v=>v.summaryRecovery.recovered=2,v=>v.summaryRecovery.detailItemTypes.raw='PRIVATE',v=>v.summaryRecovery.detailItemTypes.array=2,v=>v.summaryRecovery.emptyDetailItems=2]){const unsafe=structuredClone(clean);mutate(unsafe);assert.equal(fanaticalCompatibilityReport(unsafe),null);assert(!ui.scanReport({...report,compatibility:unsafe}).compatibility);}
 const old=structuredClone(clean);delete old.summaryRecovery;assert(fanaticalCompatibilityReport(old));
 for(const items of [[],null,{},undefined]){const d=await run(canonical,{list:[sparse],detailResponses:{[detail._id]:{...detail,items}}});assert.equal(d.compatibility.summaryRecovery.recovered,0);assert.equal(d.compatibility.summaryRecovery.emptyDetailItems,Array.isArray(items)?1:0);assert.equal(Object.values(d.compatibility.summaryRecovery.detailItemTypes).reduce((a,b)=>a+b),1);assert.equal(d.result.items.length,0);}
 const failed=await run(canonical,{list:[sparse],detailStatus:404});assert.equal(failed.compatibility.summaryRecovery.unresolved,1);assert.equal(failed.compatibility.summaryRecovery.recovered,0);assert.equal(failed.counts.detailRequest,1);assert.equal(failed.result.items.length,0);
});
