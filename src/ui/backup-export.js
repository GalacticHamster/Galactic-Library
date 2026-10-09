import {createBackup} from '../lib/storage.js';
import {createOperation} from './operation-feedback.js';

export function handoffDownload(blob,filename){
  const url=URL.createObjectURL(blob),link=Object.assign(document.createElement('a'),{href:url,download:filename});
  document.body.append(link);
  try{link.click();}finally{link.remove();URL.revokeObjectURL(url);}
}

export function createBackupExporter({button,status,read,prepare=createBackup,serialize=value=>JSON.stringify(value,null,2),download=handoffDownload,paint,canStart=()=>true}){
  const label=button.textContent;
  const operation=createOperation({id:'backup-export',name:'Preparing export...',status,controls:[button],paint,changed:state=>{
    button.textContent=['starting','running'].includes(state.state)?'Preparing export...':label;
  }});
  function run(){
    if(!operation.busy&&!canStart())return Promise.reject(Error('Wait for the library replacement to finish before exporting.'));
    return operation.run(async context=>{
      const snapshot=await read();
      await context.phase('Validating backup for export...');
      const backup=prepare(snapshot);
      await context.phase('Preparing backup file...');
      const blob=new Blob([serialize(backup)],{type:'application/json'});
      await context.phase('Handing backup download to your browser...');
      await download(blob,'galactic-library-backup-v1.json');
      return {handedToBrowser:true};
    },{success:'Backup download handed to your browser. Check your downloads for the saved file.'});
  }
  return {run,get busy(){return operation.busy;}};
}
