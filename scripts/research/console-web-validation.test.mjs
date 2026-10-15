import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
const dir=new URL('./console-web-validation/',import.meta.url),core=await readFile(new URL('core.js',dir),'utf8');
const ctx=vm.createContext({URL,URLSearchParams,AbortSignal,TextDecoder,Uint8Array});vm.runInContext(core,ctx);const C=ctx.GLConsoleValidationCore;
const plain=value=>JSON.parse(JSON.stringify(value));
const psRequest=(start=0,size=2,more={})=>C.requestInfo('playstation','https://web.np.playstation.com/api/graphql/v1/op?'+new URLSearchParams({operationName:'getPurchasedGameList',variables:JSON.stringify({start,size,isActive:true,platform:['ps4','ps5'],...more})}),{credentials:'include'});
const psBody=(offset,games,isLast)=>({data:{purchasedTitlesRetrieve:{games,pageInfo:{offset,size:games.length,isLast}}}});
const nRequest=(offset=0)=>C.requestInfo('nintendo','https://api.ec.nintendo.com/public/graphql',{method:'POST',body:JSON.stringify({query:'query getVgcs($idToken: String!){account { vgc { vgcViewsV2(isHidden: false) { views { id } } } }}',variables:{offset,limit:300,idToken:'private-token',country:'US'}})});
const nBody=(offset,views,total)=>({data:{account:{vgc:{vgcViews:{views,offsetInfo:{offset,total}}}}}});

test('Helper version in aggregate reports agrees with the installable manifest',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));
  assert.equal(C.sanitizeReport(C.createLedger('nintendo').report()).helperVersion,manifest.version);
});
test('Nintendo portal works with and without trailing slash; adjacent and login paths are excluded',()=>{
  for(const path of ['/portal/vgcs','/portal/vgcs/','/portal/vgcs/list'])assert.equal(C.providerForLocation({origin:'https://accounts.nintendo.com',pathname:path}),'nintendo');
  for(const path of ['/portal/vgcs-other','/login','/portal'])assert.equal(C.providerForLocation({origin:'https://accounts.nintendo.com',pathname:path}),null);
  assert.equal(C.providerForLocation({origin:'https://untrusted.example',pathname:'/portal/vgcs'}),null);
});
test('Only specific read-only endpoints/operations are recognized; no headers or credential values inspected',()=>{
  const r=plain(nRequest());assert.equal(r.credentialVariablePresent,true);assert.equal(r.operation,'getVgcs');assert.equal(r.fixedHiddenFalse,true);
  assert(!JSON.stringify(r).includes('private-token'));assert.equal(C.requestInfo('nintendo','https://untrusted.example/graphql',{method:'POST',body:'{}'}),null);
  assert.equal(C.requestInfo('playstation','https://web.np.playstation.com/api/graphql/v1/op',{method:'POST',body:JSON.stringify({query:'mutation getPurchasedGameList { remove }'})}),null);
  const options={credentials:'include'};Object.defineProperty(options,'headers',{get(){throw Error('Must not inspect auth headers');}});
  assert(C.requestInfo('playstation','https://web.np.playstation.com/api/graphql/v1/op?'+new URLSearchParams({operationName:'getPurchasedGameList',variables:'{"start":0,"size":24}'}),options));
});

