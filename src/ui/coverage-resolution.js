import {createConfirmation} from './confirmation.js';
import {newResolutionPublication,resolutionCandidates,compatibleResolutionCollections,coverageResolutionRequest,previewCoverageResolutions,resolutionStamp} from '../lib/coverage-resolution.js';
import {loadCoverageProjection} from './collection-overlap-projection.js';
import {groupContents} from './contents-display.js';
import {accountLabel} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
import {createContentsEditor} from './contents-editor.js';
import {createPagination} from './pagination.js';
const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(label,run)=>{const b=el('button',label);b.type='button';b.addEventListener('click',run);return b;};
const componentState=o=>o.actionable?'unresolved':o.countedFull||o.countedPartial?'resolved':'information';
const groupKey=o=>JSON.stringify([o.resolved.series,o.resolved.run,o.resolved.unitType,o.resolved.language,componentState(o)]);
function referenceControls(row,reference,database,actions){
 const root=el('div');root.className='coverage-reference';root.dataset.coverageReference=reference.key;
 const notice=el('p');notice.className='operation-status';notice.setAttribute('role','status');root.append(el('blockquote',reference.fragment));
 if(reference.ignored)root.append(el('p',reference.decision.reason==='incorrect-extraction'?'Ignored: Incorrect extraction':'Ignored: Not included contents'));
 for(const [reason,label]of reference.ignored?[['restore','Restore']]:[['incorrect-extraction','Incorrect extraction'],['not-included','Not included contents']])root.append(button(label,async()=>{
  if(actions.canLeave?.()===false)return;const controls=root.querySelectorAll('button');for(const c of controls)c.disabled=true;actions.referenceBusy?.(true);notice.textContent=reason==='restore'?'Restoring reference...':'Saving reference decision...';notice.setAttribute('aria-busy','true');
  let saved=false;try{
   if(!actions.saveReference)throw Error('Reopen Options to save reference decisions.');
   const record=database.providerItems[row.id],next=await actions.saveReference({recordRef:row.recordRef,key:reference.key,reason,expected:resolutionStamp(record,database)});saved=true;for(const c of controls)c.dataset.locked='true';
   const projection=await loadCoverageProjection(next,'comic-coverage',actions.merges??{});await actions.resolved?.(next,projection);
   notice.textContent=reason==='restore'?'Reference restored.':'Reference ignored. Parsed issues and ownership are unchanged.';
  }catch(error){notice.textContent=(saved?'Saved, but coverage could not refresh. Reopen this view: ':'Could not save: ')+error.message;if(!saved)for(const c of controls)c.disabled=false;}
  finally{notice.setAttribute('aria-busy','false');actions.referenceBusy?.(false);}
 }));root.append(notice);return root;
}
export function coverageDispositionSummary(row){
 const s=row.summary,parts=[s.parsed+' parsed',s.full+' counted'+(s.partial?' · '+s.partial+' partial':'')];
 if(s.excluded)parts.push('Not owned: '+row.ownership);
 else if(s.provisional)parts.push('Publication unresolved');
 const refs=row.references.filter(r=>r.actionable).length;if(refs)parts.push(refs+' unresolved source reference'+(refs===1?'':'s'));
 if(row.rejected)return 'Suggestions explicitly excluded';
 return parts.join(' · ');
}
export function createCoverageDisposition(row,database,projection,actions={}){
 const root=el('div');root.className='contents-coverage-disposition';root.dataset.coverageRecord=row.recordRef;
 root.append(el('p',coverageDispositionSummary(row)));
 const inspect=el('details');inspect.append(el('summary','Coverage details'));
 let built=false;inspect.addEventListener('toggle',()=>{if(!inspect.open||built)return;built=true;
  const groups=new Map();for(const o of row.observations){const label=o.countedFull?'Counted full':o.countedPartial?'Partial coverage':o.provisional?'Provisional':'Excluded',key=JSON.stringify([o.resolved.series,o.resolved.run,o.resolved.unitType,o.extent,label,o.reasons]);const value=groups.get(key)??{entries:[],label,reasons:o.reasons};value.entries.push(o.resolved);groups.set(key,value);}
  for(const g of groups.values()){const section=el('p',g.label+': '+groupContents(g.entries).map(g=>g.text).join('; '));if(g.reasons.length)section.append(el('span',' — '+g.reasons.map(r=>r.explanation).join(' ')));inspect.append(section);}
  for(const r of row.references)inspect.append(el('p',r.fragment+' — '+r.explanation));
  if(row.rejected)inspect.append(el('p','A saved rejection excludes automatic suggestions. Open the contents editor to inspect or undo that decision.'));
 });root.append(inspect);
 const pending=row.references.filter(r=>!r.ignored&&r.actionable);if(pending.length){const references=el('details');references.append(el('summary','Unresolved references ('+pending.length+')'));for(const reference of pending)references.append(referenceControls(row,reference,database,actions));root.append(references);}
 const ignored=row.references.filter(r=>r.ignored);if(ignored.length){const section=el('details');section.append(el('summary','Ignored references ('+ignored.length+')'));for(const reference of ignored)section.append(referenceControls(row,reference,database,actions));root.append(section);}
 const canResolve=row.observations.some(o=>o.actions.includes('assign-run'))||row.references.some(r=>r.actionable);
 if(canResolve)(row.summary.actionable?root:inspect).append(button(row.summary.actionable?'Resolve coverage':'Change publication run',()=>{if(actions.canLeave?.()===false)return;openCoverageResolution(row,database,projection,actions);}));
 return root;
}
export function openCoverageResolution(initialRow,initialDatabase,initialProjection,actions={}){
 let database=initialDatabase,projection=initialProjection,row=initialRow,ids=[],target=null,preview=null,busy=false,persisted=false,issuePage=0,issueSize=50,preparing=false,preparation=0,editing=false;let draftTarget=null;const candidateCache=new Map(),relatedCache=new Map();
 const merges=actions.merges??{},dialog=el('dialog');dialog.className='coverage-resolution-dialog';dialog.setAttribute('aria-label','Resolve comic coverage');
 dialog.append(el('h3','Resolve coverage — '+row.title),el('p','Choose a publication for the selected contents. Saving uses the existing reviewed-contents record; other entries and the captured description stay unchanged. It does not change ownership.'));
 const summary=el('p',coverageDispositionSummary(row)),notice=el('p');notice.setAttribute('role','status');notice.className='operation-status';dialog.append(summary);
 const source=el('details');source.append(el('summary','Source and access evidence'),el('p',accountLabel(row,database)+' · '+row.ownership+' · '+row.confidence+' contents'),el('blockquote',row.statement||'No captured statement.'));dialog.append(source);
 const controls=el('section'),referenceArea=el('div'),groups=new Map();
 for(const o of row.observations.filter(o=>o.parsed&&o.origin==='contents')){const key=groupKey(o),g=groups.get(key)??[];g.push(o);groups.set(key,g);}
 const choose=el('select');choose.setAttribute('aria-label','Contents publication to resolve');
 const unresolved=el('optgroup'),resolved=el('optgroup'),informational=el('optgroup');unresolved.label='Needs resolution';resolved.label='Resolved - select to inspect or edit';informational.label='Excluded / informational';
 for(const [key,obs]of groups){const kind=componentState(obs[0]),section=kind==='unresolved'?unresolved:kind==='resolved'?resolved:informational;section.append(Object.assign(el('option',(kind==='unresolved'?'Unresolved: ':kind==='resolved'?'Resolved: ':'Informational: ')+obs[0].resolved.series+(obs[0].resolved.run?' ('+obs[0].resolved.run+')':'')+' - '+obs[0].resolved.unitType+' ('+obs.length+')'),{value:key}));}
 row.references.forEach((r,i)=>{if(!r.ignored&&!r.resolved)(r.actionable&&row.accessEligible?unresolved:informational).append(Object.assign(el('option',(r.actionable&&row.accessEligible?'Unresolved: ':'Informational: ')+r.fragment),{value:'reference:'+i}));});
 for(const section of [unresolved,resolved,informational])if(section.children.length)choose.append(section);
 choose.value=unresolved.querySelector('option')?.value??choose.querySelector('option')?.value??'';
 const issues=el('details');issues.append(el('summary','Choose individual observations'));const issueList=el('div'),issueCount=el('p');
 const pager=createPagination({name:'Resolution observations',onPage:p=>{issuePage=p;renderIssues();},onSize:s=>{issueSize=s;issuePage=0;renderIssues();}});issues.append(issueCount,pager.sizeContainer,pager.top,issueList,pager.bottom);
 const search=el('input');search.type='search';search.placeholder='Find a publication run';search.setAttribute('aria-label','Search publication runs');
 const candidates=el('select');candidates.size=5;candidates.setAttribute('aria-label','Publication run candidates');
 const why=el('p'),links=el('p'),bulk=el('div'),previewArea=el('div'),editorArea=el('div');let related=[],includeRelated=false;
 const previewButton=button('Preview coverage changes',previewChanges),save=button('Save reviewed contents',saveChanges),close=button('Close',()=>{if(!busy&&actions.canLeave?.()!==false)dialog.remove();});save.disabled=true;previewButton.dataset.coveragePreview='true';
 const creation=el('fieldset');creation.hidden=true;creation.id='new-publication-'+crypto.randomUUID();creation.append(el('legend','New publication run'));
 const seriesName=el('input'),startYear=el('input'),endYear=el('input'),creationStatus=el('p');creationStatus.setAttribute('role','status');
 seriesName.maxLength=500;for(const input of [startYear,endYear]){input.type='number';input.min='1000';input.max='9999';input.step='1';}
 function field(label,input){input.setAttribute('aria-label',label);const wrapper=el('label',label);wrapper.className='stacked-label';wrapper.append(input);return wrapper;}
 const runScope=el('p'),useRun=button('Use this publication run',stagePublication),cancelRun=button('Cancel new run',cancelCreation);
 creation.append(el('p','Define the publication containing the selected issues. This draft is saved only with Save reviewed contents. Original source text and other issues stay unchanged.'),field('Series title',seriesName),field('Starting year',startYear),field('Ending year (optional)',endYear),runScope,useRun,cancelRun,creationStatus);
 const createRun=button('Create new publication run',()=>{
  if(busy||preparing||!canCreateRun())return;draftTarget=null;target=null;cancelPreview();creation.hidden=false;createRun.setAttribute('aria-expanded','true');
  const current=groups.get(choose.value)?.[0]?.resolved,query=search.value.trim(),years=/^(.*?)\s*\((\d{4})(?:\s*[-\u2013\u2014]\s*(\d{4})?)?\)\s*$/u.exec(query);
  seriesName.value=years?.[1]?.trim()||(/^\d{4}$/u.test(query)?current?.series:query)||current?.series||'';startYear.value=years?.[2]??(/^\d{4}$/u.test(query)?query:'');endYear.value=years?.[3]??'';
  runScope.textContent='Issue type: '+current.unitType+'; language: '+(current.language||'en')+'. These stay the same as the selected contents.';creationStatus.textContent='Nothing has been saved.';refreshCandidates();seriesName.focus();
 });createRun.setAttribute('aria-expanded','false');createRun.setAttribute('aria-controls',creation.id);
 function canCreateRun(){const selected=row.observations.filter(o=>ids.includes(o.id));return !persisted&&selected.length>0&&selected.length===ids.length&&selected.every(o=>o.parsed&&o.origin==='contents'&&!o.protectedMerge);}
 function cancelCreation(){creation.hidden=true;createRun.setAttribute('aria-expanded','false');if(draftTarget){target=null;draftTarget=null;}cancelPreview();refreshCandidates();createRun.focus();}
 function stagePublication(){
  if(busy||preparing||!canCreateRun())return;
  try{draftTarget=newResolutionPublication(row,ids,{series:seriesName.value,startYear:startYear.value,endYear:endYear.value},projection.dispositions,database);target=draftTarget;creation.hidden=true;createRun.setAttribute('aria-expanded','false');refreshCandidates();candidates.focus();}
  catch(error){creationStatus.textContent=error.message;}
 }
 for(const input of [seriesName,startYear,endYear])input.addEventListener('input',()=>{draftTarget=null;target=null;cancelPreview();creationStatus.textContent='Draft changed. Use this publication run again before previewing.';refreshCandidates();});
 creation.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelCreation();}else if(event.key==='Enter'){event.preventDefault();stagePublication();}});
 const editExisting=button('Edit existing resolution',async()=>{
  const confirmation=createConfirmation({title:'Edit existing resolution?',message:'Replace the selected publication assignment only after previewing and saving. Other entries and original source evidence stay unchanged.',confirmLabel:'Edit assignment'});if(!await confirmation.result)return;editing=true;changeGroup(true);
 });
 const edit=button('Open contents editor',()=>{
  if(busy||actions.canLeave?.()===false)return;const record=database.providerItems[row.id];editorArea.replaceChildren(createContentsEditor(record,database.contentReviews?.[record.id],{
   save:async(id,value)=>{busy=true;setBusy();try{if(!actions.saveReview)throw Error('Open this collection in Contents to save a detailed review.');const next=await actions.saveReview(id,value);await reconcile(next);}finally{busy=false;setBusy();}},
   remove:async(id)=>{busy=true;setBusy();try{if(!actions.removeReview)throw Error('Open Contents to undo this review.');await reconcile(await actions.removeReview(id));}finally{busy=false;setBusy();}},refresh:()=>{}
  },{expanded:true,focusEntry:row.observations.find(o=>ids.includes(o.id))?.entryIndex}));editorArea.scrollIntoView?.({block:'nearest'});
 });
 const contents=el('a','Open source collection in Contents');contents.href=bookHref('contents',row.recordRef);
 contents.addEventListener('click',event=>{if(busy||actions.canLeave?.()===false)event.preventDefault();else dialog.remove();});
 const cancelPreview=()=>{preview=null;save.disabled=true;previewArea.replaceChildren();};
 function setBusy(){for(const n of controls.querySelectorAll('input,select,button'))n.disabled=busy||n.dataset.locked==='true';candidates.disabled=busy||preparing;previewButton.disabled=busy||preparing||!target||!ids.length||persisted;previewButton.textContent=preparing?'Preparing preview...':'Preview coverage changes';notice.setAttribute('aria-busy',String(preparing||busy));editExisting.disabled=busy||preparing;createRun.disabled=busy||preparing||!canCreateRun();useRun.disabled=busy||preparing||!canCreateRun();save.disabled=busy||!preview||persisted;close.disabled=busy;edit.disabled=busy;}
 function renderIssues(){
  const obs=groups.get(choose.value)??[];issuePage=pager.update({total:obs.length,page:issuePage,size:issueSize}).page;issueCount.textContent=ids.length+' selected';issueList.replaceChildren();
  for(const o of obs.slice(issuePage*issueSize,(issuePage+1)*issueSize)){const label=el('label'),check=el('input');check.type='checkbox';check.checked=ids.includes(o.id);const locked=o.protectedMerge||!o.actionable&&!editing;check.disabled=locked;check.dataset.locked=String(locked);check.dataset.resolutionObservation=o.id;check.addEventListener('change',()=>{ids=check.checked?[...ids,o.id]:ids.filter(id=>id!==o.id);cancelPreview();refreshCandidates();renderIssues();});label.append(check,' #'+o.resolved.number+' · '+(o.resolved.run||'run unresolved')+' · '+o.extent+(o.protectedMerge?' · controlled by a manual merge':''));issueList.append(label);}
 }
 function remember(cache,key,value){cache.set(key,value);if(cache.size>20)cache.delete(cache.keys().next().value);return value;}
 function candidatesForSelection(){const key=JSON.stringify(ids);if(!candidateCache.has(key))remember(candidateCache,key,resolutionCandidates(row,projection.dispositions,database,ids));const existing=candidateCache.get(key);return draftTarget&&!existing.some(t=>t.id===draftTarget.id)?[draftTarget,...existing]:existing.map(t=>t.id===draftTarget?.id?draftTarget:t);}
 async function refreshCandidates(){
  const token=++preparation;preparing=true;cancelPreview();bulk.replaceChildren();notice.textContent=ids.length?'Preparing preview... Validating the selected publication.':'Select an unresolved component, or explicitly edit a resolved assignment.';setBusy();
  // Give the browser a turn to show feedback before bounded bibliographic work.
  await new Promise(resolve=>setTimeout(resolve,0));if(token!==preparation||!dialog.isConnected)return;
  try{
   const all=ids.length?candidatesForSelection():[],matches=all.filter(c=>c.label.toLowerCase().includes(search.value.trim().toLowerCase()));target=all.find(c=>c.id===target?.id)??null;
   candidates.replaceChildren(...matches.slice(0,50).map(c=>Object.assign(el('option',c.label+(c.suggested?' - suggested':'')),{value:c.id})));candidates.value=target?.id??'';
   const current=groups.get(choose.value)?.[0]?.resolved;
   createRun.title=canCreateRun()?'Define the run for the selected contents.':'Select parsed issues from one publication; use the contents editor for references without issue details.';
   why.textContent=target?'Selected: '+target.label+'. '+target.evidence:!ids.length&&current?'Existing assignment: '+current.series+(current.run?' ('+current.run+')':'')+' - '+current.unitType+'. '+(componentState(groups.get(choose.value)[0])==='resolved'?'Choose Edit existing resolution to change it.':'Use the contents editor for excluded or informational material.'):!matches.length?'No publication runs match this search. Create a new publication run below, or change the search.':'Select an existing publication, or create the missing run below, then preview the changes.';
   if(!target&&ids.some(id=>id.startsWith('reference:')))why.textContent='Select an existing publication for this named reference. To define one with checked issue details, use Open contents editor.';
   links.replaceChildren();for(const url of target?.sources??[]){const link=el('a','Publication evidence');link.href=url;link.target='_blank';link.rel='noopener noreferrer';links.append(link,' ');}
   related=[];includeRelated=false;
   if(target&&!editing&&!target.newPublication){const key=JSON.stringify([ids,target.id,editing]);if(relatedCache.has(key)){related=relatedCache.get(key);renderRelated();}else bulk.append(button('Find matching collections',findRelated));}
   notice.textContent=target?'Ready to preview the selected changes.':ids.length?(matches.length?'Choose a target publication or create a new run.':'No matching run is available. Create a new publication run below.'):'Select an unresolved component, or choose Edit existing resolution.';
  }catch(error){target=null;notice.textContent='Could not prepare preview: '+error.message+'. Choose another component or reopen the dialog.';}
  finally{if(token===preparation){preparing=false;setBusy();}}
 }
 function renderRelated(){
  bulk.replaceChildren();if(!related.length){bulk.append(el('p','No other eligible matching collections.'));return;}
  const label=el('label'),check=el('input');check.type='checkbox';check.setAttribute('aria-label','Include compatible collections');check.addEventListener('change',()=>{includeRelated=check.checked;cancelPreview();});label.append(check,' Also apply '+target.label+' to '+related.length+' other matching collections');bulk.append(label,el('p','Same saved account, publisher and collection family; no reviewed, explicitly conflicting or manually merged entries. Nothing is applied until you preview and save.'));for(const other of related)bulk.append(el('p',other.collection.title+' - '+other.ids.length+' unresolved observations to '+target.label));
 }
 async function findRelated(){
  if(busy||preparing||!target)return;const token=++preparation;preparing=true;cancelPreview();notice.textContent='Checking matching collections... This optional check does not save anything.';setBusy();
  await new Promise(resolve=>setTimeout(resolve,0));if(token!==preparation||!dialog.isConnected)return;
  try{const key=JSON.stringify([ids,target.id,editing]);related=remember(relatedCache,key,compatibleResolutionCollections(row,ids,target,projection.dispositions,database));includeRelated=false;renderRelated();notice.textContent='Matching collections checked. Preview to review the exact changes.';}
  catch(error){notice.textContent='Could not check matching collections: '+error.message+'. You can still resolve this collection alone.';}
  finally{if(token===preparation){preparing=false;setBusy();}}
 }
 function changeGroup(keepEditing=false){
  referenceArea.replaceChildren();const selectedReference=choose.value.startsWith('reference:')?row.references[Number(choose.value.slice(10))]:null;if(selectedReference&&!selectedReference.ignored)referenceArea.append(referenceControls(row,selectedReference,database,{...actions,referenceBusy:value=>{busy=value;setBusy();},resolved:next=>reconcile(next)}));
  draftTarget=null;creation.hidden=true;createRun.setAttribute('aria-expanded','false');if(!keepEditing)editing=false;const obs=groups.get(choose.value)??[],reference=choose.value.startsWith('reference:')?row.references[Number(choose.value.slice(10))]:null;
  ids=reference?(reference.actionable&&row.accessEligible?[choose.value]:[]):obs.filter(o=>!o.protectedMerge&&(o.actionable||editing&&o.accessEligible)).map(o=>o.id);
  editExisting.hidden=!(obs.length&&obs.every(o=>componentState(o)==='resolved'&&!o.protectedMerge)&&!editing);target=null;issuePage=0;cancelPreview();renderIssues();refreshCandidates();
 }
 async function previewChanges(){
  if(busy||preparing||!target||!ids.length||actions.canLeave?.()===false)return;if(!editing&&row.observations.some(o=>ids.includes(o.id)&&!o.actionable)){notice.textContent='Select an unresolved component, or explicitly edit the existing resolution.';return;}busy=true;setBusy();notice.textContent='Calculating the coverage preview…';
  await new Promise(resolve=>setTimeout(resolve,0));
  try{const targets=[coverageResolutionRequest(row,ids,target,database),...(includeRelated?related.map(c=>coverageResolutionRequest(c.collection,c.ids,c.target,database)):[])],plan=previewCoverageResolutions(database,targets,{merges,dispositions:projection.dispositions});
   const result=await loadCoverageProjection(plan.database,'comic-coverage',merges);preview={confirmed:true,mergeStamp:JSON.stringify(merges),targets};previewArea.replaceChildren(el('h4','Changes to save'));
   for(const change of plan.changes){const after=result.dispositions.find(c=>c.recordRef===change.recordRef);previewArea.append(el('p',change.title+' — '+change.selected+' selected → '+change.target.label),el('p',coverageDispositionSummary(after)));}
   notice.textContent='Preview only. Save to confirm these exact collections and observations.';
  }catch(error){cancelPreview();notice.textContent='Could not preview: '+error.message;}finally{busy=false;setBusy();}
 }
 async function reconcile(next){
  if(!next?.providerItems)throw Error('The save did not return a committed library.');persisted=true;database=next;notice.textContent='Saved. Rechecking coverage…';
  projection=await loadCoverageProjection(database,'comic-coverage',merges);row=projection.dispositions.find(r=>r.recordRef===row.recordRef)??row;summary.textContent=coverageDispositionSummary(row);await actions.resolved?.(database,projection);notice.textContent='Saved and rechecked. '+coverageDispositionSummary(row);editorArea.replaceChildren();
 }
 async function saveChanges(){
  if(!preview||busy||persisted||actions.canLeave?.()===false)return;busy=true;setBusy();notice.textContent='Saving reviewed contents…';
  try{if(!actions.save)throw Error('Saving coverage corrections is unavailable here. Open Contents.');await reconcile(await actions.save(preview));}
  catch(error){notice.textContent=(persisted?'Saved, but coverage could not be rechecked: ':'Nothing was confirmed as saved: ')+error.message;if(persisted)notice.append(button('Recheck coverage',async()=>{try{await reconcile(database);}catch(e){notice.textContent='Saved; recheck failed: '+e.message;}}));}
  finally{busy=false;setBusy();}
 }
 controls.append(choose,referenceArea,editExisting,issues,search,candidates,why,createRun,creation,links,bulk,previewButton);dialog.append(controls,previewArea,notice,save,edit,contents,close,editorArea);choose.addEventListener('change',()=>changeGroup());search.addEventListener('input',()=>{cancelPreview();refreshCandidates();});candidates.addEventListener('change',()=>{target=candidatesForSelection().find(c=>c.id===candidates.value)??null;cancelPreview();refreshCandidates();});dialog.addEventListener('cancel',event=>{if(busy||actions.canLeave?.()===false)event.preventDefault();else dialog.remove();});document.body.append(dialog);dialog.showModal();changeGroup();choose.focus();return dialog;
}

