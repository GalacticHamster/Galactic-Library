(function attachFandangoAtHomeSync() {
  'use strict';
  if (document.querySelector('#galactic-library-fandango-at-home-importer') || !globalThis.GalacticFandangoAtHome) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-fandango-at-home-importer';

  const shadow = host.attachShadow({ mode: 'closed' });
  globalThis.GalacticFloatingPanel.render(shadow,'fandango-at-home',{onImport:sync,diagnostics:"<details data-scan-diagnostics><summary>Scan diagnostics</summary><p>Export the last import report, or check the movie listing without importing. From My Library, this opens Movies View All and scrolls through its cards. The report contains counts and page structure, with no titles, product IDs or account information.</p><button type=\"button\" data-check-listing>Check movie listing (no import)</button> <button type=\"button\" data-export-report disabled>Export scan report</button></details>"});
  const buttons = [...shadow.querySelectorAll('button[data-mode]')];
  const checkButton=shadow.querySelector('[data-check-listing]'),exportButton=shadow.querySelector('[data-export-report]');
  const diagnosticKey='galactic-library-fandango-listing-check';
  const importDiagnosticKey='galactic-library-fandango-import-diagnostics';
  // This tab-local aggregate report carries no scan authority or item data.
  function savedImportDiagnostics(){
    try{
      const raw=JSON.parse(sessionStorage.getItem(importDiagnosticKey)??'null');
      if(raw?.kind!=='import'||raw.provider!=='fandango-at-home')return null;
      const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;
      const report={format:1,provider:'fandango-at-home',kind:'import',requestedMode:raw.requestedMode==='full'?'full':'incremental',effectiveMode:['quick','full'].includes(raw.effectiveMode)?raw.effectiveMode:null,outcome:['starting','reading','saving','success','partial','failed'].includes(raw.outcome)?raw.outcome:'failed',submittedRecords:number(raw.submittedRecords),acknowledgedRecords:number(raw.acknowledgedRecords),sections:[]};
      for(const key of ['storedMovies','storedTv','saveElapsedMs'])report[key]=number(raw[key]);
      for(const s of (Array.isArray(raw.sections)?raw.sections:[]).slice(0,2)){
        if(!['movie','tv'].includes(s.section))continue;
        const d={section:s.section,terminationReason:['known-group','empty-timeout','stable-bottom','scan-limit','interrupted'].includes(s.terminationReason)?s.terminationReason:null,incomplete:s.incomplete===true};
        for(const key of ['passes','scrollIterations','tilesInspected','parsedObservations','duplicateObservations','rejectedObservations','uniqueParsed','knownMatches','newTitles','unresolvedTitles','failedItems','elapsedMs'])d[key]=number(s[key]);
        d.rejectionReasons=Object.fromEntries(['missingTitle','invalidCard','conflict'].map(k=>[k,number(s.rejectionReasons?.[k])]));report.sections.push(d);
      }
      return report;
    }catch{return null;}
  }
  let diagnosticReport=savedImportDiagnostics();
  exportButton.disabled=!diagnosticReport;
  function recordImport(patch){
    diagnosticReport={...(savedImportDiagnostics()??{format:1,provider:'fandango-at-home',kind:'import',sections:[]}),...patch};
    try{sessionStorage.setItem(importDiagnosticKey,JSON.stringify(diagnosticReport));}catch{}
  }
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

  async function saveItems(items, expected, fullRescan, sections = []) {
    const incomplete = sections.some(section=>section.incomplete);
    recordImport({outcome:'saving',submittedRecords:items.length,acknowledgedRecords:0});
    if(incomplete&&!items.length)throw Error('No readable Fandango titles could be saved. Earlier records were kept. Run Full rescan to retry.');
    const snapshot = incomplete ? {version:1,provider:'fandango-at-home',complete:false,itemCount:items.length,scopes:sections.map(section=>({id:section.id,readCount:items.filter(item=>item.mediaType===section.id).length,expectedCount:expected[section.id==='movie'?'movies':'tv'],pagesRead:section.passes,failedItems:section.failedItems,complete:false,limitReached:section.limitReached===true,end:'partial-acquisition',incomplete:section.incomplete,...(section.unavailable?{unavailable:true}:{})}))} : fullRescan ? globalThis.GalacticProviderSnapshot.completeProviderSnapshot('fandango-at-home', items, [
      globalThis.GalacticProviderSnapshot.completedScope('movie', items.filter((item) => item.mediaType === 'movie').length, expected.movies, 'reported-count'),
      globalThis.GalacticProviderSnapshot.completedScope('tv', items.filter((item) => item.mediaType === 'tv').length, expected.tv, 'reported-count')
    ]) : undefined;
    status.textContent = items.length ? `Saving ${items.length} Fandango at Home title${items.length === 1 ? '' : 's'} locally...` : 'No new Fandango at Home titles; recording the completed check...';
    const saveStarted=Date.now();
    const response = await globalThis.GalacticSync.send({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'fandango-at-home', mode: fullRescan ? 'full' : 'incremental', items, snapshot });
    recordImport({saveElapsedMs:Date.now()-saveStarted});
    if (!response?.ok) throw new Error(response?.error ?? 'Fandango at Home import did not complete.');
    recordImport({outcome:incomplete?'partial':'success',acknowledgedRecords:items.length,storedMovies:response.movieCount,storedTv:response.tvCount});
    if(incomplete){
      const counts=countsFor(items),names=sections.filter(section=>section.incomplete).map(section=>section.id==='movie'?'Movies':'TV Shows').join(' and ');
      status.textContent=`Saved ${counts.movies} readable movies and ${counts.tv} TV shows. ${names} could not be fully checked. Earlier records were kept. Run Full rescan to retry the unchecked titles.`;
      return;
    }
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
    if (movieUrl || tvUrl) {
      const missingSections=['movie','tv'].filter(section=>section==='movie'?!movieUrl:!tvUrl);
      await importState('set', { phase: movieUrl?'movie':'tv', expected, urls: { movie: movieUrl??location.href, tv: tvUrl??location.href }, items: [], fullRescan, knownItemIds: fullRescan ? [] : knownItemIds,missingSections,...(!movieUrl?{sections:[{id:'movie',incomplete:true,failedItems:0,passes:0,unavailable:true}]}:{}) });
      status.textContent = `Opening Fandango ${movieUrl?'Movies':'TV Shows'} View All grid...`;
      globalThis.location.assign(movieUrl??tvUrl);
      return;
    }
    if (!fullRescan) {
      if (expected.movies === null || expected.tv === null) throw new Error('Fandango did not expose its Recently Purchased grids or both library totals. Reload My Library and let it finish loading, then retry. No library changes were saved.');
      status.textContent = 'Recently Purchased grids unavailable: checking your complete Fandango library...';
    }
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
      const result = await globalThis.GalacticFandangoAtHome.readFandangoGrid(section, expectedCount, ({ passes, count }) => {
        status.textContent = `Reading Fandango ${section === 'movie' ? 'Movies' : 'TV Shows'} View All grid: ${count}${expectedCount === null ? '' : ` / ${expectedCount}`} titles found (${passes} passes).`;
      }, fullRescan ? null : state.knownItemIds ?? [], {recover:true});
      const gridItems=Array.isArray(result)?result:result.items;
      const prior=savedImportDiagnostics();
      recordImport({outcome:'reading',effectiveMode:fullRescan?'full':'quick',sections:[...(prior?.sections??[]).filter(s=>s.section!==section),{section,...(result.diagnostics??{}),incomplete:result.incomplete===true}]});
      const sections=[...(state.sections??[]),{id:section,incomplete:result.incomplete===true,failedItems:result.failedItems??0,passes:result.passes??1,limitReached:result.limitReached===true}];
      if (!result.incomplete && expectedCount !== null && gridItems.length !== expectedCount) {
        throw new Error(`Fandango reported ${expectedCount} ${section === 'movie' ? 'movies' : 'TV shows'}, but its View All grid yielded ${gridItems.length}. No library changes were saved.`);
      }
      const items = [...(state.items ?? []), ...gridItems];
      if (section === 'movie'&&!state.missingSections?.includes('tv')) {
        await importState('set', { ...state, phase: 'tv', items, sections });
        status.textContent = 'Opening Fandango TV Shows View All grid...';
        globalThis.location.assign(state.urls.tv);
        return;
      }
      if(section==='movie')sections.push({id:'tv',incomplete:true,failedItems:0,passes:0,unavailable:true});
      const completeItems = fullRescan&&!sections.some(section=>section.incomplete) ? validatedItems(items, state.expected) : validatedItems(items, { movies: null, tv: null });
      await saveItems(completeItems, state.expected, fullRescan, sections);
      await importState('clear');
    } catch (error) {
      recordImport({outcome:'failed'});
      await globalThis.GalacticSync.failed('fandango-at-home',error);
      await importState('clear').catch(() => {});
      status.textContent = `Fandango at Home import failed: ${error.message}`;
    } finally {
      busy(false);
    }
  }

  async function sync(mode) {
    busy(true);
    recordImport({requestedMode:mode,effectiveMode:null,outcome:'starting',sections:[],submittedRecords:0,acknowledgedRecords:0});
    status.textContent='Preparing the Fandango at Home library check...';
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
      const fullRescan = mode === 'full' || !state.hasFullBaseline || state.syncState?.listingIncomplete===true;
      recordImport({effectiveMode:fullRescan?'full':'quick'});
      if(state.syncState?.listingIncomplete&&mode!=='full')status.textContent='Earlier titles remain unchecked; running a Full rescan to recover them...';
      if (!state.hasFullBaseline && mode !== 'full') status.textContent = 'No full Fandango at Home baseline yet; reading every title once…';
      await importState('clear');
      await startFromMyLibrary(fullRescan, state.syncState?.knownProviderItemIds ?? []);
    } catch (error) {
      recordImport({outcome:'failed'});
      await globalThis.GalacticSync.failed('fandango-at-home',error);
      status.textContent = `Fandango at Home import failed: ${error.message}`;
      busy(false);
    }
  }


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
  if(diagnostic){shadow.querySelector('[data-scan-diagnostics]').open=true;checkListing(diagnostic.expected);return;}
  importState('get').then((state) => {
    if (!state) return;
    if (state.phase === 'start' && /\/content\/browse\/mylibrary\b/iu.test(globalThis.location.pathname)) {
      sync(state.mode);
      return;
    }
    if (['movie', 'tv'].includes(state.phase) && routeFor(state.urls?.[state.phase]) === routeFor(globalThis.location.href)) resumeGridImport(state);
  }).catch(() => {});
}());
