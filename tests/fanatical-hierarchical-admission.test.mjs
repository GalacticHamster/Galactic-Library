// Hierarchical fault isolation: no order, bundle, group, selection or nested
// collection is atomic. Synthetic orders only.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {webcrypto,createHash} from 'node:crypto';
import {importFanaticalOrdersInPage as canonical} from '../shared/fanatical-acquisition.js';
import {importFanaticalOrdersInPage as fan} from '../../Fanatical/src/order-importer.mjs';
import {readFanaticalOrdersInPage as gl} from '../src/providers/fanatical-scan.js';
import {assertFanaticalAcquisitionContract} from '../shared/provider-acquisition-contract.js';

const hash=s=>createHash('sha256').update(s).digest('hex');
const leaf=(id,name,type='game')=>({_id:id,name,type});
// A ten-item bundle whose listed positions are malformed in the given way.
const malformed={missingId:i=>({name:'Broken product '+i,type:'game'}),missingName:i=>({_id:'broken-product-'+i,type:'game'}),notObject:()=>null};
const bundle=(id,count,bad=[],kind='missingId')=>({_id:id,name:'Bundle '+id,bundles:[{games:Array.from({length:count},(_,i)=>bad.includes(i)?malformed[kind](i):leaf(`${id}-p${i}`,`Product ${id} ${i}`))}]});
const pick=(id,group)=>({_id:id,name:'Pick '+id,type:'game',bundles:[],pickAndMix:group});
const sparseOf=p=>({_id:p._id,name:p.name,bundles:[]});
const order=(id,detailItems,summaryItems=detailItems.map(p=>p&&p._id&&p.name&&!p.pickAndMix?sparseOf(p):null).filter(Boolean),status='COMPLETE')=>({summary:{_id:id,status,date:'2026-11-15',items:summaryItems},detail:{_id:id,status:'COMPLETE',date:'2026-11-15',items:detailItems}});

async function run(engine,purchases,{known=[],fullScan=true,detailFor}={}){
  const paths=[],list=purchases.map(p=>p.summary);
  const scope={URL,Headers,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:webcrypto,localStorage:{getItem:()=>JSON.stringify({token:'PRIVATE_TOKEN'})},
    fetch:async path=>{paths.push(path);const listing=path==='/api/user/orders',p=purchases.find(o=>path.endsWith('/'+o.summary._id));return {ok:true,status:200,headers:new Headers({}),json:async()=>structuredClone(listing?list:detailFor?detailFor(p):p.detail)};}};
  const result=structuredClone(await vm.runInNewContext('('+engine.toString()+')',scope)({fullScan,knownOrderFingerprints:known,accountOrderFingerprints:known,allowPartial:true,returnFailure:true,diagnostics:true}));
  const compatibility=engine===gl?result.diagnostic?.compatibility:result.coverage?.compatibility??result.diagnostic?.compatibility;
  // Diagnostics: bounded counts only, never identities or titles.
  assert(!/PRIVATE_TOKEN|synthetic-|Bundle |Product |Pick |bundle-|pool-|tier-|voucher|nested-/.test(JSON.stringify(compatibility??{})));
  return {result,c:compatibility?.components,compatibility,paths};
}
const ids=r=>(r.result.items??[]).map(i=>i.sourceItemId).sort();
const partial=(engine,r)=>engine===gl?r.result.recovery?.partialOrderFingerprints??[]:r.result.partialOrderFingerprints??[];
const scopes=(engine,r)=>engine===gl?r.result.recovery?.componentScopes??[]:r.result.componentScopes??[];
const verified=r=>r.result.orderFingerprints??[];
const productsOf=(b,exclude=[])=>b.bundles[0].games.map((g,i)=>exclude.includes(i)?null:g?._id).filter(Boolean);
const quantity=(engine,r,id,bundleId)=>{const item=r.result.items.find(i=>i.sourceItemId===id);return engine===gl?item.purchaseOrigins.filter(o=>o.bundleId===bundleId).length:item.purchaseOrigins.filter(o=>o.bundle.sourceItemId===bundleId).reduce((n,o)=>n+o.quantity,0);};
const originsWithoutRefs=r=>Object.fromEntries(r.result.items.map(i=>[i.sourceItemId,i.purchaseOrigins]));
const legacyRef=(orderId,index,parentId,leafId)=>hash(`${orderId}\u0000${index}\u0000${parentId}\u0000${leafId}`);

