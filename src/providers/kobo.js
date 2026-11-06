/* Kobo importer. It reads only title cards rendered in a signed-in Kobo My
 * Books page. It never emulates an eReader or uses Kobo's device protocol. */
(function attachKoboImporter(global) {
  'use strict';

  const MAX_PAGES = 500;

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function absoluteUrl(value) {
    if (!compactText(value)) return '';
    try {
      const url = new URL(value ?? '', global.location?.origin ?? 'https://www.kobo.com');
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }

  function koboItemIdFromValue(value) {
    const text = String(value ?? '');
    const uuid = text.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/iu)?.[0];
    if (uuid) return uuid.toLowerCase();
    const productId = text.match(/(?:product|book|content)[_/-]?id[=:/]([a-z0-9_-]+)/iu)?.[1];
    if (productId) return productId;
    const route = text.match(/\/(?:ebook|audiobook)\/([^/?#]+)/iu)?.[1];
    return route ? route.toLocaleLowerCase() : '';
  }

  function mediaTypeFromUrlAndText(url, typeText) {
    const text = `${url} ${typeText}`.toLocaleLowerCase();
    if (/\/audiobook\b|\baudio\s*book\b/u.test(text)) return 'audiobook';
    if (/readnow\.kobo\.com\b|\/ebook\b|\/readnow\b|\be[- ]?book\b|\bbook\b/u.test(text)) return 'book';
    return null;
  }

  function stringValues(value) {
    if (Array.isArray(value)) return value.flatMap(stringValues).filter(Boolean);
    if (value && typeof value === 'object') return stringValues(value.name ?? value.title);
    const text = compactText(value);
    return text ? [text] : [];
  }

  function koboItemFromCardData(card) {
    const title = compactText(card?.title);
    const detailUrl = absoluteUrl(card?.detailUrl);
    const providerItemId = koboItemIdFromValue(card?.providerItemId) || koboItemIdFromValue(detailUrl);
    const mediaType = mediaTypeFromUrlAndText(detailUrl, card?.typeText);
    if (!providerItemId || !title || !mediaType) return null;
    const evidence=global.GalacticKoboOwnership?.classify(card)??{ownership:'unknown',ownershipBasis:'library-presence-only'};
    return {
      providerItemId,
      title,
      mediaType,
      ownership: evidence.ownership,
      metadata: {
        ...(global.GalacticProviderMetadata?.extract(card) ?? {}),
        source: 'kobo-my-books-library',
        ownershipBasis:evidence.ownershipBasis,
        ...(card?.titleEvidence ? {titleEvidence:card.titleEvidence} : {}),
        ...(stringValues(card?.genres).length ? {genres:stringValues(card.genres)} : {}),
        detailUrl,
        imageUrl: absoluteUrl(card?.imageUrl),
        authors: stringValues(card?.authors),
        series: stringValues(card?.series),
        format: mediaType === 'audiobook' ? 'audiobook' : 'ebook'
      }
    };
  }

  function namedTexts(container, selectors) {
    return [...container.querySelectorAll(selectors)]
      .filter(element => !element.querySelector(selectors))
      .map((element) => compactText(element.textContent ?? element.getAttribute('aria-label')))
      .filter((value, index, values) => value && values.indexOf(value) === index);
  }

  function cardDataFromLink(link) {
    let container = link.parentElement?.closest('article, li, [data-book-title], [data-testid*="book" i], [data-testid*="item" i], [class*="book" i], [class*="tile" i], [class*="item" i]') ?? link;
    // A Read Now button can sit inside a book-actions wrapper, with the
    // authors/genre in a sibling. Walk only within a single-book scope.
    for(let node=link.parentElement,depth=0;node&&depth<8;node=node.parentElement,depth++){
      const readLinks=node.querySelectorAll('a[data-book-title][href]');
      const bookLinks=readLinks.length?[...readLinks]:[...node.querySelectorAll('a[href*="/ebook/" i], a[href*="/audiobook/" i], a[href*="/ReadNow/" i]')];
      if(new Set(bookLinks.map(book=>koboItemIdFromValue(book.getAttribute('href')))).size>1)break;
      if(node.matches('article, li, [data-product-id], [data-content-id], [data-contributors], [data-author], [data-genre], .book-card, .book-item, .library-item')
        ||node.querySelector('[class*="author" i], [class*="contributor" i], [class*="genre" i], [data-testid*="author" i], [data-testid*="genre" i]')){
        container=node;break;
      }
    }
    // Never borrow ownership labels from a wrapper containing several books.
    if(new Set([...container.querySelectorAll('a[data-book-title][href]')].map(book=>koboItemIdFromValue(book.getAttribute('href')))).size>1)container=link;
    const image = container.querySelector('img');
    const attribute = (name) => compactText(link.getAttribute(name)) || compactText(container.getAttribute(name));
    // Read Now's accessible action label is not the bibliographic title.
    // Prefer Kobo's dedicated title attribute, retaining its literal value.
    const candidates = [
      {text:attribute('data-book-title') || attribute('data-title'), evidence:'title-attribute'},
      ...[...container.querySelectorAll('[data-testid*="title" i], [class*="title" i], h1, h2, h3, h4')]
        .filter(element => !element.closest('button') && !/^read\s+now\s*:/iu.test(compactText(element.textContent)))
        .map(element => ({text:compactText(element.textContent), evidence:'title-element'})),
      {text:compactText(image?.getAttribute('alt')), evidence:'cover-alt'},
      {text:compactText(link.getAttribute('aria-label')).replace(/^read\s+now\s*:\s*/iu,''), evidence:'action-label'}
    ];
    const selected = candidates.find(candidate => candidate.text && !/^read\s+now$/iu.test(candidate.text));
    const title = selected?.text ?? '';
    const values = (names, selectors) => {
      for (const name of names) {
        const value = attribute(name);
        if (!value) continue;
        if (value.startsWith('[')) {try {const parsed=JSON.parse(value);if(Array.isArray(parsed))return stringValues(parsed);} catch {}}
        // A singular name can contain commas; only Kobo's plural contributor
        // list uses comma separation. Genre labels are retained verbatim.
        return name==='data-contributors' ? value.split(/\s*,\s*/u) : [value];
      }
      return namedTexts(container,selectors);
    };
    return {
      ownershipType:attribute('data-ownership-type') || attribute('data-entitlement-type'),
      isPurchased:attribute('data-is-purchased')==='true'?true:attribute('data-is-purchased')==='false'?false:undefined,
      isKoboPlus:attribute('data-is-kobo-plus')==='true',
      ownershipLabels:namedTexts(container,'[data-testid*="ownership" i], [class*="ownership" i], [data-testid*="kobo-plus" i], [class*="kobo-plus" i], [data-testid*="subscription" i], [class*="subscription" i], [class*="purchased" i], [class*="badge" i]'),
      providerItemId: /readnow\.kobo\.com\b|\/readnow\//iu.test(link.getAttribute('href')??'') ? link.getAttribute('href') : container.getAttribute('data-product-id') ?? container.getAttribute('data-content-id') ?? container.getAttribute('data-id') ?? link.getAttribute('data-product-id') ?? link.getAttribute('href'),
      title,titleEvidence:selected?.evidence,
      detailUrl: link.getAttribute('href'),
      imageUrl: image?.currentSrc ?? image?.getAttribute('src'),
      typeText: [attribute('data-format'),attribute('data-type'),...namedTexts(container,'[data-testid*="format" i], [class*="format" i]')].join(' '),
      authors: values(['data-authors','data-author','data-contributors'], '[data-testid*="author" i], [class*="author" i], [class*="contributor" i]'),
      genres: values(['data-genres','data-genre'], '[data-testid*="genre" i], [class*="genre" i]'),
      series: values(['data-series-name','data-series'], '[data-testid*="series" i], [class*="series" i]')
    };
  }

  function koboItemsFromDocument(document, observations = false) {
    const readNowLinks = [...document.querySelectorAll('a[data-book-title][href]')];
    // Current Kobo My Books cards each carry a Read Now URL with the stable
    // library UUID. Store-detail links on the same cards are merely another
    // presentation path, not another entitlement.
    const links = readNowLinks.length
      ? readNowLinks
      : [...document.querySelectorAll('a[href*="/ebook/" i], a[href*="/audiobook/" i], a[href*="/ReadNow/" i]')];
    const itemsById = new Map(),rows=[];
    for (const link of links) {
      const item = koboItemFromCardData(cardDataFromLink(link));
      if (item) {itemsById.set(item.providerItemId, item);rows.push(item);}
    }
    return observations?rows:[...itemsById.values()];
  }

  function newKoboItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => compactText(id).toLocaleLowerCase()).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(compactText(item?.providerItemId).toLocaleLowerCase()));
  }

  function nextPageControl(document) {
    const controls = [...document.querySelectorAll('button, a')];
    const enabled = (element) => !element.hasAttribute('disabled')
      && element.getAttribute('aria-disabled') !== 'true'
      && !/(?:^|\s)(?:disabled|is-disabled)(?:\s|$)/u.test(String(element.className ?? ''));
    const isPagerControl = (element) => Boolean(element.closest('[class*="pagination" i], [data-testid*="pagination" i], nav[aria-label*="page" i]'));
    const nextControls = controls.filter((element) => {
      const controlText = [
        element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('rel'),
        element.getAttribute('data-testid'), element.getAttribute('data-test-id'), element.getAttribute('data-page'),
        element.className, element.textContent
      ].map(compactText).join(' ').toLocaleLowerCase();
      return enabled(element) && (element.getAttribute('rel') === 'next' || /\bnext\b|pagination[-_ ]?next/u.test(controlText));
    });
    const next = nextControls.find(isPagerControl) ?? nextControls[0];
    if (next) return next;

    // Some Kobo storefronts render only numbered page buttons. Restrict this
    // fallback to a pager-like ancestor so a number in a title card is never
    // mistaken for navigation.
    const pageControls = controls.flatMap((element) => {
      if (!isPagerControl(element)) return [];
      const number = Number(compactText(element.getAttribute('data-page') ?? element.textContent));
      return Number.isInteger(number) && number > 0 ? [{ element, number }] : [];
    });
    const activePage = pageControls.find(({ element }) => element.getAttribute('aria-current') === 'page' || /(?:^|\s)(?:active|current|selected)(?:\s|$)/u.test(String(element.className ?? '')))?.number;
    const pageParameters = new URL(global.location?.href ?? 'https://www.kobo.com').searchParams;
    const locationPage = Number(pageParameters.get('pageNumber') ?? pageParameters.get('page'));
    const current = activePage ?? (Number.isInteger(locationPage) && locationPage > 0 ? locationPage : 1);
    return pageControls.filter(({ element, number }) => enabled(element) && number > current).sort((left, right) => left.number - right.number)[0]?.element ?? null;
  }

  function pageCountFromDocument(document) {
    const numbers = [...document.querySelectorAll('.page-link, [class*="page-link" i], [data-page]')]
      .map((element) => Number(compactText(element.getAttribute('data-page') ?? element.textContent)))
      .filter((value) => Number.isInteger(value) && value > 0);
    return Math.max(1, ...numbers);
  }

  function librarySectionLinkFromDocument(document, sectionName) {
    return [...document.querySelectorAll('a[href]')].find((element) => {
      const label = compactText(element.getAttribute('aria-label') ?? element.textContent).toLocaleLowerCase();
      return label === sectionName.toLocaleLowerCase() && !element.closest('article, [class*="book" i], [class*="tile" i], [class*="item" i]');
    }) ?? null;
  }

  function addItems(itemsById, pageItems, librarySection) {
    for (const item of pageItems) {
      itemsById.set(item.providerItemId, {
        ...item,
        metadata: { ...item.metadata, librarySection }
      });
    }
  }

  function reportCounts(itemsById, reportProgress, progress) {
    const books = [...itemsById.values()].filter((item) => item.mediaType === 'book').length;
    const audiobooks = itemsById.size - books;
    reportProgress({ ...progress, books, audiobooks });
  }

  async function fetchLibraryDocument(url,timing,recover=false) {
    let end=timing?.begin('fetch_headers'),response;
    try{response=await fetch(url, { credentials: 'include', cache: 'no-store' });}catch{throw acquisitionError('transport','Kobo could not load a library page. Retry Full rescan.');}finally{end?.();}
    if (!response.ok) {const error=acquisitionError('http',`Kobo returned ${response.status} while loading your library.`);error.status=response.status;throw error;}
    end=timing?.begin('response_body');let body;
    try{body=await response.text();}catch{throw acquisitionError('transport','Kobo could not finish loading a library page. Retry Full rescan.');}finally{end?.();}
    end=timing?.begin('dom_parse');let document;
    try{document=new DOMParser().parseFromString(body,'text/html');}finally{end?.();}
    end=timing?.begin('page_checks');
    try{
    if (!document.querySelector('.filter-btn, [data-kobo-sort], a[data-book-title]') && !(recover?explicitEmpty(document):/\b(?:no books|no audiobooks|archive is empty|no items)\b/iu.test(document.body?.textContent ?? ''))) throw new Error('Kobo returned a page without readable library structure. No library changes were saved.');
    if(recover){
      if(response.url){const returned=new URL(response.url),requested=new URL(url);if(returned.origin!==requested.origin||returned.pathname!==requested.pathname)throw Error('Kobo left the requested library section. Sign in again and retry. Earlier records were kept.');}
      if([...document.querySelectorAll('input[type="password"]')].some(node=>!node.closest('[hidden],[aria-hidden="true"],template,[style*="display:none" i],[style*="display: none" i]')))throw Error('Kobo needs you to sign in again. Earlier records were kept.');
      return document;
    }
    for (const link of document.querySelectorAll('a[data-book-title][href]')) {
      if (!koboItemFromCardData(cardDataFromLink(link))) throw new Error('Kobo returned an unreadable library card. No library changes were saved.');
    }
    return document;
    }finally{end?.();}
  }

  function explicitEmpty(document){return [...document.querySelectorAll('p, [role="status"], .empty-state')].some(node=>!node.closest('[hidden],[aria-hidden="true"],script,template')&&/^(?:no books|no audiobooks|archive is empty|no items)[.!]?$/iu.test(compactText(node.textContent)));}
  function expectedCountFromDocument(document, recover=false) {
    for (const control of document.querySelectorAll('button, a, h1, h2')) {
      if(recover&&control.closest('[hidden],[aria-hidden="true"],template'))continue;
      const match = compactText(control.textContent).match(/^All Items\s*\(([\d,]+)\)/iu);
      if (match) return Number(match[1].replace(/,/gu, ''));
    }
    return (recover?explicitEmpty(document):/\b(?:no books|no audiobooks|archive is empty|no items)\b/iu.test(document.body?.textContent ?? '')) ? 0 : null;
  }

  async function fetchKoboLinkedSection(itemsById, reportProgress, rootDocument, linkLabel, librarySection,timing) {
    const sectionLink = librarySectionLinkFromDocument(rootDocument, linkLabel);
    if (!sectionLink) return { pagesRead: 0, available: false, document: null };
    let url = absoluteUrl(sectionLink.getAttribute('href'));
    if (!url) throw new Error(`Kobo exposed an unreadable ${linkLabel} link.`);
    const seenUrls = new Set();
    let pagesRead = 0;
    let firstDocument = null;
    const sectionIds = new Set();
    let expectedCount;
    while (url) {
      if (seenUrls.has(url)) throw new Error(`Kobo repeated a ${linkLabel} page before reaching its end.`);
      if (pagesRead >= MAX_PAGES) throw new Error(`Kobo reached the ${MAX_PAGES}-page limit in ${linkLabel}.`);
      seenUrls.add(url);
      const document = await fetchLibraryDocument(url,timing);
      if (!firstDocument) firstDocument = document;
      const count = expectedCountFromDocument(document);
      if (pagesRead > 0 && count !== expectedCount) throw new Error(`Kobo changed the ${linkLabel} total during the scan.`);
      expectedCount = count;
      const pageItems = koboItemsFromDocument(document);
      if (!pageItems.length && expectedCount !== 0) throw new Error(`Kobo returned an unreadable ${linkLabel} page without an explicit zero count.`);
      if (pageItems.length && pageItems.every((item) => sectionIds.has(item.providerItemId))) throw new Error(`Kobo repeated ${linkLabel} cards before reaching the end.`);
      pageItems.forEach((item) => sectionIds.add(item.providerItemId));
      addItems(itemsById, pageItems, librarySection);
      pagesRead += 1;
      reportCounts(itemsById, reportProgress, { pagesRead: null, sectionPagesRead: pagesRead, section: linkLabel });
      const next = nextPageControl(document);
      if (next && next.tagName !== 'A') throw new Error(`Kobo exposed unsupported ${linkLabel} pagination; the snapshot was kept.`);
      url = next?.tagName === 'A' ? absoluteUrl(next.getAttribute('href')) : '';
      if (next && !url) throw new Error(`Kobo exposed an unreadable ${linkLabel} page link.`);
      if (!next && pagesRead < pageCountFromDocument(document)) throw new Error(`Kobo stopped before the reported last ${linkLabel} page.`);
    }
    return { pagesRead, available: true, document: firstDocument, scope: global.GalacticProviderSnapshot.completedScope(librarySection, sectionIds.size, expectedCount, 'pagination-end', pagesRead) };
  }

  async function fetchKoboLibrary(reportProgress = () => {}, knownItemIds = null,timing,options={}) {
    if(options.recover)return recoverKoboLibrary(reportProgress,knownItemIds,timing,options);
    const itemsById = new Map();
    const incremental = Array.isArray(knownItemIds);
    const initialUrl = new URL(global.location.href);
    initialUrl.searchParams.set('pageNumber', '1');
    initialUrl.searchParams.set('sort', 'DateAddedDesc');
    const firstDocument = await fetchLibraryDocument(initialUrl.toString(),timing);
    const totalPages = pageCountFromDocument(firstDocument);
    if (totalPages > MAX_PAGES) throw new Error(`Kobo reported ${totalPages} pages, exceeding the ${MAX_PAGES}-page scan limit.`);
    const expectedCount = expectedCountFromDocument(firstDocument);
    const pageSignatures = new Set();
    for (let page = 1; page <= totalPages; page += 1) {
      const pageUrl = new URL(initialUrl);
      pageUrl.searchParams.set('pageNumber', String(page));
      const document = page === 1 ? firstDocument : await fetchLibraryDocument(pageUrl.toString(),timing);
      const extractionEnd=timing?.begin('extraction');let pageItems;
      try{pageItems=koboItemsFromDocument(document);}finally{extractionEnd?.();}
      if (expectedCountFromDocument(document) !== expectedCount || pageCountFromDocument(document) > totalPages) throw new Error('Kobo changed its library totals during the scan. Please retry.');
      if (!pageItems.length && (page < totalPages || expectedCount !== 0)) throw new Error('Kobo returned an empty or unreadable library page before completing the scan.');
      const signature = pageItems.map((item) => item.providerItemId).sort().join('|');
      if (pageItems.length && pageSignatures.has(signature)) throw new Error('Kobo repeated a library page before completing the scan.');
      pageSignatures.add(signature);
      const itemsToSave = incremental ? newKoboItems(pageItems, knownItemIds) : pageItems;
      // Refresh entitlement evidence for every observed card, including known
      // subscriptions; the known-page rule still bounds the quick scan.
      addItems(itemsById, pageItems, 'my-books');
      reportCounts(itemsById, reportProgress, { pagesRead: page, archivePagesRead: 0, section: 'My Books' });
      // Kobo explicitly orders this view Date Added descending. A complete
      // known page is therefore a safe quick-update stopping point.
      if (incremental && itemsToSave.length === 0) break;
    }
    if (incremental) return { items: [...itemsById.values()], archivePagesRead: 0, archiveAvailable: false, audiobookPagesRead: 0, audiobookAvailable: false, quick: true };
    const scopes = [global.GalacticProviderSnapshot.completedScope('my-books', itemsById.size, expectedCount, 'pagination-end', totalPages)];
    const myBooksArchive = await fetchKoboLinkedSection(itemsById, reportProgress, firstDocument, 'Archive', 'archive',timing);
    const audiobooks = await fetchKoboLinkedSection(itemsById, reportProgress, firstDocument, 'Audiobooks', 'audiobooks',timing);
    const audiobookArchive = audiobooks.document
      ? await fetchKoboLinkedSection(itemsById, reportProgress, audiobooks.document, 'Archive', 'audiobooks-archive',timing)
      : { pagesRead: 0, available: false };
    // An empty My Books section does not imply an empty linked library.
    // Keep the conservative Full-scan guard after all applicable sections.
    if (!itemsById.size) {
      throw new Error('Kobo showed no readable book or audiobook cards. Open My Books, wait for the library to load, then try again.');
    }
    return {
      items: [...itemsById.values()],
      archivePagesRead: myBooksArchive.pagesRead + audiobookArchive.pagesRead,
      archiveAvailable: myBooksArchive.available || audiobookArchive.available,
      audiobookPagesRead: audiobooks.pagesRead,
      audiobookAvailable: audiobooks.available,
      snapshot: global.GalacticProviderSnapshot.completeProviderSnapshot('kobo', [...itemsById.values()], [...scopes, ...[myBooksArchive, audiobooks, audiobookArchive].flatMap((section) => section.scope ? [section.scope] : [])])
    };
  }

  function acquisitionError(reason,message){const error=new Error(message);error.koboReason=reason;return error;}
  function validLibraryItem(item){
    return Boolean(item&&typeof item.providerItemId==='string'&&/^[\p{L}\p{N}_%.-]{1,256}$/u.test(item.providerItemId)
      &&typeof item.title==='string'&&item.title.trim()&&['book','audiobook'].includes(item.mediaType)
      &&item.metadata?.source==='kobo-my-books-library'&&['my-books','archive','audiobooks','audiobooks-archive'].includes(item.metadata.librarySection)
      &&['unknown','owned','subscription','borrowed','rental'].includes(item.ownership)
      &&global.GalacticKoboOwnership?.fromMetadata(item.ownership,item.metadata)===item.ownership);
  }
  // Kobo's scopes share identities, not coverage. A readable scope can survive
  // a transport failure in another; auth and unrecognized envelopes stay fatal.
  async function recoverKoboLibrary(reportProgress,knownItemIds,timing,options){
    const items=new Map(),observed=new Map(),conflicts=new Set(),scopes=[];
    const incremental=Array.isArray(knownItemIds),recoverable=error=>error.koboReason==='transport'||error.koboReason==='http'&&[429,500,502,503,504].includes(error.status);
    const initial=new URL(global.location.href);initial.searchParams.set('pageNumber','1');initial.searchParams.set('sort','DateAddedDesc');
    if(['search','searchTerm','query','q','keyword'].some(key=>initial.searchParams.get(key)?.trim()))throw Error('Clear Kobo library search before importing. Earlier records were kept.');
    const root=await fetchLibraryDocument(initial.href,timing,true);
    const navigation=(href,base)=>{let url;try{url=new URL(href,base);}catch{throw Error('Kobo exposed an unreadable library link. Earlier records were kept.');}
      if(url.origin!==new URL(base).origin)throw Error('Kobo exposed a different library site. Earlier records were kept.');return url;};
    async function walk(id,first,url,main=false){
      const scope={id,readCount:0,expectedCount:null,pagesRead:0,complete:false,limitReached:false,end:'partial-acquisition',reason:'request-failed',failedItems:0};scopes.push(scope);
      const seenUrls=new Set(),ids=new Set(),signatures=new Set();let doc=first,firstDoc=first,totalPages=null;
      while(url){
        if(scope.pagesRead>=MAX_PAGES){scope.limitReached=true;scope.reason='page-limit';break;}
        if(seenUrls.has(url.href)){scope.reason='repeated-page';break;}seenUrls.add(url.href);
        if(!doc){try{doc=await fetchLibraryDocument(url.href,timing,true);}catch(error){if(!recoverable(error))throw error;break;}}
        firstDoc??=doc;
        const count=expectedCountFromDocument(doc,true),pages=pageCountFromDocument(doc);
        if(scope.pagesRead&&(count!==scope.expectedCount||main&&pages>totalPages))throw Error('Kobo changed its library totals during the scan. Earlier records were kept. Retry Full rescan.');
        if(!scope.pagesRead){scope.expectedCount=count;totalPages=pages;}
        const rows=koboItemsFromDocument(doc,true).map(item=>({...item,metadata:{...item.metadata,librarySection:id}}));
        const valid=[];
        for(let offset=0;offset<rows.length;offset+=100){const batch=rows.slice(offset,offset+100),reply=await chrome.runtime.sendMessage({type:'VALIDATE_KOBO_ITEMS',items:batch});
          if(!reply?.ok||!Array.isArray(reply.statuses)||reply.statuses.length!==batch.length||reply.statuses.some(v=>typeof v!=='boolean'))throw Error('Kobo entries could not be validated. Reload My Books and retry.');
          batch.forEach((item,n)=>{if(reply.statuses[n])valid.push(item);else scope.failedItems++;});}
        const links=[...doc.querySelectorAll('a[data-book-title][href]')];
        scope.failedItems+=links.filter(link=>!koboItemFromCardData(cardDataFromLink(link))).length;
        const signature=valid.map(item=>item.providerItemId).sort().join('|');
        if(valid.length&&signatures.has(signature)){scope.reason='repeated-page';break;}signatures.add(signature);
        scope.pagesRead++;valid.forEach(item=>ids.add(item.providerItemId));scope.readCount=ids.size;
        for(const item of valid){
          const prior=observed.get(item.providerItemId),content=value=>JSON.stringify([value.title,value.mediaType,value.ownership,value.metadata.ownershipBasis,value.metadata.authors,value.metadata.series]);
          if(prior&&content(prior)!==content(item)){conflicts.add(item.providerItemId);items.delete(item.providerItemId);}
          observed.set(item.providerItemId,item);if(!conflicts.has(item.providerItemId))items.set(item.providerItemId,item);
        }
        reportCounts(items,reportProgress,{pagesRead:main?scope.pagesRead:null,sectionPagesRead:scope.pagesRead,section:id==='my-books'?'My Books':id});
        if(!rows.length&&!scope.failedItems&&count!==0){scope.reason='empty-unconfirmed';break;}
        if(incremental&&!scope.failedItems&&!conflicts.size&&valid.length&&newKoboItems(valid,knownItemIds).length===0){scope.complete=true;scope.end='known-page';break;}
        const next=nextPageControl(doc);
        if(main&&scope.pagesRead<totalPages){url=new URL(initial);url.searchParams.set('pageNumber',String(scope.pagesRead+1));}
        else if(!main&&next?.tagName==='A'){const target=navigation(next.getAttribute('href'),url);if(target.pathname!==url.pathname)throw Error('Kobo changed the library section during pagination. Earlier records were kept.');url=target;}
        else if(next||scope.pagesRead<pages){scope.reason='pagination-unverified';break;}
        else{const terminal=count!==null||pages>1||[...doc.querySelectorAll('[class*="pagination" i] [disabled], [class*="pagination" i] [aria-disabled="true"], nav[aria-label*="page" i] [disabled]')].some(node=>/next/iu.test([node.textContent,node.getAttribute('aria-label'),node.getAttribute('rel')].join(' ')));
          scope.complete=!scope.failedItems&&terminal&&(count===null||count===ids.size);scope.reason=scope.failedItems?'unreadable-items':!terminal?'pagination-unverified':count!==null&&count!==ids.size?'count-mismatch':'';scope.end=scope.complete?'pagination-end':'partial-acquisition';break;}
        doc=null;
      }
      return {document:firstDoc,scope};
    }
    await walk('my-books',root,initial,true);
    async function linked(doc,label,id){const link=doc&&librarySectionLinkFromDocument(doc,label);if(!link)return null;return walk(id,null,navigation(link.getAttribute('href'),initial));}
    if(!incremental){await linked(root,'Archive','archive');const audio=await linked(root,'Audiobooks','audiobooks');await linked(audio?.document,'Archive','audiobooks-archive');}
    for(const id of options.requiredScopes??[])if(!scopes.some(scope=>scope.id===id))scopes.push({id,readCount:0,expectedCount:null,pagesRead:0,complete:false,limitReached:false,end:'partial-acquisition',reason:'scope-unavailable',failedItems:0});
    if(conflicts.size)for(const scope of scopes){scope.complete=false;scope.end='partial-acquisition';scope.reason='conflicting-items';}
    const incomplete=scopes.some(scope=>!scope.complete),values=[...items.values()];
    if(incomplete&&!values.length){const error=Error('No readable Kobo books could be saved. Earlier records were kept. Run Full rescan to retry the unchecked library sections.');error.koboScopes=scopes.filter(scope=>!scope.complete).map(scope=>scope.id);throw error;}
    const result={items:values,incomplete,archivePagesRead:scopes.filter(s=>s.id.includes('archive')).reduce((n,s)=>n+s.pagesRead,0),archiveAvailable:scopes.some(s=>s.id.includes('archive')),audiobookPagesRead:scopes.find(s=>s.id==='audiobooks')?.pagesRead??0,audiobookAvailable:scopes.some(s=>s.id==='audiobooks'),quick:incremental};
    if(incomplete)result.snapshot={version:1,provider:'kobo',complete:false,itemCount:values.length,scopes,recovery:{conflicts:conflicts.size}};
    else if(!incremental)result.snapshot=global.GalacticProviderSnapshot.completeProviderSnapshot('kobo',values,scopes);
    return result;
  }

  global.GalacticKobo = { validLibraryItem, koboItemIdFromValue, koboItemFromCardData, koboItemsFromDocument, newKoboItems, fetchKoboLibrary };
}(globalThis));
