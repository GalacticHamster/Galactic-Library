import {createConfirmation} from './confirmation.js';
import {createOperation} from './operation-feedback.js';

export const BACKUP_SCOPE_HELP='Backups contain library records, saved accounts, reviews and supported comic coverage preferences when present. API keys, companion pairing, automatic purchase-sync permission, diagnostics settings, appearance and other browser-only preferences are not included.';
export const RESTORE_LOCAL_HELP='Existing API keys, companion pairing and browser preferences are not replaced by the backup. Automatic purchase-sync relationships are reset; reconnect Humble or Fanatical purchase sync after restoring.';
export const CLEAR_LIBRARY_HELP='Clear saved libraries, account labels, reviews, API keys, companion links and local update settings in this browser. Appearance stays unchanged. Purchases at your stores are unaffected. A library backup does not include API keys, companion links or browser-only settings.';
export const CLEAR_LIBRARY_WARNING='Clear Galactic Library in this browser? '+CLEAR_LIBRARY_HELP+' Export a library backup first if you need to recover your library records.';

// Page-local state; full validation and authoritative stale confirmation remain.
export function bindBackupRestore({input,status,parse,read,restore,refresh,exportCurrent,canLeave=()=>true,prompt=createConfirmation,paint,criticalControls=[]}){
  let generation=0,pending=null,saving=false,processingFile=null,processing=null,criticalBaseline=null;
  const unlock=()=>{for(const [control,disabled]of criticalBaseline??[])control.disabled=disabled;criticalBaseline=null;};
  const invalidate=()=>{generation++;pending?.cancel();pending=null;};
  function change(){
    if(saving)return processing;
    const file=input.files?.[0];if(processingFile===file&&processing)return processing;
    invalidate();const ownGeneration=generation;if(!file)return;
    const current=()=>ownGeneration===generation&&input.files?.[0]===file;
    processingFile=file;input.disabled=true;
    criticalBaseline??=criticalControls.map(control=>[control,control.disabled]);for(const [control]of criticalBaseline)control.disabled=true;
    const feedback={set textContent(value){if(current())status.textContent=value;},setAttribute(...args){if(current())status.setAttribute?.(...args);},classList:status.classList};
    const operation=createOperation({id:'backup-restore',name:'Reading backup...',status:feedback,paint});
    processing=operation.run(async context=>{
      let backup,committed=false,phase='read';
      try{
        const text=await file.text();if(!current())return {cancelled:true};
        phase='validation';await context.phase('Validating backup...');if(!current())return {cancelled:true};
        backup=parse(JSON.parse(text));
        phase='comparison';await context.phase('Checking your current library before confirmation...');if(!current())return {cancelled:true};
        const before=JSON.stringify(await read());if(!current())return {cancelled:true};
        if(!canLeave())return {cancelled:true,message:'Restoration cancelled. Your library was not changed.'};
        context.update('Backup checked. Confirm whether to replace your current library.');
        const decision=prompt({title:'Replace library from backup?',message:'Restoration replaces the library saved in this browser. It does not merge libraries. Changes made after this backup may be lost. '+BACKUP_SCOPE_HELP+' '+RESTORE_LOCAL_HELP+' Keep this page open until restoration finishes.',confirmLabel:'Replace library',extraLabel:'Export current backup',extraAction:exportCurrent});pending=decision;
        const accepted=await decision.result;if(pending===decision)pending=null;
        if(!current())return {cancelled:true};
        if(!accepted)return {cancelled:true,message:'Restoration cancelled. Your library was not changed.'};
        await context.phase('Checking that your library has not changed...');if(!current())return {cancelled:true};
        const now=JSON.stringify(await read());if(!current())return {cancelled:true};
        if(now!==before)return {cancelled:true,message:'Your saved library changed while the backup was being reviewed. Select the backup again to confirm the current replacement.'};
        saving=true;phase='persistence';
        await context.phase('Restoring library... Keep this page open until it finishes.');
        await restore(backup);committed=true;
        await context.phase('Reloading restored library...');
        await refresh();return {message:'Backup restored.'};
      }catch(error){
        if(committed)throw Error('Backup was restored, but the Library view could not reload: '+error.message+'. Try loading the Library again; do not repeat the restore.');
        const prefix={read:'Could not read backup',validation:'Backup validation failed',comparison:'Could not check current library',persistence:'Restore completion could not be confirmed; reload the Library to check its state before retrying'}[phase];
        throw Error(prefix+': '+error.message);
      }
    },{success:result=>result?.message??'Restoration cancelled.'}).catch(()=>{}).finally(()=>{
      if(ownGeneration===generation){input.value='';input.disabled=false;processingFile=null;processing=null;unlock();saving=false;}
    });
    return processing;
  }
  input.addEventListener('change',change);
  return {get saving(){return saving;},get busy(){return !!processing;},changed(){
    if(!pending)return;invalidate();input.value='';input.disabled=false;processingFile=null;processing=null;
    unlock();
    status.setAttribute?.('aria-busy','false');status.textContent='Your saved library changed. Select the backup again before replacing it.';
  }};
}
