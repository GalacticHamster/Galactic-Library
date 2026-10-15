import {createProductDetails} from './product-details.js';
import {formatDate,readingAccessLabel} from './formatters.js';
import {createContentsReadOnly} from './contents-display.js';
import {itemPresentation} from './item-presentation.js';
import {bookHref} from './contents-navigation.js';
import {libraryBroadGenreValues,libraryCategoryEvidence} from '../lib/genre-hints.js';
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
export function createItemDetailsBody(canonical,records,database,tools,state={sections:new Set()}){
  const root=text('div','');root.className='catalog-item-details';
  const presentation=itemPresentation(canonical,records,database);
  const categories=[...new Set(records.flatMap(libraryBroadGenreValues))];
  if(categories.length)root.append(text('p','Categories: '+categories.join(' · ')));
  const classification=records.flatMap(record=>libraryCategoryEvidence(record).map(entry=>({record,entry})));
  if(classification.length){
    const evidence=text('details','');evidence.className='classification-sources';evidence.append(text('summary','Source classification'));
    evidence.append(text('p','Categories describe the book or its subject. Inferred categories help browsing; they do not confirm ownership, identity or collected contents. Uncertain series suggestions are not filters.'));
    for(const {record,entry}of classification){const line=text('p',`${presentation.records.find(value=>value.record===record)?.label??record.provider} · ${entry.source.replace(/-/gu,' ')} · ${entry.confidence}: ${entry.evidence}`);if(entry.conflict)line.append(text('small',' '+entry.conflict));evidence.append(line);}
    root.append(evidence);
  }
  const productDetails=createProductDetails(records,database);if(productDetails)root.append(productDetails);
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
      if(entry.inferred)record.append(text('small','Ownership recognized from saved Kindle / Comixology provider context.'));
      if(entry.override||entry.reviewed||entry.inferred)record.append(text('small','Original provider observation: '+entry.observedAccess));
      if(entry.acquiredAt)record.append(text('small','Acquired / added: '+formatDate(entry.acquiredAt,{time:false})));
      if(entry.observedAt)record.append(text('small','Last observed: '+formatDate(entry.observedAt,{time:false})));
      if(entry.reading)record.append(text('p',entry.reading));node.append(record);
      if(entry.readingAccess!=='unknown')record.append(text('small',`Self-reported access: ${readingAccessLabel(entry.readingAccess)}${entry.accessCheckedAt?' · checked '+formatDate(entry.accessCheckedAt,{time:false}):''}`));
      if(entry.reviewExpiresAt)record.append(text('small','Reviewed access expiry: '+formatDate(entry.reviewExpiresAt)));
    }
    for(const build of [tools.reading,tools.ownership])if(build)node.append(build());
    const settings=text('a','Ownership preferences in Settings');settings.href='#settings';settings.dataset.goWorkspace='settings';node.append(settings);
    for(const [target,label]of [['reading','Reading orders and progress'],['ownership','Edition relationships, purchase evidence and reminders']]){const link=text('a',label);link.href='#'+target;link.dataset.goWorkspace=target;const paragraph=text('p','');paragraph.append(link);node.append(paragraph);}
  },true);
  if(canonical.mediaType==='book')section('contents','Contents',node=>{
    for(const entry of presentation.records){node.append(text('strong',entry.label),text('p',entry.contents.label+(entry.contents.count!==null?` · ${entry.contents.count} reviewed entries`:'')));
      if(entry.contents.failed)node.append(text('p','Latest description could not be retrieved. Earlier contents and reviews are retained.'));
      const preview=createContentsReadOnly(entry.record,database,{showSource:false,showCaption:false});if(preview)node.append(preview);if(entry.contents.incomplete)node.append(text('small','Some description details still need review; this is not necessarily a complete contents list.'));
      const link=text('a','Review contents');link.href=bookHref('contents',entry.record.recordRef);link.dataset.contentsRecord=entry.record.recordRef;node.append(link);
    }
    const help=text('details','');help.className='context-help';help.append(text('summary','About collected works'),text('p','A description suggestion is not reviewed. A reviewed list describes included material for that account; it does not create separate purchases of those works. Browse issue coverage and collection overlap in Library → Comic Coverage. Use Review contents above to correct the included works for this account copy.'));node.append(help);
  },true);
  if(canonical.mediaType==='book')section('books','Book information',node=>{if(tools.books)node.append(tools.books());const bulk=text('a','Bulk book information and review');bulk.href='#books';bulk.dataset.goWorkspace='books';node.append(bulk);});
  if(tools.matching){
    const matching=tools.matching();matching.dataset.itemSection='matching';
    matching.addEventListener('toggle',()=>{if(!matching.isConnected)return;if(matching.open)state.sections.add('matching');else state.sections.delete('matching');});
    if(state.sections.has('matching'))matching.open=true;root.append(matching);
  }
  section('advanced','Advanced',node=>{
    node.append(text('p','Inspect source identifiers, technical provenance, alternate titles and recovery. Use Matching and editions above for product relationships; use Change access for ownership corrections.'));
    if(tools.advanced)node.append(tools.advanced());
  });
  if(tools.extras)root.append(tools.extras());
  state.initialized=true;return root;
}
