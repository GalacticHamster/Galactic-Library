import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({console});
for(const path of ['src/providers/provider-snapshot.js','src/providers/console-library.js'])vm.runInContext(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),context);
const C=context.GalacticConsoleLibrary,plain=value=>JSON.parse(JSON.stringify(value));
const ps=(offset=0,isLast=true,rows=[{productId:'product-a',titleId:'title-a',conceptId:123,name:'Synthetic Game',platform:'PS4',membership:'NONE',isActive:true}])=>({data:{purchasedTitlesRetrieve:{games:rows,pageInfo:{offset,size:rows.length,isLast}}}});
const cards=(rows=[{id:'card-a',applicationId:'application-a',applicationName:'Synthetic Game',apparentPlatform:'NX',ownerNaId:'account-a',userNaId:'account-a',hasReleasedApplication:true}],offset=0,total=rows.length)=>({data:{account:{vgc:{vgcViewsV2:{views:rows,offsetInfo:{offset,total}}}}}});
export const consoleLibraryTests=[
 ['Console projections require stable IDs, preserve PlayStation platform/product distinctions and never turn activity dates into purchases',()=>{
   const a=C.parsePlayStationPage(ps()).items[0];assert.equal(a.ownership,'owned');assert.equal(a.acquiredAt,null);assert.equal(a.metadata.conceptId,'123');
   const original=ps().data.purchasedTitlesRetrieve.games[0],b=C.parsePlayStationPage(ps(0,true,[{...original,platform:'PS5'}])).items[0],c=C.parsePlayStationPage(ps(0,true,[{...original,productId:'different-edition'}])).items[0];
   assert.notEqual(a.providerItemId,b.providerItemId);assert.notEqual(a.providerItemId,c.providerItemId);
   assert.throws(()=>C.parsePlayStationPage(ps(0,true,[{...original,productId:null}])));
   assert.throws(()=>C.parsePlayStationPage(ps(0,true,[{...original,platform:'PS3'}])));
   assert(!JSON.stringify(a).includes('account-a'));
 }],
 ['Console projections keep PlayStation subscription, trial, inactive and unrecognized licenses out of Owned',()=>{
   const source=ps().data.purchasedTitlesRetrieve.games[0];
   for(const [changes,expected]of [[{membership:'PS_PLUS'},'subscription'],[{subscriptionService:'EA_PLAY'},'subscription'],[{isTrial:true},'unknown'],[{isActive:false},'unknown'],[{membership:null},'unknown'],[{subscriptionService:{}},'unknown']])assert.equal(C.parsePlayStationPage(ps(0,true,[{...source,...changes}])).items[0].ownership,expected);
 }],
 ['Nintendo requires an independently established actor, separates owned/borrowed/lent cards and does not retain account/device/credential values',()=>{
   const source=cards().data.account.vgc.vgcViewsV2.views[0];
   const owned=C.parseNintendoPage(cards([{...source,idToken:'private-token',insertedNsDeviceId:'private-device',isLending:true,userNaId:'borrower-b',lendingExpireDatetime:'2026-11-01T00:00:00Z'}]),{accountNaId:'account-a'}).items[0];assert.equal(owned.ownership,'owned');assert.equal(owned.metadata.isLending,true);assert.equal(owned.metadata.lendingExpiresAt,'2026-11-01T00:00:00.000Z');
   const borrowed=C.parseNintendoPage(cards([{...source,ownerNaId:'another-owner'}]),{accountNaId:'account-a'}).items[0];assert.equal(borrowed.ownership,'borrowed');
   assert.throws(()=>C.parseNintendoPage(cards(),{}));assert.throws(()=>C.parseNintendoPage(cards([{...source,ownerNaId:'other',userNaId:'other'}]),{accountNaId:'account-a'}));
   assert(!JSON.stringify(owned).includes('private'));assert(!JSON.stringify(owned).includes('account-a'));assert(!JSON.stringify(owned).includes('borrower-b'));
 }],
 ['Nintendo released flags do not invent base-game ownership or separate unnamed DLC products',()=>{
   const source=cards().data.account.vgc.vgcViewsV2.views[0];
   const unknown=C.parseNintendoPage(cards([{...source,hasReleasedApplication:false,hasReleasedAddOnContents:true}]),{accountNaId:'account-a'}).items[0];assert.equal(unknown.ownership,'unknown');assert.equal(unknown.mediaType,'game');
   const addOn=C.parseNintendoPage(cards([{...source,hasApplication:false,hasReleasedApplication:false,hasReleasedAddOnContents:true}]),{accountNaId:'account-a'}).items[0];assert.equal(addOn.mediaType,'game');assert.equal(addOn.ownership,'unknown');
   const combined=C.parseNintendoPage(cards([{...source,hasReleasedAddOnContents:true}]),{accountNaId:'account-a'});assert.equal(combined.items.length,1);assert.equal(combined.items[0].mediaType,'game');assert.equal(combined.items[0].metadata.hasReleasedAddOnContents,true);
 }],
 ['Console page validation rejects errors, ambiguous envelopes, duplicated rows, malformed identities and stalled pagination',()=>{
   assert.throws(()=>C.parsePlayStationPage({errors:[{message:'private-error'}]}));assert.throws(()=>C.parsePlayStationPage(ps(0,false,[])));
   assert.throws(()=>C.parseNintendoPage(cards([],0,5),{accountNaId:'account-a'}));
   const twice=cards();twice.data.account.vgc.vgcViews=twice.data.account.vgc.vgcViewsV2;assert.throws(()=>C.parseNintendoPage(twice,{accountNaId:'account-a'}));
   const repeated=cards().data.account.vgc.vgcViewsV2.views[0];assert.throws(()=>C.parseNintendoPage(cards([repeated,repeated]),{accountNaId:'account-a'}));
   const old=cards();old.data.account.vgc.vgcViews=old.data.account.vgc.vgcViewsV2;delete old.data.account.vgc.vgcViewsV2;assert.equal(C.parseNintendoPage(old,{accountNaId:'account-a'}).items.length,1);
 }],
 ['Console collector validates every page and returns one complete existing-format snapshot without writes',async()=>{
   const steps=[],result=await C.collectLibrary({provider:'playstation',accountIdentity:'account-a',currentAccountIdentity:async()=> 'account-a',readPage:async({offset})=>{steps.push(offset);return ps(offset,offset===1,[{...ps().data.purchasedTitlesRetrieve.games[0],productId:'product-'+offset}]);}});
   assert.deepEqual(steps,[0,1]);assert.equal(result.items.length,2);assert.equal(result.snapshot.complete,true);assert.equal(result.snapshot.scopes[0].pagesRead,2);
   const rows=Array.from({length:115},(_,i)=>({...cards().data.account.vgc.vgcViewsV2.views[0],id:'card-'+i,applicationId:'app-'+i}));
   const n=await C.collectLibrary({provider:'nintendo',accountIdentity:'account-a',currentAccountIdentity:async()=> 'account-a',readPage:async()=>cards(rows)});assert.equal(n.items.length,115);assert.equal(n.snapshot.scopes[0].expectedCount,115);
   assert.deepEqual(plain(n.items[0].platform),['Switch']);
 }],
 ['Console collector fails before commit on account switching, partial failure, changing totals, duplicate pages, bounds and cancellation',async()=>{
   let checks=0;
   await assert.rejects(()=>C.collectLibrary({provider:'nintendo',accountIdentity:'account-a',currentAccountIdentity:async()=>++checks===1?'account-a':'account-b',readPage:async()=>cards()}),/account changed/);
   await assert.rejects(()=>C.collectLibrary({provider:'playstation',accountIdentity:'account-a',currentAccountIdentity:async()=> 'account-a',readPage:async({offset})=>offset?{errors:[{message:'private-error'}]}:ps(0,false)}),/incomplete/);
   await assert.rejects(()=>C.collectLibrary({provider:'nintendo',accountIdentity:'account-a',currentAccountIdentity:async()=> 'account-a',readPage:async({offset})=>cards([{...cards().data.account.vgc.vgcViewsV2.views[0],id:'card-'+offset}],offset,offset?3:2)}),/total changed/);
   await assert.rejects(()=>C.collectLibrary({provider:'playstation',accountIdentity:'account-a',currentAccountIdentity:async()=> 'account-a',readPage:async({offset})=>ps(offset,false)}),/repeated an item/);
   await assert.rejects(()=>C.collectLibrary({provider:'playstation',accountIdentity:'account-a',currentAccountIdentity:async()=> 'account-a',readPage:async()=>ps(0,false),maxPages:1}),/last page/);
   await assert.rejects(()=>C.collectLibrary({provider:'playstation',accountIdentity:'account-a',currentAccountIdentity:async()=> 'account-a',readPage:async()=>{throw Error('Must not request');},signal:{throwIfAborted(){throw Error('Cancelled');}}}),/Cancelled/);
 }]
];
