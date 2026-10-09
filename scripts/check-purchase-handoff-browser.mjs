// Offline native extension checks. Own disposable profiles; no user libraries.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {outputPath} from './audit-artifacts.mjs';
import {createRelease,projectRoot} from './release.mjs';
import {chromePipe,freePort,firefoxMarionette} from '../tests/native-protocol.mjs';

const firefox=process.argv.includes('--firefox'),kind=firefox?'firefox':'chrome';
const hbRoot=resolve(projectRoot,'../HB'),fanRoot=resolve(projectRoot,'../Fanatical');
const temporary=await mkdtemp(join(tmpdir(),'gh-purchase-check-'));
const output=await outputPath('audit-artifacts/purchase-handoff/'+kind+'/results.json');
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
    if(firefox){const response=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],error=>arguments[arguments.length-1]({_scriptFailure:error.message+"\\n"+error.stack}));',args:[],newSandbox:false});const value=response.value??response;assert.equal(value?._scriptFailure,undefined,value?._scriptFailure);return value;}
    const response=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert.equal(response.exceptionDetails,undefined,JSON.stringify(response.exceptionDetails));return response.result.value;
  }
  async function wait(expression){for(let attempt=0;attempt<250;attempt++){try{if(await evaluate('return '+expression+';'))return;}catch{}await pause(30);}throw Error('Timed out: '+expression+' '+JSON.stringify(await evaluate('return {url:location.href,id:chrome.runtime.id,hosts:[...document.querySelectorAll("[data-purchase-handoff]")].map(node=>({provider:node.dataset.provider,busy:node.getAttribute("aria-busy"),status:node.querySelector("[role=status]")?.textContent}))};')));}
  const measurements=[];
  const call=(role,action,provider,fields={})=>evaluate(`return chrome.runtime.sendMessage(${JSON.stringify({type:'GH_PURCHASE_ACTION',action,provider,...fields})});`);
  const state=async(role,provider)=>{await navigate(role);const value=await call(role,'state',provider);assert.equal(value.ok,true,value.error);return value;};
  await navigate('gl');await evaluate(`const S=await import('./src/lib/storage.js');await S.addAllowedExternalClientId(${JSON.stringify(installed.hb.id)});await S.addAllowedExternalClientId(${JSON.stringify(installed.fan.id)});return true;`);
  for(const role of ['hb','fan']){
    await navigate(role);await evaluate(`await chrome.runtime.sendMessage({type:${JSON.stringify(role==='hb'?'HCL_STORE':'FANATICAL_STORE')},operation:'patch',args:[{galacticLibraryExtensionId:${JSON.stringify(installed.gl.id)}}]});return true;`);
    await navigate('gl');const linked=await call('gl','remoteAccounts',role==='hb'?'humble':'fanatical',{peerId:installed[role].id});assert.equal(linked.ok,true,linked.error);
  }
  for(const role of ['hb','fan']){
    const provider=role==='hb'?'humble':'fanatical';await navigate(role);
    const seed=await evaluate(`const role=${JSON.stringify(role)},items=[];for(let n=0;n<6321;n++){const purchase='purchase_'+Math.floor(n/20),bundle='Synthetic bundle '+Math.floor(n/20),title=role+' Synthetic book '+n;const bytes=new TextEncoder().encode(purchase),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');items.push(role==='hb'?{providerItemId:purchase+':product:product_'+n,title,kind:'book',source:'humble',purchaseKey:purchase,sourceBundle:bundle,purchasedAt:'2026-10-01T00:00:00.000Z',authors:['Synthetic Author'],publisher:'Synthetic Press',edition:'First',formats:['epub','pdf'],entitlement:'direct-download',provenance:[{providerItemId:purchase+':product:product_'+n,title,purchaseKey:purchase,sourceBundle:bundle,purchasedAt:'2026-10-01T00:00:00.000Z',entitlement:'direct-download'}]}:{source:'fanatical',sourceItemId:'product_'+n,title,mediaType:'book',authors:['Synthetic Author'],publisher:'Synthetic Press',edition:'First',formats:['epub','pdf'],bundle:{sourceItemId:'bundle_'+Math.floor(n/20),title:bundle},purchaseDate:'2026-10-01T00:00:00.000Z',purchaseOrigins:[{purchaseRef:hash,bundle:{sourceItemId:'bundle_'+Math.floor(n/20),title:bundle},purchaseDate:'2026-10-01T00:00:00.000Z',quantity:n===0?2:1}]});}await chrome.storage.local.set(role==='hb'?{humbleProfileLabel:'Personal',libraryItems:items}:{fanaticalProfileLabel:'Personal',fanaticalLibraryItems:items});return {ok:true};`);assert.equal(seed.ok,true,seed.error);
    const source=(await state(role,provider)).accounts[0];
    await navigate('gl');const invalid=await call('gl','import',provider,{peerId:installed[role].id,accountRef:source.accountRef,target:{newLabel:'Personal',expectedActiveId:null}});assert.equal(invalid.ok,false);assert.match(invalid.error,/Confirm/);
    const started=Date.now();const result=await call('gl','import',provider,{peerId:installed[role].id,accountRef:source.accountRef,confirmed:true,target:{newLabel:'Personal',expectedActiveId:null}});assert.equal(result.ok,true,result.error);assert.equal(result.added,6321);assert.equal(result.received,6321);
    measurements.push({direction:role+' -> GL',...result,wallMs:Date.now()-started});
    const target=(await state('gl',provider)).accounts.find(v=>v.label==='Personal');
    const again=await call('gl','import',provider,{peerId:installed[role].id,accountRef:source.accountRef,confirmed:true,target});assert.equal(again.ok,true,again.error);assert.equal(again.unchanged,6321);assert.equal(again.added,0);
    const query={type:'MATCH_ITEMS',apiVersion:1,items:[{requestId:'test',title:role+' Synthetic book 1',mediaType:'book',excludeProviders:[provider==='humble'?'fanatical':'humble']}]};
    await navigate(role);const beforeQuery=await evaluate(`return chrome.runtime.sendMessage(${JSON.stringify(installed.gl.id)},${JSON.stringify(query)});`);assert.equal(beforeQuery.ok,true,beforeQuery.error);assert.equal(beforeQuery.results[0].owned,true);
    // Empty only this disposable companion's native rows, retaining its account.
    const cleared=await evaluate(`await chrome.storage.local.set(${JSON.stringify(role==='hb'?{libraryItems:[],purchaseSummaries:[]}:{fanaticalLibraryItems:[]})});return {ok:true};`);assert.equal(cleared.ok,true,cleared.error);
    const empty=(await state(role,provider)).accounts[0];
    await navigate('gl');const databaseBefore=await evaluate('const S=await import("./src/lib/storage.js");const value=JSON.stringify(await S.getDatabase());return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,"0")).join("");');
    const offered=await call('gl','send',provider,{peerId:installed[role].id,accountRef:target.accountRef});assert.equal(offered.ok,true,offered.error);assert.equal(offered.offered,true);assert.equal(offered.count,6321);
    const offer=(await state(role,provider)).offer;assert.equal(offer.manifest.count,6321);assert(offer.manifest.chunkCount>1);assert(offer.manifest.bytes>1000000);
    const importStart=Date.now();const reverse=await call(role,'import',provider,{useOffer:true,offerToken:offer.manifest.token,accountRef:target.accountRef,confirmed:true,target:{accountRef:empty.accountRef}});assert.equal(reverse.ok,true,reverse.error);assert.equal(reverse.added,6321);
    measurements.push({direction:'GL -> '+role,...reverse,wallMs:Date.now()-importStart,bytes:offer.manifest.bytes,chunkCount:offer.manifest.chunkCount});
    const imported=(await state(role,provider)).accounts[0];assert.equal(imported.count,6321);
    const repeat=await call(role,'import',provider,{accountRef:target.accountRef,confirmed:true,target:{accountRef:imported.accountRef}});assert.equal(repeat.ok,true,repeat.error);assert.equal(repeat.unchanged,6321);
    const record=await evaluate(`return (await chrome.storage.local.get({${role==='hb'?'libraryItems':'fanaticalLibraryItems'}:[]})).${role==='hb'?'libraryItems':'fanaticalLibraryItems'}[0];`);assert.equal(record.title,role+' Synthetic book 0');assert.deepEqual(record.authors,['Synthetic Author']);assert.equal(record.edition,'First');if(role==='fan')assert.equal(record.publisher,'Synthetic Press');assert.equal(role==='hb'?record.provenance[0].sourceBundle:record.purchaseOrigins[0].bundle.title,'Synthetic bundle 0');if(role==='fan')assert.equal(record.purchaseOrigins[0].quantity,2);
    // Exercise the real Options controller, not only its worker API.
    await evaluate('const host=document.querySelector("[data-purchase-handoff]");host.closest("details").open=true;[...host.querySelectorAll("button")].find(button=>button.textContent==="Refresh account choices").click();return true;');
    await wait('document.querySelector("[data-purchase-handoff]").getAttribute("aria-busy")==="false"&&document.querySelector("[data-purchase-handoff] [role=status]").textContent.includes("Account choices loaded")');
    assert.equal(await evaluate('return document.querySelectorAll("[data-purchase-handoff] select")[2].value;'),'');
    await evaluate(`const host=document.querySelector('[data-purchase-handoff]'),selects=host.querySelectorAll('select');selects[1].value=${JSON.stringify(target.accountRef)};selects[2].value=${JSON.stringify(imported.accountRef)};host.querySelector('input[type=checkbox]').checked=true;[...host.querySelectorAll('button')].find(button=>button.textContent.startsWith('Import saved')).click();return true;`);
    await wait('document.querySelector("[data-purchase-handoff]").getAttribute("aria-busy")==="false"&&document.querySelector("[data-purchase-handoff] [role=status]").textContent.includes("Import committed")');assert((await evaluate('return document.querySelector("[data-purchase-handoff] [role=status]").textContent;')).includes('6321 unchanged'));checks.push(provider+': real manual Options controls require account choice and report committed repeat counts');
    const afterQuery=await evaluate(`return chrome.runtime.sendMessage(${JSON.stringify(installed.gl.id)},${JSON.stringify(query)});`);assert.deepEqual(afterQuery.results,beforeQuery.results);
    await navigate('gl');assert.equal(await evaluate('const S=await import("./src/lib/storage.js");const value=JSON.stringify(await S.getDatabase());return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,"0")).join("");'),databaseBefore);
    // Preparing is worker-owned: closing the source Options document is harmless.
    const current=(await state(role,provider)).accounts[0];await navigate('gl');const grant=await evaluate(`return chrome.runtime.sendMessage(${JSON.stringify(installed[role].id)},{type:'GH_PURCHASE_BEGIN',provider:${JSON.stringify(provider)},protocolVersion:1,accountRef:${JSON.stringify(current.accountRef)}});`);assert.equal(grant.ok,true,grant.error);
    const chunk=await evaluate(`return chrome.runtime.sendMessage(${JSON.stringify(installed[role].id)},{type:'GH_PURCHASE_CHUNK',provider:${JSON.stringify(provider)},protocolVersion:1,token:${JSON.stringify(grant.manifest.token)},index:0});`);assert.equal(chunk.ok,true,chunk.error);
    await evaluate(`return chrome.runtime.sendMessage(${JSON.stringify(installed[role].id)},{type:'GH_PURCHASE_CANCEL',provider:${JSON.stringify(provider)},protocolVersion:1,token:${JSON.stringify(grant.manifest.token)}});`);
    checks.push(provider+': source Options closure does not lose worker staging; cancel leaves libraries intact');
    checks.push(provider+': 6,321 native rows both directions, atomic imports/repeats, purchase associations, source unchanged and matching equal');
  }
  await navigate('hb');for(const message of [{type:'GH_PURCHASE_CAPABILITIES',protocolVersion:2,provider:'humble'},{type:'GH_PURCHASE_CAPABILITIES',protocolVersion:1,provider:'fanatical'},{type:'GH_PURCHASE_IMPORT',protocolVersion:1,provider:'humble'}]){const response=await evaluate(`return chrome.runtime.sendMessage(${JSON.stringify(installed.gl.id)},${JSON.stringify(message)});`);assert.equal(response.ok,false);}
  checks.push('native external messaging rejects incompatible version, wrong provider role and external import');
  const missing=await evaluate(`return chrome.runtime.sendMessage({type:'HCL_STORE',operation:'patch',args:[{galacticLibraryExtensionId:${JSON.stringify(firefox?'missing@galactichamster.invalid':'a'.repeat(32))}}]});`);assert.equal(missing.ok,true);const absent=await call('hb','remoteAccounts','humble');assert.equal(absent.ok,false);checks.push('missing paired GL reports failure without modifying library');
  await writeFile(output,JSON.stringify({browser:kind,checks,measurements},null,2)+'\n');checks.forEach(check=>console.log('PASS '+kind+' '+check));console.log(JSON.stringify(measurements));
}catch(error){if(firefox&&driver)try{await driver.send('Marionette:SetContext',{value:'chrome'});const messages=await driver.send('WebDriver:ExecuteScript',{script:'return Services.console.getMessageArray().map(m=>m.message).slice(-12);',args:[],newSandbox:true});console.error(JSON.stringify(messages));}catch{}throw error;}finally{
  if(firefox)try{await driver?.send('WebDriver:DeleteSession');}catch{}
  child?.kill();if(exited)await exited;
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gh-theme-check-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
