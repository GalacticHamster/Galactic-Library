// Real installed workers and content imports, disposable synthetic data only.
import assert from 'node:assert/strict';import {setTimeout as pause} from 'node:timers/promises';
export async function verifyFanaticalNativeSync({browser,peerId,navigate,evaluate,wait,glUrl,fanUrl,openOrders,scan,restart,setSource}){
 const extension=async(url,code)=>{await navigate(url);await wait('return location.href==='+JSON.stringify(url)+'&&document.readyState==="complete"&&!!globalThis.chrome?.runtime?.id;','Extension page not ready');return evaluate(code);};
 const gl=code=>extension(glUrl,code);
 const fan=code=>extension(fanUrl,code);
 const action=async fields=>(await gl('return {response:await chrome.runtime.sendMessage('+JSON.stringify({type:'GH_PURCHASE_ACTION',provider:'fanatical',...fields})+')};')).response;
 const view=()=>gl('const S=await import("./src/lib/storage.js");const db=await S.getDatabase();return {items:Object.values(db.providerItems).filter(i=>i.provider==="fanatical"),other:Object.values(db.providerItems).filter(i=>i.provider!=="fanatical"),history:db.providerHistory,reviews:db.ownershipReviews};');
 const waitCount=async count=>{for(let i=0;i<160;i++){const state=await view();if(state.items.length===count)return state;await pause(50);}throw Error('Consented FAN synchronization did not reach '+count+' records');};
 if(browser==='Chrome'){
   // Unpacked Chrome test IDs are explicitly paired exactly as in the existing
   // runtime campaign. Pairing is not standing purchase-sharing permission.
   await gl('const S=await import("./src/lib/storage.js");await S.addAllowedExternalClientId('+JSON.stringify(peerId)+');return true;');
   const paired=await fan('return {response:await chrome.runtime.sendMessage({type:"FANATICAL_STORE",operation:"patch",args:[{galacticLibraryExtensionId:'+JSON.stringify(new URL(glUrl).hostname)+'}]})};');assert(paired.response.ok,paired.response.error);
 }
 await gl('const S=await import("./src/lib/storage.js");await S.mergeProviderItems("fanatical",[],{profileLabel:"Default account"});await S.mergeProviderItems("gog",[{providerItemId:"isolated",title:"Unrelated synthetic game",mediaType:"game",ownership:"owned"}]);return true;');
 setSource({size:92,fail:false});await openOrders();await scan('new');
 assert.equal((await action({action:'syncState'})).state,null);assert.equal((await view()).items.length,0);
 console.log('PASS installed '+browser+' FAN sync: real purchase commit and discovery grant no standing consent');
 const choices=await action({action:'syncChoices',peerId});assert(choices.ok,choices.error);
 const mapping={peerId:choices.peerId,localId:choices.accounts.find(a=>a.active)?.stableId??choices.accounts[0].stableId,remoteId:choices.remoteAccounts.find(a=>a.active)?.stableId??choices.remoteAccounts[0].stableId,confirmed:true,sameAccount:true};
 assert((await action({action:'syncConnect',...mapping})).ok);let before=await waitCount(92);const unrelated=before.other;
 const invalid=await action({action:'syncConnect',...mapping,remoteId:'unavailable-synthetic-account'});assert.equal(invalid.ok,false);assert.equal((await view()).items.length,92);
 await gl('const S=await import("./src/lib/storage.js"),Q=await import("./src/ui/quick-access.js"),db=await S.getDatabase(),item=Object.values(db.providerItems).find(i=>i.provider==="fanatical");await S.saveOwnershipCorrections([Q.ownershipCorrectionTarget(item,db)],{ownership:"returned",note:"Synthetic review"});return true;');
 const reviews=(await view()).reviews;
 for(let i=0;i<2;i++){assert((await action({action:'syncNow'})).ok);const state=await waitCount(92);assert.deepEqual(state.reviews,reviews);assert.deepEqual(state.other,unrelated);assert(state.items.every(item=>item.metadata.purchaseOrigins?.length===1));}
 console.log('PASS installed '+browser+' FAN sync: explicit consent, account rejection, idempotency, correction and purchase provenance preservation');
 assert((await action({action:'syncDisconnect'})).ok);assert.equal((await action({action:'syncState'})).state,null);
 setSource({size:93,fail:false});await openOrders();await scan('new');await action({action:'syncNow'});assert.equal((await view()).items.length,92);
 const peerState=await fan('return await chrome.runtime.sendMessage({type:"GH_PURCHASE_ACTION",provider:"fanatical",action:"syncState"});');assert.equal(peerState.state,null);
 const again=await action({action:'syncChoices',peerId:mapping.peerId});assert(again.ok,again.error);assert((await action({action:'syncConnect',...mapping})).ok);await waitCount(93);
 console.log('PASS installed '+browser+' FAN sync: revocation prevents further transfers; explicit reconnection recovers the committed purchase');
 setSource({size:94,fail:true});await openOrders();await scan('new');assert.equal((await view()).items.length,93);
 await restart();setSource({size:94,fail:false});await openOrders();await scan('new');const recovered=await waitCount(94);assert.deepEqual(recovered.reviews,reviews);assert.deepEqual(recovered.other,unrelated);assert(recovered.items.every(item=>item.metadata.purchaseOrigins?.length===1));
 console.log('PASS installed '+browser+' FAN sync: interrupted detail acquisition, restart and Quick retry retain consent, corrections, unrelated providers and exactly one purchase origin');
}
