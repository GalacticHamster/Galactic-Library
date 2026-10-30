import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {metadataConsentRequired,metadataDataTypes,hasMetadataConsent,requireMetadataConsent,requestMetadataConsent} from '../src/lib/metadata-consent.js';
import {withWorker} from './storage.js';

const firefox = {getManifest: () => ({browser_specific_settings:{gecko:{data_collection_permissions:{required:['none'],optional:['websiteContent','authenticationInfo']}}}})};

test('Chrome metadata behavior needs no Firefox permission API', async () => {
  assert.equal(metadataConsentRequired({getManifest:()=>({})}), false);
  assert.equal(await hasMetadataConsent('Google Books',{runtime:{getManifest:()=>({})}}),true);
});

test('Firefox declares bibliographic content separately from the Google API credential', async () => {
  assert.deepEqual(metadataDataTypes('Open Library'),['websiteContent']);
  assert.deepEqual(metadataDataTypes('Google Books'),['websiteContent','authenticationInfo']);
  assert.throws(()=>metadataDataTypes('Untrusted service'),/Unknown/);
  const overlay=JSON.parse(await readFile(new URL('../manifests/firefox.json',import.meta.url),'utf8'));
  assert.equal(overlay.browser_specific_settings.gecko.strict_min_version,'140.0');
  assert.deepEqual(overlay.browser_specific_settings.gecko.data_collection_permissions,firefox.getManifest().browser_specific_settings.gecko.data_collection_permissions);
});

test('denied, unavailable and failing Firefox permission checks fail closed', async () => {
  for(const permissions of [undefined,{contains:async()=>false},{contains:async()=>{throw Error('Unsupported');}}]) {
    await assert.rejects(requireMetadataConsent('Open Library',{runtime:firefox,permissions}),/permission denied.*Settings/);
  }
});

test('an Open Library grant does not authorize Google credentials; revocation is rechecked', async () => {
  const granted=new Set(['websiteContent']);
  const options={runtime:firefox,permissions:{contains:async({data_collection})=>data_collection.every(x=>granted.has(x))}};
  assert.equal(await hasMetadataConsent('Open Library',options),true);
  assert.equal(await hasMetadataConsent('Google Books',options),false);
  granted.add('authenticationInfo');await requireMetadataConsent('Google Books',options);
  granted.clear();await assert.rejects(requireMetadataConsent('Google Books',options),/permission denied/);
});

test('native permission request is invoked synchronously with only the chosen data categories', async () => {
  const calls=[];
  const permissions={request:value=>{calls.push(value);return Promise.resolve(false);}};
  const request=requestMetadataConsent('Open Library',{runtime:firefox,permissions});
  assert.deepEqual(calls,[{data_collection:['websiteContent']}]);assert.equal(await request,false);
  await requestMetadataConsent('Google Books',{runtime:firefox,permissions});
  assert.deepEqual(calls[1],{data_collection:['websiteContent','authenticationInfo']});
});

test('real worker gates work/edition/Google requests without changing saved records, and blocks again after revocation',()=>withWorker(async({pageA,dispatch,memory})=>{
  await pageA.mergeProviderItems('kindle',[{providerItemId:'B000000001',title:'Saved fixture',mediaType:'book',ownership:'owned'}],{profileLabel:'Synthetic'});
  await pageA.saveGoogleBooksApiKey('SyntheticPrivateApiKey');
  const before=structuredClone(memory.values),fetchBefore=globalThis.fetch;
  const granted=new Set(),requests=[];
  chrome.runtime.getManifest=firefox.getManifest;
  chrome.permissions={contains:async({data_collection})=>data_collection.every(x=>granted.has(x))};
  globalThis.fetch=async url=>{requests.push(String(url));return {ok:true,json:async()=>({docs:[],items:[]})};};
  const sender={id:chrome.runtime.id,url:chrome.runtime.getURL('options.html')};
  const work={type:'SEARCH_OPEN_LIBRARY',query:{title:'Fixture'}};
  try{
    for(const request of [work,{type:'SEARCH_OPEN_LIBRARY_EDITION',isbn:'9780306406157'},{type:'SEARCH_GOOGLE_BOOKS',query:{title:'Fixture'}}]){
      const reply=await dispatch(request,sender);assert.equal(reply.ok,false);assert.match(reply.error,/permission denied/);
    }
    assert.equal(requests.length,0);assert.deepEqual(memory.values,before);
    granted.add('websiteContent');assert.equal((await dispatch(work,sender)).ok,true);assert.equal(requests.length,1);
    assert.equal((await dispatch({type:'SEARCH_GOOGLE_BOOKS',query:{title:'Fixture'}},sender)).ok,false);assert.equal(requests.length,1);
    granted.add('authenticationInfo');assert.equal((await dispatch({type:'SEARCH_GOOGLE_BOOKS',query:{title:'Fixture'}},sender)).ok,true);assert.equal(requests.length,2);
    granted.clear();assert.equal((await dispatch(work,sender)).ok,false);assert.equal(requests.length,2);
    assert.deepEqual(memory.values,before);
  }finally{globalThis.fetch=fetchBefore;}
}));
