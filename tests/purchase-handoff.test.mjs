import test from 'node:test';import assert from 'node:assert/strict';
import '../shared/purchase-snapshot.js';import '../shared/purchase-transfer.js';
import {createEmptyDatabase,normalizeProviderItem,rebuildCanonicalItems} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {purchaseAccounts,purchaseSnapshot,applyPurchaseSnapshot} from '../src/background/purchase-handoff.js';
const S=globalThis.GalacticPurchaseSnapshot,T=globalThis.GalacticPurchaseTransfer;
const row=(n=0,provider='fanatical')=>({providerItemId:provider==='fanatical'?'product_'+n:'purchase_'+n+':product:native_'+n,title:'Synthetic book '+n,mediaType:'book',metadata:provider==='fanatical'?{bundleId:'bundle_123',bundleTitle:'Synthetic bundle'}:{purchaseId:'purchase_'+n,sourceBundle:'Synthetic bundle'},purchasedAt:null,origins:[]});
const snapshot=(records=[row()],provider='fanatical')=>S.validate({protocolVersion:1,provider,snapshotId:'snapshot-control',accountRef:'source-profile',accountLabel:'Personal',capturedAt:'2026-10-09T12:00:00Z',scope:'historical',completeness:'partial',limitations:[],records});
function bus(data=snapshot()){
 const services={},areas={},commits=[],states={};for(const role of ['gl','hb','fan']){areas[role]={get:async defaults=>structuredClone({...defaults,...states[role]}),set:async values=>{states[role]={...states[role],...structuredClone(values)};}};const runtime={id:role,getURL:()=>role+'://own/',onMessage:{addListener(){}},onMessageExternal:{addListener(){}},openOptionsPage:async()=>{},sendMessage:async(id,message)=>{if(typeof id!=='string')return {};if(!services[id])throw Error('Missing peer');try{return {ok:true,protocolVersion:1,...await services[id].external(message,{id:role})};}catch(error){return {ok:false,protocolVersion:1,error:error.message};}}};
 services[role]=T.createService({runtime,area:areas[role],authorize:async(id,provider)=>provider===data.provider&&(role==='gl'?id===(provider==='humble'?'hb':'fan'):id==='gl'),peer:async()=>role==='gl'?(data.provider==='humble'?'hb':'fan'):'gl',accounts:async()=>[{accountRef:'source-profile',label:'Personal',count:data.records.length}],snapshot:async()=>structuredClone(data),commit:async(value,target)=>{commits.push({role,value,target});return {added:value.records.length,updated:0,unchanged:0,skipped:0};}});}
 return {services,states,commits};}
