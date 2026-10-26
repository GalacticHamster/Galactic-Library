// Real shared account controls and Fandango content scripts; synthetic libraries
// and same-tab navigation only. No provider requests or personal browser data.
import {createStorageWriter} from '../src/background/storage-writer.js';
import {validateFandangoState} from '../src/background/import-state.js';
import {PROVIDERS} from '../src/lib/constants.js';
import * as F from './provider-sync-fixture.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
const wait=async predicate=>{for(let n=0;n<300;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Provider restart fixture did not finish');};
let sharedSource,contentSource;
async function harness(provider){
 sharedSource??=await (await fetch('/src/providers/floating-panel.js')).text();
 const db=F.providerSyncLibrary(provider),values={galacticLibraryDatabase:db};
 const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async patch=>Object.assign(values,structuredClone(patch))});
 let state=null;const messages=[],visits=[],frames=[];
 const chrome={runtime:{sendMessage:async request=>{
  messages.push(structuredClone(request));
  try{
   if(request.type==='GET_PROVIDER_PROFILE_HINT')return {ok:true,hint:null};
   if(request.type==='GET_PROVIDER_PROFILE'){
    const db=await writer.getDatabase(),profiles=Object.values(db.providerProfiles).filter(p=>p.provider===provider),p=db.providerProfiles[db.providers[provider].activeProfileId];
    return {ok:true,profileLabel:p.nickname,profileId:p.profileId,reuseAllowed:profiles.length===1&&p.state.connected&&Boolean(p.state.lastSync),profiles:profiles.map(p=>({profileId:p.profileId,nickname:p.nickname}))};
   }
   if(request.type==='GET_PROVIDER_SYNC_STATE'){
    const scan=await writer.beginProviderScan(provider,request.profileLabel,request.mode,request.switchProfile,77,request.profileId,request.confirmed!==true&&request.rememberedProfile===true,request.sourceAccountFingerprint);
    return {ok:true,scanToken:scan.scanToken,profileId:scan.profileId,hasFullBaseline:!scan.forceFull,syncState:{knownProviderItemIds:Object.values(scan.database.providerItems).filter(r=>r.profileId===scan.profileId).map(r=>r.providerItemId)}};
   }
   if(request.type==='FANDANGO_IMPORT_STATE'){
    if(request.action==='get')return {ok:true,state:structuredClone(state)};
    if(request.action==='set')state=validateFandangoState(request.state);
    if(request.action==='clear')state=null;
    return {ok:true};
   }
   if(request.type==='COMMIT_PROVIDER_SCAN'){
    await writer.commitProviderScan(provider,request.items,{syncMode:request.mode},request.snapshot,request.scanToken,77,false,request.sourceAccountFingerprint??null);
    const view=await writer.getDatabase(),rows=Object.values(view.providerItems).filter(r=>r.provider===provider);
    return {ok:true,movieCount:rows.filter(r=>r.mediaType==='movie').length,tvCount:rows.filter(r=>r.mediaType==='tv').length};
   }
   if(request.type==='REPORT_PROVIDER_SCAN_FAILURE')return {ok:true};
   throw Error('Unexpected account message '+request.type);
  }catch(error){return {ok:false,error:error.message};}
 }}};
 async function page(path,{content=false}={}){
  const frame=document.createElement('iframe');frame.hidden=true;document.body.append(frame);frames.push(frame);
  const doc=frame.contentDocument,loc=new URL('https://athome.fandango.com'+path);loc.assign=url=>visits.push(new URL(url,loc.href).pathname);
  const scoped={location:loc,document:doc},evaluate=source=>new Function('globalThis','document','location','chrome','sessionStorage',source)(scoped,doc,loc,chrome,frame.contentWindow.sessionStorage);
  evaluate(sharedSource);let shadow;
  const attach=frame.contentWindow.Element.prototype.attachShadow;
  frame.contentWindow.Element.prototype.attachShadow=function(options){shadow=attach.call(this,options);return shadow;};
  if(content){
   contentSource??=await (await fetch('/src/providers/fandango-at-home-content.js')).text();
   // Use the real snapshot constructor; account/navigate tests mock only website
   // discovery, while all admission, tab state and commits use real mechanisms.
   const snapshot=await import('../src/lib/provider-snapshot.js');scoped.GalacticProviderSnapshot=snapshot;
   scoped.GalacticFandangoAtHome={expectedFandangoCountsFromDocument:()=>({movies:1,tv:0}),viewAllLibraryLinksFromDocument:()=>[{mediaType:'movie',url:loc.origin+'/content/browse/movies'},{mediaType:'tv',url:loc.origin+'/content/browse/tv'}],readFandangoGrid:async(section,expected,progress,known)=>section==='movie'&&!Array.isArray(known)?[F.providerSyncValue(provider)]:[]};
   evaluate(contentSource);
  }else{
   const host=doc.createElement('div');doc.body.append(host);shadow=host.attachShadow({mode:'open'});scoped.GalacticFloatingPanel.render(shadow,provider);
   scoped.GalacticFloatingPanel.attach(shadow,provider);
  }
  await wait(()=>!shadow.querySelector('[data-profile-status]').textContent.includes('Loading'));
  return {scoped,shadow,frame};
 }
 return {writer,values,messages,visits,page,get state(){return state;},dispose(){frames.forEach(f=>f.remove());}};
}

