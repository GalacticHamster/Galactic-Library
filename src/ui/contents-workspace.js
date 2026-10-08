import {formatDate} from './formatters.js';
import {createContentsReadOnly} from './contents-display.js';
import {CONTENTS_STATUSES,createContentsProjection} from './contents-overview.js';
import {createLibraryBrowseProjection,libraryBrowseResults} from './library-browse.js';
import {emptyBrowseView} from '../lib/ui-preferences.js';
import {bookHref} from './contents-navigation.js';
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const button=(label,action)=>{const node=text('button',label);node.type='button';node.addEventListener('click',action);return node;};
const providerName=id=>({kindle:'Kindle',humble:'Humble Bundle',fanatical:'Fanatical',kobo:'Kobo'}[id]??id);
export function createContentsWorkspace(actions={}) {
  const element=text('div','');element.id='contents-collections';
  const overview=text('p','Loading saved books…');overview.setAttribute('role','status');
  const listView=text('div',''),detail=text('div','');detail.hidden=true;detail.id='contents-book-review';
  const controls=text('div','');controls.className='contents-filters';
  const search=text('input','');search.type='search';search.maxLength=500;search.placeholder='Find a book or collection';search.setAttribute('aria-label','Search contents collections');
  const status=text('select','');status.setAttribute('aria-label','Contents status');
  for(const [value,label] of [['all','All imported books'],['review','Needs contents review'],['failure','Latest retrieval failed'],...Object.entries(CONTENTS_STATUSES)])status.append(Object.assign(text('option',label),{value}));
  const shared={search};
  const primary=text('div','');primary.className='library-filters';
  const more=text('details','');more.append(text('summary','More filters'));const extra=text('div','');extra.className='library-filters';more.append(extra);
  for(const [key,label,options]of [
    ['sort','Sort',[['title-asc','Title A-Z'],['title-desc','Title Z-A'],['added','Date added / acquired'],['updated','Last record update'],['creator','Creator / author'],['series','Series and issue / volume']]],
    ['mediaType','Media',[['all','All media'],['book','Books'],['audiobook','Audiobooks'],['game','Games'],['software','Software'],['movie','Movies'],['tv','TV']]],
    ['provider','Provider',[['all','All providers']]],['account','Saved account',[['all','All accounts']]],
    ['series','Series',[['all','Any series']]],['genre','Genre',[['all','Any genre']]],
    ['ownership','Access',[['all','Any access'],['owned','Owned'],['claimed','Permanently claimed'],['borrowed','Borrowed'],['subscription','Subscription access'],['rental','Rented'],['unknown','Ownership unconfirmed']]],
    ['reading','Reading',[['all','Any reading state'],['not-saved','No saved reading status'],['unread','Explicitly unread'],['reading','Reading'],['completed','Completed']]]
  ]){const field=text('select','');field.id='contents-'+key;field.setAttribute('aria-label','Contents '+label.toLowerCase());for(const [value,label]of options)field.append(Object.assign(text('option',label),{value}));const wrapper=text('label',label);wrapper.append(field);( ['series','genre','ownership','reading'].includes(key)?extra:primary).append(wrapper);shared[key]=field;}
  const provider=shared.provider;
  const statusLabel=text('label','Contents status');statusLabel.append(status);primary.append(statusLabel);
  const activeFilters=text('div','');activeFilters.className='library-active-filters';activeFilters.id='contents-active-filters';
  const clear=button('Clear search and filters',()=>{view={...emptyBrowseView(),sort:view.sort,status:'all'};applyView(view);renderList();actions.changed?.();});
  const searchLabel=text('label','Search collection');searchLabel.append(search);controls.append(searchLabel,primary,clear,more,activeFilters);
  const counter=text('p','');counter.setAttribute('role','status');
  const list=text('ol','');list.className='library-items contents-collection-items';list.id='contents-collection-list';
  const paging=text('nav','');paging.className='actions';paging.setAttribute('aria-label','Contents pages');
  const previous=button('Previous page',()=>{page--;view.anchor='';renderList();actions.changed?.();}),next=button('Next page',()=>{page++;view.anchor='';renderList();actions.changed?.();});paging.append(previous,next);
  listView.append(controls,counter,paging,list);const help=text('details','');help.className='context-help';help.append(text('summary','About contents and account filters'),text('p','Search, sort and common filters follow Library. Contents status applies only here. Each account has its own description and review. Not reviewed means a description suggestion, not a checked list of everything in the book. A failed latest retrieval can retain earlier contents. Filters must match one account record; no saved reading status is separate from explicitly unread.'));element.append(overview,listView,detail,help);
  const project=createContentsProjection(),browse=actions.projection??createLibraryBrowseProjection();let database,rows=[],page=0,selected=null,active=false,returnScroll=0,openedEvidence='',view={...emptyBrowseView(),status:'all'},result;
  function applyView(next){view={...view,...next};page=view.page;for(const [key,field]of Object.entries(shared)){field.value=view[key];if(!field.value)field.dataset.pendingValue=view[key];}status.value=view.status;}
  function readView(){return {...view,page,anchor:selected??result?.rows[0]?.canonical.id??view.anchor};}
  const qualifies=row=>view.status==='all'||(view.status==='review'?row.needsReview:view.status==='failure'?row.failed:row.status===view.status);
  const evidenceKey=record=>JSON.stringify([database.contentReviews?.[record.id],record.metadata?.enrichment?.kindleProductComicContents,record.metadata?.enrichment?.localMetadata]);
  function renderList(){
    if(!database||!active||selected)return;
    const summaries=new Map(rows.map(row=>[row.id,row]));
    result=libraryBrowseResults(browse(database),{query:view.search,filters:view,sort:view.sort,page,anchor:view.anchor,recordFilter:record=>record.mediaType==='book'&&qualifies(summaries.get(record.id))});page=result.page;view.anchor='';
    const shown=result.rows.flatMap(row=>row.qualifying.map(value=>({...summaries.get(value.record.id),canonicalId:row.canonical.id})));
    activeFilters.replaceChildren();for(const [key,field]of Object.entries({...shared,status}))if(key!=='sort'&&field.value&&field.value!=='all'){const label=key==='search'?'Search: '+field.value:field.selectedOptions[0]?.textContent;activeFilters.append(button((key==='status'?'Contents only: ':'')+label,()=>{field.value=key==='search'?'':'all';field.dispatchEvent(new Event(key==='search'?'input':'change'));}));}
    previous.disabled=page===0;next.disabled=page===result.pages-1;
    counter.textContent=result.total?`${result.total} catalog books · ${result.matches.reduce((n,row)=>n+row.qualifying.length,0)} matching accounts · page ${page+1} of ${result.pages}`:rows.length?'No books match these filters. Clear filters to see saved books.':'No imported books yet. Add a library in Providers or restore a backup in Settings.';
    list.replaceChildren(...shown.map(row=>{
      const node=text('li','');node.className='library-item contents-collection-card';node.dataset.recordRef=row.recordRef;node.dataset.canonicalId=row.canonicalId;
      node.append(Object.assign(text('h3',row.title),{className:'contents-card-title'}),Object.assign(text('p',`${providerName(row.provider)} — ${row.nickname}`),{className:'contents-card-account'}));
      const preview=createContentsReadOnly(database.providerItems[row.id],database,{compact:true,showSource:false,needsReview:row.incomplete||['partial','uncertain'].includes(row.status)});
      if(preview)node.append(preview);
      else if(!row.failed)node.append(Object.assign(text('p',row.label),{className:'contents-card-status'}));
      if(row.failed)node.append(text('p',row.retained?'Could not retrieve the latest description. Earlier contents and reviews are retained.':'Could not retrieve contents. Retry from the Kindle library page.'));
      if(row.changed)node.append(text('p','Description changed since your review. Your review is retained.'));
      const inspect=button('Inspect contents',()=>open(row.recordRef));inspect.className='contents-inspect';node.append(inspect);return node;
    }));
  }
  function close(){if(actions.canLeave?.()===false)return false;selected=null;detail.hidden=true;detail.replaceChildren();listView.hidden=false;renderList();

    const target=[...list.children].find(node=>node.dataset.recordRef===lastOpened);target?.querySelector('button')?.focus({preventScroll:true});globalThis.scrollTo?.(0,returnScroll);
  }
  let lastOpened;
  function open(ref){
    const record=Object.values(database?.providerItems??{}).find(record=>record.recordRef===ref&&record.mediaType==='book');if(!record)return false;
    if(!selected)returnScroll=globalThis.scrollY??0;
    if(actions.canLeave?.()===false)return false;
    selected=ref;lastOpened=ref;detail.dataset.recordRef=ref;listView.hidden=true;detail.hidden=false;detail.replaceChildren(button(actions.backLabel?.()??'Back to Contents results',()=>actions.back?actions.back():close()),button('Contents collection list',()=>{if(close()!==false)actions.collection?.();}),text('h3',record.title),text('p',`${providerName(record.provider)} · ${database.providerProfiles?.[record.profileId]?.nickname||'Unnamed account'}`));
    openedEvidence=evidenceKey(record);
    const notice=text('p','');notice.className='contents-review-notice';notice.setAttribute('role','status');detail.append(notice);
    const summary=rows.find(row=>row.recordRef===ref);detail.append(text('p',summary.label));
    if(summary.updatedAt)detail.append(text('small','Last contents activity: '+formatDate(summary.updatedAt)));
    if(summary.failed)detail.append(text('p',summary.retained?'Could not retrieve the latest description. Earlier contents below are retained. Retry on the Kindle library page.':'Could not retrieve contents. Retry on the Kindle library page, or enter contents from a source you checked.'));
    if(actions.review)detail.append(actions.review(record,database));
    else detail.append(text('p','Saved contents evidence belongs to this account’s library record.'));
    if(actions.library){const link=text('a','Open this book in Library');link.href=bookHref('library',record.recordRef);link.addEventListener('click',event=>{event.preventDefault();actions.library(record.recordRef);});detail.append(link);}
    actions.opened?.(record.recordRef);
    detail.tabIndex=-1;detail.focus({preventScroll:true});return true;
  }
  for(const [key,control]of Object.entries({...shared,status}))control.addEventListener(control===search?'input':'change',()=>{view[key]=control.value;view.anchor='';page=0;renderList();actions.changed?.();});
  return {element,open,close,applyView,readView,get selected(){return selected;},get scroll(){return returnScroll;},
    update(nextDatabase,isActive=false){database=nextDatabase;active=isActive;const projected=project(database);
      if(projected!==rows){rows=projected;const counts={};for(const row of rows)counts[row.status]=(counts[row.status]??0)+1;
        overview.textContent=`${rows.length} imported book records · ${counts.reviewed??0} contents reviewed · ${rows.filter(r=>r.needsReview).length} need review · ${rows.filter(r=>r.failed).length} latest retrievals failed.`;
        for(const option of status.options){const key=option.value;
          const count=key==='all'?rows.length:key==='review'?rows.filter(row=>row.needsReview).length:key==='failure'?rows.filter(row=>row.failed).length:counts[key]??0;
          const label=key==='all'?'All imported books':key==='review'?'Needs contents review':key==='failure'?'Latest retrieval failed':CONTENTS_STATUSES[key];option.textContent=`${label} (${count})`;
        }
        const projection=browse(database);
        for(const [key,options]of [['provider',[...new Set([...projection.records.values()].map(v=>v.record.provider))].sort().map(id=>({value:id,label:providerName(id)}))],['account',projection.accountOptions],['series',projection.seriesOptions.map(value=>({value,label:value}))],['genre',projection.genreOptions.map(value=>({value,label:value}))]]){
          const field=shared[key];field.replaceChildren(Object.assign(text('option',({provider:'All providers',account:'All accounts',series:'Any series',genre:'Any genre'})[key]),{value:'all'}),...options.map(option=>Object.assign(text('option',option.label),{value:option.value})));field.value=view[key];if(!field.value){field.value='all';view[key]='all';}delete field.dataset.pendingValue;
        }

      }
      if(selected&&!rows.some(row=>row.recordRef===selected)){const notice=detail.querySelector('.contents-review-notice');notice.textContent='This book is no longer in the current library. Your open draft is retained for reference; it cannot be saved.';for(const control of detail.querySelectorAll('.contents-editor button'))if(['Save reviewed contents','Undo contents review'].includes(control.textContent))control.disabled=true;return;}
      if(selected){const record=database.providerItems[rows.find(row=>row.recordRef===selected).id];
        if(openedEvidence!==evidenceKey(record)){const notice=detail.querySelector('.contents-review-notice');notice.replaceChildren(text('span','Saved evidence or a review changed while this editor was open. Your draft is retained. Reload before replacing a newer review. '),button('Reload saved contents',()=>open(selected)));
          for(const control of detail.querySelectorAll('.contents-editor button'))if(['Save reviewed contents','Undo contents review'].includes(control.textContent))control.disabled=true;
        }
      }
      renderList();
    },refreshReview(){if(selected)open(selected);}
  };
}
