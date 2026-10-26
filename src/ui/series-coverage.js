import {accountLabel} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
import {labeledControl} from './form-presentation.js';
import {bookToolHelp} from './book-tool-help.js';
import {proposeContents} from '../lib/contents.js';
import {libraryContentCoverage,librarySeriesCoverage} from '../lib/inferred-coverage.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
export function createSeriesCoverageView(database,{state={},openRecord}={}) {
  const root=element('div','');root.className='series-coverage';
  const records=Object.values(database.providerItems),scope=element('select','');scope.setAttribute('aria-label','Comparison account');
  scope.append(Object.assign(element('option','All saved accounts'),{value:'all'}));
  for(const id of new Set(records.filter(r=>r.mediaType==='book').map(r=>r.profileId))){const record=records.find(r=>r.profileId===id);scope.append(Object.assign(element('option',accountLabel(record,database)),{value:id??'unassigned'}));}
  scope.value=state.account??'all';if(!scope.value)scope.value='all';
  const scopeNotice=element('p','');scopeNotice.className='compact-notice';
  root.append(labeledControl('Compare against',scope),scopeNotice);
  const options=()=>({excludeItemIds:records.filter(r=>scope.value!=='all'&&(r.profileId??'unassigned')!==scope.value).map(r=>r.id)});
  function sourceLinks(items){const list=element('ul','');for(const item of new Map(items.map(item=>[item.recordRef,item])).values()){
    const row=element('li',''),link=element('a',item.title+' — '+accountLabel(item,database));link.href=bookHref('library',item.recordRef);
    if(openRecord)link.addEventListener('click',event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();openRecord(item.recordRef);});row.append(link);list.append(row);
  }return list;}
  root.append(bookToolHelp({heading:'How collection comparisons work',purpose:'Compare collections and find missing issues or volumes within a known span.',input:'Automatically extracted and reviewed full contents from effectively owned books. Missing language defaults to English; explicit languages and conflicting series runs stay separate.',saves:'This view and its target comparison do not save ownership or book details.',review:'Gaps cover the known span only; there is no automatic complete-series bibliography or chronological reading order.',example:'Owning issues 1, 2 and 4 shows a gap at 3, but does not tell you whether the series ends at 4.'}));
  const limits=element('details','');limits.className='context-help';limits.append(element('summary','Evidence and comparison limits'),element('p','Inferred means extracted from a description; reviewed means you checked the contents. Neither adds a separate purchase. Missing comic language is treated as English for comparisons; saved source metadata stays unchanged. A matching parent series can supply run context. Explicitly named series can also share coverage with a run left unspecified. Explicitly conflicting runs or unclear series context stay separate. Excerpts and temporary access are excluded unless an ownership preference applies. Gaps cover only the known range.'));root.append(limits);
  const browseHeading=element('h3','Browse saved series contents'),summary=element('p','');root.append(browseHeading,summary);
  const search=element('input','');search.type='search';search.placeholder='Filter covered series';search.setAttribute('aria-label','Filter covered series');search.value=state.query??'';root.append(labeledControl('Find a series',search));
  const list=element('div','');list.className='series-groups';
  function renderGroups(){
  state.account=scope.value;scopeNotice.textContent='Scope: '+scope.selectedOptions[0].textContent+'. Uses saved full contents and existing ownership preferences. Library filters do not restrict this comparison.';
  const {groups,unresolved}=librarySeriesCoverage(database,options());list.replaceChildren();
  summary.textContent=`${groups.reduce((n,g)=>n+(!g.provisional?g.entries.length:0),0)} identified covered works; ${groups.reduce((n,g)=>n+(g.provisional?g.entries.length:0),0)} candidates with uncertain publication identity; ${unresolved.length} unresolved fragments or unsupported entries. These are evidence totals, not a review queue or purchase count.`;
  for(const group of groups){
    const details=element('details','');details.className='tool-card';details.dataset.series=group.series.toLocaleLowerCase();
    const type={issue:'issues',annual:'annuals',volume:'volumes',special:'specials'}[group.unitType]??group.unitType;
    details.append(element('summary',`${group.series}${group.run?' ('+group.run+')':''} — ${type} · ${group.entries.length} covered${group.overlap.length?' · '+group.overlap.length+' overlapping':''}${group.provisional?' · identity uncertain':''}`));
    let populated=false;
    details.addEventListener('toggle',()=>{if(!details.open||populated)return;populated=true;
      details.append(element('p',`${group.verified} reviewed · ${group.inferred} inferred · ${group.direct} standalone. Language: ${group.language||'unknown'}; publication run: ${group.run||'not specified'}.`));
      if(group.provisional)details.append(element('p','Series context is unclear or known publication runs conflict. These candidates belong to this source only; matching numbers in another collection do not confirm overlap. Possible numerical holes: '+(group.possibleGaps.join(', ')||'none')+'.'));
      if(!group.provisional)details.append(element('p',`Missing numbers within the checked range: ${group.gaps.join(', ')||'none'}. This does not tell us where the series ends or add separate purchases of its issues.`));
      const table=element('table','');const head=element('tr','');for(const label of ['Unit','Evidence','Covered through','Overlap'])head.append(element('th',label));const thead=element('thead','');thead.append(head);table.append(thead);
      const body=element('tbody','');
      for(const entry of [...group.entries].sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}))){
        const row=element('tr',''),books=element('td','');books.append(sourceLinks(entry.sources.map(source=>database.providerItems[source.id]??source)));row.append(element('td',entry.number),element('td',(entry.confidence==='verified'?'reviewed':entry.confidence)+(entry.provisional?' (provisional)':'')),books,element('td',new Set(entry.sources.map(source=>source.id)).size>1?'Yes':''));body.append(row);
      }
      table.append(body);details.append(table);
    });list.append(details);
  }
  if(!groups.length)list.append(element('p','No full contents are covered in this account scope. An owned book with an explicit contents statement can contribute without review.'));
  filterGroups();
  }
  const emptySearch=element('p','No covered series match this search. Try another title or account.');emptySearch.hidden=true;
  function filterGroups(){state.query=search.value;let visible=0;for(const node of list.querySelectorAll('[data-series]')){node.hidden=!node.dataset.series.includes(search.value.trim().toLocaleLowerCase());if(!node.hidden)visible++;}emptySearch.hidden=!search.value||visible>0;}
  search.addEventListener('input',filterGroups);
  root.append(list);
  root.append(emptySearch);
  const comparison=element('details','');comparison.className='tool-card collection-target';comparison.open=true;comparison.append(element('summary','Compare an issue range or manga collection'));
  comparison.append(element('p','Enter explicit contents, for example “Batman (2011) #1-12; Batman Annual #1” or “Naruto Vols. 1-9”. Supply a run to distinguish series versions. Comic language defaults to English if blank; explicit languages remain separate. This comparison does not save ownership or contents.'));
  const statement=element('textarea','');statement.rows=3;statement.maxLength=10000;statement.setAttribute('aria-label','Target contents statement');statement.placeholder='Batman (2011) #1-12; Batman Annual #1 or Naruto Vols. 1-9';
  const run=element('input','');run.placeholder='Run / year when missing from statement';run.setAttribute('aria-label','Target series run');
  const language=element('input','');language.placeholder='Language code (English if blank), for example en or ja';language.setAttribute('aria-label','Target language');
  statement.value=state.statement??'';run.value=state.run??'';language.value=state.language??'';
  const result=element('div','');result.setAttribute('role','status');
  result.className='collection-comparison-result';
  const compare=element('button','Compare coverage');compare.type='button';
  function remember(){state.statement=statement.value;state.run=run.value;state.language=language.value;state.account=scope.value;}
  for(const field of [statement,run,language])field.addEventListener('input',()=>{remember();state.compared=false;result.textContent='Target changed. Compare again to update the results.';});
  function compareTarget(){
    remember();state.compared=true;
    result.replaceChildren();
    try{
      const proposal=proposeContents(statement.value);
      if(!proposal.entries.length)throw new Error('No explicit issues or volumes found. Try The Sandman #1-8 or Naruto Vols. 1-9.');
      const requested=proposal.entries.map(entry=>({...entry,run:entry.run||run.value.trim(),language:language.value.trim().toLowerCase()}));
      const coverage=libraryContentCoverage(database,requested,options());
      result.append(element('h3','Comparison results'),element('p','Compared against: '+scope.selectedOptions[0].textContent+'.'));
      result.append(element('p',`${coverage.owned} of ${coverage.total} requested entries are covered (${coverage.verified} reviewed, ${coverage.inferred} inferred, ${coverage.direct} standalone). ${coverage.missing.length} have no sufficiently identified match.${coverage.possibleCovered.length?` ${coverage.possibleCovered.length} of these may overlap but need more detail.`:''}${coverage.complete?' All requested full entries are covered.':''}`));
      if(coverage.scopeUncertain)result.append(element('p','Series context or a related match needs checking before the comparison can be complete.'));
      if(proposal.unparsed.length)result.append(element('p',`Text not included in the comparison: ${proposal.unparsed.join('; ')}. The comparison does not cover this text.`));
      if(proposal.entries.some(entry=>entry.completeness==='excerpt'))result.append(element('p','Excerpt entries are excluded from full-unit ownership comparisons.'));
      if(coverage.missing.length)result.append(element('p',`No sufficiently identified match: ${coverage.missing.map(entry=>`${entry.series} (${entry.run||'run unknown'}) ${entry.unitType} ${entry.number}`).join('; ')}`));
      if(coverage.covered.length)result.append(element('h4','Owned through'),sourceLinks(coverage.covered.flatMap(entry=>entry.evidence.map(({item})=>item))));
      if(coverage.possibleCovered.length)result.append(element('h4','Possible overlap — identity needs more detail'),sourceLinks(coverage.possibleCovered.flatMap(entry=>entry.evidence.map(({item})=>item))));
      result.append(element('p','No match means these saved contents do not establish coverage. An incomplete description can still omit material you own.'));
    }catch(error){result.textContent=error.message;}
  }
  compare.addEventListener('click',compareTarget);
  const fields=element('div','');fields.className='library-filters';fields.append(labeledControl('Publication run (optional)',run),labeledControl('Language (optional)',language));
  comparison.append(labeledControl('Issues or volumes to check',statement),fields,compare,result);root.insertBefore(comparison,root.children[2]);
  scope.addEventListener('change',()=>{renderGroups();if(state.compared)compareTarget();else result.textContent='Account scope changed. Compare to check this target in the selected account.';});
  renderGroups();if(state.compared)compareTarget();
  return root;
}