export async function checkProviderRememberedRestarts(){
 const checks=[];
 for(const provider of PROVIDERS){
  const h=await harness(provider);
  try{
   const {scoped,shadow}=await h.page('/content/browse/mylibrary');
   for(const mode of F.providerSyncModes(provider)){
    assert(shadow.querySelector('[data-profile-confirm-label]').hidden&&!shadow.querySelector('[data-profile-confirm]').checked,'Saved-account checkbox should be hidden and unchecked for '+provider);
    // Click the actual control to exercise the shared capture-time context reset.
    (shadow.querySelector(`[data-mode="${mode}"]`)??shadow.querySelector('[data-import-action]')).click();
    const scan=await scoped.GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider,...(F.consoleProvider(provider)?{sourceAccountFingerprint:F.fingerprint}:{})});
    assert(scan.ok,'Remembered '+provider+' '+mode+' start failed: '+scan.error);
    const start=h.messages.filter(r=>r.type==='GET_PROVIDER_SYNC_STATE').at(-1);assert(start.rememberedProfile===true&&start.confirmed===false&&start.profileId,'Remembered admission was falsely marked as fresh confirmation for '+provider);
    const items=[F.providerSyncValue(provider)],saved=await scoped.GalacticSync.send({type:'IMPORT_PROVIDER_ITEMS',provider,mode,items,snapshot:mode==='full'||F.consoleProvider(provider)?F.providerSyncSnapshot(provider,items):undefined,...(F.consoleProvider(provider)?{sourceAccountFingerprint:F.fingerprint}:{})});
    assert(saved.ok,'Remembered '+provider+' '+mode+' commit failed: '+saved.error);
   }
   checks.push('Saved-account '+provider+' restart accepts its supported modes without a hidden confirmation checkbox and commits to the exact account');
  }finally{h.dispose();}
 }
 return checks;
}

