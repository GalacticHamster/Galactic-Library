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
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads the newest Kindle pages until it reaches a page already in your local baseline. <strong>Full rescan</strong> rebuilds the Kindle snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p><label>Contents discovery <select data-contents-mode><option value="scan">Scan eligible books</option><option value="retry">Retry incomplete checks</option><option value="rescan">Rescan previous results</option><option value="reparse">Reparse saved text (no requests)</option></select></label></p><p><button type="button" data-action="comic-contents">Find contents</button> <button type="button" data-action="pause-comic-contents" hidden>Pause</button></p><details><summary>How contents discovery works</summary><p>Any synced Kindle book with a supported Amazon product page can be checked. Likely collections come first. Scanning uses your signed-in tab, saves collection statements as suggestions, and reprocesses older saved text locally. No contents found means this check found no useful statement; it does not prove the book contains nothing.</p><p>Normal scans skip current results and known unavailable pages. Retry revisits incomplete checks; Rescan revisits previous results too. Reparse saved text makes no requests. Pause keeps saved progress; a normal scan resumes unfinished checks.</p><p>In Book information, open Details and Review included contents to check proposals before saving verified contents. Names, numbers, run, language and full/excerpt scope need review. Discovered names do not match other library titles or confirm purchases.</p></details><p class="status" role="status"></p></div>`;
  const syncButtons = [...shadow.querySelectorAll('button[data-mode]')];
  const comicContentsButton = shadow.querySelector('button[data-action="comic-contents"]');
  const pauseComicContentsButton = shadow.querySelector('button[data-action="pause-comic-contents"]');
  const status = shadow.querySelector('.status');
  const contentsMode = shadow.querySelector('[data-contents-mode]');
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

  async function fetchComicContentsWithRetry(candidate, position, total) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      activeContentsRequest = new AbortController();
      const controller = activeContentsRequest;
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        return await globalThis.GalacticKindle.fetchKindleProductComicContents(candidate.detailUrl, {signal:controller.signal});
      } catch (error) {
        lastError = controller.signal.aborted && !pauseComicContentsRequested ? new Error('Network request timed out while loading Kindle contents.') : error;
        if (!isTransientAmazonError(lastError) || attempt === 2 || pauseComicContentsRequested) break;
        const delay = 2000 * (attempt + 1);
        status.textContent = `Amazon temporarily rejected Kindle page ${position}/${total}; retrying in ${delay / 1000}s...`;
        await wait(delay);
      } finally {
        clearTimeout(timeout);activeContentsRequest = null;
      }
      if (pauseComicContentsRequested) break;
    }
    throw lastError;
  }

  async function enrichComicContents() {
    if (comicContentsRunning) return;
    comicContentsRunning = true;
    pauseComicContentsRequested = false;
    setSyncButtonsDisabled(true);
    comicContentsButton.disabled = true;
    pauseComicContentsButton.hidden = false;
    pauseComicContentsButton.disabled = false;
    contentsMode.disabled = true;
    status.dataset.busy = 'true';
    try {
      const candidateResponse = await globalThis.GalacticSync.send({ type: 'GET_KINDLE_COMIC_CONTENT_CANDIDATES', mode:contentsMode.value });
      if (!candidateResponse?.ok) throw new Error(candidateResponse?.error ?? 'Could not prepare Kindle contents discovery.');
      const candidates = candidateResponse.candidates ?? [];
      const reprocess = candidateResponse.reprocess ?? [];
      let reparsed = 0;
      for (let offset = 0; offset < reprocess.length && !pauseComicContentsRequested; offset += 100) {
        const batch = reprocess.slice(offset,offset+100);
        status.textContent = `Reprocessing saved contents locally: ${reparsed}/${reprocess.length}. No Amazon requests needed.`;
        const response = await globalThis.GalacticSync.send({type:'REPARSE_KINDLE_CONTENTS',entries:batch.map(item=>({itemId:item.id,recordRef:item.recordRef}))});
        if (!response?.ok) throw new Error(response?.error ?? 'Could not reprocess saved contents.');
        reparsed += batch.length;
      }
      if (!candidates.length) {
        status.textContent = `${reparsed}/${reprocess.length} saved statements reprocessed locally. ${pauseComicContentsRequested ? 'Paused; run this mode again to finish.' : 'No pages need checking in this mode.'} ${candidateResponse.eligible ?? 0} books are eligible; use Rescan to revisit saved results.`;
        return;
      }
      let matched = 0;
      let noStatement = 0;
      let unavailable = 0;
      let errors = 0;
      let attempted = 0;
      let saved = 0;
      let stoppedError = '';
      const errorCounts = new Map();
      for (const candidate of candidates) {
        if (pauseComicContentsRequested) break;
        attempted += 1;
        status.textContent = `Contents discovery: ${attempted}/${candidates.length} pages; ${matched} contents found; ${noStatement} no contents found; ${errors} failed; ${candidates.length-attempted} remaining. ${candidate.title}`;
        try {
          const contents = await fetchComicContentsWithRetry(candidate, attempted, candidates.length);
          const saveResponse = await globalThis.GalacticSync.send({ type: 'SAVE_KINDLE_COMIC_CONTENTS', entries: [{ itemId: candidate.id, recordRef:candidate.recordRef,...contents }] });
          if (!saveResponse?.ok) throw new Error(saveResponse?.error ?? 'Could not save the Kindle product-page result.');
          if (contents.availability === 'unavailable') unavailable += 1;
          else if (contents.statement) matched += 1;
          else noStatement += 1;
          saved += 1;
        } catch (error) {
          if (pauseComicContentsRequested) {attempted--;break;}
          errors += 1;
          const failureResponse = await globalThis.GalacticSync.send({type:'SAVE_KINDLE_COMIC_CONTENTS',entries:[{itemId:candidate.id,recordRef:candidate.recordRef,sourceUrl:candidate.detailUrl,statement:'',availability:'temporary-failure',extractorVersion:globalThis.GalacticKindle.contentsExtractorVersion,failureCode:/CAPTCHA/iu.test(error.message)?'captcha':/sign in/iu.test(error.message)?'sign-in':/returned \d{3}/iu.test(error.message)?'http':'network'}]}).catch(()=>null);
          const label = errorLabel(error);
          errorCounts.set(label, (errorCounts.get(label) ?? 0) + 1);
          if (!failureResponse?.ok || /CAPTCHA|sign in/iu.test(error.message)) {
            stoppedError = label;
            break;
          }
        }
        if (!pauseComicContentsRequested) await wait(1000);
      }
      const stopText = stoppedError ? ` Stopped: ${stoppedError}` : pauseComicContentsRequested ? ' Paused; Scan eligible books resumes incomplete checks.' : '';
      const errorText = errors
        ? ` Error breakdown: ${[...errorCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4).map(([label, count]) => `${label} (${count})`).join('; ')}.`
        : '';
      const unavailableText = unavailable ? ` ${unavailable} pages unavailable; Rescan can revisit them.` : '';
      status.textContent = `Contents discovery: ${attempted}/${candidates.length} pages checked; ${matched} contents found; ${noStatement} no contents found; ${errors} failed/retryable; ${candidates.length-attempted} remaining. ${reparsed} statements reprocessed locally.${saved ? '' : ' No new page result saved.'}${unavailableText}${errorText}${stopText}`;
    } catch (error) {
      status.textContent = `Kindle contents discovery stopped: ${error.message}`;
    } finally {
      comicContentsRunning = false;
      pauseComicContentsButton.hidden = true;
      setSyncButtonsDisabled(false);
      comicContentsButton.disabled = false;
      contentsMode.disabled = false;
      delete status.dataset.busy;
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