test('Verified Nintendo Savanna endpoint is recognized consistently in requests, bootstrap, resources and redacted exports',()=>{
  const endpoint='https://wb.lp1.savanna.srv.nintendo.net/graphql';
  const options={method:'POST',body:JSON.stringify({operationName:'getVgcs',query:'query getVgcs { account { vgc { vgcViews { views { id } } } } }',variables:{offset:0,limit:300,idToken:'private-token'}})};
  Object.defineProperty(options,'headers',{get(){throw Error('Must not inspect authorization headers');}});
  const request=C.requestInfo('nintendo',endpoint,options);assert.equal(request?.operation,'getVgcs');assert.equal(request.endpoint,endpoint);
  const ledger=C.createLedger('nintendo');ledger.observe(request,200,nBody(0,Array.from({length:115},(_,i)=>({id:'private-card-'+i,applicationId:'private-app-'+i,applicationName:'Private title'})),115),'xhr');
  const bootstrap=C.bootstrapSummary({getElementById:name=>name==='data'?{getAttribute:()=>JSON.stringify({shopGraphQLApiUrl:endpoint,idToken:'private-token'})}:null});
  const resources=C.resourceSummary({getEntriesByType:()=>[{name:endpoint+'?private-token',initiatorType:'xmlhttprequest'}]});
  const result=plain(C.sanitizeReport({...ledger.report(),bootstrap,resources}));
  assert.equal(result.requestContracts[0].endpoint,endpoint);assert.equal(result.requestContracts[0].transport,'xhr');assert.equal(result.requestContracts[0].credentialVariablePresent,true);
  assert.equal(result.scopes[0].rows,115);assert.equal(result.scopes[0].distinctRowIds,115);assert.equal(result.scopes[0].distinctSoftwareProductIds,115);assert.equal(result.scopes[0].observedScopeTraversal,'terminal-range-observed');
  assert.deepEqual(result.bootstrap.declaredGraphqlEndpoints,[endpoint]);assert.equal(result.resources.groups[0].host,'wb.lp1.savanna.srv.nintendo.net');
  assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('Private title'));assert.equal(result.accountLibraryComplete,false);assert.equal(result.ownershipSemanticsValidated,false);
  for(const bad of ['https://unrelated.nintendo.net/graphql','https://wb.lp1.savanna.srv.nintendo.net.evil.example/graphql','https://user:password@wb.lp1.savanna.srv.nintendo.net/graphql','http://wb.lp1.savanna.srv.nintendo.net/graphql','https://wb.lp1.savanna.srv.nintendo.net:8443/graphql','https://wb.lp1.savanna.srv.nintendo.net/other/graphql']){
    assert.equal(C.requestInfo('nintendo',bad,options),null,bad);
    assert.equal(C.sanitizeReport({format:1,provider:'nintendo',requestContracts:[{endpoint:bad}]}).requestContracts.length,0,bad);
  }
});

test('Current Nintendo website operation counts cards while totals and device queries never add card rows',()=>{
  const endpoint='https://wb.lp1.savanna.srv.nintendo.net/graphql';
  const request=operationName=>C.requestInfo('nintendo',endpoint,{method:'POST',body:JSON.stringify({operationName,query:'query '+operationName+' { account { vgc { vgcViewsV2 { views { id } } } } }',variables:{offset:0,limit:300,idToken:'private-token'}})});
  const views=Array.from({length:115},(_,i)=>({id:'private-card-'+i,applicationId:'private-app-'+i,applicationName:'Private title'}));
  const body={data:{account:{vgc:{vgcViewsV2:{views,offsetInfo:{offset:0,total:115}}}}}};
  const ledger=C.createLedger('nintendo');
  for(const operation of ['getVgcTotalsVgcs','getDevicesVgcs','getAllDevicesVgcs']){
    const info=request(operation);assert.equal(info.operation,operation);ledger.observe(info,200,body,'xhr');
  }
  assert.equal(ledger.report().scopes.length,0,'Auxiliary queries cannot become library pages even with card-like responses.');
  ledger.observe(request('getVgcsVgcs'),200,body,'xhr');
  const report=plain(C.sanitizeReport(ledger.report()));assert.equal(report.requestsObserved,4);assert.equal(report.auxiliaryRequests,3);assert.equal(report.unrecognizedOperations,0);assert.equal(report.malformedPages,0);
  assert.equal(report.scopes.length,1);assert.equal(report.scopes[0].rows,115);assert.equal(report.scopes[0].distinctRowIds,115);assert.equal(report.scopes[0].observedScopeTraversal,'terminal-range-observed');
  assert.equal(report.requestContracts[3].operation,'getVgcsVgcs');assert.equal(report.requestContracts[3].responseShape.at(-1).path,'data.account.vgc.vgcViewsV2');
  assert.equal(report.requestContracts[0].responseShape,undefined);assert(!JSON.stringify(report).includes('private'));assert(!JSON.stringify(report).includes('Private title'));
  const viaDocument=C.requestInfo('nintendo',endpoint,{method:'POST',body:JSON.stringify({query:'query getVgcsVgcs { account { vgc { vgcViewsV2 { views { id } } } } }',variables:{offset:0}})});assert.equal(viaDocument.operation,'getVgcsVgcs');
  assert.equal(request('getVgcsVgcsUnknown').operation,'unrecognized');
  assert.equal(C.requestInfo('nintendo',endpoint,{method:'POST',body:JSON.stringify({operationName:'getVgcsVgcs',query:'mutation getVgcsVgcs { loanCard }'})}),null);
  assert.equal(C.requestInfo('playstation','https://web.np.playstation.com/api/graphql/v1/op?'+new URLSearchParams({operationName:'getVgcsVgcs'})).operation,'unrecognized');
});

