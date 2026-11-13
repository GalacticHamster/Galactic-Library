// Disposable packaged-browser check of Humble Library 1.1 purchases from the redesigned
// Humble Library: synthetic Humble responses -> the real HB collector -> HB storage ->
// HB bundle-page matching (Chrome) -> automatic purchase sync -> GL storage and lookups.
// Called only by check-purchase-handoff-browser.mjs --native. Nothing is inserted into GL
// except a disposable Steam record used to prove other providers are untouched.
import assert from 'node:assert/strict';

// Synthetic Humble Library: purchase parents and their entitlements. DRM-free entries carry
// the download platform and file formats Humble lists; keys carry a secret that must never persist.
const PARENTS=[
 {id:'parent-comics',title:'Humble Comics Bundle: Synthetic Heroes',rows:[['n1','Saga Volume 1','download_drm_free','ebook',['CBZ','PDF']],['n2','Monstress Volume 1','download_drm_free','ebook',['CBZ']]]},
 {id:'parent-repeat',title:'Humble Comics Bundle: Synthetic Heroes',rows:[['n3','Saga Volume 1','download_drm_free','ebook',['CBZ']]]},
 {id:'parent-books',title:'Humble Book Bundle: Synthetic Fiction',rows:[['n4','The Synthetic Novel','download_drm_free','ebook',['EPUB','MOBI']]]},
 {id:'parent-software',title:'Humble Software Bundle: Synthetic Tools',rows:[['n5','Synthetic Tool','download_drm_free','windows',['Download']]]},
 {id:'parent-games',title:'Synthetic Indie Bundle',rows:[['n6','Synthetic Platformer','download_drm_free','windows',['Download']],['n7','Synthetic Shooter','steam'],['n8','Mystery Item','download_drm_free'],['n9','Gifted Comic','download_drm_free','ebook',['CBZ'],'gifted']]}
];
const transportSource=`(()=>{const parents=${JSON.stringify(PARENTS)};
 const frames=components=>components.map((c,i)=>(i+1).toString(16)+':I'+JSON.stringify([i+1,c.name==='UserLibrary'?['static/chunks/synthetic-library.js']:[],c.name])).join('\\n')+'\\n0:'+JSON.stringify(components.map((c,i)=>['$','$L'+(i+1).toString(16),null,c.props]))+'\\n';
 const response=(body,status=200,type='text/x-component')=>({ok:status===200,status,type:'basic',headers:{get:name=>name==='content-type'?type:null},text:async()=>body});
 const html=components=>response('<!doctype html><script>self.__next_f.push('+JSON.stringify([1,frames(components)])+')</script>',200,'text/html');
 const auth={name:'AuthProvider',props:{user:{id:'principal-A'}}},rows=parents.flatMap(p=>p.rows.map(([id,title,type])=>({id,title,type,userId:'hub-A',productEntitlementId:p.id})));
 const child=([id,title,type,platform,formats,gift])=>({id,title,type,giftStatus:gift?'gifted':'unassigned',expired:false,preOrdered:false,outOfStock:false,redeemable:true,directRedeem:false,keyIntegrationId:null,unavailableBefore:null,unavailableAfter:null,redeemedAt:null,
  ...(type==='steam'?{redemptionData:{keyFormatted:'SYNTHETIC_SECRET_NEVER_PERSIST'}}:platform?{downloads:[{id:'dl-'+id,platform,downloadStruct:formats.map(name=>({id:'f-'+name,name,md5:'SYNTHETIC_HASH',url:{web:'https://dl.example.invalid/SYNTHETIC_SIGNED'}}))}]}:{})});
 return async(path,init={})=>{
  if(path==='/_next/static/chunks/synthetic-library.js')return response('(0,r.createServerReference)("'+'a'.repeat(40)+'",r.callServer,void 0,r.findSourceMapURL,"filterUserLibrary")',200,'text/javascript');
  if(path==='/home/library'&&init.method!=='POST')return html([auth,{name:'UserLibrary',props:{bundleItems:parents.map(p=>({id:'group-'+p.id,productEntitlementId:p.id,userId:'hub-A',type:'bundle'}))}}]);
  if(path==='/home/library'&&init.method==='POST'){const page=Number(init.body.get('_1_page')),limit=Number(init.body.get('_1_limit'));return response('0:'+JSON.stringify({success:true,results:rows.slice((page-1)*limit,page*limit),pagination:{page,totalPages:Math.max(1,Math.ceil(rows.length/limit)),totalDocs:rows.length}})+'\\n');}
  const parent=parents.find(p=>path==='/home/library/'+p.id);
  if(parent){const children=parent.rows.map(child);return html([auth,{name:'ProductKeysDownloads',props:{productEntitlementId:parent.id,userLibraryItem:{id:'detail-'+parent.id,title:parent.title,preOrder:false,entitlements:{redemptionGroups:[],keys:children.filter(c=>c.type!=='download_drm_free'),downloads:children.filter(c=>c.type==='download_drm_free')}}}}]);}
  throw Error('Unexpected synthetic Humble request');};})()`;

