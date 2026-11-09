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
import {observeImportLifecycle} from './import-lifecycle.mjs';
import {candidateFiles} from './provider-candidate-build.mjs';
const firefox=process.argv.includes('--firefox'),release=await createRelease(undefined,undefined,firefox?'firefox':'chrome');
const files=process.argv.includes('--candidate')?await candidateFiles('GL',release.files):new Map(release.files);
let orders=[fanaticalOrder()],total=null,status=200,invalidListing=false,detailRequests=0,listRequests=0,pageSize=0,failPage=false,failedOrders=[],sparseSummary=false,sparseDetailFailure=false,foreignRecovery=false;
const thin=o=>({...o,items:o.items.map(p=>({name:p.name,bundles:[]}))});
const server=createServer((req,res)=>{
 if(req.url.startsWith('/api/user/orders')){
  const listing=/^\/api\/user\/orders(?:\?|$)/u.test(req.url),second=req.url.includes('?page=2');if(listing)listRequests++;else detailRequests++;
  res.statusCode=status===200&&(listing&&second&&failPage||!listing&&failedOrders.some(id=>req.url.endsWith(id)))?404:status;
  res.setHeader('Content-Type','application/json');if(listing&&total!==null)res.setHeader('x-total-count',String(total));
  if(listing&&pageSize&&!second)res.setHeader('link','</api/user/orders?page=2>; rel="next"');
  let payload=listing&&invalidListing?{unexpected:true}:listing?(pageSize?second?orders.slice(pageSize):orders.slice(0,pageSize):orders):orders.find(o=>req.url.endsWith(o._id));
  if(sparseSummary&&Array.isArray(payload))payload=payload.map(o=>o._id===orders.at(-1)._id?thin(o):o);
  if(!listing&&payload?._id===orders.at(-1)?._id){if(sparseDetailFailure)payload=thin(payload);if(foreignRecovery)payload={...payload,_id:'foreign-order'};}
  res.end(JSON.stringify(payload));return;
 }
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic orders</main><script>localStorage.setItem("bsauth",JSON.stringify({token:"SYNTHETIC-ONLY"}));</script></body></html>');
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
// Test-only origin substitution, never shipping permissions or application guards.
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(p=>p==='https://www.fanatical.com/*'?'http://127.0.0.1/*':p);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
files.set('src/background/service-worker.js',Buffer.from(files.get('src/background/service-worker.js').toString().replaceAll('https://www.fanatical.com',origin).replace('async function notifyVideoDiagnostics(){',`let fanaticalTestReject='',fanaticalTestWrites=0;const fanaticalTestSet=privateArea.set.bind(privateArea);privateArea.set=async patch=>{if(fanaticalTestReject&&patch.galacticLibraryDatabase)throw Error(fanaticalTestReject+' FAKE_TOKEN FAKE_ACCOUNT FAKE_ORDER FAKE_TITLE https://private.invalid FAKE_STACK');await fanaticalTestSet(patch);if(patch.galacticLibraryDatabase)fanaticalTestWrites++;};chrome.runtime.onMessage.addListener((r,s,reply)=>{if(r?.type==='GL_TEST_FANATICAL_STORAGE'){if(typeof r.reject==='string')fanaticalTestReject=r.reject;reply({writes:fanaticalTestWrites});return false;}});async function notifyVideoDiagnostics(){`)));
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
    const lifecycle=await evaluate(`const s=${root};return (${observeImportLifecycle.toString()})({button:s.querySelector('[data-mode="${mode}"]'),status:s.querySelector('.status')});`);
    assert(['succeeded','failed'].includes(lifecycle.state),'Import lifecycle: '+JSON.stringify(lifecycle));
    assert(lifecycle.started,'A scan that never started cannot satisfy this test');
    return lifecycle.message;
  }
  async function report(){await navigate(reportUrl);return JSON.parse(await wait('return document.documentElement?.dataset.result;','No saved report'));}
  async function scanReport(){await wait(`return ${root}.querySelector('[data-export-scan]').closest('details').hidden===false;`,'Diagnostic control not visible');await evaluate(`const s=${root};s.querySelector('[data-export-scan]').closest('details').open=true;s.querySelector('[data-export-scan]').click();return true;`);return JSON.parse(await wait('return document.documentElement.dataset.testScanExport;','No aggregate scan report'));}
  const checks=[];
  await page();const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
  const controls=await evaluate(`const s=${root},status=document.createElement('p'),button=document.createElement('button');s.append(status,button);
    const observe=${observeImportLifecycle.toString()};const idle=await observe({button,status,timeoutMs:50});
    button.onclick=()=>{status.dataset.busy='true';};const hung=await observe({button,status,timeoutMs:50});
    delete status.dataset.busy;button.disabled=true;const disabled=await observe({button,status,timeoutMs:50});status.remove();button.remove();return {idle,hung,disabled};`);
  assert.equal(controls.idle.state,'timed-out');assert.equal(controls.idle.started,false);assert.equal(controls.idle.reason,'import-not-started');
  assert.equal(controls.hung.state,'timed-out');assert.equal(controls.hung.started,true);assert.equal(controls.hung.reason,'completion-not-observed');
  assert.equal(controls.disabled.state,'not-started');
  checks.push('lifecycle negative controls reject no-op clicks, hung imports and disabled buttons');
  await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Synthetic';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;return true;`);
  const message=await sync();assert(!/failed|incomplete|truncation|could not|warning/i.test(message),message);
  let d=await report();assert(!d.error,d.error);assert.equal(d.count,47);assert.equal(d.owned,47);assert.equal(d.history,0);assert.equal(d.fullAt,null);assert(d.acquisitionAt);assert.equal(d.health,'succeeded');assert(d.comparisonOwned&&d.roundTrip);
  checks.push('headerless 47 supported products: owned, comparison-visible, successful, no false Full timestamp');
  await page();const detailsBefore=detailRequests,listsBefore=listRequests;const quickMessage=await sync('incremental');assert(!/failed|incomplete/i.test(quickMessage),quickMessage);assert.equal(detailRequests,detailsBefore);assert.equal(listRequests,listsBefore+1);
  checks.push('page reload remembers account and Quick reads one list, zero details without confirmation');
  orders=[fanaticalOrder(1),fanaticalOrder(2)];assert(!/failed/i.test(await sync()));d=await report();assert.equal(d.count,94);
  await page();orders=[fanaticalOrder(1)];assert(!/failed/i.test(await sync()));d=await report();assert.equal(d.count,94);assert.equal(d.fingerprints.length,2);assert.equal(d.history,0);
  checks.push('headerless subset preserves absent active ownership and verified skip evidence');
  await page();status=401;assert(/failed/i.test(await sync()));status=200;d=await report();assert.equal(d.count,94);assert.equal(d.history,0);
  await navigate(reportUrl+'?enableDiagnostics=1');await wait('return document.documentElement?.dataset.result;','Diagnostics setting not enabled');await page();status=403;const denied=await sync();assert(/Sign in to Fanatical/.test(denied),denied);let diagnostic=await scanReport();assert.equal(diagnostic.diagnostic.category,'authentication');assert.equal(diagnostic.diagnostic.stage,'initial-listing');assert.equal(diagnostic.saveAttempted,false);assert.equal(diagnostic.committed,false);assert(!/FAKE_|SYNTHETIC-ONLY|order-000|product-|https?:/.test(JSON.stringify(diagnostic)));status=200;
  checks.push('genuine authorization failure preserves records and exported category contains no private data');
  invalidListing=true;const malformed=await sync();assert(/unrecognized purchase list/.test(malformed),malformed);diagnostic=await scanReport();assert.equal(diagnostic.diagnostic.category,'shape');assert.equal(diagnostic.committed,false);invalidListing=false;
  checks.push('installed MAIN controlled shape failure reaches worker and ordinary UI without save');
  await evaluate("Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:async()=>{throw Error('FAKE_TOKEN FAKE_ACCOUNT FAKE_ORDER FAKE_TITLE https://private.invalid FAKE_STACK');}});return true;");
  const unexpected=await sync();assert(/stopped unexpectedly/.test(unexpected),unexpected);diagnostic=await scanReport();assert.equal(diagnostic.diagnostic.category,'unknown');assert.equal(diagnostic.diagnostic.stage,'summaries');assert(!diagnostic.saveAttempted&&!diagnostic.committed);assert(!/FAKE_|private.invalid/.test(JSON.stringify(diagnostic)+unexpected));
  checks.push('actual unexpected MAIN exception returns a private bounded unknown envelope and preserves purchases');
  await navigate(reportUrl+'?boundary=1');const boundary=JSON.parse(await wait('return document.documentElement?.dataset.result;','No MAIN boundary result')).boundary;
  if(!firefox){assert(boundary.resolved&&boundary.resultNull,JSON.stringify(boundary));}else assert(boundary.hasError||boundary.resultNull||!boundary.resolved,JSON.stringify(boundary));
  console.log('MAIN boundary '+JSON.stringify({browser:firefox?'Firefox':'Chrome',...boundary}));checks.push('actual uncontrolled async MAIN throw independently observed');
  await page();
  await page();total=1;assert(!/failed/i.test(await sync()));d=await report();assert.equal(d.count,47);assert.equal(d.history,47);assert(d.fullAt);const at=d.fullAt;
  await page();total=null;orders=[];assert(!/failed|incomplete/i.test(await sync()));d=await report();assert.equal(d.count,47);assert.equal(d.history,47);assert.equal(d.fullAt,at);
  checks.push('explicit coverage keeps existing reconciliation; empty headerless Full preserves history and complete timestamp');
  await page();assert(!/failed/i.test(await sync('incremental')));d=await report();assert.equal(d.count,47);assert.equal(d.owned,47);assert.equal(d.health,'succeeded');
  checks.push('persisted acquisition checkpoint and comparison visibility survive repeated reloads');
  async function reset(){await navigate(reportUrl+'?reset=1&enableDiagnostics=1');await wait('return document.documentElement?.dataset.result;','Reset did not finish');await page();await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Synthetic';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;return true;`);}
  total=null;orders=Array.from({length:500},(_,i)=>fanaticalOrder(i+1,['book']));failedOrders=[orders[499]._id];await reset();
  let partialMessage=await sync();assert(/Saved 499 Fanatical purchases/.test(partialMessage),partialMessage);assert(!/import failed|repeat.*full/i.test(partialMessage));d=await report();assert.equal(d.count,499);assert.equal(d.failed.length,1);assert.equal(d.fullAt,null);assert(d.acquisitionAt&&d.comparisonOwned&&d.roundTrip);
  await page();failedOrders=[orders[499]._id];await sync();diagnostic=await scanReport();assert(diagnostic.saveAttempted&&diagnostic.committed);assert.equal(diagnostic.persistence,'committed');assert.equal(diagnostic.diagnostic.ordersUnresolved,1);assert.equal(diagnostic.diagnostic.category,'detail');
  checks.push('initial 499/500 persists 499 owned orders with partial status and no fabricated Full');
  if(firefox){driver.close();child.kill();}else await driver.send('Browser.close');await exited;driver.close?.();await startBrowser();d=await report();assert.equal(d.count,499);assert.equal(d.failed.length,1);assert(d.roundTrip);checks.push('browser restart retains persisted purchases, retry state and valid backup');
  failedOrders=[];await page();let beforeDetails=detailRequests;assert(!/failed/i.test(await sync('incremental')));assert.equal(detailRequests-beforeDetails,1);d=await report();assert.equal(d.count,500);assert.equal(d.failed.length,0);
  checks.push('reload preserves failed-order state; Quick retrieves exactly one missing detail');
  const rawBefore=d.digest,writesBefore=d.work.writes;await page();beforeDetails=detailRequests;const beforeLists=listRequests;assert(!/failed/i.test(await sync('incremental')));assert.equal(detailRequests,beforeDetails);assert.equal(listRequests-beforeLists,1);d=await report();assert.equal(d.digest,rawBefore);assert.equal(d.work.writes,writesBefore);
  checks.push('unchanged Quick uses one list, zero details and no catalog rewrite');
  pageSize=499;failPage=true;await reset();partialMessage=await sync();assert(/Some purchase history could not be checked/.test(partialMessage),partialMessage);assert(!/1 purchase couldn't/.test(partialMessage));d=await report();assert.equal(d.count,499);assert(d.listingIncomplete);assert.equal(d.failed.length,0);assert.equal(d.fullAt,null);
  checks.push('failed later page saves 499 earlier orders without inventing a missing-purchase count');
  failPage=false;await page();beforeDetails=detailRequests;let lists=listRequests;assert(!/failed/i.test(await sync('incremental')));assert.equal(listRequests-lists,2);assert.equal(detailRequests-beforeDetails,1);d=await report();assert.equal(d.count,500);assert(!d.listingIncomplete);
  checks.push('page recovery rereads two listing pages and only the one missing detail');
  pageSize=2;failPage=true;orders=orders.slice(0,3);failedOrders=[orders[1]._id];await reset();partialMessage=await sync();d=await report();assert.equal(d.count,1);assert(d.listingIncomplete&&d.failed.length===1);
  failPage=false;failedOrders=[];await page();beforeDetails=detailRequests;assert(!/failed/i.test(await sync('incremental')));assert.equal(detailRequests-beforeDetails,2);d=await report();assert.equal(d.count,3);
  checks.push('mixed page and detail failures recover both missing orders without duplicates');
  pageSize=0;orders=orders.slice(0,2);total=2;await page();assert(!/failed/i.test(await sync()));d=await report();assert.equal(d.count,2);assert.equal(d.history,1);assert(d.fullAt);
  checks.push('only later complete Full reconciles absent records after partial recovery');
  const preserved=d;orders.push(fanaticalOrder(3,['book']));total=3;
  for(const reason of ['Quota exceeded','Disk write rejected']){
    await navigate(reportUrl+'?reject='+encodeURIComponent(reason));await wait('return document.documentElement?.dataset.result;','No storage rejection setup');await page();const failed=await sync();assert(/could not confirm/.test(failed),failed);diagnostic=await scanReport();assert(diagnostic.saveAttempted&&!diagnostic.committed);assert.equal(diagnostic.persistence,'unconfirmed');assert(!/FAKE_|private.invalid/.test(JSON.stringify(diagnostic)+failed));d=await report();assert.equal(d.count,preserved.count);assert.equal(d.history,preserved.history);assert.deepEqual(d.fingerprints,preserved.fingerprints);
  }
  await navigate(reportUrl+'?reject=');await wait('return document.documentElement?.dataset.result;','Storage rejection not cleared');await page();assert(!/failed/.test(await sync('incremental')));d=await report();assert.equal(d.count,3);checks.push('installed quota/disk failures preserve purchases and retry state; UI/export never claim a save or leak raw errors; retry succeeds');
  // Reproduce a C-like acquisition through the real MAIN -> worker -> writer.
  const rejected=fanaticalOrder(3,['book']);rejected.items[0].bundles={games:[{_id:'PRIVATE_ID',name:'PRIVATE_TITLE'}]};
  total=null;orders=[fanaticalOrder(1,['book']),{...fanaticalOrder(2,['book']),status:'UNKNOWN_STATUS'},rejected];await reset();await sync();diagnostic=await scanReport();
  assert.equal(diagnostic.diagnostic.compatibility.counts.unsupportedStatus,1);assert.equal(diagnostic.diagnostic.compatibility.counts.invalidBundles,1);assert.equal(diagnostic.diagnostic.compatibility.counts.scheduled,1);const shape=diagnostic.diagnostic.compatibility.bundleShapes.records[0];assert.equal(shape.reason,'non-array');assert.equal(shape.bundlesType,'object');assert.equal(shape.bundleGames,'array');assert(!/PRIVATE/.test(JSON.stringify(diagnostic)));d=await report();assert.equal(d.count,1);assert.equal(d.failed.length,2);assert.equal(d.fullAt,null);
  await page();beforeDetails=detailRequests;await sync('incremental');assert.equal(detailRequests,beforeDetails);diagnostic=await scanReport();assert.equal(diagnostic.diagnostic.compatibility.counts.knownSkipped,1);assert.equal(diagnostic.diagnostic.compatibility.counts.scheduled,0);assert(!/UNKNOWN_STATUS|order-000|product-/.test(JSON.stringify(diagnostic)));
  orders=[1,2,3].map(i=>fanaticalOrder(i,['book']));await page();await sync('incremental');assert.equal(detailRequests-beforeDetails,2);d=await report();assert.equal(d.count,3);assert.equal(d.failed.length,0);assert.equal(d.history,0);assert(d.roundTrip);
  checks.push('installed mixed summary failures export safe reasons; unchanged Quick skips only verified orders and repairs unresolved orders after reload');
  orders.push(Object.fromEntries(Object.entries(orders[0]).reverse()));await page();beforeDetails=detailRequests;await sync('incremental');assert.equal(detailRequests,beforeDetails);diagnostic=await scanReport();assert.equal(diagnostic.diagnostic.compatibility.counts.summaryConflict,0);assert.equal(diagnostic.diagnostic.compatibility.counts.knownSkipped,3);d=await report();assert.equal(d.count,3);assert.equal(d.failed.length,0);assert.equal(d.history,0);assert.equal(d.fullAt,null);
  checks.push('installed reordered identical summaries retain skip authority and purchases without granting complete coverage');
  orders=[fanaticalOrder(1),fanaticalOrder(2,['game'])];sparseSummary=true;sparseDetailFailure=true;await reset();await sync();diagnostic=await scanReport();assert.equal(diagnostic.diagnostic.compatibility.summaryRecovery.unresolved,1);assert.equal(diagnostic.diagnostic.compatibility.summaryRecovery.recovered,0);assert(diagnostic.diagnostic.compatibility.bundleShapes.records.some(r=>r.stage==='details'&&r.reason==='invalidBundles'));d=await report();assert.equal(d.count,47);assert.equal(d.failed.length,1);assert.equal(d.fullAt,null);
  sparseDetailFailure=false;await page();beforeDetails=detailRequests;await sync('incremental');assert.equal(detailRequests-beforeDetails,1);diagnostic=await scanReport();assert.equal(diagnostic.diagnostic.compatibility.summaryRecovery.recovered,1);assert.equal(diagnostic.diagnostic.compatibility.summaryRecovery.detailItemTypes.array,1);assert(!/order-|product-|Synthetic collection|PRIVATE/.test(JSON.stringify(diagnostic.diagnostic.compatibility)));d=await report();assert.equal(d.count,48);assert.equal(d.owned,48);assert.equal(d.failed.length,0);assert.equal(d.history,0);assert.equal(d.fullAt,null);assert(d.roundTrip);
  await page();beforeDetails=detailRequests;await sync('incremental');assert.equal(detailRequests-beforeDetails,1);d=await report();assert.equal(d.count,48);assert.equal(d.history,0);
  foreignRecovery=true;await page();await sync();diagnostic=await scanReport();assert(!diagnostic.committed);d=await report();assert.equal(d.count,48);assert.equal(d.owned,48);assert.equal(d.history,0);
  checks.push('installed sparse summary recovers 47+1 products through validated detail, retries after reload, rechecks known Quick and rejects foreign detail without altering purchases');
  sparseSummary=false;foreignRecovery=false;sparseDetailFailure=false;
  const direct={_id:'order-direct-games',status:'COMPLETE',date:'2026-11-01',items:Array.from({length:10},(_,i)=>({_id:'direct-game-'+i,name:'Selected '+i,type:'game',bundles:[],pickAndMix:'Synthetic pick and mix',drm:{steam:true}}))};
  orders=[fanaticalOrder(1),direct];await reset();await sync();d=await report();assert.equal(d.count,57);assert.equal(d.owned,57);assert.equal(d.history,0);assert.equal(d.failed.length,0);assert.equal(d.fullAt,null);assert(d.roundTrip);
  await page();beforeDetails=detailRequests;await sync('incremental');assert.equal(detailRequests,beforeDetails);d=await report();assert.equal(d.count,57);
  sparseDetailFailure=true;await page();await sync();d=await report();assert.equal(d.count,57);assert.equal(d.owned,57);assert.equal(d.failed.length,1);assert.equal(d.history,0);
  sparseDetailFailure=false;await page();beforeDetails=detailRequests;await sync('incremental');assert.equal(detailRequests-beforeDetails,1);d=await report();assert.equal(d.count,57);assert.equal(d.failed.length,0);assert(d.roundTrip);
  checks.push('direct pick-and-mix purchase saves 47 comics plus 10 games, skips verified Quick details and preserves all purchases during detail failure/retry without complete coverage');
  for(const check of checks)console.log('PASS installed '+(firefox?'Firefox':'Chrome')+' Fanatical: '+check);
  console.log(checks.length+' installed Fanatical checks passed.');
}finally{
  driver?.close?.();child?.kill();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-fanatical-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
