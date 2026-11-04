import '../src/providers/metadata.js';
import '../src/providers/kobo.js';
import '../src/providers/kobo-diagnostics.js';
import '../src/providers/floating-panel.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {createProvidersView} from '../src/ui/providers-view.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
const checks=[],stored={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async changes=>Object.assign(stored,structuredClone(changes))});
const assert=(value,message)=>{if(!value)throw Error(message);};
const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
const wait=async predicate=>{for(let n=0;n<300;n++){if(predicate())return;await pause();}throw Error('Kobo fixture did not complete.');};
const uuid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const originalFetch=globalThis.fetch;
const shadows=[],attach=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(options){const root=attach.call(this,options);shadows.push(root);return root;};
try{
  const html='<div class="filter-btn">All Items (137)</div><ul>'+Array.from({length:24},(_,n)=>`<li class="book-card"><div class="book-info"><h3 class="book-title">Example Book ${n}</h3><span class="book-author">Writer ${n}</span><span class="book-genre">Comics &amp; Graphic Novels</span></div><div class="book-actions"><span class="action-title">Read Now: Example Book ${n}</span><a data-book-title="Example Book ${n}" aria-label="Read Now: Example Book ${n}" href="https://readnow.kobo.com/${uuid(n)}">Read Now</a></div></li>`).join('')+'</ul>';
  const doc=new DOMParser().parseFromString(html,'text/html'),cards=globalThis.GalacticKobo.koboItemsFromDocument(doc);
  assert(cards.length===24&&cards.every((r,n)=>r.title==='Example Book '+n&&r.metadata.authors[0]==='Writer '+n&&r.metadata.genres[0]==='Comics & Graphic Novels'&&r.providerItemId===uuid(n)),'Read Now wrapper polluted title or lost adjacent metadata.');
  checks.push('Actual Kobo DOM parser reads clean dedicated titles, adjacent authors/genres and stable UUIDs from 24 action wrappers');
  const tricky=new DOMParser().parseFromString('<ul><li class="book-card"><a data-book-title="Read Now: A Novel" href="https://www.kobo.com/ebook/novel">Read Now</a></li><li class="book-card"><h3>Unlabeled</h3><span class="ownership-label">Kobo Plus</span><a data-book-title="Unlabeled" href="https://www.kobo.com/ebook/unlabeled">Read Now</a></li><li class="book-card"><span class="ownership-label">Purchased</span><a data-book-title="Proof" data-author="Writer, Jr." data-genre="History" href="https://www.kobo.com/ebook/proof">Read Now</a></li></ul>','text/html');
  const parsed=globalThis.GalacticKobo.koboItemsFromDocument(tricky);assert(parsed[0].title==='Read Now: A Novel'&&parsed[1].ownership==='unknown'&&parsed[2].ownership==='owned'&&parsed[2].metadata.authors[0]==='Writer, Jr.','Speculative title stripping, comma splitting or purchase leakage.');
  checks.push('Literal book-title attributes are preserved and availability badges never imply purchase or leak between cards');
  const stableDoc=new DOMParser().parseFromString(`<article data-product-id="${uuid(555)}"><h3>Audiobook Adventures</h3><a data-book-title="Audiobook Adventures" href="https://readnow.kobo.com/${uuid(777)}">Read Now</a><a data-book-title="Audiobook Adventures" href="https://readnow.kobo.com/${uuid(777)}">Read Now</a><span class="book-author">Writer</span></article>`,'text/html');
  const stable=globalThis.GalacticKobo.koboItemsFromDocument(stableDoc);assert(stable.length===1&&stable[0].providerItemId===uuid(777)&&stable[0].mediaType==='book'&&stable[0].metadata.authors[0]==='Writer','Card expansion changed the reader UUID, format or deduplicated metadata.');
  checks.push('Stable reader UUID survives conflicting wrapper IDs and duplicate action links; title words never change book format');
  // Structural fixtures test diagnostic bounds/privacy, not Kobo's live
  // purchase-history layout or eligibility for ownership promotion.
  const diagnostic=globalThis.GalacticKoboDiagnostics;
  const evidence=diagnostic.inspect(doc,[uuid(0)]);
  assert(evidence.parsedLibraryItems===24&&evidence.parsedSavedIdMatches===1&&evidence.completeness==='not-established','Diagnostic invented complete history or lost exact identity comparison.');
  const privateDoc=new DOMParser().parseFromString(`<article><a href="https://www.kobo.com/ebook/private-title">PRIVATE TITLE</a><time datetime="2020-01-01">2020-01-01</time><span>private@example.com Kobo Plus</span></article>`,'text/html');
  const redacted=JSON.stringify(diagnostic.inspect(privateDoc));
  assert(!['PRIVATE TITLE','private-title','2020-01-01','private@example.com'].some(value=>redacted.includes(value)),'Diagnostic leaked source content.');
  assert(diagnostic.inspect(privateDoc).rowsWithDateHints===1&&diagnostic.inspect(privateDoc).rowsWithSubscriptionWording===1,'Structural hints lost.');
  checks.push('Read-only evidence inventory exports aggregate ID/date/access hints without source values or completeness claims');
  const linked=new DOMParser().parseFromString('<a href="https://www.kobo.com/account/history">Purchase History</a>','text/html');
  let requests=0;
  const report=await diagnostic.check(linked,'https://www.kobo.com/library',[],async(url,options)=>{requests++;assert(options.redirect==='error'&&options.credentials==='include','Diagnostic followed uncontrolled redirects.');return new Response(privateDoc.documentElement.outerHTML);});
  assert(requests===1&&report.purchaseHistory.scope==='purchase-history-first-page'&&report.purchaseHistory.completeness==='not-established','Diagnostic traversed history or invented completeness.');
  for(const [response,state]of [[new Response('',{status:403}),'access-denied'],[new Response('<input type="password">'),'sign-in-required'],[new Response('Your purchase history is empty'),'explicit-empty'],[new Response('<main>Unexpected layout</main>'),'unrecognized'],[new Response('x'.repeat(2*1024*1024+1)),'size-limit']])assert((await diagnostic.check(linked,'https://www.kobo.com/library',[],async()=>response)).purchaseHistory.state===state,'Diagnostic conflated empty, unreadable, oversized or inaccessible history.');
  const foreign=new DOMParser().parseFromString('<a href="https://example.com/history">Purchase History</a>','text/html');
  const hiddenEmpty=new DOMParser().parseFromString('<main>Unexpected layout</main><script>"Your purchase history is empty"</script><p hidden>Your purchase history is empty</p>','text/html');
  assert(diagnostic.inspect(hiddenEmpty).state==='unrecognized','Unused script or hidden empty-list wording was treated as evidence.');
  assert((await diagnostic.check(foreign,'https://www.kobo.com/library',[],()=>{throw Error('must not request');})).requestsMade===0,'Foreign evidence page fetched.');
  assert((await diagnostic.check(linked,'https://www.kobo.com/library',[],async()=>{throw Error('PRIVATE exception');})).purchaseHistory.state==='inaccessible-or-redirected','Request errors leaked or were treated as empty.');
  checks.push('History check makes at most one same-site request and distinguishes access, login, explicit empty, unknown, size limits and failures');
  const items=[...cards.map(r=>({...r,metadata:{...r.metadata,librarySection:'my-books'}})),...Array.from({length:113},(_,n)=>({providerItemId:uuid(n+24),title:'Saved Book '+n,mediaType:'book',ownership:'unknown',metadata:{authors:['Saved Writer'],ownershipBasis:'library-presence-only'}}))];
  let db=await writer.replaceProviderItems('kobo',items,{profileLabel:'Sean',fullSyncAt:'2026-10-01'},completeProviderSnapshot('kobo',items,[completedScope('library',137,137,'reported-count')]));
  const profileId=db.providers.kobo.activeProfileId,refs=Object.values(db.providerItems).map(r=>r.recordRef).sort().join();
  let releaseProfile,profilePending=true,started=0,completed=0;const uiTimings=[];
  const profileGate=new Promise(resolve=>{releaseProfile=resolve;});
  const scanUrls=[];
  let delayFetch=false,releaseFetch,fetchWaiting=false;
  globalThis.fetch=async url=>{scanUrls.push(new URL(url));if(delayFetch){fetchWaiting=true;await new Promise(resolve=>{releaseFetch=resolve;});delayFetch=false;}return {ok:true,text:async()=>html};};
  globalThis.chrome={runtime:{sendMessage:async request=>{
    if(request.type==='GET_PROVIDER_PROFILE_HINT')return {ok:true,hint:await writer.getProviderProfileHint('kobo')};
    if(request.type==='GL_PROVIDER_UI_TIMING'){uiTimings.push(request.timing);return {ok:true};}
    if(request.type==='GET_PROVIDER_PROFILE'){
      if(profilePending)await profileGate;
      const current=await writer.getDatabase(),profile=current.providerProfiles[current.providers.kobo.activeProfileId],profiles=Object.values(current.providerProfiles).filter(p=>p.provider==='kobo');
      return {ok:true,profileId:profile.profileId,profileLabel:profile.nickname,reuseAllowed:profiles.length===1&&profile.state.connected,profiles};
    }
    if(request.type==='GET_PROVIDER_SYNC_STATE'){
      if(request.beginScan===false){const saved=await writer.getDatabase();return {ok:true,syncState:{knownProviderItemIds:Object.values(saved.providerItems).filter(r=>r.profileId===profileId).map(r=>r.providerItemId)}};}
      started++;
      try{const scan=await writer.beginProviderScan('kobo',request.profileLabel,request.mode,request.switchProfile,1,request.profileId,!request.confirmed&&request.rememberedProfile);
        return {ok:true,profileId:scan.profileId,scanToken:scan.scanToken,hasFullBaseline:!scan.forceFull,syncState:{knownProviderItemIds:Object.values(scan.database.providerItems).filter(r=>r.profileId===scan.profileId).map(r=>r.providerItemId)}};
      }catch(error){return {ok:false,error:error.message};}
    }
    if(request.type==='COMMIT_PROVIDER_SCAN'){
      try{const result=await writer.commitProviderScan('kobo',request.items,{syncMode:request.mode},request.snapshot,request.scanToken,1,true);db=result.database;completed++;return {ok:true,bookCount:db.providers.kobo.bookCount,audiobookCount:db.providers.kobo.audiobookCount,...result.scanResult};}
      catch(error){return {ok:false,error:error.message};}
    }
    if(request.type==='REPORT_PROVIDER_SCAN_FAILURE')return {ok:true};
    return {ok:false,error:'Unexpected request'};
  }}};
  history.replaceState(null,'','/library');await import('../src/providers/kobo-content.js');let shadow=shadows.at(-1),button=shadow.querySelector('[data-mode="incremental"]');
  const beforeDiagnostic=JSON.stringify(await writer.getDatabase());
  shadow.querySelector('[data-check-evidence]').click();await wait(()=>!shadow.querySelector('.status').dataset.busy);
  assert(started===0&&completed===0&&JSON.stringify(await writer.getDatabase())===beforeDiagnostic&&!shadow.querySelector('[data-export-evidence]').hidden,'Diagnostic started an import or changed the library.');
  assert(shadow.querySelector('.status').textContent.includes('No library data changed'),'Diagnostic did not explain its read-only result.');
  checks.push('Overlay evidence check uses a read without starting a scan or modifying records, accounts, reviews or baseline');
  button.click();await pause();assert(started===0,'Scan began before persisted profile selection resolved.');assert(shadow.querySelector('[data-profile-label]').value==='Sean','Display-only remembered nickname waited for full validation.');profilePending=false;releaseProfile();await wait(()=>completed===1);
  assert(shadow.querySelector('[data-profile-label]').value==='Sean'&&!shadow.querySelector('[data-profile-confirm]').checked,'Remembered account required a repeated checkbox confirmation.');
  const accountTiming=uiTimings.find(r=>r.providerPhase==='account');assert(accountTiming&&['provider_hint_message','provider_hint_display','provider_profile_message','provider_verified_display'].every(stage=>accountTiming.events.some(e=>e.stage===stage)),'Account hint, callback and display diagnostics are missing.');
  assert(shadow.querySelector('.status').textContent.includes('24 checked · 0 new · 0 updated'),'Observed cards were reported as changed books.');
  checks.push('A click during delayed account loading waits, then reuses the single saved profile without nickname entry or repeat confirmation');
  history.replaceState(null,'','/library?pageNumber=9&sort=TitleAsc');
  delayFetch=true;button.click();await wait(()=>fetchWaiting);
  shadow.querySelector('[data-export-evidence]').click();
  shadow.querySelector('summary').click();
  shadow.querySelector('[data-galactic-floating-panel-control="minimize"]').click();
  shadow.querySelector('[data-galactic-floating-panel-control="restore"]').click();
  releaseFetch();await wait(()=>completed===2);assert(shadow.querySelector('.status').textContent.includes('0 updated')&&Object.keys(db.providerItems).length===137&&Object.values(db.providerItems).map(r=>r.recordRef).sort().join()===refs,'Second unchanged quick scan changed records or lost baseline.');
  checks.push('Actual delayed Kobo import commits after evidence export, help and minimize/restore without losing its account-bound scan token');
  assert(scanUrls.at(-1).searchParams.get('pageNumber')==='1'&&scanUrls.at(-1).searchParams.get('sort')==='DateAddedDesc','Repeated scan failed to reset My Books paging and ordering.');
  assert(JSON.stringify(parseBackup(createBackup(db)))===JSON.stringify(db),'Author/genre backup roundtrip changed metadata.');
  checks.push('Two actual unchanged quick scans report zero new/updated, retain all 137 UUIDs and preserve metadata through backup restore');
  db=await writer.mergeProviderItems('kobo',[{providerItemId:uuid(999),title:'Other Account Book',mediaType:'book'}],{profileLabel:'Other'});
  const before=JSON.stringify(db.providerItems);button.click();await wait(()=>!shadow.querySelector('.status').dataset.busy);assert(shadow.querySelector('.status').textContent.includes('Saved accounts changed')&&JSON.stringify((await writer.getDatabase()).providerItems)===before,'Stale remembered single-profile permission crossed accounts.');
  document.querySelector('#galactic-library-kobo-importer').remove();await import('../src/providers/kobo-content.js?multiple');shadow=shadows.at(-1);await wait(()=>shadow.querySelector('[data-profile-label]').value==='Other');
  assert(!shadow.querySelector('[data-profile-confirm-label]').hidden,'Multi-account ambiguity auto-confirmed.');const choice=shadow.querySelector('[data-profile-choice]');choice.value=profileId;choice.dispatchEvent(new Event('change'));shadow.querySelector('[data-mode="incremental"]').click();await wait(()=>!shadow.querySelector('.status').dataset.busy);assert(shadow.querySelector('.status').textContent.includes('confirm'),'Unconfirmed multi-account scan succeeded.');
  shadow.querySelector('[data-profile-confirm]').checked=true;shadow.querySelector('[data-profile-switch]').checked=true;shadow.querySelector('[data-mode="incremental"]').click();await wait(()=>completed===3);assert(db.providers.kobo.activeProfileId===profileId&&Object.keys(db.providerItems).length===138,'Confirmed profile switch lost account isolation.');
  checks.push('Stale automatic profile reuse is rejected; multiple saved accounts require explicit selection, confirmation and switch');
  const view=createProvidersView({saveKoboOwnershipAssumption:(...args)=>writer.saveKoboOwnershipAssumption(...args),onDatabase:next=>{db=next;view.update(next);}});document.body.append(view.element);view.update(db);
  const account=view.element.querySelector('[data-account="'+profileId+'"]');account.closest('details').open=true;account.querySelector('details').open=true;
  [...account.querySelectorAll('button')].find(b=>b.textContent==='Ownership preference').click();const dialog=view.element.querySelector('dialog'),checkbox=dialog.querySelector('[data-kobo-assume-owned]');assert(!checkbox.checked,'Ownership assumption defaulted to true.');checkbox.checked=true;[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Save preference').click();await wait(()=>db.providerProfiles[profileId].assumeUnconfirmedOwned);
  const record=Object.values(db.providerItems).find(r=>r.profileId===profileId);assert(record.ownership==='unknown'&&effectiveOwnershipRecord(record,db).ownership==='owned','Preference overwrote source evidence or failed to affect display.');
  await wait(()=>!shadow.querySelector('.status').dataset.busy);shadow.querySelector('[data-profile-confirm]').checked=true;
  shadow.querySelector('[data-mode="incremental"]').click();await wait(()=>completed===4);
  assert(shadow.querySelector('.status').textContent.includes('Ownership preference applied')&&!shadow.querySelector('.status').textContent.includes('need ownership review'),'Covered items were incorrectly reported as needing review.');
  checks.push('Kobo account ownership preference is explicitly opt-in and changes effective access without rewriting source evidence');
}catch(error){checks.push('FAILED: '+error.message);await originalFetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});throw error;}
await originalFetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
