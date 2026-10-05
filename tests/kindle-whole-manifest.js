import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkWholeManifest} from './kindle-whole-manifest-fixture.js';
import {wholeManifestEvidence,baselineManifest} from '../scripts/whole-manifest-evidence.mjs';
import {selectManifest,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/kindle-whole-manifest.json',import.meta.url),'utf8'));
export const kindleWholeManifestTests=[
 ['whole manifest source, scope, caps, restore, reparse and ownership safety',()=>checkWholeManifest(fixture)],
 ['all prior captured controls retain proposals and source boundaries except demonstrated whole manifest',async()=>{
  const {module:old}=await baselineManifest();
  const pilot=JSON.parse(await readFile(new URL('../docs/kindle-manifest-pilot-results.json',import.meta.url),'utf8'));
  const replay=JSON.parse(await readFile(new URL('../docs/kindle-source-capture-replay.json',import.meta.url),'utf8'));
  const controls=[...pilot.rows.map(r=>({title:r.title,blocks:r.manifest.blocks})),...replay.rows.map(r=>({title:r.title,blocks:r.generation5Blocks}))];
  for(const r of controls){const a=old.selectManifest(r.blocks,r.title),b=selectManifest(r.blocks,r.title),p=old.manifestReviewProposal(a,r.title),q=manifestReviewProposal(b,r.title);
   assert.deepEqual(b.manifest.blocks,a.manifest.blocks);
   if(r.title===fixture.title){assert.equal(q.entries.length,52);assert.equal(q.outcome,'partial');}
   else{assert.deepEqual(q.entries,p.entries,r.title);assert.deepEqual(q.unparsed,p.unparsed,r.title);assert.equal(q.outcome,p.outcome,r.title);assert.equal(b.statement,a.statement,r.title);}
  }
 }]
];
