import {syncHealthRows} from '../lib/sync-health.js';

const node=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const urls={steam:'https://store.steampowered.com/',gog:'https://www.gog.com/account',epic:'https://store.epicgames.com/','amazon-games':'https://luna.amazon.com/claims/my-collection',audible:'https://www.audible.com/library/titles',kindle:'https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/','amazon-video':'https://www.amazon.com/gp/video/mystuff/library/all','fandango-at-home':'https://athome.fandango.com/content/browse/mylibrary',kobo:'https://www.kobo.com/us/en/library/books',fanatical:'https://www.fanatical.com/en/orders',humble:'https://www.humblebundle.com/home/purchases'};
export function createSyncHealthView(database,actions){
  const root=node('details');root.id='sync-health-dashboard';root.className='tool-card';root.append(node('summary','Advanced update details and coverage'));let ready=false;
  root.addEventListener('toggle',()=>{
    if(!root.open||ready)return;ready=true;root.append(node('p','Full scans establish the observed snapshot. Quick checks refresh only their reported scope. A recent quick check does not make the whole library fresh. Failure details use safe categories, never raw responses or purchase IDs.'));
    const status=node('p');status.setAttribute('role','status');root.append(status);
    for(const {provider,state,health,fullAgeDays,historicalCount,longRunning}of syncHealthRows(database)){
      const section=node('section');section.append(node('h4',provider),node('p',`Selected update account: ${state.profileLabel||'Unnamed account'}; ${state.recordCount??0} imported items; ${historicalCount} historical records.`),node('p',`Last full scan: ${state.fullSyncAt||'never'}${fullAgeDays===null?'':` (${fullAgeDays} days ago)`}; last quick check: ${state.quickSyncAt||'never'}.`));
      if(health){
        section.append(node('p',`Last attempt: ${health.status}, ${health.mode}, profile ${health.attemptedProfileLabel||'unassigned'}; started ${health.startedAt||'unknown'}; finished ${health.finishedAt||'not reported'}.`));
        if(longRunning)section.append(node('p','This attempt has been running for over ten minutes. Check the provider tab; it may still be scanning or may have been interrupted.'));
        section.append(node('p',`Failure category: ${health.failureCode||'none'}; failed requests: ${health.failedRequestCount}; failed pages: ${health.failedPages.join(', ')||'not reported'}; retries: ${health.retries??'not reported'}; retry ${health.retryable?'available from provider controls':'not requested'}.`));
        if(health.coverageLimit)section.append(node('p','The order index supplied no pagination metadata or total. Silent server truncation cannot be independently ruled out.'));
        if(health.differences)section.append(node('p',`Latest ${health.mode} differences: ${health.differences.added} added, ${health.differences.missing} missing, ${health.differences.ownershipChanged} provider ownership changes, ${health.differences.observed} observed. Each remembered account keeps its own import history.`));
        if(health.status==='running'){
          const cancel=node('button','Cancel pending scan commit');cancel.type='button';cancel.addEventListener('click',async()=>{cancel.disabled=true;try{await actions.cancel(provider,health.attemptRef);actions.refresh();}catch(error){status.textContent=error.message;cancel.disabled=false;}});section.append(cancel);
        }
      }else section.append(node('p','No attempt diagnostics have been recorded.'));
      const snapshot=state.snapshotValidation;
      if(snapshot){section.append(node('p',`Last validated full coverage: ${snapshot.itemCount} records; validated ${snapshot.validatedAt}.`));const scopes=node('ul');for(const scope of snapshot.scopes)scopes.append(node('li',`${scope.id}: ${scope.readCount}/${scope.expectedCount??'unknown total'} source entries, ${scope.pagesRead} page(s), reached ${scope.end}.`));section.append(scopes);}
      const link=node('a','Open provider to sync or retry');link.href=urls[provider];link.target='_blank';link.rel='noreferrer';section.append(link);root.append(section);
    }
  });return root;
}
