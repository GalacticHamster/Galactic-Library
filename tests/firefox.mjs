import assert from 'node:assert/strict';
import {verifyFirefoxImporters} from './firefox-importers.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {access,readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,projectRoot} from '../scripts/release.mjs';
import {seedConsoleCompanionLibrary,checkConsoleCompanionResults} from './fixtures/console-companion-native.mjs';

const candidates=[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe'];
if(process.platform==='win32'){try{const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}catch{}}
let binary;for(const candidate of candidates.filter(Boolean))try{await access(candidate);binary=candidate;break;}catch{}
if(!binary)throw Error('Set FIREFOX_BIN to the Firefox binary.');
if(process.argv.slice(2).some(arg=>arg!=='--companions'))throw Error('Usage: node tests/firefox.mjs [--companions]');
const temporary=await mkdtemp(join(tmpdir(),'gl-firefox-test-'));let child,driver,exited;
try{
  const profile=join(temporary,'profile');await mkdir(profile);const port=await freePort();await writeFile(join(profile,'user.js'),`user_pref("marionette.port", ${port});\nuser_pref("browser.shell.checkDefaultBrowser",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("datareporting.healthreport.uploadEnabled",false);\nuser_pref("extensions.update.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});driver=await firefoxMarionette(port);await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
  async function install(root,name){const builder=await import(pathToFileURL(join(root,'scripts/release.mjs'))),release=await builder.createRelease(root,undefined,'firefox'),archive=join(temporary,name+'.zip');await writeFile(archive,release.zip);const response=await driver.send('Addon:Install',{path:archive,temporary:true});return {id:response.value??response,manifest:JSON.parse(release.files.get('manifest.json'))};}
  async function navigate(id,path){await driver.send('Marionette:SetContext',{value:'chrome'});const response=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL(arguments[1]);',args:[id,path],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url:response.value??response});}
  async function evaluate(script){const response=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],error=>arguments[arguments.length-1]({error:error.message+"\\n"+error.stack}));',args:[],newSandbox:false});const value=response.value??response;assert.equal(value?.error,undefined,value?.error);return value;}
  const installed=await install(projectRoot,'GL');await navigate(installed.id,installed.manifest.options_page);
  const checks=await evaluate(`
    const S=await import('./src/lib/storage.js'),P=await import('./src/background/private-storage.js');
    const manifest=chrome.runtime.getManifest();if(!manifest.permissions.includes('alarms')||manifest.optional_permissions.includes('alarms')||!manifest.optional_permissions.includes('notifications'))throw Error('Firefox reminder permission declarations are invalid');
    if(!await chrome.permissions.contains({permissions:['alarms']}))throw Error('Required alarm permission was not granted');if(await chrome.permissions.contains({permissions:['notifications']}))throw Error('Desktop notifications enabled without opt-in');
    await chrome.alarms.create('gl-test-permission',{delayInMinutes:60});if(!await chrome.alarms.get('gl-test-permission'))throw Error('Required alarm API unavailable');await chrome.alarms.clear('gl-test-permission');
    const R=await import('./src/ui/reminders.js');let requested;await R.requestReminderPermissions({runtime:chrome.runtime,permissions:{request:async value=>{requested=value;return false;}}});if(JSON.stringify(requested)!==JSON.stringify({permissions:['notifications']}))throw Error('Firefox reminder request includes a required permission');
    await S.mergeProviderItems('gog',[{providerItemId:'native',title:'Native Firefox software',mediaType:'software',ownership:'owned'}]);await S.saveGoogleBooksApiKey('SYNTHETIC-PRIVATE-API-KEY');
    const database=await S.getDatabase();if(database.providerItems['gog:native'].title!=='Native Firefox software')throw Error('Module background writer unavailable');
    const publicState=await chrome.storage.local.get(null);if(JSON.stringify(publicState).includes('Native Firefox')||JSON.stringify(publicState).includes('PRIVATE-API-KEY'))throw Error('Private state leaked to public storage.local');
    const area=P.createPrivateStorage(indexedDB),second=await area.get({'googleBooksApiKey':''});if(second.googleBooksApiKey!=='SYNTHETIC-PRIVATE-API-KEY')throw Error('Reopened private storage lost its key');
    const before=JSON.stringify(database);try{await S.restoreDatabase({...database,providerItems:{bad:{provider:'gog'}}});throw Error('Invalid restore accepted');}catch(error){if(error.message==='Invalid restore accepted')throw error;}if(JSON.stringify(await S.getDatabase())!==before)throw Error('Invalid restore was not atomic');
    const backup=S.createBackup(database);await S.clearDatabase();await S.restoreDatabase(S.parseBackup(backup));if(!(await S.getDatabase()).providerItems['gog:native'])throw Error('Backup round-trip failed');
    await area.set({'adapter-test':{safe:'before'}});try{await area.set({'adapter-test':{safe:'after'},invalid:()=>{}});}catch{}if((await area.get('adapter-test'))['adapter-test'].safe!=='before')throw Error('IndexedDB did not roll back a failed multi-key write');await area.remove('adapter-test');
    return ['valid Firefox reminder manifest, required alarms and opt-in notifications','reminder permission request uses only the installed optional notification permission','module event page and queued library writer','library/API keys stay outside public storage.local','private database survives a new connection','invalid restore is atomic','backup round-trip','failed multi-key private write rolls back'];
  `);checks.forEach(name=>console.log('PASS installed Firefox GL: '+name));
  const emptyCheck=await evaluate(`
    const S=await import('./src/lib/storage.js'),P=await import('./src/background/private-storage.js'),client=S.createStorageClient(message=>chrome.runtime.sendMessage(message)),area=P.createPrivateStorage(indexedDB);
    await S.mergeProviderItems('steam',[{providerItemId:'empty-native',title:'Disposable empty-check game',mediaType:'game',ownership:'owned'}],{profileLabel:'Empty check fixture',fullSyncAt:'2026-01-01'});
    const baseline=(await area.get({galacticLibraryDatabase:null})).galacticLibraryDatabase;
    for(let pass=0;pass<2;pass++){
      const scan=await client.beginProviderScan('steam','Empty check fixture','incremental',false,1);
      await client.commitProviderScan('steam',[],{syncMode:'incremental',quickSyncAt:'2026-10-16'},null,scan.scanToken,1);
    }
    const stored=await area.get({galacticLibraryDatabase:null,galacticLibraryProviderChecks:null});
    if(JSON.stringify(stored.galacticLibraryDatabase)!==JSON.stringify(baseline))throw Error('Empty checks rewrote private database');
    if(!stored.galacticLibraryProviderChecks)throw Error('Check receipt not saved privately');
    const view=await S.getCommittedLibraryView();if(view.database.providers.steam.quickSyncAt!=='2026-10-16T00:00:00.000Z')throw Error('Check missing from Providers');
    const partial=await client.beginProviderScan('steam','Empty check fixture','incremental',false,1);
    await client.commitProviderScan('steam',[],{syncMode:'incremental',quickSyncAt:'2026-10-17',scanDiagnostics:{failedRequestCount:2}},null,partial.scanToken,1);
    const incomplete=(await S.getCommittedLibraryView()).database.providers.steam;
    if(incomplete.syncHealth.status!=='partial'||incomplete.lastSync!==view.database.providers.steam.lastSync||incomplete.quickSyncAt!==view.database.providers.steam.quickSyncAt)throw Error('Incomplete receipt advanced the successful baseline');
    if(JSON.stringify((await area.get({galacticLibraryDatabase:null})).galacticLibraryDatabase)!==JSON.stringify(baseline))throw Error('Incomplete check rewrote private catalog');
    const backup=S.parseBackup(S.createBackup(await S.getDatabase()));if(backup.providers.steam.lastSync!==view.database.providers.steam.lastSync)throw Error('Backup omitted check time');
    await S.restoreDatabase(backup);if((await S.getDatabase()).providers.steam.lastSync!==backup.providers.steam.lastSync)throw Error('Restore lost check time');
    if(JSON.stringify(await chrome.storage.local.get(null)).includes('galacticLibraryProviderChecks'))throw Error('Private receipt leaked to public storage');
    return true;
  `);
  assert(emptyCheck);console.log('PASS installed Firefox GL: empty successful/incomplete checks use private receipts, preserve successful baseline/catalog and flatten through backup/restore');
  assert(await evaluate(`
    const S=await import('./src/lib/storage.js'),P=await import('./src/background/private-storage.js'),W=await import('./src/background/storage-writer.js'),C=await import('./src/lib/validation-certificate.js'),Q=await import('./src/lib/query-diagnostics.js');
    // Marionette imports modules into its sandbox while IDB returns page-realm
    // objects. Recreate this known JSON fixture in the module's realm, matching
    // production's single realm; never relax the strict serializer for testing.
    const privateArea=P.createPrivateStorage(indexedDB),area={get:async defaults=>JSON.parse(JSON.stringify(await privateArea.get(defaults))),set:updates=>privateArea.set(updates),remove:keys=>privateArea.remove(keys)};
    const database=(await area.get({galacticLibraryDatabase:null})).galacticLibraryDatabase;
    await S.getCommittedLibraryView();
    const proof=C.createValidationCertificates(chrome.storage.session);let valid=false,reasons=[];
    for(let n=0;n<200&&!valid;n++){reasons=[];valid=await proof.verify(database,{beginSpan:stage=>{reasons.push(stage);return ()=>{};}});if(!valid)await new Promise(done=>setTimeout(done,10));}
    if(!valid)throw Error('Native Firefox session proof unavailable: '+reasons.join(', '));
    const journal=Q.createQueryDiagnostics(),cold=W.createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true,certificateArea:chrome.storage.session,diagnostics:journal});
    const scan=await cold.beginProviderScan('steam','Empty check fixture','incremental',false,1);
    if(!journal.report().events.some(row=>row.stage==='certificate_hit')||journal.report().events.some(row=>row.stage==='validation'))throw Error('New Firefox writer did not accept exact session proof');
    await cold.commitProviderScan('steam',[],{syncMode:'incremental',scanDiagnostics:{incomplete:true}},null,scan.scanToken,1);
    if(JSON.stringify((await area.get({galacticLibraryDatabase:null})).galacticLibraryDatabase)!==JSON.stringify(database))throw Error('Cold receipt rewrote private database');
    const view=await cold.getDatabase();if(view.providers.steam.syncHealth.status!=='partial'||view.providers.steam.lastSync!==database.providers.steam.lastSync)throw Error('Cold receipt lost successful baseline');
    return true;
  `));console.log('PASS installed Firefox GL: a new writer verifies session proof against private IndexedDB and completes an unchanged incomplete scan without validation or database writes');
  if(process.argv.includes('--companions')){
    const fanRoot=resolve(projectRoot,'../Fanatical'),hbRoot=resolve(projectRoot,'../HB'),fan=await install(fanRoot,'FAN'),hbStage=join(temporary,'HB');await mkdir(hbStage);
    execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(hbRoot,'scripts/package-release.ps1'),'-Target','Firefox','-OutputDirectory',hbStage],{windowsHide:true,stdio:'pipe'});
    const hbManifest=JSON.parse(await readFile(join(hbRoot,'manifest.json'),'utf8')),hbInstalled=await driver.send('Addon:Install',{path:join(hbStage,'Humble-Comic-Library-'+hbManifest.version+'-firefox.zip'),temporary:true}),hb={id:hbInstalled.value??hbInstalled,manifest:hbManifest};
    await verifyFirefoxImporters({driver,navigate,evaluate,extensions:[{...installed,label:'GL',module:'./src/providers/fanatical-scan.js',exportName:'readFanaticalOrdersInPage'},{...fan,label:'FAN',module:'./order-importer.mjs',exportName:'importFanaticalOrdersInPage'}]});
    await navigate(fan.id,fan.manifest.options_page);
    assert(await evaluate(`const F=FanaticalLibrary,id=F.resolveGalacticId('',chrome.runtime);if(id!==${JSON.stringify(installed.id)})throw Error('Wrong automatic GL ID');const saved=await chrome.storage.local.get('galacticLibraryExtensionId');if(saved.galacticLibraryExtensionId!==undefined)throw Error('Automatic pairing wrote manual configuration');return (await F.testGalacticLink(message=>chrome.runtime.sendMessage(id,message))).advertised;`));console.log('PASS Firefox pairing: official FAN and GL automatically connect without manual settings');
    await navigate(installed.id,installed.manifest.options_page);
    await evaluate(`const S=await import('./src/lib/storage.js');for(const id of ${JSON.stringify([fan.id,hb.id])}){const field=document.querySelector('#companion-extension-id');if(field.maxLength<id.length)throw Error('Pairing input truncates Firefox ID');field.value=id;document.querySelector('#add-companion-extension-id').click();for(let n=0;n<200&&!(await S.getAllowedExternalClientIds()).includes(id);n++)await new Promise(done=>setTimeout(done,20));if(!(await S.getAllowedExternalClientIds()).includes(id))throw Error('Pairing controls failed');}await S.mergeProviderItems('humble',[],{profileLabel:'central-synthetic'});await S.mergeProviderItems('gog',[{providerItemId:'doom',title:'Doom',mediaType:'game',ownership:'owned'}]);await S.mergeProviderItems('fanatical',[{providerItemId:'soft-copy',title:'Native Firefox software',mediaType:'software',ownership:'owned'}]);await S.mergeProviderItems('kindle',[{providerItemId:'collection',title:'Saga Collection',mediaType:'book',ownership:'owned',metadata:{authors:['Author'],run:'2020',language:'en'}}]);await S.saveContentReview('kindle:collection',{entries:[1,2].map(number=>({series:'Saga',run:'2020',unitType:'issue',number:String(number),language:'en',completeness:'full'})),statement:'Synthetic reviewed issues 1-2'});return true;`);
    await evaluate(`const S=await import('./src/lib/storage.js');await S.mergeProviderItems('humble',['4001 A.D. TPB','4001 A.D.: Beyond New Japan','Harbinger, Vol. 1:Omega Rising','Harbinger Vol. 1: Omega Rising'].map((title,index)=>({providerItemId:'comic-title-'+index,title,mediaType:'book',ownership:'owned'})));return true;`);
    await evaluate(`document.querySelector('#check-companion-connections').click();for(let n=0;n<200;n++){if([...document.querySelector('#official-companion-status').children].every(row=>row.textContent.includes('Connected (API 1)')))return true;await new Promise(done=>setTimeout(done,20));}throw Error('GL named companion statuses did not verify');`);console.log('PASS Firefox settings: GL verifies both named official companions through normal controls');
    await evaluate(`const S=await import('./src/lib/storage.js');await S.saveAllowedExternalClientIds([]);return true;`);
    await navigate(hb.id,hb.manifest.options_page);
    assert(await evaluate(`for(let n=0;n<200&&!document.querySelector('#galactic-library-link-status').textContent.includes('Automatic Galactic Library pairing ready.');n++)await new Promise(done=>setTimeout(done,20));document.querySelector('#test-galactic-library-link').click();for(let n=0;n<200;n++){const text=document.querySelector('#galactic-library-link-status').textContent;if(text.startsWith('Connected to Galactic Library'))return true;await new Promise(done=>setTimeout(done,20));}throw Error('HB automatic settings connection check failed: '+document.querySelector('#galactic-library-link-status').textContent);`));console.log('PASS Firefox settings: HB verifies automatic GL connection through the normal UI');
    const hbChecks=await evaluate((await readFile(join(hbRoot,'tests/runtime-checks.js'),'utf8'))+';return await installedRuntimeChecks();');hbChecks.checks.forEach(name=>console.log('PASS installed Firefox HB: '+name));
    await evaluate(`const H=HumbleComicLibrary;if(H.resolveGalacticId('',chrome.runtime)!==${JSON.stringify(installed.id)})throw Error('Wrong automatic HB target');document.querySelector('#share-gl-profile').value='central-synthetic';document.querySelector('#confirm-reminder-sharing').checked=true;document.querySelector('#share-entitlements').click();for(let n=0;n<200;n++){const text=document.querySelector('#entitlement-share-status').textContent;if(text.startsWith('Shared 1 entitlements'))return true;if(!document.querySelector('#share-entitlements').disabled)throw Error(text);await new Promise(done=>setTimeout(done,20));}throw Error('Reminder sharing did not complete');`);console.log('PASS Firefox pairing: installed HB options shares private entitlement reminders using its stable add-on ID');
    await navigate(fan.id,fan.manifest.options_page);
    const fanChecks=await evaluate(`
      const F=FanaticalLibrary,id=${JSON.stringify(installed.id)},send=message=>chrome.runtime.sendMessage(id,message),mutate=(operation,...args)=>chrome.runtime.sendMessage({type:'FANATICAL_STORE',operation,args});
      let response=await mutate('wishlist','add',[{title:'Firefox wish',mediaType:'book',weight:7}]);if(!response.ok)throw Error(response.error);const backup=await mutate('backup');if(!backup.ok||backup.result.wishlistItems[0].weight!==7)throw Error('FAN module writer/backup unavailable');await mutate('wishlist','replace',[]);response=await mutate('restore',backup.result);if(!response.ok||(await chrome.storage.local.get('fanaticalWishlistItems')).fanaticalWishlistItems.length!==1)throw Error('FAN restore failed');
      const caps=await F.testGalacticLink(send);if(!caps.entitlementReminders||!caps.mediaTypes.includes('software'))throw Error('Capabilities missing');
      const contents=[1,2,3].map(number=>({series:'Saga',run:'2020',unitType:'issue',number:String(number),language:'en',completeness:'full'})),products=[{sourceItemId:'soft-native',title:'Native Firefox software',mediaType:'software'},{sourceItemId:'game-native',title:'Doom Deluxe Edition',mediaType:'game'},{sourceItemId:'contents-native',title:'Saga New Collection',mediaType:'book',authors:['Author'],contents,contentsComplete:true}],lookup=await F.queryGalacticItems(F.galacticRequestItems(products,true),send);
      if(lookup.failed.size)throw Error('Native matching failed: '+[...lookup.failures]);if(!lookup.results.get('soft-native').matches.some(row=>row.provider==='gog')||lookup.results.get('soft-native').matches.some(row=>row.provider==='fanatical'))throw Error('Provenance exclusion failed');if(!lookup.results.get('game-native').possibleMatches.length)throw Error('Edition candidate missing');if(lookup.results.get('contents-native').coverage.owned!==2||lookup.results.get('contents-native').coverage.total!==3)throw Error('Partial reviewed coverage missing');
      const reminders=await F.loadCentralReminders(send,{provider:''});if(!reminders.reminders.some(row=>row.source==='humble-companion'&&row.kind==='key-expiry')||JSON.stringify(reminders).includes('PRIVATE SYNTHETIC'))throw Error('Private reminder DTOs failed');
      await mutate('patch',{galacticLibraryExtensionId:id});document.querySelector('#reminder-provider').value='';document.querySelector('#load-reminders').click();for(let n=0;n<200&&document.querySelector('#load-reminders').disabled;n++)await new Promise(done=>setTimeout(done,20));if(document.querySelector('#reminder-list').children.length!==reminders.total)throw Error(document.querySelector('#reminder-status').textContent);
      return ['FAN module background and wishlist backup restore','real capability and software lookup','Possible edition and Partial comic coverage','central private entitlement DTOs','installed FAN reminder controls'];
    `);fanChecks.forEach(name=>console.log('PASS installed Firefox FAN: '+name));
    const fullTitleCheck=await evaluate(`
      const F=FanaticalLibrary,send=message=>chrome.runtime.sendMessage(${JSON.stringify(installed.id)},message);
      const titles=['4001 A.D.','4001 A.D. Beyond New Japan','Harbinger Vol 1 Omega Rising'];
      const products=titles.map((title,index)=>({sourceItemId:'full-title-'+index,title,mediaType:'book',authors:['Writer'],externalIds:{isbn:'9780306406157'}}));
      const lookup=await F.queryGalacticItems(F.galacticRequestItems(products),send);
      if(lookup.failed.size)throw Error('Full comic title lookup failed');
      for(const product of products)if(F.resolveProduct(product,[],[],()=>lookup.results.get(product.sourceItemId)).state!=='owned-elsewhere')throw Error('Full comic title ownership regressed: '+product.title);
      const base=lookup.results.get('full-title-0');if(base.matches.length!==1||base.matches[0].title!=='4001 A.D. TPB'||!base.possibleMatches.some(item=>item.title==='4001 A.D.: Beyond New Japan'))throw Error('Independent 4001 AD matches regressed');
      return true;
    `);assert(fullTitleCheck);console.log('PASS installed Firefox matching: full comic titles, missing ISBNs, repeated purchases and independent 4001 AD books');
    await navigate(installed.id,installed.manifest.options_page);
    await evaluate(`
      const S=await import('./src/lib/storage.js');
      await S.mergeProviderItems('humble',[{providerItemId:'override-native',title:'Native uncertain purchase',mediaType:'book',ownership:'unknown'}]);
      await S.mergeProviderItems('kindle',[{providerItemId:'override-native',title:'Native borrowed book',mediaType:'book',ownership:'borrowed',metadata:{authors:['Original Writer'],source:'amazon-kindle-content-library'}}]);
      await S.saveOwnershipPolicy({providers:{humble:true}});return true;
    `);
    async function checkFanOwnershipOverride(global){
      await navigate(fan.id,fan.manifest.options_page);
      assert(await evaluate(`
        const F=FanaticalLibrary,send=message=>chrome.runtime.sendMessage(${JSON.stringify(installed.id)},message);
        const products=[{sourceItemId:'assumed-purchase',title:'Native uncertain purchase',mediaType:'book'},{sourceItemId:'assumed-borrowed',title:'Native borrowed book',mediaType:'book',authors:['Original Writer']}];
        const lookup=await F.queryGalacticItems(F.galacticRequestItems(products),send);
        if(lookup.failed.size)throw Error('Ownership preference lookup failed');
        const purchase=lookup.results.get('assumed-purchase'),borrowed=lookup.results.get('assumed-borrowed');
        if(F.resolveProduct(products[0],[],[],()=>purchase).state!=='owned-elsewhere')throw Error('FAN did not honor the provider ownership preference');
        if(F.resolveProduct(products[1],[],[],()=>borrowed).state!==${JSON.stringify(global?'owned-elsewhere':'possible')})throw Error('FAN global preference or provider scope failed');
        if(purchase.matches[0].evidence.ownershipBasis!=='user-assumed-owned'||purchase.matches[0].evidence.observedOwnership!=='unknown')throw Error('Original uncertain ownership missing from the response');
        if(${global}&&borrowed.matches[0].evidence.observedOwnership!=='borrowed')throw Error('Original borrowed provenance missing from the response');
        return true;
      `));
    }
    await checkFanOwnershipOverride(false);
    console.log('PASS Firefox ownership preference: actual FAN resolves provider-assumed ownership and keeps other providers uncertain');
    await navigate(installed.id,installed.manifest.options_page);
    await evaluate(`const S=await import('./src/lib/storage.js');await S.saveOwnershipPolicy({allOwned:true});return true;`);
    await navigate(installed.id,installed.manifest.options_page);
    await evaluate(`
      const S=await import('./src/lib/storage.js');
      for(let n=0;n<200&&!document.querySelector('#assume-all-owned').checked;n++)await new Promise(done=>setTimeout(done,20));
      const database=await S.getDatabase();
      if(!document.querySelector('#assume-all-owned').checked||!document.querySelector('#assume-owned-humble').checked||!document.querySelector('#assume-owned-humble').disabled)throw Error('Installed Firefox preferences did not survive reopening');
      if(Object.values(database.providerItems).find(item=>item.provider==='humble'&&item.providerItemId==='override-native'&&item.profileId===database.providers.humble.activeProfileId).ownership!=='unknown'||database.providerItems['kindle:override-native'].ownership!=='borrowed'||database.providerItems['kindle:override-native'].metadata.authors[0]!=='Original Writer')throw Error('Preference rewrote original media evidence');
      return true;
    `);
    await checkFanOwnershipOverride(true);
    await navigate(hb.id,hb.manifest.options_page);
    await evaluate(`
      const response=await chrome.runtime.sendMessage(${JSON.stringify(installed.id)},{type:'MATCH_ITEMS',apiVersion:1,items:[{requestId:'assumed-borrowed',title:'Native borrowed book',mediaType:'book',excludeProviders:['humble']}]});
      if(!response.ok||!response.results[0].owned||response.results[0].matches[0].ownership!=='owned'||response.results[0].matches[0].evidence.observedOwnership!=='borrowed')throw Error('HB did not receive the effective ownership with original evidence');
      return true;
    `);
    console.log('PASS Firefox ownership preference: installed GL persists global choices and sends owned results with original provenance to HB and FAN');
    await navigate(installed.id,installed.manifest.options_page);
    await evaluate(`const S=await import('./src/lib/storage.js');await S.saveOwnershipPolicy({allOwned:false,providers:{humble:false}});return true;`);
    await navigate(fan.id,fan.manifest.options_page);
    await evaluate(`
      const F=FanaticalLibrary,products=['Native uncertain purchase','Native borrowed book'].map((title,index)=>({sourceItemId:'restored-'+index,title,mediaType:'book'}));
      const lookup=await F.queryGalacticItems(F.galacticRequestItems(products),message=>chrome.runtime.sendMessage(${JSON.stringify(installed.id)},message));
      if(lookup.failed.size||products.some(product=>F.resolveProduct(product,[],[],()=>lookup.results.get(product.sourceItemId)).state!=='possible'))throw Error('Turning off ownership preferences did not restore Possible');
      return true;
    `);
    console.log('PASS Firefox ownership preference: disabling choices restores uncertain and borrowed matches to Possible');
    await navigate(installed.id,installed.manifest.options_page);
    await evaluate('await ('+seedConsoleCompanionLibrary.toString()+')();return true;');
    await navigate(fan.id,fan.manifest.options_page);
    assert(await evaluate('return await ('+checkConsoleCompanionResults.toString()+')(message=>chrome.runtime.sendMessage('+JSON.stringify(installed.id)+',message),FanaticalLibrary);'));
    await navigate(hb.id,hb.manifest.options_page);
    assert(await evaluate('return await ('+checkConsoleCompanionResults.toString()+')(message=>chrome.runtime.sendMessage('+JSON.stringify(installed.id)+',message));'));
    console.log('PASS Firefox consoles: actual GL worker to HB/FAN, FAN validation/classification, uncertain/temporary/returned access, wishlist-only and provider exclusions');
    await navigate(fan.id,fan.manifest.options_page);
    const fanReview=await evaluate(`return await chrome.runtime.sendMessage({type:'FANATICAL_OPEN_GALACTIC_REVIEW',url:'https://evil.test'});`);assert.equal(fanReview.ok,true);console.log('PASS Firefox review: FAN delegates central review to GL without a private URL');
    await navigate(hb.id,hb.manifest.options_page);assert.equal((await evaluate(`return await chrome.runtime.sendMessage({type:'HCL_OPEN_GALACTIC_REVIEW',url:'https://evil.test'});`)).ok,true);console.log('PASS Firefox review: HB delegates central review to GL without a private URL');
    await navigate(installed.id,installed.manifest.options_page);const received=await evaluate(`const S=await import('./src/lib/storage.js'),database=await S.getDatabase();return {feed:database.companionFeeds[${JSON.stringify(hb.id)}],publicState:await chrome.storage.local.get(null)};`);assert.equal(received.feed.entries.length,1);assert.equal(received.feed.entries[0].activationStatus,'unknown');assert.doesNotMatch(JSON.stringify(received),/PRIVATE SYNTHETIC/);
    assert.equal((await evaluate(`return await chrome.runtime.sendMessage(${JSON.stringify(hb.id)},{type:'OPEN_REVIEW',apiVersion:1,url:'https://evil.test'});`)).ok,true);console.log('PASS Firefox review: GL opens paired HB source review without a private URL');
    await evaluate(`const S=await import('./src/lib/storage.js');await S.saveAllowedExternalClientIds([]);return true;`);await navigate(fan.id,fan.manifest.options_page);assert(await evaluate(`await FanaticalLibrary.loadCentralReminders(message=>chrome.runtime.sendMessage(${JSON.stringify(installed.id)},message));return true;`));console.log('PASS Firefox pairing: removing manual duplicates preserves official trust');
  }
}finally{
  driver?.close();if(child){child.kill();await Promise.race([exited,pause(3000)]);}
  const target=resolve(temporary),base=resolve(tmpdir());if(!target.startsWith(base+sep)||!target.slice(base.length+1).startsWith('gl-firefox-test-'))throw Error('Unsafe Firefox test cleanup.');await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
