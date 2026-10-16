import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {withWorker} from './storage.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {PROVIDERS} from '../src/lib/constants.js';
import {combinedProviderStates} from '../src/lib/profile-management.js';
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

providerProfileTests.push(
 ['profile enumeration reports isolated counts, successful dates, coverage, health and selection',async()=>{
   const {writer}=memory();let d=await full(writer,'A',[book(),book('B000000002')]),a=activeRecord(d,'kindle','B000000001');d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');
   let rows=await writer.getProviderProfiles('kindle');assert.equal(rows.length,2);assert.equal(rows.find(p=>p.profileId===a.profileId).recordCount,2);assert.equal(rows.find(p=>p.profileId===b.profileId).recordCount,1);
   for(const p of rows){assert(p.baselineComplete);assert.equal(p.lastCompleteScan,'2026-10-01T00:00:00.000Z');assert(p.lastSuccessfulUpdate);assert(p.lastSelectedAt);assert.equal(p.syncHealth.status,'succeeded');}
   assert.equal(rows.filter(p=>p.active).length,1);d=await writer.selectProviderProfile(a.profileId,b.profileId,true);rows=await writer.getProviderProfiles();assert(rows.find(p=>p.profileId===a.profileId).active);
   assert.equal(combinedProviderStates(d).kindle.recordCount,3);assert.equal(Object.values(parseBackup(createBackup(d)).providerItems).length,3);
 }],
 ['resetting inactive A baseline preserves rich state, both Kindle jobs and active B scan authority',async()=>{
   const {writer,stored}=memory();let d=await full(writer,'A',[book(),book('B000000002')]),a=activeRecord(d,'kindle','B000000001');
   const ap=await writer.beginKindleContentsRefresh('start',1);await writer.commitKindleContentsRefresh([observation(ap.candidates[0])],ap.refresh.runRef,ap.refresh.leaseRef,1);await writer.finishKindleContentsRefresh(ap.refresh.runRef,ap.refresh.leaseRef,1,'paused');await writer.saveContentReview(a.id,review);
   d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001'),bp=await writer.beginKindleContentsRefresh('start',2),bs=await writer.beginProviderScan('kindle','B','incremental',false,2);
   const before=await writer.getDatabase(),queues=structuredClone({active:stored[KINDLE_REFRESH_KEY],archives:stored[KINDLE_REFRESH_ARCHIVES_KEY]}),scan=structuredClone(stored.galacticLibraryProviderScans);
   await assert.rejects(writer.resetProviderProfileBaseline(a.profileId,false),/Confirm/);d=await writer.resetProviderProfileBaseline(a.profileId,true);
   assert.deepEqual(d.providerItems,before.providerItems);assert.deepEqual(d.contentReviews,before.contentReviews);assert.deepEqual(d.enrichmentHistory,before.enrichmentHistory);assert.deepEqual(d.kindleContentsObservations,before.kindleContentsObservations);
   assert.deepEqual({active:stored[KINDLE_REFRESH_KEY],archives:stored[KINDLE_REFRESH_ARCHIVES_KEY]},queues);assert.deepEqual(stored.galacticLibraryProviderScans,scan);
   assert(!d.providerProfiles[a.profileId].state.fullSyncAt);assert(!d.providerProfiles[a.profileId].state.snapshotValidation);assert(d.providerProfiles[b.profileId].state.fullSyncAt);
   await writer.commitProviderScan('kindle',[],{syncMode:'incremental'},null,bs.scanToken,2);await writer.selectProviderProfile(a.profileId,b.profileId,true);
   const next=await writer.beginProviderScan('kindle','A','incremental',false,1);assert.equal(next.forceFull,true);assert.equal((await writer.getKindleContentsRefresh()).checkpoint.cursor,1);assert(bp.refresh.profileId===b.profileId);
 }],
 ['removal previews guard stale decisions and delete only A-owned endpoints while preserving B and global state',async()=>{
   const {writer,stored}=memory();let d=await full(writer,'A',[book()]),a=activeRecord(d,'kindle','B000000001');await writer.saveContentReview(a.id,review);await writer.saveTitleAliases(a.recordRef,['Alias A']);
   d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');await writer.saveTitleAliases(b.recordRef,['Alias B']);
   d=await writer.mergeProviderItems('humble',[{providerItemId:'other',title:'Other Book',mediaType:'book',ownership:'owned'}]);const h=activeRecord(d,'humble','other');
   await writer.saveManualMatchDecision({itemIds:[a.id,h.id]},'same-work');await writer.saveManualMatchDecision({itemIds:[b.id,h.id]},'same-work');
   const order=await writer.saveReadingOrder(null,'Shared order',[a.recordRef,b.recordRef]);await writer.saveAllowedExternalClientIds(['a'.repeat(32)]);await writer.saveOwnershipPolicy({providers:{kindle:true}});
   let preview=await writer.previewProviderProfileRemoval(a.profileId);assert.equal(preview.records,1);assert.equal(preview.crossProfileRelationships,1);assert.equal(preview.dependencies.contentReviews,1);assert.equal(preview.dependencies.readingOrders,1);
   await assert.rejects(writer.removeProviderProfile(a.profileId,preview.dependencyStamp,false),/Confirm/);
   await writer.saveTitleAliases(a.recordRef,['Changed Alias A']);await assert.rejects(writer.removeProviderProfile(a.profileId,preview.dependencyStamp,true),/changed/);
   const before=await writer.getDatabase();preview=await writer.previewProviderProfileRemoval(a.profileId);d=await writer.removeProviderProfile(a.profileId,preview.dependencyStamp,true);
   assert(!d.providerProfiles[a.profileId]&&!d.providerItems[a.id]);assert.deepEqual(d.providerItems[b.id],before.providerItems[b.id]);assert.deepEqual(d.titleAliases[b.recordRef],before.titleAliases[b.recordRef]);assert.deepEqual(d.providerProfiles[b.profileId],before.providerProfiles[b.profileId]);
   assert.equal(Object.keys(d.manualMatchDecisions).length,1);assert(Object.values(d.manualMatchDecisions)[0].itemIds.includes(b.id));assert.deepEqual(d.readingOrders[order.orderRef].recordRefs,[b.recordRef]);assert.notEqual(d.readingOrders[order.orderRef].revisionRef,order.database.readingOrders[order.orderRef].revisionRef);
   assert.deepEqual(d.ownershipPolicy,before.ownershipPolicy);assert.deepEqual(await writer.getAllowedExternalClientIds(),['a'.repeat(32)]);assert.equal(d.providers.kindle.activeProfileId,b.profileId);
   assert.equal(matchItems(d.providerItems,[{title:b.title,mediaType:'book'}],d)[0].owned,true);assert.deepEqual(parseBackup(createBackup(d)),d);
 }],
 ['removing A preserves B Kindle queue/cursor and Google remaining targets without rewriting progress',async()=>{
   const {writer,stored}=memory();let d=await full(writer,'A',[book()]),a=activeRecord(d,'kindle','B000000001');const ap=await writer.beginKindleContentsRefresh('start',1);await writer.finishKindleContentsRefresh(ap.refresh.runRef,ap.refresh.leaseRef,1,'paused');
   d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001'),bp=await writer.beginKindleContentsRefresh('start',2);await writer.finishKindleContentsRefresh(bp.refresh.runRef,bp.refresh.leaseRef,2,'paused');
   const google=await writer.startGoogleBooksEnrichmentJob(),run=await writer.acquireEnrichmentRun(google.jobId),bjob=structuredClone(stored[KINDLE_REFRESH_KEY]);
   const preview=await writer.previewProviderProfileRemoval(a.profileId);assert.equal(preview.jobs.kindle.cursor,0);assert.equal(preview.jobs.googleAffectedTargets,1);
   d=await writer.removeProviderProfile(a.profileId,preview.dependencyStamp,true);assert.deepEqual(stored[KINDLE_REFRESH_KEY],bjob);assert(!stored[KINDLE_REFRESH_ARCHIVES_KEY][a.profileId]);
   const after=await writer.getGoogleBooksEnrichmentJob();assert.equal(after.cursor,run.cursor);assert.equal(after.processed,run.processed);assert.equal(after.runId,null);assert.deepEqual(after.targets[google.queue[0]],[b.recordRef]);
   const resumed=await writer.beginKindleContentsRefresh('resume',2);assert.equal(resumed.refresh.runRef,bp.refresh.runRef);assert.equal(resumed.candidates[0].recordRef,b.recordRef);
 }],
 ['removing active profile leaves update target unselected and never reuses a deleted legacy namespace',async()=>{
   const {writer}=memory();let d=await writer.mergeProviderItems('kindle',[book()]);const a=activeRecord(d,'kindle','B000000001');await writer.renameProviderProfile(a.profileId,'A');d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);const p=await writer.previewProviderProfileRemoval(a.profileId);assert.equal(p.activeAfterRemoval,null);d=await writer.removeProviderProfile(a.profileId,p.dependencyStamp,true);
   assert(!d.providers.kindle);assert(d.providerItems[b.id]);assert.equal(combinedProviderStates(d).kindle.recordCount,1);const status=handleExternalApiRequest(d,{type:'GET_STATUS'});assert.equal(status.providers.kindle.bookCount,1);assert.equal(status.providers.kindle.connected,true);assert((await writer.getProviderProfiles('kindle')).every(row=>!row.active));
   assert.equal(matchItems(d.providerItems,[{title:b.title,mediaType:'book'}],d)[0].owned,true);d=await writer.selectProviderProfile(b.profileId,undefined,true);const pb=await writer.previewProviderProfileRemoval(b.profileId);await writer.removeProviderProfile(b.profileId,pb.dependencyStamp,true);
   d=await writer.mergeProviderItems('kindle',[book()]);const next=activeRecord(d,'kindle','B000000001');assert.notEqual(next.id,a.id);assert.notEqual(next.profileId,a.profileId);assert.equal(d.legacyProfileNamespaces.kindle,a.profileId);
 }],
 ['removal cleans only A Fandango session context and preserves B independent import authority',async()=>{
   const session={},sessionArea={get:async()=>structuredClone(session),remove:async keys=>{for(const key of keys)delete session[key];}}, {writer,stored}=memory({importSessionArea:sessionArea});
   const items=[{providerItemId:'x',title:'Synthetic Movie',mediaType:'movie',ownership:'owned'}],f=label=>writer.replaceProviderItems('fandango-at-home',items,{profileLabel:label,fullSyncAt:'2026-10-01'},snapshotFixture('fandango-at-home',items));
   let d=await f('A'),a=d.providers['fandango-at-home'].activeProfileId;d=await f('B');const b=d.providers['fandango-at-home'].activeProfileId;
   session['fandango-import-1']={phase:'start',mode:'full',scanContext:{profileId:a,profileLabel:'A'}};session['fandango-import-2']={phase:'start',mode:'full',scanContext:{profileId:b,profileLabel:'B'}};
   const scan=await writer.beginProviderScan('fandango-at-home','B','incremental',false,2),before=structuredClone(stored.galacticLibraryProviderScans);const p=await writer.previewProviderProfileRemoval(a);assert.equal(p.jobs.fandangoNavigationContexts,1);
   await writer.removeProviderProfile(a,p.dependencyStamp,true);assert(!session['fandango-import-1']);assert(session['fandango-import-2']);assert.deepEqual(stored.galacticLibraryProviderScans,before);
   await writer.commitProviderScan('fandango-at-home',[],{syncMode:'incremental'},null,scan.scanToken,2);
 }],
 ['backup restore keeps all profile evidence and baseline state but clears separate device jobs',async()=>{
   const {writer,stored}=memory();let d=await full(writer,'A',[book()]),a=activeRecord(d,'kindle','B000000001'),p=await writer.beginKindleContentsRefresh('start',1);await writer.finishKindleContentsRefresh(p.refresh.runRef,p.refresh.leaseRef,1,'paused');d=await full(writer,'B',[book()]);
   await writer.beginKindleContentsRefresh('start',2);await writer.saveContentReview(a.id,review);const backup=createBackup(await writer.getDatabase());d=await writer.restoreDatabase(parseBackup(backup));
   assert.equal(Object.keys(d.providerProfiles).length,2);assert(d.providerItems[a.id]);assert(d.contentReviews[a.id]);assert.equal(Object.keys(stored[KINDLE_REFRESH_ARCHIVES_KEY]).length,0);assert.equal(stored[KINDLE_REFRESH_KEY],null);
   assert.deepEqual(d,parseBackup(backup));
 }]
);

