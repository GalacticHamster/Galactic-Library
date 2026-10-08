import {createStorageWriter} from '../src/background/storage-writer.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {createContentsWorkspace} from '../src/ui/contents-workspace.js';
const snapshot=items=>completeProviderSnapshot('kindle',items,['books','personal-documents'].map(id=>{const n=id==='books'?items.length:0;return {...completedScope(id,n,n,'reported-count'),duplicateCount:0};}));
const checks=[],assert=(value,message)=>{if(!value)throw Error(message);};
const delay=()=>new Promise(resolve=>setTimeout(resolve,20));
async function wait(predicate,message){for(let n=0;n<100;n++){if(predicate())return;await delay();}throw Error(message);}
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
 db=await writer.saveKindleComicContents([source(1,'Collects Example (2020) #1-3'),source(2,'Collects Example (2020) #4-6; bonus essays'),source(3,'including Alice, Bob and Charlie'),source(4,'','no-statement'),source(5,'','unavailable')]);
 const sourcesBefore=JSON.stringify(record(1).metadata.enrichment.kindleProductComicContents);
 db=await writer.replaceProviderItems('kindle',[item(1)],{profileLabel:'Family',fullSyncAt:'2026-10-02'},snapshot([item(1)]));
 const b=Object.values(db.providerItems).find(r=>r.profileId!==a),aRef=record(1).recordRef;
 await reconcile();await wait(()=>list().children.length===50,'Contents page not loaded');
 assert(!list().querySelector('textarea')&&!list().querySelector('table'),'List eagerly created editors');button(document.querySelector('#contents-collections'),'Next page').click();assert(list().children.length===16,'Second page missing');checks.push('Imported collections are paged at 50 with no eager editors');
 change(search(),'Collection 001','input');assert(list().children.length===2&&list().textContent.includes('Personal')&&list().textContent.includes('Family'),'Same-product accounts collapsed');
 button(list().querySelector(`[data-record-ref="${aRef}"]`),'Inspect contents').click();assert(!detail().hidden&&detail().querySelectorAll('tbody tr').length===3,'Integrated review did not open suggestions');assert(detail().textContent.includes('not confirmed'),'Suggestions looked verified');checks.push('Account-specific contents opens the same lazy editor inside Contents');
 const editor=detail().querySelector('.contents-editor');button(editor,'Parse statement for review').click();for(const node of editor.querySelectorAll('[data-contents-field="language"]'))node.value='en';button(editor,'Save verified contents').click();
 await wait(()=>detail().querySelector('.contents-editor')!==editor,'Save did not refresh integrated editor');db=await writer.getDatabase();const aRecord=Object.values(db.providerItems).find(r=>r.recordRef===aRef);
 assert(db.contentReviews[aRecord.id]?.entries.length===3&&!db.contentReviews[b.id],'Review escaped profile scope');assert(JSON.stringify(aRecord.metadata.enrichment.kindleProductComicContents)===sourcesBefore,'Review changed acquired evidence');checks.push('Supported human confirmation persists to the authoritative writer and preserves source/profile isolation');
 button(detail(),'Back to collections').click();assert(search().value==='Collection 001'&&list().children.length===2,'Return lost search position');checks.push('Back to collections preserves search and list position');
 button(list().querySelector(`[data-record-ref="${aRef}"]`),'Inspect contents').click();const undoEditor=detail().querySelector('.contents-editor');button(undoEditor,'Undo contents confirmation').click();await wait(()=>detail().querySelector('.contents-editor')!==undoEditor,'Undo did not update');db=await writer.getDatabase();assert(!db.contentReviews[aRecord.id]&&JSON.stringify(db.providerItems[aRecord.id].metadata.enrichment.kindleProductComicContents)===sourcesBefore,'Undo destroyed source');checks.push('Existing confirmation undo retains acquired evidence');button(detail(),'Back to collections').click();
 change(search(),'','input');change(status(),'partial');assert(list().children.length===1&&list().textContent.includes('Collection 002'),'Partial state missing');change(status(),'uncertain');assert(list().textContent.includes('Collection 003'),'Ambiguous state missing');change(status(),'failed');assert(list().textContent.includes('Collection 005'),'Unavailable state missing');change(status(),'missing');assert(list().textContent.includes('Collection 004'),'Empty captured source missing');change(status(),'unattempted');assert(list().children.length===50,'Unattempted state missing');checks.push('Partial, uncertain, failed, empty capture and never-acquired states remain distinct');
 const huge={providerItems:Object.fromEntries(Array.from({length:14081},(_,n)=>['r'+n,{...item(n),id:'r'+n,recordRef:'r'+n,provider:'kindle',profileId:a}]))};const hugeView=createContentsWorkspace();document.body.append(hugeView.element);hugeView.update(huge,true);assert(hugeView.element.querySelectorAll('li').length===50&&!hugeView.element.querySelector('textarea'),'Large library rendered eagerly');hugeView.element.remove();checks.push('14,081-record synthetic view renders only 50 summaries');
 assert(!operations.some(op=>/^(?:begin|commit|saveKindle|reparseKindle)/u.test(op)),'Contents navigation triggered acquisition');checks.push('Navigation and review make no acquisition requests');
 await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks,error:error.stack||error.message})});}
