// Item-level fault isolation in the shared Fanatical acquisition engine.
// Synthetic orders only: bundles (A), pick-and-mix purchases (B), a product
// structure the engine does not recognize (C) and malformed promotional items.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {webcrypto,createHash} from 'node:crypto';
import {importFanaticalOrdersInPage as canonical} from '../shared/fanatical-acquisition.js';
import {importFanaticalOrdersInPage as fan} from '../../Fanatical/src/order-importer.mjs';
import {readFanaticalOrdersInPage as gl} from '../src/providers/fanatical-scan.js';
import {assertFanaticalAcquisitionContract,fanaticalCompatibilityReport} from '../shared/provider-acquisition-contract.js';

const hash=s=>createHash('sha256').update(s).digest('hex');
const leaf=(id,name,type='game')=>({_id:id,name,type});
const bundle=(id,name,leaves)=>({_id:id,name,bundles:[{games:leaves}]});
const pick=(id,name,group)=>({_id:id,name,type:'game',bundles:[],pickAndMix:group});
// Detail parents and the summary parents Fanatical lists for them.
const A1=bundle('bundle-a-one','Bundle A one',[leaf('a1-first','A one first'),leaf('a1-second','A one second')]);
const A2=bundle('bundle-a-two','Bundle A two',[leaf('a2-first','A two first','book')]);
const B1=[pick('pick-b1-first','Pick B one first','Mix B one'),pick('pick-b1-second','Pick B one second','Mix B one')];
const B2=[pick('pick-b2-first','Pick B two first','Mix B two')];
const C={_id:'type-c-parent',name:'Type C purchase',widgets:[{_id:'c-product',name:'C product'}]};
const recognizedC={_id:'type-c-parent',name:'Type C purchase',bundles:[{games:[leaf('c-product','C product')]}]};
const badPromo={_id:'promo-malformed',isFreeProduct:true,mystery:true,bundles:{}};
const sparseOf=p=>({_id:p._id,name:p.name,bundles:[]});
const groupOf=name=>({name,bundles:[]});
const summaryOf={A1:sparseOf(A1),A2:sparseOf(A2),B1:groupOf('Mix B one'),B2:groupOf('Mix B two'),C:{name:C.name,widgets:[{name:'C product'}]},promo:{isFreeProduct:true,mystery:true,bundles:[]}};
const detailOf={A1:[A1],A2:[A2],B1,B2,C:[C],promo:[badPromo]};
const purchase=(id,parts,{detail={},date='2026-11-12'}={})=>({
  summary:{_id:id,status:'COMPLETE',date,items:parts.map(p=>structuredClone(summaryOf[p]))},
  detail:{_id:id,status:'COMPLETE',date,items:parts.flatMap(p=>structuredClone(detail[p]??detailOf[p]))}
});

