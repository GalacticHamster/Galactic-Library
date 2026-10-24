(function attachAudibleSync() {
  'use strict';
  if (document.querySelector('#galactic-library-audible-importer') || !globalThis.GalacticAudible) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-audible-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; }
      p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation: pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads Audible's Date added pages until it reaches titles already in your local baseline. <strong>Full rescan</strong> rebuilds the Audible snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const status = shadow.querySelector('.status');

  if(/^\/account\/purchase-history\/?$/u.test(location.pathname)&&new URLSearchParams(location.search).get('gl-audible-ownership-check')==='1'){
    const panel=shadow.querySelector('.panel');panel.querySelector('p').innerHTML='<strong>Audible ownership check</strong><br>Check this visible purchase-history page only. No books or access statuses will change. The report omits titles, purchase dates, prices, identifiers and account details.';
    for(const button of buttons)button.remove();
    const check=document.createElement('button'),download=document.createElement('button');check.type=download.type='button';check.textContent='Check this page (no import)';download.textContent='Export check report';download.disabled=true;
    panel.insertBefore(check,status);panel.insertBefore(document.createTextNode(' '),status);panel.insertBefore(download,status);
    let report=null;
    check.addEventListener('click',async()=>{
      check.disabled=true;download.disabled=true;report=null;status.dataset.busy='true';status.textContent='Checking this page and comparing its audiobook links with your saved Audible account...';
      try{
        // Bypass GalacticSync.send: that wrapper starts an import lease.
        const saved=await chrome.runtime.sendMessage({type:'GET_PROVIDER_SYNC_STATE',provider:'audible',beginScan:false}).catch(()=>null);
        report=globalThis.GalacticAudible.inspectPurchaseHistory(document,{knownItemIds:saved?.ok?saved.syncState?.knownProviderItemIds:null});
        status.textContent=report.state==='checked'?`Page checked. ${report.rows} rows; ${report.rowsWithOneAsin} have one audiobook identifier; ${report.rowsMatchingSavedAsin} match your selected saved Audible account. No library changes were made. This does not verify the signed-in account or complete history.`:'The purchase table was not recognized. No library changes were made. Export the check report so its structure can be investigated.';
        if(report.libraryComparison==='unavailable')status.textContent+=' Saved-library comparison was unavailable.';
        download.disabled=false;
      }catch{status.textContent='The page check could not complete. No library changes were made. Reload this purchase-history page and try again.';}
      finally{check.disabled=false;delete status.dataset.busy;}
    });
    download.addEventListener('click',()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='GL-audible-ownership-check.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    globalThis.GalacticFloatingPanel?.attach(shadow);document.documentElement.append(host);return;
  }

  async function sync(mode) {
    buttons.forEach((button) => { button.disabled = true; });
    status.dataset.busy = 'true';
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'audible' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Audible sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Audible baseline yet; reading every library page once…';
      const { items, snapshot, checkedCount } = await globalThis.GalacticAudible.fetchAudibleAudiobooks(({ pagesRead, audiobooks }) => {
        status.textContent = `Reading Audible library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${audiobooks} audiobooks found.`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      status.textContent = items.length ? `Saving ${items.length} Audible audiobook${items.length === 1 ? '' : 's'} locally...` : 'No new Audible titles; recording the completed check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'audible', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Audible import did not complete.');
      globalThis.GalacticAudible.recordSaveState('committed');
      const checked=Number.isSafeInteger(checkedCount)?`${checkedCount} checked`:fullRescan?`${items.length} checked`:'';
      const changes=response.changes;
      const differences=changes&&['added','updated','missing'].every(key=>Number.isSafeInteger(changes[key])&&changes[key]>=0)
        ? `${changes.added} new · ${changes.updated} updated${fullRescan?` · ${changes.missing} moved to Earlier imports`:''}`:'';
      status.textContent = `${fullRescan?'Full rescan complete':'Quick update complete'}. ${[checked,differences].filter(Boolean).join(' · ')}${checked||differences?'. ':''}${response.audiobookCount} Audible audiobook${response.audiobookCount===1?'':'s'} stored locally.`;
    } catch (error) {
      if(globalThis.GalacticAudible.getDiagnostics()?.state==='prepared')globalThis.GalacticAudible.recordSaveState('not-confirmed');
      await globalThis.GalacticSync.failed('audible',error);
      status.textContent = `Audible import failed: ${error.message}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      delete status.dataset.busy;
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  globalThis.GalacticFloatingPanel?.attach(shadow, 'audible');
  document.documentElement.append(host);
}());
