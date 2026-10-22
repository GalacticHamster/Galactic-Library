import {createEnrichmentWorkbench} from '../src/ui/enrichment-workbench.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
const checks=[],values={},listeners=[],operations=[];
const assert=(ok,message)=>{if(!ok)throw Error(typeof message==='function'?message():message);checks.push(message);};
const wait=async(test,message)=>{for(let n=0;n<400;n++){if(test())return;await new Promise(r=>setTimeout(r,20));}throw Error(typeof message==='function'?message():message);};
const change=(node,value,event='change')=>{node.value=value;node.dispatchEvent(new Event(event,{bubbles:true}));};
const button=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent===label||b.textContent.startsWith(label+' ('));
const click=(root,label)=>{const b=button(root,label);if(!b)throw Error('Missing '+label);b.click();return b;};
const area={get:async defaults=>structuredClone({...defaults,...values}),set:async patch=>Object.assign(values,structuredClone(patch)),remove:async keys=>{for(const key of [keys].flat())delete values[key];}};
let writer=createStorageWriter(area),failRef=null,failBatch=false;
globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener(){}},sendMessage:async message=>{
 if(message.type!=='LIBRARY_STORAGE_OPERATION')return {ok:false};
 operations.push(message.operation);
 try{
  if(message.operation==='confirmContentsSuggestions'){
   if(failBatch){failBatch=false;throw Error('Disposable storage failure');}
   if(failRef){message=structuredClone(message);message.args[0]=message.args[0].map(r=>r.recordRef===failRef?{...r,token:'0'.repeat(64)}:r);failRef=null;}
  }
  return {ok:true,result:await writer.execute(message.operation,message.args)};
 }catch(error){return {ok:false,error:error.message};}
}},storage:{onChanged:{addListener:fn=>listeners.push(fn)}},tabs:{create:async()=>{}}};
try{
 await writer.mergeProviderItems('kindle',Array.from({length:55},(_,n)=>({providerItemId:'queue-'+n,title:n===0?'Batman explicit issues':'Queue book '+String(n).padStart(2,'0'),mediaType:'book',ownership:'owned',metadata:{enrichment:{kindleProductComicContents:{statement:n===0?'Collects Batman (2011) #676-683':'Collects Alpha (2001) #1-3',parseOutcome:'full',parserVersion:15}}}})));
 await writer.mergeProviderItems('kindle',[{providerItemId:'vague',title:'Batman and Robin (2009-2011) Vol. 1: Batman Reborn',mediaType:'book',ownership:'owned',metadata:{enrichment:{kindleProductComicContents:{statement:'Collecting the first six issues of the hit series!',parseOutcome:'failed',parserVersion:15}}}}]);
 let db=await writer.getDatabase();
 // Provider merges intentionally do not accept captured enrichments. Populate a
 // disposable backup snapshot, not an importer or a personal extension profile.
 for(const record of Object.values(db.providerItems)){const n=record.providerItemId==='vague'?-1:Number(record.providerItemId.slice(6));(record.metadata.enrichment??={}).kindleProductComicContents={statement:n<0?'Collecting the first six issues of the hit series!':n===0?'Collects Batman (2011) #676-683':'Collects Alpha (2001) #1-3',parseOutcome:n<0?'failed':'full',parserVersion:15};}
 await writer.restoreDatabase(db);db=await writer.getDatabase();const historyBook=db.providerItems['kindle:queue-54'];
 await writer.saveGoogleBooksEnrichments([{itemIds:[historyBook.id],recordRefs:[historyBook.recordRef],enrichment:{source:'google-books',volumeId:'source-history-example',title:historyBook.title,authors:['Writer'],approved:true,matchBasis:'user-selected-edition'}}]);
 const originals=structuredClone((await writer.getDatabase()).providerItems);
 location.hash='#books';await import('../src/ui/options.js');
 const root=()=>document.querySelector('#enrichment-workbench'),rows=()=>[...root().querySelectorAll('.review-items > li')],selected=()=>root().querySelectorAll('[aria-label="Select contents suggestion"]:checked');
 await wait(()=>root()?.open&&rows().length===50,()=> 'Default ready lists did not load: '+JSON.stringify({open:root()?.open,rows:rows().length,task:root()?.querySelector('[aria-label="Review task"]')?.value,text:root()?.textContent.slice(0,1600),status:document.querySelector('#status')?.textContent}));
 const task=root().querySelector('[aria-label="Review task"]'),category=root().querySelector('[aria-label="Enrichment queue"]'),search=root().querySelector('[aria-label="Filter enrichment titles"]');
 assert(task.value==='ready'&&category.value==='contents-suggestions','Actual Options opens directly on ready issue lists');
 assert(rows()[0].querySelector('.contents-queue-issues').textContent.includes('676')&&rows()[0].querySelector('[aria-label="Select contents suggestion"]'),'Explicit Batman issue list and individual checkbox are visible on its queue card');
 assert(root().textContent.includes('55 book lists ready to confirm')&&!root().textContent.includes('0 suggestions needing a decision'),'Ready book lists have their own consistent total');
 click(root(),'Next page');assert(rows().length===5,'Queue pagination reaches all 55 ready books');click(root(),'Previous page');
 click(root(),'Select all on page');assert(selected().length===50&&button(root(),'Confirm selected').textContent.includes('50'),'Select all includes only the current page');
 click(root(),'Next page');assert(selected().length===0&&button(root(),'Confirm selected').textContent.includes('50'),'Selection persists across pages without silently selecting unseen records');click(root(),'Clear contents selection');click(root(),'Previous page');
 const check=rows()[0].querySelector('[aria-label="Select contents suggestion"]');check.checked=true;check.dispatchEvent(new Event('change'));click(root(),'Confirm selected');
 await wait(()=>document.querySelector('.contents-confirmation-dialog[open]'),'Confirmation summary did not open');let dialog=document.querySelector('.contents-confirmation-dialog');
 assert(dialog.textContent.includes('1 book records / 8 issue entries')&&Object.keys((await writer.getDatabase()).contentReviews).length===0,'Book/issue confirmation summary is explicit and writes nothing before approval');
 click(dialog,'Cancel');assert(!document.querySelector('.contents-confirmation-dialog'),'Cancel closes confirmation without saving');
 click(root(),'Confirm selected');await wait(()=>document.querySelector('.contents-confirmation-dialog[open]'),'Confirmation did not reopen');dialog=document.querySelector('.contents-confirmation-dialog');const start=operations.filter(op=>op==='confirmContentsSuggestions').length,save=click(dialog,'Confirm these lists');save.click();
 await wait(()=>root().textContent.includes('1 book lists confirmed / 0 failed.'),'Single confirmation failed');
 assert(operations.filter(op=>op==='confirmContentsSuggestions').length===start+1&&(await writer.getDatabase()).contentReviews['kindle:queue-0'].entries.length===8,'Double click submits one validated save and confirms all eight explicit Batman issues');
 assert(!rows().some(row=>row.querySelector('strong')?.textContent==='Batman explicit issues'),'Successfully confirmed book leaves Ready immediately');
 change(search,'Queue book 0','input');assert(rows().length===9,'Title search scopes the ready page');click(root(),'Select all on page');click(root(),'Confirm selected');await wait(()=>document.querySelector('.contents-confirmation-dialog[open]'),'Bulk summary missing');dialog=document.querySelector('.contents-confirmation-dialog');
 assert(dialog.textContent.includes('9 book records / 27 issue entries'),'Bulk summary distinguishes nine books from 27 issue entries');failRef=(await writer.getDatabase()).providerItems['kindle:queue-1'].recordRef;click(dialog,'Confirm these lists');
 await wait(()=>root().textContent.includes('8 book lists confirmed / 1 failed.'),'Partial failure was not accurately reported');
 assert(rows().length===1&&selected().length===1,'Successful lists disappear while the failed list remains selected for retry');
 click(root(),'Confirm selected');await wait(()=>document.querySelector('.contents-confirmation-dialog[open]'),'Retry summary missing');dialog=document.querySelector('.contents-confirmation-dialog');failBatch=true;click(dialog,'Confirm these lists');await wait(()=>dialog.textContent.includes('Disposable storage failure'),'Storage failure missing');
 assert(!button(dialog,'Confirm these lists').disabled&&!(await writer.getDatabase()).contentReviews['kindle:queue-1'],'Failed write is retryable and does not claim or save a confirmation');
 click(dialog,'Confirm these lists');await wait(()=>root().textContent.includes('1 book lists confirmed / 0 failed.'),'Retry did not save');assert(rows().length===0,'Retry removes only the remaining successful list');
 change(search,'','input');change(task,'information');assert(category.value==='contents-information'&&rows().length===1,'Needs more information separates the vague Batman description from ready lists');
 click(rows()[0],'Review details');await wait(()=>document.querySelector('#contents-book-review .contents-review-evidence'),'Review details did not navigate to existing contents editor');
 assert(document.querySelector('#contents-book-review .contents-review-evidence').textContent.includes('first six issues'),'Vague Batman opens the existing captured-description and manual draft workflow');click(document.querySelector('#contents-book-review'),'Back to book information');
 assert(task.value==='information'&&category.value==='contents-information','Return preserves task and subfilter');
 for(const [value,expected] of [['ready',2],['information',4],['conflicts',2],['history',2]]){change(task,value);assert([...category.options].filter(o=>!o.hidden).length===expected,value+' exposes only its task-specific categories');}
 assert(category.value==='undo'&&rows().length===1,'Source choices live under Review history / Undo');
 const history=rows()[0];assert(history.textContent.includes('Google Books')&&history.textContent.includes('no preceding source')&&!history.textContent.includes('user-selected-edition')&&!history.querySelector('pre'),'Source undo describes its real consequence and keeps raw evidence collapsed');
 const sourceCheck=history.querySelector('[aria-label="Select enrichment review"]');sourceCheck.checked=true;sourceCheck.dispatchEvent(new Event('change'));const reviewsBefore=structuredClone((await writer.getDatabase()).contentReviews);click(root(),'Undo selected source choices');
 await wait(()=>!rows().length,'Source undo did not refresh history');db=await writer.getDatabase();assert(JSON.stringify(db.contentReviews)===JSON.stringify(reviewsBefore)&&db.providerItems[historyBook.id].ownership==='owned'&&!db.providerItems[historyBook.id].metadata.enrichment.googleBooks,'Existing source undo preserves purchases and all confirmed contents');
 change(category,'review-history');assert(rows().length===10,'Completed contents decisions remain accessible in history');click(rows()[0],'Undo contents review');await wait(()=>rows().length===9,'Contents history undo did not update');
 db=await writer.getDatabase();assert(Object.keys(db.providerItems).length===56&&Object.entries(db.providerItems).every(([id,r])=>r.ownership===originals[id].ownership&&r.metadata.enrichment.kindleProductComicContents.statement===originals[id].metadata.enrichment.kindleProductComicContents.statement),'All provider records, ownership and captured statements survive confirmation, retry and undo');
 const isolated=createEnrichmentWorkbench({confirmContents:()=>{throw Error('Obsolete preview must not save');}});document.body.append(isolated.element);isolated.update(db);isolated.showCategory('contents-suggestions');const c=isolated.element.querySelector('[aria-label="Select contents suggestion"]');c.checked=true;c.dispatchEvent(new Event('change'));click(isolated.element,'Confirm selected');isolated.update(structuredClone(db));await wait(()=>!button(isolated.element,'Confirm selected').disabled,'Obsolete preparation did not settle');assert(!document.querySelector('.contents-confirmation-dialog')&&isolated.element.querySelector('[role="status"]').textContent.includes('closed'),'A library update during preview preparation cannot open an obsolete confirmation or leave unexplained processing');isolated.element.remove();
 await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
