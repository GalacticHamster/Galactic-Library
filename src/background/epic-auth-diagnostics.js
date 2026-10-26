// Fixed, value-free Epic failure episodes. Never part of the library/backup.
export const EPIC_AUTH_DIAGNOSTICS_KEY='galacticEpicAuthDiagnostics';
export const EPIC_AUTH_RETENTION_MS=24*60*60*1000;
export const EPIC_AUTH_MAX_FAILURES=10;
const routes=new Set(['store','achievements','account','other']);
const modes=new Set(['full','incremental']);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const flag=v=>typeof v==='boolean'?v:null;
function route(sender){
  // Read only the existing browser message context, never browsing history.
  const url=new URL(sender.tab?.url??sender.url);
  if(url.origin!=='https://store.epicgames.com')return 'other';
  if(/(?:^|\/)achievements(?:\/|$)/iu.test(url.pathname))return 'achievements';
  if(/(?:^|\/)account(?:\/|$)/iu.test(url.pathname))return 'account';
  return /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/iu.test(url.pathname)?'store':'other';
}
function cleanAttempt(value,success,now){
  if(!value||!integer(value.at,0,now)||!modes.has(value.operation)||!routes.has(value.route)
      ||!integer(value.pagesRead,success?1:0,500)||![true,false,null].includes(value.pageReady)
      ||![true,false,null].includes(value.securityCheckVisible))return null;
  if(success){
    if(value.saveState!=='saved')return null;
    return {at:value.at,operation:value.operation,phase:'library',pagesRead:value.pagesRead,multiplePages:value.pagesRead>1,pageReady:value.pageReady,securityCheckVisible:value.securityCheckVisible,route:value.route,saveState:'saved'};
  }
  if(value.outerStatus!==200||value.upstreamStatus!==401||value.saveState!=='not-requested')return null;
  return {at:value.at,operation:value.operation,phase:'library',outerStatus:200,upstreamStatus:401,category:'upstream-unauthorized',pagesRead:value.pagesRead,pageReady:value.pageReady,securityCheckVisible:value.securityCheckVisible,route:value.route,saveState:'not-requested'};
}
function cleanEpisodes(value,now){
  if(value?.format!==1||!Array.isArray(value.episodes))return [];
  return value.episodes.slice(-EPIC_AUTH_MAX_FAILURES).flatMap(episode=>{
    const failure=cleanAttempt(episode?.failure,false,now);
    if(!failure||now-failure.at>=EPIC_AUTH_RETENTION_MS)return [];
    const success=cleanAttempt(episode?.subsequentSuccess,true,now);
    return [{failure,subsequentSuccess:success&&success.at>=failure.at?success:null}];
  });
}
export function createEpicAuthDiagnostics({area,ready=Promise.resolve(),runtime,clock=Date.now}){
  // A single tiny key, serialized independently of library data. No timers,
  // network observers, credentials, account keys, or background authentication.
  let tail=Promise.resolve();
  const serialize=task=>{const result=tail.catch(()=>{}).then(async()=>{await ready;return task();});tail=result.catch(()=>{});return result;};
  async function read(){
    const raw=(await area.get({[EPIC_AUTH_DIAGNOSTICS_KEY]:null}))[EPIC_AUTH_DIAGNOSTICS_KEY];
    const episodes=cleanEpisodes(raw,clock()),clean={format:1,episodes};
    if(raw!=null&&(!episodes.length||JSON.stringify(raw)!==JSON.stringify(clean))){
      if(episodes.length)await area.set({[EPIC_AUTH_DIAGNOSTICS_KEY]:clean});
      else await area.remove(EPIC_AUTH_DIAGNOSTICS_KEY);
    }
    return episodes;
  }
  const save=episodes=>area.set({[EPIC_AUTH_DIAGNOSTICS_KEY]:{format:1,episodes:episodes.slice(-EPIC_AUTH_MAX_FAILURES)}});
  function epic(sender){
    try{return sender?.id===runtime.id&&sender.frameId===0&&new URL(sender.url).origin==='https://store.epicgames.com';}catch{return false;}
  }
  function own(sender){return sender?.id===runtime.id&&typeof sender.url==='string'&&sender.url.startsWith(runtime.getURL(''));}
  function report(){return serialize(async()=>({format:1,provider:'epic',retentionMs:EPIC_AUTH_RETENTION_MS,maxFailures:EPIC_AUTH_MAX_FAILURES,correlation:'later-import-only; account-continuity-not-collected',navigationBetweenAttempts:'not-monitored',episodes:await read()}));}
  function recordFailure(request,sender){
    const d=request.diagnostic,f=d?.firstFailure;
    if(!modes.has(request.operation)||f?.stage!=='library'||f.kind!=='authorization'||f.httpStatus!==200||f.upstreamStatus!==401||d.saveState!=='not-requested'
        ||!integer(d.pagesRead,0,499)||d.requestsMade!==d.pagesRead+1||typeof f.documentReady!=='boolean'||typeof f.securityCheckVisible!=='boolean')return Promise.resolve(false);
    return serialize(async()=>{
      const episodes=await read();
      episodes.push({failure:{at:clock(),operation:request.operation,phase:'library',outerStatus:200,upstreamStatus:401,category:'upstream-unauthorized',pagesRead:d.pagesRead,pageReady:f.documentReady,securityCheckVisible:f.securityCheckVisible,route:route(sender),saveState:'not-requested'},subsequentSuccess:null});
      await save(episodes);return true;
    });
  }
  // Called only by the worker after the real atomic Epic save succeeds. A page
  // cannot claim success by sending a diagnostics message or lose it on reload.
  function committed(request,sender,operation){
    if(!epic(sender)||!modes.has(operation))return Promise.resolve(false);
    const pages=request.snapshot?.scopes?.find(scope=>scope.id==='library')?.pagesRead;
    if(!integer(pages,1,500))return Promise.resolve(false);
    return serialize(async()=>{
      const episodes=await read(),episode=episodes.at(-1);
      if(!episode||episode.subsequentSuccess)return false;
      const d=request.epicDiagnostic;
      episode.subsequentSuccess={at:clock(),operation,phase:'library',pagesRead:pages,multiplePages:pages>1,pageReady:flag(d?.documentReady),securityCheckVisible:flag(d?.securityCheckVisible),route:route(sender),saveState:'saved'};
      await save(episodes);return true;
    });
  }
  function handle(request,sender,reply){
    if(request?.type!=='EPIC_AUTH_DIAGNOSTICS')return;
    if(request.action==='get'&&(epic(sender)||own(sender))){report().then(history=>reply({ok:true,history}),()=>reply({ok:false}));return true;}
    if(request.action==='recordFailure'&&epic(sender)){recordFailure(request,sender).then(recorded=>reply({ok:true,recorded}),()=>reply({ok:false}));return true;}
    reply({ok:false});return undefined;
  }
  return {handle,report,committed};
}
