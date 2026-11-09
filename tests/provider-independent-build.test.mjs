import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRelease as glRelease} from '../scripts/release.mjs';
import {createRelease as fanRelease} from '../../Fanatical/scripts/release.mjs';

for(const [consumer,builder,source]of [['GL',glRelease,new URL('../',import.meta.url)],['FAN',fanRelease,new URL('../../Fanatical/',import.meta.url)]])
test(consumer+' actual production builds independently offline with its own pin and no sibling checkout',async()=>{
  const root=await mkdtemp(join(tmpdir(),'provider-independent-'));
  try{
    const chrome=await builder();
    for(const [path,bytes]of chrome.files){const target=join(root,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
    for(const path of ['scripts/release.mjs','scripts/provider-engine-integrity.mjs','scripts/provider-engine-pin.json','scripts/runtime-files.json','manifests/firefox.json']){
      const target=join(root,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile(new URL(path,source)));
    }
    await writeFile(join(root,'package.json'),'{"type":"module"}');
    const script="import {createRelease} from './scripts/release.mjs'; const results=[];for(const target of ['chrome','firefox']){const a=await createRelease(undefined,undefined,target),b=await createRelease(undefined,undefined,target);if(!a.zip.equals(b.zip))throw Error('Non-reproducible build');results.push({target,sha256:a.report.sha256});}console.log(JSON.stringify(results));";
    const results=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:root,encoding:'utf8',windowsHide:true}));
    for(const {target,sha256}of results)assert.equal(sha256,(await builder(undefined,undefined,target)).report.sha256);
  }finally{
    const path=resolve(root);assert(path.startsWith(resolve(tmpdir())+sep)&&path.includes('provider-independent-'));
    await rm(path,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
