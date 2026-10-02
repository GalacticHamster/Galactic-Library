// Firefox content scripts cannot access extension-origin IndexedDB. Never put
// private library/API-key data or change payloads in public storage.local.
export const PRIVATE_STORAGE_CHANGED='GL_PRIVATE_STORAGE_CHANGED';
export function isFirefoxRuntime(runtime){return runtime?.getURL?.('').startsWith('moz-extension://')===true;}
export function createPrivateStorage(indexedDB,onChanged=()=>{}){
  if(!indexedDB?.open)throw Error('Private library storage is unavailable.');
  let opening;
  const open=()=>opening??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('galactic-library-private',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('values');
    request.onerror=()=>{opening=null;reject(Error('Could not open private library storage.'));};
    request.onblocked=()=>reject(Error('Private library storage is blocked. Close other library pages and reload.'));
    request.onsuccess=()=>{const database=request.result;database.onversionchange=()=>{database.close();opening=null;};resolve(database);};
  });
  async function transact(mode,work){
    const database=await open();return new Promise((resolve,reject)=>{
      const transaction=database.transaction('values',mode),store=transaction.objectStore('values');let result;
      transaction.oncomplete=()=>resolve(result);transaction.onabort=transaction.onerror=()=>reject(Error('Private library storage operation failed.'));
      try{work(store,value=>{result=value;});}catch(error){transaction.abort();reject(error);}
    });
  }
  function changed(keys){try{onChanged(keys);}catch{/* A committed write must not be reported as failed by a UI refresh. */}}
  return {
    ready:()=>open().then(()=>undefined),
    get:defaults=>transact('readonly',(store,done)=>{
      if(defaults===null){const result={},cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){result[row.key]=row.value;row.continue();}else done(result);};return;}
      const keys=typeof defaults==='string'?[defaults]:Array.isArray(defaults)?defaults:Object.keys(defaults??{}),result=typeof defaults==='object'&&!Array.isArray(defaults)?{...defaults}:{};done(result);
      for(const key of keys){const request=store.get(key);request.onsuccess=()=>{if(request.result!==undefined)Object.defineProperty(result,key,{value:request.result,enumerable:true,configurable:true,writable:true});};}
    }),
    async set(updates){await transact('readwrite',store=>{for(const [key,value]of Object.entries(updates))store.put(value,key);});changed(Object.keys(updates));},
    async remove(keys){const list=Array.isArray(keys)?keys:[keys];await transact('readwrite',store=>{for(const key of list)store.delete(key);});changed(list);}
  };
}
export function libraryStorageArea(browser,indexedDB,onChanged){return isFirefoxRuntime(browser.runtime)?createPrivateStorage(indexedDB,onChanged):browser.storage.local;}
