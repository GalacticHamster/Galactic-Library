import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const root=new URL('./xbox-web-validation/',import.meta.url),core=await readFile(new URL('core.js',root),'utf8');
const context=vm.createContext({URL});vm.runInContext(core,context);const C=context.GLXboxWebValidation;
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const actor='private-local-id',data=new Map(),queries={};
  const add=(name,value,scoped=true)=>{
    const key=scoped?['user',actor,name]:[name];data.set(JSON.stringify(key),{status:'success',fetchStatus:'idle',value});
    const q={getOptions:()=>({queryKey:key})};queries[name]=scoped?{getActiveUserQuery:()=>q}:q;
  };
  const rows=Array.from({length:37},(_,i)=>({productId:'X'+String(i).padStart(11,'0'),providerId:'grts-catalog-provider',basicProductInfo:{title:'Private title '+i}}));
  add('activeUser',actor,false);add('profile',{xuid:'1234567890123456'});add('owned',rows.map(({productId})=>({productId})));add('assembled',rows);
  add('access',new Map(rows.map((r,i)=>[r.productId,{userAccessTypes:new Set(i<3?[1,2]:[1])}])));
  const env={queryClient:{getQueryState:key=>data.get(JSON.stringify(key)),getQueryData:key=>data.get(JSON.stringify(key))?.value},systems:{authentication:{queries:{activeUserId:queries.activeUser,userInfo:queries.profile}},library:{queries:{resolveCatalogItems:queries.owned,assembledItems:queries.assembled}},contentAccess:{queries:{allProductAccess:queries.access}}}};
  const window={location:{origin:'https://play.xbox.com',href:'https://play.xbox.com/library'},__SW_MANAGER__:{env}};
  const get=name=>data.get(JSON.stringify(name==='activeUser'?[name]:['user',actor,name]));
  return {window,env,get,rows};
}
test('Xbox website Owned cache joins 37 identities/titles/access entries without requests or identifying exports',()=>{
  const f=fixture(),result=C.read(f.window);assert.equal(result.state,'ready');assert.equal(result.ownedRows,37);assert.equal(result.distinctProducts,37);assert.equal(result.joinedTitles,37);assert.equal(result.joinedAccess,37);assert.equal(result.flags.personalOwnedFlag,37);assert.equal(result.flags.gamePassUltimate,3);assert.equal(result.accountScopesMatch,true);assert.equal(result.accountIdentityPresent,true);assert.equal(result.requestsMade,0);assert.equal(result.libraryComplete,false);assert.equal(result.ownershipVerified,false);
  for(const privateValue of ['private-local-id','Private title','1234567890123456','X00000000000'])assert(!JSON.stringify(result).includes(privateValue));
});
test('Xbox cache missing, pending, fetching, mismatched-account and unsupported data remain explicit',()=>{
  assert.equal(C.read({location:{origin:'https://play.xbox.com'}}).state,'unavailable');
  for(const name of ['owned','assembled','access']){const f=fixture();f.get(name).value=undefined;assert.equal(C.read(f.window).state,'waiting');}
  const f=fixture();f.get('owned').fetchStatus='fetching';assert.equal(C.read(f.window).state,'incomplete');f.get('owned').fetchStatus='idle';f.get('activeUser').value='private-other';assert.equal(C.read(f.window).accountScopesMatch,false);
  const g=fixture();g.get('owned').value.push({productId:'private-invalid'});assert.equal(C.read(g.window).unsupportedIdentities,1);assert.equal(C.read(g.window).state,'incomplete');
});
test('Xbox title hydration, stable identity duplication and third-party records are not silently accepted',()=>{
  const f=fixture();f.rows[0].basicProductInfo=null;assert.equal(C.read(f.window).missingTitles,1);assert.equal(C.read(f.window).state,'incomplete');
  const g=fixture();g.get('owned').value.push(g.get('owned').value[0]);assert.equal(C.read(g.window).duplicateProducts,1);assert.equal(C.read(g.window).state,'incomplete');
  const h=fixture();h.rows[0].providerId='steam';assert.equal(C.read(h.window).firstPartyProducts,36);assert.equal(C.read(h.window).state,'incomplete');
});
test('Xbox reader touches no token, email, other auth data or fetch methods',()=>{
  const f=fixture();for(const field of ['email','fullName','tokens','tokenData'])Object.defineProperty(f.get('profile').value,field,{get(){throw Error('Must not read '+field);}});
  for(const obj of [f.env,f.env.queryClient,f.window])for(const field of ['fetch','fetchQuery','tokens','authenticationTokens'])Object.defineProperty(obj,field,{get(){throw Error('Must not read '+field);}});
  assert.equal(C.read(f.window).state,'ready');
  assert.equal(C.read({...f.window,location:{origin:'https://evil.example'}}).state,'unavailable');
});
test('Xbox diagnostics sanitize hostile messages and distinguish visible DOM links from full cached catalog',()=>{
  const f=fixture(),document={querySelectorAll:()=>[{getAttribute:()=>'/games/one/X00000000000'},{getAttribute:()=>'/games/one/X00000000000'},{getAttribute:()=>'/games/other/Y00000000000'},{getAttribute:()=>'https://evil.example/games/x/X00000000001'}]};
  const result=C.read(f.window,document);assert.equal(result.visibleProductLinks,2);assert.equal(result.visibleOwnedLinks,1);assert.equal(result.ownedRows,37);
  const clean=C.sanitize({...result,accountId:'private',title:'private',queries:{owned:{state:'private',queryKey:['private']}},flags:{private:1},state:'private'});assert(!JSON.stringify(clean).includes('private'));assert.equal(clean.requestsMade,0);
});
test('Xbox helper has no network/storage permissions and MAIN messages reject foreign origin or malformed nonce',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.json',root)));assert.equal(manifest.permissions,undefined);assert.equal(manifest.host_permissions,undefined);
  const listeners=[],posts=[],f=fixture(),ctx=vm.createContext({URL,location:f.window.location,document:{querySelectorAll:()=>[]},addEventListener:(name,fn)=>listeners.push(fn),GLXboxWebValidation:C});ctx.window=f.window;f.window.postMessage=value=>posts.push(value);
  vm.runInContext(await readFile(new URL('probe.js',root),'utf8'),ctx);
  const event={source:f.window,origin:f.window.location.origin,data:{channel:'gl-xbox-validation-request',nonce:'a'.repeat(32)}};
  listeners[0]({...event,origin:'https://evil.example'});listeners[0]({...event,data:{...event.data,nonce:'private'}});assert.equal(posts.length,0);listeners[0](event);assert.equal(posts.length,1);assert.equal(posts[0].report.state,'ready');assert.equal(posts[0].nonce,'a'.repeat(32));
});
