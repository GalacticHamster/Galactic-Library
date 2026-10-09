import {CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import '../src/lib/kindle-contents-scan.js';
import '../src/providers/floating-panel.js';
import { createStorageWriter } from '../src/background/storage-writer.js';
import { completeProviderSnapshot, completedScope } from '../src/lib/provider-snapshot.js';
import '../src/providers/metadata.js';
import '../src/providers/fanatical.js';
import {kindleContentsPlan} from '../src/lib/kindle-contents.js';
import {createContentsEditor} from '../src/ui/contents-editor.js';
import {createEnrichmentWorkbench} from '../src/ui/enrichment-workbench.js';

// Real content-script controls, with signed-in fetches replaced by fixtures.
// Content scripts have no direct storage access; the worker owns this hidden area.
function providerRecord(database,provider,nativeId){const records=Object.values(database.providerItems).filter(r=>r.provider===provider&&r.providerItemId===nativeId);assert(records.length===1,'Expected one account-scoped fixture record for '+provider+':'+nativeId);return records[0];}
const checks=[]; const values={}; const writer=createStorageWriter({get:async defaults=>Object.fromEntries(Object.keys(defaults).map(key=>[key,structuredClone(values[key]??defaults[key])])),set:async updates=>Object.assign(values,structuredClone(updates))},Promise.resolve(),{cacheRefreshPreflight:true});
const shadows=[]; const attach=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(options){const root=attach.call(this,options);shadows.push(root);return root;};
const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
const assert=(value,message)=>{if(!value)throw new Error(message);};
// The page-lifetime pacing gate can wait for a previous run's last start and
// then a second request. Allow that legitimate interval; assert rate below.
const wait=async predicate=>{for(let n=0;n<500;n++){if(predicate())return;await pause();}throw new Error('Importer did not finish.');};
const fixtures=[
  ['steam','steam-store','GalacticSteamStore','fetchOwnedSteamGames','/account'],
  ['gog','gog','GalacticGog','fetchGogGames','/account'],
  ['epic','epic','GalacticEpic','fetchEpicGames','/library'],
  ['amazon-games','amazon-games','GalacticAmazonGames','fetchAmazonGames','/my-collection'],
  ['audible','audible','GalacticAudible','fetchAudibleAudiobooks','/library'],
  ['kindle','kindle','GalacticKindle','fetchKindleBooks','/hz/mycd/'],
  ['amazon-video','amazon-video','GalacticAmazonVideo','fetchAmazonVideoLibrary','/gp/video/library'],
  ['kobo','kobo','GalacticKobo','fetchKoboLibrary','/library'],
  ['humble','humble','GalacticHumble','fetchHumblePurchases','/home/purchases'],
  ['fanatical','fanatical','GalacticFanatical',null,'/orders'],
  ['fandango-at-home','fandango-at-home','GalacticFandangoAtHome','readFandangoGrid','/content/browse/mylibrary']
];
try{
  for(const [provider,file,globalName,method,path] of fixtures){
    history.replaceState({},'',path);
    const mediaType=provider==='kindle'||provider==='kobo'||provider==='humble'?'book':provider==='audible'?'audiobook':provider==='amazon-video'||provider==='fandango-at-home'?'movie':'game';
    const items=[{providerItemId:'fixture-123',title:`Test ${provider}`,mediaType,ownership:'owned'}];
    const scopes=provider==='kindle'?[completedScope('books',1,1,'reported-count'),completedScope('personal-documents',0,0,'reported-count')].map(scope=>({...scope,duplicateCount:0})):provider==='fandango-at-home'?[completedScope('movie',1,1,'reported-count'),completedScope('tv',0,0,'reported-count')]:[completedScope('library',1,1,'reported-count')];
    const snapshot=completeProviderSnapshot(provider,items,scopes);
    const result={items,snapshot,unresolvedApps:[],newAppCount:1,skippedCount:0,failures:[],knownPurchaseIds:['fixture-purchase'],purchasesRead:1,skippedKnown:0,diagnostics:{windowsRead:1,categoryCounts:{'personal-documents':0}}};
    if(method)globalThis[globalName]={...globalThis[globalName],[method]:async()=>method==='readFandangoGrid'?items:result};
    const denied=()=>{throw new Error('Content-script storage access denied.');};
    let imported=0; let mode='full';
    globalThis.chrome={storage:{local:{get:denied,set:denied},session:{get:denied,set:denied}},runtime:{sendMessage:async request=>{
      if(request.type==='GET_KINDLE_CONTENTS_REFRESH')return {ok:true,eligible:0,checkpoint:null};
      if(request.type==='GET_PROVIDER_PROFILE')return {ok:true,profileLabel:'fixture'};
      if(request.type==='REPORT_PROVIDER_SCAN_FAILURE')return {ok:true,recorded:await writer.failProviderScan(provider,request.scanToken,1,request.failure)};
      if(request.type==='GET_PROVIDER_SYNC_STATE'){const scan=await writer.beginProviderScan(provider,request.profileLabel,request.mode,request.switchProfile,1);return {ok:true,scanToken:scan.scanToken,hasFullBaseline:!scan.forceFull,syncState:{knownProviderItemIds:[],knownPurchaseIds:[],knownOrderFingerprints:[]}};}
      if(request.type==='FETCH_FANATICAL_ORDERS')return {ok:true,result:{items:[{sourceItemId:'fixture-123',title:items[0].title,mediaType}],snapshot,orderFingerprints:[]}};
      if(request.type==='FANDANGO_IMPORT_STATE'&&request.action==='get'){const scan=await writer.beginProviderScan(provider,'fixture',mode,false,1);return {ok:true,state:{phase:'tv',fullRescan:scan.forceFull||mode==='full',expected:{movies:1,tv:0},urls:{tv:location.href},items:mode==='full'?items:[],knownItemIds:[],scanContext:{profileLabel:'fixture',confirmed:true,mode,scanToken:scan.scanToken}}};}
      if(request.type==='FANDANGO_IMPORT_STATE')return {ok:true,state:request.action==='get'?{phase:'tv',fullRescan:mode==='full',expected:{movies:1,tv:0},urls:{tv:location.href},items:mode==='full'?items:[],knownItemIds:[]}:null};
      if(request.type==='COMMIT_PROVIDER_SCAN'){
        const database=await writer.commitProviderScan(provider,request.items,{syncMode:request.mode==='incremental'?'incremental':'full',fullSyncAt:new Date().toISOString(),scanDiagnostics:request.scanDiagnostics},request.snapshot,request.scanToken,1);
        imported++;const state=database.providers[provider];return {ok:true,gameCount:state.itemCount,...state};
      }
      return {ok:false,error:'Unexpected importer request.'};
    }}};
    for(mode of provider==='epic'?['full']:['full','incremental']){
      const before=imported;
      if(provider==='fandango-at-home'){
        // Final View All stage of the actual resumable workflow, in both modes.
        globalThis[globalName][method]=async()=>[];
        await import(`../src/providers/${file}-content.js?mode=${mode}`);
      }else{
        if(mode==='full')await import(`../src/providers/${file}-content.js`);
        const shadow=shadows.at(-1);
        const button=shadow.querySelector(`button[data-mode="${mode}"]`)||shadow.querySelector('button');
        assert(button,`${provider} missing ${mode} button`);if(provider==='kindle')await wait(()=>!shadow.querySelector('[data-contents-mode]').disabled);shadow.querySelector('[data-profile-label]').value='fixture';shadow.querySelector('[data-profile-confirm]').checked=true;button.click();
      }
      const shadow=shadows.at(-1);
      await wait(()=>!shadow.querySelector('.status').dataset.busy&&(imported>before||/failed:/iu.test(shadow.querySelector('.status').textContent)));
      assert(!/failed:/iu.test(shadow.querySelector('.status').textContent),shadow.querySelector('.status').textContent);
      checks.push(`${provider} ${mode} controls work with direct storage denied`);
      if(provider==='fandango-at-home')document.querySelector('#galactic-library-fandango-at-home-importer').remove();
    }
    if(provider==='gog'){const beforeFailure=JSON.stringify(values.galacticLibraryDatabase.providerItems);
      globalThis.GalacticGog.fetchGogGames=async()=>{throw new Error('Network failure on page 7: PRIVATE_TOKEN');};const shadow=shadows.at(-1);shadow.querySelector('button[data-mode="full"]').click();
      await wait(()=>values.galacticLibraryDatabase.providers.gog.syncHealth.status==='failed');assert(values.galacticLibraryDatabase.providers.gog.syncHealth.failedPages[0]===7&&!JSON.stringify(values).includes('PRIVATE_TOKEN'),'Failure report lost its page or leaked raw errors.');const retained=providerRecord(values.galacticLibraryDatabase,'gog','fixture-123');assert(retained.id!=='gog:fixture-123'&&retained.profileId,'Named-account record lost profile scope.');assert(retained.title===items[0].title&&JSON.stringify(values.galacticLibraryDatabase.providerItems)===beforeFailure,'Failed scan destroyed prior records.');checks.push('actual GOG failure reports safe dashboard diagnostics and preserves the prior snapshot');
    }
  }
  // Contents controls and DOM extraction use fixture pages, never Amazon.
  let kindleShadow=shadows.find(root=>root.querySelector('[data-contents-mode]'));
  const originalFetch=globalThis.fetch;
  const urls=id=>'https://www.amazon.com/dp/'+id;
  await writer.mergeProviderItems('kindle',[
    {providerItemId:'B000000001',title:'Example collection',mediaType:'book',metadata:{detailUrl:urls('B000000001'),originType:'Purchase'}},
    {providerItemId:'B000000002',title:'Wool Omnibus',mediaType:'book',metadata:{detailUrl:urls('B000000002'),originType:'Purchase'}},
    {providerItemId:'B000000003',title:'Ordinary novel',mediaType:'book',metadata:{detailUrl:urls('B000000003'),originType:'Purchase'}},
    {providerItemId:'B000000004',title:'Unavailable',mediaType:'book',metadata:{detailUrl:urls('B000000004'),originType:'Purchase'}}
  ]);
  let db=await writer.getDatabase();
  await writer.saveKindleComicContents([
    {itemId:providerRecord(db,'kindle','B000000001').id,recordRef:providerRecord(db,'kindle','B000000001').recordRef,sourceUrl:urls('B000000001'),statement:'Collects Example #1-2',availability:'statement-found'},
    {itemId:providerRecord(db,'kindle','B000000004').id,recordRef:providerRecord(db,'kindle','B000000004').recordRef,sourceUrl:urls('B000000004'),statement:'',availability:'unavailable',extractorVersion:2}
  ]);
  // Simulate a backup predating extractor/parser versions.
  db=await writer.getDatabase();const legacy=providerRecord(db,'kindle','B000000001').metadata.enrichment.kindleProductComicContents;delete legacy.extractorVersion;delete legacy.parserVersion;delete legacy.parseOutcome;await writer.restoreDatabase(db);
  // The production adapter enforces Amazon origin; this localhost fixture uses
  // its real DOM extractor behind a fixture-only product fetch implementation.
  globalThis.GalacticKindle.fetchKindleProductComicContents=async (url,{signal,timing,requestPacer}={})=>{
    const request=async()=>{const headers=timing?.begin('fetch_headers',timing.attempts);try{return await fetch(url,{signal});}finally{headers?.();}};
    const response=await requestPacer.start(request,{signal,timing});
    const bodyEnd=timing?.begin('response_body',timing.attempts);const body=await response.text();bodyEnd?.();
    const domEnd=timing?.begin('dom_parse',timing.attempts);const document=new DOMParser().parseFromString(body,'text/html');domEnd?.();
    if(document.querySelector('#captchacharacters'))throw new Error('Amazon requested a CAPTCHA; wait before continuing.');
    const extractEnd=timing?.begin('extraction',timing.attempts);const statement=globalThis.GalacticKindle.kindleContentsStatementFromDocument(document);extractEnd?.();
    return {sourceUrl:url,statement,descriptionBlocks:globalThis.GalacticKindle.kindleDescriptionBlocks(document),availability:statement?'statement-found':'no-statement',extractorVersion:globalThis.GalacticKindle.contentsExtractorVersion};
  };
  const contentsMessages=[];let delayedState=null;
  const confirmationMessages=[];let confirmRestart=false;
  globalThis.confirm=message=>{confirmationMessages.push(message);return confirmRestart;};
  const perf=globalThis.GalacticContentsPerformance;
  globalThis.chrome.runtime.sendMessage=async request=>{
    contentsMessages.push(request);
    if(request.type==='KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true};
    if(request.type==='GET_KINDLE_CONTENTS_UI_TIMINGS')return {ok:true,records:[]};
    const timing=perf.trace(request.diagnosticLookupId,request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES'?'prepare':request.type==='REPARSE_KINDLE_CONTENTS'?'reparse':'network'),end=timing?.begin('worker_total');
    let value;
    if(request.type==='GET_KINDLE_CONTENTS_REFRESH'){if(delayedState)return delayedState;value={ok:true,...await writer.getKindleContentsRefresh()};}
    else if(request.type==='CHECK_KINDLE_CONTENTS_REFRESH_ITEM')value={ok:true,...await writer.execute('checkKindleContentsRefreshItem',[request.runRef,request.leaseRef,1,request.position],timing)};
    else if(request.type==='FINISH_KINDLE_CONTENTS_REFRESH')value={ok:true,refresh:await writer.execute('finishKindleContentsRefresh',[request.runRef,request.leaseRef,1,request.status],timing)};
    else if(request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES'){const db=await writer.execute('getDatabase',[],timing),selectionEnd=timing?.begin('candidate_selection');value={ok:true,...(request.mode==='rescan'?await writer.execute('beginKindleContentsRefresh',[request.refreshAction??'start',1],timing):kindleContentsPlan(db,request.mode))};selectionEnd?.();}
    else if(request.type==='REPARSE_KINDLE_CONTENTS'){await writer.execute('reparseKindleContents',[request.entries],timing);value={ok:true};}
    else if(request.type==='SAVE_KINDLE_COMIC_CONTENTS'){const result=await writer.execute(request.refresh?'commitKindleContentsRefresh':'saveKindleComicContents',request.refresh?[request.entries,request.refresh.runRef,request.refresh.leaseRef,1]:[request.entries],timing);value={ok:true,...(request.refresh?{refresh:result}:{})};}
    else return {ok:false,error:'Unexpected contents request.'};
    end?.();return timing?{...value,performance:perf.clean(timing.finish())}:value;
  };
  let requests=[],requestStarts=[],captcha=false,hold=false,transientOnce=false,holdAtRequest=0;
  globalThis.fetch=async (input,options)=>{
    if(!String(input).startsWith('https://www.amazon.com/dp/'))return originalFetch(input,options);
    requests.push(String(input));
    requestStarts.push(performance.now());
    if(transientOnce){transientOnce=false;throw Error('Network failure PRIVATE_REQUEST_SECRET');}
    if(hold||requests.length===holdAtRequest)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Paused','AbortError')),{once:true}));
    const description=String(input).endsWith('B000000003')?'An ordinary novel.':String(input).endsWith('B000000002')?'Includes Wool, Shift and Dust.':'Contains Example #1-2.';
    return new Response(captcha?'<input id="captchacharacters">':'<div id="bookDescription_feature_div">'+description+'</div>',{status:200});
  };
  // Reload the actual content script with a deliberately delayed saved queue.
  // Nothing may begin while the read is pending, even a synthetic click.
  const frozen=await writer.beginKindleContentsRefresh('start',1);
  await writer.finishKindleContentsRefresh(frozen.refresh.runRef,frozen.refresh.leaseRef,1,'paused');
  const savedBefore=structuredClone(values.galacticLibraryKindleContentsRefresh);
  let releaseState;delayedState=new Promise(resolve=>{releaseState=resolve;});
  document.querySelector('#galactic-library-kindle-importer').remove();
  history.replaceState({},'','/hz/mycd/');
  await import('../src/providers/kindle-content.js?delayed-checkpoint');kindleShadow=shadows.at(-1);
  const selector=kindleShadow.querySelector('[data-contents-mode]'),start=kindleShadow.querySelector('[data-action="comic-contents"]'),stop=kindleShadow.querySelector('[data-action="pause-comic-contents"]'),status=kindleShadow.querySelector('.status');
  const finished=async()=>{for(let n=0;n<600;n++){if(!status.dataset.busy&&!selector.disabled)return;await pause();}throw new Error('Contents UI did not finish: '+status.textContent);};
  const newRefresh=kindleShadow.querySelector('[data-action="new-refresh"]');
  const resume=kindleShadow.querySelector('[data-action="resume-contents"]');
  const rect=node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100).join(',');};
  let primaryRect=rect(start),restartRect=rect(newRefresh);
  const preparedBefore=contentsMessages.filter(request=>request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES').length;
  assert(start.disabled&&resume.disabled&&newRefresh.disabled&&selector.disabled,'Checkpoint loading exposed actionable contents controls.');
  for(const button of [start,resume,newRefresh])button.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  start.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  delayedState=null;releaseState({ok:true,...await writer.getKindleContentsRefresh()});
  await wait(()=>!selector.disabled);
  resume.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));resume.dispatchEvent(new MouseEvent('click',{bubbles:true}));await pause();
  assert(selector.value==='rescan'&&!resume.hidden&&start.hidden,'Saved unfinished refresh did not default to Resume.');
  assert(rect(resume)===primaryRect&&rect(newRefresh)===restartRect,'Checkpoint loading shifted action slots.');
  assert(contentsMessages.filter(request=>request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES').length===preparedBefore&&!confirmationMessages.length,'A click begun while loading activated a newly enabled action.');
  assert(JSON.stringify(values.galacticLibraryKindleContentsRefresh)===JSON.stringify(savedBefore),'Loading or racing click changed the saved queue.');
  delayedState=new Promise(resolve=>{releaseState=resolve;});selector.dispatchEvent(new Event('change'));
  newRefresh.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  delayedState=null;releaseState({ok:true,...await writer.getKindleContentsRefresh()});await wait(()=>!selector.disabled);
  newRefresh.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));newRefresh.dispatchEvent(new MouseEvent('click',{bubbles:true}));await pause();
  assert(!confirmationMessages.length&&JSON.stringify(values.galacticLibraryKindleContentsRefresh)===JSON.stringify(savedBefore),'A restart gesture begun during loading was not discarded.');
  delayedState=Promise.resolve({ok:false,error:'Synthetic unavailable state'});selector.dispatchEvent(new Event('change'));
  await wait(()=>/could not be loaded/.test(kindleShadow.querySelector('.contents-mode-help').textContent));
  assert(start.disabled&&resume.disabled&&newRefresh.disabled&&selector.disabled,'Failed checkpoint load enabled a refresh action.');
  delayedState=null;selector.dispatchEvent(new Event('change'));await wait(()=>!selector.disabled);
  assert(rect(resume)===primaryRect&&rect(newRefresh)===restartRect,'Reloading state shifted the action slots.');
  newRefresh.click();await wait(()=>confirmationMessages.length===1);
  assert(/completed\/total progress \(0\/4\) will be abandoned/.test(confirmationMessages[0]),'Restart confirmation omitted saved completed/total progress.');
  assert(JSON.stringify(values.galacticLibraryKindleContentsRefresh)===JSON.stringify(savedBefore),'Cancelled restart changed the saved queue.');
  checks.push('Delayed persisted-state loading disables controls, defaults to Resume and rejects clicks begun during resolution');
  checks.push('Restart occupies a separate stable slot and cancelling its progress confirmation preserves the entire queue');
  checks.push('Unavailable checkpoint reads fail closed; primary and restart gestures across delayed reloading cannot begin work');
  kindleShadow.querySelector('[data-galactic-floating-panel-control="minimize"]').click();
  assert(getComputedStyle(kindleShadow.querySelector('.panel')).display==='none','New panel layout broke Minimize.');
  kindleShadow.querySelector('[data-galactic-floating-panel-control="restore"]').click();
  assert(rect(resume)===primaryRect&&rect(newRefresh)===restartRect,'Expand changed the action slots.');
  const setMode=async value=>{selector.value=value;selector.dispatchEvent(new Event('change'));await wait(()=>!selector.disabled);};
  const runRefresh=async()=>{confirmRestart=true;const before=contentsMessages.filter(request=>request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES').length;newRefresh.click();await wait(()=>contentsMessages.filter(request=>request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES').length>before);};
  await setMode('scan');start.click();await finished();db=await writer.getDatabase();
  assert(requests.length===2&&!requests.some(url=>url.endsWith('B000000004')),'Normal scan fetched saved or unavailable pages.');
  assert(providerRecord(db,'kindle','B000000001').metadata.enrichment.kindleProductComicContents.parserVersion===CONTENTS_PARSER_VERSION,'Saved text was not locally reparsed.');
  assert(/1 statements reprocessed locally/.test(status.textContent)&&/1 contents found/.test(status.textContent)&&/1 no contents statement found/.test(status.textContent),'Discovery progress lost local/found/empty counts.');
  assert(providerRecord(db,'kindle','B000000002').metadata.enrichment.kindleProductComicContents.parseOutcome==='full'&&!Object.keys(db.contentReviews).length,'Named proposal disappeared or became verified.');
  checks.push('Kindle contents controls scan prose, locally reparse legacy text and skip unavailable pages');
  assert(!contentsMessages.some(request=>request.diagnosticLookupId),'Disabled diagnostics sent timing requests.');
  kindleShadow.querySelector('[data-contents-diagnostics]').checked=true;
  const workbench=createEnrichmentWorkbench({inspect(){},refresh(){}});document.body.append(workbench.element);workbench.update(db);workbench.element.open=true;await pause();
  const queue=workbench.element.querySelector('[aria-label="Enrichment queue"]');queue.value='unparsed';queue.dispatchEvent(new Event('change'));
  assert(workbench.element.querySelectorAll('li').length===2,'Fully parsed statements are hidden from Contents to review.');
  const record=providerRecord(db,'kindle','B000000002');let savedReview;
  const editor=createContentsEditor(record,null,{save:async(id,value)=>{savedReview=value;await writer.saveContentReview(id,value);},refresh(){}});document.body.append(editor);editor.open=true;await pause();
  const click=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label).click();
  click(editor,'Parse statement for review');assert(editor.querySelectorAll('tbody tr').length===3,'Named works are missing from the editor.');click(editor,'Save reviewed contents');await wait(()=>Boolean(savedReview));
  assert(savedReview.entries.every(entry=>entry.unitType==='component'),'Named suggestions changed their component shape.');
  checks.push('Contents to review lists fully parsed proposals; explicit editor confirmation saves named components');
  await setMode('reparse');const before=requests.length;start.click();await finished();assert(requests.length===before,'Parser-only mode contacted Amazon.');
  checks.push('Kindle parser-only mode makes zero requests');
  captcha=true;await setMode('rescan');await runRefresh();await finished();assert(requests.length===before+1&&/Stopped:.*CAPTCHA/i.test(status.textContent),'CAPTCHA did not stop the queue.');
  db=await writer.getDatabase();assert(providerRecord(db,'kindle','B000000001').metadata.enrichment.kindleProductComicContents.statement==='Collects Example #1-2','Failed refresh erased saved text.');
  captcha=false;await setMode('retry');start.click();await finished();assert(requests.length===before+2,'Retry did not target just the incomplete result.');
  checks.push('Kindle CAPTCHA stops sequential rescan; retry preserves and refreshes the saved statement');
  await writer.mergeProviderItems('kindle',[{providerItemId:'B000000005',title:'Fresh ordinary book',mediaType:'book',metadata:{detailUrl:urls('B000000005'),originType:'Purchase'}}]);
  hold=true;await setMode('rescan');const pausedBefore=requests.length;await runRefresh();await wait(()=>requests.length>pausedBefore);stop.click();await finished();
  assert(/Paused/.test(status.textContent)&&!resume.disabled&&!selector.disabled,'Pause failed to abort or re-enable controls.');
  hold=false;transientOnce=true;await setMode('scan');const resumeBefore=requests.length;start.click();await finished();assert(requests.length===resumeBefore+2&&requests.at(-1).endsWith('B000000005'),'Normal scan did not resume only unfinished eligible books.');
  checks.push('Kindle Pause aborts the current request and normal scan resumes unfinished work');
  kindleShadow.querySelector('[data-export-timing]').click();await wait(()=>!kindleShadow.querySelector('[data-timing-output]').hidden);
  const diagnosticText=kindleShadow.querySelector('[data-timing-output]').value,report=JSON.parse(diagnosticText);
  assert(report.records.some(row=>row.kind==='reparse')&&report.records.some(row=>row.result==='captcha')&&report.records.some(row=>row.result==='paused'),'Diagnostic operation classes missing.');
  const retry=report.records.find(row=>row.attempts===2);assert(retry&&retry.timingMs.retry>=1900&&retry.events.some(event=>event.stage==='writer_queue')&&retry.events.some(event=>event.stage==='storage_write'),'Retry/worker timing is incomplete.');
  assert(retry.events.some(event=>event.stage==='fetch_headers')&&retry.events.some(event=>event.stage==='extraction')&&retry.timingMs.throttle>=0,'Page timing is incomplete.');
  for(const secret of ['B000000','amazon.com','Ordinary novel','PRIVATE_REQUEST_SECRET','Collects Example','Wool Omnibus'])assert(!diagnosticText.includes(secret),'Diagnostic output leaked '+secret);
  assert(report.records.length<=50&&report.aggregates.retry.stagesMs.total.count===1,'Diagnostic history or retry aggregation changed.');
  checks.push('Kindle opt-in diagnostics join page/worker timing, separate retries/reparse and export no personal data');
  await writer.mergeProviderItems('kindle',[
    {providerItemId:'B000000006',title:'Pause buffer first',mediaType:'book',metadata:{detailUrl:urls('B000000006'),originType:'Purchase'}},
    {providerItemId:'B000000007',title:'Pause buffer second',mediaType:'book',metadata:{detailUrl:urls('B000000007'),originType:'Purchase'}}
  ]);
  holdAtRequest=requests.length+2;await setMode('scan');start.click();await wait(()=>requests.length===holdAtRequest);
  assert(!providerRecord(values.galacticLibraryDatabase,'kindle','B000000006').metadata.enrichment?.kindleProductComicContents,'A buffered result wrote the database immediately.');
  stop.click();await finished();db=await writer.getDatabase();
  assert(providerRecord(db,'kindle','B000000006').metadata.enrichment.kindleProductComicContents.statement&&!providerRecord(db,'kindle','B000000007').metadata.enrichment?.kindleProductComicContents,'Pause did not flush only completed results.');
  holdAtRequest=0;const resumedAt=requests.length;start.click();await finished();assert(requests.length===resumedAt+1&&requests.at(-1).endsWith('B000000007'),'Pause/resume repeated an acknowledged buffered result.');
  checks.push('actual Kindle Pause flushes buffered completed results and resume checks only the interrupted page');

  // Exercise the actual refresh controls and frozen position, not just the
  // writer API. Keep the synthetic queue tiny and all product fetches mocked.
  const refreshDb=await writer.getDatabase();refreshDb.providerItems=Object.fromEntries(Object.entries(refreshDb.providerItems).filter(([,record])=>record.provider==='kindle'&&['B000000001','B000000002','B000000003'].includes(record.providerItemId)));refreshDb.canonicalItems={};await writer.restoreDatabase(refreshDb);
  // The editor fixtures above change document scrollbars; compare transitions
  // in the current viewport, not coordinates from before those unrelated UIs.
  primaryRect=rect(start);restartRect=rect(newRefresh);
  await setMode('rescan');
  assert(/\(3\)/.test(kindleShadow.querySelector('.contents-mode-help').textContent),'Refresh eligibility count missing.');
  const refreshStart=requests.length;holdAtRequest=refreshStart+2;await runRefresh();
  assert(rect(stop)===primaryRect&&rect(newRefresh)===restartRect,`Running Pause/restart slots moved: ${rect(stop)} vs ${primaryRect}; ${rect(newRefresh)} vs ${restartRect}`);
  status.textContent+=' '+('Long changing progress text. '.repeat(80));
  kindleShadow.querySelector('[data-timing-output]').hidden=false;
  assert(rect(stop)===primaryRect&&rect(newRefresh)===restartRect,'Async status or diagnostics shifted actions.');await wait(()=>requests.length===holdAtRequest);stop.click();await finished();
  const checkpoint=(await writer.getKindleContentsRefresh()).checkpoint;
  assert(checkpoint.status==='paused'&&checkpoint.cursor===1&&checkpoint.total===3,'Refresh Pause lost fixed denominator or acknowledged position.');
  await wait(()=>!resume.hidden&&!resume.disabled);assert(rect(resume)===primaryRect&&rect(newRefresh)===restartRect,'Paused Resume moved from the Pause slot.');
  const pausedQueue=structuredClone(values.galacticLibraryKindleContentsRefresh),confirmBefore=confirmationMessages.length;
  confirmRestart=false;newRefresh.click();await wait(()=>confirmationMessages.length>confirmBefore);
  assert(/completed\/total progress \(1\/3\) will be abandoned/.test(confirmationMessages.at(-1)),'Restart did not describe the current acknowledged progress.');
  assert(JSON.stringify(values.galacticLibraryKindleContentsRefresh)===JSON.stringify(pausedQueue),'Cancelling restart lost completed work.');
  holdAtRequest=0;const resumeStart=requests.length;resume.click();await finished();
  assert(requests.length===resumeStart+2&&!requests.slice(resumeStart).includes(requests[refreshStart]),'Refresh Resume repeated acknowledged item.');
  assert((await writer.getKindleContentsRefresh()).checkpoint.status==='completed'&&/3\/3/.test(status.textContent),'Refresh completion lost frozen progress.');
  checks.push('Refresh all includes prior successes, exposes count and resumes actual frozen queue after Pause');
  checks.push('Pause and Resume share fixed geometry through long status changes; cancelled restart preserves acknowledged progress');
  kindleShadow.querySelector('[data-export-timing]').click();await wait(()=>kindleShadow.querySelector('[data-timing-output]').value!==diagnosticText);
  const refreshTiming=JSON.parse(kindleShadow.querySelector('[data-timing-output]').value),resumedRows=refreshTiming.records.filter(row=>row.kind==='network'&&row.events.some(event=>event.stage==='refresh_check_message')&&row.attempts===1).slice(-2);
  assert(resumedRows.length===2,'Resumed refresh timings missing.');
  assert(resumedRows.some(row=>row.events.some(event=>event.stage==='refresh_projection_hit')),'Actual resumed queue did not reuse bounded eligibility answers.');
  for(const row of resumedRows){
    const check=row.events.find(event=>event.stage==='refresh_check_message'),fetch=row.events.find(event=>event.stage==='fetch_headers');
    assert(check.startMs<=fetch.startMs&&row.events.some(event=>event.stage==='refresh_identity_validation'),'Preflight was charged to another item.');
    assert(row.timingMs.throttle>=0&&!row.events.some(event=>event.stage==='read_validation'&&event.startMs<fetch.startMs),'Refresh pacing or cheap preflight regressed.');
  }
  assert(refreshTiming.records.some(row=>row.kind==='checkpoint'&&row.events.some(event=>event.stage==='refresh_checkpoint_read')),'Final queue housekeeping missing from separate timing.');
  checks.push('Refresh timings attach fresh identity checks to each fetched item and retain one-second pacing and final checkpoint costs');
  hold=true;const abortStart=requests.length;await runRefresh();await wait(()=>requests.length>abortStart);kindleShadow.querySelector('[data-action="stop-contents"]').click();await finished();hold=false;
  assert((await writer.getKindleContentsRefresh()).checkpoint.status==='aborted'&&resume.hidden,'Stop refresh left a resumable queue.');
  checks.push('Stop refresh aborts the actual request and retains evidence while abandoning the queue');
  assert(requestStarts.slice(1).every((start,index)=>start-requestStarts[index]>=1000),'Contents requests started more frequently than once per second.');
  checks.push('Actual contents controls keep every request start at least 1000 ms apart across retries, CAPTCHA, Pause/Resume and checkpoints');


  const {checkProductDetailsCapture}=await import('./kindle-product-details-fixture.js');
checks.push(...checkProductDetailsCapture(html=>new DOMParser().parseFromString(html,'text/html')));
const {checkKindleCategoryCapture}=await import('./kindle-category-fixture.js');
  checks.push(...checkKindleCategoryCapture(html=>new DOMParser().parseFromString(html,'text/html')));
  const {checkKindleSourceCapture}=await import('./kindle-source-capture-fixture.js');
  const captureFixtures=await (await originalFetch('/tests/fixtures/kindle/kindle-source-capture.json')).json();
  checks.push(...await checkKindleSourceCapture(captureFixtures,html=>new DOMParser().parseFromString(html,'text/html')));
  const {checkIndependentEvidence}=await import('./kindle-independent-evidence-fixture.js');
  checks.push(...await checkIndependentEvidence(await (await originalFetch('/tests/fixtures/kindle/kindle-independent-evidence.json')).json(),{ui:true}));
  const {checkWholeManifest}=await import('./kindle-whole-manifest-fixture.js');
  checks.push(...await checkWholeManifest(await (await originalFetch('/tests/fixtures/kindle/kindle-whole-manifest.json')).json(),{ui:true}));
  globalThis.fetch=originalFetch;
  await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack||error.message})});}
