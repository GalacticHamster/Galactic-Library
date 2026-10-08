import {bookToolHelp,metadataPreview,sourceLabel} from './book-tool-help.js';
import {enrichmentWorkbenchRows} from '../lib/enrichment-workbench.js';
import {accountLabel} from './item-presentation.js';

const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const labels={all:'All suggestions and gaps',missing:'Missing book information',candidates:'Suggestions to review',conflicts:'Conflicting suggestions',failed:'Lookups to retry',unparsed:'Contents to review',undo:'Saved sources to undo'};

export function createEnrichmentWorkbench(actions,{recordRefs=null,item=false}={}){
  const element=document.createElement('details');if(!item)element.id='enrichment-workbench';element.className=item?'tool-card item-enrichment-review':'tool-card';
  const heading=text('summary','Review book suggestions');const body=document.createElement('div');element.append(heading,body);body.append(bookToolHelp({purpose:'Review suggestions from lookups, files and publisher pages in one place.',input:'Saved lookup results and books still missing information.',saves:'Select a candidate, preview it, confirm the source, then Apply selected candidates to save up to 50 selections. Dismiss removes a suggestion; Undo selected enrichments restores earlier saved sources.',review:'Nothing here confirms a purchase or verifies collected contents. Conflicts must be resolved before applying an edition.',example:'Upload an EPUB, choose its queued suggestion, inspect the proposed author and series, then apply it after checking the edition.'}));
  const category=document.createElement('select');category.setAttribute('aria-label','Enrichment queue');
  for(const [key,label]of Object.entries(labels))if(!item||!['missing','unparsed'].includes(key))category.append(Object.assign(text('option',label),{value:key}));
  const search=document.createElement('input');search.type='search';search.placeholder='Filter enrichment titles';search.setAttribute('aria-label','Filter enrichment titles');
  const status=text('p','');status.setAttribute('role','status');const counter=text('p','');
  const list=document.createElement('ol');list.className='review-items';
  const controls=document.createElement('p');controls.className='actions';body.append(category,search,controls,status,counter,list);
  if(item){category.hidden=true;search.hidden=true;controls.hidden=true;}
  const choices=new Map(),selected=new Set();let rows=[];let currentRecords=new Map();let busy=false;let page=0;let database,dirty=false;
  const button=(label,run)=>{const node=text('button',label);node.type='button';node.addEventListener('click',run);return node;};
  const perform=async operation=>{if(busy)return;busy=true;refresh();try{await operation();selected.clear();status.textContent='Saved.';await actions.refresh();}catch(error){status.textContent=error.message;}finally{busy=false;refresh();}};
  const apply=button('Apply selected candidates',()=>perform(()=>{
    const selections=rows.filter(row=>selected.has(row.id)&&row.review).map(row=>({reviewId:row.id,candidateIndex:choices.get(row.id),confirmed:true}));
    if(selections.length!==selected.size)throw new Error('Select candidate reviews only to apply metadata.');return actions.apply(selections);
  }));
  const dismiss=button('Dismiss selected reviews',()=>perform(()=>{
    const refs=rows.filter(row=>selected.has(row.id)&&row.review).map(row=>row.id);if(refs.length!==selected.size)throw new Error('Select pending reviews only to dismiss.');return actions.dismiss(refs);
  }));
  const undo=button('Undo selected enrichments',()=>perform(()=>{
    const refs=rows.filter(row=>selected.has(row.id)&&row.category==='undo').map(row=>row.id);if(refs.length!==selected.size)throw new Error('Select current selections only to undo.');return actions.undo(refs);
  }));
  controls.append(apply,dismiss,undo,button('Clear selection',()=>{selected.clear();refresh();}));
  const paging=document.createElement('p');paging.className='actions';body.append(paging);
  const previous=button('Previous page',()=>{page--;refresh();}),next=button('Next page',()=>{page++;refresh();});paging.append(previous,next);
  function refresh(){
    if(!element.open||element.closest('[data-workspace-panel]')?.hidden)return;
    if(dirty){
      currentRecords=new Map(Object.values(database.providerItems).filter(record=>!recordRefs||recordRefs.includes(record.recordRef)).map(record=>[record.recordRef,record]));rows=enrichmentWorkbenchRows(database,{recordRefs,includeContents:!item,includeMissing:!item});
      const current=new Set(rows.map(row=>row.id));for(const id of selected)if(!current.has(id))selected.delete(id);for(const id of choices.keys())if(!current.has(id))choices.delete(id);
      heading.textContent=`${item?'Review suggestions for this item':'Review book suggestions'} — ${rows.filter(row=>row.review||row.category==='unparsed').length} pending`;dirty=false;
    }
    const filtered=rows.filter(row=>(category.value==='all'||row.category===category.value)&&row.title.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
    page=Math.min(Math.max(page,0),Math.max(0,Math.ceil(filtered.length/50)-1));previous.disabled=busy||page===0;next.disabled=busy||(page+1)*50>=filtered.length;
    for(const node of [apply,dismiss,undo])node.disabled=busy||!selected.size||selected.size>50;
    counter.textContent=item?filtered.length?`${filtered.length} saved suggestions and source selections. Check a candidate before accepting it. Dismiss removes a pending suggestion, not provider data.`:'No pending book suggestions for this item. Request a lookup above or use a file or publisher page.':`${filtered.length} entries; page ${page+1} of ${Math.max(1,Math.ceil(filtered.length/50))}; ${selected.size} selected (maximum 50). Selection is confirmation for each chosen source.`;
    if(item)paging.hidden=filtered.length<=50;
    list.replaceChildren();
    for(const row of filtered.slice(page*50,(page+1)*50)){
      const node=document.createElement('li');node.dataset.reviewId=row.id;node.append(text('strong',row.title),text('small',labels[row.category]),text('p',row.reason));
      if(item)node.append(text('p','Applies to: '+row.recordRefs.map(ref=>currentRecords.get(ref)).filter(Boolean).map(record=>accountLabel(record,database)).join('; ')));
      let selectable=row.category==='undo'||Boolean(row.review);let choice;
      if(row.review?.candidates.length){
        choice=document.createElement('select');choice.setAttribute('aria-label','Choose enrichment candidate');choice.append(Object.assign(text('option','Choose a source candidate'),{value:''}));
        row.review.candidates.forEach((candidate,index)=>choice.append(Object.assign(text('option',[candidate.title,candidate.subtitle,candidate.authors?.join(', '),candidate.publisher,candidate.language,candidate.isbn?.join(', ')].filter(Boolean).join(' · ')),{value:String(index)})));
        choice.value=choices.has(row.id)?String(choices.get(row.id)):'';
        choice.addEventListener('change',()=>{choices.delete(row.id);if(choice.value!=='')choices.set(row.id,Number(choice.value));selected.delete(row.id);refresh();});node.append(choice);
        const candidate=row.review.candidates[choices.get(row.id)];
        if(candidate){
          node.append(metadataPreview(row.recordRefs.map(ref=>currentRecords.get(ref)).filter(Boolean),candidate,row.review.source));
          node.append(text('p',`${sourceLabel(candidate.source)} · ${candidate.fileName||candidate.editionKey||candidate.volumeId||candidate.workKey||''} · retrieved ${candidate.retrievedAt||row.review.checkedAt||'unknown'}`));
          for(const field of ['series','volume','issue','run','edition','contributors','categories','statement'])if(candidate[field]?.length)node.append(text('p',`${field}: ${Array.isArray(candidate[field])?candidate[field].map(value=>typeof value==='object'?`${value.role}: ${value.name}`:value).join(', '):candidate[field]}`));
          if(candidate.sourceUrl){const link=text('a','View source');link.href=candidate.sourceUrl;link.target='_blank';link.rel='noreferrer';node.append(link);}
          if(row.conflicts[choices.get(row.id)]?.length)node.append(text('p',`Cannot apply: conflicting ${row.conflicts[choices.get(row.id)].join(', ')}. Inspect or undo existing evidence first.`));
        }
      }
      if(selectable){
        const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Select enrichment review');check.checked=selected.has(row.id);check.disabled=busy;
        const index=choices.get(row.id),dismissOnly=choice&&(index===undefined||row.conflicts[index]?.length);
        check.addEventListener('change',()=>{if(check.checked)selected.add(row.id);else selected.delete(row.id);refresh();});label.append(check,row.category==='undo'?' Undo this source selection':dismissOnly?' Select review for dismissal':choice?` I checked the source and it describes this ${row.review.source==='openLibrary'?'work':'edition'}.`:' Dismiss this lookup result');node.append(label);
      }
      if(!item){const inspect=button('Review library item',()=>actions.inspect(row.recordRefs,row.category));inspect.disabled=busy;node.append(inspect);}
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
  category.addEventListener('change',()=>{page=0;refresh();});search.addEventListener('input',()=>{page=0;refresh();});element.addEventListener('toggle',refresh);
  return {element,showTitle(title){category.value='all';search.value=title;page=0;element.open=true;refresh();},update(next){if(database!==next){database=next;dirty=true;heading.textContent=item?'Review suggestions for this item':'Review book suggestions';}refresh();}};
}
