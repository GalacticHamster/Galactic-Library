// Release check: installed same-identity upgrade from an archived baseline.
// Disposable browser profile and synthetic data only; no provider account, network request or personal profile.
// The published runtime creates the historical data with its own validated writers; the candidate must keep every
// saved key, read it correctly, survive an extension restart and restore its own backup without duplicates.
//   UPGRADE_FROM_PACKAGE=<published zip> UPGRADE_TO_PACKAGE=<candidate zip> node scripts/release-upgrade-browser.mjs --ext=hb|gl [--firefox]
// GL also supports a hash-pinned local release candidate and a disposable build of the current source.
// Fanatical Library has its own equivalent check (Fanatical tests/release-upgrade.mjs).
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,firefoxMarionette,freePort} from '../tests/native-protocol.mjs';

const firefox=process.argv.includes('--firefox'),ext=process.argv.find(a=>a.startsWith('--ext='))?.slice(6);
assert(['hb','gl'].includes(ext),'Choose --ext=hb or --ext=gl');
const supplied=process.env.UPGRADE_FROM_PACKAGE;
if(ext==='hb')assert(supplied&&process.env.UPGRADE_TO_PACKAGE,'Set UPGRADE_FROM_PACKAGE and UPGRADE_TO_PACKAGE to exact HB archives');
const from=supplied?resolve(supplied):fileURLToPath(new URL(`../dist/1.0.5-rc1/GalacticLibrary-1.0.5${firefox?'-firefox':''}.zip`,import.meta.url));
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const temporary=await mkdtemp(join(tmpdir(),'gh-release-upgrade-')),profile=join(temporary,'profile'),stage=join(temporary,'extension');
const to=process.env.UPGRADE_TO_PACKAGE?resolve(process.env.UPGRADE_TO_PACKAGE):join(temporary,'development.zip');
const expand=(archive,destination)=>execFileSync('powershell.exe',['-NoProfile','-Command','Expand-Archive -LiteralPath $env:GH_ZIP -DestinationPath $env:GH_DEST -Force'],{windowsHide:true,env:{...process.env,GH_ZIP:archive,GH_DEST:destination}});
const pass=message=>console.log(`PASS ${ext.toUpperCase()} ${firefox?'Firefox':'Chrome'}: ${message}`);
async function main(){
let child,driver,exited,session,url,extensionId;
try{
  if(!process.env.UPGRADE_TO_PACKAGE){
    const {createRelease}=await import('./release.mjs');
    await writeFile(to,(await createRelease(undefined,undefined,firefox?'firefox':'chrome')).zip);
  }
  const hashes={from:await digest(from),to:await digest(to)};
  if(!supplied)assert.equal(hashes.from,firefox?'8be979decc06237f8e104bd0517b2124553e4609f0111ef5ff551ba45b3d633b':'3c1b057266ae16324ea3f8df47752e6cb902e58b611b8e0a4b5ccc6b2385bdc7');
  assert.notEqual(hashes.to,hashes.from,'Upgrade must install a different runtime archive');
  console.log(`Baseline (${supplied?'explicit archive':'tagged local release candidate'}): ${from} SHA-256 ${hashes.from}`);
  await mkdir(profile);await mkdir(stage);expand(from,stage);
  const oldManifest=JSON.parse(await readFile(join(stage,'manifest.json'),'utf8')),page=oldManifest.options_ui?.page??oldManifest.options_page;
  if(firefox){
    let binary=process.env.FIREFOX_BIN||'C:/Program Files/Mozilla Firefox/firefox.exe';
    if(process.platform==='win32'&&!process.env.FIREFOX_BIN){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)binary=join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe');}
    const port=await freePort();await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("extensions.update.enabled",false);\n`);
    child=spawn(binary,['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank'],{windowsHide:true,env:{...process.env,MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'},stdio:['ignore','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));
    driver=await firefoxMarionette(port);await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
    extensionId=oldManifest.browser_specific_settings.gecko.id;
  }else{
    child=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',`--user-data-dir=${profile}`,'--remote-debugging-pipe','--enable-unsafe-extension-debugging','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe','pipe','pipe']});exited=new Promise(done=>child.once('exit',done));
    driver=chromePipe(child,{timeoutMs:60000});
  }
  async function install(archive){
    if(firefox){await driver.send('WebDriver:Navigate',{url:'about:blank'});await driver.send('Addon:Install',{path:archive,temporary:true});await driver.send('Marionette:SetContext',{value:'chrome'});const r=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL(arguments[1]);',args:[extensionId,page],newSandbox:true});url=r.value??r;await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url});}
    else{const installed=await driver.send('Extensions.loadUnpacked',{path:stage});if(extensionId)assert.equal(installed.id,extensionId,'the upgrade keeps the extension identity');extensionId=installed.id;url=`chrome-extension://${extensionId}/${page}`;const target=await driver.send('Target.createTarget',{url});session=(await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;}
  }
  async function evaluate(script){
    if(firefox){const response=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],e=>arguments[arguments.length-1]({error:e.message}));',args:[],newSandbox:false});const value=response.value??response;if(value&&typeof value==='object'&&Object.keys(value).length===1&&value.error)throw Error(value.error);return value;}
    const response=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails).slice(0,600));return response.result.value;
  }
  async function ready(){for(let n=0;n<300;n++){try{if(await evaluate(`return location.href.startsWith(${JSON.stringify(url)})&&Boolean(globalThis.chrome?.storage?.local)&&document.readyState==='complete'&&${ext==='hb'?"Boolean(globalThis.HumbleComicLibrary)":'true'};`))return;}catch{}await pause(50);}throw Error('Options did not become ready');}
  async function restart(){
    if(firefox){await driver.send('WebDriver:Navigate',{url:'about:blank'});await driver.send('Marionette:SetContext',{value:'chrome'});const r=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {AddonManager}=ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");AddonManager.getAddonByID(arguments[0]).then(a=>a.reload()).then(()=>done(true),e=>done({error:e.message}));',args:[extensionId],newSandbox:true});assert.equal(r.value??r,true);await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url});}
    else await install(null);
    await ready();
  }
  const storage=()=>evaluate('return await chrome.storage.local.get(null);');
  // Sync bookkeeping that a running coordinator may add or refresh; relationship identity is checked separately.
  const bookkeeping=key=>/^galacticPurchaseDiscovery(After|Attempts):/.test(key)||key==='galacticPurchaseSharing';
  function compare(before,after,label){
    // The purchase-sync coordinator moves a legacy account registry into each account's embedded stable ID and then
    // removes it (migrateAccounts). That loses nothing when every account keeps its ID, which the readers compare.
    const migrated=k=>k==='galacticPurchaseAccountIds';
    const removed=Object.keys(before).filter(k=>!Object.hasOwn(after,k)&&!migrated(k)),added=Object.keys(after).filter(k=>!Object.hasOwn(before,k)&&!bookkeeping(k));
    const changed=Object.keys(before).filter(k=>Object.hasOwn(after,k)&&!bookkeeping(k)&&k!=='galacticPurchaseSync'&&JSON.stringify(before[k])!==JSON.stringify(after[k]));
    assert.deepEqual({removed,added,changed},{removed:[],added:[],changed:[]},label+': saved data must be kept unchanged');
    const relationship=s=>Object.fromEntries(Object.entries(s??{}).map(([p,v])=>[p,v&&{id:v.id,peerId:v.peerId,localId:v.localId,remoteId:v.remoteId,confirmed:v.confirmed}]));
    assert.deepEqual(relationship(after.galacticPurchaseSync),relationship(before.galacticPurchaseSync),label+': the companion relationship is kept');
  }

  await install(firefox?from:null);await ready();
  await evaluate(ext==='hb'?HB_SEED:GL_SEED);
  const before=await storage(),oldVersion=await evaluate('return chrome.runtime.getManifest().version;');
  const baseline=await evaluate(ext==='hb'?HB_READ:GL_READ);
  pass(`baseline ${oldVersion} created synthetic history with its own writers: ${JSON.stringify(baseline)}`);

  if(!firefox){await rm(stage,{recursive:true,force:true});await mkdir(stage);expand(to,stage);}
  await install(firefox?to:null);await ready();
  const newVersion=await evaluate('return chrome.runtime.getManifest().version;');
  if(ext==='gl'){
    const {readRuntimeZip}=await import('./release.mjs');
    const expected=readRuntimeZip(await readFile(to)).get('src/providers/fanatical-scan.js').toString('utf8');
    assert.equal(await evaluate("return await (await fetch(chrome.runtime.getURL('src/providers/fanatical-scan.js'))).text();"),expected);
  } else assert.notEqual(newVersion,oldVersion);
  const after=await storage();compare(before,after,'upgrade '+oldVersion+' -> '+newVersion);
  pass(`same-identity upgrade ${oldVersion} -> ${newVersion} keeps every saved key (${Object.keys(before).length}) and the companion relationship`);
  const upgraded=await evaluate(ext==='hb'?HB_READ:GL_READ);
  assert.deepEqual(upgraded,baseline,'the candidate reads the same purchases, accounts, counts, corrections and reminders');
  pass(`candidate reads identical accounts, purchases, counts, corrections and reminder state`);
  await evaluate(ext==='hb'?HB_VERIFY:GL_VERIFY);
  pass('purchase identities, media corrections, ownership corrections and reminder reviews behave as before');

  await restart();
  compare(before,await storage(),'after restart');assert.deepEqual(await evaluate(ext==='hb'?HB_READ:GL_READ),baseline);
  pass('an extension restart keeps every saved key and reading');

  const restored=await evaluate(ext==='hb'?HB_BACKUP_RESTORE:GL_BACKUP_RESTORE);
  assert.deepEqual(restored,baseline,'restoring a backup made after the upgrade adds no duplicates and loses nothing');
  pass('a backup made after the upgrade restores without duplicates or losses');
  if(ext==='gl'){
    await evaluate(GL_PARTIAL);
    pass('the upgraded runtime imports verified siblings twice without changing earlier purchases or advancing a checkpoint');
  }
  assert.equal(await digest(from),hashes.from);assert.equal(await digest(to),hashes.to);
  console.log(`${ext==='gl'?6:5} ${ext.toUpperCase()} ${firefox?'Firefox':'Chrome'} upgrade checks passed (${oldVersion} -> ${newVersion}); packages unchanged: ${hashes.from.slice(0,12)} -> ${hashes.to.slice(0,12)}`);
}finally{
  try{if(firefox)await driver?.send('Marionette:Quit',{flags:['eForceQuit']});}catch{}
  child?.kill();await Promise.race([exited,pause(5000)]);await rm(temporary,{recursive:true,force:true}).catch(()=>{});
}
}

