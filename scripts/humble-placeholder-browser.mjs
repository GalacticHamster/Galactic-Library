import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';

export async function humblePlaceholderChecks({navigate,evaluate,call,checks}){
  const slot={title:'No Content',kind:'comic',source:'humble',purchaseKey:'synthetic-order',
    providerItemId:'synthetic-order:product:empty-slot',sourceBundle:'Synthetic Comics Bundle',
    entitlement:'direct-download',formats:[]};
  const items=[slot,{...slot,title:'Companion Comic',providerItemId:'synthetic-order:product:comic',formats:['cbz']},
    {...slot,providerItemId:'synthetic-order:product:real-book',formats:['pdf']},
    {...slot,kind:'game',providerItemId:'synthetic-order:product:real-key',entitlement:'third-party-key',keyType:'Steam'}];
  await navigate('hb');
  await evaluate(`await chrome.storage.local.set({humbleProfileLabel:'Synthetic',libraryItems:${JSON.stringify(items)}});return true;`);
  await navigate('gl');
  const read=()=>evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();
    return {items:Object.values(d.providerItems).map(i=>[i.providerItemId,i.title,i.mediaType,i.ownership]).sort(),
      canonical:Object.values(d.canonicalItems).map(i=>[i.title,i.mediaType]).sort()};`);
  let state,before;
  for(let attempt=0;attempt<160;attempt++){
    const reply=await call('gl','syncState','humble');
    state=reply.state;
    before=await read();
    if(state?.lastSuccess&&before.items.some(i=>i[0]===items[1].providerItemId))break;
    await pause(250);
  }
  assert.ok(state?.lastSuccess&&before.items.length,'automatic sync must finish and save purchases: '+JSON.stringify(state));
  const admitted=before.items.find(i=>i[0]===slot.providerItemId);
  if(admitted)assert.deepEqual(admitted,[slot.providerItemId,'No Content','book','owned']);
  assert.equal(admitted,undefined,'automatic sync admitted an empty Humble slot as an owned book');
  assert.deepEqual(before.items,items.slice(1).map(i=>[i.providerItemId,i.title,i.kind==='comic'?'book':i.kind,'owned']).sort());
  assert.deepEqual(before.canonical,[['Companion Comic','book'],['No Content','book'],['No Content','game']].sort());
  checks.push('automatic HB → GL sync saves the comic, real same-title download and key, excluding the empty slot');
  const again=await call('gl','syncNow','humble');
  assert.equal(again.ok,true,again.error);
  assert.deepEqual(await read(),before);
  await navigate('hb');
  assert.ok(await evaluate(`const {libraryItems}=await chrome.storage.local.get('libraryItems');
    return libraryItems.some(i=>i.providerItemId===${JSON.stringify(slot.providerItemId)});`));
  checks.push('repeated sync preserves GL ownership and the original HB placeholder purchase evidence');
}
