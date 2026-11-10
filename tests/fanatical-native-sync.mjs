// Real installed workers and content imports, disposable synthetic data only.
import {observeReminderReview} from './reminder-review-lifecycle.mjs';
import assert from 'node:assert/strict';import {setTimeout as pause} from 'node:timers/promises';
export async function verifyFanaticalNativeSync({browser,peerId,navigate,evaluate,wait,glUrl,fanUrl,openOrders,scan,restart,setSource}){
 const extension=async(url,code)=>{await navigate(url);await wait('return location.href==='+JSON.stringify(url)+'&&document.readyState==="complete"&&!!globalThis.chrome?.runtime?.id;','Extension page not ready');return evaluate(code);};
 const gl=code=>extension(glUrl,code);
 const fan=code=>extension(fanUrl,code);
 const action=async fields=>(await gl('return {response:await chrome.runtime.sendMessage('+JSON.stringify({type:'GH_PURCHASE_ACTION',provider:'fanatical',...fields})+')};')).response;
 const viewScript='const S=await import("./src/lib/storage.js");const db=await S.getDatabase();return {items:Object.values(db.providerItems).filter(i=>i.provider==="fanatical"),other:Object.values(db.providerItems).filter(i=>i.provider!=="fanatical"),history:db.providerHistory,reviews:db.ownershipReviews};';
 const view=()=>gl(viewScript);
 // Poll the same installed Options page; opening a new tab every 50ms adds
 // unrelated renderer work and can starve the lifecycle being observed.
 const waitCount=async count=>{await gl('return true;');for(let i=0;i<160;i++){const state=await evaluate(viewScript);if(state.items.length===count)return state;await pause(50);}throw Error('Consented FAN synchronization did not reach '+count+' records '+JSON.stringify({gl:await action({action:'syncState'}),fan:await fan('return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",action:"syncState",provider:"fanatical"});')}));};
 if(browser==='Chrome'){
   // Unpacked Chrome test IDs are explicitly paired exactly as in the existing
   // runtime campaign. Pairing is not standing purchase-sharing permission.
   await gl('const S=await import("./src/lib/storage.js");await S.addAllowedExternalClientId('+JSON.stringify(peerId)+');return true;');
   const paired=await fan('return {response:await chrome.runtime.sendMessage({type:"FANATICAL_STORE",operation:"patch",args:[{galacticLibraryExtensionId:'+JSON.stringify(browser==='Firefox'?'galactic-library@galactichamster.com':new URL(glUrl).hostname)+'}]})};');assert(paired.response.ok,paired.response.error);
 }
 await gl('const S=await import("./src/lib/storage.js");await S.mergeProviderItems("gog",[{providerItemId:"isolated",title:"Unrelated synthetic game",mediaType:"game",ownership:"owned"}]);return true;');
 setSource({size:92,fail:false});await openOrders();await scan('new');
 const automatic=typeof (await action({action:'syncState'})).sharing==='boolean';
 if(automatic){await waitCount(92);assert.equal((await action({action:'syncState'})).state.confirmed,true);console.log('PASS installed '+browser+' FAN sync: committed purchases synchronize under the default-on preference without a setup action');}
 else {assert.equal((await action({action:'syncState'})).state,null);assert.equal((await view()).items.length,0);}
 const choices=await action({action:'syncChoices',peerId});assert(choices.ok,choices.error);
 const mapping={peerId:choices.peerId,localId:choices.accounts.find(a=>a.active)?.stableId??choices.accounts[0].stableId,remoteId:choices.remoteAccounts.find(a=>a.active)?.stableId??choices.remoteAccounts[0].stableId,confirmed:true,sameAccount:true};
 if(!automatic)assert((await action({action:'syncConnect',...mapping})).ok);let before=await waitCount(92);const unrelated=before.other;
 const invalid=await action({action:'syncConnect',...mapping,remoteId:'unavailable-synthetic-account'});assert.equal(invalid.ok,false);assert.equal((await view()).items.length,92);
 await gl('const S=await import("./src/lib/storage.js"),Q=await import("./src/ui/quick-access.js"),db=await S.getDatabase(),item=Object.values(db.providerItems).find(i=>i.provider==="fanatical");await S.saveOwnershipCorrections([Q.ownershipCorrectionTarget(item,db)],{ownership:"returned",note:"Synthetic review"});return true;');
 const reviews=(await view()).reviews;
 for(let i=0;i<2;i++){assert((await action({action:'syncNow'})).ok);const state=await waitCount(92);assert.deepEqual(state.reviews,reviews);assert.deepEqual(state.other,unrelated);assert(state.items.every(item=>item.metadata.purchaseOrigins?.length===1));}
 console.log('PASS installed '+browser+' FAN sync: explicit consent, account rejection, idempotency, correction and purchase provenance preservation');
 assert((await action(automatic?{action:'syncSetSharing',enabled:false}:{action:'syncDisconnect'})).ok);
 if(automatic)assert.equal((await action({action:'syncState'})).sharing,false);else assert.equal((await action({action:'syncState'})).state,null);
 setSource({size:93,fail:false});await openOrders();await scan('new');await action({action:'syncNow'});assert.equal((await view()).items.length,92);
 if(automatic){const consent=await fan('return await chrome.runtime.sendMessage('+JSON.stringify(new URL(glUrl).protocol==='moz-extension:'?'galactic-library@galactichamster.com':new URL(glUrl).hostname)+',{type:"GH_PURCHASE_SYNC_CONSENT",provider:"fanatical",protocolVersion:1});');assert.equal(consent.mapping.confirmed,false);assert((await action({action:'syncSetSharing',enabled:true})).ok);}
 else {const peerState=await fan('return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",provider:"fanatical",action:"syncState"});');assert.equal(peerState.state,null);assert((await action({action:'syncConnect',...mapping})).ok);}
 await waitCount(93);
 console.log('PASS installed '+browser+' FAN sync: persistent opt-out blocks transfers and re-enable reconciles committed purchases');
 setSource({size:94,fail:true});await openOrders();await scan('new');assert.equal((await view()).items.length,93);
 await restart();setSource({size:94,fail:false});await openOrders();await scan('new');const recovered=await waitCount(94);assert.deepEqual(recovered.reviews,reviews);assert.deepEqual(recovered.other,unrelated);assert(recovered.items.every(item=>item.metadata.purchaseOrigins?.length===1));
 console.log('PASS installed '+browser+' FAN sync: interrupted detail acquisition, restart and Quick retry retain consent, corrections, unrelated providers and exactly one purchase origin');
}
export async function verifyFanaticalKeyReminders({browser,peerId,navigate,evaluate,wait,glUrl,fanUrl,openOrders,scan,setKeysPresent,restart}){
 const review=async(filter,before,after,pending)=>{
  await evaluate('const f=document.querySelector("#local-reminder-filter");f.value='+JSON.stringify(filter)+';f.dispatchEvent(new Event("change"));return true;');
  await wait('return document.querySelector("#local-reminder-list")?.children.length==='+before+'&&!document.querySelector("#local-reminder-list button")?.disabled;','Reminder review controls not ready');
  const result=await evaluate('return ('+observeReminderReview.toString()+')({button:document.querySelector("#local-reminder-list button"),status:document.querySelector("#local-reminder-action-status"),list:document.querySelector("#local-reminder-list"),expectedBefore:'+before+',expectedAfter:'+after+'});');
  assert.equal(result.state,'saved','Reminder mutation did not acknowledge its save: '+JSON.stringify(result));
  assert.equal(await evaluate('const D=await import("./library-data.mjs"),s=await chrome.storage.local.get("fanaticalLibraryItems");return D.localKeyReminders(s.fanaticalLibraryItems).filter(r=>!r.hidden).length;'),pending,'Acknowledged review must match persisted FAN state');
 };

 const fan=async code=>{await navigate(fanUrl);await wait('return !!globalThis.LibraryBrowser&&!!document.querySelector("#preview-note").textContent;','FAN options readiness');return evaluate(code);};
 const gl=async code=>{await navigate(glUrl);await wait('return !!globalThis.chrome?.runtime?.id;','GL options readiness');return evaluate(code);};
 const action=value=>evaluate('return await chrome.runtime.sendMessage('+JSON.stringify({type:'GH_PURCHASE_ACTION',provider:'fanatical',...value})+');');
 await fan('return await chrome.runtime.sendMessage({type:"FANATICAL_STORE",operation:"patch",args:[{galacticLibraryExtensionId:'+JSON.stringify(browser==='Firefox'?'galactic-library@galactichamster.com':new URL(glUrl).hostname)+'}]});');
 // This scenario deliberately changes to a different named receiving account.
 // Pause automatic work on both sides while performing that advanced action;
 // legacy Disconnect alone is intentionally no longer a persistent opt-out.
 await gl('return true;');const automatic=typeof(await action({action:'syncState'})).sharing==='boolean';
 if(automatic){assert((await action({action:'syncSetSharing',enabled:false})).ok);await fan('return true;');assert((await action({action:'syncSetSharing',enabled:false})).ok);await gl('return true;');}
 await action({action:'syncDisconnect'});const created=await action({action:'syncCreateAccount',newLabel:'Key observations',confirmed:true});assert(created.ok,created.error);await gl('const S=await import("./src/lib/storage.js"),db=await S.getDatabase(),p=Object.values(db.providerProfiles).find(p=>p.nickname==="Key observations");await S.selectProviderProfile(p.profileId,db.providers.fanatical.activeProfileId,true);return true;');
 if(automatic){await fan('return true;');assert((await action({action:'syncSetSharing',enabled:true})).ok);await gl('return true;');assert((await action({action:'syncSetSharing',enabled:true})).ok);}
 const choices=await action({action:'syncChoices',peerId});assert(choices.ok,choices.error);const connected=await action({action:'syncConnect',peerId:choices.peerId,localId:choices.accounts.find(a=>a.active).stableId,remoteId:choices.remoteAccounts.find(a=>a.active).stableId,confirmed:true,sameAccount:true});assert(connected.ok,connected.error);
 const view=()=>evaluate('const S=await import("./src/lib/storage.js"),R=await import("./src/lib/reminders.js"),db=await S.getDatabase(),items=Object.values(db.providerItems).filter(i=>i.profileId===db.providers.fanatical.activeProfileId);return {items,pending:R.libraryReminders(db).filter(r=>r.provider==="fanatical"&&r.keyStatus==="unrevealed"),reviews:db.ownershipReviews};');
 await wait('const S=await import("./src/lib/storage.js"),db=await S.getDatabase();return Object.values(db.providerItems).filter(i=>i.profileId===db.providers.fanatical.activeProfileId).length===37;','Consented key purchases did not sync');let state=await view();assert.equal(state.items.filter(i=>i.metadata.keyStatus==='unrevealed').length,10);assert.equal(state.pending.length,10);assert(state.items.filter(i=>i.metadata.keyStatus==='unrevealed').every(i=>i.metadata.purchaseOrigins.some(o=>o.keyStatus==='unrevealed')));const purchases=state.items.map(i=>({id:i.id,ownership:i.ownership,origins:i.metadata.purchaseOrigins.map(o=>o.occurrenceRef)})),reviews=state.reviews;
 await evaluate('const S=await import("./src/lib/storage.js"),R=await import("./src/lib/reminders.js"),db=await S.getDatabase(),r=R.libraryReminders(db).find(r=>r.provider==="fanatical"&&r.keyStatus==="unrevealed");await S.saveReminderReview(r.reminderRef,"dismissed",r.basis);return true;');assert.equal((await view()).pending.length,9);
 await fan('return true;');await wait('return document.querySelector("#local-key-status")?.textContent.includes("9 active purchase reminders");','Automatic GL review did not reach FAN');await evaluate('document.querySelector("#load-reminders").click();return true;');await wait('return document.querySelector("#reminder-status").textContent.includes("reported reminders");','FAN central reminder display');assert.equal(await evaluate('return [...document.querySelector("#reminder-list").children].filter(li=>li.textContent.includes("Key reported unrevealed")).length;'),9);assert.match(await evaluate('return document.querySelector("#local-key-status").textContent;'),/9 active purchase reminders/);
 await review('hidden',1,0,10);
 await gl('return true;');await wait('const S=await import("./src/lib/storage.js"),R=await import("./src/lib/reminders.js");return R.libraryReminders(await S.getDatabase()).filter(r=>r.provider==="fanatical"&&r.keyStatus==="unrevealed").length===10;','Local restore did not reach GL');
 await fan('return true;');await review('pending',10,9,9);
 await gl('return true;');await wait('const S=await import("./src/lib/storage.js"),R=await import("./src/lib/reminders.js");return R.libraryReminders(await S.getDatabase()).filter(r=>r.provider==="fanatical"&&r.keyStatus==="unrevealed").length===9;','Local dismissal did not reach GL');

 setKeysPresent();await openOrders();await scan('new');await fan('return true;');assert.match(await evaluate('return document.querySelector("#local-key-status").textContent;'),/9 active purchase reminders/);await openOrders();await scan('all');await fan('return true;');assert.match(await evaluate('return document.querySelector("#local-key-status").textContent;'),/0 active purchase reminders/);assert.equal(await evaluate('const s=await chrome.storage.local.get("fanaticalLibraryItems");return JSON.stringify(s).includes("SYNTHETIC_SECRET_DO_NOT_RETAIN");'),false);
 await gl('return true;');await wait('const S=await import("./src/lib/storage.js"),db=await S.getDatabase();return Object.values(db.providerItems).filter(i=>i.profileId===db.providers.fanatical.activeProfileId&&i.metadata.keyStatus==="unrevealed").length===0;','Unknown key observations did not replace earlier evidence');state=await view();assert.equal(state.pending.length,0);assert.equal(state.items.filter(i=>i.metadata.keyStatus==='unknown').length,10);assert.deepEqual(state.items.map(i=>({id:i.id,ownership:i.ownership,origins:i.metadata.purchaseOrigins.map(o=>o.occurrenceRef)})),purchases);assert.deepEqual(state.reviews,reviews);assert(!JSON.stringify(state).includes('SYNTHETIC_SECRET_DO_NOT_RETAIN'));
 await restart();await gl('return true;');state=await view();assert.equal(state.pending.length,0);assert.equal(state.items.filter(i=>i.metadata.keyStatus==='unknown').length,10);
 console.log('PASS installed '+browser+' key observations: native FAN purchase -> consented GL sync -> dismissal -> FAN display; Quick retains dated observations, Full refreshes unknown without reading keys; ownership/provenance/reload preserved');
}