// --- Humble Library: history through 1.1.2's own replace and wishlist operations. ---
function hbHistory(){
  const item=(n,title,extra={})=>({title,kind:'book',source:'humble',sourceBundle:'Synthetic bundle '+n,purchaseKey:'upgrade-order-'+n,providerItemId:`upgrade-order-${n}:product:upgrade-${n}`,purchasedAt:`2025-0${(n%9)+1}-01`,entitlement:'direct-download',...extra});
  const repeat=item(4,'Synthetic Repeat');
  return {humbleAccountId:'11111111-1111-4111-8111-111111111111',humbleProfileLabel:'Main',
    libraryItems:[item(1,'Synthetic Saga'),item(2,'Synthetic Twin'),item(3,'Synthetic Twin'),
      {...repeat,provenance:[{title:repeat.title,sourceBundle:repeat.sourceBundle,purchaseKey:repeat.purchaseKey,providerItemId:repeat.providerItemId,purchasedAt:repeat.purchasedAt},{title:repeat.title,sourceBundle:'Earlier bundle',purchaseKey:'upgrade-order-40',providerItemId:'upgrade-order-40:product:upgrade-4',purchasedAt:'2024-05-01'}]},
      item(5,'Synthetic Corrected Game',{kind:'game',manualKind:'game',automaticKind:'book'}),
      item(6,'Synthetic Key Game',{kind:'game',entitlement:'third-party-key',keyStatus:'unrevealed',keyCheckedAt:'2026-10-01T12:00:00Z'})],
    purchaseSummaries:[{purchaseKey:'upgrade-order-1',sourceBundle:'Synthetic bundle 1',purchasedAt:'2025-02-01',itemCount:1,pricePaid:5,currency:'USD',pricePerItem:5}],
    keyReminders:[{id:'upgrade-reminder',purchaseKey:'upgrade-order-6',title:'Synthetic Key Game',sourceBundle:'Synthetic bundle 6',purchasedAt:'2025-07-01',keyType:'Steam',status:'unrevealed',directRedeem:false,isExpired:false,expiresAt:null,daysUntilExpiry:-1,checkedAt:'2026-10-01'}],
    keyReminderScan:{complete:false,checkedAt:'2026-10-01',purchaseKeys:['upgrade-order-6'],baselinePurchaseKeys:['upgrade-order-6','upgrade-order-1'],failedPurchaseKeys:['upgrade-order-1']},
    lastImport:{importedAt:'2026-10-01',scannedPurchases:6,skippedKnown:0,addedTitles:6,addedGames:2,addedSoftware:0,addedAudiobooks:0,datesBackfilled:0,pricedPurchases:1,skippedPurchases:0,fullRescan:true,reconciled:false,failedPurchaseKeys:[]},
    mediaImportVersion:6,
    historicalLibraryItems:[{title:'Synthetic Retired Book',kind:'book',source:'humble',purchaseKey:'retired-order',provenance:[{title:'Synthetic Retired Book',purchaseKey:'retired-order'}]}],
    historicalPurchaseSummaries:[{purchaseKey:'retired-order',sourceBundle:'Retired bundle',itemCount:1,pricePaid:null}],
    customCollectionMappings:[{id:'custom-one',collectionTitle:'Example Collection',sourceLabel:'Custom mapping',contains:[{series:'Example Series',year:2000,from:1,to:4}]}]};
}
var HB_SEED=`
  const H=globalThis.HumbleComicLibrary,send=(operation,args)=>chrome.runtime.sendMessage({type:'HCL_STORE',operation,args}).then(r=>{if(!r?.ok)throw Error(operation+': '+r?.error);return r.result;});
  const main=${JSON.stringify(hbHistory())};
  // A second saved account with a purchase of the same title in a different store account.
  const second={humbleAccountId:'22222222-2222-4222-8222-222222222222',humbleProfileLabel:'Second',libraryItems:[{title:'Synthetic Twin',kind:'book',source:'humble',sourceBundle:'Second bundle',purchaseKey:'second-order-1',providerItemId:'second-order-1:product:second-1',purchasedAt:'2025-03-01',entitlement:'direct-download'}]};
  main.profileArchives=[{profileLabel:'Second',backup:H.createLibraryBackup(second),archivedAt:'2026-10-02T00:00:00.000Z'}];
  main.mediaTypeOverrides={[H.mediaOverrideKey(main.libraryItems[4])]:'game'};
  await send('replace',[main]);
  await send('wishlist',['add',[{title:'Synthetic Wished Book',kind:'book',weight:3,authors:['Synthetic Writer']}]]);
  // An existing Galactic Library connection for the active account (no GL installed here, so it stays idle).
  await chrome.storage.local.set({galacticPurchaseSync:{humble:{id:'44444444-4444-4444-8444-444444444444',peerId:'abcdefghijklmnopabcdefghijklmnop',localId:main.humbleAccountId,remoteId:'55555555-5555-4555-8555-555555555555',confirmed:true,remoteConfirmed:true,previouslyConfirmed:true,peerVerified:true,status:'synced',pending:false,epoch:3,attempts:0,pair:{local:'${'a'.repeat(64)}',remote:'${'b'.repeat(64)}'}}}});
  return true;`;
