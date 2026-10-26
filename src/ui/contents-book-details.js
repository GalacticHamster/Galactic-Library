import {sourceHistory,sourceDifference,sourceName} from '../lib/source-history.js';
import {presentAction} from './form-presentation.js';
import {accessLabel,formatDate} from './formatters.js';
import {accountLabel} from './item-presentation.js';
import {createEnrichmentEvidence} from './enrichment-evidence.js';
import {collectionContents,libraryContentCoverage} from '../lib/inferred-coverage.js';
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const button=(label,run)=>{const node=text('button',label);node.type='button';node.addEventListener('click',run);return presentAction(node);};
export function collectionComparison(record,database) {
  const contents=collectionContents(record,database);if(!contents.entries.length)return null;
  const requested=contents.entries.map(entry=>({...entry,language:entry.language||record.metadata?.language||''}));
  return libraryContentCoverage(database,requested,{excludeItemIds:[record.id],mediaType:record.mediaType,parent:record});
}
export function createCollectionComparison(record,database) {
  const root=text('details','');root.className='contents-collection-comparison';root.append(text('summary','Overlap with other owned collections'));
  let built=false;root.addEventListener('toggle',()=>{if(!root.open||built)return;built=true;
    root.append(text('p','Compare extracted or reviewed contents with other effectively owned collections. Inferred coverage is unverified; incomplete issue identities are only possible overlap. Included material is not a separate purchase.'));
    const result=collectionComparison(record,database);
    if(!result){root.append(text('p','No usable contents are available for this collection. A saved rejection excludes its suggestions until you undo it.'));return;}
    root.append(text('p',`${result.owned} of ${result.total} entries also appear in other owned collections (${result.verified} reviewed, ${result.inferred} inferred, ${result.direct} standalone). ${result.missing.length} have no sufficiently identified match in those collections; ${result.possibleCovered.length} of these may overlap but need more detail.`));
    if(result.scopeUncertain)root.append(text('p','Series context or a related match needs checking before a complete comparison can be made.'));
    const sources=[...new Set(result.covered.flatMap(entry=>entry.evidence.map(({item})=>`${item.title} — ${accountLabel(item,database)}`)))];
    if(sources.length)root.append(text('p','Covered through: '+sources.join('; ')));
    const possibleSources=[...new Set(result.possibleCovered.flatMap(entry=>entry.evidence.map(({item})=>`${item.title} — ${accountLabel(item,database)}`)))];
    if(possibleSources.length)root.append(text('p','Possible overlap through (identity needs more detail): '+possibleSources.join('; ')));
    if(result.missing.length)root.append(text('p','No sufficiently identified match in other collections: '+result.missing.map(entry=>`${entry.series} ${entry.unitType} ${entry.number}`).join('; ')));
    root.append(text('p','No sufficiently identified match does not prove the material is absent from your accounts. Comic issue grids are in Library → Comic Coverage. Explicit target ranges and manga volumes are in Books & Contents → Compare collections.'));
  });return root;
}
export function createContentsBookDetails(record,database,actions) {
  const root=text('details','');root.className='contents-book-information';root.append(text('summary','Book information and enrichment'));
  root.append(text('p','Provider metadata describes the imported item. External book lookups describe a work or edition. Contents describe included material. Your corrections are human-reviewed evidence. None of these lookups confirms a purchase.'));
  const metadata=record.metadata??{},enrichment=metadata.enrichment??{};
  root.append(text('h4','Provider-supplied metadata'),text('p',[record.title,metadata.authors?.join(', '),metadata.publisher,metadata.language].filter(Boolean).join(' · ')));
  root.append(text('h4','External bibliographic information'));
  const sources=[];
  if(enrichment.googleBooks?.volumeId)sources.push('Google Books edition details');
  if(enrichment.openLibrary?.workKey)sources.push('Open Library work information (across editions)');
  if(enrichment.localMetadata)sources.push(`File or publisher metadata (${enrichment.localMetadata.approved?'human approved':'not approved'})`);
  root.append(text('p',sources.length?sources.join(' · '):'No external book details saved yet. You can look up work or edition details in Book information; missing metadata does not prevent manual contents review.'));
  const pending=Object.values(database.enrichmentReviews??{}).filter(review=>review.recordRefs?.includes(record.recordRef));
  if(pending.length)root.append(text('p',`${pending.length} book lookup results await review, including any failed or empty lookups. Review them in Book information.`));
  root.append(button('Open book information',()=>actions.enrich(record.recordRef)));
  root.append(text('h4','Ownership and access'),text('p',`Imported access: ${accessLabel(record.ownership)}. Contents confirmation does not create a separate entitlement to each included work. Existing ownership preferences and review rules still apply to comparisons.`));
  let built=false;
  root.addEventListener('toggle',()=>{if(!root.open||built)return;built=true;root.append(createEnrichmentEvidence([record],database,actions.undo));});
  return root;
}
export function createContentsHistory(record,database) {
  const root=text('details','');root.className='contents-history';root.append(text('summary','Source history'));
  let built=false;
  root.addEventListener('toggle',()=>{
    if(!root.open||built)return;built=true;
    root.append(text('p','Source observations and undo history are retained separately from your human contents review. Viewing them does not select a source, reparse text or restart acquisition. Kindle retry, pause and resume belong on its signed-in page.'));
    const observation=database.kindleContentsObservations?.[record.recordRef];
    const current=record.metadata?.enrichment?.kindleProductComicContents;
    const renderSource=(label,source)=>{if(!source)return;const section=text('details',''),selectedAt=source.appliedAt??database.enrichmentHistory?.[source.selectionRef]?.changedAt;section.append(text('summary',label),text('p',`Captured: ${formatDate(source.checkedAt??source.retrievedAt)}. ${selectedAt?'Selected: '+formatDate(selectedAt)+'. ':''}${source.availability==='unavailable'?'The product page was unavailable.':source.availability==='temporary-failure'?'Description retrieval failed and may be retried.':source.statement?'Captured description retained; viewing does not change your review.':'No contents statement was captured.'}`),text('blockquote',source.statement||'No contents statement captured.'));
      const technical=text('details','');technical.className='contents-technical-details';technical.append(text('summary','Technical details'));let shown=false;technical.addEventListener('toggle',()=>{if(!technical.open||shown)return;shown=true;technical.append(text('pre',JSON.stringify(source,null,2)));});section.append(technical);
      root.append(section);
    };
    renderSource('Current selected source',current);renderSource('Pinned earlier source (retained for comparison)',observation?.baseline);renderSource('Latest failed or unavailable attempt',observation?.latestAttempt);
    const history=sourceHistory(database,record.recordRef);
    if(observation?.baseline)root.append(text('p',sourceDifference(observation.baseline,current)));
    const successors=new Map();for(const entry of history){if(entry.previous?.selectionRef)successors.set(entry.previous.selectionRef,entry.previous);}if(current?.selectionRef)successors.set(current.selectionRef,current);
    const list=text('div',''),counter=text('p','');let page=0;
    const render=()=>{counter.textContent=`${history.length} retained source selections · page ${page+1} of ${Math.max(1,Math.ceil(history.length/20))}`;list.replaceChildren();for(const entry of history.slice(page*20,(page+1)*20)){const item=text('details','');item.append(text('summary',`${sourceName(entry.kind)} - Source choice changed: ${formatDate(entry.changedAt)}`),text('p','Previous source retained for undo. Viewing makes no changes. In Book information / Sources and undo, undoing a current selection restores its predecessor; later source choices cannot be undone from a stale entry. Your reviewed contents and ownership are retained.'));const canUndo=record.metadata?.enrichment?.[entry.kind]?.selectionRef===entry.selectionRef;item.append(text('p',canUndo?(entry.previous?'This current choice can be undone to restore the previous source.':'This initial choice can be undone to remove its enrichment; the library item is kept.'):'Historical choice: it is no longer current and cannot be undone directly.'));item.append(text('p',sourceDifference(entry.previous,successors.get(entry.selectionRef))));if(entry.previous)item.append(text('p',`Previous source captured: ${formatDate(entry.previous.checkedAt??entry.previous.retrievedAt)}`),text('blockquote',entry.previous.statement||'No contents statement recorded for this source.'));const technical=text('details','');technical.append(text('summary','Technical details'));technical.addEventListener('toggle',()=>{if(technical.open&&!technical.querySelector('pre'))technical.append(text('pre',JSON.stringify(entry,null,2)));});item.append(technical);list.append(item);}};
    root.append(counter,button('Previous history page',()=>{page=Math.max(0,page-1);render();}),button('Next history page',()=>{page=Math.min(Math.max(0,Math.ceil(history.length/20)-1),page+1);render();}),list);render();
    const recordDetails=text('details','');recordDetails.append(text('summary','Technical details'),text('p',`Record: ${record.recordRef}`));root.append(recordDetails);
  });return root;
}
