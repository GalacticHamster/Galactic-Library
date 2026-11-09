// Synthetic compatibility cases. These do not establish the real A/B/C schema.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {webcrypto,createHash} from 'node:crypto';
import {importFanaticalOrdersInPage as canonical} from '../shared/fanatical-acquisition.js';
import {importFanaticalOrdersInPage as fan} from '../../Fanatical/src/order-importer.mjs';
import {readFanaticalOrdersInPage as gl} from '../src/providers/fanatical-scan.js';
import {fanaticalCompatibilityReport,assertFanaticalAcquisitionContract} from '../shared/provider-acquisition-contract.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const order=i=>({_id:`synthetic-order-${i}`,status:'COMPLETE',items:[{_id:'synthetic-bundle',name:'Bundle',bundles:[{games:[{_id:`synthetic-product-${i}`,name:`Book ${i}`,type:'book'}]}]}]});
const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,v])=>[k,reorder(v)])):v;
async function run(engine,{list=[order(0)],details=list,detailResponses={},known=[],fullScan=true,headers={},detailStatus=200,sessionChange=false,rawDetail=false}={}){
 let reads=0;const paths=[],scope={URL,Headers,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:webcrypto,localStorage:{getItem:()=>JSON.stringify({token:sessionChange&&reads++?'CHANGED_TOKEN':'PRIVATE_TOKEN'})},fetch:async path=>{paths.push(path);const listing=path==='/api/user/orders',status=listing?200:detailStatus;return {ok:status===200,status,headers:new Headers(listing?headers:{}),json:async()=>{const value=listing?list:Object.hasOwn(detailResponses,path.split('/').at(-1))?detailResponses[path.split('/').at(-1)]:details.find(o=>path.endsWith(o._id));return rawDetail&&!listing?value:structuredClone(value);}};}};
 const result=structuredClone(await vm.runInNewContext('('+engine.toString()+')',scope)({fullScan,knownOrderFingerprints:known,accountOrderFingerprints:known,allowPartial:true,returnFailure:true,diagnostics:true}));
 const diagnostic=engine===gl?result.diagnostic?.compatibility:result.coverage?.compatibility??result.diagnostic?.compatibility;
 assert(diagnostic);assert(!/PRIVATE_TOKEN|synthetic-order-|Book |synthetic-product-/.test(JSON.stringify(diagnostic)));
 return {result,compatibility:diagnostic,counts:diagnostic.counts,paths};
}
for(const [name,engine]of [['canonical',canonical],['FAN mirror',fan],['GL callable',gl]]){
 test(name+': Steam key absence is dated evidence, fulfilled is not reveal/activation, and secret getters are never read',async()=>{
  const purchase={_id:'synthetic-order-keys',status:'COMPLETE',items:[{_id:'key-product',name:'Synthetic Steam product',type:'game',display_type:'game',status:'fulfilled',drm:{steam:true},bundles:[],serialExpiry:null}]};
  const r=await run(engine,{list:[purchase]});const item=r.result.items[0];assert.equal(item.keyStatus,'unrevealed');assert(Number.isFinite(Date.parse(item.keyCheckedAt)));assert.equal(item.occurrences[0].keyStatus,'unrevealed');assert.equal(item.purchaseOrigins[0].keyStatus,'unrevealed');assert(!/activationStatus|PRIVATE_TOKEN/.test(JSON.stringify(item)));
  const detail=structuredClone(purchase);Object.defineProperty(detail.items[0],'key',{enumerable:true,get(){throw Error('SECRET VALUE MUST NEVER BE READ');}});
  const present=await run(engine,{list:[purchase],details:[detail],rawDetail:true});assert.equal(present.result.items.length,1);assert.equal(present.result.items[0].keyStatus,'unknown');assert.equal(present.result.items[0].occurrences[0].keyStatus,'unknown');assert(!JSON.stringify(present.result).includes('SECRET'));
  for(const patch of [{status:'revealed'},{status:'refunded'},{noKeyDelivery:true},{mystery:true},{mysteryV2:true},{preorder_pending:true},{epic_ska:true},{vaultnKeyless:true},{reveal_template:'unrecognized'},{serialExpiry:'2020-01-01'}]){const unsupported=structuredClone(purchase);Object.assign(unsupported.items[0],patch);const checked=await run(engine,{list:[unsupported]});assert.equal(checked.result.items[0].keyStatus,'unknown');}
  const other=structuredClone(purchase);other.items[0].drm={gog:true};const unobserved=await run(engine,{list:[other]});assert.equal(unobserved.result.items[0].keyStatus,undefined);
 });
 // Direct-item fixtures follow Fanatical's public AccountArea order renderer
 // (AccountArea~102ff935.00f250fe.js, inspected 2026-11-09): empty bundles
 // passes the authenticated item itself as game; pickAndMix only groups it.
 // These are synthetic products, not a captured customer purchase payload.
 test(name+': authenticated direct pick-and-mix games are purchased items, not empty bundle catalogs',async()=>{
  const direct={_id:'synthetic-order-direct',status:'COMPLETE',date:'2026-11-01',items:Array.from({length:10},(_,i)=>({_id:'direct-game-'+i,name:'Selected '+i,type:'game',bundles:[],pickAndMix:'Synthetic pick and mix',drm:{steam:true},steam:{id:1000+i}}))};
  const r=await run(engine,{list:[order(0),direct]});assert.equal(r.result.items.length,11);assert.equal(r.result.ordersScanned,2);if(engine===gl)assert.equal(r.result.diagnostic.ordersUnresolved,0);else assert.equal(r.result.unresolvedOrderFingerprints.length,0);assert.equal(r.result.coverage.complete,false);assert.equal(r.counts.detailStructure,0);
  const game=r.result.items.find(p=>p.sourceItemId==='direct-game-0');assert.equal(game.mediaType,'game');assert.equal(game.externalIds.steamAppId,'1000');assert.equal(game.bundle.sourceItemId,'direct-game-0');assert.equal(game.bundle.title,'Selected 0');assert.equal(game.purchaseDate,'2026-11-01');if(engine===gl)assert.equal(game.purchaseOrigins[0].orderRef,hash(direct._id));else {assert.equal(game.purchaseOrigins[0].purchaseRef,hash(direct._id));assert.equal(game.purchaseOrigins[0].quantity,1);}assert.equal(game.occurrences.length,1);assert(!JSON.stringify(game).includes('pick and mix'));
  const quick=await run(engine,{list:[order(0),direct],known:[hash(order(0)._id),hash(direct._id)],fullScan:false});assert.equal(quick.paths.length,1);assert.equal(quick.counts.knownSkipped,2);
  const mixed=structuredClone(direct);mixed.items.push(structuredClone(order(0).items[0]));const combined=await run(engine,{list:[mixed]});assert.equal(combined.result.items.length,11);
  const partlySparse=structuredClone(direct);delete partlySparse.items[9].type;const substituted=structuredClone(direct);substituted.items[0].type='bundle';substituted.items[0].bundles=[{games:[{_id:'different-game',name:'Different',type:'game'}]}];const conflict=await run(engine,{list:[order(0),partlySparse],details:[order(0),substituted]});assert.equal(conflict.result.items.length,1);assert.equal(conflict.counts.detailProductMismatch,1);
  const sparse=structuredClone(direct);for(const p of sparse.items)delete p.type;
  const recovered=await run(engine,{list:[sparse],details:[direct]});assert.equal(recovered.result.items.length,10);assert.equal(recovered.compatibility.summaryRecovery.recovered,1);
  const twice=structuredClone(direct);twice.items.push(structuredClone(twice.items[0]));const copies=await run(engine,{list:[twice]});const repeated=copies.result.items.find(p=>p.sourceItemId==='direct-game-0');if(engine===gl)assert.equal(repeated.purchaseOrigins.length,2);else assert.equal(repeated.purchaseOrigins[0].quantity,2);assert.equal(repeated.occurrences.length,2);assert.notEqual(repeated.occurrences[0].occurrenceRef,repeated.occurrences[1].occurrenceRef);
 });
 test(name+': direct game details preserve exact identities, multiplicity and all-or-nothing order admission',async()=>{
  const direct={_id:'synthetic-order-direct',status:'COMPLETE',items:[{_id:'direct-game',name:'Selected',type:'game',bundles:[]}]};
  for(const mutation of [d=>{d.items[0]._id='foreign-game';},d=>{d.status='PENDING';},d=>{d._id='foreign-order';},d=>{d.items.push(structuredClone(d.items[0]));},d=>{d.items[0].type='bundle';},d=>{d.items[0].products=[{_id:'catalog-only',name:'Not purchased'}];}]){
   const detail=structuredClone(direct);mutation(detail);const r=await run(engine,{list:[order(0),direct],detailResponses:{[direct._id]:detail}});if(detail._id!==direct._id){if(engine===gl)assert.equal(r.result.fanaticalFailure,1);else assert.equal(r.result.fanaticalImportFailure,1);assert.equal(r.result.items,undefined);}else {assert.equal(r.result.items.length,1);assert.equal(r.result.items[0].sourceItemId,order(0).items[0].bundles[0].games[0]._id);if(engine===gl){assert.equal(r.result.recovery.failedOrders,1);assert.equal(r.result.recovery.failedOrderFingerprints.length,1);assert.equal(r.result.diagnostic.ordersUnresolved,1);}else assert.equal(r.result.unresolvedOrderFingerprints.length,1);}
  }
  for(const mutation of [d=>{delete d.items[0]._id;},d=>{d.items[0].bundles={};},d=>{d.items[0].type='bundle';},d=>{d.items[0].display_type='software';},d=>{d.items[0].games=[];}]){
   const bad=structuredClone(direct);mutation(bad);const r=await run(engine,{list:[order(0),bad]});assert.equal(r.result.items.length,1);if(engine===gl){assert.equal(r.result.recovery.failedOrders,1);assert.equal(r.result.recovery.failedOrderFingerprints.length,1);assert.equal(r.result.diagnostic.ordersUnresolved,1);}else assert.equal(r.result.unresolvedOrderFingerprints.length,1);
  }
 });
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

for(const [name,engine] of [['canonical',canonical],['FAN mirror',fan]])test(name+': legacy purchased-detail projection recognizes direct games only for matching completed order identities',async()=>{
 const direct={_id:'direct-order',status:'COMPLETE',date:'2026-11-01',items:[{_id:'direct-game',name:'Selected',type:'game',bundles:[]}]};
 const projected=await engine({operation:'project',orderSummaries:[direct],orderDetails:[direct]});assert.equal(projected.items.length,1);assert.equal(projected.items[0].sourceItemId,'direct-game');assert.equal(projected.items[0].purchaseOrigins[0].purchaseRef,hash(direct._id));
 for(const changed of [{...direct,status:'PENDING'},{...direct,_id:'foreign-order'}]){const rejected=await engine({operation:'project',orderSummaries:[direct],orderDetails:[changed]});assert.equal(rejected.items.length,0);}
});