var HB_READ=`
  const send=(operation,args=[])=>chrome.runtime.sendMessage({type:'HCL_STORE',operation,args}).then(r=>{if(!r?.ok)throw Error(operation+': '+r?.error);return r.result;});
  const accounts=await send('syncAccounts');const main=accounts.find(a=>a.label==='Main'),second=accounts.find(a=>a.label==='Second');
  const snapshot=await send('handoffSnapshot',[main.accountRef]),s=await chrome.storage.local.get(['libraryItems','wishlistItems','keyReminders','historicalLibraryItems','profileArchives','mediaTypeOverrides','customCollectionMappings','galacticPurchaseSync']);
  return {accounts:accounts.map(a=>[a.label,a.stableId]).sort(),purchases:s.libraryItems.flatMap(i=>i.provenance?.length?i.provenance:[i]).map(o=>o.purchaseKey).sort(),sharedRecords:snapshot.records.map(r=>[r.providerItemId,r.mediaType]).sort(),
    twins:snapshot.records.filter(r=>r.title==='Synthetic Twin').length,repeatPurchases:snapshot.records.filter(r=>r.title==='Synthetic Repeat').length,
    corrected:s.libraryItems.find(i=>i.title==='Synthetic Corrected Game').kind,overrides:Object.values(s.mediaTypeOverrides),wishlist:s.wishlistItems.map(w=>w.title),
    reminders:s.keyReminders.map(r=>[r.id,r.status]),history:s.historicalLibraryItems.length,archives:s.profileArchives.map(a=>a.profileLabel),
    mappings:s.customCollectionMappings.length,connection:s.galacticPurchaseSync?.humble?.localId};`;