test('Unexpected card envelopes remain incomplete with bounded redacted shape diagnostics; independent aliases are not unioned',()=>{
  const endpoint='https://wb.lp1.savanna.srv.nintendo.net/graphql';
  const request=C.requestInfo('nintendo',endpoint,{method:'POST',body:JSON.stringify({operationName:'getVgcsVgcs',variables:{offset:0,limit:300}})});
  const ledger=C.createLedger('nintendo');ledger.observe(request,200,{data:{account:{vgc:{private:'private-token','private-account-key':[{id:'private-card'}]}}}},'xhr');
  const report=plain(C.sanitizeReport(ledger.report()));assert.equal(report.malformedPages,1);assert.equal(report.scopes.length,0);assert.equal(report.requestContracts[0].responseShape.at(-1).path,'data.account.vgc');assert(!JSON.stringify(report).includes('private'));
  const both=C.createLedger('nintendo');both.observe(request,200,{data:{account:{vgc:{vgcViews:{views:[],offsetInfo:{offset:0,total:0}},vgcViewsV2:{views:[],offsetInfo:{offset:0,total:0}}}}}});assert.equal(both.report().scopes.length,0);assert.equal(both.report().malformedPages,1);
  const failed=C.createLedger('nintendo');failed.observe({...request,operation:'getDevicesVgcs'},401,{private:'secret'});assert.equal(failed.report().failedRequests,1);assert.equal(failed.report().auxiliaryRequests,1);assert.equal(failed.report().scopes.length,0);
  const hostile=C.sanitizeReport({format:1,provider:'nintendo',requestContracts:[{endpoint,operation:'private-operation',responseShape:[null,{path:'data.account.private-id',type:'object',fields:{id:'string'}},{path:'data.account',type:'object',fields:{private:'string',views:'array'}}]}]});
  assert.equal(hostile.requestContracts[0].operation,'unrecognized');assert.equal(hostile.requestContracts[0].responseShape.length,1);assert(!JSON.stringify(hostile).includes('private'));
});