async function run(engine,purchases,{known=[],fullScan=true,allowPartial=true}={}){
  const paths=[],list=purchases.map(p=>p.summary),details=purchases.map(p=>p.detail);
  const scope={URL,Headers,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:webcrypto,localStorage:{getItem:()=>JSON.stringify({token:'PRIVATE_TOKEN'})},
    fetch:async path=>{paths.push(path);const listing=path==='/api/user/orders';return {ok:true,status:200,headers:new Headers({}),json:async()=>structuredClone(listing?list:details.find(o=>path.endsWith('/'+o._id)))};}};
  const result=structuredClone(await vm.runInNewContext('('+engine.toString()+')',scope)({fullScan,knownOrderFingerprints:known,accountOrderFingerprints:known,allowPartial,returnFailure:allowPartial,diagnostics:true}));
  const compatibility=engine===gl?result.diagnostic?.compatibility:result.coverage?.compatibility??result.diagnostic?.compatibility;
  // Diagnostics carry counts only: no titles, product or order identities, or tokens.
  assert(!/PRIVATE_TOKEN|synthetic-order|Bundle A|Pick B|Type C|C product|bundle-a|pick-b|type-c|promo-malformed/.test(JSON.stringify(compatibility??{})));
  return {result,compatibility,paths};
}
const ids=r=>r.result.items.map(i=>i.sourceItemId).sort();
const partial=(engine,r)=>engine===gl?r.result.recovery?.partialOrderFingerprints??[]:r.result.partialOrderFingerprints??[];
const unresolved=(engine,r)=>engine===gl?r.result.recovery?.failedOrderFingerprints??[]:r.result.unresolvedOrderFingerprints;
const verified=(engine,r)=>r.result.orderFingerprints;
const quantity=(engine,r,id,bundleId)=>{const item=r.result.items.find(i=>i.sourceItemId===id);return engine===gl?item.purchaseOrigins.filter(o=>o.bundleId===bundleId).length:item.purchaseOrigins.find(o=>o.bundle.sourceItemId===bundleId)?.quantity??0;};
const occurrences=r=>Object.fromEntries(r.result.items.map(i=>[i.sourceItemId,i.occurrences.map(o=>[o.occurrenceRef,o.basis??'native']).sort()]));
const legacyRef=(orderId,index,parentId,leafId)=>hash(`${orderId}\u0000${index}\u0000${parentId}\u0000${leafId}`);
const A=['a1-first','a1-second'],B=['pick-b1-first','pick-b1-second'];

