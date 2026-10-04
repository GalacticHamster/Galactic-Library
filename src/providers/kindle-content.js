(function attachKindleSync() {
  'use strict';
  if (!location.pathname.includes('/hz/mycd/') || document.querySelector('#galactic-library-kindle-importer') || !globalThis.GalacticKindle) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-kindle-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .panel { background:#1f2937; border:1px solid #f59e0b; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#f59e0b; color:#1c1917; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#fde68a; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }
    </style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads the newest Kindle pages until it reaches a page already in your local baseline. <strong>Full rescan</strong> rebuilds the Kindle snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p><label>Contents discovery <select data-contents-mode><option value="scan">Scan eligible books</option><option value="retry">Retry incomplete checks</option><option value="rescan">Rescan previous results</option><option value="reparse">Reparse saved text (no requests)</option></select></label></p><p><button type="button" data-action="comic-contents">Find contents</button> <button type="button" data-action="pause-comic-contents" hidden>Pause</button></p><details><summary>How contents discovery works</summary><p>Any synced Kindle book with a supported Amazon product page can be checked. Likely collections come first. Scanning uses your signed-in tab, saves collection statements as suggestions, and reprocesses older saved text locally. No contents found means this check found no useful statement; it does not prove the book contains nothing.</p><p>Normal scans skip current results and known unavailable pages. Retry revisits incomplete checks; Rescan revisits previous results too. Reparse saved text makes no requests. Results save in groups of up to 20 or about once a minute, and always when you pause or finish. Pause keeps saved progress; a normal scan resumes unfinished checks. Closing the tab or a browser crash can require repeating up to 20 unfinished results.</p><p>In Book information, open Details and Review included contents to check proposals before saving verified contents. Names, numbers, run, language and full/excerpt scope need review. Discovered names do not match other library titles or confirm purchases.</p></details><details><summary>Performance diagnostics</summary><p><label><input type="checkbox" data-contents-diagnostics> Record local timing (last 50 operations)</label></p><p>Enable before scanning. Pause after 20?50 pages, then export. Timing contains no book or account information. Reload clears it.</p><button type="button" data-export-timing>Export timing summary</button><textarea data-timing-output readonly hidden aria-label="Contents performance report" style="width:100%;height:100px"></textarea></details><p class="status" role="status"></p></div>`;
  const syncButtons = [...shadow.querySelectorAll('button[data-mode]')];
  const comicContentsButton = shadow.querySelector('button[data-action="comic-contents"]');
  const pauseComicContentsButton = shadow.querySelector('button[data-action="pause-comic-contents"]');
  const status = shadow.querySelector('.status');
  const contentsMode = shadow.querySelector('[data-contents-mode]');
  const performanceTools=globalThis.GalacticContentsPerformance;
  const diagnosticCheck=shadow.querySelector('[data-contents-diagnostics]');
  const timingOutput=shadow.querySelector('[data-timing-output]');
  const timings=performanceTools?.collector();
  let diagnosticPrefix='',diagnosticSequence=0,pendingTiming=null;
  const visibility=()=>document.visibilityState;
  function beginTiming(kind){
    if(!diagnosticCheck.checked||!performanceTools)return null;
    if(!diagnosticPrefix)diagnosticPrefix=crypto.randomUUID().replace(/-/gu,'').slice(0,12);
    const timing=performanceTools.trace(`lookup-${diagnosticPrefix}-${String(++diagnosticSequence).padStart(3,'0')}`,kind);
    timing.visibilityStart=visibility();timing.focusStart=document.hasFocus();return timing;
  }
  function finishTiming(timing,result){
    if(!timing)return;timing.visibilityEnd=visibility();timing.focusEnd=document.hasFocus();timings.add(timing.finish(result));
  }
  function closePending(){if(pendingTiming){finishTiming(pendingTiming,pendingTiming.result);pendingTiming=null;}}
  async function diagnosticSend(request,timing,stage){
    const end=timing?.begin(stage);
    try{const response=await globalThis.GalacticSync.send(timing?{...request,diagnosticLookupId:timing.id}:request);performanceTools?.merge(timing,response?.performance);return response;}finally{end?.();}
  }
  shadow.querySelector('[data-export-timing]').addEventListener('click',async()=>{
    if(!timings)return;
    const response=await globalThis.GalacticSync.send({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'}).catch(()=>null);
    timingOutput.value=JSON.stringify(timings.report(response?.records??[]),null,2);timingOutput.hidden=false;timingOutput.focus();timingOutput.select();
  });
  diagnosticCheck.addEventListener('change',()=>{closePending();if(!diagnosticCheck.checked){diagnosticPrefix='';}});
  let activeContentsRequest = null;
  let comicContentsRunning = false;
  let pauseComicContentsRequested = false;

  function setSyncButtonsDisabled(disabled) {
    syncButtons.forEach((button) => { button.disabled = disabled; });
  }

  async function sync(mode) {
    setSyncButtonsDisabled(true);
    comicContentsButton.disabled = true;
    status.dataset.busy = 'true';
    try {
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'kindle' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Kindle sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Kindle baseline yet; reading every library page once…';
      const { items, diagnostics, snapshot } = await globalThis.GalacticKindle.fetchKindleBooks(({ pagesRead, books, categoryCounts }) => {
        const documents = categoryCounts?.['personal-documents'] ?? 0;
        status.textContent = `Reading Kindle library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${books} items found (${documents} personal document${documents === 1 ? '' : 's'}).`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      status.textContent = items.length ? `Saving ${items.length} Kindle item${items.length === 1 ? '' : 's'} locally...` : 'No new Kindle items; recording the completed check...';
      const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kindle', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
      if (!response?.ok) throw new Error(response?.error ?? 'Kindle import did not complete.');
      const categoryDetails = Object.entries(diagnostics).map(([category, detail]) => {
        const name = category === 'books' ? 'Books' : 'Personal Documents';
        const reported = detail.reportedCount === null ? 'unknown' : detail.reportedCount;
        return `${name}: Amazon reported ${reported}, returned ${detail.rawCount}, usable ${detail.readableCount}, duplicate IDs ${detail.duplicateCount}`;
      }).join('; ');
      const scope = fullRescan ? 'Full rescan complete' : `Quick update added ${items.length} Kindle item${items.length === 1 ? '' : 's'}`;
      status.textContent = `${scope}. ${response.bookCount} Kindle item${response.bookCount === 1 ? '' : 's'} stored locally. ${categoryDetails}.`;
    } catch (error) {
      await globalThis.GalacticSync.failed('kindle',error);
      status.textContent = `Kindle import failed: ${error.message}`;
    } finally {
      setSyncButtonsDisabled(false);
      comicContentsButton.disabled = false;
      delete status.dataset.busy;
    }
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function isTransientAmazonError(error) {
    return /\b(?:429|500|502|503|504)\b|failed to fetch|network(?:\s|$)|timed out/iu.test(String(error?.message ?? error));
  }

  function errorLabel(error) {
    return String(error?.message ?? error).replace(/\s+/gu, ' ').trim().slice(0, 180) || 'Unknown error';
  }

  async function fetchComicContentsWithRetry(candidate, position, total, timing) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if(timing)timing.attempts=attempt+1;
      let attemptEnd=timing?.begin('attempt',attempt+1);
      activeContentsRequest = new AbortController();
      const controller = activeContentsRequest;
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        return await globalThis.GalacticKindle.fetchKindleProductComicContents(candidate.detailUrl, {signal:controller.signal,timing});
      } catch (error) {
        lastError = controller.signal.aborted && !pauseComicContentsRequested ? new Error('Network request timed out while loading Kindle contents.') : error;
        if (!isTransientAmazonError(lastError) || attempt === 2 || pauseComicContentsRequested) break;
        attemptEnd?.();attemptEnd=null;
        const delay = 2000 * (attempt + 1);
        status.textContent = `Amazon temporarily rejected Kindle page ${position}/${total}; retrying in ${delay / 1000}s...`;
        const retryEnd=timing?.begin('retry_wait',attempt+1);
        await wait(delay);retryEnd?.();
      } finally {
        attemptEnd?.();clearTimeout(timeout);activeContentsRequest = null;
      }
      if (pauseComicContentsRequested) break;
    }
    throw lastError;
  }

  async function enrichComicContents() {
    if (comicContentsRunning) return;
    comicContentsRunning=true;pauseComicContentsRequested=false;
    setSyncButtonsDisabled(true);comicContentsButton.disabled=true;
    pauseComicContentsButton.hidden=false;pauseComicContentsButton.disabled=false;contentsMode.disabled=true;
    status.dataset.busy='true';
    const buffer=globalThis.GalacticContentsScan.checkpointBuffer();
    const progress={runRef:crypto.randomUUID(),phase:'preparing',mode:contentsMode.value,checked:0,total:0,found:0,empty:0,unavailable:0,failures:0,reparsed:0,durable:0,buffered:0};
    let matched=0,noStatement=0,unavailable=0,errors=0,attempted=0,saved=0,reparsed=0,stoppedError='',checkpointError=null;
    const errorCounts=new Map();
    const publish=phase=>{
      Object.assign(progress,{phase,checked:attempted,found:matched,empty:noStatement,unavailable,failures:errors,reparsed,buffered:buffer.size});
      globalThis.GalacticSync.send({type:'KINDLE_CONTENTS_SCAN_PROGRESS',progress:{...progress}}).catch(()=>{});
    };
    async function flush(timing=null) {
      if(!buffer.size)return;
      publish('checkpointing');
      const checkpointTiming=timing??beginTiming('checkpoint');
      if(checkpointTiming)checkpointTiming.batchSize=buffer.size;
      try {
        const count=await buffer.flush(async entries=>{
          const response=await diagnosticSend({type:'SAVE_KINDLE_COMIC_CONTENTS',entries},checkpointTiming,'save_message');
          if(!response?.ok)throw Error(response?.error??'Could not save the Kindle contents checkpoint.');
        });
        progress.durable+=count;checkpointError=null;
      } catch(error){checkpointError=error;throw error;}
      finally {if(!timing)finishTiming(checkpointTiming,checkpointError?'failed':'checkpointed');}
      publish('running');
    }
    publish('preparing');
    try {
      closePending();
      const preparation=beginTiming('prepare');
      const response=await diagnosticSend({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:contentsMode.value},preparation,'queue_prepare');
      finishTiming(preparation,response?.ok?'prepared':'failed');
      if(!response?.ok)throw Error(response?.error??'Could not prepare Kindle contents discovery.');
      const candidates=response.candidates??[],reprocess=response.reprocess??[];
      progress.total=candidates.length;publish('running');
      for(let offset=0;offset<reprocess.length&&!pauseComicContentsRequested;offset+=100){
        const timing=beginTiming('reparse'),batch=reprocess.slice(offset,offset+100);
        if(timing)timing.batchSize=batch.length;
        const uiEnd=timing?.begin('page_ui');
        status.textContent=`Reprocessing saved contents locally: ${reparsed}/${reprocess.length}. No Amazon requests needed.`;uiEnd?.();
        const result=await diagnosticSend({type:'REPARSE_KINDLE_CONTENTS',entries:batch.map(item=>({itemId:item.id,recordRef:item.recordRef}))},timing,'request_dispatch');
        finishTiming(timing,result?.ok?'reparsed':'failed');
        if(!result?.ok)throw Error(result?.error??'Could not reprocess saved contents.');
        reparsed+=batch.length;publish('running');
      }
      if(!candidates.length){
        status.textContent=`${reparsed}/${reprocess.length} saved statements reprocessed locally. ${pauseComicContentsRequested?'Paused; run this mode again to finish.':'No pages need checking in this mode.'} ${response.eligible??0} books are eligible; use Rescan to revisit saved results.`;
        return;
      }
      for(const candidate of candidates){
        if(pauseComicContentsRequested)break;
        closePending();
        const timing=beginTiming('network');let resultCategory='failed';
        const initialUiEnd=timing?.begin('page_ui');attempted++;
        status.textContent=`Contents discovery: ${attempted}/${candidates.length} pages; ${matched} contents found; ${noStatement} no contents found; ${errors} failed; ${candidates.length-attempted} remaining. ${candidate.title}`;
        initialUiEnd?.();
        try {
          const contents=await fetchComicContentsWithRetry(candidate,attempted,candidates.length,timing);
          resultCategory=contents.availability;
          buffer.add({itemId:candidate.id,recordRef:candidate.recordRef,...contents});
          if(contents.availability==='unavailable')unavailable++;
          else if(contents.statement)matched++;else noStatement++;
          saved++;
          if(buffer.due())await flush(timing);
        } catch(error){
          if(checkpointError){stoppedError=errorLabel(error);finishTiming(timing,'save-failure');break;}
          if(pauseComicContentsRequested){attempted--;finishTiming(timing,'paused');break;}
          resultCategory=/CAPTCHA/iu.test(error.message)?'captcha':/sign in/iu.test(error.message)?'sign-in':'temporary-failure';errors++;
          buffer.add({itemId:candidate.id,recordRef:candidate.recordRef,sourceUrl:candidate.detailUrl,statement:'',availability:'temporary-failure',extractorVersion:globalThis.GalacticKindle.contentsExtractorVersion,failureCode:/CAPTCHA/iu.test(error.message)?'captcha':/sign in/iu.test(error.message)?'sign-in':/returned \d{3}/iu.test(error.message)?'http':'network'});
          const label=errorLabel(error);errorCounts.set(label,(errorCounts.get(label)??0)+1);
          try {if(buffer.due()||/CAPTCHA|sign in/iu.test(error.message))await flush(timing);}
          catch(saveError){stoppedError=errorLabel(saveError);finishTiming(timing,'save-failure');break;}
          if(/CAPTCHA|sign in/iu.test(error.message)){stoppedError=label;finishTiming(timing,resultCategory);break;}
        }
        publish('running');
        if(!pauseComicContentsRequested){const throttleEnd=timing?.begin('throttle');await wait(1000);throttleEnd?.();}
        if(timing){timing.result=resultCategory;pendingTiming=timing;}
      }
      await flush(pendingTiming);
      const stopText=stoppedError?` Stopped: ${stoppedError}`:pauseComicContentsRequested?' Paused; Scan eligible books resumes incomplete checks.':'';
      const errorText=errors?` Error breakdown: ${[...errorCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([label,count])=>`${label} (${count})`).join('; ')}.`:'';
      status.textContent=`Contents discovery: ${attempted}/${candidates.length} pages checked; ${matched} contents found; ${noStatement} no contents found; ${errors} failed/retryable; ${candidates.length-attempted} remaining. ${reparsed} statements reprocessed locally.${saved?'':' No new page result saved.'}${unavailable?` ${unavailable} pages unavailable; Rescan can revisit them.`:''}${errorText}${stopText}`;
    } catch(error){stoppedError=errorLabel(error);status.textContent=`Kindle contents discovery stopped: ${error.message}`;}
    finally {
      // Pause, handled errors and normal completion always drain the tail.
      // A hard tab/browser crash can repeat at most 20 unacknowledged results.
      try{await flush(pendingTiming);}catch(error){stoppedError=errorLabel(error);status.textContent=`Kindle contents save failed: ${error.message}. ${buffer.size} unsaved results may need checking again.`;}
      closePending();publish(stoppedError?'stopped':pauseComicContentsRequested?'paused':'completed');
      comicContentsRunning=false;pauseComicContentsButton.hidden=true;
      setSyncButtonsDisabled(false);comicContentsButton.disabled=false;contentsMode.disabled=false;delete status.dataset.busy;
    }
  }

  syncButtons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  comicContentsButton.addEventListener('click', () => enrichComicContents());
  pauseComicContentsButton.addEventListener('click', () => {
    pauseComicContentsRequested = true;
    activeContentsRequest?.abort();
    pauseComicContentsButton.disabled = true;
    status.textContent = 'Pausing contents discovery; saved progress is kept...';
  });
  globalThis.GalacticFloatingPanel?.attach(shadow, 'kindle');
  document.documentElement.append(host);
}());
