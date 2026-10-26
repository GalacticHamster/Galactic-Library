(function attachFandangoAtHomeSync() {
  'use strict';
  if (document.querySelector('#galactic-library-fandango-at-home-importer') || !globalThis.GalacticFandangoAtHome) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-fandango-at-home-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:var(--gh-text);';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>.panel { background:var(--gh-surface); border:1px solid var(--gh-border); border-radius:8px; box-shadow:var(--gh-shadow); padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:var(--gh-accent); color:var(--gh-on-accent); cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:var(--gh-text); margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }</style>
    <div class="panel"><p><strong>Galactic Library</strong><br><strong>Quick update</strong> reads Fandango's newest-first Recently Purchased View All grids until it reaches known titles. <strong>Full rescan</strong> checks every card against Fandango's reported movie and TV counts.</p><button type="button" data-mode="incremental">Quick update</button> <button type="button" data-mode="full">Full rescan</button><details><summary>Scan diagnostics</summary><p>Check the movie listing without importing. From My Library, this opens Movies View All and scrolls through its cards. The report contains counts and page structure, with no titles, product IDs or account information.</p><button type="button" data-check-listing>Check movie listing (no import)</button> <button type="button" data-export-report disabled>Export scan report</button></details><p class="status" role="status"></p></div>`;
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const checkButton=shadow.querySelector('[data-check-listing]'),exportButton=shadow.querySelector('[data-export-report]');
  const diagnosticKey='galactic-library-fandango-listing-check';
  let diagnosticReport=null;
  const status = shadow.querySelector('.status');

  function busy(value) {
    buttons.forEach((button) => { button.disabled = value; });
    checkButton.disabled=value;
    exportButton.disabled=value||!diagnosticReport;
    if (value) status.dataset.busy = 'true';
    else delete status.dataset.busy;
  }

  function routeFor(value) {
    try {
      const url = new URL(value, globalThis.location.origin);
      return `${url.origin}${url.pathname.replace(/\/+$/u, '')}`;
    } catch {
      return '';
    }
  }

  async function checkListing(expected={movies:null,tv:null}){
    busy(true);diagnosticReport=null;exportButton.disabled=true;
    status.textContent='Checking Fandango movie listing. No library data will change...';
    try{
      diagnosticReport=await globalThis.GalacticFandangoAtHome.inspectFandangoListing(({count})=>{
        status.textContent=`Checking Fandango movie listing: ${count} titles found. No library data will change...`;
      },expected);
      status.textContent=diagnosticReport.traversalFinished
        ?'Listing check finished. No library data changed. Export the scan report so the movie-count difference can be investigated.'
        :'The listing check could not finish. No library data changed. Export the scan report to share the result.';
    }catch{status.textContent='The listing check could not start. No library data changed. Reload My Library and try the read-only check again.';}
    finally{busy(false);}
  }
  checkButton.addEventListener('click',async()=>{
    const api=globalThis.GalacticFandangoAtHome,expected=api.expectedFandangoCountsFromDocument(document);
    const movie=api.viewAllLibraryLinksFromDocument(document).find(link=>link.mediaType==='movie');
    if(/\/content\/browse\/mylibrary\b/iu.test(location.pathname)&&movie){
      try{
        const url=new URL(movie.url,location.origin);
        if(url.origin!==location.origin||!url.pathname.startsWith('/content/browse/')||routeFor(url.href)===routeFor(location.href))throw Error('Invalid listing destination');
        sessionStorage.setItem(diagnosticKey,JSON.stringify({expected,route:routeFor(url.href),startedAt:Date.now()}));
        busy(true);status.textContent='Opening Movies View All for a read-only check. No library data will change...';
        location.assign(url.href);
      }catch{status.textContent='Could not open the read-only check. Open Movies View All and choose Check movie listing (no import). No library data changed.';busy(false);}
      return;
    }
    await checkListing(expected);
  });
  exportButton.addEventListener('click',()=>{
    if(!diagnosticReport)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(diagnosticReport,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='GL-fandango-listing-check.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });

  async function importState(action, state) {
    const response = await globalThis.GalacticSync.send({ type: 'FANDANGO_IMPORT_STATE', action, state });
    if (!response?.ok) throw new Error(response?.error ?? 'Could not keep the Fandango import in this browser tab.');
    return response.state ?? null;
  }

  function countsFor(items) {
    const movies = items.filter((item) => item.mediaType === 'movie').length;
    return { movies, tv: items.length - movies };
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function validatedItems(items, expected) {
    const uniqueItems = [...new Map(items.map((item) => [`${item.mediaType}:${item.providerItemId}`, item])).values()];
    const counts = countsFor(uniqueItems);
    if ((expected.movies !== null && counts.movies !== expected.movies) || (expected.tv !== null && counts.tv !== expected.tv)) {
      throw new Error(`Fandango reported ${expected.movies ?? 'unknown'} movies and ${expected.tv ?? 'unknown'} TV shows, but the scan read ${counts.movies} movies and ${counts.tv} TV shows. No library changes were saved.`);
    }
    return uniqueItems;
  }

  async function saveItems(items, expected, fullRescan) {
    const snapshot = fullRescan ? globalThis.GalacticProviderSnapshot.completeProviderSnapshot('fandango-at-home', items, [
      globalThis.GalacticProviderSnapshot.completedScope('movie', items.filter((item) => item.mediaType === 'movie').length, expected.movies, 'reported-count'),
      globalThis.GalacticProviderSnapshot.completedScope('tv', items.filter((item) => item.mediaType === 'tv').length, expected.tv, 'reported-count')
    ]) : undefined;
    status.textContent = items.length ? `Saving ${items.length} Fandango at Home title${items.length === 1 ? '' : 's'} locally...` : 'No new Fandango at Home titles; recording the completed check...';
    const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'fandango-at-home', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
    if (!response?.ok) throw new Error(response?.error ?? 'Fandango at Home import did not complete.');
    if (fullRescan) {
      status.textContent = `Saved ${response.movieCount} Fandango at Home movies and ${response.tvCount} TV shows locally. Fandango reported ${expected.movies ?? 'unknown'} movies and ${expected.tv ?? 'unknown'} TV shows.`;
      return;
    }
    status.textContent = `Quick update added ${items.length} Fandango at Home title${items.length === 1 ? '' : 's'}. ${response.movieCount} movies and ${response.tvCount} TV shows stored locally.`;
  }

  async function startFromMyLibrary(fullRescan, knownItemIds) {
    if (!/\/content\/browse\/mylibrary\b/iu.test(globalThis.location.pathname)) throw new Error('Open Fandango at Home My Library before syncing.');
    let expected = { movies: null, tv: null };
    let grids = [];
    // Returning from a View All page can finish before My Library's React
    // content has rendered. Wait for both grids so an automatic quick update
    // does not mistake the loading state for a missing View All feature.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expected = globalThis.GalacticFandangoAtHome.expectedFandangoCountsFromDocument(document);
      grids = globalThis.GalacticFandangoAtHome.viewAllLibraryLinksFromDocument(document);
      if (grids.some((grid) => grid.mediaType === 'movie') && grids.some((grid) => grid.mediaType === 'tv')) break;
      if (attempt === 0) status.textContent = 'Waiting for Fandango My Library to finish loading...';
      await wait(500);
    }
    const movieUrl = grids.find((grid) => grid.mediaType === 'movie')?.url;
    const tvUrl = grids.find((grid) => grid.mediaType === 'tv')?.url;
    if (fullRescan && (expected.movies === null || expected.tv === null)) throw new Error('Fandango did not expose both library totals. No full replacement was saved.');
    if (movieUrl && tvUrl) {
      await importState('set', { phase: 'movie', expected, urls: { movie: movieUrl, tv: tvUrl }, items: [], fullRescan, knownItemIds: fullRescan ? [] : knownItemIds });
      status.textContent = 'Opening Fandango Movies View All grid...';
      globalThis.location.assign(movieUrl);
      return;
    }
    if (!fullRescan) throw new Error('Quick update requires Fandango View All grids. Choose Full rescan on My Library.');
    const { items } = await globalThis.GalacticFandangoAtHome.fetchFandangoLibrary(({ phase, passes, movies, tv, expected: reported }) => {
      if (phase === 'reset') {
        status.textContent = `Returning Fandango carousels to their first titles: ${passes} passes checked.`;
        return;
      }
      const target = reported.movies !== null || reported.tv !== null ? ` / Fandango reports ${reported.movies ?? '?'} movies and ${reported.tv ?? '?'} TV shows` : '';
      status.textContent = `Reading Fandango at Home library: ${passes} scan passes checked; ${movies} movies and ${tv} TV titles found${target}.`;
    });
    await saveItems(items, expected, true);
  }

  async function resumeGridImport(state) {
    const section = state.phase;
    const fullRescan = state.fullRescan !== false;
    const expectedCount = fullRescan ? (section === 'movie' ? state.expected.movies : state.expected.tv) : null;
    busy(true);
    try {
      const gridItems = await globalThis.GalacticFandangoAtHome.readFandangoGrid(section, expectedCount, ({ passes, count }) => {
        status.textContent = `Reading Fandango ${section === 'movie' ? 'Movies' : 'TV Shows'} View All grid: ${count}${expectedCount === null ? '' : ` / ${expectedCount}`} titles found (${passes} passes).`;
      }, fullRescan ? null : state.knownItemIds ?? []);
      if (expectedCount !== null && gridItems.length !== expectedCount) {
        throw new Error(`Fandango reported ${expectedCount} ${section === 'movie' ? 'movies' : 'TV shows'}, but its View All grid yielded ${gridItems.length}. No library changes were saved.`);
      }
      const items = [...(state.items ?? []), ...gridItems];
      if (section === 'movie') {
        await importState('set', { ...state, phase: 'tv', items });
        status.textContent = 'Opening Fandango TV Shows View All grid...';
        globalThis.location.assign(state.urls.tv);
        return;
      }
      const completeItems = fullRescan ? validatedItems(items, state.expected) : validatedItems(items, { movies: null, tv: null });
      await saveItems(completeItems, state.expected, fullRescan);
      await importState('clear');
    } catch (error) {
      await globalThis.GalacticSync.failed('fandango-at-home',error);
      await importState('clear').catch(() => {});
      status.textContent = `Fandango at Home import failed: ${error.message}`;
    } finally {
      busy(false);
    }
  }

  async function sync(mode) {
    busy(true);
    try {
      // View All is where a completed scan leaves the user. Validate the saved
      // account through the normal admission path before persisting navigation;
      // an unchecked (hidden) confirmation control is valid for remembered use.
      const state = await globalThis.GalacticSync.send({ type: 'GET_PROVIDER_SYNC_STATE', provider: 'fandango-at-home' });
      if (!state?.ok) throw new Error(state?.error ?? 'Could not read the local Fandango at Home sync state.');
      if (!/\/content\/browse\/mylibrary\b/iu.test(globalThis.location.pathname)) {
        await importState('set', { phase: 'start', mode });
        status.textContent = 'Returning to Fandango My Library to start the sync...';
        globalThis.location.assign('/content/browse/mylibrary');
        return;
      }
      const fullRescan = mode === 'full' || !state.hasFullBaseline;
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Fandango at Home baseline yet; reading every title once…';
      await importState('clear');
      await startFromMyLibrary(fullRescan, state.syncState?.knownProviderItemIds ?? []);
    } catch (error) {
      await globalThis.GalacticSync.failed('fandango-at-home',error);
      status.textContent = `Fandango at Home import failed: ${error.message}`;
      busy(false);
    }
  }
  buttons.forEach((button) => button.addEventListener('click', () => sync(button.dataset.mode)));

  globalThis.GalacticFloatingPanel?.attach(shadow, 'fandango-at-home');
  document.documentElement.append(host);
  // A troubleshooting navigation carries counts only, never import authority,
  // items, account details or a scan token. Consume it before ordinary resume.
  let diagnostic;
  try{
    const pending=JSON.parse(sessionStorage.getItem(diagnosticKey)??'null');
    if(pending&&pending.route===routeFor(location.href)&&Number.isFinite(pending.startedAt)&&Date.now()-pending.startedAt>=0&&Date.now()-pending.startedAt<10*60*1000&&['movies','tv'].every(k=>pending.expected?.[k]===null||Number.isInteger(pending.expected?.[k])&&pending.expected[k]>=0&&pending.expected[k]<=50000))diagnostic=pending;
    sessionStorage.removeItem(diagnosticKey);
  }catch{}
  if(diagnostic){shadow.querySelector('details').open=true;checkListing(diagnostic.expected);return;}
  importState('get').then((state) => {
    if (!state) return;
    if (state.phase === 'start' && /\/content\/browse\/mylibrary\b/iu.test(globalThis.location.pathname)) {
      sync(state.mode);
      return;
    }
    if (['movie', 'tv'].includes(state.phase) && routeFor(state.urls?.[state.phase]) === routeFor(globalThis.location.href)) resumeGridImport(state);
  }).catch(() => {});
}());
