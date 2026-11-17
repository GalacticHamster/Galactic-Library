// Install an existing release in a disposable profile, then execute the current
// controller in its extension page. No package builds or release ZIP changes.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,firefoxMarionette,freePort} from './native-protocol.mjs';
import {readRuntimeZip} from '../scripts/release.mjs';
const firefox=process.argv.includes('--firefox');
const archive=process.env.GL_PANEL_PACKAGE?pathToFileURL(resolve(process.env.GL_PANEL_PACKAGE)):new URL('../dist/1.0.3-rc1/GalacticLibrary-1.0.3'+(firefox?'-firefox':'')+'.zip',import.meta.url);
const source=process.env.GL_PANEL_SOURCE_REF?execFileSync('git',['show',process.env.GL_PANEL_SOURCE_REF+':src/providers/floating-panel.js'],{encoding:'utf8',windowsHide:true}):await readFile(new URL('../src/providers/floating-panel.js',import.meta.url),'utf8');
const temp=await mkdtemp(join(tmpdir(),'gl-panel-preferences-')),profile=join(temp,'profile');
await mkdir(profile);
let child,driver,session,url,exited,windowHandle;
let binary=firefox?'C:/Program Files/Mozilla Firefox/firefox.exe':'C:/Program Files/Google/Chrome/Application/chrome.exe';
try{await access(binary);}catch{
  if(!firefox)throw Error('Chrome is unavailable');
  const store=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{encoding:'utf8',windowsHide:true}).trim();
  binary=join(store,'VFS/ProgramFiles/Firefox Package Root/firefox.exe');await access(binary);
}
async function evaluate(code){
  if(firefox){await driver.send('WebDriver:SwitchToWindow',{handle:windowHandle});const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'globalThis.chrome=window.wrappedJSObject.chrome;(async()=>{'+code+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:String(e)}));',args:[],sandbox:'panel-preferences',newSandbox:false});const value=r.value??r;assert(!value?.error,value?.error);return value;}
  const r=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+code+'})()',awaitPromise:true,returnByValue:true},session);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
}
async function start(){
  const port=firefox?await freePort():0;
  if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'],{windowsHide:true,...(firefox?{env:{...process.env,MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'}}:{}),stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  exited=new Promise(r=>child.once('exit',r));
  driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox){
    await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
    const handle=await driver.send('WebDriver:GetWindowHandle');windowHandle=handle.value??handle;
    await driver.send('Addon:Install',{path:decodeURIComponent(archive.pathname).replace(/^\/(\w:)/,'$1'),temporary:true});
    await driver.send('Marionette:SetContext',{value:'chrome'});
    const r=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID("galactic-library@galactichamster.com").getURL("options.html");',args:[],newSandbox:true});url=r.value??r;
    await driver.send('Marionette:SetContext',{value:'content'});await pause(500);await driver.send('WebDriver:SwitchToWindow',{handle:windowHandle});await driver.send('WebDriver:Navigate',{url});
  }else{
    const stage=join(temp,'extension');await mkdir(stage,{recursive:true});
    for(const [name,bytes]of readRuntimeZip(await readFile(archive))){const target=join(stage,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
    const r=await driver.send('Extensions.loadUnpacked',{path:stage});url='chrome-extension://'+r.id+'/options.html';
    const target=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    await driver.send('Page.enable',{},session);
  }
  for(let i=0;i<100;i++){if(await evaluate('return document.readyState==="complete"&&Boolean(globalThis.chrome?.storage?.local);'))break;await pause(50);}
}
async function installController(){
  // Installation opens Options and starts companion discovery. Capture the
  // preservation baseline only after these unrelated startup writes settle.
  let previous='',stable=0;
  for(let n=0;n<100&&stable<5;n++){
    const current=await evaluate('return JSON.stringify(await chrome.storage.local.get(null));');
    stable=current===previous?stable+1:0;previous=current;await pause(50);
  }
  assert(stable>=5,'Installation storage did not settle');
  await evaluate(`const chrome={runtime:globalThis.chrome.runtime,storage:{onChanged:globalThis.chrome.storage.onChanged,local:{get:(...args)=>globalThis.chrome.storage.local.get(...args),set:(...args)=>globalThis.chrome.storage.local.set(...args)}}};globalThis.panelChrome=chrome;`+source+`;document.body.replaceChildren();globalThis.panels=[];
    globalThis.mountPanel=async provider=>{
      const host=document.createElement('div');document.body.append(host);const shadow=host.attachShadow({mode:'open'});
      GalacticFloatingPanel.render(shadow,provider);const before=shadow.querySelector('.panel').hidden;
      if(!before||getComputedStyle(shadow.querySelector('.panel')).display!=='none')throw Error('Expanded panel visible before saved preference resolution');
      GalacticFloatingPanel.attach(shadow,provider);panels.push(shadow);
      for(let i=0;i<100&&!shadow.querySelector('.panel').dataset.panelStateReady;i++)await new Promise(r=>setTimeout(r,10));
      if(!shadow.querySelector('.panel').dataset.panelStateReady)throw Error('Panel preference never settled');
      return {before,hidden:shadow.querySelector('.panel').hidden};
    };return true;`);
}
const click=(index,control)=>evaluate(`panels[${index}].querySelector('[data-galactic-floating-panel-control="${control}"]').click();return true;`);
const hidden=index=>evaluate(`return panels[${index}].querySelector('.panel').hidden;`);
async function waitHidden(index,value){for(let n=0;n<100;n++){if(await hidden(index)===value)return;await pause(10);}assert.fail('Panel did not adopt persisted state');}
try{
  await start();await installController();
  const baseline=await evaluate('return JSON.stringify(await chrome.storage.local.get(null));');
  assert.deepEqual(await evaluate('return mountPanel("steam");'),{before:true,hidden:false});
  await click(0,'minimize');await waitHidden(0,true);
  assert.equal((await evaluate('return mountPanel("steam");')).hidden,true);
  assert.equal((await evaluate('return mountPanel("epic");')).hidden,false);
  await click(1,'restore');await waitHidden(0,false);
  await click(0,'minimize');await waitHidden(1,true);
  assert.equal(await hidden(2),false);
  await evaluate('panels[0].querySelector("[data-import-help]").open=true;return true;');
  for(let n=0;n<100;n++){if(await evaluate('return (await chrome.storage.local.get("galacticLibraryPanelHelp:steam"))["galacticLibraryPanelHelp:steam"]===true;'))break;await pause(10);}
  assert.equal(await evaluate('return panels[1].querySelector("[data-import-help]").open;'),true,'same-provider help disclosure did not follow');
  assert.equal(await evaluate('return panels[2].querySelector("[data-import-help]").open;'),false,'help preference crossed provider boundary');
  await evaluate('return mountPanel("audible");');await click(3,'minimize');
  for(let i=0;i<3;i++)assert.equal((await evaluate('return mountPanel("audible");')).hidden,true);
  // Same-document navigation/reinitialization never writes a default.
  assert.equal(await evaluate('const shadow=panels[0],before=shadow.querySelectorAll("button").length;GalacticFloatingPanel.attach(shadow,"steam");return shadow.querySelectorAll("button").length===before;'),true);
  assert.equal(await evaluate('globalThis.savedController=GalacticFloatingPanel;'+source+';return savedController===GalacticFloatingPanel;'),true,'Repeated script initialization replaced the controller');
  const preserved=await evaluate('const s=await chrome.storage.local.get(null);for(const k of Object.keys(s))if(k.startsWith("galacticLibraryPanelState:")||k.startsWith("galacticLibraryPanelHelp:"))delete s[k];return JSON.stringify(s);');
  assert.equal(preserved,baseline,'UI preference changed library or synchronization storage');
  if(firefox)await driver.send('WebDriver:Navigate',{url});else await driver.send('Page.reload',{},session);
  await pause(300);await installController();assert.equal((await evaluate('return mountPanel("steam");')).hidden,true);
  if(firefox)await driver.send('Marionette:Quit',{flags:['eForceQuit']});else await driver.send('Browser.close');await exited;driver.close?.();
  await start();await installController();assert.equal((await evaluate('return mountPanel("steam");')).hidden,true);assert.equal((await evaluate('return mountPanel("audible");')).hidden,true);assert.equal((await evaluate('return mountPanel("epic");')).hidden,false);
  assert.equal(await evaluate('return panels[0].querySelector("[data-import-help]").open;'),true,'help preference lost at restart');
  await click(0,'restore');await pause(80);
  assert.equal((await evaluate('return mountPanel("steam");')).hidden,false);
  assert.equal(await evaluate(`const get=panelChrome.storage.local.get;let release,reading;
    const started=new Promise(resolve=>reading=resolve),held=new Promise(resolve=>release=resolve);
    const key='galacticLibraryPanelState:kobo';
    panelChrome.storage.local.get=async k=>{const result=await get(k);if(k===key){reading();await held;}return result;};
    try{const mounting=mountPanel('kobo');await started;
      const changed=new Promise(resolve=>{const listener=(changes,area)=>{if(area==='local'&&changes[key]){chrome.storage.onChanged.removeListener(listener);resolve();}};chrome.storage.onChanged.addListener(listener);});
      await chrome.storage.local.set({[key]:true});await changed;release();return (await mounting).hidden;
    }finally{release();panelChrome.storage.local.get=get;}`),true,'Stale initial read overwrote a newer preference change');
  // Actual separate extension tabs receive changes without echo writes.
  const originalSession=session,originalHandle=windowHandle;
  if(firefox){const r=await driver.send('WebDriver:NewWindow',{type:'tab'});windowHandle=(r.value??r).handle;await driver.send('WebDriver:SwitchToWindow',{handle:windowHandle});await driver.send('WebDriver:Navigate',{url});}
  else{const t=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await driver.send('Page.enable',{},session);}
  await pause(300);await installController();assert.equal((await evaluate('return mountPanel("steam");')).hidden,false);
  const secondSession=session,secondHandle=windowHandle;
  session=originalSession;windowHandle=originalHandle;await click(0,'minimize');
  session=secondSession;windowHandle=secondHandle;await waitHidden(0,true);
  await click(0,'restore');session=originalSession;windowHandle=originalHandle;await waitHidden(0,false);
  // Read/write failure cannot hide both controls or modify library data.
  assert.equal(await evaluate(`const get=panelChrome.storage.local.get,set=panelChrome.storage.local.set;
    try{panelChrome.storage.local.get=async()=>{throw Error('read failed');};const r=await mountPanel('gog');
      if(r.hidden)throw Error('Read failure did not default expanded');
      panelChrome.storage.local.set=async()=>{throw Error('write failed');};
      const s=panels.at(-1);s.querySelector('[data-galactic-floating-panel-control="minimize"]').click();
      if(!s.querySelector('.panel').hidden)throw Error('Write failure broke local minimize');return true;
    }finally{panelChrome.storage.local.get=get;panelChrome.storage.local.set=set;}`),true);
  console.log('PASS '+(firefox?'Firefox':'Chrome')+': existing installed release, current controller; default/no computed flash, provider isolation, same-document and actual two-tab propagation, repeated attach, navigation, restart/reinstallation, explicit expand, storage failures and unrelated-storage preservation.');
}finally{
  try{if(firefox)await driver?.send('Marionette:Quit',{flags:['eForceQuit']});else await driver?.send('Browser.close');}catch{}
  child?.kill();driver?.close?.();if(exited)await exited;await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