for(const provider of ['humble','fanatical'])for(const destination of ['gl',provider==='humble'?'hb':'fan'])test(provider+' transfer into '+destination+' validates before one local commit',async()=>{const b=bus(snapshot([row(1,provider)],provider)),result=await b.services[destination].local({action:'import',provider,accountRef:'source-profile',target:{accountRef:'destination'},confirmed:true});assert.equal(result.received,1);assert.equal(b.commits.length,1);assert.equal(b.commits[0].role,destination);});
test('Capabilities/version/provider/sender boundaries cannot import externally',async()=>{const b=bus();for(const message of [{type:'GH_PURCHASE_BEGIN',protocolVersion:2,provider:'fanatical'},{type:'GH_PURCHASE_BEGIN',protocolVersion:1,provider:'humble'},{type:'GH_PURCHASE_IMPORT',protocolVersion:1,provider:'fanatical'}])await assert.rejects(b.services.gl.external(message,{id:'fan'}));await assert.rejects(b.services.gl.external({type:'GH_PURCHASE_BEGIN',protocolVersion:1,provider:'fanatical'},{id:'unrelated'}));assert.equal(b.commits.length,0);});
test('A transfer requires explicit local account confirmation; equal nicknames do not link accounts',async()=>{const b=bus();await assert.rejects(b.services.gl.local({action:'import',provider:'fanatical',accountRef:'source-profile',target:{accountRef:'Personal'}}),/Confirm/);assert.equal(b.commits.length,0);});
test('Chunk token is peer/provider bound and repeated reads are identical',async()=>{const b=bus(),m=(await b.services.gl.external({type:'GH_PURCHASE_BEGIN',protocolVersion:1,provider:'fanatical',accountRef:'source-profile'},{id:'fan'})).manifest,request={type:'GH_PURCHASE_CHUNK',protocolVersion:1,provider:'fanatical',token:m.token,index:0};assert.deepEqual(await b.services.gl.external(request,{id:'fan'}),await b.services.gl.external(request,{id:'fan'}));await assert.rejects(b.services.gl.external(request,{id:'hb'}));await assert.rejects(b.services.gl.external({...request,index:2},{id:'fan'}));});
test('Source worker restart / missing peer fails without receiver import',async()=>{const b=bus();const prepared=await b.services.fan.prepare('fanatical','source-profile','gl');b.states.gl={galacticPurchaseOffer:{peerId:'fan',provider:'fanatical',manifest:prepared}};delete b.services.fan;await assert.rejects(b.services.gl.local({action:'import',provider:'fanatical',accountRef:'source-profile',useOffer:true,offerToken:prepared.token,confirmed:true,target:{accountRef:'destination'}}));assert.equal(b.commits.length,0);});
test('Unknown secrets, auth fields, unsafe links and corrupt schema are rejected',()=>{for(const record of [{...row(),redemptionKey:'secret'},{...row(),metadata:{token:'secret'}},{...row(),metadata:{detailUrl:'https://evilfanatical.com/a'}},{...row(),metadata:{detailUrl:'https://www.fanatical.com/a?token=secret'}},{...row(),providerItemId:null}])assert.throws(()=>snapshot([record]));assert.throws(()=>S.validate({...snapshot(),scope:'incomplete',completeness:'complete'}));});
test('Corrupted chunks never reach the local commit',async()=>{const b=bus(),original=b.services.fan.external;b.services.fan.external=async(...args)=>{const result=await original(...args);if(args[0].type==='GH_PURCHASE_CHUNK')result.records[0].title='Corrupted';return result;};await assert.rejects(b.services.gl.local({action:'import',provider:'fanatical',accountRef:'source-profile',confirmed:true,target:{accountRef:'destination'}}),/Corrupt/);assert.equal(b.commits.length,0);});
test('GL merge is non-destructive, account-scoped and stable on repeat',async()=>{const d=createEmptyDatabase(),p=newProviderProfile('fanatical','Personal'),other=newProviderProfile('fanatical','Other');d.providerProfiles[p.profileId]=p;d.providerProfiles[other.profileId]=other;const raw=snapshot();let target=(await purchaseAccounts(d,'fanatical'))[0];const first=await applyPurchaseSnapshot(d,raw,target);assert.equal(first.added,1);assert.equal(Object.keys(d.providerItems).length,1);target=(await purchaseAccounts(d,'fanatical'))[0];const before=JSON.stringify(d),again=await applyPurchaseSnapshot(d,raw,target);assert.equal(again.unchanged,1);assert.equal(JSON.stringify(d),before);await assert.rejects(applyPurchaseSnapshot(d,raw,{...target,stamp:'wrong'}),/Destination/);const incoming=snapshot([{...row(),metadata:{}}]);assert.equal((await applyPurchaseSnapshot(d,incoming,target)).unchanged,1);assert.equal(Object.values(d.providerItems)[0].metadata.bundleTitle,'Synthetic bundle');});
test('Older HB records can match existing purchase evidence only; no guessed native IDs',async()=>{const d=createEmptyDatabase(),p=newProviderProfile('humble','Personal');d.providerProfiles[p.profileId]=p;const item=normalizeProviderItem({provider:'humble',profileId:p.profileId,providerItemId:'purchase_1:product:native_1',title:'Synthetic book 1',mediaType:'book',ownership:'owned',metadata:{purchaseId:'purchase_1'}});d.providerItems[item.id]=item;d.canonicalItems=rebuildCanonicalItems(d.providerItems);const data=snapshot([{...row(1,'humble'),providerItemId:null}],'humble'),target=(await purchaseAccounts(d,'humble'))[0];assert.equal((await applyPurchaseSnapshot(d,data,target)).updated,1);const unknown=snapshot([{...row(9,'humble'),providerItemId:null}],'humble');await assert.rejects(applyPurchaseSnapshot(d,unknown,(await purchaseAccounts(d,'humble'))[0]),/No compatible/);assert.equal(Object.keys(d.providerItems).length,1);});
test('Large 6,321-record snapshot uses bounded chunks and separate transfer/import timing',async()=>{const data=snapshot(Array.from({length:6321},(_,n)=>row(n))),b=bus(data),start=performance.now();const result=await b.services.gl.local({action:'import',provider:'fanatical',accountRef:'source-profile',confirmed:true,target:{accountRef:'destination'}});assert.equal(result.received,6321);assert.equal(b.commits.length,1);console.log(JSON.stringify({records:6321,bytes:S.size(data),transferAndImportMs:performance.now()-start,importMs:result.importMs}));});

