// Disposable packaged GL+companion checks: one saved account whose records include
// media types or malformed entries the sharing format cannot carry still pairs
// automatically, shares only what it can represent and never rewrites saved data.
import assert from 'node:assert/strict';
const companions={
 fan:{provider:'fanatical',key:'fanaticalLibraryItems',labelKey:'fanaticalProfileLabel',idField:'sourceItemId',
  item:(n,kind,extra={})=>({title:'Synthetic FAN '+n,mediaType:kind,source:'fanatical',sourceItemId:'synthetic_product_'+n,bundle:{sourceItemId:'synthetic_bundle',title:'Synthetic bundle'},purchaseOrigins:[{purchaseRef:'c'.repeat(64),bundle:{sourceItemId:'synthetic_bundle',title:'Synthetic bundle'},purchaseDate:'2026-11-01',quantity:1}],...extra}),
  kind:i=>[i.mediaType,i.manualMediaType??null],
  glItem:{providerItemId:'synthetic_gl_product',title:'Synthetic GL saved book',metadata:{source:'fanatical-order-history',bundleId:'synthetic_gl_bundle',bundleTitle:'GL bundle'}},
  shared:[1,2],withheld:4,label:'comic, unclassified, video and malformed entries'},
 hb:{provider:'humble',key:'libraryItems',labelKey:'humbleProfileLabel',idField:'providerItemId',
  item:(n,kind,extra={})=>({title:'Synthetic HB '+n,kind,source:'humble',providerItemId:`synthetic_purchase_${n}:product:synthetic_${n}`,purchaseKey:'synthetic_purchase_'+n,sourceBundle:'Synthetic bundle',entitlement:'direct-download',purchasedAt:'2026-11-01T12:00:00Z',...extra}),
  kind:i=>[i.kind,i.manualKind??null],
  glItem:{providerItemId:'synthetic_gl:product:synthetic_gl',title:'Synthetic GL saved book',metadata:{source:'humble-purchase-library',purchaseId:'synthetic_gl',entitlement:'direct-download',sourceBundle:'GL bundle'}},
  shared:[1,2,7],withheld:3,label:'comic, unclassified, malformed titles and dates, and an off-site link'}
};
const seeds={
 fan:c=>[c.item(1,'book'),c.item(2,'comic',{manualMediaType:'comic',automaticMediaType:'book'}),c.item(3,'unclassified'),c.item(4,'video'),c.item(5,'game',{title:'Synthetic\u0008control'})],
 hb:c=>[c.item(1,'book'),c.item(2,'comic'),c.item(3,'unclassified'),c.item(4,'book',{title:'Synthetic\u0008control'}),c.item(5,'book',{title:'x'.repeat(501)}),c.item(6,'book',{purchasedAt:'not a date'}),c.item(7,'book',{detailUrl:'https://example.invalid/product'})]
};
// Seed each side before the harness links the companion to GL, as an existing user would have.
export async function seedCompanionRecords(role,companion,evaluate){
 const c=companions[companion];
 if(role==='gl')return evaluate(`const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),P=await import('./src/lib/provider-profiles.js'),d=M.createEmptyDatabase(),p=P.newProviderProfile('${c.provider}');d.providerProfiles[p.profileId]=p;d.providers['${c.provider}']={activeProfileId:p.profileId,profileLabel:''};const i=M.normalizeProviderItem({provider:'${c.provider}',profileId:p.profileId,...${JSON.stringify(c.glItem)},mediaType:'book',ownership:'owned'},undefined,{profileKeySpace:p.keySpace});d.providerItems[i.id]=i;d.canonicalItems=M.rebuildCanonicalItems(d.providerItems);await S.restoreDatabase(d);return true;`);
 return evaluate(`await chrome.storage.local.set({${c.key}:${JSON.stringify(seeds[companion](c))},${c.labelKey}:''});return true;`);
}
export async function companionRecordChecks({companion,navigate,evaluate,call,checks}){
 const c=companions[companion],provider=c.provider,seeded=seeds[companion](c),name=companion.toUpperCase();
 const settled=async(expected,label)=>{
  let s;for(let n=0;n<400;n++){s=await call('gl','syncState',provider);if(s.state?.confirmed&&s.state.remoteConfirmed&&s.state.status==='synced'&&!s.state.pending&&(expected===undefined||s.accounts.find(a=>a.stableId===s.state.localId)?.count===expected))return s;await new Promise(r=>setTimeout(r,50));}
  const report=(await call('gl','syncDiagnostics',provider)).report;
  throw Error(label+' did not pair and synchronize: '+JSON.stringify({state:s?.state&&{status:s.state.status,errorCode:s.state.errorCode},availability:s?.availability,discoveryError:s?.discoveryError?.code,report:report&&{localAccountPresent:report.localAccountPresent,remoteAccountPresent:report.remoteAccountPresent,verifiedPeerConfirmation:report.verifiedPeerConfirmation,discoveryFailure:report.discoveryFailure,recoveryAction:report.recoveryAction}}));
 };
 await navigate('gl');
 const first=await settled(c.shared.length+1,'single-account automatic pairing');
 assert.equal(first.accounts.length,1);assert.equal(first.discoveryError,null);
 const report=(await call('gl','syncDiagnostics',provider)).report;
 for(const field of ['pairingAvailable','automaticSharing','localAccountPresent','remoteAccountPresent','verifiedPeerConfirmation','localPurchasePermission','remotePurchasePermission'])assert.equal(report[field],true,field);
 assert.equal(report.localAccountCount,1);assert.equal(report.remoteAccountCount,1);assert.equal(report.discoveryFailure,null);assert.equal(report.recoveryAction,'sync');assert(report.lastSuccess);
 const titles=await evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();return Object.values(d.providerItems).filter(i=>i.provider==='${provider}').map(i=>i.title+'|'+i.mediaType).sort();`);
 assert.deepEqual(titles,[...c.shared.map(n=>`Synthetic ${name} ${n}|book`),'Synthetic GL saved book|book'].sort());
 checks.push(`one saved ${name} account pairs automatically when its records include ${c.label}; connection report is verified`);
 await navigate(companion);
 const saved=await evaluate(`return (await chrome.storage.local.get('${c.key}'))['${c.key}'];`);
 const kinds=Object.fromEntries(saved.map(i=>[i[c.idField],c.kind(i)]));
 assert.equal(saved.length,seeded.length+1);assert.equal(Object.keys(kinds).length,seeded.length+1,'no duplicated purchases');
 assert.deepEqual(kinds,{...Object.fromEntries(seeded.map(i=>[i[c.idField],c.kind(i)])),[c.glItem.providerItemId]:['book',null]},`${name} media types and overrides unchanged`);
 for(const bad of seeded.slice(c.withheld===3?3:4))assert(saved.some(i=>i.title===bad.title),'malformed record still saved');
 const mapped=(await call(companion,'syncState',provider)).state;assert.equal(mapped.confirmed,true);assert.equal(mapped.remoteConfirmed,true);
 await navigate('gl');
 const before=await evaluate(`const S=await import('./src/lib/storage.js');return JSON.stringify(await S.getDatabase());`);
 for(let n=0;n<2;n++){const r=await call('gl','syncNow',provider);assert.equal(r.ok,true,r.error);}
 assert.equal(await evaluate(`const S=await import('./src/lib/storage.js');return JSON.stringify(await S.getDatabase());`),before,'repeated sync rewrote GL data');
 checks.push(`repeated synchronization leaves GL data byte-identical and unshareable ${name} records stay saved locally`);
 await navigate(companion);
 assert.equal((await call(companion,'syncSetSharing',provider,{enabled:false})).ok,true);
 await evaluate(`const k='${c.key}',rows=(await chrome.storage.local.get(k))[k];rows.push(${JSON.stringify(c.item(9,'book',{title:`Synthetic ${name} after opt-out`}))});await chrome.storage.local.set({[k]:rows});return true;`);
 await new Promise(r=>setTimeout(r,1500));
 await navigate('gl');
 const optOut=(await call('gl','syncDiagnostics',provider)).report;assert.equal(optOut.failureCode,'sharing-disabled');assert.equal(optOut.recoveryAction,'enable-sharing-in-companion');
 assert.equal(await evaluate(`const S=await import('./src/lib/storage.js'),d=await S.getDatabase();return Object.values(d.providerItems).some(i=>i.title==='Synthetic ${name} after opt-out');`),false,'opt-out shared a purchase');
 checks.push('a companion opt-out stops sharing and is reported as sharing-disabled');
 await navigate(companion);
 assert.equal((await call(companion,'syncSetSharing',provider,{enabled:true})).ok,true);
 await navigate('gl');
 const resumed=await settled(c.shared.length+2,'reconnection after opt-out');assert.equal(resumed.state.localId,first.state.localId);assert.equal(resumed.state.remoteId,first.state.remoteId);
 checks.push('re-enabling sharing reconnects the same single accounts without manual mapping');
}
