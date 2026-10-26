import {labeledControl} from './form-presentation.js';
import {performAction} from './operation-feedback.js';
import {presentAction} from './form-presentation.js';
import {formatDate,countLabel} from './formatters.js';
import {bookToolHelp,metadataPreview,sourceLabel} from './book-tool-help.js';
import {enrichmentWorkbenchRows} from '../lib/enrichment-workbench.js';
import {accountLabel} from './item-presentation.js';
import {REVIEW_LABELS as labels,REVIEW_TASKS,reviewCategory,reviewTaskForCategory,matchesReviewCategory,reviewWorkflowCounts,reviewWorkflowSummary} from './review-workflow.js';
import {groupContents} from './contents-display.js';
import {contentsConfirmationToken} from '../lib/contents-confirmation.js';
import {strictDatabaseSerialization} from '../lib/validation-certificate.js';

const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});


export function createEnrichmentWorkbench(actions,{recordRefs=null,item=false}={}){
  const element=document.createElement('details');if(!item)element.id='enrichment-workbench';element.className=item?'tool-card item-enrichment-review':'tool-card';
  const heading=text('summary','Review book suggestions');const body=document.createElement('div');element.append(heading,body);body.append(bookToolHelp({heading:'How suggestion review works',purpose:'Review suggestions from lookups, files and publisher pages in one place.',input:item?'Saved lookup results and source selections for the accounts shown on this item.':'Saved lookup results and books still missing information.',saves:item?'Choose a candidate, preview it, confirm the source, then Accept suggestion. Dismiss suggestion removes a pending result; Undo source selection restores its predecessor for the indicated account.':'Check an issue list, select it, then Confirm selected. Book information has separate candidate selection and Apply controls. Source choices can be undone under Review history / Undo.',review:item?'Book information suggestions do not confirm purchases or included works. Check edition conflicts before applying.':'Confirm selected saves only the issue lists you checked. This does not confirm purchases or prove complete book contents. Book information sources have separate apply and undo actions.',example:'Upload an EPUB, choose its queued suggestion, inspect the proposed author and series, then apply it after checking the edition.'}));
  const task=document.createElement('select');task.setAttribute('aria-label','Review task');
  for(const [value,group]of Object.entries(REVIEW_TASKS))task.append(Object.assign(text('option',group.label),{value}));
  task.value=item?'all':'ready';
  const category=document.createElement('select');category.setAttribute('aria-label','Review category');
  for(const [key,label]of Object.entries(labels))if(!item||!['missing','unparsed'].includes(key))category.append(Object.assign(text('option',label),{value:key}));
  category.value=item?'all':'contents-suggestions';
  const configureCategories=()=>{for(const option of category.options)option.hidden=!REVIEW_TASKS[task.value].categories.includes(option.value);};configureCategories();
  const search=document.createElement('input');search.type='search';search.placeholder='Find a title';search.setAttribute('aria-label','Find a title');
  const status=text('p','');status.setAttribute('role','status');const counter=text('p',''),totals=text('p','');totals.className='muted';
  const list=document.createElement('ol');list.className='review-items';const empty=text('p','');empty.className='review-empty';empty.hidden=true;
  const controls=document.createElement('p');controls.className='actions';const taskLabel=labeledControl('Review task',task),categoryLabel=labeledControl('Show',category),searchLabel=labeledControl('Find a title',search);body.append(totals,taskLabel,categoryLabel,searchLabel,controls,status,counter,empty,list);
  if(item){taskLabel.hidden=true;categoryLabel.hidden=true;searchLabel.hidden=true;controls.hidden=true;}
  const choices=new Map(),selected=new Set(),selectedContents=new Map();let rows=[];let currentRecords=new Map();let busy=false;let page=0;let database,dirty=false,previewGeneration=0,previewDialog=null,preparing=false,autoCategory=!item;
  const button=(label,run)=>{const node=text('button',label);node.type='button';node.addEventListener('click',run);return presentAction(node);};
  const perform=async operation=>{if(busy)return;busy=true;refresh();try{await performAction({status,name:'Saving selected book suggestions...',task:async()=>{await operation();selected.clear();await actions.refresh();}});}catch{/* Shared status retains the error. */}finally{busy=false;refresh();}};
  const apply=button('Apply selected candidates',()=>perform(()=>{
    const selections=rows.filter(row=>selected.has(row.id)&&row.review).map(row=>({reviewId:row.id,candidateIndex:choices.get(row.id),confirmed:true}));
    if(selections.length!==selected.size)throw new Error('Select candidate reviews only to apply metadata.');return actions.apply(selections);
  }));
  const dismiss=button('Dismiss selected reviews',()=>perform(()=>{
    const refs=rows.filter(row=>selected.has(row.id)&&row.review).map(row=>row.id);if(refs.length!==selected.size)throw new Error('Select pending reviews only to dismiss.');return actions.dismiss(refs);
  }));
  const undo=button('Undo selected source choices',()=>perform(()=>{
    const refs=rows.filter(row=>selected.has(row.id)&&row.category==='undo').map(row=>row.id);if(refs.length!==selected.size)throw new Error('Select current selections only to undo.');return actions.undo(refs);
  }));
  controls.append(apply,dismiss,undo,button('Clear selection',()=>{selected.clear();refresh();}));
  const contentsControls=text('div','');contentsControls.className='actions contents-confirmation-controls';body.insertBefore(contentsControls,status);
  const selectPage=button('Select all on page',()=>{if(busy)return;invalidatePreview();for(const row of visibleRows()){if(row.contentsConfirmation?.eligible&&!selectedContents.has(row.id)){if(selectedContents.size===50){status.textContent='Confirm up to 50 book lists at once.';break;}selectedContents.set(row.id,{row,record:currentRecords.get(row.recordRefs[0])});}}refresh();});
  const confirmSelected=button('Confirm selected',()=>prepareConfirmation());
  contentsControls.append(selectPage,confirmSelected,button('Clear contents selection',()=>{if(busy)return;invalidatePreview();selectedContents.clear();refresh();}));
  const visibleRows=()=>rows.filter(row=>matchesReviewCategory(row,category.value)&&row.title.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())).slice(page*50,(page+1)*50);
  function invalidatePreview(){if(preparing||previewDialog)status.textContent='Confirmation closed. The current lists must be checked again before saving.';previewGeneration++;if(previewDialog){previewDialog.close();previewDialog.remove();previewDialog=null;}}
  async function prepareConfirmation(){
    if(busy||!selectedContents.size)return;const generation=++previewGeneration,chosen=[...selectedContents.values()];preparing=true;busy=true;refresh();status.textContent='Preparing confirmation...';
    try{
      const requests=await Promise.all(chosen.map(async({record,row})=>({itemId:record.id,recordRef:record.recordRef,token:await contentsConfirmationToken(record,row.contentsConfirmation.value),confirmed:true})));
      if(generation!==previewGeneration)return;
      const dialog=text('dialog','');previewDialog=dialog;dialog.className='contents-confirmation-dialog';dialog.setAttribute('aria-label','Confirm selected contents');
      const entries=chosen.reduce((sum,{row})=>sum+row.contentsConfirmation.value.entries.length,0);
      dialog.append(text('h2','Confirm selected contents'),text('p',`${chosen.length} book records / ${entries} issue entries. Confirm only the lists you checked. This does not establish that each list covers the whole book, and does not change purchases or access.`));
      const summaries=text('ul','');for(const {row,record} of chosen){const li=text('li',row.title+' / '+accountLabel(record,database));for(const group of groupContents(row.contentsConfirmation.value.entries))li.append(text('p',group.text));summaries.append(li);}dialog.append(summaries);
      let submitting=false;const cancel=button('Cancel',()=>invalidatePreview());
      const save=button('Confirm these lists',async()=>{
        if(submitting||generation!==previewGeneration)return;submitting=true;save.disabled=true;save.textContent='Confirming lists...';status.textContent='Saving the selected contents lists...';cancel.disabled=true;dialog.setAttribute('aria-busy','true');busy=true;refresh();
        try{
          const result=await actions.confirmContents(requests);
          const succeeded=result.results.filter(r=>r.status!=='failed'),failed=result.results.filter(r=>r.status==='failed');
          for(const entry of succeeded)selectedContents.delete('contents:'+entry.recordRef);
          database=result.database;dirty=true;invalidatePreview();await actions.refresh?.();
          status.replaceChildren(text('span',`${succeeded.length} book lists confirmed / ${failed.length} failed.`));
          for(const failure of failed){const title=chosen.find(c=>c.record.recordRef===failure.recordRef)?.row.title??'Selected book';status.append(text('span',' '+title+': '+failure.message));}
        }catch(error){dialog.append(text('p','Nothing is reported as confirmed. '+error.message+' You can retry; previously committed identical reviews will not be saved twice.'));save.disabled=false;save.textContent='Confirm these lists';cancel.disabled=false;submitting=false;}
        finally{busy=false;dialog.removeAttribute('aria-busy');refresh();}
      });
      dialog.addEventListener('cancel',event=>{event.preventDefault();if(!submitting)invalidatePreview();});dialog.append(save,cancel);document.body.append(dialog);dialog.showModal();save.focus();status.textContent='Check the book lists in the confirmation window before saving.';
    }catch(error){status.textContent='Could not prepare confirmation: '+error.message;}finally{preparing=false;busy=false;refresh();}
  }
  const paging=document.createElement('p');paging.className='actions';body.append(paging);
  const previous=button('Previous page',()=>{page--;refresh();}),next=button('Next page',()=>{page++;refresh();});paging.append(previous,next);
  function refresh(){
    if(!element.open||element.closest('[data-workspace-panel]')?.hidden)return;
    if(dirty){
      currentRecords=new Map(Object.values(database.providerItems).filter(record=>!recordRefs||recordRefs.includes(record.recordRef)).map(record=>[record.recordRef,record]));rows=enrichmentWorkbenchRows(database,{recordRefs,includeContents:!item,includeMissing:!item});
      const current=new Set(rows.map(row=>row.id));for(const id of selected)if(!current.has(id))selected.delete(id);for(const id of choices.keys())if(!current.has(id))choices.delete(id);
      const counts=reviewWorkflowCounts(rows);
      for(const [id,{record}]of selectedContents){const row=rows.find(r=>r.id===id);if(!row?.contentsConfirmation?.eligible||!currentRecords.has(record.recordRef)||strictDatabaseSerialization(currentRecords.get(record.recordRef))!==strictDatabaseSerialization(record))selectedContents.delete(id);}
      totals.textContent=reviewWorkflowSummary(counts)+'. Confirming contents is optional; eligible inferred issues may already contribute to coverage.';
      heading.textContent=`${item?'Review suggestions for this item':'Review book suggestions'} - ${countLabel(counts.readyBooks,'book list ready','book lists ready')} / ${countLabel(counts.metadataSuggestions,'information suggestion')}`;
      heading.title='Book lists, metadata suggestions, optional gaps and history are separate kinds of records.';dirty=false;
    }
    if(autoCategory&&task.value==='ready'){category.value=rows.some(r=>reviewCategory(r)==='contents-suggestions')?'contents-suggestions':'candidates';autoCategory=false;}
    const filtered=rows.filter(row=>matchesReviewCategory(row,category.value)&&row.title.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
    page=Math.min(Math.max(page,0),Math.max(0,Math.ceil(filtered.length/50)-1));previous.disabled=busy||page===0;next.disabled=busy||(page+1)*50>=filtered.length;
    task.disabled=busy;category.disabled=busy;search.disabled=busy;
    contentsControls.hidden=item||!selectedContents.size&&!filtered.some(row=>row.contentsConfirmation?.eligible);
    selectPage.disabled=busy||!visibleRows().some(row=>row.contentsConfirmation?.eligible);confirmSelected.disabled=busy||!selectedContents.size;
    confirmSelected.textContent=selectedContents.size?'Confirm selected ('+selectedContents.size+')':'Confirm selected';
    controls.hidden=item||!selected.size&&!filtered.some(row=>row.review||row.category==='undo');
    for(const node of [apply,dismiss,undo])node.disabled=busy||!selected.size||selected.size>50;
    counter.textContent=item?filtered.length?`${countLabel(filtered.length,'saved suggestion or source selection','saved suggestions and source selections')}. Check a candidate before accepting it. Dismiss removes a pending suggestion, not provider data.`:'No pending book suggestions for this item. Request a lookup above or use a file or publisher page.':`${countLabel(filtered.length,'entry','entries')}; page ${page+1} of ${Math.max(1,Math.ceil(filtered.length/50))}; ${[selectedContents.size?selectedContents.size+' book lists selected':'',selected.size?selected.size+' information/source records selected':''].filter(Boolean).join(' / ')||'Nothing selected'} (maximum 50 per action). Nothing changes until you confirm or apply.`;
    if(item)paging.hidden=filtered.length<=50;
    apply.hidden=category.value==='undo'||category.value==='review-history';dismiss.hidden=apply.hidden;undo.hidden=!selected.size&&!filtered.some(row=>row.category==='undo');
    list.replaceChildren();
    empty.hidden=Boolean(filtered.length);empty.textContent=task.value==='ready'?'No lists or suggestions ready here. Use Needs more information, Conflicts and changes, or Review history / Undo for other records.':'No records match this task and search.';
    for(const row of filtered.slice(page*50,(page+1)*50)){
      const node=document.createElement('li');node.dataset.reviewId=row.id;node.append(text('strong',row.title),text('small',labels[reviewCategory(row)]),text('p',row.contentsConfirmation?.eligible?'Suggested issue list (not yet confirmed).':row.reason));
      if(row.contentsConfirmation?.eligible){
        const proposed=text('ul','');proposed.className='contents-queue-issues';for(const group of groupContents(row.contentsConfirmation.value.entries))proposed.append(text('li',group.text));node.append(proposed,text('p',row.contentsConfirmation.reason));const evidence=text('details','');evidence.append(text('summary','Description supporting this list'),text('blockquote',row.contentsConfirmation.value.statement));node.append(evidence);
        const label=text('label',''),check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Select contents suggestion');check.checked=selectedContents.has(row.id);check.disabled=busy;
        check.addEventListener('change',()=>{invalidatePreview();if(check.checked&&selectedContents.size>=50){status.textContent='Confirm up to 50 book lists at once.';}else if(check.checked)selectedContents.set(row.id,{row,record:currentRecords.get(row.recordRefs[0])});else selectedContents.delete(row.id);refresh();});label.append(check,' I checked this issue list');node.append(label);
      }else if(row.category==='unparsed'&&row.contentsState==='suggestions')node.append(text('p',row.contentsConfirmation.reason));
      if(row.history){
        node.append(text('p',sourceLabel(row.history.kind)+': '+(row.history.previous?'Undo restores the previous saved source.':'Undo removes this added source; there is no preceding source to restore.')));
        const technical=text('details','');technical.append(text('summary','Technical details'));technical.addEventListener('toggle',()=>{if(technical.open&&!technical.querySelector('pre'))technical.append(text('pre',JSON.stringify(row.history.technical,null,2)));});node.append(technical);
      }
      if(row.category==='review-history'){node.append(text('p','Undo removes the saved contents review or rejection. Original source evidence and purchases are kept; retained reference decisions still apply.'));const undoReview=button('Undo contents review',()=>perform(()=>actions.undoContents(row.itemId)));undoReview.disabled=busy;node.append(undoReview);}
      if(item)node.append(text('p','Applies to: '+row.recordRefs.map(ref=>currentRecords.get(ref)).filter(Boolean).map(record=>accountLabel(record,database)).join('; ')));
      let selectable=row.category==='undo'||Boolean(row.review);let choice;
      if(row.review?.candidates.length){
        choice=document.createElement('select');choice.setAttribute('aria-label','Choose book information candidate');choice.append(Object.assign(text('option','Choose a source candidate'),{value:''}));
        row.review.candidates.forEach((candidate,index)=>choice.append(Object.assign(text('option',[candidate.title,candidate.subtitle,candidate.authors?.join(', '),candidate.publisher,candidate.language,candidate.isbn?.join(', ')].filter(Boolean).join(' · ')),{value:String(index)})));
        choice.value=choices.has(row.id)?String(choices.get(row.id)):'';
        choice.addEventListener('change',()=>{choices.delete(row.id);if(choice.value!=='')choices.set(row.id,Number(choice.value));selected.delete(row.id);refresh();});node.append(choice);
        const candidate=row.review.candidates[choices.get(row.id)];
        if(candidate){
          node.append(metadataPreview(row.recordRefs.map(ref=>currentRecords.get(ref)).filter(Boolean),candidate,row.review.source,database));
          node.append(text('p',`${sourceLabel(candidate.source)} · ${candidate.fileName||candidate.editionKey||candidate.volumeId||candidate.workKey||''} · retrieved ${formatDate(candidate.retrievedAt||row.review.checkedAt)}`));
          for(const field of ['series','volume','issue','run','edition','contributors','categories','statement'])if(candidate[field]?.length)node.append(text('p',`${field}: ${Array.isArray(candidate[field])?candidate[field].map(value=>typeof value==='object'?`${value.role}: ${value.name}`:value).join(', '):candidate[field]}`));
          if(candidate.sourceUrl){const link=text('a','View source');link.href=candidate.sourceUrl;link.target='_blank';link.rel='noreferrer';node.append(link);}
          if(row.conflicts[choices.get(row.id)]?.length)node.append(text('p',`Cannot apply: conflicting ${row.conflicts[choices.get(row.id)].join(', ')}. Inspect or undo existing evidence first.`));
        }
      }
      if(selectable){
        const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Select book information review');check.checked=selected.has(row.id);check.disabled=busy;
        const index=choices.get(row.id),dismissOnly=choice&&(index===undefined||row.conflicts[index]?.length);
        check.addEventListener('change',()=>{if(check.checked)selected.add(row.id);else selected.delete(row.id);refresh();});label.append(check,row.category==='undo'?' Undo this source selection':dismissOnly?' Select review for dismissal':choice?` I checked the source and it describes this ${row.review.source==='openLibrary'?'work':'edition'}.`:' Dismiss this lookup result');node.append(label);
      }
      if(!item){const inspect=button(row.category==='unparsed'||row.category==='review-history'?'Review details':'Review library item',()=>actions.inspect(row.recordRefs,row.category==='review-history'?'unparsed':row.category));inspect.disabled=busy;node.append(inspect);}
      if(item&&row.review){
        const accept=button('Accept suggestion',()=>perform(()=>actions.apply([{reviewId:row.id,candidateIndex:choices.get(row.id),confirmed:true}])));
        accept.disabled=busy||!selected.has(row.id)||choices.get(row.id)===undefined||Boolean(row.conflicts[choices.get(row.id)]?.length);
        const dismiss=button('Dismiss suggestion',()=>perform(()=>actions.dismiss([row.id])));dismiss.disabled=busy;node.append(accept,dismiss);
      }
      if(item&&row.category==='undo'){const undo=button('Undo source selection',()=>perform(()=>actions.undo([row.id])));undo.disabled=busy;node.append(undo);}
      if(row.review&&row.category==='failed'&&row.review.source!=='localMetadata'){const retry=button('Retry lookup',()=>perform(()=>actions.retry(row.review)));retry.disabled=busy;node.append(retry);}
      list.append(node);
    }
  }
  task.addEventListener('change',()=>{invalidatePreview();autoCategory=true;category.value=REVIEW_TASKS[task.value].categories[0];configureCategories();page=0;refresh();});
  category.addEventListener('change',()=>{invalidatePreview();autoCategory=false;task.value=reviewTaskForCategory(category.value);configureCategories();page=0;refresh();});search.addEventListener('input',()=>{invalidatePreview();page=0;refresh();});element.addEventListener('toggle',refresh);
  return {element,showCategory(value){if(!labels[value])return;invalidatePreview();autoCategory=false;task.value=reviewTaskForCategory(value);configureCategories();category.value=value;search.value='';page=0;element.open=true;refresh();},showTitle(title){invalidatePreview();autoCategory=false;task.value='all';configureCategories();category.value='all';search.value=title;page=0;element.open=true;refresh();},update(next){if(database!==next){invalidatePreview();database=next;dirty=true;heading.textContent=item?'Review suggestions for this item':'Review book suggestions';}refresh();}};
}
