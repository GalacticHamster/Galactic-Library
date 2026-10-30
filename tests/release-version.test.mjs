import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRelease} from '../scripts/release.mjs';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {createEmptyDatabase} from '../src/lib/models.js';

test('release manifests, package metadata and runtime handshake agree without changing API/schema versions',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../manifest.json',import.meta.url),'utf8'));
  const metadata=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(manifest.version,'1.0.0');assert.equal(metadata.version,manifest.version);
  const ping=handleExternalApiRequest(createEmptyDatabase(),{type:'PING'});
  assert.equal(ping.appVersion,manifest.version);assert.equal(ping.apiVersion,1);
  for(const browser of ['chrome','firefox']){
    const {files}=await createRelease(undefined,undefined,browser);
    const packaged=JSON.parse(files.get('manifest.json'));
    assert.equal(packaged.version,metadata.version);
    if(browser==='chrome')assert.equal(packaged.browser_specific_settings,undefined);
    else assert.deepEqual(packaged.browser_specific_settings.gecko.data_collection_permissions.optional,['websiteContent']);
  }
});
