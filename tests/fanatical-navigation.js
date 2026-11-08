import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../src/providers/fanatical-content.js',import.meta.url),'utf8');
export function fixture(start='/en/orders'){
 const roots=[],events={},polls=[],reports=[],failures=[];
 class Element{
  constructor(){this.id='';this.dataset={};this.style={};this.listeners={};}
  get isConnected(){return roots.includes(this);}
  attachShadow(){const buttons=[new Element(),new Element()];buttons[0].dataset.mode='incremental';buttons[1].dataset.mode='full';const status=new Element(),exportButton=new Element();this.shadow={buttons,status,exportButton,querySelectorAll:()=>buttons,querySelector:selector=>selector==='[data-export-scan]'?exportButton:status};return this.shadow;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  click(){return this.listeners.click?.();}
  remove(){const index=roots.indexOf(this);if(index>=0)roots.splice(index,1);}
 }
 const calls=[];let getState=async()=>({ok:true,hasFullBaseline:true}),fetch=async()=>({ok:true,result:{items:[]}}),commit=async()=>({ok:true,gameCount:1,bookCount:0,audiobookCount:0});
 const c={console,Blob,crypto:webcrypto,chrome:{runtime:{getManifest:()=>({version:'1.0.0'}),getURL:()=> 'chrome-extension://synthetic/'}},clearInterval(){},removeEventListener(name){delete events[name];},URL:{createObjectURL:blob=>{reports.push(blob.text());return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:fn=>fn(),location:{origin:'https://www.fanatical.com',href:'https://www.fanatical.com'+start,pathname:start},document:{createElement:()=>new Element(),documentElement:{append:node=>roots.push(node)}},
  MutationObserver:class{constructor(fn){this.callback=fn;}observe(){}},addEventListener:(name,fn)=>{events[name]=fn;},setInterval:fn=>polls.push(fn),
  GalacticFanatical:{fanaticalItemsFromProjection:()=>[]},GalacticFloatingPanel:{render(shadow,provider,{onImport}){for(const button of shadow.buttons)button.addEventListener('click',()=>onImport(button.dataset.mode));},attach(){},importerOwnership(){return {check:async()=>true,present(){}};}},GalacticSync:{send:async m=>{calls.push(m.type);return m.type==='GET_PROVIDER_SYNC_STATE'?getState():m.type==='FETCH_FANATICAL_ORDERS'?fetch(m):commit();},failed:async(_,error)=>{failures.push(error.message);}}};
 c.globalThis=c;c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../src/providers/fanatical.js',import.meta.url),'utf8'),c);vm.runInContext(source,c);
 const navigate=(path,signal='poll')=>{c.location.pathname=path;c.location.href='https://www.fanatical.com'+path;if(signal==='poll')polls.forEach(fn=>fn());else events[signal]();};
 return {c,events,roots,calls,reports,failures,navigate,runAgain:()=>vm.runInContext(source,c),setState:fn=>{getState=fn;},setFetch:fn=>{fetch=fn;},setCommit:fn=>{commit=fn;}};
}
export const fanaticalNavigationTests=[
 ['Fanatical route controller is loaded for SPA entry pages without adding host permissions',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
  const entry=manifest.content_scripts.find(row=>row.js.includes('src/providers/fanatical-content.js'));
  assert.deepEqual(entry.matches,['https://www.fanatical.com/*']);
  assert(manifest.host_permissions.includes('https://www.fanatical.com/*'));
 }],
 ['Fanatical popup follows push/replace/pop routes without a DOM mutation or duplicate mount',()=>{
  const f=fixture('/en/bundle/fixture');assert.equal(f.roots.length,0);
  f.navigate('/en/orders');assert.equal(f.roots.length,1);f.runAgain();assert.equal(f.roots.length,1);
  f.navigate('/en/account','popstate');assert.equal(f.roots.length,0);
  f.navigate('/orders');assert.equal(f.roots.length,1);
  f.navigate('/en/bundle/fixture');assert.equal(f.roots.length,0);
 }],
 ...['state','fetch','commit'].map(stage=>['Fanatical navigation invalidates stale '+stage+' continuations without altering a replacement panel',async()=>{
  const f=fixture();let finish;
  if(stage==='state')f.setState(()=>new Promise(resolve=>{finish=resolve;}));
  if(stage==='fetch')f.setFetch(()=>new Promise(resolve=>{finish=resolve;}));
  if(stage==='commit')f.setCommit(()=>new Promise(resolve=>{finish=resolve;}));
  const old=f.roots[0],pending=old.shadow.buttons[0].listeners.click();
  // The click now awaits read-only importer ownership before the scan state.
  for(let n=0;n<32&&!finish;n++)await Promise.resolve();assert(finish);
  f.navigate('/en/bundle/fixture');assert.equal(f.roots.length,0);
  f.navigate('/en/orders');const fresh=f.roots[0];assert.notEqual(fresh,old);
  finish(stage==='state'?{ok:true,hasFullBaseline:true}:stage==='fetch'?{ok:true,result:{items:[]}}:{ok:true,gameCount:1});await pending;
  assert.equal(fresh.shadow.status.textContent,undefined);assert.equal(f.failures.length,0);
  assert.equal(f.calls.filter(x=>x==='IMPORT_PROVIDER_ITEMS').length,stage==='commit'?1:0);
  assert.equal(f.calls.filter(x=>x==='FETCH_FANATICAL_ORDERS').length,stage==='state'?0:1);
 }])
];