const matrix=[
  ['A only',['A1'],A,true],
  ['B only',['B1'],B,true],
  ['A + B',['A1','B1'],[...A,...B],true],
  ['A + unknown C',['A1','C'],A,false],
  ['B + unknown C',['B1','C'],B,false],
  ['A + B + C',['A1','B1','C'],[...A,...B],false],
  ['A + C + B + A',['A1','C','B1','A2'],[...A,...B,'a2-first'],false],
  ['A + malformed promotional item',['A1','promo'],A,false],
];
for(const [name,engine] of [['canonical',canonical],['FAN mirror',fan],['GL callable',gl]]){
  test(name+': fault-isolation matrix admits every corroborated A/B component and keeps C unresolved',async()=>{
    for(const [label,parts,expected,complete] of matrix){
      const order=purchase('synthetic-order-matrix',parts),r=await run(engine,[order]);
      assert.deepEqual(ids(r),[...expected].sort(),label);
      assert.deepEqual(partial(engine,r),complete?[]:[hash(order.summary._id)],label);
      assert.deepEqual(unresolved(engine,r),complete?[]:[hash(order.summary._id)],label);
      assert.deepEqual(verified(engine,r),complete?[hash(order.summary._id)]:[],label+': a partial order never advances the checkpoint');
      assert.equal(r.result.coverage.complete,complete,label);
      assert(!r.result.items.some(i=>['c-product','promo-malformed'].includes(i.sourceItemId)),label);
      if(!complete){const c=r.compatibility.components;assert.equal(c.ordersPartiallyResolved,1,label);assert.equal(c.componentsAdmitted,expected.length,label);assert(c.componentsUnresolved>=1,label);}
    }
  });

  test(name+': missing, unexpected and malformed components isolate to themselves',async()=>{
    // A summary parent with no detail counterpart.
    const missing=purchase('synthetic-order-missing',['A1','B1']);missing.summary.items.push({name:'Bundle never returned',bundles:[]});
    let r=await run(engine,[missing]);assert.deepEqual(ids(r),[...A,...B].sort());assert.equal(r.compatibility.components.categories['parentMissing'],1);assert.deepEqual(partial(engine,r),[hash(missing.summary._id)]);
    // A detail parent the summary does not list is never admitted.
    const extra=purchase('synthetic-order-extra',['A1','B1']);extra.detail.items.push(bundle('bundle-surprise','Bundle surprise',[leaf('surprise-product','Surprise product')]));
    r=await run(engine,[extra]);assert.deepEqual(ids(r),[...A,...B].sort());assert.equal(r.compatibility.components.categories['unexpectedDetailItem'],1);
    // A detail parent whose ID differs from the one its summary states is not admitted.
    const swapped=purchase('synthetic-order-swapped',['A1','A2']);swapped.detail.items[1]._id='bundle-a-other';
    r=await run(engine,[swapped]);assert.deepEqual(ids(r),A);
    // A parent-level catalog in the summary never corroborates its detail parent, even with the same name and ID.
    const catalog=purchase('synthetic-order-catalog',['A1','B1']);catalog.summary.items.push({_id:A2._id,name:A2.name,bundles:[],products:[{name:'A two first'}]});catalog.detail.items.push(structuredClone(A2));
    r=await run(engine,[catalog]);assert.deepEqual(ids(r),[...A,...B].sort());assert.equal(r.compatibility.components.categories['summaryStructure'],1);assert.deepEqual(partial(engine,r),[hash(catalog.summary._id)]);
    // A malformed child inside a recognized bundle: its siblings are admitted.
    const child=purchase('synthetic-order-child',['A1','B1']);delete child.detail.items[0].bundles[0].games[1]._id;
    r=await run(engine,[child]);assert.deepEqual(ids(r),['a1-first',...B].sort());assert.equal(r.compatibility.components.categories['childIdentity'],1);
    // A malformed group inside a recognized bundle.
    const group=purchase('synthetic-order-group',['B1']);group.detail.items.push({...structuredClone(A1),bundles:[{games:[leaf('a1-first','A one first')]},{games:{}}]});group.summary.items.push(sparseOf(A1));
    r=await run(engine,[group]);assert.deepEqual(ids(r),['a1-first',...B].sort());assert.equal(r.compatibility.components.categories['childStructure'],1);
    // A populated summary product the detail contradicts.
    const populated=purchase('synthetic-order-populated',['B1']);populated.summary.items.push(structuredClone(A1));populated.detail.items.push({...structuredClone(A1),bundles:[{games:[leaf('a1-first','A one first'),leaf('a1-swapped','Not listed')]}]});
    r=await run(engine,[populated]);assert.deepEqual(ids(r),['a1-first',...B].sort());assert.equal(r.compatibility.components.categories['productUnexpected'],1);assert.equal(r.compatibility.components.categories['productMissing'],1);
  });

  test(name+': repeat purchases keep distinct quantities inside a partial order',async()=>{
    // Two copies of one bundle, and the same pick-and-mix bought twice, beside C.
    const repeat=purchase('synthetic-order-repeat',['A1','A1','B1','B1','C']);
    repeat.detail.items=[structuredClone(A1),structuredClone(A1),...structuredClone(B1),pick('pick-b1-third','Pick B one third','Mix B one'),structuredClone(C)];
    const r=await run(engine,[repeat]);
    assert.deepEqual(ids(r),[...A,...B,'pick-b1-third'].sort());
    assert.equal(quantity(engine,r,'a1-first','bundle-a-one'),2);assert.equal(quantity(engine,r,'a1-second','bundle-a-one'),2);
    assert.equal(quantity(engine,r,'pick-b1-first','pick-b1-first'),1);
    if(engine!==gl)assert.equal(r.result.items.find(i=>i.sourceItemId==='a1-first').occurrences.length,2);
    assert.deepEqual(partial(engine,r),[hash(repeat.summary._id)]);
    // A second order buying the same bundle stays a separate purchase.
    const second=purchase('synthetic-order-second',['A1']),both=await run(engine,[repeat,second]);
    assert.equal(quantity(engine,both,'a1-first','bundle-a-one'),engine===gl?3:2);
    const origins=both.result.items.find(i=>i.sourceItemId==='a1-first').purchaseOrigins;
    assert.equal(new Set(origins.map(o=>o.orderRef??o.purchaseRef)).size,2);
    assert.deepEqual(verified(engine,both),[hash(second.summary._id)]);
  });

  test(name+': a failed order never affects a valid order',async()=>{
    const failing=purchase('synthetic-order-failing',['C']),valid=purchase('synthetic-order-valid',['A1','B1','A2']);
    const r=await run(engine,[failing,valid]);
    assert.deepEqual(ids(r),[...A,...B,'a2-first'].sort());assert.deepEqual(verified(engine,r),[hash(valid.summary._id)]);assert.deepEqual(unresolved(engine,r),[hash(failing.summary._id)]);assert.deepEqual(partial(engine,r),[]);
    assert.equal(r.compatibility.components.ordersUnresolved,1);assert.equal(r.compatibility.components.unknownStructures,1);
    // Valid orders keep exact whole-order occurrence identities.
    for(const [index,[parent,product]] of [['bundle-a-one','a1-first'],['bundle-a-one','a1-second'],['pick-b1-first','pick-b1-first'],['pick-b1-second','pick-b1-second'],['bundle-a-two','a2-first']].entries())
      assert.deepEqual(r.result.items.find(i=>i.sourceItemId===product).occurrences.map(o=>[o.occurrenceRef,o.basis]),[[legacyRef(valid.summary._id,index,parent,product),undefined]]);
  });

  test(name+': most important regression: two bundles, two pick-and-mix purchases, unknown C and a malformed promotion',async()=>{
    const parts=['A1','B1','C','A2','B2','promo'],first=purchase('synthetic-order-critical',parts),r=await run(engine,[first]);
    const expected=[...A,...B,'a2-first','pick-b2-first'].sort();
    assert.deepEqual(ids(r),expected);assert.deepEqual(partial(engine,r),[hash(first.summary._id)]);assert.deepEqual(verified(engine,r),[]);assert.equal(r.result.coverage.complete,false);
    const c=r.compatibility.components;assert.equal(c.ordersPartiallyResolved,1);assert.equal(c.componentsAdmitted,6);assert.equal(c.unknownStructures,2);
    assert.equal(c.categories['summaryStructure'],1);assert.equal(c.categories['parentStructure'],2);assert.equal(c.componentsUnresolved,3);
    // Every admitted occurrence is a provisional order/bundle count.
    for(const item of r.result.items)for(const o of item.occurrences)assert.equal(o.basis,'order-bundle-count');
    // Repeated scans with C still unknown are identical.
    const again=await run(engine,[first]);assert.deepEqual(occurrences(again),occurrences(r));assert.deepEqual(again.result.items.map(i=>i.purchaseOrigins),r.result.items.map(i=>i.purchaseOrigins));
    // C becomes recognizable: it is recovered; the malformed promotion keeps the order partial.
    const later=purchase('synthetic-order-critical',parts,{detail:{C:[recognizedC]}}),recovered=await run(engine,[later]);
    assert.deepEqual(ids(recovered),[...expected,'c-product'].sort());assert.deepEqual(partial(engine,recovered),[hash(first.summary._id)]);
    for(const id of expected)assert.deepEqual(recovered.result.items.find(i=>i.sourceItemId===id).occurrences,r.result.items.find(i=>i.sourceItemId===id).occurrences,id);
    // Once every component resolves, the order is verified with whole-order occurrence identities.
    const fixed=purchase('synthetic-order-critical',parts.filter(p=>p!=='promo'),{detail:{C:[recognizedC]}});
    const complete=await run(engine,[fixed]);assert.deepEqual(verified(engine,complete),[hash(first.summary._id)]);assert.deepEqual(partial(engine,complete),[]);
    assert.deepEqual(ids(complete),[...expected,'c-product'].sort());
    for(const item of complete.result.items)for(const o of item.occurrences)assert.equal(o.basis,undefined);
    assert.deepEqual(complete.result.items.find(i=>i.sourceItemId==='a2-first').occurrences[0].occurrenceRef,legacyRef(fixed.summary._id,5,'bundle-a-two','a2-first'));
  });

  test(name+': an unrecognized summary parent still has its detail read; a corroborated readable detail resolves',async()=>{
    const order=purchase('synthetic-order-summary-c',['A1','C'],{detail:{C:[recognizedC]}});
    const r=await run(engine,[order]);assert.deepEqual(ids(r),[...A,'c-product'].sort());assert.deepEqual(verified(engine,r),[hash(order.summary._id)]);assert.equal(r.compatibility.counts.missingBundles,1);
    assert.equal(r.compatibility.components.ordersResolvedByComponents,1);
    // Resolved through components, occurrences equal those of whole-order verification.
    assert.deepEqual(r.result.items.find(i=>i.sourceItemId==='c-product').occurrences[0].occurrenceRef,legacyRef(order.summary._id,2,'type-c-parent','c-product'));
    // Quick then treats it as known.
    const quick=await run(engine,[order],{known:[hash(order.summary._id)],fullScan:false});assert.equal(quick.paths.length,1);
  });

  test(name+': partial orders are retried on Quick and never checkpointed',async()=>{
    // A populated summary is skip authority on Quick; sparse summaries are always re-read.
    const done=purchase('synthetic-order-done',['A2']),partly=purchase('synthetic-order-partly',['A1','C']);done.summary.items=[structuredClone(A2)];
    const first=await run(engine,[done,partly]);assert.deepEqual(verified(engine,first),[hash(done.summary._id)]);
    const quick=await run(engine,[done,partly],{known:verified(engine,first),fullScan:false});
    assert.equal(quick.paths.length,2);assert(quick.paths[1].endsWith('synthetic-order-partly'));assert.deepEqual(ids(quick),A);assert.deepEqual(occurrences(quick),Object.fromEntries(Object.entries(occurrences(first)).filter(([id])=>A.includes(id))));
  });
}

