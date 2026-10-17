import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,sep} from 'node:path';
import {createRelease,runtimeZip} from './release.mjs';
import {chromePipe,freePort,firefoxMarionette} from '../tests/native-protocol.mjs';
import {instrumentObservationWorker} from '../tests/observation-native-fixture.mjs';

export async function openObservationBrowser({root=resolve('.'),firefox=false,faults=false,transformFiles=null}={}){
 const temporary=await mkdtemp(join(tmpdir(),'gl-observation-fault-')),pause=ms=>new Promise(done=>setTimeout(done,ms));
 let child,exited,driver,evaluate,restart;
 const init=`const S=await import('./src/lib/storage.js'),P=await import('./src/background/private-storage.js');const faultClient=S.createStorageClient(m=>chrome.runtime.sendMessage(m));const faultArea=${firefox} ? P.createPrivateStorage(indexedDB):chrome.storage.local;`;
 const close=async()=>{ driver?.close?.();if(child&&child.exitCode===null){child.kill();await Promise.race([exited,pause(3000)]);}
 const target=resolve(temporary),base=resolve(tmpdir());if(!target.startsWith(base+sep)||!target.slice(base.length+1).startsWith('gl-observation-fault-'))throw Error('Unsafe test cleanup');await rm(target,{recursive:true,force:true,maxRetries:20,retryDelay:100});
 };
 try{
 const release=await createRelease(root,undefined,firefox?'firefox':'chrome'),files=new Map(release.files),path='src/background/service-worker.js';if(faults){files.set(path,Buffer.from(instrumentObservationWorker(files.get(path).toString())));if(!firefox){const manifest=JSON.parse(files.get('manifest.json'));manifest.permissions=manifest.permissions.filter(p=>p!=='unlimitedStorage');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));}}
 if(transformFiles)transformFiles(files);
 const profile=join(temporary,'profile');await mkdir(profile);let installed;
 if(firefox){
  let binary=process.env.FIREFOX_BIN??'C:/Program Files/Mozilla Firefox/firefox.exe';try{await access(binary);}catch{const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();binary=join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe');}
  const port=await freePort();await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("browser.shell.checkDefaultBrowser",false);\n`);
  child=spawn(binary,['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));driver=await firefoxMarionette(port);await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
  const archive=join(temporary,'fixture.zip');await writeFile(archive,runtimeZip(files));const response=await driver.send('Addon:Install',{path:archive,temporary:true});installed=response.value??response;
  const navigate=async()=>{await driver.send('Marionette:SetContext',{value:'chrome'});const r=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL("manifest.json");',args:[installed],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url:r.value??r});};
  evaluate=async script=>{const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+init+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:e.message+"\\n"+e.stack}));',args:[],newSandbox:false}),v=r.value??r;assert.equal(v?.error,undefined,v?.error);return v;};
  restart=async()=>{await driver.send('WebDriver:Navigate',{url:'about:blank'});await driver.send('Marionette:SetContext',{value:'chrome'});let r;try{r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];(async()=>{const {AddonManager}=ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");const addon=await AddonManager.getAddonByID(arguments[0]);await addon.reload();return true;})().then(done,e=>done({error:e.message}));',args:[installed],newSandbox:true});}catch(error){if(!/Document was unloaded/u.test(error.message))throw error;}if(r)assert.equal((r.value??r)?.error,undefined);await pause(150);await navigate();};await navigate();
 }else{
  const stage=join(temporary,'extension');for(const [name,data]of files){const file=join(stage,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,data);}
  child=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--user-data-dir='+profile,'--remote-debugging-pipe','--enable-unsafe-extension-debugging','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));driver=chromePipe(child,{timeoutMs:60000});installed=(await driver.send('Extensions.loadUnpacked',{path:stage})).id;
  const target=await driver.send('Target.createTarget',{url:'chrome-extension://'+installed+'/manifest.json'}),{sessionId}=await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  evaluate=async script=>{const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+init+script+'})()',awaitPromise:true,returnByValue:true},sessionId);assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  restart=async()=>{const before=new Set((await driver.send('Target.getTargets')).targetInfos.filter(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://'+installed+'/')).map(t=>t.targetId));await driver.send('ServiceWorker.enable',{},sessionId);await driver.send('ServiceWorker.stopAllWorkers',{},sessionId);for(let n=0;n<100;n++){const t=await driver.send('Target.getTargets');if(!t.targetInfos.some(t=>before.has(t.targetId)))return;await pause(20);}throw Error('Previous worker did not terminate');};
 }
 return {evaluate,restart,close};
 }catch(error){await close();throw error;}
}
