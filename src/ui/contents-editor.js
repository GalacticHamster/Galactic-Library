import {bookToolHelp} from './book-tool-help.js';
import { contentsStatement, validateContents } from '../lib/contents.js';
import {manifestReviewProposal} from '../lib/kindle-manifest.js';
import {independentContentsClaims} from '../lib/kindle-evidence-review.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
function sourcePage(value) {
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?`${url.origin}${url.pathname}`:'';}catch{return '';}
}
export function createContentsEditor(record, review, actions, {expanded=false}={}) {
  const root=document.createElement('details');root.className='contents-editor';
  root.append(element('summary', `Review included contents \u2014 ${record.title}`));
  let populated=false;
  const populate=()=>{
  root.append(bookToolHelp({purpose:'Review the issues, volumes or named components included in this edition.',input:'The original contents statement plus the scope and language of each proposed entry.',saves:'Parsing creates editable suggestions only. Save verified contents confirms the entries you reviewed.',review:'Check every entry and mark excerpts as excerpts. Named suggestions do not become library-title matches. Verified full entries can establish scoped coverage only when the collection is owned.',example:'Includes Wool, Shift and Dust produces named suggestions; check the original edition before confirming anything.'}));
  root.append(element('p','Check the suggested entries and mark partial material as excerpts before saving.'));
  const evidence=record.metadata?.enrichment?.kindleProductComicContents;
  const interpretedEvidence=evidence?.manifest?manifestReviewProposal(evidence,record.title):null;
  const discovered=interpretedEvidence?.manifestEvidence||contentsStatement(record);
  const statement=document.createElement('textarea');statement.value=review?.statement||discovered;statement.rows=3;statement.maxLength=10000;statement.setAttribute('aria-label','Original contents statement');
  const source=document.createElement('input');source.type='url';source.value=sourcePage(review?.sourceUrl||record.metadata?.enrichment?.kindleProductComicContents?.sourceUrl||record.metadata?.enrichment?.localMetadata?.sourceUrl||record.metadata?.detailUrl);source.placeholder='Source page URL (optional)';source.setAttribute('aria-label','Contents source page');
  const sourceDetails=document.createElement('details');sourceDetails.className='contents-source-details';
  sourceDetails.append(element('summary','Where this information came from'),element('p','Captured suggestions are separate from your saved human review. Changing the text below changes only this draft until you save.'),element('label','Description / contents statement'),statement,element('label','Source page'),source);
  sourceDetails.append(element('p',`From: ${evidence?'Kindle / Amazon product description':discovered?'File or publisher metadata':'No captured statement'}; last acquired: ${evidence?.checkedAt||'not recorded'}. ${review?'Human review saved: '+(review.verifiedAt||'date not recorded')+'.':''}`));
  const advanced=document.createElement('details');advanced.className='contents-advanced';advanced.append(element('summary','Advanced contents evidence'));
  const interpretation=element('p','');advanced.append(interpretation);
  root.append(sourceDetails,advanced);
  const status=element('p','');status.setAttribute('role','status');
  const table=document.createElement('table');const head=document.createElement('thead');const heading=document.createElement('tr');
  for(const title of ['Series or collection','Series version / year','Type','Number / name','Language','Extent',''])heading.append(element('th',title));
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
  const initialProposal=interpretedEvidence??(discovered?manifestReviewProposal(evidence,record.title,discovered,{series:record.metadata?.series}):null);
  for(const entry of review?.entries??initialProposal?.entries??[])addRow(entry);
  if(review)status.textContent=`${review.entries.length} reviewed entries saved. Edit to correct them, or undo confirmation.`;
  else if(initialProposal)status.textContent=`${initialProposal.entries.length} suggested entries · Not verified. ${initialProposal.unparsed.length?`Unresolved text: ${initialProposal.unparsed.join('; ')}`:'Check every entry before saving.'}${initialProposal.descriptionMayBeIncomplete?' Amazon description may have been incomplete; later contents may be missing.':''}`;
  else status.textContent='No contents statement is available. You can enter contents from a source you have checked. Automated Kindle acquisition and recovery belong on the signed-in Kindle page.';
  if(initialProposal)interpretation.textContent=`Local interpretation: ${initialProposal.outcome}; ${initialProposal.qualityReason} Context: ${initialProposal.parseBinding}. Proposal input: ${initialProposal.parseInput}`;
  if(review&&initialProposal?.unparsed.length)root.append(element('p','Original captured description still has unresolved material: '+initialProposal.unparsed.join('; ')+'. Your reviewed entries remain separate.'));
  if(review&&initialProposal?.descriptionMayBeIncomplete)root.append(element('p','The captured description may be incomplete. Your human review is retained; it is not proof that the description lists everything in the book.'));
  const button=(label,onClick)=>{const node=element('button',label);node.type='button';node.addEventListener('click',onClick);return node;};
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
    claims.append(element('p','Each library item has one saved contents review. Saving a different claim replaces that review; it does not add to it. Loading a claim only changes the editor until you save.'));
    for(const claim of independent.claims){
      const section=document.createElement('section');section.dataset.claimIndex=String(claim.index);section.dataset.sourceBlock=String(claim.block);section.dataset.sourceStart=String(claim.start);section.dataset.sourceEnd=String(claim.end);
      section.append(element('p',`Separate claim: local parse ${claim.proposal.outcome}; ${claim.proposal.entries.length} proposed entries; ${claim.proposal.unparsed.length} unresolved fragments.`),element('blockquote',claim.raw));
      if(claim.qualifiers.length)section.append(element('p',`Source qualifiers: ${claim.qualifiers.join('; ')}. Check the material and extent; these are not normal full-work ownership claims.`));
      if(claim.parserInput!==claim.raw)section.append(element('p','Contextual input for this claim:'),element('blockquote',claim.parserInput));
      section.append(button('Load this claim for review',()=>{
        loadedClaim=claim;statement.value=claim.raw;source.value=sourcePage(evidence?.sourceUrl||record.metadata?.detailUrl);body.replaceChildren();
        status.textContent='One separate claim loaded. Parse and check it before saving. Editor rows were cleared; your saved verified contents remain unchanged. Other claims have not been combined.';
      }));claims.append(section);
    }
    advanced.append(claims);
  }
  if(evidence?.manifest){
    const details=document.createElement('details');details.append(element('summary','Captured collection text (not verified)'));
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
    advanced.append(details);
  }
  if (review && discovered && discovered !== review.statement) {
    sourceDetails.append(element('p','New discovery differs from your reviewed statement. Your verified entries remain unchanged.'),element('blockquote',discovered),
      button('Use newly discovered statement',()=>{statement.value=discovered;source.value=sourcePage(record.metadata?.enrichment?.kindleProductComicContents?.sourceUrl||record.metadata?.enrichment?.localMetadata?.sourceUrl||record.metadata?.detailUrl);status.textContent='New text loaded for review. Parse or edit it before saving; existing verification has not changed.';}));
  }
  root.append(button('Parse statement for review',()=>{
    const proposed=loadedClaim&&statement.value===loadedClaim.raw?loadedClaim.proposal:manifestReviewProposal(evidence,record.title,statement.value,{series:record.metadata?.series});body.replaceChildren();proposed.entries.forEach(addRow);
    status.textContent=`${proposed.entries.length} suggested entries · Not verified. ${proposed.outcome==='filtered'?'This text did not identify included works. ':proposed.outcome==='uncertain'?'This description needs human review. ':''}${proposed.descriptionMayBeIncomplete?'Amazon description may have been incomplete; later contents may be missing. ':''}${proposed.unparsed.length?`Review unresolved text: ${proposed.unparsed.join('; ')}`:'Check every entry and extent before saving.'}`;
    interpretation.textContent=`Local interpretation: ${proposed.outcome}; ${proposed.qualityReason} Context: ${proposed.parseBinding}. Proposal input: ${proposed.parseInput}`;
  }),button('Add contents entry',()=>addRow()),table);
  root.append(button('Save verified contents',()=>persist(async()=>{
      const entries=[...body.rows].map(row=>Object.fromEntries([...row.querySelectorAll('[data-contents-field]')].map(input=>[input.dataset.contentsField,input.value])));
      await actions.save(record.id,{entries:validateContents(entries),statement:statement.value,sourceUrl:source.value,source:'manual-review'});
  })));
  if(review)root.append(button('Undo contents confirmation',()=>persist(()=>actions.remove(record.id))));
  root.append(element('p','Correct an entry directly or remove a wrong suggestion before saving. Undo removes human confirmation, not captured evidence. There is no saved rejection of a captured source statement; leaving suggestions unconfirmed does not establish contents coverage.'),status);
  };
  root.addEventListener('toggle',()=>{if(root.open&&!populated){populated=true;populate();}});
  if(expanded){root.open=true;populated=true;populate();}
  return root;
}
