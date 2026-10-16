import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {memory} from './final-gl-features.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateDatabase} from '../src/lib/models.js';
import {withWorker} from './storage.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {updateEligibility,PROVIDER_SITES} from '../src/ui/provider-accounts.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {createStorageWriter} from '../src/background/storage-writer.js';

const fingerprint='a'.repeat(64),otherFingerprint='b'.repeat(64);
const item=(id='card-a')=>({provider:'nintendo',providerItemId:id,title:'Synthetic Card '+id,mediaType:'game',ownership:'owned',platform:['Switch'],metadata:{source:'nintendo-virtual-game-cards',cardId:id,applicationId:'app-'+id,isLending:false,hasReleasedApplication:true}});
const snapshot=items=>completeProviderSnapshot('nintendo',items,[completedScope('non-hidden-virtual-cards',items.length,items.length,'reported-count')]);
const begin=(w,name='Personal',fp=fingerprint,switching=false,tab=1)=>w.beginProviderScan('nintendo',name,'full',switching,tab,null,false,fp);
const commit=(w,scan,items,fp=fingerprint,tab=1,s=snapshot(items))=>w.commitProviderScan('nintendo',items,{syncMode:'full',fullSyncAt:'2026-10-15'},s,scan.scanToken,tab,false,fp);
const record=(database,native='card-a')=>Object.values(database.providerItems).find(i=>i.providerItemId===native);

