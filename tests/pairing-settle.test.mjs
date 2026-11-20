// Installed-check pairing step: stale account choices must not turn successful automatic pairing into a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {settlePairing} from '../scripts/pairing-settle.mjs';

// A simulated pair of extensions with a virtual clock. Automatic pairing replaces the companion's
// provisional account ID and confirms the connection after `pairAt` ms; the guard mirrors purchase-sync.js.
function world({pairAt=12000,automatic=true,connectError=null,confirmAfterConnect=true}={}){
  let clock=0,state=null,remote='remote-provisional';const local='local-1',calls=[];
  const tick=()=>{if(automatic&&clock>=pairAt&&!state?.remoteConfirmed){remote='remote-final';state={peerId:'peer',localId:local,remoteId:remote,confirmed:true,remoteConfirmed:true};}
    if(automatic&&clock>=pairAt/2&&!state){remote='remote-final';state={peerId:'peer',localId:local,remoteId:remote,confirmed:true,remoteConfirmed:false};}};
  return {calls,now:()=>clock,sleep:async ms=>{clock+=ms;tick();},
    readState:async()=>{tick();return state;},
    readChoices:async()=>{tick();return {ok:true,peerId:'peer',accounts:[{stableId:local}],remoteAccounts:[{stableId:remote}]};},
    connect:async({peerId,localId,remoteId})=>{calls.push({localId,remoteId});
      if(connectError)return {ok:false,error:connectError};
      if(state&&(state.peerId!==peerId||state.localId!==localId||state.remoteId!==remoteId))return {ok:false,error:'Repair the connection before choosing different accounts.'};
      if(automatic&&remote==='remote-provisional')remote='remote-final';
      state={peerId,localId,remoteId,confirmed:true,remoteConfirmed:confirmAfterConnect};return {ok:true};}};
}
// The previous harness sequence: read choices first, wait 10 s, then connect with those choices.
async function previousSequence(w){
  const choice=await w.readChoices();let paired=false;
  for(let n=0;n<100&&!(paired=Boolean((await w.readState())?.confirmed&&(await w.readState())?.remoteConfirmed));n++)await w.sleep(100);
  if(!paired){const r=await w.connect({peerId:choice.peerId,localId:choice.accounts[0].stableId,remoteId:choice.remoteAccounts[0].stableId});if(!r.ok)throw Error(r.error);}
}

test('the previous sequence fails when automatic pairing lands after its 10 s window with a changed account ID',async()=>{
 await assert.rejects(previousSequence(world()),/Repair the connection before choosing different accounts/);
});
test('slow automatic pairing is waited for and verified without an explicit connection',async()=>{
 const w=world(),result=await settlePairing(w);
 assert.equal(result.automaticallyPaired,true);assert.equal(w.calls.length,0);
 assert.deepEqual([result.state.localId,result.state.remoteId],['local-1','remote-final']);
});
test('the fallback connection uses choices read at that moment and must be confirmed by both sides',async()=>{
 const w=world({automatic:false}),result=await settlePairing(w);
 assert.equal(result.automaticallyPaired,false);assert.deepEqual(w.calls,[{localId:'local-1',remoteId:'remote-provisional'}]);
 assert.equal(result.state.remoteConfirmed,true);
});
test('real connection failures are reported, not hidden',async()=>{
 await assert.rejects(settlePairing(world({automatic:false,connectError:'Purchase sharing permission changed.'})),/Explicit connection failed: Purchase sharing permission changed/);
 await assert.rejects(settlePairing(world({automatic:false,confirmAfterConnect:false})),/not confirmed by both extensions/);
 const w=world({automatic:false});w.readChoices=async()=>({ok:true,peerId:'peer',accounts:[{stableId:'a'},{stableId:'b'}],remoteAccounts:[{stableId:'r'}]});
 await assert.rejects(settlePairing(w),/exactly one saved account/);
 const mismatched=world();const read=mismatched.readChoices;mismatched.readChoices=async()=>({...(await read()),accounts:[{stableId:'local-other'}]});
 await assert.rejects(settlePairing(mismatched),/does not use the current account/);
});
