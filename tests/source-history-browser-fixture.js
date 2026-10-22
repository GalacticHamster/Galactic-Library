import {createContentsHistory} from '../src/ui/contents-book-details.js';
import {formatDate} from '../src/ui/formatters.js';
const checks=[];const assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
try{
 const record={recordRef:'private-record',metadata:{enrichment:{kindleProductComicContents:{source:'amazon-product-page',sourceUrl:'https://www.amazon.com/dp/B000000001',statement:'Collects Example #1-6!',checkedAt:'2026-10-09T00:00:00Z'}}}};
 const baseline={...record.metadata.enrichment.kindleProductComicContents,statement:'Collects Example #1-6',checkedAt:'2026-10-04T00:00:00Z'};
 record.metadata.enrichment.kindleProductComicContents.selectionRef='id44';
 const db={enrichmentHistory:{},kindleContentsObservations:{[record.recordRef]:{baseline}}};
 for(let n=0;n<45;n++)db.enrichmentHistory['id'+n]={recordRef:record.recordRef,kind:n%2?'googleBooks':'kindleProductComicContents',selectionRef:'id'+n,changedAt:new Date(Date.UTC(2026,9,1,0,n)).toISOString(),previous:baseline};
 const before=JSON.stringify(db),root=createContentsHistory(record,db);document.body.append(root);
 assert(!root.open&&root.querySelector('summary').textContent==='Source history'&&!root.querySelector('pre'),'Source history starts collapsed and builds lazily');
 root.open=true;root.dispatchEvent(new Event('toggle'));
 assert(root.textContent.includes('Current selected source')&&root.textContent.includes('Pinned earlier source'),'Current and pinned evidence remain distinct');
 assert(root.querySelector(':scope > details > p').textContent.includes('Selected: '+formatDate(db.enrichmentHistory.id44.changedAt)),'Current capture time is separate from its source-choice event');
 assert(root.textContent.includes('Only final sentence punctuation'),'Cosmetic comparison is descriptive without merging evidence');
 const list=root.querySelector(':scope > div');assert(list.children.length===20,'History renders at most one page');
 assert(list.children[0].querySelector('summary').textContent.endsWith(formatDate(db.enrichmentHistory.id44.changedAt)),'Selection events sorted before pagination');
 assert(list.children[0].textContent.includes('can be undone')&&list.children[1].textContent.includes('cannot be undone directly'),'Current undo availability is distinguished from historical evidence');
 assert(!root.querySelector('pre')&&!root.lastElementChild.open&&root.lastElementChild.textContent.includes('private-record'),'Raw JSON remains lazy and record ID stays in collapsed technical details');
 const buttons=[...root.querySelectorAll('button')];buttons.find(x=>x.textContent==='Next history page').click();assert(list.children.length===20&&list.children[0].textContent.includes('Previous source captured'),'Next page preserves source evidence and capture labels');
 buttons.find(x=>x.textContent==='Next history page').click();assert(list.children.length===5,'Final page remains accessible');
 const technical=list.children[0].querySelector('details');technical.open=true;technical.dispatchEvent(new Event('toggle'));assert(Boolean(technical.querySelector('pre')),'Original historical record remains inspectable');
 buttons.find(x=>x.textContent==='Previous history page').click();assert(list.children.length===20,'Backward pagination works');
 assert(JSON.stringify(db)===before,'Browsing history never rewrites stored evidence');
 await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
