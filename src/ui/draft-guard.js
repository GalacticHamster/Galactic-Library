// Bounded, tab-local form protection. No drafts or database data are persisted.
export const DRAFT_SCOPES='.reading-order-draft,.reading-tools section[data-reading-record],.ownership-review-tools [data-ownership-record],.local-metadata-tools,.title-alias-tools,.item-enrichment-review,.contents-editor';
export function createDraftGuard({root=document,stamp=()=>'',confirmDiscard=()=>globalThis.confirm('Discard unsaved edits and continue?'),changed=()=>{}}={}){
  const dirty=new Map();let actionScope;
  const scopeFor=target=>target?.closest?.(DRAFT_SCOPES);
  const mark=event=>{
    const scope=scopeFor(event.target);if(!scope)return;
    if(!dirty.has(scope))dirty.set(scope,stamp(scope));changed();
  };
  root.addEventListener('input',mark,true);root.addEventListener('change',mark,true);
  root.addEventListener('click',event=>{actionScope=scopeFor(event.target);const button=event.target?.closest?.('button');if(button&&/^(Add contents entry|Remove$|Parse statement|Replace draft|Use complete|Use newly)/u.test(button.textContent))mark(event);},true);
  function clear(scope){dirty.delete(scope);changed();}
  return {
    get dirty(){return dirty.size>0;},
    // Capture the initiating scope before awaiting a save; failed saves retain it.
    async commit(operation,scope=actionScope){if(dirty.has(scope)&&stamp(scope)!==dirty.get(scope))throw Error('Saved information changed. Reload before saving this draft.');const result=await operation();clear(scope);return result;},
    clear,
    allowNavigation(){if(!dirty.size)return true;if(!confirmDiscard())return false;dirty.clear();changed();return true;},
    reconcile(){
      let stale=false;
      for(const [scope,original]of dirty){
        if(stamp(scope)===original)continue;stale=true;
        // Keep the draft readable/editable, but do not save a stale preview.
        for(const button of scope.querySelectorAll('button'))if(/^(Save|Create reading order|Rename order|Add publisher suggestion|Clear reading|Confirm|Accept|Queue|Undo|Dismiss)/u.test(button.textContent))button.disabled=true;
      }
      return {dirty:dirty.size>0,stale};
    },
    discard(){dirty.clear();changed();}
  };
}
