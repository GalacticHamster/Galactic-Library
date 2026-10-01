import { contentCoverage, proposeContents, seriesCoverage } from '../lib/contents.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
export function createSeriesCoverageView(database) {
  const root=element('div','');root.className='series-coverage';
  root.append(element('p','Coverage uses reviewed full contents of owned or permanently claimed records. Excerpts and temporary access are excluded. Runs, languages and unit types stay separate. Gaps below are within the observed range; the end of a series is unknown unless you explicitly supply a target range.'));
  const groups=seriesCoverage(database);
  root.append(element('p',`${groups.length} reviewed series scopes · ${groups.reduce((sum,group)=>sum+group.entries.length,0)} distinct full units · ${groups.reduce((sum,group)=>sum+group.overlap.length,0)} overlapping units.`));
  const search=element('input','');search.type='search';search.placeholder='Filter reviewed series';search.setAttribute('aria-label','Filter reviewed series');root.append(search);
  const list=element('div','');list.className='series-groups';
  for(const group of groups){
    const details=element('details','');details.dataset.series=group.series.toLocaleLowerCase();
    details.append(element('summary',`${group.series} · ${group.run||'run unknown'} · ${group.language||'language unknown'} · ${group.unitType} · ${group.entries.length} owned · ${group.overlap.length} overlapping`));
    let populated=false;
    details.addEventListener('toggle',()=>{if(!details.open||populated)return;populated=true;
      details.append(element('p',`Missing numbers within the observed integer range: ${group.gaps.join(', ')||'none'}. This does not establish completion of the whole series.`));
      const table=element('table','');const head=element('tr','');for(const label of ['Unit','Owned through','Overlap'])head.append(element('th',label));const thead=element('thead','');thead.append(head);table.append(thead);
      const body=element('tbody','');
      for(const entry of [...group.entries].sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}))){
        const row=element('tr','');row.append(element('td',entry.number),element('td',[...new Set(entry.sources.map(source=>`${source.title} — ${source.provider}`))].join('; ')),element('td',new Set(entry.sources.map(source=>source.id)).size>1?'Yes':''));body.append(row);
      }
      table.append(body);details.append(table);
    });list.append(details);
  }
  if(!groups.length)list.append(element('p','No owned contents have been confirmed yet. Expand a library item’s Contents and coverage editor to review its evidence.'));
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
      result.append(element('p',`${coverage.owned}/${coverage.total} full units covered by owned records. ${coverage.missing.length} units not established.${coverage.possibleCovered.length?` ${coverage.possibleCovered.length} may overlap but need scope confirmation.`:''}${coverage.complete?' All enumerated full units are covered.':''}`));
      if(coverage.scopeUncertain)result.append(element('p','Run or language is missing; complete ownership cannot be established.'));
      if(proposal.unparsed.length)result.append(element('p',`Unparsed contents: ${proposal.unparsed.join('; ')}. The comparison does not cover this text.`));
      if(proposal.entries.some(entry=>entry.completeness==='excerpt'))result.append(element('p','Excerpt entries are excluded from full-unit ownership comparisons.'));
      if(coverage.missing.length)result.append(element('p',`Missing / unconfirmed: ${coverage.missing.map(entry=>`${entry.series} (${entry.run||'run unknown'}) ${entry.unitType} ${entry.number}`).join('; ')}`));
      const sources=[...new Set(coverage.covered.flatMap(entry=>entry.evidence.map(({item})=>`${item.title} — ${item.provider}`)))];
      if(sources.length)result.append(element('p',`Owned through: ${sources.join('; ')}`));
    }catch(error){result.textContent=error.message;}
  });
  comparison.append(statement,run,language,compare,result);root.append(comparison);
  return root;
}
