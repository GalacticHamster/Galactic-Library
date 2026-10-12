import {loadCoverageProjection} from './collection-overlap-projection.js';
import {comicRange,comicIssuePage,comicCoverageSummary} from '../lib/comic-coverage.js';
import {createPagination} from './pagination.js';
import {accountLabel} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(label,run)=>{const node=el('button',label);node.type='button';node.addEventListener('click',run);return node;};
export const comicSeriesLabel=group=>`${group.series} · ${group.run||'run not specified'} · ${group.unitType}s · ${group.language}`;
export function createComicCoverageView(database,{starts={},saveStart=async()=>{throw Error('Starting numbers cannot be saved here.');},openRecord}={}){
  starts={...starts};const root=el('div');root.className='comic-coverage';
  root.append(el('p','See comic issues covered by your owned books and standalone purchases. Inferred contents are included automatically; verified contents were reviewed. Missing means not covered from the starting number through your highest covered issue number, not the end of the published series.'));
  const controls=el('div');controls.className='library-controls';
  const search=el('input');search.type='search';search.placeholder='Search comic series';search.setAttribute('aria-label','Search comic coverage');
  const sortLabel=el('label','Sort '),sort=el('select');sort.setAttribute('aria-label','Sort comic coverage');
  for(const [value,title]of [['title','Series title'],['covered','Most covered issues'],['duplicates','Most duplicates'],['missing','Most missing issues']])sort.append(Object.assign(el('option',title),{value}));
  sortLabel.append(sort);controls.append(search,sortLabel);root.append(controls);
  const status=el('p','Finding comic coverage…');status.setAttribute('role','status');status.setAttribute('aria-busy','true');
  const list=el('div'),detail=el('section');list.className='comic-series-list';detail.className='comic-series-detail';detail.hidden=true;
  let groups=[],page=0,size=50,selected;
  const pager=createPagination({name:'Comic series',onPage:value=>{page=value;render();},onSize:value=>{size=value;page=0;render();}});
  root.append(status,pager.sizeContainer,pager.top,list,pager.bottom,detail);
  const totals=()=>comicCoverageSummary(groups,starts);
  function select(group){
    selected=group;detail.hidden=false;detail.replaceChildren();
    const heading=el('h3',comicSeriesLabel(group));heading.tabIndex=-1;detail.append(heading);
    const rangeInfo=el('p'),notice=el('p');notice.setAttribute('role','status');
    const startLabel=el('label','Starting number '),start=el('input');start.type='number';start.min='0';start.max='999999';start.step='1';start.value=String(starts[group.id]??1);start.setAttribute('aria-label','Series starting number');startLabel.append(start);
    const settings=el('div');settings.className='actions';
    const save=button('Save starting number',()=>persist(Number(start.value))),reset=button('Reset to #1',()=>persist(null));settings.append(startLabel,save,reset);detail.append(rangeInfo,settings,notice);
    const filterLabel=el('label','Show '),filter=el('select');filter.setAttribute('aria-label','Comic issue filter');
    for(const [value,label]of [['owned','Owned issues'],['duplicates','Owned multiple times'],['missing','Missing issues']])filter.append(Object.assign(el('option',label),{value}));filterLabel.append(filter);detail.append(filterLabel);
    const table=el('table'),thead=el('thead'),head=el('tr');for(const title of ['Issue','Coverage','Supporting books'])head.append(el('th',title));thead.append(head);const body=el('tbody');table.append(thead,body);let issuePage=0,issueSize=50;
    const issuesPager=createPagination({name:'Comic issues',onPage:value=>{issuePage=value;renderIssues();},onSize:value=>{issueSize=value;issuePage=0;renderIssues();}});
    detail.append(issuesPager.sizeContainer,issuesPager.top,table,issuesPager.bottom);
    function renderIssues(){
      const result=comicIssuePage(group,{start:starts[group.id]??1,filter:filter.value,page:issuePage,size:issueSize});issuePage=result.page;
      const range=result.range;rangeInfo.textContent=`${group.issues.length} covered · ${group.duplicates} owned multiple times · ${range.missing} missing${range.end>=range.start?' within #'+range.start+'–'+range.end:'; no whole-number range at this start'}.${range.belowStart?' Covered issues below the starting number are still listed.':''}`;
      issuesPager.update({total:result.total,page:issuePage,size:issueSize});body.replaceChildren();
      for(const issue of result.rows){
        const row=el('tr');row.dataset.comicIssue=issue.number;const supporting=el('td');
        if(!issue.missing){const disclosure=el('details');disclosure.append(el('summary','Supporting books ('+issue.sources.length+')'));let built=false;
          disclosure.addEventListener('toggle',()=>{if(!disclosure.open||built)return;built=true;const sources=el('ul');for(const source of issue.sources){const record=source.record,link=el('a',record.title+' — '+accountLabel(record,database));link.href=bookHref('library',record.recordRef);link.dataset.comicRecord=record.recordRef;
            if(openRecord)link.addEventListener('click',event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();openRecord(record.recordRef);});const li=el('li');li.append(link);sources.append(li);}disclosure.append(sources);});supporting.append(disclosure);
        }else supporting.textContent='No comparable full coverage in your saved library';
        row.append(el('td','#'+issue.number),el('td',issue.missing?'Missing in assumed range':`${issue.copies>1?'Owned '+issue.copies+' times':'Owned'} · ${issue.confidence==='direct'?'standalone':issue.confidence}`),supporting);body.append(row);
      }
      if(!result.rows.length){const row=el('tr'),cell=el('td',filter.value==='missing'?'No missing issues in this assumed range.':filter.value==='duplicates'?'No confirmed duplicate coverage in this series.':'No covered issues.');cell.colSpan=3;row.append(cell);body.append(row);}
    }
    async function persist(value){
      if(value!==null&&(!start.value.trim()||!Number.isSafeInteger(value)||value<0||value>999999)){notice.textContent='Enter a whole starting number from 0 to 999999.';return;}
      save.disabled=reset.disabled=start.disabled=true;notice.textContent='Saving starting number…';
      try{const updated=await saveStart(group.id,value);starts=updated??{...starts,[group.id]:value??1};if(value===null||value===1)delete starts[group.id];start.value=String(starts[group.id]??1);issuePage=0;renderIssues();render();notice.textContent='Starting number saved. Contents and ownership are unchanged.';}
      catch(error){notice.textContent='Could not save starting number: '+error.message;}
      finally{save.disabled=reset.disabled=start.disabled=false;}
    }
    filter.addEventListener('change',()=>{issuePage=0;renderIssues();});renderIssues();heading.focus();detail.scrollIntoView?.({block:'start'});
  }
  function render(){
    const query=search.value.trim().toLocaleLowerCase(),matches=groups.filter(group=>comicSeriesLabel(group).toLocaleLowerCase().includes(query));
    matches.sort((a,b)=>(sort.value==='covered'?b.issues.length-a.issues.length:sort.value==='duplicates'?b.duplicates-a.duplicates:sort.value==='missing'?comicRange(b,starts[b.id]??1).missing-comicRange(a,starts[a.id]??1).missing:0)||comicSeriesLabel(a).localeCompare(comicSeriesLabel(b),undefined,{numeric:true}));
    const state=pager.update({total:matches.length,page,size});page=state.page;list.replaceChildren();const counts=totals();
    status.textContent=`${counts.seriesGroups} series/run/type groups · ${counts.covered} covered issues · ${counts.duplicates} owned multiple times · ${counts.missing} missing in assumed ranges${query?' · '+matches.length+' matching groups':''}.`;status.setAttribute('aria-busy','false');
    for(const group of matches.slice(page*size,(page+1)*size)){
      const row=el('article');row.className='tool-card';row.dataset.comicSeries=group.id;
      row.append(el('h3',comicSeriesLabel(group)),el('p',`${group.issues.length} covered · ${group.duplicates} owned multiple times · ${comicRange(group,starts[group.id]??1).missing} missing`),button('Inspect issues',()=>select(group)));list.append(row);
    }
    if(!matches.length)list.append(el('p',query?'No comic series match your search.':'No comparable comic coverage found. Owned books with explicit full contents or numbered standalone issues contribute automatically; manual review is optional.'));
    if(selected&&!matches.includes(selected)){selected=null;detail.hidden=true;detail.replaceChildren();}
  }
  search.addEventListener('input',()=>{page=0;render();});sort.addEventListener('change',()=>{page=0;render();});
  root.ready=loadCoverageProjection(database,'comic-coverage').then(result=>{groups=result.groups;render();if(result.provisional||result.unresolved)root.append(el('p',`${result.provisional} provisional entries and ${result.unresolved} unresolved fragments or unsupported entries are excluded from covered-issue and missing-range totals.`));return {...result,summary:totals()};}).catch(error=>{status.textContent='Could not calculate comic coverage: '+error.message;status.setAttribute('aria-busy','false');root.append(button('Try again',()=>root.replaceWith(createComicCoverageView(database,{starts,saveStart,openRecord}))));});
  return root;
}
