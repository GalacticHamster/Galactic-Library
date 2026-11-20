// Disposable packaged GL+HB checks: Humble Library media corrections reach GL through automatic sharing
// for the same purchase or Library entitlement, without duplicating purchases or overriding GL decisions.
import assert from 'node:assert/strict';
const ACCOUNT='11111111-1111-4111-8111-111111111111',uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const item=(n,title,kind)=>({title,kind,source:'humble',providerItemId:`synthetic_purchase_${n}:product:synthetic_${n}`,purchaseKey:'synthetic_purchase_'+n,sourceBundle:'Synthetic bundle',entitlement:'direct-download',purchasedAt:'2026-11-01T12:00:00Z'});
const imported=[item(1,'Synthetic Media Saga','book'),item(2,'Synthetic Media Twin','book'),item(3,'Synthetic Media Twin','book')];
const libraryRefs=[1,2].map(n=>({namespace:'download_drm_free',nativeId:uuid(n)}));
const steamItem={providerItemId:'620',title:'Synthetic Media Twin',mediaType:'game',metadata:{}};

export async function seedHumbleMedia(role,evaluate){
 if(role==='gl')return evaluate(`const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),P=await import('./src/lib/provider-profiles.js'),d=M.createEmptyDatabase();
  const h=P.newProviderProfile('humble'),s=P.newProviderProfile('steam','Steam');d.providerProfiles[h.profileId]=h;d.providerProfiles[s.profileId]=s;d.providers.humble={activeProfileId:h.profileId,profileLabel:''};d.providers.steam={activeProfileId:s.profileId,profileLabel:'Steam'};
  const gl=M.normalizeProviderItem({provider:'humble',profileId:h.profileId,providerItemId:'synthetic_gl:product:synthetic_gl',title:'Synthetic GL saved book',mediaType:'book',ownership:'owned',metadata:{source:'humble-purchase-library',purchaseId:'synthetic_gl',entitlement:'direct-download',sourceBundle:'GL bundle'}},undefined,{profileKeySpace:h.keySpace});
  const st=M.normalizeProviderItem({provider:'steam',profileId:s.profileId,...${JSON.stringify(steamItem)},ownership:'owned'},undefined,{profileKeySpace:s.keySpace});
  d.providerItems[gl.id]=gl;d.providerItems[st.id]=st;d.canonicalItems=M.rebuildCanonicalItems(d.providerItems);await S.restoreDatabase(d);return true;`);
 // Library-only entitlements with unknown media, as a Humble Library sync records them.
 return evaluate(`const E=globalThis.HumbleLibraryEntitlements,scope={principalId:'principal-A',userId:'hub-A'};
  const obs=(n,parent)=>E.observation({scope,nativeId:'${uuid(0).slice(0,-12)}'+String(n).padStart(12,'0'),namespace:'download_drm_free',title:'Synthetic Library Only',parentId:'${uuid(0).slice(0,-12)}'+String(parent).padStart(12,'0'),parentTitle:'Synthetic Mixed Bundle',source:'authenticated-humble-library',observedAt:'2026-01-01T00:00:00.000Z',
   eligibility:{expired:false,preOrdered:false,outOfStock:false,redeemable:true,directRedeem:false,parentPreOrder:false,revoked:null,temporaryAccess:null,giftStatus:'unassigned',parentType:'bundle',integration:'none',redemptionGroups:'none',unavailableBefore:{state:'none',value:null},unavailableAfter:{state:'none',value:null},redeemedAt:{state:'none',value:null}}});
  await chrome.storage.local.set({humbleAccountId:'${ACCOUNT}',humbleProfileLabel:'',libraryItems:${JSON.stringify(imported)},mediaTypeOverrides:{},
   libraryEntitlements:{version:1,scopes:[{...scope,localAccountId:'${ACCOUNT}',profileLabel:'',observations:[obs(1,1001),obs(2,1002)],lastScan:null,sync:null}]}});return true;`);
}