test('strict acquisition remains whole-order: any unresolved component rejects the acquisition',async()=>{
  const r=await run(canonical,[purchase('synthetic-order-strict',['A1','C'])],{allowPartial:false}).catch(error=>({error}));
  assert(r.error);assert.match(r.error.fanaticalFailureCode,/^(summaries|details)-unreadable$/u);
  // Populated summaries pass strict summary checks; the unknown detail parent then rejects everything.
  const detailOnly=purchase('synthetic-order-strict-detail',['A1','C']);detailOnly.summary.items=[structuredClone(A1),{_id:C._id,name:C.name,bundles:[{games:[{name:'C product'}]}]}];
  const d=await run(canonical,[detailOnly],{allowPartial:false}).catch(error=>({error}));assert.equal(d.error?.fanaticalFailureCode,'details-unreadable');
});

test('contract validation binds partial orders to unresolved, non-deferred orders and bounded diagnostics',async()=>{
  const order=purchase('synthetic-order-contract',['A1','C']),{result}=await run(canonical,[order]);
  const fp=hash(order.summary._id);assert.deepEqual(result.partialOrderFingerprints,[fp]);
  assert.doesNotThrow(()=>assertFanaticalAcquisitionContract(result));
  for(const mutate of [r=>{r.partialOrderFingerprints=[];},r=>{r.partialOrderFingerprints=['not-a-fingerprint'];},r=>{r.partialOrderFingerprints=[fp,fp];},r=>{r.partialOrderFingerprints=[hash('other-order')];},r=>{r.deferredOrderFingerprints=[fp];},r=>{r.coverage.compatibility.components.extra=1;},r=>{r.coverage.compatibility.components.categories['parentMissing']=-1;},r=>{r.coverage.compatibility.components.componentsAdmitted=100001;}]){
    const bad=structuredClone(result);mutate(bad);assert.throws(()=>assertFanaticalAcquisitionContract(bad),/contradictory/u);
  }
  const report=fanaticalCompatibilityReport(result.coverage.compatibility);assert.deepEqual(report.components,result.coverage.compatibility.components);
  assert.deepEqual(Object.keys(report.components.categories),['summaryStructure','parentMissing','unexpectedDetailItem','identityMismatch','parentStructure','childStructure','childIdentity','productMissing','productUnexpected']);
});

