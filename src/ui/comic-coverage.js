import {coverageBrowseState,applyCoveragePreset,coverageGroupMatches} from './coverage-browse.js';
import {compareTitles} from '../lib/title-sort.js';
import {createCoverageExclusions} from './coverage-exclusions.js';
import {compatibleSeries,continuityProblem,continuityAssessment} from '../lib/comic-series-merges.js';
import {comicCoverageNameKey,comicSeriesDisplayName} from '../lib/comic-series-names.js';
import {createConfirmation} from './confirmation.js';
import {loadCoverageProjection} from './collection-overlap-projection.js';
import {comicRange,comicIssuePage,comicCoverageSummary,comicGroupCounts,comicSequenceOffset,validateNumberingTransitions} from '../lib/comic-coverage.js';
import {createPagination} from './pagination.js';
import {accountLabel} from './item-presentation.js';
import {publicationEvidence} from './contents-interpretation.js';
import {createCoverageResolutionQueue} from './coverage-resolution.js';
import {bookHref} from './contents-navigation.js';
import {comicSeriesTitle,comicSeriesLabel,coverageSegments,comicGridPage,seriesMergeTargets} from './comic-coverage-presentation.js';
export {comicSeriesLabel} from './comic-coverage-presentation.js';
const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(label,run)=>{const node=el('button',label);node.type='button';node.addEventListener('click',run);return node;};
export function createComicCoverageView(database,{starts={},transitions={},names={},saveName=async()=>{throw Error('Series names cannot be saved here.');},saveTransitions=async()=>{throw Error("Numbering transitions cannot be saved here.");},merges={},saveMerge=async()=>{throw Error('Series merges cannot be saved here.');},undoMerge=async()=>{throw Error('Series merges cannot be saved here.');},saveStart=async()=>{throw Error('Starting numbers cannot be saved here.');},openRecord,resolutionActions={},state={}}={}){
  state=coverageBrowseState(state);const generation=state.generation=(state.generation??0)+1;
  starts={...starts};transitions={...transitions};const root=el('div');root.className='comic-coverage';
  const intro=el('p','See comic issues covered by your owned books and standalone purchases. Partial coverage means some material from an issue; it still needs complete coverage. Inferred contents are included automatically; verified contents were reviewed. Multiple copies counts complete issue copies supported by distinct acquisitions, not repeated imports. Missing ranges run from the starting number through your highest represented issue, not the end of the published series.');
  const controls=el('div');controls.className='library-controls';
  const search=el('input');search.type='search';search.placeholder='Search comic series';search.setAttribute('aria-label','Search comic coverage');
  const sortLabel=el('label','Sort '),sort=el('select');sort.setAttribute('aria-label','Sort comic coverage');
  for(const [value,title]of [['title','Series title'],['covered','Most covered issues'],['duplicates','Most issues with multiple copies'],['missing','Most needing complete coverage']])sort.append(Object.assign(el('option',title),{value}));
  sortLabel.append(sort);
  search.value=state.query;sort.value=state.sort;
  const pick=(name,key,options)=>{const field=el('label',name+' '),input=el('select');input.setAttribute('aria-label',name);for(const [value,title]of options)input.append(Object.assign(el('option',title),{value}));input.value=state[key];input.addEventListener('change',()=>{state[key]=input.value;state.page=page=0;render();});field.append(input);return {field,input};};
  const scope=pick('Search scope','scope',[['all','Series and supporting books'],['series','Series titles'],['books','Supporting books']]);
  const run=pick('Run type','run',[['all','All runs'],['ongoing','Mainline runs'],['limited','Limited series'],['standalone','Standalone publications'],['unknown','Unclassified runs']]);
  const unit=pick('Issue type','issue',[['all','All issue types'],['issue','Regular issues'],['annual','Annuals'],['special','Specials and one-shots'],['unknown','Other / unknown']]);
  const coverage=pick('Coverage status','coverage',[['all','Any coverage'],['gaps','Known gaps in assumed range'],['no-gaps','No known gaps (extent unverified)'],['duplicates','Multiple copies'],['partial','Partial coverage']]);
  const direction=pick('Sort direction','direction',[['default','Default order'],['reverse','Reverse order']]);
  const unknownLabel=el('label',' Include unclassified runs'),unknown=el('input');unknown.type='checkbox';unknown.checked=state.unknown;unknown.setAttribute('aria-label','Include unclassified runs');unknownLabel.prepend(unknown);unknown.addEventListener('change',()=>{state.unknown=unknown.checked;state.page=page=0;render();});
  const presets=el('div');presets.className='actions';
  function syncControls(){run.input.value=state.run;unit.input.value=state.issue;coverage.input.value=state.coverage;unknown.checked=state.unknown;}
  for(const [value,title]of [['all','All publications'],['mainline','Mainline runs'],['resolution','Needs resolution']])presets.append(button(title,()=>{applyCoveragePreset(state,value);syncControls();page=0;if(resolutionQueue){resolutionQueue.open=state.queue.open;resolutionQueue.refresh?.();}render();if(value==='resolution')resolutionQueue?.scrollIntoView?.({block:'nearest'});}));
  const advanced=el('details');advanced.append(el('summary','More filters'),scope.field,direction.field,unknownLabel);advanced.open=state.advanced??false;advanced.addEventListener('toggle',()=>{if(root.isConnected)state.advanced=advanced.open;});
  const clear=button('Clear filters',()=>{applyCoveragePreset(state,'all');state.query='';state.scope='all';state.sort='title';state.direction='default';search.value='';sort.value='title';scope.input.value='all';direction.input.value='default';syncControls();page=0;render();});
  const filterNote=el('p');filterNote.setAttribute('role','status');
  controls.append(search,run.field,unit.field,coverage.field,sortLabel,clear);const overview=el('section');overview.append(intro,presets,controls,advanced,filterNote);root.append(overview);
  const status=el('p','Finding comic coverage…');status.setAttribute('role','status');status.setAttribute('aria-busy','true');
  const list=el('div'),detail=el('section');list.className='comic-series-list';detail.className='comic-series-detail';detail.hidden=true;
  let groups=[],resolutionQueue,page=state.page,size=state.size,selected;const labels=new Map();
  function acceptProjection(result){
    groups=result.groups;renderAccessExclusions(result.excluded);
    const next=createCoverageResolutionQueue(database,result,{...resolutionActions,merges,state:state.queue,searchScope:()=>state.scope,resolved:async(nextDatabase,projection)=>{database=nextDatabase;const scroll=globalThis.scrollY??0;acceptProjection(projection);render();await resolutionActions.resolved?.(nextDatabase,projection);globalThis.scrollTo?.(0,scroll);}});
    if(resolutionQueue){next.open=resolutionQueue.open;resolutionQueue.replaceWith(next);}else controls.after(next);resolutionQueue=next;rebuildLabels();
  }
  let accessExclusions;
  function renderAccessExclusions(excluded){
    const next=createCoverageExclusions(excluded??[],database,{openRecord,state:state.access??(state.access={})});
    if(accessExclusions)accessExclusions.replaceWith(next);else overview.append(next);accessExclusions=next;
  }
  const pager=createPagination({name:'Comic series',onPage:value=>{state.page=page=value;render();},onSize:value=>{state.size=size=value;state.page=page=0;render();}});
  overview.append(status,pager.sizeContainer,pager.top,list,pager.bottom);root.append(detail);
  let returnScroll=0,returnFocus;
  const displayName=group=>comicSeriesDisplayName(group,names);
  const label=group=>labels.get(group.id)??comicSeriesLabel(group,groups,names);
  function rebuildLabels(){labels.clear();for(const group of groups)labels.set(group.id,comicSeriesLabel(group,groups,names));}
  const totals=()=>comicCoverageSummary(groups,starts,transitions);
  const issueLabel=issue=>issue.missing?'Missing':issue.partial?'Partial coverage':issue.copies>1?'Owned '+issue.copies+' times':'Owned';
  const countLabel=group=>{const counts=comicGroupCounts(group);return counts.covered+' covered'+(counts.partial?' · '+counts.partial+' partial':'')+' · '+counts.duplicates+' owned multiple times';};
  function appendSource(list,source){
    const record=source.record,link=el('a',record.title+' — '+accountLabel(record,database));link.href=bookHref('library',record.recordRef);link.dataset.comicRecord=record.recordRef;
    if(openRecord)link.addEventListener('click',event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();openRecord(record.recordRef);});
    const li=el('li');li.append(link,el('span',source.completeness==='excerpt'?' — Partial coverage':' — Complete issue'));
    if(source.seriesScope)li.append(el('span',' — '+source.seriesScope.series+(source.seriesScope.run?' ('+source.seriesScope.run+')':'')));
    if(source.runInference){const note=el('span',' (Run inferred: '+source.runInference.run+'. '+source.runInference.reason+'. '),review=el('a','Review contents');review.href=bookHref('contents',record.recordRef);note.append(review,')');li.append(note);}
    if(source.publicationResolution)li.append(publicationEvidence([source.publicationResolution]));
    if(source.statement){const evidence=el('details');evidence.append(el('summary','Source evidence'),el('blockquote',source.statement));if(source.annualInference){const original=source.annualInference,review=el('a','Review contents');review.href=bookHref('contents',record.recordRef);evidence.append(el('p','Original annual label: '+original.series+(original.year?' ('+original.year+')':original.run?' ('+original.run+')':'')+'. Grouped using saved collection and series context.'),review);}li.append(evidence);}list.append(li);
  }
  function select(group){
    returnScroll=state.returnScroll??globalThis.scrollY??0;returnFocus=document.activeElement;selected=group;state.selected=group.id;state.returnScroll=returnScroll;overview.hidden=true;detail.hidden=false;detail.replaceChildren();
    detail.append(button('Back to series',()=>{state.selected=null;delete state.returnScroll;selected=null;detail.hidden=true;overview.hidden=false;returnFocus?.focus({preventScroll:true});globalThis.scrollTo?.(0,returnScroll);}));
    const heading=el('h3',label(group));heading.tabIndex=-1;detail.append(heading);
    detail.append(button('Merge with another series',()=>mergePicker(group)));
    detail.append(button('Rename series',()=>renameSeries(group,()=>{heading.textContent=label(group);renderGrid();render();})));
    if(group.members){detail.append(el('p','Combined series: '+(group.originalScopes??group.originalTitles.map(series=>({series}))).map(scope=>scope.series+(scope.run?' ('+scope.run+')':'')).join(' / ')),button('Undo series merge',async()=>{
      const confirmation=createConfirmation({title:'Undo series merge?',message:'Separate all original series in this group. Collection records and contents will stay unchanged.',confirmLabel:'Separate series'});
      if(!await confirmation.result)return;
      try{merges=await undoMerge(group.id);}catch(error){detail.append(el('p','Could not undo merge: '+error.message));return;}
      try{await reload(group.id);}catch(error){detail.append(el('p','Series separated, but coverage could not reload: '+error.message+'. Reopen Options to load the saved change.'));}
    }));}
    const rangeInfo=el('p'),notice=el('p');notice.setAttribute('role','status');
    const startLabel=el('label','Starting number '),start=el('input');start.type='number';start.min='0';start.max='999999';start.step='1';start.value=String(starts[group.id]??1);start.setAttribute('aria-label','Series starting number');startLabel.append(start);
    const settings=el('div');settings.className='actions';
    const save=button('Save starting number',()=>persist(Number(start.value))),reset=button('Reset to #1',()=>persist(null));settings.append(startLabel,save,reset);detail.append(rangeInfo);const startSettings=el('details');startSettings.append(el('summary','Starting issue number'),el('p','Missing issues are counted from this number to your highest covered issue.'),settings,notice);detail.append(startSettings);
    const numbering=el('details'),transitionList=el('div'),transitionNotice=el('p'),from=el('input'),to=el('input');
    transitionNotice.setAttribute('role','status');
    for(const [input,name]of [[from,'Last issue before transition'],[to,'Next published issue']]){input.type='number';input.min='0';input.max='999999';input.step='1';input.setAttribute('aria-label',name);}
    const fromLabel=el('label','From # '),toLabel=el('label','Next # ');fromLabel.append(from);toLabel.append(to);
    const addTransition=button('Add transition',()=>{
      if(!from.value.trim()||!to.value.trim()){transitionNotice.textContent='Enter both issue numbers.';return;}
      persistTransitions([...(transitions[group.id]??[]),[Number(from.value),Number(to.value)]]);
    });
    numbering.append(el('summary','Numbering transitions'),el('p','For continuing numbering, #58 → #500 means #500 follows #58. The skipped numbers are excluded from gaps, the grid and the bar. This does not change your books or their issue numbers.'),transitionList,fromLabel,toLabel,addTransition,transitionNotice);detail.append(numbering);
    function renderTransitions(){
      transitionList.replaceChildren();
      for(const pair of transitions[group.id]??[]){const row=el('div');row.className='actions';
        row.append(el('span','#'+pair[0]+' → #'+pair[1]),button('Edit transition',()=>{from.value=String(pair[0]);to.value=String(pair[1]);editing=pair;addTransition.textContent='Save transition';from.focus();}),button('Remove transition',()=>persistTransitions((transitions[group.id]??[]).filter(value=>value!==pair))));transitionList.append(row);
      }
      const conflicts=comicRange(group,starts[group.id]??1,transitions[group.id]).conflicts;
      if(conflicts.length)transitionList.append(el('p','A saved transition contains covered issues in its skipped range. It is inactive so those issues remain visible. Edit or remove it.'));
    }
    let editing;
    async function persistTransitions(value){
      try{
        if(editing&&value.length>(transitions[group.id]??[]).length)value=value.filter(pair=>pair!==editing);
        const checked=validateNumberingTransitions(value);
        if(comicRange(group,starts[group.id]??1,checked).conflicts.length)throw Error('The skipped range contains covered issues. Choose a transition that preserves them.');
        for(const control of numbering.querySelectorAll('button,input'))control.disabled=true;transitionNotice.textContent='Saving numbering transitions…';
        transitions=await saveTransitions(group.id,checked);editing=undefined;from.value=to.value='';addTransition.textContent='Add transition';
        issuePage=gridPage=0;renderTransitions();renderIssues();renderGrid();render();transitionNotice.textContent='Numbering transitions saved. Contents and ownership are unchanged.';
      }catch(error){transitionNotice.textContent='Could not save transition: '+error.message;}finally{for(const control of numbering.querySelectorAll('button,input'))control.disabled=false;}
    }
    const filterLabel=el('label','Show '),filter=el('select');filter.setAttribute('aria-label','Comic issue filter');
    for(const [value,label]of [['owned','Complete or partial coverage'],['duplicates','Multiple complete copies'],['partial','Partial coverage'],['missing','Needs complete coverage']])filter.append(Object.assign(el('option',label),{value}));filterLabel.append(filter);
    const detailState=state.details[group.id]??(state.details[group.id]={});filter.value=detailState.filter??'owned';
    let mode=detailState.mode??'grid',gridPage=detailState.gridPage??0;const display=el('div');display.className='coverage-view-controls';const gridButton=button('Grid',()=>switchMode('grid')),listButton=button('List',()=>switchMode('list'));display.append(gridButton,listButton,filterLabel);detail.append(display);
    const bar=el('div');bar.className='comic-coverage-bar';bar.setAttribute('aria-label','Issue coverage ranges');
    const legend=el('p');legend.className='coverage-legend';legend.setAttribute('aria-label','Issue color legend');
    for(const [state,text]of [['owned','Owned'],['duplicate','Multiple copies'],['partial','Partial coverage'],['missing','Missing']]){
      const item=el('span'),square=el('i');square.className='coverage-'+state;square.setAttribute('aria-hidden','true');item.append(square,document.createTextNode(text));legend.append(item);
    }
    detail.insertBefore(bar,display);detail.insertBefore(legend,display);
    const gridView=el('section'),rangeNav=el('div'),grid=el('div'),extraGrid=el('div'),sourcePanel=el('section');grid.className=extraGrid.className='comic-issue-grid';rangeNav.className='actions';sourcePanel.className='comic-issue-sources';sourcePanel.hidden=true;sourcePanel.setAttribute('aria-live','polite');
    const previous=button('Previous range',()=>{gridPage--;renderGrid();}),next=button('Next range',()=>{gridPage++;renderGrid();}),rangeLabel=el('span');rangeNav.append(previous,rangeLabel,next);gridView.append(rangeNav,grid,extraGrid);detail.append(gridView,sourcePanel);
    const table=el('table'),thead=el('thead'),head=el('tr');for(const title of ['Issue','Coverage','Supporting books'])head.append(el('th',title));thead.append(head);const body=el('tbody');table.append(thead,body);let issuePage=detailState.issuePage??0,issueSize=detailState.issueSize??50;
    const issuesPager=createPagination({name:'Comic issues',onPage:value=>{detailState.issuePage=issuePage=value;renderIssues();},onSize:value=>{detailState.issueSize=issueSize=value;detailState.issuePage=issuePage=0;renderIssues();}});
    const listView=el('section');listView.hidden=true;listView.append(issuesPager.sizeContainer,issuesPager.top,table,issuesPager.bottom);detail.append(listView);
    function switchMode(value){detailState.mode=mode=value;gridButton.setAttribute('aria-pressed',String(mode==='grid'));listButton.setAttribute('aria-pressed',String(mode==='list'));gridView.hidden=mode!=='grid';listView.hidden=mode!=='list';filterLabel.hidden=mode!=='list';sourcePanel.hidden=!sourcePanel.childElementCount||!detailState.issue;}
    function showIssue(issue){
      detailState.issue=issue.number;sourcePanel.hidden=false;
      sourcePanel.replaceChildren(el('h4','#'+issue.number+' · '+issueLabel(issue)));
      if(issue.missing){sourcePanel.append(el('p','No comparable full coverage in your saved library.'));return;}
      sourcePanel.append(el('p',issue.confidence==='direct'?'Standalone issue':issue.confidence==='verified'?'Verified contents':'Inferred from saved collection contents'));
      if(issue.partial)sourcePanel.append(el('p','You own some material from this issue. Complete coverage is still missing.'));
      const sources=el('ul');
      for(const source of issue.sources)appendSource(sources,source);
      sourcePanel.append(sources);
    }
    function renderGrid(){
      const result=comicGridPage(group,{start:starts[group.id]??1,transitions:transitions[group.id],page:gridPage});
      detailState.gridPage=gridPage=result.page;previous.disabled=gridPage===0;next.disabled=gridPage+1>=result.pages;
      const visibleRanges=[];
      for(const issue of result.rows){const n=Number(issue.number),prior=visibleRanges.at(-1);if(prior&&prior[1]+1===n)prior[1]=n;else visibleRanges.push([n,n]);}
      rangeLabel.textContent=result.rows.length?visibleRanges.map(([a,b])=>'#'+a+(a===b?'':'\u2013'+b)).join(', '):'No whole-number range';
      grid.replaceChildren();extraGrid.replaceChildren();sourcePanel.hidden=true;
      function cells(rows,target){
        for(const issue of rows){
          const state=issue.missing?'missing':issue.partial?'partial':issue.copies>1?'duplicate':'owned';
          const cell=button('#'+issue.number,()=>{
            for(const other of detail.querySelectorAll('[data-comic-grid-issue]'))other.setAttribute('aria-pressed',String(other===cell));
            showIssue(issue);sourcePanel.scrollIntoView?.({block:'nearest'});
          });
          cell.className='comic-issue-cell coverage-'+state;cell.dataset.comicGridIssue=issue.number;cell.dataset.coverage=state;
          cell.setAttribute('aria-pressed',String(issue.number===detailState.issue));
          cell.setAttribute('aria-label','#'+issue.number+' \u00b7 '+issueLabel(issue));
          target.append(cell);
        }
      }
      cells(result.rows,grid);
      const remembered=[...result.rows,...result.extras].find(i=>i.number===detailState.issue);if(remembered)showIssue(remembered);
      if(result.extras.length){
        // Keep special numbers and covered issues below the chosen start visible,
        // without rendering an unbounded second grid for a high start override.
        extraGrid.append(el('p','Other covered numbers'));let shown=0;
        const more=button('Show more covered numbers',()=>appendExtras());
        function appendExtras(){more.remove();cells(result.extras.slice(shown,shown+100),extraGrid);shown+=100;if(shown<result.extras.length)extraGrid.append(more);}
        appendExtras();
      }
      bar.replaceChildren();
      const projection=coverageSegments(group,starts[group.id]??1,transitions[group.id]),extent=projection.range.extent;
      for(const segment of projection.segments){
        const description=displayName(group)+' #'+segment.first+(segment.last===segment.first?'':'\u2013'+segment.last)+' — '+(segment.status==='duplicate'?'Multiple copies':segment.status==='owned'?'Owned':segment.status==='partial'?'Partial coverage':'Missing');
        const item=button('',()=>{
          gridPage=Math.floor(comicSequenceOffset(projection.range,segment.first)/100);renderGrid();switchMode('grid');
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
      bar.setAttribute('aria-label','Coverage from #'+projection.range.start+' to #'+projection.range.end+': '+(extent-projection.range.missing)+' covered, '+projection.range.partial+' partial, '+projection.range.uncovered+' missing. Partial issues still need complete coverage. See numbered issue cells for supporting books.');
    }
    function renderIssues(){
      const result=comicIssuePage(group,{start:starts[group.id]??1,transitions:transitions[group.id],filter:filter.value,page:issuePage,size:issueSize});detailState.issuePage=issuePage=result.page;
      const range=result.range;rangeInfo.textContent=`${countLabel(group)} · ${range.uncovered} missing${range.end>=range.start?' within #'+range.start+'–'+range.end:'; no whole-number range at this start'}.${range.partial?' '+range.missing+' issues still need complete coverage, including partial issues.':''}${range.belowStart?' Covered issues below the starting number are still listed.':''}`;
      issuesPager.update({total:result.total,page:issuePage,size:issueSize});body.replaceChildren();
      for(const issue of result.rows){
        const row=el('tr');row.dataset.comicIssue=issue.number;const supporting=el('td');
        if(!issue.missing){const disclosure=el('details');disclosure.append(el('summary','Supporting books ('+issue.sources.length+')'));let built=false;
          disclosure.addEventListener('toggle',()=>{if(!disclosure.open||built)return;built=true;const sources=el('ul');for(const source of issue.sources)appendSource(sources,source);disclosure.append(sources);});supporting.append(disclosure);
        }else supporting.textContent='No comparable full coverage in your saved library';
        const coverage=el('td',issue.missing?'Missing in assumed range':`${issueLabel(issue)} · ${issue.confidence==='direct'?'standalone':issue.confidence}`);coverage.className='coverage-'+(issue.missing?'missing':issue.partial?'partial':issue.copies>1?'duplicate':'owned');row.append(el('td','#'+issue.number),coverage,supporting);body.append(row);
      }
      if(!result.rows.length){const row=el('tr'),cell=el('td',filter.value==='missing'?'No issues need complete coverage in this assumed range.':filter.value==='duplicates'?'No confirmed duplicate coverage in this series.':filter.value==='partial'?'No partial-only coverage in this series.':'No covered issues.');cell.colSpan=3;row.append(cell);body.append(row);}
    }
    async function persist(value){
      if(value!==null&&(!start.value.trim()||!Number.isSafeInteger(value)||value<0||value>999999)){notice.textContent='Enter a whole starting number from 0 to 999999.';return;}
      save.disabled=reset.disabled=start.disabled=true;notice.textContent='Saving starting number…';
      try{const updated=await saveStart(group.id,value);starts=updated??{...starts,[group.id]:value??1};if(value===null||value===1)delete starts[group.id];start.value=String(starts[group.id]??1);issuePage=gridPage=0;renderIssues();renderGrid();render();returnFocus=[...list.querySelectorAll('[data-comic-series]')].find(row=>row.dataset.comicSeries===group.id)?.querySelector(':scope > button');notice.textContent='Starting number saved. Contents and ownership are unchanged.';}
      catch(error){notice.textContent='Could not save starting number: '+error.message;}
      finally{save.disabled=reset.disabled=start.disabled=false;}
    }
    filter.addEventListener('change',()=>{detailState.filter=filter.value;detailState.issuePage=issuePage=0;renderIssues();});renderTransitions();renderIssues();renderGrid();switchMode(mode);heading.focus({preventScroll:true});root.scrollIntoView?.({block:'start'});
  }
  function render(){
    const resolving=state.preset==='resolution';for(const [index,value]of ['all','mainline','resolution'].entries())presets.children[index].setAttribute('aria-pressed',String(value==='resolution'?resolving:value==='mainline'?!resolving&&state.run==='ongoing'&&state.issue==='issue':!resolving&&state.run==='all'&&state.issue==='all')); for(const node of [list,status,pager.sizeContainer,pager.top,pager.bottom,run.field,unit.field,coverage.field,sortLabel,advanced])node.hidden=resolving;
    state.query=search.value;state.sort=sort.value;const query=state.query.trim().toLocaleLowerCase(),matches=groups.filter(group=>coverageGroupMatches(group,state,{label:label(group),starts,transitions}));
    matches.sort((a,b)=>(sort.value==='covered'?comicGroupCounts(b).covered-comicGroupCounts(a).covered:sort.value==='duplicates'?b.duplicates-a.duplicates:sort.value==='missing'?comicRange(b,starts[b.id]??1,transitions[b.id]).missing-comicRange(a,starts[a.id]??1,transitions[a.id]).missing:0)||compareTitles(label(a),label(b)));
    if(state.direction==='reverse')matches.reverse();
    const pagination=pager.update({total:matches.length,page,size});state.page=page=pagination.page;
    filterNote.textContent=resolving?'Showing actionable unresolved collections. Publication filters do not hide this queue.':matches.length+' of '+groups.length+' groups shown. '+(state.run==='ongoing'?'Mainline uses cited ongoing-run classifications; '+(state.unknown?'unclassified runs included.':'unclassified runs excluded. '):'')+(state.issue!=='all'?'Issue type: '+unit.input.selectedOptions[0].textContent+'. ':'')+'Resolution counts remain unfiltered; annuals and specials are available under All publications. No known gaps does not establish a complete published run.';list.replaceChildren();const counts=totals();
    status.textContent=`${counts.seriesGroups} series · ${counts.covered} covered issues${counts.partial?' · '+counts.partial+' partial':''} · ${counts.duplicates} owned multiple times · ${counts.missing} missing in assumed ranges${query?' · '+matches.length+' matching groups':''}.`;status.setAttribute('aria-busy','false');
    for(const group of matches.slice(page*size,(page+1)*size)){
      const row=el('article');row.className='tool-card';row.dataset.comicSeries=group.id;
      const title=el('div');title.className='comic-series-card-title';
      const rename=button('\u270e',()=>renameSeries(group,()=>{render();[...list.querySelectorAll('[data-comic-series]')].find(card=>card.dataset.comicSeries===group.id)?.querySelector('.comic-series-rename')?.focus({preventScroll:true});}));
      rename.className='comic-series-rename';rename.title='Rename series';rename.setAttribute('aria-label','Rename series');
      title.append(el('h3',label(group)),rename);
      row.append(title,el('p',`${countLabel(group)} · ${comicRange(group,starts[group.id]??1,transitions[group.id]).uncovered} missing`),button('Inspect issues',()=>select(group)));list.append(row);
      if(selected?.id===group.id)returnFocus=row.querySelector(':scope > button');
    }
    if(!matches.length)list.append(el('p',query||matches.length!==groups.length?'No series match these filters. Clear filters to show all saved coverage.':'No comparable comic coverage found. Owned books with explicit full contents or numbered standalone issues contribute automatically; manual review is optional.'));
    if(selected&&!groups.some(g=>g.id===selected.id)){state.selected=null;selected=null;detail.hidden=true;overview.hidden=false;detail.replaceChildren();}
    resolutionQueue?.updateQuery(search.value);
  }
  search.addEventListener('input',()=>{state.page=page=0;render();});sort.addEventListener('change',()=>{state.page=page=0;render();});
  async function reload(id){
    status.textContent='Updating series coverage...';status.setAttribute('aria-busy','true');
    let result;try{result=await loadCoverageProjection(database,'comic-coverage',merges);}finally{status.setAttribute('aria-busy','false');}
    acceptProjection(result);render();
    const next=groups.find(group=>group.id===id);if(next)select(next);
  }
  function renameSeries(group,updated){
    const dialog=el('dialog');dialog.className='account-dialog';dialog.setAttribute('aria-label','Rename comic series');
    const name=el('input');name.maxLength=300;name.value=comicSeriesTitle(group,names);name.setAttribute('aria-label','Series display name');
    const field=el('label','Display series name ');field.append(name);
    const notice=el('p');notice.setAttribute('role','status');let saving=false;
    const cancel=button('Cancel',()=>{dialog.close();dialog.remove();}),save=button('Save name',()=>persistName(name.value.trim())),reset=button('Reset to default',()=>persistName(null));
    dialog.append(el('h3','Rename series'),el('p','Choose the complete display name, including any years or volume labels you want. The issue type is shown separately. Issues, copies, source records and merge relationships stay unchanged.'),el('p','Issue type: '+group.unitType+'s'),field,el('p','Default name: '+comicSeriesTitle(group,{[comicCoverageNameKey(group)]:null})),notice,cancel,reset,save);
    function validateName(){save.disabled=!name.value.trim();notice.textContent=save.disabled?'Enter a display name, or choose Reset to default.':'';}
    async function persistName(value){
      if(saving)return;if(value!==null&&!value){validateName();return;}saving=true;
      for(const control of dialog.querySelectorAll('button,input'))control.disabled=true;notice.textContent='Saving series name...';
      try{names=await saveName(comicCoverageNameKey(group),value);rebuildLabels();dialog.close();dialog.remove();updated();}
      catch(error){saving=false;for(const control of dialog.querySelectorAll('button,input'))control.disabled=false;validateName();notice.textContent='Could not save series name: '+error.message;}
    }
    name.addEventListener('input',validateName);
    name.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();persistName(name.value.trim());}});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();if(!saving){dialog.close();dialog.remove();}}});
    dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();else dialog.remove();});validateName();document.body.append(dialog);dialog.showModal();name.focus();name.select();
  }
  function mergePicker(group){
    const dialog=el('dialog');dialog.className='account-dialog';dialog.setAttribute('aria-label','Merge comic series');
    dialog.append(el('h3','Merge with another series'),el('p','Find the other series first. Similar names appear first; after selecting one, check whether these are equivalent names or continuing publication eras. Original records stay unchanged and merges can be undone.'));
    const continuityLabel=el('label','Confirm these eras kept the same continuing issue numbering '),continuity=el('input');continuity.type='checkbox';continuity.setAttribute('aria-label','Same continuing numbering across publication eras');continuityLabel.prepend(continuity);continuityLabel.hidden=true;
    const search=el('input');search.type='search';search.placeholder='Search series';search.setAttribute('aria-label','Search merge target');
    const results=el('div'),titleLabel=el('label','Display series name '),title=el('input');title.maxLength=300;title.setAttribute('aria-label','Merged series name');titleLabel.append(title);
    const selection=el('p');selection.className='comic-merge-selection';selection.setAttribute('aria-live','polite');
    const notice=el('p');notice.setAttribute('role','status');let target,saving=false;
    const cancel=button('Cancel',()=>{dialog.close();dialog.remove();}),confirm=button('Combine series',async()=>{
      if(saving)return;updateCompatibility();if(confirm.disabled)return;
      const destination=target.id;saving=true;
      for(const control of dialog.querySelectorAll('button,input'))control.disabled=true;notice.textContent='Saving series merge...';
      try{merges=await saveMerge(group.id,destination,title.value.trim(),continuity.checked);}
      catch(error){saving=false;for(const control of dialog.querySelectorAll('button,input'))control.disabled=false;updateCompatibility();notice.textContent='Could not combine series: '+error.message;return;}
      try{const combined=Object.entries(merges).find(([,merge])=>merge.members.includes(group.id)&&merge.members.includes(destination));if(combined){names={...names};delete names[comicCoverageNameKey({id:combined[0],members:combined[1].members})];}await reload(destination);dialog.close();dialog.remove();}
      catch(error){notice.textContent='Series merge saved, but coverage could not reload: '+error.message+'. Close this dialog and reopen Options to load the saved merge.';cancel.disabled=false;cancel.textContent='Close';}
    });confirm.disabled=true;dialog.append(el('p','Current group: '+label(group)),search,results,selection,titleLabel,continuityLabel,el('p','The combined view recalculates issue coverage and copies using the supporting purchases. The target series keeps its starting number and numbering transitions. This does not confirm new ownership.'),notice,cancel,confirm);
    function updateCompatibility(){
      continuityLabel.hidden=true;confirm.disabled=true;notice.textContent='';
      selection.textContent=target?'Selected target: '+label(target)+' · '+target.language:'No target selected.';
      if(saving){notice.textContent='Saving series merge...';return;}
      if(!target){notice.textContent='Select a series to combine.';return;}
      try{
        if(!compatibleSeries(group.id,target.id,true)){continuity.checked=false;notice.textContent='Issue type and language must match. Choose a compatible series; annuals, regular issues and different languages stay separate.';return;}
        const assessment=continuityAssessment(group,target);if(assessment.problem){continuity.checked=false;notice.textContent=assessment.problem;return;}
        if(!compatibleSeries(group.id,target.id)){
          const unknownRun=[group,target].some(value=>value.originalScopes?value.originalScopes.some(scope=>!scope.run):!value.run);
          continuityLabel.hidden=false;notice.textContent=assessment.equivalent?'Saved collection information connects both labels to the same publication run. Shared issues are allowed; multiple copies still require separate purchases. Confirm that these labels use the same continuing numbering. Original runs remain in supporting-book details.':unknownRun?'One or more original series labels have no publication run. Confirm that these are the same series with continuing numbering; do not combine runs that restarted at #1. Original labels remain in supporting-book details.':'These have different publication-era labels. Confirm continuing numbering only if the series did not restart at #1. Original runs remain in supporting-book details.';
        }else{continuity.checked=false;notice.textContent='These use the same run, issue type and language. Combine them only if the names refer to the same series.';}
        if(!title.value.trim()){notice.textContent+=' Enter a display series name before combining.';return;}
        confirm.disabled=!compatibleSeries(group.id,target.id,continuity.checked);
      }catch(error){continuity.checked=false;notice.textContent='Could not check this target: '+error.message+'. Choose another series or reopen Comic Coverage.';}
    }
    function renderTargets(){
      results.replaceChildren();const query=search.value.trim().toLocaleLowerCase();
      const matches=seriesMergeTargets(group,groups,query,names);
      if(target&&!matches.includes(target)){target=undefined;title.value='';continuity.checked=false;updateCompatibility();}
      const visible=matches.slice(0,10);if(target&&matches.includes(target)&&!visible.includes(target))visible[visible.length-1]=target;
      for(const candidate of visible){
        const choice=button(label(candidate)+' · '+candidate.language,()=>{if(saving)return;target=candidate;continuity.checked=false;const renamedSource=names[comicCoverageNameKey(group)];title.value=typeof renamedSource==='string'?renamedSource:displayName(candidate);updateCompatibility();renderTargets();[...results.querySelectorAll('[data-merge-target]')].find(node=>node.dataset.mergeTarget===candidate.id)?.focus({preventScroll:true});});choice.className='comic-merge-target';choice.setAttribute('aria-pressed',String(candidate===target));if(candidate===target){const mark=el('span',' ✓');mark.setAttribute('aria-hidden','true');choice.append(mark);}choice.dataset.mergeTarget=candidate.id;choice.disabled=saving;results.append(choice);
      }
      if(!matches.length)results.append(el('p','No other series match your search.'));
      else if(matches.length>10)results.append(el('p','Showing 10 matches. Type more to narrow the list.'));
    }
    continuity.addEventListener('change',updateCompatibility);title.addEventListener('input',updateCompatibility);search.addEventListener('input',renderTargets);dialog.addEventListener('cancel',event=>{if(cancel.disabled)event.preventDefault();else dialog.remove();});updateCompatibility();renderTargets();document.body.append(dialog);dialog.showModal();search.focus();
  }
  root.captureState=()=>{if(root.isConnected&&root.getClientRects().length)state.scroll=globalThis.scrollY??0;};
  root.ready=loadCoverageProjection(database,'comic-coverage',merges).then(result=>{if(state.generation!==generation)return result;acceptProjection(result);render();const previous=groups.find(g=>g.id===state.selected);if(previous)select(previous);else state.selected=null;if(root.isConnected&&root.getClientRects().length&&state.scroll!==undefined)globalThis.scrollTo?.(0,state.scroll);return {...result,summary:totals()};}).catch(error=>{status.textContent='Could not calculate comic coverage: '+error.message;status.setAttribute('aria-busy','false');root.append(button('Try again',()=>root.replaceWith(createComicCoverageView(database,{starts,transitions,names,saveName,saveTransitions,merges,saveMerge,undoMerge,saveStart,openRecord,resolutionActions,state}))));});
  return root;
}
