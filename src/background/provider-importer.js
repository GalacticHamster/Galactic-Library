import {builtinCompanions,effectiveExternalClientIds} from '../lib/companion-identities.js';

export const PURCHASE_IMPORTERS={humble:{name:'Humble Library',url:'https://www.humblebundle.com/home/purchases'},fanatical:{name:'Fanatical Library',url:'https://www.fanatical.com/en/orders'}};

/** Read-only discovery. A responding importer is not permission to share purchases. */
export async function discoverProviderImporter(runtime,provider,manual=[],timeoutMs=1500,tabId,roleHints=new Map()){
 const config=PURCHASE_IMPORTERS[provider];if(!config)throw Error('Unsupported importer.');
 const official=builtinCompanions(runtime).find(p=>p.role===(provider==='humble'?'hb':'fan')).id;
 const results=await Promise.all(effectiveExternalClientIds(manual,runtime).map(async id=>{
  if(roleHints.has(id)&&roleHints.get(id)!==provider)return {id};
  let timer;try{
   const reply=await Promise.race([runtime.sendMessage(id,{type:'PING',apiVersion:1}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timed out')),timeoutMs);})]);
   if(reply?.ok===true&&reply.apiVersion===1&&reply.ready===true&&['humble','fanatical'].includes(reply.purchaseProvider))roleHints.set(id,reply.purchaseProvider);
   if(reply?.ok===true&&reply.apiVersion===1&&reply.ready===true&&reply.purchaseProvider===provider){
    // Released API-1 companions already provide an Orders/Purchases importer.
    const legacy=reply.capabilities?.providerImporter===undefined&&/^1\.\d+\.\d+$/u.test(reply.appVersion??'');
    const usable=reply.capabilities?.providerImporter===1||legacy;
    return {id,usable,uncertain:!usable,pageStatus:reply.capabilities?.importerPageStatus===1};
   }
   return {id,uncertain:reply?.purchaseProvider!== (provider==='humble'?'fanatical':'humble')};
  }catch(error){return {id,uncertain:!/receiving end|establish connection|does not exist|Missing peer/iu.test(error?.message??'')};}
  finally{clearTimeout(timer);}
 }));
 const peer=results.find(r=>r.usable&&r.id===official)??results.find(r=>r.usable);
 if(peer){
  let pageReady;
  if(peer.pageStatus&&Number.isInteger(tabId)){
   let timer;try{const reply=await Promise.race([runtime.sendMessage(peer.id,{type:'GET_IMPORTER_STATUS',apiVersion:1,tabId}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs);})]);pageReady=reply?.ok===true&&reply.present===true;}catch{pageReady=false;}finally{clearTimeout(timer);}
  }
  return {owner:'companion',provider,name:config.name,...(pageReady!==undefined?{pageReady}:{})};
 }
 return {owner:results.some(r=>r.uncertain)?'unavailable':'galactic',provider,name:config.name};
}

export function createProviderImporterHandler({browser,allowed,isProviderPage}){
 const roleHints=new Map(); // Routing hints only; every selected peer is still probed live.
 return (request,sender,respond)=>{
  if(!['GET_PROVIDER_IMPORTER','OPEN_PURCHASE_IMPORTER'].includes(request?.type))return false;
  const provider=request.provider,config=PURCHASE_IMPORTERS[provider],own=sender.id===browser.runtime.id;
  const options=own&&sender.url?.startsWith(browser.runtime.getURL(''));
  if(!config||!own||!options&&!isProviderPage(provider,sender.url)){respond({ok:false,error:'Open the matching provider or Galactic Library page.'});return false;}
  (async()=>{
   const result=await discoverProviderImporter(browser.runtime,provider,await allowed(),1500,sender.tab?.id,roleHints);
   if(request.type==='OPEN_PURCHASE_IMPORTER'){
    // Fixed provider URL; no remote import endpoint, records or consent are sent.
    await browser.tabs.create({url:config.url});
   }
   return {ok:true,...result};
  })().then(respond,()=>respond({ok:false,error:'Could not check the provider importer. Reload and try again.'}));return true;
 };
}
