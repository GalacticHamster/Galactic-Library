import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {proposeContentsForReview as parse} from '../src/lib/contents.js';
import {verifyNumberedWrapper,verifyIndependentWrappers} from './numbered-wrappers-fixture.js';
import {precisionRecord} from './contents-precision-context-fixture.js';
import {contentsParseState,kindleContentsPlan} from '../src/lib/kindle-contents.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle/numbered-wrappers.json',import.meta.url),'utf8'));
export const numberedWrapperTests=[
 ...[...fixtures.cases,...fixtures.controls].map(c=>['bounded numbered wrapper: '+c.title,()=>verifyNumberedWrapper(c,assert.ok)]),
 ['wrapper precision rejects plot/credits, uncertain context and malformed ranges',()=>{
   for(const text of [
     'Collects scripts from Alpha #1-3','Collects recommendations for stories from Alpha #1-3',
     'Collects a description of the adventures of a hero from Alpha #1-3',
     'Collects the tale says he will escape from Alpha #1-3',
     'A hero travels from Alpha #1-3','Jane Doe writes Alpha #1-3',
     'Collects an adventure where the hero meets Alpha #1-3',
     'Collects the complete story from Alpha #4-2','Collects the adventures of a hero from Alpha #1-501',
     'Collects the adventures of a hero from Alpha #1/2-3',
     'Collects a storyline in issues #1-3','Collects a creator\'s run from issues #1-3'
   ])assert.equal(parse(text,'Collection Vol. 9').entries.length,0,text);
   assert.ok(!parse('Collects Jane Doe\'s Alpha #1-3','Unrelated by Jane Doe').entries.some(e=>e.series==='Alpha'));
   // A possessive name without an explicit matching by-credit is not removed.
   const literal=parse('Collects Jane Doe\'s Alpha #1-3','Collection');
   assert.ok(!literal.entries.some(e=>e.series==='Alpha'));
 }],
 ['wrapper precision retains runs, zero, fractions, types, excerpts and digital evidence',()=>{
   const p=parse('Collects the early adventures of a hero from Alpha (2001-2003) #0, 1/2, Alpha Annual #2, the Alpha Anniversary Special #1, the short story "Origin" from Beta (1990) #7, Alpha digital chapters #1-5');
   assert.deepEqual(p.entries.map(e=>[e.series,e.unitType,e.number]),[['Alpha','issue','0'],['Alpha','issue','1/2'],['Alpha','annual','2'],['Alpha Anniversary','special','1'],['Beta','issue','7']]);
   assert.equal(p.entries[0].run,'2001-2003');assert.equal(p.entries[1].run,'2001-2003');assert.equal(p.entries.at(-1).run,'1990');assert.equal(p.entries.at(-1).completeness,'excerpt');
   assert.ok(p.unparsed.some(t=>t.includes('digital chapters')));
   assert.ok(p.unparsed.some(t=>t.includes('"Origin"')));
   const mixed=parse('Collects Alpha #1-3 as well as the unnumbered Special, together with Beta #0; material from Gamma #1-2.');
   assert.equal(mixed.entries.length,6);assert.ok(mixed.unparsed.some(t=>t.includes('unnumbered Special')));
   assert.ok(mixed.entries.filter(e=>e.series==='Gamma').every(e=>e.completeness==='excerpt'));
   assert.ok(!mixed.entries.some(e=>e.unitType==='special'),'Named special must not invent #1');
 }],
 ['wrappers retain independent collection claims',()=>verifyIndependentWrappers(assert.ok)]
];
numberedWrapperTests.push(['parser upgrade queues local reinterpretation even when Partial and input stay unchanged',()=>{
 const record=precisionRecord(fixtures.cases.find(c=>c.title.startsWith('Batman: The Golden Age Vol. 1')));
 record.metadata.detailUrl='https://www.amazon.com/dp/B000000001';
 const state=contentsParseState(record),source=record.metadata.enrichment.kindleProductComicContents;
 Object.assign(source,{parserVersion:5,filterVersion:1,extractorVersion:5,parseOutcome:state.parseOutcome,parseInput:state.parseInput,availability:'statement-found'});
 const review={statement:'Human checked statement',entries:[{series:'Verified',run:'2000',unitType:'issue',number:'1',language:'en',completeness:'full'}]};
 const db={providerItems:{fixture:record},contentReviews:{fixture:review}},before=JSON.stringify(db);
 const plan=kindleContentsPlan(db,'scan');assert.equal(plan.candidates.length,0);assert.equal(plan.reprocess.length,1);assert.equal(JSON.stringify(db),before);
}]);