export function createCoverageResolutionQueue(database,projection,actions={}){
 const state=actions.state??{};const root=el('details');root.className='coverage-resolution-queue';root.open=state.open??false;const summary=el('summary');root.append(summary);
 const filter=el('select');filter.setAttribute('aria-label','Coverage resolution category');for(const [value,label]of [['actionable','All actionable problems'],['run','Publication runs'],['identity','Publication identities'],['named','Named publications'],['enumeration','Incomplete enumeration'],['information','Access, partial and intentional exclusions']])filter.append(Object.assign(el('option',label),{value}));
 filter.value=state.category??'actionable';const list=el('div'),counter=el('p');let query=state.query??'',page=state.page??0,size=state.size??20;
 const pager=createPagination({name:'Coverage resolution collections',onPage:p=>{state.page=page=p;render();},onSize:s=>{state.size=size=s;state.page=page=0;render();}});root.append(el('h3','Parsed contents awaiting coverage resolution'),el('p','Unresolved observations remain outside owned, duplicate and missing totals. Access exclusions and partial material are informational, not errors.'),filter,counter,pager.sizeContainer,pager.top,list,pager.bottom);
 const ignoredSection=el('details'),ignoredList=el('div');ignoredSection.open=state.ignoredOpen??false;ignoredSection.append(el('summary','Ignored references'),ignoredList);root.append(ignoredSection);ignoredSection.addEventListener('toggle',()=>{if(root.isConnected)state.ignoredOpen=ignoredSection.open;});
 const actionable=projection.dispositions.filter(r=>r.summary.actionable>0),ignoredCount=projection.dispositions.reduce((n,r)=>n+r.references.filter(f=>f.ignored).length,0);summary.textContent='Coverage resolution — '+actionable.length+' collections need attention'+(ignoredCount?' - '+ignoredCount+' ignored references':'');
 function render(){
  const ignored=projection.dispositions.flatMap(row=>row.references.filter(r=>r.ignored&&[row.title,r.fragment].some(t=>t.toLowerCase().includes(query))).map(reference=>({row,reference})));ignoredSection.hidden=!ignoredCount;ignoredList.replaceChildren();let shown=0;const more=button('Show more ignored references',appendIgnored);function appendIgnored(){more.remove();for(const {row,reference}of ignored.slice(shown,shown+20)){const item=el('article');item.append(el('h4',row.title),referenceControls(row,reference,database,actions));ignoredList.append(item);}shown+=20;if(shown<ignored.length)ignoredList.append(more);}appendIgnored();if(!ignored.length)ignoredList.append(el('p','No ignored references match this search.'));
  const rows=projection.dispositions.filter(r=>{
   const codes=[...r.observations.flatMap(o=>o.actionable?o.reasons.map(r=>r.code):[]),...r.references.filter(f=>f.actionable&&r.accessEligible).map(f=>f.code)],kind=filter.value;
   const include=kind==='information'?(!r.summary.actionable&&(r.summary.partial||r.summary.excluded||r.rejected)):kind==='actionable'?r.summary.actionable:kind==='run'?codes.some(c=>c.startsWith('run-')||c==='annual-run-unresolved'):kind==='identity'?codes.includes('publication-unresolved'):kind==='named'?codes.includes('named-publication-unresolved'):codes.includes('enumeration-incomplete');
   const series=[...r.observations.flatMap(o=>[o.extracted.series,o.resolved.series]),...r.references.map(f=>f.fragment)],scope=actions.searchScope?.()??'all',titles=scope==='books'?[r.title]:scope==='series'?series:[r.title,r.provider,...series];return include&&titles.some(v=>v.toLowerCase().includes(query));
  });state.page=page=pager.update({total:rows.length,page,size}).page;counter.textContent=rows.length+' matching collections';list.replaceChildren();
  for(const row of rows.slice(page*size,(page+1)*size)){const card=el('article');card.className='tool-card';card.dataset.coverageResolution=row.recordRef;card.append(el('h4',row.title),el('p',accountLabel(row,database)),...groupContents(row.observations.filter(o=>o.parsed).map(o=>o.extracted)).map(g=>el('p',g.text)));
   const first=row.observations.find(o=>o.actionable&&o.origin==='contents'),ids=first?row.observations.filter(o=>groupKey(o)===groupKey(first)).map(o=>o.id):[],suggested=ids.length?resolutionCandidates(row,[],database,ids).find(c=>c.suggested):null;
   if(suggested){const hint=el('p','Suggested publication: '+suggested.label);hint.title=suggested.evidence;card.append(hint);}
   card.append(createCoverageDisposition(row,database,projection,actions));const link=el('a','Source contents');link.href=bookHref('contents',row.recordRef);card.append(link);list.append(card);}
  if(!rows.length)list.append(el('p','No collections match this category and search.'));
 }
 filter.addEventListener('change',()=>{state.category=filter.value;state.page=page=0;render();});root.refresh=()=>{filter.value=state.category??'actionable';render();};root.addEventListener('toggle',()=>{if(!root.isConnected)return;state.open=root.open;if(root.open)render();});root.updateQuery=value=>{const next=value.trim().toLowerCase();if(next!==query)page=0;state.query=query=next;if(query&&actionable.some(r=>[r.title,...r.observations.flatMap(o=>[o.resolved.series,o.extracted.series]),...r.references.map(f=>f.fragment)].some(t=>t.toLowerCase().includes(query))))root.open=true;state.open=root.open;if(root.open)render();};if(root.open)render();return root;
}
