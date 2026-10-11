import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {createRelationshipPicker} from '../src/ui/relationship-picker.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
const checks=[],errors=[],state={},listeners=[];
const assert=(value,message)=>{if(!value)throw Error(message);};
const delay=()=>new Promise(done=>setTimeout(done,20));
const wait=async(predicate,message)=>{for(let n=0;n<300;n++){if(predicate())return;await delay();}throw Error(message);};
const open=node=>{assert(node,'Missing details');node.open=true;node.dispatchEvent(new Event('toggle'));return node;};
const button=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);
globalThis.addEventListener('error',event=>errors.push(event.error?.stack??event.message));
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async values=>Object.assign(state,structuredClone(values)),remove:async keys=>{for(const key of keys)delete state[key];}});
globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener(){}},sendMessage:async message=>{
 if(message.type==='GET_KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true,runs:[]};
 if(message.type==='GL_CONTENTS_UI_TIMING')return {ok:true};
 if(message.type!=='LIBRARY_STORAGE_OPERATION')throw Error('Unexpected network operation '+message.type);
 try{return {ok:true,result:await writer[message.operation](...message.args)};}catch(error){return {ok:false,error:error.message};}
}},storage:{onChanged:{addListener:fn=>listeners.push(fn)}},tabs:{create:async()=>{throw Error('No live pages allowed');}}};
async function reconcile(){for(const fn of listeners)fn({[DATABASE_STORAGE_KEY]:{newValue:state[DATABASE_STORAGE_KEY]}},'local');await delay();}
try{
 const emperor='Archer & Armstrong Vol. 2: Wrath of the Eternal Emperor',warrior='Archer & Armstrong Vol. 2: Wrath of the Eternal Warrior';
 await writer.mergeProviderItems('humble',[{providerItemId:'old:product:archer2',title:emperor,mediaType:'book',ownership:'owned',metadata:{purchaseId:'old',sourceBundle:'Older bundle',entitlement:'direct-download'},acquiredAt:'2014-09-25T00:00:00Z'},{providerItemId:'new:product:archer2',title:warrior,mediaType:'book',ownership:'owned',metadata:{purchaseId:'new',sourceBundle:'Newer bundle',entitlement:'direct-download'},acquiredAt:'2026-09-18T00:00:00Z'}]);
 await import('../src/ui/options.js');
 await wait(()=>document.querySelector('#library-items > li'),'Library did not load');
 const archerCard=title=>[...document.querySelectorAll('#library-items > li')].find(node=>node.querySelector('strong')?.textContent===title);
 const archerInspector=title=>{const node=archerCard(title);open(node.querySelector('.item-details'));open(node.querySelector('[data-item-section="advanced"]'));return open(node.querySelector('.evidence-inspector'));};
 let archer=archerInspector(emperor),archerSearch=archer.querySelector('[aria-label="Search comparison records"]'),archerRight=archer.querySelector('[aria-label="Compare with library record"]');
 assert(archerRight.options.length===1&&archerRight.disabled,'Picker rendered library before searching');
 archerSearch.value='Archer';archerSearch.dispatchEvent(new Event('input'));
 assert(archerRight.options.length===2&&!archerRight.textContent.includes('Eternal Emperor'),'Picker includes self or omits candidate');
 archerRight.value=archerRight.options[1].value;archerRight.dispatchEvent(new Event('change'));
 const archerChoice=archer.querySelector('[aria-label="Preferred title for Same Edition"]');archerChoice.value=[...archerChoice.options].find(option=>option.textContent.includes(warrior)).value;
 button(archer,'Same edition').click();await wait(()=>archerCard(warrior)&&!archerCard(emperor),'Preferred title did not consolidate');await delay();
 assert(archerCard(warrior).textContent.includes('Owned twice'),'Consolidated acquisitions lost');
 archer=archerInspector(warrior);archerSearch=archer.querySelector('[aria-label="Search comparison records"]');archerSearch.value='Archer';archerSearch.dispatchEvent(new Event('input'));archerRight=archer.querySelector('[aria-label="Compare with library record"]');assert(archerRight.options.length===1&&archerRight.disabled,'Picker includes confirmed Same Edition member');
 let titleSelect=archer.querySelector('[aria-label="Preferred library display title"]');titleSelect.value=[...titleSelect.options].find(option=>option.textContent.includes(emperor)).value;button(archer,'Save display title').click();await wait(()=>archerCard(emperor),'Could not change preferred title');await delay();
 archer=archerInspector(emperor);titleSelect=archer.querySelector('[aria-label="Preferred library display title"]');titleSelect.value=[...titleSelect.options].find(option=>option.textContent.includes(warrior)).value;button(archer,'Save display title').click();await wait(()=>archerCard(warrior),'Could not restore preferred title');await delay();
 checks.push('Search excludes self and Same Edition members; Archer title choice consolidates two acquisitions and remains editable');

 const db=await writer.getDatabase(),sources=JSON.stringify(db.providerItems);
 await writer.restoreDatabase(parseBackup(createBackup(db)));await reconcile();
 assert(archerCard(warrior)&&JSON.stringify((await writer.getDatabase()).providerItems)===sources,'Backup restore lost title or original records');
 checks.push('Backup restore preserves display choice and both original source titles');
 const large={...db,providerItems:{...db.providerItems}},record=Object.values(db.providerItems)[0];
 for(let n=0;n<14081;n++)large.providerItems['synthetic:'+n]={...record,id:'synthetic:'+n,title:'Synthetic catalog '+n};
 const picker=createRelationshipPicker(large,()=>record.id,()=>{});document.body.append(picker.root);picker.update();
 const input=picker.root.querySelector('input');input.value='Synthetic catalog';input.dispatchEvent(new Event('input'));
 assert(picker.select.options.length===21&&picker.root.textContent.includes('Refine your search'),'Large picker rendered more than twenty results');
 input.value='Synthetic catalog 14080';input.dispatchEvent(new Event('input'));assert(picker.select.options.length===2,'Refined search did not narrow results');
 checks.push('Large-library search renders at most twenty results and narrows as the user types');
 assert(!errors.length,'Unhandled UI error: '+errors.join('; '));
 await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks,error:error.stack||error.message})});}
