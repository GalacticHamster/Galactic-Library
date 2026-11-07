// Installed extension, synthetic GOG/Epic responses and disposable profiles only.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
const provider=process.argv.includes('--gog')?'gog':'epic';
const firefox=process.argv.includes('--firefox'),release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic provider library</main></body></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>pattern===(provider==='gog'?'https://www.gog.com/*':'https://store.epicgames.com/*')?'http://127.0.0.1/*':pattern);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
for(const path of ['src/background/service-worker.js','src/background/epic-auth-diagnostics.js'])files.set(path,Buffer.from(files.get(path).toString().replaceAll(provider==='gog'?'https://www.gog.com':'https://store.epicgames.com',origin)));
const scale=process.argv.includes('--epic-scale'),baseline=process.argv.includes('--baseline');
if(scale){
 const instrumentation=`
globalThis.epicMetrics={reads:0,catalogWrites:0,metadataWrites:0,bytes:0,serializationMs:0,storageMs:0,readMs:0,transactions:{},phases:{}};
const originalTransaction=globalThis.IDBDatabase?.prototype.transaction;
if(originalTransaction)globalThis.IDBDatabase.prototype.transaction=function(stores,mode,...args){const m=globalThis.epicMetrics;m.transactions[mode??'readonly']=(m.transactions[mode??'readonly']??0)+1;return originalTransaction.call(this,stores,mode,...args);};
for(const name of ['get','set']){const original=privateArea[name].bind(privateArea);privateArea[name]=async function(v){const m=globalThis.epicMetrics,start=performance.now();if(name==='set'){if(globalThis.rejectEpicSave&&v.galacticLibraryDatabase)throw Error('Synthetic disk rejection');if(v.galacticLibraryDatabase){m.catalogWrites++;const a=performance.now();m.bytes+=new TextEncoder().encode(JSON.stringify(v.galacticLibraryDatabase)).length;m.serializationMs+=performance.now()-a;}else m.metadataWrites++;}else m.reads++;try{return await original(v);}finally{m[name==='set'?'storageMs':'readMs']+=performance.now()-start;}};}
chrome.runtime.onMessage.addListener((r,_s,reply)=>{if(r.type==='TEST_EPIC_METRICS'){reply(structuredClone(globalThis.epicMetrics));return false;}if(r.type==='TEST_EPIC_REJECT'){globalThis.rejectEpicSave=r.value;reply(true);return false;}});
`;
 const worker='src/background/service-worker.js';files.set(worker,Buffer.from(files.get(worker).toString().replace('const storageWriter =',instrumentation+'\nconst storageWriter =')));
 const writer='src/background/storage-writer.js';let source=files.get(writer).toString();
 for(const [name,async]of [['timed',false],['timedAsync',true]])source=source.replace(`const ${name} = (stage, work) => {`,`const ${name} = (stage, work) => { const original=work;work=${async?'async ':''}()=>{const at=performance.now();try{return ${async?'await ':''}original();}finally{const p=globalThis.epicMetrics.phases;p[stage]=(p[stage]??0)+performance.now()-at;}};`);
 files.set(writer,Buffer.from(source));
}
const fixture=`
const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'});};
globalThis.fixtureRequests=0;
globalThis.fetch=async(url,options)=>{
 globalThis.fixtureRequests++;document.documentElement.dataset.fixtureRequests=String(globalThis.fixtureRequests);
 const gog=${JSON.stringify(provider)}==='gog',partial=location.search.includes('partial'),auth=location.search.includes('auth'),broken=location.search.includes('broken'),malformed=location.search.includes('malformed'),duplicate=location.search.includes('duplicate');
 if(gog&&location.search.includes('server'))return {ok:false,status:503};
 const index=gog?Number(new URL(url,location.href).searchParams.get('page'))-1:Number(JSON.parse(options.body).variables.cursor||0);
 if(index===1&&(partial||auth))return {ok:false,status:auth?401:503};
 const ids=index===0?Array.from({length:499},(_,i)=>String(i+1)):['500'];
 if(duplicate&&index===1)ids.push('1');
 let data=gog?{products:ids.map(id=>({id,title:'Synthetic recovery game '+id})),totalPages:2,totalProducts:500}:{data:{Library:{libraryItems:{records:ids.map(id=>({catalogItemId:id,namespace:'store',catalogItem:{id,title:'Synthetic recovery game '+id}})),responseMetadata:{nextCursor:index===0?'1':null}}}}};
 if(malformed&&index===1){if(gog)data.products=[{id:'500'}];else data.data.Library.libraryItems.records=[{catalogItemId:'500'}];}
 if(broken&&index===1)data={unreadable:true};
 return {ok:true,status:200,json:async()=>data};
};
`;
const scaleFixture=`
const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return attach.call(this,{...o,mode:'open'});};
globalThis.fixtureRequests=0;globalThis.acquisitionStarted=null;globalThis.acquisitionFinished=null;
globalThis.fetch=async(_url,options)=>{
 globalThis.acquisitionStarted??=performance.now();globalThis.fixtureRequests++;
 const scenario=new URL(location.href).searchParams.get('scenario'),index=Number(JSON.parse(options.body).variables.cursor??0),extra=['rejected','recovered'].includes(scenario)?4:['plus3','duplicate'].includes(scenario)?3:0;
 if(index===5&&scenario==='partial')return {ok:false,status:503};
 if(index===5&&scenario==='network')throw Error('Synthetic network interruption');
 if(index===1&&scenario==='addonpartial')return {ok:false,status:503};
 if(index===1&&scenario==='auth')return {ok:true,status:200,json:async()=>({errors:[{extensions:{code:'UNAUTHENTICATED'}}]})};
 if(index===1&&scenario==='broken')return {ok:true,status:200,json:async()=>({data:{}})};
 const ids=scenario==='addonpartial'?[547]:scenario==='single'?Array.from({length:572},(_,i)=>i+1):scenario==='pagebound'?[index+1]:scenario==='emptyterminal'&&index===6?[]:Array.from({length:index<5?100:69+extra},(_,i)=>index*100+i+1);
 if(index===5&&['duplicate','conflict'].includes(scenario))ids.push(1);
 const records=ids.map((id,j)=>({namespace:'store',catalogItemId:String(id),catalogItem:{id:String(id),title:scenario==='conflict'&&index===5&&j===ids.length-1?'Conflicting title':'Synthetic Epic '+id,...(id>546&&id<=569?{mainGameItem:{id:'1'}}:{})}}));
 if(index===5&&scenario==='malformed')records.push({catalogItemId:'missing-title'});
 const nextCursor=scenario==='single'?null:scenario==='pagebound'?String(index+1):scenario==='emptyterminal'?index===6?null:String(index+1):index<5?String(index+1):scenario==='loop'?'5':scenario==='badcursor'?0:scenario==='emptycursor'?'':null;
 return {ok:true,status:200,json:async()=>{globalThis.acquisitionFinished=performance.now();return {data:{Library:{libraryItems:{records,responseMetadata:{nextCursor}}}}};}};
};
`;
files.set(`src/providers/${provider}.js`,Buffer.from((scale?scaleFixture:fixture)+files.get(`src/providers/${provider}.js`).toString()));
files.set(`src/providers/${provider}-content.js`,Buffer.from(files.get(`src/providers/${provider}-content.js`).toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
if(scale){const path=`src/providers/${provider}-content.js`;files.set(path,Buffer.from(files.get(path).toString()+`
new MutationObserver(()=>{document.documentElement.dataset.epicMeasurement=JSON.stringify({diagnostics:globalThis.GalacticEpic.getDiagnostics(),acquisitionMs:globalThis.acquisitionFinished-globalThis.acquisitionStarted,postAcquisitionMs:performance.now()-globalThis.acquisitionFinished});}).observe(document.querySelector('#galactic-library-epic-importer').shadowRoot.querySelector('.status'),{childList:true,attributes:true});
`));}
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`
import {createStorageClient,createBackup,parseBackup} from './src/lib/storage.js';
import {effectiveOwnershipRecord} from './src/lib/ownership.js';
try{
 const client=createStorageClient(request=>chrome.runtime.sendMessage(request));
 if(${scale}&&location.search==='?seed')await client.mergeProviderItems('steam',[{providerItemId:'42',title:'Unrelated synthetic game',mediaType:'game',ownership:'owned'}]);
 if(location.search.startsWith('?reject='))await chrome.runtime.sendMessage({type:'TEST_EPIC_REJECT',value:location.search==='?reject=1'});
 let d=await client.getDatabase();
 const provider=${JSON.stringify(provider)},items=Object.values(d.providerItems),selected=items.filter(i=>i.provider===provider);
 const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
 const metrics=await chrome.runtime.sendMessage({type:'TEST_EPIC_METRICS'});const raw=await chrome.storage.local.get(null);
 const catalog=Object.fromEntries(Object.entries(raw).filter(([key])=>key.includes('Database')||key==='galacticLibraryDatabase'));
 document.documentElement.dataset.result=JSON.stringify({metrics,unrelated:stable(items.filter(i=>i.provider!==provider)),history:stable(d.providerHistory),titles:selected.map(i=>i.title).sort(),games:selected.filter(i=>i.mediaType==='game').length,addons:selected.filter(i=>i.mediaType==='game-addon').length,health:d.providers[provider]?.syncHealth,records:items.length,count:selected.length,refs:selected.map(i=>i.recordRef).sort(),owned:selected.filter(i=>effectiveOwnershipRecord(i,d).ownership==='owned').length,fullAt:d.providers[provider]?.fullSyncAt??null,state:d.providers[provider]?.syncState,roundTrip:stable(parseBackup(createBackup(d)))===stable(d),catalog:JSON.stringify(catalog)});
}catch(error){document.documentElement.dataset.result=JSON.stringify({error:error.message});}
`));
const temporary=await mkdtemp(join(tmpdir(),'gl-gog-epic-native-'));let child,driver,session,exited;const shutdowns=[];
async function stopBrowser(){
  // Let the owned browser flush its profile. Wait for process exit, not a
  // Marionette Quit reply, which may be lost when its connection closes.
  let command,error,timer;const start=performance.now(),timeout=scale?15000:5000;
  if(child&&child.exitCode===null&&child.signalCode===null){
    if(firefox&&scale){
      // Exercise Firefox's normal application shutdown. Large fixtures can
      // leave Marionette:Quit without a process exit in this test environment.
      await driver.send('Marionette:SetContext',{value:'chrome'});
      command=driver.send('WebDriver:ExecuteScript',{script:'window.setTimeout(()=>Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit),0);return true;',args:[],newSandbox:true}).catch(e=>{error=e;});
    }else command=driver.send(firefox?'Marionette:Quit':'Browser.close',firefox?{flags:['eForceQuit']}:{}).catch(e=>{error=e;});
  }
  try{
    if(exited)await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Test browser did not exit within '+timeout+' milliseconds.')),timeout);})]);
  }catch(e){child?.kill();throw e;}
  finally{clearTimeout(timer);driver?.close?.();shutdowns.push(performance.now()-start);}
  await command;
  if(error&&!/Firefox connection closed|Chrome exited|ECONNRESET/u.test(error.message))throw error;
}
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  async function startBrowser(){
  const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  child.stdout?.resume();child.stderr?.resume();
  exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox){await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});const archive=join(temporary,'extension.zip');await writeFile(archive,runtimeZip(files));await driver.send('Addon:Install',{path:archive,temporary:true});
    await driver.send('Marionette:SetContext',{value:'chrome'});
    const granted=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");ExtensionPermissions.add(arguments[0],{permissions:[],origins:["http://127.0.0.1/*"]},WebExtensionPolicy.getByID(arguments[0]).extension).then(()=>done(true),error=>done({error:error.message}));',args:['galactic-library@galactichamster.com'],newSandbox:true});assert.equal(granted.value??granted,true);
    await driver.send('Marionette:SetContext',{value:'content'});
  }else await driver.send('Extensions.loadUnpacked',{path:stage});
  }
  await startBrowser();
  async function evaluate(script){
    if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],newSandbox:false});const value=Object.hasOwn(r,'value')?r.value:r;assert(!value?.error,value?.error);return value;}
    const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  async function navigate(url){if(firefox)await driver.send('WebDriver:Navigate',{url});else{const t=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);}}
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-epic-importer")?.shadowRoot?.querySelector(".status")?.textContent};');throw Error(message+' '+JSON.stringify(state));}
  const root=`document.querySelector("#galactic-library-${provider}-importer").shadowRoot`;
  const ready=()=>wait(`return !!document.querySelector("#galactic-library-${provider}-importer")?.shadowRoot?.querySelector("[data-profile-label]");`,'Provider panel unavailable');
  const sync=async(mode='full')=>{const selector=provider==='gog'?`button[data-mode="${mode}"]`:'[data-import-action]';await evaluate(`const s=${root};s.querySelector(${JSON.stringify(selector)}).click();return true;`);await wait(`const s=${root};return !s.querySelector('.status').dataset.busy;`,'Sync did not finish');return evaluate(`return ${root}.querySelector('.status').textContent;`);};
  const read=async(url)=>{await navigate(url);return JSON.parse(await wait('return document.documentElement?.dataset.result;','Database report unavailable'));};
  const open=async(query)=>{await navigate(origin+'/account'+query);await ready();};
  if(scale){
   const results=[];
   await open('?scenario=normal');
   await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Synthetic';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;return true;`);
   const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
   let previous=await read(reportUrl+'?seed');const unrelated=previous.unrelated;
   for(const scenario of ['normal','plus3','plus3','duplicate','duplicate','loop','loop','partial','normal','malformed','conflict','auth','broken','rejected','recovered',...(!baseline?['single','emptyterminal','emptycursor','badcursor','network','pagebound','addonpartial']:[])]){
    if(scenario==='rejected')await read(reportUrl+'?reject=1');
    await open('?scenario='+scenario);const start=performance.now(),status=await sync(),totalMs=performance.now()-start;
    const page=JSON.parse(await evaluate('return document.documentElement.dataset.epicMeasurement;'));
    const next=await read(reportUrl);assert(!next.error,next.error);assert(next.roundTrip);assert.equal(next.addons,23);assert(next.games>=546);assert.equal(next.owned,next.count);
    assert.equal(next.unrelated,unrelated);if(!baseline)assert.equal(next.history,'{}');
    const counts=Object.fromEntries(['catalogWrites','metadataWrites','bytes','storageMs','readMs','serializationMs'].map(k=>[k,next.metrics[k]-previous.metrics[k]]));
    const transactions=Object.fromEntries(Object.keys(next.metrics.transactions).map(k=>[k,next.metrics.transactions[k]-(previous.metrics.transactions[k]??0)]));
    const phases=Object.fromEntries(Object.keys(next.metrics.phases).map(k=>[k,next.metrics.phases[k]-(previous.metrics.phases[k]??0)]));
    if(['loop','partial','malformed','conflict','badcursor','network','pagebound','addonpartial'].includes(scenario))assert.match(status,/Some library pages/);
    else if(['auth','broken','rejected'].includes(scenario))assert.match(status,/failed/);
    else if(scenario==='duplicate'&&baseline)assert.match(status,/Some library pages/);
    else {assert.match(status,/Sync complete/);assert.doesNotMatch(status,/could not be checked/);}
    if(scenario==='plus3'&&previous.games===549)assert.equal(counts.catalogWrites,0);
    if(!baseline&&scenario==='duplicate')assert.equal(counts.catalogWrites,0);
    if(scenario==='rejected'){assert.deepEqual(next.refs,previous.refs);assert.deepEqual(next.titles,previous.titles);assert.equal(counts.catalogWrites,0);assert.equal(page.diagnostics.saveState,'save-rejected');await read(reportUrl+'?reject=0');}
    if(scenario==='conflict'&&!baseline)assert(!next.titles.includes('Conflicting title'));
    if(scenario==='recovered')assert.equal(next.games,550);
    results.push({scenario,status,totalMs,...page,counts,transactions,phases,games:next.games,addons:next.addons});previous=next;
   }
   await stopBrowser();await startBrowser();await open('?scenario=normal');const reopened=await read(await evaluate('return document.documentElement.dataset.testReportUrl;'));assert.equal(reopened.count,previous.count);assert(reopened.roundTrip);
   console.log(JSON.stringify({browser:firefox?'firefox':'chrome',baseline,results,restart:true,shutdowns},null,2));
  }else{
  await open('?partial');
  await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Synthetic';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;return true;`);
  let status=await sync();assert.match(status,/Saved 499/);assert.equal(await evaluate('return document.documentElement.dataset.fixtureRequests;'),'2');
  let reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');
  let d=await read(reportUrl);assert.equal(d.error,undefined);assert.equal(d.count,499);assert.equal(d.owned,499);assert.equal(d.fullAt,null);assert(d.roundTrip);const refs=d.refs;
  console.log('PASS '+provider+' installed: initial 499/500 partial acquisition committed without full checkpoint; backup roundtrip');
  await stopBrowser();
  await startBrowser();
  if(provider==='gog'){
    await open('?server');reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');status=await sync();assert.match(status,/503.*Try again later/);assert.doesNotMatch(status,/Sign in|signed in/);assert.deepEqual((await read(reportUrl)).refs,refs);console.log('PASS gog installed: server503 gives retry-later guidance and preserves all saved records');
  }
  await open('?auth');reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');status=await sync();assert.match(status,/failed/);let failed=await read(reportUrl);assert.deepEqual(failed.refs,refs);assert.equal(failed.count,499);
  await open('?broken');status=await sync();assert.match(status,/failed/);failed=await read(reportUrl);assert.deepEqual(failed.refs,refs);
  console.log('PASS '+provider+' installed: later authentication and malformed top-level responses do not publish partial success');
  await open('');status=await sync(provider==='gog'?'incremental':'full');assert(!status.includes('failed'),status);assert.equal(await evaluate('return document.documentElement.dataset.fixtureRequests;'),'2');d=await read(reportUrl);assert.equal(d.count,500);assert.equal(d.owned,500);
  const catalogBeforeUnchanged=d.catalog;
  console.log('PASS '+provider+' installed: page reload and user retry recover missing record without duplicates');
  await open('');status=await sync(provider==='gog'?'incremental':'full');assert(!status.includes('failed'),status);assert.equal(await evaluate('return document.documentElement.dataset.fixtureRequests;'),provider==='gog'?'1':'2');d=await read(reportUrl);assert.equal(d.count,500);assert(d.roundTrip);assert.equal(d.catalog,catalogBeforeUnchanged,'Unchanged update rewrote the catalog');
  await open('?malformed');status=await sync();assert.match(status,/Saved 500/);d=await read(reportUrl);assert.equal(d.count,500);assert.equal(d.owned,500);
  console.log('PASS '+provider+' installed: unchanged request efficiency, individual-item isolation and active omission preservation');
  await open('');status=await sync();assert(!status.includes('failed'),status);d=await read(reportUrl);assert.equal(d.count,500);assert(d.fullAt);assert(d.roundTrip);
  console.log('PASS '+provider+' installed: later clean Full establishes existing reconciliation authority and persistence');
  }
}catch(error){console.error('Installed provider test failed before cleanup:',error);throw error;}finally{
  await stopBrowser();await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-gog-epic-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
