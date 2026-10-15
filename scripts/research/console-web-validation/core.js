/* Research only. Projects aggregate diagnostics, never records or credentials. */
(function(root){
  'use strict';
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  const id=value=>typeof value==='string'&&value.length>0&&value.length<=200?value:null;
  const platform=value=>['PS4','PS5','ps4','ps5','NX','OUNCE','SWITCH','SWITCH2'].includes(value)?value:'other-or-absent';
  const knownFields=['id','titleId','productId','name','platform','platforms','membership','subscriptionService','isActive','isTrial','expirationDate','conceptId','contentId','edition','applicationId','applicationName','apparentPlatform','ownerNaId','userNaId','isHidden','isLending','isPartialLending','lendingExpireDatetime','insertedNsDeviceId','hasApplication','hasReleasedApplication','hasAddOnContents','hasReleasedAddOnContents','hasUpgrade','hasReleasedUpgrade'];
  const safeEnums=['ACTIVE_DATE','ACTIVATED_DATE','asc','desc','ASC','DESC','ALL','OWNED','LENDING','BORROWED'];
  const variableNames=['start','size','offset','limit','shopId','isActive','isHidden','platform','sortBy','sortDirection','order','vgcViewType','vgcViewStatus','fixedHiddenFalse'];
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
      if(provider==='nintendo'&&(!/^(?:api\.)?ec\.nintendo\.com$/.test(url.hostname)||!/graphql/i.test(url.pathname)))return null;
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
      return {format:1,provider,readOnly:true,requestsObserved:requests,failedRequests:failures,unrecognizedOperations:unknownOperations,malformedPages:malformed,boundReached:bounded,
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
    result.requestContracts=(Array.isArray(input.requestContracts)?input.requestContracts:[]).slice(0,20).flatMap(r=>{
      // Validate endpoints independently of request bodies on the receiving side.
      let url;try{url=new URL(r.endpoint);}catch{return [];}
      if(url.search||url.hash||url.username||url.password||url.protocol!=='https:'||
        !(input.provider==='playstation'?url.href==='https://web.np.playstation.com/api/graphql/v1/op':/^(?:api\.)?ec\.nintendo\.com$/.test(url.hostname)&&/^\/[a-zA-Z0-9/_-]{0,100}graphql\/?$/i.test(url.pathname)))return [];
      return [{provider:input.provider,endpoint:url.origin+url.pathname,method:['GET','POST'].includes(r.method)?r.method:'unrecognized',operation:['getPurchasedGameList','getVgcs','unrecognized'].includes(r.operation)?r.operation:'unrecognized',variables:safeVariables(r.variables),credentialVariablePresent:r.credentialVariablePresent===true,cookieMode:['include','same-origin','omit','browser-default'].includes(r.cookieMode)?r.cookieMode:'unrecognized',fixedHiddenFalse:r.fixedHiddenFalse===true,transport:r.transport==='xhr'?'xhr':'fetch',httpStatus:integer(r.httpStatus)&&r.httpStatus<=599?r.httpStatus:0}];
    });
    result.scopes=(Array.isArray(input.scopes)?input.scopes:[]).slice(0,64).map(s=>({...numbers(s),scope:safeVariables(s.scope),reportedTotals:(Array.isArray(s.reportedTotals)?s.reportedTotals:[]).filter(integer).slice(0,64),observedScopeTraversal:s.observedScopeTraversal==='terminal-range-observed'?'terminal-range-observed':'not-established',presentFields:counts(s.presentFields,key=>knownFields.includes(key)),platforms:counts(s.platforms,key=>platform(key)===key),flags:counts(s.flags,flags),ownerUserRelations:counts(s.ownerUserRelations,key=>['sameOwnerAndUser','differentOwnerAndUser','ownerOrUserAbsent'].includes(key))}));
    return result;
  }
  root.GLConsoleValidationCore=Object.freeze({providerForLocation,requestInfo,createLedger,sanitizeReport});
})(globalThis);
