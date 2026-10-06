import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectManifest,manifestReviewProposal,validateManifest,MANIFEST_INTERPRETATION_VERSION} from '../src/lib/kindle-manifest.js';
import {contentKey} from '../src/lib/contents.js';
const {cases}=JSON.parse(await readFile(new URL('./fixtures/kindle/manifest-bounded-regressions.json',import.meta.url),'utf8'));
const select=(text,title='Example Collection')=>selectManifest([{selector:'#bookDescription_feature_div',text}],title);
const parse=s=>manifestReviewProposal(s,s.manifest.title);
const keys=entries=>entries.map(e=>contentKey(e)).sort();
const expected=c=>c.expected.flatMap(({numbers,...entry})=>numbers.map(number=>({...entry,number,language:''})));

export const boundedManifestTests=[
 ...cases.map(c=>['bounded manifest '+c.kind+': '+c.name,()=>{
   const saved=select(c.text,c.name),p=parse(saved);
   if(c.kind==='prefix'){
     assert.deepEqual(p.entries.map(e=>e.number),c.numbers);
     assert.ok(p.entries.every(e=>e.unitType==='issue'&&e.completeness==='full'));
     assert.ok(saved.manifest.candidates[saved.manifest.selected].parserInput.startsWith('Collects '));
     if(c.text.includes('The First Time'))assert.ok(p.unparsed.join(' ').includes('The First Time'),'Named supplement lost during prefix normalization');
   }else{
     assert.deepEqual(keys(p.entries),keys(expected(c)));
     if(c.kind==='whole'){
       assert.equal(p.manifestCoverage,'whole-clause');
       for(const unresolved of c.unresolved)assert.ok(p.unparsed.includes(unresolved),unresolved);
       // Exact historical child coordinates, not a newly ranked source choice.
       const legacy={statement:c.legacySelection.raw,manifest:{title:c.name,interpretationVersion:1,blocks:saved.manifest.blocks,candidates:[{block:0,...c.legacySelection}],selected:0}};
       const restored=validateManifest(legacy.manifest);
       assert.equal(restored.candidates[restored.selected].raw,legacy.statement);
       assert.deepEqual(keys(manifestReviewProposal(legacy,c.name).entries),keys(expected(c)));
       assert.equal(restored.interpretationVersion,MANIFEST_INTERPRETATION_VERSION);
     }else{
       assert.ok(!p.entries.some(e=>e.unitType==='volume'));
       assert.ok(p.unparsed.some(t=>t.includes(c.name+' includes')));
       assert.ok(p.unparsed.some(t=>t.includes('#439-435')),'Malformed range must remain unresolved');
     }
   }
   assert.deepEqual(validateManifest(saved.manifest),saved.manifest);
 }]),
 ['bounded controls: ordinary ranges, semicolons and mixed named material',()=>{
   assert.equal(parse(select('Collects Alpha #1-3.')).entries.length,3);
   const semi=parse(select('Collects Alpha #1-3; Beta #4, 6; An Unnumbered Supplement.'));
   assert.equal(semi.entries.length,5);assert.equal(semi.outcome,'partial');assert.ok(semi.unparsed.includes('An Unnumbered Supplement'));
   const mixed=parse(select('Collects Alpha #1-3; material from Beta #4-5; Gamma #6-7.'));
   assert.equal(mixed.outcome,'partial');assert.ok(mixed.entries.filter(e=>e.series==='Beta').every(e=>e.completeness==='excerpt'));
   assert.ok(!mixed.entries.some(e=>e.series==='Gamma'),'Unknown scope must not become full');
 }],
 ['bounded controls: independent verbs, sentences, blocks and narrative are not unioned',()=>{
   for(const text of ['Collects Alpha #1-3. Includes Beta #4-8.','Collects Alpha #1-3; Contains Beta #4-8.']){
     const s=select(text),p=parse(s);assert.equal(p.entries.length,5);assert.ok(p.entries.every(e=>e.series==='Beta'));
     assert.ok(s.manifest.candidates.every(c=>!c.whole));
   }
   const separate=selectManifest([{selector:'#first',text:'Collects Alpha #1-3.'},{selector:'#second',text:'Beta #4-8.'}]);
   assert.ok(parse(separate).entries.every(e=>e.series==='Beta'));
   for(const text of ['Collects Alpha #1-3; The author is Jane Doe; Beta #4-8.','Collects Alpha #1-3; Beta #4-8 explores distant galaxies.','Collects Alpha #1-3; This features Beta #4-8.'])assert.ok(select(text).manifest.candidates.every(c=>!c.whole),text);
 }],
 ['subject predicate guard is source-backed, retains independent claims and legitimate contained volumes',()=>{
   const text='Collects Alpha #1, Example Vol. 2 includes more than 500 pages. Contains Other #7-12.';
   const s=select(text,'Example Vol. 2');
   const first=s.manifest.candidates.find(c=>c.raw.startsWith('Collects Alpha'));
   assert.ok(first.parserInput.endsWith('Example Vol. 2 includes'));
   assert.ok(parse(s).entries.every(e=>e.series==='Other'));
   const legitimate=parse(select('Collects Alpha #1, Example Vol. 2.','Example Vol. 2'));
   assert.ok(legitimate.entries.some(e=>e.unitType==='volume'&&e.number==='2'));
   const other=parse(select('Collects Alpha #1, Other Vol. 2 includes more than 500 pages.','Example Vol. 2'));
   assert.ok(other.entries.some(e=>e.unitType==='volume'&&e.series==='Other'));
 }],
 ['prefix binding preserves explicit product run and supplementary story evidence',()=>{
   const run=parse(select('Task Force Z. Collecting issues #7-12, the epic conclusion of the critically acclaimed series.','Task Force Z (2021-) Vol. 2'));
   assert.ok(run.entries.every(e=>e.run==='2021-'));assert.equal(run.entries.length,6);
   const story=parse(select('Collecting issues #6-12 of the acclaimed series, plus a story from HOUSE OF MYSTERY ANNUAL #2.','iZombie Vol. 2'));
   assert.equal(story.entries.filter(e=>e.series==='iZombie').length,7);
   assert.ok(story.entries.some(e=>e.series==='HOUSE OF MYSTERY'&&e.unitType==='annual'&&e.number==='2'&&e.completeness==='excerpt'));
 }]
];
