import {createEpicAuthDiagnostics} from '../src/background/epic-auth-diagnostics.js';
import {checkEpicSession} from './epic-session-browser-fixture.js';
import {CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import '../src/lib/contents-performance.js';
import '../src/lib/kindle-contents-scan.js';
import '../src/providers/floating-panel.js';
import { createStorageWriter } from '../src/background/storage-writer.js';
import { completeProviderSnapshot, completedScope } from '../src/lib/provider-snapshot.js';
import '../src/providers/metadata.js';
import '../src/providers/fanatical.js';
import '../src/providers/steam-store.js';
import {kindleContentsPlan} from '../src/lib/kindle-contents.js';
import {createContentsEditor} from '../src/ui/contents-editor.js';
import {createEnrichmentWorkbench} from '../src/ui/enrichment-workbench.js';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {VALIDATION_CERTIFICATE_KEY} from '../src/lib/validation-certificate.js';

// Real content-script controls, with signed-in fetches replaced by fixtures.
// Content scripts have no direct storage access; the worker owns this hidden area.
function providerRecord(database,provider,nativeId){const records=Object.values(database.providerItems).filter(r=>r.provider===provider&&r.providerItemId===nativeId);assert(records.length===1,'Expected one account-scoped fixture record for '+provider+':'+nativeId);return records[0];}
const checks=[],providerTimings=[]; const values={}; const writer=createStorageWriter({get:async defaults=>Object.fromEntries(Object.keys(defaults).map(key=>[key,structuredClone(values[key]??defaults[key])])),set:async updates=>Object.assign(values,structuredClone(updates))},Promise.resolve(),{cacheRefreshPreflight:true});
const realSteamFetch=globalThis.GalacticSteamStore.fetchOwnedSteamGames;
const shadows=[]; const attach=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(options){const root=attach.call(this,options);shadows.push(root);return root;};
const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
const assert=(value,message)=>{if(!value)throw new Error(message);};
// The page-lifetime pacing gate can wait for a previous run's last start and
// then a second request. Allow that legitimate interval; assert rate below.
const wait=async predicate=>{for(let n=0;n<500;n++){if(predicate())return;await pause();}throw new Error('Importer did not finish.');};
{
  const database=createEmptyDatabase(),profile=newProviderProfile('steam','Cold fixture');
  profile.state={connected:true,fullSyncAt:'2026-01-01',lastSync:'2026-01-01'};
  database.providerProfiles[profile.profileId]=profile;database.providers.steam={...profile.state,activeProfileId:profile.profileId};
  const item=normalizeProviderItem({provider:'steam',profileId:profile.profileId,providerItemId:'cold-fixture',title:'Cold fixture game',mediaType:'game',ownership:'unknown'},'2026-01-01');
  database.providerItems[item.id]=item;
  const state={galacticLibraryDatabase:validateDatabase(database)},session={};
  const area={get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,state[key]??value]))),set:async updates=>Object.assign(state,structuredClone(updates)),remove:async keys=>{for(const key of [keys].flat())delete state[key];}};
  const proofArea={get:async key=>({[key]:structuredClone(session[key])}),set:async updates=>Object.assign(session,structuredClone(updates)),remove:async key=>{delete session[key];}};
  const first=createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true,certificateArea:proofArea});await first.getQueryDatabase();
  await wait(()=>Boolean(session[VALIDATION_CERTIFICATE_KEY]));
  for(const missing of [false,true]){
    if(missing)delete session[VALIDATION_CERTIFICATE_KEY];
    const cold=createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true,certificateArea:proofArea}),stages=[];
    const timing={begin:stage=>{stages.push(stage);return ()=>{};}};
    const scan=await cold.execute('beginProviderScan',['steam','Cold fixture','incremental',false,1],timing);
    assert(stages.includes(missing?'read_validation':'certificate_hit'),'Cold proof path was not selected');
    if(!missing)assert(!stages.includes('read_validation'),'Valid proof repeated semantic validation');
    const before=JSON.stringify(state.galacticLibraryDatabase);
    await cold.execute('commitProviderScan',['steam',[],{syncMode:'incremental',scanDiagnostics:{incomplete:true}},null,scan.scanToken,1],timing);
    assert(JSON.stringify(state.galacticLibraryDatabase)===before,'Incomplete cold check changed the catalog');
    const view=await cold.getDatabase();assert(view.providers.steam.syncHealth.status==='partial'&&view.providers.steam.lastSync==='2026-01-01T00:00:00.000Z','Incomplete cold check changed successful baseline');
  }
  checks.push('cold provider generations reuse exact session proof; absent proof validates and incomplete receipts preserve catalog and successful baseline');
  const fresh=createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true,certificateArea:proofArea}),stages=[];
  const timing={begin:stage=>{stages.push(stage);return ()=>{};}};
  const scan=await fresh.execute('beginProviderScan',['steam','Cold fixture','incremental',false,1],timing);
  await fresh.execute('commitProviderScan',['steam',[{...item,ownership:'returned'}],{syncMode:'incremental'},null,scan.scanToken,1],timing);
  assert(stages.includes('persist_validation')&&state.galacticLibraryDatabase.providerItems[item.id].ownership==='returned','Certificate skipped data-changing save validation');
  checks.push('cold proof never certifies new access evidence; returned records still pass final save validation');
}
const fixtures=[
  ['steam','steam-store','GalacticSteamStore','fetchOwnedSteamGames','/account'],
  ['gog','gog','GalacticGog','fetchGogGames','/account'],
  ['epic','epic','GalacticEpic','fetchEpicGames','/library'],
  ['amazon-games','amazon-games','GalacticAmazonGames','fetchAmazonGames','/my-collection'],
  ['audible','audible','GalacticAudible','fetchAudibleAudiobooks','/library'],
  ['kindle','kindle','GalacticKindle','fetchKindleBooks','/hz/mycd/'],
  ['amazon-video','amazon-video','GalacticAmazonVideo','fetchAmazonVideoLibrary','/gp/video/library'],
  ['kobo','kobo','GalacticKobo','fetchKoboLibrary','/library'],
  ['humble','humble','GalacticHumble','fetchHumblePurchases','/home/purchases'],
  ['fanatical','fanatical','GalacticFanatical',null,'/orders'],
  ['fandango-at-home','fandango-at-home','GalacticFandangoAtHome','readFandangoGrid','/content/browse/mylibrary']
];
try{
checks.push(...await (await import('./provider-panel-restart-fixture.js')).checkProviderRememberedRestarts());
// The same shared start path runs in both packaged browsers for all providers.
{
 const {PROVIDERS}=await import('../src/lib/constants.js');
 const F=await import('./provider-sync-fixture.js'),{createSyncHealthView}=await import('../src/ui/sync-health.js');
 for(const provider of PROVIDERS){
  const db=F.providerSyncLibrary(provider),saved={galacticLibraryDatabase:structuredClone(db)};let writes=0;
  const w=createStorageWriter({get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,saved[k]??v]))),set:async updates=>{if(updates.galacticLibraryDatabase)writes++;Object.assign(saved,structuredClone(updates));},remove:async keys=>{for(const k of [keys].flat())delete saved[k];}},Promise.resolve(),{cacheQuerySnapshots:true});
  await w.getQueryDatabase();const scan=await w.beginProviderScan(provider,'Personal','full',false,1,null,false,F.consoleProvider(provider)?F.fingerprint:null);
  assert(writes===0&&saved.galacticLibraryProviderScans[provider].fullStartDigest,'Full admission rewrote '+provider);
  const view=(await w.getCommittedLibraryView()).database,card=createSyncHealthView(view,{cancel:()=>{},refresh:()=>{}});card.open=true;card.dispatchEvent(new Event('toggle'));
  assert(card.textContent.includes('Last attempt: running, full'),'Running full scan is invisible for '+provider);
  const items=[F.providerSyncValue(provider)];await w.commitProviderScan(provider,items,{syncMode:'full',fullSyncAt:new Date().toISOString()},F.providerSyncSnapshot(provider,items),scan.scanToken,1,false,F.consoleProvider(provider)?F.fingerprint:null);
  assert(writes===1&&(await w.getCommittedLibraryView()).database.providers[provider].syncHealth.status==='succeeded','Full completion was bypassed for '+provider);
 }
 checks.push('All 14 provider full starts use durable leases, render Running in the existing dashboard, and complete through one validated save');
}
{
 const {PROVIDERS}=await import('../src/lib/constants.js'),F=await import('./provider-sync-fixture.js'),O=await import('./observation-fixture.js'),C=await import('../src/lib/observation-overlays.js'),S=await import('../src/lib/storage.js');
 for(const provider of PROVIDERS){
  const db=F.providerSyncLibrary(provider),saved={galacticLibraryDatabase:structuredClone(db)},w=createStorageWriter({get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,saved[k]??v]))),set:async values=>Object.assign(saved,structuredClone(values)),remove:async keys=>{for(const key of [keys].flat())delete saved[key];}},Promise.resolve(),{cacheQuerySnapshots:true});
  const raw=await w.getQueryDatabase(),packet=await O.observationPacket(db,provider,{whole:provider!=='fanatical'});O.injectObservations(saved,w,packet);
  const view=(await w.getCommittedLibraryView()).database,backup=S.parseBackup(S.createBackup(await w.getDatabase()));
  assert(Object.values(view.providerItems)[0].observedAt===O.observationDate&&Object.values(raw.providerItems)[0].observedAt===F.oldObservation,'Observation read changed raw '+provider+' evidence');
  assert(Object.values(backup.providerItems)[0].observedAt===O.observationDate,'Backup lost effective '+provider+' evidence');
  await w.restoreDatabase(backup);assert(!saved[C.OBSERVATION_KEY]&&!saved[C.OBSERVATION_HEAD_KEY],'Restore retained injected observations for '+provider);
 }
 checks.push('All 14 provider injected observation views preserve raw records, populate Options and flatten through backup/restore');
}
{
 const {PROVIDERS}=await import('../src/lib/constants.js'),F=await import('./provider-sync-fixture.js'),O=await import('./observation-completion-fixture.js');
 for(const provider of PROVIDERS){
  const h=O.completionWriter(await O.completionBaseline(provider)),scan=await O.admitCompletion(h,provider);await O.finishCompletion(h,provider,scan,[F.providerSyncValue(provider)]);
  assert(h.counts.databaseWrites===(F.consoleProvider(provider)?1:0),'Wrong validated fallback/observation path for '+provider);
  if(!F.consoleProvider(provider))assert(h.counts.receiptWrites===1&&!h.stages.includes('persist_validation'),'Unchanged '+provider+' completion rewrote or revalidated the library');
 }
 checks.push('All 14 provider completion paths preserve source semantics; proven ordinary unchanged full scans commit one receipt without full writes or validation');
}

  {
    const saved={};let databaseWrites=0;
    const area={get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,saved[key]??value]))),set:async updates=>{if(updates.galacticLibraryDatabase)databaseWrites++;Object.assign(saved,structuredClone(updates));},remove:async key=>{delete saved[key];}};
    const make=()=>createStorageWriter(area,Promise.resolve(),{cacheQuerySnapshots:true});let w=make();
    await w.mergeProviderItems('steam',[{providerItemId:'empty-check-fixture',title:'Disposable game',mediaType:'game',ownership:'owned'}],{profileLabel:'Fixture',fullSyncAt:'2026-01-01'});
    const original=JSON.stringify(saved.galacticLibraryDatabase),writes=databaseWrites;
    for(let repeat=0;repeat<2;repeat++){
      const scan=await w.beginProviderScan('steam','Fixture','incremental',false,1);
      await w.commitProviderScan('steam',[],{syncMode:'incremental',quickSyncAt:'2026-10-16'},null,scan.scanToken,1);
      assert(databaseWrites===writes&&JSON.stringify(saved.galacticLibraryDatabase)===original,'Empty check rewrote the library');
      assert((await w.getCommittedLibraryView()).database.providers.steam.quickSyncAt==='2026-10-16T00:00:00.000Z','Successful check missing from Providers view');
      w=make();
    }
    assert((await w.getDatabase()).providers.steam.syncHealth.status==='succeeded','Check receipt did not survive worker recreation');
    const success=(await w.getCommittedLibraryView()).database.providers.steam;
    const partial=await w.beginProviderScan('steam','Fixture','incremental',false,1);
    await w.commitProviderScan('steam',[],{syncMode:'incremental',quickSyncAt:'2026-10-17',scanDiagnostics:{failedRequestCount:2}},null,partial.scanToken,1);
    const incomplete=(await w.getCommittedLibraryView()).database.providers.steam;
    assert(databaseWrites===writes&&incomplete.syncHealth.status==='partial'&&incomplete.lastSync===success.lastSync&&incomplete.quickSyncAt===success.quickSyncAt,'Incomplete receipt rewrote data or advanced success');
    checks.push('Empty Steam quick checks persist success across worker recreation without any database write or changed item observations');
    checks.push('Incomplete empty checks retain Partial status and the prior success baseline without a catalog write');
  }
  await import('../src/providers/kindle-ownership.js');await import('../src/providers/kindle.js');
  for(const originType of ['Purchase','Comixology'])for(const [itemStatus,ownership]of [['Return complete','returned'],['Revoked','revoked'],['Expired','expired']]){
    const item=globalThis.GalacticKindle.kindleItemFromOwnershipItem({asin:'B012345678',title:'Kindle access fixture',originType,itemStatus});assert(item.ownership===ownership&&item.metadata.itemStatus===itemStatus&&item.metadata.ownershipBasis,'Kindle negative access status lost');
  }
  checks.push('Kindle library item statuses preserve exact return/refund, revocation and expiry evidence before purchase-origin inference');
  for(const [provider,file,globalName,method,path] of fixtures){
    history.replaceState({},'',path);
    const mediaType=provider==='kindle'||provider==='kobo'||provider==='humble'?'book':provider==='audible'?'audiobook':provider==='amazon-video'||provider==='fandango-at-home'?'movie':'game';
    const items=[{providerItemId:'fixture-123',title:`Test ${provider}`,mediaType,ownership:'owned'}];
    const scopes=provider==='kindle'?[completedScope('books',1,1,'reported-count'),completedScope('personal-documents',0,0,'reported-count')].map(scope=>({...scope,duplicateCount:0})):provider==='fandango-at-home'?[completedScope('movie',1,1,'reported-count'),completedScope('tv',0,0,'reported-count')]:[completedScope('library',1,1,'reported-count')];
    const snapshot=completeProviderSnapshot(provider,items,scopes);
    const result={items,snapshot,unresolvedApps:[],newAppCount:1,skippedCount:0,failures:[],knownPurchaseIds:['fixture-purchase'],purchasesRead:1,skippedKnown:0,diagnostics:{windowsRead:1,categoryCounts:{'personal-documents':0}}};
    let releaseDelayedFetch,delayedFetchWaiting=false;
    if(method)globalThis[globalName]={...globalThis[globalName],[method]:async()=>{if(provider==='kindle'&&releaseDelayedFetch!==false){delayedFetchWaiting=true;await new Promise(resolve=>{releaseDelayedFetch=resolve;});}return method==='readFandangoGrid'?items:result;}};
    if(provider==='audible')Object.assign(globalThis[globalName],{getDiagnostics:()=>null,recordSaveState(){}});
    const denied=()=>{throw new Error('Content-script storage access denied.');};
    let imported=0; let mode='full',rejectCommit=false;
    const authValues={},authArea={get:async defaults=>structuredClone({...defaults,...authValues}),set:async patch=>Object.assign(authValues,structuredClone(patch)),remove:async key=>{delete authValues[key];}};
    const epicRuntime={id:'synthetic-gl',getURL:path=>'chrome-extension://synthetic-gl/'+path};
    const epicSender=()=>({id:epicRuntime.id,frameId:0,url:'https://store.epicgames.com'+location.pathname,tab:{id:1,url:'https://store.epicgames.com'+location.pathname}});
    let epicAuth=createEpicAuthDiagnostics({area:authArea,runtime:epicRuntime});
    const reloadEpicDiagnostics=()=>{epicAuth=createEpicAuthDiagnostics({area:authArea,runtime:epicRuntime});};
    globalThis.chrome={storage:{local:{get:denied,set:denied},session:{get:denied,set:denied}},runtime:{getURL:path=>location.origin+'/'+path,sendMessage:async request=>{
      if(request.type==='EPIC_AUTH_DIAGNOSTICS')return new Promise(resolve=>epicAuth.handle(request,epicSender(),resolve));
      if(request.type==='GET_KINDLE_CONTENTS_REFRESH')return {ok:true,eligible:0,checkpoint:null};
      if(request.type==='GET_PROVIDER_PROFILE'){const d=await writer.getDatabase(),p=d.providerProfiles[d.providers[provider]?.activeProfileId],profiles=Object.values(d.providerProfiles).filter(p=>p.provider===provider);return {ok:true,profileLabel:p?.nickname??'fixture',profileId:p?.profileId,profiles,reuseAllowed:profiles.length===1&&p?.state.connected===true&&Boolean(p?.state.lastSync)};}
      if(request.type==='REPORT_PROVIDER_SCAN_FAILURE')return {ok:true,recorded:await writer.failProviderScan(provider,request.scanToken,1,request.failure)};
      if(request.type==='GET_PROVIDER_SYNC_STATE'){const scan=await writer.beginProviderScan(provider,request.profileLabel,request.mode,request.switchProfile,1);return {ok:true,scanToken:scan.scanToken,hasFullBaseline:!scan.forceFull,syncState:{knownProviderItemIds:[],knownPurchaseIds:[],knownOrderFingerprints:[]}};}
      if(request.type==='FETCH_FANATICAL_ORDERS')return {ok:true,result:{items:[{sourceItemId:'fixture-123',title:items[0].title,mediaType}],snapshot,orderFingerprints:[]}};
      if(request.type==='FANDANGO_IMPORT_STATE'&&request.action==='get'){const scan=await writer.beginProviderScan(provider,'fixture',mode,false,1);return {ok:true,state:{phase:'tv',fullRescan:scan.forceFull||mode==='full',expected:{movies:1,tv:0},urls:{tv:location.href},items:mode==='full'?items:[],knownItemIds:[],scanContext:{profileLabel:'fixture',confirmed:true,mode,scanToken:scan.scanToken}}};}
      if(request.type==='FANDANGO_IMPORT_STATE')return {ok:true,state:request.action==='get'?{phase:'tv',fullRescan:mode==='full',expected:{movies:1,tv:0},urls:{tv:location.href},items:mode==='full'?items:[],knownItemIds:[]}:null};
      if(request.type==='COMMIT_PROVIDER_SCAN'){
        if(rejectCommit)return {ok:false,error:'Synthetic save rejection'};
        const database=await writer.commitProviderScan(provider,request.items,{syncMode:request.mode==='incremental'?'incremental':'full',fullSyncAt:new Date().toISOString(),scanDiagnostics:request.scanDiagnostics,...(provider==='steam'&&request.syncState?.applications?{syncState:request.syncState}:{})},request.snapshot,request.scanToken,1);
        if(provider==='epic')await epicAuth.committed(request,epicSender(),'full');
        imported++;const state=database.providers[provider];return {ok:true,gameCount:state.itemCount,...state,changes:state.syncHealth?.differences};
      }
      if(request.type==='GL_PROVIDER_UI_TIMING'){providerTimings.push(request.timing);return {ok:true};}
      return {ok:false,error:'Unexpected importer request.'};
    }}};
    let providerPass=0;
    for(mode of provider==='epic'?['full','full']:['full','incremental']){
      const before=imported;
      const timingBefore=providerTimings.length;
      if(provider==='fandango-at-home'){
        // Final View All stage of the actual resumable workflow, in both modes.
        globalThis[globalName][method]=async()=>[];
        await import(`../src/providers/${file}-content.js?mode=${mode}`);
      }else{
        if(mode==='full')await import(`../src/providers/${file}-content.js`);
        if(provider==='steam')globalThis.GalacticSync.setProfiling(true);
        if(provider==='epic'){globalThis.GalacticSync.setProfiling(false);const profile=shadows.at(-1).querySelector('[data-profile-next]');profile.checked=true;profile.dispatchEvent(new Event('change'));}
        const shadow=shadows.at(-1);
        const button=shadow.querySelector(`button[data-mode="${mode}"]`)||shadow.querySelector('[data-import-action]');
        assert(button,`${provider} missing ${mode} button`);if(provider==='kindle'){
          await wait(()=>!shadow.querySelector('[data-contents-mode]').disabled);
          assert([...shadow.querySelectorAll('h3')].some(h=>h.textContent==='Library import')&&shadow.querySelector('[data-book-contents-workflow] h3').textContent==='Book contents discovery','Kindle tasks are not separately labeled.');
          assert(shadow.querySelector('[data-book-contents-workflow]').getClientRects().length&&shadow.querySelector('[data-contents-review]').href.endsWith('#contents'),'Contents feature or review destination hidden with diagnostics off.');
        }shadow.querySelector('[data-profile-label]').value='fixture';shadow.querySelector('[data-profile-label]').dispatchEvent(new Event('input'));shadow.querySelector('[data-profile-confirm]').checked=true;button.click();
      }
      const shadow=shadows.at(-1);
      if(provider==='kindle'&&mode==='full'){
        await wait(()=>delayedFetchWaiting);
        shadow.querySelector('[data-export-timing]').click();
        shadow.querySelector('summary').click();
        shadow.querySelector('[data-galactic-floating-panel-control="minimize"]').click();
        shadow.querySelector('[data-galactic-floating-panel-control="restore"]').click();
        releaseDelayedFetch();releaseDelayedFetch=false;
      }
      await wait(()=>!shadow.querySelector('.status').dataset.busy&&(imported>before||/failed:/iu.test(shadow.querySelector('.status').textContent)));
      assert(!/failed:/iu.test(shadow.querySelector('.status').textContent),shadow.querySelector('.status').textContent);
      if(['steam','epic'].includes(provider)){
        const text=shadow.querySelector('.status').textContent;
        assert(!/undefined|new apps/iu.test(text),provider+' reported misleading counts');
        if(providerPass)assert(/0 new games, 0 updated/iu.test(text),text);
        await wait(()=>providerTimings.length>timingBefore&&providerTimings.at(-1)?.provider===provider&&providerTimings.at(-1)?.events.some(event=>event.stage==='page_ui'));
        const timing=providerTimings.at(-1);assert(timing?.events.some(event=>event.stage==='provider_fetch'),provider+' scan timing absent');
        assert(timing.providerCaptured===items.length,provider+' captured-item count absent');
        assert(timing.events.some(event=>event.stage==='save_message'),provider+' save timing absent');
        if(provider==='epic')assert(!shadow.querySelector('[data-profile-next]').checked&&shadow.querySelector('[data-profile-timing-status]').textContent.includes('Timing captured'),'Epic one-shot profiling was not consumed and delivered');
      }
      checks.push(`${provider} ${mode} controls work with direct storage denied`);
      if(provider==='kindle'&&mode==='full')checks.push('Actual delayed Kindle import commits after timing export, help and minimize/restore without losing its account-bound scan token');
      providerPass++;
      if(provider==='fandango-at-home')document.querySelector('#galactic-library-fandango-at-home-importer').remove();
    }
    if(provider==='epic')await checkEpicSession({shadow:shadows.at(-1),writer,checks,wait,assert,commits:()=>imported,reloadDiagnostics:reloadEpicDiagnostics});
    if(provider==='steam'){
      const before=JSON.stringify(values.galacticLibraryDatabase.providerItems),timingBefore=providerTimings.length;
      globalThis.GalacticSteamStore.fetchOwnedSteamGames=async(report,known,options)=>{
        assert(options?.diagnostics===true,'Detailed outcomes enabled outside the explicit profiling switch');
        return {items:[],newAppCount:159,unresolvedApps:Array.from({length:159},()=>({appId:'PRIVATE_APP_ID',status:'PRIVATE_RAW_ERROR'})),failedRequestCount:2,unsupportedAppCount:0,failureSummary:'Steam title lookup returned HTTP 400.',diagnostics:{ownedListRead:true,ownedIdCount:1112,candidateCount:159,attemptedCount:159,titleRequests:2,failedRequests:2,unresolvedCount:159,malformedRows:0,outcomes:{http:159},httpStatuses:{400:1,429:1},unsupportedTypes:{},firstFailure:{stage:'titles',kind:'http',httpStatus:400},privateTitle:'PRIVATE_TITLE'}};
      };
      const shadow=shadows.at(-1);shadow.querySelector('button[data-mode="incremental"]').click();
      await wait(()=>providerTimings.length>timingBefore&&!shadow.querySelector('.status').dataset.busy);
      const text=shadow.querySelector('.status').textContent,diagnostic=providerTimings.at(-1)?.steamDiagnostics;
      assert(text.includes('Quick update complete')&&text.includes('159 applications still need title or type information')&&!text.includes('HTTP 400'),'Steam metadata-only gaps are not explained as saved access evidence');
      assert(diagnostic?.outcomes.http===159&&diagnostic.saveState==='committed'&&diagnostic.savedCount===0,'Steam aggregate outcomes or save boundary absent');
      assert(!JSON.stringify(diagnostic).includes('PRIVATE')&&JSON.stringify(values.galacticLibraryDatabase.providerItems)===before,'Steam diagnostics leaked raw data or altered saved records');
      checks.push('Steam metadata-only completion retains detailed failed-request diagnostics without leaking technical errors or private fields into normal UI');
      rejectCommit=true;
      globalThis.GalacticSteamStore.fetchOwnedSteamGames=async()=>({items:[{providerItemId:'777',title:'Save rejection fixture',mediaType:'game',ownership:'owned'}],newAppCount:1,unresolvedApps:[],failedRequestCount:0,unsupportedAppCount:0,diagnostics:{ownedListRead:true,ownedIdCount:1,candidateCount:1,attemptedCount:1,titleRequests:1,failedRequests:0,unresolvedCount:0,malformedRows:0,outcomes:{games:1},httpStatuses:{200:1},unsupportedTypes:{}}});
      const beforeRejected=providerTimings.length;shadow.querySelector('button[data-mode="incremental"]').click();
      await wait(()=>providerTimings.length>beforeRejected&&!shadow.querySelector('.status').dataset.busy);
      const rejected=providerTimings.at(-1).steamDiagnostics;
      assert(rejected.saveState==='rejected'&&rejected.savedCount===0&&rejected.saveRejectedCount===1&&rejected.firstFailure.stage==='save','Save rejection was reported as a committed ID');
      assert(JSON.stringify(values.galacticLibraryDatabase.providerItems)===before,'Rejected save changed the catalog');
      checks.push('Steam diagnostics distinguish resolved metadata from save rejection and retain zero confirmed saved IDs');
      rejectCommit=false;
      const savedFetch=globalThis.fetch;
      globalThis.fetch=async url=>({ok:true,status:200,json:async()=>String(url).startsWith('/dynamicstore')?{rgOwnedApps:[101,102,103,104,105,106,107]}:{response:{store_items:[{appid:101,type:0},{appid:102,type:0,name:{}},{appid:103,name:'PRIVATE TITLE'},{appid:104,type:6,name:'PRIVATE TITLE'},{appid:106,type:0,name:'One'},{appid:106,type:4,name:'One'},{item_type:0,id:107,appid:0,success:15,visible:false,name:''}]}}});
      globalThis.GalacticSteamStore.fetchOwnedSteamGames=realSteamFetch;
      try{
        const checkbox=shadow.querySelector('[data-sample-ids]'),download=shadow.querySelector('[data-export-sample]');
        assert(!checkbox.checked&&download.disabled&&globalThis.GalacticSteamStore.getDiagnosticSample()===null,'Samples are not off by default');
        checkbox.closest('details').open=true;assert(shadow.textContent.includes('may reveal part of your Steam library'),'Sampling privacy explanation missing');
        checkbox.click();const sampleTiming=providerTimings.length;shadow.querySelector('button[data-mode="incremental"]').click();
        await wait(()=>providerTimings.length>sampleTiming&&!shadow.querySelector('.status').dataset.busy);
        const resultText=shadow.querySelector('.status').textContent,aggregate=providerTimings.at(-1).steamDiagnostics;
        assert(resultText.includes('6 applications still need title or type information')&&resultText.includes('1 other application is saved separately')&&!/App-ID|conflicting returned|parser|HTTP/iu.test(resultText),'Normal Steam status must distinguish unidentified metadata without developer terminology');
        assert(aggregate?.outcomes.absent===1&&aggregate.outcomes.missingTitle===1&&aggregate.outcomes.unavailable===1&&aggregate.requests[0].matchedIdCount===5&&aggregate.requests[0].placeholderRowCount===1,'Detailed aggregate split/request counts absent');
        assert(!JSON.stringify(aggregate).includes('PRIVATE')&&!aggregate.samples,'Ordinary timing included private samples');
        assert(JSON.stringify(values.galacticLibraryDatabase.providerItems)===before,'Unresolved metadata changed saved ownership');
        let exported;const create=URL.createObjectURL,revoke=URL.revokeObjectURL,click=HTMLAnchorElement.prototype.click,importsBeforeDownload=imported;
        try{URL.createObjectURL=blob=>{exported=blob;return 'blob:synthetic-sample';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){assert(this.download==='GL-steam-app-id-sample.json','Wrong sample filename');};download.click();
          const sample=JSON.parse(await exported.text());assert(sample.groups.absent[0].appId==='105'&&!JSON.stringify(sample).includes('PRIVATE'),'Explicit sample exported unwanted fields');
          assert(imported===importsBeforeDownload,'Sample export started a new scan');
        }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;HTMLAnchorElement.prototype.click=click;}
        checkbox.click();assert(download.disabled&&globalThis.GalacticSteamStore.getDiagnosticSample()===null,'Disabling samples did not clear them');
        checks.push('Steam panel separates omitted/missing-title/invalid-type outcomes, exports only explicitly opted-in App IDs, clears samples and preserves ownership');
      }finally{globalThis.fetch=savedFetch;}
      // Exercise the actual page-local control, not the developer console switch.
      globalThis.GalacticSync.setProfiling(false);
      const profile=shadow.querySelector('[data-profile-next]'),profileStatus=shadow.querySelector('[data-profile-timing-status]'),quick=shadow.querySelector('[data-mode="incremental"]');
      assert(!profile.checked&&!profile.disabled&&profileStatus.textContent==='Detailed timing is off.','Profiling must start off');
      assert(shadow.querySelector('[data-open-timing]').href.endsWith('/options.html#settings'),'Timing export does not point to existing Settings');
      const messages=chrome.runtime.sendMessage;let detailed=[],failStart=false,abort=false,resetWorker=false;
      chrome.runtime.sendMessage=async request=>{
        if(failStart&&request.type==='GET_PROVIDER_SYNC_STATE')return {ok:false,error:'Synthetic start refusal'};
        return messages(request);
      };
      globalThis.GalacticSteamStore.fetchOwnedSteamGames=async(report,known,options)=>{
        detailed.push(options.diagnostics);
        assert(profile.disabled&&(!profile.checked||!options.diagnostics),'Running profiling can be rearmed');
        if(resetWorker)providerTimings.length=0; // Collector loss must not arm or consume anything.
        if(abort)throw Error('Synthetic cancellation');
        return {items:[],newAppCount:0,unresolvedApps:[],failedRequestCount:0,metadataOutcomes:{},...(options.diagnostics?{diagnostics:{outcomeVersion:3,ownedListRead:true,ownedIdCount:1,candidateCount:0,attemptedCount:0,outcomes:{},requests:[],httpStatuses:{},unsupportedTypes:{}}}:{})};
      };
      const runQuick=async()=>{quick.click();await wait(()=>!profile.disabled&&!shadow.querySelector('.status').dataset.busy);};
      try{
        profile.click();assert(profile.checked&&profileStatus.textContent.includes('Armed'),'UI did not arm');
        globalThis.GalacticSync.trace('epic');assert(profile.checked,'Unrelated provider consumed profiling');
        shadow.querySelector('[data-mode="full"]').click();await wait(()=>!profile.disabled&&!shadow.querySelector('.status').dataset.busy);
        assert(profile.checked&&detailed.at(-1)===false&&profileStatus.textContent.includes('Armed'),'Full rescan consumed the Quick Update request');
        profile.click();await runQuick();assert(detailed.at(-1)===false&&profileStatus.textContent==='Detailed timing is off.','Cancelling arm profiled an ordinary scan');
        const beforeProfile=providerTimings.length;profile.click();await runQuick();
        assert(detailed.at(-1)===true&&!profile.checked&&profileStatus.textContent.includes('Timing captured'),'One-shot UI did not capture/disarm');
        assert(providerTimings.length>beforeProfile&&providerTimings.at(-1).steamDiagnostics?.outcomeVersion===3,'Detailed scan was not delivered to the existing collector');
        await runQuick();assert(detailed.at(-1)===false,'One-shot profiling leaked into a later scan');
        checks.push('Steam UI arms only this tab’s next Quick Update, cancels on request, automatically disarms and leaves ordinary/unrelated scans unprofiled');
        const {bindPerformanceDiagnostics}=await import('../src/ui/performance-diagnostics.js');let exportClick,exported;
        bindPerformanceDiagnostics({button:{disabled:false,addEventListener:(event,handler)=>{exportClick=handler;}},status:{textContent:''},worker:{textContent:''},runtime:{sendMessage:async()=>({ok:true,providers:providerTimings,records:[],companions:[]})},download:summary=>{exported=summary;}});
        await exportClick();assert(exported.providers.some(t=>t.steamDiagnostics?.outcomeVersion===3),'Existing Settings export dropped the UI-profiled outcome report');
        checks.push('Existing Settings timing export retains the one-shot Steam report without enabling App-ID sampling');
        failStart=true;profile.click();await runQuick();assert(!profile.checked&&profileStatus.textContent.includes('Timing captured'),'Failed start left profiling armed');failStart=false;
        abort=true;profile.click();await runQuick();assert(!profile.checked&&profileStatus.textContent.includes('Timing captured'),'Cancelled scan left profiling armed');abort=false;
        resetWorker=true;profile.click();await runQuick();resetWorker=false;
        assert(!profile.checked&&providerTimings.length===1&&providerTimings[0].events.some(e=>e.stage==='provider_fetch'),'Worker collector replacement lost page completion or rearmed profiling');
        checks.push('Failed starts, cancelled scans and worker collector loss consume the one-shot request and retain diagnostic completion where delivery succeeds');
        const later=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async request=>request.type==='GL_PROVIDER_UI_TIMING'?Promise.reject(Error('Synthetic delivery loss')):later(request);
        profile.click();await runQuick();assert(!profile.checked&&profileStatus.textContent.includes('could not be delivered'),'Lost acknowledgement implied capture or rearmed profiling');chrome.runtime.sendMessage=later;
        profile.click();document.querySelector('#galactic-library-steam-store-importer').remove();
        await import('../src/providers/steam-store-content.js?profile-reload');
        const reloaded=shadows.at(-1);assert(!reloaded.querySelector('[data-profile-next]').checked&&reloaded.querySelector('[data-profile-timing-status]').textContent==='Detailed timing is off.','Reload retained a stale arm');
        assert(!globalThis.GalacticSync.trace('steam'),'Stale completion reenabled the global profiler');
        checks.push('Reload clears an unused arm; lost delivery is explicit and stale completion cannot rearm page or global profiling');
      }finally{chrome.runtime.sendMessage=messages;globalThis.GalacticSteamStore.fetchOwnedSteamGames=realSteamFetch;}
    }
    globalThis.GalacticSync.setProfiling(false);
    if(provider==='gog'){const beforeFailure=JSON.stringify(values.galacticLibraryDatabase.providerItems);
      globalThis.GalacticGog.fetchGogGames=async()=>{throw new Error('Network failure on page 7: PRIVATE_TOKEN');};const shadow=shadows.at(-1);shadow.querySelector('button[data-mode="full"]').click();
      await wait(()=>values.galacticLibraryDatabase.providers.gog.syncHealth.status==='failed');assert(values.galacticLibraryDatabase.providers.gog.syncHealth.failedPages[0]===7&&!JSON.stringify(values).includes('PRIVATE_TOKEN'),'Failure report lost its page or leaked raw errors.');const retained=providerRecord(values.galacticLibraryDatabase,'gog','fixture-123');assert(retained.id!=='gog:fixture-123'&&retained.profileId,'Named-account record lost profile scope.');assert(retained.title===items[0].title&&JSON.stringify(values.galacticLibraryDatabase.providerItems)===beforeFailure,'Failed scan destroyed prior records.');checks.push('actual GOG failure reports safe dashboard diagnostics and preserves the prior snapshot');
    }
  }
  // Contents controls and DOM extraction use fixture pages, never Amazon.
  let kindleShadow=shadows.find(root=>root.querySelector('[data-contents-mode]'));
  const originalFetch=globalThis.fetch;
  const urls=id=>'https://www.amazon.com/dp/'+id;
  await writer.mergeProviderItems('kindle',[
    {providerItemId:'B000000001',title:'Example collection',mediaType:'book',metadata:{detailUrl:urls('B000000001'),originType:'Purchase'}},
    {providerItemId:'B000000002',title:'Wool Omnibus',mediaType:'book',metadata:{detailUrl:urls('B000000002'),originType:'Purchase'}},
    {providerItemId:'B000000003',title:'Ordinary novel',mediaType:'book',metadata:{detailUrl:urls('B000000003'),originType:'Purchase'}},
    {providerItemId:'B000000004',title:'Unavailable',mediaType:'book',metadata:{detailUrl:urls('B000000004'),originType:'Purchase'}}
  ]);
  let db=await writer.getDatabase();
  await writer.saveKindleComicContents([
    {itemId:providerRecord(db,'kindle','B000000001').id,recordRef:providerRecord(db,'kindle','B000000001').recordRef,sourceUrl:urls('B000000001'),statement:'Collects Example #1-2',availability:'statement-found'},
    {itemId:providerRecord(db,'kindle','B000000004').id,recordRef:providerRecord(db,'kindle','B000000004').recordRef,sourceUrl:urls('B000000004'),statement:'',availability:'unavailable',extractorVersion:2}
  ]);
  // Simulate a backup predating extractor/parser versions.
  db=await writer.getDatabase();const legacy=providerRecord(db,'kindle','B000000001').metadata.enrichment.kindleProductComicContents;delete legacy.extractorVersion;delete legacy.parserVersion;delete legacy.parseOutcome;await writer.restoreDatabase(db);
  // The production adapter enforces Amazon origin; this localhost fixture uses
  // its real DOM extractor behind a fixture-only product fetch implementation.
  globalThis.GalacticKindle.fetchKindleProductComicContents=async (url,{signal,timing,requestPacer}={})=>{
    const request=async()=>{const headers=timing?.begin('fetch_headers',timing.attempts);try{return await fetch(url,{signal});}finally{headers?.();}};
    const response=await requestPacer.start(request,{signal,timing});
    const bodyEnd=timing?.begin('response_body',timing.attempts);const body=await response.text();bodyEnd?.();
    const domEnd=timing?.begin('dom_parse',timing.attempts);const document=new DOMParser().parseFromString(body,'text/html');domEnd?.();
    if(document.querySelector('#captchacharacters'))throw new Error('Amazon requested a CAPTCHA; wait before continuing.');
    const extractEnd=timing?.begin('extraction',timing.attempts);const statement=globalThis.GalacticKindle.kindleContentsStatementFromDocument(document);extractEnd?.();
    return {sourceUrl:url,statement,descriptionBlocks:globalThis.GalacticKindle.kindleDescriptionBlocks(document),availability:statement?'statement-found':'no-statement',extractorVersion:globalThis.GalacticKindle.contentsExtractorVersion};
  };
  const contentsMessages=[];let delayedState=null;
  const confirmationMessages=[];let confirmRestart=false;
  globalThis.confirm=message=>{confirmationMessages.push(message);return confirmRestart;};
  const perf=globalThis.GalacticContentsPerformance;
  globalThis.chrome.runtime.sendMessage=async request=>{
    contentsMessages.push(request);
    if(request.type==='KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true};
    if(request.type==='GET_KINDLE_CONTENTS_UI_TIMINGS')return {ok:true,records:[]};
    const timing=perf.trace(request.diagnosticLookupId,request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES'?'prepare':request.type==='REPARSE_KINDLE_CONTENTS'?'reparse':'network'),end=timing?.begin('worker_total');
    let value;
    if(request.type==='GET_KINDLE_CONTENTS_REFRESH'){if(delayedState)return delayedState;value={ok:true,...await writer.getKindleContentsRefresh()};}
    else if(request.type==='CHECK_KINDLE_CONTENTS_REFRESH_ITEM')value={ok:true,...await writer.execute('checkKindleContentsRefreshItem',[request.runRef,request.leaseRef,1,request.position],timing)};
    else if(request.type==='FINISH_KINDLE_CONTENTS_REFRESH')value={ok:true,refresh:await writer.execute('finishKindleContentsRefresh',[request.runRef,request.leaseRef,1,request.status],timing)};
    else if(request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES'){const db=await writer.execute('getDatabase',[],timing),selectionEnd=timing?.begin('candidate_selection');value={ok:true,...(request.mode==='rescan'?await writer.execute('beginKindleContentsRefresh',[request.refreshAction??'start',1],timing):kindleContentsPlan(db,request.mode))};selectionEnd?.();}
    else if(request.type==='REPARSE_KINDLE_CONTENTS'){await writer.execute('reparseKindleContents',[request.entries],timing);value={ok:true};}
    else if(request.type==='SAVE_KINDLE_COMIC_CONTENTS'){const result=await writer.execute(request.refresh?'commitKindleContentsRefresh':'saveKindleComicContents',request.refresh?[request.entries,request.refresh.runRef,request.refresh.leaseRef,1]:[request.entries],timing);value={ok:true,...(request.refresh?{refresh:result}:{})};}
    else return {ok:false,error:'Unexpected contents request.'};
    end?.();return timing?{...value,performance:perf.clean(timing.finish())}:value;
  };
  let requests=[],requestStarts=[],captcha=false,hold=false,transientOnce=false,holdAtRequest=0;
  globalThis.fetch=async (input,options)=>{
    if(!String(input).startsWith('https://www.amazon.com/dp/'))return originalFetch(input,options);
    requests.push(String(input));
    requestStarts.push(performance.now());
    if(transientOnce){transientOnce=false;throw Error('Network failure PRIVATE_REQUEST_SECRET');}
    if(hold||requests.length===holdAtRequest)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Paused','AbortError')),{once:true}));
    const description=String(input).endsWith('B000000003')?'An ordinary novel.':String(input).endsWith('B000000002')?'Includes Wool, Shift and Dust.':'Contains Example #1-2.';
    return new Response(captcha?'<input id="captchacharacters">':'<div id="bookDescription_feature_div">'+description+'</div>',{status:200});
  };
  // Reload the actual content script with a deliberately delayed saved queue.
  // Nothing may begin while the read is pending, even a synthetic click.
  const frozen=await writer.beginKindleContentsRefresh('start',1);
  await writer.finishKindleContentsRefresh(frozen.refresh.runRef,frozen.refresh.leaseRef,1,'paused');
  const savedBefore=structuredClone(values.galacticLibraryKindleContentsRefresh);
  let releaseState;delayedState=new Promise(resolve=>{releaseState=resolve;});
  document.querySelector('#galactic-library-kindle-importer').remove();
  history.replaceState({},'','/hz/mycd/');
  await import('../src/providers/kindle-content.js?delayed-checkpoint');kindleShadow=shadows.at(-1);
  const selector=kindleShadow.querySelector('[data-contents-mode]'),start=kindleShadow.querySelector('[data-action="comic-contents"]'),stop=kindleShadow.querySelector('[data-action="pause-comic-contents"]'),status=kindleShadow.querySelector('.status');
  const finished=async()=>{for(let n=0;n<600;n++){if(!status.dataset.busy&&!selector.disabled)return;await pause();}throw new Error('Contents UI did not finish: '+status.textContent);};
  const newRefresh=kindleShadow.querySelector('[data-action="new-refresh"]');
  const resume=kindleShadow.querySelector('[data-action="resume-contents"]');
  const rect=node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100).join(',');};
  let primaryRect=rect(start),restartRect=rect(newRefresh);
  const preparedBefore=contentsMessages.filter(request=>request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES').length;
  assert(start.disabled&&resume.disabled&&newRefresh.disabled&&selector.disabled,'Checkpoint loading exposed actionable contents controls.');
  for(const button of [start,resume,newRefresh])button.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  start.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  delayedState=null;releaseState({ok:true,...await writer.getKindleContentsRefresh()});
  await wait(()=>!selector.disabled);
  resume.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));resume.dispatchEvent(new MouseEvent('click',{bubbles:true}));await pause();
  assert(selector.value==='rescan'&&!resume.hidden&&start.hidden,'Saved unfinished refresh did not default to Resume.');
  assert(rect(resume)===primaryRect&&rect(newRefresh)===restartRect,'Checkpoint loading shifted action slots.');
  assert(contentsMessages.filter(request=>request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES').length===preparedBefore&&!confirmationMessages.length,'A click begun while loading activated a newly enabled action.');
  assert(JSON.stringify(values.galacticLibraryKindleContentsRefresh)===JSON.stringify(savedBefore),'Loading or racing click changed the saved queue.');
  delayedState=new Promise(resolve=>{releaseState=resolve;});selector.dispatchEvent(new Event('change'));
  newRefresh.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  delayedState=null;releaseState({ok:true,...await writer.getKindleContentsRefresh()});await wait(()=>!selector.disabled);
  newRefresh.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));newRefresh.dispatchEvent(new MouseEvent('click',{bubbles:true}));await pause();
  assert(!confirmationMessages.length&&JSON.stringify(values.galacticLibraryKindleContentsRefresh)===JSON.stringify(savedBefore),'A restart gesture begun during loading was not discarded.');
  delayedState=Promise.resolve({ok:false,error:'Synthetic unavailable state'});selector.dispatchEvent(new Event('change'));
  await wait(()=>/could not be loaded/.test(kindleShadow.querySelector('.contents-mode-help').textContent));
  assert(start.disabled&&resume.disabled&&newRefresh.disabled&&selector.disabled,'Failed checkpoint load enabled a refresh action.');
  delayedState=null;selector.dispatchEvent(new Event('change'));await wait(()=>!selector.disabled);
  assert(rect(resume)===primaryRect&&rect(newRefresh)===restartRect,'Reloading state shifted the action slots.');
  newRefresh.click();await wait(()=>confirmationMessages.length===1);
  assert(/completed\/total progress \(0\/4\) will be abandoned/.test(confirmationMessages[0]),'Restart confirmation omitted saved completed/total progress.');
  assert(JSON.stringify(values.galacticLibraryKindleContentsRefresh)===JSON.stringify(savedBefore),'Cancelled restart changed the saved queue.');
  checks.push('Delayed persisted-state loading disables controls, defaults to Resume and rejects clicks begun during resolution');
  checks.push('Restart occupies a separate stable slot and cancelling its progress confirmation preserves the entire queue');
  checks.push('Unavailable checkpoint reads fail closed; primary and restart gestures across delayed reloading cannot begin work');
  kindleShadow.querySelector('[data-galactic-floating-panel-control="minimize"]').click();
  assert(getComputedStyle(kindleShadow.querySelector('.panel')).display==='none','New panel layout broke Minimize.');
  kindleShadow.querySelector('[data-galactic-floating-panel-control="restore"]').click();
  assert(rect(resume)===primaryRect&&rect(newRefresh)===restartRect,'Expand changed the action slots.');
  const setMode=async value=>{selector.value=value;selector.dispatchEvent(new Event('change'));await wait(()=>!selector.disabled);};
  const runRefresh=async()=>{confirmRestart=true;const before=contentsMessages.filter(request=>request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES').length;newRefresh.click();await wait(()=>contentsMessages.filter(request=>request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES').length>before);};
  await setMode('scan');start.click();await finished();db=await writer.getDatabase();
  assert(requests.length===2&&!requests.some(url=>url.endsWith('B000000004')),'Normal scan fetched saved or unavailable pages.');
  assert(providerRecord(db,'kindle','B000000001').metadata.enrichment.kindleProductComicContents.parserVersion===CONTENTS_PARSER_VERSION,'Saved text was not locally reparsed.');
  assert(/1 statements reprocessed locally/.test(status.textContent)&&/1 contents found/.test(status.textContent)&&/1 contents not extracted/.test(status.textContent),'Discovery progress lost local/found/empty counts: '+status.textContent);
  assert(providerRecord(db,'kindle','B000000002').metadata.enrichment.kindleProductComicContents.parseOutcome==='full'&&!Object.keys(db.contentReviews).length,'Named proposal disappeared or became verified.');
  checks.push('Kindle contents controls scan prose, locally reparse legacy text and skip unavailable pages');
  assert(!contentsMessages.some(request=>request.diagnosticLookupId),'Disabled diagnostics sent timing requests.');
  kindleShadow.querySelector('[data-contents-diagnostics]').checked=true;
  const workbench=createEnrichmentWorkbench({inspect(){},refresh(){}});document.body.append(workbench.element);workbench.update(db);workbench.element.open=true;await pause();
  const queue=workbench.element.querySelector('[aria-label="Enrichment queue"]');queue.value='unparsed';queue.dispatchEvent(new Event('change'));
  assert(workbench.element.querySelectorAll('li').length===2,'Fully parsed statements are hidden from Contents to review.');
  const record=providerRecord(db,'kindle','B000000002');let savedReview;
  const editor=createContentsEditor(record,null,{save:async(id,value)=>{savedReview=value;await writer.saveContentReview(id,value);},refresh(){}});document.body.append(editor);editor.open=true;await pause();
  const click=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label).click();
  click(editor,'Parse statement for review');assert(editor.querySelectorAll('tbody tr').length===3,'Named works are missing from the editor.');click(editor,'Save reviewed contents');await wait(()=>Boolean(savedReview));
  assert(savedReview.entries.every(entry=>entry.unitType==='component'),'Named suggestions changed their component shape.');
  checks.push('Contents to review lists fully parsed proposals; explicit editor confirmation saves named components');
  await setMode('reparse');const before=requests.length;start.click();await finished();assert(requests.length===before,'Parser-only mode contacted Amazon.');
  checks.push('Kindle parser-only mode makes zero requests');
  captcha=true;await setMode('rescan');await runRefresh();await finished();assert(requests.length===before+1&&/Stopped:.*CAPTCHA/i.test(status.textContent),'CAPTCHA did not stop the queue.');
  db=await writer.getDatabase();assert(providerRecord(db,'kindle','B000000001').metadata.enrichment.kindleProductComicContents.statement==='Collects Example #1-2','Failed refresh erased saved text.');
  captcha=false;await setMode('retry');start.click();await finished();assert(requests.length===before+2,'Retry did not target just the incomplete result.');
  checks.push('Kindle CAPTCHA stops sequential rescan; retry preserves and refreshes the saved statement');
  await writer.mergeProviderItems('kindle',[{providerItemId:'B000000005',title:'Fresh ordinary book',mediaType:'book',metadata:{detailUrl:urls('B000000005'),originType:'Purchase'}}]);
  hold=true;await setMode('rescan');const pausedBefore=requests.length;await runRefresh();await wait(()=>requests.length>pausedBefore);stop.click();await finished();
  assert(/Paused/.test(status.textContent)&&!resume.disabled&&!selector.disabled,'Pause failed to abort or re-enable controls.');
  hold=false;transientOnce=true;await setMode('scan');const resumeBefore=requests.length;start.click();await finished();assert(requests.length===resumeBefore+2&&requests.at(-1).endsWith('B000000005'),'Normal scan did not resume only unfinished eligible books.');
  checks.push('Kindle Pause aborts the current request and normal scan resumes unfinished work');
  kindleShadow.querySelector('[data-export-timing]').click();await wait(()=>!kindleShadow.querySelector('[data-timing-output]').hidden);
  const diagnosticText=kindleShadow.querySelector('[data-timing-output]').value,report=JSON.parse(diagnosticText);
  assert(report.records.some(row=>row.kind==='reparse')&&report.records.some(row=>row.result==='captcha')&&report.records.some(row=>row.result==='paused'),'Diagnostic operation classes missing.');
  const retry=report.records.find(row=>row.attempts===2);assert(retry&&retry.timingMs.retry>=1900&&retry.events.some(event=>event.stage==='writer_queue')&&retry.events.some(event=>event.stage==='storage_write'),'Retry/worker timing is incomplete.');
  assert(retry.events.some(event=>event.stage==='fetch_headers')&&retry.events.some(event=>event.stage==='extraction')&&retry.timingMs.throttle>=0,'Page timing is incomplete.');
  for(const secret of ['B000000','amazon.com','Ordinary novel','PRIVATE_REQUEST_SECRET','Collects Example','Wool Omnibus'])assert(!diagnosticText.includes(secret),'Diagnostic output leaked '+secret);
  assert(report.records.length<=50&&report.aggregates.retry.stagesMs.total.count===1,'Diagnostic history or retry aggregation changed.');
  checks.push('Kindle opt-in diagnostics join page/worker timing, separate retries/reparse and export no personal data');
  await writer.mergeProviderItems('kindle',[
    {providerItemId:'B000000006',title:'Pause buffer first',mediaType:'book',metadata:{detailUrl:urls('B000000006'),originType:'Purchase'}},
    {providerItemId:'B000000007',title:'Pause buffer second',mediaType:'book',metadata:{detailUrl:urls('B000000007'),originType:'Purchase'}}
  ]);
  holdAtRequest=requests.length+2;await setMode('scan');start.click();await wait(()=>requests.length===holdAtRequest);
  assert(!providerRecord(values.galacticLibraryDatabase,'kindle','B000000006').metadata.enrichment?.kindleProductComicContents,'A buffered result wrote the database immediately.');
  stop.click();await finished();db=await writer.getDatabase();
  assert(providerRecord(db,'kindle','B000000006').metadata.enrichment.kindleProductComicContents.statement&&!providerRecord(db,'kindle','B000000007').metadata.enrichment?.kindleProductComicContents,'Pause did not flush only completed results.');
  holdAtRequest=0;const resumedAt=requests.length;start.click();await finished();assert(requests.length===resumedAt+1&&requests.at(-1).endsWith('B000000007'),'Pause/resume repeated an acknowledged buffered result.');
  checks.push('actual Kindle Pause flushes buffered completed results and resume checks only the interrupted page');

  // Exercise the actual refresh controls and frozen position, not just the
  // writer API. Keep the synthetic queue tiny and all product fetches mocked.
  const refreshDb=await writer.getDatabase();refreshDb.providerItems=Object.fromEntries(Object.entries(refreshDb.providerItems).filter(([,record])=>record.provider==='kindle'&&['B000000001','B000000002','B000000003'].includes(record.providerItemId)));refreshDb.canonicalItems={};await writer.restoreDatabase(refreshDb);
  // The editor fixtures above change document scrollbars; compare transitions
  // in the current viewport, not coordinates from before those unrelated UIs.
  primaryRect=rect(start);restartRect=rect(newRefresh);
  await setMode('rescan');
  assert(/\(3\)/.test(kindleShadow.querySelector('.contents-mode-help').textContent),'Refresh eligibility count missing.');
  const refreshStart=requests.length;holdAtRequest=refreshStart+2;await runRefresh();
  assert(rect(stop)===primaryRect&&rect(newRefresh)===restartRect,`Running Pause/restart slots moved: ${rect(stop)} vs ${primaryRect}; ${rect(newRefresh)} vs ${restartRect}`);
  status.textContent+=' '+('Long changing progress text. '.repeat(80));
  kindleShadow.querySelector('[data-timing-output]').hidden=false;
  assert(rect(stop)===primaryRect&&rect(newRefresh)===restartRect,'Async status or diagnostics shifted actions.');await wait(()=>requests.length===holdAtRequest);stop.click();await finished();
  const checkpoint=(await writer.getKindleContentsRefresh()).checkpoint;
  assert(checkpoint.status==='paused'&&checkpoint.cursor===1&&checkpoint.total===3,'Refresh Pause lost fixed denominator or acknowledged position.');
  await wait(()=>!resume.hidden&&!resume.disabled);assert(rect(resume)===primaryRect&&rect(newRefresh)===restartRect,'Paused Resume moved from the Pause slot.');
  const pausedQueue=structuredClone(values.galacticLibraryKindleContentsRefresh),confirmBefore=confirmationMessages.length;
  confirmRestart=false;newRefresh.click();await wait(()=>confirmationMessages.length>confirmBefore);
  assert(/completed\/total progress \(1\/3\) will be abandoned/.test(confirmationMessages.at(-1)),'Restart did not describe the current acknowledged progress.');
  assert(JSON.stringify(values.galacticLibraryKindleContentsRefresh)===JSON.stringify(pausedQueue),'Cancelling restart lost completed work.');
  holdAtRequest=0;const resumeStart=requests.length;resume.click();await finished();
  assert(requests.length===resumeStart+2&&!requests.slice(resumeStart).includes(requests[refreshStart]),'Refresh Resume repeated acknowledged item.');
  assert((await writer.getKindleContentsRefresh()).checkpoint.status==='completed'&&/3\/3/.test(status.textContent),'Refresh completion lost frozen progress.');
  checks.push('Refresh all includes prior successes, exposes count and resumes actual frozen queue after Pause');
  checks.push('Pause and Resume share fixed geometry through long status changes; cancelled restart preserves acknowledged progress');
  kindleShadow.querySelector('[data-export-timing]').click();await wait(()=>kindleShadow.querySelector('[data-timing-output]').value!==diagnosticText);
  const refreshTiming=JSON.parse(kindleShadow.querySelector('[data-timing-output]').value),resumedRows=refreshTiming.records.filter(row=>row.kind==='network'&&row.events.some(event=>event.stage==='refresh_check_message')&&row.attempts===1).slice(-2);
  assert(resumedRows.length===2,'Resumed refresh timings missing.');
  assert(resumedRows.some(row=>row.events.some(event=>event.stage==='refresh_projection_hit')),'Actual resumed queue did not reuse bounded eligibility answers.');
  for(const row of resumedRows){
    const check=row.events.find(event=>event.stage==='refresh_check_message'),fetch=row.events.find(event=>event.stage==='fetch_headers');
    assert(check.startMs<=fetch.startMs&&row.events.some(event=>event.stage==='refresh_identity_validation'),'Preflight was charged to another item.');
    assert(row.timingMs.throttle>=0&&!row.events.some(event=>event.stage==='read_validation'&&event.startMs<fetch.startMs),'Refresh pacing or cheap preflight regressed.');
  }
  assert(refreshTiming.records.some(row=>row.kind==='checkpoint'&&row.events.some(event=>event.stage==='refresh_checkpoint_read')),'Final queue housekeeping missing from separate timing.');
  checks.push('Refresh timings attach fresh identity checks to each fetched item and retain one-second pacing and final checkpoint costs');
  hold=true;const abortStart=requests.length;await runRefresh();await wait(()=>requests.length>abortStart);kindleShadow.querySelector('[data-action="stop-contents"]').click();await finished();hold=false;
  assert((await writer.getKindleContentsRefresh()).checkpoint.status==='aborted'&&resume.hidden,'Stop refresh left a resumable queue.');
  checks.push('Stop refresh aborts the actual request and retains evidence while abandoning the queue');
  assert(requestStarts.slice(1).every((start,index)=>start-requestStarts[index]>=1000),'Contents requests started more frequently than once per second.');
  checks.push('Actual contents controls keep every request start at least 1000 ms apart across retries, CAPTCHA, Pause/Resume and checkpoints');


  const {checkProductDetailsCapture,checkProductDetailsUi}=await import('./kindle-product-details-fixture.js');