providerProfileTests.push(
 ['ambiguous legacy duplicate observations remain archived and are never picked or erased on reimport',async()=>{
   const d=createEmptyDatabase();d.schemaVersion=12;delete d.providerProfiles;const a=normalizeProviderItem(book()),other=normalizeProviderItem(book());
   for(const item of [a,other])d.providerHistory[item.recordRef]={item,profileLabel:'A',reason:'profile-switch',missingSince:'2026-10-01'};
   d.contentReviews[a.id]=review;const migrated=validateDatabase(d);assert.equal(Object.keys(migrated.providerItems).length,0);assert.equal(Object.keys(migrated.providerHistory).length,2);assert(migrated.unresolvedProfileState.contentReviews[a.id]);
   const {writer}=memory();await writer.restoreDatabase(migrated);const after=await full(writer,'A',[book()]),current=activeRecord(after,'kindle','B000000001');
   assert.notEqual(current.recordRef,a.recordRef);assert.notEqual(current.recordRef,other.recordRef);assert.equal(Object.keys(after.providerHistory).length,2);assert(!after.contentReviews[current.id]);
 }],
 ['modern backups reject current records without immutable profile provenance',async()=>{
   const {writer}=memory(),d=await full(writer,'A',[book()]);const bad=structuredClone(d);delete Object.values(bad.providerItems)[0].profileId;assert.throws(()=>validateDatabase(bad),/unassigned current record/);
 }]
);

