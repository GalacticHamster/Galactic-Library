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

  // Read the visible purchase page only; never fetch orders or assign ownership.
  // Diagnostics contain counts only. An explicit private-preview collector may
  // receive titles/ASINs/dates in memory; nothing is persisted here.
  function readPurchaseHistory(document,{url=global.location?.href,knownItemIds=null,forImport=false}={},onEvidence=null){
    const rowLimit=forImport?10000:100,rowScanLimit=forImport?100000:2000;
    const report={format:3,provider:'audible',purpose:'ownership-feasibility',readOnly:true,historyComplete:false,accountVerified:false,state:'wrong-page'};
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
    const candidates=[...document.querySelectorAll(rowSelector)].filter(visible),headers=candidates.slice(0,rowScanLimit).filter(row=>{
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
    const rows=new Map(),invalidRows=new Set();
    for(const header of headers){
      const names=cells(header).map(cell=>label(cell).toLowerCase()),scope=header.closest('table,[role="table"]')??header.parentElement;
      const scopedRows=[...scope.querySelectorAll(rowSelector)].slice(0,rowScanLimit);let previousGroup=null,carry=[];
      for(const row of scopedRows){
        if(rows.size>=rowLimit)break;
        if(row===header||!visible(row)||headers.includes(row)||scope.tagName==='TABLE'&&row.closest('table')!==scope)continue;
        const group=row.closest('tbody,[role="rowgroup"]')??scope;
        if(group!==previousGroup){carry=[];previousGroup=group;}
        const parts=Array.from({length:names.length},(_,i)=>carry[i]?.cell??null),next=carry.map(span=>span?.remaining>1?{...span,remaining:span.remaining-1}:null);
        let valid=true;
        for(const cell of cells(row)){
          const column=parts.findIndex(part=>!part),rawCol=cell.getAttribute('colspan'),rawRow=cell.getAttribute('rowspan');
          const span=rawCol===null?1:/^[1-9]\d?$/u.test(rawCol)?Number(rawCol):0;
          let height=rawRow===null?1:/^\d{1,3}$/u.test(rawRow)?Number(rawRow):-1;
          if(height===0)height=Math.min(100,scopedRows.slice(scopedRows.indexOf(row)).filter(nextRow=>(nextRow.closest('tbody,[role="rowgroup"]')??scope)===group).length);
          if(column<0||!span||height<1||height>100||column+span>names.length){valid=false;break;}
          for(let i=column;i<column+span;i++){
            if(parts[i]){valid=false;break;}parts[i]=cell;if(height>1)next[i]={cell,remaining:height-1};
          }
          if(!valid)break;
        }
        carry=valid?next:[];
        if(!valid||parts.some(part=>!part)){invalidRows.add(row);continue;}
        rows.set(row,{parts,names,group,scope});
      }
    }
    const totals={rows:rows.size,rowsWithPurchaseDate:0,rowsWithBlankPurchaseDate:0,rowsWithCreditTotal:0,rowsWithCashTotal:0,rowsWithZeroCashTotal:0,rowsWithUnrecognizedTotal:0,rowsWithBlankTotal:0,rowsWithOneAsin:0,rowsWithMultipleAsins:0,rowsMatchingSavedAsin:0,rowsWithOrderDetails:0,rowsWithReturnAction:0,rowsWithCompletedReturnWording:0};
    const asins=new Set(),matches=new Set(),facts=[],orderAttributes={},orderParameters={};
    const orderAttributeNames=['data-order-id','data-orderid','data-order-number','data-purchase-order-id'];
    for(const [row,{parts,names,group,scope}]of rows){
      const value=name=>label(parts[names.indexOf(name)]),date=value('purchased').match(/^(\d{2})-(\d{2})-(\d{4})$/u);
      let dateValid=false;
      if(!value('purchased'))totals.rowsWithBlankPurchaseDate++;
      if(date){const [,m,d,y]=date,parsed=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));if(parsed.getUTCFullYear()===Number(y)&&parsed.getUTCMonth()===Number(m)-1&&parsed.getUTCDate()===Number(d)){totals.rowsWithPurchaseDate++;dateValid=true;}}
      const total=value('total');
      if(!total)totals.rowsWithBlankTotal++;
      let payment=null;
      if(/^\d+(?:\.\d+)? credits?$/iu.test(total)){totals.rowsWithCreditTotal++;payment='credit';}
      else if(/^\$\s*\d[\d,]*(?:\.\d{2})?$/u.test(total)){totals.rowsWithCashTotal++;payment='cash';if(Number(total.replace(/[$,\s]/gu,''))===0)totals.rowsWithZeroCashTotal++;}
      else totals.rowsWithUnrecognizedTotal++;
      const ids=new Set([...row.querySelectorAll('a[href]')].filter(visible).slice(0,100).map(asinFromLink).filter(Boolean));
      for(const element of [row,...row.querySelectorAll('[data-asin]')])if(visible(element)&&/^[A-Z0-9]{10}$/iu.test(element.getAttribute('data-asin')??''))ids.add(element.getAttribute('data-asin').toUpperCase());
      for(const id of ids)asins.add(id);
      if(ids.size===1){totals.rowsWithOneAsin++;const id=[...ids][0];if(known?.has(id)){totals.rowsMatchingSavedAsin++;matches.add(id);}}
      else if(ids.size>1)totals.rowsWithMultipleAsins++;
      const options=parts[names.indexOf('options')],actions=[...options.querySelectorAll('a,button,[role="button"]')].filter(visible).map(label);
      const statuses=[label(options),...[...options.querySelectorAll('span,p,div')].filter(visible).slice(0,100).map(label)];
      const permanentMethod=statuses.some(s=>/^gift (?:redeemed|redemption complete)[.!]?$/iu.test(s))?'gift':statuses.some(s=>/^promotional (?:purchase|acquisition) complete[.!]?$/iu.test(s))?'promotion':null;
      const nonPurchase=/\b(?:pre-?order|pending|cancelled|canceled|reversed|failed|borrowed|rental|subscription access|trial access|membership charge|gift order|gift purchase|gift for|gift code sent|gift recipient|sent as a gift)\b/iu.test(statuses.join(' ')+' '+total)||!permanentMethod&&/^gift$/iu.test(total);
      if(forImport&&permanentMethod&&!nonPurchase)payment=permanentMethod;
      if(forImport&&!payment&&total&&!nonPurchase&&selectedViews.has('orders')&&actions.some(text=>/^order details$/iu.test(text)))payment='purchase';
      if(actions.some(text=>/^order details$/iu.test(text)))totals.rowsWithOrderDetails++;
      if(actions.some(text=>/^return this title$/iu.test(text)))totals.rowsWithReturnAction++;
      if(statuses.some(s=>/^(?:returned|refunded|return complete|refund complete)(?:[.!]|\s+on\s+\S.*)?$/iu.test(s))){totals.rowsWithCompletedReturnWording++;if(onEvidence&&ids.size===1)onEvidence({kind:'returned',asin:[...ids][0]});}
      const orderLinks=new Set();
      for(const link of options.querySelectorAll('a[href]'))if(visible(link)&&/^order details$/iu.test(label(link))){try{const u=new URL(link.getAttribute('href'),page.origin);if(u.origin===page.origin&&/^\/account\/(?:order-details|order-history)(?:\/|$)/u.test(u.pathname))orderLinks.add(u.href);}catch{}}
      const orderKeys=new Set(),orderContainer=row.closest(orderAttributeNames.map(key=>'['+key+']').join(','));
      const orderElements=[...(orderContainer&&scope.contains(orderContainer)?[orderContainer]:[]),...row.querySelectorAll(orderAttributeNames.map(key=>'['+key+']').join(','))].slice(0,100);
      for(const element of new Set(orderElements))for(const key of orderAttributeNames){const value=element.getAttribute(key);if(value&&value.length<=200){orderKeys.add('attribute:'+key+':'+value);orderAttributes[key]=(orderAttributes[key]??0)+1;}}
      for(const link of row.querySelectorAll('a[href]')){try{const u=new URL(link.getAttribute('href'),page.origin);if(u.origin!==page.origin||!u.pathname.startsWith('/account/'))continue;
        for(const key of ['orderId','orderID','orderNumber','purchaseOrderId']){const value=u.searchParams.get(key);if(value&&value.length<=200){orderKeys.add('parameter:'+key+':'+value);orderParameters[key]=(orderParameters[key]??0)+1;}}
      }catch{}}
      const titleCell=parts[names.indexOf('title')],titleLinks=[...titleCell.querySelectorAll('a[href]')].filter(link=>visible(link)&&ids.has(asinFromLink(link)));
      const title=titleLinks.map(label).find(Boolean)??'';
      facts.push({row,scope,group,ids,title,nonPurchase,date:value('purchased'),dateValid,dateCell:parts[names.indexOf('purchased')],total,payment,totalCell:parts[names.indexOf('total')],orderLinks,orderKeys});
    }
    // These are grouping candidates, not ownership decisions. A date/total
    // never flows into the next row just because its own cells are blank.
    const grouping={declaredRowGroups:new Set(facts.map(f=>f.group)).size,rowsWithOrderKeys:facts.filter(f=>f.orderKeys.size).length,orderAttributeNames:orderAttributes,orderParameterNames:orderParameters,unreadableRowLayouts:invalidRows.size,candidateOrders:0,candidateMultiBookOrders:0,bookRowsWithDatedOrderEvidence:0,matchingBookRowsWithDatedOrderEvidence:0,bookRowsUsingSharedOrderEvidence:0,unboundBookRows:0,incompatibleGroupCandidates:0,conflictingOrderGroups:0,candidateOrderSizeCounts:{},candidateOrdersByBasis:{}};
    const used=new Set(),rejected=new Set(),seenGroups=new Set(),datedAsins=new Set(),datedMatches=new Set();
    const admit=(members,basis)=>{
      if(members.length<1||members.some(f=>used.has(f)||forImport&&rejected.has(f)))return;
      const dated=members.filter(f=>f.date),paid=members.filter(f=>f.total),linkKeys=new Set(members.flatMap(f=>[...f.orderLinks])),dataKeys=new Set(members.flatMap(f=>[...f.orderKeys]));
      const completedOrder=forImport&&selectedViews.size===1&&selectedViews.has('orders')&&members.some(f=>f.orderLinks.size||f.orderKeys.size)&&!members.some(f=>f.nonPurchase);
      if(!dated.length||!paid.length&&!completedOrder)return;
      const keyValues=new Map();for(const key of dataKeys){const split=key.indexOf(':',key.indexOf(':')+1),namespace=key.slice(0,split),values=keyValues.get(namespace)??new Set();values.add(key.slice(split+1));keyValues.set(namespace,values);}
      const conflicts=dated.some(f=>!f.dateValid)||paid.some(f=>!f.payment)&&!completedOrder||new Set(dated.map(f=>f.date)).size!==1||paid.length>0&&new Set(paid.map(f=>f.total)).size!==1||linkKeys.size>1||[...keyValues.values()].some(values=>values.size>1);
      if(conflicts){if(['explicit-order-key','shared-order-link'].includes(basis)){grouping.conflictingOrderGroups++;if(forImport)members.forEach(f=>rejected.add(f));}const key=members[0].group;if(!seenGroups.has(key)){seenGroups.add(key);grouping.incompatibleGroupCandidates++;}return;}
      // A row group containing repeated separate date/total cells could be
      // independent same-day purchases. Only one shared pair is accepted here.
      if(basis==='row-group'&&(new Set(dated.map(f=>f.dateCell)).size!==1||new Set(paid.map(f=>f.totalCell)).size!==1))return;
      if(basis==='row-group'&&[...invalidRows].some(row=>(row.closest('tbody,[role="rowgroup"]')??members[0].scope)===members[0].group))return;
      if(basis==='row-group'&&!members.some(f=>f.orderLinks.size||f.dateCell.closest(rowSelector)!==f.row||f.totalCell.closest(rowSelector)!==f.row))return;
      const books=members.filter(f=>f.ids.size===1);if(!books.length)return;
      const unique=new Set(books.map(f=>[...f.ids][0]));for(const id of unique){datedAsins.add(id);if(known?.has(id))datedMatches.add(id);}
      members.forEach(f=>used.add(f));grouping.candidateOrders++;if(unique.size>1)grouping.candidateMultiBookOrders++;
      grouping.bookRowsWithDatedOrderEvidence+=books.length;grouping.matchingBookRowsWithDatedOrderEvidence+=books.filter(f=>known?.has([...f.ids][0])).length;
      grouping.bookRowsUsingSharedOrderEvidence+=books.filter(f=>!f.dateValid||!f.payment||f.dateCell.closest(rowSelector)!==f.row||f.totalCell.closest(rowSelector)!==f.row).length;
      grouping.candidateOrderSizeCounts[unique.size]=(grouping.candidateOrderSizeCounts[unique.size]??0)+1;
      grouping.candidateOrdersByBasis[basis]=(grouping.candidateOrdersByBasis[basis]??0)+1;
      // Private preview collector only. Never place these values in diagnostics.
      if(onEvidence&&(!forImport||completedOrder)){const [month,day,year]=dated[0].date.split('-');const method=['gift','promotion','credit'].includes(paid[0]?.payment)?paid[0].payment:paid[0]?.payment==='cash'?(Number(paid[0].total.replace(/[$,\s]/gu,''))===0?'free':'cash'):'purchase';for(const book of books)onEvidence({kind:'purchase',asin:[...book.ids][0],title:book.title,acquiredAt:`${year}-${month}-${day}`,method});}
    };
    const groupBy=(values,key)=>{const result=new Map();for(const fact of values){for(const k of key(fact)){const group=result.get(k)??[];group.push(fact);result.set(k,group);}}return [...result.values()];};
    for(const scope of new Set(facts.map(f=>f.scope))){
      const scoped=facts.filter(f=>f.scope===scope);
      for(const members of groupBy(scoped,f=>f.orderKeys))if(members.length>1)admit(members,'explicit-order-key');
      for(const members of groupBy(scoped,f=>f.orderLinks))if(members.length>1)admit(members,'shared-order-link');
      for(const members of groupBy(scoped,f=>[f.group]))if(members.length>1)admit(members,'row-group');
      // The live Your orders layout uses a dated/payment-bearing order header
      // followed by book rows with blank shared fields. Require its actual
      // Order details link, contiguous siblings and the same declared row group;
      // any new/nonempty/unknown row ends that candidate. This is not a generic
      // carry-forward rule for blank cells or other history views.
      if(selectedViews.size===1&&selectedViews.has('orders')){
        let members=[];
        const flush=()=>{if(members.length>1)admit(members,'order-header-continuation');members=[];};
        for(const fact of scoped){
          const previous=members.at(-1);
          if(previous&&(previous.group!==fact.group||previous.row.nextElementSibling!==fact.row))flush();
          if(used.has(fact)){flush();continue;}
          if(fact.dateValid&&fact.payment&&fact.orderLinks.size===1&&fact.ids.size===1){flush();members=[fact];}
          else if(members.length&&!fact.date&&!fact.total&&fact.ids.size===1&&!fact.orderLinks.size)members.push(fact);
          else flush();
        }
        flush();
      }
    }
    for(const fact of facts)if(!used.has(fact)&&fact.dateValid&&(fact.payment||forImport&&(fact.orderLinks.size||fact.orderKeys.size)))admit([fact],'direct-row');
    grouping.unboundBookRows=facts.filter(f=>f.ids.size===1&&!used.has(f)).length;
    grouping.distinctAsinsWithDatedOrderEvidence=datedAsins.size;grouping.distinctSavedMatchesWithDatedOrderEvidence=datedMatches.size;
    const visibleLinks=[...document.querySelectorAll('a[href]')].filter(visible).slice(0,2000),pageAsins=new Set(visibleLinks.map(asinFromLink).filter(Boolean));
    // Observe navigation contracts without exporting destinations, arbitrary text,
    // filter values or identifiers. A missing Next button never proves completeness.
    const navigation={controls:0,enabledNext:0,disabledNext:0,enabledPrevious:0,disabledPrevious:0,numberedControls:0,samePageLinks:0,otherDestinations:0,queryParameterNames:[],otherQueryParameters:0,boundReached:false};
    const parameterNames=new Set(),controls=[...document.querySelectorAll('a,button,[role="button"]')].filter(visible);
    for(const control of controls.slice(0,2000)){
      const text=label(control),accessible=control.getAttribute('aria-label')??'',rel=control.getAttribute('rel')??'';
      const named=[text,accessible].map(value=>value.replace(/[«»‹›←→]/gu,'').trim());
      const next=/\bnext\b/iu.test(rel)||named.some(value=>/^(?:next|next page|go to next page)$/iu.test(value));
      const previous=/\bprev\b/iu.test(rel)||named.some(value=>/^(?:previous|previous page|go to previous page|prev)$/iu.test(value));
      const paging=control.closest('nav[aria-label*="agin"], [role="navigation"][aria-label*="agin"], .pagination, .bc-pagination');
      const numbered=!!paging&&/^\d{1,4}$/u.test(text);
      if(!next&&!previous&&!numbered)continue;
      navigation.controls++;const disabled=control.hasAttribute('disabled')||control.getAttribute('aria-disabled')==='true';
      if(next)navigation[disabled?'disabledNext':'enabledNext']++;
      if(previous)navigation[disabled?'disabledPrevious':'enabledPrevious']++;
      if(numbered)navigation.numberedControls++;
      if(control.hasAttribute('href')){try{
        const destination=new URL(control.getAttribute('href'),page);
        if(destination.origin===page.origin&&destination.pathname===page.pathname){
          navigation.samePageLinks++;
          for(const key of new Set(destination.searchParams.keys()))if(['page','pageNumber','pageSize','offset','limit','orderFilter','timeFilter','view','year'].includes(key))parameterNames.add(key);else navigation.otherQueryParameters++;
        }else navigation.otherDestinations++;
      }catch{navigation.otherDestinations++;}}
    }
    navigation.queryParameterNames=[...parameterNames].sort();navigation.boundReached=controls.length>2000;
    // Refund layouts are not assumed to use purchase columns. Report only a
    // small allowlist of header/status shapes and exact row ASIN presence. Being
    // on Refund history, or having a Return button, is not a completed return.
    const refundFields=['title','purchased','total','options','date','returned','refunded','return date','refund date','refund amount','amount','status'];
    const refundHistory={selected:selectedViews.size===1&&selectedViews.has('refund-history'),recognizedHeaders:[],candidateTables:0,bookRows:0,rowsWithOneAsin:0,rowsWithMultipleAsins:0,rowsMatchingSavedAsin:0,rowsWithCompletedStatus:0,matchingRowsWithCompletedStatus:0,rowsWithReturnAction:0,unrecognizedHeaders:0,boundReached:false};
    if(refundHistory.selected){
      const seenTables=new Set();
      for(const header of candidates.slice(0,2000)){
        const headerCells=[...header.children].filter(cell=>visible(cell)&&(cell.tagName==='TH'||cell.getAttribute('role')==='columnheader'));
        if(!headerCells.length)continue;
        const names=headerCells.map(cell=>label(cell).toLowerCase()),recognized=names.filter(name=>refundFields.includes(name));
        for(const name of recognized)if(!refundHistory.recognizedHeaders.includes(name))refundHistory.recognizedHeaders.push(name);
        refundHistory.unrecognizedHeaders+=names.filter(name=>name&&!refundFields.includes(name)).length;
        if(!names.includes('title')||!recognized.some(name=>name!=='title'))continue;
        const scope=header.closest('table,[role="table"]');if(!scope||seenTables.has(scope))continue;
        seenTables.add(scope);refundHistory.candidateTables++;
        const scopedRows=[...scope.querySelectorAll(rowSelector)].filter(row=>visible(row)&&row!==header&&row.closest('table,[role="table"]')===scope);
        if(scopedRows.length>100)refundHistory.boundReached=true;
        for(const row of scopedRows.slice(0,100)){
          const ids=new Set([...row.querySelectorAll('a[href]')].filter(visible).slice(0,100).map(asinFromLink).filter(Boolean));
          for(const element of [row,...row.querySelectorAll('[data-asin]')].slice(0,100))if(visible(element)&&/^[A-Z0-9]{10}$/iu.test(element.getAttribute('data-asin')??''))ids.add(element.getAttribute('data-asin').toUpperCase());
          if(!ids.size)continue;refundHistory.bookRows++;
          if(ids.size>1){refundHistory.rowsWithMultipleAsins++;continue;}
          refundHistory.rowsWithOneAsin++;const matching=known?.has([...ids][0]);if(matching)refundHistory.rowsMatchingSavedAsin++;
          const parts=cells(row),statusColumns=names.map((name,i)=>['status','options'].includes(name)?i:-1).filter(i=>i>=0);
          const completed=parts.length===header.children.length&&statusColumns.some(i=>/^(?:returned|refunded|return complete|refund complete)(?:[.!]|\s+on\s+\S.*)?$/iu.test(label(parts[i])));
          if(completed){refundHistory.rowsWithCompletedStatus++;if(matching)refundHistory.matchingRowsWithCompletedStatus++;}
          if([...row.querySelectorAll('a,button,[role="button"]')].filter(visible).some(element=>/^return this title$/iu.test(label(element))))refundHistory.rowsWithReturnAction++;
        }
      }
    }
    const limits={purchaseRowScan:candidates.length>rowScanLimit||rows.size>=rowLimit,headerShapes:headerElements.length>5000,pageLinks:visibleLinks.length>=2000,navigation:navigation.boundReached,refundRows:refundHistory.boundReached};
    const purchaseDateYears={};for(const fact of facts)if(fact.dateValid){const year=fact.date.slice(-4);purchaseDateYears[year]=(purchaseDateYears[year]??0)+1;}
    return {...report,state:headers.length?'checked':refundHistory.candidateTables?'refund-structure-observed':'structure-unrecognized',viewOptions:[...views],selectedView:selectedViews.size===1?[...selectedViews][0]:'unknown',timeOptions:[...periods],selectedTime:selectedPeriod,recognizedHeaders:headers.length,headerShapes,...totals,...(forImport?{unresolvedPurchaseRows:facts.filter(f=>f.ids.size===1&&!used.has(f)&&!f.nonPurchase).length}:{}),purchaseDateYears,grouping,navigation,refundHistory,limits,distinctRowAsins:asins.size,distinctSavedAsinMatches:matches.size,visiblePageProductAsins:pageAsins.size,libraryComparison:known?'active-saved-profile-not-account-verified':'unavailable',savedLibraryIds:known?.size??0,boundReached:Object.values(limits).some(Boolean)};
  }
  function inspectPurchaseHistory(document,options){return readPurchaseHistory(document,options);}
  function previewPurchaseHistory(document,options){
    const observed=[],report=readPurchaseHistory(document,options,entry=>observed.push(entry));
    const known=new Set(Array.isArray(options?.knownItemIds)?options.knownItemIds:[]),entries=[],seen=new Set(),returned=new Set(observed.filter(entry=>entry.kind==='returned').map(entry=>entry.asin));
    const blocked=report.state!=='checked'||report.selectedView!=='orders'||report.libraryComparison==='unavailable'||report.grouping.conflictingOrderGroups>0;
    let unmatched=0,missingTitles=0,titlesFromSavedLibrary=0;
    if(!blocked)for(const entry of observed){
      if(entry.kind!=='purchase'||returned.has(entry.asin))continue;
      if(!known.has(entry.asin)){unmatched++;continue;}
      const savedTitle=Object.hasOwn(options?.knownItemTitles??{},entry.asin)?options.knownItemTitles[entry.asin]:null;
      const title=entry.title||(typeof savedTitle==='string'&&savedTitle.trim()&&savedTitle.length<=500?savedTitle:'');
      if(!title){missingTitles++;continue;}
      const key=entry.asin+':'+entry.acquiredAt;if(seen.has(key))continue;seen.add(key);
      if(!entry.title)titlesFromSavedLibrary++;
      entries.push({provider:'audible',mediaType:'audiobook',title,asin:entry.asin,providerItemId:entry.asin,acquiredAt:entry.acquiredAt,sourceLabel:'Audible purchase history'});
    }
    report.preview={entries:entries.length,unmatched,missingTitles,titlesFromSavedLibrary,excludedReturned:returned.size};
    return {state:blocked?'blocked':entries.length?'ready':'empty',report,entries,unmatched,missingTitles,titlesFromSavedLibrary,excludedReturned:returned.size};
  }
  function historyFrame(){
    if(global.location?.origin!=='https://www.audible.com')throw Error('unsupported-origin');
    const frame=global.document.createElement('iframe');
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms');
    frame.title='Audible read-only history access check';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    // Keep a real layout so provider-rendered tables can be inspected. Do not
    // hide with display:none or relax the provider's framing/security policies.
    frame.style.cssText='position:fixed;left:-12000px;top:0;width:1000px;height:800px;border:0;pointer-events:none;';
    frame.src=new URL('/account/purchase-history',global.location.origin).href;global.document.documentElement.append(frame);
    return {
      read(){
        const doc=frame.contentDocument;if(!doc)return null;
        const url=new URL(doc.URL);if(url.protocol==='about:')return null;
        if(url.origin!==global.location.origin||!/^\/account\/purchase-history\/?$/u.test(url.pathname))throw Error('history-access-not-verified');
        return doc;
      },
      choose(select,option){
        if(select.disabled||option.disabled||select.ownerDocument!==frame.contentDocument)throw Error('history-control-unavailable');
        select.value=option.value;select.dispatchEvent(new frame.contentWindow.Event('change',{bubbles:true}));
      },
      follow(control){
        if(control.ownerDocument!==frame.contentDocument)throw Error('history-control-unavailable');
        if(control.hasAttribute('href')){const url=new URL(control.getAttribute('href'),frame.contentDocument.URL);if(url.origin!==global.location.origin||!/^\/account\/purchase-history\/?$/u.test(url.pathname))throw Error('history-control-unavailable');frame.contentWindow.location.href=url.href;}
        else control.click();
      },
      close(){frame.remove();}
    };
  }
  // Feasibility gate for the one-click importer: exercise Audible's actual
  // native controls, not invented filter URLs. No imports or ownership writes.
  // The optional driver is used only by disposable tests, never from messages.
  async function probePurchaseHistoryAccess({knownItemIds=null,driverFactory=historyFrame,timeoutMs=15000,pollMs=150,progress=()=>{}}={}){
    const result={format:1,provider:'audible',purpose:'automatic-history-access',readOnly:true,historyComplete:false,accountVerified:false,state:'blocked',reason:'history-access-not-verified',availableYears:[],documentNavigationObserved:false};
    let driver;
    const inspect=doc=>inspectPurchaseHistory(doc,{url:'https://www.audible.com/account/purchase-history',knownItemIds});
    const yearControl=doc=>{
      const found=[...doc.querySelectorAll('select')].filter(select=>[...select.options].filter(option=>/^\d{4}$/u.test(textOf(option))&&!option.disabled).length>0);
      return found.length===1?found[0]:null;
    };
    const waitFor=async(previous,expected={})=>{
      const end=Date.now()+Math.max(1,Math.min(timeoutMs,30000));
      while(Date.now()<end){
        const doc=driver.read();
        if(doc&&doc!==previous&&doc.readyState==='complete'){
          const report=inspect(doc),select=yearControl(doc);
          if(report.state==='checked'&&select&&(expected.view===undefined||report.selectedView===expected.view)&&(expected.year===undefined||report.selectedTime===expected.year&&Object.keys(report.purchaseDateYears).every(year=>Number(year)===expected.year)))return {doc,report,select};
        }
        await wait(Math.max(1,pollMs));
      }
      throw Error(previous?'history-navigation-not-verified':'history-access-not-verified');
    };
    try{
      progress('Opening Audible purchase history without importing...');driver=driverFactory();
      let current=await waitFor(null);
      if(current.report.selectedView!=='orders'){
        const views=[...current.doc.querySelectorAll('select')].filter(select=>[...select.options].some(option=>/^your orders$/iu.test(textOf(option))));
        if(views.length!==1)throw Error('history-control-unavailable');
        const option=[...views[0].options].find(option=>/^your orders$/iu.test(textOf(option)));
        driver.choose(views[0],option);current=await waitFor(current.doc,{view:'orders'});
      }
      result.initial=current.report;
      const options=[...current.select.options].filter(option=>/^\d{4}$/u.test(textOf(option))&&!option.disabled);
      const years=options.map(option=>Number(textOf(option))).filter(year=>year>=1900&&year<=2100).sort((a,b)=>b-a);
      result.availableYears=[...new Set(years)];
      // Prefer a past offered year, with no fixed calendar or query-value rule.
      const target=years.find(year=>year!==years[0]&&year!==current.report.selectedTime)??years.find(year=>year!==current.report.selectedTime);
      if(target===undefined)throw Error('history-year-unavailable');
      const option=options.find(option=>Number(textOf(option))===target);result.targetYear=target;
      progress('Checking whether Audible can open another year automatically...');
      driver.choose(current.select,option);
      const changed=await waitFor(current.doc,{view:'orders',year:target});result.selected=changed.report;
      result.documentNavigationObserved=true;result.state='navigation-verified';result.reason=null;
      // A successful switch proves neither all-page traversal nor refunds. The
      // importer must remain gated until those completion contracts are known.
    }catch(error){
      const allowed=['unsupported-origin','history-access-not-verified','history-control-unavailable','history-navigation-not-verified','history-year-unavailable'];
      result.reason=allowed.includes(error.message)?error.message:'history-access-not-verified';
    }finally{driver?.close();}
    return result;
  }
  async function scanPurchaseHistory({mode='full',now=new Date(),driverFactory=historyFrame,timeoutMs=15000,pollMs=150,progress=()=>{}}={}){
    const scope=mode==='incremental'?'recent':'full';
    const history={format:1,scope,failures:[],ordersComplete:false,refundsComplete:false,purchases:[],refunds:[],uncertainRefundAsins:[],years:[],pagesRead:0,reason:null};
    let driver,current;const purchases=new Map(),refunds=new Map(),purchaseCounts=new Map(),refundCounts=new Map(),uncertain=new Set(),started=Date.now();
    const visible=e=>!e.closest('[hidden],[aria-hidden="true"]')&&(!e.ownerDocument.defaultView||e.getClientRects().length>0);
    const recordFailure=(view,year,reason,pagesRead,report)=>{
      history.reason=reason;
      // Keep the first blocker for each view, even if a later view also fails.
      const existing=history.failures.find(f=>f.view===view);
      if(existing){existing.pagesRead=pagesRead;return;}
      history.failures.push({view,year,reason,pagesRead,rows:report?.rows??0,unboundRows:report?.unresolvedPurchaseRows??0,conflictingGroups:report?.grouping?.conflictingOrderGroups??0,multipleIdentities:report?.rowsWithMultipleAsins??0,limited:!!report?.limits?.purchaseRowScan});
    };
    const yearSelect=doc=>{const matches=[...doc.querySelectorAll('select')].filter(s=>visible(s)&&[...s.options].some(o=>/^\d{4}$/u.test(textOf(o))));if(matches.length!==1)throw Error('history-controls');return matches[0];};
    const read=doc=>{
      const events=[],report=readPurchaseHistory(doc,{url:'https://www.audible.com/account/purchase-history',forImport:true},e=>events.push(e));
      return {doc,report,events};
    };
    const ready=async(previous,view,year)=>{
      const deadline=Date.now()+Math.min(30000,Math.max(1,timeoutMs));
      while(Date.now()<deadline){
        const doc=driver.read();
        if(doc&&doc!==previous&&doc.readyState==='complete'&&!doc.querySelector('[aria-busy="true"]')){
          const data=read(doc),r=data.report;
          if(['checked','refund-structure-observed'].includes(r.state)&&(!view||r.selectedView===view)&&(year===undefined||r.selectedTime===year&&(view!=='orders'||Object.keys(r.purchaseDateYears).every(y=>Number(y)===year))))return data;
        }
        await wait(Math.max(1,pollMs));
      }
      throw Error('history-inaccessible-or-not-advancing');
    };
    const change=async(view,year)=>{
      if(current.report.selectedView!==view){
        const selects=[...current.doc.querySelectorAll('select')].filter(s=>[...s.options].some(o=>/^your orders$/iu.test(textOf(o)))&&[...s.options].some(o=>/^refund history$/iu.test(textOf(o))));
        if(selects.length!==1)throw Error('history-controls');
        const option=[...selects[0].options].find(o=>(view==='orders'?/^your orders$/iu:/^refund history$/iu).test(textOf(o)));
        driver.choose(selects[0],option);current=await ready(current.doc,view);
      }
      if(current.report.selectedTime!==year){const select=yearSelect(current.doc),option=[...select.options].find(o=>textOf(o)===String(year)&&!o.disabled);if(!option)throw Error('history-year-unavailable');driver.choose(select,option);current=await ready(current.doc,view,year);}
    };
    const continuation=doc=>{
      const links=new Map();let terminal=false,unresolvedNumbers=false,unverifiedControl=false;
      const pagers='.bc-pagination,.pagination,.pagingElements,nav[aria-label*="pagination" i],[role="navigation"][aria-label*="pagination" i]';
      const currentPages=[...doc.querySelectorAll(pagers)].flatMap(p=>[...p.querySelectorAll('[aria-current="page"]')]).map(e=>Number(textOf(e))).filter(Number.isSafeInteger);
      const currentPage=currentPages.length&&new Set(currentPages).size===1?currentPages[0]:null;
      for(const e of [...doc.querySelectorAll('a,button,[role="button"]')].filter(visible)){
        const label=textOf(e),pager=e.closest(pagers),rel=e.getAttribute('rel')??'';
        let url;try{if(e.getAttribute('href'))url=new URL(e.getAttribute('href'),'https://www.audible.com/account/purchase-history');}catch{}
        const same=url?.origin==='https://www.audible.com'&&/^\/account\/purchase-history\/?$/u.test(url.pathname);
        const next=/\bnext\b/iu.test(rel)||/^(?:next|next page|go to next page)[\s›»→]*$/iu.test(label)||/^(?:next|next page)$/iu.test(e.getAttribute('aria-label')??'');
        const disabled=e.hasAttribute('disabled')||e.getAttribute('aria-disabled')==='true'||Boolean(e.closest('[class*="disabled" i]'));
        if(/^(?:load|show|see)\s+(?:\d+\s+)?more\b/iu.test(label)&&!disabled)throw Error('history-lazy-loading-unverified');
        if(!pager&&!same)continue;
        if(pager&&!disabled&&!next&&!/^\d+$/u.test(label)&&e.getAttribute('aria-current')!=='page'&&!/^(?:previous|previous page|prev|first|first page)[\s‹«←]*$/iu.test(label)&&!/\bprev\b/iu.test(rel))unverifiedControl=true;
        if(next){if(disabled){terminal=true;continue;}if(!same&&e.hasAttribute('href'))throw Error('history-next-unverified');links.set(same?url.href:'button-next',e);}
        else if(pager&&!disabled&&/^\d+$/u.test(label)&&e.getAttribute('aria-current')!=='page'){
          if(currentPage===null)unresolvedNumbers=true;
          else if(Number(label)>currentPage){if(!same)throw Error('history-next-unverified');links.set(url.href,e);}
        }
      }
      if(unresolvedNumbers&&!links.size)throw Error('history-pagination-unverified');
      if(unverifiedControl&&!links.size)throw Error('history-pagination-unverified');
      // Next wins over numbered alternatives. Otherwise use the smallest
      // visible following number, never fabricate a URL or increment a cursor.
      const values=[...links.values()],next=values.find(e=>/\bnext\b/iu.test((e.getAttribute('rel')??'')+' '+textOf(e)+' '+(e.getAttribute('aria-label')??'')));
      return {next:next??values.sort((a,b)=>Number(textOf(a))-Number(textOf(b)))[0]??null,terminal};
    };
    const emptyHistory=(doc,view)=>{
      const tables=[...doc.querySelectorAll('table,[role="table"]')].filter(t=>[...t.querySelectorAll('th,[role="columnheader"]')].some(e=>/^title$/iu.test(textOf(e))));
      if(!tables.length)return false;
      // The live empty-refund panel is outside/after the table. Its explicit
      // fixed sentence is valid only in the selected refund view with no books;
      // generic page prose or a merely empty table never establishes completion.
      if(view==='refund-history'){
        const message=/^looks like you (?:don['\u2019]t|do not) have any refunds in your purchase history[.!]?$/iu;
        const matches=e=>[...e.childNodes].some(n=>n.nodeType===3&&message.test((n.textContent??'').replace(/\s+/gu,' ').trim()))||message.test(textOf(e))&&[...e.querySelectorAll('*')].every(visible);
        if([...doc.querySelectorAll('p,div,span,h1,h2,h3,h4')].filter(e=>visible(e)&&!e.closest('aside,footer,nav')).some(matches))return true;
      }
      return tables.some(t=>/\b(?:no\s+(?:results|orders|purchases|refunds|transactions)|(?:not|haven't|have not|did not)[^.]{0,100}(?:orders|purchases|refunds|transactions))\b/iu.test(textOf(t.querySelector('tbody')??t)));
    };
    const refundRows=doc=>{
      const result=[];
      for(const table of doc.querySelectorAll('table,[role="table"]')){
        const header=[...table.querySelectorAll('tr,[role="row"]')].find(row=>[...row.children].some(cell=>/^title$/iu.test(textOf(cell))));if(!header)continue;
        const names=[...header.children].map(e=>textOf(e).toLowerCase());
        for(const row of table.querySelectorAll('tr,[role="row"]')){
          if(row===header||!visible(row))continue;
          const ids=new Set();for(const a of row.querySelectorAll('a[href]')){try{const u=new URL(a.getAttribute('href'),'https://www.audible.com');if(u.origin==='https://www.audible.com'&&u.pathname.startsWith('/pd/')){const id=audibleItemIdFromUrl(u.href);if(/^[A-Z0-9]{10}$/u.test(id))ids.add(id);}}catch{}}
          for(const e of [row,...row.querySelectorAll('[data-asin]')])if(/^[A-Z0-9]{10}$/iu.test(e.getAttribute('data-asin')??''))ids.add(e.getAttribute('data-asin').toUpperCase());
          if(ids.size!==1){if(ids.size>1)throw Error('history-refund-identity-conflict');continue;}
          const cells=[...row.children],status=names.flatMap((n,i)=>['options','status'].includes(n)?[textOf(cells[i])]:[]).join(' ');
          const index=names.findIndex(n=>['refund date','return date','refunded','returned'].includes(n)),raw=index>=0?textOf(cells[index]):'',match=/^(\d{2})-(\d{2})-(\d{4})$/u.exec(raw);
          let date=null;if(match){const [,m,d,y]=match,iso=`${y}-${m}-${d}`,check=new Date(iso+'T00:00:00Z');if(Number.isFinite(check.getTime())&&check.toISOString().slice(0,10)===iso)date=iso;}
          result.push({asin:[...ids][0],date,confirmed:!!date&&/^(?:returned|refunded|return complete|refund complete)(?:[.!]|\s+on\s+\S.*)?$/iu.test(status)});
        }
      }return result;
    };
    try{
      driver=driverFactory();current=await ready(null);
      history.years=[...new Set([...yearSelect(current.doc).options].map(o=>textOf(o)).filter(v=>/^\d{4}$/u.test(v)).map(Number).filter(y=>y>=1900&&y<=2100))].sort((a,b)=>b-a);
      // Audible exposes calendar-year filters; its live last-365-days view
      // spans current and previous years. Quick intentionally checks only those
      // two offered years, never a historical checkpoint or backfill sweep.
      if(scope==='recent'){const year=now.getFullYear();history.years=history.years.filter(y=>y===year||y===year-1);}
      if(!history.years.length)throw Error('history-year-unavailable');
      for(const view of ['refund-history','orders']){
        let attemptedYear=null,viewPages=0;
        try{
          if(!driver){driver=driverFactory();current=await ready(null);}
          for(const [index,year]of history.years.entries()){
            attemptedYear=year;
            progress(`${view==='orders'?'Checking purchase history':'Checking return history'}: ${year} (${index+1} of ${history.years.length})...`);
            await change(view,year);const seen=new Set();
            while(true){
              if(Date.now()-started>600000||history.pagesRead>=10000||purchases.size+refunds.size>50000)throw Error('history-safety-limit');
              const {doc,report,events}=current;
              // Invalid groups contribute no purchase facts. Keep their view
              // incomplete, but continue real pages/years so independent dated
              // purchases are not discarded because of an unrelated bad order.
              const unreadable=report.limits.purchaseRowScan||report.grouping.conflictingOrderGroups||report.rowsWithMultipleAsins||view==='orders'&&report.unresolvedPurchaseRows;
              const negative=view==='refund-history'?refundRows(doc):[];
              const fingerprint=JSON.stringify([events,negative,[...doc.querySelectorAll('[data-order-id]')].map(e=>e.getAttribute('data-order-id'))]);
              if(seen.has(fingerprint))throw Error('history-repeated-page');seen.add(fingerprint);history.pagesRead++;viewPages++;
              if(unreadable)recordFailure(view,year,'history-unreadable-entries',viewPages,report);
              if(view==='orders')for(const event of events){if(event.kind==='returned')uncertain.add(event.asin);else if(event.kind==='purchase'){
                const key=event.asin+':'+event.acquiredAt+':'+event.method;
                if(!purchases.has(key)){if(purchases.size>=50000||(purchaseCounts.get(event.asin)??0)>=100)throw Error('history-safety-limit');purchaseCounts.set(event.asin,(purchaseCounts.get(event.asin)??0)+1);}
                purchases.set(key,{asin:event.asin,date:event.acquiredAt,method:event.method});
              }}
              else for(const event of negative){if(event.confirmed){const key=event.asin+':'+event.date;if(!refunds.has(key)){if(refunds.size>=50000||(refundCounts.get(event.asin)??0)>=100)throw Error('history-safety-limit');refundCounts.set(event.asin,(refundCounts.get(event.asin)??0)+1);}refunds.set(key,{asin:event.asin,date:event.date});}else uncertain.add(event.asin);}
              const books=view==='orders'?report.rowsWithOneAsin:negative.length;
              if(!books){
                if(!emptyHistory(doc,view))throw Error('history-empty-unconfirmed');
              }
              const page=continuation(doc);if(!page.next)break;
              if(typeof driver.follow!=='function')throw Error('history-next-unverified');driver.follow(page.next);current=await ready(doc,view,year);
            }
          }
          const complete=!history.failures.some(f=>f.view===view);
          if(view==='orders')history.ordersComplete=complete;else history.refundsComplete=complete;
        }catch(error){
          const reason=/^history-[a-z-]{1,80}$/u.test(error.message)?error.message:'history-incomplete';
          const r=current?.report?.selectedView===view&&current.report.selectedTime===attemptedYear?current.report:null;
          recordFailure(view,attemptedYear,reason,viewPages,r);
          driver?.close();driver=null;
        }
      }
    }catch{history.reason='history-inaccessible';}
    finally{driver?.close();}
    history.purchases=[...purchases.values()];history.refunds=[...refunds.values()];history.uncertainRefundAsins=[...uncertain].sort();
    if(lastDiagnostics)lastDiagnostics.ownershipHistory={scope,failures:history.failures,ordersComplete:history.ordersComplete,refundsComplete:history.refundsComplete,years:history.years,pagesRead:history.pagesRead,purchaseObservations:history.purchases.length,refundObservations:history.refunds.length,uncertainRefunds:uncertain.size,reason:history.reason};
    return history;
  }
  global.GalacticAudible = { audibleItemIdFromUrl, audibleItemFromLibraryEntry, ownershipFromLibraryAction, newAudibleItems, fetchAudibleAudiobooks, inspectPagination, getDiagnostics,recordSaveState,inspectPurchaseHistory,previewPurchaseHistory,probePurchaseHistoryAccess,scanPurchaseHistory };
}(globalThis));
