import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
const dir=new URL('./console-web-validation/',import.meta.url),core=await readFile(new URL('core.js',dir),'utf8');
const ctx=vm.createContext({URL});vm.runInContext(core,ctx);const C=ctx.GLConsoleValidationCore;
const plain=value=>JSON.parse(JSON.stringify(value));
const psRequest=(start=0,size=2,more={})=>C.requestInfo('playstation','https://web.np.playstation.com/api/graphql/v1/op?'+new URLSearchParams({operationName:'getPurchasedGameList',variables:JSON.stringify({start,size,isActive:true,platform:['ps4','ps5'],...more})}),{credentials:'include'});
const psBody=(offset,games,isLast)=>({data:{purchasedTitlesRetrieve:{games,pageInfo:{offset,size:games.length,isLast}}}});
const nRequest=(offset=0)=>C.requestInfo('nintendo','https://api.ec.nintendo.com/public/graphql',{method:'POST',body:JSON.stringify({query:'query getVgcs($idToken: String!){account { vgc { vgcViewsV2(isHidden: false) { views { id } } } }}',variables:{offset,limit:300,idToken:'private-token',country:'US'}})});
const nBody=(offset,views,total)=>({data:{account:{vgc:{vgcViews:{views,offsetInfo:{offset,total}}}}}});
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
  vm.runInContext(`for(const fn of globalThis.testListeners)fn({source:window,origin:location.origin,data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'stop'}});`,context);
  assert.equal(context.fetch,original);assert.equal(calls,1);
});

test('XHR interception preserves calls and reports auth expiry without reading headers or forwarding identifiers',async()=>{
  const listeners=[],posts=[];
  class XHR{
    open(...args){this.openArgs=args;return 'opened';}
    send(body){this.sent=body;return 'sent';}
    addEventListener(name,fn){this.loaded=fn;}
  }
  const context=vm.createContext({URL,TextDecoder,Uint8Array,location:{origin:'https://accounts.nintendo.com',pathname:'/portal/vgcs/'},fetch:()=>{throw Error('No network');},XMLHttpRequest:XHR,addEventListener:(name,fn)=>listeners.push(fn),setTimeout:()=>0});
  context.window=context;context.postMessage=value=>posts.push(value);context.testListeners=listeners;
  const oldOpen=XHR.prototype.open,oldSend=XHR.prototype.send;
  vm.runInContext(core,context);vm.runInContext(await readFile(new URL('probe.js',dir),'utf8'),context);
  try{
    const request=new XHR();assert.equal(request.open('POST','https://api.ec.nintendo.com/public/graphql'),'opened');
    const body=JSON.stringify({query:'query getVgcs { account { vgc { views { id } } } }',variables:{offset:0,limit:300,idToken:'private-token'}});
    assert.equal(request.send(body),'sent');assert.equal(request.sent,body);request.status=401;Object.defineProperty(request,'responseText',{get(){throw Error('Do not inspect auth-error response');}});request.loaded();
    vm.runInContext(`for(const fn of testListeners)fn({source:window,origin:location.origin,data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'report'}});`,context);
    assert.equal(posts[0].report.failedRequests,1);assert.equal(posts[0].report.requestContracts[0].transport,'xhr');assert(!JSON.stringify(posts).includes('private-token'));
    vm.runInContext(`for(const fn of testListeners)fn({source:window,origin:'https://untrusted.example',data:{channel:'gl-console-validation-request',nonce:'a'.repeat(32),action:'report'}});`,context);assert.equal(posts.length,1);
  }finally{XHR.prototype.open=oldOpen;XHR.prototype.send=oldSend;}
});
