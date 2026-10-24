/* Audible importer. It reads only the paginated library pages available in an
 * already signed-in Audible tab. It never handles a password, cookie, token,
 * or Audible device authorization. */
(function attachAudibleImporter(global) {
  'use strict';

  const PAGE_SIZE = 50;
  const MAX_PAGES = 500;
  const BETWEEN_PAGES_MS = 250;

  function textOf(element) {
    return String(element?.getAttribute?.('aria-label') ?? element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  }

  function audibleItemIdFromUrl(value) {
    try {
      const url = new URL(value, global.location?.origin ?? 'https://www.audible.com');
      const asin = url.pathname.match(/\/([A-Z0-9]{10})(?:\/|$)/iu)?.[1];
      return asin ? asin.toUpperCase() : url.pathname.replace(/^\/+|\/+$/gu, '');
    } catch {
      return '';
    }
  }

  function audibleItemFromLibraryEntry(entry) {
    let detailUrl;
    try {
      const url = new URL(entry?.url, global.location?.origin ?? 'https://www.audible.com');
      detailUrl = `${url.origin}${url.pathname}`;
    } catch {
      detailUrl = '';
    }
    const providerItemId = audibleItemIdFromUrl(detailUrl);
    const title = String(entry?.title ?? '').replace(/\s+/gu, ' ').trim();
    if (!providerItemId || !title) return null;
    return {
      providerItemId,
      title,
      mediaType: 'audiobook',
      ownership: entry?.ownership === 'subscription' ? 'subscription' : 'unknown',
      metadata: {
        ...(global.GalacticProviderMetadata?.extract(entry) ?? {}),
        source: 'audible-library-page',
        ...(/^[A-Z0-9]{10}$/u.test(providerItemId)?{asin:providerItemId}:{}),
        detailUrl,
        authors: global.GalacticProviderMetadata?.extract(entry).authors ?? (Array.isArray(entry.authors) ? entry.authors.filter(Boolean) : []),
        narrators: Array.isArray(entry.narrators) ? entry.narrators.filter(Boolean) : [],
        series: global.GalacticProviderMetadata?.extract(entry).series ?? (Array.isArray(entry.series) ? entry.series.filter(Boolean) : []),
        libraryAction: String(entry?.libraryAction ?? '')
      }
    };
  }

  function ownershipFromLibraryAction(actionText) {
    const action=String(actionText??'').replace(/\s+/gu,' ').trim();
    // List management and a bare Remove button do not establish access rights.
    if(/\bfavou?rites?\b|\bwish\s?list\b|\bcollections?\b/iu.test(action))return 'unknown';
    return /^(?:remove from (?:your )?(?:audible )?plus (?:catalog|catalogue)(?: library)?|included (?:in|with) (?:your )?(?:audible )?plus (?:membership|subscription|catalog|catalogue))[.!]?$/iu.test(action)?'subscription':'unknown';
  }

  function newAudibleItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => String(id).trim().toUpperCase()).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(String(item?.providerItemId ?? '').trim().toUpperCase()));
  }

  function libraryActionFromContainer(container) {
    const actions=[...container.querySelectorAll('button, [role="button"], a:not([href*="/pd/"])')].map(element=>textOf(element));
    return actions.find(text=>ownershipFromLibraryAction(text)==='subscription')
      ?? actions.find(text=>/\bremove\b/iu.test(text)) ?? '';
  }

  function namedLinks(container, selector) {
    return [...container.querySelectorAll(selector)]
      .map((element) => textOf(element))
      .filter((name, index, values) => name.length > 1 && values.indexOf(name) === index);
  }

  function libraryProductLinks(document) {
    // Product carousels elsewhere on the page are not library observations.
    // Prefer the provider's item rows; never fall back to the whole document.
    const selector=document.querySelector('.adbl-library-content-row')
      ? '.adbl-library-content-row a[href*="/pd/"]'
      : '#library-content a[href*="/pd/"], [data-testid="library-titles"] a[href*="/pd/"]';
    return [...document.querySelectorAll(selector)];
  }

  function entriesFromLibraryDocument(document, links) {
    const entriesById = new Map();
    for (const link of links) {
      const url = new URL(link.getAttribute('href') ?? '', global.location?.origin ?? 'https://www.audible.com').toString();
      const title = textOf(link);
      const container = link.closest('.adbl-library-content-row') ?? link.closest('li, [data-testid*="library"], [class*="library"], [class*="tile"], [class*="item"]') ?? link.parentElement ?? link;
      const libraryAction = libraryActionFromContainer(container);
      const item = audibleItemFromLibraryEntry({
        url,
        title,
        ownership: ownershipFromLibraryAction(libraryAction),
        libraryAction,
        authors: namedLinks(container, 'a[href^="/author/"], a[href*="searchAuthor="], a[href*="libItem_author"]'),
        narrators: namedLinks(container, 'a[href*="searchNarrator="], a[href*="libItem_narrator"]'),
        series: namedLinks(container, 'a[href^="/series/"], a[href*="libItem_series"]')
      });
      if (item) entriesById.set(item.providerItemId, item);
    }
    return [...entriesById.values()];
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  let lastDiagnostics=null;
  const fail=(reason,message)=>{const error=new Error(message);error.audibleReason=reason;throw error;};
  const pageNumber=value=>typeof value==='string'&&/^\d{1,6}$/u.test(value)&&Number(value)>0?Number(value):null;
  // Report where numeric count matches occur, never their surrounding text.
  // A parsed document includes script text and hidden UI, unlike the visible page.
  function countDiagnostics(document){
    const candidates=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;while((node=walker.nextNode())&&candidates.length<20){
      const parent=node.parentElement;if(!parent)continue;
      for(const match of node.textContent.matchAll(/\b([\d,]+)\s+(?:titles|audiobooks)\b/giu)){
        const value=Number(match[1].replace(/,/gu,''));
        candidates.push({value:Number.isSafeInteger(value)?value:null,tag:parent.tagName.toLowerCase(),inScriptOrStyle:Boolean(parent.closest('script,style,template,noscript')),hiddenMarkup:Boolean(parent.closest('[hidden],[aria-hidden="true"],[style*="display:none" i],[style*="display: none" i]')),inControl:Boolean(parent.closest('button,select,option,input,[role="button"]')),inLibrary:Boolean(parent.closest('#library-content,[data-testid="library-titles"]')),inEntry:Boolean(parent.closest('.adbl-library-content-row,a[href*="/pd/"]'))});
        if(candidates.length===20)break;
      }
    }
    return candidates;
  }
  function libraryTotal(document){
    const totals=new Set();
    // Allow inline markup in a single library summary, but never manufacture a
    // count by joining unrelated page blocks (for example a counter and heading).
    for(const summary of document.querySelectorAll('#library-content p,#library-content h1,#library-content h2,#library-content h3,#library-content [role="status"],[data-testid="library-titles"] p,[data-testid="library-titles"] h1,[data-testid="library-titles"] h2,[data-testid="library-titles"] h3,[data-testid="library-titles"] [role="status"]')){
      if(summary.closest('.adbl-library-content-row,[hidden],[aria-hidden="true"],button,select,[role="button"],[style*="display:none" i],[style*="display: none" i]')||summary.querySelector('a,button,select,input,script,style,template,[hidden],[aria-hidden="true"],[role="button"],[style*="display:none" i],[style*="display: none" i],p,h1,h2,h3,[role="status"]'))continue;
      for(const match of summary.textContent.matchAll(/\b([\d,]+)\s+(?:titles|audiobooks)\b/giu))totals.add(Number(match[1].replace(/,/gu,'')));
    }
    if([...totals].some(value=>!Number.isSafeInteger(value)||value<0))fail('reported-total-invalid','Audible returned invalid library totals. No library changes were saved.');
    if(totals.size>1)fail('reported-total-conflict','Audible returned conflicting library totals. No library changes were saved.');
    return totals.size?[...totals][0]:null;
  }
  function pagination(document,page){
    let next=false,disabledNext=0,ignoredNext=0,invalid=false,ignoredBackwardPlaceholders=0;
    const targets=new Set(),selected=[],problems=new Set(),invalidControls=[];
    for(const control of document.querySelectorAll('a, button')){
      const label=`${control.textContent??''} ${control.getAttribute('aria-label')??''} ${control.className??''}`;
      const nextLabel=/\bnext\b|pagingNext|pagination-next/iu.test(label);
      const previousLabel=/\bprevious\b|\bprev\b|\bfirst\b|pagingPrevious|pagination-prev/iu.test(label);
      const pager=control.closest('.bc-pagination, .pagingElements, [data-testid*="pagination"], nav[aria-label*="pagination" i], [role="navigation"][aria-label*="pagination" i]');
      let url;try{if(control.getAttribute('href'))url=new URL(control.getAttribute('href'),global.location.origin);}catch{/* An unrelated or malformed link cannot advance the library. */}
      const libraryLink=url&&url.origin===global.location.origin&&/^\/library(?:\/titles)?\/?$/u.test(url.pathname);
      if(!libraryLink&&!pager){if(nextLabel)ignoredNext++;continue;}
      if(control.getAttribute('aria-current')==='page'){const current=pageNumber(String(control.textContent??'').trim());if(current!==null)selected.push(current);}
      const disabled=control.hasAttribute('disabled')||control.getAttribute('aria-disabled')==='true'||Boolean(control.closest('[class*="disabled" i]'));
      if(disabled){if(nextLabel)disabledNext++;continue;}
      // Disabled controls can retain placeholder URLs such as Previous?page=0.
      // Validate only active destinations; they are the requests we could follow.
      const raw=libraryLink?url.searchParams.get('page'):null,target=pageNumber(raw);
      if(page===1&&previousLabel&&!nextLabel&&raw==='0'){ignoredBackwardPlaceholders++;continue;}
      // Library sort/filter links also reset page parameters; they are not a
      // continuation unless they are inside the pager or explicitly labelled Next.
      if(raw!==null&&target===null&&(nextLabel||pager)){
        invalid=true;problems.add('invalid-page-parameter');
        if(invalidControls.length<10)invalidControls.push({direction:nextLabel?'next':previousLabel?'previous':'other',valueKind:raw===''?'empty':raw==='0'?'zero':/^\d+$/u.test(raw)?'out-of-range':'non-numeric',inPager:Boolean(pager)});
      }
      if(target!==null){targets.add(target);if(nextLabel&&target<=page){invalid=true;problems.add('non-advancing-next');}}
      if(nextLabel||!previousLabel&&target!==null&&target>page)next=true;
    }
    for(const current of document.querySelectorAll('.bc-pagination [aria-current="page"], .pagingElements [aria-current="page"]')){const number=pageNumber(String(current.textContent??'').trim());if(number!==null)selected.push(number);}
    const selectedPages=[...new Set(selected)];if(selectedPages.length>1){invalid=true;problems.add('conflicting-current-pages');}
    // A disabled library Next control is independent terminal evidence. Mere
    // absence of a Next label is not enough to forgive a repeated response.
    return {next,disabledNext,ignoredNext,ignoredBackwardPlaceholders,invalid,problems:[...problems],invalidControls,selectedPage:selectedPages[0]??null,targets:[...targets].sort((a,b)=>a-b).slice(0,20),terminal:disabledNext>0&&!next};
  }
  function diagnosticPage(data,page,previous,seen){
    const ids=new Set(data.items.map(item=>item.providerItemId)),same=Boolean(previous&&previous.size===ids.size&&[...ids].every(id=>previous.has(id)));
    const row={
      requestedPage:page,responsePage:data.responsePage,selectedPage:data.pagination.selectedPage,
      rows:ids.size,newProducts:[...ids].filter(id=>!seen.has(id)).length,
      sameProductsAsPrevious:same,overlapWithPrevious:previous?[...ids].filter(id=>previous.has(id)).length:0,
      reportedTotal:data.expectedCount,countCandidates:data.countCandidates,entryScope:data.entryScope,
      enabledLibraryNext:data.next,disabledLibraryNext:data.pagination.disabledNext,
      ignoredOtherNext:data.pagination.ignoredNext,ignoredBackwardPlaceholders:data.pagination.ignoredBackwardPlaceholders,
      nextPageTargets:data.pagination.targets,invalidPagination:data.pagination.invalid,
      paginationProblems:data.pagination.problems,invalidControls:data.pagination.invalidControls,
      terminalSignal:data.pagination.terminal
    };
    return {ids,row};
  }
  async function inspectPagination(){
    lastDiagnostics={format:1,provider:'audible',readOnly:true,state:'checking',pages:[]};let previous=null;const seen=new Set();
    for(const page of [1,18,19,20]){
      try{const data=await fetchAudibleLibraryPage(page),result=diagnosticPage(data,page,previous,seen);lastDiagnostics.pages.push(result.row);previous=result.ids;for(const id of result.ids)seen.add(id);}
      catch(error){lastDiagnostics.pages.push({requestedPage:page,error:error.audibleReason??'request-failed'});}
      if(page<20)await wait(BETWEEN_PAGES_MS);
    }
    lastDiagnostics.state='checked';return getDiagnostics();
  }
  function getDiagnostics(){return lastDiagnostics?JSON.parse(JSON.stringify(lastDiagnostics)):null;}
  function recordSaveState(state){if(lastDiagnostics&&!lastDiagnostics.readOnly&&['not-sent','committed','not-confirmed'].includes(state))lastDiagnostics.saveState=state;}

  async function fetchAudibleLibraryPage(page) {
    const url = new URL('/library/titles', location.origin);
    url.searchParams.set('pageSize', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sortBy', 'PURCHASE_DATE.dsc');
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) fail('http-error',`Audible returned ${response.status} while loading your library. Confirm that you are signed in to Audible.`);
    let filtered=false;
    try{const returned=new URL(response.url);filtered=['search','searchTerm','query','q','filter','filterBy'].some(key=>{const value=returned.searchParams.get(key)?.trim();return value&&!/^all$/iu.test(value);});}catch{/* Opaque responses may not expose a final URL. */}
    if(filtered)fail('filtered-library','Audible returned a filtered library instead of the complete listing. Clear library search and filters, then retry. Your saved library was not replaced.');
    const document = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!document.querySelector('select[name="sortBy"], .adbl-library-content-row, #library-content, [data-testid="library-titles"]')) fail('library-structure-missing','Audible returned a page without its library structure. No library changes were saved.');
    if([...document.querySelectorAll('form[action*="/library"] input[name="search"],form[action*="/library"] input[name="searchTerm"],form[action*="/library"] input[name="query"]')].some(input=>input.getAttribute('value')?.trim()))fail('filtered-library','Audible returned library search results instead of the complete listing. Clear the library search and retry. Your saved library was not replaced.');
    const links=libraryProductLinks(document);
    const items = entriesFromLibraryDocument(document,links);
    const readableIds = new Set(items.map((item) => item.providerItemId));
    for (const link of links) {
      const id = audibleItemIdFromUrl(link.getAttribute('href'));
      if (!id || !readableIds.has(id)) fail('unreadable-library-entry','Audible returned unreadable library entries. No library changes were saved.');
    }
    const countCandidates=countDiagnostics(document),expectedCount=libraryTotal(document);
    const paging=pagination(document,page);
    let responsePage=null;try{responsePage=pageNumber(new URL(response.url).searchParams.get('page'));}catch{/* Some fixture or opaque responses have no final URL. */}
    if (!items.length && expectedCount !== 0) fail('empty-unconfirmed','Audible returned an empty or unreadable library page without an explicit zero count. No library changes were saved.');
    const entryScope={libraryRowElements:document.querySelectorAll('.adbl-library-content-row').length,productLinks:document.querySelectorAll('a[href*="/pd/"]').length,productLinksInRows:document.querySelectorAll('.adbl-library-content-row a[href*="/pd/"]').length,productLinksInLibrary:document.querySelectorAll('#library-content a[href*="/pd/"],[data-testid="library-titles"] a[href*="/pd/"]').length};
    return { items, expectedCount, countCandidates,entryScope,next:paging.next, pagination:paging,responsePage };
  }

  async function fetchAudibleAudiobooks(reportProgress = () => {}, knownItemIds = null) {
    const itemsById = new Map();
    const checkedIds=new Set();
    const incremental = Array.isArray(knownItemIds);
    let finished = false;
    let pagesRead = 0;
    let expectedCount,previous=null;
    lastDiagnostics={format:1,provider:'audible',mode:incremental?'incremental':'full',state:'scanning',saveState:'not-sent',pages:[]};
    try{
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      lastDiagnostics.lastRequestedPage=page;
      reportProgress({ pagesRead: page - 1, audiobooks: itemsById.size });
      const pageData = await fetchAudibleLibraryPage(page);
      const observed=diagnosticPage(pageData,page,previous,new Set(itemsById.keys()));lastDiagnostics.pages.push(observed.row);previous=observed.ids;
      if(pageData.pagination.invalid)fail('pagination-invalid',`Audible returned invalid library pagination on page ${page}. Your saved library was not replaced. Please retry the full rescan.`);
      const pageItems = pageData.items;
      for(const item of pageItems)checkedIds.add(item.providerItemId);
      if (page > 1 && pageData.expectedCount !== expectedCount) fail('reported-total-changed','Audible changed its reported library total during the scan. Please retry.');
      expectedCount = pageData.expectedCount;
      pagesRead = page;
      const itemsToSave = incremental ? newAudibleItems(pageItems, knownItemIds) : pageItems;
      let added = 0;
      for (const item of itemsToSave) {
        if (!itemsById.has(item.providerItemId)) added += 1;
        itemsById.set(item.providerItemId, item);
      }
      reportProgress({ pagesRead: page, audiobooks: itemsById.size });
      if (incremental && pageItems.length && !itemsToSave.length) { finished = true; break; }
      if(added===0){
        if(!incremental&&pageData.pagination.terminal&&expectedCount!==null&&itemsById.size===expectedCount){finished=true;break;}
        fail(observed.row.sameProductsAsPrevious?'server-repeat':'fully-overlapping-page','Audible repeated a page before a complete library could be established. Your saved library was not replaced. Please retry the full rescan.');
      }
      if(pageData.pagination.selectedPage!==null&&pageData.pagination.selectedPage!==page)fail('returned-page-mismatch','Audible returned a different library page than requested. No library changes were saved.');
      if (!pageData.next) { finished = true; break; }
      await wait(BETWEEN_PAGES_MS);
    }
    if (!finished) throw new Error(`Audible reached its ${MAX_PAGES}-page limit before the end of the library.`);
    if (!itemsById.size && !incremental) throw new Error('Audible returned no readable library titles. Please try again later.');
    const items = [...itemsById.values()];
    const result={ items, checkedCount:checkedIds.size,snapshot: incremental ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('audible', items, [global.GalacticProviderSnapshot.completedScope('library', items.length, expectedCount, 'pagination-end', pagesRead)]) };
    lastDiagnostics.state='prepared';return result;
    }catch(error){lastDiagnostics.state='failed';lastDiagnostics.reason=error.audibleReason??'scan-incomplete';throw error;}
  }

  // Feasibility only: inspect the rendered purchase page, never follow links,
  // fetch orders, assign ownership or retain transaction/identifier values.
  function inspectPurchaseHistory(document,{url=global.location?.href,knownItemIds=null}={}){
    const report={format:1,provider:'audible',purpose:'ownership-feasibility',readOnly:true,historyComplete:false,accountVerified:false,state:'wrong-page'};
    let page;try{page=new URL(url);}catch{return report;}
    if(page.origin!=='https://www.audible.com'||!/^\/account\/purchase-history\/?$/u.test(page.pathname))return report;
    const label=element=>String(element?.textContent??'').replace(/\s+/gu,' ').trim().slice(0,200);
    const visible=element=>!element.closest('[hidden],[aria-hidden="true"]')&&(!document.defaultView||element.getClientRects().length>0);
    const rowSelector='tr,[role="row"],.bc-row-responsive,.bc-row';
    const cells=row=>[...row.children].filter(visible);
    const known=Array.isArray(knownItemIds)?new Set(knownItemIds.filter(id=>typeof id==='string'&&/^[A-Z0-9]{10}$/u.test(id))):null;
    const asinFromLink=link=>{try{const u=new URL(link.getAttribute('href'),page.origin);if(u.origin===page.origin&&/^\/pd\//u.test(u.pathname)){const id=audibleItemIdFromUrl(u.href);if(/^[A-Z0-9]{10}$/u.test(id))return id;}}catch{}return null;};
    const viewName=text=>({'your orders':'orders','pre-orders':'pre-orders','membership charges':'membership-charges','refund history':'refund-history'}[text.toLowerCase()]??null);
    const timeName=text=>/^\d{4}$/u.test(text)&&Number(text)>=1900&&Number(text)<=2100?Number(text):/^last (?:90|180|365) days$/iu.test(text)?text.toLowerCase().replaceAll(' ','-'):null;
    const views=new Set(),selectedViews=new Set(),periods=new Set();let selectedPeriod=null;
    for(const select of [...document.querySelectorAll('select')].filter(visible).slice(0,30)){
      for(const option of [...select.options].slice(0,200)){
        const text=label(option),view=viewName(text),period=timeName(text);
        if(view){views.add(view);if(option.selected)selectedViews.add(view);}
        if(period!==null){periods.add(period);if(option.selected)selectedPeriod=period;}
      }
    }
    const candidates=[...document.querySelectorAll(rowSelector)].filter(visible),headers=candidates.slice(0,2000).filter(row=>{
      const names=cells(row).map(cell=>label(cell).toLowerCase());return ['title','purchased','total','options'].every(name=>names.includes(name));
    });
    // Fixed labels and tag/count structure help diagnose an unfamiliar layout
    // without exporting classes, DOM IDs, surrounding prose or order contents.
    const tag=element=>/^(?:table|thead|tbody|tr|th|td|div|span|p|section|main|ul|li|form|body|html)$/u.test(element.tagName.toLowerCase())?element.tagName.toLowerCase():'other';
    const headerElements=[...document.querySelectorAll('th,[role="columnheader"],span,div,p')],headerShapes=[];
    for(const element of headerElements.slice(0,5000)){
      const field=label(element).toLowerCase();if(!['title','purchased','total','options'].includes(field)||!visible(element)||headerShapes.some(shape=>shape.field===field))continue;
      const ancestors=[];let parent=element.parentElement;for(let depth=0;parent&&depth<3;depth++,parent=parent.parentElement)ancestors.push({tag:tag(parent),children:parent.children.length});
      headerShapes.push({field,tag:tag(element),ancestors});
    }
    const rows=new Map();
    for(const header of headers){
      const names=cells(header).map(cell=>label(cell).toLowerCase()),scope=header.closest('table,[role="table"]')??header.parentElement;
      for(const row of scope.querySelectorAll(rowSelector)){
        if(rows.size>=100)break;
        const parts=cells(row);if(row===header||!visible(row)||parts.length!==names.length||headers.includes(row))continue;
        rows.set(row,{parts,names});
      }
    }
    const totals={rows:rows.size,rowsWithPurchaseDate:0,rowsWithCreditTotal:0,rowsWithCashTotal:0,rowsWithZeroCashTotal:0,rowsWithUnrecognizedTotal:0,rowsWithOneAsin:0,rowsWithMultipleAsins:0,rowsMatchingSavedAsin:0,rowsWithOrderDetails:0,rowsWithReturnAction:0,rowsWithCompletedReturnWording:0};
    const asins=new Set(),matches=new Set();
    for(const [row,{parts,names}]of rows){
      const value=name=>label(parts[names.indexOf(name)]),date=value('purchased').match(/^(\d{2})-(\d{2})-(\d{4})$/u);
      if(date){const [,m,d,y]=date,parsed=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));if(parsed.getUTCFullYear()===Number(y)&&parsed.getUTCMonth()===Number(m)-1&&parsed.getUTCDate()===Number(d))totals.rowsWithPurchaseDate++;}
      const total=value('total');
      if(/^\d+(?:\.\d+)? credits?$/iu.test(total))totals.rowsWithCreditTotal++;
      else if(/^\$\s*\d[\d,]*(?:\.\d{2})?$/u.test(total)){totals.rowsWithCashTotal++;if(Number(total.replace(/[$,\s]/gu,''))===0)totals.rowsWithZeroCashTotal++;}
      else totals.rowsWithUnrecognizedTotal++;
      const ids=new Set([...row.querySelectorAll('a[href]')].filter(visible).slice(0,100).map(asinFromLink).filter(Boolean));
      for(const element of [row,...row.querySelectorAll('[data-asin]')])if(visible(element)&&/^[A-Z0-9]{10}$/iu.test(element.getAttribute('data-asin')??''))ids.add(element.getAttribute('data-asin').toUpperCase());
      for(const id of ids)asins.add(id);
      if(ids.size===1){totals.rowsWithOneAsin++;const id=[...ids][0];if(known?.has(id)){totals.rowsMatchingSavedAsin++;matches.add(id);}}
      else if(ids.size>1)totals.rowsWithMultipleAsins++;
      const options=parts[names.indexOf('options')],actions=[...options.querySelectorAll('a,button,[role="button"]')].filter(visible).map(label);
      if(actions.some(text=>/^order details$/iu.test(text)))totals.rowsWithOrderDetails++;
      if(actions.some(text=>/^return this title$/iu.test(text)))totals.rowsWithReturnAction++;
      if(/^(?:returned|refunded|return complete|refund complete)(?:[.!]|\s+on\s+\S.*)?$/iu.test(label(options)))totals.rowsWithCompletedReturnWording++;
    }
    const visibleLinks=[...document.querySelectorAll('a[href]')].filter(visible).slice(0,2000),pageAsins=new Set(visibleLinks.map(asinFromLink).filter(Boolean));
    return {...report,state:headers.length?'checked':'structure-unrecognized',viewOptions:[...views],selectedView:selectedViews.size===1?[...selectedViews][0]:'unknown',timeOptions:[...periods],selectedTime:selectedPeriod,recognizedHeaders:headers.length,headerShapes,...totals,distinctRowAsins:asins.size,distinctSavedAsinMatches:matches.size,visiblePageProductAsins:pageAsins.size,libraryComparison:known?'active-saved-profile-not-account-verified':'unavailable',savedLibraryIds:known?.size??0,boundReached:candidates.length>2000||headerElements.length>5000||rows.size>=100||visibleLinks.length>=2000};
  }
  global.GalacticAudible = { audibleItemIdFromUrl, audibleItemFromLibraryEntry, ownershipFromLibraryAction, newAudibleItems, fetchAudibleAudiobooks, inspectPagination, getDiagnostics,recordSaveState,inspectPurchaseHistory };
}(globalThis));
