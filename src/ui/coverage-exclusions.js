import {accessLabel,accountLabel} from './formatters.js';
import {groupContents} from './contents-display.js';
import {bookHref} from './contents-navigation.js';
import {compareTitles} from '../lib/title-sort.js';
import {createPagination} from './pagination.js';
const node=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});

export function createCoverageExclusions(excluded,database,{openRecord}={}){
  const root=node('details');root.className='coverage-access-exclusions';root.hidden=!excluded.length;
  root.append(node('summary',`Books excluded by access (${excluded.length})`));
  let ready=false,page=0,size=50,search,list,pager;
  function render(){
    const query=search.value.trim().toLocaleLowerCase(),matches=excluded.filter(row=>[row.title,row.provider,...row.entries.map(entry=>entry.series)].some(text=>text.toLocaleLowerCase().includes(query))).sort((a,b)=>compareTitles(a.title,b.title));
    page=pager.update({total:matches.length,page,size}).page;list.replaceChildren();
    for(const row of matches.slice(page*size,(page+1)*size)){
      const item=node('article');item.className='tool-card';item.dataset.coverageExcluded=row.recordRef;
      item.append(node('h4',row.title),node('p',accountLabel(row,database)),node('p',`${accessLabel(row.ownership)} — ${row.explanation}`));
      for(const group of groupContents(row.entries))item.append(node('p',group.text));
      const link=node('a','Review ownership');link.href=bookHref('library',row.recordRef);
      if(openRecord)link.addEventListener('click',event=>{event.preventDefault();openRecord(row.recordRef,{section:'ownership'});});
      item.append(link);list.append(item);
    }
    if(!matches.length)list.append(node('p','No excluded books match your search.'));
  }
  root.addEventListener('toggle',()=>{
    if(!root.open||ready)return;ready=true;
    root.append(node('p','Issue information is available for these saved books, but their access does not establish permanent ownership. They are not counted as owned copies. Review a book’s ownership if the saved status is incorrect.'));
    search=node('input');search.type='search';search.placeholder='Search excluded books or series';search.setAttribute('aria-label','Search books excluded by access');
    list=node('div');pager=createPagination({name:'Excluded books',onPage:value=>{page=value;render();},onSize:value=>{size=value;page=0;render();}});
    search.addEventListener('input',()=>{page=0;render();});root.append(search,pager.sizeContainer,pager.top,list,pager.bottom);render();
  });
  return root;
}
