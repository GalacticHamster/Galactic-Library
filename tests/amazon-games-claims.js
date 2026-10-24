import assert from 'node:assert/strict';
import '../src/providers/amazon-games-identity.js';
import {reconcileAmazonGames,prepareAmazonGamesImport} from '../src/lib/amazon-games-reconciliation.js';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {acquisitionHistory} from '../src/ui/library-acquisitions.js';
import {formatDate} from '../src/ui/formatters.js';
import {itemPresentation} from '../src/ui/item-presentation.js';
const I=globalThis.GalacticAmazonGamesIdentity;
const raw=(id='temporary-1',collectedOn=null)=>({provider:'amazon-games',providerItemId:id,title:'Synthetic Deluxe Game',mediaType:'game',ownership:'claimed',
 metadata:{source:'amazon-games-collection',delivery:'Amazon Games library',imageUrl:'https://images.example.test/product.jpg',...(collectedOn?{collectedOn}:{})}});
function library(count=3){const db=createEmptyDatabase(),profile=newProviderProfile('amazon-games','Synthetic');db.providerProfiles[profile.profileId]=profile;db.providers['amazon-games']={activeProfileId:profile.profileId};
 for(let n=0;n<count;n++){const row=normalizeProviderItem({...raw('transient-'+n),profileId:profile.profileId},'2026-01-01',{profileKeySpace:profile.keySpace});db.providerItems[row.id]=row;}
 return validateDatabase(db);
}
function writer(db){const data={galacticLibraryDatabase:structuredClone(db)};return createStorageWriter({get:async defaults=>structuredClone({...defaults,...data}),set:async patch=>Object.assign(data,structuredClone(patch))});}
export const amazonGamesClaimTests=[
 ['Amazon Games recovery CLI is read-only by default and requires a confirmed exclusive new output',async()=>{
  const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,resolve,sep}=await import('node:path'),{fileURLToPath}=await import('node:url'),{execFileSync}=await import('node:child_process');
  const directory=await mkdtemp(join(tmpdir(),'gl-amazon-repair-')),input=join(directory,'input.json'),output=join(directory,'candidate.json');
  try{const original=JSON.stringify(createBackup(library()));await writeFile(input,original);const run=args=>execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/repair-amazon-games.mjs',import.meta.url)),...args],{encoding:'utf8',stdio:'pipe'});
    assert.equal(JSON.parse(run([input])).imported,false);assert.throws(()=>run([input,'--output',output]));
    run([input,'--output',output,'--confirm']);assert.equal(Object.keys(parseBackup(JSON.parse(await readFile(output,'utf8'))).providerItems).length,1);
    assert.throws(()=>run([input,'--output',output,'--confirm']));assert.throws(()=>run([input,'--output',input,'--confirm']));assert.equal(await readFile(input,'utf8'),original);
  }finally{const target=resolve(directory),root=resolve(tmpdir());if(target.startsWith(root+sep)&&target.slice(root.length+1).startsWith('gl-amazon-repair-'))await rm(target,{recursive:true,force:true});}
 }],
 ['Amazon Games calendar dates preserve source day and reject ambiguous or invalid formats',async()=>{
  for(const text of ['Jul 29, 2025','July 29,2025','July 29, 2025','29 July 2025','2025-07-29'])assert.equal(I.collectedDate(text),'2025-07-29');
  for(const text of ['02/03/2025','Feb 29, 2025','Apr 31, 2025','garbage','Jantastic 1, 2025'])assert.equal(I.collectedDate(text),null);
  assert.equal(I.collectedDate('Feb 29, 2024'),'2024-02-29');assert.equal(I.collectedFromText('Collected on\nJul 29, 2025\nSent to\nAmazon Games library'),'2025-07-29');
  assert.equal(formatDate('2025-07-29',{locale:'en-US',time:false}),'Jul 29, 2025');
  const {execFileSync}=await import('node:child_process');
  const probe=`import ${JSON.stringify(new URL('../src/providers/amazon-games-identity.js',import.meta.url).href)}; import {formatDate} from ${JSON.stringify(new URL('../src/ui/formatters.js',import.meta.url).href)}; console.log(formatDate(globalThis.GalacticAmazonGamesIdentity.collectedFromText('Collected on July 29, 2025'),{locale:'en-US',time:false}));`;
  for(const TZ of ['Pacific/Honolulu','Pacific/Auckland'])assert.equal(execFileSync(process.execPath,['--input-type=module','-e',probe],{encoding:'utf8',env:{...process.env,TZ},stdio:'pipe'}).trim(),'Jul 29, 2025');
 }],
 ['Amazon Games evidence identity ignores transient IDs and order, but preserves dates, editions, platforms and destinations',async()=>{
  const first=await I.consolidate([raw('dom-a','2025-01-01'),raw('dom-b','2025-01-01')]);assert.equal(first.length,1);
  assert.deepEqual(first,await I.consolidate([raw('different-dom-b','2025-01-01'),raw('different-dom-a','2025-01-01')]));
  const base=raw('dom','2025-01-01'),edition={...base,metadata:{...base.metadata,edition:'Other edition'}},platform={...base,platform:['Other platform']},destination={...base,metadata:{...base.metadata,deliveryDestination:'Other store'}};
  assert.equal((await I.consolidate([base,raw('dom','2025-02-01'),edition,platform,destination])).length,5);
  assert.equal((await I.consolidate([raw('a'),raw('b')])).length,1);assert.equal((await I.identify(raw())).metadata.claimBasis,'undated-evidence');
  const cover={...base,metadata:{...base.metadata,imageUrl:'https://m.media-amazon.com/images/I/SyntheticAsset._SX256_._FMwebp_.jpg'}};
  assert.equal((await I.identify(cover)).providerItemId,(await I.identify({...cover,metadata:{...cover.metadata,imageUrl:'https://m.media-amazon.com/images/I/SyntheticAsset._SX512_.jpg'}})).providerItemId);
 }],
 ['Amazon Games exact legacy observations reconcile with retained originals, stable canonical identity and repeat-safe backup restore',async()=>{
  const db=library(),profile=Object.keys(db.providerProfiles)[0],canonicalIds=Object.keys(db.canonicalItems),originals=Object.values(db.providerItems).map(row=>structuredClone(row));
  const report=await reconcileAmazonGames(db,profile);assert.equal(report.after,1);assert.equal(report.archivedObservations,2);assert.equal(report.ambiguousGroups,1);
  assert.deepEqual(Object.keys(db.canonicalItems),canonicalIds);assert.equal(Object.values(db.providerItems)[0].metadata.observationIds.length,3);
  for(const entry of Object.values(db.providerHistory))assert.deepEqual(entry.item,originals.find(row=>row.recordRef===entry.item.recordRef));
  const roundTrip=parseBackup(createBackup(db)),before=JSON.stringify(roundTrip);await reconcileAmazonGames(roundTrip,profile);assert.equal(JSON.stringify(roundTrip),before);
  assert.equal(acquisitionHistory(Object.values(roundTrip.providerItems),roundTrip).entries.length,1);
  const broken=structuredClone(roundTrip);Object.values(broken.providerHistory)[0].duplicateOf=crypto.randomUUID();assert.throws(()=>validateDatabase(broken),/observation association/);
 }],
 ['Amazon Games recovery preserves a single authoritative correction and refuses conflicting curated references',async()=>{
  const db=library(),w=writer(db),rows=Object.values(db.providerItems),profile=rows[0].profileId;
  await w.saveOwnershipCorrections([{recordRef:rows[1].recordRef,provider:'amazon-games',profileId:profile,expectedReviewRef:null}],{ownership:'returned'});
  const current=await w.getDatabase();await reconcileAmazonGames(current,profile);assert.equal(Object.values(current.providerItems)[0].recordRef,rows[1].recordRef);assert(current.ownershipReviews[rows[1].recordRef]);validateDatabase(current);
  const w2=writer(db);await w2.saveOwnershipCorrections(rows.slice(0,2).map(row=>({recordRef:row.recordRef,provider:'amazon-games',profileId:profile,expectedReviewRef:null})),{ownership:'returned'});
  const ambiguous=await w2.getDatabase(),report=await reconcileAmazonGames(ambiguous,profile);assert.equal(report.protectedRecords,3);assert.equal(Object.keys(ambiguous.providerItems).length,3);assert.equal(Object.keys(ambiguous.providerHistory).length,0);
  const protectedBefore=JSON.stringify(await w2.getDatabase());await assert.rejects(w2.mergeProviderItems('amazon-games',[raw('new','2025-01-01')],{profileId:profile}),/saved correction/);assert.equal(JSON.stringify(await w2.getDatabase()),protectedBefore);
  const specific=library(1),specificRow=Object.values(specific.providerItems)[0];specificRow.metadata.publisher='Saved publisher';const w3=writer(specific);
  await w3.saveOwnershipCorrections([{recordRef:specificRow.recordRef,provider:'amazon-games',profileId:specificRow.profileId,expectedReviewRef:null}],{ownership:'returned'});
  await assert.rejects(w3.mergeProviderItems('amazon-games',[raw('sparse','2025-01-01')],{profileId:specificRow.profileId}),/saved correction/);assert.equal(Object.keys((await w3.getDatabase()).providerItems).length,1);
 }],
 ['Amazon Games missing legacy dates only associate with one compatible observed claim',async()=>{
  const one=library(1),profile=Object.keys(one.providerProfiles)[0],ref=Object.values(one.providerItems)[0].recordRef;
  await prepareAmazonGamesImport(one,profile,[raw('new','2025-01-01')]);const upgraded=Object.values(one.providerItems)[0];assert.equal(upgraded.recordRef,ref);assert.equal(upgraded.acquiredAt,'2025-01-01T00:00:00.000Z');
  const multiple=library(1),p=Object.keys(multiple.providerProfiles)[0];await prepareAmazonGamesImport(multiple,p,[raw('a','2025-01-01'),raw('b','2025-02-01')]);assert.equal(Object.values(multiple.providerItems)[0].acquiredAt,null);
 }],
 ['Amazon Games persistence is idempotent across full/recent observations, missing dates and account scopes',async()=>{
  const w=writer(createEmptyDatabase()),items=[raw('dom-a','2025-01-01'),raw('dom-b','2025-01-01')];
  await w.mergeProviderItems('amazon-games',items,{profileLabel:'Personal'});let db=await w.getDatabase();const row=Object.values(db.providerItems)[0],profile=row.profileId,canonical=Object.keys(db.canonicalItems);
  await w.mergeProviderItems('amazon-games',[raw('new-dom','2025-01-01')],{profileId:profile});await w.mergeProviderItems('amazon-games',[raw('other-dom')],{profileId:profile});db=await w.getDatabase();
  assert.equal(Object.keys(db.providerItems).length,1);assert.equal(Object.keys(db.providerHistory).length,0);assert.equal(Object.values(db.providerItems)[0].recordRef,row.recordRef);assert.equal(Object.values(db.providerItems)[0].acquiredAt,'2025-01-01T00:00:00.000Z');assert.deepEqual(Object.keys(db.canonicalItems),canonical);
  assert.equal(itemPresentation(Object.values(db.canonicalItems)[0],Object.values(db.providerItems),db).records[0].acquiredAt,'2025-01-01');
  await w.mergeProviderItems('amazon-games',[raw('new-dom','2025-01-01')],{profileLabel:'Other account'});db=await w.getDatabase();assert.equal(Object.keys(db.providerItems).length,2);assert.equal(new Set(Object.values(db.providerItems).map(item=>item.profileId)).size,2);
  const before=JSON.stringify(db);await assert.rejects(w.mergeProviderItems('amazon-games',[raw('')],{profileId:profile}),/providerItemId/);assert.equal(JSON.stringify(await w.getDatabase()),before);
  const legacy=library(),empty=writer(legacy);await empty.mergeProviderItems('amazon-games',[],{profileId:Object.keys(legacy.providerProfiles)[0]});assert.deepEqual((await empty.getDatabase()).providerItems,legacy.providerItems);
 }],
 ['Amazon Games ambiguous metadata and independently separated catalog products are preserved',async()=>{
  const db=library(2),rows=Object.values(db.providerItems),profile=rows[0].profileId;rows[1].metadata.delivery='Amazon Games library | Additional saved evidence';const report=await reconcileAmazonGames(db,profile);assert.equal(report.protectedRecords,2);assert.equal(report.after,2);assert.equal(Object.keys(db.providerHistory).length,0);
  const w=writer(library(2)),saved=await w.getDatabase(),members=Object.values(saved.providerItems);await w.saveManualMatchDecision({itemIds:members.map(item=>item.id)},'different');
  const separated=await w.getDatabase(),before=structuredClone(separated);const protectedReport=await reconcileAmazonGames(separated,members[0].profileId);assert.equal(protectedReport.protectedRecords,2);assert.deepEqual(separated.providerItems,before.providerItems);assert.deepEqual(separated.manualMatchDecisions,before.manualMatchDecisions);
 }]
];
