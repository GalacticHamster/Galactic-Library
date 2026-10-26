import {createStorageWriter} from '../src/background/storage-writer.js';
import {DATABASE_STORAGE_KEY,PROVIDERS} from '../src/lib/constants.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
const snapshotFixture=(provider,items)=>completeProviderSnapshot(provider,items,['books','personal-documents'].map(id=>{const n=items.filter(i=>(i.metadata.libraryCategory??'books')===id).length;return {...completedScope(id,n,n,'reported-count'),duplicateCount:0};}));

const checks=[],assert=(value,message)=>{if(!value)throw Error(message);};
const delay=()=>new Promise(resolve=>setTimeout(resolve,20));
async function wait(predicate,message){for(let n=0;n<100;n++){if(predicate())return;await delay();}throw Error(message);}
const button=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent===label);
const navigate=name=>document.querySelector(`#workspace-navigation [data-workspace="${name}"]`).click();
const account=id=>document.querySelector(`[data-account="${id}"]`);
const storageListeners=[],runtimeListeners=[],operations=[],opened=[],xboxLaunches=[],state={},syncCalls=[];let connected=null,confirmSync=false;globalThis.confirm=()=>confirmSync;
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async changes=>Object.assign(state,structuredClone(changes)),remove:async keys=>{for(const k of keys)delete state[k];}});
globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener:fn=>runtimeListeners.push(fn)},sendMessage:async request=>{
 if(request.type==='OPEN_XBOX_IMPORT'){xboxLaunches.push(request);return {ok:true};}
 if(request.type==='GH_PURCHASE_ACTION'){
  syncCalls.push(request);const accounts=[{stableId:'personal',label:'Personal',count:2},{stableId:'family',label:'Family',count:3}];
  if(request.action==='syncState')return {ok:true,state:connected,accounts};
  if(request.action==='syncChoices')return {ok:true,state:connected,accounts,remoteAccounts:accounts,peerId:'verified-fixture'};
  if(request.action==='syncConnect'){assert(request.confirmed&&request.sameAccount,'Sync consent missing');connected={confirmed:true,remoteConfirmed:true,status:'synced',lastSuccess:new Date().toISOString()};return {ok:true};}
  if(request.action==='pending')return {ok:true,offer:null};return {ok:false,error:'Manual transfers disabled in fixture'};
 }
 if(request.type==='GET_KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true,runs:[]};
 if(request.type==='GL_CONTENTS_UI_TIMING')return {ok:true};
 if(request.type!=='LIBRARY_STORAGE_OPERATION')throw Error('Unexpected acquisition/network request: '+request.type);
 operations.push(request.operation);
 try{return {ok:true,result:await writer[request.operation](...request.args)};}catch(error){return {ok:false,error:error.message};}
}},tabs:{create:async ({url})=>{opened.push(url);return {}; }},storage:{onChanged:{addListener:fn=>storageListeners.push(fn)}}};
async function reconcile(){for(const fn of storageListeners)fn({[DATABASE_STORAGE_KEY]:{newValue:state[DATABASE_STORAGE_KEY]}},'local');await delay();}
function closeDialog(){const d=document.querySelector('dialog');if(d)button(d,'Cancel').click();}
const book={providerItemId:'B000000001',title:'Synthetic Collection',mediaType:'book',ownership:'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B000000001'}};
try{
 await import('../shared/purchase-handoff-ui.js');await import('../shared/purchase-sync-ui.js');
 await import('../src/ui/options.js');
 await wait(()=>!document.querySelector('#empty-library').hidden,'Empty Library onboarding did not load.');
 const diagnosticToggle=document.querySelector('#enable-provider-diagnostics');
 await wait(()=>!diagnosticToggle.disabled,'Troubleshooting preference did not load.');
 assert(!diagnosticToggle.checked,'Provider diagnostics should default off.');
 const beforeDiagnostic=JSON.stringify(await writer.getDatabase());
 diagnosticToggle.checked=true;diagnosticToggle.dispatchEvent(new Event('change'));
 await wait(()=>!diagnosticToggle.disabled&&state.galacticLibraryProviderDiagnostics===true,'Diagnostic preference not saved.');
 const reopened=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async changes=>Object.assign(state,structuredClone(changes))});
 assert(await reopened.getProviderDiagnosticsEnabled()&&JSON.stringify(await writer.getDatabase())===beforeDiagnostic,'Diagnostic preference changed library records or failed after reopening storage.');
 diagnosticToggle.checked=false;diagnosticToggle.dispatchEvent(new Event('change'));await wait(()=>!diagnosticToggle.disabled&&state.galacticLibraryProviderDiagnostics===false,'Diagnostic preference did not turn off.');
 checks.push('Settings provider diagnostics defaults off, persists independently, can be disabled and leaves all library records unchanged');
 assert([...document.querySelectorAll('#workspace-navigation button')].map(b=>b.textContent).join('|')==='Library|Providers|Books & Contents|Settings','Wrong main navigation.');
 button(document.querySelector('#empty-library'),'Add a library').click();assert(!document.querySelector('#providers-workspace').hidden,'Add library did not open Providers.');
 assert(document.querySelectorAll('.provider-card').length===PROVIDERS.length,'Supported provider choices missing.');
 const providerCards=[...document.querySelectorAll('.provider-card')],images=providerCards.flatMap(card=>[...card.querySelectorAll(':scope > summary .provider-logo img')]);
 await wait(()=>images.every(image=>image.complete&&image.naturalWidth===64&&image.naturalHeight===64),'Bundled 64px provider logos did not load');
 assert(providerCards.length===14&&images.length===15&&providerCards.every(card=>card.querySelector('.provider-logo')),'A supported provider has no supplied logo');
 assert(images.every(image=>image.alt===''&&image.closest('[aria-hidden="true"]')&&image.width===36&&image.height===36),'Provider logos are not decorative 36px images');
 const baseline=document.createElement('style');baseline.textContent='.provider-card-title {gap:8px!important}.provider-logo {flex-basis:28px!important;width:28px!important}.provider-logo img {width:28px!important;height:28px!important}';document.head.append(baseline);
 const previousHeights=providerCards.map(card=>card.getBoundingClientRect().height);baseline.remove();
 if(innerWidth>=1000)assert(providerCards.every((card,index)=>Math.abs(card.getBoundingClientRect().height-previousHeights[index])<1),'Larger logos unnecessarily changed desktop card heights');
 const originalSources=images.filter(image=>!image.dataset.logoTheme).map(image=>image.src);
 const epic=document.querySelector('[data-provider="epic"]'),epicLight=epic.querySelector('[data-logo-theme="light"]'),epicDark=epic.querySelector('[data-logo-theme="dark"]');
 let savedAppearance='light';
 const appearance=globalThis.GalacticHamsterTheme.mount({role:'gl',storage:{onChanged:{addListener(){}}},runtime:{sendMessage:async request=>{if(request.type==='GH_SET_APPEARANCE')savedAppearance=request.mode;return {ok:true,appearance:{mode:savedAppearance,followGl:false}};}}});
 await appearance.ready;
 const visible=image=>getComputedStyle(image).display!=='none';
 assert(document.documentElement.dataset.ghTheme==='light'&&visible(epicLight)&&!visible(epicDark),'Saved light appearance did not select black Epic artwork');
 for(const mode of ['dark','light','system']){
  const select=document.querySelector('#appearance-mode');select.value=mode;select.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>!select.disabled&&appearance.preferences.mode===mode,'Theme selection did not finish');
  const resolved=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;
  assert(document.documentElement.dataset.ghTheme===resolved&&visible(epicLight)===(resolved==='light')&&visible(epicDark)===(resolved==='dark'),'Epic artwork disagrees with resolved '+mode+' appearance');
  assert(JSON.stringify(images.filter(image=>!image.dataset.logoTheme).map(image=>image.src))===JSON.stringify(originalSources),'Another provider changed artwork with the theme');
 }
 for(const card of providerCards){const summary=card.querySelector(':scope > summary'),title=summary.querySelector('strong'),logo=title.querySelector('.provider-logo'),art=[...logo.querySelectorAll('img')].find(visible),rect=art.getBoundingClientRect(),cardRect=card.getBoundingClientRect(),titleRect=title.getBoundingClientRect(),count=summary.lastElementChild.getBoundingClientRect();assert(rect.width===36&&rect.height===36&&getComputedStyle(title).gap==='10px','Provider artwork size or name spacing is incorrect');assert(Math.abs((rect.top+rect.bottom)-(titleRect.top+titleRect.bottom))<1,'Provider artwork is not vertically centered');assert(rect.top>=cardRect.top&&rect.bottom<=cardRect.bottom&&logo.getBoundingClientRect().right<=titleRect.right&&summary.getBoundingClientRect().right<=innerWidth,'Provider title or logo clips at this viewport');assert(count.top>=titleRect.bottom||count.bottom<=titleRect.top||count.left>=titleRect.right,'Account counts overlap the provider name');}
 const first=providerCards[0];first.querySelector('summary').click();assert(first.open,'Logo-bearing summary no longer expands the card');first.querySelector('summary').click();assert(!first.open,'Logo-bearing summary no longer collapses the card');
 first.querySelector('img').dispatchEvent(new Event('error'));assert(!first.querySelector('.provider-logo')&&first.querySelector('strong').textContent==='Steam','Missing-logo fallback removed the provider name');
 checks.push('All fourteen bundled logos load decoratively; saved, switched and system themes select Epic artwork without changing other logos; expansion and missing-image fallback remain usable');
 assert(document.querySelector('.provider-card[data-provider="xbox"]')&&document.querySelector('.provider-card[data-provider="playstation"]')&&document.querySelector('.provider-card[data-provider="nintendo"]'),'Console provider entry points missing.');
 const syncHost=document.querySelector('#purchase-sharing-humble [data-purchase-handoff]'),manual=syncHost.querySelector('[data-purchase-manual]');
 assert(document.querySelector('.provider-card[data-provider="humble"]').contains(syncHost)&&document.querySelectorAll('#purchase-sharing-humble').length===1,'Connection is separate or duplicated');
 assert(!document.querySelector('#settings-workspace #official-companion-status')&&document.querySelector('#providers-workspace #official-companion-status'),'Connection checks still scattered across Settings');


 const humbleCard=document.querySelector('.provider-card[data-provider="humble"]');humbleCard.open=true;await wait(()=>!syncHost.querySelector('[data-sync-connect]').disabled,'Connection state did not load');syncHost.querySelector('[data-sync-connect]').click();await wait(()=>syncHost.querySelector('[data-sync-advanced]').open,'Multiple accounts were not exposed');
 assert(!syncCalls.some(r=>r.action==='syncConnect')&&syncHost.querySelector('[data-sync-connect]').disabled,'Ambiguous accounts were automatically connected');
 for(const selector of ['[data-sync-local]','[data-sync-remote]']){const field=syncHost.querySelector(selector);field.value='personal';field.dispatchEvent(new Event('change'));}
 syncHost.querySelector('[data-sync-connect]').click();await delay();assert(!syncCalls.some(r=>r.action==='syncConnect'),'Cancelled connection still sent consent');confirmSync=true;syncHost.querySelector('[data-sync-connect]').click();await wait(()=>syncHost.querySelector('[data-sync-status]').textContent==='Synced','Confirmed connection status missing');assert(syncCalls.filter(r=>r.action==='syncConnect').length===1,'Setup sent duplicate authorization');
 checks.push('Colocated sync UI requires exact account selections and confirmation before sending existing setup requests');
 assert(!operations.includes('beginProviderScan')&&opened.length===0,'Onboarding started an import.');checks.push(`Empty Library routes to all ${PROVIDERS.length} providers without acquisition`);
 const xboxLink=new URL(document.querySelector('.provider-card[data-provider="xbox"] .provider-account-body a').href);
 assert(xboxLink.origin+xboxLink.pathname==='https://play.xbox.com/library'&&xboxLink.searchParams.get('tab')==='fullLibrary'&&xboxLink.searchParams.get('view')==='grid'&&xboxLink.searchParams.get('catalog')==='owned','Xbox provider link does not open the full-library Owned grid directly');checks.push('Xbox opens the full-library Owned grid directly without starting an import');
 document.querySelector('.provider-card[data-provider="xbox"] .provider-account-body a').click();await delay();
 assert(xboxLaunches.length===1&&opened.length===0&&!operations.includes('beginProviderScan'),'Xbox launch bypassed scoped tab orchestration or started acquisition');
 checks.push('Xbox website action requests exactly one GL-scoped launch without starting an import');

 let d=await writer.replaceProviderItems('kindle',[book],{profileLabel:'',fullSyncAt:'2026-10-01'},snapshotFixture('kindle',[book]));const a=d.providers.kindle.activeProfileId,ref=Object.values(d.providerItems)[0].recordRef;
 d=await writer.saveContentReview(Object.keys(d.providerItems)[0],{entries:[{series:'Synthetic',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'}],statement:'Collects Synthetic #1',source:'manual-review',sourceUrl:'',verifiedAt:'2026-10-01'});
 await reconcile();await wait(()=>account(a),'Migrated account missing.');const kindle=document.querySelector('[data-provider="kindle"]');kindle.open=true;await delay();
 assert(!document.querySelector('#unnamed-accounts-help').hidden,'Naming guidance missing.');assert(button(account(a),'Quick update').disabled,'Unnamed account update offered.');
 button(account(a),'Name this account').click();let dialog=document.querySelector('dialog');dialog.querySelector('input').value='Personal';button(dialog,'Save nickname').click();await wait(()=>!document.querySelector('dialog'),'Rename did not finish.');
 d=await writer.getDatabase();assert(d.providerProfiles[a].nickname==='Personal'&&Object.values(d.providerItems)[0].recordRef===ref,'Rename changed identity.');assert(Object.keys(d.contentReviews).length===1,'Rename erased review.');checks.push('Migrated account naming preserves identity and reviewed contents');assert(document.querySelector('#purchase-sharing-humble [data-purchase-handoff]')===syncHost&&syncHost.querySelector('[data-purchase-manual]')===manual&&!manual.open,'Account reconciliation replaced or expanded manual connection controls');checks.push('Each provider retains one connection panel and its staged controls across account refreshes');

 d=await writer.replaceProviderItems('kindle',[{...book,ownership:'borrowed'}],{profileLabel:'Other',fullSyncAt:'2026-10-02'},snapshotFixture('kindle',[book]));const b=d.providers.kindle.activeProfileId;
 await reconcile();await wait(()=>account(b),'Second account missing.');
 assert(account(a)&&account(b),'Remembered account hidden.');assert(button(account(a),'Quick update').disabled,'Inactive account update offered.');
 button(account(a),'Select for updates').click();dialog=document.querySelector('dialog');button(dialog,'Select account').click();assert(!operations.includes('selectProviderProfile'),'Selection lacked explicit confirmation.');dialog.querySelector('input').checked=true;button(dialog,'Select account').click();await wait(()=>!document.querySelector('dialog'),'Selection did not finish.');
 d=await writer.getDatabase();assert(d.providers.kindle.activeProfileId===a&&Object.keys(d.providerItems).length===2,'Selection lost another account.');assert(d.providers.kindle.fullSyncAt==='2026-10-01T00:00:00.000Z','A baseline not restored.');assert(!operations.includes('beginProviderScan'),'Offline selection began a scan.');checks.push('Two accounts coexist and confirmed offline selection restores the saved baseline');

 button(account(a),'Quick update').click();dialog=document.querySelector('dialog');assert(dialog.textContent.includes('Opening the site does not start an import'),'Update scope unclear.');button(dialog,'Open Kindle for Quick update').click();await wait(()=>opened.length===1,'Provider page was not opened.');assert(opened[0].startsWith('https://www.amazon.com/hz/mycd/'),'Wrong provider URL.');assert(!operations.includes('beginProviderScan'),'Update guidance acquired data.');closeDialog();checks.push('Quick update uses the existing signed-in provider flow without auto-scanning');

 const advanced=account(a).querySelector('details');advanced.open=true;button(advanced,'Reset import history').click();dialog=document.querySelector('dialog');button(dialog,'Reset import history').click();assert(!operations.includes('resetProviderProfileBaseline'),'Reset lacked confirmation.');dialog.querySelector('input').checked=true;button(dialog,'Reset import history').click();await wait(()=>!document.querySelector('dialog'),'Reset did not finish.');
 d=await writer.getDatabase();assert(!d.providerProfiles[a].state.fullSyncAt&&Object.keys(d.contentReviews).length===1,'Reset erased contents or kept import baseline.');assert(button(account(a),'Quick update').disabled,'Quick update available after baseline reset.');checks.push('Confirmed baseline reset retains reviewed contents and disables Quick update');

 account(b).querySelector('details').open=true;button(account(b),'Remove saved account').click();await wait(()=>document.querySelector('dialog')?.textContent.includes('Remove account permanently'),'Removal preview missing.');dialog=document.querySelector('dialog');assert(dialog.textContent.includes('This is not disconnecting'),'Removal consequences missing.');button(dialog,'Remove account permanently').click();assert(!operations.includes('removeProviderProfile'),'Removal lacked confirmation.');
 // Change dependencies after the preview, without touching production storage.
 await writer.renameProviderProfile(b,'Other renamed');dialog.querySelector('input').checked=true;button(dialog,'Remove account permanently').click();await wait(()=>dialog.textContent.includes('dependencies changed'),'Stale preview was not rejected.');d=await writer.getDatabase();assert(d.providerProfiles[b],'Stale preview removed account.');closeDialog();checks.push('Removal requires dependency preview and confirmation and rejects stale dependencies');
 await reconcile();await wait(()=>account(b)?.textContent.includes('Other renamed'),'Account view did not reconcile.');account(b).querySelector('details').open=true;button(account(b),'Remove saved account').click();await wait(()=>document.querySelector('dialog')?.textContent.includes('Remove account permanently'),'Fresh preview missing.');dialog=document.querySelector('dialog');dialog.querySelector('input').checked=true;button(dialog,'Remove account permanently').click();await wait(()=>!document.querySelector('dialog'),'Confirmed removal did not finish.');d=await writer.getDatabase();assert(!d.providerProfiles[b]&&d.providerProfiles[a]&&Object.keys(d.contentReviews).length===1,'Account removal affected surviving evidence.');checks.push('Fresh confirmed removal deletes only the chosen disposable account');

 const progressRoot=document.querySelector('#contents-progress-slot');
 const run={runRef:crypto.randomUUID(),phase:'paused',mode:'rescan',checked:17,total:40,found:12,empty:4,unavailable:1,failures:0,reparsed:0,durable:17,buffered:0};
 for(const fn of runtimeListeners)fn({type:'GL_KINDLE_CONTENTS_PROGRESS',runs:[run]},{id:chrome.runtime.id});
 navigate('contents');assert(!document.querySelector('#contents-workspace').hidden,'Contents not shown.');const progress=document.querySelector('#kindle-contents-progress');assert(progressRoot.contains(progress)&&progress.querySelector('[role="status"]').textContent.includes('17 of 40 books checked (23 remaining)'),'Contents progress missing.');
 navigate('providers');navigate('library');navigate('contents');assert(document.querySelector('#kindle-contents-progress')===progress&&progress.querySelector('[role="status"]').textContent.includes('17 of 40 books checked (23 remaining)'),'Navigation recreated/lost contents progress.');checks.push('Contents progress persists unchanged across navigation');

 navigate('library');assert(!document.querySelector('#library-section').hidden&&!document.querySelector('#library-items').hidden,'Library inaccessible.');assert(document.querySelector('#empty-library').hidden,'Returning user forced through onboarding.');
 navigate('settings');for(const id of ['export','import','assume-all-owned','performance-diagnostics','google-books-api-key','companion-extension-id'])assert(document.querySelector('#settings-workspace').contains(document.getElementById(id)),id+' moved out of Settings.');assert(!document.querySelector('#settings-workspace').contains(document.querySelector('#provider-accounts')),'Duplicate provider workflow in Settings.');checks.push('Existing Library and global Settings remain accessible without duplicate provider management');

 // Exercise a separate completed scan in disposable memory, not a live site.
 const beforeOps=operations.filter(o=>o.startsWith('begin')||o.startsWith('commit')).length;
 navigate('providers');navigate('contents');navigate('library');await delay();assert(operations.filter(o=>o.startsWith('begin')||o.startsWith('commit')).length===beforeOps,'Navigation started acquisition.');
 checks.push('All UI acquisition is explicit; navigation and selection make no provider requests');
 const {PROVIDER_SITES}=await import('../src/ui/provider-accounts.js');
 for(const site of PROVIDER_SITES){
   await writer.mergeProviderItems(site.provider,[{providerItemId:'presentation-audit',title:'Synthetic entry',mediaType:'game',ownership:'owned'}],{profileLabel:'Presentation',fullSyncAt:new Date().toISOString()});
 }
 await reconcile();navigate('providers');await wait(()=>document.querySelector('.provider-card[data-provider=steam] .saved-account'),'Provider reconciliation did not finish');
 for(const site of PROVIDER_SITES){
   const card=document.querySelector('.provider-card[data-provider="'+site.provider+'"]');card.open=true;
   const saved=[...card.querySelectorAll('.saved-account')].find(n=>n.querySelector('h4').textContent.includes('Presentation'));
   assert(saved&&button(saved,site.fullLabel),'Missing supported action for '+site.provider);
   assert(Boolean(button(saved,'Quick update'))===Boolean(site.quickLabel),'Incorrect quick capability for '+site.provider);
   const before=operations.filter(n=>n==='beginProviderScan').length;
   button(saved,site.fullLabel).click();const prompt=document.querySelector('dialog[open]');
   assert(prompt&&prompt.getAttribute('aria-label').includes(site.fullLabel),'Dialog action differs from provider action');
   assert(operations.filter(n=>n==='beginProviderScan').length===before,'Dialog started a scan');
   button(prompt,'Cancel').click();
 }
 checks.push('All fourteen provider actions and dialogs use supported labels; single-action providers omit Quick update and opening instructions never starts an import');
 navigate('settings');
 const beforeCancel=JSON.stringify(await writer.getDatabase()),beforeTheme=document.documentElement.dataset.ghTheme;
 assert(document.querySelector('#backup-scope-help').textContent.includes('not included')&&document.querySelector('#backup-scope-help').textContent.includes('relationships are reset'),'Backup controls omit exclusion or reconnect guidance');
 const {createBackup}=await import('../src/lib/storage.js');const data=new DataTransfer();data.items.add(new File([JSON.stringify(createBackup(await writer.getDatabase()))],'synthetic.json',{type:'application/json'}));
 const restoreInput=document.querySelector('#import');restoreInput.files=data.files;restoreInput.dispatchEvent(new Event('change'));await wait(()=>document.querySelector('.confirmation-dialog[open]'),'Restore prompt missing');
 const restoreDialog=document.querySelector('.confirmation-dialog[open]');assert(restoreDialog.textContent.includes('not replaced')&&restoreDialog.textContent.includes('reconnect'),'Restore prompt confuses excluded and reset state');button(restoreDialog,'Cancel').click();await wait(()=>!restoreInput.disabled,'Restore cancellation did not finish');
 checks.push('Restore controls and accessible replacement prompt explain exclusions and reconnecting; Cancel keeps synthetic library unchanged');
 let clearWarning;const priorConfirm=globalThis.confirm;globalThis.confirm=message=>{clearWarning=message;return false;};document.querySelector('#clear').click();await delay();globalThis.confirm=priorConfirm;
 assert(clearWarning.includes('Appearance stays unchanged')&&clearWarning.includes('Purchases at your stores are unaffected'),'Native clear warning omits actual scope');assert(JSON.stringify(await writer.getDatabase())===beforeCancel&&document.documentElement.dataset.ghTheme===beforeTheme,'Cancelled restore/clear changed data or appearance');
 checks.push('Native clear confirmation retains truthful scope and cancellation preserves library and appearance');
 await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks,error:error.stack||error.message})});}
