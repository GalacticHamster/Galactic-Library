// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Galactic Hamster
// Opt-in live compatibility probe. Never part of npm test. Provider requests
// are read-only; extension state belongs only to a fresh disposable profile.
// Uses installed release packages, never personal browser state.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,readFile,writeFile,appendFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,projectRoot} from '../scripts/release.mjs';
import {PROVIDER_SITES} from '../src/ui/provider-accounts.js';

assert(process.argv.includes('--live'),'Live network access requires explicit --live.');
const out=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
assert(out,'Provide --output=PATH for sanitized live observations.');
const interactive=process.argv.includes('--interactive'),hold=process.argv.includes('--hold');
const faultPublic=process.argv.includes('--fault-public');
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7)?.split(',');
assert(!hold||interactive,'Interactive handoff requires --interactive.');
assert(!hold||!faultPublic,'Public fault checks and interactive handoff are separate runs.');
assert(!only||only.every(provider=>PROVIDER_SITES.some(site=>site.provider===provider)),'Unknown provider in --only.');
await writeFile(out,'',{flag:'wx'}); // Never mix a new run with previous evidence.
const temp=await mkdtemp(join(tmpdir(),'gh-live-provider-')),started=Date.now(),extensions={};
let child,driver,exited;
async function record(event,data={}){const row={event,elapsedMs:Date.now()-started,...data};await appendFile(out,JSON.stringify(row)+'\n');console.log(JSON.stringify(row));}
try{
 let binary;const candidates=[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe'];
 if(process.platform==='win32'){try{const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{encoding:'utf8',windowsHide:true}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}catch{}}
 for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}
 assert(binary,'Set FIREFOX_BIN to Firefox.');const profile=join(temp,'profile');await mkdir(profile);const port=await freePort();
 await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("browser.shell.checkDefaultBrowser",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("datareporting.healthreport.uploadEnabled",false);\nuser_pref("extensions.update.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
 child=spawn(binary,[...(!interactive?['--headless']:[]),'--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});exited=new Promise(r=>child.once('exit',r));
 driver=await firefoxMarionette(port);const session=await driver.send('WebDriver:NewSession',{});await driver.send('WebDriver:SetTimeouts',{pageLoad:20000,script:10000});await record('browser',{version:(session.value??session).capabilities?.browserVersion,isolated:true,interactive});
 async function privileged(script,args=[]){await driver.send('Marionette:SetContext',{value:'chrome'});try{const r=await driver.send('WebDriver:ExecuteScript',{script,args,newSandbox:true});return r.value??r;}finally{await driver.send('Marionette:SetContext',{value:'content'});}}
 async function evaluate(script){const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({problem:e.name}));',args:[],newSandbox:false});return r.value??r;}
 for(const role of ['gl','hb','fan']){
  const root=role==='gl'?projectRoot:resolve(projectRoot,role==='hb'?'../HB':'../Fanatical');let archive,manifest;
  if(role==='hb'){const stage=join(temp,'hb');await mkdir(stage);execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts/package-release.ps1'),'-Target','Firefox','-OutputDirectory',stage],{windowsHide:true,stdio:'pipe'});manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));archive=join(stage,'Humble-Comic-Library-'+manifest.version+'-firefox.zip');}
  else{const build=role==='gl'?createRelease:(await import(pathToFileURL(join(root,'scripts/release.mjs')))).createRelease,release=await build(root,undefined,'firefox');archive=join(temp,role+'.zip');manifest=JSON.parse(release.files.get('manifest.json'));await writeFile(archive,release.zip);}
  const r=await driver.send('Addon:Install',{path:archive,temporary:true}),id=r.value??r,base=await privileged('return WebExtensionPolicy.getByID(arguments[0]).getURL("");',[id]);extensions[role]={id,base,manifest};await record('installed',{role,id});
 }
 async function visit(provider,url,kind,{pageLink=false}={}){
  let navigation='complete';
  const previousOrigin=pageLink?await evaluate('return performance.timeOrigin;'):null;
  try{
   const clicked=pageLink&&await evaluate(`const a=[...document.querySelectorAll('a[href]')].find(a=>a.href===${JSON.stringify(url)});if(!a)return false;a.click();return true;`);
   if(clicked)navigation='page-link';else await driver.send('WebDriver:Navigate',{url});
  }catch(error){navigation=/timeout/i.test(error.message)?'timeout':'navigation-error';}
  await pause(2500);
  const observation=await evaluate(String.raw`
   const safeUrl=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return null;}};
   const text=(document.body?.innerText??'').toLowerCase(),auth=/sign[ -]?in|log[ -]?in/.test(location.pathname)||Boolean(document.querySelector('input[type="password"]'));
   const challenge=/captcha|verify you are human|access denied|unusual traffic|checking your browser|just a moment|robot check/.test(text+' '+document.title.toLowerCase());
   const selectors=['[id^="galactic-library-"][id$="-importer"]','[data-fanatical-library-summary]','[data-fanatical-library-for]','#hcl-summary','#hcl-progress','.hcl-status-button','#hcl-importer','#hcl-catalog-filters','[data-import-mode]','#data','#state','[data-aid]','[data-asin]','[data-testid]','a[href*="/books/"]','a[href*="/en/bundle/"]','a[href*="/en/pick-and-mix/"]'];
   return {url:safeUrl(location.href),title:document.title.slice(0,140),ready:document.readyState,httpStatus:performance.getEntriesByType('navigation')[0]?.responseStatus??null,authPage:auth,challenge,bodyPresent:Boolean(document.body),forms:document.forms.length,passwordFields:document.querySelectorAll('input[type="password"]').length,selectors:Object.fromEntries(selectors.map(s=>[s,document.querySelectorAll(s).length])),hosts:[...document.querySelectorAll('[id^="galactic-library-"][id$="-importer"]')].map(n=>({id:n.id,openShadow:Boolean(n.shadowRoot)})),publicLinks:[...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/^https:\/\/www\.(humblebundle|fanatical)\.com\/(books\/|games\/|software\/|en\/bundle\/|en\/pick-and-mix\/)/.test(h)).map(safeUrl).filter((v,i,a)=>a.indexOf(v)===i).slice(0,12)};
  `);
  await record('live-page',{provider,kind,requestedUrl:url,navigation,...observation});
  if(pageLink)await record('live-page-link-navigation',{provider,url,sameDocument:navigation==='page-link'&&previousOrigin===await evaluate('return performance.timeOrigin;')});
  if(!observation.challenge&&!observation.authPage&&kind==='public'&&observation.bodyPresent){const screenshot=await driver.send('WebDriver:TakeScreenshot',{});await writeFile(out+'.'+provider+'.png',Buffer.from(screenshot.value??screenshot,'base64'));}
  return observation;
 }
 if(!hold){
  for(const [provider,url] of [['humble','https://www.humblebundle.com/books'],['fanatical','https://www.fanatical.com/en/']]){
   if(only&&!only.includes(provider))continue;const page=await visit(provider,url,'public');
   if(!page.challenge)for(const link of page.publicLinks?.filter(l=>provider==='humble'?l.includes('/books/'):(l.includes('/en/bundle/')||l.includes('/en/pick-and-mix/'))&&!/\/bundle\/(?:games|mystery)$/.test(l)).slice(0,2)??[]){
    const detail=await visit(provider,link,'public',{pageLink:provider==='fanatical'});
    if(!detail.challenge&&!detail.authPage){
     const counts=await evaluate('return {humbleSummaries:document.querySelectorAll("#hcl-summary").length,humbleBadges:document.querySelectorAll(".hcl-status-button").length,fanaticalSummaries:document.querySelectorAll("[data-fanatical-library-summary]").length,fanaticalBadges:document.querySelectorAll("[data-fanatical-library-for]").length,providerControls:document.querySelectorAll("button,a[href],select").length};');
     await record('live-bundle-compatibility',{provider,url:link,...counts});
     assert.equal(counts[provider==='humble'?'humbleSummaries':'fanaticalSummaries'],1,'A live bundle must have exactly one ownership summary.');
     assert(counts[provider==='humble'?'humbleBadges':'fanaticalBadges']>0,'A live bundle must expose per-product ownership badges.');
     await driver.send('WebDriver:Refresh',{});await pause(3500);
     await record('live-bundle-reload',{provider,url:link,...await evaluate('return {humbleSummaries:document.querySelectorAll("#hcl-summary").length,humbleBadges:document.querySelectorAll(".hcl-status-button").length,fanaticalSummaries:document.querySelectorAll("[data-fanatical-library-summary]").length,fanaticalBadges:document.querySelectorAll("[data-fanatical-library-for]").length};')});
     if(provider==='fanatical'){
      await driver.send('WebDriver:Back',{});await pause(2000);
      const previous=await evaluate('return {path:location.pathname,summaries:document.querySelectorAll("[data-fanatical-library-summary]").length};');
      await driver.send('WebDriver:Forward',{});await pause(2500);
      const restored=await evaluate('return {path:location.pathname,summaries:document.querySelectorAll("[data-fanatical-library-summary]").length,badges:document.querySelectorAll("[data-fanatical-library-for]").length};');
      assert.equal(restored.path,new URL(link).pathname);assert.equal(restored.summaries,1);assert(restored.badges>0);
      await record('live-bundle-back-forward',{provider,url:link,previous,restored});
     }
    }
   }
  }
  for(const site of PROVIDER_SITES){
   if(only&&!only.includes(site.provider))continue;
   const page=await visit(site.provider,site.url,'import-entry');
   if(!page.challenge&&!page.authPage&&['steam','gog','epic','amazon-games','fandango-at-home','xbox'].includes(site.provider)&&page.url?.startsWith(new URL(site.url).origin)){
    assert.equal(page.hosts.length,1,'A supported live entry must have one GL importer host.');
   }
   if(faultPublic&&!page.challenge&&['steam','gog','epic'].includes(site.provider)){
    // Marionette does not expose WebDriver's shadow-root commands. Use the
    // installed extension's existing scripting authority and Firefox accessor;
    // do not change the site's closed roots or the shipping manifest.
    const handle=await driver.send('WebDriver:GetWindowHandle',{});
    const tab=await driver.send('WebDriver:NewWindow',{type:'tab'});
    await driver.send('WebDriver:SwitchToWindow',{handle:(tab.value??tab).handle});
    await driver.send('WebDriver:Navigate',{url:extensions.gl.base+'options.html'});
    const inspect=action=>evaluate(`
     const tab=(await browser.tabs.query({})).find(t=>t.url?.startsWith(${JSON.stringify(new URL(site.url).origin)}));
     if(!tab)throw Error('Missing isolated provider tab');
     const results=await browser.scripting.executeScript({target:{tabId:tab.id},func:(action)=>{
      const host=document.querySelector('[id^="galactic-library-"][id$="-importer"]');
      const root=host.openOrClosedShadowRoot,button=root.querySelector('[data-mode="full"], [data-import-action]');
      if(action==='click')button.click();
      return {disabled:button.disabled,message:root.querySelector('[data-import-status]').textContent};
     },args:[${JSON.stringify(action)}]});return results[0].error?{problem:String(results[0].error.message??results[0].error)}:results[0].result;
    `);
    const initial=await inspect('click');assert(!initial.problem,JSON.stringify(initial));await record('live-import-click',{provider:site.provider,initial});
    let message='',disabled=true;
    for(let attempt=0;attempt<35;attempt++){
     await pause(1000);
     const status=await inspect('read');assert(!status.problem,JSON.stringify(status));if(attempt===0)await record('live-import-first-status',{provider:site.provider,status});message=status.message;disabled=status.disabled;
     if(!status.disabled)break;
    }
    await record('live-unauthenticated-import',{provider:site.provider,message});
    assert.equal(disabled,false,'A failed signed-out import must release its busy state.');
    assert.match(message,/sign(?:ed)?[ -]?in|log(?:ged)?[ -]?in|session|authoriz/i,'An unauthenticated import must finish with sign-in guidance.');
    await driver.send('WebDriver:CloseWindow',{});
    await driver.send('WebDriver:SwitchToWindow',{handle:handle.value??handle});
   }
  }
  // Private library state is read only through the extension's own UI/worker.
  await driver.send('WebDriver:Navigate',{url:extensions.gl.base+'options.html'});
  const saved=await evaluate('const S=await import("./src/lib/storage.js"),d=await S.getDatabase();return {records:Object.keys(d.providerItems).length,history:Object.keys(d.providerHistory).length};');assert.equal(saved.records,0);assert.equal(saved.history,0);await record('passive-navigation-library-invariant',saved);
 }else{
  await driver.send('WebDriver:Navigate',{url:extensions.gl.base+'options.html#providers'});
  for(const provider of only??['humble','fanatical','nintendo']){const site=PROVIDER_SITES.find(s=>s.provider===provider);if(!site)continue;const tab=await driver.send('WebDriver:NewWindow',{type:'tab'});await driver.send('WebDriver:SwitchToWindow',{handle:(tab.value??tab).handle});try{await driver.send('WebDriver:Navigate',{url:site.url});}catch{}await record('isolated-login-tab',{provider,url:site.url});}
  await record('ready-for-user-login',{profile,port,instructions:'Sign in only in this separate test window, then tell the assistant which provider is ready. Do not export cookies or credentials.'});
  // Handshake file exposes only local test-control metadata, never site state.
  await writeFile(out+'.control.json',JSON.stringify({port,profile,extensions},null,2));
  const stop=out+'.stop';let lastCommand;
  for(let n=0;n<3600;n++){
   try{await access(stop);break;}catch{}
   let request;try{request=JSON.parse(await readFile(out+'.command.json','utf8'));}catch{}
   if(request?.id&&request.id!==lastCommand){
    lastCommand=request.id;let result;
    try{
     if(request.operation==='evaluate')result=await evaluate(request.script);
     else if(request.operation==='webdriver')result=await driver.send(request.method,request.params??{});
     else throw Error('Unsupported isolated test operation');
     await writeFile(out+'.response.json',JSON.stringify({id:request.id,result}));
    }catch(error){await writeFile(out+'.response.json',JSON.stringify({id:request.id,error:{name:error.name,message:error.message}}));}
   }
   await pause(1000);
  }
 }
 await record('complete',hold?{mode:'interactive-handoff',authenticatedImports:'recorded separately by the interactive test operator'}:{mode:'public',authenticatedImports:0});
}catch(error){await record('failure',{name:error.name,message:error.message.replace(/https?:\/\/[^\s]+/g,'[URL]')});throw error;}
finally{if(driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}driver?.close();child?.kill();if(exited)await Promise.race([exited,pause(3000)]);const target=resolve(temp),parent=resolve(tmpdir());if(!target.startsWith(parent+sep)||!target.slice(parent.length+1).startsWith('gh-live-provider-'))throw Error('Unsafe live-profile cleanup path');await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
