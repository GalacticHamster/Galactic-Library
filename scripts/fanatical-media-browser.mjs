// Disposable packaged GL+FAN check: a single saved Fanatical account whose
// records use FAN-only media types still pairs automatically. Synthetic data.
import assert from 'node:assert/strict';
const key='fanaticalLibraryItems',item=(n,mediaType,extra={})=>({title:'Synthetic FAN '+n,mediaType,source:'fanatical',sourceItemId:'synthetic_product_'+n,bundle:{sourceItemId:'synthetic_bundle',title:'Synthetic bundle'},purchaseOrigins:[{purchaseRef:'c'.repeat(64),bundle:{sourceItemId:'synthetic_bundle',title:'Synthetic bundle'},purchaseDate:'2026-11-01',quantity:1}],...extra}),
 seeded=[item(1,'book'),item(2,'comic',{manualMediaType:'comic',automaticMediaType:'book'}),item(3,'unclassified'),item(4,'video'),item(5,'game',{title:'Synthetic\u0008control'})];
// Seed each side before the harness links FAN to GL, as an existing user would have.
export async function seedFanaticalMedia(role,evaluate){
 if(role==='gl')return evaluate(`const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),P=await import('./src/lib/provider-profiles.js'),d=M.createEmptyDatabase(),p=P.newProviderProfile('fanatical');d.providerProfiles[p.profileId]=p;d.providers.fanatical={activeProfileId:p.profileId,profileLabel:''};const i=M.normalizeProviderItem({provider:'fanatical',profileId:p.profileId,providerItemId:'synthetic_gl_product',title:'Synthetic GL saved book',mediaType:'book',ownership:'owned',metadata:{source:'fanatical-order-history',bundleId:'synthetic_gl_bundle',bundleTitle:'GL bundle'}},undefined,{profileKeySpace:p.keySpace});d.providerItems[i.id]=i;d.canonicalItems=M.rebuildCanonicalItems(d.providerItems);await S.restoreDatabase(d);return true;`);
 return evaluate(`await chrome.storage.local.set({${key}:${JSON.stringify(seeded)},fanaticalProfileLabel:''});return true;`);
}
export async function fanaticalMediaChecks({navigate,evaluate,call,checks}){
 const provider='fanatical';
 const settled=async(expected,label)=>{
  let s;for(let n=0;n<400;n++){s=await call('gl','syncState',provider);if(s.state?.confirmed&&s.state.remoteConfirmed&&s.state.status==='synced'&&!s.state.pending&&(expected===undefined||s.accounts.find(a=>a.stableId===s.state.localId)?.count===expected))return s;await new Promise(r=>setTimeout(r,50));}
  const report=(await call('gl','syncDiagnostics',provider)).report;
  throw Error(label+' did not pair and synchronize: '+JSON.stringify({state:s?.state&&{status:s.state.status,errorCode:s.state.errorCode},availability:s?.availability,discoveryError:s?.discoveryError?.code,report:report&&{localAccountPresent:report.localAccountPresent,remoteAccountPresent:report.remoteAccountPresent,verifiedPeerConfirmation:report.verifiedPeerConfirmation,discoveryFailure:report.discoveryFailure,recoveryAction:report.recoveryAction}}));
 };
 await navigate('gl');
 const first=await settled(3,'single-account automatic pairing');
 assert.equal(first.accounts.length,1);assert.equal(first.discoveryError,null);
 const report=(await call('gl','syncDiagnostics',provider)).report;
 for(const field of ['pairingAvailable','automaticSharing','localAccountPresent','remoteAccountPresent','verifiedPeerConfirmation','localPurchasePermission','remotePurchasePermission'])assert.equal(report[field],true,field);
 assert.equal(report.localAccountCount,1);assert.equal(report.remoteAccountCount,1);assert.equal(report.discoveryFailure,null);assert.equal(report.recoveryAction,'sync');assert(report.lastSuccess);
 const titles=await evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();return Object.values(d.providerItems).filter(i=>i.provider==='fanatical').map(i=>i.title+'|'+i.mediaType).sort();`);
 assert.deepEqual(titles,['Synthetic FAN 1|book','Synthetic FAN 2|book','Synthetic GL saved book|book']);
 checks.push('one saved account on each side pairs automatically when FAN records include comic, unclassified, video and malformed entries; connection report is verified');
 await navigate('fan');
 const fanItems=await evaluate(`return (await chrome.storage.local.get('${key}'))['${key}'];`);
 const kinds=Object.fromEntries(fanItems.map(i=>[i.sourceItemId,[i.mediaType,i.manualMediaType??null]]));
 assert.equal(fanItems.length,6);assert.equal(Object.keys(kinds).length,6,'no duplicated purchases');
 assert.deepEqual(kinds,{...Object.fromEntries(seeded.map(i=>[i.sourceItemId,[i.mediaType,i.manualMediaType??null]])),synthetic_gl_product:['book',null]},'FAN media types and overrides unchanged');
 const mapped=(await call('fan','syncState',provider)).state;assert.equal(mapped.confirmed,true);assert.equal(mapped.remoteConfirmed,true);
 await navigate('gl');
 const before=await evaluate(`const S=await import('./src/lib/storage.js');return JSON.stringify(await S.getDatabase());`);
 for(let n=0;n<2;n++){const r=await call('gl','syncNow',provider);assert.equal(r.ok,true,r.error);}
 assert.equal(await evaluate(`const S=await import('./src/lib/storage.js');return JSON.stringify(await S.getDatabase());`),before,'repeated sync rewrote GL data');
 checks.push('repeated synchronization leaves GL data byte-identical and FAN-only media types stay local');
 await navigate('fan');
 assert.equal((await call('fan','syncSetSharing',provider,{enabled:false})).ok,true);
 await evaluate(`const k='${key}',rows=(await chrome.storage.local.get(k))[k];rows.push(${JSON.stringify(item(6,'book',{title:'Synthetic FAN after opt-out'}))});await chrome.storage.local.set({[k]:rows});return true;`);
 await new Promise(r=>setTimeout(r,1500));
 await navigate('gl');
 const optOut=(await call('gl','syncDiagnostics',provider)).report;assert.equal(optOut.failureCode,'sharing-disabled');assert.equal(optOut.recoveryAction,'enable-sharing-in-companion');
 assert.equal(await evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();return Object.values(d.providerItems).some(i=>i.title==='Synthetic FAN after opt-out');`),false,'opt-out shared a purchase');
 checks.push('a companion opt-out stops sharing and is reported as sharing-disabled');
 await navigate('fan');
 assert.equal((await call('fan','syncSetSharing',provider,{enabled:true})).ok,true);
 await navigate('gl');
 const resumed=await settled(4,'reconnection after opt-out');assert.equal(resumed.state.localId,first.state.localId);assert.equal(resumed.state.remoteId,first.state.remoteId);
 checks.push('re-enabling sharing reconnects the same single accounts without manual mapping');
}
