/* ISOLATED world: sanitized counts only. */
(()=>{
  if(location.origin!=='https://play.xbox.com'||document.getElementById('gl-xbox-web-validation'))return;
  const host=document.createElement('div');host.id='gl-xbox-web-validation';host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(420px,95vw);font:14px system-ui;color:#f8fafc';
  const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<style>section{background:#1e293b;border:1px solid #64748b;border-radius:10px;padding:14px}button{font:inherit;padding:6px 9px;margin:4px}textarea{width:100%;box-sizing:border-box;height:180px;font:11px monospace}</style><section><strong>GL Xbox web validation 0.1.0 — read only</strong><p>No imports or network requests. Open Library → Owned, clear search/filters and let the website finish loading. Then update the summary.</p><p role="status">Waiting for the website…</p><button data-action="report">Update summary</button><button data-action="copy">Copy summary</button><details><summary>Aggregate diagnostics</summary><textarea readonly aria-label="Aggregate diagnostics"></textarea></details></section>';
  const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join(''),status=shadow.querySelector('[role=status]'),output=shadow.querySelector('textarea');let summary='';
  const send=()=>window.postMessage({channel:'gl-xbox-validation-request',nonce},location.origin);
  addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='gl-xbox-validation-response'||event.data.nonce!==nonce)return;
    const r=globalThis.GLXboxWebValidation.sanitize(event.data.report);if(!r)return;
    summary=JSON.stringify(r,null,2);output.value=summary;
    status.textContent=r.state==='ready'?`${r.ownedRows} Owned-list entries · ${r.joinedTitles} catalog titles · ${r.joinedAccess} access records. Copy the summary; nothing was imported.`:r.state==='waiting'?'Xbox has not cached all required Owned-view data. Open Library → Owned, wait for the cards, then Update summary.':r.state==='incomplete'?'Some account or catalog information could not be reconciled. Copy the summary; nothing was imported.':'The website cache could not be read. Copy the summary; this does not mean your library is empty.';
  });
  shadow.addEventListener('click',async event=>{
    if(event.target?.dataset?.action==='report')send();
    if(event.target?.dataset?.action==='copy'){
      if(!summary){status.textContent='Update the summary first.';return;}
      try{await navigator.clipboard.writeText(summary);status.textContent='Summary copied. No titles, product IDs, account IDs or credentials are included.';}catch{shadow.querySelector('details').open=true;output.focus();output.select();status.textContent='Copy the selected summary with Ctrl+C.';}
    }
  });
  document.documentElement.append(host);send();
})();
