import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bindPerformanceDiagnostics} from '../src/ui/performance-diagnostics.js';
import {withWorker} from './storage.js';

const controls=()=>{
  let click;
  const button={disabled:false,addEventListener(type,handler){assert.equal(type,'click');click=handler;}};
  return {button,status:{textContent:''},worker:{textContent:''},click:()=>click()};
};

export const optionsPerformanceDiagnosticsTests=[
 ['Options exports idle companion/Options timings and the existing worker journal without acquisition or storage changes',()=>withWorker(async({dispatch,dispatchExternal,memory})=>{
  const hb='a'.repeat(32);memory.values.galacticLibraryAllowedExternalClientIds=[hb];
  await dispatchExternal({type:'MATCH_ITEMS',apiVersion:1,diagnosticLookupId:'lookup-abcdef123456-001',items:[{title:'Synthetic title',mediaType:'book'}]},{id:hb});
  const sender={id:chrome.runtime.id,url:chrome.runtime.getURL('options.html')};
  const timing=globalThis.GalacticContentsPerformance.trace('lookup-abcdef123456-002','options').finish('reparsed');
  await dispatch({type:'GL_CONTENTS_UI_TIMING',timing:globalThis.GalacticContentsPerformance.clean(timing)},sender);
  const before=structuredClone(memory.values),ui=controls(),requests=[];let summary;
  bindPerformanceDiagnostics({...ui,runtime:{sendMessage:request=>{requests.push(request);return dispatch(request,sender);}},download:value=>{summary=value;}});
  await ui.click();
  assert.deepEqual(requests,[{type:'GET_KINDLE_CONTENTS_UI_TIMINGS'}]);
  assert.equal(summary.records.length,0);assert.equal(summary.companions.length,1);assert.equal(summary.options.length,1);
  assert.ok(summary.activity.events.length);assert.ok(ui.worker.textContent.includes(summary.activity.worker));
  assert.equal(summary.lifecycle.current.worker,summary.activity.worker);
  assert.match(ui.worker.textContent,/Worker at last export:/u);assert.match(ui.status.textContent,/1 companion lookups, 1 Options timings/u);
  assert.equal(ui.button.disabled,false);assert.deepEqual(memory.values,before);
 },{concurrentQueries:true})],
 ['Options export prevents duplicate requests while pending and recovers after a denied or failed export',async()=>{
  const ui=controls();let resolve,count=0,downloaded=false;
  bindPerformanceDiagnostics({...ui,runtime:{sendMessage:()=>{count++;return new Promise(done=>resolve=done);}},download:()=>{downloaded=true;}});
  const pending=ui.click();assert.equal(ui.button.disabled,true);await ui.click();assert.equal(count,1);
  resolve({ok:false});await pending;assert.equal(ui.button.disabled,false);assert.equal(downloaded,false);assert.match(ui.status.textContent,/Export failed/u);
  const retry=ui.click();resolve({ok:true,records:[],companions:[]});await retry;
  assert.equal(downloaded,true);assert.equal(count,2);assert.equal(ui.worker.textContent,'Worker details are unavailable.');
  const broken=controls();bindPerformanceDiagnostics({...broken,runtime:{sendMessage:async()=>{throw Error('Disconnected');}},download:()=>assert.fail('Downloaded after transport failure')});
  await broken.click();assert.equal(broken.button.disabled,false);assert.match(broken.status.textContent,/Disconnected/u);
 }],
 ['Options downloads a JSON timing file and releases its temporary link/object URL',async()=>{
  const previousDocument=globalThis.document,previousUrl=globalThis.URL,ui=controls();let blob,link,removed=false,revoked;
  globalThis.URL={createObjectURL:value=>{blob=value;return 'blob:diagnostics';},revokeObjectURL:value=>{revoked=value;}};
  globalThis.document={body:{append:value=>{link=value;}},createElement:type=>{assert.equal(type,'a');return {click(){assert.equal(this.download,'GL-timing-export.json');},remove(){removed=true;}};}};
  try{
    bindPerformanceDiagnostics({...ui,runtime:{sendMessage:async()=>({ok:true,records:[],companions:[],activity:{worker:'abcdef123456',startedEpochMs:1000,events:[]}})}});
    await ui.click();assert.equal(link.href,'blob:diagnostics');assert.equal(removed,true);assert.equal(revoked,'blob:diagnostics');
    assert.equal(blob.type,'application/json');const saved=JSON.parse(await blob.text());assert.equal(saved.format,1);assert.equal(saved.activity.worker,'abcdef123456');assert.deepEqual(saved.companions,[]);
  }finally{globalThis.document=previousDocument;globalThis.URL=previousUrl;}
 }],
 ['Options diagnostics section explains independent collection and worker restart loss without another enable checkbox',async()=>{
  const html=await readFile(new URL('../options.html',import.meta.url),'utf8');
  const article=html.match(/<(?:article|details) id="performance-diagnostics"[\s\S]*?<\/(?:article|details)>/u)?.[0];assert.ok(article);
  assert.ok(html.indexOf(article)>html.indexOf('id="settings-workspace"'));
  for(const id of ['export-timing-summary','performance-diagnostics-worker','performance-diagnostics-status'])assert.ok(article.includes(`id="${id}"`));
  assert.match(article,/lost when the Galactic Library service worker restarts/u);assert.match(article,/collected automatically/u);assert.match(article,/no Amazon page/u);
  assert.ok(!article.includes('type="checkbox"'));
 }]
];
