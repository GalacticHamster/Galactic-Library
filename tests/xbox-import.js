import {providerLabel} from '../src/ui/formatters.js';
import {acquisitionHistory} from '../src/ui/library-acquisitions.js';
import {normalizeProviderItem} from '../src/lib/models.js';
import {installXboxFixture} from './xbox-source-fixture.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {memory} from './final-gl-features.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {withWorker} from './storage.js';

export function xboxHarness(){
  const listeners=[],posts=[];let resolve,clock=1000;
  const ctx=vm.createContext({URL,TextEncoder,Uint8Array,crypto:webcrypto,Date:{now:()=>clock},location:{origin:'https://play.xbox.com',pathname:'/library'},addEventListener:(name,fn)=>listeners.push(fn)});
  vm.runInContext('('+installXboxFixture.toString()+')(globalThis)',ctx);
  const {env,data,generators,get,rows,access}=ctx.fixtureXbox;
  ctx.window=ctx;ctx.postMessage=value=>{posts.push(value);resolve?.(JSON.parse(JSON.stringify(value)));};
  for(const path of ['provider-snapshot.js','xbox-library.js','xbox-capture.js'])vm.runInContext(readFileSync(new URL('../src/providers/'+path,import.meta.url),'utf8'),ctx);
  return {ctx,env,data,generators,get,rows,access,posts,advance:()=>{clock+=120001;},read:()=>ctx.GalacticXboxLibrary.read(ctx),ask(action='prepare'){return new Promise(done=>{resolve=done;ctx.action=action;ctx.listeners=listeners;vm.runInContext("for(const fn of listeners)fn({source:window,origin:location.origin,data:{channel:'gl-xbox-request',nonce:'c'.repeat(32),action}});",ctx);});}};
}
const fp='a'.repeat(64),id=i=>'X'+String(i).padStart(11,'0');
const item=i=>({provider:'xbox',providerItemId:id(i),title:'Synthetic game '+i,mediaType:'game',ownership:'owned',platform:['Xbox One'],metadata:{source:'xbox-web-library',productId:id(i),accessBasis:'personal-owned-web-catalog',accessTypes:[1],supportedPlatforms:[2],productKind:'game'}});
const snapshot=items=>completeProviderSnapshot('xbox',items,[completedScope('owned-web-library',items.length,items.length,'reported-count')]);
const begin=(w,mode='full',fingerprint=fp,name='Personal',switching=false)=>w.beginProviderScan('xbox',name,mode,switching,1,null,false,fingerprint);
const commit=(w,scan,items,mode='full',fingerprint=fp)=>w.commitProviderScan('xbox',items,{syncMode:mode,...(mode==='full'?{fullSyncAt:'2026-10-16'}:{quickSyncAt:'2026-10-16'})},snapshot(items),scan.scanToken,1,false,fingerprint);