// The purchased bundle's first group is level one.
const nestedProduct=(id,level)=>{
  let component=leaf(id,id);
  for(let n=1;n<level;n++)component={name:'Synthetic nested group',bundles:[{games:[component]}]};
  return component;
};

for(const [name,engine] of [['canonical',canonical],['FAN mirror',fan],['GL callable',gl]]){
  test(name+': depth-seven and depth-eight leaves are admitted; only over-depth branches are retried',async()=>{
    for(const position of [0,1,2]){
      const siblings=[nestedProduct('depth-seven-item',7),nestedProduct('depth-eight-item',8)];
      siblings.splice(position,0,nestedProduct('depth-nine-item',9));
      const nested={_id:'bundle-depth',name:'Depth fixture',bundles:[{games:siblings},{games:[nestedProduct('depth-pathological-item',80),leaf('depth-later-leaf','Later leaf')]}]};
      const unrelated=bundle('bundle-unrelated',2);
      const mixed=order('synthetic-depth-order',[nested,bundle('bundle-next',1)]);
      const other=order('synthetic-other-order',[unrelated]);
      const first=await run(engine,[mixed,other]);
      const admitted=['depth-seven-item','depth-eight-item','depth-later-leaf',...productsOf(unrelated),'bundle-next-p0'].sort();
      assert.deepEqual(ids(first),admitted);
      assert.deepEqual(partial(engine,first),[hash(mixed.summary._id)]);
      assert.deepEqual(verified(first),[hash(other.summary._id)]);
      assert.equal(first.result.coverage.complete,false);
      assert.equal(first.c.categories.nestedStructure,2);
      assert.deepEqual(scopes(engine,first)[0].bundles,[{bundle:'bundle-depth',admitted:3,unresolved:2}]);
      assert.deepEqual(originsWithoutRefs(await run(engine,[mixed,other])),originsWithoutRefs(first));
      nested.bundles[0].games[position]=nestedProduct('depth-nine-item',8);
      nested.bundles[1].games[0]=nestedProduct('depth-pathological-item',7);
      const recovered=await run(engine,[mixed,other],{fullScan:false,known:verified(first)});
      assert.deepEqual(ids(recovered),[...admitted,'depth-nine-item','depth-pathological-item'].sort());
      assert.deepEqual(partial(engine,recovered),[]);
      assert.equal(recovered.result.orderFingerprints.length,2);
    }
  });
  test(name+': A/E ten-item bundle keeps nine verified products whatever position or kind the malformed one has',async()=>{
    for(const [bad,kind] of [[[0],'missingId'],[[4],'missingId'],[[9],'missingId'],[[4],'missingName'],[[4],'notObject'],[[2,6],'missingId']]){
      const label=bad.join('+')+' '+kind,b=bundle('bundle-ten',10,bad,kind),o=order('synthetic-order-ten',[b]),r=await run(engine,[o]),fp=hash(o.summary._id);
      assert.deepEqual(ids(r),productsOf(b,bad).sort(),label);assert.equal(ids(r).length,10-bad.length,label);
      assert.deepEqual(partial(engine,r),[fp],label);assert.deepEqual(verified(r),[],label+': no checkpoint while a child is unresolved');assert.equal(r.result.coverage.complete,false,label);
      assert.deepEqual(scopes(engine,r),[{order:fp,unresolved:bad.length,bundles:[{bundle:'bundle-ten',admitted:10-bad.length,unresolved:bad.length}]}],label);
      assert.equal(r.c.bundlesPartiallyVerified,1,label);assert.equal(r.c.bundlesFullyVerified,0,label);assert.equal(r.c.productsAdmittedFromPartialBundles,10-bad.length,label);assert.equal(r.c.categories.childIdentity,bad.length,label);
      // Repeat scans are identical.
      const again=await run(engine,[o]);assert.deepEqual(again.result.items,r.result.items.map(i=>({...i,...(i.keyCheckedAt?{keyCheckedAt:again.result.items.find(x=>x.sourceItemId===i.sourceItemId).keyCheckedAt}:{})})),label);
      // The repaired bundle completes the order: exactly the missing products are added,
      // earlier purchase origins are unchanged and occurrences become exact.
      const repaired=order('synthetic-order-ten',[bundle('bundle-ten',10)]),done=await run(engine,[repaired]);
      assert.deepEqual(ids(done),productsOf(bundle('bundle-ten',10)).sort(),label);assert.deepEqual(verified(done),[fp],label);assert.deepEqual(partial(engine,done),[],label);assert.deepEqual(scopes(engine,done),[],label);
      for(const item of r.result.items)assert.deepEqual(done.result.items.find(i=>i.sourceItemId===item.sourceItemId).purchaseOrigins.map(o=>({...o,observedAt:undefined,occurrenceRef:undefined,basis:undefined,keyCheckedAt:undefined})),item.purchaseOrigins.map(o=>({...o,observedAt:undefined,occurrenceRef:undefined,basis:undefined,keyCheckedAt:undefined})),label);
      for(const item of done.result.items){const i=Number(item.sourceItemId.split('-p').at(-1));assert.deepEqual(item.occurrences.map(o=>[o.occurrenceRef,o.basis]),[[legacyRef(repaired.summary._id,i,'bundle-ten',item.sourceItemId),undefined]],label);}
      assert.doesNotThrow(()=>engine===gl||assertFanaticalAcquisitionContract(r.result),label);
    }
  });

  test(name+': B three partly readable bundles admit all 26 verified products and track 4 unresolved',async()=>{
    const a=bundle('bundle-a',10),b=bundle('bundle-b',10,[3]),c=bundle('bundle-c',10,[1,5,8],'missingName'),o=order('synthetic-order-three',[a,b,c]),r=await run(engine,[o]);
    assert.deepEqual(ids(r),[...productsOf(a),...productsOf(b,[3]),...productsOf(c,[1,5,8])].sort());assert.equal(ids(r).length,26);
    assert.equal(r.c.componentsUnresolved,4);assert.equal(r.c.bundlesFullyVerified,1);assert.equal(r.c.bundlesPartiallyVerified,2);assert.equal(r.c.productsAdmittedFromPartialBundles,16);
    assert.deepEqual(scopes(engine,r)[0].bundles,[{bundle:'bundle-b',admitted:9,unresolved:1},{bundle:'bundle-c',admitted:7,unresolved:3}]);
  });

  test(name+': C mixed hierarchy: full and partial bundles, full and partial pick-and-mix, unknown C and promotions',async()=>{
    const full=bundle('bundle-full',3),part=bundle('bundle-part',3,[1]);
    const mixOne=[pick('pick-one-a','Mix one'),pick('pick-one-b','Mix one')],mixTwo=[pick('pick-two-a','Mix two'),{name:'Pick broken',type:'game',bundles:[],pickAndMix:'Mix two'},pick('pick-two-c','Mix two')];
    const typeC={_id:'type-c-parent',name:'Type C purchase',widgets:[{_id:'c-product',name:'C product'}]},gift={_id:'gift-parent',name:'Mystery gift',type:'game',isFreeProduct:true,mystery:true,bundles:[]},badPromo={_id:'promo-bad',isFreeProduct:true,mystery:true,bundles:{}};
    const detail=[full,part,...mixOne,...mixTwo,typeC,gift,badPromo];
    const summary=[sparseOf(full),sparseOf(part),{name:'Mix one',bundles:[]},{name:'Mix two',bundles:[]},{name:typeC.name,widgets:[]},{name:gift.name,bundles:[]},{isFreeProduct:true,mystery:true,bundles:[]}];
    const o=order('synthetic-order-mixed',detail,summary),r=await run(engine,[o]);
    assert.deepEqual(ids(r),[...productsOf(full),...productsOf(part,[1]),'pick-one-a','pick-one-b','pick-two-a','pick-two-c'].sort());
    assert(!ids(r).some(id=>['c-product','gift-parent','promo-bad'].includes(id)),'promotions and unknown types are never owned');
    if(engine!==gl)assert.deepEqual(r.result.rejectedPurchaseItems.map(i=>i.title),['Mystery gift']);
    assert.equal(r.c.categories.childIdentity,1);assert.equal(r.c.categories.parentStructure,3);assert.equal(r.c.categories.summaryStructure,1);
    assert.deepEqual(partial(engine,r),[hash(o.summary._id)]);
    // The recovery scope names each purchased parent still incomplete, including the entirely unknown C.
    assert.deepEqual(scopes(engine,r)[0].bundles,[{bundle:'bundle-part',admitted:2,unresolved:1},{bundle:'type-c-parent',admitted:0,unresolved:1}]);
  });

  test(name+': D nested and unfamiliar structures: known children survive, pools and tiers are never read as purchases',async()=>{
    let nested=leaf('nested-product','Nested product');for(let depth=0;depth<9;depth++)nested={_id:'nested-'+depth,name:'Nested '+depth,bundles:[{games:[nested]}]};
    const container={_id:'bundle-tree',name:'Bundle tree',tiers:[{_id:'tier-1',name:'Tier one',games:[leaf('tier-product','Tier product')]}],bundles:[
      {games:[leaf('tree-a','Tree a'),leaf('tree-b','Tree b')]},
      {products:[leaf('pool-1','Pool one')]},
      {games:[leaf('tree-c','Tree c'),{_id:'nested-sub',name:'Sub bundle',bundles:[{games:[leaf('nested-1','Nested one'),{name:'Nested broken'}]},{games:{}}]},{...leaf('addon-1','Add-on pack'),items:[leaf('pool-2','Pool two')]}]},
      {games:[nested]}
    ]};
    const o=order('synthetic-order-tree',[container]),r=await run(engine,[o]);
    assert.deepEqual(ids(r),['addon-1','nested-1','tree-a','tree-b','tree-c']);
    assert(!ids(r).some(id=>/pool|tier|nested-product/.test(id)),'unread collections and too-deep nesting admit nothing');
    assert.equal(r.c.categories.nestedStructure,3,'parent tiers, the add-on pool and the too-deep chain');assert.equal(r.c.categories.childStructure,2);assert.equal(r.c.categories.childIdentity,1);
    assert.deepEqual(scopes(engine,r),[{order:hash(o.summary._id),unresolved:6,bundles:[{bundle:'bundle-tree',admitted:5,unresolved:6}]}]);
    for(const item of r.result.items)assert.equal((item.occurrences[0].bundleId),'bundle-tree','nested products belong to the purchased bundle');
    // Whole-order verification never admits a container or pool as a product.
    const plain=order('synthetic-order-plain',[{...bundle('bundle-plain',2),tiers:[{_id:'tier-2',name:'Tier two',games:[leaf('tier-product-2','Tier product two')]}]}]),p=await run(engine,[plain]);
    assert.deepEqual(ids(p),productsOf(bundle('bundle-plain',2)).sort());assert.deepEqual(verified(p),[]);assert.equal(p.c.categories.nestedStructure,1);
  });

  test(name+': F count, identity and shape mismatches admit only verified children and never guess',async()=>{
    const cases=[];
    // Summary lists more parents than the detail returns.
    cases.push(['summary has more',(()=>{const o=order('synthetic-order-f1',[bundle('bundle-f1',3)]);o.summary.items.push({name:'Never returned',bundles:[]});return o;})(),productsOf(bundle('bundle-f1',3)),{parentMissing:1}]);
    // The detail returns a parent the summary does not list.
    cases.push(['detail has more',(()=>{const o=order('synthetic-order-f2',[bundle('bundle-f2',3)]);o.detail.items.push(bundle('bundle-extra',2));return o;})(),productsOf(bundle('bundle-f2',3)),{unexpectedDetailItem:1}]);
    // A detail parent whose ID conflicts with the summary's is neither parent.
    cases.push(['conflicting parent ID',(()=>{const o=order('synthetic-order-f3',[bundle('bundle-f3',3),bundle('bundle-f3b',2)]);o.detail.items[1]._id='bundle-other';return o;})(),productsOf(bundle('bundle-f3',3)),{unexpectedDetailItem:1,parentMissing:1}]);
    // Duplicate product IDs listed once in a populated summary: the extra is unresolved.
    cases.push(['duplicate product ID',(()=>{const b=bundle('bundle-f4',2);const o=order('synthetic-order-f4',[b],[structuredClone(b)]);o.detail.items[0].bundles[0].games.push(structuredClone(b.bundles[0].games[0]));return o;})(),productsOf(bundle('bundle-f4',2)),{productUnexpected:1}]);
    // An unrecognized group beside readable groups.
    cases.push(['unrecognized group',(()=>{const b=bundle('bundle-f5',2);b.bundles.push({tiers:[{games:[leaf('tier-product-f5','Tier f5')]}]});return order('synthetic-order-f5',[b]);})(),productsOf(bundle('bundle-f5',2)),{childStructure:1}]);
    // A malformed nested array inside a nested bundle.
    cases.push(['malformed nested array',(()=>{const b=bundle('bundle-f6',2);b.bundles[0].games.push({_id:'nested-f6',name:'Nested f6',bundles:[{games:'not a list'},{games:[leaf('nested-f6-ok','Nested f6 ok')]}]});return order('synthetic-order-f6',[b]);})(),[...productsOf(bundle('bundle-f6',2)),'nested-f6-ok'],{childStructure:1}]);
    // A parent without a name is identified by the ID the summary states.
    cases.push(['unnamed parent with summary ID',(()=>{const b=bundle('bundle-f7',3);const o=order('synthetic-order-f7',[b]);delete o.detail.items[0].name;return o;})(),productsOf(bundle('bundle-f7',3)),null]);
    // A parent missing its ID uses the ID the summary states.
    cases.push(['detail parent without ID',(()=>{const b=bundle('bundle-f8',3);const o=order('synthetic-order-f8',[b]);delete o.detail.items[0]._id;return o;})(),productsOf(bundle('bundle-f8',3)),null]);
    // With no parent ID anywhere, the children cannot carry a purchase origin.
    cases.push(['no parent ID anywhere',(()=>{const b=bundle('bundle-f9',3),c=bundle('bundle-f9c',2);const o=order('synthetic-order-f9',[b,c],[{name:b.name,bundles:[]},sparseOf(c)]);delete o.detail.items[0]._id;return o;})(),productsOf(bundle('bundle-f9c',2)),{parentIdentity:1}]);
    for(const [label,o,expected,categories] of cases){
      const r=await run(engine,[o]);assert.deepEqual(ids(r),[...expected].sort(),label);
      if(categories){assert.deepEqual(partial(engine,r),[hash(o.summary._id)],label);for(const [k,v] of Object.entries(categories))assert.equal(r.c.categories[k],v,label+' '+k);}
      else{assert.deepEqual(verified(r),[hash(o.summary._id)],label+': fully corroborated');for(const item of r.result.items)assert.equal(item.occurrences[0].bundleId,o.summary.items[0]._id,label);}
    }
    // An unknown product type and an invalid quantity field: the product is admitted once.
    const odd=bundle('bundle-f10',2);odd.bundles[0].games[0].type='hologram';odd.bundles[0].games[1].quantity=-5;
    const r=await run(engine,[order('synthetic-order-f10',[odd])]);assert.deepEqual(ids(r),productsOf(odd).sort());
    for(const id of productsOf(odd))assert.equal(quantity(engine,r,id,'bundle-f10'),1);
  });

  test(name+': G repeat purchases keep quantities through partial reads and recovery',async()=>{
    const copy=bundle('bundle-g',4),broken=bundle('bundle-g',4,[2]);
    const first=order('synthetic-order-g1',[copy,broken]),second=order('synthetic-order-g2',[bundle('bundle-g',4)]);
    const r=await run(engine,[first,second]);
    assert.equal(quantity(engine,r,'bundle-g-p0','bundle-g'),3,'two copies in one order plus one in another');assert.equal(quantity(engine,r,'bundle-g-p2','bundle-g'),2,'the malformed copy is not counted');
    assert.deepEqual(verified(r),[hash(second.summary._id)]);assert.deepEqual(partial(engine,r),[hash(first.summary._id)]);
    const repaired=await run(engine,[order('synthetic-order-g1',[copy,bundle('bundle-g',4)]),second]);
    assert.equal(quantity(engine,repaired,'bundle-g-p0','bundle-g'),3);assert.equal(quantity(engine,repaired,'bundle-g-p2','bundle-g'),3);
    assert.deepEqual(verified(repaired).sort(),[hash(first.summary._id),hash(second.summary._id)].sort());
    if(engine===gl)for(const item of repaired.result.items)assert(item.purchaseOrigins.every(o=>!o.basis));
  });

  test(name+': I partial admission never creates ownership from ineligible orders, pools, promotions or conflicting identity',async()=>{
    const refunded=order('synthetic-order-refunded',[bundle('bundle-i1',3,[1])],undefined,'REFUNDED');
    const pending=order('synthetic-order-pending',[bundle('bundle-i2',3,[1])]),catalog=order('synthetic-order-catalog',[bundle('bundle-i3',3,[1])]);
    catalog.summary.items=[{_id:'bundle-i3',name:'Bundle bundle-i3',bundles:[],products:[{name:'Option'}]}];
    const good=order('synthetic-order-good',[bundle('bundle-i4',2)]);
    const r=await run(engine,[refunded,pending,catalog,good],{detailFor:p=>p===pending?{...p.detail,status:'PENDING'}:p.detail});
    assert.deepEqual(ids(r),productsOf(bundle('bundle-i4',2)).sort());assert.deepEqual(partial(engine,r),[]);
    const foreign=await run(engine,[order('synthetic-order-foreign',[bundle('bundle-i5',3,[1])])],{detailFor:p=>({...p.detail,_id:'synthetic-order-other'})});
    if(engine===gl)assert.equal(foreign.result.fanaticalFailure,1);else assert.equal(foreign.result.fanaticalImportFailure,1);
  });

  test(name+': the reported parent-missing order with a 9+1 bundle saves every verified product of both bundles',async()=>{
    const paidOne=bundle('bundle-paid-1',10,[7]),paidTwo=bundle('bundle-paid-2',3),gift={_id:'gift-parent',name:'Revealed game',type:'game',isFreeProduct:true,mystery:true,reveal_template:'present',bundles:[]};
    const o=order('synthetic-order-latest',[paidOne,paidTwo,gift],[sparseOf(paidOne),sparseOf(paidTwo),{name:'Seasonal present',bundles:[]}]);
    for(const r of [await run(engine,[o]),await run(engine,[o])]){
      assert.deepEqual(ids(r),[...productsOf(paidOne,[7]),...productsOf(paidTwo)].sort());assert(!ids(r).includes('gift-parent'));
      assert.deepEqual(partial(engine,r),[hash(o.summary._id)]);assert.equal(r.c.categories.parentMissing,1);assert.equal(r.c.categories.childIdentity,1);
      assert.equal(r.compatibility.productMismatches.records[0].category,'parent-missing');
      assert.deepEqual(scopes(engine,r)[0],{order:hash(o.summary._id),unresolved:2,bundles:[{bundle:'bundle-paid-1',admitted:9,unresolved:1}]});
    }
  });
}