export async function checkFandangoRestartNavigation(){
 const checks=[],h=await harness('fandango-at-home');
 try{
  let p=await h.page('/content/browse/mylibrary',{content:true});const baseline=await h.writer.getDatabase();
  p.shadow.querySelector('[data-mode="full"]').click();await wait(()=>h.visits.length===1);
  p=await h.page(h.visits.at(-1),{content:true});await wait(()=>h.visits.length===2);
  p=await h.page(h.visits.at(-1),{content:true});await wait(()=>p.shadow.querySelector('.status').textContent.startsWith('Saved '));
  assert(h.state===null&&h.visits.join(',')==='/content/browse/movies,/content/browse/tv','Full must complete on TV and clear its navigation state');
  checks.push('Actual Fandango Full workflow validates a remembered account, reads Movies then TV, commits and clears its tab state');
  for(const mode of ['incremental','full']){
   const before=h.visits.length;p.shadow.querySelector(`[data-mode="${mode}"]`).click();await wait(()=>h.visits.length===before+1);
   assert(h.visits.at(-1)==='/content/browse/mylibrary'&&h.state.scanContext.confirmed&&h.state.scanContext.scanToken,'Returning from TV must carry backend-validated account context');
   p=await h.page(h.visits.at(-1),{content:true});await wait(()=>h.visits.length===before+2);
   p=await h.page(h.visits.at(-1),{content:true});await wait(()=>h.visits.length===before+3);
   p=await h.page(h.visits.at(-1),{content:true});await wait(()=>p.shadow.querySelector('.status').textContent.startsWith(mode==='full'?'Saved ':'Quick update added 0'));
   assert(h.state===null,'Restart left stale tab state');
   checks.push('Fandango '+mode+' immediately after TV completion returns to My Library and finishes without requesting confirmation again');
  }
  const after=await h.writer.getDatabase();assert(Object.keys(after.providerItems).length===Object.keys(baseline.providerItems).length&&Object.keys(after.providerHistory).length===0,'Restart duplicated or retired source records');
  for(const [id,r]of Object.entries(baseline.providerItems))assert(after.providerItems[id].recordRef===r.recordRef&&after.providerItems[id].ownership===r.ownership,'Restart changed identity/access');
  checks.push('Repeated actual Fandango navigation/commits preserve source identities and ownership without duplicate acquisitions or Earlier imports');
 }finally{h.dispose();}
 const guard=await harness('fandango-at-home');
 try{
  const p=await guard.page('/content/browse/tv',{content:true});
  await guard.writer.mergeProviderItems('fandango-at-home',[{...F.providerSyncValue('fandango-at-home'),providerItemId:'other'}],{profileLabel:'Other'});
  p.shadow.querySelector('[data-mode="incremental"]').click();await wait(()=>p.shadow.querySelector('.status').textContent.includes('failed:'));
  assert(guard.visits.length===0&&!guard.state&&p.shadow.querySelector('.status').textContent.includes('Saved accounts changed'),'Stale remembered account bypassed backend validation');
  checks.push('A saved account changed after hydration is blocked before Fandango navigation; remembered UI state is never treated as fresh confirmation');
  const input=p.shadow.querySelector('[data-profile-label]');input.dispatchEvent(new Event('input',{bubbles:true}));p.shadow.querySelector('[data-profile-confirm]').checked=true;
  p.shadow.querySelector('[data-mode="incremental"]').click();await wait(()=>!p.shadow.querySelector('.status').dataset.busy);
  assert(!guard.visits.length&&!guard.state&&p.shadow.querySelector('.status').textContent.includes('confirm switching'),'Fresh account confirmation bypassed the separate account-switch guard');
  checks.push('Confirming a different saved Fandango account still requires the separate switch-account confirmation before navigation');
 }finally{guard.dispose();}
 const edited=await harness('fandango-at-home');
 try{
  const p=await edited.page('/content/browse/tv',{content:true});const input=p.shadow.querySelector('[data-profile-label]');input.value='Other';input.dispatchEvent(new Event('input',{bubbles:true}));
  p.shadow.querySelector('[data-mode="incremental"]').click();await wait(()=>p.shadow.querySelector('.status').textContent.includes('failed:'));
  assert(!edited.visits.length&&!edited.state&&!edited.messages.some(r=>r.type==='GET_PROVIDER_SYNC_STATE'),'Editing an account without confirmation navigated or admitted a scan');
  checks.push('Edited/unconfirmed Fandango accounts still require explicit confirmation and cannot queue navigation or save data');
 }finally{edited.dispose();}
 return checks;
}
