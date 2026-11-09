// Bounded, read-only Fanatical MAIN-world scanner. No credentials leave this function.
export async function readFanaticalOrdersInPage({ fullScan = false, knownOrderFingerprints = [], diagnostics = false, progressId = '' } = {}) {
  // Diagnostic evidence only: never a receipt or permission to persist purchases.
  const diagnostic = {version:1,countsAvailable:true,category:'none',stage:'initial-listing',pagesAttempted:0,pagesParsed:0,ordersDiscovered:0,ordersValidated:0,ordersUnresolved:0,detailsAttempted:0,detailsParsed:0,continuationPending:false,acquisitionFinished:false};
  let contextCategory='listing',failureStage=null;
  const began=Date.now(),activity={sequence:0,phase:'listing',pages:0,discovered:0,scheduled:0,completed:0,failed:0,active:0,retries:0,validatedItems:0};
  let lastProgress=0,lastPhase='';
  const progress=(phase=activity.phase,force=false)=>{
    activity.phase=phase;const now=Date.now();
    if(!force&&phase===lastPhase&&now-lastProgress<150)return;
    lastProgress=now;lastPhase=phase;
    if(!/^[a-f0-9]{32}$/u.test(progressId)||typeof window==='undefined')return;
    try{window.postMessage({channel:'gl-fanatical-progress',progressId,progress:{...activity,sequence:++activity.sequence,elapsedMs:now-began}},location.origin);}catch{/* Informational only; never affects acquisition. */}
  };
  const note=(error,fallback=contextCategory,stage=diagnostic.stage)=>{diagnostic.category=({FANATICAL_AUTH:'authentication',FANATICAL_LIST:'shape',FANATICAL_SCOPE:'scope',FANATICAL_LIMIT:'limit',FANATICAL_SUMMARY:'summary'})[error?.code]??fallback;failureStage=stage;};
  try {
  const safeTextInPage = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const safeIdInPage = (value) => /^[a-zA-Z0-9_-]{6,128}$/u.test(String(value ?? '')) ? String(value) : '';
  const safeDateInPage = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
  const trueKeysInPage = (value) => Object.entries(value && typeof value === 'object' ? value : {}).filter(([, active]) => active === true).map(([key]) => key).sort();
  const formatsInPage = (downloads) => [...new Set((Array.isArray(downloads) ? downloads : []).flatMap((download) => (Array.isArray(download?.files) ? download.files : []).map((file) => safeTextInPage(file?.format, 32).toLowerCase())).filter(Boolean))].sort();
  const mediaTypeInPage = (value) => {
    const type = safeTextInPage(value).toLowerCase();
    if (type.includes('comic') || ['book', 'ebook', 'manga', 'graphic_novel', 'graphic novel'].includes(type)) return 'book';
    if (type.includes('audio') && type.includes('book')) return 'audiobook';
    if (type === 'game') return 'game';
    if (type.includes('software') || type.includes('asset')) return 'software';
    if (type.includes('learn') || type.includes('course')) return 'elearning';
    if (type.includes('audio')) return 'audio';
    return 'other';
  };
  const projectLeafInPage = (leaf, parent, order) => {
    const sourceItemId = safeIdInPage(leaf?._id); const title = safeTextInPage(leaf?.name);
    if (!sourceItemId || !title) return null;
    const steam = leaf?.steam?.id === undefined || leaf?.steam?.id === null ? '' : String(leaf.steam.id);
    const isbn = safeTextInPage(leaf?.isbn, 32).replace(/[^0-9X]/giu, '');
    const externalIds = { ...(steam ? { steamAppId: steam } : {}), ...(isbn ? { isbn } : {}) };
    const catalog = {};
    for (const name of ['language', 'edition', 'series', 'run', 'volume', 'issue', 'publisher']) {
      if (safeTextInPage(leaf?.[name])) catalog[name] = safeTextInPage(leaf[name]);
    }
    const authors = Array.isArray(leaf?.authors) ? leaf.authors : typeof leaf?.author === 'string' ? [leaf.author] : [];
    const names = [...new Set(authors.map(value => safeTextInPage(value)).filter(Boolean))].slice(0, 50);
    if (names.length) catalog.authors = names;
    return {
      source: 'fanatical', sourceItemId, title,
      ...(safeTextInPage(leaf?.slug, 300) ? { slug: safeTextInPage(leaf.slug, 300) } : {}),
      mediaType: mediaTypeInPage(leaf?.display_type ?? leaf?.type),
      ...(Object.keys(externalIds).length ? { externalIds } : {}),
      ...catalog,
      ...(trueKeysInPage(leaf?.drm).length ? { drm: trueKeysInPage(leaf.drm) } : {}),
      ...(trueKeysInPage(leaf?.platforms ?? leaf?.os).length ? { platforms: trueKeysInPage(leaf.platforms ?? leaf.os) } : {}),
      ...(formatsInPage(leaf?.downloads).length ? { formats: formatsInPage(leaf.downloads) } : {}),
      bundle: { sourceItemId: safeIdInPage(parent?._id), title: safeTextInPage(parent?.name), ...(safeTextInPage(parent?.slug, 300) ? { slug: safeTextInPage(parent.slug, 300) } : {}) },
      purchaseDate: safeDateInPage(order?.date)
    };
  };
  let token = '';
  try { token = String(JSON.parse(localStorage.getItem('bsauth') || '{}')?.token || ''); } catch { /* no signed-in token */ }
  if (!token) throw Object.assign(new Error('Sign in to Fanatical before importing purchases.'),{code:'FANATICAL_AUTH'});
  const unreadable = () => Object.assign(new Error('Fanatical returned unreadable or incomplete order data. Your library and scan history were not changed.'),{code:'FANATICAL_EXPECTED'});
  const incomplete = (reason) => Object.assign(new Error(`Fanatical scan incomplete; order-history coverage could not be confirmed: ${reason} Your library and scan history were not changed.`),{code:'FANATICAL_EXPECTED'});
  const scanController = new AbortController();
  const concurrency = 3; const maxAttempts = 3; const maxPages = 1000; const maxOrders = 100000;
  let retries = 0; let cooldownUntil = 0;
  const pause = (ms) => new Promise((resolve, reject) => {
    if (scanController.signal.aborted) { reject(incomplete('Scan stopped after a failed request.')); return; }
    const abort = () => { clearTimeout(timer); reject(incomplete('Scan stopped after a failed request.')); };
    const timer = setTimeout(() => { scanController.signal.removeEventListener('abort', abort); resolve(); }, ms);
    scanController.signal.addEventListener('abort', abort, { once: true });
  });
  const retryDelay = (header, attempt) => {
    const backoff = 500 * (2 ** attempt) + Math.floor(Math.random() * 250);
    if (!header) return backoff;
    const delay = /^\d+$/u.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
    // Do not retry earlier than Retry-After, or keep the page busy indefinitely.
    if (delay > 30000) throw incomplete('Fanatical requested a longer retry delay. Please try scanning again later.');
    if (!Number.isFinite(delay)) return backoff;
    return Math.max(backoff, delay);
  };
  const request = async (path) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      while (cooldownUntil > Date.now()) await pause(cooldownUntil - Date.now());
      if (scanController.signal.aborted) throw incomplete('Scan stopped after a failed request.');
      const controller = new AbortController();
      const abort = () => controller.abort();
      scanController.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(), 20000);
      let response; let transportFailed = false;
      try {
        try {
          response = await fetch(path, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { accept: 'application/json', authorization: token } });
        } catch { transportFailed = true; }
        if (scanController.signal.aborted) throw incomplete('Scan stopped after a failed request.');
        if (response?.status === 200) {
          let data;
          try { data = await response.json(); } catch (error) {
            if (!controller.signal.aborted && error?.name !== 'TypeError') throw unreadable();
            transportFailed = true;
          }
          if (!transportFailed) return { data, headers: response.headers };
        }
        // Do not leave retry/error response streams downloading in the background.
        try { await response?.body?.cancel(); } catch { /* No ownership data is read from error bodies. */ }
        if (!transportFailed && ![408, 429, 500, 502, 503, 504].includes(response?.status)) {
          if (response?.status === 401 || response?.status === 403) throw Object.assign(incomplete('Fanatical session expired or access was denied. Sign in and try again.'),{code:'FANATICAL_AUTH'});
          throw unreadable();
        }
      } finally {
        clearTimeout(timer); scanController.signal.removeEventListener('abort', abort);
      }
      if (attempt === maxAttempts - 1) throw incomplete('An order request failed after three attempts. Please try again later.');
      const delay = retryDelay(response?.headers?.get('retry-after'), attempt);
      retries++;
      activity.retries=retries;progress('retry',true);
      if ([429, 503].includes(response?.status)) cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
      await pause(delay);
    }
    throw incomplete('An order request did not finish.');
  };
  const pagePath = (target, current) => {
    let url;
    try { url = new URL(target, `https://www.fanatical.com${current}`); } catch { throw incomplete('A pagination link was unreadable.'); }
    if (url.origin !== 'https://www.fanatical.com' || url.pathname !== '/api/user/orders' || url.username || url.password || url.hash) throw incomplete('An unsupported pagination link was returned.');
    url.searchParams.sort();
    return url.pathname + url.search;
  };
  // Split Link entries/parameters without splitting commas in quoted dates or
  // semicolons inside an angle-bracketed URL. Reject ambiguous header syntax.
  const splitHeader = (value, separator) => {
    const parts = []; let start = 0; let quoted = false; let angle = false; let escaped = false;
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (escaped) { escaped = false; continue; }
      if (quoted && char === '\\') { escaped = true; continue; }
      if (!angle && char === '"') quoted = !quoted;
      if (!quoted && char === '<') { if (angle) throw unreadable(); angle = true; }
      if (!quoted && char === '>') { if (!angle) throw unreadable(); angle = false; }
      if (!quoted && !angle && char === separator) { parts.push(value.slice(start, i).trim()); start = i + 1; }
    }
    if (quoted || angle || escaped) throw unreadable();
    parts.push(value.slice(start).trim()); return parts;
  };
  const paginationLinks = (header, current) => {
    const links = {};
    if (!header) return links;
    for (const entry of splitHeader(header, ',')) {
      const match = /^<([^<>]+)>(.*)$/u.exec(entry);
      if (!match) throw unreadable();
      const parameters = splitHeader(match[2], ';');
      if (parameters.shift() !== '') throw unreadable();
      let relations = null;
      for (const parameter of parameters) {
        const param = /^([a-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s";]+))$/iu.exec(parameter);
        if (!param || param[1].toLowerCase() === 'anchor') throw unreadable();
        if (param[1].toLowerCase() === 'rel') {
          if (relations !== null) throw unreadable();
          relations = (param[2] ?? param[3]).toLowerCase().split(/\s+/u);
        }
      }
      if (!relations) throw unreadable();
      for (const relation of relations.filter((rel) => ['next', 'last'].includes(rel))) {
        if (links[relation]) throw incomplete('Pagination returned ambiguous next/last links.');
        links[relation] = pagePath(match[1], current);
      }
    }
    return links;
  };
  const summaries = []; const visitedPages = new Set(); const pageOrderIds = new Set();
  let listingIncomplete=false,pagesFetched=0,rawOrders=0;
  let path = '/api/user/orders'; let expectedTotal = null; let ranged = false; let linked = false; let declaredLast = null;
  const acceptTotal = (value) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > maxOrders || (expectedTotal !== null && value !== expectedTotal)) throw incomplete('Pagination totals changed or were unreadable.');
    expectedTotal = value;
  };
  while (path) {
    try {
    diagnostic.stage=pagesFetched?'pagination':'initial-listing';contextCategory='continuation';
    if (visitedPages.has(path)) throw incomplete('Pagination repeated a page.');
    if (visitedPages.size >= maxPages) throw Object.assign(incomplete('The 1,000-page safety limit was reached.'),{code:'FANATICAL_LIMIT'});
    visitedPages.add(path);
    diagnostic.stage=pagesFetched?'pagination':'initial-listing';contextCategory='listing';diagnostic.continuationPending=true;diagnostic.pagesAttempted++;
    progress('listing',true);
    const { data, headers } = await request(path);
    // Envelopes/query conventions are not guessed from a fabricated contract.
    if (!Array.isArray(data)) throw Object.assign(unreadable(),{code:'FANATICAL_LIST'});
    const pageStart=rawOrders;
    if(rawOrders+data.length>maxOrders)throw Object.assign(incomplete('The 100,000-order safety limit was reached.'),{code:'FANATICAL_LIMIT'});
    rawOrders+=data.length;pagesFetched++;diagnostic.pagesParsed=pagesFetched;
    for(const order of data){
      if(!order||typeof order._id!=='string'||!safeIdInPage(order._id))throw Object.assign(incomplete('Pagination returned an unreadable order.'),{code:'FANATICAL_SUMMARY'});
      if(pageOrderIds.has(order._id)){diagnostic.category='continuation';failureStage=diagnostic.stage;listingIncomplete=true;continue;}
      pageOrderIds.add(order._id);summaries.push(order);diagnostic.ordersDiscovered=summaries.length;
    }
    activity.pages=pagesFetched;activity.discovered=summaries.length;progress('listing');
    contextCategory='continuation';
    const total = headers?.get('x-total-count');
    if (total !== null && total !== undefined) {
      if (!/^\d+$/u.test(total)) throw unreadable();
      acceptTotal(Number(total));
    }
    const range = headers?.get('content-range');
    if (ranged && !range) throw incomplete('Pagination omitted a previously supplied range.');
    if (range) {
      ranged = true;
      if (data.length === 0 && pageStart === 0 && /^(?:items|orders)\s+\*\/0$/iu.test(range)) acceptTotal(0);
      else {
        const match = /^(?:items|orders)\s+(\d+)-(\d+)\/(\d+)$/iu.exec(range);
        if (!match || Number(match[1]) !== pageStart || Number(match[2]) - Number(match[1]) + 1 !== data.length || Number(match[2]) >= Number(match[3])) throw incomplete('Pagination ranges have gaps, overlaps or unreadable bounds.');
        acceptTotal(Number(match[3]));
      }
    }
    if (summaries.length > maxOrders || (expectedTotal !== null && summaries.length > expectedTotal)) throw incomplete('Pagination exceeded its total or the 100,000-order safety limit.');
    const links = paginationLinks(headers?.get('link'), path);
    if (links.last) {
      if (declaredLast && declaredLast !== links.last) throw incomplete('Pagination changed its last-page link.');
      declaredLast = links.last;
    }
    if (links.next) {
      if (!data.length || declaredLast === path || (expectedTotal !== null && summaries.length >= expectedTotal)) throw incomplete('Pagination supplied a next page after an empty or final page.');
      linked = true;
    } else if ((expectedTotal !== null && summaries.length !== expectedTotal) || (declaredLast && declaredLast !== path)) {
      throw incomplete('Fanatical returned only part of the history without a usable next-page link.');
    }
    path = links.next || null;diagnostic.continuationPending=!!path;
    }catch(error){
      note(error);
      if(['FANATICAL_AUTH','FANATICAL_LIST'].includes(error?.code)||!summaries.length)throw error;
      listingIncomplete=true;break;
    }
  }
  diagnostic.stage='summaries';contextCategory='summary';
  progress('validating',true);
  const listed = new Set();
  const expectedProducts = new Map();
  const productCounts = (parents) => {
    if (!Array.isArray(parents) || !parents.length) throw unreadable();
    const counts = new Map();
    for (const parent of parents) {
      if (!safeTextInPage(parent?.name) || !Array.isArray(parent?.bundles) || !parent.bundles.length) throw unreadable();
      for (const group of parent.bundles) {
        if (!Array.isArray(group?.games) || !group.games.length) throw unreadable();
        for (const leaf of group.games) {
          if (!safeTextInPage(leaf?.name)) throw unreadable();
          const key = JSON.stringify([safeTextInPage(parent.name), safeTextInPage(leaf.name)]);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    return counts;
  };
  const invalidOrders=new Set();
  for (const order of summaries) {
    try {
    if (!order || typeof order._id !== 'string' || !safeIdInPage(order._id) || typeof order.status !== 'string' || !/^[A-Z][A-Z_]*$/u.test(order.status) || listed.has(order._id)) throw unreadable();
    listed.add(order._id);
    if (order.status === 'COMPLETE') expectedProducts.set(order._id, productCounts(order.items));
    else if (!['REFUNDED','CANCELLED','CANCELED','PENDING','FAILED'].includes(order.status)) throw unreadable();
    }catch{diagnostic.category='summary';failureStage=diagnostic.stage;listed.add(order._id);invalidOrders.add(order._id);diagnostic.ordersUnresolved=invalidOrders.size;}
  }
  const complete = summaries.filter((order) => order.status === 'COMPLETE'||invalidOrders.has(order._id));
  // Only opaque SHA-256 fingerprints leave the page world. This lets a quick
  // scan identify unseen orders without persisting Fanatical order IDs.
  const fingerprintOrderInPage = async (id) => {
    const bytes = new TextEncoder().encode(String(id));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
  };
  const boundedMap = async (input, task) => {
    const results = new Array(input.length); let cursor = 0; let failure = null;
    const worker = async () => {
      while (!failure && cursor < input.length) {
        const index = cursor++;
        try { results[index] = await task(input[index], index); }
        catch (error) { if (!failure) { failure = error; scanController.abort(); } }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, input.length) }, worker));
    if (failure) throw failure;
    return results;
  };
  const completeWithFingerprints = await boundedMap(complete, async (order) => ({ order, fingerprint: await fingerprintOrderInPage(order._id) }));
  const known = new Set((Array.isArray(knownOrderFingerprints) ? knownOrderFingerprints : []).filter((fingerprint) => /^[a-f0-9]{64}$/iu.test(String(fingerprint))).map((fingerprint) => String(fingerprint).toLowerCase()));
  const listedFingerprints = new Set(await boundedMap([...listed], fingerprintOrderInPage));
  const coverageVerified = !listingIncomplete&&(ranged || expectedTotal !== null || linked);
  if (!listingIncomplete && !coverageVerified && known.size && listedFingerprints.size && ![...known].some(fingerprint=>listedFingerprints.has(fingerprint))) {
    throw Object.assign(new Error('Fanatical purchases do not match this saved account. Check the signed-in account and retry. Your library was not changed.'),{code:'FANATICAL_SCOPE'});
  }
  if (coverageVerified && [...known].some((fingerprint) => !listedFingerprints.has(fingerprint))) {
    throw Object.assign(new Error('Fanatical order history omits previously scanned orders, so complete coverage could not be confirmed. Your library and scan history were not changed.'),{code:'FANATICAL_SCOPE'});
  }
  const toInspect = fullScan ? completeWithFingerprints : completeWithFingerprints.filter(({ order,fingerprint }) => invalidOrders.has(order._id)||!known.has(fingerprint));
  diagnostic.stage='details';contextCategory='detail';
  activity.scheduled=toInspect.length;progress('details',true);
  const failedFingerprints=new Set();
  const details = await boundedMap(toInspect, async ({ order: listedOrder, fingerprint }) => {
    activity.active++;progress('details',activity.completed===0&&activity.active===Math.min(3,activity.scheduled));
    try {
    if(invalidOrders.has(listedOrder._id))throw unreadable();
    diagnostic.detailsAttempted++;
    const { data: order } = await request(`/api/user/orders/${encodeURIComponent(listedOrder._id)}`);
    const projectedItems = [];
    if (!order || order._id !== listedOrder._id || order.status !== 'COMPLETE' || !Array.isArray(order.items) || !order.items.length) throw unreadable();
    const expected = expectedProducts.get(order._id);
    const actual = productCounts(order.items);
    if (actual.size !== expected.size || [...expected].some(([key, quantity]) => actual.get(key) !== quantity)) throw unreadable();
    let occurrence=0;
    for (const parent of order.items) {
      if (!parent || typeof parent._id !== 'string' || !safeIdInPage(parent._id) || !safeTextInPage(parent.name) || !Array.isArray(parent.bundles) || !parent.bundles.length) throw unreadable();
      for (const group of parent.bundles) {
        if (!group || !Array.isArray(group.games) || !group.games.length) throw unreadable();
        for (const leaf of group.games) {
          if (typeof leaf?._id !== 'string') throw unreadable();
          const projected = projectLeafInPage(leaf, parent, order);
          if (!projected) throw unreadable();
          projected.purchaseOrigins=[{occurrenceRef:await fingerprintOrderInPage(`${order._id}\u0000${occurrence++}\u0000${parent._id}\u0000${leaf._id}`),orderRef:fingerprint,bundleId:parent._id,bundleTitle:safeTextInPage(parent.name),purchasedAt:safeDateInPage(order.date)}];
          projectedItems.push(projected);
        }
      }
    }
    diagnostic.detailsParsed++;diagnostic.ordersValidated++;
    activity.validatedItems+=projectedItems.length;
    return projectedItems;
    }catch(error){
      note(error,invalidOrders.has(listedOrder._id)?'summary':'detail',invalidOrders.has(listedOrder._id)?'summaries':diagnostic.stage);
      if(error?.code==='FANATICAL_AUTH')throw error;
      failedFingerprints.add(fingerprint);diagnostic.ordersUnresolved=failedFingerprints.size;return null;
    }finally{activity.active--;activity.completed++;activity.failed=failedFingerprints.size;progress('details',activity.completed===activity.scheduled);}
  });
  diagnostic.stage='projection';contextCategory='unknown';
  progress('validating',true);
  const items = new Map();
  for (const products of details.filter(Boolean)) for (const product of products){
    const prior=items.get(product.sourceItemId),purchaseOrigins=[...(prior?.purchaseOrigins??[]),...product.purchaseOrigins];
    if(purchaseOrigins.length>500)throw Object.assign(incomplete('A product exceeded the 500-purchase occurrence limit.'),{code:'FANATICAL_LIMIT'});
    items.set(product.sourceItemId,{...product,purchaseOrigins});
  }
  let currentToken='';try{currentToken=String(JSON.parse(localStorage.getItem('bsauth')||'{}')?.token||'');}catch{}
  if(currentToken!==token)throw Object.assign(incomplete('The signed-in account changed during the scan.'),{code:'FANATICAL_SCOPE'});
  const partial=listingIncomplete||failedFingerprints.size>0;
  const orderFingerprints=completeWithFingerprints.filter(({fingerprint})=>!failedFingerprints.has(fingerprint)).map(({fingerprint})=>fingerprint);
  if(partial&&!orderFingerprints.length){diagnostic.stage=failureStage??diagnostic.stage;contextCategory=diagnostic.category==='none'?'unknown':diagnostic.category;throw incomplete('No independently validated purchases were available. Try again later.');}
  diagnostic.acquisitionFinished=!partial;
  if(failureStage)diagnostic.stage=failureStage;
  // `token`, summaries, details, and raw leaves remain in this execution world.
  return {
    ...(diagnostics?{diagnostic}:{}),
    schemaVersion: 1,
    acquisitionComplete: !partial,
    ...(partial?{recovery:{failedOrderFingerprints:[...failedFingerprints],failedOrders:failedFingerprints.size,listingIncomplete,ordersSkipped:completeWithFingerprints.length-toInspect.length}}:{}),
    coverage: { complete: !partial&&coverageVerified, listedOrders: summaries.length, validatedOrders: details.filter(Boolean).length, emptyAccount: summaries.length === 0,
      pagesFetched, expectedTotal, paginationEvidence: ranged ? 'range' : expectedTotal !== null ? 'count' : linked ? 'link' : 'array-only', retries, concurrency },
    ordersScanned: details.filter(Boolean).length,
    ordersAvailable: complete.length,
    orderFingerprints,
    items: [...items.values()]
  };
  } catch(error) {
    if(!diagnostics)throw error;
    note(error,error?.code?contextCategory:'unknown');
    return {fanaticalFailure:1,diagnostic};
  }
}
