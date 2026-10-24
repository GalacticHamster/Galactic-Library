import {DATABASE_SCHEMA_VERSION} from './constants.js';
import {isCommittedSnapshot} from './committed-snapshot.js';

export const VALIDATION_CERTIFICATE_KEY='galacticLibraryValidationCertificate';
// Bump whenever database validation, normalization, source interpretation or
// canonical identity rules change. Schema compatibility alone is not proof.
export const VALIDATION_ALGORITHM_VERSION='database-validation-2026-10-24-steam-owned-applications-v1';
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
  const isIntegerIndex=k=>String(Number(k)>>>0)===k&&k!=='4294967295';
  const isCanonicalKeyOrder=keys=>{
    let inStringPhase=false,prevStringKey='';
    for(let i=0;i<keys.length;i++){
      const k=keys[i];
      if(!isIntegerIndex(k)){
        if(!inStringPhase){inStringPhase=true;prevStringKey=k;}
        else{if(prevStringKey>k)return false;prevStringKey=k;}
      }else if(inStringPhase)return false;
    }
    return true;
  };
  const canonicalize=(entry,stack=new Set())=>{
    check(entry);if(entry===null||typeof entry!=='object')return entry;
    if(stack.has(entry))throw TypeError('Converting circular structure to JSON');
    stack.add(entry);
    try{
      const isArr=Array.isArray(entry),ownKeys=Reflect.ownKeys(entry);
      if(isArr){
        if(ownKeys.length!==entry.length+1||Object.keys(entry).some((key,index)=>key!==String(index)))throw Error('Unsupported database array.');
        for(let i=0;i<entry.length;i++){
          const k=String(i),desc=Object.getOwnPropertyDescriptor(entry,k);
          if(!desc||!desc.enumerable||!Object.hasOwn(desc,'value')||k==='toJSON')throw Error('Unsupported database property.');
        }
        let copy=null;
        for(let i=0;i<entry.length;i++){
          const val=entry[i],canon=canonicalize(val,stack);
          if(canon!==val&&!copy)copy=entry.slice(0,i);
          if(copy)copy.push(canon);
        }
        return copy||entry;
      }
      if(Object.keys(entry).length!==ownKeys.length)throw Error('Unsupported database property.');
      for(let i=0;i<ownKeys.length;i++){
        const k=ownKeys[i];
        if(typeof k!=='string'||k==='toJSON')throw Error('Unsupported database property.');
        const desc=Object.getOwnPropertyDescriptor(entry,k);
        if(!desc||!desc.enumerable||!Object.hasOwn(desc,'value'))throw Error('Unsupported database property.');
      }
      if(isCanonicalKeyOrder(ownKeys)){
        let copy=null;
        for(let i=0;i<ownKeys.length;i++){
          const k=ownKeys[i],val=entry[k],canon=canonicalize(val,stack);
          if(canon!==val&&!copy){copy={};for(let j=0;j<i;j++)copy[ownKeys[j]]=entry[ownKeys[j]];}
          if(copy)copy[k]=canon;
        }
        return copy||entry;
      }
      ownKeys.sort();
      const sorted={};
      for(let i=0;i<ownKeys.length;i++){const k=ownKeys[i];sorted[k]=canonicalize(entry[k],stack);}
      return sorted;
    }finally{stack.delete(entry);}
  };
  return JSON.stringify(canonicalize(value));
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
  const issuedDigests=new WeakMap();
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
    committedDigest:database=>isCommittedSnapshot(database)?issuedDigests.get(database):null,
    verifyDigest,
    async verify(database,options){return Boolean(await verifyDigest(database,options));},
    issue(database){
      if(!available()||!isCommittedSnapshot(database))return Promise.resolve();
      const current=++generation;let serialized;
      // Capture synchronously while the exact committed value is immutable.
      try{serialized=strictDatabaseSerialization(database);}catch{return Promise.resolve();}
      const hashing=digest(serialized);issuedDigests.set(database,hashing);
      const task=hashing.then(hash=>queue(async()=>{
        if(current!==generation)return;
        await area.set({[VALIDATION_CERTIFICATE_KEY]:{format:1,schemaVersion:DATABASE_SCHEMA_VERSION,validationVersion:VALIDATION_ALGORITHM_VERSION,serializationVersion:2,algorithm:'SHA-256',digest:hash}});
      })).catch(()=>{});
      pending.add(task);task.finally(()=>pending.delete(task));return task;
    },
    clear(){++generation;return available()?queue(()=>area.remove(VALIDATION_CERTIFICATE_KEY)):Promise.resolve();},
    async settled(){await Promise.all([...pending]);await tail;}
  };
}
