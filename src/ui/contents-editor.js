import {bookToolHelp} from './book-tool-help.js';
import { contentsStatement, proposeContentsForReview, validateContents } from '../lib/contents.js';
import {manifestReviewProposal} from '../lib/kindle-manifest.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
function sourcePage(value) {
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?`${url.origin}${url.pathname}`:'';}catch{return '';}
}
export function createContentsEditor(record, review, actions) {
  const root=document.createElement('details');root.className='contents-editor';
  root.append(element('summary', `Review included contents \u2014 ${record.title}`));
  let populated=false;
  const populate=()=>{
  root.append(bookToolHelp({purpose:'Review the issues, volumes or named components included in this edition.',input:'The original contents statement plus the scope and language of each proposed entry.',saves:'Parsing creates editable suggestions only. Save verified contents confirms the entries you reviewed.',review:'Check every entry and mark excerpts as excerpts. Named suggestions do not become library-title matches. Verified full entries can establish scoped coverage only when the collection is owned.',example:'Includes Wool, Shift and Dust produces named suggestions; check the original edition before confirming anything.'}));
  root.append(element('p','Discovery and parsing do not verify contents. Check every name or number. Excerpts cannot establish full-unit ownership; missing run or language prevents complete coverage.'));
  const evidence=record.metadata?.enrichment?.kindleProductComicContents;
  const interpretedEvidence=evidence?.manifest?manifestReviewProposal(evidence,record.title):null;
  const discovered=interpretedEvidence?.manifestEvidence||contentsStatement(record);
  const statement=document.createElement('textarea');statement.value=review?.statement||discovered;statement.rows=3;statement.maxLength=10000;statement.setAttribute('aria-label','Original contents statement');
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
  if(evidence?.manifest){
    const details=document.createElement('details');details.append(element('summary','Discovered manifest evidence (unverified)'));
    details.append(element('p','Full means the selected source manifest was parsed without unresolved text; it does not establish complete book contents or ownership. Windows linked to one explicit collection clause are interpreted using their parent source statement. Other independent clauses remain separate and unverified.'));
    const interpreted=manifestReviewProposal(evidence,record.title);
    if(interpreted.manifestEvidence){
      details.append(element('p','Source manifest used for proposals (unverified):'),element('blockquote',interpreted.manifestEvidence));
      if(interpreted.manifestEvidence!==evidence.statement)details.append(button('Use whole source manifest',()=>{statement.value=interpreted.manifestEvidence;status.textContent='Whole source manifest loaded for review. Parse and check its unresolved evidence before saving; existing verification has not changed.';}));
    }
    for(const index of [evidence.manifest.selected,...evidence.manifest.secondary]){
      const candidate=evidence.manifest.candidates[index];if(!candidate)continue;
      details.append(element('p',`${index===evidence.manifest.selected?'Selected':'Additional'}: ${candidate.whole?(candidate.truncated?'bounded portion of source manifest; ':'whole source manifest; '):candidate.manifestRange?'segment of one source manifest; ':''}local parse ${candidate.outcome}; ${candidate.binding}.`),element('blockquote',candidate.raw));
      if(candidate.parserInput!==candidate.raw)details.append(element('p','Contextual input used for the proposal:'),element('blockquote',candidate.parserInput));
    }
    root.append(details);
  }
  if (review && discovered && discovered !== review.statement) {
    root.append(element('p','New discovery differs from your reviewed statement. Your verified entries remain unchanged.'),element('blockquote',discovered),
      button('Use newly discovered statement',()=>{statement.value=discovered;source.value=sourcePage(record.metadata?.enrichment?.kindleProductComicContents?.sourceUrl||record.metadata?.enrichment?.localMetadata?.sourceUrl||record.metadata?.detailUrl);status.textContent='New text loaded for review. Parse or edit it before saving; existing verification has not changed.';}));
  }
  root.append(button('Parse statement for review',()=>{
    const proposed=manifestReviewProposal(evidence,record.title,statement.value,{series:record.metadata?.series});body.replaceChildren();proposed.entries.forEach(addRow);
    status.textContent=`${proposed.outcome==='filtered'?'Filtered non-containment':proposed.outcome==='uncertain'?'Uncertain candidate':proposed.outcome==='full'?'Structurally parsed proposal; not verified':proposed.outcome==='partial'?'Partially parsed proposal':'Unresolved containment'}. ${proposed.qualityReason} ${proposed.descriptionMayBeIncomplete?'Amazon description may have been incomplete; later contents may be missing. ':''}${proposed.entries.length} proposed entries. ${proposed.unparsed.length?`Review unresolved text: ${proposed.unparsed.join('; ')}`:'Check every entry and extent before saving.'}`;
    if(proposed.parseBinding!=='explicit-statement')status.textContent+=` Context: ${proposed.parseBinding}. Proposal input: ${proposed.parseInput}`;
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
