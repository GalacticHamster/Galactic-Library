import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkWholeManifest} from './kindle-whole-manifest-fixture.js';
import {capturedManifestEvidence,baselineManifest} from '../scripts/whole-manifest-evidence.mjs';
import {selectManifest,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/kindle/kindle-whole-manifest.json',import.meta.url),'utf8'));
export const kindleWholeManifestTests=[
 ['whole manifest source, scope, caps, restore, reparse and ownership safety',()=>checkWholeManifest(fixture)],
 ['all prior captured controls retain proposals and source boundaries except demonstrated whole manifest',async()=>{
  const {module:old}=await baselineManifest();
  const {observations}=await capturedManifestEvidence();
  const controls=observations.filter(r=>r.id.startsWith('pilot-4-')||r.sourceGeneration===5);
  for(const r of controls){const a=old.selectManifest(r.blocks,r.title),b=selectManifest(r.blocks,r.title),p=old.manifestReviewProposal(a,r.title),q=manifestReviewProposal(b,r.title);
   assert.deepEqual(b.manifest.blocks,a.manifest.blocks);
   if(r.title===fixture.title){assert.equal(q.entries.length,52);assert.equal(q.outcome,'partial');}
   else if(!p.entries.length&&/^collecting\s+issues?\b/iu.test(a.statement)){
     // The bounded prefix correction also benefits this existing control.
     // Compare with the prior interpreter on a literal prefix-only copy.
     const corrected=old.selectManifest(r.blocks.map(block=>({...block,text:block.text.replace(/\bcollecting\s+(?=issues?)/giu,'Collects ')})),r.title);
     const expected=old.manifestReviewProposal(corrected,r.title);
     const story=/[,;]\s*plus\s+(a\s+story\s+from[\s\S]+)$/iu.exec(a.statement);
     if(story){
       const extra=old.manifestReviewProposal(old.selectManifest([{selector:'#fixture',text:'Includes plus '+story[1]}],r.title),r.title);
       expected.entries.push(...extra.entries);expected.unparsed.push(...extra.unparsed);
       if(extra.unparsed.length)expected.outcome='partial';
     }
     assert.ok(expected.entries.length,r.title);assert.deepEqual(q.entries,expected.entries,r.title);assert.deepEqual(q.unparsed,expected.unparsed,r.title);assert.equal(q.outcome,expected.outcome,r.title);assert.equal(b.statement,a.statement,r.title);
   }
   else{assert.deepEqual(q.entries,p.entries,r.title);assert.deepEqual(q.unparsed,p.unparsed,r.title);assert.equal(q.outcome,p.outcome,r.title);assert.equal(b.statement,a.statement,r.title);}
  }
 }]
];
