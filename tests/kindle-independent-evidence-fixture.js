import {selectManifest,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {independentContentsClaims} from '../src/lib/kindle-evidence-review.js';
import {createContentsEditor} from '../src/ui/contents-editor.js';
import {openContentsEditor,deferContentsEditorToggle} from './contents-editor-ready.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
const equal=(a,b,message)=>assert(JSON.stringify(a)===JSON.stringify(b),message);
const select=(text,title='Example collection')=>selectManifest([{selector:'#fixture',text}],title);
export async function checkIndependentEvidence(fixtures,{ui=false,deferToggle=false}={}){
 const checks=[];
 for(const r of fixtures.rows){
  const saved=selectManifest(r.blocks,r.title),before=JSON.stringify(saved),p=manifestReviewProposal(saved,r.title),evidence=independentContentsClaims(saved,r.title);
  const expected=['pilot-4-43','pilot-4-44','pilot-4-45'].includes(r.id)?['partial',11,1]:r.id==='sample-5-1230'?['partial',11,2]:r.expected;
  equal([p.outcome,p.entries.length,p.unparsed.length],expected,'Captured primary changed: '+r.title);
  assert(JSON.stringify(saved)===before,'Review derivation mutated source: '+r.title);
  for(const c of evidence.claims){
   const candidate=saved.manifest.candidates[c.index];
   assert(c.raw===candidate.raw&&c.block===candidate.block&&c.start===candidate.start&&c.end===candidate.end,'Claim provenance lost');
   assert(!candidate.manifestRange||candidate.whole,'Child became independent');
  }
  if(r.id==='sample-5-370'){assert(evidence.claims.length===1&&evidence.claims[0].raw.includes('Alpha, Beta, Gamma, and Delta')&&evidence.claims[0].proposal.outcome==='uncertain','Code Breakers uncertainty lost');}
  if(r.id==='sample-5-629'){assert(evidence.claims.length===1&&evidence.claims[0].raw.startsWith('reprinting Seed of Destruction')&&!evidence.claims[0].proposal.entries.length,'Hellboy source/parser limits lost');}
  if(r.id.startsWith('pilot-4-4'))assert(evidence.claims.some(c=>c.raw.includes('classic tales')&&!c.proposal.entries.length),'JLA named claim lost or forced');
  if(r.title.startsWith('Sherlock'))assert(!evidence.claims.length,'Sherlock structural list became independent evidence');
  if(r.title.startsWith('King In Black'))assert(!evidence.claims.length&&saved.manifest.secondary.length===18,'King children became independent claims');
 }
 assert(!independentContentsClaims(fixtures.legacyKing,fixtures.legacyKing.manifest.title).claims.length,'Legacy selected child exposed parent as independent');
 checks.push('captured Code Breakers, Hellboy, JLA and controls retain exact primary and independent provenance; King children and Sherlock stay distinct');
 const simple=select('Collects Alpha #1-4. Also includes an excerpt from Beta.'),s=independentContentsClaims(simple,'Example collection');
 equal(manifestReviewProposal(simple,'Example collection').entries.map(e=>e.series),['Alpha','Alpha','Alpha','Alpha'],'Independent evidence automatically combined');
 assert(s.claims.length===1&&s.claims[0].raw==='includes an excerpt from Beta.'&&s.claims[0].qualifiers.includes('excerpt from')&&!s.claims[0].proposal.entries.length,'Unsupported excerpt must remain literal review evidence');
 const supported=select("Collects Alpha #1-4. Also includes an excerpt from A Writer’s next romance novel, Beta."),other=independentContentsClaims(supported,'Example collection').claims[0];
 assert(other.proposal.entries.length===1&&other.proposal.entries[0].number==='Beta'&&other.proposal.entries[0].completeness==='excerpt','Individually supported excerpt lost its scope');
 const unrelated=select('Collects Alpha #1-4. Includes writers Jane Doe and John Smith. Includes Bravo #1-2.'),un=independentContentsClaims(unrelated,'Example collection');
 assert(un.claims.length===1&&un.claims[0].raw==='Includes Bravo #1-2.','Filtered contributors surfaced as useful claims');
 assert(manifestReviewProposal(unrelated,'Example collection').entries.length===4,'Separate numbered claim was aggregated');
 equal(independentContentsClaims(supported,'Example collection'),independentContentsClaims(supported,'Example collection'),'Review derivation is not deterministic');
 const forged=structuredClone(supported);forged.manifest.candidates[1].parserInput='Collects Invented #1-400';
 equal(independentContentsClaims(forged,'Example collection'),independentContentsClaims(supported,'Example collection'),'Forged claim input accepted');
 checks.push('separate claims retain excerpt/prose boundaries, deterministic source provenance and validation without aggregation');
 if(ui){
  const restore=deferToggle?deferContentsEditorToggle():()=>{};
  try {
  for(const r of fixtures.rows.filter(r=>['sample-5-370','sample-5-629','pilot-4-42'].includes(r.id))){
   const saved=selectManifest(r.blocks,r.title),record={id:r.id,title:r.title,metadata:{detailUrl:r.url,enrichment:{kindleProductComicContents:{...saved,sourceUrl:r.url}}}},review={statement:'Verified prior statement',entries:[{series:'Prior Verified',unitType:'issue',number:'1',completeness:'full'}]};
    let writes=0;const old=JSON.stringify(record),verified=JSON.stringify(review),editor=createContentsEditor(record,review,{save:async()=>{writes++;},refresh(){}});document.body.append(editor);await openContentsEditor(editor);
   const panel=editor.querySelector('.contents-independent-evidence');assert(panel&&!panel.open,'Independent evidence panel absent or forced open');
   assert(panel.querySelector('summary').textContent.includes('(1)')&&panel.textContent.includes('parsing one statement does not account for the others'),'Secondary visibility/completeness warning missing');
   assert(panel.textContent.includes('Saving a different claim replaces that review'),'Single-review replacement behavior concealed');
   assert(editor.querySelector('textarea').value===review.statement&&editor.querySelectorAll('tbody tr').length===1,'Saved verification was replaced on opening');
   panel.querySelector('button').click();const claim=independentContentsClaims(saved,r.title).claims[0];
   assert(editor.querySelector('textarea').value===claim.raw&&!editor.querySelectorAll('tbody tr').length,'Load reused prior verified rows or altered source');
   [...editor.querySelectorAll('button')].find(b=>b.textContent==='Parse statement for review').click();
   assert(!editor.querySelectorAll('tbody tr').length&&editor.textContent.includes(claim.proposal.unparsed[0]),'Unsupported names forced into proposal rows');
   assert(writes===0&&JSON.stringify(record)===old&&JSON.stringify(review)===verified,'Review UI mutated/saved verification or source');editor.remove();
  }
  checks.push('real review UI surfaces Code Breakers, Hellboy and JLA separately, loads exact claims and preserves saved verification');
  const title='Example collection',record={id:'synthetic',title,metadata:{enrichment:{kindleProductComicContents:supported}}},editor=createContentsEditor(record,null,{save:async()=>{throw Error('Unexpected save');},refresh(){}});document.body.append(editor);await openContentsEditor(editor);
  editor.querySelector('.contents-independent-evidence button').click();const parse=[...editor.querySelectorAll('button')].find(b=>b.textContent==='Parse statement for review');parse.click();
  assert(editor.querySelectorAll('tbody tr').length===1&&editor.querySelector('[data-contents-field="completeness"]').value==='excerpt','UI lost individual excerpt scope');
  editor.querySelector('textarea').value='Includes Gamma #1-2';parse.click();
  assert(editor.querySelectorAll('tbody tr').length===2&&[...editor.querySelectorAll('[data-contents-field="series"]')].every(i=>i.value==='Gamma'),'Edited claim reused captured excerpt/input');editor.remove();
  checks.push('actual UI parses only an explicitly loaded claim; edited text discards captured context and no entries are combined');
  }finally{restore();}
 }
 return checks;
}
