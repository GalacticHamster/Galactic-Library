// Development-tool helper for the installed purchase-sync checks. Never imported by the extension runtime.
// The only saved account on each side pairs automatically. Wait for that to settle; connect explicitly only
// as a fallback, with account choices read at that moment, and verify the final saved connection.
export async function settlePairing({readState,readChoices,connect,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,timeoutMs=30000,intervalMs=100}){
  const confirmed=s=>Boolean(s?.confirmed&&s.remoteConfirmed);
  const until=async deadline=>{let state=await readState();while(!confirmed(state)&&now()<deadline){await sleep(intervalMs);state=await readState();}return state;};
  let state=await until(now()+timeoutMs),automaticallyPaired=confirmed(state);
  const choice=await readChoices();
  if(!choice?.ok)throw Error('Account choices could not be read: '+(choice?.error??'no response'));
  if(choice.accounts?.length!==1||choice.remoteAccounts?.length!==1)throw Error('Expected exactly one saved account on each side.');
  const localId=choice.accounts[0].stableId,remoteId=choice.remoteAccounts[0].stableId;
  const detail=()=>' '+JSON.stringify({saved:state&&{status:state.status,errorCode:state.errorCode,error:state.error,confirmed:state.confirmed,remoteConfirmed:state.remoteConfirmed,localId:state.localId,remoteId:state.remoteId},current:{localId,remoteId}});
  if(!automaticallyPaired){
    const proposed=await connect({peerId:choice.peerId,localId,remoteId});
    if(!proposed?.ok)throw Error('Explicit connection failed: '+(proposed?.error??'no response')+detail());
    state=await until(now()+timeoutMs);
    if(!confirmed(state))throw Error('The connection was not confirmed by both extensions.'+detail());
  }
  if(state.localId!==localId||state.remoteId!==remoteId)throw Error('The saved connection does not use the current account on each side.'+detail());
  return {automaticallyPaired,state,localId,remoteId};
}
