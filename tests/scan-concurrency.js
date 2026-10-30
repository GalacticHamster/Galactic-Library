import assert from 'node:assert/strict';
import '../shared/purchase-sync.js';
import {validateDatabase,rebuildCanonicalItems} from '../src/lib/models.js';
import {completionBaseline,completionWriter,admitCompletion,finishCompletion} from './observation-completion-fixture.js';
import {providerSyncValue as value,providerSyncSnapshot,fingerprint} from './provider-sync-fixture.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';

async function baseline(...providers){
 const db=await completionBaseline(providers[0]);
 for(const provider of providers.slice(1)){
  const other=await completionBaseline(provider);
  for(const key of ['providers','providerProfiles','providerItems'])Object.assign(db[key],other[key]);
 }
 db.canonicalItems=rebuildCanonicalItems(db.providerItems,db.manualMatchDecisions,db.canonicalItems,db.editionSeparations);
 return validateDatabase(db);
}
const essentials=db=>Object.values(db.providerItems).map(x=>[x.id,x.recordRef,x.profileId,x.ownership,x.acquiredAt,x.metadata]).sort((a,b)=>a[0].localeCompare(b[0]));
async function consistent(h){const db=await h.writer.getDatabase();assert.deepEqual(validateDatabase(db),db);assert.equal(new Set(Object.values(db.providerItems).map(x=>x.recordRef)).size,Object.keys(db.providerItems).length);return db;}