import {createStorageWriter} from '../src/background/storage-writer.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
function memory(values={}){return {values,sets:0,get:async defaults=>structuredClone({...defaults,...values}),async set(updates){this.sets++;Object.assign(values,structuredClone(updates));},remove:async()=>{}};}
test('GL native writer atomically validates the import, preserves other namespaces, and leaves scans intact',async()=>{
 const area=memory(),writer=createStorageWriter(area);const data=snapshot();
 assert.equal((await writer.importPurchaseSnapshot(data,{newLabel:'Personal',expectedActiveId:null})).added,1);
 const db=await writer.getDatabase(),target=(await purchaseAccounts(db,'fanatical'))[0];assert.equal(Object.keys(db.providerItems).length,1);
 const before=JSON.stringify(area.values),writes=area.sets;
 assert.equal((await writer.importPurchaseSnapshot(data,target)).unchanged,1);assert.equal(JSON.stringify(area.values),before);assert.equal(area.sets,writes);
 const broken={...data,records:[{...row(),metadata:{token:'secret'}}]};await assert.rejects(writer.importPurchaseSnapshot(broken,target));assert.equal(JSON.stringify(area.values),before);
 area.values.galacticLibraryProviderScans={fanatical:{scanToken:'active'}};
 await assert.rejects(writer.importPurchaseSnapshot(data,target),/scan to finish/);
 delete area.values.galacticLibraryProviderScans;
 assert.equal(Object.keys(area.values[DATABASE_STORAGE_KEY].providerItems).length,1);
});
test('Simultaneous preparations reserve the bounded two-source-session capacity',async()=>{
 let resolve;const gate=new Promise(done=>resolve=done),base=snapshot();
 const service=T.createService({runtime:{},area:{},authorize:async()=>true,peer:async()=>'',accounts:async()=>[],snapshot:async()=>{await gate;return base;},commit:async()=>{}});
 const first=service.prepare('fanatical','source','gl'),second=service.prepare('fanatical','source','gl');await assert.rejects(service.prepare('fanatical','source','gl'),/Two outgoing/);resolve();await Promise.all([first,second]);
});
test('Expired, reordered and malformed manifests cannot commit, and retries remain possible',async()=>{
 for(const mode of ['expired','order','count']){
 const b=bus(),original=b.services.fan.external;
 b.services.fan.external=async(...args)=>{const value=await original(...args);if(args[0].type==='GH_PURCHASE_BEGIN'){if(mode==='expired')value.manifest.expiresAt=0;if(mode==='count')value.manifest.chunkCount=-1;}if(args[0].type==='GH_PURCHASE_CHUNK'&&mode==='order')value.index++;return value;};
 const request={action:'import',provider:'fanatical',accountRef:'source-profile',confirmed:true,target:{accountRef:'destination'}};
 await assert.rejects(b.services.gl.local(request));assert.equal(b.commits.length,0);b.services.fan.external=original;assert.equal((await b.services.gl.local(request)).received,1);
 }
});

