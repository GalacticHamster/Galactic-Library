/* Runs in the website's MAIN world. No extension API, storage or new requests. */
(function(){
  'use strict';
  const C=globalThis.GLConsoleValidationCore;if(!C)return;
  const provider=C.providerForLocation(location);if(!provider)return;
  const ledger=C.createLedger(provider),originalFetch=globalThis.fetch;
  const xhr=globalThis.XMLHttpRequest?.prototype,originalOpen=xhr?.open,originalSend=xhr?.send,xhrInfo=new WeakMap();
  let active=true;
  async function inspect(response,info){
    if(!active||!info)return;
    try{
      if(response.status!==200){ledger.observe(info,response.status,null);return;}
      const copy=response.clone(),reader=copy.body?.getReader();if(!reader){ledger.observe(info,response.status,null);return;}
      let size=0,chunks=[];
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){void reader.cancel();ledger.observe(info,response.status,null);return;}chunks.push(value);}}
      finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const body=JSON.parse(new TextDecoder().decode(bytes));if(active)ledger.observe(info,response.status,body);
    }catch{if(active)ledger.observe(info,response.status,null);/* Never log private errors. */}
  }
  function wrappedFetch(...args){
    const result=Reflect.apply(originalFetch,this,args);
    // Request headers, cookies and token fields are deliberately never inspected.
    const info=C.requestInfo(provider,args[0],args[1]);
    if(info)void result.then(response=>inspect(response,info),()=>{if(active)ledger.observe(info,0,null);});
    return result;
  }
  function wrappedOpen(method,url,...rest){
    const result=Reflect.apply(originalOpen,this,[method,url,...rest]);xhrInfo.set(this,{method,url});return result;
  }
  function wrappedSend(body){
    const input=xhrInfo.get(this),info=input?C.requestInfo(provider,input.url,{method:input.method,body}):null;
    if(info)this.addEventListener('loadend',()=>{
      if(!active)return;
      if(this.status!==200){ledger.observe(info,this.status,null,'xhr');return;}
      try{const value=this.responseType==='json'?this.response:(!this.responseType||this.responseType==='text')&&this.responseText.length<=2*1024*1024?JSON.parse(this.responseText):null;ledger.observe(info,this.status,value,'xhr');}catch{ledger.observe(info,this.status,null,'xhr');}
    },{once:true});
    return Reflect.apply(originalSend,this,[body]);
  }
  globalThis.fetch=wrappedFetch;if(xhr){xhr.open=wrappedOpen;xhr.send=wrappedSend;}
  function stop(){active=false;if(globalThis.fetch===wrappedFetch)globalThis.fetch=originalFetch;if(xhr?.open===wrappedOpen)xhr.open=originalOpen;if(xhr?.send===wrappedSend)xhr.send=originalSend;}
  addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='gl-console-validation-request'||
      typeof event.data.nonce!=='string'||!/^[a-f0-9]{32}$/.test(event.data.nonce)||!['report','stop'].includes(event.data.action))return;
    if(event.data.action==='stop')stop();
    window.postMessage({channel:'gl-console-validation-report',nonce:event.data.nonce,report:{...ledger.report(),active}},location.origin);
  });
  setTimeout(stop,15*60*1000);
})();
