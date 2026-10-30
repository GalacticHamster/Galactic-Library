// Installed Firefox permission-prompt regression; disposable storage and synthetic responses only.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
import {freePort,firefoxMarionette} from './native-protocol.mjs';

const temporary=await mkdtemp(join(tmpdir(),'gl-metadata-consent-'));
let child,driver,exited;
const checks=[];
try{
  const {files:releaseFiles}=await createRelease(undefined,undefined,'firefox'),files=new Map(releaseFiles);
  // Keep the real worker/permission gate; replace only HTTP acquisition in this disposable copy.
  const worker='src/background/service-worker.js';
  files.set(worker,Buffer.from(files.get(worker).toString()+`
globalThis.fetch=async()=>{const saved=await chrome.storage.session.get({rcMetadataRequests:0});await chrome.storage.session.set({rcMetadataRequests:saved.rcMetadataRequests+1});return {ok:true,json:async()=>({docs:[],items:[]})};};
`));
  const archive=join(temporary,'GL.zip'),profile=join(temporary,'profile');await writeFile(archive,runtimeZip(files));await mkdir(profile);
  const port=await freePort();await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\n`);
  let binary=process.env.FIREFOX_BIN||'C:/Program Files/Mozilla Firefox/firefox.exe';
  if(process.platform==='win32'&&!process.env.FIREFOX_BIN){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)binary=join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe');}
  child=spawn(binary,['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));
  driver=await firefoxMarionette(port);await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
  await driver.send('Addon:Install',{path:archive,temporary:true});
  await driver.send('Marionette:SetContext',{value:'chrome'});
  const urlResponse=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID("galactic-library@galactichamster.com").getURL("options.html#settings");',args:[],newSandbox:true});
  const url=urlResponse.value??urlResponse;await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url});
  async function evaluate(script){const reply=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:e.message}));',args:[],newSandbox:false});const value=reply.value??reply;assert.equal(value?.error,undefined,value?.error);return value;}
  async function wait(script){for(let n=0;n<150;n++){if(await evaluate(script))return;await pause(30);}throw Error('Installed metadata UI did not settle.');}
  await wait("return !!document.querySelector('[data-metadata-permission-status]')?.textContent;");
  assert.equal(await evaluate("return (await browser.permissions.getAll()).data_collection.length;"),0);
  assert.equal(await evaluate("return (await chrome.runtime.sendMessage({type:'SEARCH_OPEN_LIBRARY',query:{title:'Synthetic book'}})).ok;"),false);
  assert.equal(await evaluate("return (await chrome.storage.session.get({rcMetadataRequests:0})).rcMetadataRequests;"),0);
  checks.push('fresh Firefox denies outbound metadata before consent');

  async function decide(service,allow){
    await evaluate("document.querySelector('#book-service-setup').open=true;return true;");
    const element=await driver.send('WebDriver:FindElement',{using:'css selector',value:`[data-allow-metadata="${service}"]`});
    const id=(element.value??element)['element-6066-11e4-a52e-4f735466cecf'];
    await driver.send('WebDriver:ElementClick',{id});
    await driver.send('Marionette:SetContext',{value:'chrome'});
    let clicked=false;
    for(let n=0;n<100;n++){
      const reply=await driver.send('WebDriver:ExecuteScript',{script:`const n=document.getElementById('addon-webext-permissions-notification');const b=n?.${allow?'button':'secondaryButton'};if(!n||n.hidden||!b||!PopupNotifications.panel.state.includes('open'))return false;b.click();return true;`,args:[],newSandbox:true});
      if(reply.value??reply){clicked=true;break;}await pause(30);
    }
    await driver.send('Marionette:SetContext',{value:'content'});assert(clicked,'Native Firefox permission prompt not observed');
    await pause(100);
  }
  await decide('Open Library',false);
  await wait("return document.querySelector('[data-metadata-permission-status]').textContent.includes('not granted');");
  assert.equal(await evaluate("return await browser.permissions.contains({data_collection:['websiteContent']});"),false);
  checks.push('real Firefox permission prompt declines without granting access');
  await decide('Open Library',true);
  await wait("return document.querySelector('[data-allow-metadata=\"Open Library\"]').disabled;");
  assert.equal(await evaluate("return await browser.permissions.contains({data_collection:['websiteContent']});"),true);
  assert.equal(await evaluate("return await browser.permissions.contains({data_collection:['authenticationInfo']});"),false);
  assert.equal(await evaluate("return (await chrome.runtime.sendMessage({type:'SEARCH_OPEN_LIBRARY',query:{title:'Synthetic book'}})).ok;"),true);
  checks.push('real Firefox grant authorizes bibliographic content but not Google credentials');
  await driver.send('WebDriver:Navigate',{url});
  await wait("return document.querySelector('[data-allow-metadata=\"Open Library\"]')?.disabled===true;");
  checks.push('native permission and settings state survive reload');
  await decide('Google Books',true);
  assert.equal(await evaluate("return await browser.permissions.contains({data_collection:['websiteContent','authenticationInfo']});"),true);
  assert.equal(await evaluate("const S=await import('./src/lib/storage.js');await S.saveGoogleBooksApiKey('SyntheticPrivateApiKey');return (await chrome.runtime.sendMessage({type:'SEARCH_GOOGLE_BOOKS',query:{title:'Synthetic book'}})).ok;"),true);
  checks.push('Google Books explicitly grants both categories and permits its request');
  await evaluate("await browser.permissions.remove({data_collection:['websiteContent']});return true;");
  assert.equal(await evaluate("return (await chrome.runtime.sendMessage({type:'SEARCH_OPEN_LIBRARY_EDITION',isbn:'9780306406157'})).ok;"),false);
  assert.equal(await evaluate("return (await chrome.storage.session.get({rcMetadataRequests:0})).rcMetadataRequests;"),2);
  checks.push('native revocation blocks subsequent work/edition traffic');
  await evaluate("const S=await import('./src/lib/storage.js');await S.mergeProviderItems('kindle',[{providerItemId:'B000000001',title:'Synthetic queued book',mediaType:'book',ownership:'owned'}],{profileLabel:'Synthetic'});return true;");
  await driver.send('WebDriver:Navigate',{url:url.split('#')[0]+'#books'});
  await wait("return document.querySelector('#start-google-books-enrichment')?.disabled===false;");
  await evaluate("document.querySelector('#start-google-books-enrichment').click();return true;");
  await wait("return document.querySelector('#google-books-enrichment-status').textContent.includes('permission denied');");
  assert.equal(await evaluate("const S=await import('./src/lib/storage.js'),job=await S.getGoogleBooksEnrichmentJob();return job.cursor;"),0);
  assert.equal(await evaluate("return (await chrome.storage.session.get({rcMetadataRequests:0})).rcMetadataRequests;"),2);
  assert.equal(await evaluate("const S=await import('./src/lib/storage.js'),db=await S.getDatabase();return Object.values(S.parseBackup(S.createBackup(db)).providerItems).filter(i=>i.title==='Synthetic queued book'&&i.ownership==='owned').length;"),1);
  checks.push('revoked bulk lookup pauses at its existing cursor and preserves library/backup');
  checks.forEach(value=>console.log('PASS installed Firefox metadata consent: '+value));
  console.log(checks.length+' installed Firefox metadata consent checks passed.');
}finally{
  if(driver)try{await driver.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}
  child?.kill();driver?.close?.();if(exited)await exited;
  if(resolve(temporary).startsWith(resolve(tmpdir())+sep)&&temporary.includes('gl-metadata-consent-'))await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
