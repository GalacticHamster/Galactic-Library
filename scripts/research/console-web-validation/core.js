/* Research only. Projects aggregate diagnostics, never records or credentials. */
(function(root){
  'use strict';
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  const id=value=>typeof value==='string'&&value.length>0&&value.length<=200?value:null;
  const platform=value=>['PS4','PS5','ps4','ps5','NX','OUNCE','SWITCH','SWITCH2'].includes(value)?value:'other-or-absent';
  const knownFields=['id','titleId','productId','name','platform','platforms','membership','subscriptionService','isActive','isTrial','expirationDate','conceptId','contentId','edition','applicationId','applicationName','apparentPlatform','ownerNaId','userNaId','isHidden','isLending','isPartialLending','lendingExpireDatetime','insertedNsDeviceId','hasApplication','hasReleasedApplication','hasAddOnContents','hasReleasedAddOnContents','hasUpgrade','hasReleasedUpgrade'];
  const safeEnums=['ACTIVE_DATE','ACTIVATED_DATE','asc','desc','ASC','DESC','ALL','OWNED','LENDING','BORROWED'];
  const variableNames=['start','size','offset','limit','shopId','isActive','isHidden','platform','sortBy','sortDirection','order','vgcViewType','vgcViewStatus','fixedHiddenFalse'];
  const bootstrapFields=[...knownFields,'data','state','meta','user','account','vgc','vgcs','vgcViews','vgcViewsV2','views','cards','items','results','list','nodes','edges','node','initial','initialState','props','pageProps','countryId','country','lang','language','countries','shopGraphQLApiUrl','shopGraphqlApiUrl','savannaClientId','idToken','accountId','naId','offsetInfo','total','offset','limit','count'];
  const valueType=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
  const shape=value=>({type:valueType(value),...(value&&typeof value==='object'?{keyCount:Object.keys(value).length,fields:Object.fromEntries(Object.keys(value).filter(key=>bootstrapFields.includes(key)).map(key=>[key,valueType(value[key])]))}:{})});
  // Exact Savanna host supplied by the signed-in portal's shopGraphQLApiUrl.
  // Do not turn this into an allowlist for arbitrary nintendo.net subdomains.
  const nintendoHost=hostname=>/^[a-z0-9.-]+$/.test(hostname)&&(hostname.endsWith('.nintendo.com')||hostname==='wb.lp1.savanna.srv.nintendo.net');
  const nintendoEndpoint=url=>url.protocol==='https:'&&!url.username&&!url.password&&
    (url.origin==='https://wb.lp1.savanna.srv.nintendo.net'?url.pathname==='/graphql':url.hostname.endsWith('.nintendo.com')&&/^\/[a-zA-Z0-9/_-]{0,100}graphql\/?$/i.test(url.pathname));
  function providerForLocation(location){
    if(location.origin==='https://library.playstation.com')return 'playstation';
    if(location.origin==='https://accounts.nintendo.com'&&/^\/portal\/vgcs(?:\/|$)/.test(location.pathname))return 'nintendo';
    return null;
  }
  function safeVariables(input={}){
    const result={};
    for(const key of variableNames){const value=input[key];
      if(['start','size','offset','limit','shopId'].includes(key)&&integer(value))result[key]=value;
      else if(['isActive','isHidden','fixedHiddenFalse'].includes(key)&&typeof value==='boolean')result[key]=value;
      else if(key==='platform'&&Array.isArray(value)&&value.length<=5)result[key]=value.map(platform);
      else if(['sortBy','sortDirection','order','vgcViewType','vgcViewStatus'].includes(key)&&(safeEnums.includes(value)||value===null))result[key]=value;
    }return result;
  }
  function requestInfo(provider,input,options={}){
    try{
      const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
      if(url.protocol!=='https:'||url.username||url.password)return null;
      if(provider==='playstation'&&(url.origin!=='https://web.np.playstation.com'||url.pathname!=='/api/graphql/v1/op'))return null;
      if(provider==='nintendo'&&!nintendoEndpoint(url))return null;
      const method=String(options.method??input?.method??'GET').toUpperCase();
      const payload=method==='GET'?Object.fromEntries(url.searchParams):typeof options.body==='string'&&options.body.length<=262144?JSON.parse(options.body):null;
      if(!payload||!['GET','POST'].includes(method))return null;
      const query=typeof payload.query==='string'?payload.query:'';
      if(/\bmutation\b/.test(query))return null;
      const operation=payload.operationName??query.match(/^\s*query\s+([A-Za-z_]\w*)/)?.[1];
      // Unknown operations are counted, but their names/variables never leave the page.
      const recognized=provider==='playstation'?operation==='getPurchasedGameList':operation==='getVgcs';
      const variables=typeof payload.variables==='string'?JSON.parse(payload.variables):payload.variables??{};
      const credentials=options.credentials??input?.credentials;
      return {provider,endpoint:url.origin+url.pathname,method,operation:recognized?operation:'unrecognized',variables:safeVariables(variables),
        credentialVariablePresent:Object.hasOwn(variables,'idToken'),
        cookieMode:['include','same-origin','omit'].includes(credentials)?credentials:'browser-default',
        fixedHiddenFalse:/\bisHidden\s*:\s*false\b/.test(query)};
    }catch{return null;}
  }
  function psCookieQuery(input,options={}){
    const info=requestInfo('playstation',input,options);if(!info||info.method!=='GET'||info.operation!=='getPurchasedGameList')return null;
    try{
      const original=new URL(typeof input==='string'||input instanceof URL?input:input.url);
      const variables=JSON.parse(original.searchParams.get('variables'));
      const extensions=JSON.parse(original.searchParams.get('extensions'));
      if(!variables||Object.keys(variables).some(key=>!Object.hasOwn(info.variables,key))||!integer(variables.size)||variables.size<1||variables.size>100)return null;
      if(extensions?.persistedQuery?.version!==1||! /^[a-f0-9]{64}$/i.test(extensions.persistedQuery.sha256Hash))return null;
      const url=new URL(info.endpoint);url.search=new URLSearchParams({operationName:'getPurchasedGameList',variables:JSON.stringify({...info.variables,start:0}),extensions:JSON.stringify({persistedQuery:{version:1,sha256Hash:extensions.persistedQuery.sha256Hash}})});
      return url.href;
    }catch{return null;}
  }
  async function checkPsCookieAccess(url,fetchImpl=fetch){
    const safe=psCookieQuery(url);if(!safe)return {state:'unavailable',reason:'no-observed-safe-query'};
    try{
      const response=await fetchImpl(safe,{credentials:'include',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
      const result={state:'complete',httpStatus:response.status,pagesRequested:1,extraAuthorizationHeaders:false};
      if(response.status!==200)return {...result,reason:'request-rejected',recognizedPurchasedPage:false};
      const reader=response.body?.getReader();if(!reader)return {...result,reason:'unrecognized-response',recognizedPurchasedPage:false};
      const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){void reader.cancel();return {...result,reason:'response-bound',recognizedPurchasedPage:false};}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let start=0;for(const chunk of chunks){bytes.set(chunk,start);start+=chunk.length;}
      const body=JSON.parse(new TextDecoder().decode(bytes)),list=body?.data?.purchasedTitlesRetrieve;
      if(body?.errors?.length||!Array.isArray(list?.games)||list.games.length>1000||typeof list.pageInfo?.isLast!=='boolean')return {...result,reason:'unrecognized-response',recognizedPurchasedPage:false};
      return {...result,recognizedPurchasedPage:true,rows:list.games.length,reason:'recognized-purchase-page'};
    }catch{return {state:'complete',reason:'transport-or-response-failure',recognizedPurchasedPage:false,pagesRequested:1,extraAuthorizationHeaders:false};}
  }
  function bootstrapSummary(document){
    const result={blocks:[],declaredGraphqlEndpoints:[],cardArrays:[],accountIdentityFieldPaths:[],structure:[],boundReached:false};
    let visited=0;
    for(const blockId of ['data','state','meta']){
      const text=document.getElementById(blockId)?.getAttribute('data-json');if(!text)continue;
      if(text.length>2097152){result.boundReached=true;continue;}
      let object;try{object=JSON.parse(text);}catch{result.blocks.push({block:blockId,parsed:false});continue;}
      result.blocks.push({block:blockId,parsed:true,...shape(object)});
      for(const field of ['shopGraphQLApiUrl','shopGraphqlApiUrl']){
        try{const url=new URL(object?.[field]);if(nintendoEndpoint(url))result.declaredGraphqlEndpoints.push(url.origin+url.pathname);}catch{}
      }
      for(const parent of ['user','account'])for(const field of ['id','naId','accountId']){
        const value=object?.[parent]?.[field];if(typeof value==='string'||typeof value==='number')result.accountIdentityFieldPaths.push(blockId+'.'+parent+'.'+field);
      }
      const queue=[object],seenShapes=new Set();
      for(let index=0;index<queue.length;index++){
        if(++visited>2000){result.boundReached=true;break;}
        const value=queue[index];if(!value||typeof value!=='object')continue;
        const structure=shape(value),shapeKey=JSON.stringify(structure);if(seenShapes.size<12&&!seenShapes.has(shapeKey)){seenShapes.add(shapeKey);result.structure.push({block:blockId,...structure});}
        for(const [field,child] of Object.entries(value)){
          if(['shopGraphQLApiUrl','shopGraphqlApiUrl'].includes(field))try{const url=new URL(child);if(nintendoEndpoint(url))result.declaredGraphqlEndpoints.push(url.origin+url.pathname);}catch{}
        }
        if(Array.isArray(value)&&value.length&&value.some(row=>row&&typeof row==='object'&&typeof row.applicationId==='string'&&typeof row.id==='string')){
          if(value.length>1000||result.cardArrays.length>=8){result.boundReached=true;continue;}
          const ledger=createLedger('nintendo');ledger.observe({provider:'nintendo',operation:'getVgcs',variables:{offset:0},fixedHiddenFalse:false},200,{data:{account:{vgc:{vgcViews:{views:value,offsetInfo:{offset:0}}}}}});
          const scope=ledger.report().scopes[0];if(scope)result.cardArrays.push({block:blockId,rows:scope.rows,distinctRowIds:scope.distinctRowIds,distinctSoftwareProductIds:scope.distinctSoftwareProductIds,presentFields:scope.presentFields,platforms:scope.platforms,flags:scope.flags,ownerUserRelations:scope.ownerUserRelations});
          continue;
        }
        for(const child of Object.values(value).slice(0,500))if(child&&typeof child==='object'&&queue.length<2000)queue.push(child);
      }
    }
    result.declaredGraphqlEndpoints=[...new Set(result.declaredGraphqlEndpoints)];return result;
  }
  function resourceSummary(performance){
    const groups=new Map();let boundReached=false;
    const entries=performance?.getEntriesByType?.('resource')??[];
    for(const entry of entries.slice(0,1000)){
      let url;try{url=new URL(entry.name);}catch{continue;}
      if(url.protocol!=='https:'||!nintendoHost(url.hostname))continue;
      const kind=['fetch','xmlhttprequest','script','iframe'].includes(entry.initiatorType)?entry.initiatorType:'other';
      const key=url.hostname+'|'+kind;
      if(!groups.has(key)&&groups.size>=30){boundReached=true;continue;}
      const group=groups.get(key)??{host:url.hostname,kind,count:0,graphqlPaths:0};group.count++;if(/graphql/i.test(url.pathname))group.graphqlPaths++;groups.set(key,group);
    }
    return {groups:[...groups.values()],boundReached:boundReached||entries.length>1000};
  }
  function createLedger(provider){
    const pages=new Map();let requests=0,failures=0,unknownOperations=0,malformed=0,bounded=false;
    const observations=[];
    function observe(request,status,body,transport='fetch'){
      if(!request||request.provider!==provider)return;
      requests++;
      if(!['getPurchasedGameList','getVgcs'].includes(request.operation)){unknownOperations++;return;}
      if(observations.length<20)observations.push({...request,transport,httpStatus:integer(status)&&status<=599?status:0});
      if(status!==200||body?.errors?.length){failures++;return;}
      const list=provider==='playstation'?body?.data?.purchasedTitlesRetrieve:body?.data?.account?.vgc?.vgcViews;
      const rows=provider==='playstation'?list?.games:list?.views;
      const paging=provider==='playstation'?list?.pageInfo:list?.offsetInfo;
      const offset=paging?.offset??request.variables.start??request.variables.offset;
      if(!Array.isArray(rows)||rows.length>1000||!integer(offset)||!paging){malformed++;return;}
      const scope=JSON.stringify({...request.variables,start:undefined,offset:undefined,size:undefined,limit:undefined,fixedHiddenFalse:request.fixedHiddenFalse});
      const pageKey=JSON.stringify([scope,offset]);
      if(!pages.has(pageKey)&&(pages.size>=64||[...pages.values()].reduce((sum,p)=>sum+p.count,0)+rows.length>20000)){bounded=true;return;}
      const identifiers=new Set(),software=new Set(),fields={},platforms={},flags={},relations={sameOwnerAndUser:0,differentOwnerAndUser:0,ownerOrUserAbsent:0};
      for(const row of rows){
        if(!row||typeof row!=='object'||Array.isArray(row)){malformed++;return;}
        for(const key of knownFields)if(Object.hasOwn(row,key))fields[key]=(fields[key]??0)+1;
        // Keep identifier domains separate; don't mistake title IDs for product IDs.
        const key=id(row.id);if(key)identifiers.add(key);
        const product=id(provider==='playstation'?row.productId:row.applicationId);if(product)software.add(product);
        const label=platform(row.apparentPlatform??row.platform);platforms[label]=(platforms[label]??0)+1;
        for(const key of ['isActive','isTrial','isHidden','isLending','isPartialLending','hasApplication','hasReleasedApplication','hasAddOnContents','hasReleasedAddOnContents','hasUpgrade','hasReleasedUpgrade'])
          if(typeof row[key]==='boolean'){const flag=key+':'+row[key];flags[flag]=(flags[flag]??0)+1;}
        for(const key of ['subscriptionService','membership'])if(Object.hasOwn(row,key)){
          const value=row[key],safe=['NONE','PS_PLUS','PSPLUS','PS_NOW','PSNOW','PLUS','EA_PLAY'].includes(value)?value:value===null?'null':typeof value==='boolean'?String(value):'other-or-structured';
          const flag=key+':'+safe;flags[flag]=(flags[flag]??0)+1;
        }
        if(provider==='nintendo'){
          if(id(row.ownerNaId)&&id(row.userNaId))relations[row.ownerNaId===row.userNaId?'sameOwnerAndUser':'differentOwnerAndUser']++;
          else relations.ownerOrUserAbsent++;
        }
      }
      pages.set(pageKey,{scope,offset,count:rows.length,identifiers,software,fields,platforms,flags,relations,
        total:integer(paging.total)?paging.total:null,last:provider==='playstation'?paging.isLast===true:false});
    }
    function report(){
      const scopes=new Map();
      for(const page of pages.values()){
        let scope=scopes.get(page.scope);if(!scope)scopes.set(page.scope,scope={pages:[],ids:new Set(),software:new Set(),fields:{},platforms:{},flags:{},relations:{}});
        scope.pages.push(page);for(const value of page.identifiers)scope.ids.add(value);for(const value of page.software)scope.software.add(value);
        for(const key of ['fields','platforms','flags','relations'])for(const [name,count]of Object.entries(page[key]))scope[key][name]=(scope[key][name]??0)+count;
      }
      return {format:1,helperVersion:'0.1.4',provider,readOnly:true,requestsObserved:requests,failedRequests:failures,unrecognizedOperations:unknownOperations,malformedPages:malformed,boundReached:bounded,
        requestContracts:observations,scopes:[...scopes].map(([scope,s])=>{
          const pages=s.pages.sort((a,b)=>a.offset-b.offset);let end=0,contiguous=true;
          for(const p of pages){if(p.offset!==end)contiguous=false;end=p.offset+p.count;}
          const totals=new Set(pages.map(p=>p.total).filter(n=>n!==null));
          const terminal=pages.at(-1);
          return {scope:JSON.parse(scope),pagesObserved:pages.length,rows:pages.reduce((sum,p)=>sum+p.count,0),distinctRowIds:s.ids.size,distinctSoftwareProductIds:s.software.size,
            rowIdDomain:provider==='playstation'?'response id (meaning unverified)':'card/view id',softwareIdDomain:provider==='playstation'?'productId only':'applicationId',
            reportedTotals:[...totals],observedScopeTraversal:!bounded&&contiguous&&(provider==='playstation'?terminal?.last===true:totals.size===1&&end===[...totals][0])?'terminal-range-observed':'not-established',
            presentFields:s.fields,platforms:s.platforms,flags:s.flags,ownerUserRelations:s.relations};
        }),accountIsolationValidated:false,ownershipSemanticsValidated:false,accountLibraryComplete:false};
    }
    return {observe,report};
  }
  // Re-project even MAIN-world messages in the isolated UI; never copy arbitrary
  // fields supplied by a webpage into an export. This is not an import authority.
  function sanitizeReport(input){
    if(!input||input.format!==1||!['playstation','nintendo'].includes(input.provider))return null;
    const numericKeys=['requestsObserved','failedRequests','unrecognizedOperations','malformedPages','pagesObserved','rows','distinctRowIds','distinctSoftwareProductIds'];
    const numbers=value=>Object.fromEntries(numericKeys.filter(key=>integer(value?.[key])).map(key=>[key,value[key]]));
    const counts=(value,valid)=>Object.fromEntries(Object.entries(value??{}).slice(0,100).filter(([key,count])=>valid(key)&&integer(count)));
    const flags=key=>/^(?:isActive|isTrial|isHidden|isLending|isPartialLending|hasApplication|hasReleasedApplication|hasAddOnContents|hasReleasedAddOnContents|hasUpgrade|hasReleasedUpgrade):(?:true|false)$/.test(key)||/^(?:subscriptionService|membership):(?:NONE|PS_PLUS|PSPLUS|PS_NOW|PSNOW|PLUS|EA_PLAY|null|true|false|other-or-structured)$/.test(key);
    const result={format:1,provider:input.provider,readOnly:true,...numbers(input),boundReached:input.boundReached===true,
      active:input.active===true,accountIsolationValidated:false,ownershipSemanticsValidated:false,accountLibraryComplete:false};
    if(['0.1.1','0.1.2','0.1.3','0.1.4'].includes(input.helperVersion))result.helperVersion=input.helperVersion;
    result.requestContracts=(Array.isArray(input.requestContracts)?input.requestContracts:[]).slice(0,20).flatMap(r=>{
      // Validate endpoints independently of request bodies on the receiving side.
      let url;try{url=new URL(r.endpoint);}catch{return [];}
      if(url.search||url.hash||url.username||url.password||url.protocol!=='https:'||
        !(input.provider==='playstation'?url.href==='https://web.np.playstation.com/api/graphql/v1/op':nintendoEndpoint(url)))return [];
      return [{provider:input.provider,endpoint:url.origin+url.pathname,method:['GET','POST'].includes(r.method)?r.method:'unrecognized',operation:['getPurchasedGameList','getVgcs','unrecognized'].includes(r.operation)?r.operation:'unrecognized',variables:safeVariables(r.variables),credentialVariablePresent:r.credentialVariablePresent===true,cookieMode:['include','same-origin','omit','browser-default'].includes(r.cookieMode)?r.cookieMode:'unrecognized',fixedHiddenFalse:r.fixedHiddenFalse===true,transport:r.transport==='xhr'?'xhr':'fetch',httpStatus:integer(r.httpStatus)&&r.httpStatus<=599?r.httpStatus:0}];
    });
    result.scopes=(Array.isArray(input.scopes)?input.scopes:[]).slice(0,64).map(s=>({...numbers(s),scope:safeVariables(s.scope),reportedTotals:(Array.isArray(s.reportedTotals)?s.reportedTotals:[]).filter(integer).slice(0,64),observedScopeTraversal:s.observedScopeTraversal==='terminal-range-observed'?'terminal-range-observed':'not-established',presentFields:counts(s.presentFields,key=>knownFields.includes(key)),platforms:counts(s.platforms,key=>platform(key)===key),flags:counts(s.flags,flags),ownerUserRelations:counts(s.ownerUserRelations,key=>['sameOwnerAndUser','differentOwnerAndUser','ownerOrUserAbsent'].includes(key))}));
    if(input.observerState){const r=input.observerState;result.observerState={fetchHookInstalled:r.fetchHookInstalled===true,xhrOpenHookInstalled:r.xhrOpenHookInstalled===true,xhrSendHookInstalled:r.xhrSendHookInstalled===true,fetchCalls:integer(r.fetchCalls)?r.fetchCalls:0,xhrCalls:integer(r.xhrCalls)?r.xhrCalls:0};}
    if(input.readOnlyCookieCheck){const r=input.readOnlyCookieCheck;result.readOnlyCookieCheck={state:['ready','running','complete','unavailable'].includes(r.state)?r.state:'unavailable',reason:['no-observed-safe-query','request-rejected','unrecognized-response','response-bound','recognized-purchase-page','transport-or-response-failure'].includes(r.reason)?r.reason:null,recognizedPurchasedPage:r.recognizedPurchasedPage===true,extraAuthorizationHeaders:false,...numbers(r),...(integer(r.httpStatus)&&r.httpStatus<=599?{httpStatus:r.httpStatus}:{}),...(r.pagesRequested===1?{pagesRequested:1}:{})};}
    if(input.bootstrap&&input.provider==='nintendo'){
      const safeShape=row=>({type:['object','array','string','number','boolean','null','undefined'].includes(row.type)?row.type:'unknown',...(integer(row.keyCount)?{keyCount:row.keyCount}:{}),fields:Object.fromEntries(Object.entries(row.fields??{}).filter(([key,type])=>bootstrapFields.includes(key)&&['object','array','string','number','boolean','null','undefined'].includes(type)))});
      const b=input.bootstrap;result.bootstrap={blocks:(Array.isArray(b.blocks)?b.blocks:[]).filter(row=>['data','state','meta'].includes(row.block)).map(row=>({block:row.block,parsed:row.parsed===true,...safeShape(row)})),boundReached:b.boundReached===true,
        structure:(Array.isArray(b.structure)?b.structure:[]).slice(0,40).filter(row=>['data','state','meta'].includes(row.block)).map(row=>({block:row.block,...safeShape(row)})),
        declaredGraphqlEndpoints:(Array.isArray(b.declaredGraphqlEndpoints)?b.declaredGraphqlEndpoints:[]).slice(0,3).filter(value=>{try{const u=new URL(value);return nintendoEndpoint(u)&&!u.search&&!u.hash;}catch{return false;}}),
        accountIdentityFieldPaths:(Array.isArray(b.accountIdentityFieldPaths)?b.accountIdentityFieldPaths:[]).filter(value=>/^(data|state|meta)\.(user|account)\.(id|naId|accountId)$/.test(value)),
        cardArrays:(Array.isArray(b.cardArrays)?b.cardArrays:[]).slice(0,8).filter(row=>['data','state','meta'].includes(row.block)).map(row=>({block:row.block,...numbers(row),presentFields:counts(row.presentFields,key=>knownFields.includes(key)),platforms:counts(row.platforms,key=>platform(key)===key),flags:counts(row.flags,flags),ownerUserRelations:counts(row.ownerUserRelations,key=>['sameOwnerAndUser','differentOwnerAndUser','ownerOrUserAbsent'].includes(key))}))};
    }
    if(input.resources&&input.provider==='nintendo')result.resources={boundReached:input.resources.boundReached===true,groups:(Array.isArray(input.resources.groups)?input.resources.groups:[]).slice(0,30).filter(row=>typeof row.host==='string'&&nintendoHost(row.host)&&['fetch','xmlhttprequest','script','iframe','other'].includes(row.kind)&&integer(row.count)&&integer(row.graphqlPaths)).map(row=>({host:row.host,kind:row.kind,count:row.count,graphqlPaths:row.graphqlPaths}))};
    return result;
  }
  root.GLConsoleValidationCore=Object.freeze({providerForLocation,requestInfo,createLedger,sanitizeReport,psCookieQuery,checkPsCookieAccess,bootstrapSummary,resourceSummary});
})(globalThis);
