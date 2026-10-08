import {createConfirmation} from './confirmation.js';

// State exists only while choosing/confirming a file. Writer/format semantics stay unchanged.
export function bindBackupRestore({input,status,parse,read,restore,refresh,exportCurrent,canLeave=()=>true,prompt=createConfirmation}){
  let generation=0,pending=null,saving=false;
  const invalidate=()=>{generation++;pending?.cancel();pending=null;};
  input.addEventListener('change',async()=>{
    if(saving)return;
    invalidate();const ownGeneration=generation,file=input.files?.[0];if(!file)return;
    const current=()=>ownGeneration===generation&&input.files?.[0]===file;
    try{
      const backup=parse(JSON.parse(await file.text()));if(!current())return;
      const before=JSON.stringify(await read());if(!current())return;
      if(!canLeave())return;
      status.textContent='Backup checked. Confirm whether to replace your current library.';
      const decision=prompt({title:'Replace library from backup?',message:'Restoration replaces the library saved in this browser, including its saved accounts and reviews. It does not merge libraries. Changes made after this backup may be lost.',confirmLabel:'Replace library',extraLabel:'Export current backup',extraAction:exportCurrent});pending=decision;
      const accepted=await decision.result;if(pending===decision)pending=null;
      if(!current())return;if(!accepted){status.textContent='Restoration cancelled. Your library was not changed.';return;}
      const now=JSON.stringify(await read());if(!current())return;
      if(now!==before){status.textContent='Your saved library changed while the backup was being reviewed. Select the backup again to confirm the current replacement.';return;}
      saving=true;input.disabled=true;await restore(backup);await refresh();status.textContent='Backup restored.';
    }catch(error){if(current())status.textContent=`Restore failed: ${error.message}`;}
    finally{if(ownGeneration===generation)input.value='';if(saving){saving=false;input.disabled=false;}}
  });
  return {changed(){if(!pending)return;invalidate();input.value='';status.textContent='Your saved library changed. Select the backup again before replacing it.';}};
}
