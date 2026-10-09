import {presentAction} from './form-presentation.js';
import {performAction} from './operation-feedback.js';
import {formatDate} from './formatters.js';
import {bookToolHelp,fieldLabel,sourceLabel} from './book-tool-help.js';
import {identityKey,names} from '../lib/identity.js';
import {accountLabel} from './item-presentation.js';

export function createEnrichmentEvidence(records,database,undo,state={}){
  const details=document.createElement('details');details.className='enrichment-evidence';
  const heading=document.createElement('summary');heading.textContent='Sources and undo';details.append(heading,bookToolHelp({heading:'How source undo works',purpose:'See where saved book details came from and restore an earlier selection.',input:'The sources already saved for this book.',saves:'Viewing changes nothing. Undo removes this selection and restores its predecessor, where one exists.',review:'Provider details and ownership are preserved. Contents confirmation has its own undo control.',example:'If an EPUB supplied the wrong series, undo that selection and choose another source.'}));
  let built=false;
  function populate(){if(built)return;built=true;
  const fields=['title','subtitle','authors','contributors','publisher','publishers','isbn','language','series','volume','issue','unitType','run','edition','format','publishedDate','pageCount','subjects','categories','statement'];
  for(const record of records){
    for(const [kind,entry]of Object.entries(record.metadata?.enrichment??{})){
      const source=document.createElement('p');source.textContent=`${record.title} · ${accountLabel(record,database)} · ${sourceLabel(kind)} · ${entry.approved?'human approved':'source/automatic evidence'} · retrieved ${formatDate(entry.retrievedAt??entry.checkedAt??entry.appliedAt)}`;
      if(entry.sourceUrl){const link=document.createElement('a');link.textContent=' View source';link.href=entry.sourceUrl;link.target='_blank';link.rel='noreferrer';source.append(link);}details.append(source);
      const table=document.createElement('table');const head=document.createElement('tr');for(const label of ['Field','Provider value','Source value','Conflict']){const cell=document.createElement('th');cell.textContent=label;head.append(cell);}table.append(head);
      for(const field of fields){if(entry[field]===undefined||entry[field]===null||Array.isArray(entry[field])&&!entry[field].length||entry[field]==='')continue;
        const row=document.createElement('tr');const provider=field==='title'?record.title:record.metadata[field]??'';const format=value=>Array.isArray(value)?value.map(entry=>typeof entry==='object'?`${entry.role}: ${entry.name}`:entry).join(', '):String(value??'');
        const conflict=Boolean(provider&&JSON.stringify(names(provider).map(identityKey).sort())!==JSON.stringify(names(entry[field]).map(identityKey).sort()));
        for(const value of [fieldLabel(field),format(provider),format(entry[field]),conflict?'Review differing evidence':'']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);
      }details.append(table);const technical=document.createElement('details');technical.className='source-selection-technical';const summary=document.createElement('summary');summary.textContent='Technical details';technical.append(summary);technical.addEventListener('toggle',()=>{if(technical.open&&!technical.querySelector('pre')){const raw=document.createElement('pre');raw.textContent=JSON.stringify(entry,null,2);technical.append(raw);}});details.append(technical);
      if(database.enrichmentHistory[entry.selectionRef]){const button=document.createElement('button'),status=document.createElement('p');button.type='button';button.textContent=`Undo ${sourceLabel(kind)} selection`;presentAction(button);button.addEventListener('click',()=>performAction({button,status,name:'Restoring the previous source selection...',task:()=>undo(entry.selectionRef)}).catch(()=>{}));details.append(button,status);}
    }
  }
  }
  details.addEventListener('toggle',()=>{if(!details.isConnected)return;state.evidenceOpen=details.open;if(details.open)populate();});
  if(state.evidenceOpen){details.open=true;populate();}
  return details;
}
