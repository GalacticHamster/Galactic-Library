// Synthetic Prime Video layouts; no provider session, captured pages or real titles.
import {createStorageWriter} from '../src/background/storage-writer.js';
const checks=[];
const assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
const nativeFetch=globalThis.fetch,nativeTimeout=globalThis.setTimeout;
const [snapshotCode,importerCode,panelCode]=await Promise.all(['provider-snapshot','amazon-video','amazon-video-content'].map(async name=>{
 const response=await nativeFetch(`/src/providers/${name}.js`);if(!response.ok)throw Error('Missing packaged provider script');return response.text();
}));
let frame;
const card=(n,{ownership='Purchased',bad=false}={})=>`<article data-card-entity-id="amzn1.dv.gti.fixture-${n}" data-card-entity-type="${n%2?'MOVIE':'TV_SEASON'}" ${bad?'':'data-card-title="PRIVATE_TITLE"'} style="height:110px"><a href="/detail/B${String(n).padStart(9,'0')}"></a>${ownership}</article>`;
async function setup({nested=false,ids=[1,2,3,4],outside='',inside='',total=null}={}){
 frame?.remove();frame=document.createElement('iframe');frame.style.cssText='width:700px;height:320px;position:absolute;top:0;left:0;border:0';
 const ready=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
 frame.srcdoc=`<!doctype html><style>html,body{margin:0}main{display:block}#list{${nested?'height:180px;overflow-y:auto;':''}}aside,footer,header,nav{position:fixed;right:0;top:0}</style><main>${total===null?'':`<p>Purchases (${total})</p>`}<div id="list">${ids.map(n=>card(n)).join('')}</div>${inside}</main>${outside}`;
 document.body.append(frame);await ready;
 const win=frame.contentWindow,doc=win.document,list=doc.querySelector('#list');let pauses=0,scrolls=0,onPause=()=>{},onScroll=()=>{};
 win.setTimeout=(callback,ms,...args)=>nativeTimeout(()=>{if(ms===700){pauses++;onPause(pauses);}callback(...args);},ms===700?0:ms);
 const originalScroll=win.scrollTo.bind(win);win.scrollTo=options=>{scrolls++;originalScroll(options);onScroll(scrolls);};
 const originalListScroll=list.scrollTo.bind(list);list.scrollTo=options=>{scrolls++;originalListScroll(options);onScroll(scrolls);};
 win.eval(snapshotCode);win.eval(importerCode);
 return {win,doc,list,api:win.GalacticAmazonVideo,add:(...ids)=>list.insertAdjacentHTML('beforeend',ids.map(n=>card(n)).join('')),onPause:fn=>{onPause=fn;},onScroll:fn=>{onScroll=fn;},pauses:()=>pauses,scrolls:()=>scrolls};
}
async function rejects(page,pattern,message){let error;try{await page.api.fetchAmazonVideoLibrary();}catch(value){error=value;}assert(error&&pattern.test(error.message),message);return error;}
try{
 // The old implementation reads global continuation controls and never finishes.
 let page=await setup({outside:'<aside><div role="progressbar"></div><button id="other-more">Show more</button></aside>'});
 let unrelatedClicks=0;page.doc.querySelector('#other-more').onclick=()=>unrelatedClicks++;
 let result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===4&&result.snapshot.complete,'Terminal library completes despite unrelated page loading and Show more controls');
 assert(unrelatedClicks===0,'An unrelated Show more button is never clicked');
 assert(page.api.getDiagnostics().passes.at(-1).ignoredLoading===1&&page.api.getDiagnostics().passes.at(-1).ignoredLoadMore===1,'Diagnostics explain ignored outside controls with counts only');
 assert(page.pauses()<10,'A settled library completes without exhausting the scroll safety budget');
 const firstItems=JSON.stringify(result.items);result=await page.api.fetchAmazonVideoLibrary();assert(JSON.stringify(result.items)===firstItems,'An unchanged repeat produces the same item IDs, metadata and access evidence');
 // Actual CSS overflow geometry: window cannot advance this element.
 page=await setup({nested:true});result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===4&&result.snapshot.complete&&page.api.getDiagnostics().passes.at(-1).scrollTarget==='nested','A nested vertical library scroller reaches its real terminal range');
 assert(page.list.scrollTop+page.list.clientHeight>=page.list.scrollHeight-4,'Nested completion uses the list viewport rather than the window viewport');
 // A loading pause is not an end: wait six polls before adding the next batch.
 page=await setup({nested:true,inside:'<div id="loading" role="progressbar"></div>'});
 page.onPause(n=>{if(n===7){page.add(5,6);page.doc.querySelector('#loading').remove();}});
 result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===6&&page.pauses()>=10,'Genuine delayed library loading is retained beyond the quiet-period length');
 assert(result.items.some(item=>item.providerItemId.endsWith('-6')),'The delayed final batch is included in the validated snapshot');
 // A real library button fetches another group and removes itself only at end.
 page=await setup({inside:'<nav><button id="more">Load more</button></nav>'});let libraryClicks=0;
 page.doc.querySelector('#more').onclick=()=>{libraryClicks++;page.add(5);page.doc.querySelector('#more').remove();};
 result=await page.api.fetchAmazonVideoLibrary();
 assert(libraryClicks===1&&result.items.length===5,'Library-scoped navigation Load more is followed before terminal completion');
 page=await setup({outside:'<nav><button aria-controls="list" id="external-more">Show more</button></nav>'});
 page.doc.querySelector('#external-more').onclick=()=>{page.add(5);page.doc.querySelector('#external-more').remove();};
 result=await page.api.fetchAmazonVideoLibrary();assert(result.items.length===5,'An outside pager explicitly associated with the library remains a real continuation control');
 // Hidden and disabled controls must not look like perpetual continuation.
 page=await setup({inside:'<div role="progressbar" hidden></div><button hidden>Load more</button><button aria-disabled="true">Show more</button><button disabled>See more</button>'});
 result=await page.api.fetchAmazonVideoLibrary();assert(result.items.length===4,'Hidden and disabled library controls do not prevent a real end');
 // Virtualized DOM replaces the group; retain stable IDs from prior observations.
 page=await setup({nested:true,inside:'<div id="loading" role="progressbar"></div>'});
 page.onPause(n=>{if(n===4){page.list.innerHTML=[5,6,7,8].map(n=>card(n)).join('');page.doc.querySelector('#loading').remove();}});
 result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===8,'Virtualized replacement preserves both earlier and later rendered groups');
 // Preallocated virtual scroll range: jumping straight to bottom loses rows.
 page=await setup({nested:true});
 const renderWindow=()=>{const first=Math.floor(page.list.scrollTop/100)+1;page.list.innerHTML='<div style="height:1000px"></div>'+Array.from({length:Math.min(3,11-first)},(_,i)=>card(first+i).replace('height:110px',`position:absolute;top:${(first+i-1)*100}px;height:100px`)).join('');};
 page.list.style.position='relative';renderWindow();page.onScroll(renderWindow);
 result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===10&&Array.from({length:10},(_,i)=>i+1).every(n=>result.items.some(item=>item.providerItemId.endsWith('-'+n))),'Overlapping viewport traversal retains every group in a preallocated virtualized range');
 page=await setup({nested:true});page.doc.querySelector('main').insertAdjacentHTML('beforeend',`<div style="height:180px;overflow-y:auto">${[5,6,7,8].map(n=>card(n)).join('')}</div><button aria-label="Next page">&gt;</button>`);
 await rejects(page,/another scrolling title list/,'Separate nested title lists cannot be mistaken for a completed document');
 const layout=page.api.getDiagnostics().currentPage;
 assert(layout.scrollableContainers===2&&layout.remainingOtherScrollers===2&&layout.visibleNextLikeControls===1,'Export distinguishes unvisited scrollers and accessible Next controls without recording their text');
 // A busy listing never qualifies, even when geometry/count stops changing.
 page=await setup({inside:'<div role="progressbar"></div>'});
 await rejects(page,/250-pass limit/,'A permanently busy listing fails instead of certifying a partial collection');
 assert(page.api.getDiagnostics().state==='failed'&&page.api.getDiagnostics().reason==='scroll-limit'&&page.api.getDiagnostics().passes.length===250,'Bounded failure diagnostics identify the unsatisfied continuation checks');
 assert(!/PRIVATE_TITLE|amzn1|fixture-|https?:|cookie|token|account/i.test(JSON.stringify(page.api.getDiagnostics())),'Diagnostic export contains no titles, product IDs, URLs, account details or credentials');
 page=await setup({inside:'<button>Show more</button>'});await rejects(page,/250-pass limit/,'An unresponsive real library continuation control remains an incomplete scan');
 page=await setup({total:99});await rejects(page,/reported 99 items but returned 4/,'An explicit library count mismatch cannot become a complete snapshot');
 page=await setup({ids:[]});await rejects(page,/no readable movie or TV cards/,'A missing or empty listing cannot erase the saved library');
 page=await setup();page.list.insertAdjacentHTML('beforeend',card(99,{bad:true}));await rejects(page,/unreadable library cards/,'Unreadable cards still prevent replacement');
 page=await setup();page.list.innerHTML=card(1,{ownership:'Rental'})+card(2,{ownership:'Purchased'})+card(3,{ownership:'Included with Prime'});
 result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items[0].ownership==='rental'&&result.items[1].ownership==='owned'&&result.items[2].ownership==='unknown','Rental, purchase and unconfirmed access distinctions remain unchanged');
 page=await setup();result=await page.api.fetchAmazonVideoLibrary(()=>{},['amzn1.dv.gti.fixture-1','amzn1.dv.gti.fixture-2','amzn1.dv.gti.fixture-3','amzn1.dv.gti.fixture-4']);
 assert(!result.snapshot&&result.items.length===0,'A quick update stops at an already known rendered group without replacing the full library');
 // Real content panel and production writer, with entirely disposable memory.
 const memory={};const storage={async get(defaults){return structuredClone({...defaults,...memory});},async set(value){Object.assign(memory,structuredClone(value));}};
 const writer=createStorageWriter(storage);
 await writer.mergeProviderItems('amazon-video',[{providerItemId:'old-video',title:'Preserved video',mediaType:'movie',ownership:'owned'}]);
 await writer.mergeProviderItems('gog',[{providerItemId:'old-game',title:'Unrelated game',mediaType:'game',ownership:'owned'}]);
 const before=JSON.stringify(await writer.getDatabase());let imports=0,failures=0,shadow,knownIds=[],messages=[];
 page=await setup({inside:'<div role="progressbar"></div>'});
 const renderPanel=()=>{
  const original=page.win.Element.prototype.attachShadow;page.win.Element.prototype.attachShadow=function(options){shadow=original.call(this,options);return shadow;};
  page.win.GalacticSync={send:async request=>{
   messages.push(request.type);
   if(request.type==='GET_PROVIDER_SYNC_STATE')return {ok:true,hasFullBaseline:true,syncState:{knownProviderItemIds:knownIds}};
   if(request.type==='IMPORT_PROVIDER_ITEMS'){imports++;const database=await writer.replaceProviderItems('amazon-video',JSON.parse(JSON.stringify(request.items)),{syncMode:'full'},JSON.parse(JSON.stringify(request.snapshot)));return {ok:true,movieCount:Object.values(database.providerItems).filter(item=>item.provider==='amazon-video'&&item.mediaType==='movie').length,tvCount:Object.values(database.providerItems).filter(item=>item.provider==='amazon-video'&&item.mediaType==='tv').length};}
   throw Error('Unexpected message');},failed:async()=>{failures++;}};
  page.win.eval(panelCode.replace("if (!location.pathname.includes('/gp/video/')",'if (false'));
  page.win.Element.prototype.attachShadow=original;
 };
 const waitFor=async predicate=>{for(let n=0;n<500;n++){if(predicate())return;await new Promise(resolve=>nativeTimeout(resolve,10));}throw Error('Panel did not finish');};
 renderPanel();assert(shadow.querySelector('details summary').textContent==='Scan diagnostics'&&shadow.querySelector('[data-export-diagnostics]').disabled,'Scan diagnostics is discoverable before importing and export explains availability through its disabled state');
 shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>failures===1&&!shadow.querySelector('.status').dataset.busy);
 assert(imports===0&&JSON.stringify(await writer.getDatabase())===before,'A failed production-panel scan sends no import and preserves all saved records');
 assert(!shadow.querySelector('[data-export-diagnostics]').disabled,'A failed scan enables the ordinary UI diagnostic export action');
 let exported;page.win.URL.createObjectURL=blob=>{exported=blob;return 'blob:fixture';};page.win.URL.revokeObjectURL=()=>{};page.win.HTMLAnchorElement.prototype.click=function(){};
 shadow.querySelector('[data-export-diagnostics]').click();assert(exported&&JSON.parse(await exported.text()).reason==='scroll-limit'&&JSON.stringify(await writer.getDatabase())===before,'Export action creates diagnostic JSON without modifying storage');
 page.doc.querySelector('[role="progressbar"]').remove();shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>imports===1&&!shadow.querySelector('.status').dataset.busy);
 assert(shadow.querySelector('.status').textContent.startsWith('Full rescan complete')&&!shadow.querySelector('[data-export-diagnostics]').disabled&&shadow.querySelector('details').open,'Successful scans also expose diagnostics instead of hiding evidence of premature completion');
 const db=await writer.getDatabase();assert(Object.values(db.providerItems).filter(item=>item.provider==='amazon-video').length===4&&Object.values(db.providerItems).some(item=>item.provider==='gog'),'A validated full snapshot updates only Amazon Video records');
 const beforeCheck=JSON.stringify(db);messages=[];shadow.querySelector('[data-mode="inspect"]').click();await waitFor(()=>!shadow.querySelector('.status').dataset.busy);
 assert(messages.length===0&&imports===1&&failures===1&&JSON.stringify(await writer.getDatabase())===beforeCheck,'Check listing neither begins a sync lease nor writes scan health, records or imports');
 assert(shadow.querySelector('.status').textContent.includes('4 titles found')&&shadow.querySelector('.status').textContent.includes('does not confirm the entire collection'),'A successful read-only check reports observations without claiming full-library completeness');
 shadow.querySelector('[data-export-diagnostics]').click();assert(JSON.parse(await exported.text()).operation.outcome==='checked-without-import','Read-only export identifies a check rather than a saved import');
 knownIds=['amzn1.dv.gti.fixture-1','amzn1.dv.gti.fixture-2','amzn1.dv.gti.fixture-3','amzn1.dv.gti.fixture-4','unseen-saved-product'];
 shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>failures===2&&!shadow.querySelector('.status').dataset.busy);
 assert(imports===1&&JSON.stringify(await writer.getDatabase())===beforeCheck&&shadow.querySelector('.status').textContent.includes('1 previously saved title'),'An uncorroborated shorter listing cannot replace the existing complete snapshot');
 shadow.querySelector('[data-export-diagnostics]').click();const comparison=JSON.parse(await exported.text()).operation.baselineComparison;
 assert(comparison.previousItems===5&&comparison.foundItems===4&&comparison.missingPreviousItems===1,'Export reports baseline membership differences as counts without exposing product IDs');
 page.doc.querySelector('main').insertAdjacentHTML('afterbegin','<p>Purchases (4)</p>');
 shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>imports===2&&!shadow.querySelector('.status').dataset.busy);
 assert(shadow.querySelector('.status').textContent.startsWith('Full rescan complete'),'A reconciled provider total permits a genuinely shorter snapshot through the existing validation gate');
 page.doc.querySelector('main').insertAdjacentHTML('beforeend','<div role="progressbar"></div>');messages=[];const beforeFailedCheck=JSON.stringify(await writer.getDatabase());
 shadow.querySelector('[data-mode="inspect"]').click();await waitFor(()=>!shadow.querySelector('.status').dataset.busy);
 assert(messages.length===0&&failures===2&&JSON.stringify(await writer.getDatabase())===beforeFailedCheck&&!shadow.querySelector('[data-export-diagnostics]').disabled,'An incomplete read-only check still exports evidence without recording a failed library sync');
 await nativeFetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await nativeFetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
finally{frame?.remove();}
