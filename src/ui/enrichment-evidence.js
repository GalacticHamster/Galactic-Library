import {identityKey,names} from '../lib/identity.js';

export function createEnrichmentEvidence(records,database,undo){
  const details=document.createElement('details');details.className='enrichment-evidence';
  const heading=document.createElement('summary');heading.textContent='Enrichment evidence and undo';details.append(heading);
  const fields=['title','subtitle','authors','contributors','publisher','publishers','isbn','language','series','volume','issue','unitType','run','edition','format','publishedDate','pageCount','subjects','categories','statement'];
  for(const record of records){
    for(const [kind,entry]of Object.entries(record.metadata?.enrichment??{})){
      const source=document.createElement('p');source.textContent=`${record.title} · ${kind} · ${entry.approved?'human approved':'source/automatic evidence'} · ${entry.matchBasis??'legacy basis unknown'} · retrieved ${entry.retrievedAt??entry.checkedAt??entry.appliedAt??'unknown'}`;
      if(entry.sourceUrl){const link=document.createElement('a');link.textContent=' View source';link.href=entry.sourceUrl;link.target='_blank';link.rel='noreferrer';source.append(link);}details.append(source);
      const table=document.createElement('table');const head=document.createElement('tr');for(const label of ['Field','Provider value','Source value','Conflict']){const cell=document.createElement('th');cell.textContent=label;head.append(cell);}table.append(head);
      for(const field of fields){if(entry[field]===undefined||entry[field]===null||Array.isArray(entry[field])&&!entry[field].length||entry[field]==='')continue;
        const row=document.createElement('tr');const provider=field==='title'?record.title:record.metadata[field]??'';const format=value=>Array.isArray(value)?value.map(entry=>typeof entry==='object'?`${entry.role}: ${entry.name}`:entry).join(', '):String(value??'');
        const conflict=Boolean(provider&&JSON.stringify(names(provider).map(identityKey).sort())!==JSON.stringify(names(entry[field]).map(identityKey).sort()));
        for(const value of [field,format(provider),format(entry[field]),conflict?'Review differing evidence':'']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);
      }details.append(table);
      if(database.enrichmentHistory[entry.selectionRef]){const button=document.createElement('button');button.type='button';button.textContent=`Undo ${kind} selection`;button.addEventListener('click',async()=>{button.disabled=true;try{await undo(entry.selectionRef);}catch(error){source.textContent=error.message;button.disabled=false;}});details.append(button);}
    }
  }
  return details;
}
