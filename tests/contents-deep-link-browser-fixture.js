import {createStorageWriter} from '../src/background/storage-writer.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
const values={},checks=[];
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async update=>Object.assign(values,structuredClone(update)),remove:async keys=>{for(const key of keys)delete values[key];}});
globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener(){}},sendMessage:async message=>{
  if(message.type==='GET_KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true,runs:[]};
  if(message.type==='GL_CONTENTS_UI_TIMING')return {ok:true};
  if(message.type!=='LIBRARY_STORAGE_OPERATION')throw Error('No remote requests allowed');
  try{return {ok:true,result:await writer[message.operation](...message.args)};}catch(error){return {ok:false,error:error.message};}
}},storage:{onChanged:{addListener(){}}},tabs:{create:async()=>{throw Error('No acquisition');}}};
try{
  const items=[{providerItemId:'B000000001',title:'Deep-linked collection',mediaType:'book',ownership:'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B000000001'}}];
  const proof=completeProviderSnapshot('kindle',items,[{...completedScope('books',1,1,'reported-count'),duplicateCount:0},{...completedScope('personal-documents',0,0,'reported-count'),duplicateCount:0}]);
  let db=await writer.replaceProviderItems('kindle',items,{profileLabel:'Family',fullSyncAt:'2026-10-01'},proof);const record=Object.values(db.providerItems)[0];
  db=await writer.saveContentReview(record.id,{entries:[{series:'Example',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'}],statement:'Collects Example #1',source:'manual-review',sourceUrl:''});
  history.replaceState(null,'','#contents?record='+record.recordRef);
  await import('../src/ui/options.js');
  for(let n=0;n<100&&!document.querySelector('#contents-book-review textarea');n++)await new Promise(done=>setTimeout(done,20));
  const detail=document.querySelector('#contents-book-review');
  if(document.querySelector('#contents-workspace').hidden||detail.hidden||!detail.textContent.includes('Family')||detail.querySelector('textarea')?.value!=='Collects Example #1')throw Error('Startup deep link did not resolve the exact reviewed record.');
  checks.push('Fresh Options startup opens the exact account-specific Contents deep link after saved state resolves');
  if(JSON.stringify((await writer.getDatabase()).contentReviews)!==JSON.stringify(db.contentReviews))throw Error('Deep navigation changed review evidence.');
  checks.push('Initial deep navigation preserves saved human contents decisions');
  await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks,error:error.stack||error.message})});}
