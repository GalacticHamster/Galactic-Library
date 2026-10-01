import { createStorageWriter } from '../src/background/storage-writer.js';
import { createBackup } from '../src/lib/storage.js';
import { matchItems } from '../src/lib/matcher.js';
import '../src/providers/kobo.js';
import { completeProviderSnapshot, completedScope } from '../src/lib/provider-snapshot.js';

const checks=[];
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const pause=()=>new Promise(done=>setTimeout(done,20));
const wait=async(predicate,message)=>{for(let n=0;n<100;n++){if(predicate())return;await pause();}throw new Error(message);};
const button=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);
const card=title=>[...document.querySelectorAll('#library-items > li')].find(node=>node.querySelector('strong')?.textContent===title);
const open=async node=>{assert(node,'Missing details');node.open=true;await pause();return node;};
const values={};
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates)),remove:async keys=>{for(const key of keys)delete values[key];}});
globalThis.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',sendMessage:async message=>{
  if(message.type!=='LIBRARY_STORAGE_OPERATION')return {ok:false,error:'Remote services disabled in UI fixture.'};
  try{return {ok:true,result:await writer[message.operation](...message.args)};}catch(error){return {ok:false,error:error.message};}
}},storage:{onChanged:{addListener:()=>{}}}};

try{
  const koboDocument=new DOMParser().parseFromString(`<ul>
    <li class="book-card" data-is-kobo-plus="true"><h3 class="book-title">Subscription book</h3><a data-book-title="Subscription book" href="https://www.kobo.com/ebook/subscription">Read now</a></li>
    <li class="book-card"><h3 class="book-title">Purchased</h3><a data-book-title="Purchased" href="https://www.kobo.com/ebook/title-is-purchased">Read now</a></li>
    <li class="book-card"><h3 class="book-title">Purchase proof</h3><span class="ownership-label">Purchased</span><a data-book-title="Purchase proof" href="https://www.kobo.com/ebook/purchase-proof">Read now</a></li>
    </ul>`,'text/html');
  const koboItems=globalThis.GalacticKobo.koboItemsFromDocument(koboDocument);
  assert(koboItems.length===3&&koboItems[0].ownership==='subscription'&&koboItems[1].ownership==='unknown'&&koboItems[2].ownership==='owned','Kobo ownership leaks between cards or from title text.');
  checks.push('Kobo actual DOM parser scopes purchase/subscription evidence to each card and ignores title words');
  const originalFetch=globalThis.fetch;let koboFetches=0;
  try{
    globalThis.fetch=async()=>{koboFetches++;return {ok:true,text:async()=>koboDocument.documentElement.outerHTML};};
    const update=await globalThis.GalacticKobo.fetchKoboLibrary(()=>{},koboItems.map(item=>item.providerItemId));
    assert(koboFetches===1&&update.items.length===3&&update.items[0].ownership==='subscription','Kobo quick scan discarded current evidence for known cards.');
  }finally{globalThis.fetch=originalFetch;}
  checks.push('Kobo quick scan refreshes known cards and still stops at a known page');
  await writer.mergeProviderItems('humble',[
    {providerItemId:'a',title:'Collection A',mediaType:'book',ownership:'owned',metadata:{isbn:'9780306406157',authors:['Author'],language:'en',source:'purchase-library',detailUrl:'javascript:alert(1)'}},
    {providerItemId:'c',title:'Collection A, 2nd Edition',mediaType:'book',ownership:'owned',metadata:{authors:['Author'],language:'en'}},
    {providerItemId:'d',title:'Unconfirmed alias',mediaType:'book',ownership:'unknown'},
    {providerItemId:'e',title:'Shared title',mediaType:'book',ownership:'owned',metadata:{authors:['Author A']}}
  ]);
  await writer.mergeProviderItems('kindle',[
    {providerItemId:'b',title:'Collection B',mediaType:'book',ownership:'owned',metadata:{isbn:'9780140328721',authors:['Author'],language:'en'}},
    {providerItemId:'f',title:'Shared title',mediaType:'book',ownership:'owned',metadata:{authors:['Author B']}}
  ]);
  const entry=number=>({series:'Batman',run:'2011',unitType:'issue',number,language:'en',completeness:'full'});
  await writer.saveContentReview('humble:a',{entries:[entry('1'),entry('3')],statement:'Collects Batman (2011) #1 and #3'});
  await writer.saveContentReview('kindle:b',{entries:[entry('3'),entry('5')],statement:'Collects Batman (2011) #3 and #5'});
  const backup=createBackup(await writer.getDatabase());
  await import('../src/ui/options.js');
  await wait(()=>document.querySelectorAll('#library-items > li').length===6,'Library failed to render.');
  checks.push('actual options page renders distinct editions and same-title homonyms');
  let inspector=card('Collection A').querySelector('.evidence-inspector');
  assert(!inspector.querySelector('select'),'Closed evidence controls should be lazy.');
  await open(inspector);
  assert(inspector.textContent.includes('9780306406157')&&inspector.textContent.includes('Account / profileUnknown')&&inspector.textContent.includes('Last observed at provider'),'Evidence fields missing.');
  assert(!inspector.querySelector('a[href^="javascript:"]'),'Unsafe provider source link.');
  checks.push('evidence inspector exposes dates, identities and unknown account scope safely');
  assert(inspector.textContent.includes('Reseller purchase evidenceconfirmed')&&inspector.textContent.includes('Destination activationnot-applicable'),'Direct purchase evidence missing.');
  checks.push('reseller purchase evidence is displayed separately from destination activation');
  inspector.querySelector('[aria-label="Compare with library record"]').value='humble:c';
  inspector.querySelector('[aria-label="Compare with library record"]').dispatchEvent(new Event('change'));
  assert(inspector.querySelector('.identity-conflicts').textContent.includes('edition'),'Edition conflict not shown.');
  button(inspector,'Same edition').click();
  await wait(()=>inspector.textContent.includes('conflicting edition evidence'),'Conflicting edition review should fail.');
  checks.push('Same edition rejects known edition conflicts with a visible reason');
  inspector.querySelector('[aria-label="Compare with library record"]').value='humble:d';
  button(inspector,'Same work').click();
  await wait(()=>card('Collection A').querySelector('.evidence-inspector')!==inspector,'Same work did not refresh.');
  let database=await writer.getDatabase();
  let result=matchItems(database.providerItems,[{title:'Unconfirmed alias',mediaType:'book'}],database)[0];
  assert(!result.owned&&result.possibleMatches.some(item=>item.title==='Collection A'),'Same work overclaimed ownership.');
  inspector=await open(card('Collection A').querySelector('.evidence-inspector'));button(inspector,'Undo relationship').click();
  await wait(()=>card('Collection A').querySelector('.evidence-inspector')!==inspector,'Relationship undo did not refresh.');
  assert(Object.keys((await writer.getDatabase()).manualMatchDecisions).length===0,'Undo did not persist.');
  checks.push('Same work yields Possible and relationship undo persists');
  inspector=await open(card('Collection A').querySelector('.evidence-inspector'));
  inspector.querySelector('[aria-label="Compare with library record"]').value='humble:d';button(inspector,'Same edition').click();
  await wait(()=>document.querySelectorAll('#library-items > li').length===5,'Reviewed edition did not group aliases.');
  database=await writer.getDatabase();result=matchItems(database.providerItems,[{title:'Unconfirmed alias',mediaType:'book'}],database)[0];assert(result.owned,'Reviewed edition should resolve ownership.');
  inspector=await open(card('Collection A').querySelector('.evidence-inspector'));button(inspector,'Undo relationship').click();
  await wait(()=>document.querySelectorAll('#library-items > li').length===6,'Edition undo did not split aliases.');
  checks.push('reviewed Same edition resolves aliases and undo restores separate records');
  const extra={providerItemId:'split-test',title:'Collection A',mediaType:'book',ownership:'owned',metadata:{authors:['Author'],isbn:'9780306406157',language:'en'}};
  await writer.mergeProviderItems('humble',[extra]);
  // Render from the options page's own storage client, then split a real merged card.
  const transferSplit=new DataTransfer();transferSplit.items.add(new File([JSON.stringify(createBackup(await writer.getDatabase()))],'split.json',{type:'application/json'}));
  document.querySelector('#import').files=transferSplit.files;document.querySelector('#import').dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#backup-status').textContent==='Backup restored.','Split fixture import failed.');
  inspector=await open(card('Collection A').querySelector('.evidence-inspector'));
  button(inspector,'Separate this record into its own edition').click();
  await wait(()=>Object.keys(values.galacticLibraryDatabase.editionSeparations??{}).length===1,'Edition separation did not persist.');
  await wait(()=>card('Collection A').querySelector('.evidence-inspector')!==inspector,'Edition split did not render.');
  let separatedInspector;
  for(const node of document.querySelectorAll('.evidence-inspector')){await open(node);if(button(node,'Undo edition separation')){separatedInspector=node;break;}}
  assert(separatedInspector,'Separated record has no undo control.');button(separatedInspector,'Undo edition separation').click();
  await wait(()=>Object.keys(values.galacticLibraryDatabase.editionSeparations??{}).length===0,'Edition separation undo failed.');
  checks.push('actual evidence controls separate falsely merged editions and undo without deleting records');
  let editor=await open(card('Collection A').querySelector('.contents-editor'));
  editor.querySelector('textarea').value='Collects Batman (2011) #1-3; bonus essays';button(editor,'Parse statement for review').click();
  assert(editor.querySelectorAll('tbody tr').length===3&&editor.textContent.includes('bonus essays'),'Contents proposals lost unparsed evidence.');
  for(const language of editor.querySelectorAll('[data-contents-field="language"]'))language.value='en';
  button(editor,'Save verified contents').click();
  await wait(()=>card('Collection A').querySelector('.contents-editor')!==editor,'Contents save did not refresh.');
  assert((await writer.getDatabase()).contentReviews['humble:a'].entries.length===3,'Confirmed contents did not persist.');
  checks.push('contents editor parses ranges, retains unparsed text and saves confirmation');
  editor=await open(card('Collection A').querySelector('.contents-editor'));button(editor,'Undo contents confirmation').click();
  await wait(()=>card('Collection A').querySelector('.contents-editor')!==editor,'Contents undo did not refresh.');
  assert(!(await writer.getDatabase()).contentReviews['humble:a'],'Contents undo did not persist.');
  checks.push('contents confirmation undo removes coverage evidence');
  const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(backup)],'backup.json',{type:'application/json'}));
  const input=document.querySelector('#import');input.files=transfer.files;input.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#backup-status').textContent==='Backup restored.'&&!values.galacticLibraryDatabase.providerItems['humble:split-test'],'Backup restore failed.');
  assert((await writer.getDatabase()).contentReviews['humble:a'].entries.length===2,'Backup lost contents.');
  checks.push('actual backup import restores reviewed evidence and refreshes the UI');
  document.querySelector('#series-coverage-panel').open=true;
  const group=await open(document.querySelector('.series-groups details'));
  assert(group.textContent.includes('2, 4')&&group.textContent.includes('Collection A — humble')&&group.textContent.includes('Collection B — kindle')&&group.textContent.includes('Yes'),'Union, gaps or overlap missing.');
  checks.push('series dashboard shows gaps, overlap and union across providers');
  const comparison=document.querySelector('.series-coverage > details');await open(comparison);
  comparison.querySelector('textarea').value='Batman (2011) #1-5';comparison.querySelector('[aria-label="Target language"]').value='en';button(comparison,'Compare coverage').click();
  assert(comparison.textContent.includes('3/5 full units')&&comparison.textContent.includes('issue 2')&&comparison.textContent.includes('issue 4'),'Explicit target gaps are incorrect.');
  comparison.querySelector('[aria-label="Target language"]').value='ja';button(comparison,'Compare coverage').click();assert(comparison.textContent.includes('0/5 full units'),'Different-language coverage overclaimed.');
  checks.push('target collection comparison reports missing units and respects language');
  const filter=document.querySelector('[aria-label="Filter reviewed series"]');filter.value='missing series';filter.dispatchEvent(new Event('input'));assert(group.hidden,'Series filter did not hide unmatched scope.');
  checks.push('series search filters reviewed scopes');
  await writer.replaceProviderItems('humble',[],{},completeProviderSnapshot('humble',[],[completedScope('library',0,0,'reported-count',1)]));
  const historyTransfer=new DataTransfer();historyTransfer.items.add(new File([JSON.stringify(createBackup(await writer.getDatabase()))],'history.json',{type:'application/json'}));
  document.querySelector('#backup-status').textContent='';input.files=historyTransfer.files;input.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#backup-status').textContent==='Backup restored.','History backup restore failed.');
  assert(document.querySelector('#provider-history').textContent.includes('Collection A')&&document.querySelector('#provider-history').textContent.includes('not observed in complete scan'),'Archived purchase evidence is missing from history.');
  checks.push('complete scan history survives backup restore and is displayed separately from current ownership');
  await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack||error.message})});}