test('contract validation binds recovery scopes to partly resolved orders',async()=>{
  const o=order('synthetic-order-contract',[bundle('bundle-contract',10,[4])]),{result}=await run(canonical,[o]);
  assert.doesNotThrow(()=>assertFanaticalAcquisitionContract(result));
  for(const mutate of [r=>{delete r.componentScopes;},r=>{r.componentScopes=[];},r=>{r.componentScopes[0].order=hash('other');},r=>{r.componentScopes[0].unresolved=0;},r=>{r.componentScopes[0].bundles[0].bundle='bad id!';},r=>{r.componentScopes[0].bundles.push(structuredClone(r.componentScopes[0].bundles[0]));},r=>{r.componentScopes[0].extra=1;},r=>{r.componentScopes.push({...r.componentScopes[0]});}]){
    const bad=structuredClone(result);mutate(bad);assert.throws(()=>assertFanaticalAcquisitionContract(bad),/contradictory/u);
  }
});

// FAN shares what its writer saved: the nine products of a partly read bundle,
// never the malformed tenth; recovery adds it without inflating any quantity.
import '../shared/purchase-snapshot.js';import '../shared/purchase-transfer.js';import '../shared/purchase-sync.js';import '../shared/purchase-adapters.js';
import {validateScanResult,mergeLibraryItems} from '../../Fanatical/src/library-data.mjs';
import {createEmptyDatabase} from '../src/lib/models.js';
import {purchaseAccounts,applyPurchaseSnapshot} from '../src/background/purchase-handoff.js';
test('FAN-to-GL sharing carries the nine verified products of a ten-item bundle and recovers the tenth without duplicates',async()=>{
  const scan=async o=>validateScanResult((await run(fan,[o])).result,{fullScan:true,knownOrderFingerprints:[]});
  const fanState=items=>({fanaticalLibraryItems:items,fanaticalAccountId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',fanaticalProfileLabel:'Personal',fanaticalProfileArchives:[],fanaticalHistoricalItems:[]});
  const share=async(db,items,first)=>{const state=fanState(items),[account]=await globalThis.GalacticPurchaseAdapters.accounts('fan',state);await applyPurchaseSnapshot(db,await globalThis.GalacticPurchaseAdapters.snapshot('fan',state,account.accountRef),first?{newLabel:'Personal',expectedActiveId:null}:(await purchaseAccounts(db,'fanatical'))[0]);};
  const counts=db=>Object.fromEntries(Object.values(db.providerItems).map(i=>[i.providerItemId,i.metadata.purchaseOrigins.length]));
  const partly=await scan(order('synthetic-order-share',[bundle('bundle-share',10,[4])]));assert.equal(partly.componentScopes[0].bundles[0].unresolved,1);
  let fanItems=mergeLibraryItems(partly.items);const db=createEmptyDatabase();await share(db,fanItems,true);
  const nine=counts(db);assert.equal(Object.keys(nine).length,9);assert(Object.values(nine).every(n=>n===1));assert(!('bundle-share-p4' in nine));
  await share(db,fanItems,false);assert.deepEqual(counts(db),nine,'sharing again changes nothing');
  const done=await scan(order('synthetic-order-share',[bundle('bundle-share',10)]));fanItems=mergeLibraryItems([...fanItems,...done.items]);await share(db,fanItems,false);
  assert.deepEqual(counts(db),{...nine,'bundle-share-p4':1});
});