export async function verifyFanaticalKeyCompatibility({observationsSupported=false,browser,peerId,navigate,evaluate,wait,glUrl,fanUrl,restart}){
 const gl=async code=>{await navigate(glUrl);await wait('return !!globalThis.chrome?.runtime?.id;','Mixed GL readiness');return evaluate(code);};
 await navigate(fanUrl);await wait('return !!globalThis.LibraryBrowser;','Mixed FAN readiness');const linked=await evaluate('return await chrome.runtime.sendMessage({type:"FANATICAL_STORE",operation:"patch",args:[{galacticLibraryExtensionId:'+JSON.stringify(browser==='Firefox'?'galactic-library@galactichamster.com':new URL(glUrl).hostname)+'}]});');assert(linked.ok,linked.error);
 const action=fields=>gl('return await chrome.runtime.sendMessage('+JSON.stringify({type:'GH_PURCHASE_ACTION',provider:'fanatical',...fields})+');');
 assert((await action({action:'syncDisconnect'})).ok);assert((await action({action:'syncCreateAccount',newLabel:'Mixed key purchases',confirmed:true})).ok);
 await gl('const S=await import("./src/lib/storage.js"),db=await S.getDatabase(),p=Object.values(db.providerProfiles).find(p=>p.nickname==="Mixed key purchases");await S.selectProviderProfile(p.profileId,db.providers.fanatical.activeProfileId,true);return true;');
 const choices=await action({action:'syncChoices',peerId});assert(choices.ok,choices.error);assert((await action({action:'syncConnect',peerId:choices.peerId,localId:choices.accounts.find(a=>a.active).stableId,remoteId:choices.remoteAccounts.find(a=>a.active).stableId,confirmed:true,sameAccount:true})).ok);
 const state='const S=await import("./src/lib/storage.js"),db=await S.getDatabase();return Object.values(db.providerItems).filter(i=>i.profileId===db.providers.fanatical.activeProfileId);';
 await wait('const S=await import("./src/lib/storage.js"),db=await S.getDatabase();return Object.values(db.providerItems).filter(i=>i.profileId===db.providers.fanatical.activeProfileId).length===37;','Mixed-version key purchases did not sync');const before=await evaluate(state);assert.equal(before.length,37);assert(before.every(i=>i.ownership==='owned'));assert.equal(before.filter(i=>i.metadata.keyCheckedAt).length,observationsSupported?10:0);assert(before.every(i=>(i.metadata.purchaseOrigins??[]).every(o=>o.keyReview===undefined)));assert(!JSON.stringify(before).includes('SYNTHETIC_SECRET_DO_NOT_RETAIN'));
 assert((await action({action:'syncNow'})).ok);assert.deepEqual(await evaluate(state),before);await restart();assert.deepEqual(await gl(state),before);
 console.log('PASS installed '+browser+' mixed-version key purchases: all 37 purchases sync idempotently and persist; unsupported observations omitted without changing ownership or provenance');
}

