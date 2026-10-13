import {compatibleSeries} from '../lib/comic-series-merges.js';
import {createConfirmation} from './confirmation.js';
import {loadCoverageProjection} from './collection-overlap-projection.js';
import {comicRange,comicIssuePage,comicCoverageSummary} from '../lib/comic-coverage.js';
import {createPagination} from './pagination.js';
import {accountLabel} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
import {comicSeriesLabel,coverageSegments,comicGridPage} from './comic-coverage-presentation.js';
export {comicSeriesLabel} from './comic-coverage-presentation.js';
const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(label,run)=>{const node=el('button',label);node.type='button';node.addEventListener('click',run);return node;};
export function createComicCoverageView(database,{starts={},merges={},saveMerge=async()=>{throw Error('Series merges cannot be saved here.');},undoMerge=async()=>{throw Error('Series merges cannot be saved here.');},saveStart=async()=>{throw Error('Starting numbers cannot be saved here.');},openRecord}={}){
  starts={...starts};const root=el('div');root.className='comic-coverage';
  const intro=el('p','See comic issues covered by your owned books and standalone purchases. Inferred contents are included automatically; verified contents were reviewed. Missing means not covered from the starting number through your highest covered issue number, not the end of the published series.');
  const controls=el('div');controls.className='library-controls';
  const search=el('input');search.type='search';search.placeholder='Search comic series';search.setAttribute('aria-label','Search comic coverage');
  const sortLabel=el('label','Sort '),sort=el('select');sort.setAttribute('aria-label','Sort comic coverage');
  for(const [value,title]of [['title','Series title'],['covered','Most covered issues'],['duplicates','Most duplicates'],['missing','Most missing issues']])sort.append(Object.assign(el('option',title),{value}));
  sortLabel.append(sort);controls.append(search,sortLabel);const overview=el('section');overview.append(intro,controls);root.append(overview);
  const status=el('p','Finding comic coverage…');status.setAttribute('role','status');status.setAttribute('aria-busy','true');
  const list=el('div'),detail=el('section');list.className='comic-series-list';detail.className='comic-series-detail';detail.hidden=true;
  let groups=[],page=0,size=50,selected;const labels=new Map();
  const pager=createPagination({name:'Comic series',onPage:value=>{page=value;render();},onSize:value=>{size=value;page=0;render();}});
  overview.append(status,pager.sizeContainer,pager.top,list,pager.bottom);root.append(detail);
  let returnScroll=0,returnFocus;
  const label=group=>labels.get(group.id)??comicSeriesLabel(group,groups);
  const totals=()=>comicCoverageSummary(groups,starts);
  function select(group){
    returnScroll=globalThis.scrollY??0;returnFocus=document.activeElement;selected=group;overview.hidden=true;detail.hidden=false;detail.replaceChildren();
    detail.append(button('Back to series',()=>{selected=null;detail.hidden=true;overview.hidden=false;returnFocus?.focus({preventScroll:true});globalThis.scrollTo?.(0,returnScroll);}));
    const heading=el('h3',label(group));heading.tabIndex=-1;detail.append(heading);
    detail.append(button('Merge with another series',()=>mergePicker(group)));
    if(group.members){detail.append(el('p','Combined series: '+group.originalTitles.join(' / ')),button('Undo series merge',async()=>{
      const confirmation=createConfirmation({title:'Undo series merge?',message:'Separate all original series in this group. Collection records and contents will stay unchanged.',confirmLabel:'Separate series'});
      if(!await confirmation.result)return;
      try{merges=await undoMerge(group.id);}catch(error){detail.append(el('p','Could not undo merge: '+error.message));return;}
      try{await reload(group.id);}catch(error){detail.append(el('p','Series separated, but coverage could not reload: '+error.message+'. Reopen Options to load the saved change.'));}
    }));}
    const rangeInfo=el('p'),notice=el('p');notice.setAttribute('role','status');
    const startLabel=el('label','Starting number '),start=el('input');start.type='number';start.min='0';start.max='999999';start.step='1';start.value=String(starts[group.id]??1);start.setAttribute('aria-label','Series starting number');startLabel.append(start);
    const settings=el('div');settings.className='actions';
    const save=button('Save starting number',()=>persist(Number(start.value))),reset=button('Reset to #1',()=>persist(null));settings.append(startLabel,save,reset);detail.append(rangeInfo);const startSettings=el('details');startSettings.append(el('summary','Starting issue number'),el('p','Missing issues are counted from this number to your highest covered issue.'),settings,notice);detail.append(startSettings);
    const filterLabel=el('label','Show '),filter=el('select');filter.setAttribute('aria-label','Comic issue filter');
    for(const [value,label]of [['owned','Owned issues'],['duplicates','Owned multiple times'],['missing','Missing issues']])filter.append(Object.assign(el('option',label),{value}));filterLabel.append(filter);
    let mode='grid',gridPage=0;const display=el('div');display.className='coverage-view-controls';const gridButton=button('Grid',()=>switchMode('grid')),listButton=button('List',()=>switchMode('list'));display.append(gridButton,listButton,filterLabel);detail.append(display);
    const bar=el('div');bar.className='comic-coverage-bar';bar.setAttribute('aria-label','Issue coverage ranges');
    const legend=el('p');legend.className='coverage-legend';legend.setAttribute('aria-label','Issue color legend');
    for(const [state,text]of [['owned','Owned'],['duplicate','Multiple copies'],['missing','Missing']]){
      const item=el('span'),square=el('i');square.className='coverage-'+state;square.setAttribute('aria-hidden','true');item.append(square,document.createTextNode(text));legend.append(item);
    }
    detail.insertBefore(bar,display);detail.insertBefore(legend,display);
    const gridView=el('section'),rangeNav=el('div'),grid=el('div'),extraGrid=el('div'),sourcePanel=el('section');grid.className=extraGrid.className='comic-issue-grid';rangeNav.className='actions';sourcePanel.className='comic-issue-sources';sourcePanel.hidden=true;sourcePanel.setAttribute('aria-live','polite');
    const previous=button('Previous range',()=>{gridPage--;renderGrid();}),next=button('Next range',()=>{gridPage++;renderGrid();}),rangeLabel=el('span');rangeNav.append(previous,rangeLabel,next);gridView.append(rangeNav,grid,extraGrid);detail.append(gridView,sourcePanel);
    const table=el('table'),thead=el('thead'),head=el('tr');for(const title of ['Issue','Coverage','Supporting books'])head.append(el('th',title));thead.append(head);const body=el('tbody');table.append(thead,body);let issuePage=0,issueSize=50;
    const issuesPager=createPagination({name:'Comic issues',onPage:value=>{issuePage=value;renderIssues();},onSize:value=>{issueSize=value;issuePage=0;renderIssues();}});
    const listView=el('section');listView.hidden=true;listView.append(issuesPager.sizeContainer,issuesPager.top,table,issuesPager.bottom);detail.append(listView);
    function switchMode(value){mode=value;gridButton.setAttribute('aria-pressed',String(mode==='grid'));listButton.setAttribute('aria-pressed',String(mode==='list'));gridView.hidden=mode!=='grid';listView.hidden=mode!=='list';filterLabel.hidden=mode!=='list';sourcePanel.hidden=true;}
    function showIssue(issue){
      sourcePanel.hidden=false;
      sourcePanel.replaceChildren(el('h4','#'+issue.number+' · '+(issue.missing?'Missing':issue.copies>1?'Owned '+issue.copies+' times':'Owned')));
      if(issue.missing){sourcePanel.append(el('p','No comparable full coverage in your saved library.'));return;}
      sourcePanel.append(el('p',issue.confidence==='direct'?'Standalone issue':issue.confidence==='verified'?'Verified contents':'Inferred from saved collection contents'));
      const sources=el('ul');
      for(const source of issue.sources){
        const record=source.record,link=el('a',record.title+' — '+accountLabel(record,database));
        link.href=bookHref('library',record.recordRef);link.dataset.comicRecord=record.recordRef;
        if(openRecord)link.addEventListener('click',event=>{
          if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
          event.preventDefault();openRecord(record.recordRef);
        });
        const li=el('li');li.append(link);sources.append(li);
      }
      sourcePanel.append(sources);
    }
    function renderGrid(){
      const result=comicGridPage(group,{start:starts[group.id]??1,page:gridPage});
      gridPage=result.page;previous.disabled=gridPage===0;next.disabled=gridPage+1>=result.pages;
      rangeLabel.textContent=result.rows.length?'#'+result.first+'\u2013'+result.last:'No whole-number range';
      grid.replaceChildren();extraGrid.replaceChildren();sourcePanel.hidden=true;
      function cells(rows,target){
        for(const issue of rows){
          const state=issue.missing?'missing':issue.copies>1?'duplicate':'owned';
          const cell=button('#'+issue.number,()=>{
            for(const other of detail.querySelectorAll('[data-comic-grid-issue]'))other.setAttribute('aria-pressed',String(other===cell));
            showIssue(issue);sourcePanel.scrollIntoView?.({block:'nearest'});
          });
          cell.className='comic-issue-cell coverage-'+state;cell.dataset.comicGridIssue=issue.number;cell.dataset.coverage=state;
          cell.setAttribute('aria-pressed','false');
          cell.setAttribute('aria-label','#'+issue.number+' \u00b7 '+(state==='duplicate'?'Owned '+issue.copies+' times':state==='owned'?'Owned':'Missing'));
          target.append(cell);
        }
      }
      cells(result.rows,grid);
      if(result.extras.length){
        // Keep special numbers and covered issues below the chosen start visible,
        // without rendering an unbounded second grid for a high start override.
        extraGrid.append(el('p','Other covered numbers'));let shown=0;
        const more=button('Show more covered numbers',()=>appendExtras());
        function appendExtras(){more.remove();cells(result.extras.slice(shown,shown+100),extraGrid);shown+=100;if(shown<result.extras.length)extraGrid.append(more);}
        appendExtras();
      }
      bar.replaceChildren();
      const projection=coverageSegments(group,starts[group.id]??1),extent=projection.range.end-projection.range.start+1;
      for(const segment of projection.segments){
        const description=group.series+' #'+segment.first+(segment.last===segment.first?'':'\u2013'+segment.last)+' — '+(segment.status==='duplicate'?'Multiple copies':segment.status==='owned'?'Owned':'Missing');
        const item=button('',()=>{
          gridPage=Math.floor((segment.first-(starts[group.id]??1))/100);renderGrid();switchMode('grid');
          for(const cell of grid.querySelectorAll('[data-comic-grid-issue]')){
            const number=Number(cell.dataset.comicGridIssue);if(number>=segment.first&&number<=segment.last)cell.classList.add('coverage-highlight');
          }
          grid.querySelector('.coverage-highlight')?.focus({preventScroll:true});grid.scrollIntoView?.({block:'nearest'});
        });item.className='coverage-'+segment.status;
        item.style.flexGrow=String(segment.last-segment.first+1);item.style.flexBasis='0';
        item.dataset.first=segment.first;item.dataset.last=segment.last;item.dataset.coverage=segment.status;
        item.title=description;item.setAttribute('aria-label',description);
        bar.append(item);
      }
      bar.hidden=extent<=0;bar.setAttribute('role','group');
      bar.setAttribute('aria-label','Coverage from #'+projection.range.start+' to #'+projection.range.end+': '+(extent-projection.range.missing)+' covered, '+projection.range.missing+' missing. See numbered issue cells for supporting books.');
    }
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
      try{const updated=await saveStart(group.id,value);starts=updated??{...starts,[group.id]:value??1};if(value===null||value===1)delete starts[group.id];start.value=String(starts[group.id]??1);issuePage=gridPage=0;renderIssues();renderGrid();render();returnFocus=[...list.querySelectorAll('[data-comic-series]')].find(row=>row.dataset.comicSeries===group.id)?.querySelector('button');notice.textContent='Starting number saved. Contents and ownership are unchanged.';}
      catch(error){notice.textContent='Could not save starting number: '+error.message;}
      finally{save.disabled=reset.disabled=start.disabled=false;}
    }
    filter.addEventListener('change',()=>{issuePage=0;renderIssues();});renderIssues();renderGrid();switchMode('grid');heading.focus({preventScroll:true});root.scrollIntoView?.({block:'start'});
  }
  function render(){
    const query=search.value.trim().toLocaleLowerCase(),matches=groups.filter(group=>[label(group),...(group.originalTitles??[])].some(title=>title.toLocaleLowerCase().includes(query)));
    matches.sort((a,b)=>(sort.value==='covered'?b.issues.length-a.issues.length:sort.value==='duplicates'?b.duplicates-a.duplicates:sort.value==='missing'?comicRange(b,starts[b.id]??1).missing-comicRange(a,starts[a.id]??1).missing:0)||label(a).localeCompare(label(b),undefined,{numeric:true}));
    const state=pager.update({total:matches.length,page,size});page=state.page;list.replaceChildren();const counts=totals();
    status.textContent=`${counts.seriesGroups} series · ${counts.covered} covered issues · ${counts.duplicates} owned multiple times · ${counts.missing} missing in assumed ranges${query?' · '+matches.length+' matching groups':''}.`;status.setAttribute('aria-busy','false');
    for(const group of matches.slice(page*size,(page+1)*size)){
      const row=el('article');row.className='tool-card';row.dataset.comicSeries=group.id;
      row.append(el('h3',label(group)),el('p',`${group.issues.length} covered · ${group.duplicates} owned multiple times · ${comicRange(group,starts[group.id]??1).missing} missing`),button('Inspect issues',()=>select(group)));list.append(row);
    }
    if(!matches.length)list.append(el('p',query?'No comic series match your search.':'No comparable comic coverage found. Owned books with explicit full contents or numbered standalone issues contribute automatically; manual review is optional.'));
    if(selected&&!matches.includes(selected)){selected=null;detail.hidden=true;overview.hidden=false;detail.replaceChildren();}
  }
  search.addEventListener('input',()=>{page=0;render();});sort.addEventListener('change',()=>{page=0;render();});
  async function reload(id){
    status.textContent='Updating series coverage...';status.setAttribute('aria-busy','true');
    let result;try{result=await loadCoverageProjection(database,'comic-coverage',merges);}finally{status.setAttribute('aria-busy','false');}
    groups=result.groups;labels.clear();
    for(const group of groups)labels.set(group.id,comicSeriesLabel(group,groups));render();
    const next=groups.find(group=>group.id===id);if(next)select(next);
  }
  function mergePicker(group){
    const dialog=el('dialog');dialog.className='account-dialog';dialog.setAttribute('aria-label','Merge comic series');
    dialog.append(el('h3','Merge with another series'),el('p','Combine equivalent names for this run. Issue type and language must match. Original records stay unchanged; you can undo this merge.'));
    const search=el('input');search.type='search';search.placeholder='Search series';search.setAttribute('aria-label','Search merge target');
    const results=el('div'),titleLabel=el('label','Display series name (run is kept) '),title=el('input');title.maxLength=300;title.setAttribute('aria-label','Merged series name');titleLabel.append(title);
    const notice=el('p');notice.setAttribute('role','status');let target;
    const cancel=button('Cancel',()=>{dialog.close();dialog.remove();}),confirm=button('Combine series',async()=>{
      if(!target||!title.value.trim())return;
      confirm.disabled=cancel.disabled=search.disabled=title.disabled=true;notice.textContent='Saving series merge...';
      try{merges=await saveMerge(group.id,target.id,title.value.trim());}
      catch(error){notice.textContent='Could not combine series: '+error.message;confirm.disabled=cancel.disabled=search.disabled=title.disabled=false;}
      if(!confirm.disabled)return;
      try{await reload(target.id);dialog.close();dialog.remove();}
      catch(error){notice.textContent='Series merge saved, but coverage could not reload: '+error.message+'. Close this dialog and reopen Options to load the saved merge.';cancel.disabled=false;cancel.textContent='Close';}
    });confirm.disabled=true;dialog.append(search,results,titleLabel,el('p','The combined view recalculates issue coverage and copies using the supporting purchases. The target series keeps its starting number. This does not confirm new ownership.'),notice,cancel,confirm);
    function renderTargets(){
      results.replaceChildren();const query=search.value.trim().toLocaleLowerCase();
      const matches=groups.filter(candidate=>candidate.id!==group.id&&compatibleSeries(group.id,candidate.id)&&[label(candidate),...(candidate.originalTitles??[])].some(name=>name.toLocaleLowerCase().includes(query)));
      for(const candidate of matches.slice(0,10)){
        const choice=button(label(candidate)+' — '+candidate.unitType+'s · '+candidate.language,()=>{target=candidate;title.value=candidate.series;confirm.disabled=false;renderTargets();});choice.setAttribute('aria-pressed',String(candidate===target));choice.dataset.mergeTarget=candidate.id;results.append(choice);
      }
      if(!matches.length)results.append(el('p','No other series with the same run, issue type and language match.'));
      else if(matches.length>10)results.append(el('p','Showing 10 matches. Type more to narrow the list.'));
    }
    search.addEventListener('input',renderTargets);dialog.addEventListener('cancel',event=>{if(cancel.disabled)event.preventDefault();else dialog.remove();});renderTargets();document.body.append(dialog);dialog.showModal();search.focus();
  }
  root.ready=loadCoverageProjection(database,'comic-coverage',merges).then(result=>{groups=result.groups;for(const group of groups)labels.set(group.id,comicSeriesLabel(group,groups));render();if(result.provisional||result.unresolved){const excluded=el('details');excluded.append(el('summary','Unresolved contents'),el('p',`${result.provisional} provisional entries and ${result.unresolved} unresolved fragments or unsupported entries are excluded from covered-issue and missing-range totals.`));overview.append(excluded);}return {...result,summary:totals()};}).catch(error=>{status.textContent='Could not calculate comic coverage: '+error.message;status.setAttribute('aria-busy','false');root.append(button('Try again',()=>root.replaceWith(createComicCoverageView(database,{starts,merges,saveMerge,undoMerge,saveStart,openRecord}))));});
  return root;
}
