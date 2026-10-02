import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,projectRoot} from '../scripts/release.mjs';

const candidates=[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe'];
if(process.platform==='win32'){try{const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}catch{}}
let binary;for(const candidate of candidates.filter(Boolean))try{await access(candidate);binary=candidate;break;}catch{}
if(!binary)throw Error('Set FIREFOX_BIN to the Firefox binary.');
if(process.argv.slice(2).some(arg=>arg!=='--companions'))throw Error('Usage: node tests/firefox.mjs [--companions]');
const temporary=await mkdtemp(join(tmpdir(),'gl-firefox-test-'));let child,driver,exited;
try{
  const profile=join(temporary,'profile');await mkdir(profile);const port=await freePort();await writeFile(join(profile,'user.js'),`user_pref("marionette.port", ${port});\nuser_pref("browser.shell.checkDefaultBrowser",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("datareporting.healthreport.uploadEnabled",false);\nuser_pref("extensions.update.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});driver=await firefoxMarionette(port);await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
  async function install(root,name){const release=await createRelease(root,undefined,'firefox'),archive=join(temporary,name+'.zip');await writeFile(archive,release.zip);const response=await driver.send('Addon:Install',{path:archive,temporary:true});return {id:response.value??response,manifest:JSON.parse(release.files.get('manifest.json'))};}
  async function navigate(id,path){await driver.send('Marionette:SetContext',{value:'chrome'});const response=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL(arguments[1]);',args:[id,path],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url:response.value??response});}
  async function evaluate(script){const response=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],error=>arguments[arguments.length-1]({error:error.message+"\\n"+error.stack}));',args:[],newSandbox:false});const value=response.value??response;assert.equal(value?.error,undefined,value?.error);return value;}
  const installed=await install(projectRoot,'GL');await navigate(installed.id,installed.manifest.options_page);
  const checks=await evaluate(`
    const S=await import('./src/lib/storage.js'),P=await import('./src/background/private-storage.js');
    await S.mergeProviderItems('gog',[{providerItemId:'native',title:'Native Firefox software',mediaType:'software',ownership:'owned'}]);await S.saveGoogleBooksApiKey('SYNTHETIC-PRIVATE-API-KEY');
    const database=await S.getDatabase();if(database.providerItems['gog:native'].title!=='Native Firefox software')throw Error('Module background writer unavailable');
    const publicState=await chrome.storage.local.get(null);if(JSON.stringify(publicState).includes('Native Firefox')||JSON.stringify(publicState).includes('PRIVATE-API-KEY'))throw Error('Private state leaked to public storage.local');
    const area=P.createPrivateStorage(indexedDB),second=await area.get({'googleBooksApiKey':''});if(second.googleBooksApiKey!=='SYNTHETIC-PRIVATE-API-KEY')throw Error('Reopened private storage lost its key');
    const before=JSON.stringify(database);try{await S.restoreDatabase({...database,providerItems:{bad:{provider:'gog'}}});throw Error('Invalid restore accepted');}catch(error){if(error.message==='Invalid restore accepted')throw error;}if(JSON.stringify(await S.getDatabase())!==before)throw Error('Invalid restore was not atomic');
    const backup=S.createBackup(database);await S.clearDatabase();await S.restoreDatabase(S.parseBackup(backup));if(!(await S.getDatabase()).providerItems['gog:native'])throw Error('Backup round-trip failed');
    await area.set({'adapter-test':{safe:'before'}});try{await area.set({'adapter-test':{safe:'after'},invalid:()=>{}});}catch{}if((await area.get('adapter-test'))['adapter-test'].safe!=='before')throw Error('IndexedDB did not roll back a failed multi-key write');await area.remove('adapter-test');
    return ['module event page and queued library writer','library/API keys stay outside public storage.local','private database survives a new connection','invalid restore is atomic','backup round-trip','failed multi-key private write rolls back'];
  `);checks.forEach(name=>console.log('PASS installed Firefox GL: '+name));
  // Cross-extension integration is added below once the receivers are ported.
}finally{
  driver?.close();if(child){child.kill();await Promise.race([exited,pause(3000)]);}
  const target=resolve(temporary),base=resolve(tmpdir());if(!target.startsWith(base+sep)||!target.slice(base.length+1).startsWith('gl-firefox-test-'))throw Error('Unsafe Firefox test cleanup.');await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
