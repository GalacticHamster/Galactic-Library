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
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads the newest Kindle pages until it reaches a page already in your local baseline. <strong>Full rescan</strong> rebuilds the Kindle snapshot.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><p><button type="button" data-action="comic-contents">Find contained issues</button> <button type="button" data-action="pause-comic-contents" hidden>Pause</button></p><p class="status" role="status"></p></div>`;
  const syncButtons = [...shadow.querySelectorAll('button[data-mode]')];
  const comicContentsButton = shadow.querySelector('button[data-action="comic-contents"]');
  const pauseComicContentsButton = shadow.querySelector('button[data-action="pause-comic-contents"]');
  const status = shadow.querySelector('.status');
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
      const state = await chrome.runtime.sendMessage({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'kindle' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Kindle sync state.');
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Kindle baseline yet; reading every library page once…';
      const { items, diagnostics } = await globalThis.GalacticKindle.fetchKindleBooks(({ pagesRead, books, categoryCounts }) => {
        const documents = categoryCounts?.['personal-documents'] ?? 0;
        status.textContent = `Reading Kindle library: ${pagesRead} page${pagesRead === 1 ? '' : 's'} checked; ${books} items found (${documents} personal document${documents === 1 ? '' : 's'}).`;
      }, fullRescan ? null : state.syncState?.knownProviderItemIds ?? []);
      status.textContent = items.length ? `Saving ${items.length} Kindle item${items.length === 1 ? '' : 's'} locally...` : 'No new Kindle items; recording the completed check...';
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kindle', mode: fullRescan ? 'full' : 'incremental', items });
      if (!response?.ok) throw new Error(response?.error ?? 'Kindle import did not complete.');
      const categoryDetails = Object.entries(diagnostics).map(([category, detail]) => {
        const name = category === 'books' ? 'Books' : 'Personal Documents';
        const reported = detail.reportedCount === null ? 'unknown' : detail.reportedCount;
        return `${name}: Amazon reported ${reported}, returned ${detail.rawCount}, usable ${detail.readableCount}, duplicate IDs ${detail.duplicateCount}`;
      }).join('; ');
      const scope = fullRescan ? 'Full rescan complete' : `Quick update added ${items.length} Kindle item${items.length === 1 ? '' : 's'}`;
      status.textContent = `${scope}. ${response.bookCount} Kindle item${response.bookCount === 1 ? '' : 's'} stored locally. ${categoryDetails}.`;
    } catch (error) {
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
    return /\b(?:429|500|502|503|504)\b|failed to fetch|network(?:\s|$)/iu.test(String(error?.message ?? error));
  }

  function errorLabel(error) {
    return String(error?.message ?? error).replace(/\s+/gu, ' ').trim().slice(0, 180) || 'Unknown error';
  }

  async function fetchComicContentsWithRetry(candidate, position, total) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await globalThis.GalacticKindle.fetchKindleProductComicContents(candidate.detailUrl);
      } catch (error) {
        lastError = error;
        if (!isTransientAmazonError(error) || attempt === 2 || pauseComicContentsRequested) break;
        const delay = 2000 * (attempt + 1);
        status.textContent = `Amazon temporarily rejected Kindle comic product ${position}/${total}; retrying in ${delay / 1000}s...`;
        await wait(delay);
      }
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
    status.dataset.busy = 'true';
    try {
      const candidateResponse = await chrome.runtime.sendMessage({ type: 'GET_KINDLE_COMIC_CONTENT_CANDIDATES' });
      if (!candidateResponse?.ok) throw new Error(candidateResponse?.error ?? 'Could not load confirmed Kindle comic candidates.');
      const candidates = candidateResponse.candidates ?? [];
      if (!candidates.length) {
        status.textContent = 'No unscanned confirmed Kindle comic/manga candidates remain.';
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
        status.textContent = `Reading Kindle comic product ${attempted}/${candidates.length}: ${candidate.title}`;
        try {
          const contents = await fetchComicContentsWithRetry(candidate, attempted, candidates.length);
          const saveResponse = await chrome.runtime.sendMessage({ type: 'SAVE_KINDLE_COMIC_CONTENTS', entries: [{ itemId: candidate.id, sourceUrl: contents.sourceUrl, statement: contents.statement, availability: contents.availability }] });
          if (!saveResponse?.ok) throw new Error(saveResponse?.error ?? 'Could not save the Kindle product-page result.');
          if (contents.availability === 'unavailable') unavailable += 1;
          else if (contents.statement) matched += 1;
          else noStatement += 1;
          saved += 1;
        } catch (error) {
          errors += 1;
          const label = errorLabel(error);
          errorCounts.set(label, (errorCounts.get(label) ?? 0) + 1);
          if (/CAPTCHA/iu.test(error.message)) {
            stoppedError = label;
            break;
          }
        }
        if (!pauseComicContentsRequested) await wait(1000);
      }
      const stopText = stoppedError ? ` Stopped: ${stoppedError}` : pauseComicContentsRequested ? ' Paused; completed pages will not be re-read.' : '';
      const errorText = errors
        ? ` Error breakdown: ${[...errorCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4).map(([label, count]) => `${label} (${count})`).join('; ')}.`
        : '';
      const unavailableText = unavailable ? ` ${unavailable} product page${unavailable === 1 ? ' was' : 's were'} unavailable on Amazon (404) and marked complete.` : '';
      status.textContent = `Kindle comic contents: ${attempted}/${candidates.length} pages attempted; ${matched} explicit Collects statement${matched === 1 ? '' : 's'} saved; ${noStatement} pages had none; ${errors} error${errors === 1 ? '' : 's'}.${saved ? '' : ' No product-page result was saved.'}${unavailableText}${errorText}${stopText}`;
    } catch (error) {
      status.textContent = `Kindle comic contents failed: ${error.message}`;
    } finally {
      comicContentsRunning = false;
      pauseComicContentsButton.hidden = true;
      setSyncButtonsDisabled(false);
      comicContentsButton.disabled = false;
      delete status.dataset.busy;
    }
  }

  syncButtons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));
  comicContentsButton.addEventListener('click', () => enrichComicContents());
  pauseComicContentsButton.addEventListener('click', () => {
    pauseComicContentsRequested = true;
    pauseComicContentsButton.disabled = true;
    status.textContent = 'Pausing after the current Kindle product page...';
  });
  globalThis.GalacticFloatingPanel?.attach(shadow);
  document.documentElement.append(host);
}());