test('Purchase paging, repeated requests, missing prefix and filter scopes stay distinct',()=>{
  const l=C.createLedger('playstation');l.observe(psRequest(),200,psBody(0,[{id:'one',productId:'p1'},{id:'two',productId:'p2'}],false));
  l.observe(psRequest(2),200,psBody(2,[{id:'three',productId:'p3'}],true));
  l.observe(psRequest(0,100),200,psBody(0,[{id:'one',productId:'p1'},{id:'two',productId:'p2'}],false));
  let r=plain(l.report());assert.equal(r.scopes[0].rows,3);assert.equal(r.scopes[0].distinctSoftwareProductIds,3);assert.equal(r.scopes[0].observedScopeTraversal,'terminal-range-observed');
  l.observe(psRequest(0,2,{isActive:false}),200,psBody(0,[],true));assert.equal(l.report().scopes.length,2);
  const missing=C.createLedger('playstation');missing.observe(psRequest(2),200,psBody(2,[{id:'three'}],true));assert.equal(missing.report().scopes[0].observedScopeTraversal,'not-established');
});
test('Nintendo 115 cards can represent fewer software products, with owned/lent/borrowed evidence left unclassified',()=>{
  const views=Array.from({length:115},(_,i)=>({id:'private-card-'+i,applicationId:'private-app-'+Math.floor(i/2),applicationName:'Private game',ownerNaId:i?'private-owner':'another-owner',userNaId:'private-owner',isLending:i===1,hasApplication:true,apparentPlatform:i%2?'NX':'OUNCE'}));
  const l=C.createLedger('nintendo');l.observe(nRequest(),200,nBody(0,views,115));const r=plain(C.sanitizeReport(l.report()));
  assert.equal(r.scopes[0].rows,115);assert.equal(r.scopes[0].distinctRowIds,115);assert.equal(r.scopes[0].distinctSoftwareProductIds,58);
  assert.equal(r.scopes[0].ownerUserRelations.differentOwnerAndUser,1);assert.equal(r.scopes[0].flags['isLending:true'],1);
  assert.equal(r.ownershipSemanticsValidated,false);assert.equal(r.accountLibraryComplete,false);
  for(const secret of ['private','another-owner','Private game'])assert(!JSON.stringify(r).includes(secret));
});
test('Empty, malformed, expired-session and GraphQL error responses cannot certify a source',()=>{
  const l=C.createLedger('nintendo');l.observe(nRequest(),401,{token:'private'});l.observe(nRequest(),200,{errors:[{message:'private'}]});l.observe(nRequest(),200,{data:{}});
  assert.equal(l.report().failedRequests,2);assert.equal(l.report().malformedPages,1);assert.equal(l.report().scopes.length,0);
  l.observe(nRequest(),200,nBody(0,[],115));assert.equal(l.report().scopes[0].observedScopeTraversal,'not-established');
  l.observe(nRequest(),200,nBody(0,[],0));assert.equal(l.report().scopes[0].observedScopeTraversal,'terminal-range-observed');assert.equal(l.report().accountLibraryComplete,false);
});
test('Different observed totals and unknown operations do not invent traversal or ownership',()=>{
  const l=C.createLedger('nintendo');l.observe(nRequest(),200,nBody(0,[{id:'a'}],2));l.observe(nRequest(1),200,nBody(1,[{id:'b'}],3));
  l.observe({...nRequest(),operation:'unrecognized'},200,{private:'unrelated'});
  assert.equal(l.report().scopes[0].observedScopeTraversal,'not-established');assert.equal(l.report().unrecognizedOperations,1);
});
test('Isolated-world export re-projects hostile messages and strips arbitrary strings and identifier domains',()=>{
  const l=C.createLedger('nintendo');l.observe(nRequest(),200,nBody(0,[{id:'private'}],1));
  const r=plain(l.report());r.active=true;r.credentials='private';r.requestContracts[0].headers={Authorization:'private'};r.requestContracts[0].variables.idToken='private';r.scopes[0].presentFields['private']=1;r.scopes[0].platforms.private=1;r.scopes[0].flags.private=1;r.scopes[0].scope.accountId='private';
  const safe=C.sanitizeReport(r);assert(!JSON.stringify(safe).includes('private'));assert.equal(safe.active,true);
  r.requestContracts[0].endpoint='https://untrusted.example/graphql';assert.equal(C.sanitizeReport(r).requestContracts.length,0);
});
test('Memory/page bounds make diagnostic incompleteness explicit',()=>{
  const l=C.createLedger('nintendo');for(let i=0;i<65;i++)l.observe(nRequest(i),200,nBody(i,[{id:'row-'+i}],65));
  const r=l.report();assert.equal(r.boundReached,true);assert.equal(r.requestContracts.length,20);assert.equal(r.scopes[0].pagesObserved,64);assert.equal(r.scopes[0].observedScopeTraversal,'not-established');
});
test('Fetch interception returns the original promise, never calls the network independently, and Stop restores it',async()=>{
  const listeners=[],posts=[];let calls=0,resolveFetch;const original=()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve;});};
  const context=vm.createContext({URL,TextDecoder,Uint8Array,location:{origin:'https://library.playstation.com',pathname:'/'},fetch:original,addEventListener:(name,fn)=>listeners.push(fn),setTimeout:()=>0});
  context.window=context;context.postMessage=(value,origin)=>posts.push([value,origin]);vm.runInContext(core,context);vm.runInContext(await readFile(new URL('probe.js',dir),'utf8'),context);
  assert.equal(calls,0);const url='https://web.np.playstation.com/api/graphql/v1/op?'+new URLSearchParams({operationName:'getPurchasedGameList',variables:'{"start":0,"size":1}'});
  const promise=context.fetch(url);assert.equal(calls,1);const response=new Response(JSON.stringify(psBody(0,[{id:'private',name:'Private game'}],true)),{status:200});resolveFetch(response);assert.equal(await promise,response);
  await new Promise(resolve=>setTimeout(resolve,20));
  vm.runInContext(`globalThis.dispatchSummary=()=>{for(const fn of globalThis.testListeners)fn({source:window,origin:location.origin,data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'report'}});};`,context);
  context.testListeners=listeners;context.dispatchSummary();assert.equal(posts.at(-1)[0].report.scopes[0].rows,1);assert(!JSON.stringify(posts).includes('private'));
  assert.equal(posts.at(-1)[0].report.observerState.fetchHookInstalled,true);assert.equal(posts.at(-1)[0].report.observerState.fetchCalls,1);
  vm.runInContext(`for(const fn of globalThis.testListeners)fn({source:window,origin:location.origin,data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'stop'}});`,context);
  assert.equal(context.fetch,original);assert.equal(calls,1);
});

