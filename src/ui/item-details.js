import {itemPresentation} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
export function createItemDetailsBody(canonical,records,database,tools,state={sections:new Set()}){
  const root=text('div','');root.className='catalog-item-details';
  const presentation=itemPresentation(canonical,records,database);
  const overview=text('div','');overview.className='item-overview';
  if(presentation.cover){const image=document.createElement('img');image.className='item-cover';image.src=presentation.cover;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>image.remove());overview.append(image);}
  const identity=text('div','');identity.append(text('h3',presentation.title),text('p',presentation.media));
  if(presentation.creators.length)identity.append(text('p','By '+presentation.creators.join(', ')));
  else if(['book','audiobook'].includes(canonical.mediaType))identity.append(text('p','Creator information is not recorded yet.'));
  const facts=text('dl','');facts.className='item-catalog-facts';for(const entry of presentation.details)facts.append(text('dt',entry.label),text('dd',entry.values.join(' · ')));identity.append(facts);overview.append(identity);root.append(overview);
  function section(key,label,build,defaultOpen=false){
    const node=text('details','');node.dataset.itemSection=key;node.append(text('summary',label));let built=false;
    const populate=()=>{if(built)return;built=true;build(node);};
    node.addEventListener('toggle',()=>{if(!node.isConnected)return;if(node.open){state.sections.add(key);populate();}else state.sections.delete(key);});
    if(state.sections.has(key)||defaultOpen){node.open=true;state.sections.add(key);populate();}root.append(node);return node;
  }
  section('library','Your library',node=>{
    node.append(text('p','Each account below supplies its own access observation. Grouping the item does not create ownership in another account.'));
    for(const entry of presentation.records){const record=text('div','');record.className='item-account';record.dataset.itemRecord=entry.record.recordRef;
      record.append(text('strong',entry.label),text('p',entry.access+(entry.override?' — user ownership preference':entry.reviewed?' — human ownership review':'')));
      if(entry.override||entry.reviewed)record.append(text('small','Original provider observation: '+entry.observedAccess));
      if(entry.acquiredAt)record.append(text('small','Acquired / added: '+new Date(entry.acquiredAt).toLocaleDateString()));
      if(entry.observedAt)record.append(text('small','Last observed: '+new Date(entry.observedAt).toLocaleDateString()));
      if(entry.reading)record.append(text('p',entry.reading));node.append(record);
    }
    for(const build of [tools.reading,tools.ownership])if(build)node.append(build());
  },true);
  if(canonical.mediaType==='book')section('contents','Contents',node=>{
    for(const entry of presentation.records){node.append(text('strong',entry.label),text('p',entry.contents.label+(entry.contents.count!==null?` · ${entry.contents.count} reviewed entries`:'')));
      if(entry.contents.failed)node.append(text('p','Latest source check failed or was unavailable. Any earlier evidence and human review are retained.'));
      const link=text('a','Review contents');link.href=bookHref('contents',entry.record.recordRef);link.dataset.contentsRecord=entry.record.recordRef;node.append(link);
    }
    node.append(text('p','Contents suggestions do not establish separate ownership of included works. Detailed review and comparisons are in Contents.'));
  },true);
  if(canonical.mediaType==='book')section('books','Book information',node=>{if(tools.books)node.append(tools.books());});
  section('advanced','Advanced',node=>{
    node.append(text('p','Inspect matching, edition grouping, source provenance and recovery. Identity decisions are separate from ownership confirmations.'));
    if(tools.advanced)node.append(tools.advanced());
  });
  if(tools.extras)root.append(tools.extras());
  return root;
}
