import {PAGE_SIZES,validPageSize} from '../lib/ui-preferences.js';

export function paginationState(total,page=0,size=50){
  total=Number.isSafeInteger(total)&&total>0?total:0;
  size=validPageSize(size)?size:50;
  const pages=Math.ceil(total/size);
  page=Math.max(0,Math.min(Number.isSafeInteger(page)?page:0,Math.max(0,pages-1)));
  return {total,page,size,pages,start:total?page*size+1:0,end:Math.min((page+1)*size,total),previous:page>0,next:page+1<pages};
}

export function scrollToResults(target){
  target.scrollIntoView({block:'start',behavior:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'auto'});
}

// Two presentations, one state; only the upper status announces changes.
export function createPagination({name,onPage,onSize,top=document.createElement('nav'),bottom=document.createElement('nav'),sizeContainer=document.createElement('div'),ids={},loading=false}){
  let state=paginationState(0);
  const rows=[top,bottom].map((nav,index)=>{
    nav.className='pagination';nav.setAttribute('aria-label',`${name} pages (${index?'bottom':'top'})`);
    const previous=document.createElement('button'),next=document.createElement('button'),info=document.createElement('span');
    previous.type=next.type='button';previous.textContent='Previous page';next.textContent='Next page';
    info.className='pagination-info';
    if(index===0){info.setAttribute('role','status');info.setAttribute('aria-live','polite');info.setAttribute('aria-atomic','true');}
    else info.setAttribute('aria-live','off');
    if(index===0)for(const [node,key]of [[previous,'previous'],[next,'next'],[info,'status']])if(ids[key])node.id=ids[key];
    for(const [node,direction]of [[previous,-1],[next,1]])node.addEventListener('click',()=>{
      if(node.disabled)return;
      const focusedBottom=index===1&&document.activeElement===node;
      if(onPage(state.page+direction)!==false){
        if(focusedBottom){const corresponding=direction<0?rows[0].previous:rows[0].next;if(!corresponding.disabled)corresponding.focus({preventScroll:true});else{top.tabIndex=-1;top.focus({preventScroll:true});}}
        scrollToResults(top);
      }
    });
    nav.replaceChildren(previous,info,next);return {previous,next,info};
  });
  const label=document.createElement('label'),select=document.createElement('select');
  label.className='page-size-control';label.append('Items per page ',select);
  if(ids.size)select.id=ids.size;
  select.setAttribute('aria-label',`${name} items per page`);
  for(const size of PAGE_SIZES)select.append(Object.assign(document.createElement('option'),{value:String(size),textContent:String(size)}));
  sizeContainer.append(label);
  select.addEventListener('change',()=>{if(onSize(Number(select.value))===false)select.value=String(state.size);else scrollToResults(top);});
  function update(next){
    state=paginationState(next.total,next.page,next.size);select.value=String(state.size);
    for(const {previous,next,info}of rows){previous.disabled=!state.previous;next.disabled=!state.next;
      const message=state.total?`Page ${state.page+1} of ${state.pages} \u00b7 Showing ${state.start}\u2013${state.end} of ${state.total}`:'No items to show';
      if(info.textContent!==message)info.textContent=message;
    }
    return state;
  }
  update(state);
  if(loading)for(const {info}of rows)info.textContent='Loading results...';
  return {top,bottom,sizeContainer,select,update,get state(){return {...state};}};
}
