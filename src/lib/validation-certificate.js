import {DATABASE_SCHEMA_VERSION} from './constants.js';
import {isCommittedSnapshot} from './committed-snapshot.js';

export const VALIDATION_CERTIFICATE_KEY='galacticLibraryValidationCertificate';
// Bump whenever database validation, normalization, source interpretation or
// canonical identity rules change. Schema compatibility alone is not proof.
export const VALIDATION_ALGORITHM_VERSION='database-validation-2026-10-16-provider-differences-v1';
export function strictDatabaseSerialization(value){
  // JSON zero follows the validator's existing numerical equality (0 === -0).
  // Reject lossy values instead of JSON's undefined/null/omission conversions.
  const check=entry=>{
    if(entry===null||typeof entry==='boolean'||typeof entry==='string')return;
    if(typeof entry==='number'&&Number.isFinite(entry))return;
    if(!entry||typeof entry!=='object')throw Error('Unsupported database value.');
    const prototype=Object.getPrototypeOf(entry);
    if(prototype!==(Array.isArray(entry)?Array.prototype:Object.prototype)&&!(prototype===null&&!Array.isArray(entry)))throw Error('Unsupported database object.');
    if(Object.hasOwn(entry,'toJSON'))throw Error('Unsupported database transformation.');
  };
  check(value);
  return JSON.stringify(value,(_key,entry)=>{
    check(entry);if(entry===null||typeof entry!=='object')return entry;
    const array=Array.isArray(entry);
    const descriptors=Object.getOwnPropertyDescriptors(entry),keys=Reflect.ownKeys(descriptors);
    if(array&&(keys.length!==entry.length+1||Object.keys(entry).some((key,index)=>key!==String(index))))throw Error('Unsupported database array.');
    for(const key of keys){
      if(array&&key==='length')continue;
      const descriptor=descriptors[key];
      if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||key==='toJSON')throw Error('Unsupported database property.');
      check(descriptor.value);
    }
    // Native storage need not retain the validator's object insertion order.
    return array?entry:Object.fromEntries(keys.sort().map(key=>[key,descriptors[key].value]));
  });
}
const digest=async serialized=>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
};
const fields=['format','schemaVersion','validationVersion','serializationVersion','algorithm','digest'];
function valid(value){
  return value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key))
    &&value.format===1&&value.schemaVersion===DATABASE_SCHEMA_VERSION
    &&value.validationVersion===VALIDATION_ALGORITHM_VERSION&&value.serializationVersion===2
    &&value.algorithm==='SHA-256'&&typeof value.digest==='string'&&/^[a-f0-9]{64}$/u.test(value.digest);
}
// Only worker-owned registered committed snapshots can mint a receipt. Session
// writes are ordered but never awaited by database saves or query responses.
export function createValidationCertificates(area){
  let generation=0,tail=Promise.resolve();const pending=new Set();
  const queue=work=>{tail=tail.then(work).catch(()=>{});return tail;};
  const available=()=>typeof area?.get==='function'&&typeof area?.set==='function'&&typeof area?.remove==='function';
  async function verifyDigest(database,{beginSpan=()=>{}}={}){
    const span=async(stage,work)=>{const end=beginSpan(stage);try{return await work();}finally{end?.();}};
    const miss=stage=>{beginSpan(stage)?.();return null;};
    try{
      if(!available())return miss('certificate_unavailable');
      if(database?.schemaVersion!==DATABASE_SCHEMA_VERSION)return miss('certificate_invalid');
      const stored=await span('certificate_read',()=>area.get(VALIDATION_CERTIFICATE_KEY));
      const certificate=stored?.[VALIDATION_CERTIFICATE_KEY];
      if(!certificate)return miss('certificate_missing');
      if(!valid(certificate))return miss('certificate_invalid');
      const end=beginSpan('certificate_serialize');let serialized;
      try{serialized=strictDatabaseSerialization(database);}finally{end?.();}
      const hash=await span('certificate_hash',()=>digest(serialized));
      return certificate.digest===hash?hash:miss('certificate_mismatch');
    }catch{return miss('certificate_error');}
  }
  return {
    verifyDigest,
    async verify(database,options){return Boolean(await verifyDigest(database,options));},
    issue(database){
      if(!available()||!isCommittedSnapshot(database))return Promise.resolve();
      const current=++generation;let serialized;
      // Capture synchronously while the exact committed value is immutable.
      try{serialized=strictDatabaseSerialization(database);}catch{return Promise.resolve();}
      const task=digest(serialized).then(hash=>queue(async()=>{
        if(current!==generation)return;
        await area.set({[VALIDATION_CERTIFICATE_KEY]:{format:1,schemaVersion:DATABASE_SCHEMA_VERSION,validationVersion:VALIDATION_ALGORITHM_VERSION,serializationVersion:2,algorithm:'SHA-256',digest:hash}});
      })).catch(()=>{});
      pending.add(task);task.finally(()=>pending.delete(task));return task;
    },
    clear(){++generation;return available()?queue(()=>area.remove(VALIDATION_CERTIFICATE_KEY)):Promise.resolve();},
    async settled(){await Promise.all([...pending]);await tail;}
  };
}
