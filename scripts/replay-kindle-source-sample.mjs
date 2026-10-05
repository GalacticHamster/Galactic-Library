// Offline DOM replay of the frozen sanitized source fragments, never Amazon.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {hash} from './contents-parser-corpus.mjs';
import {selectManifest,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
const live=JSON.parse(await readFile(new URL('../docs/kindle-source-capture-live.json',import.meta.url),'utf8'));
const adapter=await readFile(new URL('../src/providers/kindle.js',import.meta.url),'utf8');
const profile=await mkdtemp(join(tmpdir(),'gl-source-replay-'));
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe','pipe','pipe']});
let id=0,input=Buffer.alloc(0);const pending=new Map();
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Protocol timeout '+method)),30000),key=++id;pending.set(key,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
child.stdio[4].on('data',chunk=>{input=Buffer.concat([input,chunk]);let end;while((end=input.indexOf(0))>=0){const m=JSON.parse(input.subarray(0,end));input=input.subarray(end+1);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
try{
 const target=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 await send('Network.enable',{},sessionId);await send('Network.setBlockedURLs',{urls:['http://*','https://*']},sessionId);
 await send('Runtime.evaluate',{expression:adapter},sessionId);
 const fragments=live.rows.map(r=>({auditId:r.auditId,regions:r.attemptDiagnostics.at(-1).diagnostic.regions}));
 const response=await send('Runtime.evaluate',{returnByValue:true,expression:`(${function(rows){
  return rows.map(row=>{
   const doc=new DOMParser().parseFromString('<!doctype html><body>','text/html');
   for(const region of row.regions){const wrapper=doc.createElement('section');if(region.selector.startsWith('#'))wrapper.id=region.selector.slice(1);else wrapper.setAttribute('data-feature-name','bookDescription');wrapper.innerHTML=region.sanitizedHtml;doc.body.append(wrapper);}
   const old=[];let total=0;
   for(const selector of ['#bookDescription_feature_div','#productDescription','#featurebullets_feature_div','#productOverview_feature_div','[data-feature-name="bookDescription"]'])for(const e of doc.querySelectorAll(selector)){const text=e.textContent.slice(0,24000).replace(/\s+/gu,' ').trim().slice(0,Math.min(12000,24000-total));if(text&&!old.some(b=>b.text===text)){old.push({selector,text});total+=text.length;}}
   return {auditId:row.auditId,generation4Blocks:old,generation5Blocks:GalacticKindle.kindleDescriptionBlocks(doc)};
  });
 }.toString()})(${JSON.stringify(fragments)})`},sessionId);
 if(response.exceptionDetails)throw Error(response.exceptionDetails.text);
 const rows=response.result.value.map(row=>{
  const original=live.rows.find(r=>r.auditId===row.auditId);
  if(JSON.stringify(row.generation4Blocks)!==JSON.stringify(original.acquired.descriptionBlocks))throw Error('Sanitization changed generation-4 evidence '+row.auditId);
  const selected=selectManifest(row.generation5Blocks,original.title);
  return {...row,title:original.title,selection:selected,parser:manifestReviewProposal(selected,original.title),blocksChanged:JSON.stringify(row.generation4Blocks)!==JSON.stringify(row.generation5Blocks)};
 });
 await writeFile(new URL('../docs/kindle-source-capture-replay.json',import.meta.url),JSON.stringify({liveHash:hash(await readFile(new URL('../docs/kindle-source-capture-live.json',import.meta.url))),adapterHash:hash(adapter),extractorVersion:5,parserVersion:4,networkRequests:0,sanitizedGeneration4ReplayExact:25,rows},null,2)+'\n');
 console.log(JSON.stringify(rows.map(r=>({id:r.auditId,outcome:r.parser.outcome,entries:r.parser.entries.length,statement:r.selection.statement,blocksChanged:r.blocksChanged})),null,2));
}finally{
 try{await send('Browser.close');}catch{}child.kill();for(const p of pending.values())clearTimeout(p.timer);
 const path=resolve(profile);if(!path.startsWith(resolve(tmpdir())+sep)||!path.includes('gl-source-replay-'))throw Error('Unsafe cleanup');await rm(path,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