test('Observer diagnostics distinguish replaced hooks from an empty library and Stop preserves the replacement',async()=>{
  const listeners=[],posts=[],replacement=()=>Promise.resolve('replacement');
  const context=vm.createContext({URL,TextDecoder,Uint8Array,document:{getElementById:()=>null},location:{origin:'https://accounts.nintendo.com',pathname:'/portal/vgcs'},fetch:()=>Promise.resolve('original'),addEventListener:(name,fn)=>listeners.push(fn),setTimeout:()=>0});
  context.window=context;context.postMessage=value=>posts.push(value);context.testListeners=listeners;
  vm.runInContext(core,context);vm.runInContext(await readFile(new URL('probe.js',dir),'utf8'),context);context.fetch=replacement;
  vm.runInContext(`for(const fn of testListeners)fn({source:window,origin:location.origin,data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'report'}});`,context);
  assert.equal(posts[0].report.active,true);assert.equal(posts[0].report.observerState.fetchHookInstalled,false);assert.equal(posts[0].report.observerState.fetchCalls,0);
  vm.runInContext(`for(const fn of testListeners)fn({source:window,origin:location.origin,data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'stop'}});`,context);
  assert.equal(context.fetch,replacement);assert.equal(posts.at(-1).report.active,false);
});

test('XHR interception observes 115 synthetic Savanna cards and reports auth expiry without forwarding identifiers',async()=>{
  const listeners=[],posts=[];
  class XHR{
    open(...args){this.openArgs=args;return 'opened';}
    send(body){this.sent=body;return 'sent';}
    addEventListener(name,fn){this.loaded=fn;}
  }
  const context=vm.createContext({URL,TextDecoder,Uint8Array,document:{getElementById:()=>null},location:{origin:'https://accounts.nintendo.com',pathname:'/portal/vgcs/'},fetch:()=>{throw Error('No network');},XMLHttpRequest:XHR,addEventListener:(name,fn)=>listeners.push(fn),setTimeout:()=>0});
  context.window=context;context.postMessage=value=>posts.push(value);context.testListeners=listeners;
  const oldOpen=XHR.prototype.open,oldSend=XHR.prototype.send;
  vm.runInContext(core,context);vm.runInContext(await readFile(new URL('probe.js',dir),'utf8'),context);
  try{
    const successful=new XHR();successful.open('POST','https://wb.lp1.savanna.srv.nintendo.net/graphql');
    successful.send(JSON.stringify({operationName:'getVgcsVgcs',variables:{offset:0,limit:300,idToken:'private-token'}}));
    successful.status=200;successful.responseType='json';successful.response={data:{account:{vgc:{vgcViewsV2:{views:Array.from({length:115},(_,i)=>({id:'private-card-'+i,applicationId:'private-app-'+i,applicationName:'Private title'})),offsetInfo:{offset:0,total:115}}}}}};successful.loaded();
    const request=new XHR();assert.equal(request.open('POST','https://wb.lp1.savanna.srv.nintendo.net/graphql'),'opened');
    const body=JSON.stringify({query:'query getVgcs { account { vgc { views { id } } } }',variables:{offset:0,limit:300,idToken:'private-token'}});
    assert.equal(request.send(body),'sent');assert.equal(request.sent,body);request.status=401;Object.defineProperty(request,'responseText',{get(){throw Error('Do not inspect auth-error response');}});request.loaded();
    vm.runInContext(`for(const fn of testListeners)fn({source:window,origin:location.origin,data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'report'}});`,context);
    assert.equal(posts[0].report.failedRequests,1);assert.equal(posts[0].report.requestContracts[0].transport,'xhr');assert(!JSON.stringify(posts).includes('private-token'));
    assert.equal(posts[0].report.scopes[0].rows,115);assert.equal(posts[0].report.scopes[0].distinctRowIds,115);assert(!JSON.stringify(posts).includes('Private title'));assert(!JSON.stringify(posts).includes('private-card'));
    vm.runInContext(`for(const fn of testListeners)fn({source:window,origin:'https://untrusted.example',data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'report'}});`,context);assert.equal(posts.length,1);
    assert.equal(posts[0].report.observerState.xhrOpenHookInstalled,true);assert.equal(posts[0].report.observerState.xhrSendHookInstalled,true);
    context.XMLHttpRequest=class ReplacementXHR{open(){}send(){}};
    vm.runInContext(`for(const fn of testListeners)fn({source:window,origin:location.origin,data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'report'}});`,context);
    assert.equal(posts.at(-1).report.observerState.xhrOpenHookInstalled,false);assert.equal(posts.at(-1).report.observerState.xhrSendHookInstalled,false);
  }finally{XHR.prototype.open=oldOpen;XHR.prototype.send=oldSend;}
});

