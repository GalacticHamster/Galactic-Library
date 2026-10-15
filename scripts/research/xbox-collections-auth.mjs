// Standalone research only. No production imports, stored credentials or library writes.
// Run: node scripts/research/xbox-collections-auth.mjs --client-id YOUR_OWN_APP_GUID
import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const SCOPE='service::collections.mp.microsoft.com::MBI_SSL';
export const AUTH='https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
export const TOKEN='https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
export const QUERY='https://collections.mp.microsoft.com/v7.0/collections/query';
const MAX_RESPONSE=2*1024*1024,MAX_PAGES=40;
const nonce=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const knownErrors=new Set(['invalid_scope','invalid_resource','invalid_client','unauthorized_client',
  'invalid_request','invalid_grant','access_denied','consent_required','interaction_required',
  'login_required','unsupported_response_type','unsupported_grant_type','temporarily_unavailable',
  'server_error','InvalidMsaTicketFormat','InvalidXToken','UnsupportedIdentityType','Unauthorized',
  'Forbidden','AuthenticationFailed','InvalidRequest']);
export function safeError(body={}) {
  const name=body?.error?.code??body?.error??body?.code;
  const aadsts=[...String(body?.error_description??'').matchAll(/\bAADSTS(\d{4,9})\b/g)].map(m=>Number(m[1]));
  for(const n of Array.isArray(body?.error_codes)?body.error_codes:[])
    if(Number.isInteger(n)&&n>=1000&&n<=999999999)aadsts.push(n);
  return {code:knownErrors.has(name)?name:'unrecognized-error',aadsts:[...new Set(aadsts)].slice(0,5)};
}
export function failureCategory(error) {
  if(['invalid_scope','invalid_resource'].includes(error.code))return 'resource-scope-rejected-by-tested-authority';
  if(['invalid_client','unauthorized_client'].includes(error.code))return 'registration-or-client-configuration';
  if(['unsupported_response_type','unsupported_grant_type'].includes(error.code))return 'unsupported-flow';
  if(error.code==='access_denied')return 'authorization-denied-or-cancelled';
  return 'authorization-or-token-failure';
}
export function makeAuthorization({clientId,redirectUri,state,verifier}) {
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientId)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(clientId))
    throw Error('Supply the Application (client) ID of a registration you control.');
  const url=new URL(AUTH);
  url.search=new URLSearchParams({client_id:clientId,response_type:'code',response_mode:'form_post',
    redirect_uri:redirectUri,scope:SCOPE,state,prompt:'consent',
    code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  return url.href;
}
async function readBody(stream,limit) {
  const chunks=[];let length=0;
  for await(const chunk of stream) {
    length+=chunk.length;if(length>limit)throw Error('Body exceeds research bound');chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function jsonResponse(response) {
  if(!response.body)throw Error('Missing response body');
  return JSON.parse(await readBody(response.body,MAX_RESPONSE));
}
const count=(rows,key,allowed)=>{
  const counts={};
  for(const row of rows){const value=row[key];const label=value==null?'not provided':allowed.includes(value)?value:'unrecognized';
    counts[label]=(counts[label]??0)+1;}
  return counts;
};
export function summarize(rows) {
  const products=new Set(),skuPairs=new Set(),skuValues=new Set();
  for(const row of rows){if(typeof row.productId==='string')products.add(row.productId);
    if(typeof row.skuId==='string'){skuValues.add(row.skuId);skuPairs.add(JSON.stringify([row.productId??null,row.skuId]));}}
  return {rows:rows.length,distinctProducts:products.size,distinctProductSkuPairs:skuPairs.size,
    distinctSkuValues:skuValues.size,
    productTypes:count(rows,'productKind',['Game','Durable','Application','Pass','Bundle','UnmanagedConsumable','Consumable']),
    productTypeField:count(rows,'productType',['Game','Durable','Application','Pass','Bundle','UnmanagedConsumable','Consumable']),
    licenseStatus:count(rows,'status',['Active','Expired','Revoked','Banned','Suspended','Cancelled']),
    ownershipType:count(rows,'ownershipType',['OwnedByBeneficiary','Shared','Unknown']),
    ownershipEstablished:false,accountLibraryComplete:false};
}

export async function startExperiment({clientId,fetchImpl=fetch,ttlMs=15*60*1000,onSummary=()=>{}}) {
  // Validate setup before binding sockets or initiating authentication.
  makeAuthorization({clientId,redirectUri:'http://localhost/callback',state:'validation',verifier:'validation'});
  let state=null,verifier=null,accessToken=null,expiresAt=0,continuation=null,busy=false,closed=false;
  let rows=[],seen=new Set(),redirectUri,origin,timer;
  const lifetime=new AbortController();
  const actionNonce=nonce();
  let outcome={phase:'ready',pages:0,pagesRequested:0,tokenIssued:false,queryAuthorized:false,
    continuationAvailable:false,traversalComplete:false,...summarize([])};
  const snapshot=()=>structuredClone(outcome);
  const emit=()=>{outcome={...outcome,...summarize(rows)};onSummary(snapshot());};
  const clearAuth=()=>{state=null;verifier=null;accessToken=null;expiresAt=0;continuation=null;};
  function fail(reason,extra={}){if(closed)return;clearAuth();outcome={...outcome,phase:'stopped',reason,...extra};emit();}
  async function nextPage() {
    if(!accessToken||Date.now()>=expiresAt){fail('token-expired-or-missing');return;}
    if(outcome.pages>=MAX_PAGES){fail('page-bound-partial');return;}
    let response,body;
    try {
      outcome.pagesRequested++;
      response=await fetchImpl(QUERY,{method:'POST',redirect:'error',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(20000)]),
        headers:{'Content-Type':'application/json','Accept':'application/json','Accept-Language':'en-US'},
        body:JSON.stringify({market:'US',maxPageSize:100,productTypes:['Game','Durable','Application','Pass'],
          continuationToken:continuation,beneficiaries:[{identitytype:'msa',identityValue:accessToken,localTicketReference:'1'}]})});
      if(closed)return;
      outcome.queryHttpStatus=response.status;
      // Never echo a raw token-bearing error response.
      if(response.status!==200){
        try{body=await jsonResponse(response);}catch{body={};}
        fail('endpoint-rejected-after-token',{error:safeError(body)});return;
      }
      body=await jsonResponse(response);
    }catch{fail('query-transport-or-response-failure');return;}
    if(closed)return;
    if(!Array.isArray(body?.items)||body.items.length>1000||
      body.items.some(r=>!r||typeof r!=='object'||Array.isArray(r))||
      (body.continuationToken!=null&&typeof body.continuationToken!=='string')) {
      fail('endpoint-response-schema-unrecognized');return;
    }
    outcome.pages++;rows.push(...body.items);outcome.queryAuthorized=true;
    const next=body.continuationToken||null;
    outcome.continuationAvailable=!!next;
    if(next&&seen.has(next)){fail('continuation-cycle-partial');return;}
    if(next)seen.add(next);
    continuation=next;
    outcome.phase=next?'page-read':'source-exhausted';
    outcome.traversalComplete=!next;
    if(!next)clearAuth();
    emit();
  }
  async function callback(params) {
    if(!state||!equal(params.get('state'),state))return false;
    state=null; // One callback only, including failures.
    if(params.has('error')){const error=safeError(Object.fromEntries(params));fail(failureCategory(error),{error});return true;}
    if(params.getAll('code').length!==1||!params.get('code')||params.has('access_token')||params.has('id_token')) {
      fail('unexpected-authorization-response');return true;
    }
    let response,body;
    try {
      response=await fetchImpl(TOKEN,{method:'POST',redirect:'error',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(20000)]),
        headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
        body:new URLSearchParams({client_id:clientId,grant_type:'authorization_code',code:params.get('code'),
          redirect_uri:redirectUri,scope:SCOPE,code_verifier:verifier}).toString()});
      verifier=null;body=await jsonResponse(response);
    }catch{fail('token-transport-or-response-failure');return true;}
    if(closed)return true;
    outcome.tokenHttpStatus=response.status;
    if(response.status!==200||body.error){const error=safeError(body);fail(failureCategory(error),{error});return true;}
    if(typeof body.access_token!=='string'||!body.access_token||String(body.token_type).toLowerCase()!=='bearer') {
      fail('unexpected-token-response');return true;
    }
    outcome.tokenIssued=true;
    const returnedScopes=typeof body.scope==='string'?body.scope.split(/\s+/):null;
    outcome.requestedScopeEchoed=returnedScopes?returnedScopes.includes(SCOPE):null;
    if(returnedScopes&&!returnedScopes.includes(SCOPE)){fail('resource-scope-not-granted');return true;}
    // An opaque token cannot be verified by decoding it. The actual query is the
    // authorization check. No refresh token, ID token or extra scope is retained.
    accessToken=body.access_token;
    const seconds=Number(body.expires_in);
    if(!Number.isFinite(seconds)||seconds<=0){fail('token-validity-not-provided');return true;}
    expiresAt=Date.now()+Math.min(seconds*1000,ttlMs);
    await nextPage();return true;
  }
  const headers={'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://login.microsoftonline.com https://login.live.com; frame-ancestors 'none'; base-uri 'none'"};
  const form=(action,label,extra='')=>`<form method="post" action="${action}"><input type="hidden" name="nonce" value="${actionNonce}">${extra}<button>${label}</button></form>`;
  function html(){return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>GL Xbox authorization experiment</title>
    <style>body{font:16px system-ui;max-width:850px;margin:32px auto;padding:0 16px}button,input{font:inherit;padding:8px;margin:6px 0}pre{white-space:pre-wrap;background:#eee;padding:12px}label{display:block}</style>
    <h1>Xbox Collections authorization test</h1><p>Research only. No GL library changes. Use a Microsoft application you control.</p>
    <p>Requested permission: <code>${SCOPE}</code>. No offline access, stored credentials or ownership guessing. This session closes after 15 minutes.</p>
    <p><strong>${busy?'Working… Refresh this page shortly.':escape(outcome.phase)}</strong></p>
    <pre>${escape(JSON.stringify(snapshot(),null,2))}</pre>
    ${outcome.phase==='ready'?form('/start','Sign in and test one read-only query'):''}
    ${!busy&&outcome.phase==='page-read'?form('/next','Read the next page'):''}
    ${rows.length?form('/check','Check exact ID locally','<label>Product ID <input name="product" required maxlength="256"></label><label>SKU (optional) <input name="sku" maxlength="256"></label>'):''}
    ${form('/finish','Close session and discard data')}<p>Do not share the Microsoft callback, codes, tokens, cookies, or network captures. Only the aggregate outcome is intended for reporting.</p></html>`;}
  const server=createServer(async(req,res)=>{
    const reply=(status,body='',extra={})=>{res.writeHead(status,{...headers,...extra});res.end(body);};
    try {
      if(closed||req.headers.host!==new URL(origin).host){reply(403);return;}
      const url=new URL(req.url,origin);
      if(url.search){reply(400,'Query callbacks are not accepted. Use the documented form_post flow.');return;}
      if(req.method==='GET'&&url.pathname==='/'){reply(200,html(),{'Content-Type':'text/html; charset=utf-8'});return;}
      if(req.method!=='POST'){reply(404);return;}
      if(!String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')){reply(415);return;}
      const params=new URLSearchParams(await readBody(req,32768));
      if(url.pathname==='/callback') {
        if(busy||params.getAll('state').length!==1){reply(409);return;}
        busy=true;
        try {if(!await callback(params)){reply(403,'Invalid or expired authorization state.');return;}}
        finally{busy=false;}
        reply(303,'',{Location:'/'});return;
      }
      if(req.headers.origin!==origin||params.getAll('nonce').length!==1||!equal(params.get('nonce'),actionNonce)){reply(403);return;}
      if(url.pathname==='/finish'){reply(200,'Session closed; in-memory credentials and results discarded.');void close();return;}
      if(busy){reply(409,'An operation is already running.');return;}
      if(url.pathname==='/start'&&outcome.phase==='ready') {
        state=nonce();verifier=randomBytes(48).toString('base64url');outcome.phase='waiting-for-consent';
        reply(303,'',{Location:makeAuthorization({clientId,redirectUri,state,verifier})});return;
      }
      if(url.pathname==='/next'&&outcome.phase==='page-read') {
        busy=true;try{await nextPage();}finally{busy=false;}reply(303,'',{Location:'/'});return;
      }
      if(url.pathname==='/check') {
        const product=params.get('product')??'',sku=params.get('sku')??'';
        if(!product||product.length>256||sku.length>256){reply(400);return;}
        // Exact identifier comparison only. No catalog requests or title matching.
        const matches=rows.filter(r=>typeof r.productId==='string'&&r.productId.toUpperCase()===product.toUpperCase()&&
          (!sku||String(r.skuId??'').toUpperCase()===sku.toUpperCase()));
        outcome.lastExactIdCheck={...summarize(matches),absenceMeaning:'Not observed in pages read; not proof of nonownership'};
        reply(303,'',{Location:'/'});return;
      }
      reply(409,'Action is not available in the current state.');
    }catch{fail('local-request-or-processing-failure');if(!res.headersSent)reply(400,'Request could not be processed. No raw error details logged.');else res.end();}
  });
  async function close(){if(closed)return;closed=true;clearTimeout(timer);lifetime.abort();clearAuth();rows=[];seen.clear();
    outcome={phase:'closed'};server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://localhost:${server.address().port}`;redirectUri=origin+'/callback';
  timer=setTimeout(()=>{fail('session-ended-without-completing-or-expired');void close();},ttlMs);
  return {url:origin+'/',snapshot,close};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--client-id') {
    console.error('Usage: node scripts/research/xbox-collections-auth.mjs --client-id YOUR_OWN_APP_GUID');process.exitCode=1;
  } else {
    try {
      const app=await startExperiment({clientId:args[1],onSummary:summary=>console.log(JSON.stringify(summary))});
      console.log('Open locally in Chrome or Firefox: '+app.url);
      console.log('Only use a registration you control. No secret or token is needed as input. Ctrl+C discards the session.');
      process.once('SIGINT',()=>{void app.close();});process.once('SIGTERM',()=>{void app.close();});
    }catch{console.error('Could not start. Check the GL-owned client GUID and localhost availability. No raw error details logged.');process.exitCode=1;}
  }
}
