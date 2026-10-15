import {compareTitles} from '../lib/title-sort.js';
import {labeledControl,presentAction} from './form-presentation.js';
import {performAction} from './operation-feedback.js';
import {readingAccessLabel} from './formatters.js';
import {readingSummary,readingStatusLabel} from './reading-presentation.js';
import {createConfirmation} from './confirmation.js';
import {READING_MEDIA,readingEvidence} from '../lib/reading.js';
import {accountLabel} from './item-presentation.js';

function node(tag,text=''){const element=document.createElement(tag);element.textContent=text;return element;}
function select(label,values,current){const element=node('select');element.setAttribute('aria-label',label);for(const value of values){const option=node('option',({'all':'All reading states','not-saved':'Reading status not saved',unread:'Unread',reading:'Reading',completed:'Completed',downloaded:'Downloaded locally',...Object.fromEntries(['unknown','accessible','unavailable'].map(v=>[v,readingAccessLabel(v)]))})[value]??value);option.value=value;element.append(option);}element.value=current;return element;}
function button(label,action){const element=node('button',label);element.type='button';element.addEventListener('click',action);return presentAction(element);}
function lazy(root,build){root.addEventListener('toggle',()=>{if(root.open&&!root.dataset.loaded){root.dataset.loaded='true';build();}});return root;}
export function createReadingTools(records,database,actions){
  const root=node('details');root.className='reading-tools';root.append(node('summary','Reading, access and downloads'));
  return lazy(root,()=>{
    root.append(node('p','Reading progress, availability and downloads describe your use of this copy. They do not change ownership. To mark a purchase, loan or refund, use Change access on its Library card.'));
    for(const item of records.filter(record=>READING_MEDIA.includes(record.mediaType))){
      const saved=database.readingStates?.[item.recordRef],evidence=readingEvidence(item,database),section=node('section'),status=node('p');status.setAttribute('role','status');
      section.dataset.readingRecord=item.recordRef;
      section.append(node('h4',`${accountLabel(item,database)}: ${item.title}`),node('p',readingSummary(item,database)));
      const reading=select('Reading status',['unread','reading','completed'],evidence.status),access=select('Availability (self-reported)',['unknown','accessible','unavailable'],evidence.access);
      const progress=node('input');progress.type='number';progress.min='0';progress.max='100';progress.step='1';progress.value=evidence.progress;progress.setAttribute('aria-label','Reading percentage');
      const downloaded=node('input');downloaded.type='checkbox';downloaded.checked=evidence.downloaded;downloaded.setAttribute('aria-label','Downloaded locally');const downloadLabel=node('label','Downloaded locally ');downloadLabel.append(downloaded);
      reading.addEventListener('change',()=>{if(reading.value==='completed')progress.value='100';else if(reading.value==='unread')progress.value='0';else if(progress.value==='100')progress.value='0';});
      const run=operation=>performAction({status,name:'Saving reading state...',task:async()=>{await operation();actions.refresh();}}).catch(()=>{});
      section.append(labeledControl('Reading status',reading),labeledControl('Progress (%)',progress),labeledControl('Availability (self-reported)',access),downloadLabel,button('Save reading state',()=>run(()=>actions.save(item.recordRef,{status:reading.value,progress:Number(progress.value),access:access.value,downloaded:downloaded.checked},saved?.revisionRef??null))));
      if(saved)section.append(button('Clear reading state',()=>run(()=>actions.remove(item.recordRef,saved.revisionRef))));section.append(status);root.append(section);
    }
  });
}
export function createReadingWorkbench(database,actions,selectedOrder=''){
  const root=node('details');root.id='reading-workbench';root.className='tool-card';root.dataset.selectedOrder=selectedOrder;root.append(node('summary','Reading progress and custom orders'));
  return lazy(root,()=>{
    root.append(node('p','Build your own reading order. The list does not infer a publisher chronology or ownership. Historical entries retain progress and are marked outside the current library.'));
    const status=node('p');status.setAttribute('role','status');root.append(status);
    const run=operation=>performAction({status,name:'Updating reading order...',task:async()=>{const result=await operation();actions.refresh();return result;}}).catch(()=>{});
    const title=node('input');title.maxLength=200;title.setAttribute('aria-label','Reading order title');
    const createDraft=node('div');createDraft.className='reading-order-draft';root.append(createDraft);createDraft.append(labeledControl('New order title',title),button('Create reading order',()=>run(async()=>{const result=await actions.order(null,title.value,[],null);root.dataset.selectedOrder=result.orderRef;})));
    const orders=node('select');orders.setAttribute('aria-label','Selected reading order');const empty=node('option','Choose an order');empty.value='';orders.append(empty);
    for(const [ref,order]of Object.entries(database.readingOrders??{}).sort((a,b)=>compareTitles(a[1].title,b[1].title))){const option=node('option',order.title);option.value=ref;orders.append(option);}orders.value=Object.hasOwn(database.readingOrders??{},selectedOrder)?selectedOrder:'';
    const orderTitle=node('input');orderTitle.maxLength=200;orderTitle.setAttribute('aria-label','Rename reading order');
    const orderRows=node('ol'),orderSummary=node('p'),orderPrevious=button('Previous order entries',()=>{orderPage--;renderOrder();}),orderNext=button('Next order entries',()=>{orderPage++;renderOrder();});let orderPage=0;
    const currentOrder=()=>database.readingOrders?.[orders.value];
    const updateOrder=refs=>run(()=>actions.order(orders.value,currentOrder().title,refs,currentOrder().revisionRef));
    const active=new Map(Object.values(database.providerItems).map(item=>[item.recordRef,item]));
    function renderOrder(){
      root.dataset.selectedOrder=orders.value;renameDraft.dataset.readingOrder=orders.value;const order=currentOrder();renameButton.disabled=deleteButton.disabled=!order;orderTitle.disabled=!order;orderTitle.value=order?.title??'';orderRows.replaceChildren();const refs=order?.recordRefs??[];
      orderPage=Math.min(orderPage,Math.max(0,Math.ceil(refs.length/50)-1));orderPrevious.disabled=orderPage===0;orderNext.disabled=(orderPage+1)*50>=refs.length;orderSummary.textContent=order?`${refs.length} entries; page ${orderPage+1}.`:'Select or create a reading order.';orderRows.start=orderPage*50+1;
      for(const [offset,ref]of refs.slice(orderPage*50,orderPage*50+50).entries()){
        const index=orderPage*50+offset,item=active.get(ref),historical=database.providerHistory?.[ref]?.item,row=node('li');row.dataset.itemRef=ref;
        row.append(node('strong',item?.title??historical?.title??'Unavailable library record'),node('p',item?readingSummary(item,database):`Outside the current library; no current ownership claim. Previous reading: ${database.readingStates?.[ref]?readingStatusLabel(database.readingStates[ref].status):'Reading status not saved'} ${database.readingStates?.[ref]?' ('+database.readingStates[ref].progress+'%)':''}.`));
        const move=direction=>{const next=[...refs];[next[index],next[index+direction]]=[next[index+direction],next[index]];updateOrder(next);};
        const up=button('Move earlier',()=>move(-1)),down=button('Move later',()=>move(1));up.disabled=index===0;down.disabled=index===refs.length-1;
        row.append(up,down,button('Remove from order',()=>updateOrder(refs.filter(value=>value!==ref))));if(item)row.append(button('Review reading state',()=>actions.inspect(ref)));orderRows.append(row);
      }
    }
    orders.addEventListener('change',()=>{if(actions.canLeave?.()===false){orders.value=root.dataset.selectedOrder;return;}orderPage=0;renderOrder();});
    const renameDraft=node('div');renameDraft.className='reading-order-draft';
    const renameButton=button('Rename order',()=>run(()=>{const order=currentOrder();if(!order)throw new Error('Select a reading order.');return actions.order(orders.value,orderTitle.value,order.recordRefs,order.revisionRef);}));renameDraft.append(labeledControl('Order title',orderTitle),renameButton);root.append(labeledControl('Saved order',orders),renameDraft);
    const deleteButton=button('Delete order',()=>run(async()=>{const ref=orders.value,order=currentOrder();if(!order)throw new Error('Select a reading order.');deleteButton.disabled=true;try{const decision=createConfirmation({title:'Delete reading order?',message:'Delete “'+order.title+'”? Its ordering will be removed. Books and saved reading progress will remain.',confirmLabel:'Delete order'});if(!await decision.result)return {cancelled:true};await actions.deleteOrder(ref,order.revisionRef);}finally{deleteButton.disabled=false;}}));deleteButton.className='danger';root.append(deleteButton,orderSummary,orderPrevious,orderNext,orderRows);
    const search=node('input');search.type='search';search.setAttribute('aria-label','Reading library search');const filter=select('Reading progress filter',['all','not-saved','unread','reading','completed','downloaded','accessible','unavailable'],'all');
    const results=node('div'),count=node('p'),previous=button('Previous reading items',()=>{page--;renderItems();}),next=button('Next reading items',()=>{page++;renderItems();});let page=0;
    function renderItems(){
      const query=search.value.trim().toLocaleLowerCase(),items=[...active.values()].filter(item=>READING_MEDIA.includes(item.mediaType)&&item.title.toLocaleLowerCase().includes(query)).filter(item=>{const evidence=readingEvidence(item,database);if(filter.value==='all')return true;if(filter.value==='downloaded')return evidence.downloaded;if(['accessible','unavailable'].includes(filter.value))return evidence.access===filter.value;return filter.value==='not-saved'?!database.readingStates?.[item.recordRef]:Boolean(database.readingStates?.[item.recordRef])&&evidence.status===filter.value;}).sort((a,b)=>compareTitles(a.title,b.title)||a.recordRef.localeCompare(b.recordRef));
      page=Math.min(page,Math.max(0,Math.ceil(items.length/50)-1));previous.disabled=page===0;next.disabled=(page+1)*50>=items.length;count.textContent=`${items.length} reading records; page ${page+1}.`;results.replaceChildren();
      for(const item of items.slice(page*50,page*50+50)){
        const row=node('article');row.dataset.itemRef=item.recordRef;row.append(node('strong',item.title),node('p',`${accountLabel(item,database)}. ${readingSummary(item,database)}`),button('Review reading state',()=>actions.inspect(item.recordRef)),button('Add to selected order',()=>{const order=currentOrder();if(!order){status.textContent='Select or create a reading order.';return;}if(order.recordRefs.includes(item.recordRef)){status.textContent='Already in this order.';return;}updateOrder([...order.recordRefs,item.recordRef]);}));results.append(row);
      }
    }
    for(const element of [search,filter])element.addEventListener(element===search?'input':'change',()=>{page=0;renderItems();});root.append(labeledControl('Find a book',search),labeledControl('Reading filter',filter),count,previous,next,results);renderOrder();renderItems();
  });
}
