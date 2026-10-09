import {accountLabel} from './item-presentation.js';
import {performAction} from './operation-feedback.js';
export function createTitleAliasTools(records,database,save){
  const root=document.createElement('details');root.className='title-alias-tools';root.append(Object.assign(document.createElement('summary'),{textContent:'Alternate titles and aliases'}));
  let populated=false;root.addEventListener('toggle',()=>{
    if(!root.open||populated)return;populated=true;
    root.append(Object.assign(document.createElement('p'),{textContent:'Add translated titles or transliterations, one per line. Aliases generate Possible candidates; they do not merge editions or prove ownership.'}));
    for(const record of records){
      const label=document.createElement('label');label.textContent=`${record.title} — ${accountLabel(record,database)}`;
      const input=document.createElement('textarea');input.setAttribute('aria-label','Alternate titles');input.value=(database.titleAliases[record.recordRef]?.titles??[]).join('\n');label.append(input);root.append(label);
      const note=document.createElement('input');note.setAttribute('aria-label','Alias source or explanation');note.placeholder='Source or explanation';note.maxLength=1000;note.value=database.titleAliases[record.recordRef]?.note??'';
      const button=Object.assign(document.createElement('button'),{type:'button',textContent:'Save alternate titles'}),status=document.createElement('p');status.setAttribute('role','status');
      button.addEventListener('click',()=>performAction({button,status,name:'Saving alternate titles...',task:()=>save(record.recordRef,input.value.split(/\r?\n/u).map(value=>value.trim()).filter(Boolean),note.value)}).catch(()=>{}));root.append(note,button,status);
    }
  });return root;
}
