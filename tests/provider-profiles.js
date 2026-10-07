import {KINDLE_REFRESH_KEY,KINDLE_REFRESH_ARCHIVES_KEY,bindKindleRefresh} from '../src/lib/kindle-contents-refresh.js';
import {kindleContentsPlan} from '../src/lib/kindle-contents.js';
import {validateFandangoState} from '../src/background/import-state.js';
import {libraryReminders} from '../src/lib/reminders.js';
import assert from 'node:assert/strict';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {memory} from './final-gl-features.js';
import {snapshotFixture} from './storage.js';
import {activeRecord} from './provider-profile-fixture.js';
import {matchItems} from '../src/lib/matcher.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';

const book=(native='B000000001')=>({provider:'kindle',providerItemId:native,title:'Synthetic Collection',mediaType:'book',ownership:'owned',metadata:{detailUrl:`https://www.amazon.com/dp/${native}`}});
const review={entries:[{series:'Synthetic',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'}],statement:'Collects Synthetic #1',source:'manual-review',sourceUrl:'',verifiedAt:'2026-10-01T00:00:00.000Z'};
const full=(writer,profile,items)=>writer.replaceProviderItems('kindle',items,{profileLabel:profile,fullSyncAt:'2026-10-01'},snapshotFixture('kindle',items));
export const providerProfileTests=[
 ['profile migration preserves current baseline, trusted decisions, refs and backup round trips',()=>{
   const d=createEmptyDatabase();d.schemaVersion=12;delete d.providerProfiles;delete d.unresolvedProfileState;
   const item=normalizeProviderItem(book());d.providerItems[item.id]=item;d.providers.kindle={profileLabel:'A',fullSyncAt:'2026-10-01'};d.contentReviews[item.id]=review;
   const before=matchItems(d.providerItems,[{title:item.title,mediaType:'book'}],d)[0];
   const after=validateDatabase(d),profile=after.providerProfiles[after.providers.kindle.activeProfileId];
   assert.equal(profile.nickname,'A');assert.equal(profile.state.fullSyncAt,'2026-10-01T00:00:00.000Z');assert.equal(after.providerItems[item.id].recordRef,item.recordRef);assert.deepEqual(after.contentReviews[item.id],review);
   assert.deepEqual(matchItems(after.providerItems,[{title:item.title,mediaType:'book'}],after)[0],before);
   assert.deepEqual(parseBackup(createBackup(after)),after);assert.deepEqual(validateDatabase(after),after);
 }],
 ['migration promotes remembered accounts but quarantines ambiguous native-keyed confirmations',()=>{
   const d=createEmptyDatabase();d.schemaVersion=12;delete d.providerProfiles;
   const a=normalizeProviderItem(book()),b=normalizeProviderItem(book()),other=normalizeProviderItem({...book('B000000002'),title:'Other'});
   d.providerItems[b.id]=b;d.providerItems[other.id]=other;d.providers.kindle={profileLabel:'B',fullSyncAt:'2026-10-01'};
   d.providerHistory[a.recordRef]={item:a,profileLabel:'A',reason:'profile-switch',missingSince:'2026-10-01'};
   d.contentReviews[a.id]=review;d.manualMatchDecisions.x={itemIds:[a.id,other.id],decision:'same-work',updatedAt:'2026-10-01'};
   const sep=crypto.randomUUID();d.editionSeparations[sep]={itemId:a.id,otherItemIds:[other.id],updatedAt:'2026-10-01'};
   const result=validateDatabase(d);
   assert.equal(Object.keys(result.providerItems).length,3);assert.equal(Object.keys(result.providerProfiles).length,2);
   assert(!Object.values(result.providerProfiles).find(p=>p.nickname==='A').state.fullSyncAt);
   assert.equal(Object.keys(result.contentReviews).length,0);assert.equal(Object.keys(result.manualMatchDecisions).length,0);assert.equal(Object.keys(result.editionSeparations).length,0);
   assert(result.unresolvedProfileState.contentReviews[a.id]);assert(result.unresolvedProfileState.manualMatchDecisions.x);assert(result.unresolvedProfileState.editionSeparations[sep]);
   assert.deepEqual(validateDatabase(result),result);
 }],
 ['missing A product cannot donate contents or relationships to the same native product in B',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book(),book('B000000002')]);const a=activeRecord(d,'kindle','B000000001'),other=activeRecord(d,'kindle','B000000002');
   await writer.saveContentReview(a.id,review);await writer.saveManualMatchDecision({itemIds:[a.id,other.id]},'same-work');
   d=await writer.getDatabase();const sep=crypto.randomUUID();d.editionSeparations[sep]={itemId:a.id,otherItemIds:[other.id],updatedAt:'2026-10-01'};await writer.restoreDatabase(d);
   await full(writer,'A',[book('B000000002')]);d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');
   assert.notEqual(a.id,b.id);assert.notEqual(a.recordRef,b.recordRef);assert.notEqual(a.profileId,b.profileId);
   assert(d.contentReviews[a.id]);assert(!d.contentReviews[b.id]);assert(!Object.values(d.manualMatchDecisions).some(r=>r.itemIds.includes(b.id)));assert.equal(d.editionSeparations[sep].itemId,a.id);
   assert.equal(d.providerHistory[a.recordRef].reason,'missing-from-complete-scan');
   d=await full(writer,'A',[book(),book('B000000002')]);assert.equal(d.providerItems[a.id].recordRef,a.recordRef);assert(d.providerItems[b.id]);assert(d.contentReviews[a.id]);
 }],
 ['same native product coexists with independent access, canonical identity and enrichment',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book()]);const a=activeRecord(d,'kindle','B000000001');
   await writer.saveTitleAliases(a.recordRef,['Synthetic Alias']);
   d=await full(writer,'B',[{...book(),ownership:'borrowed'}]);const b=activeRecord(d,'kindle','B000000001');
   assert.equal(d.providerItems[a.id].ownership,'owned');assert.equal(b.ownership,'borrowed');assert(d.titleAliases[a.recordRef]);assert(!d.titleAliases[b.recordRef]);
   assert(Object.values(d.canonicalItems).some(c=>c.providerItemIds.includes(a.id)&&c.providerItemIds.includes(b.id)));
   assert.equal(matchItems(d.providerItems,[{title:a.title,mediaType:'book'}],d)[0].owned,true);
   assert.deepEqual(parseBackup(createBackup(d)),d);
 }],
 ['profile validation rejects foreign owners, duplicate namespaces and duplicate observations',async()=>{
   const {writer}=memory();const d=await full(writer,'A',[book()]);const item=activeRecord(d,'kindle','B000000001');
   const bad=structuredClone(d);bad.providerItems[item.id].profileId=crypto.randomUUID();assert.throws(()=>validateDatabase(bad),/unknown provider profile/);
   const duplicate=structuredClone(d);duplicate.providerItems.duplicate={...item};assert.throws(()=>validateDatabase(duplicate),/duplicate provider identities/);
   const history=structuredClone(d);history.providerHistory[item.recordRef]={item,profileLabel:'A',reason:'missing-from-complete-scan',missingSince:'2026-10-01'};assert.throws(()=>validateDatabase(history),/share a reference/);
 }]
 ];