test('Concurrent receiver attempts admit one import, and a failed commit is retryable',async()=>{
 const b=bus();let release;const gate=new Promise(done=>release=done),original=b.services.fan.external;let entered;const ready=new Promise(done=>entered=done);
 b.services.fan.external=async(...args)=>{if(args[0].type==='GH_PURCHASE_CHUNK'){entered();await gate;}return original(...args);};
 const request={action:'import',provider:'fanatical',accountRef:'source-profile',confirmed:true,target:{accountRef:'destination'}};
 const first=b.services.gl.local(request);await ready;await assert.rejects(b.services.gl.local(request),/already importing/);release();await first;assert.equal(b.commits.length,1);
});
test('Source offer is not a commit; interrupted receiver requires new validation and commit',async()=>{
 const b=bus();const sent=await b.services.fan.local({action:'send',provider:'fanatical',accountRef:'source-profile',confirmed:true,target:{accountRef:'source-profile'}});assert.equal(sent.offered,true);assert.equal(b.commits.length,0);
 const offer=b.states.gl.galacticPurchaseOffer;
 const result=await b.services.gl.local({action:'import',provider:'fanatical',accountRef:'source-profile',useOffer:true,offerToken:offer.manifest.token,confirmed:true,target:{accountRef:'destination'}});assert.equal(result.acknowledged,true);assert.equal(b.commits.length,1);assert.equal(b.states.gl.galacticPurchaseOffer,null);
 await assert.rejects(b.services.fan.external({type:'GH_PURCHASE_CHUNK',provider:'fanatical',protocolVersion:1,token:offer.manifest.token,index:0},{id:'gl'}),/expired/);
});
test('Every snapshot scope remains additive: missing rows are never inferred deleted',async()=>{
 const area=memory(),writer=createStorageWriter(area);await writer.importPurchaseSnapshot(snapshot([row(0),row(1)]),{newLabel:'Personal',expectedActiveId:null});
 for(const scope of ['full','incremental','historical','incomplete']){const target=(await purchaseAccounts(await writer.getDatabase(),'fanatical'))[0];await writer.importPurchaseSnapshot({...snapshot([row(0)]),scope,completeness:scope==='full'?'complete':'partial'},target);assert.equal(Object.keys((await writer.getDatabase()).providerItems).length,2);}
});
test('Failed atomic GL storage write leaves both stored libraries and the sender snapshot unchanged',async()=>{
 const area=memory(),writer=createStorageWriter(area),data=snapshot();await writer.importPurchaseSnapshot(data,{newLabel:'Personal',expectedActiveId:null});const before=JSON.stringify(area.values),source=JSON.stringify(data),target=(await purchaseAccounts(await writer.getDatabase(),'fanatical'))[0],set=area.set;
 area.set=async()=>{throw Error('Synthetic write failure');};await assert.rejects(writer.importPurchaseSnapshot(snapshot([row(2)]),target),/write failure/);assert.equal(JSON.stringify(area.values),before);assert.equal(JSON.stringify(data),source);
 area.set=set;assert.equal((await writer.importPurchaseSnapshot(snapshot([row(2)]),target)).added,1);
});

test('Persistent offer survives browser/worker restart but stale in-memory grant cannot import',async()=>{
 const first=bus();await first.services.fan.local({action:'send',provider:'fanatical',accountRef:'source-profile',confirmed:true,target:{accountRef:'source-profile'}});const saved=structuredClone(first.states.gl);
 const restarted=bus();Object.assign(restarted.states.gl??={},saved);const request={action:'import',provider:'fanatical',accountRef:'source-profile',useOffer:true,offerToken:saved.galacticPurchaseOffer.manifest.token,confirmed:true,target:{accountRef:'destination'}};
 await assert.rejects(restarted.services.gl.local(request),/expired|restarted/);assert.equal(restarted.commits.length,0);assert.equal(restarted.states.gl.galacticPurchaseOffer,null,'Failed stale offers must not trap Refresh/retry for ten minutes');
 assert.equal((await restarted.services.gl.local({...request,useOffer:false})).received,1);
});
test('Changing authorization during chunk transport prevents the final commit',async()=>{
 const data=snapshot(),base=bus(data);let permitted=true;const source=base.services.fan;
 const receiver=T.createService({runtime:{sendMessage:async(id,message)=>{const value=await source.external(message,{id:'gl'});if(message.type==='GH_PURCHASE_CHUNK')permitted=false;return {ok:true,protocolVersion:1,...value};}},area:base.states,peer:async()=> 'fan',authorize:async()=>permitted,accounts:async()=>[],snapshot:async()=>data,commit:async()=>{throw Error('Commit must not be reached');}});
 await assert.rejects(receiver.local({action:'import',provider:'fanatical',accountRef:'source-profile',target:{accountRef:'destination'},confirmed:true}),/permission changed/);
});

