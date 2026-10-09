// Offline native extension checks. Own disposable profiles; no user libraries.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {outputPath} from './audit-artifacts.mjs';
function contrast(a,b){const luminance=value=>{const rgb=value.match(/\d+/g).slice(0,3).map(value=>{const n=Number(value)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
import {createRelease,projectRoot} from './release.mjs';
import {chromePipe,freePort,firefoxMarionette} from '../tests/native-protocol.mjs';

const firefox=process.argv.includes('--firefox'),kind=firefox?'firefox':'chrome';
const hbRoot=resolve(projectRoot,'../HB'),fanRoot=resolve(projectRoot,'../Fanatical');
const temporary=await mkdtemp(join(tmpdir(),'gh-theme-check-'));
const output=await outputPath('audit-artifacts/themes/'+kind+'/results.json');
const checks=[],screenshots=[];let child,driver,exited;
try{
  const profile=join(temporary,'profile');await mkdir(profile);
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}
  if(!binary)throw Error('Set CHROME_BIN/FIREFOX_BIN to a local browser binary.');
  const port=firefox?await freePort():0;
  if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("browser.shell.checkDefaultBrowser",false);\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  const args=firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'];
  child=spawn(binary,args,{windowsHide:true,stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});
  driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox)await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
  async function load(root,role){
    let archive,manifest,stage;
    if(role==='hb'){
      const directory=join(temporary,'hb-package');await mkdir(directory);
      execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts/package-release.ps1'),'-Target',firefox?'Firefox':'Chrome','-OutputDirectory',directory],{windowsHide:true,stdio:'pipe'});
      manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));archive=join(directory,'Humble-Comic-Library-'+manifest.version+(firefox?'-firefox':'')+'.zip');
      if(!firefox){stage=join(temporary,role);const script=join(temporary,'extract.ps1');await writeFile(script,'param($Archive,$Destination)\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n[System.IO.Compression.ZipFile]::ExtractToDirectory($Archive,$Destination)\n');execFileSync('powershell.exe',['-NoProfile','-File',script,archive,stage],{windowsHide:true,stdio:'pipe'});}
    }else{
      const builder=root===projectRoot?{createRelease}:await import(pathToFileURL(join(root,'scripts/release.mjs'))),release=await builder.createRelease(root,undefined,kind);
      manifest=JSON.parse(release.files.get('manifest.json'));archive=join(temporary,role+'.zip');await writeFile(archive,release.zip);
      if(!firefox){stage=join(temporary,role);await mkdir(stage);for(const [path,bytes]of release.files){await mkdir(resolve(stage,path,'..'),{recursive:true});await writeFile(join(stage,path),bytes);}}
    }
    const result=await driver.send(firefox?'Addon:Install':'Extensions.loadUnpacked',firefox?{path:archive,temporary:true}:{path:stage});
    return {id:firefox?(result.value??result):result.id,manifest,role};
  }
  const installed={gl:await load(projectRoot,'gl'),hb:await load(hbRoot,'hb'),fan:await load(fanRoot,'fan')};
  let session;
  async function navigate(role,popup=false){
    const item=installed[role],path=popup?item.manifest.action.default_popup:item.manifest.options_page;
    if(firefox){await driver.send('Marionette:SetContext',{value:'chrome'});const response=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL(arguments[1]);',args:[item.id,path],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url:response.value??response});}
    else{const target=await driver.send('Target.createTarget',{url:'chrome-extension://'+item.id+'/'+path}),attached=await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});session=attached.sessionId;await driver.send('Runtime.enable',{},session);}
    await wait('Boolean(globalThis.GalacticHamsterTheme?.page)');
  }
  async function evaluate(script){
    if(firefox){const response=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],error=>arguments[arguments.length-1]({error:error.message+"\\n"+error.stack}));',args:[],newSandbox:false});const value=response.value??response;assert.equal(value?.error,undefined,value?.error);return value;}
    const response=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert.equal(response.exceptionDetails,undefined,JSON.stringify(response.exceptionDetails));return response.result.value;
  }
  async function wait(expression){for(let attempt=0;attempt<100;attempt++){try{if(await evaluate('return '+expression+';'))return;}catch{}await pause(30);}throw Error('Timed out: '+expression);}
  async function mode(value,follow=false){const response=await evaluate(`return chrome.runtime.sendMessage({type:'GH_SET_APPEARANCE',mode:${JSON.stringify(value)},followGl:${follow}});`);assert.equal(response.ok,true);await evaluate('await GalacticHamsterTheme.page.load('+follow+');return true;');await wait('document.documentElement.dataset.ghTheme===GalacticHamsterTheme.effectiveMode(GalacticHamsterTheme.page.preferences,matchMedia("(prefers-color-scheme: dark)").matches)');}
  async function size(width){if(firefox)await driver.send('WebDriver:SetWindowRect',{width,height:1000});else await driver.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},session);}
  async function system(dark){
    if(firefox){await driver.send('Marionette:SetContext',{value:'chrome'});await driver.send('WebDriver:ExecuteScript',{script:'Services.prefs.setIntPref("ui.systemUsesDarkTheme",arguments[0]);Services.prefs.setIntPref("layout.css.prefers-color-scheme.content-override",2);return true;',args:[Number(dark)],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});}
    else await driver.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'}]},session);
    await wait('matchMedia("(prefers-color-scheme: dark)").matches==='+dark);
  }
  const protectedState={};
  for(const role of ['gl','hb','fan']){
    await navigate(role);await wait('(await chrome.runtime.sendMessage({type:"GH_GET_APPEARANCE"})).ok');await evaluate('await GalacticHamsterTheme.page.load();return true;');await wait('!document.querySelector("#appearance-mode").disabled');
    assert.equal((await evaluate('return chrome.runtime.sendMessage({type:"GH_GET_APPEARANCE"});')).appearance.mode,'system');checks.push(role+': fresh native installation defaults to System');
    if(role==='gl'){
      await evaluate(`const S=await import('./src/lib/storage.js');await S.mergeProviderItems('gog',[{providerItemId:'synthetic-theme',title:'Synthetic owned theme control',mediaType:'game',ownership:'owned'}]);await S.mergeProviderItems('kindle',[{providerItemId:'synthetic-theme-book',title:'Synthetic collection',mediaType:'book',ownership:'owned',metadata:{originType:'Purchase',detailUrl:'https://www.amazon.com/dp/B000000001'}}]);await S.addAllowedExternalClientId(${JSON.stringify(installed.hb.id)});await S.addAllowedExternalClientId(${JSON.stringify(installed.fan.id)});return true;`);
      await wait('document.querySelector("#library-load-status").hidden&&document.querySelector("#library-items").children.length===2&&!document.querySelector("#kindle-contents-progress > button").disabled');
      protectedState[role]=await evaluate('const S=await import("./src/lib/storage.js");return JSON.stringify(await S.getDatabase());');
      await evaluate('document.querySelector("[data-workspace=settings]").click();return true;');
    }else{
      const key=role==='hb'?'libraryItems':'fanaticalLibraryItems';await evaluate(`await chrome.storage.local.set({${key}:[${role==='hb'?'{title:"Synthetic local title",kind:"game"}':'{source:"fanatical",sourceItemId:"synthetic-theme",title:"Synthetic local title",mediaType:"game"}'}]});return true;`);
      protectedState[role]=await evaluate(`return JSON.stringify((await chrome.storage.local.get({${key}:[]})).${key});`);
    }
    await evaluate('window.themeLibraryReads=[];const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(...args)=>{const request=args[0];if(request?.type==="LIBRARY_STORAGE_OPERATION"&&["getDatabase","getCommittedLibraryView"].includes(request.operation))window.themeLibraryReads.push(request.operation);return original(...args);};return true;');
    await evaluate('const select=document.querySelector("#appearance-mode");select.value="dark";select.dispatchEvent(new Event("change"));return true;');await wait('GalacticHamsterTheme.page.preferences.mode==="dark"&&document.documentElement.dataset.ghTheme==="dark"');checks.push(role+': native Appearance selection saves and updates immediately');
    for(const palette of ['dark','light']){
      await mode(palette);
      const card=await evaluate('const node=document.querySelector(".library-items > li,.appearance-panel");if(!node)return null;const style=getComputedStyle(node);return {border:style.borderTopColor,background:style.backgroundColor,page:getComputedStyle(document.documentElement).backgroundColor};');
      if(palette==='light'){assert(card,role+' sample card missing');assert.equal(card.border,'rgb(203, 213, 225)',role+' visible card border');assert.equal(card.background,'rgb(255, 255, 255)');assert.equal(card.page,'rgb(248, 250, 252)');}
      if(role==='gl'){await evaluate('document.querySelector("[data-workspace=contents]").click();return true;');await wait('Boolean(document.querySelector(".contents-collection-card"))');const collection=await evaluate('const node=document.querySelector(".contents-collection-card"),style=getComputedStyle(node);return {border:style.borderTopColor,background:style.backgroundColor};');if(palette==='light'){assert.equal(collection.border,'rgb(203, 213, 225)');assert.equal(collection.background,'rgb(255, 255, 255)');}await evaluate('document.querySelector("[data-workspace=settings]").click();return true;');}
      checks.push(role+': '+palette+' native card surfaces use the intended palette');
      for(const width of [1200,560,420]){
        await size(width);await pause(50);
        const result=await evaluate(`const root=document.documentElement,button=document.querySelector('button:not(:disabled)'),input=document.querySelector('#appearance-mode');input.focus();return {theme:root.dataset.ghTheme,bg:getComputedStyle(root).backgroundColor,text:getComputedStyle(root).color,button:getComputedStyle(button).backgroundColor,focus:getComputedStyle(input).outlineWidth,overflow:root.scrollWidth>innerWidth+1,width:innerWidth};`);
        assert.equal(result.theme,palette);assert.equal(result.overflow,false,role+' '+palette+' '+width+' overflow');assert(parseFloat(result.focus)>=2);
        if(role==='gl'){const navigation=await evaluate('return [...document.querySelectorAll(".workspace-navigation button")].map(node=>({label:node.textContent,color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor}));');for(const button of navigation)assert(contrast(button.color,button.background)>=4.5,palette+' navigation '+button.label);}
        if(role==='gl'){const tour=await evaluate('const results=[];for(const workspace of ["library","providers","contents","settings"]){document.querySelector("[data-workspace="+workspace+"]").click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));results.push({workspace,overflow:document.documentElement.scrollWidth>innerWidth+1});if(workspace==="library"){const details=document.querySelector(".item-details");if(details){details.open=true;details.dispatchEvent(new Event("toggle"));}}}return results;');for(const step of tour)assert.equal(step.overflow,false,step.workspace+" overflow "+width);}

        if(width===1200){const image=await driver.send(firefox?'WebDriver:TakeScreenshot':'Page.captureScreenshot',firefox?{}:{format:'png'},firefox?undefined:session);const path=await outputPath('audit-artifacts/themes/'+kind+'/'+role+'-'+palette+'.png');await writeFile(path,Buffer.from(firefox?image.value:image.data,'base64'));screenshots.push(path);if(role==='gl')for(const workspace of ['library','contents']){await evaluate('document.querySelector("[data-workspace='+workspace+']").click();return true;');await pause(60);const shot=await driver.send(firefox?'WebDriver:TakeScreenshot':'Page.captureScreenshot',firefox?{}:{format:'png'},firefox?undefined:session);const cardPath=await outputPath('audit-artifacts/themes/'+kind+'/gl-'+workspace+'-'+palette+'.png');await writeFile(cardPath,Buffer.from(firefox?shot.value:shot.data,'base64'));screenshots.push(cardPath);} }
      }
      checks.push(role+': '+palette+' native Options, focus and 1200/560/420 layouts');
      if(role==='gl'){const dialog=await evaluate('const C=await import("./src/ui/confirmation.js");const confirmation=C.createConfirmation({title:"Synthetic cancellation",message:"No data will be written.",confirmLabel:"Test"});const node=document.querySelector(".confirmation-dialog"),style=getComputedStyle(node);const result={background:style.backgroundColor,color:style.color,open:node.open};confirmation.cancel();if(await confirmation.result!==false)throw Error("Cancellation failed");return result;');assert.equal(dialog.open,true);checks.push('gl: '+palette+' Library/Providers/Contents/Settings, Details and cancellable app dialog retain themed layout');}
    }
    assert.equal((await evaluate('return window.themeLibraryReads;')).length,0,role+' theme change reread library');
    await mode('system');await system(true);await wait('document.documentElement.dataset.ghTheme==="dark"');await system(false);await wait('document.documentElement.dataset.ghTheme==="light"');checks.push(role+': live System preference changes without reload or library reads');
    await mode('dark');await navigate(role);await wait('document.documentElement.dataset.ghTheme==="dark"');checks.push(role+': saved Dark survives a fresh Options document');
    await navigate(role,true);await wait('document.documentElement.dataset.ghTheme==="dark"');checks.push(role+': popup uses the same saved theme');
  }
  // Native pairing, using the established allowlist/override machinery only.
  const request={type:'MATCH_ITEMS',apiVersion:1,items:[{requestId:'control',title:'Synthetic owned theme control',mediaType:'game'}]};
  for(const role of ['hb','fan']){
    await navigate('gl');await mode('light');
    await navigate(role);await evaluate(`await chrome.runtime.sendMessage({type:${JSON.stringify(role==='hb'?'HCL_STORE':'FANATICAL_STORE')},operation:'patch',args:[{galacticLibraryExtensionId:${JSON.stringify(installed.gl.id)}}]});return true;`);
    const before=await evaluate(`return (await chrome.runtime.sendMessage(${JSON.stringify(installed.gl.id)},${JSON.stringify(request)})).results;`);
    assert(before?.[0]?.matches.length,'Control match missing');await mode('dark');await evaluate('const follow=document.querySelector("#appearance-follow-gl");follow.checked=true;follow.dispatchEvent(new Event("change"));return true;');await wait('GalacticHamsterTheme.page.preferences.followGl&&document.documentElement.dataset.ghTheme==="light"');assert.equal(await evaluate('return document.querySelector("#appearance-mode").disabled;'),true);
    await navigate('gl');await mode('dark');await navigate(role);await wait('document.documentElement.dataset.ghTheme==="dark"');
    const after=await evaluate(`return (await chrome.runtime.sendMessage(${JSON.stringify(installed.gl.id)},${JSON.stringify(request)})).results;`);assert.deepEqual(after,before);checks.push(role+': authorized native GL following on page open; local selector disabled; exact MATCH_ITEMS unchanged');
    // Unavailable same target retains its cache, then a changed target falls back.
    await evaluate('const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(...args)=>typeof args[0]==="string"&&args[1]?.type==="GET_APPEARANCE"?Promise.reject(Error("synthetic unavailable")):original(...args);return true;');
    // Service worker owns outbound transport; use a nonexistent paired target to
    // verify safe fallback through native messaging rather than this page wrapper.
    await evaluate(`await chrome.runtime.sendMessage({type:${JSON.stringify(role==='hb'?'HCL_STORE':'FANATICAL_STORE')},operation:'patch',args:[{galacticLibraryExtensionId:${JSON.stringify(firefox?'unavailable@galactichamster.com':'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')}}]});return true;`);
    await evaluate('await GalacticHamsterTheme.page.load(true);return true;');await wait('document.documentElement.dataset.ghTheme==="dark"');assert.equal((await evaluate('return GalacticHamsterTheme.page.preferences;')).followedMode,null);await mode('light',false);await wait('document.documentElement.dataset.ghTheme==="light"');checks.push(role+': unavailable/unpaired native target falls back; disabling follow restores independent mode');
  }
  for(const role of ['gl','hb','fan']){
    await navigate(role);
    const state=role==='gl'?await evaluate('const S=await import("./src/lib/storage.js");return JSON.stringify(await S.getDatabase());'):await evaluate(`return JSON.stringify((await chrome.storage.local.get({${role==='hb'?'libraryItems':'fanaticalLibraryItems'}:[]})).${role==='hb'?'libraryItems':'fanaticalLibraryItems'});`);
    assert.equal(state,protectedState[role],role+' theme altered library');checks.push(role+': protected database/local records remain byte-equivalent');
    if(role==='gl')await evaluate('const P=await import("./src/background/private-storage.js");const area=P.libraryStorageArea(chrome,indexedDB);const key="galacticLibraryUiPreferences",stored=await area.get({[key]:{}});delete stored[key].appearance;await area.set(stored);localStorage.removeItem("galacticHamsterAppearanceCacheV1");return true;');else await evaluate('await chrome.storage.local.remove("galacticHamsterAppearance");localStorage.removeItem("galacticHamsterAppearanceCacheV1");return true;');
    await navigate(role);await evaluate('await GalacticHamsterTheme.page.load();return true;');assert.equal(await evaluate('return document.documentElement.dataset.ghTheme;'),role==='gl'?'dark':'light');checks.push(role+': missing appearance on an existing installation retains legacy palette');
  }
  await writeFile(output,JSON.stringify({browser:kind,checks,screenshots},null,2)+'\n');checks.forEach(check=>console.log('PASS '+kind+' '+check));console.log(checks.length+' native theme checks passed.');
}catch(error){if(firefox&&driver)try{await driver.send('Marionette:SetContext',{value:'chrome'});const messages=await driver.send('WebDriver:ExecuteScript',{script:'return Services.console.getMessageArray().map(m=>m.message).slice(-12);',args:[],newSandbox:true});console.error(JSON.stringify(messages));}catch{}throw error;}finally{
  if(firefox)try{await driver?.send('WebDriver:DeleteSession');}catch{}
  child?.kill();if(exited)await exited;
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gh-theme-check-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
