/* MAIN world, Nintendo portal only. Observe website-owned requests unchanged.
 * Retain neutral card projections, never request bodies, headers or credentials.
 */
(function(){
  'use strict';
  if(location.origin!=='https://accounts.nintendo.com'||!/^\/portal\/vgcs(?:\/|$)/u.test(location.pathname)||!globalThis.GalacticConsoleLibrary)return;
  const endpoint='https://wb.lp1.savanna.srv.nintendo.net/graphql',pages=new Map();
  let account=null,problem='',epoch=0,pending=0,generation=0,scope=null;
  // Optional GraphQL input objects may be omitted, null, or empty. An empty
  // object does not select a card type/status; nonempty inputs need validation.
  const emptySelection=value=>value==null||typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0;
  function currentAccount(){
    const raw=document.getElementById('state')?.getAttribute('data-json');
    if(typeof raw!=='string'||raw.length>2097152)throw Error('Nintendo account information is unavailable. Sign in and reload this page.');
    let value;try{value=JSON.parse(raw)?.user?.obfuscatedId;}catch{}
    if(typeof value!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/u.test(value))throw Error('Nintendo account information is unreadable. Sign in and reload this page.');
    return value;
  }
  function request(input,options={}){
    try{
      const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
      if(url.href!==endpoint||String(options.method??input?.method??'GET').toUpperCase()!=='POST'||typeof options.body!=='string'||options.body.length>262144)return null;
      const body=JSON.parse(options.body),v=body.variables;
      if(body.operationName!=='getVgcsVgcs')return null;
      if(typeof body.query!=='string'||/\bmutation\b/iu.test(body.query)||!/\bvgcViewsV2\b/u.test(body.query)||!/\bisHidden\s*:\s*false\b/u.test(body.query))return {unsupported:'GL could not recognize Nintendo’s card-list query. No cards were imported. (NINTENDO_QUERY_SHAPE)'};
      if(!Number.isSafeInteger(v?.offset)||v.offset<0||!Number.isSafeInteger(v.limit)||v.limit<1||v.limit>300)return {unsupported:'Nintendo’s card-list paging settings are not supported. No cards were imported. (NINTENDO_PAGING)'};
      if(!Number.isSafeInteger(v.shopId)||v.shopId<1||v.shopId>1000||v.sortBy!=='ACTIVATED_DATE'||!['ASC','DESC'].includes(v.order)||['country','language','nasLanguage'].some(k=>v[k]!=null&&(typeof v[k]!=='string'||v[k].length>30)))return {unsupported:'Nintendo sent library settings GL does not yet recognize. No cards were imported. (NINTENDO_SCOPE_SETTINGS)'};
      if(!emptySelection(v.vgcViewType))return {unsupported:'Nintendo sent card-type settings GL does not yet recognize. These may be website defaults rather than a filter you selected. No cards were imported. (NINTENDO_CARD_TYPE)'};
      if(!emptySelection(v.vgcViewStatus))return {unsupported:'Nintendo sent card-status settings GL does not yet recognize. These may be website defaults rather than a filter you selected. No cards were imported. (NINTENDO_CARD_STATUS)'};
      if(v.isHidden===true)return {unsupported:'Switch to Nintendo’s non-hidden card list before importing. No cards were imported. (NINTENDO_HIDDEN_SCOPE)'};
      // Sorting changes presentation, not membership. Still bind every page in
      // a traversal to its direction so a mid-list sort cannot mix two scans.
      return {offset:v.offset,limit:v.limit,scope:JSON.stringify([v.shopId,v.country??null,v.language??null,v.nasLanguage??null,v.sortBy,v.order])};
    }catch{return null;}
  }
  function emitProgress(){
    const ordered=[...pages.values()].sort((a,b)=>a.offset-b.offset);
    let offset=0,contiguousItems=0,total=null,complete=false;
    for(const page of ordered){
      if(page.offset!==offset)break;
      if(page.expectedCount!=null)total=page.expectedCount;
      contiguousItems+=page.items.length;
      offset=page.nextOffset;
      if(page.complete)complete=true;
    }
    const isComplete=complete&&(total==null||contiguousItems===total);
    window.postMessage({channel:'gl-nintendo-progress',loaded:contiguousItems,total,complete:isComplete,pending:pending>0,problem:problem||''},location.origin);
  }
  function begin(info){
    if(!info)return null;
    epoch++;pending++;
    if(info.unsupported){pages.clear();problem=info.unsupported;emitProgress();return {...info,generation};}
    // A new first page starts a new observation set. Never union scans or filters.
    if(info.offset===0){generation++;pages.clear();problem='';scope=info.scope;}
    else if(info.scope!==scope){pages.clear();problem='Nintendo changed the library scope between pages. Reload before importing.';}
    let actor;try{actor=currentAccount();}catch(error){problem=error.message;}
    if(account&&actor!==account){pages.clear();problem='The signed-in Nintendo account changed. Reload the page before importing.';}
    account=actor??null;
    emitProgress();
    return {...info,account,generation};
  }
  function finish(ticket,status,body){
    if(!ticket)return;pending--;epoch++;
    if(ticket.generation!==generation)return;
    if(ticket.unsupported){emitProgress();return;}
    try{
      if(ticket.account!==account||currentAccount()!==ticket.account)throw Error('The signed-in Nintendo account changed. Reload the page before importing.');
      if(status!==200)throw Error('Nintendo could not load the card list. Reload the page; saved GL items are unchanged.');
      const parsed=globalThis.GalacticConsoleLibrary.parseNintendoPage(body,{offset:ticket.offset,limit:ticket.limit,accountNaId:account});
      if(pages.size>=500&&!pages.has(parsed.offset)||[...pages.values()].filter(p=>p.offset!==parsed.offset).reduce((n,p)=>n+p.items.length,0)+parsed.items.length>50000)throw Error('The loaded card list exceeds the safe import limit.');
      pages.set(parsed.offset,parsed);
    }catch(error){problem=error.message;pages.clear();}
    emitProgress();
  }
  const originalFetch=globalThis.fetch;
  globalThis.fetch=function(...args){
    const info=request(args[0],args[1]),ticket=begin(info);let result;
    try{result=Reflect.apply(originalFetch,this,args);}catch(error){finish(ticket,0,null);throw error;}
    if(ticket)void result.then(async response=>{
      try{
        if(response.status!==200){finish(ticket,response.status,null);return;}
        const reader=response.clone().body?.getReader();if(!reader)throw Error();
        const chunks=[];let size=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){void reader.cancel();throw Error();}chunks.push(value);}}finally{reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        finish(ticket,200,JSON.parse(new TextDecoder().decode(bytes)));
      }catch{finish(ticket,0,null);}
    },()=>finish(ticket,0,null));
    return result;
  };
  const proto=globalThis.XMLHttpRequest?.prototype,originalOpen=proto?.open,originalSend=proto?.send,requests=new WeakMap();
  if(proto){
    proto.open=function(method,url,...rest){
      const result=Reflect.apply(originalOpen,this,[method,url,...rest]);requests.delete(this);
      try{if(String(method).toUpperCase()==='POST'&&new URL(url,location.href).href===endpoint)requests.set(this,{method:'POST',url:endpoint});}catch{/* Other website requests are not retained. */}
      return result;
    };
    proto.send=function(body){
      const input=requests.get(this),ticket=begin(input?request(input.url,{method:input.method,body}):null);
      if(ticket)this.addEventListener('loadend',()=>{
        try{finish(ticket,this.status,this.status===200?(this.responseType==='json'?this.response:(!this.responseType||this.responseType==='text')&&this.responseText.length<=2097152?JSON.parse(this.responseText):null):null);}catch{finish(ticket,0,null);}
      },{once:true});
      try{return Reflect.apply(originalSend,this,[body]);}catch(error){finish(ticket,0,null);throw error;}
    };
  }
  async function snapshot(){
    if(problem)throw Error(problem);
    if(pending)throw Error('Nintendo is still loading cards. Wait for the list to finish, then try again.');
    if(!account||currentAccount()!==account)throw Error('Reload this Nintendo library page before importing.');
    const version=epoch,ordered=[...pages.values()].sort((a,b)=>a.offset-b.offset),items=[],seen=new Set();
    let offset=0,total=null,complete=false;
    for(const page of ordered){
      if(complete||page.offset!==offset||total!==null&&page.expectedCount!==total)throw Error('The loaded card list is incomplete. Browse all cards or reload the page before importing.');
      total=page.expectedCount;
      for(const item of page.items){if(seen.has(item.providerItemId))throw Error('Nintendo repeated a card. Reload the page before importing.');seen.add(item.providerItemId);items.push(item);}
      offset=page.nextOffset;complete=page.complete;
    }
    if(!complete||total!==items.length)throw Error('The loaded card list is incomplete. Browse all cards or reload the page before importing.');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('nintendo\u0000'+account));
    if(version!==epoch||pending||problem||currentAccount()!==account)throw Error('The Nintendo library changed while preparing the import. Try again.');
    const fingerprint=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
    const S=globalThis.GalacticProviderSnapshot;
    return {items,sourceAccountFingerprint:fingerprint,captureVersion:version,snapshot:S.completeProviderSnapshot('nintendo',items,[S.completedScope('non-hidden-virtual-cards',items.length,total,'reported-count',ordered.length)]),
      counts:{cards:items.length,products:new Set(items.map(i=>i.metadata.applicationId)).size,owned:items.filter(i=>i.ownership==='owned').length,borrowed:items.filter(i=>i.ownership==='borrowed').length,unknown:items.filter(i=>i.ownership==='unknown').length}};
  }
  addEventListener('message',async event=>{
    const r=event.data;
    if(event.source!==window||event.origin!==location.origin)return;
    if(r?.channel==='gl-nintendo-status-request'){emitProgress();return;}
    if(r?.channel!=='gl-nintendo-request'||!['prepare','verify'].includes(r.action)||typeof r.nonce!=='string'||!/^[a-f0-9]{32}$/u.test(r.nonce))return;
    try{const value=await snapshot();window.postMessage({channel:'gl-nintendo-response',nonce:r.nonce,ok:true,...(r.action==='verify'?{sourceAccountFingerprint:value.sourceAccountFingerprint,captureVersion:value.captureVersion}:value)},location.origin);}
    catch(error){window.postMessage({channel:'gl-nintendo-response',nonce:r.nonce,ok:false,error:error.message},location.origin);}
  });
}());
