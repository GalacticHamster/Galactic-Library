import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {withWorker} from './storage.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';

export const humbleOrder=i=>({gamekey:`order-${i}`,product:{human_name:'Synthetic books'},created:'2026-10-01T00:00:00Z'});
export const humbleDetail=i=>({gamekey:`order-${i}`,subproducts:[{human_name:`Verified volume ${i}`,machine_name:`book-${i}`,downloads:[{url:'https://example.invalid/book.epub'}]}]});
export const humbleSender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://www.humblebundle.com/home/purchases',tab:{id:1}};
export async function humbleWorker(run){
  return withWorker(async worker=>{
    let orders=[humbleOrder(1)],failures=[],status=200,transform=(detail)=>detail;
    const paths=[];
    const context=vm.createContext({console,URL,Map,Set,fetch:async path=>{
      paths.push(path);if(path.startsWith('/api/v1/user/'))return {ok:status===200,status,json:async()=>structuredClone(orders)};
      const id=decodeURIComponent(path.match(/\/order\/([^?]+)/u)[1]);if(failures.includes(id))throw Error('Synthetic detail unavailable');
      const detail=transform(humbleDetail(id.replace('order-','')),id);
      return {ok:status===200,status,text:async()=>JSON.stringify(detail)};
    },setTimeout:fn=>{fn();return 0;}});
    for(const name of ['provider-snapshot','humble'])vm.runInContext(readFileSync(new URL(`../src/providers/${name}.js`,import.meta.url),'utf8'),context);
    const acquire=async(mode='full',profileLabel='Personal',switchProfile=false)=>{
      const state=await worker.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'humble',mode,beginScan:true,confirmed:true,profileLabel,switchProfile},humbleSender);assert(state.ok,state.error);
      const full=mode==='full'||state.forceFull;
      const result=JSON.parse(JSON.stringify(await context.GalacticHumble.fetchHumblePurchases(()=>{},full?null:state.syncState.knownPurchaseIds,state.syncState.refreshPurchaseIds)));
      return {state,full,result};
    };
    const commit=async a=>{
      const r=a.result,request={type:'COMMIT_PROVIDER_SCAN',provider:'humble',mode:a.full?'full':'incremental',scanToken:a.state.scanToken,items:r.items,snapshot:r.snapshot,
        syncState:{knownPurchaseIds:r.knownPurchaseIds,failedPurchaseIds:r.failures},scanDiagnostics:{incomplete:r.failures.length>0,failedRequestCount:r.failures.length}};
      return {request,response:await worker.dispatch(request,humbleSender)};
    };
    await run({...worker,context,paths,acquire,commit,setOrders:value=>orders=value,setFailures:value=>failures=value,setStatus:value=>status=value,setTransform:value=>transform=value});
  });
}
export const humbleRecoveryTests=[
  ['Humble first 499/500 saves useful ownership and Quick retries only one after reload',()=>humbleWorker(async h=>{
    h.setOrders(Array.from({length:500},(_,i)=>humbleOrder(i+1)));h.setFailures(['order-500']);
    const a=await h.acquire(),saved=await h.commit(a);assert(saved.response.ok,saved.response.error);
    let db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,499);assert.equal(db.providers.humble.fullSyncAt,undefined);
    assert(db.providers.humble.syncState.acquisitionCheckedAt);assert.deepEqual(db.providers.humble.syncState.failedPurchaseIds,['order-500']);
    assert(Object.values(db.providerItems).every(i=>i.ownership==='owned'));
    assert(handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Verified volume 1',mediaType:'book'}]}).results[0].owned);
    assert.equal(Object.keys(parseBackup(createBackup(db)).providerItems).length,499);
    h.paths.length=0;h.setFailures([]);const q=await h.acquire('incremental');assert(!q.full);assert((await h.commit(q)).response.ok);
    assert.equal(h.paths.filter(p=>p.includes('/api/v1/order/')).length,1);db=await h.pageB.getDatabase();assert.equal(Object.keys(db.providerItems).length,500);assert.equal(db.providers.humble.fullSyncAt,undefined);
    h.paths.length=0;assert((await h.commit(await h.acquire('incremental'))).response.ok);assert.equal(h.paths.length,1);
    assert((await h.commit(await h.acquire())).response.ok);assert((await h.pageA.getDatabase()).providers.humble.fullSyncAt);
  })],
  ['Humble clean 500 and valid empty keep normal full reconciliation',()=>humbleWorker(async h=>{
    h.setOrders(Array.from({length:500},(_,i)=>humbleOrder(i+1)));assert((await h.commit(await h.acquire())).response.ok);
    let db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,500);assert(db.providers.humble.fullSyncAt);
    h.setOrders([]);assert((await h.commit(await h.acquire())).response.ok);db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,0);assert.equal(Object.keys(db.providerHistory).length,500);
  })],
  ['Humble partial Full retains omitted active records and previous history without reactivation',()=>humbleWorker(async h=>{
    h.setOrders([humbleOrder(1),humbleOrder(2)]);assert((await h.commit(await h.acquire())).response.ok);
    h.setOrders([humbleOrder(1)]);assert((await h.commit(await h.acquire())).response.ok);
    const before=await h.pageA.getDatabase();assert.equal(Object.keys(before.providerHistory).length,1);
    h.setOrders([humbleOrder(2),humbleOrder(3),humbleOrder(4)]);h.setFailures(['order-4']);assert((await h.commit(await h.acquire())).response.ok);
    const after=await h.pageA.getDatabase();assert.equal(Object.keys(after.providerItems).length,2);assert.deepEqual(after.providerHistory,before.providerHistory);
    assert(Object.values(after.providerItems).some(i=>i.title==='Verified volume 1'));assert(!Object.values(after.providerItems).some(i=>i.title==='Verified volume 2'));
    assert.equal(after.providers.humble.fullSyncAt,before.providers.humble.fullSyncAt);
  })],
  ['Humble invalid top level, all failed and authentication leave committed evidence intact',()=>humbleWorker(async h=>{
    assert((await h.commit(await h.acquire())).response.ok);const before=await h.pageA.getDatabase();
    for(const status of [401,403]){h.setStatus(status);await assert.rejects(h.acquire(),/login has expired/);}
    h.setStatus(200);h.setOrders({invalid:true});await assert.rejects(h.acquire(),/unexpected purchase list/);
    h.setOrders([humbleOrder(1)]);h.setFailures(['order-1']);await assert.rejects(h.acquire(),/no library changes/);
    const after=await h.pageA.getDatabase();assert.deepEqual(after.providerItems,before.providerItems);assert.deepEqual(after.providerHistory,before.providerHistory);assert.equal(after.providers.humble.fullSyncAt,before.providers.humble.fullSyncAt);
  })],
  ['Humble explicit mismatched key rejects only that order and keeps valid optional identity responses',()=>humbleWorker(async h=>{
    h.setOrders([humbleOrder(1),humbleOrder(2)]);h.setTransform((detail,id)=>id==='order-2'?{...detail,gamekey:'wrong'}:((({gamekey,...rest})=>rest)(detail)));
    const a=await h.acquire();assert.deepEqual(a.result.failures,['order-2']);assert((await h.commit(a)).response.ok);assert.equal(Object.keys((await h.pageA.getDatabase()).providerItems).length,1);
  })],
  ['Humble partial storage rejection, replay and stale leases cannot publish unsaved work',()=>humbleWorker(async h=>{
    assert((await h.commit(await h.acquire())).response.ok);h.setOrders([humbleOrder(1),humbleOrder(2),humbleOrder(3)]);h.setFailures(['order-3']);
    const old=await h.acquire(),latest=await h.acquire(),before=await h.pageA.getDatabase();assert(!(await h.commit(old)).response.ok);
    h.memory.failNextWrite();assert(!(await h.commit(latest)).response.ok);let db=await h.pageB.getDatabase();assert.deepEqual(db.providerItems,before.providerItems);assert.deepEqual(db.providers.humble.syncState,before.providers.humble.syncState);
    const a=await h.acquire(),saved=await h.commit(a);assert(saved.response.ok,saved.response.error);
    const repeated=await h.dispatch(saved.request,humbleSender);assert(repeated.ok||/superseded/.test(repeated.error));
    h.setFailures([]);h.paths.length=0;assert((await h.commit(await h.acquire('incremental'))).response.ok);assert.equal(h.paths.filter(p=>p.includes('/api/v1/order/')).length,1);assert.equal(Object.keys((await h.pageA.getDatabase()).providerItems).length,3);
  })]
];
humbleRecoveryTests.push(
  ['Humble rejected first partial cannot publish an acquisition checkpoint or enable skipped work',()=>humbleWorker(async h=>{
    h.setOrders([humbleOrder(1),humbleOrder(2)]);h.setFailures(['order-2']);const a=await h.acquire();h.memory.failNextWrite();assert(!(await h.commit(a)).response.ok);
    const db=await h.pageB.getDatabase();assert.equal(Object.keys(db.providerItems).length,0);assert.equal(db.providers.humble.syncState?.acquisitionCheckedAt,undefined);assert.equal(db.providers.humble.fullSyncAt,undefined);
    const next=await h.acquire('incremental');assert(next.full);assert.equal(next.result.successfulPurchaseIds.length,1);
  })],
  ['Humble partial refresh preserves corrections, independent providers and restored retry state',()=>humbleWorker(async h=>{
    await h.importItems('gog',[{providerItemId:'independent',title:'Independent game',ownership:'owned'}]);
    assert((await h.commit(await h.acquire())).response.ok);let db=await h.pageA.getDatabase();
    const item=Object.values(db.providerItems).find(i=>i.provider==='humble');
    await h.pageA.saveOwnershipCorrections([ownershipCorrectionTarget(item,db)],{ownership:'returned',note:'Synthetic review'});
    const before=await h.pageA.getDatabase(),other=Object.values(before.providerItems).find(i=>i.provider==='gog');
    h.setOrders([humbleOrder(1),humbleOrder(2),humbleOrder(3)]);h.setFailures(['order-3']);assert((await h.commit(await h.acquire())).response.ok);db=await h.pageA.getDatabase();
    assert.deepEqual(db.providerItems[other.id],other);assert.deepEqual(db.ownershipReviews,before.ownershipReviews);assert.deepEqual(db.providers.gog,before.providers.gog);
    await h.pageA.restoreDatabase(parseBackup(createBackup(db)));h.setFailures([]);h.paths.length=0;
    assert((await h.commit(await h.acquire('incremental'))).response.ok);assert.equal(h.paths.filter(p=>p.includes('/api/v1/order/')).length,1);
  })],
  ['Humble mixed media extraction and comparison ownership agree between clean and partial Full',async()=>{
    const results=[];
    for(const partial of [false,true])await humbleWorker(async h=>{
      h.setOrders([humbleOrder(1),...(partial?[humbleOrder(2)]:[])]);h.setFailures(partial?['order-2']:[]);
      h.setTransform(d=>({...d,subproducts:[...d.subproducts,{human_name:'Audio edition',machine_name:'audio',downloads:[{url:'https://example.invalid/book.mp3'}]},{human_name:'Software edition',machine_name:'software',category:'software'}],all_tpks:[{human_name:'Game edition',machine_name:'game',key_type:'Steam',keyindex:0}]}));
      assert((await h.commit(await h.acquire())).response.ok);const db=await h.pageA.getDatabase(),items=Object.values(db.providerItems);
      results.push(items.map(i=>({id:i.providerItemId,media:i.mediaType,ownership:i.ownership,acquiredAt:i.acquiredAt,metadata:i.metadata})));
      assert.equal(items.length,4);assert(items.every(i=>i.ownership==='owned'));
      assert(handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Verified volume 1',mediaType:'book'}]}).results[0].owned);
    });assert.deepEqual(results[1],results[0]);
  }],
  ['Humble quota rejection and later malformed item leave the committed checkpoint and records unchanged',()=>humbleWorker(async h=>{
    assert((await h.commit(await h.acquire())).response.ok);const before=await h.pageA.getDatabase();
    h.setOrders([humbleOrder(1),humbleOrder(2),humbleOrder(3)]);h.setFailures(['order-3']);const a=await h.acquire();
    const original=h.memory.area.set;h.memory.area.set=async patch=>{if(patch.galacticLibraryDatabase)throw Error('Quota exceeded');return original(patch);};
    const rejected=await h.commit(a);assert(!rejected.response.ok);assert.match(rejected.response.error,/Quota/);h.memory.area.set=original;
    const db=await h.pageB.getDatabase();assert.deepEqual(db.providerItems,before.providerItems);assert.deepEqual(db.providers.humble.syncState,before.providers.humble.syncState);
    const b=await h.acquire();b.result.items.push({...b.result.items[0],mediaType:'invalid'});assert(!(await h.commit(b)).response.ok);
    assert.deepEqual((await h.pageA.getDatabase()).providerItems,before.providerItems);
  })],
  ['Humble malformed partial receipts cannot gain archival or checkpoint authority',()=>humbleWorker(async h=>{
    h.setOrders([humbleOrder(1),humbleOrder(2)]);h.setFailures(['order-2']);const a=await h.acquire();
    for(const mutate of [r=>r.snapshot.successfulPurchaseIds.push('order-2'),r=>r.snapshot.scopes[0].expectedCount=1,r=>r.snapshot.itemCount=99,r=>r.knownPurchaseIds.push('fabricated')]){
      const bad=structuredClone(a);mutate(bad.result);const response=await h.commit(bad);assert(!response.response.ok);assert.equal(Object.keys((await h.pageA.getDatabase()).providerItems).length,0);
    }
    assert((await h.commit(a)).response.ok);
  })],
  ['Humble detectable mid-detail authentication rejection aborts all uncommitted results',()=>humbleWorker(async h=>{
    h.setOrders([humbleOrder(1),humbleOrder(2)]);const fetch=h.context.fetch;h.context.fetch=async path=>path.includes('/order/order-2?')?{ok:false,status:403}:fetch(path);
    await assert.rejects(h.acquire(),/login has expired/);assert.equal(Object.keys((await h.pageA.getDatabase()).providerItems).length,0);
  })],
  ['Humble partial new-profile import preserves the other local profile and its checkpoint',()=>humbleWorker(async h=>{
    assert((await h.commit(await h.acquire())).response.ok);const before=await h.pageA.getDatabase(),a=before.providers.humble.activeProfileId;
    h.setOrders([humbleOrder(2),humbleOrder(3)]);h.setFailures(['order-3']);await assert.rejects(h.acquire('full','Other'),/Explicitly confirm/);
    const acquired=await h.acquire('full','Other',true);assert((await h.commit(acquired)).response.ok);const db=await h.pageA.getDatabase();
    assert.notEqual(db.providers.humble.activeProfileId,a);assert.deepEqual(db.providerProfiles[a],before.providerProfiles[a]);assert.equal(Object.keys(db.providerItems).length,2);
  })]
);
