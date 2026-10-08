import {createEnrichmentWorkbench} from '../src/ui/enrichment-workbench.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {createContentsWorkspace} from '../src/ui/contents-workspace.js';
const snapshot=items=>completeProviderSnapshot('kindle',items,['books','personal-documents'].map(id=>{const n=id==='books'?items.length:0;return {...completedScope(id,n,n,'reported-count'),duplicateCount:0};}));
const checks=[],assert=(value,message)=>{if(!value)throw Error(message);};
const delay=()=>new Promise(resolve=>setTimeout(resolve,20));
async function wait(predicate,message){for(let n=0;n<300;n++){if(predicate())return;await delay();}throw Error(message);}
const button=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent===label);
const navigate=name=>document.querySelector(`#workspace-navigation [data-workspace="${name}"]`).click();
const list=()=>document.querySelector('#contents-collection-list');
const detail=()=>document.querySelector('#contents-book-review');
const search=()=>document.querySelector('[aria-label="Search contents collections"]');
const status=()=>document.querySelector('[aria-label="Contents status"]');
const change=(node,value,event='change')=>{node.value=value;node.dispatchEvent(new Event(event,{bubbles:true}));};
const state={},listeners=[],operations=[];
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async values=>Object.assign(state,structuredClone(values)),remove:async keys=>{for(const key of keys)delete state[key];}});
globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener(){}},sendMessage:async request=>{
 if(request.type==='GET_KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true,runs:[]};
 if(request.type==='GL_CONTENTS_UI_TIMING')return {ok:true};
 if(request.type!=='LIBRARY_STORAGE_OPERATION')throw Error('No acquisition or remote service is allowed: '+request.type);
 operations.push(request.operation);
 try{return {ok:true,result:await writer[request.operation](...request.args)};}catch(error){return {ok:false,error:error.message};}
}},tabs:{create:async()=>{throw Error('Navigation must not open an acquisition page');}},storage:{onChanged:{addListener:fn=>listeners.push(fn)}}};
async function reconcile(){for(const fn of listeners)fn({[DATABASE_STORAGE_KEY]:{newValue:state[DATABASE_STORAGE_KEY]}},'local');await delay();}
const item=n=>({providerItemId:'B'+String(n).padStart(9,'0'),title:'Collection '+String(n).padStart(3,'0'),mediaType:'book',ownership:'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B'+String(n).padStart(9,'0')}});
try{
 await import('../src/ui/options.js');await wait(()=>!document.querySelector('#empty-library').hidden,'Initial Options load missing');navigate('contents');
 assert(list().textContent===''&&document.querySelector('#contents-collections').textContent.includes('No imported books yet'),'First-run contents confused with a failed scan');checks.push('Contents empty state distinguishes no imported books without acquisition');
 const books=Array.from({length:65},(_,i)=>item(i+1));let db=await writer.replaceProviderItems('kindle',books,{profileLabel:'Personal',fullSyncAt:'2026-10-01'},snapshot(books));
 const a=db.providers.kindle.activeProfileId,record=n=>Object.values(db.providerItems).find(r=>r.profileId===a&&r.providerItemId===item(n).providerItemId);
 const source=(n,statement,availability='statement-found')=>({itemId:record(n).id,recordRef:record(n).recordRef,sourceUrl:record(n).metadata.detailUrl,statement,availability,extractorVersion:5});
 db=await writer.saveKindleComicContents([source(1,'Collects Example (2020) #1-3'),source(2,'Collects Example (2020) #4-6; bonus essays'),source(3,'including Alice, Bob and Charlie'),source(4,'','no-statement'),source(5,'','unavailable'),source(6,'Collects Other (2020) #1-2')]);
 db=await writer.saveKindleComicContents([source(6,'','unavailable')]);
 const sourcesBefore=JSON.stringify(record(1).metadata.enrichment.kindleProductComicContents);
 db=await writer.replaceProviderItems('kindle',[item(1)],{profileLabel:'Family',fullSyncAt:'2026-10-02'},snapshot([item(1)]));
 const b=Object.values(db.providerItems).find(r=>r.profileId!==a),aRef=record(1).recordRef;
 await reconcile();await wait(()=>list().children.length===51,'Contents page not loaded');
 assert(!list().querySelector('textarea')&&!list().querySelector('table'),'List eagerly created editors');button(document.querySelector('#contents-collections'),'Next page').click();assert(list().children.length===15,'Second page missing');button(list().firstElementChild,'Inspect contents').click();button(detail(),'Back to Contents results').click();assert(list().children.length===15&&document.querySelector('#contents-collections').textContent.includes('page 2 of 2'),'Back lost page position');checks.push('Imported collections are paged at 50 with no eager editors');
 change(search(),'Collection 001','input');const searchedCount=list().children.length;assert([...list().children].slice(0,2).some(n=>n.textContent.includes('Personal'))&&[...list().children].slice(0,2).some(n=>n.textContent.includes('Family')),'Same-product accounts collapsed or exact title did not rank first');
 button(list().querySelector(`[data-record-ref="${aRef}"]`),'Inspect contents').click();assert(!detail().hidden&&detail().querySelectorAll('tbody tr').length===3,'Integrated review did not open suggestions');assert(detail().textContent.includes('not confirmed'),'Suggestions looked verified');assert(!detail().querySelector('.contents-source-details').open&&!detail().querySelector('.contents-advanced').open&&!detail().querySelector('.contents-book-information').open,'Technical details exposed by default');
 const info=detail().querySelector('.contents-book-information');info.open=true;info.dispatchEvent(new Event('toggle'));assert(info.textContent.includes('No external book details saved yet')&&info.textContent.includes('Ownership and access'),'Missing enrichment guidance');
 const history=detail().querySelector('.contents-history');assert(!history.querySelector('pre'),'History rendered eagerly');history.open=true;history.dispatchEvent(new Event('toggle'));assert(history.textContent.includes('Current selected source')&&history.textContent.includes('retained source selections'),'Source history missing');
 checks.push('Source, enrichment and technical history use progressive disclosure without losing evidence');
 checks.push('Account-specific contents opens the same lazy editor inside Contents');
 const editor=detail().querySelector('.contents-editor');button(editor,'Parse statement for review').click();for(const node of editor.querySelectorAll('[data-contents-field="language"]'))node.value='en';const beforeSaves=operations.filter(op=>op==='saveContentReview').length;button(editor,'Save verified contents').click();button(editor,'Save verified contents').click();assert(operations.filter(op=>op==='saveContentReview').length===beforeSaves+1,'Double click saved twice');
 await wait(()=>detail().querySelector('.contents-editor')!==editor,'Save did not refresh integrated editor');db=await writer.getDatabase();const aRecord=Object.values(db.providerItems).find(r=>r.recordRef===aRef);
 assert(db.contentReviews[aRecord.id]?.entries.length===3&&!db.contentReviews[b.id],'Review escaped profile scope');assert(JSON.stringify(aRecord.metadata.enrichment.kindleProductComicContents)===sourcesBefore,'Review changed acquired evidence');checks.push('Supported human confirmation persists to the authoritative writer and preserves source/profile isolation');
 button(detail(),'Back to Contents results').click();assert(search().value==='Collection 001'&&list().children.length===searchedCount,'Return lost search position');checks.push('Back to Contents results preserves search and list position');
 button(list().querySelector(`[data-record-ref="${aRef}"]`),'Inspect contents').click();const undoEditor=detail().querySelector('.contents-editor');button(undoEditor,'Undo contents confirmation').click();await wait(()=>detail().querySelector('.contents-editor')!==undoEditor,'Undo did not update');db=await writer.getDatabase();assert(!db.contentReviews[aRecord.id]&&JSON.stringify(db.providerItems[aRecord.id].metadata.enrichment.kindleProductComicContents)===sourcesBefore,'Undo destroyed source');checks.push('Existing confirmation undo retains acquired evidence');button(detail(),'Back to Contents results').click();
 change(search(),'','input');change(status(),'partial');assert(list().children.length===1&&list().textContent.includes('Collection 002'),'Partial state missing');change(status(),'uncertain');assert(list().textContent.includes('Collection 003'),'Ambiguous state missing');change(status(),'failed');assert(list().textContent.includes('Collection 005'),'Unavailable state missing');change(status(),'failure');assert(list().textContent.includes('Collection 006')&&list().textContent.includes('Earlier contents'),'Failed retry concealed retained evidence');change(status(),'missing');assert(list().textContent.includes('Collection 004'),'Empty captured source missing');change(status(),'unattempted');assert(list().children.length===50,'Unattempted state missing');checks.push('Partial, uncertain, failed, empty capture and never-acquired states remain distinct');
 navigate('library');const libraryCard=[...document.querySelectorAll('#library-items > li')].find(node=>JSON.parse(node.dataset.recordRefs||'[]').includes(aRef));assert(libraryCard,'Exact library record missing');const libraryDetails=libraryCard.querySelector('.item-details');libraryDetails.open=true;libraryDetails.dispatchEvent(new Event('toggle'));
 assert(!libraryCard.querySelector('.contents-editor'),'Contents editor was duplicated in Library');libraryCard.querySelector(`[data-contents-record="${aRef}"]`).click();assert(!document.querySelector('#contents-workspace').hidden&&location.hash.includes(aRef),'Library-to-Contents did not retain exact record');
 const libraryLink=[...detail().querySelectorAll('a')].find(a=>a.textContent==='Open this book in Library');libraryLink.click();assert(!document.querySelector('#library-section').hidden&&location.hash.includes(aRef),'Contents-to-Library failed');
 location.hash='#contents?record='+b.recordRef;await wait(()=>!detail().hidden&&detail().querySelector('p')?.textContent.includes('Family')&&!document.querySelector('#contents-workspace').hidden,'Hash deep link did not open account-specific review');
 checks.push('Library/Contents links and reloadable deep links retain exact profile scope and legacy editors');
 const draftEditor=detail().querySelector('.contents-editor');draftEditor.querySelector('textarea').value='A draft to preserve';
 db=await writer.saveContentReview(b.id,{entries:[{series:'Family',run:'2020',unitType:'issue',number:'9',language:'en',completeness:'full'}],statement:'Collects Family #9',source:'manual-review',sourceUrl:''});await reconcile();
 await wait(()=>detail().textContent.includes('Your draft is retained'),'External review did not reconcile safely');assert(draftEditor.querySelector('textarea').value==='A draft to preserve'&&button(draftEditor,'Save verified contents').disabled,'New manual decision could be overwritten');
 button(detail(),'Reload saved contents').click();assert(detail().querySelector('textarea').value==='Collects Family #9','Reload did not restore latest review');checks.push('Reconciliation retains drafts and requires reload before replacing a newer human review');
 button(detail(),'Back to Contents results').click();assert(status().value==='unattempted','Cross-navigation lost Contents filter');
 const huge={canonicalItems:Object.fromEntries(Array.from({length:14081},(_,n)=>['r'+n,{id:'r'+n,title:item(n).title,mediaType:'book',providerItemIds:['r'+n]}])),providerItems:Object.fromEntries(Array.from({length:14081},(_,n)=>['r'+n,{...item(n),id:'r'+n,recordRef:'r'+n,provider:'kindle',profileId:a}]))};const hugeView=createContentsWorkspace();document.body.append(hugeView.element);hugeView.update(huge,true);assert(hugeView.element.querySelectorAll('li').length===50&&!hugeView.element.querySelector('textarea'),'Large library rendered eagerly');hugeView.element.remove();checks.push('14,081-record synthetic view renders only 50 summaries');
 const lazyWorkbench=createEnrichmentWorkbench({});lazyWorkbench.update({...huge,get canonicalItems(){throw Error('Closed workbench reconstructed source projections');}});assert(!lazyWorkbench.element.querySelector('li'),'Closed workbench rendered source suggestions');checks.push('Closed book workbench defers source interpretation during Contents navigation');
 assert(!operations.some(op=>/^(?:begin|commit|saveKindle|reparseKindle)/u.test(op)),'Contents navigation triggered acquisition');checks.push('Navigation and review make no acquisition requests');
 await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks,error:error.stack||error.message})});}
