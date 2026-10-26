// Navigation intent only; never an import lease, profile or authentication data.
export const XBOX_OWNED_URL='https://play.xbox.com/library?tab=fullLibrary&view=grid&catalog=owned';
export function currentXboxSender(sender){
 try{
  const source=new URL(sender.url),current=new URL(sender.tab?.url);
  if(sender.frameId===0&&source.origin==='https://play.xbox.com'&&current.origin===source.origin&&/^\/library\/?$/u.test(current.pathname))return {...sender,url:current.href};
 }catch{}
 return sender;
}
export function createXboxNavigationHandler(browser,now=Date.now){
 const key=id=>'galacticXboxImportLaunch:'+id;
 const own=sender=>sender?.id===browser.runtime.id&&typeof sender.url==='string'&&sender.url.startsWith(browser.runtime.getURL(''));
 const library=sender=>{try{const u=new URL(currentXboxSender(sender).url);return sender.frameId===0&&sender.id===browser.runtime.id&&Number.isInteger(sender.tab?.id)&&u.origin==='https://play.xbox.com'&&/^\/library\/?$/u.test(u.pathname);}catch{return false;}};
 const chains=new Map();
 browser.tabs?.onRemoved?.addListener(id=>{browser.storage.session.remove(key(id)).catch(()=>{});});
 return (request,sender,reply)=>{
  if(!['OPEN_XBOX_IMPORT','XBOX_IMPORT_LAUNCH'].includes(request?.type))return;
  if(request.type==='OPEN_XBOX_IMPORT'){
   if(!own(sender)){reply({ok:false,error:'Open Xbox from Galactic Library.'});return;}
   (async()=>{
    let tab;
    try{
     // Persist intent before the provider can load; no auth URL is inspected.
     tab=await browser.tabs.create({url:'about:blank'});
     if(!Number.isInteger(tab?.id))throw Error('Missing tab');
     await browser.storage.session.set({[key(tab.id)]:{expiresAt:now()+10*60*1000}});
     await browser.tabs.update(tab.id,{url:XBOX_OWNED_URL});reply({ok:true});
    }catch{if(Number.isInteger(tab?.id))await browser.storage.session.remove(key(tab.id)).catch(()=>{});reply({ok:false,error:'Could not open Xbox Library. Please try again.'});}
   })();return true;
  }
  if(!library(sender)||!['get','consume'].includes(request.action)){reply({ok:false,error:'Xbox navigation is available only in its Library tab.'});return;}
  const id=sender.tab.id,previous=chains.get(id)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
   const value=(await browser.storage.session.get(key(id)))[key(id)];
   if(!Number.isFinite(value?.expiresAt)||value.expiresAt<=now()||value.expiresAt>now()+10*60*1000){await browser.storage.session.remove(key(id));reply({ok:true,pending:false});return;}
   if(request.action==='consume')await browser.storage.session.remove(key(id));
   reply({ok:true,pending:true,...(request.action==='consume'?{url:XBOX_OWNED_URL}:{})});
  }).catch(()=>reply({ok:false,error:'Could not recover the Xbox destination. Open Owned manually.'}));
  chains.set(id,next);next.finally(()=>{if(chains.get(id)===next)chains.delete(id);});return true;
 };
}
