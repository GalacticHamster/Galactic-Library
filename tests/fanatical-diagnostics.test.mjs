import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFanaticalOrdersInPage} from '../src/providers/fanatical-scan.js';
import {fanaticalWorker,fanaticalOrder,fanaticalSender} from './fanatical-coverage.js';
const tools=globalThis.GalacticFanatical,one=n=>fanaticalOrder(n,['book']);
function scanner(reply,options={}){
 const paths=[];let token='FAKE_TOKEN_SECRET';
 const context=vm.createContext({URL,TextEncoder,crypto:webcrypto,AbortController,setTimeout:(fn,ms)=>setTimeout(fn,ms===20000?ms:0),clearTimeout,
 localStorage:{getItem:()=>JSON.stringify({token})},fetch:async path=>{paths.push(path);const r=await reply(path,()=>{token='CHANGED';});return {status:r.status??200,headers:new Headers(r.headers??{}),json:async()=>r.data};},...options});
 return {paths,run:args=>vm.runInContext(`(${readFanaticalOrdersInPage.toString()})`,context)({fullScan:true,diagnostics:true,...args})};
}
function checkFailure(result,category,stage){assert.equal(result.fanaticalFailure,1);assert.equal(result.diagnostic.category,category);assert.equal(result.diagnostic.stage,stage);assert(tools.scanReport(result.diagnostic));assert(!result.items);assert(!result.diagnostic.acquisitionFinished);}
for(const [pages,count]of [[1,1],[25,25],[26,26],[46,46],[30,1200]])test(`diagnostics: clean ${count} orders/${pages} pages preserves requests and products`,async()=>{
 const orders=Array.from({length:count},(_,i)=>one(i+1)),size=count/pages;
 const h=scanner(p=>{if(p.includes('/orders/'))return {data:orders.find(o=>p.endsWith(o._id))};const page=Number(new URL(p,'https://www.fanatical.com').searchParams.get('page')??1);return {data:orders.slice((page-1)*size,page*size),headers:{'x-total-count':String(count),...(page<pages?{link:`</api/user/orders?page=${page+1}>; rel="next"`}:{})}};});
 const r=await h.run();assert.equal(r.items.length,count);assert(r.acquisitionComplete&&r.coverage.complete);assert.equal(h.paths.length,count+pages);assert.equal(r.diagnostic.pagesAttempted,pages);assert.equal(r.diagnostic.ordersValidated,count);assert.equal(r.diagnostic.category,'none');assert(tools.scanReport(r.diagnostic));
 const {diagnostic,...projection}=r;assert.deepEqual(JSON.parse(JSON.stringify(projection)),JSON.parse(JSON.stringify(await h.run({diagnostics:false}))));
 await fanaticalWorker(async worker=>{
  worker.setReply(p=>{if(p.includes('/orders/'))return {status:200,data:orders.find(o=>p.endsWith(o._id))};const page=Number(new URL(p,'https://www.fanatical.com').searchParams.get('page')??1);return {status:200,data:orders.slice((page-1)*size,page*size),headers:{'x-total-count':String(count),...(page<pages?{link:'</api/user/orders?page='+String(page+1)+'>; rel="next"'}:{})}};});
  const a=await worker.acquire();assert(a.projection.ok,a.projection.error);assert((await worker.commit(a)).result.ok);const db=await worker.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,count);assert(Object.values(db.providerItems).every(i=>i.ownership==='owned'));assert.equal(worker.paths.length,count+pages);const writes=worker.memory.commits.length;
  worker.paths.length=0;const quick=await worker.acquire('incremental');assert(quick.projection.ok,quick.projection.error);assert.equal(quick.projection.result.ordersScanned,0);assert((await worker.commit(quick)).result.ok);assert.equal(worker.paths.length,pages);assert.equal(worker.memory.commits.length,writes);
 },{storageEvents:true,concurrentQueries:true});
});
for(const status of [401,403])for(const stage of ['initial-listing','pagination','details'])test(`diagnostics: ${status} at ${stage} remains fatal`,async()=>{
 const h=scanner(p=>p==='/api/user/orders'&&stage!=='initial-listing'?{data:[one(1)],headers:stage==='pagination'?{link:'</api/user/orders?page=2>; rel="next"'}:{}}:{status});checkFailure(await h.run(),'authentication',stage);
});
test('diagnostics: missing sign-in and changing session stay fatal',async()=>{
 checkFailure(await scanner(()=>({}),{localStorage:{getItem:()=>null}}).run(),'authentication','initial-listing');
 checkFailure(await scanner((p,change)=>{if(p.includes('/orders/'))change();return {data:p.includes('/orders/')?one(1):[one(1)]};}).run(),'scope','projection');
});
test('diagnostics: shape, missing identity, transport and unknown exceptions are distinct and private',async()=>{
 for(const data of [{orders:[one(1)]},null,'FAKE_TITLE'])checkFailure(await scanner(()=>({data})).run(),'shape','initial-listing');
 checkFailure(await scanner(()=>({data:[{status:'COMPLETE'}]})).run(),'summary','initial-listing');
 checkFailure(await scanner(()=>{throw Error('FAKE_TOKEN FAKE_ACCOUNT https://private.example FAKE_ORDER FAKE_TITLE\n at FAKE_STACK');}).run(),'listing','initial-listing');
 const r=await scanner(()=>({data:[one(1)]}),{crypto:{subtle:{digest:async()=>{throw Error('FAKE_TOKEN FAKE_ACCOUNT FAKE_ORDER FAKE_TITLE FAKE_STACK');}}}}).run();checkFailure(r,'unknown','summaries');assert(!/FAKE_/u.test(JSON.stringify(r)));
});
test('diagnostics: later transport and unsafe/missing/repeated continuations retain authorized prefix',async()=>{
 for(const kind of ['transport','unsafe','missing','repeated','duplicate']){
  const h=scanner(p=>{
   if(p.includes('/orders/'))return {data:one(1)};
   if(kind==='transport'&&p.includes('?'))throw Error('FAKE_TOKEN');
   if(kind==='unsafe')return {data:[one(1)],headers:{link:'<https://private.invalid/api/user/orders>; rel="next"'}};
   if(kind==='missing')return {data:[one(1)],headers:{'x-total-count':'2'}};
   return {data:[one(1)],headers:kind==='duplicate'?{}:{link:`</api/user/orders${p.includes('?')?'?page=2':'?page=2'}>; rel="next"`}};
  });
  const r=await h.run();assert.equal(r.items.length,1);if(kind!=='duplicate'){assert(r.recovery.listingIncomplete);assert.equal(r.diagnostic.category,kind==='transport'?'listing':'continuation');}assert(tools.scanReport(r.diagnostic));
 }
});
test('diagnostics: page/order/occurrence bounds retain existing fatal versus prefix policy',async()=>{
 const r=await scanner(()=>({data:Array(100001).fill(one(1))})).run();checkFailure(r,'limit','initial-listing');
 const h=scanner(p=>p.includes('/orders/')?{data:one(Number(p.slice(-6)))}:{data:[one(Number(new URL(p,'https://www.fanatical.com').searchParams.get('page')??1))],headers:{link:`</api/user/orders?page=${Number(new URL(p,'https://www.fanatical.com').searchParams.get('page')??1)+1}>; rel="next"`}});
 const limited=await h.run();assert(limited.recovery.listingIncomplete);assert.equal(limited.diagnostic.category,'limit');assert.equal(limited.diagnostic.pagesAttempted,1000);
 const shared=Array.from({length:501},(_,i)=>{const o=one(i+1);o.items[0].bundles[0].games[0]._id='shared-product';return o;});
 checkFailure(await scanner(p=>({data:p.includes('/orders/')?shared.find(o=>p.endsWith(o._id)):shared})).run(),'limit','projection');
});
test('diagnostics: malformed summaries and details retain valid peers without leaking purchase data',async()=>{
 for(const kind of ['summary','status','missing','transport','malformed','identity']){
 const a=one(1),b=one(2);if(kind==='summary')b.items=[];if(kind==='status')b.status='bad status';
 const h=scanner(p=>{if(!p.includes('/orders/'))return {data:[a,b]};if(p.endsWith(a._id))return {data:a};if(kind==='transport')throw Error('FAKE_ORDER');return {data:kind==='missing'?null:kind==='malformed'?{...b,items:[]}:kind==='identity'?a:b};});
 const r=await h.run();assert.equal(r.items.length,1,kind);assert.equal(r.recovery.failedOrders,1,kind);assert.equal(r.diagnostic.ordersUnresolved,1);assert.equal(r.diagnostic.category,['summary','status'].includes(kind)?'summary':'detail');assert(tools.scanReport(r.diagnostic));
 }
});
test('diagnostics: strict report allowlist rejects invalid fields and discards secrets',()=>{
 const clean={...tools.failureReport('unknown'),FAKE_TOKEN:'FAKE_SECRET',stack:'FAKE_STACK',url:'https://private.invalid'};assert(!/FAKE|private/u.test(JSON.stringify(tools.scanReport(clean))));
 for(const patch of [{version:2},{category:'FAKE_TITLE'},{stage:'FAKE_URL'},{pagesAttempted:-1},{pagesAttempted:100001},{acquisitionFinished:'true'},{countsAvailable:'yes'}])assert.equal(tools.scanReport({...clean,...patch}),null);
});
test('diagnostics: worker null, rejected injection and counterfeit projections never authorize save',()=>fanaticalWorker(async h=>{
 const original=chrome.scripting.executeScript;const good=(await h.acquire()).projection.result;
 const invalid=[null,{}, {...good,schemaVersion:2},{...good,ordersScanned:-1},{...good,items:Array(50001).fill(good.items[0])},{...good,coverage:{...good.coverage,listedOrders:-1}},{...good,coverage:{...good.coverage,complete:true,expectedTotal:100}},{...good,fanaticalFailure:1,diagnostic:tools.failureReport('shape','initial-listing')}];
 for(const value of invalid){chrome.scripting.executeScript=async()=>[{result:value}];const r=(await h.acquire()).projection;assert(!r.ok);assert(r.diagnostic);assert.equal(Object.keys((await h.pageA.getDatabase()).providerItems).length,0);}
 chrome.scripting.executeScript=async()=>{throw Error('FAKE_TOKEN FAKE_ACCOUNT FAKE_ORDER FAKE_TITLE https://private.invalid FAKE_STACK');};const r=(await h.acquire()).projection;assert(!r.ok);assert.equal(r.diagnostic.category,'unavailable');assert(!/FAKE|private/u.test(JSON.stringify(r)));
 chrome.scripting.executeScript=original;
 const wrong=await h.dispatch({type:'FETCH_FANATICAL_ORDERS'}, {...fanaticalSender,url:'https://foreign.invalid/'});assert(!wrong.ok);
}));
test('diagnostics: real worker categorized failures do not advance acquisition or full checkpoints',()=>fanaticalWorker(async h=>{
 for(const status of [401,403]){h.setStatus(status);const r=(await h.acquire()).projection;assert(!r.ok);assert.equal(r.diagnostic.category,'authentication');assert(/Sign in/u.test(r.error));}
 const db=await h.pageA.getDatabase();assert.equal(Object.keys(db.providerItems).length,0);assert(!db.providers.fanatical.syncState?.acquisitionCheckedAt);assert(!db.providers.fanatical.fullSyncAt);
}));
test('diagnostics: a single failed detail remains fatal with its detail stage',async()=>{checkFailure(await scanner(p=>({data:p.includes('/orders/')?null:[one(1)]})).run(),'detail','details');});
import {fixture as contentFixture} from './fanatical-navigation.js';
for(const phase of ['state','fetch','commit'])test(`diagnostics UI: ${phase} errors never leak secrets or claim a save`,async()=>{
 const h=contentFixture(),secret='FAKE_TOKEN FAKE_ACCOUNT FAKE_ORDER FAKE_TITLE https://private.invalid FAKE_STACK';
 if(phase==='state')h.setState(async()=>{throw Error(secret);});
 if(phase==='fetch')h.setFetch(async()=>{throw Error(secret);});
 if(phase==='commit')h.setCommit(async()=>({ok:false,error:secret}));
 await h.roots[0].shadow.buttons[0].click();assert.match(h.roots[0].shadow.status.textContent,/import failed/u);assert(!/FAKE_|private.invalid/u.test(h.roots[0].shadow.status.textContent));assert(!/FAKE_|private.invalid/u.test(h.failures.join('')));
 h.roots[0].shadow.exportButton.click();const report=JSON.parse(await h.reports[0]);assert.equal(report.committed,false);assert.equal(report.saveAttempted,phase==='commit');assert.equal(report.persistence,phase==='commit'?'unconfirmed':'not-attempted');assert(!/FAKE_|private.invalid/u.test(JSON.stringify(report)));
});
test('diagnostics UI: complete and partial save outcomes require actual acknowledgment',async()=>{
 for(const partial of [false,true]){
 const h=contentFixture();h.setFetch(async()=>({ok:true,diagnostic:{...tools.failureReport(partial?'detail':'none','details'),acquisitionFinished:!partial},result:{items:[],ordersScanned:1,...(partial?{recovery:{failedOrders:1,listingIncomplete:false}}:{})}}));
 await h.roots[0].shadow.buttons[0].click();h.roots[0].shadow.exportButton.click();const report=JSON.parse(await h.reports[0]);assert(report.committed&&report.saveAttempted&&report.validatedDataReturned);assert.equal(report.retry,partial?'quick':'none');assert.equal(report.persistence,'committed');
 }
});
test('diagnostics: quota and disk failures preserve earlier records and scan fingerprints',()=>fanaticalWorker(async h=>{
 h.setOrders([one(1)]);assert((await h.commit(await h.acquire())).result.ok);const before=await h.pageA.getDatabase();h.setOrders([one(1),one(2)]);
 const set=h.memory.area.set;
 for(const reason of ['Quota exceeded','Disk write rejected']){
 const a=await h.acquire();h.memory.area.set=async patch=>{if(patch.galacticLibraryDatabase)throw Error(reason);return set(patch);};const saved=await h.commit(a);assert(!saved.result.ok);h.memory.area.set=set;const after=await h.pageB.getDatabase();assert.deepEqual(after.providerItems,before.providerItems);assert.deepEqual(after.providerHistory,before.providerHistory);assert.deepEqual(after.providers.fanatical.syncState,before.providers.fanatical.syncState);
 }
 assert((await h.commit(await h.acquire('incremental'))).result.ok);assert.equal(Object.keys((await h.pageA.getDatabase()).providerItems).length,2);
}));
