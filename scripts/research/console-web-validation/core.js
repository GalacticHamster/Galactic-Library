/* Research only. Projects aggregate diagnostics, never records or credentials. */
(function(root){
  'use strict';
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  const id=value=>typeof value==='string'&&value.length>0&&value.length<=200?value:null;
  const platform=value=>['PS4','PS5','ps4','ps5','NX','OUNCE','SWITCH','SWITCH2'].includes(value)?value:'other-or-absent';
  const knownFields=['id','titleId','productId','name','platform','platforms','membership','subscriptionService','isActive','isTrial','expirationDate','conceptId','contentId','edition','applicationId','applicationName','apparentPlatform','ownerNaId','userNaId','isHidden','isLending','isPartialLending','lendingExpireDatetime','insertedNsDeviceId','hasApplication','hasReleasedApplication','hasAddOnContents','hasReleasedAddOnContents','hasUpgrade','hasReleasedUpgrade'];
  const safeEnums=['ACTIVE_DATE','ACTIVATED_DATE','asc','desc','ASC','DESC','ALL','OWNED','LENDING','BORROWED'];
  const variableNames=['start','size','offset','limit','shopId','isActive','isHidden','platform','sortBy','sortDirection','order','vgcViewType','vgcViewStatus','fixedHiddenFalse'];
  const operations={playstation:{getPurchasedGameList:'library',getProfileOracle:'identity'},nintendo:{getVgcs:'library',getVgcsVgcs:'library',getVgcTotalsVgcs:'auxiliary',getDevicesVgcs:'auxiliary',getAllDevicesVgcs:'auxiliary'}};
  const operationKind=(provider,name)=>typeof name==='string'&&Object.hasOwn(operations[provider]??{},name)?operations[provider][name]:null;
  const responsePaths=['data','data.account','data.account.vgc','data.account.vgc.vgcViews','data.account.vgc.vgcViewsV2'];
  const psErrorCategories=['csrf-request-headers','authentication','persisted-query','request-format','unclassified'];
  const psErrorCodes=['BAD_REQUEST','UNAUTHENTICATED','FORBIDDEN','GRAPHQL_VALIDATION_FAILED','PERSISTED_QUERY_NOT_FOUND','PERSISTED_QUERY_NOT_SUPPORTED'];
  function psErrorSummary(body,status){
    const errors=(Array.isArray(body)?body:Array.isArray(body?.errors)?body.errors:[]).slice(0,20);
    const errorCodes=[...new Set(errors.map(error=>error?.extensions?.code).filter(code=>psErrorCodes.includes(code)))];
    const errorCategory=errors.some(error=>typeof error?.message==='string'&&/blocked as a potential Cross-Site Request Forgery \(CSRF\)/i.test(error.message))?'csrf-request-headers'
      :[401,403].includes(status)||errorCodes.some(code=>['UNAUTHENTICATED','FORBIDDEN'].includes(code))?'authentication'
      :errorCodes.some(code=>code.startsWith('PERSISTED_QUERY_'))?'persisted-query'
      :errorCodes.some(code=>['BAD_REQUEST','GRAPHQL_VALIDATION_FAILED'].includes(code))?'request-format':'unclassified';
    return {errorCategory,...(errorCodes.length?{errorCodes}:{})};
  }
  const bootstrapFields=[...knownFields,'data','state','meta','user','account','vgc','vgcs','vgcViews','vgcViewsV2','views','cards','items','results','list','nodes','edges','node','initial','initialState','props','pageProps','countryId','country','lang','language','countries','shopGraphQLApiUrl','shopGraphqlApiUrl','savannaClientId','idToken','accountId','naId','obfuscatedId','offsetInfo','total','offset','limit','count'];
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
      const recognized=operationKind(provider,operation)!==null;
      const variables=typeof payload.variables==='string'?JSON.parse(payload.variables):payload.variables??{};
      const credentials=options.credentials??input?.credentials;
      return {provider,endpoint:url.origin+url.pathname,method,operation:recognized?operation:'unrecognized',variables:safeVariables(variables),
        credentialVariablePresent:Object.hasOwn(variables,'idToken'),
        cookieMode:['include','same-origin','omit'].includes(credentials)?credentials:'browser-default',
        fixedHiddenFalse:/\bisHidden\s*:\s*false\b/.test(query)};
    }catch{return null;}
  }
  function psCookieQuery(input,options={},operation='getPurchasedGameList'){
    if(!['getPurchasedGameList','getProfileOracle'].includes(operation))return null;
    const info=requestInfo('playstation',input,options);if(!info||info.method!=='GET'||info.operation!==operation)return null;
    try{
      const original=new URL(typeof input==='string'||input instanceof URL?input:input.url);
      const variables=JSON.parse(original.searchParams.get('variables'));
      const extensions=JSON.parse(original.searchParams.get('extensions'));
      if(!variables||typeof variables!=='object'||Array.isArray(variables))return null;
      if(operation==='getProfileOracle'?Object.keys(variables).length!==0:
        Object.keys(variables).some(key=>!Object.hasOwn(info.variables,key))||!integer(variables.size)||variables.size<1||variables.size>100)return null;
      if(extensions?.persistedQuery?.version!==1||! /^[a-f0-9]{64}$/i.test(extensions.persistedQuery.sha256Hash))return null;
      const url=new URL(info.endpoint);url.search=new URLSearchParams({operationName:operation,variables:JSON.stringify(operation==='getProfileOracle'?{}:{...info.variables,start:0}),extensions:JSON.stringify({persistedQuery:{version:1,sha256Hash:extensions.persistedQuery.sha256Hash}})});
      return url.href;
    }catch{return null;}
  }
  async function checkPsCookieAccess(url,fetchImpl=fetch,operation='getPurchasedGameList'){
    const safe=psCookieQuery(url,{},operation);if(!safe)return {state:'unavailable',reason:'no-observed-safe-query'};
    try{
      // JSON content type satisfies Apollo's CSRF/preflight requirement for GET.
      // These fixed protocol headers contain no Sony client/authentication data.
      const response=await fetchImpl(safe,{credentials:'include',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});
      const result={state:'complete',httpStatus:response.status,pagesRequested:1,extraAuthorizationHeaders:false,requestFormat:'json-content-type'};
      const rejected=response.status!==200,failure={...result,reason:rejected?'request-rejected':'unrecognized-response',recognizedPurchasedPage:false};
      const reader=response.body?.getReader();if(!reader)return {...failure,...(rejected?psErrorSummary(null,response.status):{})};
      const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){void reader.cancel();return {...result,reason:'response-bound',recognizedPurchasedPage:false};}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let start=0;for(const chunk of chunks){bytes.set(chunk,start);start+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return {...failure,...(rejected?psErrorSummary(null,response.status):{})};}
      if(rejected)return {...failure,...psErrorSummary(body,response.status)};
      if(operation==='getProfileOracle'){
        const profile=body?.data?.oracleUserProfileRetrieve;
        const accountIdPresent=!body?.errors?.length&&id(profile?.accountId)!==null;
        return {...result,recognizedAccountProfile:accountIdPresent,accountIdPresent,onlineIdPresent:id(profile?.onlineId)!==null,
          reason:accountIdPresent?'recognized-account-profile':'unrecognized-response',...(!accountIdPresent?psErrorSummary(body,response.status):{})};
      }
      const list=body?.data?.purchasedTitlesRetrieve;
      if(body?.errors?.length||!Array.isArray(list?.games)||list.games.length>1000||typeof list.pageInfo?.isLast!=='boolean')return {...failure,...psErrorSummary(body,response.status)};
      return {...result,recognizedPurchasedPage:true,rows:list.games.length,reason:'recognized-purchase-page'};
    }catch{return {state:'complete',reason:'transport-or-response-failure',recognizedPurchasedPage:false,pagesRequested:1,extraAuthorizationHeaders:false};}
  }
  function nintendoAccountCandidate(document){
    // Only this noncredential field is read; never decode idToken or inspect login IDs.
    const raw=document?.getElementById('state')?.getAttribute('data-json');
    if(typeof raw!=='string'||raw.length>2097152)return null;
    try{return id(JSON.parse(raw)?.user?.obfuscatedId);}catch{return null;}
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
      for(const parent of ['user','account'])for(const field of ['id','naId','accountId','obfuscatedId']){
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
  function createLedger(provider,{readNintendoAccount=()=>null}={}){
    const pages=new Map();let requests=0,failures=0,unknownOperations=0,auxiliary=0,malformed=0,bounded=false;
    const observations=[];
    let priorAccount=null,accountChanged=false,accountResponses=0,accountIdPresent=false,onlineIdPresent=false;
    function observe(request,status,body,transport='fetch'){
      if(!request||request.provider!==provider)return;
      requests++;
      const kind=operationKind(provider,request.operation);
      if(!kind){unknownOperations++;return;}
      if(kind==='auxiliary')auxiliary++;
      // Fixed paths and field types only: enough to diagnose an unrecognized
      // response envelope without exporting values, rows or account identifiers.
      const responseShape=provider==='nintendo'&&kind==='library'?responsePaths.flatMap(path=>{
        const value=path.split('.').reduce((node,key)=>node?.[key],body);return value&&typeof value==='object'?[{path,...shape(value)}]:[];
      }):[];
      if(observations.length<20)observations.push({...request,transport,httpStatus:integer(status)&&status<=599?status:0,...(responseShape.length?{responseShape}:{})});
      if(status!==200||body?.errors?.length){failures++;return;}
      if(kind==='auxiliary')return;
      if(kind==='identity'){
        accountResponses++;const profile=body?.data?.oracleUserProfileRetrieve,account=id(profile?.accountId);
        accountIdPresent=account!==null;onlineIdPresent=id(profile?.onlineId)!==null;
        if(account){if(priorAccount&&account!==priorAccount)accountChanged=true;priorAccount=account;}
        return;
      }
      const vgc=body?.data?.account?.vgc;
      const listFields=vgc&&typeof vgc==='object'?['vgcViews','vgcViewsV2'].filter(key=>Object.hasOwn(vgc,key)):[];
      const list=provider==='playstation'?body?.data?.purchasedTitlesRetrieve:listFields.length===1?vgc[listFields[0]]:null;
      const rows=provider==='playstation'?list?.games:list?.views;
      const paging=provider==='playstation'?list?.pageInfo:list?.offsetInfo;
      const offset=paging?.offset??request.variables.start??request.variables.offset;
      if(!Array.isArray(rows)||rows.length>1000||!integer(offset)||!paging){malformed++;return;}
      const scope=JSON.stringify({...request.variables,start:undefined,offset:undefined,size:undefined,limit:undefined,fixedHiddenFalse:request.fixedHiddenFalse});
      const pageKey=JSON.stringify([scope,offset]);
      if(!pages.has(pageKey)&&(pages.size>=64||[...pages.values()].reduce((sum,p)=>sum+p.count,0)+rows.length>20000)){bounded=true;return;}
      const identifiers=new Set(),software=new Set(),fields={},platforms={},flags={},relations={sameOwnerAndUser:0,differentOwnerAndUser:0,ownerOrUserAbsent:0};
      let account=null;try{if(provider==='nintendo')account=id(readNintendoAccount());}catch{/* Missing bootstrap remains explicit. */}
      if(account){if(priorAccount&&account!==priorAccount)accountChanged=true;priorAccount=account;}
      const accountRelations={candidatePresent:account!==null,ownerMatchesAccount:0,userMatchesAccount:0,neitherMatchesAccount:0,ownerOrUserAbsent:0};
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
          if(account){
            if(!id(row.ownerNaId)||!id(row.userNaId))accountRelations.ownerOrUserAbsent++;
            if(row.ownerNaId===account)accountRelations.ownerMatchesAccount++;
            if(row.userNaId===account)accountRelations.userMatchesAccount++;
            if(id(row.ownerNaId)&&id(row.userNaId)&&row.ownerNaId!==account&&row.userNaId!==account)accountRelations.neitherMatchesAccount++;
          }
        }
      }
      pages.set(pageKey,{scope,offset,count:rows.length,identifiers,software,fields,platforms,flags,relations,accountRelations,
        total:integer(paging.total)?paging.total:null,last:provider==='playstation'?paging.isLast===true:false});
    }
    function report(){
      const scopes=new Map();
      for(const page of pages.values()){
        let scope=scopes.get(page.scope);if(!scope)scopes.set(page.scope,scope={pages:[],ids:new Set(),software:new Set(),fields:{},platforms:{},flags:{},relations:{},accountRelations:{candidatePresent:true,ownerMatchesAccount:0,userMatchesAccount:0,neitherMatchesAccount:0,ownerOrUserAbsent:0}});
        scope.pages.push(page);for(const value of page.identifiers)scope.ids.add(value);for(const value of page.software)scope.software.add(value);
        for(const key of ['fields','platforms','flags','relations'])for(const [name,count]of Object.entries(page[key]))scope[key][name]=(scope[key][name]??0)+count;
        scope.accountRelations.candidatePresent&&=page.accountRelations.candidatePresent;
        for(const key of ['ownerMatchesAccount','userMatchesAccount','neitherMatchesAccount','ownerOrUserAbsent'])scope.accountRelations[key]+=page.accountRelations[key];
      }
      return {format:1,helperVersion:'0.1.7',provider,readOnly:true,requestsObserved:requests,failedRequests:failures,unrecognizedOperations:unknownOperations,auxiliaryRequests:auxiliary,malformedPages:malformed,boundReached:bounded,
        accountIdentity:provider==='playstation'?{source:'getProfileOracle',responsesObserved:accountResponses,accountIdPresent,onlineIdPresent,accountChanged}:{source:'state.user.obfuscatedId',candidatePresent:priorAccount!==null,accountChanged},
        requestContracts:observations,scopes:[...scopes].map(([scope,s])=>{
          const pages=s.pages.sort((a,b)=>a.offset-b.offset);let end=0,contiguous=true;
          for(const p of pages){if(p.offset!==end)contiguous=false;end=p.offset+p.count;}
          const totals=new Set(pages.map(p=>p.total).filter(n=>n!==null));
          const terminal=pages.at(-1);
          return {scope:JSON.parse(scope),pagesObserved:pages.length,rows:pages.reduce((sum,p)=>sum+p.count,0),distinctRowIds:s.ids.size,distinctSoftwareProductIds:s.software.size,
            rowIdDomain:provider==='playstation'?'response id (meaning unverified)':'card/view id',softwareIdDomain:provider==='playstation'?'productId only':'applicationId',
            reportedTotals:[...totals],observedScopeTraversal:!bounded&&contiguous&&(provider==='playstation'?terminal?.last===true:totals.size===1&&end===[...totals][0])?'terminal-range-observed':'not-established',
            presentFields:s.fields,platforms:s.platforms,flags:s.flags,ownerUserRelations:s.relations,...(provider==='nintendo'?{accountRelations:s.accountRelations}:{})};
        }),accountIsolationValidated:false,ownershipSemanticsValidated:false,accountLibraryComplete:false};
    }
    return {observe,report};
  }
  // Re-project even MAIN-world messages in the isolated UI; never copy arbitrary
  // fields supplied by a webpage into an export. This is not an import authority.
  function sanitizeReport(input){
    if(!input||input.format!==1||!['playstation','nintendo'].includes(input.provider))return null;
    const numericKeys=['requestsObserved','failedRequests','unrecognizedOperations','auxiliaryRequests','malformedPages','pagesObserved','rows','distinctRowIds','distinctSoftwareProductIds'];
    const numbers=value=>Object.fromEntries(numericKeys.filter(key=>integer(value?.[key])).map(key=>[key,value[key]]));
    const counts=(value,valid)=>Object.fromEntries(Object.entries(value??{}).slice(0,100).filter(([key,count])=>valid(key)&&integer(count)));
    const flags=key=>/^(?:isActive|isTrial|isHidden|isLending|isPartialLending|hasApplication|hasReleasedApplication|hasAddOnContents|hasReleasedAddOnContents|hasUpgrade|hasReleasedUpgrade):(?:true|false)$/.test(key)||/^(?:subscriptionService|membership):(?:NONE|PS_PLUS|PSPLUS|PS_NOW|PSNOW|PLUS|EA_PLAY|null|true|false|other-or-structured)$/.test(key);
    const safeShape=row=>({type:['object','array','string','number','boolean','null','undefined'].includes(row.type)?row.type:'unknown',...(integer(row.keyCount)?{keyCount:row.keyCount}:{}),fields:Object.fromEntries(Object.entries(row.fields??{}).filter(([key,type])=>bootstrapFields.includes(key)&&['object','array','string','number','boolean','null','undefined'].includes(type)))});
    const result={format:1,provider:input.provider,readOnly:true,...numbers(input),boundReached:input.boundReached===true,
      active:input.active===true,accountIsolationValidated:false,ownershipSemanticsValidated:false,accountLibraryComplete:false};
    if(['0.1.1','0.1.2','0.1.3','0.1.4','0.1.5','0.1.6','0.1.7'].includes(input.helperVersion))result.helperVersion=input.helperVersion;
    result.requestContracts=(Array.isArray(input.requestContracts)?input.requestContracts:[]).slice(0,20).flatMap(r=>{
      // Validate endpoints independently of request bodies on the receiving side.
      let url;try{url=new URL(r.endpoint);}catch{return [];}
      if(url.search||url.hash||url.username||url.password||url.protocol!=='https:'||
        !(input.provider==='playstation'?url.href==='https://web.np.playstation.com/api/graphql/v1/op':nintendoEndpoint(url)))return [];
      return [{provider:input.provider,endpoint:url.origin+url.pathname,method:['GET','POST'].includes(r.method)?r.method:'unrecognized',operation:operationKind(input.provider,r.operation)?r.operation:'unrecognized',variables:safeVariables(r.variables),credentialVariablePresent:r.credentialVariablePresent===true,cookieMode:['include','same-origin','omit','browser-default'].includes(r.cookieMode)?r.cookieMode:'unrecognized',fixedHiddenFalse:r.fixedHiddenFalse===true,transport:r.transport==='xhr'?'xhr':'fetch',httpStatus:integer(r.httpStatus)&&r.httpStatus<=599?r.httpStatus:0,...(Array.isArray(r.responseShape)?{responseShape:r.responseShape.slice(0,responsePaths.length).filter(row=>row&&responsePaths.includes(row.path)).map(row=>({path:row.path,...safeShape(row)}))}:{})}];
    });
    result.scopes=(Array.isArray(input.scopes)?input.scopes:[]).slice(0,64).map(s=>({...numbers(s),scope:safeVariables(s.scope),reportedTotals:(Array.isArray(s.reportedTotals)?s.reportedTotals:[]).filter(integer).slice(0,64),observedScopeTraversal:s.observedScopeTraversal==='terminal-range-observed'?'terminal-range-observed':'not-established',presentFields:counts(s.presentFields,key=>knownFields.includes(key)),platforms:counts(s.platforms,key=>platform(key)===key),flags:counts(s.flags,flags),ownerUserRelations:counts(s.ownerUserRelations,key=>['sameOwnerAndUser','differentOwnerAndUser','ownerOrUserAbsent'].includes(key))}));
    if(input.provider==='nintendo')for(let i=0;i<result.scopes.length;i++){
      const r=input.scopes[i]?.accountRelations;
      if(r)result.scopes[i].accountRelations={candidatePresent:r.candidatePresent===true,...counts(r,key=>['ownerMatchesAccount','userMatchesAccount','neitherMatchesAccount','ownerOrUserAbsent'].includes(key))};
    }
    if(input.accountIdentity){const r=input.accountIdentity;result.accountIdentity=input.provider==='playstation'?
      {source:'getProfileOracle',responsesObserved:integer(r.responsesObserved)?r.responsesObserved:0,accountIdPresent:r.accountIdPresent===true,onlineIdPresent:r.onlineIdPresent===true,accountChanged:r.accountChanged===true}:
      {source:'state.user.obfuscatedId',candidatePresent:r.candidatePresent===true,accountChanged:r.accountChanged===true};}
    if(input.observerState){const r=input.observerState;result.observerState={fetchHookInstalled:r.fetchHookInstalled===true,xhrOpenHookInstalled:r.xhrOpenHookInstalled===true,xhrSendHookInstalled:r.xhrSendHookInstalled===true,fetchCalls:integer(r.fetchCalls)?r.fetchCalls:0,xhrCalls:integer(r.xhrCalls)?r.xhrCalls:0};}
    if(input.readOnlyCookieCheck){const r=input.readOnlyCookieCheck;result.readOnlyCookieCheck={state:['ready','running','complete','unavailable'].includes(r.state)?r.state:'unavailable',reason:['no-observed-safe-query','request-rejected','unrecognized-response','response-bound','recognized-purchase-page','transport-or-response-failure'].includes(r.reason)?r.reason:null,recognizedPurchasedPage:r.recognizedPurchasedPage===true,extraAuthorizationHeaders:false,...numbers(r),...(integer(r.httpStatus)&&r.httpStatus<=599?{httpStatus:r.httpStatus}:{}),...(r.pagesRequested===1?{pagesRequested:1}:{}),...(r.requestFormat==='json-content-type'?{requestFormat:r.requestFormat}:{}),...(psErrorCategories.includes(r.errorCategory)?{errorCategory:r.errorCategory}:{}),...(Array.isArray(r.errorCodes)?{errorCodes:r.errorCodes.slice(0,20).filter(code=>psErrorCodes.includes(code))}:{})};}
    if(input.provider==='playstation'&&input.readOnlyAccountCheck){const r=input.readOnlyAccountCheck;result.readOnlyAccountCheck={state:['ready','running','complete','unavailable'].includes(r.state)?r.state:'unavailable',reason:['no-observed-safe-query','request-rejected','unrecognized-response','response-bound','recognized-account-profile','transport-or-response-failure'].includes(r.reason)?r.reason:null,recognizedAccountProfile:r.recognizedAccountProfile===true,accountIdPresent:r.accountIdPresent===true,onlineIdPresent:r.onlineIdPresent===true,extraAuthorizationHeaders:false,...(integer(r.httpStatus)&&r.httpStatus<=599?{httpStatus:r.httpStatus}:{}),...(r.pagesRequested===1?{pagesRequested:1}:{}),...(r.requestFormat==='json-content-type'?{requestFormat:r.requestFormat}:{}),...(psErrorCategories.includes(r.errorCategory)?{errorCategory:r.errorCategory}:{}),...(Array.isArray(r.errorCodes)?{errorCodes:r.errorCodes.slice(0,20).filter(code=>psErrorCodes.includes(code))}:{})};}
    if(input.bootstrap&&input.provider==='nintendo'){
      const b=input.bootstrap;result.bootstrap={blocks:(Array.isArray(b.blocks)?b.blocks:[]).filter(row=>['data','state','meta'].includes(row.block)).map(row=>({block:row.block,parsed:row.parsed===true,...safeShape(row)})),boundReached:b.boundReached===true,
        structure:(Array.isArray(b.structure)?b.structure:[]).slice(0,40).filter(row=>['data','state','meta'].includes(row.block)).map(row=>({block:row.block,...safeShape(row)})),
        declaredGraphqlEndpoints:(Array.isArray(b.declaredGraphqlEndpoints)?b.declaredGraphqlEndpoints:[]).slice(0,3).filter(value=>{try{const u=new URL(value);return nintendoEndpoint(u)&&!u.search&&!u.hash;}catch{return false;}}),
        accountIdentityFieldPaths:(Array.isArray(b.accountIdentityFieldPaths)?b.accountIdentityFieldPaths:[]).filter(value=>/^(data|state|meta)\.(user|account)\.(id|naId|accountId|obfuscatedId)$/.test(value)),
        cardArrays:(Array.isArray(b.cardArrays)?b.cardArrays:[]).slice(0,8).filter(row=>['data','state','meta'].includes(row.block)).map(row=>({block:row.block,...numbers(row),presentFields:counts(row.presentFields,key=>knownFields.includes(key)),platforms:counts(row.platforms,key=>platform(key)===key),flags:counts(row.flags,flags),ownerUserRelations:counts(row.ownerUserRelations,key=>['sameOwnerAndUser','differentOwnerAndUser','ownerOrUserAbsent'].includes(key))}))};
    }
    if(input.resources&&input.provider==='nintendo')result.resources={boundReached:input.resources.boundReached===true,groups:(Array.isArray(input.resources.groups)?input.resources.groups:[]).slice(0,30).filter(row=>typeof row.host==='string'&&nintendoHost(row.host)&&['fetch','xmlhttprequest','script','iframe','other'].includes(row.kind)&&integer(row.count)&&integer(row.graphqlPaths)).map(row=>({host:row.host,kind:row.kind,count:row.count,graphqlPaths:row.graphqlPaths}))};
    return result;
  }
  root.GLConsoleValidationCore=Object.freeze({providerForLocation,requestInfo,createLedger,sanitizeReport,psCookieQuery,checkPsCookieAccess,nintendoAccountCandidate,bootstrapSummary,resourceSummary});
})(globalThis);
