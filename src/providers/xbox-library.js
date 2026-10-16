/* Read-only projection of Xbox's existing account-scoped website cache.
 * No fetching, token access, history-derived ownership or persistent cache.
 */
(function(root){
  'use strict';
  const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=50000;
  const productId=id=>typeof id==='string'&&/^[A-Z0-9]{12}$/u.test(id);
  const fail=message=>{const error=Error(message+' Saved GL items are unchanged.');error.glXboxUserMessage=error.message;throw error;};
  const text=value=>typeof value==='string'&&value.trim()&&value.length<=500?value.replace(/\s+/gu,' ').trim():null;
  function read(window){
    const env=window.__SW_MANAGER__?.env,cache=env?.queryClient,systems=env?.systems;
    if(typeof cache?.getQueryState!=='function'||typeof cache?.getQueryData!=='function')fail('Let Xbox Library finish loading, then try again.');
    const versions=[];
    function query(generator,args,actor){
      if(!generator||actor&&typeof generator.getUserQuery!=='function')fail('The Xbox website changed or its library is not ready. Reload Library before importing.');
      const key=(actor?generator.getUserQuery(actor):generator).getOptions(args)?.queryKey;
      if(!Array.isArray(key)||key.length>30||actor&&(key[0]!=='user'||key[1]!==actor||key[1]==='active'))fail('Xbox could not confirm the library account. Reload and sign in again.');
      const state=cache.getQueryState(key);
      if(state?.status!=='success'||state.fetchStatus!=='idle'||state.isInvalidated===true)fail('Let Xbox Library finish loading or refreshing, then try again.');
      versions.push([state.dataUpdatedAt??null,state.dataUpdateCount??null]);
      return cache.getQueryData(key);
    }
    const auth=systems?.authentication?.queries,library=systems?.library?.queries;
    const actor=query(auth?.activeUserId);
    if(typeof actor!=='string'||!actor||actor.length>200||actor==='active')fail('Sign in to Xbox and reload Library before importing.');
    const profile=query(auth?.userInfo,undefined,actor),xuid=profile?.xuid;
    if(typeof xuid!=='string'||!/^\d{1,20}$/u.test(xuid))fail('Xbox did not confirm the signed-in account. Reload Library.');
    const assembled=query(library?.assembledItems,{dataSet:'fullLibrary'},actor);
    const access=query(systems?.contentAccess?.queries?.allProductAccess,undefined,actor);
    const catalogs=query(library?.resolveCatalogs,undefined,actor);
    if(!Array.isArray(assembled)||!count(assembled.length)||!count(access?.size)||typeof access.get!=='function'||!Array.isArray(catalogs)||!count(catalogs.length))fail('Xbox returned an unreadable library. Reload Library before importing.');
    const owned=catalogs.filter(c=>c?.id==='owned');
    if(owned.length!==1||!count(owned[0].totalCount)||!Array.isArray(owned[0].previewEntries)||!count(owned[0].previewEntries.length))fail('Xbox has not loaded its Owned catalog. Wait for the Library cards or reload the page.');
    const catalog=owned[0];
    // Same GBe/KK/oq selection as the website's unfiltered Owned catalog:
    // first-party + PERSONAL Owned (1), excluding bundle containers.
    const selected=assembled.filter(row=>row?.providerId==='grts-catalog-provider'&&!(row.basicProductInfo?.bundleChildren?.length>0)&&access.get(row.productId)?.userAccessTypes?.has?.(1)===true);
    const ids=new Set(selected.map(row=>row.productId));
    if(selected.length!==catalog.totalCount||ids.size!==selected.length||[...ids].some(id=>!productId(id)))fail('The complete Xbox Owned selection does not agree with its catalog total. Reload Library and retry.');
    const previews=catalog.previewEntries.map(row=>row?.productId);
    if(previews.length>catalog.totalCount||new Set(previews).size!==previews.length||previews.some(id=>!ids.has(id))||catalog.totalCount>0&&!previews.length)fail('Xbox preview cards do not agree with the complete Owned selection. Reload Library and retry.');
    const items=selected.map(row=>{
      const name=text(row.basicProductInfo?.title);if(!name)fail('Xbox has not loaded every game title. Let the cards finish loading.');
      const license=access.get(row.productId),types=license.userAccessTypes;
      if(!count(types?.size)||types.size>64||typeof types[Symbol.iterator]!=='function')fail('Xbox returned unreadable access information.');
      const accessTypes=[...types].sort((a,b)=>a-b);
      if(accessTypes.some(n=>!Number.isSafeInteger(n)||n<1||n>2147483647))fail('Xbox returned unreadable access flags.');
      const staticMetadata=license.staticMetadata,platforms=staticMetadata?.supportedPlatforms;
      const platform=[];
      if(platforms!==undefined){
        if(!count(platforms?.size)||platforms.size>16||typeof platforms[Symbol.iterator]!=='function')fail('Xbox returned unreadable platform information.');
        const names={1:'Windows',2:'Xbox One',4:'Xbox Series X|S'};
        for(const flag of [...platforms].sort((a,b)=>a-b)){if(!Number.isSafeInteger(flag)||flag<1)fail('Xbox returned unreadable platform information.');if(names[flag])platform.push(names[flag]);}
      }
      const kinds={0:'durable',1:'app',2:'game',3:'bundle'},kind=kinds[staticMetadata?.productKind]??'unknown';
      const metadata={source:'xbox-web-library',productId:row.productId,accessBasis:'personal-owned-web-catalog',accessTypes,productKind:kind};
      if(platforms!==undefined)metadata.supportedPlatforms=[...platforms].sort((a,b)=>a-b);
      for(const field of ['edition','publisher'])if(text(row.basicProductInfo?.[field]))metadata[field]=text(row.basicProductInfo[field]);
      // This is the website's games catalog. Its coarse/default Durable flag
      // does not establish a separately named DLC product or parent linkage.
      return {provider:'xbox',providerItemId:row.productId,title:name,mediaType:'game',ownership:'owned',platform,acquiredAt:null,metadata};
    }).sort((a,b)=>a.providerItemId.localeCompare(b.providerItemId));
    if(query(auth.activeUserId)!==actor)fail('The Xbox account changed during the check. Reload Library before importing.');
    const S=root.GalacticProviderSnapshot;
    if(!S)fail('Library snapshot validation is unavailable. Reload the extension and Library.');
    const snapshot=S.completeProviderSnapshot('xbox',items,[S.completedScope('owned-web-library',items.length,catalog.totalCount,'reported-count')]);
    // Account IDs remain MAIN-world only. The bridge exports hashes, not this object.
    return {actor,xuid,items,snapshot,revision:JSON.stringify([actor,xuid,versions,items,[...previews].sort()]),counts:{assembled:assembled.length,access:access.size,owned:items.length,previews:previews.length}};
  }
  root.GalacticXboxLibrary=Object.freeze({read});
})(globalThis);