var HB_VERIFY=`
  const s=await chrome.storage.local.get(['libraryItems','keyReminders']);
  if(s.libraryItems.filter(i=>i.title==='Synthetic Twin').length!==2)throw Error('same-title purchases merged');
  if(!s.libraryItems.find(i=>i.title==='Synthetic Repeat').provenance.some(p=>p.purchaseKey==='upgrade-order-40'))throw Error('repeat purchase lost');
  if(s.libraryItems.find(i=>i.title==='Synthetic Key Game').keyStatus!=='unrevealed')throw Error('key observation changed');
  return true;`;
var HB_BACKUP_RESTORE=`
  const H=globalThis.HumbleComicLibrary,send=(operation,args=[])=>chrome.runtime.sendMessage({type:'HCL_STORE',operation,args}).then(r=>{if(!r?.ok)throw Error(operation+': '+r?.error);return r.result;});
  const backup=H.createLibraryBackup(await chrome.storage.local.get(H.LIBRARY_STATE_DEFAULTS));
  await send('restore',[backup]);
  ${'return await (async()=>{'+'%READ%'+'})();'}`;

// --- Galactic Library: history through 1.0.4's own purchase import and validated database restore. ---
var GL_SEED=`
  const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),H=await import('./src/background/purchase-handoff.js'),P=await import('./src/lib/provider-profiles.js'),R=await import('./src/lib/ownership-review.js'),Rem=await import('./src/lib/reminders.js');
  const Snap=globalThis.GalacticPurchaseSnapshot,at='2026-11-01T00:00:00.000Z';
  const snap=(provider,ref,label,records)=>Snap.validate({protocolVersion:1,provider,snapshotId:crypto.randomUUID(),accountRef:ref,accountLabel:label,capturedAt:at,scope:'historical',completeness:'partial',limitations:[],records});
  const hb=(n,title,mediaType='book',meta={})=>({providerItemId:'upgrade-order-'+n+':product:upgrade-'+n,title,mediaType,purchasedAt:'2025-0'+((n%9)+1)+'-01T00:00:00.000Z',origins:[],metadata:{purchaseId:'upgrade-order-'+n,sourceBundle:'Synthetic bundle '+n,entitlement:'direct-download',...meta}});
  const d=M.createEmptyDatabase();
  await H.applyPurchaseSnapshot(d,snap('humble','${'a'.repeat(64)}','Main',[hb(1,'Synthetic Saga'),hb(2,'Synthetic Twin'),hb(3,'Synthetic Twin'),hb(5,'Synthetic Corrected Game','game'),hb(6,'Synthetic Key Game','game',{entitlement:'third-party-key',keyType:'Steam',keyStatus:'unrevealed',keyCheckedAt:'2026-10-01T12:00:00.000Z'})]),{newLabel:'Main',expectedActiveId:null});
  await H.applyPurchaseSnapshot(d,snap('humble','${'b'.repeat(64)}','Second',[hb(7,'Synthetic Twin')]),{newLabel:'Second',expectedActiveId:d.providers.humble.activeProfileId});
  const origin=(ref,quantity,date)=>({orderRef:ref,bundleId:'synthetic-bundle',bundleTitle:'Synthetic bundle',bundleSlug:'',purchasedAt:date,quantity,occurrenceRefs:[]});
  await H.applyPurchaseSnapshot(d,snap('fanatical','${'c'.repeat(64)}','Main',[{providerItemId:'synthetic-fan-game',title:'Synthetic Repeat Game',mediaType:'game',purchasedAt:'2025-01-01T00:00:00.000Z',metadata:{},origins:[origin('${'d'.repeat(64)}',2,'2025-01-01T00:00:00.000Z'),origin('${'e'.repeat(64)}',1,'2025-06-01T00:00:00.000Z')]}]),{newLabel:'Main',expectedActiveId:null});
  const steam=P.newProviderProfile('steam','Steam');d.providerProfiles[steam.profileId]=steam;d.providers.steam={activeProfileId:steam.profileId,profileLabel:'Steam'};
  const s=M.normalizeProviderItem({provider:'steam',profileId:steam.profileId,providerItemId:'620',title:'Synthetic Corrected Game',mediaType:'game',ownership:'owned',metadata:{}},at,{profileKeySpace:steam.keySpace});d.providerItems[s.id]=s;
  const humble=Object.values(d.providerItems).filter(i=>i.provider==='humble'),saga=humble.find(i=>i.title==='Synthetic Saga'),twins=humble.filter(i=>i.title==='Synthetic Twin'&&i.profileId===d.providers.humble.activeProfileId);
  d.canonicalItems=M.rebuildCanonicalItems(d.providerItems,{},{},d.editionSeparations);
  await S.restoreDatabase(d);
  // Corrections, relationship decisions and reminder reviews are made with the published runtime's own writers.
  await S.saveOwnershipCorrections([{recordRef:saga.recordRef,provider:saga.provider,profileId:saga.profileId,expectedReviewRef:null}],{ownership:'returned'});
  await S.saveManualMatchDecision({itemIds:[twins[0].id,twins[1].id]},'different');
  const reminder=Rem.libraryReminders(await S.getDatabase()).find(r=>r.title==='Synthetic Key Game');if(!reminder)throw Error('no key reminder in the published runtime');
  await S.saveReminderReview(reminder.reminderRef,'dismissed',reminder.basis);
  await chrome.storage.local.set({galacticPurchaseSync:{humble:{id:'44444444-4444-4444-8444-444444444444',peerId:'abcdefghijklmnopabcdefghijklmnop',localId:d.providers.humble.activeProfileId,remoteId:'55555555-5555-4555-8555-555555555555',confirmed:true,remoteConfirmed:true,previouslyConfirmed:true,peerVerified:true,status:'synced',pending:false,epoch:3,attempts:0,pair:{local:'${'a'.repeat(64)}',remote:'${'b'.repeat(64)}'}}}});
  return true;`;
