// Installed production content scripts/workers; synthetic pages and disposable profiles only.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm,access} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {runtimeZip} from '../scripts/release.mjs';
import {candidateFiles} from './provider-candidate-build.mjs';
import {chromePipe,firefoxMarionette,freePort} from './native-protocol.mjs';
const firefox=process.argv.includes('--firefox'),target=firefox?'firefox':'chrome';
const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><html><body><main>Synthetic purchase history</main></body></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const temporary=await mkdtemp(join(tmpdir(),'gl-importer-ownership-'));let child,driver,session,exited;
const installed=new Map(),archives=new Map();
try{
 const profile=join(temporary,'profile');await mkdir(profile);let binary=firefox?'C:/Program Files/Mozilla Firefox/firefox.exe':'C:/Program Files/Google/Chrome/Application/chrome.exe';
 if(firefox)try{await access(binary);}catch{binary=join(execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{encoding:'utf8',windowsHide:true}).trim(),'VFS/ProgramFiles/Firefox Package Root/firefox.exe');}
 const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\n`);
 child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-pipe','--enable-unsafe-extension-debugging','--user-data-dir='+profile,'about:blank'],{windowsHide:true,env:{...process.env,MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'},stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});child.stdout.resume();child.stderr.resume();exited=new Promise(done=>child.once('exit',done));driver=firefox?await firefoxMarionette(port):chromePipe(child);
 if(firefox)await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
 async function navigate(url){if(firefox)await driver.send('WebDriver:Navigate',{url});else{const t=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;}}
 async function evaluate(code){if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+code+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:e.message}));',args:[],newSandbox:false});const v=r.value??r;assert(!v?.error,v?.error);return v;}const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+code+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;}
 async function wait(code,message){for(let n=0;n<150;n++){try{if(await evaluate(code))return;}catch{}await pause(100);}throw Error(message+' '+JSON.stringify(await evaluate('return {url:location.href,body:document.body.innerText,html:document.documentElement.outerHTML.slice(-15000)};')));}
 async function extensionUrl(key,page){const id=installed.get(key);if(!firefox)return 'chrome-extension://'+id+'/'+page;await driver.send('Marionette:SetContext',{value:'chrome'});const r=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL(arguments[1]);',args:[id,page],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});return r.value??r;}
 async function build(key){
  const root=resolve(key==='GL'?'.':key==='HB'?'../HB':'../Fanatical');let files;
  if(key==='HB'){
   const out=join(temporary,'hb-package');execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts/package-release.ps1'),'-Target',firefox?'Firefox':'Chrome','-OutputDirectory',out],{stdio:'pipe',windowsHide:true});
   // HB's established PowerShell archive is deflated.
   const zip=await readFile(join(out,'Humble-Comic-Library-'+JSON.parse(await readFile(join(root,'manifest.json'),'utf8')).version+(firefox?'-firefox':'')+'.zip'));
   files=readArchive(zip);
  }else files=new Map((await (await import(pathToFileURL(join(root,'scripts/release.mjs')))).createRelease(root,undefined,target)).files);
  if(process.argv.includes('--candidate')&&key!=='HB')files=await candidateFiles(key,files);
  const manifest=JSON.parse(files.get('manifest.json'));
  manifest.content_scripts=manifest.content_scripts.filter(s=>s.matches.some(p=>p.includes('humblebundle')||p.includes('fanatical'))).map(s=>({...s,matches:s.matches.filter(p=>p.includes('humblebundle')||p.includes('fanatical')).map(p=>p.includes('humblebundle')?'http://127.0.0.1/home/purchases*':'http://127.0.0.1/en/orders*')}));
  manifest.host_permissions=[...(manifest.host_permissions??[]),'http://127.0.0.1/*'];files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
  for(const [name,bytes]of files)if(name.endsWith('.js')||name.endsWith('.mjs'))files.set(name,Buffer.from(bytes.toString().replaceAll('https://www.humblebundle.com',origin).replaceAll('https://www.fanatical.com',origin)));
  if(key==='GL')files.set('src/providers/floating-panel.js',Buffer.from(`{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return attach.call(this,{...o,mode:'open'});};}\n`+files.get('src/providers/floating-panel.js')));
  const stage=join(temporary,key);await mkdir(stage);for(const [name,bytes]of files){const p=join(stage,name);await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes);}const archive=join(temporary,key+'.zip');await writeFile(archive,runtimeZip(files));archives.set(key,{stage,archive,manifest});
 }
 async function install(key){const a=archives.get(key);let id;if(firefox){const r=await driver.send('Addon:Install',{path:a.archive,temporary:true});id=r.value??r;await driver.send('Marionette:SetContext',{value:'chrome'});const r2=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");ExtensionPermissions.add(arguments[0],{permissions:[],origins:["http://127.0.0.1/*"]},WebExtensionPolicy.getByID(arguments[0]).extension).then(()=>done(true),e=>done({error:e.message}));',args:[id],newSandbox:true});assert.equal(r2.value??r2,true);await driver.send('Marionette:SetContext',{value:'content'});}else id=(await driver.send('Extensions.loadUnpacked',{path:a.stage})).id;installed.set(key,id);}
 async function remove(key){if(firefox)await driver.send('Addon:Uninstall',{id:installed.get(key)});else await driver.send('Extensions.uninstall',{id:installed.get(key)});installed.delete(key);}
 async function pairTransport(){if(!installed.has('GL'))return;await navigate(await extensionUrl('GL','options.html'));await wait("try{await import('./src/lib/storage.js');return true;}catch{return false;}",'GL options');await evaluate(`const S=await import('./src/lib/storage.js');await S.saveAllowedExternalClientIds(${JSON.stringify([...installed].filter(([key])=>key!=='GL').map(([,id])=>id))});return true;`);for(const key of ['HB','FAN'])if(installed.has(key)){await navigate(await extensionUrl(key,key==='HB'?'options.html':'src/options.html'));await wait('return !!globalThis.chrome?.storage?.local;','Companion options');await evaluate(`await chrome.storage.local.set({galacticLibraryExtensionId:${JSON.stringify(installed.get('GL'))}});return true;`);}}
 const ids={humble:['#galactic-library-humble-importer','#hcl-importer'],fanatical:['#galactic-library-fanatical-importer','#fanatical-library-importer']};
 async function recoveryStyle(provider){
  const s=await evaluate(`const n=document.querySelector('[data-importer-ownership="${provider}"]'),b=[...n.querySelectorAll('button')],r=b[1];b[0].focus();const c=getComputedStyle(b[0]),p=getComputedStyle(r);return {count:b.length,secondary:c.backgroundColor,primary:p.backgroundColor,radius:c.borderRadius,padding:c.padding,font:c.fontSize,gap:getComputedStyle(b[0].parentElement).gap,outline:c.outlineWidth,focused:document.activeElement===b[0],disabled:b[0].disabled,tabIndex:b[0].tabIndex};`);
  assert.equal(s.count,2);assert.notEqual(s.primary,s.secondary);assert.equal(s.radius,'5px');assert.equal(s.padding,'8px 10px');assert.equal(s.font,'14px');assert.equal(s.gap,'8px');assert.equal(s.outline,'2px');assert(s.focused);assert.equal(s.disabled,false);assert.equal(s.tabIndex,0);console.log('PASS '+target+' '+provider+' recovery notice: themed primary/secondary buttons, spacing and keyboard focus');
 }
 async function check(provider,expected){await navigate(origin+(provider==='humble'?'/home/purchases':'/en/orders'));const selectors=ids[provider];await wait(`const visible=${JSON.stringify(selectors)}.filter(s=>{const e=document.querySelector(s);return e&&getComputedStyle(e).display!=='none';});return visible.length===1&&visible[0]===${JSON.stringify(selectors[expected==='GL'?0:1])};`,provider+' expected '+expected);console.log('PASS '+target+' '+[...installed.keys()].join('+')+' '+provider+': one visible importer, '+expected);}
 await build('GL');await build('HB');await build('FAN');await install('GL');await pairTransport();await check('humble','GL');await check('fanatical','GL');
 await install('HB');await pairTransport();await check('humble','HB');await check('fanatical','GL');
 await install('FAN');await pairTransport();await check('humble','HB');await check('fanatical','FAN');
 // Discovery alone must not create a standing purchase permission.
 await navigate(await extensionUrl('GL','options.html'));await wait('return !!globalThis.chrome?.runtime?.id;','GL options ready');assert.equal(await evaluate("const r=await chrome.runtime.sendMessage({type:'GH_PURCHASE_ACTION',action:'syncState',provider:'fanatical'});return r.state===null;"),true);
 console.log('PASS '+target+' unconnected discovery grants no purchase sharing');
 // A disabled/removed extension can leave its old DOM in a live page.
 await check('fanatical','FAN');await remove('FAN');await pause(1100);await evaluate("window.dispatchEvent(new Event('focus'));return true;");
 await wait("const e=document.querySelector('#galactic-library-fanatical-importer');return e&&getComputedStyle(e).display!=='none'&&getComputedStyle(document.querySelector('#fanatical-library-importer')).display==='none';",'Live removal must restore GL and hide stale companion DOM');
 await install('FAN');await pause(1100);await evaluate("window.dispatchEvent(new Event('focus'));return true;");
 await wait("const e=document.querySelector('[data-importer-ownership=fanatical]');return e&&!e.hidden&&e.innerText.includes('Reload');",'Enable on an existing page must offer reload instead of stale importer');
 await recoveryStyle('fanatical');
 await check('fanatical','FAN');console.log('PASS '+target+' removal/re-enable on the open page: GL recovery, stale-DOM protection and reload');
 await check('humble','HB');await remove('HB');await pause(1100);await evaluate("window.dispatchEvent(new Event('focus'));return true;");
 await wait("const e=document.querySelector('#galactic-library-humble-importer');return e&&getComputedStyle(e).display!=='none';",'Live HB removal must restore GL');
 await install('HB');await pause(1100);await evaluate("window.dispatchEvent(new Event('focus'));return true;");
 await wait("const e=document.querySelector('[data-importer-ownership=humble]');return e&&!e.hidden;",'Live HB enable must offer recovery');await recoveryStyle('humble');await pairTransport();await check('humble','HB');
 console.log('PASS '+target+' Humble live removal/re-enable and independent Fanatical ownership');
 await remove('HB');await check('humble','GL');await check('fanatical','FAN');
 await remove('FAN');await check('fanatical','GL');
 await install('HB');await install('FAN');await remove('GL');await check('humble','HB');await check('fanatical','FAN');
 await remove('HB');await check('fanatical','FAN');await install('HB');await remove('FAN');await check('humble','HB');
 console.log('PASS '+target+' installed selection matrix and standalone companions; no acquisition or data migration');
}finally{if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));assert(resolve(temporary).startsWith(resolve(tmpdir())+sep));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});}

// Minimal ZIP reader for the established HB test archive; never used at runtime.
import {inflateRawSync} from 'node:zlib';
function readArchive(bytes){const files=new Map();let end=bytes.length-22;while(end>=0&&bytes.readUInt32LE(end)!==0x06054b50)end--;assert(end>=0);let at=bytes.readUInt32LE(end+16);for(let i=0;i<bytes.readUInt16LE(end+10);i++){const method=bytes.readUInt16LE(at+10),size=bytes.readUInt32LE(at+20),nl=bytes.readUInt16LE(at+28),offset=bytes.readUInt32LE(at+42),name=bytes.subarray(at+46,at+46+nl).toString();assert(!name.split('/').includes('..'));const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28),packed=bytes.subarray(start,start+size);assert([0,8].includes(method));files.set(name,method===8?inflateRawSync(packed):packed);at+=46+nl+bytes.readUInt16LE(at+30)+bytes.readUInt16LE(at+32);}return files;}
