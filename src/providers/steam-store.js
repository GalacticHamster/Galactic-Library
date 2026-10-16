/* Steam Store importer. It makes user-initiated authenticated requests from a
 * tab where Steam is already signed in; no password, cookie copying, or API
 * key is involved. */
(function attachSteamStoreImporter(global) {
  'use strict';

  const STORE_ITEMS_BATCH_SIZE = 100;
  const BETWEEN_BATCHES_MS = 500;

  function ownedAppIdsFromDynamicStore(value) {
    const values = Array.isArray(value?.rgOwnedApps) ? value.rgOwnedApps : [];
    return [...new Set(values.map((value) => String(value).trim()).filter((value) => /^\d+$/u.test(value)))];
  }

  function newOwnedAppIds(appIds, knownAppIds = []) {
    const known = new Set((Array.isArray(knownAppIds) ? knownAppIds : []).map((id) => String(id).trim()).filter(Boolean));
    return (Array.isArray(appIds) ? appIds : []).filter((appId) => !known.has(String(appId)));
  }

  function libraryItemsFromStoreItems(value, allowedIds) {
    const libraryItems = [];
    for (const item of value?.response?.store_items ?? []) {
      const providerItemId = String(item?.appid ?? '').trim();
      const title = typeof item?.name==='string'?item.name.replace(/\s+/gu, ' ').trim():'';
      const type = appType(item?.type);
      if (!allowedIds.has(providerItemId) || !title || (type !== 0 && type !== 4)) continue;
      const parentAppId = String(item?.related_items?.parent_appid ?? '').trim();
      libraryItems.push({
        providerItemId,
        title,
        mediaType: type === 4 ? 'game-addon' : 'game',
        ownership: 'owned',
        metadata: {
          source: 'steam-store-browse-items',
          ...(type === 4 && /^\d+$/u.test(parentAppId) ? { parentProviderItemId: parentAppId } : {})
        }
      });
    }
    return libraryItems;
  }

  const appType=value=>(typeof value==='number'||typeof value==='string'&&/^-?\d+$/u.test(value))&&Number.isSafeInteger(Number(value))?Number(value):null;
  const failure=(kind,status)=>Object.assign(new Error(kind==='http'||kind==='authentication'?'Steam title service returned '+(status?'HTTP '+status:'an HTTP error')+'.':kind==='malformed'?'Steam returned a malformed title-service response.':'Steam title-service request failed.'),{steamFailure:kind,...(Number.isInteger(status)&&status>=100&&status<=599?{httpStatus:status}:{})});
  function failureLabel(value){
    if(['http','authentication'].includes(value.kind)&&value.httpStatus)return 'Steam title lookup returned HTTP '+value.httpStatus+'.';
    return {malformed:'Steam returned an unreadable title response.',classification:'Some Steam catalog entries could not be interpreted.',missing:'Steam did not return usable metadata for some App IDs.',network:'Steam title lookup could not connect.'}[value.kind]??'Some Steam titles could not be resolved.';
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function fetchStoreItems(batch) {
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

  async function fetchOwnedSteamGames(reportProgress = () => {}, knownAppIds = null,{diagnostics=false}={}) {
    let account,ownedStatus;
    try{
      let ownedResponse;try{ownedResponse=await fetch('/dynamicstore/userdata/', { credentials: 'same-origin', cache: 'no-store' });}catch{throw failure('network');}
      ownedStatus=ownedResponse.status;
      if(!ownedResponse.ok)throw failure([401,403].includes(ownedStatus)?'authentication':'http',ownedStatus);
      try{account=await ownedResponse.json();}catch{throw failure('malformed',ownedStatus);}
      if(!Array.isArray(account?.rgOwnedApps)||account.rgOwnedApps.some(id=>!/^\d+$/u.test(String(id))))throw failure('malformed',ownedStatus);
    }catch(error){
      error.message=error.steamFailure==='malformed'?'Steam returned a malformed owned-App-ID list. No library changes were saved.':error.httpStatus?'Steam owned-App-ID list returned HTTP '+error.httpStatus+'. No library changes were saved.':'Steam owned-App-ID list could not be read. No library changes were saved.';
      if(diagnostics)error.steamDiagnostics={ownedListRead:false,ownedIdCount:0,candidateCount:0,attemptedCount:0,titleRequests:0,failedRequests:0,unresolvedCount:0,malformedRows:0,outcomes:{},httpStatuses:{},unsupportedTypes:{},firstFailure:{stage:'owned-list',kind:error.steamFailure??'other',...(error.httpStatus?{httpStatus:error.httpStatus}:{})}};
      throw error;
    }
    const appIds = ownedAppIdsFromDynamicStore(account);
    if (!appIds.length) throw new Error('Steam Store did not return owned apps. Confirm you are signed in to Steam Store in this tab.');
    const incremental = Array.isArray(knownAppIds);
    const appIdsToResolve = incremental ? newOwnedAppIds(appIds, knownAppIds) : appIds;

    const itemsById = new Map();
    const unresolvedById = new Map(),unsupportedIds=new Set(),outcomes=new Map(),types={},httpStatuses={};let failedRequestCount=0,titleRequests=0,malformedRows=0,firstFailure=null;
    const observeFailure=value=>{firstFailure??={stage:'titles',kind:value.kind,...(value.httpStatus?{httpStatus:value.httpStatus}:{})};};
    const unresolved=(id,kind,status)=>{outcomes.set(id,kind);unresolvedById.set(id,{appId:id,status:failureLabel({kind,httpStatus:status})});observeFailure({kind,httpStatus:status});};
    const aggregate=()=>({ownedListRead:true,ownedIdCount:appIds.length,candidateCount:appIdsToResolve.length,attemptedCount:outcomes.size,titleRequests,failedRequests:failedRequestCount,unresolvedCount:unresolvedById.size,malformedRows,
      outcomes:Object.fromEntries(['games','dlc','unsupported','missing','http','authentication','malformed','classification','network','other'].map(kind=>[kind,[...outcomes.values()].filter(value=>value===kind).length])),httpStatuses,unsupportedTypes:types,...(firstFailure?{firstFailure}:{})});
    for (let offset = 0; offset < appIdsToResolve.length; offset += STORE_ITEMS_BATCH_SIZE) {
      const batch = appIdsToResolve.slice(offset, offset + STORE_ITEMS_BATCH_SIZE);
      reportProgress({ completed: offset, total: appIdsToResolve.length, ownedApps: appIds.length, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      try {
        titleRequests++;
        const {body,status}=await fetchStoreItems(batch);
        if(diagnostics&&Number.isInteger(status)&&status>=100&&status<=599)httpStatuses[status]=(httpStatuses[status]??0)+1;
        const requested=new Set(batch),byId=new Map();
        for(const item of body.response.store_items){
          const id=String(item?.appid??'');if(!/^\d+$/u.test(id)){malformedRows++;continue;}
          if(!requested.has(id))continue;
          const group=byId.get(id)??[];group.push(item);byId.set(id,group);
        }
        for(const id of batch){
          const group=byId.get(id);if(!group){unresolved(id,'missing');continue;}
          const item=group[0],type=appType(item.type);
          const signature=entry=>JSON.stringify([appType(entry?.type),entry?.name,entry?.related_items?.parent_appid]);
          if(type===null||group.some(entry=>signature(entry)!==signature(item))){unresolved(id,'classification');continue;}
          if(![0,4].includes(type)){
            unsupportedIds.add(id);outcomes.set(id,'unsupported');
            if(diagnostics){let key=Math.abs(type)<=100000?String(type):'other';if(!Object.hasOwn(types,key)&&Object.keys(types).length>=31)key='other';types[key]=(types[key]??0)+1;}
            continue;
          }
          const parsed=libraryItemsFromStoreItems({response:{store_items:[item]}},requested)[0];
          if(!parsed){unresolved(id,'missing');continue;}
          itemsById.set(id,parsed);outcomes.set(id,type===0?'games':'dlc');
        }
      } catch (error) {
        failedRequestCount++;
        const kind=error.steamFailure??'other';
        if(diagnostics&&error.httpStatus)httpStatuses[error.httpStatus]=(httpStatuses[error.httpStatus]??0)+1;
        for(const appId of batch)unresolved(appId,kind,error.httpStatus);
        if(!incremental)throw Object.assign(new Error(`${error.message} The full Steam snapshot was not replaced.`),diagnostics?{steamDiagnostics:aggregate()}:{});
      }
      reportProgress({ completed: offset + batch.length, total: appIdsToResolve.length, ownedApps: appIds.length, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
      if (offset + STORE_ITEMS_BATCH_SIZE < appIdsToResolve.length) await wait(BETWEEN_BATCHES_MS);
    }
    if (!incremental && ![...itemsById.values()].some((item) => item.mediaType === 'game')) throw Object.assign(new Error('Steam returned owned apps but no game titles. Please try again later.'),diagnostics?{steamDiagnostics:aggregate()}:{});
    const unresolvedApps=[...unresolvedById.values()];
    if (!incremental && unresolvedApps.length) throw Object.assign(new Error(`Steam could not resolve ${unresolvedApps.length} owned apps. A complete full replacement is unavailable; previous records were kept. Quick update can still add readable new apps.`),diagnostics?{steamDiagnostics:aggregate()}:{});
    const items = [...itemsById.values()];
    return { items, unresolvedApps, failedRequestCount,unsupportedAppCount:unsupportedIds.size,...(firstFailure?{failureSummary:failureLabel(firstFailure)}:{}),...(diagnostics?{diagnostics:aggregate()}:{}),ownedAppIds: appIds, newAppCount: appIdsToResolve.length, snapshot: incremental ? undefined : global.GalacticProviderSnapshot.completeProviderSnapshot('steam', items, [global.GalacticProviderSnapshot.completedScope('library', appIds.length, appIds.length, 'index-complete', Math.max(1, Math.ceil(appIds.length / STORE_ITEMS_BATCH_SIZE)))]) };
  }

  global.GalacticSteamStore = { ownedAppIdsFromDynamicStore, newOwnedAppIds, libraryItemsFromStoreItems, fetchOwnedSteamGames };
}(globalThis));
