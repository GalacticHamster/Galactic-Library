import {accountLabel} from './item-presentation.js';
import {bookToolHelp} from './book-tool-help.js';
import { contentCoverage, proposeContents, seriesCoverage } from '../lib/contents.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
export function createSeriesCoverageView(database) {
  const root=element('div','');root.className='series-coverage';
  root.append(bookToolHelp({heading:'How collection comparisons work',purpose:'Compare collections and find missing issues or volumes within a known span.',input:'Reviewed full contents from books you own or permanently claimed, keeping series runs, languages and issue/volume types separate.',saves:'This view and its target comparison do not save ownership or book details.',review:'Gaps cover the known span only; there is no automatic complete-series bibliography or chronological reading order.',example:'Owning issues 1, 2 and 4 shows a gap at 3, but does not tell you whether the series ends at 4.'}));
  root.append(element('p','Compare reviewed full works included in qualifying owned copies. Excerpts are excluded; temporary access does not count unless your ownership preference treats it as owned. Series versions, languages and types stay separate. Missing numbers are within the checked range, not a complete series bibliography.'));
  const groups=seriesCoverage(database);
  root.append(element('p',`${groups.length} reviewed series versions · ${groups.reduce((sum,group)=>sum+group.entries.length,0)} distinct full included works · ${groups.reduce((sum,group)=>sum+group.overlap.length,0)} overlapping entries.`));
  const search=element('input','');search.type='search';search.placeholder='Filter reviewed series';search.setAttribute('aria-label','Filter reviewed series');root.append(search);
  const list=element('div','');list.className='series-groups';
  for(const group of groups){
    const details=element('details','');details.dataset.series=group.series.toLocaleLowerCase();
    details.append(element('summary',`${group.series} · ${group.run||'run unknown'} · ${group.language||'language unknown'} · ${group.unitType} · ${group.entries.length} owned · ${group.overlap.length} overlapping`));
    let populated=false;
    details.addEventListener('toggle',()=>{if(!details.open||populated)return;populated=true;
      details.append(element('p',`Missing numbers within the checked range: ${group.gaps.join(', ')||'none'}. This does not tell us where the series ends or add separate purchases of its issues.`));
      const table=element('table','');const head=element('tr','');for(const label of ['Unit','Owned through','Overlap'])head.append(element('th',label));const thead=element('thead','');thead.append(head);table.append(thead);
      const body=element('tbody','');
      for(const entry of [...group.entries].sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}))){
        const row=element('tr','');row.append(element('td',entry.number),element('td',[...new Set(entry.sources.map(source=>`${source.title} — ${accountLabel(database.providerItems[source.id]??source,database)}`))].join('; ')),element('td',new Set(entry.sources.map(source=>source.id)).size>1?'Yes':''));body.append(row);
      }
      table.append(body);details.append(table);
    });list.append(details);
  }
  if(!groups.length)list.append(element('p','No owned contents have been confirmed yet. Find a book in Contents and choose Inspect contents to check its evidence.'));
  search.addEventListener('input',()=>{for(const node of list.querySelectorAll('[data-series]'))node.hidden=!node.dataset.series.includes(search.value.trim().toLocaleLowerCase());});
  root.append(list);
  const comparison=element('details','');comparison.append(element('summary','Compare a target series range or proposed collection'));
  comparison.append(element('p','Enter explicit contents, for example “Batman (2011) #1-12; Batman Annual #1” or “Naruto Vols. 1-9”. Supply run and language to resolve missing scope. This comparison does not save ownership or contents.'));
  const statement=element('textarea','');statement.rows=3;statement.maxLength=10000;statement.setAttribute('aria-label','Target contents statement');
  const run=element('input','');run.placeholder='Run / year when missing from statement';run.setAttribute('aria-label','Target series run');
  const language=element('input','');language.placeholder='Language code, for example en or ja';language.setAttribute('aria-label','Target language');
  const result=element('div','');result.setAttribute('role','status');
  const compare=element('button','Compare coverage');compare.type='button';
  compare.addEventListener('click',()=>{
    result.replaceChildren();
    try{
      const proposal=proposeContents(statement.value);
      if(!proposal.entries.length)throw new Error('No explicit units were parsed. Use issue #numbers or volume numbers.');
      const requested=proposal.entries.map(entry=>({...entry,run:entry.run||run.value.trim(),language:language.value.trim().toLowerCase()}));
      const coverage=contentCoverage(database,requested);
      result.append(element('p',`${coverage.owned} of ${coverage.total} requested entries are included in qualifying owned copies. ${coverage.missing.length} have no confirmed match.${coverage.possibleCovered.length?` ${coverage.possibleCovered.length} of these may overlap but need more detail.`:''}${coverage.complete?' All requested full entries are covered.':''}`));
      if(coverage.scopeUncertain)result.append(element('p','Series version, language or a related match needs checking before the comparison can be complete.'));
      if(proposal.unparsed.length)result.append(element('p',`Text not included in the comparison: ${proposal.unparsed.join('; ')}. The comparison does not cover this text.`));
      if(proposal.entries.some(entry=>entry.completeness==='excerpt'))result.append(element('p','Excerpt entries are excluded from full-unit ownership comparisons.'));
      if(coverage.missing.length)result.append(element('p',`No confirmed match: ${coverage.missing.map(entry=>`${entry.series} (${entry.run||'run unknown'}) ${entry.unitType} ${entry.number}`).join('; ')}`));
      const sources=[...new Set(coverage.covered.flatMap(entry=>entry.evidence.map(({item})=>`${item.title} — ${accountLabel(item,database)}`)))];
      if(sources.length)result.append(element('p',`Owned through: ${sources.join('; ')}`));
    }catch(error){result.textContent=error.message;}
  });
  comparison.append(statement,run,language,compare,result);root.append(comparison);
  return root;
}
