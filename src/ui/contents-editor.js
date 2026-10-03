import {bookToolHelp} from './book-tool-help.js';
import { contentsStatement, proposeContents, validateContents } from '../lib/contents.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
function sourcePage(value) {
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?`${url.origin}${url.pathname}`:'';}catch{return '';}
}
export function createContentsEditor(record, review, actions) {
  const root=document.createElement('details');root.className='contents-editor';
  root.append(element('summary', `Review included issues or volumes \u2014 ${record.title}`));
  let populated=false;
  const populate=()=>{
  root.append(bookToolHelp({purpose:'Record the full issues or volumes included in this edition.',input:'A contents statement from the book or its publisher, plus the series run and language for each entry.',saves:'Parsing creates editable suggestions only. Save verified contents confirms the entries you reviewed.',review:'Check every entry and mark excerpts as excerpts. Verified full entries can establish coverage only when the collection is owned. Undo contents confirmation removes that coverage.',example:'For ?Collects Example Series #1?6?, check the run/year and language, and confirm that each is a complete issue.'}));
  root.append(element('p','Confirm the actual contents of this edition. Excerpts do not count as owning a full issue or volume. Include the series/run and language to establish complete coverage.'));
  const statement=document.createElement('textarea');statement.value=review?.statement||contentsStatement(record);statement.rows=3;statement.maxLength=10000;statement.setAttribute('aria-label','Original contents statement');
  const source=document.createElement('input');source.type='url';source.value=sourcePage(review?.sourceUrl||record.metadata?.enrichment?.kindleProductComicContents?.sourceUrl||record.metadata?.enrichment?.localMetadata?.sourceUrl||record.metadata?.detailUrl);source.placeholder='Source page URL (optional)';source.setAttribute('aria-label','Contents source page');
  root.append(element('label','Original contents statement'),statement,element('label','Evidence source'),source);
  const status=element('p','');status.setAttribute('role','status');
  const table=document.createElement('table');const head=document.createElement('thead');const heading=document.createElement('tr');
  for(const title of ['Series','Run / year','Type','Number / name','Language','Extent',''])heading.append(element('th',title));
  head.append(heading);table.append(head);const body=document.createElement('tbody');table.append(body);
  const addRow=(entry={})=>{
    const row=document.createElement('tr');
    for(const key of ['series','run','unitType','number','language','completeness']){
      const cell=document.createElement('td');let input;
      if(['unitType','completeness'].includes(key)){
        input=document.createElement('select');
        for(const value of key==='unitType'?['issue','volume','annual','special','component']:['full','excerpt']){
          const option=element('option',value);option.value=value;input.append(option);
        }
        input.value=entry[key]||(key==='unitType'?'issue':'full');
      }else{input=document.createElement('input');input.value=entry[key]??'';input.maxLength=500;}
      input.dataset.contentsField=key;input.setAttribute('aria-label',key);cell.append(input);row.append(cell);
    }
    const remove=element('button','Remove');remove.type='button';remove.addEventListener('click',()=>row.remove());const cell=document.createElement('td');cell.append(remove);row.append(cell);body.append(row);
  };
  for(const entry of review?.entries??[])addRow(entry);
  const button=(label,onClick)=>{const node=element('button',label);node.type='button';node.addEventListener('click',onClick);return node;};
  root.append(button('Parse statement for review',()=>{
    const proposed=proposeContents(statement.value);body.replaceChildren();proposed.entries.forEach(addRow);
    status.textContent=`${proposed.entries.length} proposed entries. ${proposed.unparsed.length?`Review unparsed text: ${proposed.unparsed.join('; ')}`:'Check every entry before saving.'}`;
  }),button('Add contents entry',()=>addRow()),table);
  root.append(button('Save verified contents',async()=>{
    try{
      const entries=[...body.rows].map(row=>Object.fromEntries([...row.querySelectorAll('[data-contents-field]')].map(input=>[input.dataset.contentsField,input.value])));
      await actions.save(record.id,{entries:validateContents(entries),statement:statement.value,sourceUrl:source.value,source:'manual-review'});actions.refresh();
    }catch(error){status.textContent=`Could not save contents: ${error.message}`;}
  }));
  if(review)root.append(button('Undo contents confirmation',async()=>{try{await actions.remove(record.id);actions.refresh();}catch(error){status.textContent=error.message;}}));
  root.append(status);
  };
  root.addEventListener('toggle',()=>{if(root.open&&!populated){populated=true;populate();}});
  return root;
}
