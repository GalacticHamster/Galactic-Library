// Existing persistence behavior, independently of the mocked browser boundary.
import assert from 'node:assert/strict';
import {memory} from './final-gl-features.js';
import {snapshotFixture} from './storage.js';
import {completeProviderSnapshot,completedScope} from '../src/lib/provider-snapshot.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {withWorker} from './storage.js';
const providers=['steam','gog','epic','amazon-games','audible','kindle','amazon-video','fandango-at-home','kobo','fanatical','humble','xbox','playstation','nintendo'];
export const overlayAccountAuditTests=providers.map(provider=>['Overlay audit: '+provider+' persisted setup, nickname normalization, interruption and independent accounts',async()=>{
  const bound=['xbox','playstation','nintendo'].includes(provider),fp='a'.repeat(64),otherFp='b'.repeat(64);
  const {writer,stored}=memory();
  const cancel=(w,state)=>w.cancelProviderScan(provider,state.galacticLibraryProviderScans[provider].attemptRef);
  const begin=(w,label,mode='full',switching=false,fingerprint=fp)=>w.beginProviderScan(provider,label,mode,switching,1,null,false,bound?fingerprint:null);
  const mediaType=['audible'].includes(provider)?'audiobook':['kobo','kindle','humble'].includes(provider)?'book':['amazon-video','fandango-at-home'].includes(provider)?'movie':'game';
  const item={provider,providerItemId:provider==='xbox'?'X00000000001':'audit-item',title:'Synthetic audit title',mediaType,ownership:'owned',metadata:provider==='xbox'?{source:'xbox-web-library',productId:'X00000000001',accessBasis:'personal-owned-web-catalog',accessTypes:[1]}:{}};
  const snapshot=items=>bound?completeProviderSnapshot(provider,items,[completedScope(provider==='xbox'?'owned-web-library':provider==='playstation'?'ps4-ps5-purchased':'non-hidden-virtual-cards',items.length,provider==='playstation'?null:items.length,provider==='playstation'?'pagination-end':'reported-count')]):snapshotFixture(provider,items);
  const save=(w,scan,items,fingerprint=fp)=>w.commitProviderScan(provider,items,{syncMode:'full',fullSyncAt:'2026-10-26'},snapshot(items),scan.scanToken,1,false,bound?fingerprint:null);
  for(const label of ['', '   ']){
    const fresh=memory();let unnamed=await begin(fresh.writer,label);const first=unnamed.profileId;
    await save(fresh.writer,unnamed,[item]);unnamed=await begin(fresh.writer,'',provider==='nintendo'?'full':'incremental');
    assert.equal(unnamed.profileId,first);assert.equal(unnamed.forceFull,false);
    assert.equal((await fresh.writer.getDatabase()).providerProfiles[first].nickname,'');await cancel(fresh.writer,fresh.stored);
  }
  assert.equal(Object.keys((await writer.getDatabase()).providerProfiles).length,0);
  let scan=await begin(writer,'  Personal   Account  ');
  let db=await writer.getDatabase();const a=scan.profileId;
  assert.equal(db.providerProfiles[a].nickname,'Personal Account');
  assert.equal(Object.keys(db.providerItems).length,0);assert(!db.providerProfiles[a].state.lastSync);
  // Starting creates a declared profile/running attempt before data is saved;
  // an interrupted initial setup is not eligible for automatic returning reuse.
  await cancel(writer,stored);
  assert.equal(Object.keys((await writer.getDatabase()).providerProfiles).length,1);
  scan=await begin(writer,'Personal Account');db=await save(writer,scan,[item]);
  const records=structuredClone(db.providerItems);
  const restarted=memory();Object.assign(restarted.stored,structuredClone(stored));
  db=await restarted.writer.getDatabase();assert.equal(db.providers[provider].activeProfileId,a);assert.deepEqual(db.providerItems,records);
  scan=await begin(restarted.writer,'Personal Account',provider==='nintendo'?'full':'incremental');assert.equal(scan.forceFull,false);
  await cancel(restarted.writer,restarted.stored);
  await assert.rejects(begin(restarted.writer,'Other Account','full',false,otherFp),/confirm switching/i);
  assert.deepEqual((await restarted.writer.getDatabase()).providerItems,records);
  scan=await begin(restarted.writer,'Other Account','full',true,otherFp);
  await cancel(restarted.writer,restarted.stored);
  db=await restarted.writer.getDatabase();assert.equal(db.providers[provider].activeProfileId,a);assert.deepEqual(db.providerItems,records);
  scan=await begin(restarted.writer,'Other Account','full',true,otherFp);db=await save(restarted.writer,scan,[{...item,ownership:provider==='xbox'?'owned':'unknown'}],otherFp);
  const b=scan.profileId;assert.notEqual(a,b);assert.equal(Object.keys(db.providerItems).length,2);
  for(const [id,record]of Object.entries(records))assert.deepEqual(db.providerItems[id],record);
  await assert.rejects(begin(restarted.writer,'Personal Account'),/confirm switching/i);
  scan=await begin(restarted.writer,'Personal Account','full',true);db=await save(restarted.writer,scan,[item]);
  assert.equal(db.providers[provider].activeProfileId,a);assert.equal(Object.keys(db.providerItems).length,2);
  await assert.rejects(restarted.writer.renameProviderProfile(b,'Personal Account'),/already used/);
  // Case comparisons are exact. Consoles additionally forbid giving an
  // already-bound source account another nickname through the import form.
  if(bound)await assert.rejects(begin(restarted.writer,'personal account','full',true),/already saved/);
  else {const caseScan=await begin(restarted.writer,'personal account','full',true);assert.notEqual(caseScan.profileId,a);await cancel(restarted.writer,restarted.stored);}
  db=await restarted.writer.getDatabase();assert.deepEqual(parseBackup(createBackup(db)).providerItems,db.providerItems);
}]);

overlayAccountAuditTests.push(['Provider diagnostics defaults off, persists outside library/backups and rejects provider-tab writes',async()=>{
  const {writer,stored}=memory();const before=await writer.getDatabase();
  assert.equal(await writer.getProviderDiagnosticsEnabled(),false);
  await writer.saveProviderDiagnosticsEnabled(true);
  const restarted=memory();Object.assign(restarted.stored,structuredClone(stored));
  assert.equal(await restarted.writer.getProviderDiagnosticsEnabled(),true);
  assert.deepEqual(await restarted.writer.getDatabase(),before);
  assert.deepEqual(parseBackup(createBackup(before)),before);
  await assert.rejects(writer.saveProviderDiagnosticsEnabled('true'),/Choose/);
  await restarted.writer.clearDatabase();assert.equal(await restarted.writer.getProviderDiagnosticsEnabled(),false);
  await withWorker(async({dispatch})=>{
    const sender={id:chrome.runtime.id,url:'https://www.kobo.com/us/en/library/books',tab:{id:1}};
    assert.equal((await dispatch({type:'GET_PROVIDER_DIAGNOSTICS_SETTING',provider:'kobo'},sender)).enabled,false);
    assert.equal((await dispatch({type:'GET_PROVIDER_DIAGNOSTICS_SETTING',provider:'kobo'},{...sender,url:'https://example.com'})).ok,false);
    assert.equal((await dispatch({type:'LIBRARY_STORAGE_OPERATION',operation:'saveProviderDiagnosticsEnabled',args:[true]},sender)).ok,false);
  });
}]);