providerProfileTests.push(
 ['legacy providers retain independent remembered full baselines and profile-local scan authority',async()=>{
   const {writer}=memory();
   for(const provider of PROVIDERS.filter(p=>!['nintendo','playstation'].includes(p))){
     const mediaType=provider==='kindle'?'book':provider==='fandango-at-home'?'movie':'game',items=[{providerItemId:'x',title:'Synthetic',mediaType}];
     let d=await writer.replaceProviderItems(provider,items,{profileLabel:'A',fullSyncAt:'2026-10-01'},snapshotFixture(provider,items)),a=d.providers[provider].activeProfileId;
     d=await writer.replaceProviderItems(provider,items,{profileLabel:'B',fullSyncAt:'2026-10-02'},snapshotFixture(provider,items));const b=d.providers[provider].activeProfileId;
     d=await writer.selectProviderProfile(a,b,true);assert.equal(d.providers[provider].fullSyncAt,'2026-10-01T00:00:00.000Z');assert.equal(Object.values(d.providerItems).filter(i=>i.provider===provider).length,2);
     const scan=await writer.beginProviderScan(provider,'A','incremental',false,1);assert.equal(scan.forceFull,false);assert.equal(scan.profileId,a);await writer.selectProviderProfile(b,a,true);
     await assert.rejects(writer.commitProviderScan(provider,items,{syncMode:'incremental'},null,scan.scanToken,1),/superseded/);
   }
 }],
 ['real worker baseline replies include only target profile catalog IDs and original coverage dates',()=>withWorker(async({pageA,dispatch})=>{
   let d=await full(pageA,'A',[book(),book('B000000002')]),a=activeRecord(d,'kindle','B000000001');d=await full(pageA,'B',[book(),book('B000000003')]);const b=activeRecord(d,'kindle','B000000001');
   await pageA.selectProviderProfile(a.profileId,b.profileId,true);
   const sender={id:chrome.runtime.id,url:'https://www.amazon.com/hz/mycd/',tab:{id:1}},reply=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'kindle',beginScan:true,confirmed:true,profileLabel:'A',mode:'incremental'},sender);
   assert(reply.ok&&reply.hasFullBaseline);assert.equal(reply.profileId,a.profileId);assert.deepEqual(reply.syncState.knownProviderItemIds,['B000000001','B000000002']);assert.equal(reply.lastSuccessfulSyncAt,'2026-10-01T00:00:00.000Z');
 })],
 ['DLC native parent references cannot connect across profiles',async()=>{
   const {writer}=memory(),base={providerItemId:'1',title:'Synthetic Game',mediaType:'game',ownership:'owned'},addon={providerItemId:'2',title:'Synthetic DLC',mediaType:'game-addon',ownership:'owned',metadata:{parentProviderItemId:'1'}};
   let d=await writer.replaceProviderItems('steam',[base,addon],{profileLabel:'A'},snapshotFixture('steam',[base,addon])),a=d.providers.steam.activeProfileId;
   d=await writer.replaceProviderItems('steam',[addon],{profileLabel:'B'},snapshotFixture('steam',[addon]));const b=d.providers.steam.activeProfileId;
   assert.equal(d.providerProfiles[a].state.linkedAddOnCount,1);assert.equal(d.providerProfiles[b].state.linkedAddOnCount,0);assert.equal(combinedProviderStates(d).steam.linkedAddOnCount,1);
 }],
 ['failed profile selection cannot partially swap the database, checkpoint or archives',async()=>{
   const values={},area={get:async defaults=>structuredClone({...defaults,...values}),set:async patch=>{if(fail)throw Error('Synthetic storage failure');Object.assign(values,structuredClone(patch));},remove:async keys=>{for(const key of keys)delete values[key];}};let fail=false;
   const writer=createStorageWriter(area);let d=await full(writer,'A',[book()]),a=activeRecord(d,'kindle','B000000001');const p=await writer.beginKindleContentsRefresh('start',1);await writer.finishKindleContentsRefresh(p.refresh.runRef,p.refresh.leaseRef,1,'paused');d=await full(writer,'B',[book()]);const b=activeRecord(d,'kindle','B000000001');
   const before=structuredClone(values);fail=true;await assert.rejects(writer.selectProviderProfile(a.profileId,b.profileId,true),/storage failure/);assert.deepEqual(values,before);fail=false;
   d=await writer.selectProviderProfile(a.profileId,b.profileId,true);assert.equal(d.providers.kindle.activeProfileId,a.profileId);assert.equal((await writer.getKindleContentsRefresh()).checkpoint.runRef,p.refresh.runRef);
 }]
);

