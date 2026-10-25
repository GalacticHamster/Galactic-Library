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

  // Audible replaces its query string when changing history views or years.
  // Retain only a short-lived opt-in timestamp in this tab, never account data.
  const checkSessionKey='galactic-library-audible-ownership-check-until';
  const historyPage=/^\/account\/purchase-history\/?$/u.test(location.pathname);
  let checkSession=false;
  if(historyPage){try{
    const until=Number(sessionStorage.getItem(checkSessionKey));
    checkSession=until>Date.now()&&until<=Date.now()+2*60*60*1000;
    if(!checkSession)sessionStorage.removeItem(checkSessionKey);
    if(new URLSearchParams(location.search).get('gl-audible-ownership-check')==='1'){
      sessionStorage.setItem(checkSessionKey,String(Date.now()+2*60*60*1000));checkSession=true;
    }
  }catch{/* A blocked session store leaves the explicit URL opt-in available. */}}
  if(historyPage&&(checkSession||new URLSearchParams(location.search).get('gl-audible-ownership-check')==='1')){
    const panel=shadow.querySelector('.panel');panel.querySelector('p').innerHTML='<strong>Audible ownership check</strong><br>Check the visible page, including its page controls. Use Audible\'s View menu to check Your orders or Refund history, and its date menu to check a year. Run a new check after each page loads. No books or access statuses will change. Diagnostic reports omit titles, transaction dates, prices, identifiers and account details.';
    for(const button of buttons)button.remove();
    const check=document.createElement('button'),download=document.createElement('button'),end=document.createElement('button');check.type=download.type=end.type='button';check.textContent='Check this page (no import)';download.textContent='Export check report';download.disabled=true;end.textContent='End check';
    panel.insertBefore(check,status);panel.insertBefore(document.createTextNode(' '),status);panel.insertBefore(download,status);
    panel.insertBefore(document.createTextNode(' '),status);panel.insertBefore(end,status);
    const previewButton=document.createElement('button'),evidenceDownload=document.createElement('button'),previewArea=document.createElement('div'),automaticCheck=document.createElement('button');
    previewButton.type=evidenceDownload.type='button';previewButton.textContent='Preview purchase evidence';evidenceDownload.textContent='Download purchase evidence for review';evidenceDownload.disabled=true;
    previewArea.style.cssText='max-height:50vh;overflow:auto;';
    panel.insertBefore(document.createElement('br'),status);panel.insertBefore(previewButton,status);panel.insertBefore(previewArea,status);
    automaticCheck.type='button';automaticCheck.textContent='Test automatic history access';panel.insertBefore(automaticCheck,status);
    const automaticHelp=document.createElement('p');automaticHelp.textContent='This read-only test opens purchase history in the background and selects one offered year. It does not scan every year or save books.';panel.insertBefore(automaticHelp,status);
    let purchasePreview=null,previewContext=null;
    const clearPreview=()=>{purchasePreview=null;previewContext=null;previewArea.replaceChildren();evidenceDownload.disabled=true;};
    const setBusy=busy=>{check.disabled=end.disabled=previewButton.disabled=automaticCheck.disabled=busy;if(busy)status.dataset.busy='true';else delete status.dataset.busy;};
    automaticCheck.addEventListener('click',async()=>{
      clearPreview();setBusy(true);download.disabled=true;report=null;
      try{
        const saved=await chrome.runtime.sendMessage({type:'GET_PROVIDER_SYNC_STATE',provider:'audible',beginScan:false}).catch(()=>null);
        const access=await globalThis.GalacticAudible.probePurchaseHistoryAccess({knownItemIds:saved?.ok?saved.syncState?.knownProviderItemIds:null,progress:message=>{status.textContent=message;}});
        report={format:4,provider:'audible',purpose:'ownership-feasibility',readOnly:true,historyComplete:false,accountVerified:false,automaticAccess:access};download.disabled=false;
        status.textContent=access.state==='navigation-verified'?'Audible opened another purchase-history year automatically. No library changes were made. Export the check report. This verifies access and year switching, not complete history or refund handling.':'Automatic history access could not be verified. No library changes were made. Export the check report so the access or navigation problem can be investigated.';
      }catch{status.textContent='The automatic access test could not complete. No library changes were made. Reload this page and try again.';}
      finally{setBusy(false);}
    });
    async function previewSavedAccount(){
      const [saved,profile]=await Promise.all([
        chrome.runtime.sendMessage({type:'GET_PROVIDER_SYNC_STATE',provider:'audible',beginScan:false,includePurchaseTitles:true}),
        chrome.runtime.sendMessage({type:'GET_PROVIDER_PROFILE',provider:'audible',beginScan:false})
      ]).catch(()=>{throw Error('The saved Audible account could not be read. Reload GL and preview again. No library changes were made.');});
      if(!saved?.ok||!profile?.ok||!saved.profileId||saved.profileId!==profile.profileId||!profile.profileLabel)throw Error('Choose your saved Audible account in Providers, then preview again. No library changes were made.');
      return {profileId:profile.profileId,profileLabel:profile.profileLabel,knownItemIds:saved.syncState?.knownProviderItemIds??[],knownItemTitles:saved.syncState?.knownItemTitles??{}};
    }
    previewButton.addEventListener('click',async()=>{
      clearPreview();setBusy(true);download.disabled=true;report=null;const pageUrl=location.href;
      status.textContent='Preparing the visible purchases for review. No library changes will be made...';
      try{
        const account=await previewSavedAccount();
        if(location.href!==pageUrl)throw Error('The history page changed. Wait for it to load, then preview again.');
        const result=globalThis.GalacticAudible.previewPurchaseHistory(document,{knownItemIds:account.knownItemIds,knownItemTitles:account.knownItemTitles});
        report=result.report;download.disabled=false;
        if(result.state==='blocked')throw Error('Choose Your orders and wait for its purchase table to load. Conflicting order information or an unavailable saved-account comparison must be resolved before previewing. No library changes were made.');
        if(!result.entries.length){status.textContent=`No purchase evidence is ready. ${result.report.grouping.matchingBookRowsWithDatedOrderEvidence} dated rows match your saved account; ${result.missingTitles} have no readable page or saved title. ${result.unmatched} unmatched rows and ${result.excludedReturned} returned identifiers were left out. No library changes were made. Export the check report if you expected purchases here.`;return;}
        purchasePreview=result;previewContext={...account,pageUrl};
        const explanation=document.createElement('p');explanation.textContent=`${result.entries.length} purchase entries match saved Audible account “${account.profileLabel}”. These are purchase evidence, not confirmed current ownership. Existing ownership corrections remain unchanged. Only this visible page was read.`;
        if(result.titlesFromSavedLibrary)explanation.textContent+=` ${result.titlesFromSavedLibrary} names use the matching saved book titles; purchase dates come from this page.`;
        const details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');summary.textContent='Books and purchase dates';list.style.cssText='max-height:220px;overflow:auto;padding-left:22px;';
        for(const entry of result.entries){const row=document.createElement('li');row.textContent=`${entry.title} — ${entry.acquiredAt}`;list.append(row);}details.append(summary,list);
        const note=document.createElement('p');note.textContent='This separate evidence file contains book titles, identifiers and purchase dates. Keep it private. In GL, select this same Audible account under Providers, then open Library → Ownership and access → Match purchase receipts → Receipt files. Import the file and review each matching account copy. Nothing is applied automatically; no order totals are copied or divided among books. The purchase date is stored as evidence, not a replacement provider acquisition date.';
        const label=document.createElement('label'),confirm=document.createElement('input');confirm.type='checkbox';confirm.setAttribute('aria-label','Confirm purchase evidence account');label.append(confirm,` I checked that this history belongs to “${account.profileLabel}” and will review any returns or later access changes before confirming ownership.`);
        confirm.addEventListener('change',()=>{evidenceDownload.disabled=!confirm.checked;});
        previewArea.append(explanation,details,note,label,document.createElement('br'),evidenceDownload);
        status.textContent=`Preview ready. No library changes were made. ${result.unmatched} unmatched rows and ${result.missingTitles} rows without a readable title were left out; ${result.excludedReturned} identifiers with completed-return wording were excluded.`;
        if(result.report.boundReached||result.report.navigation.enabledNext)status.textContent+=' This is a partial page/history check, not a complete account history.';
      }catch(error){clearPreview();status.textContent=error.message;}
      finally{setBusy(false);}
    });
    evidenceDownload.addEventListener('click',async()=>{
      if(!purchasePreview||!previewContext||evidenceDownload.disabled)return;
      const previous=purchasePreview,context=previewContext;setBusy(true);evidenceDownload.disabled=true;
      try{
        const account=await previewSavedAccount(),current=globalThis.GalacticAudible.previewPurchaseHistory(document,{knownItemIds:account.knownItemIds,knownItemTitles:account.knownItemTitles});
        if(location.href!==context.pageUrl||account.profileId!==context.profileId||account.profileLabel!==context.profileLabel||current.state!=='ready'||current.report.selectedTime!==previous.report.selectedTime||JSON.stringify(current.entries)!==JSON.stringify(previous.entries))throw Error('The account or purchase page changed. Preview again before downloading. No library changes were made.');
        const url=URL.createObjectURL(new Blob([JSON.stringify({entries:current.entries},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='GL-audible-purchase-evidence-private.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        status.textContent='Private purchase evidence downloaded for manual review. No library records or ownership statuses changed. The file does not establish complete history or rule out later refunds.';
        evidenceDownload.disabled=false;
      }catch(error){clearPreview();status.textContent=error.message;}
      finally{setBusy(false);}
    });
    end.addEventListener('click',()=>{
      if(check.disabled)return;
      try{sessionStorage.removeItem(checkSessionKey);}catch{}
      const url=new URL(location.href);url.searchParams.delete('gl-audible-ownership-check');history.replaceState(history.state,'',url.href);
      host.remove();attachAudibleSync();
    });
    let report=null;
    check.addEventListener('click',async()=>{
      clearPreview();setBusy(true);download.disabled=true;report=null;status.textContent='Checking this page and comparing its audiobook links with your saved Audible account...';
      try{
        // Bypass GalacticSync.send: that wrapper starts an import lease.
        const saved=await chrome.runtime.sendMessage({type:'GET_PROVIDER_SYNC_STATE',provider:'audible',beginScan:false}).catch(()=>null);
        report=globalThis.GalacticAudible.inspectPurchaseHistory(document,{knownItemIds:saved?.ok?saved.syncState?.knownProviderItemIds:null});
        status.textContent=report.state==='checked'?`Page checked. ${report.rows} book rows; ${report.rowsMatchingSavedAsin} match your selected saved Audible account. ${report.grouping.bookRowsWithDatedOrderEvidence} have direct or shared dated order information. No library changes were made. This does not verify the signed-in account or complete history.`:'The purchase table was not recognized. No library changes were made. Export the check report so its structure can be investigated.';
        if(report.refundHistory?.selected)status.textContent=report.refundHistory.candidateTables?`Refund page checked. ${report.refundHistory.bookRows} book rows; ${report.refundHistory.rowsMatchingSavedAsin} match your selected saved Audible account. ${report.refundHistory.rowsWithCompletedStatus} have explicit completed-return wording. Other rows remain unverified. No library changes were made; this does not establish complete refund history.`:'The refund table was not recognized. No library changes were made. Export this report so its structure can be investigated; an empty or unfamiliar page does not prove there were no refunds.';
        if(report.navigation?.enabledNext)status.textContent+=' A Next page control is available; this report covers only the current page.';
        if(report.boundReached)status.textContent+=' The check reached its safety limit; some page information was not inspected.';
        if(report.libraryComparison==='unavailable')status.textContent+=' Saved-library comparison was unavailable.';
        download.disabled=false;
      }catch{status.textContent='The page check could not complete. No library changes were made. Reload this purchase-history page and try again.';}
      finally{setBusy(false);}
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