export async function humbleMediaChecks({navigate,evaluate,call,restart,checks,measurements}){
 const glRecords=async()=>{await navigate('gl');return evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();return Object.values(d.providerItems).filter(i=>i.provider==='humble').map(i=>({id:i.id,providerItemId:i.providerItemId,title:i.title,mediaType:i.mediaType,recordRef:i.recordRef})).sort((a,b)=>a.providerItemId<b.providerItemId?-1:1);`);};
 const media=rows=>Object.fromEntries(rows.map(r=>[r.providerItemId,r.mediaType]));
 const lib=n=>'humble-library:download_drm_free:'+uuid(n),imp=n=>`synthetic_purchase_${n}:product:synthetic_${n}`;
 const converge=async(expected,label)=>{const start=Date.now();let rows;
  while(Date.now()-start<45000){rows=await glRecords();const m=media(rows);if(Object.entries(expected).every(([id,type])=>m[id]===type)){measurements.push({check:label,automaticMs:Date.now()-start});return rows;}await new Promise(r=>setTimeout(r,250));}
  const s=await call('gl','syncState','humble'),report=(await call('gl','syncDiagnostics','humble')).report;
  await navigate('hb');const h=(await call('hb','syncState','humble')).state;
  throw Error(label+' did not reach GL automatically: '+JSON.stringify({media:media(rows),hb:h&&{status:h.status,errorCode:h.errorCode,pending:h.pending,confirmed:h.confirmed,remoteConfirmed:h.remoteConfirmed,epoch:h.epoch},state:s.state&&{status:s.state.status,errorCode:s.state.errorCode,pending:s.state.pending,confirmed:s.state.confirmed,remoteConfirmed:s.state.remoteConfirmed},report:report&&{failureCode:report.failureCode,recoveryAction:report.recoveryAction,discoveryFailure:report.discoveryFailure}}));};
 const hb=async(operation,args)=>{await navigate('hb');const r=await evaluate(`return chrome.runtime.sendMessage({type:'HCL_STORE',operation:${JSON.stringify(operation)},args:${JSON.stringify(args)}});`);assert.equal(r?.ok,true,operation+': '+r?.error);};
 const glSnapshot=async()=>{await navigate('gl');return evaluate(`const S=await import('./src/lib/storage.js');return JSON.stringify(await S.getDatabase());`);};
 const steam=async()=>{await navigate('gl');return evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();return JSON.stringify(Object.values(d.providerItems).filter(i=>i.provider==='steam'));`);};
 const steamBefore=await steam();

 let rows=await converge({[imp(1)]:'book',[imp(2)]:'book',[imp(3)]:'book','synthetic_gl:product:synthetic_gl':'book'},'single-account automatic pairing');
 assert.equal(rows.length,4,'Library-only titles with unknown media are withheld');
 const count=rows.length;
 // Let the initial two-way sync finish on both sides before the first correction.
 const settled=async()=>{for(let n=0;n<160;n++){await navigate('gl');const g=(await call('gl','syncState','humble')).state;await navigate('hb');const h=(await call('hb','syncState','humble')).state;
  if(g?.status==='synced'&&!g.pending&&h?.status==='synced'&&!h.pending)return;await new Promise(r=>setTimeout(r,250));}throw Error('The initial sync did not settle on both sides.');};
 await settled();
 checks.push('HB and GL pair automatically; imported purchases are shared and unknown Library media is withheld');

 await hb('setNativeMediaOverride',[libraryRefs,'book']);rows=await converge({[lib(1)]:'book',[lib(2)]:'book'},'unknown -> book');
 assert.equal(rows.length,count+2);const libraryRefsGl=rows.filter(r=>r.providerItemId.startsWith('humble-library:')).map(r=>r.recordRef).sort();
 await hb('setNativeMediaOverride',[libraryRefs,'game']);rows=await converge({[lib(1)]:'game',[lib(2)]:'game'},'book -> game');
 assert.equal(rows.length,count+2,'a correction adds no purchases');assert.deepEqual(rows.filter(r=>r.providerItemId.startsWith('humble-library:')).map(r=>r.recordRef).sort(),libraryRefsGl,'record identities are kept');
 checks.push('Library-only title: unknown -> book -> game reaches GL for both purchases with the same records');

 for(const kind of ['game','book','game'])await (async()=>{await hb('setMediaOverride',[imported[0],kind]);rows=await converge({[imp(1)]:kind},'imported purchase -> '+kind);})();
 await hb('setMediaOverride',[imported[0],'comic']);rows=await converge({[imp(1)]:'book'},'game -> comic');
 assert.equal(rows.length,count+2);
 checks.push('imported purchase: book -> game -> book -> game -> comic converges in GL (comics are GL books)');

 await hb('setMediaOverride',[imported[1],'game']);rows=await converge({[imp(2)]:'game'},'one of two same-title purchases');
 assert.equal(media(rows)[imp(3)],'book','the other purchase of the same title is unchanged');
 assert.equal(await steam(),steamBefore,'Steam evidence for the same title is unchanged');
 checks.push('only the corrected purchase changes; a same-title Humble purchase and Steam evidence are untouched');

 // GL decisions: an ownership correction survives; a contents review keeps GL's classification.
 await navigate('gl');
 const saga=rows.find(r=>r.providerItemId===imp(1)),twin=rows.find(r=>r.providerItemId===imp(3));
 await evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase(),r=Object.values(d.providerItems).find(i=>i.recordRef==='${saga.recordRef}');
  await S.saveOwnershipCorrections([{recordRef:r.recordRef,provider:r.provider,profileId:r.profileId,expectedReviewRef:null}],{ownership:'returned'});
  await S.saveContentReview('${twin.id}',{entries:[{series:'Synthetic Media Twin',unitType:'issue',number:'1'}],statement:'Collects Synthetic Media Twin #1',verifiedAt:'2026-10-01'});return true;`);
 await hb('setMediaOverride',[imported[0],'game']);rows=await converge({[imp(1)]:'game'},'media change after a GL ownership correction');
 await navigate('gl');
 const owned=await evaluate(`const S=await import('./src/lib/storage.js'),O=await import('./src/lib/ownership.js'),d=await S.getDatabase(),r=Object.values(d.providerItems).find(i=>i.recordRef==='${saga.recordRef}');return [r.mediaType,d.ownershipReviews[r.recordRef]?.ownership,O.effectiveOwnershipRecord(r,d).ownership];`);
 assert.deepEqual(owned,['game','returned','returned'],'the GL ownership correction survives the media change');
 await hb('setMediaOverride',[imported[2],'game']);
 await navigate('gl');const synced=await call('gl','syncNow','humble');assert.equal(synced.ok,true,synced.error);
 rows=await glRecords();assert.equal(media(rows)[imp(3)],'book','a GL contents review keeps the GL classification');
 assert.equal((await call('gl','syncState','humble')).state.status,'synced','a kept classification is not a sync failure');
 checks.push('a GL ownership correction survives Humble media changes; a GL contents review keeps GL\'s classification');

 // Repeat sync, extension restart and backup restore.
 const settledDb=await glSnapshot();
 for(let n=0;n<2;n++){await navigate('gl');const r=await call('gl','syncNow','humble');assert.equal(r.ok,true,r.error);}
 assert.equal(await glSnapshot(),settledDb,'repeated sync rewrote GL data');
 await restart('gl');await restart('hb');
 await navigate('gl');const after=await call('gl','syncNow','humble');assert.equal(after.ok,true,after.error);
 assert.equal(await glSnapshot(),settledDb,'sync after restart rewrote GL data');
 await hb('setMediaOverride',[imported[0],'book']);rows=await converge({[imp(1)]:'book'},'correction after restart');
 checks.push('repeat sync is byte-identical; after an extension restart corrections still apply');
 await navigate('gl');
 await evaluate(`const S=await import('./src/lib/storage.js'),b=S.createBackup(await S.getDatabase());await S.restoreDatabase(S.parseBackup(JSON.parse(JSON.stringify(b))));return true;`);
 // A restore re-verifies the saved connection with Humble Library; it recovers without user action.
 const restoredAt=Date.now();let recovered;for(let n=0;n<120&&!recovered;n++){const st=(await call('gl','syncState','humble')).state;if(st?.status==='synced'&&st.confirmed&&st.remoteConfirmed&&!st.pending)recovered=st;else await new Promise(r=>setTimeout(r,250));}
 assert(recovered,'the connection did not recover automatically after a backup restore');measurements.push({check:'restore recovery',automaticMs:Date.now()-restoredAt});
 await hb('setMediaOverride',[imported[0],'game']);rows=await converge({[imp(1)]:'game'},'correction after backup restore');
 assert.equal(rows.length,count+2,'no purchase added or removed across all corrections');
 // GL shares its own saved Humble purchase back; Humble Library's purchases are never echoed as copies.
 await navigate('hb');const hbItems=await evaluate(`return (await chrome.storage.local.get('libraryItems')).libraryItems.map(i=>i.providerItemId);`);
 assert.deepEqual([...hbItems].sort(),[...imported.map(i=>i.providerItemId),'synthetic_gl:product:synthetic_gl'].sort(),'Humble Library gained no duplicated purchases');
 checks.push('after a GL backup restore, sync continues and corrections apply; purchase counts are stable on both sides');
}