export async function verifyStandaloneFanaticalReminders({navigate,evaluate,wait,fanUrl,openOrders,scan,restart}){
 const options=async()=>{await navigate(fanUrl);await wait('return document.querySelector("#local-reminder-list")?.children.length===10;','Standalone reminders did not load');};
 await options();assert.match(await evaluate('return document.querySelector("#local-key-status").textContent;'),/without Galactic Library/);
 await evaluate('document.querySelector("#local-reminder-action-status").textContent="";document.querySelector("#local-reminder-action-status").textContent="";document.querySelector("#local-reminder-list button").click();return true;');await wait('return document.querySelector("#local-reminder-list")?.children.length===9&&document.querySelector("#local-reminder-action-status").textContent.includes("review saved");','Standalone dismiss failed');
 await openOrders();await scan('all');await navigate(fanUrl);await wait('return document.querySelector("#local-reminder-list")?.children.length===9;','Full refresh resurrected dismissal');
 const backup=await evaluate('return await chrome.runtime.sendMessage({type:"FANATICAL_STORE",operation:"backup",args:[]});');assert(backup.ok,backup.error);assert(backup.result.items.some(i=>i.purchaseOrigins?.some(o=>o.keyReview?.action==='dismissed')));
 assert((await evaluate('return await chrome.runtime.sendMessage({type:"FANATICAL_STORE",operation:"restore",args:['+JSON.stringify(backup.result)+']});')).ok);
 await restart();await navigate(fanUrl);await wait('return document.querySelector("#local-reminder-list")?.children.length===9;','Restart/restore lost standalone review');
 await evaluate('const f=document.querySelector("#local-reminder-filter");f.value="hidden";f.dispatchEvent(new Event("change"));document.querySelector("#local-reminder-action-status").textContent="";document.querySelector("#local-reminder-list button").click();return true;');await wait('return document.querySelector("#local-reminder-list")?.children.length===0&&document.querySelector("#local-reminder-action-status").textContent.includes("review saved");','Standalone restore failed');
 await evaluate('const f=document.querySelector("#local-reminder-filter");f.value="pending";f.dispatchEvent(new Event("change"));document.querySelector("#local-reminder-action-status").textContent="";document.querySelectorAll("#local-reminder-list button")[1].click();return true;');await wait('return document.querySelector("#local-reminder-list")?.children.length===9&&document.querySelector("#local-reminder-action-status").textContent.includes("review saved");','Standalone snooze failed');
 await evaluate('const f=document.querySelector("#local-reminder-filter");f.value="hidden";f.dispatchEvent(new Event("change"));document.querySelector("#local-reminder-action-status").textContent="";document.querySelector("#local-reminder-list button").click();return true;');await wait('return document.querySelector("#local-reminder-list")?.children.length===0&&document.querySelector("#local-reminder-action-status").textContent.includes("review saved");','Snooze restore failed');
 await openOrders();await scan('all');await options();console.log('PASS installed standalone FAN local reminders: ten purchase-specific rows without GL, dismiss/Full refresh, backup/restore/restart, snooze/restore and no provider mutation');
}
