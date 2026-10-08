import {formatDate} from './formatters.js';
import {createContentsReadOnly} from './contents-display.js';
import {itemPresentation} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
export function createItemDetailsBody(canonical,records,database,tools,state={sections:new Set()}){
  const root=text('div','');root.className='catalog-item-details';
  const presentation=itemPresentation(canonical,records,database);
  const catalog=text('details','');catalog.className='item-overview-details';catalog.append(text('summary','Edition details and artwork'));root.append(catalog);
  const overview=text('div','');overview.className='item-overview';
  if(presentation.cover){const image=document.createElement('img');image.className='item-cover';image.src=presentation.cover;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>image.remove());overview.append(image);}
  const identity=text('div','');identity.append(text('h3',presentation.title),text('p',presentation.media));
  if(presentation.creators.length)identity.append(text('p','By '+presentation.creators.join(', ')));
  else if(['book','audiobook'].includes(canonical.mediaType))identity.append(text('p','Creator information is not recorded yet.'));
  const facts=text('dl','');facts.className='item-catalog-facts';for(const entry of presentation.details)facts.append(text('dt',entry.label),text('dd',entry.values.join(' · ')));identity.append(facts);overview.append(identity);catalog.append(overview);
  if(presentation.details.some(entry=>entry.values.length>1))identity.append(text('small','Several saved values are shown. Inspect account sources in Advanced before deciding which describes your copy.'));
  function section(key,label,build,defaultOpen=false){
    const node=text('details','');node.dataset.itemSection=key;node.append(text('summary',label));let built=false;
    const populate=()=>{if(built)return;built=true;build(node);};
    node.addEventListener('toggle',()=>{if(!node.isConnected)return;if(node.open){state.sections.add(key);populate();}else state.sections.delete(key);});
    if(state.sections.has(key)||defaultOpen&&!state.initialized){node.open=true;state.sections.add(key);populate();}root.append(node);return node;
  }
  section('library','Your library',node=>{
    const help=text('details','');help.className='context-help';help.append(text('summary','How account access works'),text('p','Access belongs to each account separately. Grouping copies does not grant access to another account. Ownership preferences and human reviews are labeled; the original observation remains available.'));node.append(help);
    for(const entry of presentation.records){const record=text('div','');record.className='item-account';record.dataset.itemRecord=entry.record.recordRef;
      record.append(text('strong',entry.label),text('p',entry.access+(entry.override?' — user ownership preference':entry.reviewed?' — human ownership review':'')));
      if(entry.override||entry.reviewed)record.append(text('small','Original provider observation: '+entry.observedAccess));
      if(entry.acquiredAt)record.append(text('small','Acquired / added: '+formatDate(entry.acquiredAt,{time:false})));
      if(entry.observedAt)record.append(text('small','Last observed: '+formatDate(entry.observedAt,{time:false})));
      if(entry.reading)record.append(text('p',entry.reading));node.append(record);
      if(entry.readingAccess!=='unknown')record.append(text('small',`Self-reported access: ${entry.readingAccess}${entry.accessCheckedAt?' · checked '+formatDate(entry.accessCheckedAt,{time:false}):''}`));
      if(entry.reviewExpiresAt)record.append(text('small','Reviewed access expiry: '+formatDate(entry.reviewExpiresAt)));
    }
    for(const build of [tools.reading,tools.ownership])if(build)node.append(build());
    const settings=text('a','Ownership preferences in Settings');settings.href='#settings';settings.dataset.goWorkspace='settings';node.append(settings);
    for(const [target,label]of [['reading','Reading orders and progress'],['ownership','Ownership duplicates, purchase evidence and reminders']]){const link=text('a',label);link.href='#'+target;link.dataset.goWorkspace=target;const paragraph=text('p','');paragraph.append(link);node.append(paragraph);}
  },true);
  if(canonical.mediaType==='book')section('contents','Contents',node=>{
    for(const entry of presentation.records){node.append(text('strong',entry.label),text('p',entry.contents.label+(entry.contents.count!==null?` · ${entry.contents.count} reviewed entries`:'')));
      if(entry.contents.failed)node.append(text('p','Latest description could not be retrieved. Earlier contents and reviews are retained.'));
      const preview=createContentsReadOnly(entry.record,database);if(preview)node.append(preview);
      const link=text('a','Review contents');link.href=bookHref('contents',entry.record.recordRef);link.dataset.contentsRecord=entry.record.recordRef;node.append(link);
    }
    const help=text('details','');help.className='context-help';help.append(text('summary','About collected works'),text('p','A description suggestion is not verified. A reviewed list describes included material for that account; it does not create separate purchases of those works. Overlap and coverage comparisons are available in Contents.'));node.append(help);
  },true);
  if(canonical.mediaType==='book')section('books','Book information',node=>{if(tools.books)node.append(tools.books());const bulk=text('a','Bulk book information and review');bulk.href='#books';bulk.dataset.goWorkspace='books';node.append(bulk);});
  section('advanced','Advanced',node=>{
    node.append(text('p','Inspect matching, edition grouping, source provenance and recovery. Identity decisions are separate from ownership confirmations.'));
    if(tools.advanced)node.append(tools.advanced());
  });
  if(tools.extras)root.append(tools.extras());
  state.initialized=true;return root;
}