var GL_READ=`
  const S=await import('./src/lib/storage.js'),O=await import('./src/lib/ownership.js'),H=await import('./src/background/purchase-handoff.js'),Rem=await import('./src/lib/reminders.js');
  const d=await S.getDatabase(),items=Object.values(d.providerItems),label=id=>d.providerProfiles[id]?.nickname;
  const saga=items.find(i=>i.title==='Synthetic Saga'),fan=items.find(i=>i.provider==='fanatical');
  return {profiles:Object.values(d.providerProfiles).map(p=>[p.provider,p.nickname]).sort(),
    items:items.map(i=>[i.provider,label(i.profileId),i.providerItemId,i.mediaType]).sort(),
    sagaOwnership:O.effectiveOwnershipRecord(saga,d).ownership,sagaObserved:saga.ownership,
    fanOccurrences:fan.metadata.purchaseOrigins.length,activeReminders:Rem.libraryReminders(d).map(r=>r.title).sort(),
    reviews:Object.values(d.reminderReviews).map(r=>r.action),decisions:Object.values(d.manualMatchDecisions).map(m=>m.decision),
    humbleAccounts:Object.values(d.providerProfiles).filter(p=>p.provider==='humble').length,
    connection:(await chrome.storage.local.get('galacticPurchaseSync')).galacticPurchaseSync?.humble?.localId===d.providers.humble.activeProfileId};`;
