// Install the packaged Xbox importer with synthetic page-owned requests only.
import assert from 'node:assert/strict';
import {installXboxFixture} from './xbox-source-fixture.js';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
const firefox=process.argv.includes('--firefox'),release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic Xbox Library</main></body></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const manifest=JSON.parse(files.get('manifest.json'));for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>pattern==='https://play.xbox.com/*'?'http://127.0.0.1/*':pattern);
manifest.host_permissions.push('http://127.0.0.1/*');files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
for(const path of ['src/providers/xbox-capture.js','src/providers/xbox-content.js','src/background/service-worker.js','src/background/xbox-navigation.js','src/ui/provider-launch.js'])files.set(path,Buffer.from(files.get(path).toString().replaceAll('https://play.xbox.com',origin)));
files.set('src/providers/xbox-capture.js',Buffer.from('('+installXboxFixture.toString()+')(globalThis);window.fixtureRequests=0;window.fetch=()=>{window.fixtureRequests++;throw Error(\"No source network allowed\");};fixtureXbox.get(\"profile\").status=\"pending\";\n'+files.get('src/providers/xbox-capture.js').toString()));
files.set('src/providers/xbox-content.js',Buffer.from(files.get('src/providers/xbox-content.js').toString()+"\ndocument.documentElement.dataset.testReportUrl=chrome.runtime.getURL('test-report.html');"));
files.set('test-report.html',Buffer.from('<html><body><script type="module" src="test-report.js"></script></body></html>'));
files.set('test-report.js',Buffer.from(`
import {createBackup,parseBackup} from './src/lib/storage.js';
try {const r=await chrome.runtime.sendMessage({type:'LIBRARY_STORAGE_OPERATION',operation:'getDatabase',args:[]});if(!r.ok)throw Error(r.error);const d=r.result,items=Object.values(d.providerItems),p=d.providerProfiles[d.providers.xbox.activeProfileId];
 const restored=parseBackup(createBackup(d));document.documentElement.dataset.result=JSON.stringify({records:items.length,owned:items.filter(i=>i.ownership==='owned').length,unknown:items.filter(i=>i.ownership==='unknown').length,subscriptions:items.filter(i=>i.ownership==='subscription').length,refs:new Set(items.map(i=>i.recordRef)).size,history:Object.keys(d.providerHistory).length,source:items[0].metadata.source,binding:p.sourceAccountFingerprint.length,roundTrip:JSON.stringify(restored)===JSON.stringify(d),snapshot:d.providers.xbox.snapshotValidation.itemCount,metadata:items[0].metadata,acquiredAt:items[0].acquiredAt,platform:items[0].platform});
}catch(error){document.documentElement.dataset.result=JSON.stringify({error:error.message});}`));
const temporary=await mkdtemp(join(tmpdir(),'gl-xbox-native-'));let child,driver,session,exited;
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
  async function wait(script,message){for(let i=0;i<250;i++){const v=await evaluate(script);if(v)return v;await pause(100);}const state=await evaluate('return {url:location.href,ready:document.readyState,status:document.querySelector("#galactic-library-xbox-importer")?.shadowRoot?.querySelector("[data-import-status]")?.textContent};');throw Error(message+' '+JSON.stringify(state));}
  await navigate(origin+'/landing');await wait('return !!document.documentElement?.dataset.testReportUrl;','Xbox controller missing from initial non-library document');
  assert.equal(await evaluate('return document.querySelectorAll("#galactic-library-xbox-importer").length;'),0);
  await evaluate("history.pushState(null,'','/library?tab=playHistory');return true;");await pause(100);
  assert.equal(await evaluate('return location.search==="?tab=playHistory"&&!document.querySelector("#galactic-library-xbox-importer");'),true,'Ordinary Play History browsing was redirected or displayed an importer');
  await evaluate("history.pushState(null,'','/library?tab=fullLibrary&view=grid&catalog=owned');return true;");
  await wait('return !!document.querySelector("#galactic-library-xbox-importer")?.shadowRoot?.querySelector("[data-profile-label]");','SPA Owned navigation did not mount Xbox');
  await evaluate('window.spaPanel=document.querySelector("#galactic-library-xbox-importer");history.back();return true;');
  await wait('return !document.querySelector("#galactic-library-xbox-importer");','Back did not suspend Xbox overlay');
  await evaluate('history.forward();return true;');await wait('return document.querySelector("#galactic-library-xbox-importer")===window.spaPanel;','Forward did not restore the same Xbox controls');

  const root='document.querySelector("#galactic-library-xbox-importer").shadowRoot';
  await evaluate(`window.originalXboxPanel=document.querySelector('#galactic-library-xbox-importer');const s=${root};s.querySelector('[data-profile-label]').value='Personal';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;s.querySelector('[data-galactic-floating-panel-control=minimize]').click();document.documentElement.replaceChildren(document.createElement('head'),document.createElement('body'));history.replaceState(null,'','/library?tab=fullLibrary&view=grid&catalog=owned');return true;`);
  await pause(50);
  const remounted=await evaluate(`const host=document.querySelector('#galactic-library-xbox-importer'),s=host?.shadowRoot;return {same:host===window.originalXboxPanel,count:document.querySelectorAll('#galactic-library-xbox-importer').length,nickname:s?.querySelector('[data-profile-label]').value,confirmed:s?.querySelector('[data-profile-confirm]').checked,minimized:s?.querySelector('.panel').hidden,restoreVisible:s?!s.querySelector('[data-galactic-floating-panel-control=restore]').hidden:false};`);
  assert.equal(remounted.same,true,'Xbox hydration removed the panel without restoring its original instance');assert.equal(remounted.count,1);assert.equal(remounted.nickname,'Personal');assert.equal(remounted.confirmed,true);assert.equal(remounted.minimized,true);assert.equal(remounted.restoreVisible,true);
  await evaluate(`const s=${root};s.querySelector('[data-galactic-floating-panel-control=restore]').click();return true;`);
  await evaluate(`const s=${root};s.querySelector('[data-profile-label]').value='Personal';s.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));s.querySelector('[data-profile-confirm]').checked=true;s.querySelector('[data-mode=full]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&/finish loading/.test(s.querySelector('[data-import-status]').textContent);`,'Unloaded purchases were not rejected');
  await evaluate('fixtureXbox.get("profile").status="success";return true;');
  for(const mode of ['full','incremental']){
    assert.equal(await evaluate(`const s=${root};s.querySelector('[data-mode=${mode}]').click();window.originalXboxPanel.remove();return s.querySelector('[data-mode=full]').disabled;`),true,'A removed panel lost its in-progress disabled state');
    await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&s.querySelector('[data-import-status]').textContent.includes('Saved 37 checked titles');`,'Complete import/quick update did not commit');
    assert.equal(await evaluate(`return document.querySelector('#galactic-library-xbox-importer')===window.originalXboxPanel&&document.querySelectorAll('#galactic-library-xbox-importer').length===1;`),true);
  }
  await evaluate(`const s=${root};s.querySelector('[data-mode=incremental]').click();history.pushState(null,'','/library?tab=playHistory');return true;`);
  await pause(150);assert.equal(await evaluate('return !document.querySelector("#galactic-library-xbox-importer");'),true);
  await evaluate("history.pushState(null,'','/library?tab=fullLibrary&view=list&catalog=owned');return true;");
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&/navigation changed/.test(s.querySelector('[data-import-status]').textContent);`,'Interrupted navigation was not safely stopped');
  assert.equal(await evaluate(`return ${root}.querySelector('[data-profile-label]').value;`),'Personal','Route suspension lost the account nickname');
  await evaluate('fixtureXbox.get("catalogs").value[0].totalCount=38;return true;');await evaluate(`const s=${root};s.querySelector('[data-mode=full]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&/catalog total/.test(s.querySelector('[data-import-status]').textContent);`,'Mismatched catalog was not blocked');
  await evaluate('fixtureXbox.rows.splice(36,1);fixtureXbox.get("catalogs").value[0].totalCount=36;return true;');await evaluate(`const s=${root};s.querySelector('[data-mode=full]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&s.querySelector('[data-import-status]').textContent.includes('Saved 36 checked titles');`,'Additive reimport did not finish');
  await evaluate('fixtureXbox.get("active").value="private-other";return true;');await evaluate(`const s=${root};s.querySelector('[data-mode=full]').click();return true;`);
  await wait(`const s=${root};return !s.querySelector('[data-mode=full]').disabled&&/finish loading/.test(s.querySelector('[data-import-status]').textContent);`,'Account switch was not blocked');
  assert.equal(await evaluate('return window.fixtureRequests;'),0);
  const reportUrl=await evaluate('return document.documentElement.dataset.testReportUrl;');await navigate(reportUrl);
  const result=JSON.parse(await wait('return document.documentElement?.dataset.result;','Committed database report unavailable'));
  assert.equal(result.error,undefined);assert.equal(result.records,37);assert.equal(result.refs,37);assert.equal(result.owned,37);assert.equal(result.unknown,0);assert.equal(result.subscriptions,0);assert.equal(result.history,0);assert.equal(result.binding,64);assert.equal(result.roundTrip,true);assert.equal(result.snapshot,36);assert.equal(result.source,'xbox-web-library');assert.equal(result.acquiredAt,null);assert.deepEqual(result.platform,['Windows','Xbox One','Xbox Series X|S']);assert.equal(result.metadata.edition,'Deluxe Edition');assert.deepEqual(result.metadata.accessTypes,[1]);
  // Real extension launch intent survives a synthetic login destination loss.
  const before=firefox?(await driver.send('WebDriver:GetWindowHandles')):(await driver.send('Target.getTargets')).targetInfos.map(t=>t.targetId);
  const handles=Array.isArray(before)?before:before.value;
  assert.equal(await evaluate("return (await chrome.runtime.sendMessage({type:'OPEN_XBOX_IMPORT'})).ok;"),true);
  if(firefox){
    let opened;for(let i=0;i<100&&!opened;i++){const r=await driver.send('WebDriver:GetWindowHandles');opened=(Array.isArray(r)?r:r.value).find(h=>!handles.includes(h));if(!opened)await pause(100);}
    assert(opened,'GL did not open an Xbox tab');await driver.send('WebDriver:SwitchToWindow',{handle:opened});
  }else{
    let opened;for(let i=0;i<100&&!opened;i++){opened=(await driver.send('Target.getTargets')).targetInfos.find(t=>!handles.includes(t.targetId)&&t.type==='page'&&t.url.startsWith(origin));if(!opened)await pause(100);}
    assert(opened,'GL did not open an Xbox tab');session=(await driver.send('Target.attachToTarget',{targetId:opened.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);
  }
  await wait('return !!document.querySelector("#galactic-library-xbox-importer")?.shadowRoot?.querySelector("[data-profile-label]");','GL launch did not reach Owned');
  assert.equal(await evaluate('return location.search;'),'?tab=fullLibrary&view=grid&catalog=owned');
  await evaluate("history.replaceState(null,'','/library?tab=playHistory');return true;");await pause(150);
  assert.equal(await evaluate('return location.search==="?tab=playHistory"&&!document.querySelector("#galactic-library-xbox-importer");'),true,'Incomplete authentication forced navigation');
  await evaluate('const challenge=document.createElement("input");challenge.type="password";challenge.id="test-challenge";document.body.append(challenge);fixtureXbox.get("profile").status="success";return true;');await pause(600);
  assert.equal(await evaluate('return location.search;'),'?tab=playHistory','Authentication challenge was interrupted');
  await evaluate('const challenge=document.createElement("div");challenge.dataset.testid="captcha";challenge.id="test-captcha";document.body.append(challenge);document.querySelector("#test-challenge").remove();return true;');await pause(700);
  assert.equal(await evaluate('return location.search;'),'?tab=playHistory','CAPTCHA was interrupted');
  await evaluate('document.querySelector("#test-captcha").remove();return true;');
  await wait('return location.search==="?tab=fullLibrary&view=grid&catalog=owned"&&!!document.querySelector("#galactic-library-xbox-importer")?.shadowRoot?.querySelector("[data-profile-label]");','GL launch destination was not recovered');
  // The consumed launch cannot turn later ordinary browsing into another redirect.
  await evaluate('fixtureXbox.get("profile").status="success";history.replaceState(null,"","/library?tab=playHistory");document.body.append(document.createElement("div"));return true;');await pause(700);
  assert.equal(await evaluate('return location.search==="?tab=playHistory"&&!document.querySelector("#galactic-library-xbox-importer");'),true,'Consumed GL launch redirected ordinary browsing');
  await evaluate('history.pushState(null,"","/library?tab=fullLibrary&view=list&catalog=owned");return true;');
  await wait('return document.querySelectorAll("#galactic-library-xbox-importer").length===1;','Manual Owned navigation failed after recovery');
  assert.equal(await evaluate('return window.fixtureRequests;'),0);
  await navigate(reportUrl);const unchanged=JSON.parse(await wait('return document.documentElement?.dataset.result;','Post-navigation database report unavailable'));
  assert.deepEqual(unchanged,result,'Navigation changed saved Xbox records');
  console.log('PASS '+(firefox?'Firefox':'Chrome')+' packaged Xbox: SPA entry, query changes, Back/Forward, hydration, single preserved panel/account/minimized/busy state; scoped post-login recovery, pending/challenge suspension and no redirect loop; zero navigation imports/source requests; full/quick/additive saves, account guards, 37 unchanged records and backup round trip.');


}finally{
  if(firefox&&driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}child?.kill();driver?.close?.();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-xbox-native-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
