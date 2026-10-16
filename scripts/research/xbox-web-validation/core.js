/* Research only: inspect known website cache entries; never fetch or read tokens. */
(function(root){
  'use strict';
  const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=50000;
  const states=['unavailable','absent','pending','error','success'];
  const flags={1:'personalOwnedFlag',2:'gamePassUltimate',4:'gamePassCore',8:'gamePassPC',16:'gamePassStandard',32:'gamePassConsole',64:'gamesWithGold',128:'eaPlay',256:'ubisoftPlus',512:'gtaPlus',8192:'disc',16384:'trial'};
  const numbers=['ownedRows','distinctProducts','duplicateProducts','unsupportedIdentities','assembledRows','joinedTitles','missingTitles','joinedAccess','firstPartyProducts','visibleProductLinks','visibleOwnedLinks','accessProducts','ownedCatalogTotal','ownedCatalogPreviewRows'];
  function sanitize(input){
    if(!input||input.format!==1)return null;
    const result={format:1,helperVersion:'0.1.1',provider:'xbox',readOnly:true,requestsMade:0,source:'website-owned-library-cache',state:['unavailable','waiting','incomplete','ready'].includes(input.state)?input.state:'unavailable',
      managerPresent:input.managerPresent===true,cacheReadable:input.cacheReadable===true,accountIdentityPresent:input.accountIdentityPresent===true,accountScopesMatch:input.accountScopesMatch===true,accountStable:input.accountStable===true,libraryComplete:false,ownershipVerified:false};
    for(const key of numbers)if(count(input[key]))result[key]=input[key];
    if(['active-account-unavailable','account-scope-mismatch','account-changed','owned-view-not-cached','assembled-not-cached','access-not-cached'].includes(input.waitReason))result.waitReason=input.waitReason;
    result.queries={};for(const key of ['activeUser','profile','owned','assembled','access','catalogs']){const q=input.queries?.[key];if(q)result.queries[key]={state:states.includes(q.state)?q.state:'unavailable',fetching:q.fetching===true,accountScoped:q.accountScoped===true,keyScope:['global','account','active-alias','unknown'].includes(q.keyScope)?q.keyScope:'unknown',accountKeyMatches:q.accountKeyMatches===true};}
    result.flags={};for(const key of Object.values(flags))if(count(input.flags?.[key]))result.flags[key]=input.flags[key];
    return result;
  }
  function read(window,document){
    const r={format:1,state:'unavailable',queries:{},flags:{}};
    try{
      if(window.location?.origin!=='https://play.xbox.com')return sanitize(r);
      const env=window.__SW_MANAGER__?.env;r.managerPresent=!!env;
      const cache=env?.queryClient;if(typeof cache?.getQueryState!=='function'||typeof cache?.getQueryData!=='function')return sanitize(r);
      r.cacheReadable=true;
      let actor;
      const readQuery=(name,generator,args,userScoped=true)=>{
        if(!generator){r.queries[name]={state:'unavailable'};return {};}
        if(userScoped&&(!actor||typeof generator.getUserQuery!=='function')){r.queries[name]={state:'unavailable'};return {};}
        // Active-user queries are disposable ['user','active',...] aliases, not account keys.
        // Inspect the exact backing query used by the website, without fetching it.
        const options=(userScoped?generator.getUserQuery(actor):generator).getOptions(args),key=options?.queryKey;
        if(!Array.isArray(key)||key.length>30){r.queries[name]={state:'unavailable'};return {};}
        const keyScope=!userScoped?'global':key[0]==='user'&&key[1]==='active'?'active-alias':key[0]==='user'&&typeof key[1]==='string'?'account':'unknown';
        const accountKeyMatches=userScoped&&keyScope==='account'&&key[1]===actor;
        const state=cache.getQueryState(key);
        r.queries[name]={state:states.includes(state?.status)?state.status:'absent',fetching:state?.fetchStatus==='fetching',accountScoped:keyScope==='account',keyScope,accountKeyMatches};
        return {data:!userScoped||accountKeyMatches?cache.getQueryData(key):undefined,accountKeyMatches};
      };
      const authentication=env.systems?.authentication?.queries,library=env.systems?.library?.queries;
      const active=readQuery('activeUser',authentication?.activeUserId,undefined,false);
      actor=typeof active.data==='string'&&active.data.length>0&&active.data.length<=200&&active.data!=='active'?active.data:null;
      const profile=readQuery('profile',authentication?.userInfo);
      const owned=readQuery('owned',library?.resolveCatalogItems,{catalogId:'owned'});
      const assembled=readQuery('assembled',library?.assembledItems,{dataSet:'fullLibrary'});
      const access=readQuery('access',env.systems?.contentAccess?.queries?.allProductAccess);
      const catalogs=readQuery('catalogs',library?.resolveCatalogs);
      // Read only the noncredential stable Xbox ID, never serialize userInfo.
      r.accountIdentityPresent=typeof profile.data?.xuid==='string'&&/^\d{1,20}$/u.test(profile.data.xuid);
      r.accountScopesMatch=!!actor&&[profile,owned,assembled,access].every(q=>q.accountKeyMatches);
      r.accountStable=!!actor&&cache.getQueryData(authentication.activeUserId.getOptions().queryKey)===actor;
      const hasOwned=Array.isArray(owned.data)&&count(owned.data.length),hasAssembled=Array.isArray(assembled.data)&&count(assembled.data.length),hasAccess=count(access.data?.size)&&typeof access.data?.get==='function';
      if(hasOwned)r.ownedRows=owned.data.length;if(hasAssembled)r.assembledRows=assembled.data.length;if(hasAccess)r.accessProducts=access.data.size;
      // Catalog previews are not complete lists. Report their counts separately; never join them as Owned rows.
      if(Array.isArray(catalogs.data)&&count(catalogs.data.length)){
        const catalog=catalogs.data.find(c=>c?.id==='owned');
        if(count(catalog?.totalCount))r.ownedCatalogTotal=catalog.totalCount;
        if(Array.isArray(catalog?.previewEntries)&&count(catalog.previewEntries.length))r.ownedCatalogPreviewRows=catalog.previewEntries.length;
      }
      r.waitReason=!actor?'active-account-unavailable':!r.accountScopesMatch?'account-scope-mismatch':!r.accountStable?'account-changed':!hasOwned?'owned-view-not-cached':!hasAssembled?'assembled-not-cached':!hasAccess?'access-not-cached':undefined;
      if(r.waitReason){r.state=actor&&(!r.accountScopesMatch||!r.accountStable)?'incomplete':'waiting';return sanitize(r);}
      const ids=new Set(),titles=new Map();let unsupported=0,joined=0,missing=0,joinedAccess=0,firstParty=0;
      for(const entry of assembled.data)if(typeof entry?.productId==='string')titles.set(entry.productId,entry);
      for(const entry of owned.data){
        const id=entry?.productId;if(typeof id!=='string'||!/^[A-Z0-9]{12}$/u.test(id)){unsupported++;continue;}
        if(ids.has(id))continue;ids.add(id);
        const item=titles.get(id),title=item?.basicProductInfo?.title;
        if(typeof title==='string'&&title.trim()&&title.length<=500)joined++;else missing++;
        if(item?.providerId==='grts-catalog-provider')firstParty++;
        const types=access.data.get(id)?.userAccessTypes;
        if(typeof types?.has==='function'){joinedAccess++;for(const [bit,name]of Object.entries(flags))if(types.has(Number(bit)))r.flags[name]=(r.flags[name]??0)+1;}
      }
      Object.assign(r,{distinctProducts:ids.size,duplicateProducts:owned.data.length-ids.size-unsupported,unsupportedIdentities:unsupported,joinedTitles:joined,missingTitles:missing,joinedAccess,firstPartyProducts:firstParty});
      const visible=new Set();for(const link of [...(document?.querySelectorAll('a[href]')??[])].slice(0,5000)){
        try{const u=new URL(link.getAttribute('href'),window.location.href);if(u.origin==='https://play.xbox.com'&&/\/games\//u.test(u.pathname)){const last=u.pathname.split('/').filter(Boolean).at(-1);if(/^[A-Z0-9]{12}$/u.test(last))visible.add(last);}}catch{}
      }
      r.visibleProductLinks=visible.size;r.visibleOwnedLinks=[...visible].filter(id=>ids.has(id)).length;
      r.state=r.accountIdentityPresent&&r.accountScopesMatch&&r.accountStable&&unsupported===0&&r.duplicateProducts===0&&missing===0&&joinedAccess===ids.size&&firstParty===ids.size&&['activeUser','profile','owned','assembled','access'].every(name=>r.queries[name].state==='success'&&!r.queries[name].fetching)?'ready':'incomplete';
      return sanitize(r);
    }catch{return sanitize({...r,state:'unavailable'});}
  }
  root.GLXboxWebValidation=Object.freeze({read,sanitize});
})(globalThis);
