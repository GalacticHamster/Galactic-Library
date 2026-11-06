/* Fandango at Home importer. It reads rendered cards only after the user
 * starts sync in a signed-in My Library view; no password, cookie, or API
 * token is read or stored. */
(function attachFandangoAtHomeImporter(global) {
  'use strict';

  const MAX_SCROLLS = 300;
  const SCROLL_PAUSE_MS = 900;

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function hiddenLibraryElement(element){
    // Keep off-screen virtualized cards; exclude only explicit hidden markup.
    return Boolean(element?.closest?.('[hidden],[aria-hidden="true"],[style*="display:none" i],[style*="display: none" i]'));
  }

  function libraryPageFailure(document){
    if(/\/sign(?:in|-in)|\/login/iu.test(global.location?.pathname??'')||[...document.querySelectorAll('input[type="password"]')].some(e=>!hiddenLibraryElement(e)))return 'sign-in';
    if([...document.querySelectorAll('h1,h2,[role="alert"]')].some(e=>!hiddenLibraryElement(e)&&/^(?:access denied|unauthorized|forbidden|session expired|please sign in|verify your identity)[.!]?$/iu.test(compactText(e.textContent))))return 'sign-in';
    if(/\/(?:error|500|503)(?:\/|$)/iu.test(global.location?.pathname??'')||[...document.querySelectorAll('h1,h2,[role="alert"]')].some(e=>!hiddenLibraryElement(e)&&/^(?:something went wrong|service unavailable|an unexpected error occurred)[.!]?$/iu.test(compactText(e.textContent))))return 'provider-error';
    return null;
  }

  function absoluteUrl(value) {
    if (!compactText(value)) return '';
    try {
      const url = new URL(value, global.location?.origin ?? 'https://athome.fandango.com');
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }

  function contentIdFromValue(value) {
    const text = String(value ?? '');
    const browseDetailId = text.match(/\/content\/browse\/details\/[^/?#]+\/([a-z0-9_-]+)(?:[/?#]|$)/iu)?.[1];
    if (browseDetailId) return browseDetailId;
    const queryId = text.match(/(?:content|title|program|video)[_-]?id[=:/]([a-z0-9_-]+)/iu)?.[1];
    if (queryId) return queryId;
    const detailId = text.match(/\/(?:detail|details|movie|tv)\/([a-z0-9_-]{5,})(?:[/?#]|$)/iu)?.[1];
    if (detailId) return detailId;
    const path = new URL(text, global.location?.origin ?? 'https://athome.fandango.com').pathname.replace(/^\/+|\/+$/gu, '');
    return path && !/^content\/browse/iu.test(path) ? path : '';
  }

  function mediaTypeFromValue(value) {
    const text = compactText(value).toLocaleLowerCase();
    if (/\b(tv|television|series|season|episode|show)\b/u.test(text)) return 'tv';
    if (/\b(movie|film|feature)\b/u.test(text)) return 'movie';
    return 'movie';
  }

  function ownershipFromValue(value) {
    const text = compactText(value).toLocaleLowerCase();
    if (/\b(rental|rented|rent until|expires)\b/u.test(text)) return 'rental';
    return 'owned';
  }

  function fandangoItemFromCardData(card) {
    const title = compactText(card?.title);
    const detailUrl = absoluteUrl(card?.detailUrl);
    const providerItemId = contentIdFromValue(card?.providerItemId) || contentIdFromValue(detailUrl);
    if (!providerItemId || !title) return null;
    return {
      providerItemId,
      title,
      mediaType: mediaTypeFromValue(card?.typeText),
      ownership: ownershipFromValue(card?.ownershipText),
      metadata: {
        source: 'fandango-at-home-library',
        detailUrl,
        imageUrl: absoluteUrl(card?.imageUrl),
        cardType: compactText(card?.typeText)
      }
    };
  }

  function firstText(elements) {
    for (const element of elements) {
      const text = compactText(element?.textContent ?? element?.getAttribute?.('aria-label'));
      if (text) return text;
    }
    return '';
  }

  function cardDataFromElement(card) {
    const link = card.querySelector('a[href]');
    const image = card.querySelector('img');
    return {
      providerItemId: card.getAttribute('data-content-id') ?? card.getAttribute('data-title-id') ?? card.getAttribute('data-program-id') ?? card.getAttribute('data-id') ?? link?.getAttribute('href'),
      title: card.getAttribute('data-title') ?? card.getAttribute('data-content-title') ?? firstText([
        card.querySelector('[data-testid*="title" i], [class*="title" i], h1, h2, h3, h4'),
        { textContent: image?.getAttribute('alt') },
        { textContent: link?.getAttribute('aria-label') }
      ]),
      detailUrl: link?.getAttribute('href'),
      imageUrl: image?.currentSrc ?? image?.getAttribute('src'),
      typeText: `${card.getAttribute('data-type') ?? ''} ${card.getAttribute('data-content-type') ?? ''} ${card.getAttribute('data-testid') ?? ''} ${card.className ?? ''}`,
      ownershipText: card.textContent
    };
  }

  function typeTextFromCardContext(card) {
    let container = card;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      const heading = container.querySelector('h1, h2, h3, [role="heading"], [data-testid*="heading" i], [class*="heading" i]');
      const context = `${container.getAttribute('data-content-type') ?? ''} ${container.getAttribute('data-type') ?? ''} ${heading?.textContent ?? ''}`;
      if (/\b(tv|television|series|season|episode|show|movie|film)\b/iu.test(context)) return context;
    }
    return '';
  }

  function cardDataFromDetailLink(link) {
    const card = link.closest('[class*="item" i], article, li') ?? link.parentElement ?? link;
    const image = link.querySelector('img');
    return {
      providerItemId: link.getAttribute('href'),
      title: compactText(image?.getAttribute('alt')) || link.getAttribute('aria-label'),
      detailUrl: link.getAttribute('href'),
      imageUrl: image?.currentSrc ?? image?.getAttribute('src'),
      typeText: typeTextFromCardContext(card),
      ownershipText: card.textContent
    };
  }

  function mediaTypeFromLibraryPosition(card, document) {
    const cardTop = card.getBoundingClientRect?.().top;
    if (!Number.isFinite(cardTop)) return '';
    const headings = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')].flatMap((heading) => {
      const text = compactText(heading.textContent);
      const mediaType = /^my movies\s*\(/iu.test(text) ? 'movie' : /^my tv shows\s*\(/iu.test(text) ? 'tv' : '';
      const top = heading.getBoundingClientRect?.().top;
      return mediaType && Number.isFinite(top) ? [{ mediaType, top }] : [];
    });
    return headings.filter((heading) => heading.top <= cardTop).sort((left, right) => right.top - left.top)[0]?.mediaType ?? '';
  }

  function fandangoItemsFromDocument(document, forcedMediaType = '') {
    const links = [...document.querySelectorAll('a[href*="/content/browse/details/"]')];
    const itemsById = new Map();
    for (const link of links) {
      if(hiddenLibraryElement(link))continue;
      const card = link.closest('[class*="item" i], article, li') ?? link.parentElement ?? link;
      const cardData = cardDataFromDetailLink(link);
      const positionedType = forcedMediaType || mediaTypeFromLibraryPosition(card, document);
      if (positionedType) cardData.typeText = positionedType;
      const item = fandangoItemFromCardData(cardData);
      if (item) itemsById.set(item.providerItemId, item);
    }
    return [...itemsById.values()];
  }

  function newFandangoItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => compactText(id)).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(compactText(item?.providerItemId)));
  }

  function expectedFandangoCountsFromDocument(document) {
    const headings = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')].filter(element=>!hiddenLibraryElement(element)).map((element) => compactText(element.textContent));
    const countFor = (pattern) => Number(headings.find((heading) => pattern.test(heading))?.match(/\((\d+)\)/u)?.[1]);
    const movies = countFor(/^my movies\s*\(\d+\)$/iu);
    const tv = countFor(/^my tv shows\s*\(\d+\)$/iu);
    return { movies: Number.isInteger(movies) ? movies : null, tv: Number.isInteger(tv) ? tv : null };
  }

  function mediaTypeFromLibraryLabel(value) {
    const label = compactText(value);
    if (/^my movies\s*\(/iu.test(label)) return 'movie';
    if (/^my tv shows\s*\(/iu.test(label)) return 'tv';
    return '';
  }

  function mediaTypeForViewAllLink(link, document) {
    const typeByPosition = mediaTypeFromLibraryPosition(link, document);
    if (typeByPosition) return typeByPosition;
    let container = link.parentElement;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      const heading = [...container.querySelectorAll('h1, h2, h3, [role="heading"]')]
        .map((element) => mediaTypeFromLibraryLabel(element.textContent)).find(Boolean);
      if (heading) return heading;
    }
    return '';
  }

  function viewAllLibraryLinksFromDocument(document) {
    return [...document.querySelectorAll('a[href]')].flatMap((link) => {
      if (compactText(link.textContent) !== 'View All') return [];
      const mediaType = mediaTypeForViewAllLink(link, document);
      if (!mediaType) return [];
      try {
        return [{ mediaType, url: new URL(link.getAttribute('href'), global.location?.origin ?? 'https://athome.fandango.com').toString() }];
      } catch {
        return [];
      }
    }).filter((link, index, links) => links.findIndex((other) => other.mediaType === link.mediaType) === index);
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function loadMoreControl(document) {
    return [...document.querySelectorAll('button, a')].find((element) => {
      const text = compactText(element.getAttribute('aria-label') ?? element.textContent).toLocaleLowerCase();
      return !hiddenLibraryElement(element)&&/^(load|show|view|see) more(?: titles| movies| shows)?$/u.test(text)
        && !element.hasAttribute('disabled')
        && element.getAttribute('aria-disabled') !== 'true';
    }) ?? null;
  }

  function carouselNextControls(document) {
    return [...document.querySelectorAll('button, a, [role="button"]')].filter((element) => {
      const label = compactText(element.getAttribute('aria-label') ?? '').toLocaleLowerCase();
      const className = String(element.className ?? '').toLocaleLowerCase();
      return (/next\s+slide/u.test(label) || /carousel.*right|right.*carousel/u.test(className))
        && !element.hasAttribute('disabled')
        && element.getAttribute('aria-disabled') !== 'true';
    });
  }

  function carouselPreviousControls(document) {
    return [...document.querySelectorAll('button, a, [role="button"]')].filter((element) => {
      const label = compactText(element.getAttribute('aria-label') ?? '').toLocaleLowerCase();
      const className = String(element.className ?? '').toLocaleLowerCase();
      return (/previous\s+slide/u.test(label) || /carousel.*left|left.*carousel/u.test(className))
        && !element.hasAttribute('disabled')
        && element.getAttribute('aria-disabled') !== 'true';
    });
  }

  function gridScrollTarget(document) {
    const firstCard = [...document.querySelectorAll('a[href*="/content/browse/details/"]')].find(element=>!hiddenLibraryElement(element));
    for (let element = firstCard?.parentElement; element && element !== document.documentElement; element = element.parentElement) {
      const style = global.getComputedStyle?.(element);
      const overflowY = style?.overflowY ?? '';
      if (element.scrollHeight > element.clientHeight + 20 && /auto|scroll|overlay/iu.test(overflowY)) return element;
    }
    return document.scrollingElement ?? document.documentElement;
  }

  function scrollGridForward(document) {
    const target = gridScrollTarget(document);
    const isDocument = target === document.scrollingElement || target === document.documentElement || target === document.body;
    const viewport = isDocument ? global.innerHeight : target.clientHeight;
    const nextTop = Math.min(
      Math.max(0, target.scrollHeight - viewport),
      (isDocument ? global.scrollY : target.scrollTop) + Math.max(320, Math.floor(viewport * 0.8))
    );
    if (isDocument) global.scrollTo({ top: nextTop, behavior: 'auto' });
    else {
      target.scrollTo({ top: nextTop, behavior: 'auto' });
      target.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    return { target, isDocument, viewport };
  }

  function visibleLibrarySignature(document) {
    return fandangoItemsFromDocument(document).map((item) => item.providerItemId).sort().join('\u0000');
  }

  async function resetCarouselsToStart(reportProgress) {
    let unchangedPasses = 0;
    for (let pass = 0; pass < MAX_SCROLLS && unchangedPasses < 3; pass += 1) {
      const arrows = carouselPreviousControls(global.document);
      if (!arrows.length) break;
      const before = visibleLibrarySignature(global.document);
      arrows.forEach((arrow) => arrow.click());
      await wait(SCROLL_PAUSE_MS);
      unchangedPasses = visibleLibrarySignature(global.document) === before ? unchangedPasses + 1 : 0;
      reportProgress({ phase: 'reset', passes: pass + 1 });
      if (pass === MAX_SCROLLS - 1 && unchangedPasses < 3) throw new Error('Fandango reached its carousel reset limit before reaching the beginning.');
    }
  }

  async function readFandangoGrid(mediaType, expectedCount = null, reportProgress = () => {}, knownItemIds = null, { recover = false } = {}) {
    const itemsById = new Map();
    const rejected = new Set(), observed = new Map(), unreadable = new WeakSet();
    let failedItems = 0, passes = 0, interrupted = false;
    const incremental = Array.isArray(knownItemIds);
    const renderedItemIds = new Set();
    let unchangedPasses = 0;
    let emptyPasses = 0;
    let previousSignature = '';
    let finished = false;
    for (let pass = 0; pass < MAX_SCROLLS && unchangedPasses < 10; pass += 1) {
      passes = pass + 1;
      const pageFailure=libraryPageFailure(global.document);
      if(recover&&pageFailure==='provider-error'){interrupted=true;break;}
      if(pageFailure)throw new Error(pageFailure==='sign-in'?'Fandango needs you to sign in again. Your saved library is unchanged.':'Fandango returned an error page. Your saved library is unchanged.');
      let candidates = fandangoItemsFromDocument(global.document, mediaType);
      if(recover){
        candidates=[];
        for(const link of global.document.querySelectorAll('a[href*="/content/browse/details/"]')){
          if(hiddenLibraryElement(link))continue;
          // Recovery cannot turn recommendations or navigation links into
          // purchases merely because a count mismatch is now recoverable.
          if(link.closest('aside,nav,footer,[role="navigation"],[role="dialog"]'))continue;
          const data=cardDataFromDetailLink(link),card=link.closest('[class*="item" i], article, li')??link.parentElement;
          let unrelated=false;
          for(let node=card?.parentElement,depth=0;node&&depth<5;node=node.parentElement,depth++){
            const heading=compactText(node.querySelector('h1,h2,h3,[role="heading"]')?.textContent);
            if(/^(?:recommended|recommendations|you may|you might|more like|continue watching|collections)\b/iu.test(heading)){unrelated=true;break;}
            if(/^my (?:movies|tv shows)\s*\(/iu.test(heading)){
              if(mediaTypeFromLibraryLabel(heading)!==mediaType)unrelated=true;
              break;
            }
          }
          if(unrelated)continue;
          const explicit=compactText(card?.getAttribute('data-content-type')??card?.getAttribute('data-type'));
          const validType=!explicit||/^(?:movie|film|feature|tv|television|series|season|episode|show)$/iu.test(explicit)&&mediaTypeFromValue(explicit)===mediaType;
          const valid=/\/content\/browse\/details\/[^/?#]+\/[a-z0-9_-]+\/?(?:[?#].*)?$/iu.test(data.detailUrl??'')&&typeof data.title==='string'&&/[\p{L}\p{N}]/u.test(data.title)&&data.title.length<=500&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(data.title)&&validType;
          if(!valid){if(!unreadable.has(link)){failedItems++;unreadable.add(link);}continue;}
          const item=fandangoItemFromCardData({...data,typeText:mediaType}),id=item?.providerItemId;
          if(!id){if(!unreadable.has(link)){failedItems++;unreadable.add(link);}continue;}
          const prior=observed.get(id);
          if(prior&&(prior.title!==item.title||prior.ownership!==item.ownership||prior.mediaType!==item.mediaType)){
            if(!rejected.has(id)){failedItems++;rejected.add(id);}itemsById.delete(id);continue;
          }
          observed.set(id,item);
          if(!rejected.has(id))candidates.push(item);
        }
      }
      const newlyRenderedItems = candidates.filter(item=>!rejected.has(item.providerItemId))
        .filter((item) => !renderedItemIds.has(item.providerItemId));
      for (const item of newlyRenderedItems) renderedItemIds.add(item.providerItemId);
      const itemsToSave = incremental ? newFandangoItems(newlyRenderedItems, knownItemIds) : newlyRenderedItems;
      for (const item of itemsToSave) itemsById.set(item.providerItemId, item);
      reportProgress({ phase: 'grid', section: mediaType, passes: pass + 1, count: itemsById.size, expectedCount });
      // The View All grids default to Recently Purchased. A fully known newly
      // rendered group means every later group is older than the local baseline.
      if (incremental && !failedItems && newlyRenderedItems.length && !itemsToSave.length) { finished = true; break; }
      // Count agreement is necessary but is not an end-of-list signal. Finish
      // the virtualized grid before authorizing a complete replacement.
      emptyPasses = itemsById.size === 0 ? emptyPasses + 1 : 0;
      if (emptyPasses >= 20) break;
      const signature = [...itemsById.keys()].sort().join('\u0000');
      const loadMore = loadMoreControl(global.document);
      const initialTarget = gridScrollTarget(global.document);
      const beforeHeight = initialTarget.scrollHeight;
      try {
        if (loadMore) loadMore.click();
        else scrollGridForward(global.document);
      } catch(error) {
        if(!recover)throw error;
        interrupted=true;break;
      }
      await wait(SCROLL_PAUSE_MS);
      const settledTarget = gridScrollTarget(global.document);
      const currentTop = settledTarget === global.document.scrollingElement || settledTarget === global.document.documentElement || settledTarget === global.document.body
        ? global.scrollY
        : settledTarget.scrollTop;
      const currentViewport = settledTarget === global.document.scrollingElement || settledTarget === global.document.documentElement || settledTarget === global.document.body
        ? global.innerHeight
        : settledTarget.clientHeight;
      const atBottom = currentTop + currentViewport >= settledTarget.scrollHeight - 4;
      const hasSettled = (itemsById.size > 0||expectedCount===0) && atBottom && !loadMore && signature === previousSignature && settledTarget === initialTarget && settledTarget.scrollHeight === beforeHeight;
      unchangedPasses = hasSettled ? unchangedPasses + 1 : 0;
      previousSignature = signature;
    }
    if(recover){
      if(libraryPageFailure(global.document)==='sign-in')throw Error('Fandango needs you to sign in again. Your saved library is unchanged.');
      const finalCount=expectedFandangoCountsFromDocument(global.document)[mediaType==='movie'?'movies':'tv'];
      if(!interrupted&&!itemsById.size&&!failedItems&&finalCount===null)throw Error('Fandango did not expose a recognizable library section. Your saved library is unchanged. Reload My Library and retry.');
      if(expectedCount!==null&&finalCount!==null&&finalCount!==expectedCount)throw Error('Fandango changed its library count during the check. Your saved library is unchanged. Reload My Library and try again.');
      return {items:[...itemsById.values()],incomplete:interrupted||failedItems>0||!finished&&unchangedPasses<10||!incremental&&expectedCount!==null&&itemsById.size!==expectedCount,failedItems,passes,limitReached:!interrupted&&!finished&&passes===MAX_SCROLLS&&unchangedPasses<10};
    }
    if (!finished && unchangedPasses < 10) throw new Error(`Fandango did not complete its ${mediaType} grid before the scan limit or loading timeout. No library changes were saved.`);
    if(!incremental){
      if(libraryPageFailure(global.document))throw new Error('Fandango could not finish checking your library. Your saved library is unchanged.');
      const finalCount=expectedFandangoCountsFromDocument(global.document)[mediaType==='movie'?'movies':'tv'];
      if(expectedCount!==null&&finalCount!==null&&finalCount!==expectedCount)throw new Error('Fandango changed its library count during the check. Your saved library is unchanged. Reload My Library and try again.');
      const unreadable=[...global.document.querySelectorAll('a[href*="/content/browse/details/"]')].filter(link=>!hiddenLibraryElement(link)).some(link=>{
        const data=cardDataFromDetailLink(link);
        return !/\/content\/browse\/details\/[^/?#]+\/[a-z0-9_-]+\/?(?:[?#].*)?$/iu.test(data.detailUrl??'')||!compactText(data.title);
      });
      if(unreadable)throw new Error('Fandango could not finish reading every library card. Your saved library is unchanged.');
    }
    if (!incremental && expectedCount !== null && itemsById.size !== expectedCount) throw new Error(`Fandango reported ${expectedCount} ${mediaType} titles but returned ${itemsById.size}. No library changes were saved.`);
    return [...itemsById.values()];
  }

  async function fetchFandangoLibrary(reportProgress = () => {}) {
    if (!/\/content\/browse\/mylibrary\b/iu.test(global.location?.pathname ?? '')) {
      throw new Error('Open Fandango at Home My Library before syncing.');
    }
    const itemsById = new Map();
    const expected = expectedFandangoCountsFromDocument(global.document);
    if (expected.movies === null || expected.tv === null) throw new Error('Fandango did not expose both library totals. A full replacement cannot be validated.');
    const viewAllLinks = viewAllLibraryLinksFromDocument(global.document);
    if (viewAllLinks.length) throw new Error('Fandango View All grids must be read in their signed-in browser pages. Start sync again.');
    await resetCarouselsToStart(reportProgress);
    let unchangedPasses = 0;
    let finished = false;
    for (let pass = 0; pass < MAX_SCROLLS && unchangedPasses < 3; pass += 1) {
      const before = itemsById.size;
      for (const item of fandangoItemsFromDocument(global.document)) itemsById.set(item.providerItemId, item);
      const movies = [...itemsById.values()].filter((item) => item.mediaType === 'movie').length;
      const tv = itemsById.size - movies;
      reportProgress({ phase: 'scan', passes: pass + 1, movies, tv, expected });
      if (movies === expected.movies && tv === expected.tv) { finished = true; break; }
      unchangedPasses = itemsById.size === before ? unchangedPasses + 1 : 0;
      const carouselArrows = carouselNextControls(global.document);
      const loadMore = loadMoreControl(global.document);
      if (carouselArrows.length) carouselArrows.forEach((arrow) => arrow.click());
      else if (loadMore) loadMore.click();
      else global.scrollTo({ top: global.document.scrollingElement?.scrollHeight ?? global.document.body.scrollHeight, behavior: 'auto' });
      await wait(SCROLL_PAUSE_MS);
    }
    if (!finished && unchangedPasses < 3) throw new Error('Fandango reached its carousel scan limit before completing the library.');
    if (!itemsById.size) throw new Error('No readable Fandango at Home library cards were found. Open My Library, wait for it to load, then try again.');
    const movies = [...itemsById.values()].filter((item) => item.mediaType === 'movie').length;
    const tv = itemsById.size - movies;
    if ((expected.movies !== null && movies !== expected.movies) || (expected.tv !== null && tv !== expected.tv)) {
      throw new Error(`Fandango reported ${expected.movies ?? 'unknown'} movies and ${expected.tv ?? 'unknown'} TV shows, but the scan read ${movies} movies and ${tv} TV shows. No library changes were saved.`);
    }
    return { items: [...itemsById.values()], expected };
  }

  // Troubleshooting only. IDs/titles remain in memory to compare observations;
  // the exported report contains fixed structural labels and aggregate counts.
  // A stable bottom is diagnostic evidence, never an import-completeness proof.
  async function inspectFandangoListing(reportProgress=()=>{},expected={movies:null,tv:null},{maxPasses=MAX_SCROLLS,pauseMs=SCROLL_PAUSE_MS}={}){
    const reportedBefore=Object.fromEntries(['movies','tv'].map(k=>[k,Number.isInteger(expected?.[k])&&expected[k]>=0&&expected[k]<=50000?expected[k]:null]));
    const report={format:1,provider:'fandango-at-home',readOnly:true,reportedBefore,reportedDuring:[],passes:[],groups:[],uniqueIdentities:0,productionExtractedIdentities:0,repeatedIdentities:0,maxLinksInOnePass:0,maxDuplicateLinksInOnePass:0,missingIdentities:0,unreadableTitles:0,nonNumericIdentities:0,recycledNodes:0,identityTitleChanges:0,sameTitleDifferentIdentities:0,attributeIdentityDisagreements:0,traversalFinished:false,libraryComplete:false,reason:'scan-limit'};
    const identities=new Map(),productionIds=new Set(),titleIds=new Map(),groups=new Map(),nodes=new WeakMap(),missing=new WeakSet();
    let stable=0,previous='',priorHeight=-1,priorTarget=null,previousCounts='';
    function context(link){
      const area=link.closest('[hidden],[aria-hidden="true"],[style*="display:none" i],[style*="display: none" i]')?'hidden':link.closest('nav,[role="navigation"]')?'navigation':link.closest('footer')?'footer':link.closest('aside')?'aside':link.closest('[role="dialog"]')?'dialog':link.closest('main,[role="main"]')?'main':'other';
      let heading='none',container='other';
      const card=link.closest('[class*="item" i],article,li')??link.parentElement;
      for(let node=card?.parentElement,depth=0;node&&node!==global.document.body&&depth<8;node=node.parentElement,depth++){
        const marker=String(node.className??'');
        if(container==='other')container=/carousel|slider/iu.test(marker)?'carousel':/grid/iu.test(marker)?'grid':node.matches('ul,ol')?'list':'other';
        const text=compactText(node.querySelector('h1,h2,h3,[role="heading"]')?.textContent);
        if(heading==='none'&&text)heading=/^my movies\b/iu.test(text)?'movies':/^my tv shows\b/iu.test(text)?'tv':/recommend|you may|you might|more like/iu.test(text)?'recommendations':/continue watching/iu.test(text)?'continue-watching':/rental/iu.test(text)?'rentals':/bundle|collection/iu.test(text)?'collections':'other-heading';
      }
      const hint=typeTextFromCardContext(link.closest('[class*="item" i],article,li')??link.parentElement??link);
      const mediaHint=/\b(tv|television|series|season|episode|show)\b/iu.test(hint)?'tv':/\b(movie|film|feature)\b/iu.test(hint)?'movie':'unknown';
      return {area,heading,container,mediaHint};
    }
    try{
      for(let pass=0;pass<Math.min(MAX_SCROLLS,maxPasses);pass++){
        const doc=global.document,pageFailure=libraryPageFailure(doc);
        if(pageFailure){report.reason=pageFailure;break;}
        const counts=expectedFandangoCountsFromDocument(doc),countKey=JSON.stringify(counts);
        if(countKey!==previousCounts){report.reportedDuring.push({pass:pass+1,...counts});previousCounts=countKey;}
        for(const item of fandangoItemsFromDocument(doc,'movie'))productionIds.add(item.providerItemId);
        const links=[...doc.querySelectorAll('a[href*="/content/browse/details/"]')],inPass=new Set();let readable=0,reliableLinks=0;
        for(const link of links){
          const data=cardDataFromDetailLink(link),url=absoluteUrl(data.detailUrl),id=url.match(/\/content\/browse\/details\/[^/]+\/([a-z0-9_-]+)\/?$/iu)?.[1]??'';
          if(!id){if(!missing.has(link)){missing.add(link);report.missingIdentities++;}continue;}
          reliableLinks++;
          if(nodes.has(link)&&nodes.get(link)!==id)report.recycledNodes++;nodes.set(link,id);
          const title=compactText(data.title),seen=identities.get(id);
          if(seen){report.repeatedIdentities++;if(title&&!seen.titles.has(title))report.identityTitleChanges++;seen.titles.add(title);}
          else {identities.set(id,{titles:new Set([title])});if(!/^\d{1,20}$/u.test(id))report.nonNumericIdentities++;}
          if(title){readable++;const key=title.toLocaleLowerCase(),ids=titleIds.get(key)??new Set();ids.add(id);titleIds.set(key,ids);}
          const card=link.closest('[data-content-id],[data-title-id],[data-program-id]');
          const attribute=card?.getAttribute('data-content-id')??card?.getAttribute('data-title-id')??card?.getAttribute('data-program-id');
          if(attribute&&attribute!==id)report.attributeIdentityDisagreements++;
          inPass.add(id);
          const labels=context(link),key=JSON.stringify(labels),group=groups.get(key)??{...labels,observations:0,ids:new Set()};group.observations++;group.ids.add(id);groups.set(key,group);
        }
        report.maxLinksInOnePass=Math.max(report.maxLinksInOnePass,links.length);
        report.maxDuplicateLinksInOnePass=Math.max(report.maxDuplicateLinksInOnePass,reliableLinks-inPass.size);
        report.unreadableTitles=Math.max(report.unreadableTitles,links.length-readable);
        const target=gridScrollTarget(doc),isDocument=target===doc.scrollingElement||target===doc.documentElement||target===doc.body;
        const top=isDocument?global.scrollY:target.scrollTop,viewport=isDocument?global.innerHeight:target.clientHeight;
        const atBottom=top+viewport>=target.scrollHeight-4,more=loadMoreControl(doc),signature=[...inPass].sort().join('\u0000')+'|'+identities.size+'|'+countKey;
        stable=links.length&&atBottom&&!more&&signature===previous&&target===priorTarget&&target.scrollHeight===priorHeight?stable+1:0;
        report.passes.push({pass:pass+1,links:links.length,uniqueThisPass:inPass.size,uniqueSoFar:identities.size,atBottom,loadMore:Boolean(more)});
        reportProgress({passes:pass+1,count:identities.size});
        if(stable>=10){report.traversalFinished=true;report.reason='stable-bottom';break;}
        previous=signature;priorHeight=target.scrollHeight;priorTarget=target;
        if(more)more.click();else scrollGridForward(doc);
        await wait(pauseMs);
      }
    }catch{report.reason='page-unreadable';}
    report.uniqueIdentities=identities.size;
    report.productionExtractedIdentities=productionIds.size;
    report.sameTitleDifferentIdentities=[...titleIds.values()].filter(ids=>ids.size>1).length;
    const memberships=new Map();for(const group of groups.values())for(const id of group.ids)memberships.set(id,(memberships.get(id)??0)+1);
    report.groups=[...groups.values()].map(({ids,...group})=>({...group,uniqueIdentities:ids.size,exclusiveIdentities:[...ids].filter(id=>memberships.get(id)===1).length,productionCandidates:[...ids].filter(id=>productionIds.has(id)).length}));
    return report;
  }

  global.GalacticFandangoAtHome = { contentIdFromValue, fandangoItemFromCardData, fandangoItemsFromDocument, newFandangoItems, expectedFandangoCountsFromDocument, viewAllLibraryLinksFromDocument, readFandangoGrid, fetchFandangoLibrary, inspectFandangoListing };
}(globalThis));
