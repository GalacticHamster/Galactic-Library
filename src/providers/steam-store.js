/* Steam Store importer. It makes user-initiated authenticated requests from a
 * tab where Steam is already signed in; no password, cookie copying, or API
 * key is involved. */
(function attachSteamStoreImporter(global) {
  'use strict';

  const STORE_ITEMS_BATCH_SIZE = 100;
  const BETWEEN_BATCHES_MS = 500;
  const OUTCOMES=['games','dlc','unsupported','unavailable','absent','missingTitle','invalidTitle','invalidType','conflictingDuplicate','http','authentication','malformed','classification','network','other'];
  const SAMPLE_LIMIT=20;
  let sampling=false,sampleGeneration=0,lastSample=null;
  const appId=value=>{
    if(typeof value!=='number'&&typeof value!=='string')return null;
    const text=String(value).trim();if(!/^\d+$/u.test(text))return null;
    const number=Number(text);return Number.isSafeInteger(number)&&number>0&&number<=0xffffffff?String(number):null;
  };
  const titleText=value=>typeof value==='string'?value.replace(/\s+/gu,' ').trim():'';
  function setDiagnosticSampling(enabled){sampling=enabled===true;sampleGeneration++;lastSample=null;return {enabled:sampling,notice:'Sampled App IDs may reveal part of your Steam library. They stay in this page and are never included in timing exports.'};}
  function getDiagnosticSample(){return sampling&&lastSample?JSON.parse(JSON.stringify(lastSample)):null;}
  function sampleOutcome(sample,id,outcome,item,returnedEntry){
    if(!sample||['games','dlc'].includes(outcome))return;
    const type=appType(item?.type),row={appId:id,outcome,...(typeof returnedEntry==='boolean'?{returnedEntry}:{}),...(returnedEntry&&item?{hasUsableName:outcome!=='invalidTitle'&&Boolean(titleText(item.name)),...(type!==null?{returnedType:type}:{})}:{})};
    if(outcome==='unavailable')Object.assign(row,{resultCode:item.success,...(typeof item.visible==='boolean'?{visible:item.visible}:{})});
    const rows=sample.groups[outcome]??=[];const existing=rows.findIndex(row=>row.appId===id);if(existing>=0)rows.splice(existing,1);
    rows.push(row);rows.sort((a,b)=>Number(a.appId)-Number(b.appId));if(rows.length>SAMPLE_LIMIT)rows.pop();
  }

  function ownedAppIdsFromDynamicStore(value) {
    const values = Array.isArray(value?.rgOwnedApps) ? value.rgOwnedApps : [];
    return [...new Set(values.map(appId).filter(Boolean))];
  }

  function newOwnedAppIds(appIds, knownAppIds = []) {
    const known = new Set((Array.isArray(knownAppIds) ? knownAppIds : []).map(appId).filter(Boolean));
    return [...new Set((Array.isArray(appIds)?appIds:[]).map(appId).filter(Boolean))].filter(id=>!known.has(id));
  }

  function libraryItemsFromStoreItems(value, allowedIds) {
    const libraryItems = [];
    const allowed=new Set([...allowedIds].map(appId).filter(Boolean));
    for (const item of value?.response?.store_items ?? []) {
      const providerItemId = appId(item?.appid);
      const title = titleText(item?.name);
      const type = appType(item?.type);
      if (!providerItemId||!allowed.has(providerItemId) || !title || (type !== 0 && type !== 4)) continue;
      const parentAppId = appId(item?.related_items?.parent_appid);
      libraryItems.push({
        providerItemId,
        title,
        mediaType: type === 4 ? 'game-addon' : 'game',
        ownership: 'owned',
        metadata: {
          source: 'steam-store-browse-items',
          ...(type === 4 && parentAppId ? { parentProviderItemId: parentAppId } : {})
        }
      });
    }
    return libraryItems;
  }

  const appType=value=>(typeof value==='number'||typeof value==='string'&&/^-?\d+$/u.test(value))&&Number.isSafeInteger(Number(value))?Number(value):null;
  const failure=(kind,status)=>Object.assign(new Error(kind==='http'||kind==='authentication'?'Steam title service returned '+(status?'HTTP '+status:'an HTTP error')+'.':kind==='malformed'?'Steam returned a malformed title-service response.':'Steam title-service request failed.'),{steamFailure:kind,...(Number.isInteger(status)&&status>=100&&status<=599?{httpStatus:status}:{})});
  function failureLabel(value){
    if(['http','authentication'].includes(value.kind)&&value.httpStatus)return 'Steam title lookup returned HTTP '+value.httpStatus+'.';
    return {malformed:'Steam returned an unreadable title response.',classification:'Some Steam catalog entries could not be interpreted.',unavailable:'Steam reported some catalog entries unavailable; this does not change ownership.',absent:'Some requested App IDs had no identifiable row in the title response.',missingTitle:'Some returned Steam entries have no title.',invalidTitle:'Some returned Steam entries have invalid title data.',invalidType:'Some returned Steam entries have no valid application type.',conflictingDuplicate:'Steam returned conflicting entries for some App IDs.',network:'Steam title lookup could not connect.'}[value.kind]??'Some Steam titles could not be resolved.';
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function requestStoreItems(batch) {
    const input = {
      ids: batch.map((appid) => ({ appid: Number(appid) })),
      context: { language: 'english', country_code: 'US', steam_realm: 1 },
      data_request: { include_basic_info: true }
    };
    let response;
    try{response=await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`, { cache: 'no-store' });}
    catch{throw failure('network');}
    if (!response.ok) throw failure([401,403].includes(response.status)?'authentication':'http',response.status);
    let body;try{body=await response.json();}catch{throw failure('malformed',response.status);}
    if(!Array.isArray(body?.response?.store_items))throw failure('malformed',response.status);
    return {body,status:response.status};
  }

  async function fetchStoreItems(batch,onRetry){
    for(let attempt=0;;attempt++){
      try{return await requestStoreItems(batch);}
      catch(error){
        if(attempt||!(error.steamFailure==='network'||error.steamFailure==='http'&&(error.httpStatus===429||error.httpStatus>=500)))throw error;
        onRetry(error);await wait(500);
      }
    }
  }

  async function fetchOwnedSteamGames(reportProgress = () => {}, knownAppIds = null,{diagnostics=false}={}) {
    const generation=++sampleGeneration,sample=sampling?{groups:{}}:null;lastSample=null;
    try{return await acquireOwnedSteamGames(reportProgress,knownAppIds,{diagnostics},sample);}
    finally{if(sample&&sampling&&generation===sampleGeneration)lastSample={format:2,outcomeVersion:3,provider:'steam',sampleLimitPerOutcome:SAMPLE_LIMIT,notice:'These App IDs may reveal part of your Steam library. No titles, accounts or credentials are included.',groups:Object.fromEntries(OUTCOMES.filter(kind=>sample.groups[kind]?.length).map(kind=>[kind,sample.groups[kind]]))};}
  }
  async function acquireOwnedSteamGames(reportProgress,knownAppIds,{diagnostics},sample){
    let account,ownedStatus;
    try{
      let ownedResponse;try{ownedResponse=await fetch('/dynamicstore/userdata/', { credentials: 'same-origin', cache: 'no-store' });}catch{throw failure('network');}
      ownedStatus=ownedResponse.status;
      if(!ownedResponse.ok)throw failure([401,403].includes(ownedStatus)?'authentication':'http',ownedStatus);
      try{account=await ownedResponse.json();}catch{throw failure('malformed',ownedStatus);}
      if(!Array.isArray(account?.rgOwnedApps)||account.rgOwnedApps.length>50000||account.rgOwnedApps.some(id=>!appId(id))
        ||account.success===false||account.bLoggedIn===false||account.complete===false||account.has_more===true)throw failure('malformed',ownedStatus);
      for(const key of ['rgMasterSubApps','rgAutoGrantApps'])if(account[key]!==undefined&&(!Array.isArray(account[key])||account[key].length>50000||account[key].some(id=>!appId(id))))throw failure('malformed',ownedStatus);
    }catch(error){
      error.message=error.steamFailure==='malformed'?'Steam returned a malformed owned-App-ID list. No library changes were saved.':error.httpStatus?'Steam owned-App-ID list returned HTTP '+error.httpStatus+'. No library changes were saved.':'Steam owned-App-ID list could not be read. No library changes were saved.';
      if(diagnostics)error.steamDiagnostics={outcomeVersion:3,ownedListRead:false,ownedIdCount:0,candidateCount:0,attemptedCount:0,titleRequests:0,failedRequests:0,unresolvedCount:0,malformedRows:0,outcomes:{},httpStatuses:{},unsupportedTypes:{},firstFailure:{stage:'owned-list',kind:error.steamFailure??'other',...(error.httpStatus?{httpStatus:error.httpStatus}:{})}};
      throw error;
    }
    const appIds = ownedAppIdsFromDynamicStore(account);
    const subscriptions=new Set((account.rgMasterSubApps??[]).map(appId)),autoGrants=new Set((account.rgAutoGrantApps??[]).map(appId));
    const access=appIds.flatMap(id=>subscriptions.has(id)?[{appId:id,basis:'master-subscription'}]:autoGrants.has(id)?[{appId:id,basis:'auto-grant'}]:[]).sort((a,b)=>Number(a.appId)-Number(b.appId));
    if (!appIds.length) throw new Error('Steam Store did not return owned apps. Confirm you are signed in to Steam Store in this tab.');
    const incremental = Array.isArray(knownAppIds);
    const appIdsToResolve = incremental ? newOwnedAppIds(appIds, knownAppIds) : appIds;

    const itemsById = new Map();
    const unresolvedById = new Map(),unsupportedIds=new Set(),outcomes=new Map(),issueEvidence=new Map(),types={},httpStatuses={},requests=[],placeholderResultCodes={},placeholderVisibility={};let failedRequestCount=0,titleRequests=0,malformedRows=0,canonicalTitleRejected=0,firstFailure=null;
    const countCode=(counts,code)=>{let key=Number.isSafeInteger(code)&&Math.abs(code)<=100000?String(code):'other';if(!Object.hasOwn(counts,key)&&Object.keys(counts).length>=31)key='other';counts[key]=(counts[key]??0)+1;};
    const observeFailure=value=>{firstFailure??={stage:'titles',kind:value.kind,...(value.httpStatus?{httpStatus:value.httpStatus}:{})};};
    const outcome=(id,kind,item,returnedEntry)=>{
      outcomes.set(id,kind);sampleOutcome(sample,id,kind,item,returnedEntry);
      if(['games','dlc'].includes(kind))issueEvidence.delete(id);
      else{
        const entry={appId:id,kind},type=appType(item?.type),name=titleText(item?.name);
        if(type!==null&&Math.abs(type)<=100000)entry.reportedType=type;
        if(name&&name.length<=500&&kind!=='invalidTitle')entry.title=name;
        issueEvidence.set(id,entry);
      }
    };
    const unresolved=(id,kind,status,item,returnedEntry)=>{outcome(id,kind,item,returnedEntry);unresolvedById.set(id,{appId:id,status:failureLabel({kind,httpStatus:status})});observeFailure({kind,httpStatus:status});};
    const aggregate=()=>({outcomeVersion:3,ownedListRead:true,ownedIdCount:appIds.length,candidateCount:appIdsToResolve.length,attemptedCount:outcomes.size,titleRequests,failedRequests:failedRequestCount,unresolvedCount:unresolvedById.size,malformedRows,canonicalTitleRejected,
      outcomes:Object.fromEntries(OUTCOMES.map(kind=>[kind,[...outcomes.values()].filter(value=>value===kind).length])),httpStatuses,unsupportedTypes:types,placeholderResultCodes,placeholderVisibility,requests,requestSamplesDropped:Math.max(0,titleRequests-requests.length),...(firstFailure?{firstFailure}:{})});
    for (let offset = 0; offset < appIdsToResolve.length; offset += STORE_ITEMS_BATCH_SIZE) {
      const batch = appIdsToResolve.slice(offset, offset + STORE_ITEMS_BATCH_SIZE);
      reportProgress({ completed: offset, total: appIdsToResolve.length, ownedApps: appIds.length, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      const requestCounts={requestedCount:batch.length};
      try {
        titleRequests++;
        const {body,status}=await fetchStoreItems(batch,error=>{
          titleRequests++;failedRequestCount++;
          if(diagnostics&&error.httpStatus)httpStatuses[error.httpStatus]=(httpStatuses[error.httpStatus]??0)+1;
        });
        if(Number.isInteger(status)&&status>=100&&status<=599)requestCounts.httpStatus=status;
        requestCounts.returnedRowCount=body.response.store_items.length;requestCounts.unexpectedRowCount=0;requestCounts.malformedRowCount=0;requestCounts.duplicateRowCount=0;requestCounts.matchedRowCount=0;requestCounts.placeholderRowCount=0;requestCounts.unavailableCount=0;requestCounts.conflictingIdCount=0;
        if(diagnostics&&Number.isInteger(status)&&status>=100&&status<=599)httpStatuses[status]=(httpStatuses[status]??0)+1;
        const requested=new Set(batch),byId=new Map(),placeholders=new Map();
        for(const item of body.response.store_items){
          let id=appId(item?.appid);
          // Only an explicit application failure can use `id` for diagnostics.
          // Never use it as an importable appid, or guess what an error code means.
          if(!id&&appType(item?.item_type)===0&&Number.isSafeInteger(item?.success)&&item.success>1&&appId(item?.id)){
            id=appId(item.id);if(!requested.has(id)){requestCounts.unexpectedRowCount++;continue;}
            const group=placeholders.get(id)??[];if(group.length||byId.has(id))requestCounts.duplicateRowCount++;group.push(item);placeholders.set(id,group);
            requestCounts.placeholderRowCount++;
            if(diagnostics){countCode(placeholderResultCodes,item.success);const flag=typeof item.visible==='boolean'?String(item.visible):'unspecified';placeholderVisibility[flag]=(placeholderVisibility[flag]??0)+1;}
            continue;
          }
          if(!id){malformedRows++;requestCounts.malformedRowCount++;continue;}
          if(!requested.has(id)){requestCounts.unexpectedRowCount++;continue;}
          const group=byId.get(id)??[];if(group.length||placeholders.has(id))requestCounts.duplicateRowCount++;group.push(item);byId.set(id,group);requestCounts.matchedRowCount++;
        }
        requestCounts.matchedIdCount=byId.size;requestCounts.absentCount=batch.length-new Set([...byId.keys(),...placeholders.keys()]).size;
        for(const id of batch){
          const group=byId.get(id),placeholderGroup=placeholders.get(id);
          if(placeholderGroup){
            const item=placeholderGroup[0],signature=row=>JSON.stringify([row.success,typeof row.visible==='boolean'?row.visible:null]);
            if(group||placeholderGroup.some(row=>signature(row)!==signature(item))){requestCounts.conflictingIdCount++;unresolved(id,'conflictingDuplicate',undefined,null,true);}
            else{requestCounts.unavailableCount++;unresolved(id,'unavailable',undefined,item,true);}
            continue;
          }
          if(!group){unresolved(id,'absent',undefined,null,false);continue;}
          try{
          const item=group[0],type=appType(item.type);
          const signature=entry=>JSON.stringify([appType(entry?.type),entry?.name==null?['missing']:typeof entry.name==='string'?['text',titleText(entry.name)]:['invalid',typeof entry.name],appId(entry?.related_items?.parent_appid)]);
          if(group.some(entry=>signature(entry)!==signature(item))){requestCounts.conflictingIdCount++;unresolved(id,'conflictingDuplicate',undefined,item,true);continue;}
          if(type===null){unresolved(id,'invalidType',undefined,item,true);continue;}
          if(![0,4].includes(type)){
            unsupportedIds.add(id);outcome(id,'unsupported',item,true);
            if(diagnostics){let key=Math.abs(type)<=100000?String(type):'other';if(!Object.hasOwn(types,key)&&Object.keys(types).length>=31)key='other';types[key]=(types[key]??0)+1;}
            continue;
          }
          if(item.name==null||typeof item.name==='string'&&!titleText(item.name)){unresolved(id,'missingTitle',undefined,item,true);continue;}
          if(typeof item.name!=='string'){unresolved(id,'invalidTitle',undefined,item,true);continue;}
          const parsed=libraryItemsFromStoreItems({response:{store_items:[item]}},requested)[0];
          if(!parsed){unresolved(id,'classification',undefined,item,true);continue;}
          parsed.ownership=subscriptions.has(id)?'subscription':autoGrants.has(id)?'unknown':'owned';
          parsed.metadata.ownershipBasis=subscriptions.has(id)?'master-subscription':autoGrants.has(id)?'auto-grant':'owned-app-index';
          itemsById.set(id,parsed);outcome(id,type===0?'games':'dlc',item,true);
          }catch{
            // A parser fault belongs to this ID, never to its HTTP request or
            // valid neighbors. Do not inspect the offending raw fields again.
            itemsById.delete(id);unsupportedIds.delete(id);unresolved(id,'classification',undefined,null,true);
          }
        }
      } catch (error) {
        const kind=error.steamFailure??'other';
        if(['http','authentication','malformed','network'].includes(kind))failedRequestCount++;
        if(error.httpStatus)requestCounts.httpStatus=error.httpStatus;
        if(diagnostics&&error.httpStatus)httpStatuses[error.httpStatus]=(httpStatuses[error.httpStatus]??0)+1;
        for(const appId of batch)if(!outcomes.has(appId))unresolved(appId,kind,error.httpStatus);
      }
      // One bounded local worker message per readable batch, no provider request.
      // Keep this outside the transport/parser catch: unavailable validation is
      // fatal, never invented unresolved ownership or a successful partial save.
      const candidates=batch.map(id=>itemsById.get(id)).filter(Boolean),bounded=candidates.filter(item=>item.title.length<=500);
      let statuses=[];
      if(bounded.length){
        const reply=await global.chrome.runtime.sendMessage({type:'VALIDATE_STEAM_TITLES',titles:bounded.map(item=>item.title)});
        if(!reply?.ok||!Array.isArray(reply.statuses)||reply.statuses.length!==bounded.length||reply.statuses.some(status=>!['valid','invalidTitle','emptyCanonicalTitle'].includes(status)))throw Error('Steam title validation could not finish. Your saved library was kept. Retry the update.');
        statuses=reply.statuses;
      }
      const decisions=new Map(bounded.map((item,index)=>[item.providerItemId,statuses[index]]));
      for(const item of candidates){
        const status=decisions.get(item.providerItemId);
        if(status==='valid')continue;
        if(status==='emptyCanonicalTitle')canonicalTitleRejected++;
        itemsById.delete(item.providerItemId);
        unresolved(item.providerItemId,'invalidTitle',undefined,{name:item.title,type:item.mediaType==='game'?0:4},true);
      }
      if(diagnostics&&requests.length<32)requests.push(requestCounts);
      reportProgress({ completed: offset + batch.length, total: appIdsToResolve.length, ownedApps: appIds.length, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      if (offset + STORE_ITEMS_BATCH_SIZE < appIdsToResolve.length) await wait(BETWEEN_BATCHES_MS);
    }
    const unresolvedApps=[...unresolvedById.values()];
    const items = [...itemsById.values()];
    const metadataOutcomes=Object.fromEntries(OUTCOMES.map(kind=>[kind,[...outcomes.values()].filter(value=>value===kind).length]));
    const applications={version:1,source:'dynamicstore-owned-apps',complete:true,appIds:[...appIds].sort((a,b)=>Number(a)-Number(b)),issues:[...issueEvidence.values()].sort((a,b)=>Number(a.appId)-Number(b.appId)),...(access.length?{access}:{})};
    return { items, applications, unresolvedApps, failedRequestCount,unsupportedAppCount:unsupportedIds.size,metadataOutcomes,...(firstFailure?{failureSummary:failureLabel(firstFailure)}:{}),...(diagnostics?{diagnostics:aggregate()}:{}),ownedAppIds: appIds, newAppCount: appIdsToResolve.length, snapshot: incremental ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('steam', items, [global.GalacticProviderSnapshot.completedScope('library', appIds.length, appIds.length, 'index-complete', Math.max(1, Math.ceil(appIds.length / STORE_ITEMS_BATCH_SIZE)))]) };
  }

  global.GalacticSteamStore = { ownedAppIdsFromDynamicStore, newOwnedAppIds, libraryItemsFromStoreItems, fetchOwnedSteamGames,setDiagnosticSampling,getDiagnosticSample };
}(globalThis));
