/* MAIN world; reads only existing website cache. No requests or hooks. */
(()=>{
  if(location.origin!=='https://play.xbox.com')return;
  addEventListener('message',event=>{
    const r=event.data;if(event.source!==window||event.origin!==location.origin||r?.channel!=='gl-xbox-validation-request'||typeof r.nonce!=='string'||!/^[a-f0-9]{32}$/u.test(r.nonce))return;
    window.postMessage({channel:'gl-xbox-validation-response',nonce:r.nonce,report:globalThis.GLXboxWebValidation.read(window,document)},location.origin);
  });
})();
