import {labeledControl,presentAction} from './form-presentation.js';
import {createContentsInterpretation} from './contents-interpretation.js';
import {formatDate} from './formatters.js';
import { contentsStatement, validateContents } from '../lib/contents.js';
import {manifestReviewProposal} from '../lib/kindle-manifest.js';
import {independentContentsClaims} from '../lib/kindle-evidence-review.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
function sourcePage(value) {
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?`${url.origin}${url.pathname}`:'';}catch{return '';}
}
export function createContentsEditor(record, review, actions, {expanded=false}={}) {
  const root=document.createElement('details');root.className='contents-editor';
  root.append(element('summary', expanded?'Review included works':`Review included contents \u2014 ${record.title}`));
  let populated=false;
  const populate=()=>{
  const help=element('details','');help.className='book-tool-help';help.append(element('summary','How contents review works'));
  const steps=element('ol','');for(const instruction of ['GL suggests included works from a book’s description.','Check names, numbers, series version, language and whether each entry is a full work or an excerpt. Correct anything wrong or missing.','Save the entries you reviewed. A reviewed list is not necessarily everything in the book.'])steps.append(element('li',instruction));
  help.append(steps,element('p','Reviewing contents does not change ownership or add separate purchases of the included works. Comparisons use qualifying owned copies, including your existing ownership preferences.'));root.append(element('p','Check the suggested included works before saving.'),help);
  const evidence=record.metadata?.enrichment?.kindleProductComicContents;
  const interpretedEvidence=evidence?.manifest?manifestReviewProposal(evidence,record.title):null;
  const discovered=interpretedEvidence?.manifestEvidence||contentsStatement(record);
  const statement=document.createElement('textarea');statement.value=review?.statement||discovered;statement.rows=3;statement.maxLength=10000;statement.setAttribute('aria-label','Original contents statement');
  const source=document.createElement('input');source.type='url';source.value=sourcePage(review?.sourceUrl||record.metadata?.enrichment?.kindleProductComicContents?.sourceUrl||record.metadata?.enrichment?.localMetadata?.sourceUrl||record.metadata?.detailUrl);source.placeholder='Source page URL (optional)';source.setAttribute('aria-label','Contents source page');
  const sourceDetails=document.createElement('details');sourceDetails.className='contents-source-details';
  sourceDetails.append(element('summary','Where this information came from'),element('p','Captured suggestions are separate from your saved human review. Changing the text below changes only this draft until you save.'),labeledControl('Description / contents statement',statement),labeledControl('Source page',source));
  sourceDetails.append(element('p',`From: ${evidence?'Kindle / Amazon product description':discovered?'File or publisher metadata':'No captured statement'}; Captured: ${formatDate(evidence?.checkedAt)}. ${review?'Human review saved: '+(formatDate(review.verifiedAt))+'.':''}`));
  const advanced=document.createElement('details');advanced.className='contents-advanced';advanced.append(element('summary','Advanced contents evidence'));
  const interpretation=element('div','');advanced.append(interpretation);
  const showInterpretation=proposal=>interpretation.replaceChildren(createContentsInterpretation({statement:proposal.manifestEvidence||statement.value,proposal,reviewed:Boolean(review),capturedAt:evidence?.checkedAt,technical:{capturedEvidence:evidence}}));
  root.append(sourceDetails,advanced);
  const status=element('p','');status.setAttribute('role','status');
  const table=document.createElement('table');const head=document.createElement('thead');const heading=document.createElement('tr');
  for(const title of ['Series or collection','Series version / year','Type','Number / name','Language','Extent',''])heading.append(element('th',title));
  head.append(heading);table.append(head);const body=document.createElement('tbody');table.append(body);
  let nextRow=0;const addRow=(entry={})=>{
    const rowNumber=++nextRow,row=document.createElement('tr');
    for(const key of ['series','run','unitType','number','language','completeness']){
      const cell=document.createElement('td');let input;
      if(['unitType','completeness'].includes(key)){
        input=document.createElement('select');
        for(const value of key==='unitType'?['issue','volume','annual','special','component']:['full','excerpt']){
          const option=element('option',({issue:'Issue',volume:'Volume',annual:'Annual',special:'Special',component:'Named work',full:'Full included work',excerpt:'Excerpt'})[value]);option.value=value;input.append(option);
        }
        input.value=entry[key]||(key==='unitType'?'issue':'full');
      }else{input=document.createElement('input');input.value=entry[key]??'';input.maxLength=500;}
      input.dataset.contentsField=key;input.setAttribute('aria-label',({series:'Series or collection',run:'Series version or year',unitType:'Included work type',number:'Issue/volume number or work name',language:'Language',completeness:'Full work or excerpt'})[key]+' for entry '+rowNumber);cell.append(input);row.append(cell);
    }
    const remove=element('button','Remove');remove.type='button';presentAction(remove);remove.addEventListener('click',()=>row.remove());const cell=document.createElement('td');cell.append(remove);row.append(cell);body.append(row);
  };
  const initialProposal=interpretedEvidence??(discovered?manifestReviewProposal(evidence,record.title,discovered,{series:record.metadata?.series}):null);
  for(const entry of review?.entries??initialProposal?.entries??[])addRow(entry);
  if(review)status.textContent=`${review.entries.length} reviewed entries saved. Edit to correct them, or undo the review.`;
  else if(initialProposal)status.textContent=`${initialProposal.entries.length} suggested entries · Not reviewed. ${initialProposal.unparsed.length?`Unresolved text: ${initialProposal.unparsed.join('; ')}`:'Check every entry before saving.'}${initialProposal.descriptionMayBeIncomplete?' Amazon description may have been incomplete; later contents may be missing.':''}`;
  else status.textContent='No contents statement is available. You can enter contents from a source you have checked. Automated Kindle acquisition and recovery belong on the signed-in Kindle page.';
  if(initialProposal)showInterpretation(initialProposal);
  if(review&&initialProposal?.unparsed.length)root.append(element('p','Original captured description still has unresolved material: '+initialProposal.unparsed.join('; ')+'. Your reviewed entries remain separate.'));
  if(review&&initialProposal?.descriptionMayBeIncomplete)root.append(element('p','The captured description may be incomplete. Your human review is retained; it is not proof that the description lists everything in the book.'));
  const button=(label,onClick)=>{const node=element('button',label);node.type='button';node.addEventListener('click',onClick);return presentAction(node);};
  let saving=false;
  const persist=async operation=>{
    if(saving)return;saving=true;
    const controls=[...root.querySelectorAll('button,input,select,textarea')].map(node=>[node,node.disabled]);for(const [node] of controls)node.disabled=true;
    try{await operation();actions.refresh();}
    catch(error){status.textContent=`Could not save contents: ${error.message}`;}
    finally{saving=false;for(const [node,disabled] of controls)node.disabled=disabled;}
  };
  let loadedClaim=null;
  const independent=independentContentsClaims(evidence,record.title);
  if(independent.claims.length){
    const claims=document.createElement('details');claims.className='contents-independent-evidence';
    claims.append(element('summary',`Other captured claims to review (${independent.claims.length})`),element('p','These candidates come from separate source claims. They may describe contents, supplements, credits or unrelated prose. Full applies only to the primary claim; it does not account for these other claims or prove complete book contents. Claims are not combined or verified.'));
    claims.append(element('p','Each library item has one saved contents review. Saving a different claim replaces that review; it does not add to it. Replace draft clears unsaved entry rows and loads that statement. Your saved review stays unchanged until Save.'));
    for(const claim of independent.claims){
      const section=document.createElement('section');section.dataset.claimIndex=String(claim.index);section.dataset.sourceBlock=String(claim.block);section.dataset.sourceStart=String(claim.start);section.dataset.sourceEnd=String(claim.end);
      section.append(createContentsInterpretation({statement:claim.raw,proposal:claim.proposal,capturedAt:evidence?.checkedAt,technical:{candidateIndex:claim.index,block:claim.block,start:claim.start,end:claim.end,contextualInput:claim.parserInput}}));
      if(claim.qualifiers.length)section.append(element('p',`Source qualifiers: ${claim.qualifiers.join('; ')}. Check the material and extent; these are not normal full-work ownership claims.`));

      section.append(button('Replace draft with this statement',()=>{
        loadedClaim=claim;statement.value=claim.raw;source.value=sourcePage(evidence?.sourceUrl||record.metadata?.detailUrl);body.replaceChildren();
        status.textContent='Draft replaced with this separate statement and entry rows cleared. Parse and check it before saving. Your saved reviewed contents remain unchanged. Other statements have not been combined.';
      }));claims.append(section);
    }
    advanced.append(claims);
  }
  if(evidence?.manifest){
    const details=document.createElement('details');details.className='contents-manifest-technical';details.append(element('summary','Technical details of captured statements')); 
    details.append(element('p','Full means the selected source manifest was parsed without unresolved text; it does not establish complete book contents or ownership. Windows linked to one explicit collection clause are interpreted using their parent source statement. Other independent clauses remain separate and unverified.'));
    const interpreted=manifestReviewProposal(evidence,record.title);
    if(interpreted.manifestEvidence){
      details.append(element('p','Source manifest used for proposals (unverified):'),element('blockquote',interpreted.manifestEvidence));
      if(interpreted.manifestEvidence!==evidence.statement)details.append(button('Use complete captured collection statement',()=>{statement.value=interpreted.manifestEvidence;status.textContent='Whole source manifest loaded for review. Parse and check its unresolved evidence before saving; your saved review has not changed.';}));
    }
    for(const index of [evidence.manifest.selected,...evidence.manifest.secondary]){
      const candidate=evidence.manifest.candidates[index];if(!candidate)continue;
      details.append(element('p',`${index===evidence.manifest.selected?'Selected':'Additional'}: ${candidate.whole?(candidate.truncated?'bounded portion of source manifest; ':'whole source manifest; '):candidate.manifestRange?'segment of one source manifest; ':''}local parse ${candidate.outcome}; ${candidate.binding}.`),element('blockquote',candidate.raw));
      if(candidate.parserInput!==candidate.raw)details.append(element('p','Contextual input used for the proposal:'),element('blockquote',candidate.parserInput));
    }
    advanced.append(details);
  }
  if (review && discovered && discovered !== review.statement) {
    sourceDetails.append(element('p','New discovery differs from your reviewed statement. Your reviewed entries remain unchanged.'),element('blockquote',discovered),
      button('Use newly discovered statement',()=>{statement.value=discovered;source.value=sourcePage(record.metadata?.enrichment?.kindleProductComicContents?.sourceUrl||record.metadata?.enrichment?.localMetadata?.sourceUrl||record.metadata?.detailUrl);status.textContent='New text loaded for review. Parse or edit it before saving; your saved review has not changed.';}));
  }
  const tableScroll=element('div','');tableScroll.className='contents-table-scroll';tableScroll.tabIndex=0;tableScroll.setAttribute('role','region');tableScroll.setAttribute('aria-label','Included works editor: scroll horizontally for all fields');tableScroll.append(table);
  root.append(button('Parse statement for review',()=>{
    const proposed=loadedClaim&&statement.value===loadedClaim.raw?loadedClaim.proposal:manifestReviewProposal(evidence,record.title,statement.value,{series:record.metadata?.series});body.replaceChildren();proposed.entries.forEach(addRow);
    status.textContent=`${proposed.entries.length} suggested entries · Not reviewed. ${proposed.outcome==='filtered'?'This text did not identify included works. ':proposed.outcome==='uncertain'?'This description needs human review. ':''}${proposed.descriptionMayBeIncomplete?'Amazon description may have been incomplete; later contents may be missing. ':''}${proposed.unparsed.length?`Review unresolved text: ${proposed.unparsed.join('; ')}`:'Check every entry and extent before saving.'}`;
    showInterpretation(proposed);
  }),button('Add contents entry',()=>addRow()),element('p','Scroll the entry table to see every field. Series version/year and language help distinguish editions.'),tableScroll);
  root.append(button('Save reviewed contents',()=>persist(async()=>{
      const entries=[...body.rows].map(row=>Object.fromEntries([...row.querySelectorAll('[data-contents-field]')].map(input=>[input.dataset.contentsField,input.value])));
      await actions.save(record.id,{entries:validateContents(entries),statement:statement.value,sourceUrl:source.value,source:'manual-review'});
  })));
  if(review)root.append(button('Undo contents review',()=>persist(()=>actions.remove(record.id))));
  root.append(element('p','Correct an entry directly or remove a wrong suggestion before saving. Undo removes human confirmation, not captured evidence. Leaving a suggestion unreviewed does not confirm that it is included.'),status);
  };
  root.addEventListener('toggle',()=>{if(root.open&&!populated){populated=true;populate();}});
  if(expanded){root.open=true;populated=true;populate();}
  return root;
}
