(function attachEpicSync() {
  'use strict';
  if (document.querySelector('#galactic-library-epic-importer') || !globalThis.GalacticEpic) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-epic-importer';

  const shadow = host.attachShadow({ mode: 'closed' });
  globalThis.GalacticFloatingPanel.render(shadow,'epic',{diagnostics:"<details><summary>Scan diagnostics</summary><p>Export the last scan and recent Epic session failures for troubleshooting. Up to 10 failures and their later successful retries are kept locally for 24 hours. No titles, account identifiers, cookies or credentials are included.</p><p data-auth-history-status role=\"status\"></p><button type=\"button\" data-export-scan disabled>Export scan report</button></details><details><summary>Performance diagnostics</summary><p><label><input type=\"checkbox\" data-profile-next> Profile the next Epic sync</label></p><p data-profile-timing-status role=\"status\">Detailed timing is off.</p><p><a data-open-timing target=\"_blank\" rel=\"noopener\">Export timing in GL Settings > Performance diagnostics</a>. Export promptly: worker timings are in memory and are lost when the worker restarts. Arm this option again for a second scan.</p></details>"});
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');
  const exportScan=shadow.querySelector('[data-export-scan]');
  const historyStatus=shadow.querySelector('[data-auth-history-status]');
  let history=null,historyRequest=0;
  async function refreshHistory(){
    const request=++historyRequest;
    try{const reply=await chrome.runtime.sendMessage({type:'EPIC_AUTH_DIAGNOSTICS',action:'get'});if(request!==historyRequest)return;history=reply?.ok?reply.history:null;}
    catch{if(request!==historyRequest)return;history=null;}
    historyStatus.textContent=history?.episodes?.length?'A recent Epic session failure is available in this report, including any later successful retry.':'';
    exportScan.disabled=button.disabled||!(globalThis.GalacticEpic.getDiagnostics?.()||history?.episodes?.length);
  }
  exportScan.addEventListener('click',async()=>{
    exportScan.disabled=true;
    await refreshHistory();
    const lastScan=globalThis.GalacticEpic.getDiagnostics?.()??null;
    if(!lastScan&&!history?.episodes?.length)return;
    const report={format:2,provider:'epic',lastScan,authorizationHistory:history};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='GL-epic-scan.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const profileNext=shadow.querySelector('[data-profile-next]'),profileStatus=shadow.querySelector('[data-profile-timing-status]');
  shadow.querySelector('[data-open-timing]').href=chrome.runtime.getURL('options.html')+'#settings';
  profileNext.addEventListener('change',()=>{profileStatus.textContent=profileNext.checked?'Armed for the next Epic sync in this tab.':'Detailed timing is off.';});

  button.addEventListener('click', async () => {
    if(button.disabled)return;
    const profileThisScan=profileNext.checked;if(profileThisScan){profileNext.checked=false;profileStatus.textContent='Profiling this Epic sync…';}profileNext.disabled=true;
    const timing=globalThis.GalacticSync.trace?.('epic',{once:profileThisScan}),P=globalThis.GalacticContentsPerformance;let completed=false,uiEnd,fetchEnd,finishEnd;
    const startEnd=timing?.begin('request_dispatch');
    button.disabled = true;exportScan.disabled=true;globalThis.GalacticEpic.resetDiagnostics?.();
    status.dataset.busy = 'true';
    try {
      const scan = await globalThis.GalacticSync.send({type:'GET_PROVIDER_SYNC_STATE',provider:'epic',diagnosticLookupId:timing?.id});
      startEnd?.();P?.merge(timing,scan?.performance);
      if(!scan?.ok)throw new Error(scan?.error??'Could not start scan.');
      fetchEnd=timing?.begin('provider_fetch');
      const { items, skippedCount, snapshot, incomplete, failedItems } = await globalThis.GalacticEpic.fetchEpicGames(({ pagesRead, games }) => {
        status.textContent = `Reading Epic library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${games} games found.`;
      });
      fetchEnd?.();
      if(timing)Object.assign(timing,{providerCaptured:items.length,providerUnsupported:skippedCount});
      status.textContent = 'Saving Epic games and add-ons locally...';
      finishEnd=timing?.begin('save_message');
      globalThis.GalacticEpic.recordSaveState?.('requested');
      const d=globalThis.GalacticEpic.getDiagnostics?.();
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'epic', items, snapshot,scanDiagnostics:{incomplete:incomplete===true},epicDiagnostic:d?{documentReady:d.documentReady,securityCheckVisible:d.securityCheckVisible}:undefined,diagnosticLookupId:timing?.id });
      finishEnd?.();P?.merge(timing,response?.performance);
      if (!response?.ok){globalThis.GalacticEpic.recordSaveState?.('save-rejected');throw new Error(response?.error ?? 'Epic import did not complete.');}
      completed=true;globalThis.GalacticEpic.recordSaveState?.('saved');
      uiEnd=timing?.begin('page_ui');
      const unlinkedAddOnCount = response.addOnCount - response.linkedAddOnCount;
      const c=response.changes;
      status.textContent = incomplete?`Saved ${response.gameCount} Epic games and ${response.addOnCount??0} add-ons. ${failedItems?`${failedItems} entries could not be read. `:''}Some library pages or entries could not be checked. Sync again to retry. Earlier games were kept.`:`Sync complete. ${!scan.hasFullBaseline?`Imported ${response.gameCount} games and ${response.addOnCount??0} add-ons.`:c?`${c.gamesAdded} new games, ${c.gamesUpdated} updated; ${c.addOnsAdded} new add-ons, ${c.addOnsUpdated} updated.`:'Library saved.'} ${response.gameCount} games and ${response.addOnCount??0} add-ons currently recorded.${unlinkedAddOnCount?` ${unlinkedAddOnCount} add-ons have no saved parent game.`:''}${skippedCount?` ${skippedCount} non-game account items excluded.`:''}`;
    } catch (error) {
      const d=globalThis.GalacticEpic.getDiagnostics?.();
      if(d?.firstFailure?.httpStatus===200&&d.firstFailure.upstreamStatus===401&&d.saveState==='not-requested'){
        try{await chrome.runtime.sendMessage({type:'EPIC_AUTH_DIAGNOSTICS',action:'recordFailure',operation:'full',diagnostic:d});}catch{/* Diagnostics must not change the import outcome. */}
      }
      await globalThis.GalacticSync.failed('epic',error.epicFailure==='library-session'?Error('Epic sign-in authorization failed.'):error);
      status.textContent = `Epic import failed: ${error.message}`;
    } finally {
      startEnd?.();fetchEnd?.();finishEnd?.();uiEnd??=timing?.begin('page_ui');
      button.disabled = false;
      delete status.dataset.busy;await refreshHistory();
      profileNext.disabled=false;
      if(timing){await new Promise(resolve=>requestAnimationFrame(resolve));uiEnd?.();try{const reply=await globalThis.GalacticSync.send({type:'GL_PROVIDER_UI_TIMING',provider:'epic',timing:P.clean(timing.finish(completed?'prepared':'failed'))});if(profileThisScan)profileStatus.textContent=reply?.ok?'Timing captured. Export promptly from GL Settings > Performance diagnostics.':'Timing could not be delivered. Arm profiling and try again.';}catch{if(profileThisScan)profileStatus.textContent='Timing could not be delivered. Arm profiling and try again.';}}
      if(profileThisScan&&!timing)profileStatus.textContent='Timing tools are unavailable. Reload this page before profiling again.';
    }
  });
  globalThis.GalacticFloatingPanel?.attach(shadow, 'epic');
  document.documentElement.append(host);
  refreshHistory();
}());