test('Nintendo declared endpoint and bootstrap card arrays are inspected without exporting credentials or IDs',()=>{
  const blocks={data:{shopGraphQLApiUrl:'https://api.ecsv.nintendo.com/graphql',idToken:'private-token'},state:{user:{id:'private-account'},initial:{views:Array.from({length:115},(_,i)=>({id:'private-card-'+i,applicationId:'private-software-'+i,applicationName:'Private title',isHidden:false}))}}};
  const document={getElementById:name=>blocks[name]?{getAttribute:()=>JSON.stringify(blocks[name])}:null};
  const bootstrap=plain(C.bootstrapSummary(document));assert.deepEqual(bootstrap.declaredGraphqlEndpoints,['https://api.ecsv.nintendo.com/graphql']);assert.equal(bootstrap.cardArrays[0].rows,115);assert.deepEqual(bootstrap.accountIdentityFieldPaths,['state.user.id']);
  const r=C.sanitizeReport({format:1,provider:'nintendo',bootstrap});assert(!JSON.stringify(r).includes('private'));assert(!JSON.stringify(r).includes('Private title'));
  const info=C.requestInfo('nintendo','https://api.ecsv.nintendo.com/graphql',{method:'POST',body:JSON.stringify({query:'query getVgcs { account { vgc { views { id } } } }',variables:{offset:0}})});assert(info);assert.equal(C.requestInfo('nintendo','https://api.ecsv.nintendo.com.evil.example/graphql',{method:'POST',body:'{}'}),null);
});