providerProfileTests.push(
 ['native IDs containing profile delimiters cannot collide with another profile namespace',async()=>{
   const {writer}=memory();let d=await writer.mergeProviderItems('humble',[{providerItemId:'seed',title:'Legacy seed',mediaType:'book'}]);const a=activeRecord(d,'humble','seed');await writer.renameProviderProfile(a.profileId,'A');
   d=await writer.mergeProviderItems('humble',[{providerItemId:'x',title:'B Product',mediaType:'book'}],{profileLabel:'B'});const b=activeRecord(d,'humble','x');
   d=await writer.mergeProviderItems('humble',[{providerItemId:`${b.profileId}:x`,title:'A Product',mediaType:'book'}],{profileId:a.profileId});
   assert.deepEqual(d.providerItems[b.id],b);assert.equal(Object.values(d.providerItems).filter(i=>i.profileId===a.profileId).length,2);assert.equal(Object.keys(d.providerItems).length,3);
 }],
 ['earlier scoped-key migration rewrites reliable endpoints and active job IDs without changing cursor or refs',async()=>{
   const {writer,stored}=memory();let d=await full(writer,'A',[book()]),a=activeRecord(d,'kindle','B000000001');await writer.saveContentReview(a.id,review);const plan=await writer.beginKindleContentsRefresh('start',1);await writer.finishKindleContentsRefresh(plan.refresh.runRef,plan.refresh.leaseRef,1,'paused');
   d=await writer.getDatabase();const oldId=`kindle:${a.profileId}:${a.providerItemId}`;d.providerItems[oldId]={...d.providerItems[a.id],id:oldId};delete d.providerItems[a.id];d.contentReviews[oldId]=d.contentReviews[a.id];delete d.contentReviews[a.id];for(const c of Object.values(d.canonicalItems))c.providerItemIds=c.providerItemIds.map(id=>id===a.id?oldId:id);
   stored.galacticLibraryDatabase=d;stored[KINDLE_REFRESH_KEY].queue[0].id=oldId;const before=structuredClone(stored[KINDLE_REFRESH_KEY]);d=await writer.getDatabase();
   assert.equal(d.providerItems[a.id].recordRef,a.recordRef);assert(d.contentReviews[a.id]);assert.equal(stored[KINDLE_REFRESH_KEY].queue[0].id,a.id);assert.equal(stored[KINDLE_REFRESH_KEY].cursor,before.cursor);assert.equal(stored[KINDLE_REFRESH_KEY].runRef,before.runRef);assert.equal((await writer.getKindleContentsRefresh()).checkpoint.status,'paused');
 }]
);