export const xboxImportTests=[
 ['Xbox projects the live-validated 40/264/37/14 source with stable products, platforms, editions and no invented purchase date',async()=>{
   assert.equal(providerLabel('xbox'),'Xbox — Web Library');
   const h=xboxHarness(),r=await h.ask();assert.equal(r.ok,true,r.error);assert.equal(r.items.length,37);assert.equal(new Set(r.items.map(i=>i.providerItemId)).size,37);assert(r.items.every(i=>i.ownership==='owned'&&i.acquiredAt===null));assert.deepEqual(r.items[0].platform,['Windows','Xbox One','Xbox Series X|S']);assert.equal(r.items[0].metadata.edition,'Deluxe Edition');assert.deepEqual(r.items[0].metadata.accessTypes,[1]);assert.equal(r.snapshot.scopes[0].expectedCount,37);assert.equal(r.snapshot.scopes[0].end,'reported-count');assert.equal((await h.ask('verify')).ok,true);
   const serialized=JSON.stringify(r);for(const privateValue of ['private-local-account','1234567890123456','Y00000000000','Z00000000000'])assert(!serialized.includes(privateValue));
   h.access.get(id(0)).staticMetadata.productKind=0;h.access.get(id(1)).staticMetadata.productKind=1;h.access.get(id(2)).staticMetadata.productKind=3;
   const kinds=(await h.ask()).items;assert(kinds.every(i=>i.mediaType==='game'));assert.equal(kinds[0].metadata.productKind,'durable');assert.equal(kinds[1].metadata.productKind,'app');assert.equal(kinds[2].metadata.productKind,'bundle');assert.notEqual(kinds[0].providerItemId,kinds[1].providerItemId);
 }],
 ['Xbox refuses count/preview mismatches, missing titles, duplicates, pending/error/invalidated cache and subscription/aggregate-only ownership',async()=>{
   for(const scenario of ['count','preview','duplicate','title','pending','error','invalidated','aggregate','subscription','trial','disc']){
     const h=xboxHarness();
     if(scenario==='count')h.get('catalogs').value[0].totalCount=38;
     if(scenario==='preview')h.get('catalogs').value[0].previewEntries[0]={productId:'Y00000000000'};
     if(scenario==='duplicate')h.rows[1]=h.rows[0];
     if(scenario==='title')h.rows[0].basicProductInfo.title='';
     if(scenario==='pending')h.get('assembled').fetchStatus='fetching';
     if(scenario==='error')h.get('profile').status='error';
     if(scenario==='invalidated')h.get('access').isInvalidated=true;
     if(['aggregate','subscription','trial','disc'].includes(scenario))h.access.set(id(0),{userAccessTypes:new Set(scenario==='aggregate'?[]:[{subscription:2,trial:16384,disc:8192}[scenario]]),aggregateAccessTypes:new Set([1])});
     const r=await h.ask();assert.equal(r.ok,false,scenario);assert.equal(r.items,undefined);assert(!JSON.stringify(r).includes('private'));
   }
   const h=xboxHarness();h.get('assembled').value=[];h.get('catalogs').value=[{id:'owned',totalCount:0,previewEntries:[]}];const empty=await h.ask();assert.equal(empty.ok,true,empty.error);assert.equal(empty.snapshot.itemCount,0);
 }],
 ['Xbox checks account and snapshot stability, preparation expiry and platform/media metadata without touching credentials or network APIs',async()=>{
   const h=xboxHarness();for(const name of ['email','fullName','tokens'])Object.defineProperty(h.get('profile').value,name,{get(){throw Error('private forbidden value');}});
   for(const object of [h.ctx,h.env,h.env.queryClient])for(const name of ['fetch','fetchQuery','tokens'])Object.defineProperty(object,name,{get(){throw Error('private forbidden value');}});
   assert.equal((await h.ask()).ok,true);h.rows[0].basicProductInfo.title='Updated title';assert.equal((await h.ask('verify')).ok,false);
   assert.equal((await h.ask()).ok,true);h.advance();assert.equal((await h.ask('verify')).ok,false);
   const other=xboxHarness();other.get('active').value='private-other-account';assert.equal((await other.ask()).ok,false);
   const wrong=xboxHarness();wrong.generators.profile.getUserQuery=()=>({getOptions:()=>({queryKey:['user','private-other','profile']})});assert.equal((await wrong.ask()).ok,false);
   const hostile=xboxHarness();Object.defineProperty(hostile.get('profile').value,'xuid',{get(){throw Error('private forbidden value');}});const error=await hostile.ask();assert.equal(error.ok,false);assert(!JSON.stringify(error).includes('private forbidden value'));
 }],
 ['Xbox full and quick imports are additive, idempotent, bound to accounts and preserve authoritative corrections through backup/restore',async()=>{
   const {writer}=memory();await assert.rejects(begin(writer,'full',null),/verified account/);await assert.rejects(writer.importUnscopedProviderItems('xbox',[item(0)]),/account-bound/);
   let d=await commit(writer,await begin(writer),[item(0),item(1)]),profile=d.providers.xbox.activeProfileId;const original=Object.values(d.providerItems).find(i=>i.providerItemId===id(0));
   assert.equal(acquisitionHistory([original],d).purchases,0);
   const purchase=normalizeProviderItem({provider:'humble',providerItemId:'synthetic-order:product:game',title:original.title,mediaType:'game',ownership:'owned',metadata:{purchaseId:'synthetic-order',sourceBundle:'Synthetic bundle',entitlement:'direct-download'}});
   const history=acquisitionHistory([original,purchase],d);assert.equal(history.purchases,1);assert.equal(history.ownedGroups,1);
   assert.equal(d.providerProfiles[profile].sourceAccountFingerprint,fp);d=await writer.saveOwnershipCorrections([ownershipCorrectionTarget(original,d)],{ownership:'returned',note:'Synthetic correction'});
   d=await commit(writer,await begin(writer,'incremental'),[item(0)],'incremental');assert.equal(Object.keys(d.providerItems).length,2);assert.equal(Object.keys(d.providerHistory).length,0);assert.equal(d.providers.xbox.syncHealth.differences.added,0);assert.equal(d.providers.xbox.syncHealth.differences.ownershipChanged,0);assert.equal(effectiveOwnershipRecord(Object.values(d.providerItems).find(i=>i.recordRef===original.recordRef),d).ownership,'returned');
   d=await commit(writer,await begin(writer),[]);assert.equal(Object.keys(d.providerItems).length,2);assert.deepEqual(parseBackup(createBackup(d)),d);await writer.restoreDatabase(parseBackup(createBackup(d)));assert.equal((await writer.getDatabase()).providerProfiles[profile].sourceAccountFingerprint,fp);
   await assert.rejects(begin(writer,'full','b'.repeat(64)),/different Xbox account/);await assert.rejects(begin(writer,'full',fp,'Other',true),/already saved/);
   const scan=await begin(writer);await assert.rejects(commit(writer,scan,[item(0)],'full','b'.repeat(64)),/account changed/);
 }],
 ['Xbox independent accounts and source validation preserve stale-lease, provider and snapshot safeguards',async()=>{
   const {writer}=memory();let d=await commit(writer,await begin(writer),[item(0)]),a=d.providers.xbox.activeProfileId;
   d=await commit(writer,await begin(writer,'full','b'.repeat(64),'Family',true),[item(0)],'full','b'.repeat(64));const b=d.providers.xbox.activeProfileId;assert.notEqual(a,b);assert.equal(Object.keys(d.providerItems).length,2);assert.equal(new Set(Object.values(d.providerItems).map(i=>i.recordRef)).size,2);
   const scan=await begin(writer,'incremental','b'.repeat(64),'Family');await writer.selectProviderProfile(a,b,true);await assert.rejects(commit(writer,scan,[item(0)],'incremental','b'.repeat(64)),/superseded/);
   for(const change of [{ownership:'unknown'},{provider:'steam'},{metadata:{...item(0).metadata,accessTypes:[2]}}]){const record={...item(0),...change};await assert.rejects(commit(writer,await begin(writer),[record]),/web-owned source/);}
 }],
 ['Xbox worker accepts only the exact Library origin/path, confirmed account, tab-bound lease and supported snapshot',()=>withWorker(async({dispatch})=>{
   const sender={id:chrome.runtime.id,url:'https://play.xbox.com/library',tab:{id:1}},items=[item(0)];
   for(const url of ['https://play.xbox.com/library-fake','https://play.xbox.com.evil.example/library','https://play.xbox.com/'])assert.equal((await dispatch({type:'GET_PROVIDER_PROFILE',provider:'xbox'},{...sender,url})).ok,false);
   assert.equal((await dispatch({type:'IMPORT_PROVIDER_ITEMS',provider:'xbox',items},sender)).ok,false);
   const scan=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'xbox',beginScan:true,confirmed:true,profileLabel:'Personal',mode:'full',sourceAccountFingerprint:fp},sender);assert.equal(scan.ok,true,scan.error);
   const request={type:'COMMIT_PROVIDER_SCAN',provider:'xbox',items,snapshot:snapshot(items),scanToken:scan.scanToken,sourceAccountFingerprint:fp,mode:'full'};
   assert.equal((await dispatch(request,{...sender,tab:{id:2}})).ok,false);const bad=structuredClone(request);bad.snapshot.scopes[0].id='entire-xbox-account';assert.equal((await dispatch(bad,sender)).ok,false);
   const result=await dispatch(request,sender);assert.equal(result.ok,true,result.error);assert.equal(result.gameCount,1);assert.equal(result.changes.added,1);
 })]
];
