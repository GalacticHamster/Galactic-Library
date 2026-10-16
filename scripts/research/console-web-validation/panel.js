/* ISOLATED world. Displays aggregate diagnostics only; no privileged writes. */
(function(){
  'use strict';
  if(!globalThis.GLConsoleValidationCore?.providerForLocation(location))return;
  if(document.getElementById('gl-console-validation'))return;
  const bytes=crypto.getRandomValues(new Uint8Array(16)),nonce=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
  const host=document.createElement('div');host.id='gl-console-validation';
  host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(420px,95vw);font:14px system-ui;color:#f8fafc';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML='<style>section{background:#1e293b;border:1px solid #64748b;border-radius:10px;padding:14px;box-shadow:0 4px 20px #0006}p{margin:8px 0}button{font:inherit;padding:6px 9px;margin:4px 5px 4px 0}textarea{box-sizing:border-box;width:100%;height:170px;font:11px monospace}details{margin-top:8px}</style><section><strong>GL console validation — read only</strong><p>No purchases are imported or changed. This helper observes library requests the website makes; it makes none itself.</p><p role="status">Waiting for the page observer…</p><button data-action="report">Update summary</button><button data-action="copy">Copy summary</button><button data-action="stop">Stop observing</button><details><summary>Aggregate diagnostics</summary><textarea readonly aria-label="Aggregate diagnostics"></textarea></details></section>';
  const status=shadow.querySelector('[role=status]'),output=shadow.querySelector('textarea');let summary='';
  shadow.querySelector('strong').textContent='GL console validation 0.1.11 — read only';
  let checkButton,accountButton;if(globalThis.GLConsoleValidationCore.providerForLocation(location)==='playstation'){
    checkButton=document.createElement('button');checkButton.dataset.action='check';checkButton.textContent='Test one read-only request';checkButton.disabled=true;shadow.querySelector('details').before(checkButton);
    accountButton=document.createElement('button');accountButton.dataset.action='check-account';accountButton.textContent='Test account lookup';accountButton.disabled=true;shadow.querySelector('details').before(accountButton);
    shadow.querySelector('p').textContent='No purchases are imported or changed. Observation makes no requests. Each test button makes one read-only request using the browser-managed session. Account checks report only field presence, never account IDs.';
  }
  const send=action=>window.postMessage({channel:'gl-console-validation-request',nonce,action},location.origin);
  addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='gl-console-validation-report'||event.data.nonce!==nonce)return;
    const report=globalThis.GLConsoleValidationCore.sanitizeReport(event.data.report);
    if(!report||report.format!==1||!['playstation','nintendo'].includes(report.provider)||report.readOnly!==true)return;
    const json=JSON.stringify(report,null,2);if(json.length>50000)return;
    summary=json;output.value=json;
    if(checkButton)checkButton.disabled=!report.active||report.readOnlyCookieCheck?.state!=='ready';
    if(accountButton)accountButton.disabled=!report.active||report.readOnlyAccountCheck?.state!=='ready';
    const rows=Array.isArray(report.scopes)?report.scopes.reduce((sum,s)=>sum+(Number.isSafeInteger(s.rows)?s.rows:0),0):0;
    status.textContent=report.active?`${report.requestsObserved} requests observed · ${rows} rows in observed library scopes. Browse or scroll the website, then update the summary. These are diagnostics, not an import.`:'Observation stopped. Reload the page to start a fresh check.';
    if(report.active&&report.readOnlyCookieCheck?.state==='running')status.textContent='Testing one read-only purchase page using this browser session…';
    if(report.active&&report.readOnlyCookieCheck?.state==='complete')status.textContent=report.readOnlyCookieCheck.recognizedPurchasedPage?'Read-only request succeeded. Copy the summary to report the result.':'Read-only request did not establish access. Copy the summary; no purchases were changed.';
    if(report.active&&report.readOnlyAccountCheck?.state==='running')status.textContent='Checking account lookup using this browser session…';
    if(report.active&&report.readOnlyAccountCheck?.state==='ready')status.textContent='Account test ready. Click Test account lookup to check this browser session.';
    if(report.active&&report.readOnlyAccountCheck?.reason==='no-observed-safe-query')status.textContent='Waiting for PlayStation to load the signed-in account. If this does not change after the library loads, copy the summary.';
    if(report.active&&report.readOnlyAccountCheck?.reason==='website-profile-response-pending')status.textContent='Waiting for PlayStation’s account response. The test will become available automatically when it is ready.';
    if(report.active&&['website-profile-request-failed','website-profile-response-unrecognized'].includes(report.readOnlyAccountCheck?.reason))status.textContent='PlayStation’s account response could not be read. Copy the summary; no purchases were changed.';
    if(report.active&&report.readOnlyAccountCheck?.reason==='observed-client-context-unavailable')status.textContent='The website account was observed, but its request settings could not be reused. Reload this page and copy a fresh summary; no purchases were changed.';
    if(report.active&&report.readOnlyAccountCheck?.state==='complete')status.textContent=report.readOnlyAccountCheck.recognizedAccountProfile?'Account lookup succeeded. Copy the summary; account IDs are not included.':'Account lookup did not establish account binding. Copy the summary; no purchases were changed.';
    if(report.active&&report.bootstrap?.cardArrays?.length)status.textContent+=' Initial page data also contains card arrays; see the aggregate diagnostics.';
  });
  shadow.addEventListener('click',async event=>{
    const action=event.target?.dataset?.action;
    if(action==='copy'){
      if(!summary){status.textContent='Update the summary first.';return;}
      try{await navigator.clipboard.writeText(summary);status.textContent='Aggregate summary copied. It contains no titles, account IDs or credentials.';}
      catch{shadow.querySelector('details').open=true;output.focus();output.select();status.textContent='Copy the selected aggregate summary with Ctrl+C.';}
    }else if(['report','stop','check','check-account'].includes(action))send(action);
  });
  document.documentElement.append(host);send('report');
  setTimeout(()=>{if(!summary)status.textContent='The page observer has not responded. Reload this library page after loading the helper and check that it is enabled for this site. Chrome 111+ or Firefox 128+ is required.';},3000);
})();
