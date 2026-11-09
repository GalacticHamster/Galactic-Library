import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRelease} from '../scripts/release.mjs';
import {assertProviderRuntime} from '../scripts/provider-engine-integrity.mjs';
const pin=JSON.parse(await readFile(new URL('../scripts/provider-engine-pin.json',import.meta.url),'utf8'));
test('production GL release validates its own pinned callable without consulting a companion',async()=>{
  const {files}=await createRelease();assert(assertProviderRuntime(files,pin));
  const name='src/providers/fanatical-scan.js',changed=new Map(files);
  changed.set(name,Buffer.concat([files.get(name),Buffer.from('\n// changed')]));
  assert.throws(()=>assertProviderRuntime(changed,pin),/runtime differs/);
  assert.throws(()=>assertProviderRuntime(files,{...pin,revision:'wrong'}),/revision/);
  const forged=structuredClone(pin);forged.runtime[name]='a'.repeat(64);
  assert.throws(()=>assertProviderRuntime(files,forged),/authoritative/);
});