providerProfileTests.push(
 ['remembered A/B baselines select offline, quick-update independently and reject stale authority',async()=>{
   const {writer,stored}=memory(),items=[book()];
   let scan=await writer.beginProviderScan('kindle','A','full',false,1);
   let d=await writer.commitProviderScan('kindle',items,{syncMode:'full',fullSyncAt:'2026-10-01'},snapshotFixture('kindle',items),scan.scanToken,1),a=activeRecord(d,'kindle','B000000001');
   scan=await writer.beginProviderScan('kindle','B','full',true,2);
   d=await writer.commitProviderScan('kindle',items,{syncMode:'full',fullSyncAt:'2026-10-02'},snapshotFixture('kindle',items),scan.scanToken,2);const b=activeRecord(d,'kindle','B000000001');
   const evidence=structuredClone(d.providerItems);
   await assert.rejects(writer.selectProviderProfile(a.profileId,b.profileId,false),/Confirm/);
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.deepEqual(d.providerItems,evidence);assert.equal(d.providers.kindle.fullSyncAt,'2026-10-01T00:00:00.000Z');
   scan=await writer.beginProviderScan('kindle','A','incremental',false,1);assert.equal(scan.forceFull,false);assert.equal(scan.profileId,a.profileId);
   d=await writer.commitProviderScan('kindle',[],{syncMode:'incremental',quickSyncAt:'2026-10-03'},null,scan.scanToken,1);assert(d.providerItems[a.id]&&d.providerItems[b.id]);
   const stale=await writer.beginProviderScan('kindle','A','incremental',false,1);
   d=await writer.selectProviderProfile(b.profileId,a.profileId,true);
   await assert.rejects(writer.commitProviderScan('kindle',items,{syncMode:'incremental'},null,stale.scanToken,1),/superseded/);
   assert.equal(await writer.failProviderScan('kindle',stale.scanToken,1,{code:'network'}),false);
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.equal(d.providers.kindle.quickSyncAt,'2026-10-03T00:00:00.000Z');assert.deepEqual(d.providerItems,evidence);
   assert.equal(Object.keys(stored.galacticLibraryProviderScans).length,0);
 }],
 ['profile rename preserves immutable identity, baseline, history and rich evidence',async()=>{
   const {writer}=memory();let d=await full(writer,'Personal',[book()]),a=activeRecord(d,'kindle','B000000001');
   await writer.saveContentReview(a.id,review);await writer.saveTitleAliases(a.recordRef,['Alias']);d=await full(writer,'B',[book()]);
   const before=structuredClone(d),b=activeRecord(d,'kindle','B000000001');d=await writer.renameProviderProfile(a.profileId,'Sean');
   assert.deepEqual(d.providerItems,before.providerItems);assert.deepEqual(d.contentReviews,before.contentReviews);assert.deepEqual(d.titleAliases,before.titleAliases);
   assert.equal(d.providerProfiles[a.profileId].state.fullSyncAt,before.providerProfiles[a.profileId].state.fullSyncAt);assert.equal(d.providerProfiles[a.profileId].nickname,'Sean');
   await assert.rejects(writer.renameProviderProfile(a.profileId,'B'),/already used/);
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.equal(d.providers.kindle.profileLabel,'Sean');const scan=await writer.beginProviderScan('kindle','Sean','incremental',false,1);assert.equal(scan.forceFull,false);
 }],
 ['full scan missing inference and difference counts are restricted to the targeted profile',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book(),book('B000000002')]),a=activeRecord(d,'kindle','B000000001');
   d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');d=await full(writer,'B',[]);
   assert(d.providerItems[a.id]);assert(!d.providerHistory[a.recordRef]);assert(d.providerHistory[b.recordRef]);assert.equal(d.providers.kindle.syncHealth.differences.missing,1);
   assert.equal(d.providerProfiles[a.profileId].state.recordCount,2);assert.equal(d.providerProfiles[b.profileId].state.recordCount,0);
 }],
 ['purchase IDs and order fingerprints survive A/B/A without combining skip authority',async()=>{
   const {writer}=memory();const fullProvider=async(provider,label,native,syncState)=>{const items=[{providerItemId:native,title:native}];return writer.replaceProviderItems(provider,items,{profileLabel:label,fullSyncAt:'2026-10-01',syncState},snapshotFixture(provider,items));};
   for(const provider of ['humble','fanatical']){
     const state=n=>provider==='humble'?{knownPurchaseIds:[`purchase-${n}`]}:{knownOrderFingerprints:[String(n).repeat(64)]};
     let d=await fullProvider(provider,'A','x',state(1)),a=d.providers[provider].activeProfileId;d=await fullProvider(provider,'B','x',state(2));const b=d.providers[provider].activeProfileId;
     d=await writer.selectProviderProfile(a,b,true);assert.deepEqual(d.providers[provider].syncState,state(1));
     const scan=await writer.beginProviderScan(provider,'A','incremental',false,1);assert.equal(scan.forceFull,false);
     d=await writer.selectProviderProfile(b,a,true);assert.deepEqual(d.providers[provider].syncState,state(2));
   }
 }]
);