checks.push(...checkProductDetailsCapture(html=>new DOMParser().parseFromString(html,'text/html')));
checks.push(...await checkProductDetailsUi(html=>new DOMParser().parseFromString(html,'text/html')));
const {checkKindleCategoryCapture}=await import('./kindle-category-fixture.js');
  checks.push(...checkKindleCategoryCapture(html=>new DOMParser().parseFromString(html,'text/html')));
  const {checkKindleSourceCapture}=await import('./kindle-source-capture-fixture.js');
  const captureFixtures=await (await originalFetch('/tests/fixtures/kindle/kindle-source-capture.json')).json();
  checks.push(...await checkKindleSourceCapture(captureFixtures,html=>new DOMParser().parseFromString(html,'text/html')));
  const {checkIndependentEvidence}=await import('./kindle-independent-evidence-fixture.js');
  checks.push(...await checkIndependentEvidence(await (await originalFetch('/tests/fixtures/kindle/kindle-independent-evidence.json')).json(),{ui:true}));
  const {checkWholeManifest}=await import('./kindle-whole-manifest-fixture.js');
  checks.push(...await checkWholeManifest(await (await originalFetch('/tests/fixtures/kindle/kindle-whole-manifest.json')).json(),{ui:true}));
  globalThis.fetch=originalFetch;
  await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack||error.message})});}
