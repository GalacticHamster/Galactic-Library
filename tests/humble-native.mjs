// Installed production acquisition/worker/writer, synthetic localhost data only.
// Run: node tests/humble-native.mjs [--firefox]
import assert from 'node:assert/strict';
import {humbleOrder,humbleDetail} from './humble-recovery.js';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
const firefox=process.argv.includes('--firefox'),release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
let orders=Array.from({length:500},(_,i)=>humbleOrder(i+1)),failures=['order-500'],status=200,detailRequests=0,listRequests=0;
const server=createServer((req,res)=>{
 if(req.url.startsWith('/api/v1/')){
  const listing=req.url==='/api/v1/user/order?all=true';if(listing)listRequests++;else detailRequests++;
  const id=listing?'':decodeURIComponent(req.url.match(/\/order\/([^?]+)/u)[1]);
  res.statusCode=status===200&&failures.includes(id)?500:status;res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(listing?orders:humbleDetail(id.replace('order-',''))));return;
 }
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic purchases</main></body></html>');
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
// Test-only origin substitution, never shipping permissions or application guards.
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(p=>p==='https://www.humblebundle.com/home/purchases*'?'http://127.0.0.1/*':p);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
files.set('src/background/service-worker.js',Buffer.from(files.get('src/background/service-worker.js').toString().replaceAll('https://www.humblebundle.com',origin)));
files.set('src/providers/humble.js',Buffer.from(files.get('src/providers/humble.js').toString().replace('const BETWEEN_PURCHASES_MS = 175;', 'const BETWEEN_PURCHASES_MS = 0;')));
files.set('src/providers/humble-content.js',Buffer.from('const originalAttach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return originalAttach.call(this,{...o,mode:"open"});};\n'+files.get('src/providers/humble-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`
import {createStorageClient,createBackup,parseBackup} from './src/lib/storage.js';
import {handleExternalApiRequest} from './src/lib/external-api.js';
try{const c=createStorageClient(r=>chrome.runtime.sendMessage(r));const db=await c.getDatabase(),items=Object.values(db.providerItems),state=db.providers.humble;
 const match=items.length?handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:items[0].title,mediaType:'book'}]}).results[0].owned:false;
 const backup=parseBackup(createBackup(db));document.documentElement.dataset.result=JSON.stringify({count:items.length,owned:items.filter(i=>i.ownership==='owned').length,history:Object.keys(db.providerHistory).length,fullAt:state.fullSyncAt??null,acquisitionAt:state.syncState?.acquisitionCheckedAt??null,known:state.syncState?.knownPurchaseIds??[],failed:state.syncState?.failedPurchaseIds??[],health:state.syncHealth?.status,comparisonOwned:match,roundTrip:Object.keys(backup.providerItems).length===items.length});
}catch(e){document.documentElement.dataset.result=JSON.stringify({error:e.message});}`));
const temporary=await mkdtemp(join(tmpdir(),'gl-humble-native-'));let child,driver,session,exited;
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,env:{...process.env,...(firefox?{MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'}:{})},stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox){await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});const archive=join(temporary,'extension.zip');await writeFile(archive,runtimeZip(files));await driver.send('Addon:Install',{path:archive,temporary:true});
    await driver.send('Marionette:SetContext',{value:'chrome'});
    const granted=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");ExtensionPermissions.add(arguments[0],{permissions:[],origins:["http://127.0.0.1/*"]},WebExtensionPolicy.getByID(arguments[0]).extension).then(()=>done(true),error=>done({error:error.message}));',args:['galactic-library@galactichamster.com'],newSandbox:true});assert.equal(granted.value??granted,true);
    await driver.send('Marionette:SetContext',{value:'content'});
  }else await driver.send('Extensions.loadUnpacked',{path:stage});
  async function evaluate(script){
    if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],newSandbox:false});const value=Object.hasOwn(r,'value')?r.value:r;assert(!value?.error,value?.error);return value;}
    const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  async function navigate(url){if(firefox)await driver.send('WebDriver:Navigate',{url});else{const t=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);}}
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-humble-importer")?.shadowRoot?.querySelector("[data-import-status]")?.textContent};');throw Error(message+' '+JSON.stringify(state));}

  const root='document.querySelector("#galactic-library-humble-importer").shadowRoot';
  const ready=()=>wait('return !!document.querySelector("#galactic-library-humble-importer")?.shadowRoot?.querySelector("[data-profile-label]");','Humble panel unavailable');
  async function page(){await navigate(origin+'/home/purchases');await ready();}
  async function sync(mode='full'){
    await evaluate(`const s=${root};s.querySelector('[data-mode="${mode}"]').click();return true;`);
    await wait(`return !${root}.querySelector('.status').dataset.busy;`,'Import did not finish');
    return evaluate(`return ${root}.querySelector('.status').textContent;`);
  }
  async function report(){await navigate(reportUrl);return JSON.parse(await wait('return document.documentElement?.dataset.result;','No saved report'));}
  const checks=[];
  await page();const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
  await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Synthetic';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;return true;`);
  let message=await sync();assert(/Saved 499 Humble purchases/.test(message),message);assert(!/import failed|repeat.*full/i.test(message),message);
  let d=await report();assert(!d.error,d.error);assert.equal(d.count,499);assert.equal(d.owned,499);assert.equal(d.fullAt,null);assert(d.acquisitionAt);assert.equal(d.failed.length,1);assert(d.comparisonOwned&&d.roundTrip);assert.equal(d.history,0);
  checks.push('first 499/500 persists 499 owned, comparison-visible purchases with useful partial status');
  await page();failures=[];let before=detailRequests;message=await sync('incremental');assert(!/failed/i.test(message),message);assert.equal(detailRequests-before,1);
  d=await report();assert.equal(d.count,500);assert.equal(d.failed.length,0);assert.equal(d.fullAt,null);
  checks.push('actual page reload retains partial checkpoint and Quick requests only the unresolved order');
  await page();before=detailRequests;assert(!/failed/i.test(await sync('incremental')));assert.equal(detailRequests,before);
  checks.push('unchanged Quick makes zero detail requests');
  assert(!/failed/i.test(await sync()));d=await report();assert.equal(d.count,500);assert(d.fullAt);const at=d.fullAt;
  checks.push('clean Full still stores all 500 and establishes reconciliation');
  await page();orders=Array.from({length:450},(_,i)=>humbleOrder(i+1));orders.push(humbleOrder(500));failures=['order-500'];assert(!/import failed/i.test(await sync()));d=await report();assert.equal(d.count,500);assert.equal(d.history,0);assert.equal(d.fullAt,at);
  checks.push('established partial omission preserves all old ownership and prior complete timestamp');
  await page();failures=[];orders=orders.slice(0,450);assert(!/failed/i.test(await sync()));d=await report();assert.equal(d.count,450);assert.equal(d.history,50);
  checks.push('later clean Full alone moves omitted purchases into history');
  await page();status=401;assert(/login has expired/.test(await sync()));status=200;d=await report();assert.equal(d.count,450);assert.equal(d.history,50);
  checks.push('explicit authentication failure keeps saved records and remains actionable');
  await page();orders=[];assert(!/failed/i.test(await sync()));d=await report();assert.equal(d.count,0);assert.equal(d.history,500);
  checks.push('valid empty purchase list completes through existing full reconciliation');
  for(const check of checks)console.log('PASS installed '+(firefox?'Firefox':'Chrome')+' Humble: '+check);
  console.log(checks.length+' installed Humble checks passed.');

}finally{
  if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-humble-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
