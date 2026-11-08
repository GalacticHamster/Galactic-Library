// Real Kindle content-script completion/UI path; only acquisition and runtime
// replies are synthetic. Shared renderer and contents control state are real.
export async function checkKindleQuickMessages(){
 const source=await (await fetch('/src/providers/kindle-content.js')).text(),checks=[];
 const number=n=>n.toLocaleString(),assert=(v,m)=>{if(!v)throw Error(m);};
 const stats={books:{reportedCount:3200,rawCount:200,readableCount:200,duplicateCount:0},'personal-documents':{reportedCount:128,rawCount:100,readableCount:100,duplicateCount:0}};
 const detail='Books: Amazon reported 3200, returned 200, usable 200, duplicate IDs 0; Personal Documents: Amazon reported 128, returned 100, usable 100, duplicate IDs 0';
 const cases=[
  {name:'new items',added:2,total:3325,expected:`Kindle quick update complete. 2 new items added. ${number(3325)} items stored locally.`},
  {name:'no new items',added:0,total:3325,expected:`Kindle quick update complete. No new items found. ${number(3325)} items stored locally.`},
  {name:'singular addition and stored total',added:1,total:1,expected:'Kindle quick update complete. 1 new item added. 1 item stored locally.'},
  {name:'zero stored total',added:0,total:0,expected:'Kindle quick update complete. No new items found. 0 items stored locally.'},
  {name:'updated existing item',added:0,updated:1,total:3325,expected:`Kindle quick update complete. No new items found. 1 existing item updated. ${number(3325)} items stored locally.`},
  {name:'committed additions differ from captured items',added:1,updated:2,captured:3,total:3325,expected:`Kindle quick update complete. 1 new item added. 2 existing items updated. ${number(3325)} items stored locally.`},
  {name:'legacy response without change counts',added:2,legacy:true,total:3325,expected:`Kindle quick update complete. 2 new items added. ${number(3325)} items stored locally.`},
  {name:'nonzero duplicate counts retained',added:0,total:3325,duplicates:true,expected:`Kindle quick update complete. No new items found. ${number(3325)} items stored locally.`},
  {name:'unknown reported count retained',added:0,total:3325,unknown:true,expected:`Kindle quick update complete. No new items found. ${number(3325)} items stored locally.`},
  {name:'partial acquisition',added:1,total:3325,partial:true,pattern:/Saved 1 readable Kindle item\. 1 entries could not be validated\..*Earlier records.*Full rescan/},
  {name:'failed page',added:1,total:3325,pageFailure:true,pattern:/Some library pages remain unchecked/},
  {name:'storage failure',added:1,total:3325,rejected:true,pattern:/Kindle import failed: Synthetic save rejection/},
  {name:'authentication failure',added:0,total:3325,auth:true,pattern:/Kindle import failed: Sign in to Amazon/},
  {name:'Full wording unchanged',added:2,total:3325,full:true,expected:`Full rescan complete. 3325 Kindle items stored locally. ${detail}.`},
  {name:'Full unverified coverage remains visible',added:2,total:3325,full:true,unverified:true,expected:`Library check finished; Amazon did not confirm complete coverage. 3325 Kindle items stored locally. ${detail}.`},
  {name:'first Quick retains Full setup message',added:2,total:3325,noBaseline:true,expected:`Full rescan complete. 3325 Kindle items stored locally. ${detail}.`}
 ];
 for(const c of cases){
  const frame=document.createElement('iframe');frame.hidden=true;document.body.append(frame);
  try{
   const doc=frame.contentDocument,requests=[],diagnostics=structuredClone(stats),result={items:Array.from({length:c.captured??c.added},(_,i)=>({providerItemId:'new-'+i})),diagnostics,incomplete:Boolean(c.partial||c.pageFailure),coverageUnverified:Boolean(c.unverified)};
   if(c.partial)diagnostics.books.failedItems=1;if(c.pageFailure)diagnostics.books.failedPages=1;
   if(c.duplicates){diagnostics.books.duplicateCount=3;diagnostics['personal-documents'].duplicateCount=2;}
   if(c.unknown)diagnostics.books.reportedCount=null;
   const diagnosticBefore=JSON.stringify(diagnostics),expectedDetail=detail.replace('reported 3200',c.unknown?'reported unknown':'reported 3200').replace('usable 200, duplicate IDs 0',c.duplicates?'usable 200, duplicate IDs 3':'usable 200, duplicate IDs 0').replace('usable 100, duplicate IDs 0',c.duplicates?'usable 100, duplicate IDs 2':'usable 100, duplicate IDs 0');
   const sync={send:async r=>{requests.push(r);if(r.type==='GET_KINDLE_CONTENTS_REFRESH')return {ok:true,eligible:0,checkpoint:null};if(r.type==='GET_PROVIDER_SYNC_STATE')return {ok:true,hasAcquisitionBaseline:!c.noBaseline,syncState:{knownProviderItemIds:['known']}};if(r.type==='IMPORT_PROVIDER_ITEMS')return c.rejected?{ok:false,error:'Synthetic save rejection'}:{ok:true,bookCount:c.total,...(c.legacy?{}:{changes:{added:c.added,updated:c.updated??0}})};throw Error('Unexpected message '+r.type);},failed:async()=>{}};
   const scoped={GalacticSync:sync,GalacticKindle:{fetchKindleBooks:async(_progress,known)=>{assert((known===null)===Boolean(c.full||c.noBaseline),'UI changed acquisition mode');if(c.auth)throw Error('Sign in to Amazon');return result;}},GalacticContentsScan:globalThis.GalacticContentsScan,GalacticFloatingPanel:{render:globalThis.GalacticFloatingPanel.render,attach(){}}};
   let root;const attach=frame.contentWindow.Element.prototype.attachShadow;
   frame.contentWindow.Element.prototype.attachShadow=function(options){root=attach.call(this,options);return root;};
   new Function('globalThis','document','location','chrome',source)(scoped,doc,new URL('https://www.amazon.com/hz/mycd/'),{runtime:{getURL:p=>location.origin+'/'+p}});
   assert(root,'Kindle test shadow root unavailable');
   for(let n=0;n<100&&root.querySelector('[data-action="comic-contents"]').disabled;n++)await new Promise(done=>setTimeout(done,1));
   root.querySelector(`[data-mode="${c.full?'full':'incremental'}"]`).click();
   for(let n=0;n<100&&root.querySelector('.status').dataset.busy;n++)await new Promise(done=>setTimeout(done,1));
   const text=root.querySelector('.status').textContent,extra=root.querySelector('[data-kindle-scan-details]');
   if(c.expected)assert(text===c.expected,c.name+': '+text);else assert(c.pattern.test(text),c.name+': '+text);
   if(!c.full&&!c.noBaseline&&!c.partial&&!c.pageFailure&&!c.rejected&&!c.auth)assert(!/Amazon reported|returned|usable|duplicate IDs/.test(text),'Internal statistics leaked into successful Quick status');
   if(c.partial||c.pageFailure||c.rejected||c.auth)assert(!text.includes('Kindle quick update complete'),'Failure was labeled success');
   if(c.auth)assert(extra.hidden,'Failed acquisition retained stale statistics');
   else{assert(extra.textContent===`Last acquisition: ${expectedDetail}.`&&!extra.hidden,'Per-category diagnostics lost');assert(extra.closest('details').querySelector('[data-export-timing]'),'Existing diagnostic section/export control lost');}
   assert(JSON.stringify(diagnostics)===diagnosticBefore,'UI changed source statistics');
   if(!c.auth)assert(requests.some(r=>r.type==='IMPORT_PROVIDER_ITEMS'&&r.mode===(c.full||c.noBaseline?'full':'incremental')),'UI changed persistence mode');
   checks.push('Kindle completion: '+c.name+'; category statistics remain in diagnostics');
  }finally{frame.remove();}
 }
 return checks;
}