function captureHarness(){
  let actor='private-account',reply;const posts=[],listeners=[];
  class XHR{open(){}send(){}addEventListener(name,fn){this.done=fn;}}
  const ctx=vm.createContext({URL,TextDecoder,TextEncoder,Uint8Array,crypto:webcrypto,
    location:{origin:'https://accounts.nintendo.com',pathname:'/portal/vgcs'},
    document:{getElementById:name=>name==='state'?{getAttribute:()=>JSON.stringify({user:{obfuscatedId:actor}})}:null},
    fetch:()=>{throw Error('No independent network requests allowed');},XMLHttpRequest:XHR,addEventListener:(name,fn)=>listeners.push(fn)});
  ctx.window=ctx;ctx.listeners=listeners;ctx.postMessage=value=>{posts.push(value);reply?.(value);};
  for(const path of ['src/providers/provider-snapshot.js','src/providers/console-library.js','src/providers/nintendo-capture.js'])vm.runInContext(readFileSync(new URL('../'+path,import.meta.url),'utf8'),ctx);
  const rows=(n=1)=>Array.from({length:n},(_,i)=>({id:'card-'+i,applicationId:'app-'+i,applicationName:'Synthetic Game '+i,apparentPlatform:'NX',ownerNaId:actor,userNaId:actor,hasReleasedApplication:true}));
  function start(list=rows(),offset=0,total=list.length,changes={}){
    const xhr=new XHR();xhr.open('POST','https://wb.lp1.savanna.srv.nintendo.net/graphql');
    xhr.send(JSON.stringify({operationName:'getVgcsVgcs',query:'query getVgcsVgcs { account { vgc { vgcViewsV2(isHidden: false) { views { id } } } } }',variables:{offset,limit:300,shopId:3,order:'ASC',sortBy:'ACTIVATED_DATE',idToken:'private-token',...changes}}));
    return (status=200,body={data:{account:{vgc:{vgcViewsV2:{views:list,offsetInfo:{offset,total}}}}}})=>{xhr.status=status;xhr.responseType='json';xhr.response=body;xhr.done?.();};
  }
  function ask(action='prepare'){
    return new Promise(resolve=>{reply=resolve;ctx.action=action;vm.runInContext("for(const fn of listeners)fn({source:window,origin:location.origin,data:{channel:'gl-nintendo-request',nonce:'a'.repeat(32),action}});",ctx);});
  }
  return {rows,start,ask,setActor:value=>{actor=value;},posts,ctx};
}
export const nintendoImportTests=[
 ['Nintendo additive atomic imports preserve 137 records, stable IDs, omitted cards and backup bindings',async()=>{
   const {writer}=memory(),items=Array.from({length:137},(_,i)=>item('card-'+i));
   let d=await commit(writer,await begin(writer),items),refs=Object.values(d.providerItems).map(i=>i.recordRef).sort(),profile=d.providerProfiles[d.providers.nintendo.activeProfileId];
   assert.equal(profile.sourceAccountFingerprint,fingerprint);assert.equal(d.providers.nintendo.recordCount,137);assert.equal(record(d,'card-0').metadata.isLending,false);
   d=await commit(writer,await begin(writer),items);assert.deepEqual(Object.values(d.providerItems).map(i=>i.recordRef).sort(),refs);
   d=await commit(writer,await begin(writer),items.slice(0,115));assert.equal(Object.keys(d.providerItems).length,137);assert.equal(Object.keys(d.providerHistory).length,0);assert.equal(d.providers.nintendo.snapshotValidation.itemCount,115);
   d=await commit(writer,await begin(writer),[]);assert.equal(d.providers.nintendo.recordCount,137);assert.equal(d.providers.nintendo.snapshotValidation.itemCount,0);
   const restored=parseBackup(createBackup(d));assert.deepEqual(restored,d);await writer.restoreDatabase(restored);assert.equal((await writer.getDatabase()).providerProfiles[profile.profileId].sourceAccountFingerprint,fingerprint);
 }],
 ['Nintendo guards reject missing bindings, wrong profiles/tabs, stale leases, incomplete pages and unscoped imports',async()=>{
   const {writer}=memory();await assert.rejects(writer.beginProviderScan('nintendo','A','full',false,1),/verified account/);
   await assert.rejects(writer.importUnscopedProviderItems('nintendo',[item()],{syncMode:'full'},snapshot([item()])),/account-bound/);
   let scan=await begin(writer),d=await commit(writer,scan,[item()]),before=structuredClone(d.providerItems);
   await assert.rejects(begin(writer,'Personal',otherFingerprint),/different Nintendo account/);
   await assert.rejects(begin(writer,'Another nickname',fingerprint,true),/already saved/);
   scan=await begin(writer);await assert.rejects(commit(writer,scan,[item('bad')],otherFingerprint),/account changed/);await assert.rejects(commit(writer,scan,[item('bad')],fingerprint,2),/superseded/);
   const bad=snapshot([item()]);bad.complete=false;await assert.rejects(commit(writer,scan,[item()],fingerprint,1,bad),/incomplete/);
   const newer=await begin(writer);await assert.rejects(commit(writer,scan,[item('bad')]),/superseded/);
   assert.deepEqual((await writer.getDatabase()).providerItems,before);await commit(writer,newer,[item()]);
 }],
 ['Nintendo account switching preserves independent observations, namespace, backup and binding validation',async()=>{
   const {writer}=memory();let d=await commit(writer,await begin(writer,'A'),[item()]),a=record(d),aid=a.profileId;
   await assert.rejects(begin(writer,'B',otherFingerprint),/confirm switching/);
   d=await commit(writer,await begin(writer,'B',otherFingerprint,true),[item()],otherFingerprint);const b=Object.values(d.providerItems).find(i=>i.profileId!==aid);
   assert.notEqual(a.id,b.id);assert.notEqual(a.recordRef,b.recordRef);assert.equal(d.providerProfiles[aid].sourceAccountFingerprint,fingerprint);assert.equal(Object.keys(d.providerItems).length,2);
   d=await writer.selectProviderProfile(aid,b.profileId,true);assert.equal(d.providers.nintendo.activeProfileId,aid);assert.deepEqual(parseBackup(createBackup(d)),d);
   const invalid=structuredClone(d);invalid.providerProfiles[aid].sourceAccountFingerprint='private-account-id';assert.throws(()=>validateDatabase(invalid),/account binding/);
   const duplicate=structuredClone(d);duplicate.providerProfiles[b.profileId].sourceAccountFingerprint=fingerprint;assert.throws(()=>validateDatabase(duplicate),/Duplicate Nintendo account binding/);
 }],
 ['Nintendo unknown product scope stays unknown and user access corrections survive reimports and backup restore',async()=>{
   const {writer}=memory();const items=[item(),{...item('unreleased'),ownership:'unknown',metadata:{...item('unreleased').metadata,hasReleasedApplication:false}}];
   let d=await commit(writer,await begin(writer),items);assert.equal(record(d,'unreleased').ownership,'unknown');assert.equal(record(d).ownership,'owned');
   d=await writer.saveOwnershipCorrections([ownershipCorrectionTarget(record(d),d)],{ownership:'returned',note:'Synthetic correction'});
   d=await commit(writer,await begin(writer),items);assert.equal(record(d).ownership,'owned');assert.equal(effectiveOwnershipRecord(record(d),d).ownership,'returned');
   d=parseBackup(createBackup(d));await writer.restoreDatabase(d);assert.equal(effectiveOwnershipRecord(record(d),d).ownership,'returned');
 }],
 ['Nintendo website capture reconciles 115 cards, 112 owned and 3 unconfirmed without exposing credentials/account/device IDs',async()=>{
   const h=captureHarness(),rows=h.rows(115).map((r,i)=>({...r,hasReleasedApplication:i<112,hasReleasedAddOnContents:i<13,insertedNsDeviceId:'private-device'}));h.start(rows)();
   const r=await h.ask();assert(r.ok,r.error);assert.equal(r.items.length,115);assert.equal(r.counts.products,115);assert.equal(r.counts.owned,112);assert.equal(r.counts.unknown,3);assert.equal(r.sourceAccountFingerprint.length,64);assert.equal(r.snapshot.scopes[0].expectedCount,115);
   const verified=await h.ask('verify');assert.equal(verified.captureVersion,r.captureVersion);assert.equal(verified.sourceAccountFingerprint,r.sourceAccountFingerprint);assert.equal(verified.items,undefined);
   for(const secret of ['private-account','private-token','private-device','ownerNaId','userNaId','idToken'])assert(!JSON.stringify(h.posts).includes(secret));
 }],
 ['Nintendo website capture rejects missing pages, account switches, request failures, filtered scopes and repeated cards',async()=>{
   const h=captureHarness();assert.equal((await h.ask()).ok,false);h.start(h.rows(),0,2)();assert.equal((await h.ask()).ok,false);
   h.start(h.rows(2))();assert.equal((await h.ask()).ok,true);h.setActor('private-other');assert.equal((await h.ask()).ok,false);
   const expired=captureHarness();expired.start()(401);assert.equal((await expired.ask()).ok,false);
   const duplicate=captureHarness();duplicate.start([duplicate.rows()[0],duplicate.rows()[0]])();assert.equal((await duplicate.ask()).ok,false);
   const filtered=captureHarness();filtered.start()();assert.equal((await filtered.ask()).ok,true);filtered.start(filtered.rows(),0,1,{vgcViewType:'LENDING'})();assert.equal((await filtered.ask()).ok,false);
 }],
 ['Nintendo capture keeps scan generations separate, blocks in-flight work, verifies versions and accepts explicit zero cards',async()=>{
   const h=captureHarness(),old=h.start(h.rows(),0,2),next=h.start(h.rows(2));assert.equal((await h.ask()).ok,false);next();old();
   const r=await h.ask();assert.equal(r.ok,true);assert.equal(r.items.length,2);
   h.start(h.rows())();const changed=await h.ask('verify');assert.notEqual(changed.captureVersion,r.captureVersion);
   h.start([],0,0)();const empty=await h.ask();assert.equal(empty.ok,true);assert.equal(empty.items.length,0);assert.equal(empty.snapshot.itemCount,0);
 }],
 ['Nintendo is discoverable with a correctly scoped website and complete-list updates only',()=>{
   const site=PROVIDER_SITES.find(p=>p.provider==='nintendo');assert(site.name.includes('Switch Virtual Game Cards'));assert.equal(site.url,'https://accounts.nintendo.com/portal/vgcs');
   const eligibility=updateEligibility({provider:'nintendo',active:true,nickname:'Personal'},{fullSyncAt:'2026-10-15'});assert.equal(eligibility.full,true);assert.equal(eligibility.quick,false);
 }],
 ['Nintendo failed persistence leaves source records and the profile binding unchanged atomically',async()=>{
   const values={};let fail=false;const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async patch=>{if(fail)throw Error('Synthetic write failure');Object.assign(values,structuredClone(patch));},remove:async keys=>{for(const k of keys)delete values[k];}});
   await commit(writer,await begin(writer),[item()]);const scan=await begin(writer),before=structuredClone(values);fail=true;
   await assert.rejects(commit(writer,scan,[item('other')]),/write failure/);assert.deepEqual(values,before);
 }],
 ['Nintendo actual worker rejects unrelated pages/unscoped messages and commits only with account-bound authority',()=>withWorker(async({dispatch,pageA})=>{
   const sender={id:chrome.runtime.id,url:'https://accounts.nintendo.com/portal/vgcs',tab:{id:1}},items=[item()];
   for(const url of ['https://accounts.nintendo.com/portal/vgcs-other','https://evil.example/portal/vgcs'])assert.equal((await dispatch({type:'GET_PROVIDER_PROFILE',provider:'nintendo'},{...sender,url})).ok,false);
   assert.equal((await dispatch({type:'IMPORT_PROVIDER_ITEMS',provider:'nintendo',items,snapshot:snapshot(items)},sender)).ok,false);
   const scan=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'nintendo',beginScan:true,confirmed:true,profileLabel:'Personal',mode:'full',sourceAccountFingerprint:fingerprint},sender);assert(scan.ok,scan.error);
   const result=await dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'nintendo',items,snapshot:snapshot(items),scanToken:scan.scanToken,sourceAccountFingerprint:fingerprint,mode:'full'},sender);assert(result.ok,result.error);assert.equal(result.gameCount,1);
   const d=await pageA.getDatabase();assert.equal(record(d).metadata.cardId,'card-a');assert.equal(d.providerProfiles[d.providers.nintendo.activeProfileId].sourceAccountFingerprint,fingerprint);
 })]
];
