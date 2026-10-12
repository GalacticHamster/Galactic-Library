import {overlapPairDetails,overlapIssueLabel,sortOverlapUnits} from '../lib/collection-overlap.js';
import {loadOverlapProjection} from './collection-overlap-projection.js';
import {accountLabel} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
import {createPagination} from './pagination.js';
const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(label,run)=>{const node=el('button',label);node.type='button';node.addEventListener('click',run);return node;};
export function createCollectionOverlapView(database,{openRecord}={}){
  const root=el('div');root.className='collection-overlap';
  root.append(el('p','Find issues shared by your owned collections. Inferred contents are included; verified means both collections’ contents were reviewed. Viewing overlaps does not change your library.'));
  const controls=el('div');controls.className='library-controls';
  const search=el('input');search.type='search';search.placeholder='Search collection titles';search.setAttribute('aria-label','Search overlapping collections');
  const sortLabel=el('label','Sort '),sort=el('select');sort.setAttribute('aria-label','Sort collection overlaps');
  for(const [value,title]of [['shared','Most shared issues'],['title','Collection title']])sort.append(Object.assign(el('option',title),{value}));
  sortLabel.append(sort);controls.append(search,sortLabel);root.append(controls);
  const status=el('p','Finding collection overlaps…');status.setAttribute('role','status');status.setAttribute('aria-busy','true');
  const list=el('div'),detail=el('section');list.className='overlap-pairs';detail.className='overlap-pair-details';detail.hidden=true;
  let pairs=[],page=0,size=50,selected=null;
  const pager=createPagination({name:'Collection overlap',onPage:value=>{page=value;render();},onSize:value=>{size=value;page=0;render();}});
  root.append(status,pager.sizeContainer,pager.top,list,pager.bottom,detail);
  const linkRecord=record=>{
    const link=el('a',record.title+' — '+accountLabel(record,database));link.href=bookHref('library',record.recordRef);link.dataset.overlapRecord=record.recordRef;
    if(openRecord)link.addEventListener('click',event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();openRecord(record.recordRef);});
    return link;
  };
  function sourceList(unit){const list=el('ul');for(const source of unit.sources){const row=el('li');row.append(linkRecord(source.item));list.append(row);}return list;}
  function issueList(title,units,shared=false){
    const section=el('section'),list=el('ul');section.append(el('h4',title+' ('+units.length+')'),list);
    units=sortOverlapUnits([...units]);let shown=0;
    const more=button('Show more issues',()=>show());
    function show(){for(const unit of units.slice(shown,shown+50)){
      const row=el('li'),evidence=el('details');evidence.append(el('summary',overlapIssueLabel(unit.entry)+' · '+unit.confidence));
      if(shared){evidence.append(el('p',selected.left.title),sourceList(unit.left),el('p',selected.right.title),sourceList(unit.right));}
      else evidence.append(sourceList(unit));
      row.append(evidence);list.append(row);
    }shown+=50;more.hidden=shown>=units.length;}
    if(!units.length)section.append(el('p','None in the comparable saved contents.'));section.append(more);show();return section;
  }
  function select(pair){
    selected=pair;detail.hidden=false;detail.replaceChildren();
    const heading=el('h3',pair.left.title+' ↔ '+pair.right.title);heading.tabIndex=-1;
    detail.append(heading,el('p',pair.shared.length+' shared issues · '+(pair.verified===pair.shared.length?'Verified':pair.verified?'Mixed inferred and verified':'Inferred')));
    for(const collection of [pair.left,pair.right]){
      const links=el('p');links.append(collection.title+': ');
      for(const record of collection.records.values()){links.append(linkRecord(record),document.createTextNode(' '));}detail.append(links);
    }
    const result=overlapPairDetails(pair);
    detail.append(issueList('Shared issues',result.shared,true),el('p','Listed only in one collection means the other’s comparable saved contents do not list them. It does not prove absence from an incomplete description.'));
    detail.append(issueList('Listed only in '+pair.left.title,result.left.unique),issueList('Listed only in '+pair.right.title,result.right.unique));
    const uncertain=result.left.uncertain.length+result.right.uncertain.length+pair.left.provisional.size+pair.right.provisional.size;
    if(uncertain)detail.append(el('p',`${uncertain} entries have insufficient identity context for a shared-or-unique conclusion.`));
    heading.focus();detail.scrollIntoView?.({block:'start'});
  }
  function render(){
    const query=search.value.trim().toLocaleLowerCase();
    const matches=pairs.filter(pair=>[pair.left,pair.right].some(c=>[c.title,...[...c.records.values()].map(r=>r.title)].some(title=>title.toLocaleLowerCase().includes(query))));
    const titleKey=pair=>[pair.left.title,pair.right.title].sort().join(' ');
    matches.sort((a,b)=>(sort.value==='shared'?b.shared.length-a.shared.length:0)||titleKey(a).localeCompare(titleKey(b),undefined,{numeric:true}));
    const state=pager.update({total:matches.length,page,size});page=state.page;list.replaceChildren();
    status.textContent=`${matches.length} overlapping collection pairs${query?' matching your search':''}.`;status.setAttribute('aria-busy','false');
    for(const pair of matches.slice(page*size,(page+1)*size)){
      const row=el('article');row.className='tool-card';row.dataset.overlapPair=pair.id;
      row.append(el('h3',pair.left.title+' ↔ '+pair.right.title),el('p',`${pair.shared.length} shared issues · ${pair.verified===pair.shared.length?'Verified':pair.verified?'Mixed inferred and verified':'Inferred'}`),button('Inspect overlap',()=>select(pair)));list.append(row);
    }
    if(!matches.length)list.append(el('p',query?'No overlapping collections match these titles.':'No comparable issue overlaps found. Owned collections with full, sufficiently identified contents contribute automatically; manual review is optional.'));
    if(selected&&!matches.includes(selected)){selected=null;detail.hidden=true;detail.replaceChildren();}
  }
  search.addEventListener('input',()=>{page=0;render();});sort.addEventListener('change',()=>{page=0;render();});
  root.ready=loadOverlapProjection(database).then(result=>{pairs=result.pairs;render();return result;}).catch(error=>{status.textContent='Could not calculate overlaps: '+error.message;status.setAttribute('aria-busy','false');root.append(button('Try again',()=>{const replacement=createCollectionOverlapView(database,{openRecord});root.replaceWith(replacement);}));});
  return root;
}
