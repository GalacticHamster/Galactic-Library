// Synthetic OAuth and Collections responses; real loopback HTTP, no external requests.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {startExperiment,makeAuthorization,safeError,failureCategory,summarize,SCOPE,AUTH,TOKEN,QUERY} from './xbox-collections-auth.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function session(fetchImpl){
  const summaries=[];
  const app=await startExperiment({clientId:randomUUID(),fetchImpl,onSummary:s=>summaries.push(s)});
  const page=await fetch(app.url),html=await page.text();
  const nonce=html.match(/name="nonce" value="([^"]+)"/)[1];
  const post=(path,body,origin=new URL(app.url).origin)=>fetch(new URL(path,app.url),{
    method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin},
    body:new URLSearchParams({nonce,...body})});
  const begin=await post('/start',{}),auth=new URL(begin.headers.get('location'));
  const callback=body=>post('/callback',{state:auth.searchParams.get('state'),...body},'https://login.microsoftonline.com');
  return {app,post,callback,auth,html,headers:page.headers,summaries};
}
test('Own client, consumers authority, PKCE and form_post; no extra scopes/secrets or implicit token flow',()=>{
  const clientId=randomUUID(),verifier='synthetic-verifier';
  const u=new URL(makeAuthorization({clientId,redirectUri:'http://localhost:1234/callback',state:'state',verifier}));
  assert.equal(u.origin+u.pathname,AUTH);assert.equal(u.searchParams.get('client_id'),clientId);
  assert.equal(u.searchParams.get('scope'),SCOPE);assert.equal(u.searchParams.get('response_type'),'code');
  assert.equal(u.searchParams.get('response_mode'),'form_post');assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  assert.equal(u.searchParams.get('code_challenge'),createHash('sha256').update(verifier).digest('base64url'));
  assert(!u.searchParams.has('client_secret'));assert(!u.href.includes('offline_access'));
  assert.throws(()=>makeAuthorization({clientId:'legacy-foreign-client',redirectUri:'',state:'',verifier:''}));
});
test('Error reporting keeps only allowlisted names/numeric AADSTS codes and distinguishes failure categories',()=>{
  const e=safeError({error:'invalid_scope',error_description:'AADSTS70011 secret-token code=private',error_codes:[70011,'private']});
  assert.deepEqual(e,{code:'invalid_scope',aadsts:[70011]});assert(!JSON.stringify(e).includes('private'));
  assert.equal(failureCategory(e),'resource-scope-rejected-by-tested-authority');
  assert.equal(failureCategory({code:'unauthorized_client'}),'registration-or-client-configuration');
  assert.equal(failureCategory({code:'access_denied'}),'authorization-denied-or-cancelled');
  assert.equal(safeError({error:'token-disguised-as-error'}).code,'unrecognized-error');
});
test('Successful requested token triggers exactly one query; credential stays in beneficiary body only',async()=>{
  const requests=[];const row={productId:'legacy-guid-product',skuId:'01',status:'Active',ownershipType:'OwnedByBeneficiary'};
  const s=await session(async(url,options)=>{
    requests.push([url,options]);assert.equal(options.redirect,'error');
    if(url===TOKEN)return json({access_token:'synthetic-secret-ticket',token_type:'Bearer',expires_in:3600,scope:SCOPE,refresh_token:'discard-me'});
    assert.equal(url,QUERY);assert(!('Authorization' in options.headers));
    const b=JSON.parse(options.body);assert.equal(b.beneficiaries[0].identityValue,'synthetic-secret-ticket');
    assert.equal(b.beneficiaries[0].identitytype,'msa');assert.equal(b.maxPageSize,100);
    return json({items:[row],continuationToken:'private-continuation'});
  });
  try {
    const r=await s.callback({code:'synthetic-private-code'});assert.equal(r.status,303);
    assert.equal(requests.length,2);assert.equal(s.app.snapshot().pages,1);assert.equal(s.app.snapshot().pagesRequested,1);
    assert.equal(s.app.snapshot().queryAuthorized,true);assert.equal(s.app.snapshot().traversalComplete,false);
    const body=new URLSearchParams(requests[0][1].body);
    assert.equal(body.get('scope'),SCOPE);assert.equal(body.get('grant_type'),'authorization_code');
    assert.equal(body.get('code_challenge_method'),null);assert(body.get('code_verifier'));assert(!body.has('client_secret'));
    const html=await(await fetch(s.app.url)).text();
    for(const privateValue of ['synthetic-secret-ticket','synthetic-private-code','private-continuation','legacy-guid-product','discard-me']){
      assert(!html.includes(privateValue));assert(!JSON.stringify(s.summaries).includes(privateValue));}
    assert.equal(s.headers.get('cache-control'),'no-store');assert(s.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.equal((await s.callback({code:'replayed'})).status,403);assert.equal(requests.length,2);
  }finally{await s.app.close();}
});
test('Consent denial and scope rejection stop without token or query calls; callback state is mandatory',async()=>{
  let calls=0;const s=await session(async()=>{calls++;throw Error('No network permitted');});
  try {
    assert.equal((await s.callback({state:'wrong',code:'private'})).status,403);
    assert.equal((await s.callback({state:'é'.repeat(43),code:'private'})).status,403);
    assert.equal(s.app.snapshot().phase,'waiting-for-consent');
    await s.callback({error:'invalid_scope',error_description:'AADSTS70011 sensitive details'});
    assert.equal(s.app.snapshot().reason,'resource-scope-rejected-by-tested-authority');assert.equal(calls,0);
    assert(!JSON.stringify(s.app.snapshot()).includes('sensitive'));
  }finally{await s.app.close();}
});
test('Token denial, wrong granted scope, malformed response and endpoint rejection have separate outcomes',async()=>{
  for(const [tokenResponse,queryResponse,reason] of [
    [()=>json({error:'unauthorized_client'},400),null,'registration-or-client-configuration'],
    [()=>json({access_token:'private',token_type:'bearer',expires_in:300,scope:'XboxLive.signin'}),null,'resource-scope-not-granted'],
    [()=>json({id_token:'private'}),null,'unexpected-token-response'],
    [()=>json({access_token:'private',token_type:'bearer',expires_in:300}),()=>json({code:'InvalidMsaTicketFormat',message:'echo private'},401),'endpoint-rejected-after-token'],
    [()=>json({access_token:'private',token_type:'bearer',expires_in:300}),()=>json({unexpected:'private'}),'endpoint-response-schema-unrecognized']]){
    let calls=0;const s=await session(async url=>{calls++;return url===TOKEN?tokenResponse():queryResponse();});
    try{await s.callback({code:'private-code'});assert.equal(s.app.snapshot().reason,reason);
      assert.equal(s.app.snapshot().queryAuthorized,false);assert.equal(calls,queryResponse?2:1);
      assert(!JSON.stringify(s.app.snapshot()).includes('private'));}
    finally{await s.app.close();}
  }
});
test('Only explicit Next reads another page; exact product/SKU lookup stays local and does not establish ownership',async()=>{
  let queries=0;
  const s=await session(async url=>url===TOKEN?json({access_token:'private',token_type:'bearer',expires_in:300,scope:SCOPE}):
    ++queries===1?json({items:[{productId:'old-guid',skuId:'0010',status:'Active'}],continuationToken:'next'}):
      json({items:[{productId:'old-guid',skuId:'0020',status:'Expired'},{productId:'other',skuId:'0010',status:'Revoked'}]}));
  try{
    await s.callback({code:'private-code'});assert.equal(queries,1);
    await s.post('/next',{});assert.equal(queries,2);assert.equal(s.app.snapshot().traversalComplete,true);
    assert.equal(s.app.snapshot().distinctProducts,2);assert.equal(s.app.snapshot().distinctProductSkuPairs,3);
    await s.post('/check',{product:'OLD-GUID',sku:'0020'});
    assert.equal(s.app.snapshot().lastExactIdCheck.rows,1);assert.equal(s.app.snapshot().lastExactIdCheck.licenseStatus.Expired,1);
    assert.equal(s.app.snapshot().ownershipEstablished,false);assert.equal(s.app.snapshot().accountLibraryComplete,false);
    assert.equal((await s.post('/next',{})).status,409);assert.equal(queries,2);
    await s.post('/check',{product:'not-observed'});assert.equal(s.app.snapshot().lastExactIdCheck.rows,0);
  }finally{await s.app.close();}
});
test('Cross-origin local actions and query-string callbacks are rejected without external calls',async()=>{
  let calls=0;const s=await session(async()=>{calls++;throw Error('Not expected');});
  try{
    assert.equal((await s.post('/next',{},'https://untrusted.example')).status,403);
    assert.equal((await fetch(s.app.url+'callback?code=do-not-use')).status,400);
    assert.equal(calls,0);
  }finally{await s.app.close();}
});
test('Summary emits no identifiers, titles, unexpected provider strings or ownership heuristics',()=>{
  const rows=[{productId:'private-id',skuId:'private-sku',title:'Private Title',status:'Active',ownershipType:'OwnedByBeneficiary'},
    {productId:'second',status:'private-status',ownershipType:'private-type',productKind:'Game'}];
  const s=summarize(rows);assert.equal(s.rows,2);assert.equal(s.licenseStatus.unrecognized,1);
  assert.equal(s.ownershipEstablished,false);assert(!JSON.stringify(s).includes('private'));
});
test('Closing clears the session and aborts pending auth so late responses cannot trigger a query',async()=>{
  let resolveToken,queries=0;
  const s=await session(async url=>{
    if(url===TOKEN)return new Promise(resolve=>{resolveToken=resolve;});
    queries++;return json({items:[]});
  });
  const pending=s.callback({code:'private'}).catch(()=>null);
  while(!resolveToken)await new Promise(r=>setTimeout(r,2));
  await s.app.close();resolveToken(json({access_token:'private',token_type:'bearer',expires_in:300,scope:SCOPE}));
  await pending;await new Promise(r=>setTimeout(r,5));assert.equal(queries,0);assert.deepEqual(s.app.snapshot(),{phase:'closed'});
});

test('Pagination stops on rejection or repeated continuation; prior rows stay explicitly partial',async()=>{
  for(const cycle of [false,true]){
    let queries=0;
    const s=await session(async url=>url===TOKEN?json({access_token:'private',token_type:'bearer',expires_in:300,scope:SCOPE}):
      ++queries===1?json({items:[{productId:'first'}],continuationToken:'private-next'}):
        cycle?json({items:[{productId:'second'}],continuationToken:'private-next'}):json({code:'Forbidden'},403));
    try{
      await s.callback({code:'private'});await s.post('/next',{});
      assert.equal(s.app.snapshot().reason,cycle?'continuation-cycle-partial':'endpoint-rejected-after-token');
      assert.equal(s.app.snapshot().traversalComplete,false);
      assert.equal(s.app.snapshot().rows,cycle?2:1);
      assert.equal((await s.post('/next',{})).status,409);assert.equal(queries,2);
    }finally{await s.app.close();}
  }
});

test('Close action replies and discards results without a remote sign-out or extra query',async()=>{
  let calls=0;
  const s=await session(async()=>{calls++;throw Error('Not expected');});
  try{
    const response=await s.post('/finish',{});
    assert.equal(response.status,200);assert.match(await response.text(),/Session closed/);
    assert.deepEqual(s.app.snapshot(),{phase:'closed'});assert.equal(calls,0);
  }finally{await s.app.close();}
});
