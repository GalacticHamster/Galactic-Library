import {operationLibrary} from './fixtures/operation-library.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
import {UI_PREFERENCES_KEY,PAGE_SIZES} from '../src/lib/ui-preferences.js';
import {validateDatabase} from '../src/lib/models.js';
import {createPagination} from '../src/ui/pagination.js';

const assert=(value,message)=>{if(!value)throw Error(message);};
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const wait=async(predicate,message)=>{const deadline=performance.now()+120000;while(performance.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error(message);};
const change=(node,value,event='change')=>{node.value=String(value);node.dispatchEvent(new Event(event,{bubbles:true}));};
if(window.parent!==window){
  globalThis.chrome=window.parent.paginationBridge;
  await import('../src/ui/options.js');
}else{
 const checks=[],measurements=[],requests=[],scrolls=[],memory={},listeners=[],runtimeListeners=[];
 try{
  let fixture=await operationLibrary(14000);
  const shared=Object.values(fixture.canonicalItems).find(c=>c.providerItemIds.length===2);
  for(const id of shared.providerItemIds)fixture.providerItems[id].title='Pagination shared marker';
  shared.title='Pagination shared marker';fixture=validateDatabase(fixture);
  const original=JSON.stringify(fixture);memory[DATABASE_STORAGE_KEY]=structuredClone(fixture);
  const writer=createStorageWriter({get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,Object.hasOwn(memory,key)?memory[key]:value]))),set:async updates=>{Object.assign(memory,structuredClone(updates));queueMicrotask(()=>{for(const fn of runtimeListeners)fn({type:'GL_PRIVATE_STORAGE_CHANGED',keys:Object.keys(updates)},{id:chrome.runtime.id});for(const fn of listeners)fn(Object.fromEntries(Object.entries(updates).map(([key,newValue])=>[key,{newValue}])),'local');});}},Promise.resolve(),{cacheQuerySnapshots:true});
  let releaseStartup,delayInitial=true;const startupGate=new Promise(resolve=>releaseStartup=resolve);
  globalThis.chrome=window.paginationBridge={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:{addListener:fn=>runtimeListeners.push(fn)},sendMessage:async request=>{
    if(request.type==='GET_KINDLE_CONTENTS_SCAN_PROGRESS')return {ok:true,runs:[]};
    if(request.type==='GL_CONTENTS_UI_TIMING')return {ok:true};
    if(request.type!=='LIBRARY_STORAGE_OPERATION')return {ok:false,error:'Network disabled in pagination fixture'};
    requests.push(request.operation);
    if(request.operation==='getCommittedLibraryView'&&delayInitial){delayInitial=false;await startupGate;}
    try{return {ok:true,result:structuredClone(await writer.execute(request.operation,request.args))};}catch(error){return {ok:false,error:error.message};}
  }},storage:{onChanged:{addListener:fn=>listeners.push(fn)}},tabs:{create:async()=>{throw Error('No provider navigation');}}};
  const nativeScroll=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(options){scrolls.push({target:this.id||this.getAttribute('aria-label'),options,library:document.querySelector('#library-items').children.length,contents:document.querySelector('#contents-collection-list')?.children.length});return nativeScroll.call(this,options);};
  await frame();assert(!document.querySelector('#library-load-status').hidden&&document.querySelector('#empty-library').hidden,'False empty startup');
  await import('../src/ui/options.js');await frame();
  assert(document.querySelector('#library-page-status').textContent==='Loading results...'&&document.querySelector('#library-items-per-page').disabled,'Unresolved startup exposed false empty/actionable size');
  assert(document.querySelector('nav[aria-label="Contents pages (top)"]').textContent.includes('Loading results'),'Unresolved Contents looked empty');
  releaseStartup();await wait(()=>document.querySelector('#library-load-status').hidden,'Library did not load');
  const navigate=name=>document.querySelector(`#workspace-navigation [data-workspace="${name}"]`).click();
  const list=name=>document.querySelector(name==='Library'?'#library-items':'#contents-collection-list');
  const rows=name=>[...document.querySelectorAll(`nav[aria-label^="${name} pages"]`)];
  const select=name=>document.querySelector(`#${name.toLowerCase()}-items-per-page`);
  const information=name=>rows(name)[0].querySelector('.pagination-info').textContent;
  const total=name=>name==='Library'?13000:14000;
  const assertRows=name=>{
    const [top,bottom]=rows(name);assert(top&&bottom,'Missing repeated controls');
    assert(top.nextElementSibling===list(name)&&list(name).nextElementSibling===bottom,`Pagination not immediately adjacent to ${name} results: ${top.nextElementSibling?.id}/${list(name).nextElementSibling?.id}`);
    assert(top.querySelector('.pagination-info').textContent===bottom.querySelector('.pagination-info').textContent,'Rows diverged');
    for(let n=0;n<3;n++){const a=top.children[n],b=bottom.children[n];assert(a.disabled===b.disabled,'Control states diverged');if(n!==1){assert(!a.classList.contains('secondary')&&!b.classList.contains('secondary'),'Enabled control inherits secondary style');const expected=a.disabled?'rgb(75, 85, 99)':'rgb(124, 58, 237)';assert(getComputedStyle(a).backgroundColor===expected,'Incorrect button color');}}
    const rect=top.querySelector('.pagination-info').getBoundingClientRect(),outer=top.getBoundingClientRect();assert(Math.abs((rect.left+rect.right)-(outer.left+outer.right))<2,'Page information not centered');
    assert(top.querySelector('[aria-live="polite"]')&&!bottom.querySelector('[aria-live="polite"]'),'Duplicate live announcements');
    assert(document.documentElement.scrollWidth<=innerWidth+1,'Horizontal overflow');
  };
  assert(list('Library').children.length===50&&select('Library').value==='50','Default page size wrong');
  assert(!list('Contents').children.length&&!document.querySelector('#contents-collections').querySelector('textarea'),'Hidden Contents was eagerly populated');
  checks.push('Large startup keeps loading/empty distinct and hidden Contents preparation deferred');
  const initialReads=requests.filter(op=>op==='getCommittedLibraryView'||op==='getDatabase').length;
  for(const name of ['Library','Contents']){
    navigate(name.toLowerCase());
    for(const size of PAGE_SIZES){
      rows(name)[0].lastElementChild.click();
      change(select(name),size);assert(list(name).children.length===size,'Wrong visible page size');
      assert(information(name)===`Page 1 of ${Math.ceil(total(name)/size)} \u00b7 Showing 1\u2013${size} of ${total(name)}`,'Page/range count wrong');assertRows(name);
      const before=scrolls.length;rows(name)[0].querySelector('button').dispatchEvent(new Event('click'));assert(scrolls.length===before,'Disabled Previous navigated');
      const [top,bottom]=rows(name);top.lastElementChild.click();assert(information(name).includes(`Showing ${size+1}\u2013${size*2}`),'Top Next failed');assertRows(name);
      bottom.firstElementChild.click();assert(information(name).includes('Page 1 of'),'Bottom Previous failed');assertRows(name);
      bottom.lastElementChild.click();assert(information(name).includes('Page 2 of'),'Bottom Next failed');top.firstElementChild.click();assert(information(name).includes('Page 1 of'),'Top Previous failed');
      bottom.lastElementChild.focus();bottom.lastElementChild.click();assert(document.activeElement===top.lastElementChild,'Bottom keyboard focus stranded');top.firstElementChild.click();
      assert(!list(name).querySelector('.contents-editor')&&!list(name).querySelector('.item-details-body > *'),'Page created hidden editors');
    }
    checks.push(name+': all four sizes, top/bottom synchronization, canonical/account totals, disabled controls and centered purple/muted presentation');
    // Measure sequential navigation; this includes actual render + native scroll
    // layout, then separately observes a frame opportunity. No worker reload.
    for(const size of [50,200]){
      change(select(name),size);await frame();
      for(let trial=1;trial<=3;trial++){
        const start=performance.now();rows(name)[1].lastElementChild.click();const renderMs=performance.now()-start;await frame();
        measurements.push({workspace:name,size,trial,renderAndScrollMs:renderMs,frameSettledMs:performance.now()-start,visible:list(name).children.length});
        rows(name)[0].firstElementChild.click();await frame();
      }
    }
  }
  checks.push('50/200 navigation renders only its page with cached projections and no database reload');
  navigate('library');change(select('Library'),100);navigate('contents');assert(select('Contents').value==='100'&&list('Contents').children.length===100,'Library to Contents preference lost');
  change(select('Contents'),200);navigate('library');assert(select('Library').value==='200'&&list('Library').children.length===200,'Contents to Library preference lost');
  navigate('providers');navigate('settings');navigate('contents');assert(select('Contents').value==='200','Other workspace reset preference');
  await wait(()=>memory[UI_PREFERENCES_KEY]?.pageSize===200,'Page size not persisted');
  assert(requests.filter(op=>op==='getCommittedLibraryView'||op==='getDatabase').length===initialReads,'Pagination reread/revalidated the library');
  checks.push('One shared page-size preference synchronizes both directions and survives other workspace navigation');
  checks.push('Public and Firefox private UI-preference notifications do not trigger library rereads');
  navigate('library');rows('Library')[1].lastElementChild.click();change(document.querySelector('#search'),'Pagination shared marker','input');assert(list('Library').children.length===1&&information('Library').includes('Page 1 of 1'),'Search failed reset');
  navigate('contents');assert(list('Contents').children.length===2&&information('Contents').includes('of 2'),'Account rows conflated with catalog total');
  change(document.querySelector('#contents-account'),Object.values(fixture.providerProfiles).find(p=>p.provider==='kindle').profileId);assert(list('Contents').children.length===1,'Saved-account filter lost');
  change(document.querySelector('#contents-sort'),'title-desc');assert(information('Contents').includes('Page 1 of 1'),'Sort failed reset');
  change(document.querySelector('[aria-label="Search contents collections"]'),'no such book','input');assert(!list('Contents').children.length&&information('Contents')==='No items to show','False empty range');assertRows('Contents');
  checks.push('Search/account/sort boundaries preserve different catalog/account populations and clean empty results');
  let navigations=0;const boundary=createPagination({name:'Boundary control',onPage:()=>navigations++,onSize(){}});
  boundary.update({total:6245,page:999,size:200});assert(boundary.state.page===31&&boundary.state.start===6201,'Last page clamp wrong');
  for(const row of [boundary.top,boundary.bottom]){assert(row.querySelector('.pagination-info').textContent==='Page 32 of 32 \u00b7 Showing 6201\u20136245 of 6245','Last range wrong');row.lastElementChild.dispatchEvent(new Event('click'));}
  assert(navigations===0,'Disabled last-page Next navigated');boundary.update({total:0,page:99,size:200});assert(boundary.top.textContent.includes('No items to show')&&boundary.top.firstElementChild.disabled&&boundary.bottom.lastElementChild.disabled,'Empty boundary actionable');
  checks.push('Last-page and empty boundary controls clamp accurately and cannot navigate when disabled');
  change(document.querySelector('[aria-label="Search contents collections"]'),'','input');change(document.querySelector('#contents-account'),'all');navigate('library');
  const detail=list('Library').querySelector('.item-details'),beforeDetails=scrolls.length;detail.open=true;detail.dispatchEvent(new Event('toggle'));assert(scrolls.length===beforeDetails,'Details unexpectedly scrolled');
  const focusable=rows('Library')[0].lastElementChild;focusable.focus();assert(document.activeElement===focusable&&parseFloat(getComputedStyle(focusable).outlineWidth)>=2,'Keyboard/focus lost');select('Library').focus();assert(document.activeElement===select('Library'),'Native selector not focusable');
  assert(scrolls.length>0&&scrolls.filter(s=>String(s.target).includes('pages')||s.target==='library-pagination').every(s=>s.options.block==='start'&&(s.library>0||s.contents>0)),'Navigation scrolled before results');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)assert(scrolls.every(s=>s.options.behavior==='instant'),'Reduced-motion scroll animated');
  checks.push('Both rows and size changes scroll rendered results, never main navigation; Details stays put, keyboard/reduced motion remain usable');
  const beforeDataNotification=requests.filter(op=>op==='getCommittedLibraryView').length;
  for(const fn of runtimeListeners)fn({type:'GL_PRIVATE_STORAGE_CHANGED',keys:[DATABASE_STORAGE_KEY]},{id:chrome.runtime.id});
  await wait(()=>requests.filter(op=>op==='getCommittedLibraryView').length>beforeDataNotification&&document.querySelector('#library-load-status').hidden,'Actual private database change no longer reconciles');
  checks.push('Private database notifications still reconcile the Library while preference-only changes are ignored');
  // Two fresh Options documents reuse only disposable extension storage.
  await wait(()=>memory[UI_PREFERENCES_KEY]?.pageSize===200,'Pending preferences did not save');
  for(let reopen=1;reopen<=3;reopen++){
    if(reopen===3){await new Promise(resolve=>setTimeout(resolve,220));await writer.saveUiPreferences({pageSize:200,workspace:'contents',browse:{page:1,anchor:'',search:'',account:'all'}});}
    const child=document.createElement('iframe');child.style.width='100%';child.style.height='300px';document.body.append(child);
    const loaded=new Promise(resolve=>child.addEventListener('load',resolve,{once:true}));child.src='/options.html?pagination-child='+reopen+(reopen===3?'#contents':'#library');await loaded;
    await wait(()=>child.contentDocument.querySelector('#library-load-status').hidden,'Fresh document preference hydration failed');
    if(reopen===3){assert(child.contentDocument.querySelector('#contents-items-per-page').value==='200'&&child.contentDocument.querySelector('#contents-collection-list').children.length===200&&child.contentDocument.querySelector('nav[aria-label="Contents pages (top)"]').textContent.includes('Page 2 of'),'Hydration reset saved Contents page');}
    else {assert(child.contentDocument.querySelector('#library-items-per-page').value==='200'&&child.contentDocument.querySelector('#library-items').children.length===200,'Reopen rendered wrong page size');child.contentDocument.querySelector('[data-workspace="contents"]').click();assert(child.contentDocument.querySelector('#contents-items-per-page').value==='200','Reopen Contents lost shared size');}
    child.remove();
  }
  checks.push('Reload/reopening fresh Options documents hydrate the same persistent page-size preference');
  assert(JSON.stringify(memory[DATABASE_STORAGE_KEY])===original,'Pagination modified protected database');
  checks.push('Full synthetic ownership/profile/source/review/canonical database remains exactly unchanged');
  await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,pagination:{providerRecords:14000,canonicalRecords:13000,width:innerWidth,measurements,requests,scrollEvents:scrolls.length,measurement:'Sequential synthetic browser render+native scroll, real writer/validator with clone-backed mock storage. No native extension transport or private data.'}})});
 }catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
}
