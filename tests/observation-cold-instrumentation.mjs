// Diagnostic-only transforms of disposable packages. Nothing below ships.
export function instrumentColdMatching(files,{quietOptions=false}={}){
 const patch=(path,transform)=>files.set(path,Buffer.from(transform(files.get(path).toString().replaceAll('\r\n','\n'))));
 const once=(source,from,to)=>{if(source.split(from).length!==2)throw Error('Cold diagnostic anchor changed: '+from);return source.replace(from,to);};
 const wrap=(source,name,args,kind='sync')=>{const prefix=kind==='async'?'async ':'';const anchor=`${prefix}function ${name}(`;
  const call=`__coldOriginal_${name}(${args.split(',').map(a=>a.split('=')[0]).join(',')})`;
  return once(source,anchor,`${prefix}function ${name}(${args}){return globalThis.__coldProbe?globalThis.__coldProbe.${kind}('${name}',()=>${call}):${call};}\n${prefix}function __coldOriginal_${name}(`);};
 const boot=`globalThis.__coldProbe={boot:performance.now(),epoch:performance.timeOrigin,active:true,events:[],startupEvents:[],work:{},begin(stage,details={}){if(!this.active)return ()=>{};const start=performance.now();return ()=>{this.events.push({stage,start,ms:performance.now()-start,...details});if(this.events.length>512)this.events.shift();};},sync(stage,work,details){const end=this.begin(stage,details);try{return work();}finally{end();}},async async(stage,work,details){const end=this.begin(stage,details);try{return await work();}finally{end();}},slice(phase,ms,yielded){if(!this.active)return;const w=this.work[phase]??={cpu:0,wait:0,yields:0};w.cpu+=ms;w.yields+=Number(yielded);},wait(phase,ms){if(this.active)(this.work[phase]??={cpu:0,wait:0,yields:0}).wait+=ms;}};`;
 patch('src/background/storage-writer.js',source=>{
  source=once(source,'const committedArea=storageArea;',`const cp=globalThis.__coldProbe,originalArea=storageArea;const committedArea={get:defaults=>cp.async('native_get',()=>originalArea.get(defaults),{keys:typeof defaults==='string'?[defaults]:Array.isArray(defaults)?defaults:Object.keys(defaults??{})}),set:updates=>cp.async('native_set',()=>originalArea.set(updates),{keys:Object.keys(updates)}),remove:keys=>cp.async('native_remove',()=>originalArea.remove(keys),{keys})};`);
  source=wrap(source,'readObservations','base,force=false','async');
  if(source.includes('async function recoverObservations('))source=wrap(source,'recoverObservations','','async');
  source=once(source,'function checkDigest(database){',`async function checkDigest(database){return globalThis.__coldProbe.async('checkDigest',()=>__coldOriginal_checkDigest(database));}\nfunction __coldOriginal_checkDigest(database){`);
  return source;
 });
 patch('src/lib/validation-certificate.js',source=>wrap(source,'strictDatabaseSerialization','value'));
 patch('src/lib/observation-overlays.js',source=>wrap(wrap(source,'validateObservationOverlay','base,digest,head,packet'),'materializeObservations','base,packet'));
 if(files.has('src/lib/observation-transactions.js'))patch('src/lib/observation-transactions.js',source=>wrap(source,'validateActiveEnvelope','value,base,digest'));
 patch('src/background/service-worker.js',source=>{
  if(quietOptions)source=once(source,'chrome.runtime.openOptionsPage().catch(() => {});','/* Test package only: omit automatic Options opening. */');
  source=once(source,"if (request?.type === 'MATCH_ITEMS') {",`if(request?.type==='COLD_PROBE_MATCH'){const cp=globalThis.__coldProbe;cp.active=true;cp.startupEvents=cp.events;cp.events=[];cp.work={};cp.admitted=performance.now();request={...request,type:'MATCH_ITEMS'};}\n  if (request?.type === 'MATCH_ITEMS') {`);
  source=once(source,'sendResponse=value=>{try{respond(value);}finally{end();}};',`sendResponse=value=>{try{const cp=globalThis.__coldProbe;respond(cp.active?{...value,coldDiagnostics:{boot:cp.boot,epoch:cp.epoch,ready:cp.ready,admitted:cp.admitted,responded:performance.now(),startupEvents:cp.startupEvents,events:cp.events,work:cp.work}}:value);}finally{globalThis.__coldProbe.active=false;end();}};`);
  source=once(source,'storageWriter.getQueryDatabase()\n      .then(database=>handleExternalApiRequestAsync(database,{...request,apiVersion:request.apiVersion??1},{cacheImmutableRecords:true,cacheCommittedProjection:true}))',`storageWriter.getQueryDatabase({beginSpan:stage=>globalThis.__coldProbe.begin(stage),onValidationSlice:(ms,y)=>globalThis.__coldProbe.slice('validation',ms,y),onValidationWait:ms=>globalThis.__coldProbe.wait('validation',ms)})\n      .then(database=>handleExternalApiRequestAsync(database,{...request,apiVersion:request.apiVersion??1},{cacheImmutableRecords:true,cacheCommittedProjection:true,beginSpan:stage=>globalThis.__coldProbe.begin(stage),onStage:stage=>{if(stage==='matching_index')globalThis.__coldProbe.phase='index';if(stage==='matching_execution')globalThis.__coldProbe.phase='execution';},onSlice:(ms,y)=>globalThis.__coldProbe.slice(globalThis.__coldProbe.phase,ms,y),onWait:ms=>globalThis.__coldProbe.wait(globalThis.__coldProbe.phase,ms)}))`);
  return source+'\nglobalThis.__coldProbe.ready=performance.now();\n';
 });
 // A first side-effect dependency timestamps dependency execution. Browser
 // startup, module loading/parsing before this point remain transport residual.
 files.set('src/background/cold-diagnostic.js',Buffer.from(boot));
 patch('src/background/service-worker.js',source=>"import './cold-diagnostic.js';\n"+source);
}
