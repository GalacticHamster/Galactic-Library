import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {outputPath} from './audit-artifacts.mjs';
import {openObservationBrowser} from './observation-browser-harness.mjs';
import {completionBaseline} from '../tests/observation-completion-fixture.js';
import {providerSyncValue,providerSyncSnapshot} from '../tests/provider-sync-fixture.js';
const firefox=process.argv.includes('--firefox'),rows=[],pause=ms=>new Promise(done=>setTimeout(done,ms));
const output=await outputPath(`audit-artifacts/observation-stage2/native-${firefox?'firefox':'chrome'}-faults.json`);
const browser=await openObservationBrowser({firefox,faults:true}),{evaluate,restart}=browser;
try{
 const baseline=await completionBaseline('epic'),values=[providerSyncValue('epic')],snapshot=providerSyncSnapshot('epic',values);

 const scenarios=[['before-receipt','receipt'],['during-receipt','receipt'],['after-receipt','receipt'],['after-receipt','receipt-no-proof'],['lease-cleanup-error','receipt'],['after-journal','materialize'],['before-database','materialize'],['after-database','materialize'],['after-database','restore'],['after-clear','clear'],['quota','receipt']];
 for(const [point,operation]of scenarios){
  console.log('START native '+(firefox?'Firefox':'Chrome')+': '+point+' / '+operation);
  await evaluate(`await chrome.storage.session.set({observationTestFault:'',observationTestReached:null});await faultClient.restoreDatabase(${JSON.stringify(baseline)});return true;`);
  const before=await evaluate(`const faultScan=await faultClient.beginProviderScan('epic','Personal','full',false,1);await chrome.storage.session.set({observationTestScan:faultScan.scanToken});if(${JSON.stringify(operation)}.startsWith('receipt'))return await faultClient.getDatabase();await faultClient.commitProviderScan('epic',${JSON.stringify(values)},{syncMode:'full'},${JSON.stringify(snapshot)},faultScan.scanToken,1);return await faultClient.getDatabase();`);
  const scan=await evaluate('return {scanToken:(await chrome.storage.session.get("observationTestScan")).observationTestScan};'),previousWorker=await evaluate(`return (await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'})).activity.worker;`);
  await evaluate(`await chrome.storage.session.set({observationTestFault:${JSON.stringify(point)},observationTestReached:null});await chrome.storage.session.set({observationTestJobDone:false,observationTestJobError:null});const p=${JSON.stringify(operation)}.startsWith('receipt')?faultClient.commitProviderScan('epic',${JSON.stringify(values)},{syncMode:'full'},${JSON.stringify(snapshot)},${JSON.stringify(scan.scanToken)},1):${JSON.stringify(operation)}==='materialize'?faultClient.saveOwnershipPolicy({providers:{kobo:true}}):${JSON.stringify(operation)}==='restore'?faultClient.restoreDatabase(${JSON.stringify(baseline)}):faultClient.clearDatabase();p.then(()=>chrome.storage.session.set({observationTestJobDone:true}),e=>chrome.storage.session.set({observationTestJobError:e.message}));return true;`);
  for(let n=0;n<200;n++){const ready=await evaluate(`const state=await chrome.storage.session.get(['observationTestReached','observationTestJobDone','observationTestJobError']);return state.observationTestReached===${JSON.stringify(point)}||${JSON.stringify(point)}==='lease-cleanup-error'&&state.observationTestJobDone||${JSON.stringify(point)}==='quota'&&state.observationTestJobError!==null;`);if(ready)break;if(n===199)throw Error('Fault boundary not reached: '+point+'/'+operation);await pause(20);}
  const settled=await evaluate(`const raw=(await faultArea.get({galacticLibraryDatabase:null,galacticLibraryObservations:null}));return {raw:raw.galacticLibraryDatabase,receipt:raw.galacticLibraryObservations?.kind==='active'&&!!raw.galacticLibraryObservations.packet};`);
  await evaluate(`await chrome.storage.session.set({observationTestFault:''});if(${JSON.stringify(operation)}==='receipt-no-proof')await chrome.storage.session.remove('galacticLibraryValidationCertificate');return true;`);
  await restart();
  const recovered=await evaluate(`return await faultClient.getDatabase();`),currentWorker=await evaluate(`return (await chrome.runtime.sendMessage({type:'GET_KINDLE_CONTENTS_UI_TIMINGS'})).activity.worker;`);assert.notEqual(currentWorker,previousWorker,'Background generation unchanged');
  if(operation==='materialize'){const expected=point==='after-database'?settled.raw:before;assert.deepEqual(recovered,expected);}
  else if(operation==='restore')assert.deepEqual(recovered,settled.raw);
  else if(operation==='clear')assert.equal(Object.keys(recovered.providerItems).length,0);
  else if(!settled.receipt)assert.deepEqual(recovered,before);
  if(operation.startsWith('receipt')&&point!=='quota'){
   const retry=await evaluate(`return await faultClient.commitProviderScan('epic',${JSON.stringify(values)},{syncMode:'full'},${JSON.stringify(snapshot)},${JSON.stringify(scan.scanToken)},1);`);
   if(settled.receipt)assert.deepEqual(retry,recovered);assert.equal(retry.providers.epic.syncHealth.status,'succeeded');assert.equal(Object.keys(retry.providerItems).length,Object.keys(baseline.providerItems).length);
  }
  assert.deepEqual(recovered.contentReviews,before.contentReviews);assert.deepEqual(recovered.manualMatchDecisions,before.manualMatchDecisions);
  const result={point,operation,restarted:true,committedReceipt:!!settled.receipt,recoveredWithoutRestore:true};rows.push(result);console.log('PASS native '+(firefox?'Firefox background reload':'Chrome worker stop')+': '+point+' / '+operation);
 }
 if(!firefox){
  await evaluate(`await chrome.storage.session.set({observationTestFault:''});await faultClient.restoreDatabase(${JSON.stringify(baseline)});await faultClient.beginProviderScan('epic','Personal','full',false,1).then(scan=>chrome.storage.session.set({observationTestScan:scan.scanToken}));const key='observationTestPadding',used=await chrome.storage.local.getBytesInUse(null),bytes=chrome.storage.local.QUOTA_BYTES-used-key.length-2-64;await chrome.storage.local.set({[key]:'x'.repeat(bytes)});return true;`);
  const actualQuota=await evaluate(`let rejected=false,message='';try{await faultClient.commitProviderScan('epic',${JSON.stringify(values)},{syncMode:'full'},${JSON.stringify(snapshot)},(await chrome.storage.session.get('observationTestScan')).observationTestScan,1);}catch(error){rejected=/quota/i.test(error.message);message=error.message;}await chrome.storage.local.remove('observationTestPadding');return {rejected,message,db:await faultClient.getDatabase()};`);
  assert(actualQuota.rejected,actualQuota.message);assert.deepEqual(actualQuota.db,baseline);rows.push({point:'actual-native-quota',operation:'receipt',rejected:true,recoveredWithoutRestore:true});console.log('PASS native Chrome: actual storage.local quota rejection retains prior library and observations');
 }
 await writeFile(output,JSON.stringify({format:1,browser:firefox?'firefox':'chrome',testPackageInstrumentation:true,notes:'Real native storage and actual background destruction/restart. Firefox reloads its installed background extension; Chrome stops its service worker. Native-write-issued boundary may already have settled by interruption. Adapter quota rejection is injected in both; Chrome also tests its actual storage.local quota with unlimitedStorage omitted ONLY from the disposable test manifest. No disk-exhaustion or power-loss durability claim.',rows},null,2));
}finally{await browser.close();}