// A redesigned Humble bundle page, as the content script reads it.
function bundlePage(slug,section,titles){
 const cards=titles.map(t=>`<li><button type="button" aria-haspopup="dialog"><div data-testid="bundle-item-card" data-bundle-type="${section}"><div data-testid="bundle-item-native-image"><img alt="${t}"></div><div>${t}</div></div></button></li>`).join('');
 const flight=JSON.stringify([1,'e:'+JSON.stringify(['$','Component',null,{bundlePage:{slug,tiers:[{price:{amount:10,currencyCode:'USD'},bundleItems:titles.map(title=>({title}))}]}}])]);
 return `<!doctype html><html><head><script type="application/json" src="/_next/synthetic.js"></script></head><body><main><h1>Synthetic bundle</h1><div id="provider-items"><section data-bundle-section="${section}"><ul>${cards}</ul></section></div></main><script type="application/json">self.__next_f.push(${flight})</script></body></html>`;
}

// Companion discovery can pair the only account on each side right after install. A Library sync
// that changes the shared data during that handshake is reported as a relationship change, as for
// any import, so let automatic setup settle first, as it would minutes after installing.
async function settle(call){let quiet=0;for(let n=0;n<300&&quiet<40;n++){const s=(await call('gl','syncState','humble')).state;if(!s)quiet++;else if(s.confirmed&&s.remoteConfirmed&&!s.pending&&s.status==='synced')return true;else quiet=0;await new Promise(done=>setTimeout(done,100));}return false;}
// Waits for GL to hold the expected Humble records and for the sync to be idle.
async function waitForHumble(evaluate,call,expected){let count=-1;
 for(let n=0;n<900;n++){count=await evaluate(`const S=await import('./src/lib/storage.js');return Object.values((await S.getDatabase()).providerItems).filter(i=>i.provider==='humble').length;`);if(count===expected)break;await new Promise(done=>setTimeout(done,100));}
 assert.equal(count,expected,'GL Humble records');return waitSynced(call);}