test('Nintendo structural diagnostics expose types/counts and nested endpoints, never bootstrap values or arbitrary keys',()=>{
  const blocks={data:{props:{shopGraphQLApiUrl:'https://api.ecsv.nintendo.com/graphql',idToken:'private-token'},'private-account-key':{user:{id:'private-account'}}},state:'private-encoded-state',meta:{items:[{applicationName:'Private title'}]}};
  const document={getElementById:name=>({getAttribute:()=>JSON.stringify(blocks[name])})};
  const bootstrap=C.bootstrapSummary(document),r=plain(C.sanitizeReport({format:1,provider:'nintendo',bootstrap}));
  assert.deepEqual(r.bootstrap.declaredGraphqlEndpoints,['https://api.ecsv.nintendo.com/graphql']);
  assert.equal(r.bootstrap.blocks[0].keyCount,2);assert.equal(r.bootstrap.blocks[1].type,'string');
  assert(r.bootstrap.structure.some(row=>row.fields.idToken==='string'));assert(!JSON.stringify(r).includes('private'));assert(!JSON.stringify(r).includes('Private title'));
  const hostile=C.sanitizeReport({format:1,provider:'nintendo',bootstrap:{blocks:[{block:'data',type:'private',keyCount:1,fields:{'private-account':'string',id:'private'}}],structure:[{block:'state',type:'object',fields:{idToken:'private',views:'array'}}]}});
  assert(!JSON.stringify(hostile).includes('private'));assert.equal(hostile.bootstrap.structure[0].fields.views,'array');
});

test('Resource diagnostics report Nintendo hosts and request kinds without private paths, queries or credentials',()=>{
  const resources=C.resourceSummary({getEntriesByType:()=>[{name:'https://api.ecsv.nintendo.com/graphql?token=private',initiatorType:'xmlhttprequest'},{name:'https://accounts.nintendo.com/private-account/private-card',initiatorType:'fetch'},{name:'https://untrusted.example/private',initiatorType:'fetch'}]});
  const result=plain(C.sanitizeReport({format:1,provider:'nintendo',resources,observerState:{fetchHookInstalled:false,xhrOpenHookInstalled:true,xhrSendHookInstalled:true,fetchCalls:0,xhrCalls:4,private:'secret'}}));
  assert.equal(result.resources.groups.length,2);assert.equal(result.resources.groups[0].graphqlPaths,1);assert.equal(result.observerState.fetchHookInstalled,false);assert.equal(result.observerState.xhrCalls,4);assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('untrusted'));
  assert.equal(C.resourceSummary({getEntriesByType:()=>Array.from({length:1001},()=>({name:'https://accounts.nintendo.com/',initiatorType:'fetch'}))}).boundReached,true);
  const hostile=C.sanitizeReport({format:1,provider:'nintendo',resources:{groups:[{host:'private.nintendo.com/untrusted',kind:'fetch',count:1,graphqlPaths:0},{host:'api.ec.nintendo.com',kind:'private',count:1,graphqlPaths:0}]}});assert.equal(hostile.resources.groups.length,0);
});

test('PlayStation cookie-only check uses an observed safe query, one page, no copied authorization headers or fallback',async()=>{
  const url=new URL('https://web.np.playstation.com/api/graphql/v1/op');url.search=new URLSearchParams({operationName:'getPurchasedGameList',variables:JSON.stringify({start:48,size:24,isActive:true,platform:['ps4','ps5']}),extensions:JSON.stringify({persistedQuery:{version:1,sha256Hash:'a'.repeat(64)}})});
  const safe=C.psCookieQuery(url.href);assert.equal(JSON.parse(new URL(safe).searchParams.get('variables')).start,0);
  let calls=0;const r=await C.checkPsCookieAccess(safe,async(input,options)=>{calls++;assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');assert.deepEqual(plain(options.headers),{Accept:'application/json'});return new Response(JSON.stringify(psBody(0,[{productId:'private-product',name:'Private title'}],false)),{status:200});});
  assert.equal(calls,1);assert.equal(r.recognizedPurchasedPage,true);assert.equal(r.rows,1);assert(!JSON.stringify(r).includes('private'));
  const denied=await C.checkPsCookieAccess(safe,async()=>new Response('private',{status:401}));assert.equal(denied.reason,'request-rejected');assert.equal(denied.httpStatus,401);
  const bad=new URL(url);const vars=JSON.parse(bad.searchParams.get('variables'));vars.token='private';bad.searchParams.set('variables',JSON.stringify(vars));assert.equal(C.psCookieQuery(bad.href),null);
  assert.equal((await C.checkPsCookieAccess('https://untrusted.example',()=>{throw Error('Must not request');})).state,'unavailable');
});