test('FAN aggregate history then native scan, or native scan then history, never duplicates occurrences',async()=>{
 const order='c'.repeat(64),origin={orderRef:order,bundleId:'bundle_123',bundleTitle:'Synthetic bundle',bundleSlug:'',purchasedAt:null,quantity:2,occurrenceRefs:[]},data=snapshot([{...row(),origins:[origin]}]);
 const native=[0,1].map(n=>({occurrenceRef:String(n+1).repeat(64),orderRef:order,bundleId:'bundle_123',bundleTitle:'Synthetic bundle',purchasedAt:null,observedAt:'2026-10-09T00:00:00.000Z'}));
 for(const scanFirst of [false,true]){
 const area=memory(),writer=createStorageWriter(area);await writer.importPurchaseSnapshot(snapshot([]),{newLabel:'Personal',expectedActiveId:null});
 const scan=()=>writer.mergeProviderItems('fanatical',[{providerItemId:'product_0',title:row().title,mediaType:'book',ownership:'owned',metadata:{...row().metadata,source:'fanatical-order-history',purchaseOrigins:native}}]);
 const handoff=async()=>writer.importPurchaseSnapshot(data,(await purchaseAccounts(await writer.getDatabase(),'fanatical'))[0]);
 if(scanFirst){await scan();await handoff();}else{await handoff();assert.equal(Object.values((await writer.getDatabase()).providerItems)[0].metadata.purchaseOrigins.filter(p=>p.basis).length,2);await scan();}
 const item=Object.values((await writer.getDatabase()).providerItems)[0];assert.equal(item.metadata.purchaseOrigins.length,2);assert.equal(item.metadata.purchaseOrigins.filter(p=>p.basis).length,0);await handoff();assert.equal(Object.values((await writer.getDatabase()).providerItems)[0].metadata.purchaseOrigins.length,2);
 }
});

test('GL handoff never exports display ownership overrides as underlying purchase evidence',async()=>{
 const database=createEmptyDatabase(),profile=newProviderProfile('humble','Personal');database.providerProfiles[profile.profileId]=profile;
 const item=normalizeProviderItem({provider:'humble',profileId:profile.profileId,providerItemId:'purchase_1:product:item',title:'Uncertain library evidence',mediaType:'book',ownership:'unknown',metadata:{purchaseId:'purchase_1'}});database.providerItems[item.id]=item;
 database.ownershipPolicy={allOwned:true,providers:{humble:true}};
 const data=await purchaseSnapshot(database,'humble',profile.profileId);assert.equal(data.records.length,0);assert(data.limitations.some(note=>/overrides/.test(note)));
});

test('Expired Humble key purchases retain purchase evidence without implying destination ownership',async()=>{
 const database=createEmptyDatabase(),profile=newProviderProfile('humble','Personal');database.providerProfiles[profile.profileId]=profile;
 const item=normalizeProviderItem({provider:'humble',profileId:profile.profileId,providerItemId:'purchase:key:1',title:'Expired key purchase',mediaType:'game',ownership:'owned',metadata:{purchaseId:'purchase',entitlement:'third-party-key',keyStatus:'expired'}});database.providerItems[item.id]=item;assert.equal(item.ownership,'unknown');
 const data=await purchaseSnapshot(database,'humble',profile.profileId);assert.equal(data.records.length,1);assert.equal(data.records[0].metadata.keyStatus,'expired');
});

test('A GL manual non-owned access review is not promoted into companion book ownership',async()=>{
 const database=createEmptyDatabase(),profile=newProviderProfile('humble','Personal');database.providerProfiles[profile.profileId]=profile;
 const item=normalizeProviderItem({provider:'humble',profileId:profile.profileId,providerItemId:'purchase:product:1',title:'Reviewed book',mediaType:'book',ownership:'owned',metadata:{purchaseId:'purchase'}});database.providerItems[item.id]=item;database.ownershipReviews[item.recordRef]={ownership:'borrowed'};
 assert.equal((await purchaseSnapshot(database,'humble',profile.profileId)).records.length,0);
});

test('GL destination stamp survives native storage property reordering but rejects actual changed profile facts',async()=>{
 const d=createEmptyDatabase(),p=newProviderProfile('fanatical','Personal');d.providerProfiles[p.profileId]=p;const target=(await purchaseAccounts(d,'fanatical'))[0];const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,value])=>[key,reorder(value)])):value;
 d.providerProfiles[p.profileId]=reorder(p);assert.notEqual(JSON.stringify(d.providerProfiles[p.profileId]),JSON.stringify(p));assert.equal((await applyPurchaseSnapshot(d,snapshot(),target)).added,1);
 const next=(await purchaseAccounts(d,'fanatical'))[0];d.providerProfiles[p.profileId].nickname='Changed';await assert.rejects(applyPurchaseSnapshot(d,snapshot(),next),/Destination account changed/);
});
