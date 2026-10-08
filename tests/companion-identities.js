import assert from 'node:assert/strict';
import {COMPANION_IDENTITIES,builtinCompanions,effectiveExternalClientIds,allowedCompanionOperation,checkCompanionConnection} from '../src/lib/companion-identities.js';
import {withWorker} from './storage.js';
import {createEmptyDatabase} from '../src/lib/models.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {createRelease} from '../scripts/release.mjs';
const chromeRuntime={getURL:()=> 'chrome-extension://synthetic/'},firefoxRuntime={getURL:()=> 'moz-extension://synthetic/'};
const hb=COMPANION_IDENTITIES.hb.chrome,fan=COMPANION_IDENTITIES.fan.chrome,custom='c'.repeat(32);
export const companionIdentityTests=[
 ['built-in companions are browser-specific, coexist with manual IDs and never mutate them',()=>{
  const saved=[custom,hb,COMPANION_IDENTITIES.hb.firefox],before=JSON.stringify(saved);
  assert.deepEqual(effectiveExternalClientIds(saved,chromeRuntime),[hb,fan,custom,COMPANION_IDENTITIES.hb.firefox]);assert.equal(JSON.stringify(saved),before);
  assert.deepEqual(effectiveExternalClientIds([],chromeRuntime),[hb,fan]);
  assert.deepEqual(builtinCompanions(firefoxRuntime).map(row=>row.id),[COMPANION_IDENTITIES.hb.firefox,COMPANION_IDENTITIES.fan.firefox]);
 }],
 ['real external handler trusts official HB/FAN without storing defaults and rejects unknown identities/operations',()=>withWorker(async({dispatchExternal,pageA,memory})=>{
  const saved=[custom,hb];await pageA.saveAllowedExternalClientIds(saved);const stored=JSON.stringify(memory.values.galacticLibraryAllowedExternalClientIds);
  for(const id of [hb,fan,custom]){
   assert.equal((await dispatchExternal({type:'PING'},{id})).ok,true);
   assert.equal((await dispatchExternal({type:'GET_STATUS'},{id})).apiVersion,1);
   assert.equal((await dispatchExternal({type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Synthetic',mediaType:'book'}]},{id})).ok,true);
   assert.equal((await dispatchExternal({type:'RESTORE_DATABASE',apiVersion:1},{id})).ok,false);
   assert.equal((await dispatchExternal({type:'MATCH_ITEMS',apiVersion:2,items:[{title:'Synthetic'}]},{id})).ok,false);
  }
  assert.equal(JSON.stringify(memory.values.galacticLibraryAllowedExternalClientIds),stored);
  assert.equal((await dispatchExternal({type:'PING'},{id:'d'.repeat(32)})).ok,false);
  assert.equal((await dispatchExternal({type:'PING'},{id:COMPANION_IDENTITIES.hb.firefox})).ok,false);
  await pageA.saveAllowedExternalClientIds([]);assert.deepEqual(await pageA.getAllowedExternalClientIds(),[]);
  assert.equal((await dispatchExternal({type:'PING'},{id:custom})).ok,false);
  for(const id of [hb,fan])assert.equal((await dispatchExternal({type:'PING'},{id})).ok,true);
 })],
 ['official FAN cannot publish Humble feeds; official HB still needs account/profile confirmation',()=>withWorker(async({dispatchExternal,pageA})=>{
  await pageA.mergeProviderItems('humble',[],{profileLabel:'synthetic'});
  const request={type:'BEGIN_ENTITLEMENT_FEED',apiVersion:1,profileLabel:'synthetic',count:0,coverage:'complete',sentAt:'2026-10-08'};
  assert.equal((await dispatchExternal(request,{id:fan})).ok,false);
  assert.equal((await dispatchExternal({...request,profileLabel:'wrong'},{id:hb})).ok,false);
  const result=await dispatchExternal(request,{id:hb});assert.equal(result.ok,true);assert.equal(typeof result.uploadToken,'string');
  for(const type of ['APPEND_ENTITLEMENT_FEED','COMMIT_ENTITLEMENT_FEED','REMOVE_ENTITLEMENT_FEED'])assert.equal(allowedCompanionOperation(fan,type,chromeRuntime),false);
 })],
 ['version-1 legacy handshake stays valid; incompatible versions and missing/disabled targets are truthful',async()=>{
  const db=createEmptyDatabase();for(const type of ['PING','GET_STATUS']){assert.equal(handleExternalApiRequest(db,{type}).ok,true);assert.equal(handleExternalApiRequest(db,{type,apiVersion:1}).ok,true);assert.equal(handleExternalApiRequest(db,{type,apiVersion:2}).ok,false);}
  assert.match(await checkCompanionConnection({sendMessage:async()=>{throw Error('No receiving end');}},hb),/not verified/);
  assert.match(await checkCompanionConnection({sendMessage:async()=>({ok:true,apiVersion:2})},hb),/Incompatible/);
  assert.match(await checkCompanionConnection({sendMessage:async()=>({ok:true,apiVersion:1})},hb),/Connected/);
  assert.match(await checkCompanionConnection({sendMessage:()=>new Promise(()=>{})},hb,5),/not verified/);
 }],
 ['generated Chrome/Firefox runtime preserves official identity configuration without transport wildcard or added hosts',async()=>{
  for(const target of ['chrome','firefox']){
   const release=await createRelease(undefined,undefined,target),manifest=JSON.parse(release.files.get('manifest.json')),code=release.files.get('src/lib/companion-identities.js').toString();
   for(const item of Object.values(COMPANION_IDENTITIES))for(const browser of ['chrome','firefox'])assert(code.includes(item[browser]));
   assert.equal(manifest.externally_connectable,undefined);assert.equal(manifest.key,undefined);
   assert.deepEqual(manifest.host_permissions,JSON.parse((await createRelease()).files.get('manifest.json')).host_permissions);
   if(target==='firefox')assert.equal(manifest.browser_specific_settings.gecko.id,COMPANION_IDENTITIES.gl.firefox);
  }
 }]
];
