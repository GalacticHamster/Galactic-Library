import {accountLabel} from './item-presentation.js';
import {bookToolHelp} from './book-tool-help.js';
import {proposeContents} from '../lib/contents.js';
import {libraryContentCoverage,librarySeriesCoverage} from '../lib/inferred-coverage.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
export function createSeriesCoverageView(database) {
  const root=element('div','');root.className='series-coverage';
  root.append(bookToolHelp({heading:'How collection comparisons work',purpose:'Compare collections and find missing issues or volumes within a known span.',input:'Automatically extracted and reviewed full contents from effectively owned books. Unknown series versions stay separate by source.',saves:'This view and its target comparison do not save ownership or book details.',review:'Gaps cover the known span only; there is no automatic complete-series bibliography or chronological reading order.',example:'Owning issues 1, 2 and 4 shows a gap at 3, but does not tell you whether the series ends at 4.'}));
  root.append(element('p','Inferred means extracted from a description; verified means you reviewed the contents. Neither adds a separate purchase. Unknown series versions or languages show provisional coverage, not definite overlap or missing issues. Excerpts and temporary access are excluded unless an ownership preference applies. Gaps cover only the known range.'));
  const {groups,unresolved}=librarySeriesCoverage(database);
  root.append(element('p',`${groups.reduce((n,g)=>n+(!g.provisional?g.entries.length:0),0)} identified covered works; ${groups.reduce((n,g)=>n+(g.provisional?g.entries.length:0),0)} provisional source-local candidates; ${unresolved.length} unresolved fragments or unsupported entries. Provisional candidates may describe the same issue and are not added to the identified total.`));
  const search=element('input','');search.type='search';search.placeholder='Filter covered series';search.setAttribute('aria-label','Filter covered series');root.append(search);
  const list=element('div','');list.className='series-groups';
  for(const group of groups){
    const details=element('details','');details.dataset.series=group.series.toLocaleLowerCase();
    details.append(element('summary',`${group.series} · ${group.run||'run unknown'} · ${group.language||'language unknown'} · ${group.unitType} · ${group.entries.length} covered (${group.verified} verified, ${group.inferred} inferred, ${group.direct} standalone)${group.provisional?' · provisional identity':''} · ${group.overlap.length} overlapping`));
    let populated=false;
    details.addEventListener('toggle',()=>{if(!details.open||populated)return;populated=true;
      if(group.provisional)details.append(element('p','Series version or language is unknown. These candidates belong to this source only; matching numbers in another collection do not confirm overlap. Possible numerical holes: '+(group.possibleGaps.join(', ')||'none')+'.'));
      if(!group.provisional)details.append(element('p',`Missing numbers within the checked range: ${group.gaps.join(', ')||'none'}. This does not tell us where the series ends or add separate purchases of its issues.`));
      const table=element('table','');const head=element('tr','');for(const label of ['Unit','Evidence','Covered through','Overlap'])head.append(element('th',label));const thead=element('thead','');thead.append(head);table.append(thead);
      const body=element('tbody','');
      for(const entry of [...group.entries].sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}))){
        const row=element('tr','');row.append(element('td',entry.number),element('td',entry.confidence+(entry.provisional?' (provisional)':'')),element('td',[...new Set(entry.sources.map(source=>`${source.title} — ${accountLabel(database.providerItems[source.id]??source,database)}`))].join('; ')),element('td',new Set(entry.sources.map(source=>source.id)).size>1?'Yes':''));body.append(row);
      }
      table.append(body);details.append(table);
    });list.append(details);
  }
  if(!groups.length)list.append(element('p','No full contents are covered yet. An effectively owned book with an explicit contents statement can contribute without review.'));
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
      const coverage=libraryContentCoverage(database,requested);
      result.append(element('p',`${coverage.owned} of ${coverage.total} requested entries are covered (${coverage.verified} verified, ${coverage.inferred} inferred, ${coverage.direct} standalone). ${coverage.missing.length} have no sufficiently identified match.${coverage.possibleCovered.length?` ${coverage.possibleCovered.length} of these may overlap but need more detail.`:''}${coverage.complete?' All requested full entries are covered.':''}`));
      if(coverage.scopeUncertain)result.append(element('p','Series version, language or a related match needs checking before the comparison can be complete.'));
      if(proposal.unparsed.length)result.append(element('p',`Text not included in the comparison: ${proposal.unparsed.join('; ')}. The comparison does not cover this text.`));
      if(proposal.entries.some(entry=>entry.completeness==='excerpt'))result.append(element('p','Excerpt entries are excluded from full-unit ownership comparisons.'));
      if(coverage.missing.length)result.append(element('p',`No sufficiently identified match: ${coverage.missing.map(entry=>`${entry.series} (${entry.run||'run unknown'}) ${entry.unitType} ${entry.number}`).join('; ')}`));
      const sources=[...new Set(coverage.covered.flatMap(entry=>entry.evidence.map(({item})=>`${item.title} — ${accountLabel(item,database)}`)))];
      if(sources.length)result.append(element('p',`Owned through: ${sources.join('; ')}`));
      const possibleSources=[...new Set(coverage.possibleCovered.flatMap(entry=>entry.evidence.map(({item})=>`${item.title} — ${accountLabel(item,database)}`)))];
      if(possibleSources.length)result.append(element('p','Possible overlap through (identity needs more detail): '+possibleSources.join('; ')));
    }catch(error){result.textContent=error.message;}
  });
  comparison.append(statement,run,language,compare,result);root.append(comparison);
  return root;
}
