/* MAIN world: observed public query hashes and Apollo client metadata stay in
 * page memory. All requests use the existing browser session; no token copying.
 */
(function(){
  'use strict';
  if(location.origin!=='https://library.playstation.com'||!globalThis.GalacticConsoleLibrary)return;
  const endpoint='https://web.np.playstation.com/api/graphql/v1/op',nativeFetch=globalThis.fetch;
  let profileQuery=null,purchaseQuery=null,observedActor=null,epoch=0,pending=0,busy=false,prepared=null;
  const clientKeys=['apollographql-client-name','apollographql-client-version'];
  const accountId=body=>{
    const id=body?.data?.oracleUserProfileRetrieve?.accountId;
    if(body?.errors?.length||typeof id!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/u.test(id))throw Error('PlayStation did not confirm the signed-in account. Sign in and reload the library.');
    return id;
  };
  function clientMetadata(input,options){
    try{
      const h=options.headers??input?.headers;if(!h)return null;
      const result={};for(const key of clientKeys){
        let value;
        if(Array.isArray(h)){const pairs=h.slice(0,100).filter(p=>Array.isArray(p)&&typeof p[0]==='string'&&p[0].toLowerCase()===key);if(pairs.length!==1)return null;value=pairs[0][1];}
        else if(typeof h.get==='function')value=h.get(key);
        else {const keys=Object.keys(h).filter(k=>k.toLowerCase()===key);if(keys.length!==1)return null;value=h[keys[0]];}
        if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 ._/@:+-]{0,127}$/u.test(value))return null;
        result[key]=value;
      }return Object.freeze(result);
    }catch{return null;}
  }
  function query(input,options={}){
    try{
      const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);
      if(u.origin+u.pathname!==endpoint||u.username||u.password||String(options.method??input?.method??'GET').toUpperCase()!=='GET')return null;
      const operation=u.searchParams.get('operationName');if(!['getProfileOracle','getPurchasedGameList'].includes(operation)||u.searchParams.has('query'))return null;
      if([...u.searchParams.keys()].some(k=>!['operationName','variables','extensions'].includes(k)))return null;
      const variables=JSON.parse(u.searchParams.get('variables')),extensions=JSON.parse(u.searchParams.get('extensions'));
      if(!variables||typeof variables!=='object'||Array.isArray(variables)||!extensions||Object.keys(extensions).some(k=>k!=='persistedQuery')||extensions.persistedQuery?.version!==1||!/^[a-f0-9]{64}$/iu.test(extensions.persistedQuery.sha256Hash))return null;
      if(operation==='getProfileOracle'&&Object.keys(variables).length)return null;
      if(operation==='getPurchasedGameList'&&(Object.keys(variables).some(k=>!['start','size','isActive','platform','sortBy','sortDirection'].includes(k))||!Number.isSafeInteger(variables.start)||variables.start<0||!Number.isSafeInteger(variables.size)||variables.size<1||variables.size>100||variables.isActive!==true||!Array.isArray(variables.platform)||variables.platform.length!==2||!variables.platform.includes('ps4')||!variables.platform.includes('ps5')||variables.sortBy!=='ACTIVE_DATE'||variables.sortDirection!=='desc'))return null;
      return {operation,hash:extensions.persistedQuery.sha256Hash,variables,clientMetadata:operation==='getProfileOracle'?clientMetadata(input,options):null};
    }catch{return null;}
  }
  async function body(response){
    if(response.status!==200)throw Error('PlayStation could not load the account or purchase list. Sign in and retry; saved GL items are unchanged.');
    const reader=response.body?.getReader();if(!reader)throw Error('PlayStation returned an unreadable response.');
    const chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){void reader.cancel();throw Error('PlayStation response exceeds the safe import limit.');}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('PlayStation returned an unreadable response.');}
  }
  globalThis.fetch=function(...args){
    const result=Reflect.apply(nativeFetch,this,args),info=query(args[0],args[1]);
    if(info){epoch++;pending++;prepared=null;void result.then(async response=>{
      try{
        const value=await body(response.clone());
        if(info.operation==='getProfileOracle'){
          const actor=accountId(value);if(info.clientMetadata){profileQuery=info;observedActor=actor;}
        }else {globalThis.GalacticConsoleLibrary.parsePlayStationPage(value,{offset:info.variables.start,limit:info.variables.size});purchaseQuery=info;}
      }catch{/* Never retain/log account responses or arbitrary website errors. */}
      finally{pending--;epoch++;}
    },()=>{pending--;epoch++;});}
    return result;
  };
  async function request(info,variables,signal){
    const url=new URL(endpoint);url.search=new URLSearchParams({operationName:info.operation,variables:JSON.stringify(variables),extensions:JSON.stringify({persistedQuery:{version:1,sha256Hash:info.hash}})});
    const headers={Accept:'application/json','Content-Type':'application/json'};
    if(info.operation==='getProfileOracle')for(const key of clientKeys)headers[key]=info.clientMetadata[key];
    const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,20000);signal?.addEventListener('abort',abort,{once:true});
    try{signal?.throwIfAborted();return await body(await nativeFetch(url.href,{credentials:'include',redirect:'error',headers,signal:controller.signal}));}
    catch(error){if(controller.signal.aborted)throw Error('PlayStation request timed out or was cancelled. No library items were saved.');if(error?.message?.startsWith('PlayStation'))throw error;throw Error('PlayStation could not be reached. Retry after the website finishes loading.');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async function identity(signal){
    if(!profileQuery||!purchaseQuery||!observedActor||pending)throw Error('Let the PlayStation Purchased library finish loading, then try again. If needed, reload the page.');
    const version=epoch,actor=accountId(await request(profileQuery,{},signal));
    if(version!==epoch||actor!==observedActor)throw Error('The PlayStation account or library changed. Reload before importing.');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('playstation\u0000'+actor));
    if(version!==epoch)throw Error('The PlayStation page changed. Start a fresh import.');
    return {actor,version,sourceAccountFingerprint:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')};
  }
  function unchanged(version,actor){if(epoch!==version||pending||observedActor!==actor)throw Error('The PlayStation account or page changed during import. No items were saved. Try again.');}
  addEventListener('message',async event=>{
    const r=event.data;if(event.source!==window||event.origin!==location.origin||r?.channel!=='gl-playstation-request'||!['identify','prepare','verify'].includes(r.action)||typeof r.nonce!=='string'||!/^[a-f0-9]{32}$/u.test(r.nonce))return;
    const reply=value=>window.postMessage({channel:'gl-playstation-response',nonce:r.nonce,...value},location.origin);
    if(busy){reply({ok:false,error:'Another PlayStation check is running. Wait for it to finish.'});return;}
    busy=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
    try{
      const who=await identity(controller.signal);
      if(r.action==='identify'){reply({ok:true,sourceAccountFingerprint:who.sourceAccountFingerprint});return;}
      if(r.action==='verify'){
        if(!prepared||prepared.version!==who.version||prepared.actor!==who.actor||Date.now()-prepared.at>120000)throw Error('The prepared PlayStation library is no longer current. Start a fresh import.');
        reply({ok:true,sourceAccountFingerprint:who.sourceAccountFingerprint,captureVersion:prepared.version});return;
      }
      let first;
      const result=await globalThis.GalacticConsoleLibrary.collectLibrary({provider:'playstation',accountIdentity:who.actor,signal:controller.signal,
        currentAccountIdentity:()=>{unchanged(who.version,who.actor);return observedActor;},
        readPage:async({offset,limit,signal})=>{const raw=await request(purchaseQuery,{...purchaseQuery.variables,start:offset,size:limit},signal);if(offset===0)first=JSON.stringify(globalThis.GalacticConsoleLibrary.parsePlayStationPage(raw,{offset,limit}));return raw;},
        onProgress:counts=>reply({ok:true,progress:true,pagesRead:counts.pagesRead,itemsRead:counts.items})});
      const end=await identity(controller.signal);unchanged(who.version,who.actor);
      const head=await request(purchaseQuery,{...purchaseQuery.variables,start:0,size:24},controller.signal);
      if(end.actor!==who.actor||JSON.stringify(globalThis.GalacticConsoleLibrary.parsePlayStationPage(head))!==first)throw Error('The PlayStation purchase list changed while paging. Start a fresh import; saved items are unchanged.');
      unchanged(who.version,who.actor);prepared={actor:who.actor,version:who.version,at:Date.now()};
      reply({ok:true,items:result.items,snapshot:result.snapshot,sourceAccountFingerprint:who.sourceAccountFingerprint,captureVersion:who.version});
    }catch(error){prepared=null;reply({ok:false,error:typeof error?.message==='string'&&!/https?:/iu.test(error.message)?error.message.slice(0,500):'PlayStation could not complete the check. Saved GL items are unchanged.'});}
    finally{clearTimeout(timer);busy=false;}
  });
}());
