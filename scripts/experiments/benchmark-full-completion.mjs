// Isolated architecture benchmark. Installs only the unmodified runtime in a
// newly generated browser profile. Prototype source is evaluated by the driver,
// never included in the extension archive. No provider requests/private inputs.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,sep} from 'node:path';
import {createRelease,readRuntimeZip,projectRoot} from '../release.mjs';
import {outputPath} from '../audit-artifacts.mjs';
import {chromePipe,firefoxMarionette,freePort} from '../../tests/native-protocol.mjs';
import {completionExperiment} from './full-completion-prototype.mjs';

const firefox=process.argv.includes('--firefox'),node=process.argv.includes('--node');
const sizes=(process.argv.find(s=>s.startsWith('--sizes='))?.slice(8)??'1000,5000,10000,14000,20000').split(',').map(Number);
if(sizes.some(n=>!Number.isInteger(n)||n<100||n>20000))throw Error('Sizes must be 100..20000.');
const output=await outputPath(process.argv.find(s=>s.startsWith('--output='))?.slice(9)??`audit-artifacts/provider-performance/completion-${node?'node':firefox?'firefox':'chrome'}.json`);
const temporary=await mkdtemp(join(tmpdir(),'gl-completion-experiment-'));let child,driver,exited,evaluate;
const imports={models:'lib/models.js',profiles:'lib/provider-profiles.js',metadata:'lib/metadata-validation.js',snapshot:'lib/provider-snapshot.js',writer:'background/storage-writer.js',equality:'lib/data-equality.js',digest:'lib/provider-scan-checks.js',storage:'lib/storage.js',matcher:'lib/matcher.js'};
const rows=[];
try{
 if(node){
  const D=Object.fromEntries(await Promise.all(Object.entries(imports).map(async([k,p])=>[k,await import('../../src/'+p)])));
  const values={};const native={async get(defaults){return structuredClone(Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,values[k]??v])));},async set(v){Object.assign(values,structuredClone(v));},async remove(keys){for(const k of keys)delete values[k];}};
  evaluate=size=>completionExperiment(D,native,size);
 }else if(firefox){
  const candidates=[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe'];
  if(process.platform==='win32'){const path=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(path)candidates.push(join(path,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const p of candidates.filter(Boolean))try{await access(p);binary=p;break;}catch{}if(!binary)throw Error('Set FIREFOX_BIN.');
  const profile=join(temporary,'profile');await mkdir(profile);const port=await freePort();await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\n`);
  child=spawn(binary,['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));driver=await firefoxMarionette(port);await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});await driver.send('WebDriver:SetTimeouts',{script:180000});
  const release=await createRelease(projectRoot,undefined,'firefox'),archive=join(temporary,'GL.zip');await writeFile(archive,release.zip);const installed=await driver.send('Addon:Install',{path:archive,temporary:true}),id=installed.value??installed;
  await driver.send('Marionette:SetContext',{value:'chrome'});const url=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL("manifest.json");',args:[id],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url:url.value??url});
  evaluate=async size=>{await driver.send('WebDriver:ExecuteScript',{script:`window.__completionResult=null;(async()=>{${script(size,true)}})().then(v=>window.__completionResult=v,e=>window.__completionResult={error:e.message,stack:e.stack});return true;`,args:[],newSandbox:false});for(let n=0;n<1800;n++){await new Promise(done=>setTimeout(done,100));const result=await driver.send('WebDriver:ExecuteScript',{script:'return window.__completionResult;',args:[],newSandbox:false}),value=Object.hasOwn(result,'value')?result.value:result;if(value){assert.equal(value.error,undefined,JSON.stringify(value));return value;}}throw Error('Firefox experiment timed out');};
 }else{
  const stage=join(temporary,'extension'),release=await createRelease();for(const [name,data]of readRuntimeZip(release.zip)){const p=join(stage,name);await mkdir(dirname(p),{recursive:true});await writeFile(p,data);}
  child=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--user-data-dir='+join(temporary,'profile'),'--remote-debugging-pipe','--enable-unsafe-extension-debugging','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));driver=chromePipe(child,{timeoutMs:180000});const installed=await driver.send('Extensions.loadUnpacked',{path:stage}),target=await driver.send('Target.createTarget',{url:'chrome-extension://'+installed.id+'/manifest.json'}),{sessionId}=await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  await driver.send('Target.activateTarget',{targetId:target.targetId});
  for(let n=0;n<100;n++){const ready=await driver.send('Runtime.evaluate',{expression:'location.protocol==="chrome-extension:"&&document.readyState==="complete"',returnByValue:true},sessionId);if(ready.result.value)break;if(n===99)throw Error('Experiment page did not load');await new Promise(done=>setTimeout(done,20));}
  evaluate=async size=>{const result=await driver.send('Runtime.evaluate',{expression:`(async()=>{${script(size,false)}})()`,awaitPromise:true,returnByValue:true},sessionId);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
 }
 for(const size of sizes){const row=await evaluate(size);rows.push(row);await writeFile(output,JSON.stringify({format:1,baseline:'6a9e9b8',environment:node?'Node structured-clone mock':firefox?'Unmodified packaged Firefox, private IndexedDB, disposable profile':'Unmodified packaged Chrome, storage.local, disposable profile',rows},null,2)+'\n');console.log(JSON.stringify({size,bytes:row.baseBytes,controls:row.controls.length,results:row.rows.map(r=>({candidate:r.candidate,mode:r.mode,totalMs:r.totalMs}))}));}
 console.log('Wrote',output);
}finally{
 driver?.close?.();if(child&&child.exitCode===null){child.kill();await Promise.race([exited,new Promise(done=>setTimeout(done,2000))]);}
 const target=resolve(temporary),root=resolve(tmpdir());if(target.startsWith(root+sep)&&target.slice(root.length+1).startsWith('gl-completion-experiment-'))await rm(target,{recursive:true,force:true,maxRetries:15,retryDelay:100});
}
function script(size,firefox){return `const D=Object.fromEntries(await Promise.all(Object.entries(${JSON.stringify(imports)}).map(async([k,p])=>[k,await import('./src/'+p)])));D.reconstitute=${firefox};const native=${firefox?"(await import('./src/background/private-storage.js')).createPrivateStorage(indexedDB)":'chrome.storage.local'};return await (${completionExperiment.toString()})(D,native,${size});`;}
