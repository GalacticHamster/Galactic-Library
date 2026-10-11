import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Minimal DOM contract: exercise the actual shared controller without a browser dependency.
import {Node} from './helpers/purchase-dom.mjs';

const account=(id,eligible=1)=>({accountRef:id,label:id,count:eligible,eligibleCount:eligible,active:true});
async function fixture({local=[account('local')],remote=[account('remote')],provider='humble',gate,fail,offer}={}){
 const host=new Node('div');host.dataset={purchaseHandoff:'gl',provider};const disclosure=new Node('details');disclosure.open=false;disclosure.append(host);const calls=[],changes=[],blobs=[];
 const walk=n=>[n,...n.children.flatMap(walk)],control=k=>walk(host).find(n=>n.dataset.purchaseControl===k);
 const runtime={id:'own',onMessage:{addListener(){}},async sendMessage(m){calls.push(m);if(m.action==='pending')return {ok:true};if(gate&&['state','remoteAccounts'].includes(m.action))await gate;const failed=fail?.(m);if(failed)return {ok:false,error:typeof failed==='string'?failed:'Synthetic unavailable'};if(m.action==='state')return {ok:true,accounts:local,offer};if(m.action==='remoteAccounts')return {ok:true,accounts:remote};if(m.action==='preview')return {ok:true,preview:{readOnly:true,sourceStamp:'a'.repeat(64),added:1,updated:0,newTitleNames:1}};return {ok:true,added:1,updated:0};}};
 const document={createElement:t=>new Node(t),createTextNode:t=>new Node('#text',t),querySelectorAll:()=>[host],querySelector:()=>null,dispatchEvent(){}};
 vm.runInNewContext(await readFile(new URL('../shared/purchase-handoff-ui.js',import.meta.url),'utf8'),{document,chrome:{runtime,storage:{onChanged:{addListener:f=>changes.push(f)}}},setTimeout,clearTimeout,Blob,URL:{createObjectURL:b=>{blobs.push(b);return 'blob:synthetic';},revokeObjectURL(){}},CustomEvent:class {}});
 const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
 async function open(){disclosure.open=true;const manual=walk(host).find(n=>n.dataset.purchaseManual!==undefined);manual.open=true;await manual.event('toggle');await flush();}
 async function choose(key,value){control(key).value=value;await control(key).event('change');await flush();}
 async function confirm(){walk(host).find(n=>n.type==='checkbox'&&!n.dataset.purchaseControl).checked=true;await walk(host).find(n=>n.type==='checkbox'&&!n.dataset.purchaseControl).event('change');}
 return {host,control,calls,changes,blobs,flush,open,choose,confirm,text:()=>host.textContent};
}
test('one eligible source and one empty receiving account preselect without confirming identity',async()=>{
 const f=await fixture({local:[account('empty',0)]});await f.open();assert.equal(f.control('source').value,'remote');assert.equal(f.control('target').value,'empty');assert.equal(f.control('action').disabled,true);assert.equal(f.control('advanced').open,undefined);assert.equal(f.calls.filter(c=>c.action==='preview').length,0);
});
test('multiple eligible accounts never map by matching nickname; missing destination offers new',async()=>{
 const f=await fixture({remote:[account('one'),account('two')],local:[]});await f.open();assert.equal(f.control('source').value,'');assert.equal(f.control('target').value,'');assert(f.control('target').options.some(o=>o.value==='new'));await f.choose('source','one');await f.choose('target','new');assert.equal(f.control('action').disabled,true);
});
test('empty source blocks Continue and explains what to do',async()=>{const f=await fixture({remote:[account('empty',0)]});await f.open();await f.confirm();assert.equal(f.control('action').disabled,true);assert(f.text().includes('No saved purchases can be shared'));});
test('delayed account loading blocks clicks and pairing failure retains local choices with Retry',async()=>{
 let resolve;const gate=new Promise(r=>resolve=r),f=await fixture({gate});await f.open();await f.control('action').click();assert.equal(f.calls.filter(c=>c.action==='preview').length,0);assert.equal(f.control('action').disabled,true);resolve();await f.flush();assert.equal(f.control('source').value,'remote');
 let failed=true;const g=await fixture({fail:m=>failed&&m.action==='remoteAccounts'});await g.open();assert.equal(g.control('retry').hidden,false);assert.equal(g.control('action').disabled,true);failed=false;await g.control('retry').click();await g.flush();assert.equal(g.control('target').value,'local');
});
test('Continue is read-only; Back/Continue reuse an unchanged preview; final import requires approval',async()=>{
 const f=await fixture();await f.open();await f.confirm();await f.control('action').click();await f.flush();assert.equal(f.control('action').textContent,'Import purchases');assert.equal(f.control('action').disabled,true);assert(f.text().includes('No purchases have been imported yet.'));assert.equal(f.calls.filter(c=>c.action==='import'||c.action==='send').length,0);
 await f.control('back').click();await f.control('action').click();await f.flush();assert.equal(f.calls.filter(c=>c.action==='preview').length,1);f.control('approve').checked=true;await f.control('approve').event('change');await f.control('action').click();await f.flush();const imported=f.calls.find(c=>c.action==='import');assert.equal(imported.confirmed,true);assert.equal(imported.sourceStamp,'a'.repeat(64));assert.equal(f.control('restart').hidden,false);
});
test('account/direction changes invalidate review; source and destination are sent exactly',async()=>{
 const f=await fixture({local:[account('one'),account('two')]});await f.open();await f.choose('target','one');await f.confirm();await f.control('action').click();await f.flush();assert.equal(f.calls.find(c=>c.action==='preview').target.accountRef,'one');await f.control('back').click();await f.choose('target','two');await f.confirm();await f.control('action').click();await f.flush();assert.equal(f.calls.filter(c=>c.action==='preview').length,2);await f.control('back').click();await f.choose('direction','send');assert.equal(f.control('action').textContent,'Continue');assert.equal(f.control('action').disabled,true);
});
test('preview failure blocks transfer, preserves choices and Retry performs a fresh review',async()=>{
 let failed=true;const f=await fixture({fail:m=>failed&&m.action==='preview'});await f.open();await f.confirm();await f.control('action').click();await f.flush();assert.equal(f.control('source').value,'remote');assert.equal(f.control('retry').hidden,false);assert.equal(f.calls.filter(c=>c.action==='import').length,0);failed=false;await f.control('retry').click();await f.flush();assert.equal(f.control('action').textContent,'Import purchases');
});
test('FAN has guided read-only preview without Humble comparison controls; Send only offers',async()=>{
 const f=await fixture({provider:'fanatical'});await f.open();assert.equal(f.control('reconcile'),undefined);assert(f.control('preview'));await f.choose('direction','send');await f.confirm();await f.control('action').click();await f.flush();await f.control('action').click();await f.flush();assert.equal(f.calls.filter(c=>c.action==='send').length,1);assert.equal(f.calls.filter(c=>c.action==='import').length,0);assert(f.text().includes('receiving library has not changed'));
});
test('a local saved-data change invalidates review; identical-value events do not',async()=>{
 const f=await fixture();await f.open();await f.confirm();await f.control('action').click();await f.flush();f.changes[0]({galacticLibraryDatabase:{oldValue:{x:1},newValue:{x:1}}},'local');assert.equal(f.control('action').textContent,'Import purchases');f.changes[0]({galacticLibraryDatabase:{oldValue:{x:1},newValue:{x:2}}},'local');assert.equal(f.control('action').textContent,'Continue');assert.equal(f.control('action').disabled,true);assert.equal(f.control('retry').hidden,false);
});