const observation=target=>({itemId:target.id,recordRef:target.recordRef,queuePosition:target.queuePosition,sourceUrl:target.detailUrl,statement:'Collects Synthetic #1-2',availability:'statement-found',extractorVersion:5});
providerProfileTests.push(
 ['Kindle A/B jobs preserve exact independent queues and cursors; late leases cannot commit across selection',async()=>{
   const {writer,stored}=memory();let d=await full(writer,'A',[book(),book('B000000002')]),a=activeRecord(d,'kindle','B000000001');
   let plan=await writer.beginKindleContentsRefresh('start',1);
   await writer.commitKindleContentsRefresh([observation(plan.candidates[0])],plan.refresh.runRef,plan.refresh.leaseRef,1);
   await writer.finishKindleContentsRefresh(plan.refresh.runRef,plan.refresh.leaseRef,1,'paused');const frozen=structuredClone(stored[KINDLE_REFRESH_KEY]);
   d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');
   assert.deepEqual(stored[KINDLE_REFRESH_ARCHIVES_KEY][a.profileId],frozen);assert.equal((await writer.getKindleContentsRefresh()).checkpoint,null);
   const bp=await writer.beginKindleContentsRefresh('start',2);assert.equal(bp.eligible,1);assert.equal(bp.candidates[0].recordRef,b.recordRef);
   await writer.commitKindleContentsRefresh([observation(bp.candidates[0])],bp.refresh.runRef,bp.refresh.leaseRef,2);const bfrozen=structuredClone(stored[KINDLE_REFRESH_KEY]);
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.deepEqual(stored[KINDLE_REFRESH_KEY],frozen);assert.deepEqual(stored[KINDLE_REFRESH_ARCHIVES_KEY][b.profileId],bfrozen);
   const resumed=await writer.beginKindleContentsRefresh('resume',3);assert.equal(resumed.refresh.cursor,1);assert.equal(resumed.refresh.runRef,frozen.runRef);assert.equal(resumed.candidates[0].recordRef,frozen.queue[1].recordRef);
   await assert.rejects(writer.commitKindleContentsRefresh([observation(plan.candidates[1])],plan.refresh.runRef,plan.refresh.leaseRef,1),/stale/);
   await writer.renameProviderProfile(a.profileId,'Renamed A');assert.equal((await writer.getKindleContentsRefresh()).checkpoint.cursor,1);
   await writer.commitKindleContentsRefresh([observation(resumed.candidates[0])],resumed.refresh.runRef,resumed.refresh.leaseRef,3);
   assert.equal((await writer.getKindleContentsRefresh()).checkpoint.status,'completed');assert.deepEqual(stored[KINDLE_REFRESH_ARCHIVES_KEY][b.profileId],bfrozen);
 }],
 ['switching away interrupts active Kindle authority without discarding progress or reacquiring retained source',async()=>{
   const {writer,stored}=memory();let d=await full(writer,'A',[book(),book('B000000002')]),a=activeRecord(d,'kindle','B000000001');
   const p=await writer.beginKindleContentsRefresh('start',1);await writer.commitKindleContentsRefresh([observation(p.candidates[0])],p.refresh.runRef,p.refresh.leaseRef,1);
   const before=await writer.getDatabase();d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001'),saved=stored[KINDLE_REFRESH_ARCHIVES_KEY][a.profileId];
   assert.equal(saved.cursor,1);assert.equal(saved.status,'interrupted');assert.equal(saved.leaseRef,'');assert.equal(saved.tabId,null);
   await assert.rejects(writer.saveKindleComicContents([observation(p.candidates[1])]),/Invalid/);
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.deepEqual(d.providerItems[a.id],before.providerItems[a.id]);assert.deepEqual(d.kindleContentsObservations,before.kindleContentsObservations);
   const plan=kindleContentsPlan(d,'scan');assert(!plan.candidates.some(i=>i.recordRef===p.candidates[0].recordRef));assert(!plan.candidates.some(i=>i.recordRef===b.recordRef));
 }],
 ['legacy Kindle checkpoint binding uses record references and never assigns another account by native product',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book()]);const a=activeRecord(d,'kindle','B000000001'),p=await writer.beginKindleContentsRefresh('start',1);
   const legacy={...p.refresh,queue:p.candidates.map(({queuePosition,...e})=>e),counts:p.refresh.counts,tabId:1};delete legacy.total;delete legacy.profileId;
   d=await full(writer,'B',[book()]);const bound=bindKindleRefresh(legacy,d);assert.equal(bound.profileId,a.profileId);assert.equal(bound.queue[0].recordRef,a.recordRef);
   const other=activeRecord(d,'kindle','B000000001');assert.throws(()=>bindKindleRefresh({...legacy,queue:[...legacy.queue,{id:other.id,recordRef:other.recordRef,title:other.title,detailUrl:other.metadata.detailUrl}]},d),/ambiguous/);
 }],
 ['receipt proposals, companion feeds and Fandango contexts retain immutable account ownership',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book()]),a=activeRecord(d,'kindle','B000000001');
   await writer.importPurchaseEvidence([{provider:'kindle',title:a.title,asin:a.providerItemId,acquiredAt:'2026-10-01'}]);d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');
   d=await writer.refreshPurchaseEvidence();const proposalId=Object.keys(d.ownershipProposals)[0];assert.equal(d.ownershipProposals[proposalId].profileId,a.profileId);assert.deepEqual(d.ownershipProposals[proposalId].recordRefs,[a.recordRef]);
   await assert.rejects(writer.applyPurchaseEvidence(proposalId,b.recordRef,true),/candidate/);await writer.renameProviderProfile(a.profileId,'Renamed');await writer.applyPurchaseEvidence(proposalId,a.recordRef,true);
   const client='a'.repeat(32),entry={itemRef:crypto.randomUUID(),title:'Synthetic Game',mediaType:'game',keyStatus:'unrevealed',expiresAt:null,checkedAt:'2026-10-01',purchaseEvidence:'confirmed',activationStatus:'unknown'};
   const feed=async label=>{d=await writer.mergeProviderItems('humble',[],{profileLabel:label});const p=await writer.beginCompanionFeed(client,{profileLabel:label,count:1,coverage:'complete',sentAt:'2026-10-01'});await writer.appendCompanionFeed(client,p.uploadToken,0,[entry]);await writer.commitCompanionFeed(client,p.uploadToken);return d.providers.humble.activeProfileId;};
   const ha=await feed('A'),hb=await feed('B');d=await writer.getDatabase();assert.equal(Object.keys(d.companionFeeds).length,2);assert.equal(libraryReminders(d).filter(r=>r.source==='humble-companion').length,2);
   const refs=Object.values(d.companionFeeds).map(f=>f.entries[0].localRef);assert.notEqual(refs[0],refs[1]);await writer.selectProviderProfile(ha,hb,true);await writer.renameProviderProfile(ha,'Personal');
   d=await writer.getDatabase();assert.deepEqual(Object.values(d.companionFeeds).map(f=>f.entries[0].localRef),refs);
   const context=validateFandangoState({phase:'start',mode:'full',scanContext:{profileId:crypto.randomUUID(),profileLabel:'A',confirmed:true,scanToken:crypto.randomUUID()}});assert(context.scanContext.profileId);
   assert.deepEqual(parseBackup(createBackup(d)).companionFeeds,d.companionFeeds);
 }]
);