// FAN shares saved purchases with GL. A partial order contributes only the
// components FAN's writer admitted; GL never receives C or the promotion.
import '../shared/purchase-snapshot.js';import '../shared/purchase-transfer.js';import '../shared/purchase-sync.js';import '../shared/purchase-adapters.js';
import {validateScanResult,mergeLibraryItems} from '../../Fanatical/src/library-data.mjs';
import {createEmptyDatabase} from '../src/lib/models.js';
import {purchaseAccounts,applyPurchaseSnapshot} from '../src/background/purchase-handoff.js';
test('FAN-to-GL sharing carries verified components of a partial order, never unresolved ones, and stays idempotent through recovery',async()=>{
  const parts=['A1','A1','B1','C','promo'],scan=async order=>{const {result}=await run(fan,[order]);return validateScanResult(result,{fullScan:true,knownOrderFingerprints:[]});};
  const state=items=>({fanaticalLibraryItems:items,fanaticalAccountId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',fanaticalProfileLabel:'Personal',fanaticalProfileArchives:[],fanaticalHistoricalItems:[]});
  const share=async(db,items,first)=>{const fanState=state(items),[account]=await globalThis.GalacticPurchaseAdapters.accounts('fan',fanState),snapshot=await globalThis.GalacticPurchaseAdapters.snapshot('fan',fanState,account.accountRef);
    await applyPurchaseSnapshot(db,snapshot,first?{newLabel:'Personal',expectedActiveId:null}:(await purchaseAccounts(db,'fanatical'))[0]);return snapshot;};
  const glQuantity=(db,id)=>Object.values(db.providerItems).find(i=>i.providerItemId===id)?.metadata.purchaseOrigins.length??0;
  const first=await scan(purchase('synthetic-order-shared',parts));assert.deepEqual(first.partialOrderFingerprints,[hash('synthetic-order-shared')]);
  let fanItems=mergeLibraryItems(first.items);
  const db=createEmptyDatabase(),snapshot=await share(db,fanItems,true);
  assert(!JSON.stringify(snapshot).match(/c-product|promo-malformed|Type C/u));
  assert.deepEqual(Object.values(db.providerItems).map(i=>i.providerItemId).sort(),[...A,...B].sort());
  assert.equal(glQuantity(db,'a1-first'),2);assert.equal(glQuantity(db,'pick-b1-first'),1);
  // Sharing the same partial state again changes nothing.
  const settled=JSON.stringify(Object.values(db.providerItems).map(i=>[i.providerItemId,i.metadata.purchaseOrigins.length]));await share(db,fanItems,false);
  assert.equal(JSON.stringify(Object.values(db.providerItems).map(i=>[i.providerItemId,i.metadata.purchaseOrigins.length])),settled);
  // C becomes recognizable in FAN: GL gains C without a second copy of A or B.
  const later=await scan(purchase('synthetic-order-shared',parts,{detail:{C:[recognizedC]}}));fanItems=mergeLibraryItems([...fanItems,...later.items]);await share(db,fanItems,false);
  assert.deepEqual(Object.values(db.providerItems).map(i=>i.providerItemId).sort(),[...A,...B,'c-product'].sort());
  assert.equal(glQuantity(db,'a1-first'),2);assert.equal(glQuantity(db,'a1-second'),2);assert.equal(glQuantity(db,'pick-b1-second'),1);assert.equal(glQuantity(db,'c-product'),1);
});

// The reported FAN 1.0.6 Quick scan: 8 orders, 4 known and skipped, 4 sparse
// summaries checked, 3 recovered; one summary lists three parents, its detail
// returns two purchased bundles and one promotional parent, and the unmatched
// summary parent carries no ID. Two explanations fit those counts exactly.
const reportedShape=summaryExtra=>{
  const known=[0,1,2,3].map(i=>{const id='synthetic-order-known-'+i,items=[bundle('known-bundle-'+i,'Known bundle '+i,[leaf('known-product-'+i,'Known product '+i,'book')])];return {summary:{_id:id,status:'COMPLETE',items},detail:{_id:id,status:'COMPLETE',items}};});
  const paid=(order,n)=>bundle(`${order}-bundle-${n}`,`Paid ${order} ${n}`,[0,1,2].map(i=>leaf(`${order}-product-${n}-${i}`,`Paid ${order} ${n} ${i}`)));
  const sparseOrder=id=>{const parents=[paid(id,1),paid(id,2)];return {summary:{_id:id,status:'COMPLETE',items:parents.map(sparseOf)},detail:{_id:id,status:'COMPLETE',items:parents}};};
  const id='synthetic-order-latest',parents=[paid(id,1),paid(id,2)],gift={_id:'gift-parent',name:'Revealed game',type:'game',display_type:'game',isFreeProduct:true,mystery:true,reveal_template:'present',status:'fulfilled',bundles:[]};
  return {purchases:[...known,...['synthetic-order-a','synthetic-order-b','synthetic-order-c'].map(sparseOrder),{summary:{_id:id,status:'COMPLETE',items:[...parents.map(sparseOf),...summaryExtra]},detail:{_id:id,status:'COMPLETE',items:[...parents,gift]}}],
    known:known.map(o=>hash(o.summary._id)),latest:id,paidIds:parents.flatMap(p=>p.bundles[0].games.map(g=>g._id))};
};
for(const [name,engine] of [['canonical',canonical],['FAN mirror',fan],['GL callable',gl]]){
  test(name+': the reported parent-missing shape saves both paid bundles and separates a renamed gift from an omitted purchase',async()=>{
    const legacy={summaryParents:3,detailParents:2,promotionalDetailParents:1,unexpectedDetailParents:0,detailDirectParents:0,detailBundleParents:2,nonStringPickAndMix:0,normalizedNameMatched:false,missingParentHasId:false,promotionalIdMatched:false};
    // H1: the gift is listed under its pre-reveal name without an ID. H2: the gift is listed as promotional and another purchase is omitted from the detail.
    for(const [label,extra,summaryPromotionalParents] of [['renamed gift without ID',[{name:'Seasonal present',bundles:[]}],0],['omitted purchase',[{name:'Mystery gift',bundles:[]},{name:'Pending purchase',bundles:[]}],1]]){
      const shape=reportedShape(extra),r=await run(engine,shape.purchases,{known:shape.known,fullScan:false}),c=r.compatibility;
      assert.equal(c.counts.knownSkipped,4,label);assert.equal(c.counts.scheduled,4,label);assert.equal(c.counts.detailProductMismatch,1,label);
      assert.deepEqual([c.summaryRecovery.eligible,c.summaryRecovery.scheduled,c.summaryRecovery.recovered,c.summaryRecovery.unresolved,c.summaryRecovery.detailItemTypes.array],[4,4,3,1,4],label);
      const context=c.productMismatches.records[0].parentContext;assert.equal(c.productMismatches.records[0].category,'parent-missing',label);
      for(const [key,value] of Object.entries(legacy))assert.equal(context[key],value,label+' '+key);
      assert.equal(context.summaryPromotionalParents,summaryPromotionalParents,label);assert.equal(context.promotionalParentHasId,true,label);
      // Either way the two paid bundles are saved; the gift is not; the order stays retryable.
      for(const id of shape.paidIds)assert(r.result.items.some(i=>i.sourceItemId===id),label+' '+id);
      assert(!r.result.items.some(i=>i.sourceItemId==='gift-parent'),label);assert.deepEqual(partial(engine,r),[hash(shape.latest)],label);
      assert.equal(c.components.categories.parentMissing,1,label);assert.equal(c.components.componentsAdmitted,6,label);
    }
  });
}