async function waitSynced(call){let state;for(let n=0;n<600;n++){state=await call('gl','syncState','humble');if(state.ok&&state.state?.status==='synced'&&!state.state.pending)break;await new Promise(done=>setTimeout(done,100));}assert.equal(state.state?.status,'synced',JSON.stringify(state.state));return state;}
async function pair(call){
 const choice=await call('hb','syncChoices','humble',{});assert.equal(choice.ok,true,choice.error);
 if(!(await call('hb','syncState','humble')).state?.confirmed){const proposed=await call('hb','syncConnect','humble',{peerId:choice.peerId,localId:choice.accounts[0].stableId,remoteId:choice.remoteAccounts[0].stableId,confirmed:true,sameAccount:true});
  if(!proposed.ok&&!(await call('hb','syncState','humble')).state?.confirmed)assert.equal(proposed.ok,true,proposed.error);}
 return choice;
}
// An existing 1.0.x user: imported purchases (with a media correction and a key reminder) already
// shared with GL, a GL ownership correction, and another GL provider. Then the Library sync runs.
export async function nativeUpgradeChecks({navigate,evaluate,call,installed,checks,measurements}){
 const historical=[{title:'Saga Volume 1',kind:'comic',source:'humble',purchaseKey:'old-comics',providerItemId:'old-comics:product:saga',sourceBundle:'Humble Comics Bundle: Synthetic Heroes',entitlement:'direct-download',purchasedAt:'2020-01-01T00:00:00.000Z'},
  {title:'Monstress Volume 1',kind:'comic',source:'humble',purchaseKey:'old-comics',providerItemId:'old-comics:product:monstress',sourceBundle:'Humble Comics Bundle: Synthetic Heroes',entitlement:'direct-download',purchasedAt:'2020-01-01T00:00:00.000Z'},
  {title:'Old Only Book',kind:'book',manualKind:'book',automaticKind:'unclassified',source:'humble',purchaseKey:'old-books',providerItemId:'old-books:product:old',sourceBundle:'Old Bundle',entitlement:'direct-download',purchasedAt:'2019-01-01T00:00:00.000Z'}];
 const reminder={id:'old-games:key:0',purchaseKey:'old-games',title:'Old Key Game',sourceBundle:'Old Games',keyType:'Steam',status:'unrevealed',directRedeem:false,isExpired:false,checkedAt:'2026-01-01T00:00:00.000Z'};
 await navigate('gl');
 await evaluate(`const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),P=await import('./src/lib/provider-profiles.js'),d=M.createEmptyDatabase();
  const h=P.newProviderProfile('humble','Personal');d.providerProfiles[h.profileId]=h;h.state={connected:true};d.providers.humble={...h.state,profileLabel:h.nickname,activeProfileId:h.profileId};
  const s=P.newProviderProfile('steam','Steam');d.providerProfiles[s.profileId]=s;const item=M.normalizeProviderItem({provider:'steam',profileId:s.profileId,providerItemId:'620',title:'Synthetic Steam Game',mediaType:'game',ownership:'owned',metadata:{}},undefined,{profileKeySpace:s.keySpace});d.providerItems[item.id]=item;s.state={connected:true};d.providers.steam={...s.state,profileLabel:s.nickname,activeProfileId:s.profileId};
  d.canonicalItems=M.rebuildCanonicalItems(d.providerItems);await S.restoreDatabase(d);await S.addAllowedExternalClientId(${JSON.stringify(installed.hb.id)});return true;`);
 await settle(call);
 await navigate('hb');
 await evaluate(`await chrome.storage.local.set({humbleProfileLabel:'Personal',libraryItems:${JSON.stringify(historical)},purchaseSummaries:[{purchaseKey:'old-comics',sourceBundle:'Humble Comics Bundle: Synthetic Heroes',itemCount:2},{purchaseKey:'old-books',sourceBundle:'Old Bundle',itemCount:1}],keyReminders:[${JSON.stringify(reminder)}],keyReminderScan:{complete:true,checkedAt:'2026-01-01T00:00:00.000Z'}});return true;`);
 await pair(call);await navigate('gl');await waitForHumble(evaluate,call,3);
 const baseline=await evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();const old=Object.values(d.providerItems).find(i=>i.title==='Old Only Book');await S.saveOwnershipReview(old.recordRef,{ownership:'unknown',note:'Synthetic correction: this copy was refunded.',evidenceDate:'2026-01-02T00:00:00.000Z'});return Object.values((await S.getDatabase()).providerItems).filter(i=>i.provider==='humble').length;`);
 assert.equal(baseline,3,'the imported purchases reached GL before the upgrade');
 await navigate('hb');const hbBefore=await evaluate(`return JSON.stringify(await chrome.storage.local.get(['libraryItems','purchaseSummaries','keyReminders','keyReminderScan','humbleProfileLabel','humbleAccountId']));`);
 await evaluate(`const E=HumbleLibraryEntitlements,store=(op,...a)=>HumbleComicLibrary.storageRequest(op,...a),context=await store('entitlementContext');await E.createSync({fetcher:${transportSource},store,sleep:async()=>{}}).start({mode:'full',context,confirmed:true});return true;`);
 const hbAfter=await evaluate(`return JSON.stringify(await chrome.storage.local.get(['libraryItems','purchaseSummaries','keyReminders','keyReminderScan','humbleProfileLabel','humbleAccountId']));`);
 // No manual sync: finishing the Library sync must start the purchase sync by itself.
 await navigate('gl');const shareStarted=Date.now();let received=0;
 for(let n=0;n<900&&received!==8;n++){received=await evaluate(`const S=await import('./src/lib/storage.js');return Object.values((await S.getDatabase()).providerItems).filter(i=>i.provider==='humble').length;`);if(received!==8)await new Promise(done=>setTimeout(done,100));}
 assert.equal(received,8,'the finished Library sync was shared automatically');measurements.push({automaticShareMs:Date.now()-shareStarted});await waitSynced(call);
 const gl=await evaluate(`const S=await import('./src/lib/storage.js'),O=await import('./src/lib/ownership.js'),d=await S.getDatabase(),rows=Object.values(d.providerItems).filter(i=>i.provider==='humble');const old=rows.find(i=>i.title==='Old Only Book');
  return {rows:rows.map(i=>[i.title,i.providerItemId.startsWith('humble-library:')?'synced':'imported']).sort(),review:d.ownershipReviews[old.recordRef]?.ownership,effective:O.effectiveOwnershipRecord(old,d).ownership,steam:Object.values(d.providerItems).filter(i=>i.provider==='steam').length};`);
 measurements.push({upgrade:gl});
 assert.deepEqual(gl.rows,[['Monstress Volume 1','imported'],['Old Only Book','imported'],['Saga Volume 1','imported'],['Saga Volume 1','synced'],['Synthetic Platformer','synced'],['Synthetic Shooter','synced'],['Synthetic Tool','synced'],['The Synthetic Novel','synced']],
  'titles already shared are not sent again; the second Saga purchase and synced-only titles are added');
 assert.equal(gl.review,'unknown');assert.equal(gl.effective,'unknown','the GL ownership correction survives');assert.equal(gl.steam,1);
 await navigate('hb');assert.equal(await evaluate(`return JSON.stringify(await chrome.storage.local.get(['libraryItems','purchaseSummaries','keyReminders','keyReminderScan','humbleProfileLabel','humbleAccountId']));`),hbAfter);
 assert.equal(hbAfter,hbBefore,'imported purchases, the media correction, reminders and the account are unchanged');
 checks.push('existing-user upgrade: imported purchases, HB media correction, key reminder and GL ownership correction survive; overlap is not doubled; a repeat purchase and synced-only titles reach GL');
}

export async function nativePurchaseChecks({navigate,evaluate,wait,call,driver,firefox,installed,checks,measurements}){
 // GL: an empty Humble account and one Steam record that must survive untouched.
 await navigate('gl');
 await evaluate(`const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),P=await import('./src/lib/provider-profiles.js'),d=M.createEmptyDatabase();
  const h=P.newProviderProfile('humble','Personal');d.providerProfiles[h.profileId]=h;h.state={connected:true};d.providers.humble={...h.state,profileLabel:h.nickname,activeProfileId:h.profileId};
  const s=P.newProviderProfile('steam','Steam');d.providerProfiles[s.profileId]=s;const item=M.normalizeProviderItem({provider:'steam',profileId:s.profileId,providerItemId:'620',title:'Synthetic Steam Game',mediaType:'game',ownership:'owned',metadata:{}},undefined,{profileKeySpace:s.keySpace});d.providerItems[item.id]=item;s.state={connected:true};d.providers.steam={...s.state,profileLabel:s.nickname,activeProfileId:s.profileId};
  d.canonicalItems=M.rebuildCanonicalItems(d.providerItems);await S.restoreDatabase(d);await S.addAllowedExternalClientId(${JSON.stringify(installed.hb.id)});return true;`);
 const steamBefore=await evaluate(`const S=await import('./src/lib/storage.js');return JSON.stringify(Object.values((await S.getDatabase()).providerItems).filter(i=>i.provider==='steam'));`);

 measurements.push({pairedBeforeSync:await settle(call)});
 // HB: a fresh install (no saved account, no imports) runs the real full Library sync.
 await navigate('hb');
 const fresh=await evaluate(`const s=await chrome.storage.local.get({humbleAccountId:null,libraryItems:[],libraryEntitlements:null});return {items:(s.libraryItems??[]).length,native:s.libraryEntitlements?.scopes?.length??0};`);
 // Companion discovery may already have given the unnamed account its local ID; nothing else exists.
 assert.deepEqual(fresh,{items:0,native:0},'HB starts as a fresh install');
 const started=Date.now();
 const sync=await evaluate(`const E=HumbleLibraryEntitlements,store=(op,...a)=>HumbleComicLibrary.storageRequest(op,...a),context=await store('entitlementContext');
  await E.createSync({fetcher:${transportSource},store,sleep:async()=>{}}).start({mode:'full',context,confirmed:true});
  const s=await chrome.storage.local.get(null),scope=s.libraryEntitlements.scopes[0];
  return {account:s.humbleAccountId,bound:scope.localAccountId,status:scope.sync.status,coverage:scope.sync.coverage,saved:scope.observations.length,items:(s.libraryItems??[]).length,
   media:Object.fromEntries(scope.observations.map(o=>[o.title+'#'+o.nativeId,o.mediaType+'/'+o.purchaseStatus])),secret:JSON.stringify(s).includes('SYNTHETIC_SECRET')||JSON.stringify(s).includes('SYNTHETIC_SIGNED')||JSON.stringify(s).includes('SYNTHETIC_HASH')};`);
 measurements.push({nativeSyncMs:Date.now()-started});
 assert.equal(sync.status,'completed');assert.equal(sync.coverage,'accessible-pages-traversed');assert.equal(sync.saved,9);assert.equal(sync.items,0);assert.equal(sync.bound,sync.account);assert.equal(sync.secret,false);
 assert.deepEqual(sync.media,{'Saga Volume 1#n1':'comic/purchased','Monstress Volume 1#n2':'comic/purchased','Saga Volume 1#n3':'comic/purchased','The Synthetic Novel#n4':'book/purchased','Synthetic Tool#n5':'software/purchased',
  'Synthetic Platformer#n6':'game/purchased','Synthetic Shooter#n7':'game/purchased','Mystery Item#n8':'unknown/purchased','Gifted Comic#n9':'comic/excluded'});
 checks.push('fresh-install HB runs the real Library sync: media from Humble download data, gifts excluded, no imported purchases, no keys or download links stored');

 // Bundle-page badges from the installed content script (Chrome request interception).
 if(!firefox){
  const pages={'/books/synthetic-heroes':bundlePage('synthetic-heroes','books',['Saga Volume 1','Saga Volume 2','The Synthetic Novel','Brand New Synthetic Book']),
   '/games/synthetic-games':bundlePage('synthetic-games','games',['Synthetic Shooter','Synthetic Platformer','Unowned Synthetic Game'])};
  const target=await driver.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const off=driver.on(event=>{if(event.method!=='Fetch.requestPaused'||event.sessionId!==sessionId)return;const url=new URL(event.params.request.url),body=pages[url.pathname]??'';
   driver.send('Fetch.fulfillRequest',{requestId:event.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:url.pathname.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'}],body:Buffer.from(body).toString('base64')},sessionId).catch(()=>{});});
  try{
   await driver.send('Fetch.enable',{patterns:[{urlPattern:'https://www.humblebundle.com/*'}]},sessionId);await driver.send('Runtime.enable',{},sessionId);await driver.send('Page.enable',{},sessionId);
   const badges=async(path,count)=>{await driver.send('Page.navigate',{url:'https://www.humblebundle.com'+path},sessionId);let value=[];
    for(let n=0;n<400;n++){const r=await driver.send('Runtime.evaluate',{expression:`[...document.querySelectorAll('[data-testid="bundle-item-card"]')].map(card=>{const li=card.closest('li'),b=li?.querySelector('.hcl-status-button');return {title:card.textContent.trim(),state:b?.dataset.state??null,label:b?.textContent.trim()??null};})`,returnByValue:true},sessionId).catch(()=>null);
     value=r?.result?.value??[];if(value.length===count&&value.every(v=>v.state))break;await new Promise(done=>setTimeout(done,50));}
    return Object.fromEntries(value.map(v=>[v.title,v]));};
   const books=await badges('/books/synthetic-heroes',4),games=await badges('/games/synthetic-games',3);
   measurements.push({badges:{books,games}});
   assert.equal(books['Saga Volume 1'].state,'owned');assert.match(books['Saga Volume 1'].label,/Owned/);
   assert.equal(books['The Synthetic Novel'].state,'owned');
   assert.notEqual(books['Saga Volume 2'].state,'owned','a numbered sequel is not owned');
   assert.equal(books['Brand New Synthetic Book'].state,'new');
   assert.equal(games['Synthetic Shooter'].state,'owned');assert.match(games['Synthetic Shooter'].label,/Purchased/,'a Humble Steam key is Purchased, not activated');
   assert.equal(games['Synthetic Platformer'].state,'owned');assert.equal(games['Unowned Synthetic Game'].state,'new');
   checks.push('installed HB content script marks synced DRM-free comics and books Owned, a Steam key Purchased, sequels and unrelated items not owned (fresh install)');
  }finally{off();await driver.send('Target.closeTarget',{targetId:target.targetId}).catch(()=>{});}
 }

 // Automatic purchase sync through the existing companion protocol.
 await navigate('hb');
 const choice=await call('hb','syncChoices','humble',{});assert.equal(choice.ok,true,choice.error);
 const local=choice.accounts[0];assert.equal(local.eligibleCount,7,'seven synced purchases are shareable');assert.equal(local.count,8,'the unknown-media item is counted but not shared');
 // One account on each side pairs automatically; connect explicitly only if that has not happened yet.
 const linkStarted=Date.now(),paired=(await call('hb','syncState','humble')).state?.confirmed;
 if(!paired){const proposed=await call('hb','syncConnect','humble',{peerId:choice.peerId,localId:local.stableId,remoteId:choice.remoteAccounts[0].stableId,confirmed:true,sameAccount:true});
  if(!proposed.ok&&!(await call('hb','syncState','humble')).state?.confirmed)assert.equal(proposed.ok,true,proposed.error);}
 measurements.push({automaticallyPaired:Boolean(paired)});
 await navigate('gl');let state=await waitForHumble(evaluate,call,7);
 assert.equal(state.state.status,'synced',JSON.stringify(state.state));measurements.push({firstSyncMs:Date.now()-linkStarted});
 const gl=await evaluate(`const S=await import('./src/lib/storage.js'),O=await import('./src/lib/ownership.js'),d=await S.getDatabase();const rows=Object.values(d.providerItems).filter(i=>i.provider==='humble');
  return {rows:rows.map(i=>({id:i.providerItemId,title:i.title,media:i.mediaType,entitlement:i.metadata.entitlement,keyStatus:i.metadata.keyStatus??null,purchase:i.metadata.purchaseId,bundle:i.metadata.sourceBundle,ownership:i.ownership,evidence:O.entitlementEvidence(i)})).sort((a,b)=>a.id<b.id?-1:1),
   steam:JSON.stringify(Object.values(d.providerItems).filter(i=>i.provider==='steam')),canonical:Object.values(d.canonicalItems).filter(c=>['Saga Volume 1','Synthetic Shooter'].includes(c.title)).map(c=>({title:c.title,media:c.mediaType}))};`);
 assert.deepEqual(gl.rows.map(r=>[r.title,r.media,r.entitlement]),[['Saga Volume 1','book','direct-download'],['Monstress Volume 1','book','direct-download'],['Saga Volume 1','book','direct-download'],['The Synthetic Novel','book','direct-download'],['Synthetic Tool','software','direct-download'],['Synthetic Platformer','game','direct-download'],['Synthetic Shooter','game','third-party-key']]);
 assert(gl.rows.every(r=>r.id.startsWith('humble-library:')&&r.purchase.startsWith('humble-library:')&&r.ownership==='owned'));
 const shooter=gl.rows.find(r=>r.title==='Synthetic Shooter');assert.equal(shooter.keyStatus,'unknown');assert.equal(shooter.evidence.activationStatus,'unknown','GL records a Humble key purchase, not Steam activation');
 assert(!gl.rows.some(r=>r.title==='Mystery Item'||r.title==='Gifted Comic'));assert.equal(gl.steam,steamBefore,'other GL providers are untouched');
 checks.push('automatic purchase sync delivers synced Humble Library purchases to GL: repeat copies kept, Steam key activation unknown, unknown media and gifts withheld, other providers untouched');

 // GL lookups as HB's bundle pages use them, and the return leg of two-way sync.
 await navigate('hb');
 const lookup=await evaluate(`return chrome.runtime.sendMessage(${JSON.stringify(installed.gl.id)},{type:'MATCH_ITEMS',apiVersion:1,items:[{requestId:'comic',title:'Monstress Volume 1',mediaType:'book'},{requestId:'key',title:'Synthetic Shooter',mediaType:'game'}]});`);
 assert.equal(lookup.ok,true,lookup.error);measurements.push({glLookup:lookup.results});
 assert.equal(lookup.results.find(r=>r.requestId==='comic').owned,true);
 const after=await evaluate(`const s=await chrome.storage.local.get(null);return {items:(s.libraryItems??[]).length,summaries:(s.purchaseSummaries??[]).length,native:s.libraryEntitlements.scopes[0].observations.length};`);
 assert.deepEqual(after,{items:0,summaries:0,native:9},'GL sending synced purchases back never turns them into imported purchases');
 checks.push('GL ownership lookup recognises a synced comic; the two-way sync leaves HB imported storage empty and Library records unchanged');

 // A second sync with no changes rewrites nothing.
 await navigate('gl');
 const digest=`const S=await import('./src/lib/storage.js');const d=JSON.stringify(await S.getDatabase());return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(d)))].join(',');`;
 const before=await evaluate(digest),repeat=Date.now();const again=await call('gl','syncNow','humble');assert.equal(again.ok,true,again.error);
 for(let n=0;n<300;n++){state=await call('gl','syncState','humble');if(state.state?.status==='synced'&&!state.state.pending)break;await new Promise(done=>setTimeout(done,100));}
 measurements.push({noChangeSyncMs:Date.now()-repeat});assert.equal(await evaluate(digest),before,'an unchanged sync rewrote GL');
 checks.push('repeating the purchase sync with no changes leaves the GL database byte-identical');
}

// Known issue (docs/architecture/automatic-purchase-sync.md): an automatic sync that meets a running
// manual import stops with Needs attention instead of retrying. This proves it loses nothing.
export async function collisionChecks({navigate,evaluate,call,installed,checks,measurements}){
 await navigate('gl');
 await evaluate(`const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),P=await import('./src/lib/provider-profiles.js'),d=M.createEmptyDatabase();
  const h=P.newProviderProfile('humble','Personal');d.providerProfiles[h.profileId]=h;h.state={connected:true};d.providers.humble={...h.state,profileLabel:h.nickname,activeProfileId:h.profileId};
  d.canonicalItems=M.rebuildCanonicalItems(d.providerItems);await S.restoreDatabase(d);await S.addAllowedExternalClientId(${JSON.stringify(installed.hb.id)});return true;`);
 await settle(call);
 await navigate('hb');
 await evaluate(`const items=[];for(let n=0;n<3000;n++){const purchase='order_'+Math.floor(n/20);items.push({title:'Collision book '+n,kind:'book',source:'humble',purchaseKey:purchase,providerItemId:purchase+':product:p'+n,sourceBundle:'Bundle '+Math.floor(n/20),entitlement:'direct-download'});}await chrome.storage.local.set({humbleProfileLabel:'Personal',libraryItems:items});return true;`);
 await pair(call);await navigate('gl');await waitForHumble(evaluate,call,3000);
 // GL-held purchases that HB lacks, so the manual GL -> HB import below has real work to do.
 await evaluate(`const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),d=await S.getDatabase(),p=Object.values(d.providerProfiles).find(p=>p.provider==='humble'),items=[];for(let n=0;n<2500;n++)items.push(M.normalizeProviderItem({provider:'humble',profileId:p.profileId,providerItemId:'glonly_'+n+':product:x'+n,title:'GL-held book '+n,mediaType:'book',ownership:'owned',metadata:{source:'humble-purchase-library',entitlement:'direct-download',purchaseId:'glonly_'+n,sourceBundle:'GL bundle'}},undefined,{profileKeySpace:p.keySpace}));await S.mergeProviderItems('humble',items,{profileLabel:p.nickname});return true;`);
 const glState=(await call('gl','state','humble')).accounts.find(a=>a.label==='Personal'),hbBefore=await (async()=>{await navigate('hb');return evaluate(`const s=await chrome.storage.local.get({libraryItems:[]});return s.libraryItems.length;`);})();
 // Start a manual GL -> HB import and, at the same moment, an automatic sync.
 await navigate('hb');
 // The import runs in HB's worker; the page only starts it. GL then starts its own sync at once.
 const race={manual:{ok:true},auto:{}};
 await evaluate(`const accounts=(await chrome.runtime.sendMessage({type:'GH_PURCHASE_ACTION',action:'state',provider:'humble'})).accounts;chrome.runtime.sendMessage({type:'GH_PURCHASE_ACTION',action:'import',provider:'humble',peerId:${JSON.stringify(installed.gl.id)},accountRef:${JSON.stringify(glState.accountRef)},confirmed:true,target:{accountRef:accounts[0].accountRef}}).catch(()=>{});return true;`);
 await navigate('gl');const auto=await call('gl','syncNow','humble');race.auto={ok:auto.ok,error:auto.error??null};
 await navigate('hb');for(let n=0;n<600;n++){if(await evaluate(`return (await chrome.storage.local.get({libraryItems:[]})).libraryItems.length;`)===hbBefore+2500)break;await new Promise(r=>setTimeout(r,100));}
 await navigate('gl');let st;for(let n=0;n<300;n++){st=(await call('gl','syncState','humble')).state;if(!st?.pending||st.status==='attention')break;await new Promise(r=>setTimeout(r,100));}
 measurements.push({collision:{race,statusAfter:st?.status,errorCode:st?.errorCode??null}});
 await navigate('hb');const hb=await evaluate(`const s=await chrome.storage.local.get({libraryItems:[]}),ids=s.libraryItems.flatMap(i=>(i.provenance?.length?i.provenance:[i]).map(p=>p.providerItemId));return {items:s.libraryItems.length,unique:new Set(ids).size,ids:ids.length};`);
 assert.equal(hb.items,hbBefore+2500,'the manual import completed in full');assert.equal(hb.unique,hb.ids,'no duplicate purchase records in HB');
 await navigate('gl');const gl=await evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase(),rows=Object.values(d.providerItems).filter(i=>i.provider==='humble');return {rows:rows.length,unique:new Set(rows.map(i=>i.providerItemId)).size};`);
 assert.equal(gl.rows,5500);assert.equal(gl.unique,gl.rows,'no duplicate purchase records in GL');
 // Recovery: Retry (Advanced) or a later sync brings the relationship back without data changes.
 if(st?.status==='attention'){await navigate('hb');const retry=await call('hb','syncRetry','humble');assert.equal(retry.ok,true,retry.error);await navigate('gl');await call('gl','syncNow','humble');}
 await navigate('gl');st=await waitSynced(call);
 const after=await evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();return Object.values(d.providerItems).filter(i=>i.provider==='humble').length;`);
 await navigate('hb');const hbAfter=await evaluate(`const s=await chrome.storage.local.get({libraryItems:[]});return s.libraryItems.length;`);
 assert.deepEqual([after,hbAfter],[5500,hbBefore+2500],'recovery adds and removes nothing');
 // Phase 2, the documented case: GL's own automatic sync meets GL's import lock, held by a large manual
 // import into a second GL account. A one-item HB change gives the automatic sync work to do.
 await navigate('hb');
 await evaluate(`const s=await chrome.storage.local.get({libraryItems:[]});s.libraryItems.push({title:'Collision late book',kind:'book',source:'humble',purchaseKey:'late',providerItemId:'late:product:l',sourceBundle:'Late',entitlement:'direct-download'});await chrome.storage.local.set({libraryItems:s.libraryItems});return true;`);
 const hbAccount=(await call('hb','state','humble')).accounts[0].accountRef;
 const hbNow=await evaluate(`return (await chrome.storage.local.get({libraryItems:[]})).libraryItems.length;`);
 await navigate('gl');const activeId=await evaluate(`const S=await import('./src/lib/storage.js');return (await S.getDatabase()).providers.humble.activeProfileId;`);
 const second=await evaluate(`const send=a=>chrome.runtime.sendMessage({type:'GH_PURCHASE_ACTION',...a});const manual=send({action:'import',provider:'humble',peerId:${JSON.stringify(installed.hb.id)},accountRef:${JSON.stringify(hbAccount)},confirmed:true,target:{newLabel:'Second',expectedActiveId:${JSON.stringify(activeId)}}});
  const auto=await send({action:'syncNow',provider:'humble'});const m=await manual;return {manual:{ok:m.ok,added:m.added??null,error:m.error??null},auto:{ok:auto.ok,error:auto.error??null}};`);
 let st2;for(let n=0;n<300;n++){st2=(await call('gl','syncState','humble')).state;if(!st2?.pending||st2.status==='attention')break;await new Promise(r=>setTimeout(r,100));}
 const counts=async()=>evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase(),rows=Object.values(d.providerItems).filter(i=>i.provider==='humble'),by={};for(const r of rows){const label=d.providerProfiles[r.profileId].nickname;by[label]=(by[label]??0)+1;}return {by,unique:new Set(rows.map(i=>i.id)).size,rows:rows.length};`);
 const during=await counts();measurements.push({collisionPhase2:{second,status:st2?.status,errorCode:st2?.errorCode??null,during}});
 assert.equal(second.manual.ok,true,second.manual.error);assert.equal(during.unique,during.rows,'no duplicate GL records');
 assert.equal(during.by.Second,hbNow,'the manual import into the second account completed in full');
 if(st2?.status==='attention'){await navigate('hb');const retry=await call('hb','syncRetry','humble');assert.equal(retry.ok,true,retry.error);await navigate('gl');await call('gl','syncNow','humble');}
 await navigate('gl');await waitSynced(call);const recovered=await counts();
 assert.equal(recovered.by.Personal,5501,'after recovery the late purchase arrives exactly once');assert.equal(recovered.by.Second,hbNow);assert.equal(recovered.unique,recovered.rows);
 checks.push('documented case: '+(st2?.status==='attention'?'GL automatic sync stopped with Needs attention ('+String(st2.errorCode)+') while a manual import held the lock; Retry recovered':'automatic sync was not stopped this time')+'; no purchase lost or duplicated');
 checks.push('manual import colliding with automatic sync: manual import completes, no purchase lost or duplicated in HB or GL, '+(race.auto.error?'automatic sync deferred ("'+String(race.auto.error).slice(0,60)+'") and completed later':'automatic sync was not affected this time'));
}
