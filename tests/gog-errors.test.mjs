import assert from 'node:assert/strict';import {test} from 'node:test';import {providerContext} from './provider-snapshots.js';
const good={ok:true,status:200,json:async()=>({products:[{id:'1',title:'Synthetic game'}],totalPages:2,totalProducts:2})};
for(const [name,reply,wording,fatal]of [
 ['expired session',()=>({ok:false,status:401}),/Sign in.*session/,true],
 ['access denied',()=>({ok:false,status:403}),/Sign in.*session/,true],
 ['server unavailable',()=>({ok:false,status:503}),/503.*Try again later/,false],
 ['network failure',()=>{throw Error('PRIVATE TOKEN https://private.invalid/?secret=x');},/Check your connection/,false],
 ['unreadable JSON',()=>({ok:true,json:async()=>{throw Error('PRIVATE RESPONSE');}}),/unreadable.*Reload/,true],
 ['unknown structure',()=>({ok:true,json:async()=>({secret:'PRIVATE RESPONSE'})}),/does not recognize.*report/,true]
])test('GOG sanitized guidance: '+name,async()=>{
 const c=providerContext('gog',async()=>reply());await assert.rejects(c.GalacticGog.fetchGogGames(()=>{},null,true),e=>{assert.match(e.message,wording);assert.equal(Boolean(e.fatal),fatal);assert.doesNotMatch(e.message,/PRIVATE|private\.invalid/);if(!name.includes('session')&&!name.includes('denied'))assert.doesNotMatch(e.message,/Sign in|signed in/);return true;});
});
test('GOG later server error retains prefix; session error remains fatal',async()=>{
 for(const status of [503,401]){let count=0;const c=providerContext('gog',async()=>++count===1?good:{ok:false,status});const p=c.GalacticGog.fetchGogGames(()=>{},null,true);if(status===401)await assert.rejects(p,/Sign in/);else{const r=await p;assert.equal(r.items.length,1);assert(r.incomplete);assert.equal(r.snapshot.complete,false);}}
});
