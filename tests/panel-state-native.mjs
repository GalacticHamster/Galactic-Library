// Installed extension, real content scripts and synthetic provider pages in a disposable profile.
// Steam, GOG and Audible each get their own loopback host, so each provider's own content script and
// page check run exactly as on the provider site. The panel is minimized and expanded through its real
// controls; the test checks what the next page shows, after full navigation, history navigation, reload
// and a browser restart, and that providers keep independent states.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
const firefox=process.argv.includes('--firefox');
const release=await createRelease(undefined,undefined,firefox?'firefox':'chrome'),files=new Map(release.files);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><main>Synthetic provider page '+req.url.replace(/[<>&"]/gu,'')+'</main></body></html>');});
await new Promise(done=>server.listen(0,'0.0.0.0',done));const port=server.address().port;
const providers={
  steam:{site:'https://store.steampowered.com',host:'127.0.0.1',panel:'galactic-library-steam-store-importer'},
  gog:{site:'https://www.gog.com',host:'127.0.0.2',panel:'galactic-library-gog-importer'},
  audible:{site:'https://www.audible.com',host:'127.0.0.3',panel:'galactic-library-audible-importer'}
};
const origin=name=>`http://${providers[name].host}:${port}`;
// Point each provider's content scripts and the worker's page check at its synthetic host.
const manifest=JSON.parse(files.get('manifest.json'));
for(const entry of manifest.content_scripts)entry.matches=entry.matches.map(pattern=>Object.values(providers).find(p=>pattern===p.site+'/*')?`http://${Object.values(providers).find(p=>pattern===p.site+'/*').host}/*`:pattern);
manifest.host_permissions.push(...Object.values(providers).map(p=>`http://${p.host}/*`));files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
let worker=files.get('src/background/service-worker.js').toString();
for(const [name,p] of Object.entries(providers))worker=worker.replaceAll(`page.origin === '${p.site}'`,`page.origin === '${origin(name)}'`);
// Test-only storage hooks for the panel preference: a read can return the value from before a delay (stale), or
// fail; a write can fail. Set from the test page with TEST_PANEL_MODE.
assert(worker.includes('chrome.storage.local.get(Object.values(keys))')&&worker.includes('chrome.storage.local.set(Object.fromEntries('),'Panel preference storage calls not found');
worker=worker.replace('chrome.storage.local.get(Object.values(keys))','globalThis.__panelGet(Object.values(keys))').replace('chrome.storage.local.set(Object.fromEntries(','globalThis.__panelSet(Object.fromEntries(');
worker=`globalThis.__panelMode={};
globalThis.__panelGet=async keys=>{const mode=globalThis.__panelMode;if(mode.failGet)throw Error('Synthetic read failure');const value=await chrome.storage.local.get(keys);if(mode.staleGet)await new Promise(r=>setTimeout(r,mode.staleGet));return value;};
globalThis.__panelSet=async value=>{if(globalThis.__panelMode.failSet)throw Error('Synthetic write failure');return chrome.storage.local.set(value);};
chrome.runtime.onMessage.addListener((request,sender,reply)=>{if(request?.type==='TEST_PANEL_MODE'&&sender.url?.startsWith(chrome.runtime.getURL(''))){globalThis.__panelMode=request.mode;reply(true);}});
`+worker;
files.set('src/background/service-worker.js',Buffer.from(worker));
// Open shadow roots so the test can use the real controls. Record any moment a panel shows expanded before
// its saved state is applied (an expanded flash).
files.set('src/providers/floating-panel.js',Buffer.from(`
if(!globalThis.__glPanelTestPatch){globalThis.__glPanelTestPatch=true;
 const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,{...options,mode:'open'});
  new MutationObserver(()=>{const panel=root.querySelector('.panel');if(panel&&!panel.hidden&&panel.dataset.panelStateReady!=='true')document.documentElement.dataset.glPanelFlash='1';}).observe(root,{subtree:true,childList:true,attributes:true});
  return root;};}
`+files.get('src/providers/floating-panel.js').toString()));
// An extension page that reports the stored panel preferences.
files.set('test-panel-report.html',Buffer.from('<html><body><script type="module" src="test-panel-report.js"></script></body></html>'));
files.set('test-panel-report.js',Buffer.from(`const mode=new URLSearchParams(location.search).get('mode');if(mode)await chrome.runtime.sendMessage({type:'TEST_PANEL_MODE',mode:JSON.parse(mode)});
const all=await chrome.storage.local.get(null);const other=JSON.stringify(Object.entries(all).filter(([k])=>!k.startsWith('galacticLibraryPanel')).sort(([a],[b])=>a<b?-1:1));
document.documentElement.dataset.result=JSON.stringify({...Object.fromEntries(Object.entries(all).filter(([k])=>k.startsWith('galacticLibraryPanel'))),otherStorage:other});`));
const temporary=await mkdtemp(join(tmpdir(),'gl-panel-state-'));let child,driver,session,exited,extensionBase;const checks=[];
const check=(condition,label)=>{assert(condition,label);checks.push(label);console.log(`PASS ${firefox?'Firefox':'Chrome'}: ${label}`);};
async function stopBrowser(){
  const command=child?.exitCode===null?driver.send(firefox?'Marionette:Quit':'Browser.close',firefox?{flags:['eForceQuit']}:{}).catch(()=>{}):null;
  let timer;try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser did not exit.')),8000);})]);}catch(e){child?.kill();throw e;}finally{clearTimeout(timer);driver?.close?.();}
  await command;
}
try{
  const profile=join(temporary,'profile'),stage=join(temporary,'extension');await mkdir(profile);await mkdir(stage);
  for(const [name,bytes]of files){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}if(!binary)throw Error('Set CHROME_BIN or FIREFOX_BIN.');
  async function startBrowser(){
    const marionette=firefox?await freePort():0;
    if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${marionette});\nuser_pref("extensions.update.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
    child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,...(firefox?{env:{...process.env,MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'}}:{}),stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
    child.stdout?.resume();child.stderr?.resume();exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});
    driver=firefox?await firefoxMarionette(marionette):chromePipe(child);
    if(firefox){
      await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
      const archive=join(temporary,'extension.zip');await writeFile(archive,runtimeZip(files));await driver.send('Addon:Install',{path:archive,temporary:true});
      await driver.send('Marionette:SetContext',{value:'chrome'});
      await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");const policy=WebExtensionPolicy.getByID(arguments[0]);ExtensionPermissions.add(arguments[0],{permissions:[],origins:arguments[1]},policy.extension).then(()=>done(true),e=>done(String(e)));',args:['galactic-library@galactichamster.com',Object.values(providers).map(p=>`http://${p.host}/*`)],newSandbox:true});
      const base=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID("galactic-library@galactichamster.com").getURL("");',args:[],newSandbox:true});extensionBase=base.value??base;
      await driver.send('Marionette:SetContext',{value:'content'});
    }else{const loaded=await driver.send('Extensions.loadUnpacked',{path:stage});extensionBase=`chrome-extension://${loaded.id}/`;}
  }
  async function evaluate(script){
    if(firefox){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],newSandbox:false});const value=Object.hasOwn(r,'value')?r.value:r;assert(!value?.error,value?.error);return value;}
    const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  async function navigate(url){
    if(firefox){await driver.send('WebDriver:Navigate',{url});return;}
    if(!session){const t=await driver.send('Target.createTarget',{url:'about:blank'});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await driver.send('Page.enable',{},session);await driver.send('Runtime.enable',{},session);}
    await driver.send('Page.navigate',{url},session);
    for(let i=0;i<100;i++){await pause(50);try{if(await evaluate(`return location.href===${JSON.stringify(url)}&&document.readyState==='complete';`))return;}catch{}}
  }
  async function wait(script,message){for(let i=0;i<200;i++){try{const v=await evaluate(script);if(v)return v;}catch{}await pause(50);}throw Error(message);}
  // The panel's presentation once its saved state is applied: 'minimized' or 'expanded'.
  const shown=async name=>wait(`const s=document.querySelector('#${providers[name].panel}')?.shadowRoot,p=s?.querySelector('.panel'),r=s?.querySelector('[data-galactic-floating-panel-control="restore"]');
    if(!p||p.dataset.panelStateReady!=='true')return null;return p.hidden&&!r.hidden?'minimized':!p.hidden&&r.hidden?'expanded':'inconsistent';`,`${name} panel did not show`);
  const visit=async(name,path)=>{await navigate(origin(name)+path);return shown(name);};
  const control=(name,which)=>evaluate(`document.querySelector('#${providers[name].panel}').shadowRoot.querySelector('[data-galactic-floating-panel-control="${which}"]').click();return true;`);
  const stored=async(mode=null)=>{await navigate(extensionBase+'test-panel-report.html'+(mode?'?mode='+encodeURIComponent(JSON.stringify(mode)):''));return JSON.parse(await wait('return document.documentElement.dataset.result;','Preference report unavailable'));};
  // Tabs: Chrome sessions or Firefox window handles.
  const tabs={};
  async function newTab(name){
    if(firefox){const r=await driver.send('WebDriver:NewWindow',{type:'tab'});tabs[name]=(r.value??r).handle;}
    else{const t=await driver.send('Target.createTarget',{url:'about:blank'});tabs[name]=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await driver.send('Page.enable',{},tabs[name]);await driver.send('Runtime.enable',{},tabs[name]);}
  }
  async function useTab(name){if(firefox)await driver.send('WebDriver:SwitchToWindow',{handle:tabs[name]});else session=tabs[name];}
  const rememberMainTab=async()=>{tabs.main=firefox?(r=>r.value??r)(await driver.send('WebDriver:GetWindowHandle')):session;};
  const flashed=()=>evaluate('return document.documentElement.dataset.glPanelFlash==="1";');
  session=null;await startBrowser();

  check(await visit('steam','/app/1')==='expanded','first visit with no saved state shows the panel expanded');
  const libraryBefore=(await stored()).otherStorage;await visit('steam','/app/1');
  await control('steam','minimize');
  check(await shown('steam')==='minimized','Minimize collapses the Steam panel');
  // Navigate away at once, as a user would.
  check(await visit('steam','/app/2')==='minimized'&&!await flashed(),'the next Steam page opens minimized, without showing the expanded panel first');
  check((await stored())['galacticLibraryPanelState:steam']===true,'the Steam preference is saved in extension storage');
  check(await visit('steam','/app/3')==='minimized','Steam stays minimized on other pages');
  await evaluate(`history.pushState({},'','/app/4');dispatchEvent(new PopStateEvent('popstate'));return true;`);
  check(await shown('steam')==='minimized','in-page (history) navigation keeps it minimized');
  if(!firefox){await driver.send('Page.reload',{},session);}else await driver.send('WebDriver:Refresh',{});
  check(await shown('steam')==='minimized'&&!await flashed(),'a reload keeps it minimized without a flash');

  // Independent providers: GOG left expanded, Audible minimized.
  check(await visit('gog','/games')==='expanded','GOG keeps its own state (expanded)');
  check(await visit('audible','/library')==='expanded','Audible starts expanded');
  await control('audible','minimize');
  check(await visit('audible','/library/titles')==='minimized','Audible stays minimized across pages');
  check(await visit('gog','/account')==='expanded'&&await visit('steam','/app/5')==='minimized','GOG stays expanded and Steam minimized while Audible changes');
  // Help disclosure persists separately.
  await evaluate(`const d=document.querySelector('#${providers.steam.panel}').shadowRoot.querySelector('[data-import-help]');d.open=true;return true;`);
  await pause(300);
  await visit('steam','/app/6');
  check(await evaluate(`return document.querySelector('#${providers.steam.panel}').shadowRoot.querySelector('[data-import-help]').open===true;`),'the help disclosure stays open on the next page');

  // Restart: every provider keeps its own state.
  await stopBrowser();session=null;await startBrowser();
  check(await visit('steam','/app/7')==='minimized'&&await visit('gog','/games')==='expanded'&&await visit('audible','/library')==='minimized','after a browser restart Steam and Audible open minimized and GOG expanded');
  // Expanding is remembered too, and only for that provider.
  await visit('audible','/library');await control('audible','restore');
  check(await visit('audible','/library/2')==='expanded','Expand on Audible is remembered on the next page');
  check(await visit('steam','/app/8')==='minimized'&&await visit('gog','/games')==='expanded','expanding Audible leaves Steam and GOG unchanged');
  const finalState=await stored();
  check(finalState['galacticLibraryPanelState:steam']===true&&finalState['galacticLibraryPanelState:audible']===false&&finalState['galacticLibraryPanelState:gog']===undefined&&finalState['galacticLibraryPanelHelp:steam']===true,'stored preferences are per provider and only for choices made');

  // Two tabs on one provider: a change in one tab shows in the other without reloading; other providers ignore it.
  await visit('steam','/app/9');await rememberMainTab();
  await newTab('second');await useTab('second');check(await visit('steam','/app/10')==='minimized','a second Steam tab opens minimized');
  await useTab('main');await control('steam','restore');
  await useTab('second');check(await wait(`const p=document.querySelector('#${providers.steam.panel}').shadowRoot.querySelector('.panel');return !p.hidden;`,'second tab did not follow'),'expanding in one tab expands the other open Steam tab');
  await useTab('main');await control('steam','minimize');
  await useTab('second');check(await wait(`return document.querySelector('#${providers.steam.panel}').shadowRoot.querySelector('.panel').hidden;`,'second tab did not follow'),'minimizing in one tab minimizes the other');
  // A slow first read in a newly opened tab cannot undo a change made meanwhile in another tab.
  await useTab('main');await stored({staleGet:2500});
  await useTab('second');await navigate(origin('steam')+'/app/11');
  await useTab('main');await visit('steam','/app/12');await control('steam','restore');
  await useTab('second');await pause(3000);
  check(await shown('steam')==='expanded','a slow initial read does not override a newer change from another tab');
  await useTab('main');await stored({});
  // Storage failures: the panel still shows (expanded), works locally and overwrites nothing.
  const before=await stored({failGet:true});
  check(await visit('gog','/games')==='expanded','an unreadable preference shows the panel expanded');
  await stored({failSet:true});
  await visit('gog','/games');await control('gog','minimize');
  check(await shown('gog')==='minimized','Minimize still works on the page when the preference cannot be saved');
  const after=await stored({});
  check(JSON.stringify(after)===JSON.stringify(before),'failed reads and writes leave every saved preference unchanged');
  check(after.otherStorage===libraryBefore,'panel preferences never change library, account or synchronization storage');
  console.log(`${checks.length} ${firefox?'Firefox':'Chrome'} panel-state checks passed.`);
}finally{
  try{await stopBrowser();}catch{}
  server.close();await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}