test('creating a receiving account reveals only its nickname and carries the choice into read-only preview',async()=>{
 const f=await fixture({local:[]});await f.open();await f.choose('target','new');assert.equal(f.control('new-name').parentElement.hidden,false);f.control('new-name').value='Separate';await f.control('new-name').event('input');await f.confirm();await f.control('action').click();await f.flush();const p=f.calls.find(c=>c.action==='preview');assert.equal(p.target.newLabel,'Separate');assert.equal(f.calls.filter(c=>c.action==='import').length,0);
});

test('a stale preview error offers account reload rather than repeated checks against stale choices',async()=>{
 let stale=true;const f=await fixture({fail:m=>stale&&m.action==='preview'?'Destination account changed.':false});await f.open();await f.confirm();await f.control('action').click();await f.flush();stale=false;await f.control('retry').click();await f.flush();assert.equal(f.control('action').textContent,'Continue');assert.equal(f.calls.filter(c=>c.action==='state').length,2);assert.equal(f.control('action').disabled,true);
});

test('double Continue and failed final import cannot offer or import automatically',async()=>{
 const f=await fixture({fail:m=>m.action==='import'});await f.open();await f.confirm();const first=f.control('action').click();await f.control('action').click();await first;await f.flush();assert.equal(f.calls.filter(c=>c.action==='preview').length,1);f.control('approve').checked=true;await f.control('approve').event('change');await f.control('action').click();await f.flush();assert.equal(f.control('action').textContent,'Continue');assert.equal(f.calls.filter(c=>c.action==='import').length,1);assert(f.text().includes('Check the receiving account before retrying'));
});


test('optional Advanced preview and full export stay read-only and do not replace required guided approval',async()=>{
 const f=await fixture();await f.open();await f.control('preview').click();await f.flush();assert.equal(f.control('action').textContent,'Continue');assert.equal(f.control('action').disabled,true);assert.equal(f.control('export').disabled,false);await f.control('export').click();assert.equal(f.blobs.length,1);const report=JSON.parse(await f.blobs[0].text());assert.equal(report.readOnly,true);assert.equal(report.sourceStamp,'a'.repeat(64));assert.equal(f.calls.filter(c=>c.action==='send'||c.action==='import').length,0);
});

test('interrupted offered import clears the obsolete UI offer before an explicit fresh review/retry',async()=>{
 let failed=true;const offer={peerId:'remote-extension',manifest:{token:'old-grant',header:{accountRef:'remote',accountLabel:'Remote'}},target:{accountRef:'local'}},f=await fixture({offer,fail:m=>failed&&m.action==='import'});await f.open();await f.confirm();await f.control('action').click();await f.flush();f.control('approve').checked=true;await f.control('approve').event('change');await f.control('action').click();await f.flush();assert.equal(f.calls.find(c=>c.action==='import').useOffer,true);failed=false;await f.control('retry').click();await f.flush();f.control('approve').checked=true;await f.control('approve').event('change');await f.control('action').click();await f.flush();assert.equal(f.calls.filter(c=>c.action==='import')[1].useOffer,undefined);
});
