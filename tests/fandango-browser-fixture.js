import '../src/providers/floating-panel.js';
// This acquisition/checker fixture isolates scan authority; DOM construction is real.
globalThis.GalacticFloatingPanel.attach=()=>{};
// Synthetic structural cases, not captures of the user's Fandango library.
import '../src/providers/fandango-at-home.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
const api=globalThis.GalacticFandangoAtHome,nativeFetch=globalThis.fetch,nativeTimeout=globalThis.setTimeout,nativeScroll=globalThis.scrollTo;
globalThis.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===900?0:ms,...args);
let onScroll=()=>{},scrollCalls=0;
Object.defineProperty(globalThis,'innerHeight',{value:500,configurable:true});
Object.defineProperty(globalThis,'scrollY',{value:0,writable:true,configurable:true});
Object.defineProperty(document.documentElement,'scrollHeight',{get:()=>500,configurable:true});
globalThis.scrollTo=()=>{scrollCalls++;onScroll();};
const card=(id,title='PRIVATE_TITLE '+id,extra='')=>`<article class="library-item" ${extra}><a href="/content/browse/details/PRIVATE_SLUG/${id}"><img alt="${title}"></a><h3>${title}</h3></article>`;
const ids=(start,count)=>Array.from({length:count},(_,n)=>n+start);
const page=(numbers,total=346,other='')=>`<main><section class="library-grid"><h2>My Movies (${total})</h2>${numbers.map(n=>card(n)).join('')}</section>${other}</main>`;
const setup=html=>{document.getElementById('galactic-library-fandango-at-home-importer')?.remove();document.body.innerHTML=html;onScroll=()=>{};scrollCalls=0;};
const inspect=()=>api.inspectFandangoListing(()=>{},{movies:346,tv:0});
const rejected=async(fn,pattern)=>{let error;try{await fn();}catch(e){error=e;}assert(error&&pattern.test(error.message),'Strict Full rescan rejects '+pattern);};
try{
 setup(page([...ids(1,346),1,2,3,4]));let report=await inspect();
 assert(report.maxLinksInOnePass===350&&report.uniqueIdentities===346&&report.maxDuplicateLinksInOnePass===4,'346 reported with 350 links and four duplicate IDs is distinguished from 350 unique products');
 let items=await api.readFandangoGrid('movie',346);assert(items.length===346,'Existing production extraction already deduplicates four repeated observations by source ID');
 for(const [attribute,count]of [['hidden',4],['aria-hidden="true"',5],['style="display:none"',5],['style="display: none"',5]]){
   setup(page(ids(1,346),346)+`<section ${attribute}>${ids(1001,count).map(n=>card(n)).join('')}<button>Load more</button></section>`);
   report=await inspect();const source=await api.readFandangoGrid('movie',346);
   assert(report.uniqueIdentities===346+count&&report.groups.some(g=>g.area==='hidden'&&g.exclusiveIdentities===count&&g.productionCandidates===0)&&source.length===346,`Explicit ${attribute} content is excluded from the 346 library records without relaxing count equality`);
 }
 setup(page(ids(1,120),346)+`<section aria-hidden="true">${ids(1001,5).map(n=>card(n)).join('')}</section>`);
 onScroll=()=>{if(scrollCalls===1)document.body.innerHTML=page(ids(117,120),346);if(scrollCalls===2)document.body.innerHTML=page(ids(233,114),346);};
 items=await api.readFandangoGrid('movie',346);
 assert(items.length===346&&!items.some(i=>Number(i.providerItemId)>1000)&&scrollCalls>=12,'The observed five-hidden plus 346-grid shape survives overlapping virtualized batches and finishes at the end before saving');
 setup(page([1,2],2).replace('<article','<article style="position:absolute;top:-10000px"'));
 assert((await api.readFandangoGrid('movie',2)).length===2,'Off-screen positioned cards remain eligible; visibility is not inferred from viewport coordinates');
 setup('<section hidden><h2>My Movies (999)</h2><input type="password"></section>'+page([1],1));
 assert(api.expectedFandangoCountsFromDocument(document).movies===1&&(await api.readFandangoGrid('movie',1)).length===1,'Hidden headings and hidden sign-in widgets cannot override the active movie grid');
 setup('<main><h2>My TV Shows (0)</h2><div class="library-grid"></div></main>');
 assert((await api.readFandangoGrid('tv',0)).length===0&&scrollCalls>=10,'An explicitly reported empty TV section still requires stable end-of-list evidence');
 setup(page(ids(1,346)));onScroll=()=>{if(scrollCalls===1)document.body.innerHTML=page(ids(1,350));};
 await rejected(()=>api.readFandangoGrid('movie',346),/reported 346.*350/);
 setup(page([1],1));onScroll=()=>{if(scrollCalls===1)document.querySelector('h2').textContent='My Movies (2)';};
 await rejected(()=>api.readFandangoGrid('movie',1),/changed its library count/);
 setup(page([1],1)+card(''));await rejected(()=>api.readFandangoGrid('movie',1),/every library card/);
 setup('<h1>Sign in</h1><input type="password">');await rejected(()=>api.readFandangoGrid('movie',346),/sign in again/);
 setup('<h1>Something went wrong</h1>');await rejected(()=>api.readFandangoGrid('movie',346),/error page/);
 setup(page([1],346));onScroll=()=>{if(scrollCalls===1)document.body.innerHTML='<h1>Something went wrong</h1>';};await rejected(()=>api.readFandangoGrid('movie',346),/error page/);
 setup(page([1],346));onScroll=()=>{throw Error('Interrupted traversal');};await rejected(()=>api.readFandangoGrid('movie',346),/Interrupted traversal/);
 setup(page(ids(1,350)));report=await inspect();
 assert(report.uniqueIdentities===350&&report.productionExtractedIdentities===350&&report.maxDuplicateLinksInOnePass===0,'350 distinct detail identities remain 350; diagnostics never discard four products to satisfy a total');
 assert(report.traversalFinished&&report.reason==='stable-bottom'&&!report.libraryComplete,'A stable bottom remains diagnostic evidence and never grants replacement authority');
 await rejected(()=>api.readFandangoGrid('movie',346),/reported 346.*350/);
 setup(page(ids(1,346),346,'<aside><h2>Recommended for you</h2>'+ids(347,4).map(n=>card(n)).join('')+'</aside>'));report=await inspect();
 assert(report.groups.some(g=>g.area==='aside'&&g.heading==='recommendations'&&g.uniqueIdentities===4&&g.exclusiveIdentities===4&&g.productionCandidates===4),'Four outside recommendation identities are attributed to their structural area without exporting their titles or IDs');
 setup(page(ids(1,346),346,'<section class="library-grid"><h2>My TV Shows (4)</h2>'+ids(347,4).map(n=>card(n)).join('')+'</section>'));report=await inspect();
 assert(report.groups.some(g=>g.heading==='tv'&&g.mediaHint==='tv'&&g.uniqueIdentities===4)&&report.reportedDuring[0].tv===4,'TV context and totals are reported separately even though the production movie-grid extractor currently forces movie type');
 setup(page([1,2],2,'<section><h2>Collections</h2>'+card(3)+'</section>').replaceAll(/PRIVATE_TITLE [123]/gu,'PRIVATE_SHARED_TITLE'));report=await inspect();
 assert(report.uniqueIdentities===3&&report.groups.some(g=>g.heading==='collections')&&report.sameTitleDifferentIdentities===1,'Equal titles with distinct identities and collection cards remain distinct; no bundle-count semantics are invented');
 setup(page(ids(1,200)));onScroll=()=>{if(scrollCalls===1)document.body.innerHTML=page(ids(197,150));};report=await inspect();
 assert(report.uniqueIdentities===346&&report.maxLinksInOnePass===200&&report.traversalFinished,'Lazy batches overlapping at page boundaries accumulate 346 unique identities without counting overlap as new products');
 setup(page([1],2));const recycled=document.querySelector('article a');onScroll=()=>{if(scrollCalls===1)recycled.setAttribute('href','/content/browse/details/PRIVATE_SLUG/2');};report=await inspect();
 assert(report.uniqueIdentities===2&&report.recycledNodes===1,'Recycled DOM nodes are detected when their detail identity changes');
 setup(page(ids(1,350)));onScroll=()=>{if(scrollCalls===1)document.querySelector('h2').textContent='My Movies (350)';};report=await inspect();
 assert(report.reportedBefore.movies===346&&report.reportedDuring.map(c=>c.movies).join(',')==='346,350','Asynchronous heading-count changes retain both observations instead of silently choosing a convenient total');
 setup(page([1],346)+'<a href="/content/browse/details/broken/">Broken</a>'+card('opaque-id','PRIVATE_TITLE','data-content-id="different"'));report=await inspect();
 assert(report.missingIdentities===1&&report.nonNumericIdentities===1&&report.attributeIdentityDisagreements>0,'Missing, nonnumeric and contradictory identities remain visible in the diagnostic');
 setup(page([1]));onScroll=()=>{throw Error('Interrupted');};report=await inspect();assert(report.reason==='page-unreadable'&&!report.traversalFinished,'Interrupted traversal is not reported as complete');
 setup('<h1>Sign in</h1><input type="password" value="PRIVATE_CREDENTIAL">');report=await inspect();assert(report.reason==='sign-in'&&!report.traversalFinished,'Authentication pages are recognized without reading or exporting credentials');
 setup('<h1>Something went wrong</h1>');report=await inspect();assert(report.reason==='provider-error'&&!report.traversalFinished,'Provider error pages are reported without pretending the library is empty');
 setup(page([1]));report=await api.inspectFandangoListing(()=>{},{movies:346,tv:0},{maxPasses:2,pauseMs:0});assert(report.reason==='scan-limit'&&!report.traversalFinished,'A bounded incomplete check cannot acquire replacement authority');
 await rejected(()=>api.readFandangoGrid('movie',346),/reported 346.*1/);
 const values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async patch=>Object.assign(values,structuredClone(patch))});
 const source=items.map(i=>({...i,acquiredAt:'2020-04-03'}));
 const snapshot=completeProviderSnapshot('fandango-at-home',source,[completedScope('movie',346,346,'reported-count'),completedScope('tv',0,0,'reported-count')]);
 let db=await writer.replaceProviderItems('fandango-at-home',source,{},snapshot);
 await writer.mergeProviderItems('gog',[{providerItemId:'other',title:'Unrelated game',ownership:'owned'}]);
 const r=Object.values(db.providerItems)[0];await writer.saveOwnershipCorrections([{recordRef:r.recordRef,provider:r.provider,profileId:r.profileId,expectedReviewRef:null}],{ownership:'returned',note:'User correction'});
 db=await writer.getDatabase();const baseline=JSON.stringify(db),saved=structuredClone(db);
 setup(page(ids(1,350)));await inspect();assert(JSON.stringify(await writer.getDatabase())===baseline,'A diagnostic on a mismatched library cannot mutate source records, corrections, dates, catalog mappings or Earlier imports');
 for(let n=0;n<2;n++)db=await writer.replaceProviderItems('fandango-at-home',source,{},snapshot);
 const associations=data=>JSON.stringify(Object.entries(data.canonicalItems).sort(([a],[b])=>a.localeCompare(b)));
 assert(Object.keys(db.providerHistory).length===0&&JSON.stringify(db.ownershipReviews)===JSON.stringify(saved.ownershipReviews)&&associations(db)===associations(saved),'Repeated valid Full rescans preserve manual reviews and catalog mappings without duplicate sources or Earlier imports moves');
 assert(Object.values(db.providerItems).filter(i=>i.provider==='fandango-at-home').every(i=>i.acquiredAt==='2020-04-03T00:00:00.000Z')&&Object.values(db.providerItems).find(i=>i.provider==='gog').title==='Unrelated game','Known acquisition dates and unrelated provider records survive valid reconciliation');
 const restored=parseBackup(createBackup(db));await writer.restoreDatabase(restored);assert(JSON.stringify((await writer.getDatabase()).ownershipReviews)===JSON.stringify(db.ownershipReviews),'The retained corrections survive backup, restore and a fresh database read');
 setup(page([1,2],346));let quick=await api.readFandangoGrid('movie',null,()=>{},['1','2']);assert(quick.length===0&&scrollCalls===0,'Quick update still stops on a known newest group without a comprehensive traversal');
 setup(page([347,1],347));onScroll=()=>{if(scrollCalls===1)document.body.innerHTML=page([2,3],347);};quick=await api.readFandangoGrid('movie',null,()=>{},['1','2','3']);assert(quick.length===1&&quick[0].providerItemId==='347'&&scrollCalls===1,'Quick update reads additions then stops at the known baseline instead of becoming a Full rescan');
 setup(page([1],2,'<aside><h2>Recommended for you</h2>'+card(2)+'</aside>'));let guarded=await api.readFandangoGrid('movie',2,()=>{},null,{recover:true});assert(guarded.incomplete&&guarded.items.length===1,'A relaxed count mismatch cannot admit recommendation cards as purchases');
 setup(page([1],2));onScroll=()=>{throw Error('Interrupted traversal');};guarded=await api.readFandangoGrid('movie',2,()=>{},null,{recover:true});assert(guarded.incomplete&&guarded.items.length===1,'A render/scroll exception preserves validated prefix and withholds completion');
 for(const heading of ['Access denied','Forbidden','Session expired']){setup('<h1>'+heading+'</h1>');await rejected(()=>api.readFandangoGrid('movie',2,()=>{},null,{recover:true}),/sign in again/);}
 setup(page([1],2));onScroll=()=>{Object.defineProperty(document.documentElement,'scrollHeight',{get:()=>500+scrollCalls*100,configurable:true});};guarded=await api.readFandangoGrid('movie',2,()=>{},null,{recover:true});assert(guarded.incomplete&&guarded.limitReached&&guarded.passes===300&&guarded.items.length===1,'Existing 300-pass bound retains the prefix and reports the actual limit without Full authority');Object.defineProperty(document.documentElement,'scrollHeight',{get:()=>500,configurable:true});
 setup(page([1],2,'<section><h2>My TV Shows (1)</h2>'+card(2)+'</section>'));guarded=await api.readFandangoGrid('movie',2,()=>{},null,{recover:true});assert(guarded.incomplete&&guarded.items.length===1&&guarded.items[0].mediaType==='movie','Other TV section cards cannot be forced into movie purchases during partial recovery');
 setup('<main><h1>Unexpected page</h1></main>');await rejected(()=>api.readFandangoGrid('movie',2,()=>{},null,{recover:true}),/recognizable library section/);
 // Recovery uses the same rendered grid, pacing and scope; no detail/API fiction.
 for(const type of ['movie','tv']){
   setup(type==='movie'?page([1,2],2):'<main><h2>My TV Shows (2)</h2>'+card(1)+card(2)+'</main>');
   onScroll=()=>{if(scrollCalls===1)document.body.innerHTML='<h1>Something went wrong</h1>';};
   const r=await api.readFandangoGrid(type,2,()=>{},null,{recover:true});assert(r.incomplete&&r.items.length===2&&r.passes===2,'Recoverable '+type+' rendered-page error preserves validated prefix without complete authority');
 }
 for(const broken of [card(''),card(3,''),card(3,'!!!'),card('https:bad'),card(3,'Wrong type','data-type="tv"'),card(3,'Unsupported type','data-type="audio"')]){
   setup(page([1,2],3)+broken);const r=await api.readFandangoGrid('movie',3,()=>{},null,{recover:true});assert(r.incomplete&&r.items.length===2&&r.failedItems===1,'Malformed card isolated from two valid peers: '+broken.slice(0,80));
 }
 setup(page([1,1,2],2));let recovered=await api.readFandangoGrid('movie',2,()=>{},null,{recover:true});assert(!recovered.incomplete&&recovered.items.length===2,'Identical repeated links deduplicate without forcing partial state');
 setup(page([1,2],2)+card(1,'Conflicting title'));recovered=await api.readFandangoGrid('movie',2,()=>{},null,{recover:true});assert(recovered.incomplete&&recovered.items.length===1&&recovered.items[0].providerItemId==='2','Conflicting repeated identity is quarantined rather than last-row-wins');
 setup(page([1,2],2)+card(1,'PRIVATE_TITLE 1') .replace('</article>',' Rental</article>'));recovered=await api.readFandangoGrid('movie',2,()=>{},null,{recover:true});assert(recovered.incomplete&&recovered.items.length===1,'Conflicting rental and purchase observations never choose the favorable ownership');
 setup(page([1],1));onScroll=()=>{if(scrollCalls===1)document.body.innerHTML='<input type="password">';};await rejected(()=>api.readFandangoGrid('movie',1,()=>{},null,{recover:true}),/sign in again/);
 setup(page([1],1));onScroll=()=>{if(scrollCalls===1)document.querySelector('h2').textContent='My Movies (2)';};await rejected(()=>api.readFandangoGrid('movie',1,()=>{},null,{recover:true}),/changed its library count/);
 setup(page([1],2));recovered=await api.readFandangoGrid('movie',2,()=>{},null,{recover:true});assert(recovered.incomplete&&recovered.items.length===1,'Stable bottom without count agreement remains partial');
 setup('<main><h2>My TV Shows (0)</h2></main>');recovered=await api.readFandangoGrid('tv',0,()=>{},null,{recover:true});assert(!recovered.incomplete&&!recovered.items.length,'Count-verified empty section retains terminal checks without inventing purchases');
 setup(page([1],1));recovered=await api.readFandangoGrid('movie',null,()=>{},['1'],{recover:true});assert(!recovered.incomplete&&!recovered.items.length&&scrollCalls===0,'Healthy recovery-aware Quick still stops before scrolling its known group');
 for(const replace of [false,true]){
   setup(page([1,2],2).replace('alt="PRIVATE_TITLE 1"','alt=""'));
   onScroll=()=>{if(scrollCalls===1){if(replace)document.body.innerHTML=page([1,2],2);else document.querySelector('img').alt='PRIVATE_TITLE 1';}};
   const r=await api.readFandangoGrid('movie',null,()=>{},['1','2'],{recover:true});
   assert(!r.incomplete&&!r.items.length&&r.failedItems===0&&scrollCalls===1&&r.diagnostics.terminationReason==='known-group'&&r.diagnostics.knownMatches===2,'Quick resolves same-ID missing-title observation after '+(replace?'DOM replacement':'lazy alt rendering')+' and stops without saving duplicates');
   assert(r.diagnostics.rejectedObservations===1&&r.diagnostics.rejectionReasons.missingTitle===1&&r.diagnostics.unresolvedTitles===0,'Diagnostic retains transient rejection separately from final unresolved state');
 }
 setup(page([],2));onScroll=()=>{if(scrollCalls===1)document.body.innerHTML=page([1,2],2);};recovered=await api.readFandangoGrid('movie',null,()=>{},['1','2'],{recover:true});assert(!recovered.incomplete&&!recovered.items.length&&scrollCalls===1,'Temporary empty snapshot does not discard known-title baseline');
 setup(page([1,2],2).replace('alt="PRIVATE_TITLE 1"','alt=""'));recovered=await api.readFandangoGrid('movie',null,()=>{},['1','2'],{recover:true});assert(recovered.incomplete&&!recovered.items.length&&recovered.failedItems===1&&recovered.diagnostics.terminationReason==='empty-timeout','Persistently missing title remains incomplete, not a no-change success');
 setup(page([1,2],2).replace('alt="PRIVATE_TITLE 1"','alt=""'));onScroll=()=>{if(scrollCalls===1)document.body.innerHTML=page([2],2);};recovered=await api.readFandangoGrid('movie',null,()=>{},['1','2'],{recover:true});assert(recovered.incomplete&&recovered.failedItems===1,'Disappearing placeholder cannot be resolved by an unrelated known card');
 setup(page([1,2],2)+card(1,'Conflicting title'));recovered=await api.readFandangoGrid('movie',null,()=>{},['1','2'],{recover:true});assert(recovered.incomplete&&recovered.failedItems===1&&recovered.diagnostics.rejectionReasons.conflict>0,'Known baseline does not suppress conflicting identity/title evidence');
 setup(page([1,1,2],2));recovered=await api.readFandangoGrid('movie',null,()=>{},['1','2'],{recover:true});assert(!recovered.incomplete&&scrollCalls===0&&recovered.diagnostics.duplicateObservations===1,'Identical duplicate known tiles retain early stopping and aggregate duplicate diagnostics');
 setup(page([1,2],2));recovered=await api.readFandangoGrid('movie',null,()=>{},[],{recover:true});assert(!recovered.incomplete&&recovered.items.length===2&&scrollCalls>=10&&recovered.diagnostics.terminationReason==='stable-bottom','Unavailable known-ID baseline traverses rather than inventing a known-group early stop');
 setup(page([1],346));let sends=0,failures=0;globalThis.GalacticSync={send:async request=>{sends++;if(request.type==='FANDANGO_IMPORT_STATE'&&request.action==='get')return {ok:true,state:null};throw Error('Unexpected diagnostic write');},failed:async()=>{failures++;}};
 let shadow;const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){shadow=attach.call(this,options);return shadow;};await import('../src/providers/fandango-at-home-content.js');Element.prototype.attachShadow=attach;
 await new Promise(resolve=>nativeTimeout(resolve,0));const beforeSends=sends;
 assert(shadow.querySelector('[data-scan-diagnostics] summary').textContent==='Scan diagnostics'&&shadow.querySelector('[data-export-report]').disabled,'Read-only troubleshooting is discoverable under Scan diagnostics; export is disabled before a check');
 shadow.querySelector('[data-check-listing]').click();assert(shadow.querySelector('.status').dataset.busy==='true'&&shadow.querySelector('[data-mode="full"]').disabled,'The read-only check shows immediate progress and prevents a conflicting import');
 for(let n=0;n<100&&shadow.querySelector('.status').dataset.busy;n++)await new Promise(resolve=>nativeTimeout(resolve,10));
 assert(!shadow.querySelector('[data-export-report]').disabled&&shadow.querySelector('.status').textContent.includes('No library data changed')&&sends===beforeSends&&failures===0,'Checking and export preparation send no GL import, failure-state or storage write messages');
 let exported;const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;URL.createObjectURL=blob=>{exported=blob;return 'blob:synthetic';};HTMLAnchorElement.prototype.click=function(){};
 shadow.querySelector('[data-export-report]').click();URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;
 const output=await exported.text();assert(!/PRIVATE_|PRIVATE_SLUG|https?:|cookie|token|password|providerItemId/iu.test(output)&&JSON.parse(output).readOnly,'The downloadable diagnostic contains only structural labels and counts, never titles, IDs, URLs, account data or credentials');
 assert(shadow.querySelectorAll('button[data-mode]').length===2,'Full rescan and Quick update remain the only ordinary import actions');
 setup(page([1],346));history.replaceState(null,'','/content/browse/movies');
 sessionStorage.setItem('galactic-library-fandango-listing-check',JSON.stringify({expected:{movies:346,tv:0,unexpected:'PRIVATE_CREDENTIAL'},route:location.origin+location.pathname,startedAt:Date.now()}));
 const resumeSends=sends;Element.prototype.attachShadow=function(options){shadow=attach.call(this,options);return shadow;};await import('../src/providers/fandango-at-home-content.js?diagnostic-resume');Element.prototype.attachShadow=attach;
 for(let n=0;n<100&&shadow.querySelector('.status').dataset.busy;n++)await new Promise(resolve=>nativeTimeout(resolve,10));
 assert(sends===resumeSends&&!shadow.querySelector('[data-export-report]').disabled&&shadow.querySelector('[data-scan-diagnostics]').open&&sessionStorage.getItem('galactic-library-fandango-listing-check')===null,'A read-only navigation resumes the check and consumes tab-local counts without requesting import authority or resuming an import');
 const projected=await api.inspectFandangoListing(()=>{},{movies:346,tv:0,unexpected:'PRIVATE_CREDENTIAL'},{maxPasses:1,pauseMs:0});assert(!JSON.stringify(projected).includes('PRIVATE_'),'Unexpected tab-state fields cannot enter the diagnostic export');
 setup(page([1],346));sessionStorage.setItem('galactic-library-fandango-listing-check',JSON.stringify({expected:{movies:346,tv:0},route:location.origin+location.pathname,startedAt:Date.now()-11*60*1000}));
 Element.prototype.attachShadow=function(options){shadow=attach.call(this,options);return shadow;};await import('../src/providers/fandango-at-home-content.js?stale-diagnostic');Element.prototype.attachShadow=attach;await new Promise(resolve=>nativeTimeout(resolve,0));
 assert(shadow.querySelector('[data-export-report]').disabled&&sends===resumeSends+1&&sessionStorage.getItem('galactic-library-fandango-listing-check')===null,'An expired diagnostic navigation is discarded without starting a check or granting write permission');
 setup(page([1],1));sessionStorage.setItem('galactic-library-fandango-import-diagnostics',JSON.stringify({kind:'import',provider:'fandango-at-home',requestedMode:'incremental',effectiveMode:'quick',outcome:'failed',private:'PRIVATE_SECRET',submittedRecords:0,acknowledgedRecords:0,sections:[{section:'movie',terminationReason:'empty-timeout',passes:20,knownMatches:1,unresolvedTitles:1,private:'PRIVATE_TITLE',rejectionReasons:{missingTitle:1,private:'PRIVATE_TOKEN'}}]}));
 Element.prototype.attachShadow=function(options){shadow=attach.call(this,options);return shadow;};await import('../src/providers/fandango-at-home-content.js?import-diagnostics');Element.prototype.attachShadow=attach;await new Promise(resolve=>nativeTimeout(resolve,0));
 let importExport;URL.createObjectURL=blob=>{importExport=blob;return 'blob:synthetic';};HTMLAnchorElement.prototype.click=function(){};
 try{shadow.querySelector('[data-export-report]').click();const text=await importExport.text(),r=JSON.parse(text);assert(r.kind==='import'&&r.outcome==='failed'&&r.sections[0].passes===20&&!/PRIVATE_/.test(text),'Existing export exposes last failed import aggregates and strips arbitrary tab-state strings');}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;sessionStorage.removeItem('galactic-library-fandango-import-diagnostics');}
 checks.push(...await (await import('./provider-panel-restart-fixture.js')).checkFandangoRestartNavigation());
 await nativeFetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await nativeFetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
finally{globalThis.setTimeout=nativeTimeout;globalThis.scrollTo=nativeScroll;}
