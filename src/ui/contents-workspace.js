import {CONTENTS_STATUSES,createContentsProjection,contentsPage} from './contents-overview.js';
import {bookHref} from './contents-navigation.js';
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const button=(label,action)=>{const node=text('button',label);node.type='button';node.addEventListener('click',action);return node;};
const providerName=id=>({kindle:'Kindle',humble:'Humble Bundle',fanatical:'Fanatical',kobo:'Kobo'}[id]??id);
export function createContentsWorkspace(actions={}) {
  const element=text('div','');element.id='contents-collections';
  const overview=text('p','Loading saved books…');overview.setAttribute('role','status');
  const listView=text('div',''),detail=text('div','');detail.hidden=true;detail.id='contents-book-review';
  const controls=text('div','');controls.className='contents-filters';
  const search=text('input','');search.type='search';search.placeholder='Find a book or collection';search.setAttribute('aria-label','Search contents collections');
  const status=text('select','');status.setAttribute('aria-label','Contents status');
  for(const [value,label] of [['all','All imported books'],['review','Needs human review'],['failure','Latest source failed or unavailable'],...Object.entries(CONTENTS_STATUSES)])status.append(Object.assign(text('option',label),{value}));
  const provider=text('select','');provider.setAttribute('aria-label','Contents provider');
  controls.append(search,status,provider,button('Clear contents filters',()=>{search.value='';status.value='all';provider.value='all';page=0;renderList();}));
  const counter=text('p','');counter.setAttribute('role','status');
  const list=text('ol','');list.className='review-items';list.id='contents-collection-list';
  const paging=text('nav','');paging.className='actions';paging.setAttribute('aria-label','Contents pages');
  const previous=button('Previous page',()=>{page--;renderList();}),next=button('Next page',()=>{page++;renderList();});paging.append(previous,next);
  listView.append(controls,counter,paging,list);element.append(overview,listView,detail);
  const project=createContentsProjection();let database,rows=[],page=0,selected=null,active=false,returnScroll=0,openedEvidence='';
  const evidenceKey=record=>JSON.stringify([database.contentReviews?.[record.id],record.metadata?.enrichment?.kindleProductComicContents,record.metadata?.enrichment?.localMetadata]);
  function renderList(){
    if(!database||!active||selected)return;
    const result=contentsPage(rows,{query:search.value,status:status.value,provider:provider.value,page});page=result.page;
    previous.disabled=page===0;next.disabled=page===result.pages-1;
    counter.textContent=result.total?`${result.total} books · page ${page+1} of ${result.pages}`:rows.length?'No books match these filters. Clear filters to see saved books.':'No imported books yet. Add a library in Providers or restore a backup in Settings.';
    list.replaceChildren(...result.rows.map(row=>{
      const node=text('li','');node.dataset.recordRef=row.recordRef;
      node.append(text('strong',row.title),text('small',`${providerName(row.provider)} · ${row.nickname}`),text('p',`${row.label}${row.count!==null?` · ${row.count} reviewed entries`:''}${row.needsReview?' · Review needed':''}`));
      if(row.failed)node.append(text('p',row.retained?'Latest source check failed or was unavailable. Earlier contents and any human review are retained.':'The source could not be acquired. Retry or recovery belongs on the signed-in Kindle page.'));
      if(row.changed)node.append(text('p','Captured contents differ from your review. Saved decisions remain unchanged.'));
      if(row.updatedAt)node.append(text('small','Last contents activity: '+new Date(row.updatedAt).toLocaleString()));
      node.append(button('Inspect contents',()=>open(row.recordRef)));return node;
    }));
  }
  function close(){selected=null;detail.hidden=true;detail.replaceChildren();listView.hidden=false;renderList();
    actions.closed?.();
    const target=[...list.children].find(node=>node.dataset.recordRef===lastOpened);target?.querySelector('button')?.focus({preventScroll:true});globalThis.scrollTo?.(0,returnScroll);
  }
  let lastOpened;
  function open(ref){
    const record=Object.values(database?.providerItems??{}).find(record=>record.recordRef===ref&&record.mediaType==='book');if(!record)return false;
    if(!selected)returnScroll=globalThis.scrollY??0;
    selected=ref;lastOpened=ref;listView.hidden=true;detail.hidden=false;detail.replaceChildren(button('Back to collections',close),text('h3',record.title),text('p',`${providerName(record.provider)} · ${database.providerProfiles?.[record.profileId]?.nickname||'Unnamed account'}`));
    openedEvidence=evidenceKey(record);
    const notice=text('p','');notice.className='contents-review-notice';notice.setAttribute('role','status');detail.append(notice);
    const summary=rows.find(row=>row.recordRef===ref);detail.append(text('p',summary.label));
    if(summary.failed)detail.append(text('p',summary.retained?'Latest source acquisition failed or was unavailable; the earlier evidence below is retained. Retry belongs on the signed-in Kindle page.':'Source acquisition failed or was unavailable. Use the signed-in Kindle page for retry or recovery, or review a source you have checked yourself.'));
    if(actions.review)detail.append(actions.review(record,database));
    else detail.append(text('p','Saved contents evidence belongs to this account’s library record.'));
    if(actions.library){const link=text('a','Open this book in Library');link.href=bookHref('library',record.recordRef);link.addEventListener('click',event=>{event.preventDefault();actions.library(record.recordRef);});detail.append(link);}
    actions.opened?.(record.recordRef);
    detail.tabIndex=-1;detail.focus({preventScroll:true});return true;
  }
  for(const control of [search,status,provider])control.addEventListener(control===search?'input':'change',()=>{page=0;renderList();});
  return {element,open,close,get selected(){return selected;},
    update(nextDatabase,isActive=false){database=nextDatabase;active=isActive;const projected=project(database);
      if(projected!==rows){rows=projected;const counts={};for(const row of rows)counts[row.status]=(counts[row.status]??0)+1;
        overview.textContent=`${rows.length} imported books · ${counts.reviewed??0} reviewed · ${rows.filter(r=>r.needsReview).length} need review · ${rows.filter(r=>r.failed).length} latest source checks failed or unavailable. Identified text is a suggestion, not proof of complete contents or ownership.`;
        for(const option of status.options){const key=option.value;
          const count=key==='all'?rows.length:key==='review'?rows.filter(row=>row.needsReview).length:key==='failure'?rows.filter(row=>row.failed).length:counts[key]??0;
          const label=key==='all'?'All imported books':key==='review'?'Needs human review':key==='failure'?'Latest source failed or unavailable':CONTENTS_STATUSES[key];option.textContent=`${label} (${count})`;
        }
        const chosen=provider.value;provider.replaceChildren(Object.assign(text('option','All providers'),{value:'all'}),...[...new Set(rows.map(r=>r.provider))].sort().map(id=>Object.assign(text('option',providerName(id)),{value:id})));provider.value=[...provider.options].some(o=>o.value===chosen)?chosen:'all';
      }
      if(selected&&!rows.some(row=>row.recordRef===selected)){close();overview.textContent='This book is no longer in the current library. Other saved collections remain available.';}
      if(selected){const record=database.providerItems[rows.find(row=>row.recordRef===selected).id];
        if(openedEvidence!==evidenceKey(record)){const notice=detail.querySelector('.contents-review-notice');notice.replaceChildren(text('span','Saved evidence or a review changed while this editor was open. Your draft is retained. Reload before replacing a newer review. '),button('Reload saved contents',()=>open(selected)));
          for(const control of detail.querySelectorAll('.contents-editor button'))if(['Save verified contents','Undo contents confirmation'].includes(control.textContent))control.disabled=true;
        }
      }
      renderList();
    },refreshReview(){if(selected)open(selected);}
  };
}
