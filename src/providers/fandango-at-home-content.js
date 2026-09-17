(function attachFandangoAtHomeSync() {
  'use strict';
  if (document.querySelector('#galactic-library-fandango-at-home-importer') || !globalThis.GalacticFandangoAtHome) return;

  const host = document.createElement('div');
  host.id = 'galactic-library-fandango-at-home-importer';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:350px;font:14px/1.4 system-ui,sans-serif;color:#f3f4f6;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>.panel { background:#1f2937; border:1px solid #f97316; border-radius:8px; box-shadow:0 8px 30px #0008; padding:14px; } p { margin:0 0 10px; } button { border:0; border-radius:5px; background:#f97316; color:#431407; cursor:pointer; font:inherit; padding:8px 10px; } button:disabled { cursor:wait; opacity:.7; } .status { color:#fed7aa; margin-top:10px; } .status[data-busy="true"]::before { content:'*'; display:inline-block; margin-right:6px; animation:pulse 1s ease-in-out infinite; } @keyframes pulse { 50% { opacity:.2; transform:scale(.7); } }</style>
    <div class="panel"><p><strong>Galactic Library</strong><br>Open <strong>My Library</strong>, then import its movies and TV titles. It follows Fandango's <strong>View All</strong> pages and reads their rendered grids.</p><button type="button">Sync Fandango at Home library</button><p class="status" role="status"></p></div>`;
  const button = shadow.querySelector('button');
  const status = shadow.querySelector('.status');

  function busy(value) {
    button.disabled = value;
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

  async function importState(action, state) {
    const response = await chrome.runtime.sendMessage({ type: 'FANDANGO_IMPORT_STATE', action, state });
    if (!response?.ok) throw new Error(response?.error ?? 'Could not keep the Fandango import in this browser tab.');
    return response.state ?? null;
  }

  function countsFor(items) {
    const movies = items.filter((item) => item.mediaType === 'movie').length;
    return { movies, tv: items.length - movies };
  }

  function validatedItems(items, expected) {
    const uniqueItems = [...new Map(items.map((item) => [`${item.mediaType}:${item.providerItemId}`, item])).values()];
    const counts = countsFor(uniqueItems);
    if ((expected.movies !== null && counts.movies !== expected.movies) || (expected.tv !== null && counts.tv !== expected.tv)) {
      throw new Error(`Fandango reported ${expected.movies ?? 'unknown'} movies and ${expected.tv ?? 'unknown'} TV shows, but the scan read ${counts.movies} movies and ${counts.tv} TV shows. No library changes were saved.`);
    }
    return uniqueItems;
  }

  async function saveItems(items, expected) {
    status.textContent = `Saving ${items.length} Fandango at Home titles locally...`;
    const response = await chrome.runtime.sendMessage({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'fandango-at-home', items });
    if (!response?.ok) throw new Error(response?.error ?? 'Fandango at Home import did not complete.');
    status.textContent = `Saved ${response.movieCount} Fandango at Home movies and ${response.tvCount} TV shows locally. Fandango reported ${expected.movies ?? 'unknown'} movies and ${expected.tv ?? 'unknown'} TV shows.`;
  }

  async function startFromMyLibrary() {
    if (!/\/content\/browse\/mylibrary\b/iu.test(globalThis.location.pathname)) throw new Error('Open Fandango at Home My Library before syncing.');
    const expected = globalThis.GalacticFandangoAtHome.expectedFandangoCountsFromDocument(document);
    const grids = globalThis.GalacticFandangoAtHome.viewAllLibraryLinksFromDocument(document);
    const movieUrl = grids.find((grid) => grid.mediaType === 'movie')?.url;
    const tvUrl = grids.find((grid) => grid.mediaType === 'tv')?.url;
    if (movieUrl && tvUrl) {
      await importState('set', { phase: 'movie', expected, urls: { movie: movieUrl, tv: tvUrl }, items: [] });
      status.textContent = 'Opening Fandango Movies View All grid...';
      globalThis.location.assign(movieUrl);
      return;
    }
    const { items } = await globalThis.GalacticFandangoAtHome.fetchFandangoLibrary(({ phase, passes, movies, tv, expected: reported }) => {
      if (phase === 'reset') {
        status.textContent = `Returning Fandango carousels to their first titles: ${passes} passes checked.`;
        return;
      }
      const target = reported.movies !== null || reported.tv !== null ? ` / Fandango reports ${reported.movies ?? '?'} movies and ${reported.tv ?? '?'} TV shows` : '';
      status.textContent = `Reading Fandango at Home library: ${passes} scan passes checked; ${movies} movies and ${tv} TV titles found${target}.`;
    });
    await saveItems(items, expected);
  }

  async function resumeGridImport(state) {
    const section = state.phase;
    const expectedCount = section === 'movie' ? state.expected.movies : state.expected.tv;
    busy(true);
    try {
      const gridItems = await globalThis.GalacticFandangoAtHome.readFandangoGrid(section, expectedCount, ({ passes, count }) => {
        status.textContent = `Reading Fandango ${section === 'movie' ? 'Movies' : 'TV Shows'} View All grid: ${count}${expectedCount === null ? '' : ` / ${expectedCount}`} titles found (${passes} passes).`;
      });
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
      const validated = validatedItems(items, state.expected);
      await saveItems(validated, state.expected);
      await importState('clear');
    } catch (error) {
      await importState('clear').catch(() => {});
      status.textContent = `Fandango at Home import failed: ${error.message}`;
    } finally {
      busy(false);
    }
  }

  button.addEventListener('click', async () => {
    busy(true);
    try {
      await importState('clear');
      await startFromMyLibrary();
    } catch (error) {
      status.textContent = `Fandango at Home import failed: ${error.message}`;
      busy(false);
    }
  });

  document.documentElement.append(host);
  importState('get').then((state) => {
    if (!state || !['movie', 'tv'].includes(state.phase) || routeFor(state.urls?.[state.phase]) !== routeFor(globalThis.location.href)) return;
    resumeGridImport(state);
  }).catch(() => {});
}());
