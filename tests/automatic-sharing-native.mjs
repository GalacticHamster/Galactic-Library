// Installed production content scripts/workers; synthetic pages and disposable profiles only.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm,access,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {runtimeZip} from '../scripts/release.mjs';
import {chromePipe,firefoxMarionette,freePort} from './native-protocol.mjs';
const firefox=process.argv.includes('--firefox'),target=firefox?'firefox':'chrome';
let fanCount=2,hbCount=2;
const bundleOrder=n=>({_id:'synthetic-order-'+n,status:'COMPLETE',date:'2026-11-01',items:[{_id:'synthetic-bundle',name:'Synthetic bundle',bundles:[{games:[{_id:'synthetic-product-'+n,name:'Synthetic purchased game '+n,type:'game'}]}]}]});
const fanOrder=n=>process.argv.includes('--reminders')?{_id:'synthetic-order-'+n,status:'COMPLETE',date:'2026-11-01',items:[{_id:'direct-game-'+n,name:'Synthetic purchased game '+n,type:'game',status:'fulfilled',bundles:[],drm:{steam:true}}]}:bundleOrder(n);
const server=createServer((req,res)=>{
 res.setHeader('content-type','application/json');
 if(req.url==='/api/user/orders'){res.setHeader('x-total-count',String(fanCount));res.end(JSON.stringify(Array.from({length:fanCount},(_,i)=>fanOrder(i))));return;}
 if(req.url.startsWith('/api/user/orders/')){res.end(JSON.stringify(fanOrder(Number(req.url.split('-').at(-1)))));return;}
 if(req.url.startsWith('/api/v1/user/order')){res.end(JSON.stringify(Array.from({length:hbCount},(_,i)=>({gamekey:'humble-order-'+i,product:{human_name:'Synthetic Humble bundle '+i},created:'2026-11-01T00:00:00Z'}))));return;}
 if(req.url.startsWith('/api/v1/order/')){const n=req.url.match(/humble-order-(\d+)/)[1];res.end(JSON.stringify({gamekey:'humble-order-'+n,subproducts:[{human_name:'Synthetic Humble book '+n,machine_name:'humble-book-'+n,downloads:[{platform:'ebook',download_struct:[{url:'https://example.invalid/book.epub',name:'EPUB'}]}]}]}));return;}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html><body><main>Synthetic purchase history</main><script>localStorage.setItem("bsauth",JSON.stringify({token:"SYNTHETIC_ONLY"}));</script></body></html>');
});
// Public Web Store signing identities only, never provider redemption keys.
// Supplying these public manifest keys in disposable builds gives the actual
// approved Chrome IDs without editing production trust lists or pairing state.
const publicKeys=JSON.parse(await readFile(new URL('./fixtures/companion-public-keys.json',import.meta.url),'utf8'));
const fixtureKeys={};
for(const [role,{id,publicKeyBase64}]of Object.entries(publicKeys)){
 const derived=createHash('sha256').update(Buffer.from(publicKeyBase64,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
 assert.equal(derived,id);fixtureKeys[role]=publicKeyBase64;
}

await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const temporary=await mkdtemp(join(tmpdir(),'gl-importer-ownership-'));let child,driver,session,exited;
const installed=new Map(),archives=new Map(),legacyRoles=new Set();
const upgrade=process.argv.find(a=>a.startsWith('--upgrade='))?.split('=')[1];
if(upgrade)assert(['all','gl','companions'].includes(upgrade),'Unknown upgrade mode');
try{
 const profile=join(temporary,'profile');await mkdir(profile);let binary=firefox?'C:/Program Files/Mozilla Firefox/firefox.exe':'C:/Program Files/Google/Chrome/Application/chrome.exe';
 if(firefox)try{await access(binary);}catch{binary=join(execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{encoding:'utf8',windowsHide:true}).trim(),'VFS/ProgramFiles/Firefox Package Root/firefox.exe');}
 const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\n`);
 async function startBrowser(){
 child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-pipe','--enable-unsafe-extension-debugging','--user-data-dir='+profile,'about:blank'],{windowsHide:true,env:{...process.env,MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'},stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});child.stdout.resume();child.stderr.resume();exited=new Promise(done=>child.once('exit',done));driver=firefox?await firefoxMarionette(port):chromePipe(child);
 if(firefox)await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
 else {
  // Chrome's unsafe load API permits initial installation without Developer
  // mode, but runtime.reload then disables it as unsupportedDeveloperExtension.
  // Enable the ordinary unpacked-extension UI mode in this disposable profile.
  await navigate('chrome://extensions/');await wait('return !!chrome.developerPrivate;','Chrome extension UI unavailable');
  await evaluate('return new Promise(resolve=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true},()=>resolve(true)));');
 }
 }
 await startBrowser();
 async function navigate(url){console.log('NAVIGATE '+url);if(firefox)await driver.send('WebDriver:Navigate',{url});else{const t=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;}}
 async function evaluate(code){if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+code+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:e.message}));',args:[],newSandbox:false});const v=r.value??r;assert(!v?.error,v?.error);return v;}const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+code+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;}
 async function wait(code,message,attempts=150){for(let n=0;n<attempts;n++){try{if(await evaluate(code))return;}catch{}await pause(100);}throw Error(message+' '+JSON.stringify(await evaluate('return {url:location.href,body:document.body.innerText,html:document.documentElement.outerHTML.slice(-15000)};')));}
 async function extensionUrl(key,page){const id=installed.get(key);if(!firefox)return 'chrome-extension://'+id+'/'+page;await driver.send('Marionette:SetContext',{value:'chrome'});const r=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL(arguments[1]);',args:[id,page],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});return r.value??r;}
 async function build(key,legacy=false){
  const root=resolve(key==='GL'?'.':key==='HB'?'../HB':'../Fanatical');let files;
  if(key==='HB'){
   const out=join(temporary,'hb-package');execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts/package-release.ps1'),'-Target',firefox?'Firefox':'Chrome','-OutputDirectory',out],{stdio:'pipe',windowsHide:true});
   // HB's established PowerShell archive is deflated.
   const zip=await readFile(join(out,'Humble-Comic-Library-'+JSON.parse(await readFile(join(root,'manifest.json'),'utf8')).version+(firefox?'-firefox':'')+'.zip'));
   files=readArchive(zip);
  }else files=new Map((await (await import(pathToFileURL(join(root,'scripts/release.mjs')))).createRelease(root,undefined,target)).files);
  if(legacy){
   const tag=key==='GL'?'v1.0.1':key==='HB'?'v1.0.2':'v1.0.3';
   const tree=readArchive(execFileSync('git',['archive','--format=zip',tag],{cwd:root,windowsHide:true,maxBuffer:40*1024*1024}));
   const paths=key==='HB'?[...tree.get('scripts/package-release.ps1').toString().split('$releaseFiles = @(')[1].split('\n)')[0].matchAll(/'([^']+)'/g)].map(m=>m[1]):JSON.parse(tree.get('scripts/runtime-files.json'));
   files=new Map(paths.map(path=>{assert(tree.has(path),'Missing historical runtime '+path);return [path,tree.get(path)];}));
   if(process.env.GH_PUBLISHED_CHROME_ROOT){
    const parent=join(process.env.GH_PUBLISHED_CHROME_ROOT,publicKeys[key].id),directories=await readdir(parent),version=tag.slice(1),source=directories.find(d=>d===version||d.startsWith(version+'_'));
    assert(source,'Published runtime version unavailable: '+key+' '+version);
    files=new Map(await Promise.all(paths.map(async path=>[path,await readFile(join(parent,source,path))])));
    assert.equal(JSON.parse(files.get('manifest.json')).version,version);console.log('PUBLISHED RUNTIME '+key+' '+version+' read-only public package files');
   }

   if(firefox){const m={...JSON.parse(files.get('manifest.json')),...JSON.parse(tree.get('manifests/firefox.json'))};delete m.minimum_chrome_version;delete m.key;files.set('manifest.json',Buffer.from(JSON.stringify(m)));}
   legacyRoles.add(key);console.log('BASELINE '+key+' '+tag);
  }else legacyRoles.delete(key);
  const manifest=JSON.parse(files.get('manifest.json'));
  if(!firefox)manifest.key=fixtureKeys[key];
  manifest.content_scripts=manifest.content_scripts.filter(s=>s.matches.some(p=>p.includes('humblebundle')||p.includes('fanatical'))).map(s=>({...s,matches:s.matches.filter(p=>p.includes('humblebundle')||p.includes('fanatical')).map(p=>p.includes('humblebundle')?'http://127.0.0.1/home/purchases*':'http://127.0.0.1/en/orders*')}));
  manifest.host_permissions=[...(manifest.host_permissions??[]),'http://127.0.0.1/*'];files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
  for(const [name,bytes]of files)if(name.endsWith('.js')||name.endsWith('.mjs'))files.set(name,Buffer.from(bytes.toString().replaceAll('https://www.humblebundle.com',origin).replaceAll('https://www.fanatical.com',origin)));
  if(key==='FAN')files.set('src/service-worker.js',Buffer.from(files.get('src/service-worker.js').toString().replaceAll(String.raw`/^https:\/\/www\.fanatical\.com\/`,String.raw`/^http:\/\/127\.0\.0\.1:\d+\/`)));
  if(key==='GL')files.set('src/providers/floating-panel.js',Buffer.from(`{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return attach.call(this,{...o,mode:'open'});};const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async(...args)=>{if(args[0]?.type==='GET_PROVIDER_IMPORTER'&&document.documentElement.dataset.testHoldImporter==='yes')await new Promise(resolve=>{const observer=new MutationObserver(()=>{if(document.documentElement.dataset.testHoldImporter!=='yes'){observer.disconnect();resolve();}});observer.observe(document.documentElement,{attributes:true});});return send(...args);};}\n`+files.get('src/providers/floating-panel.js')));
  if(key!=='GL'){const name=key==='HB'?'content.js':'src/content.js';files.set(name,Buffer.from('globalThis.confirm=()=>true;\n'+files.get(name)));}
  const stage=join(temporary,key);assert(resolve(stage).startsWith(resolve(temporary)+sep));await rm(stage,{recursive:true,force:true});await mkdir(stage);for(const [name,bytes]of files){const p=join(stage,name);await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes);}const archive=join(temporary,key+(legacy?'-tag':'-current')+'.zip');await writeFile(archive,runtimeZip(files));archives.set(key,{stage,archive,manifest});
 }
 async function install(key){console.log('INSTALL '+key);const a=archives.get(key);let id;if(firefox){const r=await driver.send('Addon:Install',{path:a.archive,temporary:true});id=r.value??r;await driver.send('Marionette:SetContext',{value:'chrome'});const r2=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");ExtensionPermissions.add(arguments[0],{permissions:[],origins:["http://127.0.0.1/*"]},WebExtensionPolicy.getByID(arguments[0]).extension).then(()=>done(true),e=>done({error:e.message}));',args:[id],newSandbox:true});assert.equal(r2.value??r2,true);await driver.send('Marionette:SetContext',{value:'content'});}else id=(await driver.send('Extensions.loadUnpacked',{path:a.stage})).id;installed.set(key,id);}
 async function remove(key){if(firefox)await driver.send('Addon:Uninstall',{id:installed.get(key)});else await driver.send('Extensions.uninstall',{id:installed.get(key)});installed.delete(key);}

 const companions=process.argv.includes('--hb-only')?['HB']:process.argv.includes('--fan-only')?['FAN']:['HB','FAN'];
 const provider=key=>key==='HB'?'humble':'fanatical';
 const options=key=>extensionUrl(key,key==='FAN'?'src/options.html':'options.html');
 async function stopBrowser(){
  // Exercise an ordinary browser restart, not a forced process termination
  // before Firefox has flushed temporary-add-on identity/storage metadata.
  try{await driver.send(firefox?'Marionette:Quit':'Browser.close',firefox?{flags:['eAttemptQuit']}:{});}catch{}
  await exited;driver.close?.();
 }
 async function restartInstalled(){
  const ids=new Map(installed);await stopBrowser();await startBrowser();
  for(const key of ids.keys()){await install(key);assert.equal(installed.get(key),ids.get(key));}
 }
 async function onOptions(key,code){await navigate(await options(key));await wait('return !!globalThis.chrome?.runtime?.id&&document.readyState==="complete";','Options not ready');return evaluate(code);}
 async function scan(key,mode='all'){
  console.log('SCAN '+key);
  await navigate(origin+(key==='HB'?'/home/purchases':'/en/orders'));
  const selector=key==='HB'?'#hcl-importer':'#fanatical-library-importer';
  await wait('return !!document.querySelector('+JSON.stringify(selector)+')?.querySelector("[data-import-mode='+mode+']");','No '+key+' importer');
  assert.equal(await evaluate('window.confirm=()=>true;const b=document.querySelector('+JSON.stringify(selector)+').querySelector("[data-import-mode='+mode+']");if(b.disabled)throw Error("Import already busy");b.click();return b.disabled;'),true,'Import never started');
  await wait('return !document.querySelector('+JSON.stringify(selector)+').querySelector("[data-import-mode='+mode+']").disabled;','Import did not finish');
  const status=await evaluate('return document.querySelector('+JSON.stringify(selector)+').querySelector("output")?.textContent??document.querySelector('+JSON.stringify(selector)+').innerText;');
  assert(!/Import failed|Scan incomplete|Could not|Error:/i.test(status),status);console.log('PASS '+target+' '+key+' production import lifecycle: '+status.slice(-280));
 }
 async function count(p){return onOptions('GL','const S=await import("./src/lib/storage.js"),db=await S.getDatabase();return Object.values(db.providerItems).filter(i=>i.provider==='+JSON.stringify(p)+').length;');}
 async function received(key,n){await navigate(await options('GL'));try{await wait('const S=await import("./src/lib/storage.js"),db=await S.getDatabase();return Object.values(db.providerItems).filter(i=>i.provider==='+JSON.stringify(provider(key))+').length==='+n+'&&(await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncState",provider:'+JSON.stringify(provider(key))+'})).state?.status==="synced";','Automatic '+key+' sync did not reach '+n+' records',upgrade==='companions'?900:150);}catch(error){console.log('GL FAILURE STATE '+JSON.stringify(await evaluate('return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncState",provider:'+JSON.stringify(provider(key))+'});')));console.log('COMPANION FAILURE STATE '+JSON.stringify(await onOptions(key,'return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncState",provider:'+JSON.stringify(provider(key))+'});')));throw error;}}
 await build('GL',!!upgrade);for(const key of companions)await build(key,!!upgrade);
 if(process.argv.includes('--gl-first'))await install('GL');
 for(const key of companions){await install(key);await scan(key);}
 if(!installed.has('GL'))await install('GL');
 if(upgrade){
  // Legacy state is produced by installed, tagged runtimes, not injected maps.
  // A real old setup is optional; the other journey has no saved relationship.
  if(process.argv.includes('--legacy-mapped'))for(const key of companions){
   const p=provider(key),r=await onOptions('GL','const c=await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncChoices",provider:'+JSON.stringify(p)+'});if(!c.ok)throw Error(c.error);return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncConnect",provider:'+JSON.stringify(p)+',peerId:c.peerId,localId:c.accounts[0].stableId,remoteId:c.remoteAccounts[0].stableId,confirmed:true,sameAccount:true});');assert(r.ok,r.error);await received(key,2);
  }
  for(const key of ['GL',...companions])await onOptions(key,'await chrome.storage.local.set({syncEnabled:false});return true;');
  const roles=upgrade==='all'?['GL',...companions]:upgrade==='gl'?['GL']:companions;
  const savedPurchases=new Map();
  const identityView=key=>key==='FAN'?'const s=await chrome.storage.local.get(null);return {account:s.fanaticalAccountId,items:s.fanaticalLibraryItems.map(i=>({id:i.sourceItemId,title:i.title})).sort((a,b)=>a.id.localeCompare(b.id))};':'const s=await chrome.storage.local.get(null);return {account:s.humbleAccountId,items:s.libraryItems.map(i=>({id:i.providerItemId,purchase:i.purchaseKey,title:i.title})).sort((a,b)=>a.title.localeCompare(b.title))};';
  for(const key of companions)savedPurchases.set(key,await onOptions(key,identityView(key)));
  const savedIds=new Map(installed);await stopBrowser();
  for(const key of roles)await build(key);
  await startBrowser();for(const key of savedIds.keys()){await install(key);assert.equal(installed.get(key),savedIds.get(key),'Upgrade changed extension identity');}

  if(!firefox)for(const key of roles){
   await navigate(await options(key));await wait('return !!globalThis.chrome?.runtime?.id;','Upgrade page unavailable');
   try{await evaluate('chrome.runtime.reload();return true;');}catch(error){if(!/context|closed|reload|frame/i.test(error.message))throw error;}
   await install(key);await navigate(await options(key));
   try{
   await wait('const r=await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncState",provider:'+JSON.stringify(key==='FAN'?'fanatical':'humble')+'});return typeof r.sharing==="boolean";','Upgraded worker did not load the new sharing contract');
   }catch(error){await navigate('chrome://extensions/');await wait('return !!chrome.developerPrivate;','No developer diagnostics');console.log('UPGRADE DIAGNOSTICS '+JSON.stringify(await evaluate('return new Promise(resolve=>chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true},rows=>resolve(rows.map(({id,name,state,disableReasons,manifestErrors})=>({id,name,state,disableReasons,manifestErrors})))));')));console.log('STAGED NEW MODEL '+(await readFile(join(archives.get(key).stage,key==="GL"?"shared/purchase-sync.js":key==="HB"?"purchase-sync.js":"src/purchase-sync.js"),'utf8')).includes('galacticPurchaseSharing'));throw error;}
  }
  for(const key of companions)assert.deepEqual(await onOptions(key,identityView(key)),savedPurchases.get(key),'Upgrade changed saved '+key+' purchase/account identities');
  console.log('UPGRADED '+roles.join('+')+'; legacy preference false retained only as migration input');
 }
 for(const key of companions){await received(key,2);console.log('PASS '+target+' '+key+' fresh automatic pairing, no injected pairing/allowlist/mapping or manual sync');}
 for(const key of companions){
  if(key==='HB')hbCount=3;else fanCount=3;await scan(key,'new');await received(key,3);
  console.log('PASS '+target+' '+key+' incremental source change automatically reaches GL');
  const controller=legacyRoles.has(key)?'GL':key;
  const disabled=await onOptions(controller,'return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncSetSharing",provider:'+JSON.stringify(provider(key))+',enabled:false});');assert(disabled.ok,disabled.error);
  if(key==='HB')hbCount=4;else fanCount=4;await scan(key,'new');
  assert.equal(await count(provider(key)),3);
  await restartInstalled();
  const pref=await onOptions(controller,'return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncState",provider:'+JSON.stringify(provider(key))+'});');assert.equal(pref.sharing,false);
  const enabled=await evaluate('return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncSetSharing",provider:'+JSON.stringify(provider(key))+',enabled:true});');assert(enabled.ok,enabled.error);
  await received(key,4);console.log('PASS '+target+' '+key+' opt-out blocks new purchases, survives page reload; re-enable reconciles');
 }
 if(process.argv.includes('--reminders')){
  if(companions.includes('FAN')){
   await navigate(await options('FAN'));await wait('return document.querySelector("#local-reminder-list")?.children.length===4;','FAN standalone reminders unavailable');
   await evaluate('document.querySelector("#local-reminder-list button").click();return true;');await wait('return document.querySelector("#local-reminder-list")?.children.length===3;','Local dismissal failed');
   await navigate(await options('GL'));await wait('const S=await import("./src/lib/storage.js"),R=await import("./src/lib/reminders.js");return R.libraryReminders(await S.getDatabase()).filter(r=>r.provider==="fanatical"&&r.kind==="activation"&&r.keyStatus==="unrevealed").length===3;','Automatic FAN reminder review did not reach GL');
   console.log('PASS '+target+' FAN local dismissal automatically updates GL without manual pairing or synchronization');
  }
  if(companions.includes('HB')){
   const restored=await onOptions('HB',`const H=HumbleComicLibrary,b=H.createLibraryBackup(await chrome.storage.local.get(H.LIBRARY_STATE_DEFAULTS));b.keyReminders=[{id:'synthetic-legacy-course',purchaseKey:'synthetic-course-order',title:'Synthetic reminder-only course',status:'unrevealed',checkedAt:'2026-11-01T00:00:00Z'}];return await H.storageRequest('replace',H.restoreBackupState(b));`);assert(restored);
   await received('HB',4);await wait('const S=await import("./src/lib/storage.js"),db=await S.getDatabase();return Object.values(db.companionFeeds).some(f=>f.entries.some(e=>e.title==="Synthetic reminder-only course"));','Additional HB feed failed after identity-preserving restore');
   const report=await evaluate('const S=await import("./src/lib/storage.js"),db=await S.getDatabase(),R=await import("./src/lib/reminders.js");return R.libraryReminders(db).filter(r=>r.title==="Synthetic reminder-only course").map(r=>({provider:r.provider,source:r.source,kind:r.kind}));');assert.deepEqual(report,[{provider:'humble',source:'humble-companion',kind:'activation'}]);
   const beforeFeed=await evaluate('const S=await import("./src/lib/storage.js");return Object.values((await S.getDatabase()).companionFeeds).find(f=>f.entries.some(e=>e.title==="Synthetic reminder-only course")).revisionRef;');
   const checked=await evaluate('return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncNow",provider:"humble"});');assert(checked.ok,checked.error);
   const afterFeed=await evaluate('const S=await import("./src/lib/storage.js");return Object.values((await S.getDatabase()).companionFeeds).find(f=>f.entries.some(e=>e.title==="Synthetic reminder-only course")).revisionRef;');assert.equal(afterFeed,beforeFeed,'An unchanged check rewrote the additional feed');
   console.log('PASS '+target+' HB restore preserves account isolation and automatically shares one additional reminder without native duplicates');
  }
 }
 console.log('PASS '+target+' automatic-sharing installed journey '+[...installed.keys()].join('+')+' '+(process.argv.includes('--gl-first')?'GL first':'companions first'));
}finally{if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));assert(resolve(temporary).startsWith(resolve(tmpdir())+sep));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});}

// Minimal ZIP reader for the established HB test archive; never used at runtime.
import {inflateRawSync} from 'node:zlib';
function readArchive(bytes){const files=new Map();let end=bytes.length-22;while(end>=0&&bytes.readUInt32LE(end)!==0x06054b50)end--;assert(end>=0);let at=bytes.readUInt32LE(end+16);for(let i=0;i<bytes.readUInt16LE(end+10);i++){const method=bytes.readUInt16LE(at+10),size=bytes.readUInt32LE(at+20),nl=bytes.readUInt16LE(at+28),offset=bytes.readUInt32LE(at+42),name=bytes.subarray(at+46,at+46+nl).toString();assert(!name.split('/').includes('..'));const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28),packed=bytes.subarray(start,start+size);assert([0,8].includes(method));files.set(name,method===8?inflateRawSync(packed):packed);at+=46+nl+bytes.readUInt16LE(at+30)+bytes.readUInt16LE(at+32);}return files;}
