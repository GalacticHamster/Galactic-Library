// Installed production acquisition/worker/writer, synthetic localhost data only.
// Run: node tests/fanatical-native.mjs [--firefox]
import assert from 'node:assert/strict';
import {fanaticalOrder} from './fanatical-coverage.js';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
const firefox=process.argv.includes('--firefox'),release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
let detailDelay=0;let orders=[fanaticalOrder()],total=null,status=200,invalidListing=false,detailRequests=0,listRequests=0,pageSize=0,failPage=false,failedOrders=[];
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/api/user/orders')){
  const listing=/^\/api\/user\/orders(?:\?|$)/u.test(req.url),second=req.url.includes('?page=2');if(listing)listRequests++;else {detailRequests++;if(detailDelay)await pause(detailDelay);}
  res.statusCode=status===200&&(listing&&second&&failPage||!listing&&failedOrders.some(id=>req.url.endsWith(id)))?404:status;
  res.setHeader('Content-Type','application/json');if(listing&&total!==null)res.setHeader('x-total-count',String(total));
  if(listing&&pageSize&&!second)res.setHeader('link','</api/user/orders?page=2>; rel="next"');
  res.end(JSON.stringify(listing&&invalidListing?{unexpected:true}:listing?(pageSize?second?orders.slice(pageSize):orders.slice(0,pageSize):orders):orders.find(o=>req.url.endsWith(o._id))));return;
 }
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic orders</main><script>localStorage.setItem("bsauth",JSON.stringify({token:"SYNTHETIC-ONLY"}));</script></body></html>');
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
// Test-only origin substitution, never shipping permissions or application guards.
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(p=>p==='https://www.fanatical.com/*'?'http://127.0.0.1/*':p);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
files.set('src/background/service-worker.js',Buffer.from(files.get('src/background/service-worker.js').toString().replaceAll('https://www.fanatical.com',origin).replace('async function notifyVideoDiagnostics(){',`let fanaticalTestReject='',fanaticalTestWrites=0;const testEvents=[];const fanaticalTestSet=privateArea.set.bind(privateArea);privateArea.set=async patch=>{if(fanaticalTestReject&&patch.galacticLibraryDatabase)throw Error(fanaticalTestReject+' FAKE_TOKEN FAKE_ACCOUNT FAKE_ORDER FAKE_TITLE https://private.invalid FAKE_STACK');await fanaticalTestSet(patch);testEvents.push({keys:Object.keys(patch),bytes:new TextEncoder().encode(JSON.stringify(patch)).length});if(patch.galacticLibraryDatabase)fanaticalTestWrites++;};chrome.runtime.onMessage.addListener((r,s,reply)=>{if(r?.type==='GL_TEST_FANATICAL_STORAGE'){if(typeof r.reject==='string')fanaticalTestReject=r.reject;reply({writes:fanaticalTestWrites,events:testEvents});return false;}});async function notifyVideoDiagnostics(){`)));
files.set('src/providers/fanatical-content.js',Buffer.from('const originalObjectUrl=URL.createObjectURL;URL.createObjectURL=function(b){b.text().then(t=>{document.documentElement.dataset.testScanExport=t;});return originalObjectUrl.call(this,b);};const originalAttach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return originalAttach.call(this,{...o,mode:"open"});};\n'+files.get('src/providers/fanatical-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`
import {createStorageClient,createBackup,parseBackup} from './src/lib/storage.js';
import {handleExternalApiRequest} from './src/lib/external-api.js';
try{
 if(new URL(location.href).searchParams.has('boundary')){
  const tab=(await chrome.tabs.query({url:'${origin}/en/orders'})).at(-1);let boundary;
  try{const entries=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:async()=>{throw Error('FAKE_TOKEN FAKE_ACCOUNT FAKE_ORDER FAKE_TITLE https://private.invalid FAKE_STACK');}});boundary={resolved:true,resultNull:entries[0]?.result===null,hasError:!!entries[0]?.error};}catch{boundary={resolved:false};}
  document.documentElement.dataset.result=JSON.stringify({boundary});
 }else{const params=new URLSearchParams(location.search);if(params.has('reject'))await chrome.runtime.sendMessage({type:'GL_TEST_FANATICAL_STORAGE',reject:params.get('reject')});const c=createStorageClient(r=>chrome.runtime.sendMessage(r));if(params.has('reset'))await c.clearDatabase();if(params.has('enableDiagnostics'))await c.saveProviderDiagnosticsEnabled(true);const db=await c.getDatabase(),items=Object.values(db.providerItems),state=db.providers.fanatical;
 const match=items.length?handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:items[0].title,mediaType:'book'}]}).results[0].owned:false;
 const raw=(await chrome.storage.local.get('galacticLibraryDatabase')).galacticLibraryDatabase;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(raw))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const backup=parseBackup(createBackup(db));document.documentElement.dataset.result=JSON.stringify({count:items.length,owned:items.filter(i=>i.ownership==='owned').length,history:Object.keys(db.providerHistory).length,fullAt:state.fullSyncAt??null,acquisitionAt:state.syncState?.acquisitionCheckedAt??null,fingerprints:state.syncState?.knownOrderFingerprints??[],failed:state.syncState?.failedOrderFingerprints??[],listingIncomplete:state.syncState?.listingIncomplete===true,digest,health:state.syncHealth?.status,comparisonOwned:match,work:await chrome.runtime.sendMessage({type:'GL_TEST_FANATICAL_STORAGE'}),roundTrip:Object.keys(backup.providerItems).length===items.length});
}}catch(e){document.documentElement.dataset.result=JSON.stringify({error:e.message});}`));
const temporary=await mkdtemp(join(tmpdir(),'gl-fanatical-native-'));let child,driver,session,exited;
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  async function startBrowser(){const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,env:{...process.env,...(firefox?{MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'}:{})},stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox){await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});const archive=join(temporary,'extension.zip');await writeFile(archive,runtimeZip(files));await driver.send('Addon:Install',{path:archive,temporary:true});
    await driver.send('Marionette:SetContext',{value:'chrome'});
    const granted=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");ExtensionPermissions.add(arguments[0],{permissions:[],origins:["http://127.0.0.1/*"]},WebExtensionPolicy.getByID(arguments[0]).extension).then(()=>done(true),error=>done({error:error.message}));',args:['galactic-library@galactichamster.com'],newSandbox:true});assert.equal(granted.value??granted,true);
    await driver.send('Marionette:SetContext',{value:'content'});
  }else await driver.send('Extensions.loadUnpacked',{path:stage});}
  await startBrowser();
  async function evaluate(script){
    if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],newSandbox:false});const value=Object.hasOwn(r,'value')?r.value:r;assert(!value?.error,value?.error);return value;}
    const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  async function navigate(url){if(firefox)await driver.send('WebDriver:Navigate',{url});else{const t=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);}}
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-fanatical-importer")?.shadowRoot?.querySelector("[data-import-status]")?.textContent};');throw Error(message+' '+JSON.stringify(state));}

  const root='document.querySelector("#galactic-library-fanatical-importer").shadowRoot';
  const ready=()=>wait('return !!document.querySelector("#galactic-library-fanatical-importer")?.shadowRoot?.querySelector("[data-profile-label]");','Fanatical panel unavailable');
  async function page(){await navigate(origin+'/en/orders');await ready();}
  async function sync(mode='full'){
    await evaluate(`const s=${root};s.querySelector('[data-mode="${mode}"]').click();return true;`);
    await wait(`return !${root}.querySelector('.status').dataset.busy;`,'Import did not finish');
    return evaluate(`return ${root}.querySelector('.status').textContent;`);
  }
  async function report(){await navigate(reportUrl);return JSON.parse(await wait('return document.documentElement?.dataset.result;','No saved report'));}
  async function scanReport(){await wait(`return ${root}.querySelector('[data-export-scan]').closest('details').hidden===false;`,'Diagnostic control not visible');await evaluate(`const s=${root};s.querySelector('[data-export-scan]').closest('details').open=true;s.querySelector('[data-export-scan]').click();return true;`);return JSON.parse(await wait('return document.documentElement.dataset.testScanExport;','No aggregate scan report'));}

  await page();const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
  for(const scenario of [{name:'small',n:3,delay:0},{name:'large',n:90,delay:0},{name:'slow',n:12,delay:350},{name:'waiting',n:3,delay:2400},{name:'partial',n:5,delay:100,fail:true}]){
    await navigate(reportUrl+'?reset=1&enableDiagnostics=1');await wait('return document.documentElement?.dataset.result;','Reset');await page();
    orders=Array.from({length:scenario.n},(_,i)=>fanaticalOrder(i+1,['book']));detailDelay=scenario.delay;failedOrders=scenario.fail?[orders.at(-1)._id]:[];const beforeLists=listRequests,beforeDetails=detailRequests;
    await evaluate('const s='+root+';s.querySelector("[data-profile-label]").value="Synthetic";s.querySelector("[data-profile-label]").dispatchEvent(new Event("input"));s.querySelector("[data-profile-confirm]").checked=true;window.testStates=[];window.testEvents=0;new MutationObserver(()=>{const t=s.querySelector(".status").textContent;if(window.testStates.at(-1)!==t)window.testStates.push(t);}).observe(s.querySelector(".status"),{childList:true,subtree:true,characterData:true});window.addEventListener("message",e=>{if(e.data?.channel==="gl-fanatical-progress"||e.data?.type==="FANATICAL_IMPORT_PROGRESS"){window.testEvents++;window.testLatest=e.data;}});return true;');
    const started=Date.now(),message=await sync();const visible=await evaluate('return {states:window.testStates,events:window.testEvents};');const exported=await scanReport();assert(exported.progressEvents>0);assert(!/PRIVATE|SYNTHETIC|order-|product-|token/iu.test(JSON.stringify(exported)));if(scenario.name==='waiting')assert(visible.states.some(t=>/seconds elapsed.*pending/.test(t)));if(scenario.name==='slow')assert(visible.states.some(t=>/Reading purchase details/.test(t)));const d=await report();assert.equal(d.count,scenario.n-(scenario.fail?1:0));console.log('MEASURE '+JSON.stringify({scenario:scenario.name,elapsedMs:Date.now()-started,listingRequests:listRequests-beforeLists,detailRequests:detailRequests-beforeDetails,itemsSaved:d.count,...visible,writes:d.work}));
  }
  console.log('5 installed GL progress scenarios passed.');
}finally{driver?.close?.();child?.kill();if(exited)await exited;await new Promise(done=>server.close(done));const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-fanatical-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