providerProfileTests.push(
 ['all acquired source/history and record-owned human state survive A/B/A exactly',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book(),book('B000000002')]),a=activeRecord(d,'kindle','B000000001'),other=activeRecord(d,'kindle','B000000002');
   await writer.saveKindleComicContents([{itemId:a.id,recordRef:a.recordRef,sourceUrl:a.metadata.detailUrl,statement:'Collects Historical #1-2',availability:'statement-found',extractorVersion:2}]);
   await writer.saveKindleComicContents([{itemId:a.id,recordRef:a.recordRef,sourceUrl:a.metadata.detailUrl,statement:'Collects Synthetic #1-2',availability:'statement-found',extractorVersion:5}]);
   await writer.saveContentReview(a.id,review);await writer.saveTitleAliases(a.recordRef,['Alias']);await writer.saveOwnershipReview(a.recordRef,{ownership:'owned',note:'Synthetic receipt',evidenceDate:'2026-10-01'});
   await writer.saveReadingState(a.recordRef,{status:'reading',progress:25,access:'accessible',downloaded:true});await writer.saveReadingOrder(null,'Synthetic order',[a.recordRef,other.recordRef]);
   await writer.saveManualMatchDecision({itemIds:[a.id,other.id]},'same-work');
   d=await writer.getDatabase();const separation=crypto.randomUUID();d.editionSeparations[separation]={itemId:a.id,otherItemIds:[other.id],updatedAt:'2026-10-01'};
   const er=crypto.randomUUID();d.enrichmentReviews[er]={recordRefs:[a.recordRef],source:'googleBooks',status:'no-results',reason:'Synthetic empty result',title:a.title,checkedAt:'2026-10-01',candidates:[]};
   d.reminderReviews[`${a.recordRef}:activation`]={action:'dismissed',basis:'Synthetic',until:null,updatedAt:'2026-10-01'};await writer.restoreDatabase(d);
   const before=await writer.getDatabase(),keys=['kindleContentsObservations','enrichmentHistory','enrichmentReviews','contentReviews','manualMatchDecisions','editionSeparations','titleAliases','ownershipReviews','readingStates','readingOrders','reminderReviews'];
   d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');d=await writer.selectProviderProfile(a.profileId,b.profileId,true);
   assert.deepEqual(d.providerItems[a.id],before.providerItems[a.id]);for(const key of keys)assert.deepEqual(d[key],before[key],key);
   assert.equal(d.kindleContentsObservations[a.recordRef].baseline.extractorVersion,2);assert.equal(d.providerItems[a.id].metadata.enrichment.kindleProductComicContents.extractorVersion,5);
 }],
 ['Google frozen targets remain present after account selection and do not advance as skipped',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book()]),a=activeRecord(d,'kindle','B000000001');const job=await writer.startGoogleBooksEnrichmentJob(),run=await writer.acquireEnrichmentRun(job.jobId);
   d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');assert.deepEqual((await writer.getGoogleBooksEnrichmentJob()).targets,job.targets);
   await writer.selectProviderProfile(a.profileId,b.profileId,true);await writer.selectProviderProfile(b.profileId,a.profileId,true);
   d=await writer.getDatabase();const target=d.providerItems[a.id];await writer.commitEnrichmentBatch(job.jobId,run.runId,0,[{canonicalId:job.queue[0],status:'no-results',recordObservations:[{ref:a.recordRef,observedAt:target.observedAt,title:target.title}]}]);
   const saved=await writer.getGoogleBooksEnrichmentJob();assert.equal(saved.cursor,1);assert.equal(saved.skipped,0);
 }
 ]
);
