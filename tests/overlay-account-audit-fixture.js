// Phase A: exercise the existing shared renderer without changing its behavior.
// Profile replies are synthetic boundary responses, not an authenticated site,
// worker restart, or production persistence test. Existing worker/profile suites
// independently cover save authority and record isolation.
import '../src/providers/floating-panel.js';
const checks = [], originalFetch = globalThis.fetch;
const assert = (value, message) => { if (!value) throw Error(message); };
const providers = ['steam','gog','epic','amazon-games','audible','kindle','amazon-video','fandango-at-home','kobo','fanatical','humble','xbox','playstation','nintendo'];
let profiles = [], active = null, requests = [], starts = 0;
globalThis.chrome = {runtime: {sendMessage: async request => {
  requests.push(structuredClone(request));
  if (request.type === 'GET_PROVIDER_PROFILE_HINT') return {ok:true,hint:null};
  if (request.type === 'GET_PROVIDER_PROFILE') return {ok:true, profileLabel:active?.nickname ?? '',profileId:active?.profileId,
    profiles, reuseAllowed:profiles.length === 1 && Boolean(active?.synced)};
  if (request.type === 'GET_PROVIDER_SYNC_STATE') { starts++; return {ok:true,scanToken:crypto.randomUUID(),profileId:active?.profileId}; }
  if (request.type === 'COMMIT_PROVIDER_SCAN') return {ok:true};
  return {ok:true};
}}};
async function mount(provider, mode='full') {
  const host = document.createElement('div');document.body.append(host);
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = `<div class="panel"><p>Fixture provider</p><button data-mode="${mode}">Import</button><button data-diagnostic>Export diagnostic</button><p role="status"></p></div>`;
  globalThis.GalacticFloatingPanel.attach(root,provider);
  await new Promise(resolve=>setTimeout(resolve,0));
  return {host,root,input:root.querySelector('[data-profile-label]'),confirm:root.querySelector('[data-profile-confirm]'),
    confirmLabel:root.querySelector('[data-profile-confirm-label]'),switcher:root.querySelector('[data-profile-switch]'),action:root.querySelector('[data-mode]')};
}
const edit=(ui,value)=>{ui.input.value=value;ui.input.dispatchEvent(new Event('input'));};
const start=async(provider,ui)=>{ui.action.click();return globalThis.GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider});};
async function rejects(run, pattern) {let message='';try{await run();}catch(error){message=error.message;}assert(pattern.test(message),'Expected account safeguard: '+pattern);}
try {
  for (const provider of providers) {
    profiles=[];active=null;requests=[];
    let ui=await mount(provider,provider==='epic'||provider==='nintendo'?'full':'incremental');
    const before=starts;
    await rejects(()=>start(provider,ui),/confirm/);
    edit(ui,'   ');ui.confirm.checked=true;await rejects(()=>start(provider,ui),/confirm/);
    assert(starts===before,'Empty setup reached scan start.');
    edit(ui,'  Personal  ');ui.confirm.checked=true;await start(provider,ui);
    assert(requests.at(-1).profileLabel==='Personal'&&requests.at(-1).confirmed===true,'Initial declared consent not sent.');
    assert(!ui.confirmLabel.hidden,'Unexpected same-page disappearance of initial confirmation.');
    ui.host.remove();
    active={profileId:crypto.randomUUID(),nickname:'Personal',synced:true};profiles=[active];
    ui=await mount(provider);
    assert(ui.input.value==='Personal'&&ui.confirmLabel.hidden&&!ui.confirm.checked,'Single-account returning view did not hide initial checkbox.');
    await start(provider,ui);
    assert(requests.at(-1).rememberedProfile===true&&requests.at(-1).profileId===active.profileId,'Saved-profile authority not scoped.');
    ui.root.querySelector('[data-galactic-floating-panel-control="minimize"]').click();
    assert(ui.root.querySelector('.panel').hidden,'Minimize failed.');
    ui.root.querySelector('[data-galactic-floating-panel-control="restore"]').click();
    assert(!ui.root.querySelector('.panel').hidden&&ui.input.value==='Personal','Restore lost account state.');
    // Unrelated actions preserve the admitted token. Explicit new imports and
    // account edits must still discard it rather than reuse stale authority.
    ui.root.querySelector('[data-diagnostic]').click();
    await globalThis.GalacticSync.send({type:'IMPORT_PROVIDER_ITEMS',provider,items:[]});
    assert(requests.at(-1).type==='COMMIT_PROVIDER_SCAN','Diagnostic cleared an admitted save.');
    ui.action.click();
    await rejects(()=>globalThis.GalacticSync.send({type:'IMPORT_PROVIDER_ITEMS',provider,items:[]}),/Start a fresh/);
    edit(ui,'Personal');await rejects(()=>start(provider,ui),/confirm/);
    ui.confirm.checked=true;await start(provider,ui);
    ui.host.remove();
    const alternate={profileId:crypto.randomUUID(),nickname:'Alternate',synced:true};profiles=[active,alternate];
    ui=await mount(provider);
    assert(!ui.confirmLabel.hidden&&ui.input.value==='Personal','Multiple profiles unexpectedly reused consent.');
    assert(ui.root.querySelectorAll('datalist option').length===2,'Alternate account suggestions missing.');
    edit(ui,'Alternate');ui.confirm.checked=true;ui.switcher.checked=true;await start(provider,ui);
    assert(requests.at(-1).switchProfile&&requests.at(-1).profileLabel==='Alternate'&&!requests.at(-1).rememberedProfile,'Switch gesture lost explicit consent.');
    const count=starts;edit(ui,'New account');ui.switcher.checked=false;
    await rejects(()=>start(provider,ui),/confirm/);assert(starts===count,'Cancelled/unconfirmed switch started.');
    ui.host.remove();
    // Simulated remount uses the same persisted boundary reply. This verifies
    // renderer rehydration, not an actual browser/extension process restart.
    active=alternate;profiles=[active];ui=await mount(provider);
    assert(ui.confirmLabel.hidden&&ui.input.value==='Alternate','Remount failed to restore a single saved profile.');ui.host.remove();
    checks.push(provider+': shared setup, empty rejection, saved-profile rehydration, editing, alternate selection, switch gesture and minimize/restore');
  }
  checks.push('All 14 shared renderers preserve scan authority across diagnostics and minimize/restore while new imports and edits reject stale context');
} catch(error) { await originalFetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});throw error; }
await originalFetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
