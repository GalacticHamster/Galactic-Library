import {createStorageWriter} from '../src/background/storage-writer.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
const checks=[],assert=(value,message)=>{if(!value)throw Error(message);};
const delay=()=>new Promise(done=>setTimeout(done,20));
const wait=async(predicate,message)=>{for(let n=0;n<300;n++){if(predicate())return;await delay();}throw Error(message);};
const button=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);
const open=node=>{assert(node,'Missing section');node.open=true;node.dispatchEvent(new Event('toggle'));return node;};
const state={},listeners=[],operations=[],requests=[];
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async values=>Object.assign(state,structuredClone(values)),remove:async keys=>{for(const key of keys)delete state[key];}});
globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener(){}},sendMessage:async message=>{
 requests.push(message.type);
 if(message.type==='GET_KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true,runs:[]};
 if(message.type==='GL_CONTENTS_UI_TIMING')return {ok:true};
 if(message.type==='SEARCH_GOOGLE_BOOKS')return {ok:true,candidates:[{volumeId:'example-volume',title:'Shared Collection',authors:['Writer'],isbn:['9780306406157'],publisher:'Publisher',language:'en'}]};
 if(message.type==='SEARCH_OPEN_LIBRARY')return {ok:true,candidates:[{workKey:'/works/OL1W',title:'Shared Collection',authors:['Writer'],subjects:['Comics']}]};
 if(message.type!=='LIBRARY_STORAGE_OPERATION')throw Error('Unexpected external operation '+message.type);
 operations.push(message.operation);try{return {ok:true,result:await writer[message.operation](...message.args)};}catch(error){return {ok:false,error:error.message};}
}},storage:{onChanged:{addListener:fn=>listeners.push(fn)}},tabs:{create:async()=>{throw Error('No acquisition allowed');}}};
const proof=items=>completeProviderSnapshot('kindle',items,['books','personal-documents'].map(id=>{const n=id==='books'?items.length:0;return {...completedScope(id,n,n,'reported-count'),duplicateCount:0};}));
const book={providerItemId:'B000000001',title:'Shared Collection',mediaType:'book',ownership:'owned',metadata:{authors:['Writer'],isbn:'9780306406157',language:'en',detailUrl:'https://www.amazon.com/dp/B000000001'}};
const card=()=>[...document.querySelectorAll('#library-items > li')].find(node=>node.querySelector('strong')?.textContent==='Shared Collection');
const item=()=>card().querySelector('.item-details');
const section=key=>card().querySelector(`[data-item-section="${key}"]`);
async function reconcile(){for(const fn of listeners)fn({[DATABASE_STORAGE_KEY]:{newValue:state[DATABASE_STORAGE_KEY]}},'local');await delay();}
try{
 let db=await writer.replaceProviderItems('kindle',[book],{profileLabel:'Personal',fullSyncAt:'2026-10-01'},proof([book]));const a=Object.values(db.providerItems)[0];
 db=await writer.replaceProviderItems('kindle',[{...book,ownership:'borrowed'}],{profileLabel:'Family',fullSyncAt:'2026-10-02'},proof([book]));const b=Object.values(db.providerItems).find(record=>record.recordRef!==a.recordRef);
 db=await writer.mergeProviderItems('kobo',[{...book,providerItemId:'kobo-book',metadata:{authors:['Writer'],isbn:'9780306406157',ownershipBasis:'purchase-label'}}],{profileLabel:'Personal'});
 await writer.mergeProviderItems('steam',[{providerItemId:'10',title:'Sparse Game',mediaType:'game',ownership:'owned'},{providerItemId:'11',title:'Sparse Software',mediaType:'software',ownership:'unknown'}]);
 await import('../src/ui/options.js');await wait(()=>card(),'Initial library missing');
 assert(!document.querySelector('.catalog-item-details')&&!document.querySelector('.local-metadata-tools'),'Closed Library eagerly built details');assert(!requests.some(type=>type.startsWith('SEARCH_')),'Opening Library performed a lookup');checks.push('Closed Library cards remain lazy and perform no external lookup');
 open(item());assert(card().querySelector('.item-overview h3').textContent==='Shared Collection'&&card().textContent.includes('By Writer'),'Catalog overview missing');assert(!card().querySelector('.item-cover'),'Missing artwork created a broken image');
 const accounts=card().querySelectorAll('.item-account');assert(accounts.length===3&&[...accounts].some(n=>n.textContent.includes('Family')&&n.textContent.includes('Borrowed')),'Grouped records lost account access');assert(card().textContent.includes('Reading status not saved'),'Invented reading progress');checks.push('Unified overview presents three account records without merging their access');
 assert(!card().querySelector('.evidence-inspector')&&!card().querySelector('.local-metadata-tools')&&!card().querySelector('.contents-editor'),'Advanced forms or duplicated Contents editor exposed by default');
 assert(card().querySelector(`[data-contents-record="${a.recordRef}"]`)&&card().querySelector(`[data-contents-record="${b.recordRef}"]`),'Contents links lost exact identity');checks.push('Default details keep technical controls lazy and give account-specific Contents links');
 const sparse=[...document.querySelectorAll('#library-items > li')].find(n=>n.querySelector('strong').textContent==='Sparse Game');open(sparse.querySelector('.item-details'));assert(!sparse.querySelector('[data-item-section="books"]')&&!sparse.querySelector('[data-item-section="contents"]'),'Game received book tools');checks.push('Sparse non-book items retain usable details without book controls');
 assert(!requests.some(type=>type.startsWith('SEARCH_')),'Inspecting metadata initiated lookup');checks.push('Inspection and navigation remain read-only until an explicit action');
 await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks,error:error.stack||error.message})});}
