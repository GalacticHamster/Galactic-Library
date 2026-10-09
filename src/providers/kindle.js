/* Kindle importer. It calls the same Content & Devices library endpoint used
 * by a signed-in Amazon tab. It never handles a password, cookie, or token. */
(function attachKindleImporter(global) {
  'use strict';

  const PAGE_SIZE = 100;
  const MAX_PAGES = 500;
  const BETWEEN_PAGES_MS = 300;
  const ORIGIN_TYPES = [
    'Purchase', 'PublicLibraryLending', 'PersonalLending', 'Sample',
    'ComicsUnlimited', 'KOLL', 'RFFLending', 'Pottermore', 'Prime',
    'Rental', 'DeviceRegistration', 'FreeTrial', 'KindleUnlimited', 'Comixology'
  ];
  const LIBRARY_CATEGORIES = [
    { id: 'books', contentType: 'Ebook', contentCategoryReference: 'booksAll', includesOriginTypes: true },
    { id: 'personal-documents', contentType: 'KindlePDoc', contentCategoryReference: 'pdocs', includesOriginTypes: false, itemStatusList: ['Active'] }
  ];

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function decodeHtml(value) {
    const text = compactText(value);
    if (!text) return '';
    if (!global.document) return text.replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#39;/gu, "'");
    const element = global.document.createElement('textarea');
    element.innerHTML = text;
    return compactText(element.value);
  }

  function stringValues(value) {
    if (Array.isArray(value)) return value.flatMap(stringValues).filter(Boolean);
    if (value && typeof value === 'object') return stringValues(value.name ?? value.title ?? value.value);
    const text = decodeHtml(value);
    return text ? [text] : [];
  }

  function firstText(...values) {
    for (const value of values) {
      const text = compactText(value);
      if (text) return decodeHtml(text);
    }
    return '';
  }

  function acquiredAtFromValue(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const numericValue = Number(value);
    const date = Number.isFinite(numericValue)
      ? new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue)
      : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function ownershipFromOriginType(originType) {
    const origin = compactText(originType).toLocaleLowerCase();
    if (origin === 'purchase') return 'owned';
    if (origin === 'rental') return 'rental';
    if (/(publiclibrarylending|personallending|rfflending)/u.test(origin)) return 'borrowed';
    if (/(kindleunlimited|comicsunlimited|prime|koll|freetrial)/u.test(origin)) return 'subscription';
    // Comixology records need purchase evidence before they can be treated as owned.
    return 'unknown';
  }

  function kindleItemFromOwnershipItem(item, origin = global.location?.origin ?? 'https://www.amazon.com', libraryCategory = 'books') {
    const providerItemId = compactText(item?.asin ?? item?.contentId ?? item?.id).toUpperCase();
    const title = decodeHtml(item?.title);
    if (!providerItemId || !title) return null;
    const originType = firstText(item?.originType, item?.ownershipType, item?.sourceType);
    const contentType = firstText(item?.contentType, item?.contentTypeName, item?.type);
    const itemStatus = firstText(item?.itemStatus, item?.status);
    const publisher = firstText(item?.publisher, item?.publisherName);
    const publicationDate = firstText(item?.publicationDate, item?.publishedDate, item?.publication_date);
    const format = firstText(item?.format, item?.fileFormat, item?.fileExtension);
    return {
      providerItemId,
      title,
      mediaType: 'book',
      ownership: ownershipFromOriginType(originType),
      acquiredAt: acquiredAtFromValue(item?.acquiredDate ?? item?.acquisitionDate ?? item?.dateAcquired ?? item?.purchaseDate),
      metadata: {
        ...(global.GalacticProviderMetadata?.extract(item) ?? {}),
        source: 'amazon-kindle-content-library',
        detailUrl: libraryCategory === 'books' ? `${origin}/dp/${encodeURIComponent(providerItemId)}` : '',
        libraryCategory,
        authors: stringValues(item?.authors ?? item?.author),
        series: stringValues(item?.series ?? item?.seriesName),
        collections: stringValues(item?.collections ?? item?.collectionNames ?? item?.collection),
        originType,
        contentType,
        itemStatus,
        publisher,
        publicationDate,
        format
      }
    };
  }

  function kindleItemEntriesFromOwnershipItems(items, origin, libraryCategory) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => kindleItemFromOwnershipItem(item, origin, libraryCategory)).filter(Boolean);
  }

  function kindleItemsFromOwnershipResponse(response, origin, libraryCategory) {
    const entries = kindleItemEntriesFromOwnershipItems(ownershipItemsFromResponse(response), origin, libraryCategory);
    const itemsById = new Map();
    for (const item of entries) itemsById.set(item.providerItemId, item);
    return [...itemsById.values()];
  }

  function newKindleItems(items, knownItemIds = []) {
    const known = new Set((Array.isArray(knownItemIds) ? knownItemIds : []).map((id) => compactText(id).toUpperCase()).filter(Boolean));
    return (Array.isArray(items) ? items : []).filter((item) => !known.has(compactText(item?.providerItemId).toUpperCase()));
  }

  function explicitCollectsStatement(value) {
    const text = compactText(value);
    const match = text.match(/\bcollects?\b\s*(?::|-)?\s*.{2,700}/iu);
    const statement=compactText(match?.[0]);
    for(const boundary of statement.matchAll(/[.!?](?=\s+[A-Z])/gu)){
      const before=statement.slice(0,boundary.index);
      if(boundary[0]==='.'&&(/\b(?:vols?|no|nos|ed|pt|pts|mr|mrs|dr|st|vs)$/iu.test(before)||/\b(?:[A-Z]\.)*[A-Z]$/u.test(before)))continue;
      return statement.slice(0,boundary.index).trim();
    }
    return statement.replace(/[.!?]+$/u, '');
  }

  const contentsExtractorVersion = 5;
  function explicitContentsStatement(value) {
    const text = compactText(value);
    const match = text.match(/\b(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b\s*(?::|-)?\s*.{2,10000}/iu);
    if (!match) return '';
    const statement = match[0];
    for (const boundary of statement.matchAll(/[.!?](?=\s+[A-Z])|(?<=\d)[.!?](?=[A-Z])/gu)) {
      const before = statement.slice(0,boundary.index);
      if (boundary[0] === '.' && (/\b(?:vols?|no|nos|ed|pt|pts|mr|mrs|ms|sgt|gen|ft|dr|st|vs)$/iu.test(before) || /\b(?:[A-Z]\.)*[A-Z]$/u.test(before))) continue;
      if(boundary[0]!=='.' && !/^\s+(?:a|the|more|also|read|this)\b/iu.test(statement.slice(boundary.index+1)))continue;
      return statement.slice(0,boundary.index).trim();
    }
    return statement.replace(/[.!?]+$/u,'');
  }

  function kindleContentsStatementFromDocument(document) {
    for (const selector of ['#bookDescription_feature_div','#productDescription','#featurebullets_feature_div','#productOverview_feature_div','[data-feature-name="bookDescription"]']) {
      for (const element of document.querySelectorAll(selector)) {
        const statement = explicitContentsStatement(element.textContent);
        if (statement) return statement;
      }
    }
    return '';
  }

  function kindleDescriptionText(element) {
    // Static textContent loses BRs and glues adjacent paragraphs. Preserve the
    // DOM's explicit line/block boundaries in source evidence, without turning
    // line breaks into punctuation or claiming they delimit bibliographic works.
    // Inline emphasis/spans must remain contiguous (including split title words).
    if (!element.childNodes) return compactText(String(element.textContent??'').slice(0,24000));
    const parts=[];let remaining=24000,visited=0;
    const append=text=>{if(remaining>0){const piece=text.slice(0,remaining);parts.push(piece);remaining-=piece.length;}};
    function visit(node,depth) {
      if(!remaining||visited++>=4000||depth>64)return;
      if(node.nodeType===3){append(node.nodeValue??'');return;}
      if(node.nodeType!==1)return;
      const tag=node.tagName;
      if(/^(?:SCRIPT|STYLE|NOSCRIPT|IFRAME|FORM|INPUT|BUTTON|SELECT|TEXTAREA)$/u.test(tag))return;
      if(tag==='BR'){append('\n');return;}
      const block=/^(?:P|DIV|LI|UL|OL|H[1-6]|BLOCKQUOTE|TR)$/u.test(tag);
      if(block)append('\n');
      for(const child of node.childNodes){visit(child,depth+1);if(!remaining||visited>=4000)break;}
      if(block)append('\n');
    }
    visit(element,0);
    return parts.join('').replace(/\r\n?/gu,'\n').split('\n').map(compactText).join('\n').replace(/\n{2,}/gu,'\n').trim();
  }

  function kindleDescriptionBlocks(document) {
    const blocks=[],seen=new Set();let total=0;
    for(const selector of ['#bookDescription_feature_div','#productDescription','#featurebullets_feature_div','#productOverview_feature_div','[data-feature-name="bookDescription"]']){
      for(const element of document.querySelectorAll(selector)){
        // Bound reads before whitespace normalization, even for pathological pages.
        const text=kindleDescriptionText(element).slice(0,Math.min(12000,24000-total));
        if(!text||seen.has(text))continue;seen.add(text);blocks.push({selector,text});total+=text.length;
        if(blocks.length===8||total===24000)return blocks;
      }
    }
    return blocks;
  }

  function kindleCollectsStatementFromDocument(document) {
    const selectors = [
      '#bookDescription_feature_div', '#productDescription', '#featurebullets_feature_div',
      '#productOverview_feature_div', '[data-feature-name="bookDescription"]'
    ];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const statement = explicitCollectsStatement(element.textContent);
        if (statement) return statement;
      }
    }
    return '';
  }

  function kindleCategoryPaths(document){
    const paths=[],seen=new Set();
    for(const selector of ['#wayfinding-breadcrumbs_feature_div','#wayfinding-breadcrumbs_container','[data-feature-name="wayfinding-breadcrumbs"]']){
      for(const container of document.querySelectorAll(selector)){
        for(const list of container.querySelectorAll('ul,ol')){
          const children=[...list.children].filter(node=>node.tagName==='LI');
          if(children.length>24)continue;
          const nodes=[];let invalid=false;
          for(const child of children){
            const anchor=child.querySelector('a'),label=compactText(anchor?.textContent??child.textContent);
            if(!label||/^[›»>\/|·]+$/u.test(label))continue;
            if(label.length>200||nodes.length===12){invalid=true;break;}
            let nodeId='';
            if(anchor){
              try{
                const url=new URL(anchor.getAttribute('href'),'https://www.amazon.com');
                if(url.origin!=='https://www.amazon.com'||url.username||url.password||!/\/(?:b|s|gp\/browse)(?:\/|$)/u.test(url.pathname)){invalid=true;break;}
                const categoryIds=[...(url.searchParams.get('rh')??'').matchAll(/(?:^|,)n:(\d+)(?=,|$)/gu)];
                nodeId=url.searchParams.get('node')??categoryIds.at(-1)?.[1]??'';
                if(nodeId&&!/^\d{1,20}$/u.test(nodeId)){invalid=true;break;}
              }catch{invalid=true;break;}
            }
            nodes.push({label,nodeId});
          }
          if(invalid||!nodes.length||!nodes.some(node=>/^Kindle (?:Store|eBooks)$/iu.test(node.label)))continue;
          const key=JSON.stringify(nodes);if(seen.has(key))continue;seen.add(key);
          paths.push({selector,nodes});if(paths.length===8)return paths;
        }
      }
    }
    return paths;
  }

  // Product details are observations, never bibliographic identity. Scope to
  // product sections; ignore commercial/ranking/navigation text entirely.
  const detailText=value=>String(value??'').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu,'').replace(/\s+/gu,' ').trim();
  function detailDate(raw){
    const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
    let year,month,day;const iso=/^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw),forward=/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/iu.exec(raw),reverse=/^(\d{1,2})\s+([A-Za-z]+)[,]?\s+(\d{4})$/u.exec(raw);
    if(iso)[,year,month,day]=iso;
    else if(forward){year=forward[3];month=months.indexOf(forward[1].toLowerCase())+1;day=forward[2];}
    else if(reverse){year=reverse[3];month=months.indexOf(reverse[2].toLowerCase())+1;day=reverse[1];}
    else return '';
    const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
    return Number(year)>=1000&&date.getUTCFullYear()===Number(year)&&date.getUTCMonth()===Number(month)-1&&date.getUTCDate()===Number(day)?date.toISOString().slice(0,10):'';
  }
  function detailIsbn(raw,length){
    const value=raw.toUpperCase().replace(/[\s-]/gu,'');
    if(length===13&&/^97[89]\d{10}$/u.test(value)&&[...value].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10===0)return value;
    if(length===10&&/^\d{9}[\dX]$/u.test(value)&&[...value].reduce((n,d,i)=>n+(d==='X'?10:Number(d))*(10-i),0)%11===0)return value;
    return '';
  }
  function kindleProductDetails(document,sourceUrl){
    let url;try{url=new URL(sourceUrl);}catch{return null;}
    if(url.origin!=='https://www.amazon.com'||!/^\/dp\/[A-Z0-9]{10}$/u.test(url.pathname)||!document.querySelector('#productTitle, #ebooksProductTitle'))return null;
    const asin=url.pathname.split('/').at(-1),observations=[],seen=new Set();
    const labels={asin:'asin',publisher:'publisher','publication date':'publicationDate',language:'language','isbn 13':'isbn13','isbn 10':'isbn10','print length':'pageCount','paperback':'pageCount','hardcover':'pageCount',series:'series','book series':'series',edition:'edition','file size':'fileSize','guided view':'guidedView','enhanced typesetting':'enhancedTypesetting','x ray':'xRay','word wise':'wordWise','page flip':'pageFlip',accessibility:'accessibility'};
    const seriesUrl=raw=>{try{const u=new URL(raw,'https://www.amazon.com');return u.origin==='https://www.amazon.com'&&!u.username&&!u.password&&/^\/(?:dp|gp\/product|kindle-dbs|series)\//u.test(u.pathname)?u.origin+u.pathname:'';}catch{return '';}};
    function add(label,raw,selector,link=''){
      label=detailText(label).replace(/[:?]+$/u,'').trim();raw=detailText(raw);
      const key=label.toLowerCase().replace(/[^a-z0-9]+/gu,' ').trim(),field=labels[key];
      if(!field||!raw||label.length>100||raw.length>500||observations.length>=40)return;
      let values=[raw];if(field.startsWith('isbn'))values=raw.match(/97[89](?:[\s-]*\d){10}|(?:\d[\s-]*){9}[\dXx]/gu)??[raw];
      for(const original of values.slice(0,8)){
        let value=original,status='observed';
        if(field==='isbn13'||field==='isbn10'){value=detailIsbn(original,field==='isbn13'?13:10);status=value?'valid-checksum':'invalid';}
        else if(field==='publicationDate'){value=detailDate(original);status=value?'parsed':'unparsed';}
        else if(field==='pageCount'){value=/^([\d,]+)\s*(?:pages?)?$/iu.exec(original)?.[1]?.replace(/,/gu,'')??'';if(!/^\d{1,7}$/u.test(value)||Number(value)<1||Number(value)>1000000)value='';status=value?'parsed':'unparsed';}
        else if(field==='asin'){value=original.toUpperCase();if(!/^[A-Z0-9]{10}$/u.test(value)){value='';status='invalid';}}
        const publisherDate=field==='publisher'?/\s*\(([^()]+)\)\s*$/u.exec(original):null;
        if(publisherDate&&detailDate(publisherDate[1]))value=original.slice(0,publisherDate.index).trim();
        const reference=field==='series'?seriesUrl(link):'',dedupe=[field,value||original,reference].join('\0');
        if(seen.has(dedupe)){if(publisherDate&&detailDate(publisherDate[1]))add('Publication date',publisherDate[1],selector);continue;}seen.add(dedupe);observations.push({field,label,raw:original,value,status,selector,...(reference?{url:reference}:{})});
        if(observations.length>=40)return;
        if(field==='publisher'){
          const date=/\s*\(([^()]+)\)\s*$/u.exec(original);
          if(date&&detailDate(date[1])){observations.at(-1).value=original.slice(0,date.index).trim();add('Publication date',date[1],selector);}
        }
      }
    }
    for(const selector of ['#detailBullets_feature_div','#detailBulletsWrapper_feature_div'])for(const container of document.querySelectorAll(selector))for(const row of [...container.querySelectorAll('li')].slice(0,80)){
      const label=row.querySelector('.a-text-bold, b, strong');if(!label)continue;
      const raw=detailText(row.textContent),prefix=detailText(label.textContent);if(!raw.startsWith(prefix))continue;
      add(prefix,raw.slice(prefix.length).replace(/^\s*[:?]\s*/u,''),selector,row.querySelector('a')?.getAttribute('href'));
    }
    for(const selector of ['#productDetails_detailBullets_sections1','#productDetails_techSpec_section_1','#productDetails_techSpec_section_2'])for(const table of document.querySelectorAll(selector))for(const row of [...table.querySelectorAll('tr')].slice(0,80)){
      const label=row.querySelector('th'),value=row.querySelector('td');if(label&&value)add(label.textContent,value.textContent,selector,value.querySelector('a')?.getAttribute('href'));
    }
    const attributes={publisher:'Publisher',publication_date:'Publication date',language:'Language',isbn13:'ISBN-13',isbn10:'ISBN-10',print_length:'Print length',edition:'Edition',series_content:'Series'};
    for(const [name,label]of Object.entries(attributes)){
      const selector='#rpi-attribute-book_details-'+name;for(const node of document.querySelectorAll(selector)){const value=node.querySelector('.rpi-attribute-value');if(value)add(label,value.textContent,selector,value.querySelector('a')?.getAttribute('href'));}
    }
    for(const node of document.querySelectorAll('#seriesBulletWidget_feature_div'))for(const anchor of [...node.querySelectorAll('a')].slice(0,8))add('Series',anchor.textContent,'#seriesBulletWidget_feature_div',anchor.getAttribute('href'));
    for(const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0,4)){
      if(script.textContent.length>20000)continue;let data;try{data=JSON.parse(script.textContent);}catch{continue;}
      const entries=Array.isArray(data)?data:Array.isArray(data?.['@graph'])?data['@graph']:[data];
      for(const item of entries.slice(0,20)){
        if(!item||!['Book','Product'].includes(item['@type']))continue;
        const page=seriesUrl(item.url??'');if(item.asin!==asin&&item.sku!==asin&&page!==url.origin+url.pathname)continue;
        for(const [key,label]of [['asin','ASIN'],['publisher','Publisher'],['datePublished','Publication date'],['inLanguage','Language'],['numberOfPages','Print length'],['bookEdition','Edition']]){const v=item[key];if(typeof v==='string'||typeof v==='number'||key==='publisher'&&typeof v?.name==='string')add(label,key==='publisher'&&v?.name?v.name:v,'product-json-ld');}
        for(const isbn of (Array.isArray(item.isbn)?item.isbn:[item.isbn]).slice(0,8))if(typeof isbn==='string')add(isbn.replace(/[\s-]/gu,'').length===10?'ISBN-10':'ISBN-13',isbn,'product-json-ld');
        if(typeof item.isPartOf?.name==='string')add('Series',item.isPartOf.name,'product-json-ld',item.isPartOf.url);
      }
    }
    return observations.length?{version:1,asin,sourceUrl:url.origin+url.pathname,observations}:null;
  }

  async function fetchKindleProductComicContents(detailUrl, {signal,timing,requestPacer} = {}) {
    const url = new URL(detailUrl, global.location?.origin ?? 'https://www.amazon.com');
    if (url.origin !== (global.location?.origin ?? 'https://www.amazon.com') || !/^\/dp\//u.test(url.pathname)) throw new Error('Kindle did not provide a usable Amazon product-page URL.');
    const request=async()=>{
      const headersEnd=timing?.begin('fetch_headers',timing.attempts);
      try{return await fetch(url.toString(), { credentials: 'include', cache: 'no-store', signal });}finally{headersEnd?.();}
    };
    const response=requestPacer?await requestPacer.start(request,{signal,timing}):await request();
    // Older Comixology/Comics Unlimited entitlements can remain in a Kindle
    // library after Amazon removes their public retail listing. That is a
    // "no page to inspect" result for this lookup; an explicit rescan can revisit it.
    if (response.status === 404) return { sourceUrl: `${url.origin}${url.pathname}`, statement: '', availability: 'unavailable', extractorVersion:contentsExtractorVersion };
    if (!response.ok) throw new Error(`Amazon returned ${response.status} while loading a Kindle product page.`);
    const bodyEnd=timing?.begin('response_body',timing.attempts);
    let body;try{body=await response.text();}finally{bodyEnd?.();}
    const domEnd=timing?.begin('dom_parse',timing.attempts);
    let document;try{document=new DOMParser().parseFromString(body, 'text/html');}finally{domEnd?.();}
    const checksEnd=timing?.begin('page_checks',timing.attempts);
    try{
    if (document.querySelector('#captchacharacters, form[action*="validateCaptcha" i]')) throw new Error('Amazon requested a CAPTCHA; wait before continuing the Kindle contents scan.');
    if(document.querySelector('#ap_email,form[name="signIn"]'))throw new Error('Sign in again before retrying the Kindle contents lookup.');
    }finally{checksEnd?.();}
    const extractEnd=timing?.begin('extraction',timing.attempts);
    let statement,descriptionBlocks,categoryPaths,productDetailsEvidence;try{
      productDetailsEvidence=kindleProductDetails(document,`${url.origin}${url.pathname}`);
      categoryPaths=kindleCategoryPaths(document);
      descriptionBlocks=kindleDescriptionBlocks(document);
      statement=descriptionBlocks.map(block=>explicitContentsStatement(block.text)).find(Boolean)??'';
      // Preview only. The worker performs contextual candidate assessment using
      // the existing review parser, including no-trigger structural discovery.
      if(!statement)statement=descriptionBlocks.find(b=>/\bissues?\s*#?\d|#\s*\d|\bContents\s*:/iu.test(b.text))?.text.slice(0,2000)??'';
    }finally{extractEnd?.();}
    return { sourceUrl: `${url.origin}${url.pathname}`, statement, descriptionBlocks,...(productDetailsEvidence?{productDetailsEvidence}:{}),...(categoryPaths.length?{categoryPaths}:{}), availability: statement?'statement-found':'no-statement', extractorVersion:contentsExtractorVersion };
  }

  function ownershipItemsFromResponse(response) {
    const items = response?.GetContentOwnershipData?.items ?? response?.items ?? [];
    return Array.isArray(items) ? items : [];
  }

  function csrfTokenFromDocument(document) {
    const input = document.querySelector('[name="csrfToken"], [name="csrf-token"], input[data-csrf-token]');
    const fromInput = compactText(input?.value ?? input?.getAttribute('data-csrf-token'));
    if (fromInput) return fromInput;
    const scripts = [...document.scripts].map((script) => script.textContent ?? '').join('\n');
    return scripts.match(/(?:csrfToken|csrf-token)\s*[:=]\s*["']([^"']+)["']/u)?.[1] ?? '';
  }

  async function fetchKindleLibraryPage(startIndex, csrfToken, category) {
    const activityInput = {
      // Household-shared content is readable access, not proof of purchase.
      showSharedContent: false,
      fetchCriteria: { sortOrder: 'DESCENDING', sortIndex: 'DATE', startIndex, batchSize: PAGE_SIZE, totalContentCount: -1 },
      surfaceType: 'LargeDesktop',
      contentType: category.contentType,
      contentCategoryReference: category.contentCategoryReference,
      ...(category.itemStatusList ? { itemStatusList: category.itemStatusList } : {}),
      ...(category.includesOriginTypes ? { originTypes: ORIGIN_TYPES } : {})
    };
    const body = new URLSearchParams({
      activity: 'GetContentOwnershipData',
      activityInput: JSON.stringify(activityInput),
      csrfToken
    });
    const response = await fetch('/hz/mycd/digital-console/ajax', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      credentials: 'include',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Amazon returned ${response.status} while loading your Kindle library. Confirm that you are signed in.`);
    const payload = await response.json().catch(() => null);
    if (payload?.success !== true || !payload?.GetContentOwnershipData || !Array.isArray(payload.GetContentOwnershipData.items)) {
      throw new Error('Amazon returned an unreadable Kindle library response. Open Manage Your Content and Devices, then try again.');
    }
    return payload;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function fetchKindleBooks(reportProgress = () => {}, knownItemIds = null) {
    const csrfToken = csrfTokenFromDocument(global.document);
    if (!csrfToken) throw new Error('Amazon did not expose the library page token. Open Manage Your Content and Devices, wait for it to finish loading, then try again.');
    const booksById = new Map();
    const incremental = Array.isArray(knownItemIds);
    const categoryCounts = Object.fromEntries(LIBRARY_CATEGORIES.map((category) => [category.id, 0]));
    const diagnostics = Object.fromEntries(LIBRARY_CATEGORIES.map((category) => [category.id, {
      reportedCount: null, rawCount: 0, readableCount: 0, duplicateCount: 0, pagesRead: 0
    }]));
    let pagesRead = 0;
    for (const category of LIBRARY_CATEGORIES) {
      let finished = false;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        reportProgress({ pagesRead, books: booksById.size, categoryCounts });
        const payload = await fetchKindleLibraryPage(page * PAGE_SIZE, csrfToken, category);
        const rawItems = ownershipItemsFromResponse(payload);
        if (rawItems.some((item) => !item || typeof item.title !== 'string' || !['string', 'number'].includes(typeof (item.asin ?? item.contentId ?? item.id)))) throw new Error(`Amazon returned malformed ${category.id} entries. No library changes were saved.`);
        const readableItems = kindleItemEntriesFromOwnershipItems(rawItems, global.location?.origin, category.id);
        const pageBooks = kindleItemsFromOwnershipResponse(payload, global.location?.origin, category.id);
        const countValue = payload.GetContentOwnershipData.numberOfItems;
        const reportedCount = countValue === undefined || countValue === null || countValue === '' ? null : Number(countValue);
        if (reportedCount !== null && (!Number.isSafeInteger(reportedCount) || reportedCount < 0)) throw new Error(`Amazon returned an invalid ${category.id} item count. No library changes were saved.`);
        const diagnostic = diagnostics[category.id];
        if (page > 0 && reportedCount !== diagnostic.reportedCount) throw new Error(`Amazon changed the ${category.id} total during the scan. Please retry; no library changes were saved.`);
        diagnostic.reportedCount = reportedCount;
        diagnostic.pagesRead += 1;
        if (readableItems.length !== rawItems.length) throw new Error(`Amazon returned unreadable ${category.id} entries. No library changes were saved.`);
        diagnostic.rawCount += rawItems.length;
        diagnostic.readableCount += readableItems.length;
        diagnostic.duplicateCount += readableItems.length - pageBooks.length;
        const booksToSave = incremental ? newKindleItems(pageBooks, knownItemIds) : pageBooks;
        for (const book of booksToSave) {
          if (!booksById.has(book.providerItemId)) {
            categoryCounts[category.id] += 1;
          }
          else diagnostic.duplicateCount += 1;
          booksById.set(book.providerItemId, book);
        }
        pagesRead += 1;
        reportProgress({ pagesRead, books: booksById.size, categoryCounts });
        // Amazon returns this endpoint newest first. Once a whole page is
        // already in the local full baseline, older pages cannot add a new
        // entitlement. Full rescan remains available for reconciliation.
        if (incremental && pageBooks.length > 0 && booksToSave.length === 0) { finished = true; break; }
        const reachedReportedEnd = reportedCount !== null && (page + 1) * PAGE_SIZE >= reportedCount;
        const reachedUnreportedEnd = reportedCount === null && rawItems.length < PAGE_SIZE;
        if (rawItems.length === 0 || reachedReportedEnd || reachedUnreportedEnd) {
          if (!incremental && reportedCount !== null && diagnostic.rawCount !== reportedCount) throw new Error(`Amazon reported ${reportedCount} ${category.id} items but returned ${diagnostic.rawCount}. No library changes were saved.`);
          finished = true;
          break;
        }
        await wait(BETWEEN_PAGES_MS);
      }
      if (!finished) throw new Error(`Kindle reached its ${MAX_PAGES}-page limit in ${category.id} before completing the scan. No library changes were saved.`);
    }
    if (!booksById.size && !incremental) throw new Error('Amazon returned no readable Kindle books. Please try again later.');
    const items = [...booksById.values()];
    const snapshot = incremental ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('kindle', items,
      Object.entries(diagnostics).map(([id, detail]) => ({ ...global.GalacticProviderSnapshot.completedScope(id, detail.rawCount, detail.reportedCount, detail.reportedCount === null ? 'pagination-end' : 'reported-count', detail.pagesRead), duplicateCount: detail.duplicateCount })));
    return { items, diagnostics, snapshot };
  }

  global.GalacticKindle = { kindleItemsFromOwnershipResponse, kindleItemFromOwnershipItem, ownershipFromOriginType, newKindleItems, explicitCollectsStatement, kindleCollectsStatementFromDocument, explicitContentsStatement, kindleContentsStatementFromDocument, kindleDescriptionBlocks, kindleCategoryPaths, kindleProductDetails, contentsExtractorVersion, fetchKindleProductComicContents, fetchKindleBooks };
}(globalThis));