var GL_VERIFY=`
  const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js');const d=await S.getDatabase();M.validateDatabase(d);
  const twins=Object.values(d.providerItems).filter(i=>i.title==='Synthetic Twin');if(twins.length!==3||new Set(twins.map(i=>i.id)).size!==3)throw Error('same-title purchases merged');
  return true;`;
var GL_BACKUP_RESTORE=`
  const S=await import('./src/lib/storage.js');const backup=S.createBackup(await S.getDatabase());await S.restoreDatabase(S.parseBackup(backup));
  ${'return await (async()=>{'+'%READ%'+'})();'}`;
var GL_PARTIAL=`
  const S=await import('./src/lib/storage.js');
  const {readFanaticalOrdersInPage}=await import('./src/providers/fanatical-scan.js');
  await import('./src/providers/fanatical.js');
  const before=await S.getDatabase(),scope=before.providers.fanatical;
  const detail={_id:'synthetic-upgrade-partial',status:'COMPLETE',items:[{_id:'synthetic-upgrade-bundle',name:'Synthetic upgrade bundle',bundles:[{games:[
    {_id:'upgrade-verified-child',name:'Verified upgrade product',type:'book'},
    {name:'Unresolved upgrade product',type:'book'}
  ]}]}]};
  const summary={...detail,items:detail.items.map(x=>({_id:x._id,name:x.name,bundles:[]}))};
  const originalFetch=globalThis.fetch,previousAuth=localStorage.getItem('bsauth');
  let projection;
  try{
    localStorage.setItem('bsauth',JSON.stringify({token:'SYNTHETIC'}));
    globalThis.fetch=async path=>new Response(JSON.stringify(path==='/api/user/orders'?[summary]:detail),{headers:{'Content-Type':'application/json'}});
    projection=await readFanaticalOrdersInPage({fullScan:true});
  }finally{
    globalThis.fetch=originalFetch;
    if(previousAuth===null)localStorage.removeItem('bsauth');else localStorage.setItem('bsauth',previousAuth);
  }
  if(projection.items.length!==1||projection.acquisitionComplete||projection.recovery.failedOrders!==1)throw Error('Partial acquisition did not isolate the unreadable product');
  const items=globalThis.GalacticFanatical.fanaticalItemsFromProjection(projection);
  const recovery=projection.recovery;
  const details={profileId:scope.activeProfileId,profileLabel:scope.profileLabel,syncMode:'incremental',
    scanDiagnostics:{incomplete:true},syncState:{knownOrderFingerprints:projection.orderFingerprints,failedOrderFingerprints:recovery.failedOrderFingerprints,componentScopes:recovery.componentScopes}};
  for(let attempt=0;attempt<2;attempt++)await S.mergeProviderItems('fanatical',items,details);
  const after=await S.getDatabase();
  for(const [id,row] of Object.entries(before.providerItems))if(JSON.stringify(after.providerItems[id])!==JSON.stringify(row))throw Error('A previously saved item changed');
  const added=Object.values(after.providerItems).filter(i=>i.providerItemId==='upgrade-verified-child');
  if(added.length!==1||added[0].metadata.purchaseOrigins.length!==1||added[0].profileId!==scope.activeProfileId||after.providers.fanatical.fullSyncAt!==scope.fullSyncAt)throw Error('Partial upgrade import lost provenance or advanced a checkpoint');
  if(JSON.stringify(after.ownershipReviews)!==JSON.stringify(before.ownershipReviews))throw Error('Partial import changed a correction');
  return true;`;
HB_BACKUP_RESTORE=HB_BACKUP_RESTORE.replace('%READ%',HB_READ);GL_BACKUP_RESTORE=GL_BACKUP_RESTORE.replace('%READ%',GL_READ);
await main();
