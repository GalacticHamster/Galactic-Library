// Browser test synchronization only. A zero-delay timer is not a details-toggle barrier.
export function openContentsEditor(editor) {
  const ready=()=>editor.querySelector('[aria-label="Contents statement draft"]');
  if(ready()){editor.open=true;return Promise.resolve();}
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(deadline);observer.disconnect();editor.removeEventListener('toggle',check);};
    const check=()=>{if(ready()){cleanup();resolve();}};
    const observer=new MutationObserver(check);
    observer.observe(editor,{childList:true,subtree:true});
    editor.addEventListener('toggle',check);
    const deadline=setTimeout(()=>{cleanup();reject(Error('Contents editor did not populate after its open gesture.'));},2000);
    editor.open=true;check();
  });
}

// Deliberately exercise the opposite task ordering, not a production delay/retry.
export function deferContentsEditorToggle(){
  const original=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(type,listener,options){
    if(type==='toggle'&&this.classList?.contains('contents-editor')){
      const node=this;
      return original.call(this,type,event=>setTimeout(()=>listener.call(node,event),0),options);
    }
    return original.call(this,type,listener,options);
  };
  return ()=>{EventTarget.prototype.addEventListener=original;};
}
