import {createContentsEditor} from '../src/ui/contents-editor.js';
import {createEnrichmentWorkbench} from '../src/ui/enrichment-workbench.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {batmanReviewBook,batmanReviewStatement} from './contents-review-usability-fixture.js';

export async function checkContentsReviewUsability(assert){
 const click=(root,label)=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent===label);assert(Boolean(b),label+' action remains available');b.click();return b;};
 const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Contents review did not finish saving');};
 let book=batmanReviewBook();const stored={};
 const snapshot=record=>JSON.stringify([record.metadata,record.ownership]);let source=snapshot(book);
 const area={get:async defaults=>structuredClone({...defaults,...stored}),set:async patch=>Object.assign(stored,structuredClone(patch)),remove:async()=>{}};
 let writer=createStorageWriter(area);await writer.restoreDatabase(coverageDatabase(book));book=(await writer.getDatabase()).providerItems[book.id];source=snapshot(book);let refreshed=false;
 const actions={save:(id,review)=>writer.saveContentReview(id,review),remove:id=>writer.removeContentReview(id),refresh:()=>{refreshed=true;}};
 let editor=createContentsEditor(book,null,actions,{expanded:true});document.body.append(editor);
 const shown=editor.querySelector('.contents-review-evidence');
 assert(shown.querySelector('blockquote').textContent===batmanReviewStatement&&!shown.closest('details:not([open])'),'Original first-six statement is visible without opening provenance');
 assert(shown.textContent.includes('Kindle / Amazon product description')&&!editor.querySelector('.contents-source-details').open,'Attribution is visible while detailed provenance stays optional');
 assert(editor.querySelector('[role="status"]').textContent.includes('collects 6 issues')&&!editor.textContent.includes('later contents may be missing'),'Zero-suggestion explanation describes uncertainty without speculative truncation');
 assert(!editor.querySelector('tbody tr')&&[...editor.querySelectorAll('button')].find(b=>b.textContent==='Save reviewed contents').disabled,'Zero suggestions cannot be accidentally saved as confirmed contents');
 assert(shown.querySelector('a').href==='https://www.amazon.com/dp/B000000001','Visible source link retains the captured Amazon attribution');
 const quick=editor.querySelector('.contents-quick-add'),input=quick.querySelector('textarea');
 assert(input.value==='Batman and Robin (2009-2011) #1-6'&&!quick.closest('details:not([open])'),'Safe relative interpretation is a visible optional draft, never automatic rows');
 click(quick,'Preview');assert(quick.textContent.includes('6 entries ready')&&!editor.querySelector('tbody tr'),'Preview does not apply suggested contents');
 click(quick,'Add entries');assert(editor.querySelectorAll('tbody tr').length===6,'Confirmed draft addition expands the six numbered issues');
 const draft=editor.querySelector('[aria-label="Contents statement draft"]');draft.value='Collects Batman and Robin (2009-2011) #1-6';
 assert(shown.querySelector('blockquote').textContent===batmanReviewStatement&&snapshot(book)===source,'Editable statement never replaces the visible captured original');
 click(editor,'Save reviewed contents');await wait(()=>refreshed);writer=createStorageWriter(area);let db=await writer.getDatabase();
 assert(db.contentReviews[book.id].entries.length===6&&snapshot(db.providerItems[book.id])===source,'Confirmed manual draft persists after writer reload with original evidence and ownership intact');
 editor.remove();editor=createContentsEditor(db.providerItems[book.id],db.contentReviews[book.id],actions,{expanded:true});document.body.append(editor);
 assert(editor.textContent.includes('6 reviewed entries saved')&&editor.querySelectorAll('tbody tr').length===6,'Reopened review presents the saved decision and editable rows');
 assert(editor.querySelector('.contents-add-more')&&!editor.querySelector('.contents-add-more').open,'Reviewed entries lead while extra bulk entry stays available under Add more contents');
 editor.querySelectorAll('[data-contents-field="number"]')[5].value='7';refreshed=false;click(editor,'Save reviewed contents');await wait(()=>refreshed);db=await createStorageWriter(area).getDatabase();assert(db.contentReviews[book.id].entries[5].number==='7'&&snapshot(db.providerItems[book.id])===source,'Row corrections persist on reload without rewriting source evidence');
 refreshed=false;click(editor,'Reject suggested contents');await wait(()=>refreshed);db=parseBackup(createBackup(await writer.getDatabase()));assert(db.contentReviews[book.id].status==='rejected','Explicit rejection survives backup round-trip');
 editor.remove();editor=createContentsEditor(db.providerItems[book.id],db.contentReviews[book.id],actions,{expanded:true});document.body.append(editor);
 assert(editor.textContent.includes('Contents rejected.')&&editor.querySelector('.contents-review-evidence blockquote').textContent===batmanReviewStatement,'Rejected review explains its exclusion without hiding source evidence');
 refreshed=false;click(editor,'Undo contents review');await wait(()=>refreshed);assert(!(await writer.getDatabase()).contentReviews[book.id],'Undo returns to source-derived contents without deleting evidence');
 editor.remove();
 const vague=coverageBook('vague',batmanReviewStatement,{title:'Unidentified anthology'}),noSource=coverageBook('empty',''),ready=coverageBook('ready');
 for(const record of [vague,noSource,ready]){
  editor=createContentsEditor(record,null,actions,{expanded:true});document.body.append(editor);
  if(record===vague)assert(!editor.querySelector('.contents-quick-add textarea').value&&editor.textContent.includes('does not establish one comic series'),'Ambiguous parent gets manual entry guidance without a guessed series');
  if(record===noSource)assert(editor.textContent.includes('There is nothing to confirm.')&&![...editor.querySelectorAll('button')].some(b=>b.textContent==='Accept all suggestions'),'No evidence is not presented as an available suggestion');
  if(record===ready)assert(editor.querySelector('tbody tr')&&editor.querySelector('.contents-add-more')&&!editor.querySelector('.contents-manual-controls').open&&[...editor.querySelector('.contents-manual-controls').querySelectorAll('button')].some(b=>b.textContent==='Accept all suggestions'),'Useful suggestions lead with rows; statement parsing remains optional');
  editor.remove();
 }
 const queue=createEnrichmentWorkbench({inspect(){}});document.body.append(queue.element);queue.update(coverageDatabase(book,ready));queue.showCategory('unparsed');
 const choice=queue.element.querySelector('[aria-label="Enrichment queue"]');
 choice.value='contents-information';choice.dispatchEvent(new Event('change'));
 assert(queue.element.querySelectorAll('.review-items > li').length===1&&queue.element.querySelector('.review-items').textContent.includes('collects 6 issues'),'Queue information filter agrees with the individual zero-suggestion explanation');
 choice.value='contents-suggestions';choice.dispatchEvent(new Event('change'));
 assert(queue.element.querySelectorAll('.review-items > li').length===1&&queue.element.querySelector('.review-items').textContent.includes('3 suggested entries'),'Useful proposals are separate from descriptions without an issue list');queue.element.remove();
}
