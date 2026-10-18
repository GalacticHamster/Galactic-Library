import assert from 'node:assert/strict';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {registerCommittedSnapshot} from '../src/lib/committed-snapshot.js';
import {createValidationCertificates,VALIDATION_CERTIFICATE_KEY,strictDatabaseSerialization} from '../src/lib/validation-certificate.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
import {handleExternalApiRequest,handleExternalApiRequestAsync} from '../src/lib/external-api.js';
import {withWorker} from './storage.js';
import {selectManifest} from '../src/lib/kindle-manifest.js';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function fixture(){
  const db=createEmptyDatabase();
  for(const [id,title]of [['B000000001','Synthetic collection'],['B000000002','Synthetic collection, 2nd Edition']]){
    const item=normalizeProviderItem({provider:'kindle',providerItemId:id,title,mediaType:'book',ownership:'owned',metadata:{authors:['Example Author']}});db.providerItems[item.id]=item;
  }
  db.manualMatchDecisions.review={decision:'same-work',itemIds:Object.keys(db.providerItems),updatedAt:'2026-10-01'};
  return validateDatabase(db);
}
function area(initial={}){
  const values=structuredClone(initial),writes=[];
  return {values,writes,get:async defaults=>{
    const keys=typeof defaults==='string'?[defaults]:Object.keys(defaults);
    return Object.fromEntries(keys.map(key=>[key,structuredClone(values[key]??(typeof defaults==='object'?defaults[key]:undefined))]));
  },set:async updates=>{writes.push(structuredClone(updates));Object.assign(values,structuredClone(updates));},remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}};
}
const request={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Synthetic collection',mediaType:'book'},{title:'Synthetic collection, 3rd Edition',mediaType:'book'}]};
function setup(){const db=area({[DATABASE_STORAGE_KEY]:fixture()}),session=area();return {db,session,writer:()=>createStorageWriter(db,Promise.resolve(),{cacheQuerySnapshots:true,certificateArea:session})};}
async function certify(s){await createValidationCertificates(s.session).issue(registerCommittedSnapshot(freeze(structuredClone(s.db.values[DATABASE_STORAGE_KEY]))));}
async function query(writer){const stages=[];const database=await writer.getQueryDatabase({beginSpan:name=>{stages.push(name);return ()=>{};}});return {database,stages};}
async function receipt(session){for(let n=0;n<100&&!session.values[VALIDATION_CERTIFICATE_KEY];n++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(session.values[VALIDATION_CERTIFICATE_KEY]);}

export const validationCertificateTests=[
 ['certificate hit registers exact committed data without validation and preserves matching and warm hits',async()=>{
  const s=setup();await certify(s);const writer=s.writer(),hit=await query(writer);
  assert.ok(hit.stages.includes('certificate_hit'));assert.ok(!hit.stages.includes('snapshot_validation'));
  assert.deepEqual(hit.database,s.db.values[DATABASE_STORAGE_KEY]);assert.ok(Object.isFrozen(hit.database.providerItems));
  assert.deepEqual(await handleExternalApiRequestAsync(hit.database,request,{cacheCommittedProjection:true}),handleExternalApiRequest(s.db.values[DATABASE_STORAGE_KEY],request));
  const warm=await query(writer);assert.equal(warm.database,hit.database);assert.deepEqual(warm.stages,['snapshot_hit']);
 }],
 ['missing certificate runs full validation, issues only a tiny receipt and enables the next worker',async()=>{
  const s=setup(),cold=await query(s.writer());assert.ok(cold.stages.includes('certificate_miss'));assert.ok(cold.stages.includes('snapshot_validation'));
  await receipt(s.session);assert.ok(JSON.stringify(s.session.values).length<500);assert.ok(!JSON.stringify(s.session.values).includes('Synthetic'));
  const next=await query(s.writer());assert.ok(next.stages.includes('certificate_hit'));assert.deepEqual(next.database,cold.database);
 }],
 ['corrupt descriptors, digest, schema and validation versions always fall back',async()=>{
  const s=setup();await certify(s);const saved=structuredClone(s.session.values[VALIDATION_CERTIFICATE_KEY]);
  for(const certificate of [null,[],{}, {...saved,digest:'0'.repeat(64)},{...saved,schemaVersion:1},{...saved,validationVersion:'old'}, {...saved,serializationVersion:1},{...saved,algorithm:'MD5'},{...saved,extra:true},{...saved,digest:saved.digest.toUpperCase()}]){
    s.session.values[VALIDATION_CERTIFICATE_KEY]=certificate;const result=await query(s.writer());assert.ok(result.stages.includes('snapshot_validation'));
  }
 }],
 ['strict serialization rejects lossy values, holes, extras, accessors, symbols and transformations',()=>{
  const extra=[1];extra.note='lost';const hidden={};Object.defineProperty(hidden,'x',{value:1});
  const accessor={};Object.defineProperty(accessor,'x',{enumerable:true,get(){throw Error('Getter executed');}});
  const cyclic={};cyclic.self=cyclic;
  for(const value of [undefined,{x:undefined},{x:NaN},{x:Infinity},{x:()=>{}},{x:1n},[,1],extra,hidden,accessor,{[Symbol('x')]:1},new Date(),{x:new Date()},{toJSON(){return {}; }},cyclic])assert.throws(()=>strictDatabaseSerialization(value));
  assert.equal(strictDatabaseSerialization({x:-0}),strictDatabaseSerialization({x:0}));
  assert.equal(strictDatabaseSerialization({a:1,b:2}),strictDatabaseSerialization({b:2,a:1}));
  assert.equal(strictDatabaseSerialization({x:[null,true,1,'text']}),'{"x":[null,true,1,"text"]}');
 }],
 ['randomized property-based differential tests verify identical serialization parity, non-mutation and rejection',()=>{
  function refSerialize(val){
   const chk=e=>{
    if(e===null||typeof e==='boolean'||typeof e==='string')return;
    if(typeof e==='number'&&Number.isFinite(e))return;
    if(!e||typeof e!=='object')throw Error('Unsupported database value.');
    const p=Object.getPrototypeOf(e);
    if(p!==(Array.isArray(e)?Array.prototype:Object.prototype)&&!(p===null&&!Array.isArray(e)))throw Error('Unsupported database object.');
    if(Object.hasOwn(e,'toJSON'))throw Error('Unsupported database transformation.');
   };
   chk(val);
   return JSON.stringify(val,(_k,e)=>{
    chk(e);if(e===null||typeof e!=='object')return e;
    const arr=Array.isArray(e),desc=Object.getOwnPropertyDescriptors(e),ks=Reflect.ownKeys(desc);
    if(arr&&(ks.length!==e.length+1||Object.keys(e).some((k,i)=>k!==String(i))))throw Error('Unsupported database array.');
    for(const k of ks){
     if(arr&&k==='length')continue;
     const d=desc[k];
     if(typeof k!=='string'||!d.enumerable||!Object.hasOwn(d,'value')||k==='toJSON')throw Error('Unsupported database property.');
     chk(d.value);
    }
    return arr?e:Object.fromEntries(ks.sort().map(k=>[k,desc[k].value]));
   });
  }
  function prng(seed=0x2468ace0){
   let s=seed>>>0;
   return()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
  }
  const rnd=prng(),randInt=(min,max)=>Math.floor(rnd()*(max-min+1))+min,pick=arr=>arr[randInt(0,arr.length-1)];
  const unicodes=['Batman™ & Robin®','Noël','バットマン','Бэтмен','🦇🦸🦹','line1\nline2\rline3\tline4','quotes "here" and \\backslash\\','zero\u0000byte','',' '];
  const keys=['0','1','2','10','42','100','01','-1','1.5','title','author','year','metadata','蝙蝠侠','é','🌟','','spaced key','slash/key'];
  function genPrim(){const t=randInt(0,5);if(t===0)return null;if(t===1)return rnd()>0.5;if(t===2)return rnd()>0.5?0:-0;if(t===3)return randInt(-10000,10000);if(t===4)return(rnd()-0.5)*1e5;return pick(unicodes);}
  function genTree(depth=0,sharedPool=[]){
   if(depth>5||(depth>1&&rnd()<0.4)){if(sharedPool.length>0&&rnd()<0.35)return pick(sharedPool);return genPrim();}
   if(rnd()<0.35){const len=randInt(0,4),arr=[];for(let i=0;i<len;i++)arr.push(genTree(depth+1,sharedPool));if(rnd()<0.3)sharedPool.push(arr);return arr;}
   const obj=rnd()<0.25?Object.create(null):{},num=randInt(0,5);
   const klist=[...new Set(Array.from({length:num},()=>pick(keys)))].sort(()=>rnd()-0.5);
   for(const k of klist)obj[k]=genTree(depth+1,sharedPool);
   if(rnd()<0.3)sharedPool.push(obj);return obj;
  }
  function clone(val){
   if(val===null||typeof val!=='object')return val;
   if(Array.isArray(val))return val.map(clone);
   const res=Object.getPrototypeOf(val)===null?Object.create(null):{};
   for(const k of Reflect.ownKeys(val))res[k]=clone(val[k]);
   return res;
  }
  for(let i=0;i<200;i++){
   const tree=genTree(0,[]),before=clone(tree);
   const expected=refSerialize(tree),actual=strictDatabaseSerialization(tree);
   assert.equal(actual,expected);assert.deepEqual(tree,before);
  }
  const bad=[
   ()=>undefined,()=>NaN,()=>Infinity,()=>-Infinity,()=>10n,()=>Symbol('s'),()=>()=>{},()=>new Date(),()=>/x/i,()=>new Set([1]),()=>new Map([['a',1]]),
   ()=>({toJSON(){return 1;}}),()=>({toJSON:1}),()=>{const a=[1,2];delete a[0];return a;},()=>{const a=[1];a.x='y';return a;},
   ()=>{const a=[1];Object.defineProperty(a,'0',{enumerable:false});return a;},()=>{const o={a:1};Object.defineProperty(o,'h',{value:1,enumerable:false});return o;},
   ()=>{const o={};Object.defineProperty(o,'g',{get:()=>1,enumerable:true});return o;},()=>{const o={};Object.defineProperty(o,'s',{set:()=>{},enumerable:true});return o;},
   ()=>{const o={a:1};o[Symbol('s')]=2;return o;},()=>{const o={};o.self=o;return o;}
  ];
  for(let i=0;i<100;i++){
   const tree=genTree(0,[]),corrupt=pick(bad)();
   if(Array.isArray(tree))tree.push(corrupt);else if(tree&&typeof tree==='object')tree['corrupt'+i]=corrupt;
   let refThrew=false,actThrew=false;
   try{refSerialize(tree);}catch{refThrew=true;}
   try{strictDatabaseSerialization(tree);}catch{actThrew=true;}
   assert.equal(actThrew,refThrew);assert.ok(actThrew);
  }
 }],
 ['field changes and corrupt records cannot reuse a formerly valid receipt',async()=>{
  const s=setup();await certify(s);s.db.values[DATABASE_STORAGE_KEY].providerItems['kindle:B000000001'].ownership='unknown';
  const changed=await query(s.writer());assert.ok(changed.stages.includes('snapshot_validation'));assert.equal(handleExternalApiRequest(changed.database,request).results[0].owned,false);
  s.db.values[DATABASE_STORAGE_KEY].providerItems['kindle:B000000001'].mediaType='corrupt';await assert.rejects(query(s.writer()),/media type/);
 }],
 ['native zero normalization in validated manifest ranks permits receipt reuse without accepting changed ranks',async()=>{
  const s=setup(),db=fixture(),item=db.providerItems['kindle:B000000001'];
  item.metadata.enrichment={kindleProductComicContents:{source:'amazon-product-page',sourceUrl:'https://www.amazon.com/dp/B000000001',extractorVersion:5,parserVersion:5,availability:'statement-found',...selectManifest([{selector:'#description',text:'Collects Synthetic #1-4.'}],item.title)}};
  const validated=validateDatabase(db),rank=validated.providerItems[item.id].metadata.enrichment.kindleProductComicContents.manifest.candidates[0].rank;
  assert.ok(rank.some(number=>Object.is(number,-0)));
  await createValidationCertificates(s.session).issue(registerCommittedSnapshot(freeze(validated)));
  const reordered=value=>Array.isArray(value)?value.map(reordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,reordered(value[key])])):value;
  s.db.values[DATABASE_STORAGE_KEY]=reordered(JSON.parse(JSON.stringify(validated)));const result=await query(s.writer());assert.ok(result.stages.includes('certificate_hit'));
  assert.deepEqual(handleExternalApiRequest(result.database,request),handleExternalApiRequest(validated,request));
  s.db.values[DATABASE_STORAGE_KEY].providerItems[item.id].metadata.enrichment.kindleProductComicContents.manifest.candidates[0].rank[0]+=1;
  assert.ok((await query(s.writer())).stages.includes('snapshot_validation'));
 }],
 ['schema migration commits before issuing a current-code certificate',async()=>{
  const s=setup();await certify(s);s.db.values[DATABASE_STORAGE_KEY].schemaVersion=1;
  const result=await query(s.writer());assert.ok(result.stages.includes('snapshot_validation'));assert.ok(result.stages.includes('snapshot_migration'));
  assert.equal(s.db.values[DATABASE_STORAGE_KEY].schemaVersion,13);assert.deepEqual(result.database,s.db.values[DATABASE_STORAGE_KEY]);await receipt(s.session);
 }],
 ['restore/import cannot mint their own receipt and replace/clear invalidate old state',async()=>{
  const s=setup();await certify(s);const writer=s.writer();await query(writer);
  const old=structuredClone(s.session.values[VALIDATION_CERTIFICATE_KEY]);
  const restored=fixture();restored[VALIDATION_CERTIFICATE_KEY]=old;restored.providerItems['kindle:B000000001'].ownership='unknown';
  await writer.restoreDatabase(restored);assert.equal(s.db.values[DATABASE_STORAGE_KEY][VALIDATION_CERTIFICATE_KEY],undefined);
  const next=await query(s.writer());assert.equal(handleExternalApiRequest(next.database,request).results[0].owned,false);
  const malformed=fixture();malformed.providerItems['kindle:B000000001'].mediaType='invalid';malformed[VALIDATION_CERTIFICATE_KEY]=old;
  await assert.rejects(writer.restoreDatabase(malformed));
  await writer.mergeProviderItems('kindle',[{providerItemId:'B000000003',title:'Imported',mediaType:'book',ownership:'owned',metadata:{[VALIDATION_CERTIFICATE_KEY]:old}}]);
  assert.equal(s.db.values[DATABASE_STORAGE_KEY].providerItems['kindle:B000000003'].metadata[VALIDATION_CERTIFICATE_KEY],undefined);
  await writer.clearDatabase();assert.equal(s.db.values[DATABASE_STORAGE_KEY],undefined);const empty=await query(s.writer());assert.equal(Object.keys(empty.database.providerItems).length,0);
 }],
 ['mutations without an existing query snapshot discard proof until a full cold validation',async()=>{
  const s=setup();await certify(s);const writer=s.writer();await writer.saveOwnershipPolicy({allOwned:true});
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(s.session.values[VALIDATION_CERTIFICATE_KEY],undefined);
  const next=await query(s.writer());assert.ok(next.stages.includes('snapshot_validation'));assert.equal(next.database.ownershipPolicy.allOwned,true);
 }],
 ['write failure is diagnostic only and session loss or unavailability performs full validation',async()=>{
  const s=setup();s.session.set=async()=>{throw Error('Session write failure');};
  await query(s.writer());assert.equal(s.session.values[VALIDATION_CERTIFICATE_KEY],undefined);
  await s.writer().saveOwnershipPolicy({allOwned:true});assert.equal(s.db.values[DATABASE_STORAGE_KEY].ownershipPolicy.allOwned,true);
  assert.ok((await query(s.writer())).stages.includes('snapshot_validation'));
  s.session.get=async()=>{throw Error('Session read failure');};assert.ok((await query(s.writer())).stages.includes('snapshot_validation'));
  const plain=createStorageWriter(s.db,Promise.resolve(),{cacheQuerySnapshots:true});assert.ok((await query(plain)).stages.includes('snapshot_validation'));
 }],
 ['certificate verification overlapped by a committed write retries instead of publishing stale data',async()=>{
  const s=setup();await certify(s);const writer=s.writer(),get=s.session.get;let entered,release;
  const started=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);let once=true;
  s.session.get=async key=>{const result=await get(key);if(once){once=false;entered();await held;}return result;};
  const reading=query(writer);await started;await writer.saveOwnershipPolicy({allOwned:true});release();
  const result=await reading;assert.ok(result.stages.includes('snapshot_retry'));assert.equal(result.database.ownershipPolicy.allOwned,true);
 }],
 ['concurrent cold readers share verification and pending receipt cannot overwrite a later clear',async()=>{
  const s=setup();await certify(s);const writer=s.writer();const [a,b]=await Promise.all([query(writer),query(writer)]);
  assert.equal(a.database,b.database);assert.ok(b.stages.includes('snapshot_wait'));
  const certificates=createValidationCertificates(s.session),snapshot=registerCommittedSnapshot(freeze(fixture()));
  const issuing=certificates.issue(snapshot);await certificates.clear();await issuing;assert.equal(s.session.values[VALIDATION_CERTIFICATE_KEY],undefined);
 }],
 ['only registered committed snapshots can issue certificates',async()=>{
  const s=setup(),certificates=createValidationCertificates(s.session);await certificates.issue(freeze(fixture()));assert.equal(s.session.values[VALIDATION_CERTIFICATE_KEY],undefined);
 }],
 ['held session writes never hold query responses and clear orders after an in-flight receipt',async()=>{
  const s=setup(),set=s.session.set;let entered,release;const started=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>release=resolve);
  s.session.set=async values=>{entered();await hold;return set(values);};
  const certificates=createValidationCertificates(s.session),issuing=certificates.issue(registerCommittedSnapshot(freeze(fixture())));await started;
  const clear=certificates.clear();release();await Promise.all([clear,issuing]);assert.equal(s.session.values[VALIDATION_CERTIFICATE_KEY],undefined);
  s.session.set=()=>new Promise(()=>{});const result=await query(s.writer());assert.ok(result.stages.includes('snapshot_validation'));
 }],
 ['two actual worker generations export certificate hit/hash and canonical reuse without changing HB results',async()=>{
  const session={},database=fixture(),hb='a'.repeat(32);let before;
  await withWorker(async({memory,pageA,dispatchExternal})=>{
    memory.values[DATABASE_STORAGE_KEY]=structuredClone(database);await pageA.saveAllowedExternalClientIds([hb]);
    before=await dispatchExternal({...request,diagnosticLookupId:'lookup-abcdef123456-001'},{id:hb});
    assert.ok(before.performance.events.some(event=>event.stage==='snapshot_validation'));await receipt({values:session});
  },{storageEvents:true,sessionState:session});
  await withWorker(async({memory,pageA,dispatchExternal,dispatch})=>{
    memory.values[DATABASE_STORAGE_KEY]=structuredClone(database);await pageA.saveAllowedExternalClientIds([hb]);
    const after=await dispatchExternal({...request,diagnosticLookupId:'lookup-abcdef123456-002'},{id:hb});assert.deepEqual(after.results,before.results);assert.notEqual(after.performance.worker,before.performance.worker);
    const exported=await dispatch({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'},{id:chrome.runtime.id,url:chrome.runtime.getURL('options.html')});
    const events=exported.companions[0].events;for(const stage of ['certificate_hit','certificate_serialize','certificate_hash','matching_canonical_reuse'])assert.ok(events.some(event=>event.stage===stage),stage);
    assert.ok(!events.some(event=>event.stage==='snapshot_validation'));assert.ok(!JSON.stringify(exported).includes(session[VALIDATION_CERTIFICATE_KEY].digest));
  },{storageEvents:true,sessionState:session});
 }],
 ['trusted canonical reuse is narrow; arbitrary frozen contexts still rebuild barriers',async()=>{
  const trusted=registerCommittedSnapshot(freeze(fixture())),stages=[];
  const options={cacheCommittedProjection:true,beginSpan:stage=>{stages.push(stage);return ()=>{};},yieldTask:async()=>{}};
  assert.deepEqual(await handleExternalApiRequestAsync(trusted,request,options),handleExternalApiRequest(trusted,request));
  assert.ok(stages.includes('matching_canonical_reuse'));assert.ok(!stages.includes('matching_canonical'));
  const untrusted=fixture();untrusted.canonicalItems={};freeze(untrusted);stages.length=0;
  assert.deepEqual(await handleExternalApiRequestAsync(untrusted,request,options),handleExternalApiRequest(untrusted,request));
  assert.ok(stages.includes('matching_canonical'));assert.ok(!stages.includes('matching_canonical_reuse'));
 }]
];

