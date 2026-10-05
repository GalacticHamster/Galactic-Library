// Audit-only: two fixed public control pages, disposable anonymous Chrome.
// Never loads GL storage, runs a library scan, changes production code, or saves
// cookies/headers/full HTML. Event deadlines bound observations, not readiness.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';

const controls=[{book:'Four',asin:'B018YP1STO',range:'59-80'},{book:'Five',asin:'B01D2052NE',range:'81-100'}];
const output=process.argv[2];if(!output)throw Error('Usage: node scripts/recon-kindle-amazon.mjs REPORT_JSON');
const adapter=await readFile(new URL('../src/providers/kindle.js',import.meta.url),'utf8');
const profile=await mkdtemp(join(tmpdir(),'gl-amazon-recon-'));
const child=spawn(process.env.CHROME_BIN??'C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
 '--disable-component-update','--disable-sync','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'
],{windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
const exited=new Promise(done=>child.once('exit',done));
let nextId=0,input=Buffer.alloc(0);const pending=new Map(),listeners=new Set();
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{
 const id=++nextId,deadline=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline: '+method));},25000);
 pending.set(id,{resolve,reject,deadline});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
});}
function fail(error){for(const p of pending.values()){clearTimeout(p.deadline);p.reject(error);}pending.clear();}
child.on('error',fail);child.on('exit',()=>fail(Error('Audit browser exited')));
child.stdio[4].on('data',bytes=>{input=Buffer.concat([input,bytes]);let at;
 while((at=input.indexOf(0))>=0){const message=JSON.parse(input.subarray(0,at));input=input.subarray(at+1);
  if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.deadline);message.error?p.reject(Error(message.error.message)):p.resolve(message.result);}}
  else for(const listener of listeners)listener(message);
 }
 if(input.length>32*1024*1024)fail(Error('Excessive CDP message'));
});
const evidence=[];
try{
 for(const control of controls){
  const url='https://www.amazon.com/dp/'+control.asin,{targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const row={book:control.book,url,context:'Disposable anonymous headless Chrome; no user profile or installed GL; navigation plus one same-origin GL-options fetch if accessible',requests:[],laterResponseMatches:[]};
  const responses=new Map(),finished=new Set();let mainId;const bodyWaiters=new Map();
  const listener=event=>{if(event.sessionId!==sessionId)return;const p=event.params;
   if(event.method==='Network.loadingFinished'){finished.add(p.requestId);bodyWaiters.get(p.requestId)?.();}
   if(event.method==='Network.responseReceived'){
    responses.set(p.requestId,{url:p.response.url,status:p.response.status,type:p.type,mime:p.response.mimeType});
    if(p.type==='Document'&&p.response.url.includes('/dp/'+control.asin))mainId=p.requestId;
   }
  };listeners.add(listener);
  await send('Network.enable',{},sessionId);await send('Page.enable',{},sessionId);
  const watch=`(()=>{
   const selectors=['#bookDescription_feature_div','#productDescription','#featurebullets_feature_div','#productOverview_feature_div','[data-feature-name="bookDescription"]'];
   const compact=t=>String(t??'').replace(/\\s+/g,' ').trim();
   const expected=${JSON.stringify(control.range)},needle=t=>/collects\\s+100\\s+bullets/i.test(t)&&t.includes(expected);
   let observer,last='',resolveWatch,deadline;
   const state={events:[],descriptionChangeCount:0};
   function manifestGeometry(node){
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let leaf;
    while(leaf=walker.nextNode()){
     if(!needle(leaf.textContent))continue;
     const range=document.createRange(),at=leaf.textContent.search(/collects/i);range.setStart(leaf,at);range.setEnd(leaf,Math.min(leaf.length,at+55));
     const rect=range.getBoundingClientRect(),ancestors=[];let visible=rect.width>0&&rect.height>0;
     for(let p=leaf.parentElement;p;p=p.parentElement){const style=getComputedStyle(p),box=p.getBoundingClientRect();
      const clipped=/hidden|clip|auto|scroll/.test(style.overflowY)&&(rect.bottom>box.bottom+1||rect.top<box.top-1);
      if(clipped||style.display==='none'||style.visibility==='hidden')visible=false;
      if(p===node||clipped||style.maxHeight!=='none'||/expander|clamp/.test(p.className))ancestors.push({tag:p.tagName,id:p.id,className:String(p.className).slice(0,160),display:style.display,maxHeight:style.maxHeight,overflowY:style.overflowY,height:Math.round(box.height),clipped});
      if(p===node)break;
     }return {visibleByGeometry:visible,ancestors};
    }return null;
   }
   function describe(doc,live){
    const regions=[];
    for(const selector of selectors)for(const node of doc.querySelectorAll(selector)){
     const text=compact(node.textContent),visible=live?compact(node.innerText):'';
     const styles=live?getComputedStyle(node):null;
     const geometry=live?manifestGeometry(node):null;
     regions.push({selector,length:text.length,text:text.slice(0,2500),containsExpected:needle(text),renderedTextExpected:live?needle(visible):null,visibleExpected:geometry?.visibleByGeometry??false,manifestGeometry:geometry,
      readMore:/read\\s*more/i.test(text),hiddenAttribute:node.hidden,ariaExpanded:node.getAttribute('aria-expanded'),
      style:styles?{display:styles.display,visibility:styles.visibility,maxHeight:styles.maxHeight,overflow:styles.overflow}:null,
      nestedControls:[...node.querySelectorAll('button,a,[role="button"]')].filter(n=>/read\\s*more|see\\s*more/i.test(compact(n.textContent))).slice(0,6).map(n=>({tag:n.tagName,id:n.id,text:compact(n.textContent).slice(0,70),ariaExpanded:n.getAttribute('aria-expanded'),className:String(n.className).slice(0,180)}))});
    }
    return regions;
   }
   function snap(reason){
    const regions=describe(document,true),signature=JSON.stringify(regions);
    if(signature!==last||reason!=='mutation'){
     last=signature;state.descriptionChangeCount++;
     if(state.events.length<35)state.events.push({atMs:Math.round(performance.now()),reason,readyState:document.readyState,regions});
    }
    if(regions.some(r=>r.visibleExpected)&&resolveWatch){const done=resolveWatch;resolveWatch=null;clearTimeout(deadline);done('visible-manifest-observed');}
   }
   observer=new MutationObserver(()=>snap('mutation'));observer.observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','aria-expanded']});
   document.addEventListener('DOMContentLoaded',()=>snap('DOMContentLoaded'));window.addEventListener('load',()=>snap('load'));
   window.__glAmazonRecon={state,describe,snap,needle,waitForVisible:()=>new Promise(resolve=>{resolveWatch=resolve;deadline=setTimeout(()=>{resolveWatch=null;resolve('observation-deadline; not completeness');},7000);snap('observation-start');}),stop:()=>observer.disconnect()};
  })();`;
  await send('Page.addScriptToEvaluateOnNewDocument',{source:watch},sessionId);
  const evaluated=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(result.exceptionDetails)throw Error('Page audit evaluation failed');return result.result.value;};
  try{
   row.navigation=await send('Page.navigate',{url},sessionId);
   row.observation=await evaluated('window.__glAmazonRecon?.waitForVisible()??"instrumentation not yet available"');
   row.browser=await evaluated('navigator.userAgent');
   row.dom=await evaluated('({events:__glAmazonRecon.state.events,descriptionChangeCount:__glAmazonRecon.state.descriptionChangeCount,captcha:!!document.querySelector("#captchacharacters,form[action*=validateCaptcha]"),signIn:!!document.querySelector("#ap_email,form[name=signIn]"),final:__glAmazonRecon.describe(document,true)})');
   await evaluated(adapter+';true');
   if(mainId){
    if(!finished.has(mainId))await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>{bodyWaiters.delete(mainId);reject(Error('Main response completion deadline'));},18000);bodyWaiters.set(mainId,()=>{clearTimeout(deadline);bodyWaiters.delete(mainId);resolve();});});
    const body=await send('Network.getResponseBody',{requestId:mainId},sessionId),html=body.base64Encoded?Buffer.from(body.body,'base64').toString():body.body;
    row.navigationResponse={...responses.get(mainId),bytes:Buffer.byteLength(html)};
    row.navigationStatic=await evaluated(`(()=>{const html=${JSON.stringify(html)},doc=new DOMParser().parseFromString(html,'text/html');return {title:doc.title,challengeMarkers:{captcha:!!doc.querySelector('#captchacharacters'),continueShopping:/continue shopping/i.test(doc.body.textContent),robotCheck:/robot check/i.test(doc.title)},regions:__glAmazonRecon.describe(doc,false),selected:GalacticKindle.kindleContentsStatementFromDocument(doc),rawClauses:[...html.matchAll(/Collects[^<>]{0,140}/gi)].slice(0,10).map(m=>m[0]),allDomExpected:__glAmazonRecon.needle(doc.documentElement.textContent),scriptMatches:[...doc.scripts].filter(s=>__glAmazonRecon.needle(s.textContent)).slice(0,5).map(s=>({type:s.type,excerpt:s.textContent.match(/.{0,80}Collects.{0,140}/i)?.[0]??'expected range found'}))};})()`);
   }else row.navigationResponse={error:'No matching Document response captured'};
   row.liveSelected=await evaluated('GalacticKindle.kindleContentsStatementFromDocument(document)');
   row.glStyleFetch=await evaluated(`(async()=>{if(location.origin!=='https://www.amazon.com')return {error:'Not on control origin'};const response=await fetch(${JSON.stringify(url)},{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000)}),html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html');return {status:response.status,bytes:html.length,regions:__glAmazonRecon.describe(doc,false),selected:GalacticKindle.kindleContentsStatementFromDocument(doc),rawClauses:[...html.matchAll(/Collects[^<>]{0,140}/gi)].slice(0,10).map(m=>m[0]),allDomExpected:__glAmazonRecon.needle(doc.documentElement.textContent),scriptMatches:[...doc.scripts].filter(s=>__glAmazonRecon.needle(s.textContent)).slice(0,5).map(s=>({type:s.type,excerpt:s.textContent.match(/.{0,80}Collects.{0,140}/i)?.[0]??'expected range found'}))};})()`);
   row.expansion=await evaluated(`(()=>{const controls=[...document.querySelectorAll('#bookDescription_feature_div button,#bookDescription_feature_div a,#bookDescription_feature_div [role="button"]')].filter(n=>/^(?:read|see)\\s*more/i.test(n.textContent.trim()));const c=controls.find(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height);if(!c)return {clicked:false,reason:'No visible bounded description control'};if(c.tagName==='A'&&c.getAttribute('href')&&!/^(?:#|javascript:void\\(0\\);?$)/i.test(c.getAttribute('href')))return {clicked:false,reason:'Navigation link excluded'};c.click();__glAmazonRecon.snap('explicit-description-expansion');return {clicked:true,text:c.textContent.trim().slice(0,70),regions:__glAmazonRecon.describe(document,true)};})()`);
   row.afterExpansion=await evaluated('({regions:__glAmazonRecon.describe(document,true),events:__glAmazonRecon.state.events})');
   // Search XHR/fetch response bodies only in memory. Persist only a matching
   // contents clause, never arbitrary bodies, URL queries, headers or cookies.
   for(const [id,response]of responses){if(!['XHR','Fetch'].includes(response.type)||response.mime.includes('image'))continue;
    try{const body=await send('Network.getResponseBody',{requestId:id},sessionId),text=body.base64Encoded?Buffer.from(body.body,'base64').toString():body.body;
     const matches=[...text.matchAll(/Collects\s+100\s+BULLETS[^<>]{0,90}/gi)].map(m=>m[0]);if(matches.length){const parsed=new URL(response.url);row.laterResponseMatches.push({origin:parsed.origin,path:parsed.pathname,status:response.status,clauses:matches.slice(0,3)});}
    }catch{/* response unavailable: not negative evidence */}
   }
   row.requests=[...responses.values()].filter(r=>r.type==='Document'||['XHR','Fetch'].includes(r.type)).map(r=>{const u=new URL(r.url);return {type:r.type,origin:u.origin,path:u.pathname,status:r.status};});
  }catch(error){row.error=error.message;}
  finally{listeners.delete(listener);evidence.push(row);await send('Target.closeTarget',{targetId});}
 }
 await writeFile(output,JSON.stringify({auditOnly:true,profile:'Fresh disposable anonymous Chrome; no personal profile or signed-in session',noFullLibraryScan:true,noProductionChanges:true,noFixedSleep:true,controls:evidence},null,2)+'\n');
 console.log(JSON.stringify(evidence.map(r=>({book:r.book,status:r.navigationResponse?.status,observation:r.observation,regions:r.dom?.final?.length,staticExpected:r.navigationStatic?.allDomExpected,fetchStatus:r.glStyleFetch?.status,fetchExpected:r.glStyleFetch?.allDomExpected,error:r.error})),null,2));
}finally{
 try{await send('Browser.close');}catch{child.kill();}await exited;
 const target=resolve(profile),location=relative(resolve(tmpdir()),target);
 if(!location||isAbsolute(location)||location==='..'||location.startsWith('..'+sep)||!location.startsWith('gl-amazon-recon-'))throw Error('Unexpected anonymous-profile cleanup target');
 await rm(target,{recursive:true,force:true});
}