export const scanConcurrencyTests=[
 ...[false,true].map(reverse=>['scan concurrency: Kindle Full and first Audible admission commit in '+(reverse?'reverse':'admission')+' order',async()=>{
  const base=await baseline('kindle'),h=completionWriter(base),k=await admitCompletion(h,'kindle'),a=await admitCompletion(h,'audible');
  const tasks=[()=>finishCompletion(h,'kindle',k,[value('kindle')]),()=>finishCompletion(h,'audible',a,[value('audible')])];
  if(reverse)tasks.reverse();for(const task of tasks)await task();
  const db=await consistent(h);assert.equal(Object.keys(db.providerItems).length,2);assert.deepEqual(essentials({...db,providerItems:Object.fromEntries(Object.entries(db.providerItems).filter(([,x])=>x.provider==='kindle'))}),essentials(base));
 }]),
 ['scan concurrency: independent existing Full scans preserve changed records and shared indexes',async()=>{
  const h=completionWriter(await baseline('kindle','audible')),k=await admitCompletion(h,'kindle'),a=await admitCompletion(h,'audible');
  await Promise.all([finishCompletion(h,'kindle',k,[{...value('kindle'),title:'Updated Kindle edition',acquiredAt:'2020-02-03'}]),finishCompletion(h,'audible',a,[{...value('audible'),title:'Updated Audible edition',acquiredAt:'2021-04-05'}])]);
  const db=await consistent(h);assert.deepEqual(Object.values(db.providerItems).map(x=>x.title).sort(),['Updated Audible edition','Updated Kindle edition']);assert(Object.values(db.providerItems).every(x=>x.acquiredAt));
 }],
 ['scan concurrency: Kindle Full survives Amazon Games Quick catalog change and writer restart',async()=>{
  let h=completionWriter(await baseline('kindle','amazon-games'));const k=await admitCompletion(h,'kindle'),g=await admitCompletion(h,'amazon-games','incremental');
  await finishCompletion(h,'amazon-games',g,[{...value('amazon-games'),metadata:{...value('amazon-games').metadata,delivery:'Amazon Games library'}}],'incremental');
  h=completionWriter(null,{stored:h.stored});await finishCompletion(h,'kindle',k,[value('kindle')]);assert.equal(Object.keys((await consistent(h)).providerItems).length,2);
 }],
 ['scan concurrency: newer same-provider Quick supersedes older Full',async()=>{
  const h=completionWriter(await baseline('kindle')),old=await admitCompletion(h,'kindle');const fresh=await admitCompletion(h,'kindle','incremental');
  await finishCompletion(h,'kindle',fresh,[{...value('kindle'),ownership:'subscription'}],'incremental');const before=essentials(await consistent(h));
  await assert.rejects(finishCompletion(h,'kindle',old,[value('kindle')]),/superseded|changed|completed/);assert.deepEqual(essentials(await consistent(h)),before);
 }],
 ['scan concurrency: changed account registry rejects its scan but not another provider',async()=>{
  const h=completionWriter(await baseline('kindle','audible')),k=await admitCompletion(h,'kindle'),a=await admitCompletion(h,'audible');const id=(await h.writer.getDatabase()).providers.kindle.activeProfileId;
  await h.writer.renameProviderProfile(id,'Renamed account');await assert.rejects(finishCompletion(h,'kindle',k,[value('kindle')]),/changed|superseded/);
  await finishCompletion(h,'audible',a,[value('audible')]);await consistent(h);
 }],
 ...['restore','clear'].map(operation=>['scan concurrency: '+operation+' invalidates every pending scan even for equal restored records',async()=>{
  const base=await baseline('kindle','audible'),h=completionWriter(base),k=await admitCompletion(h,'kindle');
  if(operation==='restore')await h.writer.restoreDatabase(base);else await h.writer.clearDatabase();
  await assert.rejects(finishCompletion(h,'kindle',k,[value('kindle')]),/superseded|changed/);const db=await consistent(h);assert.equal(Object.keys(db.providerItems).length,operation==='restore'?2:0);
 }]),
 ['scan concurrency: same-provider source edit stays stale across a later independent write',async()=>{
  const h=completionWriter(await baseline('kindle','audible')),k=await admitCompletion(h,'kindle');
  const item=Object.values((await h.writer.getDatabase()).providerItems).find(x=>x.provider==='kindle');await h.writer.mergeProviderItems('kindle',[{...value('kindle'),metadata:{...value('kindle').metadata,authors:['Changed source author']}}],{profileId:item.profileId,profileLabel:'Personal',syncMode:'incremental'});
  const a=await admitCompletion(h,'audible');await finishCompletion(h,'audible',a,[{...value('audible'),title:'Independent change'}]);
  await assert.rejects(finishCompletion(h,'kindle',k,[value('kindle')]),/changed|superseded/);await consistent(h);
 }],
 ['scan concurrency: incomplete Full remains rejected after independent commit without losing history',async()=>{
  const h=completionWriter(await baseline('kindle','audible')),k=await admitCompletion(h,'kindle'),a=await admitCompletion(h,'audible');
  await finishCompletion(h,'audible',a,[{...value('audible'),title:'Committed independent record'}]);const before=essentials(await consistent(h));
  await assert.rejects(h.writer.commitProviderScan('kindle',[],{syncMode:'full'},null,k.scanToken,1),/snapshot|complete/i);assert.deepEqual(essentials(await consistent(h)),before);
 }],
 ['scan concurrency: shared policy changes are retained when independent scans rebuild the catalog',async()=>{
  const h=completionWriter(await baseline('kindle','audible')),k=await admitCompletion(h,'kindle'),a=await admitCompletion(h,'audible');
  await h.writer.saveOwnershipPolicy({providers:{kobo:true}});
  await finishCompletion(h,'kindle',k,[value('kindle')]);await finishCompletion(h,'audible',a,[value('audible')]);assert.equal((await consistent(h)).ownershipPolicy.providers.kobo,true);
 }],
 ['scan concurrency: selected account switch rejects only the affected provider lease',async()=>{
  const db=await baseline('kindle','audible'),other=newProviderProfile('kindle','Other');db.providerProfiles[other.profileId]=other;
  const h=completionWriter(validateDatabase(db)),k=await admitCompletion(h,'kindle'),a=await admitCompletion(h,'audible');
  await h.writer.selectProviderProfile(other.profileId,db.providers.kindle.activeProfileId,true);
  await assert.rejects(finishCompletion(h,'kindle',k,[value('kindle')]),/superseded|changed/);
  await finishCompletion(h,'audible',a,[value('audible')]);assert.equal((await consistent(h)).providers.kindle.activeProfileId,other.profileId);
 }],
 ['scan concurrency: rebasing does not bypass source account fingerprint checks',async()=>{
  const h=completionWriter(await baseline('xbox','kindle')),x=await admitCompletion(h,'xbox'),k=await admitCompletion(h,'kindle');
  await finishCompletion(h,'kindle',k,[{...value('kindle'),title:'Independent new title'}]);
  await assert.rejects(h.writer.commitProviderScan('xbox',[value('xbox')],{syncMode:'full'},providerSyncSnapshot('xbox',[value('xbox')]),x.scanToken,1,false,'b'.repeat(64)),/account changed/);
  await finishCompletion(h,'xbox',x,[value('xbox')]);assert.equal(Object.values((await consistent(h)).providerProfiles).find(p=>p.provider==='xbox').sourceAccountFingerprint,fingerprint);
 }],
 ['scan concurrency: acquisition provenance and retained history survive both independent commits',async()=>{
  const current={...value('kindle'),acquiredAt:'2020-02-03',metadata:{...value('kindle').metadata,authors:['Synthetic author']}},missing={...current,providerItemId:'historical-record',title:'Previously present'};
  const h=completionWriter(await completionBaseline('kindle',[current,missing])),first=await admitCompletion(h,'kindle');await finishCompletion(h,'kindle',first,[current]);
  const before=await consistent(h),history=structuredClone(before.providerHistory),saved=essentials(before);assert.equal(Object.keys(history).length,1);
  const k=await admitCompletion(h,'kindle'),a=await admitCompletion(h,'audible');await finishCompletion(h,'audible',a,[value('audible')]);await finishCompletion(h,'kindle',k,[current]);
  const after=await consistent(h);assert.deepEqual(after.providerHistory,history);assert.deepEqual(essentials({...after,providerItems:Object.fromEntries(Object.entries(after.providerItems).filter(([,x])=>x.provider==='kindle'))}),saved);
 }],
 ['scan concurrency: shared manual decisions and aliases are freshly merged rather than overwritten',async()=>{
  const h=completionWriter(await baseline('kindle','humble')),k=await admitCompletion(h,'kindle'),u=await admitCompletion(h,'humble');const rows=Object.values((await h.writer.getDatabase()).providerItems);
  await h.writer.saveManualMatchDecision({itemIds:rows.map(x=>x.id)},'different');await h.writer.saveTitleAliases(rows[0].recordRef,['Independent alternate name']);
  const before=await consistent(h);await finishCompletion(h,'kindle',k,[value('kindle')]);await finishCompletion(h,'humble',u,[value('humble')]);const after=await consistent(h);
  assert.deepEqual(after.manualMatchDecisions,before.manualMatchDecisions);assert.deepEqual(after.titleAliases,before.titleAliases);
 }],
 ['scan concurrency: network failure after an independent commit retains all committed evidence',async()=>{
  const h=completionWriter(await baseline('kindle','audible')),k=await admitCompletion(h,'kindle'),a=await admitCompletion(h,'audible');
  await finishCompletion(h,'audible',a,[{...value('audible'),acquiredAt:'2021-02-03',title:'Successfully committed'}]);const before=essentials(await consistent(h));
  assert.equal(await h.writer.failProviderScan('kindle',k.scanToken,1,{code:'network'}),true);
  assert.deepEqual(essentials(await consistent(h)),before);
 }],
 ...['before-catalog','after-catalog','after-publication'].map(point=>['scan concurrency recovery: '+point+' binds rebased leases to the recovered catalog',async()=>{
  const h=completionWriter(await baseline('kindle')),k=await admitCompletion(h,'kindle');let armed=true;
  const broken=completionWriter(null,{stored:h.stored,beforeSet:updates=>{if(armed&&point==='before-catalog'&&updates.galacticLibraryDatabase){armed=false;throw Error('Injected interruption');}},afterSet:updates=>{if(armed&&(point==='after-catalog'&&updates.galacticLibraryDatabase||point==='after-publication'&&updates.galacticLibraryObservations?.kind==='active')){armed=false;throw Error('Injected interruption');}}});
  await assert.rejects(admitCompletion(broken,'audible'),/Injected/);const recovered=completionWriter(null,{stored:h.stored});
  await finishCompletion(recovered,'kindle',k,[value('kindle')]);assert.equal(Object.values((await consistent(recovered)).providerItems).filter(x=>x.provider==='kindle').length,1);
 }])
];
