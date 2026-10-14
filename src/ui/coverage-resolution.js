import {resolutionCandidates,compatibleResolutionCollections,coverageResolutionRequest,previewCoverageResolutions} from '../lib/coverage-resolution.js';
import {loadCoverageProjection} from './collection-overlap-projection.js';
import {groupContents} from './contents-display.js';
import {accountLabel} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
import {createContentsEditor} from './contents-editor.js';
import {createPagination} from './pagination.js';
const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(label,run)=>{const b=el('button',label);b.type='button';b.addEventListener('click',run);return b;};
const groupKey=o=>JSON.stringify([o.resolved.series,o.resolved.unitType,o.resolved.language]);
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
 const canResolve=row.observations.some(o=>o.actions.includes('assign-run'))||row.references.some(r=>r.actionable);
 if(canResolve)(row.summary.actionable?root:inspect).append(button(row.summary.actionable?'Resolve coverage':'Change publication run',()=>{if(actions.canLeave?.()===false)return;openCoverageResolution(row,database,projection,actions);}));
 return root;
}
export function openCoverageResolution(initialRow,initialDatabase,initialProjection,actions={}){
 let database=initialDatabase,projection=initialProjection,row=initialRow,ids=[],target=null,preview=null,busy=false,persisted=false,issuePage=0,issueSize=50;
 const merges=actions.merges??{},dialog=el('dialog');dialog.className='coverage-resolution-dialog';dialog.setAttribute('aria-label','Resolve comic coverage');
 dialog.append(el('h3','Resolve coverage — '+row.title),el('p','Choose a publication for the selected contents. Saving uses the existing reviewed-contents record; other entries and the captured description stay unchanged. It does not change ownership.'));
 const summary=el('p',coverageDispositionSummary(row)),notice=el('p');notice.setAttribute('role','status');dialog.append(summary);
 const source=el('details');source.append(el('summary','Source and access evidence'),el('p',accountLabel(row,database)+' · '+row.ownership+' · '+row.confidence+' contents'),el('blockquote',row.statement||'No captured statement.'));dialog.append(source);
 const controls=el('section'),groups=new Map();
 for(const o of row.observations.filter(o=>o.parsed&&o.origin==='contents')){const key=groupKey(o),g=groups.get(key)??[];g.push(o);groups.set(key,g);}
 const choose=el('select');choose.setAttribute('aria-label','Contents publication to resolve');
 for(const [key,obs]of groups)choose.append(Object.assign(el('option',obs[0].resolved.series+' — '+obs[0].resolved.unitType+' ('+obs.length+')'),{value:key}));
 row.references.forEach((r,i)=>{if(r.actionable)choose.append(Object.assign(el('option',r.fragment),{value:'reference:'+i}));});
 const preferred=row.observations.find(o=>o.actionable&&o.origin==='contents');if(preferred)choose.value=groupKey(preferred);
 const issues=el('details');issues.append(el('summary','Choose individual observations'));const issueList=el('div'),issueCount=el('p');
 const pager=createPagination({name:'Resolution observations',onPage:p=>{issuePage=p;renderIssues();},onSize:s=>{issueSize=s;issuePage=0;renderIssues();}});issues.append(issueCount,pager.sizeContainer,pager.top,issueList,pager.bottom);
 const search=el('input');search.type='search';search.placeholder='Find a publication run';search.setAttribute('aria-label','Search publication runs');
 const candidates=el('select');candidates.size=5;candidates.setAttribute('aria-label','Publication run candidates');
 const why=el('p'),links=el('p'),bulk=el('div'),previewArea=el('div'),editorArea=el('div');let related=[],includeRelated=false;
 const previewButton=button('Preview coverage changes',previewChanges),save=button('Save reviewed contents',saveChanges),close=button('Close',()=>{if(!busy&&actions.canLeave?.()!==false)dialog.remove();});save.disabled=true;
 const edit=button('Open contents editor',()=>{
  if(busy||actions.canLeave?.()===false)return;const record=database.providerItems[row.id];editorArea.replaceChildren(createContentsEditor(record,database.contentReviews?.[record.id],{
   save:async(id,value)=>{busy=true;setBusy();try{if(!actions.saveReview)throw Error('Open this collection in Contents to save a detailed review.');const next=await actions.saveReview(id,value);await reconcile(next);}finally{busy=false;setBusy();}},
   remove:async(id)=>{busy=true;setBusy();try{if(!actions.removeReview)throw Error('Open Contents to undo this review.');await reconcile(await actions.removeReview(id));}finally{busy=false;setBusy();}},refresh:()=>{}
  },{expanded:true,focusEntry:row.observations.find(o=>ids.includes(o.id))?.entryIndex}));editorArea.scrollIntoView?.({block:'nearest'});
 });
 const contents=el('a','Open source collection in Contents');contents.href=bookHref('contents',row.recordRef);
 contents.addEventListener('click',event=>{if(busy||actions.canLeave?.()===false)event.preventDefault();else dialog.remove();});
 const cancelPreview=()=>{preview=null;save.disabled=true;previewArea.replaceChildren();};
 function setBusy(){for(const n of controls.querySelectorAll('input,select,button'))n.disabled=busy||n.dataset.locked==='true';previewButton.disabled=busy||!target||!ids.length||persisted;save.disabled=busy||!preview||persisted;close.disabled=busy;edit.disabled=busy;}
 function renderIssues(){
  const obs=groups.get(choose.value)??[];issuePage=pager.update({total:obs.length,page:issuePage,size:issueSize}).page;issueCount.textContent=ids.length+' selected';issueList.replaceChildren();
  for(const o of obs.slice(issuePage*issueSize,(issuePage+1)*issueSize)){const label=el('label'),check=el('input');check.type='checkbox';check.checked=ids.includes(o.id);check.disabled=o.protectedMerge;check.dataset.locked=String(o.protectedMerge);check.dataset.resolutionObservation=o.id;check.addEventListener('change',()=>{ids=check.checked?[...ids,o.id]:ids.filter(id=>id!==o.id);cancelPreview();refreshCandidates();renderIssues();});label.append(check,' #'+o.resolved.number+' · '+(o.resolved.run||'run unresolved')+' · '+o.extent+(o.protectedMerge?' · controlled by a manual merge':''));issueList.append(label);}
 }
 function refreshCandidates(){
  const all=resolutionCandidates(row,projection.dispositions,database,ids),matches=all.filter(c=>c.label.toLowerCase().includes(search.value.trim().toLowerCase())),selected=all.find(c=>c.id===target?.id);
  candidates.replaceChildren(...matches.slice(0,50).map(c=>Object.assign(el('option',c.label+(c.suggested?' — suggested':'')),{value:c.id})));target=selected??null;candidates.value=target?.id??'';
  why.textContent=target?'Selected: '+target.label+'. '+target.evidence:all.length?'Select a publication, then preview the changes.':'No safe existing publication choice covers this selection. Use the contents editor to specify the publication or resolve unsupported text.';
  links.replaceChildren();for(const url of target?.sources??[]){const link=el('a','Publication evidence');link.href=url;link.target='_blank';link.rel='noopener noreferrer';links.append(link,' ');}
  related=target?compatibleResolutionCollections(row,ids,target,projection.dispositions,database):[];includeRelated=false;bulk.replaceChildren();
  if(related.length){const label=el('label'),check=el('input');check.type='checkbox';check.setAttribute('aria-label','Include compatible collections');check.addEventListener('change',()=>{includeRelated=check.checked;cancelPreview();});label.append(check,' Also apply '+target.label+' to '+related.length+' other matching collections');bulk.append(label,el('p','Same saved account, publisher and collection family; no reviewed, explicitly conflicting or manually merged entries. Nothing is applied until you preview and save.'));for(const other of related)bulk.append(el('p',other.collection.title+' — '+other.ids.length+' unresolved observations → '+target.label));}
  setBusy();
 }
 function changeGroup(){ids=choose.value.startsWith('reference:')?[choose.value]:(groups.get(choose.value)??[]).filter(o=>!o.protectedMerge).map(o=>o.id);target=null;issuePage=0;cancelPreview();renderIssues();refreshCandidates();}
 async function previewChanges(){
  if(busy||!target||actions.canLeave?.()===false)return;busy=true;setBusy();notice.textContent='Calculating the coverage preview…';
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
 controls.append(choose,issues,search,candidates,why,links,bulk,previewButton);dialog.append(controls,previewArea,notice,save,edit,contents,close,editorArea);choose.addEventListener('change',changeGroup);search.addEventListener('input',()=>{cancelPreview();refreshCandidates();});candidates.addEventListener('change',()=>{target=resolutionCandidates(row,projection.dispositions,database,ids).find(c=>c.id===candidates.value)??null;cancelPreview();refreshCandidates();});dialog.addEventListener('cancel',event=>{if(busy||actions.canLeave?.()===false)event.preventDefault();else dialog.remove();});changeGroup();document.body.append(dialog);dialog.showModal();choose.focus();return dialog;
}

export function createCoverageResolutionQueue(database,projection,actions={}){
 const root=el('details');root.className='coverage-resolution-queue';const summary=el('summary');root.append(summary);
 const filter=el('select');filter.setAttribute('aria-label','Coverage resolution category');for(const [value,label]of [['actionable','All actionable problems'],['run','Publication runs'],['identity','Publication identities'],['named','Named publications'],['enumeration','Incomplete enumeration'],['information','Access, partial and intentional exclusions']])filter.append(Object.assign(el('option',label),{value}));
 const list=el('div'),counter=el('p');let query='',page=0,size=20;
 const pager=createPagination({name:'Coverage resolution collections',onPage:p=>{page=p;render();},onSize:s=>{size=s;page=0;render();}});root.append(el('h3','Parsed contents awaiting coverage resolution'),el('p','Unresolved observations remain outside owned, duplicate and missing totals. Access exclusions and partial material are informational, not errors.'),filter,counter,pager.sizeContainer,pager.top,list,pager.bottom);
 const actionable=projection.dispositions.filter(r=>r.summary.actionable>0);summary.textContent='Coverage resolution — '+actionable.length+' collections need attention';
 function render(){
  const rows=projection.dispositions.filter(r=>{
   const codes=[...r.observations.flatMap(o=>o.actionable?o.reasons.map(r=>r.code):[]),...r.references.filter(f=>f.actionable&&r.accessEligible).map(f=>f.code)],kind=filter.value;
   const include=kind==='information'?(!r.summary.actionable&&(r.summary.partial||r.summary.excluded||r.rejected)):kind==='actionable'?r.summary.actionable:kind==='run'?codes.some(c=>c.startsWith('run-')||c==='annual-run-unresolved'):kind==='identity'?codes.includes('publication-unresolved'):kind==='named'?codes.includes('named-publication-unresolved'):codes.includes('enumeration-incomplete');
   return include&&[r.title,r.provider,...r.observations.flatMap(o=>[o.extracted.series,o.resolved.series]),...r.references.map(f=>f.fragment)].some(v=>v.toLowerCase().includes(query));
  });page=pager.update({total:rows.length,page,size}).page;counter.textContent=rows.length+' matching collections';list.replaceChildren();
  for(const row of rows.slice(page*size,(page+1)*size)){const card=el('article');card.className='tool-card';card.dataset.coverageResolution=row.recordRef;card.append(el('h4',row.title),el('p',accountLabel(row,database)),...groupContents(row.observations.filter(o=>o.parsed).map(o=>o.extracted)).map(g=>el('p',g.text)));
   const first=row.observations.find(o=>o.actionable&&o.origin==='contents'),ids=first?row.observations.filter(o=>groupKey(o)===groupKey(first)).map(o=>o.id):[],suggested=ids.length?resolutionCandidates(row,[],database,ids).find(c=>c.suggested):null;
   if(suggested){const hint=el('p','Suggested publication: '+suggested.label);hint.title=suggested.evidence;card.append(hint);}
   card.append(createCoverageDisposition(row,database,projection,actions));const link=el('a','Source contents');link.href=bookHref('contents',row.recordRef);card.append(link);list.append(card);}
  if(!rows.length)list.append(el('p','No collections match this category and search.'));
 }
 filter.addEventListener('change',()=>{page=0;render();});root.addEventListener('toggle',()=>{if(root.open)render();});root.updateQuery=value=>{const next=value.trim().toLowerCase();if(next!==query)page=0;query=next;if(query&&actionable.some(r=>[r.title,...r.observations.flatMap(o=>[o.resolved.series,o.extracted.series]),...r.references.map(f=>f.fragment)].some(t=>t.toLowerCase().includes(query))))root.open=true;if(root.open)render();};return root;
}
