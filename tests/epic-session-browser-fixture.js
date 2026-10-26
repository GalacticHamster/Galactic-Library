import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const page=cursor=>({data:{Library:{libraryItems:{records:[{catalogItemId:'fixture-123',namespace:'store',catalogItem:{id:'fixture-123',title:'Test epic'}}],responseMetadata:{nextCursor:cursor}}}}});
export async function checkEpicSession({shadow,writer,checks,wait,assert,commits,reloadDiagnostics}){
 await import('../src/providers/provider-snapshot.js');await import('../src/providers/epic.js');
 const originalFetch=globalThis.fetch;let responses=[],requests=0;
 const button=shadow.querySelector('button'),status=shadow.querySelector('.status');
 const sync=async()=>{button.click();await wait(()=>!status.dataset.busy);};
 globalThis.fetch=async url=>{assert(url==='/graphql','Unexpected Epic request');requests++;const r=responses.shift();assert(r,'Unauthorized retry or overlapping request');return {status:r.status,ok:r.status<400,json:async()=>r.body};};
 try{
   let d=await writer.getDatabase(),item=Object.values(d.providerItems).find(r=>r.provider==='epic');
   await writer.saveOwnershipCorrections([ownershipCorrectionTarget(item,d)],{ownership:'returned',note:'Synthetic manual correction'});
   const before=await writer.getDatabase(),beforeCommits=commits();
   for(const failure of [{status:401},{status:200,body:{errors:[{message:'LibraryQuery/libraryItems: Request failed with status code 401 PRIVATE_TOKEN'}]}}]){
     responses=[{status:200,body:page('next')},failure];const prior=requests;await sync();
     assert(requests===prior+2&&commits()===beforeCommits,'Failed authorization retried or committed a partial library');
     assert(status.textContent.includes(failure.status===200?'My Achievements':'Sign in on Epic')&&status.textContent.includes(failure.status===200?"saved library hasn't changed":'saved library is unchanged')&&!/401|LibraryQuery|PRIVATE/.test(status.textContent),'Authorization message exposed internals or gave no recovery action');
     const report=globalThis.GalacticEpic.getDiagnostics();assert(report.pagesRead===1&&report.saveState==='not-requested'&&report.automaticRetries===0,'Scan failure diagnostics are misleading');
     assert(!shadow.querySelector('[data-export-scan]').disabled,'Failure report cannot be exported');
     const after=await writer.getDatabase();for(const section of ['providerItems','providerHistory','canonicalItems','ownershipReviews','manualMatchDecisions','contentReviews','editionSeparations'])assert(JSON.stringify(after[section])===JSON.stringify(before[section]),'Authorization failure changed '+section);
   }
   checks.push('Epic real HTTP/upstream 401 orchestration stops without retries, partial commits, Earlier imports moves or evidence changes');
   // Represents a user retry after ordinary Epic navigation/verification, not a
   // fabricated automatic session-ready signal or an extra profile request.
   reloadDiagnostics();history.replaceState(null,'','/en-US/u/PRIVATE_USERNAME/achievements');
   for(let n=0;n<2;n++){
     responses=[{status:200,body:page(null)}];const prior=requests;await sync();assert(requests===prior+1&&status.textContent.includes('Sync complete'),'Explicit retry did not recover');
     const after=await writer.getDatabase(),current=Object.values(after.providerItems).find(r=>r.provider==='epic');
     assert(current.id===item.id&&Object.values(after.providerItems).filter(r=>r.provider==='epic').length===1,'Recovery changed source identities or duplicated a record');
     assert(effectiveOwnershipRecord(current,after).ownership==='returned','Recovery erased the manual correction');
     const unrelated=d=>Object.values(d.providerItems).filter(r=>r.provider!=='epic');assert(JSON.stringify(unrelated(before))===JSON.stringify(unrelated(after)),'Recovery changed another provider');
     assert(JSON.stringify(after.providerHistory)===JSON.stringify(before.providerHistory),'Recovery duplicated history');assert(JSON.stringify(parseBackup(createBackup(after)))===JSON.stringify(after),'Recovery backup round trip failed');
   }
   assert(globalThis.GalacticEpic.getDiagnostics().saveState==='saved','Successful report did not record the save');
   assert(shadow.querySelector('[data-profile-label]').value==='fixture','Retry lost the selected account');
   checks.push('Epic explicit recovery/reimport retains source IDs, account selection, manual corrections, history and unrelated records through backup round trip');
   const realCreate=URL.createObjectURL,realRevoke=URL.revokeObjectURL,realClick=HTMLAnchorElement.prototype.click;let blob,filename;
   try{URL.createObjectURL=value=>{blob=value;return 'blob:synthetic';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){filename=this.download;};shadow.querySelector('[data-export-scan]').click();await wait(()=>!!blob);assert(filename==='GL-epic-scan.json'&&blob,'Report export did not run');const json=await blob.text(),exported=JSON.parse(json);assert(exported.authorizationHistory?.episodes.length===1&&exported.authorizationHistory.episodes[0].subsequentSuccess?.saveState==='saved','Retained failure/success missing after worker recreation');assert(exported.authorizationHistory.navigationBetweenAttempts==='not-monitored','Export invented navigation observation');assert(exported.authorizationHistory.episodes[0].subsequentSuccess.route==='achievements','Export lost the safe attempt route category');assert(!/PRIVATE|fixture-123|Test epic|fixture|cookie|token/i.test(json),'Report exported source/account/credential data');}
   finally{URL.createObjectURL=realCreate;URL.revokeObjectURL=realRevoke;HTMLAnchorElement.prototype.click=realClick;}
   checks.push('Epic collapsed scan export retains only the confirmed failure and committed recovery through worker recreation, with allowlisted fields and no account/session data');
 }finally{globalThis.fetch=originalFetch;}
}
