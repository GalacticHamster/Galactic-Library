// Synthetic Prime Video layouts; no provider session, captured pages or real titles.
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
const checks=[];
const assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
const nativeFetch=globalThis.fetch,nativeTimeout=globalThis.setTimeout;
const [snapshotCode,importerCode,panelCode]=await Promise.all(['provider-snapshot','amazon-video','amazon-video-content'].map(async name=>{
 const response=await nativeFetch(`/src/providers/${name}.js`);if(!response.ok)throw Error('Missing packaged provider script');return response.text();
}));
let frame;
const card=(n,{ownership='Purchased',bad=false}={})=>`<article data-card-entity-id="amzn1.dv.gti.fixture-${n}" data-card-entity-type="${n%2?'MOVIE':'TV_SEASON'}" ${bad?'':'data-card-title="PRIVATE_TITLE"'} style="height:110px"><a href="/detail/B${String(n).padStart(9,'0')}"></a>${ownership}</article>`;
async function setup({nested=false,ids=[1,2,3,4],outside='',inside='',total=ids.length}={}){
 frame?.remove();frame=document.createElement('iframe');frame.style.cssText='width:700px;height:320px;position:absolute;top:0;left:0;border:0';
 const ready=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
 frame.srcdoc=`<!doctype html><style>html,body{margin:0}main{display:block}#list{${nested?'height:180px;overflow-y:auto;':''}}aside,footer,header,nav{position:fixed;right:0;top:0}</style><main>${total===null?'':`<p>All items (${total})</p>`}<div id="list">${ids.map(n=>card(n)).join('')}</div>${inside}</main>${outside}`;
 document.body.append(frame);await ready;
 const win=frame.contentWindow,doc=win.document,list=doc.querySelector('#list');let pauses=0,scrolls=0,onPause=()=>{},onScroll=()=>{};
 win.setTimeout=(callback,ms,...args)=>nativeTimeout(()=>{if(ms===700){pauses++;onPause(pauses);}callback(...args);},ms===700||ms===600?0:ms);
 const originalScroll=win.scrollTo.bind(win);win.scrollTo=options=>{scrolls++;originalScroll(options);onScroll(scrolls);};
 const originalListScroll=list.scrollTo.bind(list);list.scrollTo=options=>{scrolls++;originalListScroll(options);onScroll(scrolls);};
 win.eval(snapshotCode);win.eval(importerCode);
 return {win,doc,list,api:win.GalacticAmazonVideo,add:(...ids)=>list.insertAdjacentHTML('beforeend',ids.map(n=>card(n)).join('')),onPause:fn=>{onPause=fn;},onScroll:fn=>{onScroll=fn;},pauses:()=>pauses,scrolls:()=>scrolls};
}
async function rejects(page,pattern,message){let error;try{await page.api.fetchAmazonVideoLibrary();}catch(value){error=value;}assert(error&&pattern.test(error.message),message+(error?": "+error.message:": unexpectedly returned"));return error;}
// Numeric progression derived from the sanitized live export; synthetic IDs,
// titles and DOM only. The plateau is deliberately longer than in that export
// to reproduce the timing-dependent premature-success branch.
async function plateauListing(total=null){
 const page=await setup({nested:true,ids:Array.from({length:60},(_,i)=>i+1),total});
 page.list.style.display='grid';page.list.style.gridTemplateColumns='repeat(6,1fr)';
 const render=end=>{page.list.innerHTML=Array.from({length:Math.min(end,70)},(_,i)=>end-Math.min(end,70)+i+1).map(n=>card(n).replace('height:110px','height:20px').replace(/data-card-entity-type="[^"]+"/,`data-card-entity-type="${n<=150||(n>180&&n<=332)?'MOVIE':'TV_SHOW'}"`)).join('');};
 const batches=new Map([[1,60],[4,100],[6,140],[8,180],[15,220],[18,260],[20,300],[22,340],[24,343]]);
 page.restart=()=>{const origin=page.pauses();render(60);page.onPause(n=>{if(batches.has(n-origin))render(batches.get(n-origin));});};page.restart();return page;
}
// Scroll-driven virtual grid: returning to the start really renders the head
// again, so the verification sweep must rediscover every identity. Delayed
// requests continue while the user/scanner moves away from the old boundary.
async function virtualLibrary({plateau=false}={}){
 const page=await setup({nested:true,ids:Array.from({length:60},(_,i)=>i+1),total:null});
 let loaded=60,due=null;page.list.style.position='relative';
 const render=()=>{
  const first=Math.max(1,(Math.floor(page.list.scrollTop/20)-2)*6+1);
  page.list.innerHTML=`<div style="height:${Math.ceil(loaded/6)*20}px"></div>`+Array.from({length:Math.max(0,Math.min(70,loaded-first+1))},(_,i)=>first+i).map(n=>card(n).replace('height:110px',`position:absolute;top:${Math.floor((n-1)/6)*20}px;left:${((n-1)%6)*16}%;height:20px`)).join('');
 };
 render();page.onScroll(render);
 const liveProgression=new Map([[3,90],[4,100],[5,138],[6,140],[7,180],[8,216],[9,220],[10,260],[11,288],[12,300],[13,336],[14,343]]);
 page.onPause(n=>{
  if(!plateau){
   const next=liveProgression.get(n);
   if(next&&next>loaded){const anchored=page.list.scrollTop+page.list.clientHeight>=page.list.scrollHeight-4;loaded=next;render();if(anchored)page.list.scrollTo({top:page.list.scrollHeight,behavior:'instant'});}
   return;
  }
  if(due!==null&&n>=due){loaded=Math.min(343,loaded+40);due=null;render();}
  if(loaded<343&&due===null&&page.list.scrollTop+page.list.clientHeight>=page.list.scrollHeight-4)due=n+(plateau&&loaded===180?6:1);
 });return page;
}
try{
 let labels=await setup({ids:[1,2,3,4],outside:'<aside>You purchased this</aside>'});
 labels.list.innerHTML=card(1,{ownership:'<span hidden>You purchased this.</span>'})+card(2,{ownership:'<span>You purchased this</span>'})+card(3,{ownership:'<button>Buy</button><p>Purchase this movie</p>'})+card(4,{ownership:'<span>Rental expires in 2 days</span>'});
 let extracted=labels.api.amazonVideoItemsFromDocument(labels.doc);
 assert(extracted.map(item=>item.ownership).join(',')==='owned,owned,unknown,rental','Hidden movie labels and full-season purchases are recognized; Buy and unrelated page labels cannot establish ownership');
 const purchaseData={},purchaseArea={get:async defaults=>({...defaults,...purchaseData}),set:async patch=>Object.assign(purchaseData,structuredClone(patch))};
 let purchaseWriter=createStorageWriter(purchaseArea);
 const records=JSON.parse(JSON.stringify(extracted)),unknownRecords=records.map(item=>({...item,ownership:'unknown',metadata:{...item.metadata,ownershipEvidence:''}}));
 await purchaseWriter.mergeProviderItems('amazon-video',unknownRecords);
 const originalRecords=Object.values((await purchaseWriter.getDatabase()).providerItems);
 const savePurchaseScan=async values=>purchaseWriter.replaceProviderItems('amazon-video',values,{},JSON.parse(JSON.stringify(labels.win.GalacticProviderSnapshot.completeProviderSnapshot('amazon-video',values,[labels.win.GalacticProviderSnapshot.completedScope('library',values.length,null,'scroll-end',8)]))));
 await savePurchaseScan(records);
 let purchaseDb=await purchaseWriter.getDatabase(),saved=Object.values(purchaseDb.providerItems);
 assert(saved.filter(item=>item.ownership==='owned').length===2&&saved.filter(item=>item.ownership==='unknown').length===1&&saved.filter(item=>item.ownership==='rental').length===1,'Extracted movie, season, Buy and rental labels persist as two Owned, one Unknown and one Rental');
 assert(saved.every(item=>originalRecords.some(old=>old.id===item.id&&old.recordRef===item.recordRef))&&saved.length===4,'Purchase enrichment upgrades the existing identities rather than creating duplicate records');
 const corrected=saved.find(item=>item.providerItemId.endsWith('fixture-1'));
 await purchaseWriter.saveOwnershipCorrections([{recordRef:corrected.recordRef,provider:corrected.provider,profileId:corrected.profileId,expectedReviewRef:null}],{ownership:'returned'});
 for(let repeat=0;repeat<2;repeat++)await savePurchaseScan(unknownRecords);
 purchaseWriter=createStorageWriter(purchaseArea);purchaseDb=await purchaseWriter.getDatabase();
 assert(purchaseDb.providerItems[corrected.id].ownership==='owned'&&effectiveOwnershipRecord(purchaseDb.providerItems[corrected.id],purchaseDb).ownership==='returned','Two sparse rescans and a fresh writer retain purchase evidence while the manual returned correction remains authoritative');
 await purchaseWriter.restoreDatabase(parseBackup(createBackup(purchaseDb)));
 purchaseDb=await purchaseWriter.getDatabase();
 assert(purchaseDb.providerItems[corrected.id].metadata.ownershipEvidence==='You purchased this.'&&effectiveOwnershipRecord(purchaseDb.providerItems[corrected.id],purchaseDb).ownership==='returned','Backup restore retains both source purchase evidence and the separate manual correction');
 labels.list.innerHTML=card(1,{ownership:'<span>Buy</span>'});
 labels.onPause(n=>{if(n===2)labels.list.querySelector('article').insertAdjacentHTML('beforeend','<span>You purchased this</span>');if(n===3)labels.list.innerHTML=card(1,{ownership:'Buy'});});
 // The mutation observer must retain evidence before virtual-card remounting.
 labels.doc.querySelector('main p').textContent='All items (2)';
 labels.onScroll(()=>{});
 let delayed=await labels.api.fetchAmazonVideoLibrary(()=>{},null,{readOnly:true});
 assert(delayed.items[0].ownership==='owned','Delayed card-local evidence survives an unknown remount of the same stable product');
 labels=await setup({ids:[1,2]});
 labels.list.innerHTML=card(1,{ownership:'Buy'})+card(2,{ownership:'Buy'});
 labels.list.querySelector('article').addEventListener('mouseenter',event=>event.currentTarget.insertAdjacentHTML('beforeend','<span>You purchased this</span>'),{once:true});
 const originalTimer=labels.win.setTimeout;
 labels.win.setTimeout=(callback,ms,...args)=>{
  if(ms===15000){labels.list.querySelector('article').dispatchEvent(new labels.win.MouseEvent('mouseenter'));return nativeTimeout(callback,0);}
  return originalTimer(callback,ms,...args);
 };
 const checked=await labels.api.checkPurchaseLabels();
 assert(checked.owned===1&&checked.unknown===1,'The read-only manual-hover diagnostic recognizes a dynamically added label without leaking it to a nearby card');
 assert(labels.api.getDiagnostics().state==='purchase-label-check-complete','Purchase-label diagnostics finish without requesting an import');
 labels=await setup({ids:[1]});
 labels.list.innerHTML=card(1,{ownership:'Buy'});
 const artwork=labels.doc.createElement('img');artwork.alt='PRIVATE_TITLE';labels.list.querySelector('a').append(artwork);
 labels.list.querySelector('a').addEventListener('mouseover',event=>{
  if(event.target===artwork)labels.list.querySelector('article').insertAdjacentHTML('beforeend','<span>You purchased this</span>');
 },{once:true});
 const childTimer=labels.win.setTimeout;labels.win.setTimeout=(callback,ms,...args)=>ms===15000?nativeTimeout(callback,0):childTimer(callback,ms,...args);
 const sample=await labels.api.checkPurchaseLabels();
 assert(sample.owned===1&&labels.api.getDiagnostics().automaticSample.recognized===1&&labels.api.getDiagnostics().automaticSample.attempted<=3,'The short diagnostic targets artwork handlers inside a visible card rather than dispatching only on the outer wrapper');
 labels=await setup({ids:[1,2,3,4]});
 labels.list.innerHTML=[1,2,3,4].map(n=>card(n,{ownership:'Buy'})).join('');
 for(const [index,node] of [...labels.list.querySelectorAll('article')].entries())node.addEventListener('mouseenter',()=>{
  if(index<2)node.insertAdjacentHTML('beforeend','<span>You purchased this</span>');
  else if(index===2)labels.list.querySelector('article').insertAdjacentHTML('beforeend','<span>You purchased this</span>');
 },{once:true});
 const hoverTimer=labels.win.setTimeout;
 labels.win.setTimeout=(callback,ms,...args)=>ms===600?nativeTimeout(callback,10):hoverTimer(callback,ms,...args);
 const hovered=await labels.api.fetchAmazonVideoLibrary(()=>{},null,{readOnly:true});
 assert(hovered.items.map(item=>item.ownership).join(',')==='owned,owned,unknown,unknown','Default hover acquisition recognizes a movie and a complete season without promoting Buy-only or unresponsive seasons');
 assert(labels.api.getDiagnostics().hoverChecks.attempted===4&&labels.api.getDiagnostics().hoverChecks.recognized===2,'Hover work is bounded to one attempt per product and reports unavailable evidence without inventing access');
 labels=await setup({ids:[1]});
 labels.list.innerHTML=card(1,{ownership:'<span>You purchased this <em>episode</em></span>'});
 assert(labels.api.amazonVideoItemsFromDocument(labels.doc)[0].ownership==='unknown','Split episode-only wording cannot be truncated into a full-product purchase label');
 labels.list.innerHTML=card(1,{ownership:'PURCHASED'}).replace('PRIVATE_TITLE','Purchased');
 assert(labels.api.amazonVideoItemsFromDocument(labels.doc)[0].ownership==='unknown','A title that happens to be an ownership word is not purchase evidence');
 labels=await setup({ids:[1,2,3,4,5]});
 const tvCard=(n,title,evidence)=>card(n,{ownership:evidence}).replace('PRIVATE_TITLE',title).replace(/data-card-entity-type="[^"]+"/,'data-card-entity-type="TV Show"');
 labels.list.innerHTML=tvCard(1,'A show Season One','<span>You purchased this</span>')+tvCard(2,'A show Volume 3','<span>You purchased this</span><span>Included with Prime</span>')+tvCard(3,'A show Volume 3','<button>Free trial or buy</button>')+tvCard(4,'A show Season 2','<span>Included with Prime</span>')+tvCard(5,'A named set','<button>Watch now</button>');
 const exactProducts=JSON.parse(JSON.stringify(labels.api.amazonVideoItemsFromDocument(labels.doc)));
 assert(exactProducts.map(item=>item.ownership).join(',')==='owned,owned,unknown,subscription,unknown','Explicit TV product purchases do not require numeric season titles; Prime access and purchase offers stay distinct');
 const tvData={},tvWriter=createStorageWriter({get:async defaults=>({...defaults,...tvData}),set:async patch=>Object.assign(tvData,structuredClone(patch))});
 await tvWriter.mergeProviderItems('amazon-video',exactProducts.map(item=>({...item,ownership:'unknown',metadata:{...item.metadata,ownershipEvidence:''}})));
 const beforeTv=Object.values((await tvWriter.getDatabase()).providerItems);
 await tvWriter.replaceProviderItems('amazon-video',exactProducts,{},JSON.parse(JSON.stringify(labels.win.GalacticProviderSnapshot.completeProviderSnapshot('amazon-video',exactProducts,[labels.win.GalacticProviderSnapshot.completedScope('library',5,null,'scroll-end',8)]))));
 const afterTv=Object.values((await tvWriter.getDatabase()).providerItems);
 assert(afterTv.filter(item=>item.ownership==='owned').length===2&&afterTv.filter(item=>item.ownership==='subscription').length===1&&afterTv.length===5&&afterTv.every(item=>beforeTv.some(old=>old.id===item.id&&old.recordRef===item.recordRef)),'Existing TV records upgrade without duplicate source identities, including a Prime subscription');
 assert(afterTv.find(item=>item.providerItemId.endsWith('fixture-3')).ownership==='unknown','A purchase on another stable ID does not grant ownership to a same-title TV product');
 labels=await setup({ids:[5,1,2,3],total:null});
 labels.list.innerHTML=[5,1,2,3].map(n=>card(n,{ownership:'Buy'})).join('');
 labels.list.querySelector('article').addEventListener('mouseenter',event=>event.currentTarget.insertAdjacentHTML('beforeend','<span>You purchased this</span>'),{once:true});
 labels.onPause(n=>{if(n===2)labels.list.innerHTML=[1,2,3,4].map(n=>card(n,{ownership:'Buy'})).join('');});
 const quick=await labels.api.fetchAmazonVideoLibrary(()=>{},[1,2,3,4].map(n=>'amzn1.dv.gti.fixture-'+n));
 assert(quick.items.length===1&&quick.items[0].ownership==='owned'&&labels.api.getDiagnostics().hoverChecks.attempted===1,'Default Quick update checks purchase labels for the new product only, not already saved cards');
 assert(labels.api.getDiagnostics().state==='bounded'&&labels.api.getDiagnostics().passes.length===2,'Quick update still stops at the next wholly known group without a historical traversal');
 labels=await setup({ids:[1,2],total:null});
 labels.list.innerHTML=card(1,{ownership:'<span>Included with Prime</span>'})+card(2,{ownership:'<span>You purchased this</span>'});
 labels.list.querySelector('article').addEventListener('mouseenter',event=>event.currentTarget.insertAdjacentHTML('beforeend','<span>You purchased this</span>'),{once:true});
 labels.onPause(n=>{if(n===2)labels.list.innerHTML=card(1,{ownership:'<span>Included with Prime</span>'})+card(2,{ownership:'<span>Included with Prime</span>'});});
 const temporal=await labels.api.fetchAmazonVideoLibrary();
 assert(temporal.items.every(item=>item.ownership==='owned'&&item.metadata.ownershipEvidence.includes('You purchased this')&&item.metadata.ownershipEvidence.includes('Included with Prime')),'Same-scan Prime then purchase and purchase then Prime both preserve purchase precedence and both source labels');
 assert(labels.api.getDiagnostics().hoverChecks.attempted===1,'A full verification sweep does not repeat hover work for already confirmed purchases');
 let page=await virtualLibrary({plateau:true});let result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===343&&result.completionStatus==='inferred'&&!result.completionConfirmed,'A delayed 180-item plateau is passed and all 343 virtualized identities converge without a provider total');
 let evidence=page.api.getDiagnostics();
 assert(!evidence.passes.some(pass=>pass.distinctItems===180&&pass.completionConfirmed)&&evidence.verification.revisitedItems===343&&evidence.verification.missingItems===0,'The final verification sweep independently revisits the whole discovered membership instead of accepting 180');
 assert(evidence.boundaryProbe.beyondAttempted&&evidence.boundaryProbe.backMoved&&evidence.verification.rangesStable,'Inference requires active boundary movement, beyond-end attempts and stable scroll ranges');
 assert(evidence.passes.length<80&&evidence.stop==='verification-converged','Converged traversal terminates through its protocol, far before the emergency 250-pass cap');
 page=await virtualLibrary();result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===343&&result.completionStatus==='inferred'&&page.api.getDiagnostics().passes.length<70,'An ordinary countless terminal library completes after a verification sweep rather than spinning to 250');
 assert(page.api.getDiagnostics().passes.find(pass=>pass.distinctItems===343)?.pass===14,'The no-total live-progression fixture discovers all 343 identities by pass 14 without using that number as its stopping rule');
 const sameItems=JSON.stringify(result.items);result=await page.api.fetchAmazonVideoLibrary();
 assert(JSON.stringify(result.items)===sameItems&&result.completionStatus==='inferred','Repeated unchanged count-independent full traversals retain exact membership and inference classification');
 page=await setup({total:null,inside:'<div id="pending" role="progressbar" hidden></div>'});
 page.onPause(n=>{page.doc.querySelector('#pending').hidden=n!==2&&n<8;});
 await rejects(page,/could not establish/,'Loading indicators disappearing and returning during verification cannot produce inferred success');
 assert(page.api.getDiagnostics().reason==='continuation-unresolved'&&page.api.getDiagnostics().passes.length<40,'Unresolved loading terminates through a bounded failed verification instead of 250 idle polls');
 page=await setup();page.onScroll(()=>{throw Error('Synthetic navigation failure');});
 await rejects(page,/Synthetic navigation failure/,'An actual navigation exception fails rather than inferring a terminal state');
 assert(page.api.getDiagnostics().state==='failed'&&page.api.getDiagnostics().completionStatus==='failed','Diagnostics distinguish operational failure from uncertain convergence');
 page=await plateauListing();
 await rejects(page,/could not establish/,'A six-pass unmarked plateau cannot become successful full coverage, even after all 343 synthetic titles are observed');
 evidence=page.api.getDiagnostics();
 assert(evidence.itemCount===343&&evidence.state==='uncertain'&&!evidence.completionConfirmed&&evidence.reason==='verification-membership-mismatch','Unknown termination remains explicitly uncertain after traversing all later batches');
 assert(evidence.passes.some(pass=>pass.distinctItems===180&&pass.unchangedPasses>=3)&&evidence.passes.some(pass=>pass.distinctItems>180),'Traversal continues beyond the old three-idle-pass stop at 180');
 assert(evidence.mediaTypes.movie===302&&evidence.mediaTypes.tv===41,'Diagnostics retain cumulative distinct movie and TV counts across virtualization');
 page=await plateauListing();result=await page.api.fetchAmazonVideoLibrary(()=>{},null,{readOnly:true});
 assert(result.items.length===343&&!result.snapshot&&!result.completionConfirmed,'Read-only discovery can return all observed items without certifying a complete snapshot');
 assert(page.api.getDiagnostics().passes.some(pass=>pass.newlyDiscoveredItems===0&&pass.distinctItems===180),'Diagnostics distinguish a temporary zero-discovery pass from cumulative membership');
 page=await plateauListing(343);result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===343&&result.snapshot.scopes[0].end==='reported-count'&&result.completionConfirmed,'A separately displayed whole-list total permits completion only after all distinct identities reconcile');
 const unchanged=JSON.stringify(result.items);page.restart();result=await page.api.fetchAmazonVideoLibrary();
 assert(JSON.stringify(result.items)===unchanged&&result.completionConfirmed,'An unchanged full rescan reconfirms actual count evidence without changing identities or metadata');
 page=await plateauListing();result=await page.api.fetchAmazonVideoLibrary(()=>{},Array.from({length:180},(_,i)=>'amzn1.dv.gti.fixture-'+(i+1)));
 assert(result.items.length===0&&!result.snapshot&&!result.completionConfirmed&&page.api.getDiagnostics().reason==='known-newest-group','Quick update after a bad 180-item baseline checks the known newest group, not older missing titles');
 page=await setup({total:null,inside:'<aside><p>All items (4)</p></aside>',outside:'<p>All items (4)</p>'});
 result=await page.api.fetchAmazonVideoLibrary(()=>{},null,{readOnly:true});
 assert(result.items.length===4&&result.completionStatus==='inferred'&&result.snapshot.scopes[0].end==='scroll-end'&&page.api.getDiagnostics().countEvidence==='unavailable','A stable revisitable listing can infer completion without mistaking unrelated totals for confirmation');
 page=await setup();page.onPause(n=>{if(n===2)page.doc.querySelector('main p').textContent='All items (5)';});
 await rejects(page,/changed its whole-library total/,'A changing provider total invalidates the scan rather than approving a stale count');
 // The old implementation reads global continuation controls and never finishes.
 page=await setup({outside:'<aside><div role="progressbar"></div><button id="other-more">Show more</button></aside>'});
 let unrelatedClicks=0;page.doc.querySelector('#other-more').onclick=()=>unrelatedClicks++;
 result=await page.api.fetchAmazonVideoLibrary();
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
 page=await setup({nested:true,total:6,inside:'<div id="loading" role="progressbar"></div>'});
 page.onPause(n=>{if(n===7){page.add(5,6);page.doc.querySelector('#loading').remove();}});
 result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===6&&page.pauses()>=10,'Genuine delayed library loading is retained beyond the quiet-period length');
 assert(result.items.some(item=>item.providerItemId.endsWith('-6')),'The delayed final batch is included in the validated snapshot');
 // A real library button fetches another group and removes itself only at end.
 page=await setup({total:5,inside:'<nav><button id="more">Load more</button></nav>'});let libraryClicks=0;
 page.doc.querySelector('#more').onclick=()=>{libraryClicks++;page.add(5);page.doc.querySelector('#more').remove();};
 result=await page.api.fetchAmazonVideoLibrary();
 assert(libraryClicks===1&&result.items.length===5,'Library-scoped navigation Load more is followed before terminal completion');
 page=await setup({total:5,outside:'<nav><button aria-controls="list" id="external-more">Show more</button></nav>'});
 page.doc.querySelector('#external-more').onclick=()=>{page.add(5);page.doc.querySelector('#external-more').remove();};
 result=await page.api.fetchAmazonVideoLibrary();assert(result.items.length===5,'An outside pager explicitly associated with the library remains a real continuation control');
 // Hidden and disabled controls must not look like perpetual continuation.
 page=await setup({inside:'<div role="progressbar" hidden></div><button hidden>Load more</button><button aria-disabled="true">Show more</button><button disabled>See more</button>'});
 result=await page.api.fetchAmazonVideoLibrary();assert(result.items.length===4,'Hidden and disabled library controls do not prevent a real end');
 // Virtualized DOM replaces the group; retain stable IDs from prior observations.
 page=await setup({nested:true,total:8,inside:'<div id="loading" role="progressbar"></div>'});
 page.onPause(n=>{if(n===4){page.list.innerHTML=[5,6,7,8].map(n=>card(n)).join('');page.doc.querySelector('#loading').remove();}});
 result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===8,'Virtualized replacement preserves both earlier and later rendered groups');
 // Preallocated virtual scroll range: jumping straight to bottom loses rows.
 page=await setup({nested:true,total:10});
 const renderWindow=()=>{const first=Math.floor(page.list.scrollTop/100)+1;page.list.innerHTML='<div style="height:1000px"></div>'+Array.from({length:Math.min(3,11-first)},(_,i)=>card(first+i).replace('height:110px',`position:absolute;top:${(first+i-1)*100}px;height:100px`)).join('');};
 page.list.style.position='relative';renderWindow();page.onScroll(renderWindow);
 result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items.length===10&&Array.from({length:10},(_,i)=>i+1).every(n=>result.items.some(item=>item.providerItemId.endsWith('-'+n))),'Overlapping viewport traversal retains every group in a preallocated virtualized range');
 page=await setup({nested:true,total:8});page.doc.querySelector('main').insertAdjacentHTML('beforeend',`<div style="height:180px;overflow-y:auto">${[5,6,7,8].map(n=>card(n)).join('')}</div><button aria-label="Next page">&gt;</button>`);
 result=await page.api.fetchAmazonVideoLibrary();assert(result.items.length===8&&result.completionConfirmed,'Separate nested lists are each traversed before the reconciled whole-list total confirms completion');
 const layout=page.api.getDiagnostics().currentPage;
 assert(layout.scrollableContainers===2&&layout.remainingOtherScrollers===0&&layout.visibleNextLikeControls===1,'Export records visited scroller boundaries and accessible Next controls without recording their text');
 // A busy listing never qualifies, even when geometry/count stops changing.
 page=await setup({inside:'<div role="progressbar"></div>'});
 await rejects(page,/could not establish/,'A permanently busy listing fails instead of certifying a partial collection');
 assert(page.api.getDiagnostics().state==='uncertain'&&page.api.getDiagnostics().reason==='continuation-unresolved'&&page.api.getDiagnostics().passes.length<40,'Bounded failure diagnostics identify the unsatisfied continuation checks');
 assert(!/PRIVATE_TITLE|amzn1|fixture-|https?:|cookie|token|account/i.test(JSON.stringify(page.api.getDiagnostics())),'Diagnostic export contains no titles, product IDs, URLs, account details or credentials');
 page=await setup({inside:'<button>Show more</button>'});await rejects(page,/could not establish/,'An unresponsive real library continuation control remains an incomplete scan');
 page=await setup({total:99});await rejects(page,/could not establish/,'An explicit library count mismatch cannot become a complete snapshot');
 page=await setup({ids:[]});await rejects(page,/no readable movie or TV cards/,'A missing or empty listing cannot erase the saved library');
 page=await setup();page.list.insertAdjacentHTML('beforeend',card(99,{bad:true}));await rejects(page,/unreadable library cards/,'Unreadable cards still prevent replacement');
 page=await setup({ids:[1,2,3,4]});page.list.innerHTML=card(1,{ownership:'Rental'})+card(2,{ownership:'Purchased'})+card(3,{ownership:'Included with Prime'})+card(4,{ownership:'Watch now'});
 result=await page.api.fetchAmazonVideoLibrary();
 assert(result.items[0].ownership==='rental'&&result.items[1].ownership==='owned'&&result.items[2].ownership==='subscription'&&result.items[3].ownership==='unknown','Rental, purchase, explicit Prime access and unconfirmed access remain distinct');
 page.list.querySelector('article').insertAdjacentHTML('beforeend','<span>You purchased this</span>');
 assert(page.api.amazonVideoItemsFromDocument(page.doc)[0].ownership==='unknown','Conflicting rental and purchase labels do not silently establish ownership');
 page=await setup();result=await page.api.fetchAmazonVideoLibrary(()=>{},['amzn1.dv.gti.fixture-1','amzn1.dv.gti.fixture-2','amzn1.dv.gti.fixture-3','amzn1.dv.gti.fixture-4']);
 assert(!result.snapshot&&result.items.length===0,'A quick update stops at an already known rendered group without replacing the full library');
 // Real content panel and production writer, with entirely disposable memory.
 const memory={};const storage={async get(defaults){return structuredClone({...defaults,...memory});},async set(value){Object.assign(memory,structuredClone(value));}};
 const writer=createStorageWriter(storage);
 await writer.mergeProviderItems('amazon-video',[{providerItemId:'old-video',title:'Preserved video',mediaType:'movie',ownership:'owned'}]);
 await writer.mergeProviderItems('gog',[{providerItemId:'old-game',title:'Unrelated game',mediaType:'game',ownership:'owned'}]);
 const before=JSON.stringify(await writer.getDatabase());let imports=0,failures=0,shadow,knownIds=[],messages=[];
 page=await setup({inside:'<div role="progressbar"></div>'});
 const floatingPanelCode=await(await fetch('/src/providers/floating-panel.js')).text();
 const renderPanel=async(diagnostics=false)=>{
  page.win.chrome={runtime:{sendMessage:async request=>request.type==='GET_PROVIDER_DIAGNOSTICS_SETTING'?{ok:true,enabled:diagnostics}:{ok:true,profiles:[],profileLabel:'Fixture'}}};page.win.eval(floatingPanelCode);
  const original=page.win.Element.prototype.attachShadow;page.win.Element.prototype.attachShadow=function(options){shadow=original.call(this,options);return shadow;};
  page.win.GalacticSync={send:async request=>{
   messages.push(request.type);
   if(request.type==='GET_PROVIDER_SYNC_STATE')return {ok:true,hasFullBaseline:true,syncState:{knownProviderItemIds:knownIds}};
   if(request.type==='IMPORT_PROVIDER_ITEMS'){imports++;const items=JSON.parse(JSON.stringify(request.items));const database=request.mode==='full'?await writer.replaceProviderItems('amazon-video',items,{syncMode:'full'},JSON.parse(JSON.stringify(request.snapshot))):await writer.mergeProviderItems('amazon-video',items,{syncMode:'incremental'});return {ok:true,movieCount:Object.values(database.providerItems).filter(item=>item.provider==='amazon-video'&&item.mediaType==='movie').length,tvCount:Object.values(database.providerItems).filter(item=>item.provider==='amazon-video'&&item.mediaType==='tv').length};}
   throw Error('Unexpected message');},failed:async()=>{failures++;}};
  page.win.eval(panelCode.replace("if (!location.pathname.includes('/gp/video/')",'if (false'));
  page.win.Element.prototype.attachShadow=original;await new Promise(resolve=>nativeTimeout(resolve,0));
 };
 const waitFor=async predicate=>{for(let n=0;n<500;n++){if(predicate())return;await new Promise(resolve=>nativeTimeout(resolve,10));}throw Error('Panel did not finish');};
 await renderPanel();
 assert(shadow.querySelectorAll('[data-mode="full"], [data-mode="incremental"]').length===2&&[...shadow.querySelectorAll('[data-provider-diagnostic]')].every(e=>!e.getClientRects().length),'The ordinary Amazon Video panel hides diagnostics while preserving its two import actions and declared-account controls');
 shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>failures===1&&!shadow.querySelector('.status').dataset.busy);
 assert(page.api.getDiagnostics().hoverChecks.enabled&&imports===0&&JSON.stringify(await writer.getDatabase())===before,'Normal Full rescan enables purchase detection automatically and keeps internal sanitized diagnostics on failure');
 page.doc.querySelector('#galactic-library-amazon-video-importer').remove();failures=0;messages=[];
 await renderPanel(true);assert(shadow.querySelector('details[data-provider-diagnostic] summary').textContent==='Scan diagnostics'&&shadow.querySelector('[data-export-diagnostics]').disabled,'A troubleshooting build retains the existing read-only checks and sanitized export');
 shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>failures===1&&!shadow.querySelector('.status').dataset.busy);
 assert(imports===0&&JSON.stringify(await writer.getDatabase())===before,'A failed production-panel scan sends no import and preserves all saved records');
 assert(!shadow.querySelector('[data-export-diagnostics]').disabled,'A failed scan enables the ordinary UI diagnostic export action');
 let exported;page.win.URL.createObjectURL=blob=>{exported=blob;return 'blob:fixture';};page.win.URL.revokeObjectURL=()=>{};page.win.HTMLAnchorElement.prototype.click=function(){};
 shadow.querySelector('[data-export-diagnostics]').click();assert(exported&&JSON.parse(await exported.text()).reason==='continuation-unresolved'&&JSON.stringify(await writer.getDatabase())===before,'Export action creates diagnostic JSON without modifying storage');
 page.doc.querySelector('[role="progressbar"]').remove();shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>imports===1&&!shadow.querySelector('.status').dataset.busy);
 assert(shadow.querySelector('.status').textContent.startsWith('Full rescan complete')&&!shadow.querySelector('[data-export-diagnostics]').disabled&&shadow.querySelector('[data-export-diagnostics]').closest('details').open,'Successful scans also expose diagnostics instead of hiding evidence of premature completion');
 const db=await writer.getDatabase();assert(Object.values(db.providerItems).filter(item=>item.provider==='amazon-video').length===4&&Object.values(db.providerItems).some(item=>item.provider==='gog'),'A validated full snapshot updates only Amazon Video records');
 const beforeCheck=JSON.stringify(db);messages=[];shadow.querySelector('[data-mode="inspect"]').click();await waitFor(()=>!shadow.querySelector('.status').dataset.busy);
 assert(messages.length===0&&imports===1&&failures===1&&JSON.stringify(await writer.getDatabase())===beforeCheck,'Check listing neither begins a sync lease nor writes scan health, records or imports');
 assert(shadow.querySelector('.status').textContent.includes('4 titles found')&&shadow.querySelector('.status').textContent.includes('confirmed by a whole-list total'),'A confirmed read-only check describes the actual count evidence without importing');
 shadow.querySelector('[data-export-diagnostics]').click();assert(JSON.parse(await exported.text()).operation.outcome==='confirmed-without-import','Read-only export identifies a check rather than a saved import');
 page.doc.querySelector('main p').remove();
 await writer.mergeProviderItems('amazon-video',[{providerItemId:'unseen-saved-product',title:'Earlier saved title',mediaType:'movie',ownership:'rental',metadata:{authors:['Preserved creator']}}]);
 const unseen=JSON.stringify(Object.values((await writer.getDatabase()).providerItems).find(item=>item.providerItemId==='unseen-saved-product'));
 knownIds=['amzn1.dv.gti.fixture-1','amzn1.dv.gti.fixture-2','amzn1.dv.gti.fixture-3','amzn1.dv.gti.fixture-4','unseen-saved-product'];
 shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>imports===2&&!shadow.querySelector('.status').dataset.busy);
 assert(shadow.querySelector('.status').textContent.includes('Amazon did not confirm a complete listing')&&JSON.stringify(Object.values((await writer.getDatabase()).providerItems).find(item=>item.providerItemId==='unseen-saved-product'))===unseen,'Inferred full rescans save observations additively and preserve unseen source identity, metadata and access');
 shadow.querySelector('[data-export-diagnostics]').click();const inferred=JSON.parse(await exported.text());
 assert(inferred.completionStatus==='inferred'&&!inferred.completionConfirmed&&inferred.verification.completed,'Export distinguishes inferred convergence from provider-confirmed completeness');
 page.doc.querySelector('main').insertAdjacentHTML('afterbegin','<p>All items (4)</p>');
 shadow.querySelector('[data-mode="full"]').click();await waitFor(()=>imports===3&&!shadow.querySelector('.status').dataset.busy);
 assert(shadow.querySelector('.status').textContent.startsWith('Full rescan complete'),'A reconciled provider total permits a genuinely shorter snapshot through the existing validation gate');
 page.doc.querySelector('main').insertAdjacentHTML('beforeend','<div role="progressbar"></div>');messages=[];const beforeFailedCheck=JSON.stringify(await writer.getDatabase());
 shadow.querySelector('[data-mode="inspect"]').click();await waitFor(()=>!shadow.querySelector('.status').dataset.busy);
 assert(messages.length===0&&failures===1&&JSON.stringify(await writer.getDatabase())===beforeFailedCheck&&!shadow.querySelector('[data-export-diagnostics]').disabled,'An incomplete read-only check still exports evidence without recording a failed library sync');
 assert(shadow.querySelector('.status').textContent.includes('Completion uncertain')&&page.api.getDiagnostics().completionConfirmed===false,'The read-only panel explains uncertainty instead of displaying a complete-library success');
 page.doc.querySelector('[role="progressbar"]').remove();page.doc.querySelector('main p').textContent='All items (8)';
 knownIds=['amzn1.dv.gti.fixture-1','amzn1.dv.gti.fixture-2','amzn1.dv.gti.fixture-3','amzn1.dv.gti.fixture-4'];
 shadow.querySelector('[data-mode="incremental"]').click();await waitFor(()=>imports===4&&!shadow.querySelector('.status').dataset.busy);
 assert(shadow.querySelector('.status').textContent.includes('Newest-title check added 0')&&shadow.querySelector('.status').textContent.includes('Older titles were not fully checked'),'Quick-update UI makes its newest-only limitation explicit even when a legacy baseline was incomplete');
 assert(Object.values((await writer.getDatabase()).providerItems).filter(item=>item.provider==='amazon-video').length===4,'The bounded quick update preserves existing source membership without inventing older missing titles');
 const beforeHoverCheck=JSON.stringify(await writer.getDatabase());messages=[];
 shadow.querySelector('[data-mode="inspect"]').click();
 assert([...shadow.querySelectorAll('[data-mode]')].every(button=>button.disabled),'Conflicting scan actions remain disabled during a running check');
 await waitFor(()=>!shadow.querySelector('.status').dataset.busy);
 assert(page.api.getDiagnostics().hoverChecks.enabled&&messages.length===0&&JSON.stringify(await writer.getDatabase())===beforeHoverCheck,'The internal read-only check uses automatic ownership extraction without changing stored records');
 const panelTimer=page.win.setTimeout;page.win.setTimeout=(callback,ms,...args)=>ms===15000?nativeTimeout(callback,0):panelTimer(callback,ms,...args);
 shadow.querySelector('[data-mode="ownership"]').click();await waitFor(()=>!shadow.querySelector('.status').dataset.busy);
 assert(messages.length===0&&page.api.getDiagnostics().state==='purchase-label-check-complete'&&shadow.querySelector('.status').textContent.includes('No library records changed'),'The manual-hover diagnostic is accessible through the panel and cannot begin an import or scan lease');
 await nativeFetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await nativeFetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
finally{frame?.remove();}
