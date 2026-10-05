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
const checks=[]; const values={}; const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
const shadows=[]; const attach=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(options){const root=attach.call(this,options);shadows.push(root);return root;};
const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
const assert=(value,message)=>{if(!value)throw new Error(message);};
const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await pause();}throw new Error('Importer did not finish.');};
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
        assert(button,`${provider} missing ${mode} button`);shadow.querySelector('[data-profile-label]').value='fixture';shadow.querySelector('[data-profile-confirm]').checked=true;button.click();
      }
      const shadow=shadows.at(-1);
      await wait(()=>!shadow.querySelector('.status').dataset.busy&&(imported>before||/failed:/iu.test(shadow.querySelector('.status').textContent)));
      assert(!/failed:/iu.test(shadow.querySelector('.status').textContent),shadow.querySelector('.status').textContent);
      checks.push(`${provider} ${mode} controls work with direct storage denied`);
      if(provider==='fandango-at-home')document.querySelector('#galactic-library-fandango-at-home-importer').remove();
    }
    if(provider==='gog'){
      globalThis.GalacticGog.fetchGogGames=async()=>{throw new Error('Network failure on page 7: PRIVATE_TOKEN');};const shadow=shadows.at(-1);shadow.querySelector('button[data-mode="full"]').click();
      await wait(()=>values.galacticLibraryDatabase.providers.gog.syncHealth.status==='failed');assert(values.galacticLibraryDatabase.providers.gog.syncHealth.failedPages[0]===7&&!JSON.stringify(values).includes('PRIVATE_TOKEN'),'Failure report lost its page or leaked raw errors.');assert(values.galacticLibraryDatabase.providerItems['gog:fixture-123'],'Failed scan destroyed prior records.');checks.push('actual GOG failure reports safe dashboard diagnostics and preserves the prior snapshot');
    }
  }
  // Contents controls and DOM extraction use fixture pages, never Amazon.
  const kindleShadow=shadows.find(root=>root.querySelector('[data-contents-mode]'));
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
    {itemId:'kindle:B000000001',recordRef:db.providerItems['kindle:B000000001'].recordRef,sourceUrl:urls('B000000001'),statement:'Collects Example #1?2',availability:'statement-found'},
    {itemId:'kindle:B000000004',recordRef:db.providerItems['kindle:B000000004'].recordRef,sourceUrl:urls('B000000004'),statement:'',availability:'unavailable',extractorVersion:2}
  ]);
  // Simulate a backup predating extractor/parser versions.
  db=await writer.getDatabase();const legacy=db.providerItems['kindle:B000000001'].metadata.enrichment.kindleProductComicContents;delete legacy.extractorVersion;delete legacy.parserVersion;delete legacy.parseOutcome;await writer.restoreDatabase(db);
  // The production adapter enforces Amazon origin; this localhost fixture uses
  // its real DOM extractor behind a fixture-only product fetch implementation.
  globalThis.GalacticKindle.fetchKindleProductComicContents=async (url,{signal,timing}={})=>{
    const headers=timing?.begin('fetch_headers',timing.attempts);let response;try{response=await fetch(url,{signal});}finally{headers?.();}
    const bodyEnd=timing?.begin('response_body',timing.attempts);const body=await response.text();bodyEnd?.();
    const domEnd=timing?.begin('dom_parse',timing.attempts);const document=new DOMParser().parseFromString(body,'text/html');domEnd?.();
    if(document.querySelector('#captchacharacters'))throw new Error('Amazon requested a CAPTCHA; wait before continuing.');
    const extractEnd=timing?.begin('extraction',timing.attempts);const statement=globalThis.GalacticKindle.kindleContentsStatementFromDocument(document);extractEnd?.();
    return {sourceUrl:url,statement,descriptionBlocks:globalThis.GalacticKindle.kindleDescriptionBlocks(document),availability:statement?'statement-found':'no-statement',extractorVersion:globalThis.GalacticKindle.contentsExtractorVersion};
  };
  const contentsMessages=[];
  const perf=globalThis.GalacticContentsPerformance;
  globalThis.chrome.runtime.sendMessage=async request=>{
    contentsMessages.push(request);
    if(request.type==='KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true};
    if(request.type==='GET_KINDLE_CONTENTS_UI_TIMINGS')return {ok:true,records:[]};
    const timing=perf.trace(request.diagnosticLookupId,request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES'?'prepare':request.type==='REPARSE_KINDLE_CONTENTS'?'reparse':'network'),end=timing?.begin('worker_total');
    let value;
    if(request.type==='GET_KINDLE_COMIC_CONTENT_CANDIDATES'){const db=await writer.execute('getDatabase',[],timing),selectionEnd=timing?.begin('candidate_selection');value={ok:true,...kindleContentsPlan(db,request.mode)};selectionEnd?.();}
    else if(request.type==='REPARSE_KINDLE_CONTENTS'){await writer.execute('reparseKindleContents',[request.entries],timing);value={ok:true};}
    else if(request.type==='SAVE_KINDLE_COMIC_CONTENTS'){await writer.execute('saveKindleComicContents',[request.entries],timing);value={ok:true};}
    else return {ok:false,error:'Unexpected contents request.'};
    end?.();return timing?{...value,performance:perf.clean(timing.finish())}:value;
  };
  let requests=[],captcha=false,hold=false,transientOnce=false,holdAtRequest=0;
  globalThis.fetch=async (input,options)=>{
    if(!String(input).startsWith('https://www.amazon.com/dp/'))return originalFetch(input,options);
    requests.push(String(input));
    if(transientOnce){transientOnce=false;throw Error('Network failure PRIVATE_REQUEST_SECRET');}
    if(hold||requests.length===holdAtRequest)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Paused','AbortError')),{once:true}));
    const description=String(input).endsWith('B000000003')?'An ordinary novel.':String(input).endsWith('B000000002')?'Includes Wool, Shift and Dust.':'Contains Example #1?2.';
    return new Response(captcha?'<input id="captchacharacters">':'<div id="bookDescription_feature_div">'+description+'</div>',{status:200});
  };
  const selector=kindleShadow.querySelector('[data-contents-mode]'),start=kindleShadow.querySelector('[data-action="comic-contents"]'),stop=kindleShadow.querySelector('[data-action="pause-comic-contents"]'),status=kindleShadow.querySelector('.status');
  const finished=async()=>{for(let n=0;n<600;n++){if(!status.dataset.busy)return;await pause();}throw new Error('Contents UI did not finish: '+status.textContent);};
  selector.value='scan';start.click();await finished();db=await writer.getDatabase();
  assert(requests.length===2&&!requests.some(url=>url.endsWith('B000000004')),'Normal scan fetched saved or unavailable pages.');
  assert(db.providerItems['kindle:B000000001'].metadata.enrichment.kindleProductComicContents.parserVersion===CONTENTS_PARSER_VERSION,'Saved text was not locally reparsed.');
  assert(/1 statements reprocessed locally/.test(status.textContent)&&/1 contents found/.test(status.textContent)&&/1 no contents found/.test(status.textContent),'Discovery progress lost local/found/empty counts.');
  assert(db.providerItems['kindle:B000000002'].metadata.enrichment.kindleProductComicContents.parseOutcome==='full'&&!Object.keys(db.contentReviews).length,'Named proposal disappeared or became verified.');
  checks.push('Kindle contents controls scan prose, locally reparse legacy text and skip unavailable pages');
  assert(!contentsMessages.some(request=>request.diagnosticLookupId),'Disabled diagnostics sent timing requests.');
  kindleShadow.querySelector('[data-contents-diagnostics]').checked=true;
  const workbench=createEnrichmentWorkbench({inspect(){},refresh(){}});document.body.append(workbench.element);workbench.update(db);workbench.element.open=true;await pause();
  const queue=workbench.element.querySelector('[aria-label="Enrichment queue"]');queue.value='unparsed';queue.dispatchEvent(new Event('change'));
  assert(workbench.element.querySelectorAll('li').length===2,'Fully parsed statements are hidden from Contents to review.');
  const record=db.providerItems['kindle:B000000002'];let savedReview;
  const editor=createContentsEditor(record,null,{save:async(id,value)=>{savedReview=value;await writer.saveContentReview(id,value);},refresh(){}});document.body.append(editor);editor.open=true;await pause();
  const click=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label).click();
  click(editor,'Parse statement for review');assert(editor.querySelectorAll('tbody tr').length===3,'Named works are missing from the editor.');click(editor,'Save verified contents');await wait(()=>Boolean(savedReview));
  assert(savedReview.entries.every(entry=>entry.unitType==='component'),'Named suggestions changed their component shape.');
  checks.push('Contents to review lists fully parsed proposals; explicit editor confirmation saves named components');
  selector.value='reparse';const before=requests.length;start.click();await finished();assert(requests.length===before,'Parser-only mode contacted Amazon.');
  checks.push('Kindle parser-only mode makes zero requests');
  captcha=true;selector.value='rescan';start.click();await finished();assert(requests.length===before+1&&/Stopped:.*CAPTCHA/i.test(status.textContent),'CAPTCHA did not stop the queue.');
  db=await writer.getDatabase();assert(db.providerItems['kindle:B000000001'].metadata.enrichment.kindleProductComicContents.statement==='Collects Example #1?2','Failed refresh erased saved text.');
  captcha=false;selector.value='retry';start.click();await finished();assert(requests.length===before+2,'Retry did not target just the incomplete result.');
  checks.push('Kindle CAPTCHA stops sequential rescan; retry preserves and refreshes the saved statement');
  await writer.mergeProviderItems('kindle',[{providerItemId:'B000000005',title:'Fresh ordinary book',mediaType:'book',metadata:{detailUrl:urls('B000000005'),originType:'Purchase'}}]);
  hold=true;selector.value='rescan';const pausedBefore=requests.length;start.click();await wait(()=>requests.length>pausedBefore);stop.click();await finished();
  assert(/Paused/.test(status.textContent)&&!start.disabled&&!selector.disabled,'Pause failed to abort or re-enable controls.');
  hold=false;transientOnce=true;selector.value='scan';const resumeBefore=requests.length;start.click();await finished();assert(requests.length===resumeBefore+2&&requests.at(-1).endsWith('B000000005'),'Normal scan did not resume only unfinished eligible books.');
  checks.push('Kindle Pause aborts the current request and normal scan resumes unfinished work');
  kindleShadow.querySelector('[data-export-timing]').click();await wait(()=>!kindleShadow.querySelector('[data-timing-output]').hidden);
  const diagnosticText=kindleShadow.querySelector('[data-timing-output]').value,report=JSON.parse(diagnosticText);
  assert(report.records.some(row=>row.kind==='reparse')&&report.records.some(row=>row.result==='captcha')&&report.records.some(row=>row.result==='paused'),'Diagnostic operation classes missing.');
  const retry=report.records.find(row=>row.attempts===2);assert(retry&&retry.timingMs.retry>=1900&&retry.events.some(event=>event.stage==='writer_queue')&&retry.events.some(event=>event.stage==='storage_write'),'Retry/worker timing is incomplete.');
  assert(retry.events.some(event=>event.stage==='fetch_headers')&&retry.events.some(event=>event.stage==='extraction')&&retry.timingMs.throttle>=900,'Page timing is incomplete.');
  for(const secret of ['B000000','amazon.com','Ordinary novel','PRIVATE_REQUEST_SECRET','Collects Example','Wool Omnibus'])assert(!diagnosticText.includes(secret),'Diagnostic output leaked '+secret);
  assert(report.records.length<=50&&report.aggregates.retry.stagesMs.total.count===1,'Diagnostic history or retry aggregation changed.');
  checks.push('Kindle opt-in diagnostics join page/worker timing, separate retries/reparse and export no personal data');
  await writer.mergeProviderItems('kindle',[
    {providerItemId:'B000000006',title:'Pause buffer first',mediaType:'book',metadata:{detailUrl:urls('B000000006'),originType:'Purchase'}},
    {providerItemId:'B000000007',title:'Pause buffer second',mediaType:'book',metadata:{detailUrl:urls('B000000007'),originType:'Purchase'}}
  ]);
  holdAtRequest=requests.length+2;selector.value='scan';start.click();await wait(()=>requests.length===holdAtRequest);
  assert(!values.galacticLibraryDatabase.providerItems['kindle:B000000006'].metadata.enrichment?.kindleProductComicContents,'A buffered result wrote the database immediately.');
  stop.click();await finished();db=await writer.getDatabase();
  assert(db.providerItems['kindle:B000000006'].metadata.enrichment.kindleProductComicContents.statement&&!db.providerItems['kindle:B000000007'].metadata.enrichment?.kindleProductComicContents,'Pause did not flush only completed results.');
  holdAtRequest=0;const resumedAt=requests.length;start.click();await finished();assert(requests.length===resumedAt+1&&requests.at(-1).endsWith('B000000007'),'Pause/resume repeated an acknowledged buffered result.');
  checks.push('actual Kindle Pause flushes buffered completed results and resume checks only the interrupted page');


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
