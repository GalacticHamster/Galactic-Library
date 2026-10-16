// Install the packaged GL runtime in disposable browsers. Only Nintendo's origin
// and a website-owned XHR source are replaced by synthetic localhost fixtures.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
const firefox=process.argv.includes('--firefox'),release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><div id="state" data-json=\'{"user":{"obfuscatedId":"synthetic-account"}}\'></div><button id="load" onclick="loadCards()">Load synthetic cards</button></body></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>pattern==='https://accounts.nintendo.com/portal/vgcs*'?'http://127.0.0.1/portal/vgcs*':pattern);
manifest.host_permissions.push('http://127.0.0.1/*');
files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
for(const path of ['src/providers/nintendo-capture.js','src/providers/nintendo-content.js','src/background/service-worker.js'])files.set(path,Buffer.from(files.get(path).toString().replaceAll("'https://accounts.nintendo.com'",JSON.stringify(origin))));
files.set('src/providers/nintendo-capture.js',Buffer.from(`
window.fixtureCount=115;window.fixtureActor='synthetic-account';window.fixtureStatus=200;window.fixtureRequests=0;
class WebsiteXHR {
  open(){} addEventListener(name,fn){this.loaded=fn;}
  send(){window.fixtureRequests++;queueMicrotask(()=>{this.status=window.fixtureStatus;this.responseType='json';this.response={data:{account:{vgc:{vgcViewsV2:{views:Array.from({length:window.fixtureCount},(_,i)=>({id:'synthetic-card-'+i,applicationId:'synthetic-app-'+i,applicationName:'Synthetic game '+i,apparentPlatform:'NX',ownerNaId:window.fixtureActor,userNaId:window.fixtureActor,isLending:false,isPartialLending:false,hasReleasedApplication:i<112,hasReleasedAddOnContents:i<13,hasReleasedUpgrade:false})),offsetInfo:{offset:0,total:window.fixtureCount}}}}}};this.loaded?.();});}
}
window.XMLHttpRequest=WebsiteXHR;
window.loadCards=()=>{document.querySelector('#state').setAttribute('data-json',JSON.stringify({user:{obfuscatedId:window.fixtureActor}}));const x=new XMLHttpRequest();x.open('POST','https://wb.lp1.savanna.srv.nintendo.net/graphql');x.send(JSON.stringify({operationName:'getVgcsVgcs',query:'query getVgcsVgcs { account { vgc { vgcViewsV2(isHidden: false) { views { id } } } } }',variables:{offset:0,limit:300,shopId:3,sortBy:'ACTIVATED_DATE',order:'ASC',idToken:'synthetic-not-a-credential'}}));};
`+files.get('src/providers/nintendo-capture.js').toString()));
files.set('src/providers/nintendo-content.js',Buffer.from("document.documentElement.dataset.testNintendoIsolated='started';\n"+files.get('src/providers/nintendo-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`
import {createBackup,parseBackup} from './src/lib/storage.js';
try {const r=await chrome.runtime.sendMessage({type:'LIBRARY_STORAGE_OPERATION',operation:'getDatabase',args:[]});if(!r.ok)throw Error(r.error);const d=r.result,items=Object.values(d.providerItems),p=d.providerProfiles[d.providers.nintendo.activeProfileId];
 const restored=parseBackup(createBackup(d));document.documentElement.dataset.result=JSON.stringify({records:items.length,owned:items.filter(i=>i.ownership==='owned').length,unknown:items.filter(i=>i.ownership==='unknown').length,refs:new Set(items.map(i=>i.recordRef)).size,history:Object.keys(d.providerHistory).length,source:items[0].metadata.source,binding:p.sourceAccountFingerprint.length,roundTrip:JSON.stringify(restored)===JSON.stringify(d),snapshot:d.providers.nintendo.snapshotValidation.itemCount});
}catch(error){document.documentElement.dataset.result=JSON.stringify({error:error.message});}`));
const temporary=await mkdtemp(join(tmpdir(),'gl-nintendo-native-'));let child,driver,session,exited;
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  const port=firefox?await freePort():0;if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
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
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-nintendo-importer")?.shadowRoot?.querySelector("[data-import-status]")?.textContent};');throw Error(message+' '+JSON.stringify(state));}
  await navigate(origin+'/portal/vgcs');await wait('return !!document.querySelector("#galactic-library-nintendo-importer")?.shadowRoot?.querySelector("[data-profile-label]");','Nintendo panel missing');
  const root='document.querySelector("#galactic-library-nintendo-importer").shadowRoot';
  await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Personal';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;s.querySelector('[data-mode]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode]').disabled&&/Reload|incomplete/.test(s.querySelector('[data-import-status]').textContent);`,'Unloaded cards were not rejected');
  await evaluate('loadCards();return true;');
  for(let attempt=0;attempt<2;attempt++){
    await evaluate(`const s=${root};s.querySelector('[data-mode]').click();return true;`);
    await wait(`const s=${root};return !s.querySelector('[data-mode]').disabled&&s.querySelector('[data-import-status]').textContent.includes('Imported 115 cards · 112 owned · 3 with unconfirmed access');`,'Complete import/reimport did not commit');
  }
  await evaluate('window.fixtureCount=114;loadCards();return true;');await evaluate(`const s=${root};s.querySelector('[data-mode]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode]').disabled&&s.querySelector('[data-import-status]').textContent.includes('Imported 114 cards');`,'Additive reimport did not finish');
  await evaluate("window.fixtureActor='synthetic-other-account';loadCards();return true;");await evaluate(`const s=${root};s.querySelector('[data-mode]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode]').disabled&&/different Nintendo account|Nintendo account changed/.test(s.querySelector('[data-import-status]').textContent);`,'Wrong-account import was not blocked');
  const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');await navigate(reportUrl);
  const result=JSON.parse(await wait('return document.documentElement?.dataset.result;','Committed database report unavailable'));
  assert.equal(result.error,undefined);assert.equal(result.records,115);assert.equal(result.refs,115);assert.equal(result.owned,112);assert.equal(result.unknown,3);assert.equal(result.history,0);assert.equal(result.binding,64);assert.equal(result.roundTrip,true);assert.equal(result.snapshot,114);assert.equal(result.source,'nintendo-virtual-game-cards');
  console.log('PASS '+(firefox?'Firefox':'Chrome')+' installed packaged Nintendo importer: MAIN/isolated bridge, profile consent, 115 cards, 112 owned/3 unknown, repeat import, retained omission, account-switch rejection, real atomic worker save and backup round trip.');
}finally{
  if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-nintendo-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
